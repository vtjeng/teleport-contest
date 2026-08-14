import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BEAR_TRAP,
    BLINDED,
    HALF_PHDAM,
    INVIS,
    M_ATTK_HIT,
    M_ATTK_MISS,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    NO_WEAPON_WANTED,
    PIT,
    PROTECTION,
    SHOCK_RES,
    SPIKED_PIT,
    TT_PIT,
    W_AMUL,
    W_ARM,
    W_ARMC,
    W_ARMU,
} from '../js/const.js';
import { midnight } from '../js/calendar.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    could_seduce,
    getmattk,
    hitmsg,
    magic_negation,
    mattacku,
    mswings_verb,
    mtrapped_in_pit,
} from '../js/mhitu.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    monst_globals_init,
    AD_PHYS,
    AT_BITE,
    AT_BOOM,
    AT_BUTT,
    AT_CLAW,
    AT_EXPL,
    AT_KICK,
    AT_NONE,
    AT_STNG,
    AT_TENT,
    AT_TUCH,
    M1_THICK_HIDE,
    NON_PM,
    PM_ALIGNED_CLERIC,
    PM_BARROW_WIGHT,
    PM_CLERIC,
    PM_GIANT_EEL,
    PM_GOBLIN,
    PM_GRID_BUG,
    PM_HUMAN,
    PM_JACKAL,
    PM_KI_RIN,
    PM_LICH,
    PM_LICHEN,
    PM_OWLBEAR,
    PM_PONY,
    PM_PESTILENCE,
    PM_SEWER_RAT,
    PM_SOLDIER_ANT,
    PM_VAMPIRE,
    PM_WATER_NYMPH,
    PM_WERERAT,
} from '../js/monsters.js';
import { mksobj } from '../js/obj.js';
import {
    AMULET_OF_GUARDING,
    BULLWHIP,
    CLOAK_OF_PROTECTION,
    DAGGER,
    ELVEN_MITHRIL_COAT,
    HALBERD,
    HAWAIIAN_SHIRT,
    LEATHER_ARMOR,
    LONG_SWORD,
    objects_globals_init,
} from '../js/objects.js';
import { UnsupportedSimpleMonsterActionError }
    from '../js/unported_monster_actions.js';

// mhitu.c magic_negation() reads the invent chain, the objects[] catalog,
// u.uprops[PROTECTION], u.ublessed, u.uspellprot and youmonst.data. Nothing
// else, so the hero can be built by hand rather than started. Both catalogs
// are the real ones: a stand-in mons[] would leave the aligned-cleric
// comparison reading undefined on both sides.
function heroState({
    worn = [],
    intrinsic = 0,
    extrinsic = 0,
    ublessed = 0,
    uspellprot = 0,
    mnum = PM_HUMAN,
} = {}) {
    const state = { u: { uprops: [], ublessed, uspellprot } };
    objects_globals_init(state);
    monst_globals_init(state);
    state.youmonst = { data: state.mons[mnum] };
    state.u.uprops[PROTECTION] = { intrinsic, extrinsic, blocked: 0 };
    state.invent = null;
    for (const [otyp, owornmask] of [...worn].reverse())
        state.invent = { otyp, owornmask, nobj: state.invent };
    return state;
}

test('magic_negation takes the highest a_can of the worn armor', () => {
    // objects.c a_can, read from js/objects.js: a Hawaiian shirt is 0, leather
    // armor is 1, an elven mithril coat is 2. The suit and the shirt are worn
    // together so the answer has to be the maximum rather than the last seen.
    const bare = heroState();
    assert.equal(magic_negation(bare.youmonst, bare), 0);
    let state = heroState({ worn: [[HAWAIIAN_SHIRT, W_ARMU]] });
    assert.equal(magic_negation(state.youmonst, state), 0);
    state = heroState({
        worn: [[ELVEN_MITHRIL_COAT, W_ARM], [HAWAIIAN_SHIRT, W_ARMU]],
    });
    assert.equal(magic_negation(state.youmonst, state), 2);
    state = heroState({
        worn: [[HAWAIIAN_SHIRT, W_ARMU], [LEATHER_ARMOR, W_ARM]],
    });
    assert.equal(magic_negation(state.youmonst, state), 1);
});

test('magic_negation ignores armor that is only carried', () => {
    // The a_can field applies to worn armor alone, which is why C tests
    // owornmask rather than the object class. An owornmask of 0 is what an
    // item in the pack carries.
    const state = heroState({ worn: [[ELVEN_MITHRIL_COAT, 0]] });
    assert.equal(magic_negation(state.youmonst, state), 0);
});

test('extrinsic Protection adds one, or two through a worn amulet', () => {
    // mhitu.c:1122-1126. The leather armor supplies mc 1 in both rows, so the
    // difference between them is the amulet alone.
    let state = heroState({
        worn: [[LEATHER_ARMOR, W_ARM]], extrinsic: W_ARMC,
    });
    assert.equal(magic_negation(state.youmonst, state), 2);
    state = heroState({
        worn: [[LEATHER_ARMOR, W_ARM], [AMULET_OF_GUARDING, W_AMUL]],
        extrinsic: W_ARMC,
    });
    assert.equal(magic_negation(state.youmonst, state), 3);
    // A worn amulet that is not the amulet of guarding leaves via_amul FALSE.
    state = heroState({
        worn: [[LEATHER_ARMOR, W_ARM], [AMULET_OF_GUARDING + 1, W_AMUL]],
        extrinsic: W_ARMC,
    });
    assert.equal(magic_negation(state.youmonst, state), 2);
});

test('magic_negation clamps the extrinsic bonus at three', () => {
    // A cloak of protection has a_can 3 and confers extrinsic Protection, so
    // C's `mc += 1` would reach 4 without the cap at mhitu.c:1125-1126.
    const state = heroState({
        worn: [[CLOAK_OF_PROTECTION, W_ARMC]], extrinsic: W_ARMC,
    });
    assert.equal(magic_negation(state.youmonst, state), 3);
});

test('intrinsic Protection lifts a bare hero to one, not above', () => {
    // mhitu.c:1127-1135. The arm needs mc below 1, so leather armor's 1 keeps
    // it out; and intrinsic Protection alone is not enough without u.ublessed.
    let state = heroState({ intrinsic: 1 });
    assert.equal(magic_negation(state.youmonst, state), 0);
    state = heroState({ intrinsic: 1, ublessed: 1 });
    assert.equal(magic_negation(state.youmonst, state), 1);
    // u.uspellprot reaches the same arm on its own.
    state = heroState({ uspellprot: 1 });
    assert.equal(magic_negation(state.youmonst, state), 1);
    // With mc already 1 the arm is skipped, so nothing doubles up.
    state = heroState({
        worn: [[LEATHER_ARMOR, W_ARM]], intrinsic: 1, ublessed: 1,
    });
    assert.equal(magic_negation(state.youmonst, state), 1);
});

test('an aligned cleric or a minion form lifts the hero to one', () => {
    // The second half of mhitu.c:1131-1133 reads mon->data, which for the hero
    // is the polymorph form. Both terms are separate from the u.uspellprot
    // test above, so each needs its own row, and PM_HUMAN answering 0 above is
    // what makes the form the reason rather than the state.
    const cleric = heroState({ mnum: PM_ALIGNED_CLERIC });
    assert.equal(magic_negation(cleric.youmonst, cleric), 1);

    // mondata.h is_minion() reads M2_MINION, which a ki-rin carries.
    const minion = heroState({ mnum: PM_KI_RIN });
    assert.equal(magic_negation(minion.youmonst, minion), 1);
});

test('magic_negation refuses a monster', () => {
    // uhitm.c:86 passes a monster; that half needs worn.c protects(), so the
    // port throws rather than answering a factor it did not compute.
    const state = heroState();
    assert.throws(
        () => magic_negation({ data: state.mons[PM_HUMAN] }, state),
        (error) => error instanceof TypeError
            && /covers only the hero/u.test(error.message),
    );
});

// ---- mhitu.c mattacku() and the helpers it reaches ----

// A live Valkyrie in the lit starting room, the same one
// scripts/mthrowu.test.mjs and scripts/monster-pit.test.mjs replay.
const MELEE_DATETIME = '20260214031500';
const MELEE_RC = [
    'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

// hitmu() doubles a blow's damage for an undead attacker during the midnight
// hour, which calendar.c midnight() defines as the local hour being 0, so one
// test starts the same hero then instead. Recorder patch 001 carries the
// recording-time daylight-saving bit into fixed-datetime parsing, so the local
// hour is not the one spelled here; the test asserts midnight() itself rather
// than trusting the string.

async function meleeHero(datetime = MELEE_DATETIME) {
    await runSegment({
        seed: 7710044,
        datetime,
        nethackrc: MELEE_RC,
        moves: '',
    });
    game.level.traps = [];
    // The generated level puts its own monsters on the map. Clearing them
    // leaves every neighbouring square free for the fixtures below and keeps
    // one test's attacker out of the next one's scan.
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    return game;
}

// An attacker on a neighbouring square that believes the hero is where the
// hero is, shaped the way makemon() leaves one for the fields mattacku()
// reads.
let nextAttackerId = 6000;
function meleeAttacker(state, pmidx, dx, dy, overrides = {}) {
    const monster = newMonster({
        data: state.mons[pmidx],
        m_id: ++nextAttackerId,
        mx: state.u.ux + dx,
        my: state.u.uy + dy,
        mux: state.u.ux,
        muy: state.u.uy,
        m_lev: state.mons[pmidx].mlevel,
        mcansee: true,
        mcanmove: true,
        cham: NON_PM,
        // place_monster() rejects a monster at zero hit points, and the
        // differential and the loop both read the attacker as alive.
        mhp: 10,
        mhpmax: 10,
    });
    Object.assign(monster, overrides);
    place_monster(monster, monster.mx, monster.my, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    return monster;
}

// The operations mattacku() needs, with every message captured rather than
// printed and every seam that stays unported bound to a throwing refusal.
//
// `rolls` feeds rnd() in order. rn2() answers 1 and d() answers its first
// argument unless `extra` supplies an `rn2` or `d` of its own, which is how a
// test picks the magic-cancellation roll or a damage larger than a grid bug's.
// `bounds` records every draw in order whichever source answered it.
function meleeEnv(state, rolls, extra = {}) {
    const lines = [];
    const bounds = [];
    const next = [...rolls];
    const { rn2: rn2Answer, d: dAnswer, ...envExtra } = extra;
    return {
        lines,
        bounds,
        env: {
            state,
            random: {
                d: (n, x) => {
                    bounds.push(`d(${n},${x})`);
                    return dAnswer ? dAnswer(n, x) : n;
                },
                rn2: (bound) => {
                    bounds.push(`rn2(${bound})`);
                    return rn2Answer ? rn2Answer(bound) : 1;
                },
                rnd: (bound) => {
                    bounds.push(`rnd(${bound})`);
                    return next.length ? next.shift() : 1;
                },
            },
            unsupported: (reason) => {
                throw new UnsupportedSimpleMonsterActionError(reason);
            },
            message: async (text) => { lines.push(text); },
            redraw: () => {},
            statusRefresh: async () => {},
            wieldMonsterItem: async () => 0,
            throwRangedWeapon: () => {},
            ...envExtra,
        },
    };
}

// uhitm.c mhitm_adtyping() dispatches a landed blow on its damage type, and
// this slice ports AD_ELEC alone. Every fixture monster below except the grid
// bug does AD_PHYS, so its landed blow stops here.
const PHYS_HIT_STOP = 'uhitm.c mhitm_ad_phys()';

test('mattacku prints the miss its to-hit test loses and stops on a hit',
    async () => {
    // mhitu.c:806-812. `tmp = AC_VALUE(u.uac) + 10 + m_lev`; this Valkyrie
    // wears AC 6 and a sewer rat is level 0, so tmp is 16 and rnd(20) decides.
    const state = await meleeHero();
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    const miss = meleeEnv(state, [17]);
    assert.equal(await mattacku(rat, miss.env), false);
    assert.deepEqual(miss.lines, ['The sewer rat misses!']);
    assert.deepEqual(miss.bounds, ['rnd(20)']);

    // mhitu.c:88-90, `nearmiss` is `tmp == j`, and with verbose on it adds
    // the word this branch exists for.
    const nearMiss = meleeEnv(state, [16]);
    await mattacku(rat, nearMiss.env);
    assert.deepEqual(nearMiss.lines, ['The sewer rat just misses!']);

    // The same roll with verbose off drops the word and nothing else.
    state.flags.verbose = false;
    const quiet = meleeEnv(state, [16]);
    await mattacku(rat, quiet.env);
    assert.deepEqual(quiet.lines, ['The sewer rat misses!']);
    state.flags.verbose = true;

    // One below tmp is C's `tmp > j`, the hit side, and hitmu() is the
    // fail-closed edge this slice stops at.
    const hit = meleeEnv(state, [15]);
    await assert.rejects(
        () => mattacku(rat, hit.env),
        (error) => error instanceof UnsupportedSimpleMonsterActionError
            && error.reason === PHYS_HIT_STOP,
    );
});

test('mattacku widens the to-hit die for each later attack', async () => {
    // mhitu.c:806, `rnd(20 + i)`. A soldier ant has AT_BITE at index 0 and
    // AT_STNG at index 1, so one turn draws both bounds in order. No
    // development session holds a two-attack monster on the first level.
    const state = await meleeHero();
    const ant = meleeAttacker(state, PM_SOLDIER_ANT, 1, 0);
    // Level three, so tmp is 6 + 10 + 3 = 19 and both rolls below miss it.
    const twice = meleeEnv(state, [20, 21]);
    assert.equal(await mattacku(ant, twice.env), false);
    assert.deepEqual(twice.bounds, ['rnd(20)', 'rnd(21)']);
    assert.deepEqual(twice.lines,
        ['The soldier ant misses!', 'The soldier ant misses!']);
    // 21 is only reachable on the second attack, so a roll of 20 that the
    // first attack could not lose to still loses on the second. The ant's
    // AT_STNG does AD_DRST, so the landed sting stops on its own damage type
    // rather than on the AD_PHYS one its bite would have used.
    const widened = meleeEnv(state, [20, 18]);
    await assert.rejects(
        () => mattacku(ant, widened.env),
        (error) => error.reason === 'uhitm.c mhitm_ad_drst()',
    );
});

test('mattacku spends a draw on a negative armor class before the roll',
    async () => {
    // hack.h:1538 AC_VALUE(AC) is `((AC) >= 0 ? (AC) : -rnd(-(AC)))`. No
    // development session reaches it: seed0004's hero stands at AC 3.
    const state = await meleeHero();
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    state.u.uac = -5;
    // rnd(5) answers 1 here, so tmp is -1 + 10 + 0 = 9, and 10 misses.
    const negative = meleeEnv(state, [1, 10]);
    assert.equal(await mattacku(rat, negative.env), false);
    assert.deepEqual(negative.bounds, ['rnd(5)', 'rnd(20)']);
    assert.deepEqual(negative.lines, ['The sewer rat misses!']);

    // mhitu.c:717, the floor. A high enough roll on a deeply negative armor
    // class drives tmp below zero, and C clamps it to one rather than letting
    // the attacker be worse than helpless.
    state.u.uac = -12;
    const clamped = meleeEnv(state, [12, 1]);
    assert.equal(await mattacku(rat, clamped.env), false);
    assert.deepEqual(clamped.bounds, ['rnd(12)', 'rnd(20)']);
    // Without the clamp tmp would be -2 and this roll would be an ordinary
    // miss; clamped to 1 it equals the roll and prints the near-miss line.
    assert.deepEqual(clamped.lines, ['The sewer rat just misses!']);
    state.u.uac = 6;
});

test('mattacku adjusts the differential for the states C names', async () => {
    const state = await meleeHero();
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);

    // mhitu.c:713, a blinded attacker is two easier to dodge. tmp drops from
    // 16 to 14, so a roll of 15 turns from a hit into a miss.
    rat.mcansee = false;
    const blinded = meleeEnv(state, [15]);
    assert.equal(await mattacku(rat, blinded.env), false);
    assert.deepEqual(blinded.lines, ['The sewer rat misses!']);
    rat.mcansee = true;

    // mhitu.c:715, a trapped attacker loses the same two.
    rat.mtrapped = true;
    const trapped = meleeEnv(state, [15]);
    assert.equal(await mattacku(rat, trapped.env), false);
    assert.deepEqual(trapped.lines, ['The sewer rat misses!']);
    rat.mtrapped = false;

    // mhitu.c:711, a helpless hero is four easier to hit, which turns the
    // same roll back into a hit. nomul()'s guard keeps gm.multi where it is.
    state.multi = -3;
    const helpless = meleeEnv(state, [17]);
    await assert.rejects(
        () => mattacku(rat, helpless.env),
        (error) => error.reason === PHYS_HIT_STOP,
    );
    state.multi = 0;
});

test('an adjacent attacker still balks at an invulnerable hero', async () => {
    // The case the sibling test's comment once said could not happen. Prayer
    // is the only thing that sets u.uinvulnerable, and it leaves gm.multi
    // negative; hack.c:4161 nomul() returns at `gm.multi < nval` before the
    // line that clears the flag, so mattacku()'s preamble calling nomul(0)
    // clears nothing and an adjacent attacker reaches mhitu.c:743 exactly as
    // a distant one does.
    const state = await meleeHero();
    const adjacent = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    state.u.uinvulnerable = true;
    state.multi = -3;
    await assert.rejects(
        () => mattacku(adjacent, meleeEnv(state, [17]).env),
        (error) => error.reason === 'a monster balking at an invulnerable hero',
    );
    // The flag survives, which is what distinguishes this from the preamble
    // having cleared it and the refusal firing for another reason.
    assert.equal(state.u.uinvulnerable, true);
    assert.equal(state.multi, -3);
});

test('mattacku refuses each arm the slice leaves unported', async () => {
    const state = await meleeHero();
    // mhitu.c:743-755, the invulnerable hero. A monster four or more squares
    // away reaches it because mattacku()'s preamble never calls nomul() for
    // it. A closer attacker reaches it too whenever gm.multi is negative,
    // which is the only state that sets u.uinvulnerable in the first place:
    // hack.c:4161 nomul() returns at `gm.multi < nval` before the line that
    // clears the flag, and prayer leaves gm.multi negative throughout. The
    // adjacent case below is the one that matters, and an earlier version of
    // this comment claimed it could not happen.
    const distant = meleeAttacker(state, PM_SEWER_RAT, 4, 0);
    state.u.uinvulnerable = true;
    await assert.rejects(
        () => mattacku(distant, meleeEnv(state, [17]).env),
        (error) => error.reason === 'a monster balking at an invulnerable hero',
    );

    state.u.uinvulnerable = false;

    // mhitu.c:817-820, wildmiss(). The attacker guessed a square the hero is
    // not on, so `foundyou` is false.
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    rat.mux = state.u.ux + 2;
    rat.muy = state.u.uy;
    await assert.rejects(
        () => mattacku(rat, meleeEnv(state, [17]).env),
        (error) => error.reason === 'a monster attacking where the hero is not',
    );
    rat.mux = state.u.ux;

    // mhitu.c:729-741, summonmu(). A were-creature next to the hero summons
    // before it strikes.
    const were = meleeAttacker(state, PM_WERERAT, 0, 1);
    await assert.rejects(
        () => mattacku(were, meleeEnv(state, [17]).env),
        (error) => error.reason
            === 'a monster summoning help against the hero',
    );

    // mhitu.c:826-830, AT_HUGS. An owlbear next to the hero reaches the arm
    // through u.ustuck even when its earlier attacks all missed.
    // Levelled down to zero so that its two AT_CLAW attacks miss on a roll
    // of twenty and the loop reaches index two.
    const owlbear = meleeAttacker(state, PM_OWLBEAR, -1, 0, { m_lev: 0 });
    state.u.ustuck = owlbear;
    await assert.rejects(
        () => mattacku(owlbear, meleeEnv(state, [20, 20]).env),
        (error) => error.reason === 'a monster crushing the hero',
    );
    state.u.ustuck = null;
});

test('mattacku swings a wielded weapon and adds its to-hit bonus',
    async () => {
    // mhitu.c:891-908. mswings() prints before the roll and hitval() moves
    // the differential, so an armed attacker's miss carries two lines and a
    // different threshold from a bare-handed one. No fresh recording reaches
    // this: every armed attacker scanned stopped on thrwmu() or on a hit.
    const state = await meleeHero();
    const goblin = meleeAttacker(state, PM_GOBLIN, 1, 0);
    const sword = mksobj(LONG_SWORD, false, false, { state });
    sword.nobj = null;
    sword.spe = 2; // hitval() adds otmp->spe for a weapon
    goblin.minvent = sword;
    goblin.mw = sword;
    goblin.weapon_check = NO_WEAPON_WANTED;

    // tmp is 6 + 10 + 0 = 16 before the weapon and 18 after, so a roll of 17
    // misses bare-handed and hits with the sword. Take the miss at 19.
    const swung = meleeEnv(state, [19]);
    assert.equal(await mattacku(goblin, swung.env), false);
    assert.deepEqual(swung.lines, [
        'The goblin swings his long sword.',
        'The goblin misses!',
    ]);

    // Eighteen is the boundary the weapon moved: equal to tmp, so it is the
    // AT_WEAP arm's own near miss rather than a hit.
    const level = meleeEnv(state, [18]);
    assert.equal(await mattacku(goblin, level.env), false);
    assert.deepEqual(level.lines, [
        'The goblin swings his long sword.',
        'The goblin just misses!',
    ]);

    // mhitu.c:906-907 subtracts the bonus again, so a second attack in the
    // same turn is not compounded. One attack is all a goblin has, so the
    // observable half is that 17 now hits.
    const raised = meleeEnv(state, [17]);
    await assert.rejects(
        () => mattacku(goblin, raised.env),
        (error) => error.reason === PHYS_HIT_STOP,
    );
});

test('mswings_verb picks its verb from the weapon and the range', async () => {
    const state = await meleeHero();
    // mhitu.c:104-126. A long sword is oc_dir WHACK|SLASH, so it never
    // pierces and never reaches the rn2(2).
    const sword = mksobj(LONG_SWORD, false, false, { state });
    const noDraw = { rn2: (bound) => assert.fail(`unexpected rn2(${bound})`) };
    assert.equal(mswings_verb(sword, false, { state, random: noDraw }),
        'swings');
    // bash wins over everything else, and is what a polearm used too close
    // gets.
    assert.equal(mswings_verb(sword, true, { state, random: noDraw }),
        'bashes with');

    // A bullwhip is P_WHIP, the lash arm, which sits above thrust.
    const whip = mksobj(BULLWHIP, false, false, { state });
    assert.equal(mswings_verb(whip, false, { state, random: noDraw }),
        'lashes');

    // A dagger is PIERCE alone, so `(oc_dir & ~PIERCE) == 0` short-circuits
    // the draw and it always thrusts.
    const dagger = mksobj(DAGGER, false, false, { state });
    assert.equal(mswings_verb(dagger, false, { state, random: noDraw }),
        'thrusts');

    // A halberd is PIERCE|SLASH, the shape that rolls: `(oc_dir & ~PIERCE)`
    // is nonzero, so rn2(2) decides, and zero thrusts while anything else
    // swings.
    const halberd = mksobj(HALBERD, false, false, { state });
    assert.equal(
        mswings_verb(halberd, false, { state, random: { rn2: () => 0 } }),
        'thrusts',
    );
    assert.equal(
        mswings_verb(halberd, false, { state, random: { rn2: () => 1 } }),
        'swings',
    );
});

test('getmattk answers the unchanged attack and refuses each substitution',
    async () => {
    const state = await meleeHero();
    const refuse = {
        state,
        unsupported: (reason) => {
            throw new UnsupportedSimpleMonsterActionError(reason);
        },
    };
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    const sum = [M_ATTK_MISS, M_ATTK_MISS];
    // mhitu.c:309-444 with every guard false: the answer is the catalog
    // record itself, not a copy.
    assert.equal(getmattk(rat, state.youmonst, 0, sum, refuse),
        state.mons[PM_SEWER_RAT].mattk[0]);

    // mhitu.c:339-347, the disease and hunger pair. Only a previous attack
    // that landed reaches it.
    const disease = meleeAttacker(state, PM_PESTILENCE, 0, -1);
    assert.equal(getmattk(disease, state.youmonst, 1, sum, refuse),
        state.mons[PM_PESTILENCE].mattk[1]);
    assert.throws(
        () => getmattk(disease, state.youmonst, 1,
            [M_ATTK_HIT, M_ATTK_MISS], refuse),
        (error) => error.reason === 'a substituted monster attack',
    );

    // mhitu.c:370-393, a holder that has just released the hero. mspec_used
    // is what makes it re-grab with something simpler.
    const owlbear = meleeAttacker(state, PM_OWLBEAR, -1, 0);
    assert.equal(getmattk(owlbear, state.youmonst, 2, sum, refuse),
        state.mons[PM_OWLBEAR].mattk[2]);
    owlbear.mspec_used = 1;
    assert.throws(
        () => getmattk(owlbear, state.youmonst, 2, sum, refuse),
        (error) => error.reason === 'a substituted monster attack',
    );

    // mhitu.c:395-410, a weapon attack for non-physical damage. A barrow
    // wight's AT_WEAP does AD_DRLI, which C may force back to AD_PHYS.
    const wight = meleeAttacker(state, PM_BARROW_WIGHT, 0, 1);
    assert.throws(
        () => getmattk(wight, state.youmonst, 0, sum, refuse),
        (error) => error.reason === 'a substituted monster attack',
    );

    // mhitu.c:412-431, a lich's cold touch against a resistant defender.
    const lich = meleeAttacker(state, PM_LICH, -1, 1);
    assert.throws(
        () => getmattk(lich, state.youmonst, 0, sum, refuse),
        (error) => error.reason === 'a substituted monster attack',
    );
});

test('mtrapped_in_pit reads the pit under whichever party is asked',
    async () => {
    const state = await meleeHero();
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    // mhitu.c:466-479. The monster half needs mtrapped set as well as a trap
    // on the square, and the trap has to be a pit.
    assert.equal(mtrapped_in_pit(rat, state), false);
    state.level.traps.push({ tx: rat.mx, ty: rat.my, ttyp: PIT });
    assert.equal(mtrapped_in_pit(rat, state), false);
    rat.mtrapped = true;
    assert.equal(mtrapped_in_pit(rat, state), true);
    state.level.traps[0].ttyp = SPIKED_PIT;
    assert.equal(mtrapped_in_pit(rat, state), true);
    state.level.traps[0].ttyp = BEAR_TRAP;
    assert.equal(mtrapped_in_pit(rat, state), false);
    state.level.traps.length = 0;

    // The hero half reads u.utrap and u.utraptype instead of mtrapped, and
    // needs both: a pit underfoot the hero is not caught in does not count,
    // and neither does being caught in something other than a pit.
    state.level.traps.push({ tx: state.u.ux, ty: state.u.uy, ttyp: PIT });
    state.u.utrap = 0;
    state.u.utraptype = TT_PIT;
    assert.equal(mtrapped_in_pit(state.youmonst, state), false);
    state.u.utrap = 3;
    state.u.utraptype = 0;
    assert.equal(mtrapped_in_pit(state.youmonst, state), false);
    state.u.utraptype = TT_PIT;
    assert.equal(mtrapped_in_pit(state.youmonst, state), true);
    state.u.utrap = 0;
    state.level.traps.length = 0;
});

test('could_seduce answers zero for every aggressor the port admits',
    async () => {
    const state = await meleeHero();
    const refuse = {
        state,
        unsupported: (reason) => {
            throw new UnsupportedSimpleMonsterActionError(reason);
        },
    };
    // mhitu.c:1948-1949, the animal gate, then the S_NYMPH test at :1976.
    const jackal = meleeAttacker(state, PM_JACKAL, 1, 1);
    assert.equal(could_seduce(jackal, state.youmonst, null, refuse), 0);
    const goblin = meleeAttacker(state, PM_GOBLIN, -1, -1);
    assert.equal(could_seduce(goblin, state.youmonst, null, refuse), 0);
    // A nymph passes that test, and the rest of the function is unported.
    const nymph = meleeAttacker(state, PM_WATER_NYMPH, 1, -1);
    assert.throws(
        () => could_seduce(nymph, state.youmonst, null, refuse),
        (error) => error.reason === 'a seductive monster attack',
    );
});

test('mattacku clamps a differential its rolls drove to zero', async () => {
    // mhitu.c:716-717, `if (tmp <= 0) tmp = 1`, at the boundary the clamp
    // exists for. rnd(10) of ten leaves AC_VALUE at -10 and tmp at exactly
    // zero, which C raises to one and a strict `<` would leave alone.
    const state = await meleeHero();
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    state.u.uac = -10;
    const zeroed = meleeEnv(state, [10, 1]);
    assert.equal(await mattacku(rat, zeroed.env), false);
    assert.deepEqual(zeroed.bounds, ['rnd(10)', 'rnd(20)']);
    assert.deepEqual(zeroed.lines, ['The sewer rat just misses!']);

    // hack.h:1538's own boundary: armor class zero is the non-negative side,
    // so the differential spends no draw of its own.
    state.u.uac = 0;
    const exact = meleeEnv(state, [11]);
    assert.equal(await mattacku(rat, exact.env), false);
    assert.deepEqual(exact.bounds, ['rnd(20)']);
    state.u.uac = 6;
});

test('mattacku reads an invisible hero and a blocked invisibility apart',
    async () => {
    // mhitu.c:713. Invisibility the attacker cannot see through is worth two
    // points of the differential, so the roll that hit at AC 6 now misses.
    const state = await meleeHero();
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    state.u.uprops[INVIS] = { intrinsic: 0, extrinsic: 1, blocked: 0 };
    const unseen = meleeEnv(state, [15]);
    assert.equal(await mattacku(rat, unseen.env), false);
    assert.deepEqual(unseen.lines, ['The sewer rat misses!']);

    // youprop.h:198 defeats it with the blocked bit, and the same roll hits.
    state.u.uprops[INVIS].blocked = 1;
    const blocked = meleeEnv(state, [15]);
    await assert.rejects(
        () => mattacku(rat, blocked.env),
        (error) => error.reason === PHYS_HIT_STOP,
    );
    state.u.uprops[INVIS] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
});

test('mattacku keeps a pitted attacker biting and stops it kicking',
    async () => {
    // mhitu.c:794-795. mtrapped_in_pit() skips a kick alone, so an attacker
    // in a pit still bites.
    const state = await meleeHero();
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0, { mtrapped: true });
    state.level.traps.push({ tx: rat.mx, ty: rat.my, ttyp: PIT });
    // The pit also costs the attacker two of the differential (mhitu.c:715),
    // so tmp is 14 and fifteen misses.
    const bite = meleeEnv(state, [15]);
    assert.equal(await mattacku(rat, bite.env), false);
    assert.deepEqual(bite.lines, ['The sewer rat misses!']);

    // A pony's AT_KICK at index zero is skipped outright, so the turn's only
    // roll is its AT_BITE at index one, drawn from the wider die.
    const pony = meleeAttacker(state, PM_PONY, 0, 1, {
        m_lev: 0, mtrapped: true, mpeaceful: false,
    });
    state.level.traps.push({ tx: pony.mx, ty: pony.my, ttyp: PIT });
    const kick = meleeEnv(state, [15, 15]);
    assert.equal(await mattacku(pony, kick.env), false);
    assert.deepEqual(kick.bounds, ['rnd(21)']);
    assert.deepEqual(kick.lines, ['The pony misses!']);

    // Out of the pit the kick rolls first and lands.
    pony.mtrapped = false;
    const freed = meleeEnv(state, [1]);
    await assert.rejects(
        () => mattacku(pony, freed.env),
        (error) => error.reason === PHYS_HIT_STOP,
    );
    // hitmu() rolls the blow's base damage, mhitu.c:1187, before handing the
    // attack to its damage type; a pony's kick is 1d6.
    assert.deepEqual(freed.bounds, ['rnd(20)', 'd(1,6)']);
    state.level.traps.length = 0;
});

test('mattacku carries a landed kick to hitmu for an ordinary hero',
    async () => {
    // mhitu.c:809-811. A landed kick reaches hitmu() only when the defender
    // is not thick-skinned, and no hero this port can build is, so the kick
    // stops on the same edge every other attack does.
    const state = await meleeHero();
    const pony = meleeAttacker(state, PM_PONY, 1, 0, { m_lev: 0 });
    await assert.rejects(
        () => mattacku(pony, meleeEnv(state, [1]).env),
        (error) => error.reason === PHYS_HIT_STOP,
    );
});

test('mattacku lets an armed attacker reach its hand-to-hand arm', async () => {
    // mhitu.c:796-797. The `!MON_WEP(mtmp)` disjunction ends in
    // `!touch_petrifies(gy.youmonst.data)`, which is TRUE for every hero this
    // port can build, so an attacker holding a weapon still claws.
    const state = await meleeHero();
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    const sword = mksobj(LONG_SWORD, false, false, { state });
    sword.nobj = null;
    rat.minvent = sword;
    rat.mw = sword;
    const armed = meleeEnv(state, [17]);
    assert.equal(await mattacku(rat, armed.env), false);
    // AT_BITE reads no weapon bonus, so the threshold is the bare one.
    assert.deepEqual(armed.lines, ['The sewer rat misses!']);
});

test('mattacku reveals an eel the moment it strikes', async () => {
    // mhitu.c:720-724. An invisible eel on a square the hero can see becomes
    // visible before the attack resolves, and the square is repainted.
    const state = await meleeHero();
    const eel = meleeAttacker(state, PM_GIANT_EEL, 1, 0,
        { minvis: true, m_lev: 0 });
    const painted = [];
    const reveal = meleeEnv(state, [20, 21], {
        redraw: (x, y) => painted.push([x, y]),
    });
    assert.equal(await mattacku(eel, reveal.env), false);
    assert.equal(eel.minvis, false);
    assert.deepEqual(painted, [[eel.mx, eel.my]]);

    // A visible eel has nothing to reveal, and neither has an invisible
    // non-eel: both terms are needed.
    const rat = meleeAttacker(state, PM_SEWER_RAT, -1, 0,
        { minvis: true, m_lev: 0 });
    const quiet = meleeEnv(state, [20, 21], {
        redraw: () => assert.fail('a non-eel needs no reveal'),
    });
    // An invisible non-eel keeps its invisibility and stops in missmu()
    // instead, because canspotmon() is false for it.
    await assert.rejects(() => mattacku(rat, quiet.env),
        (error) => error.reason
            === 'a miss by a monster the hero cannot spot');
    assert.equal(rat.minvis, true);
});

test('mattacku admits a hidden hero only where C already returned',
    async () => {
    // mhitu.c:551. The concealment blocks are gated on `!range2 && foundyou`,
    // so a hidden hero stops an adjacent attacker and not a distant one.
    const state = await meleeHero();
    state.u.uundetected = 1;
    const distant = meleeAttacker(state, PM_SEWER_RAT, 4, 0);
    assert.equal(await mattacku(distant, meleeEnv(state, [20]).env), false);
    const adjacent = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    await assert.rejects(
        () => mattacku(adjacent, meleeEnv(state, [20]).env),
        (error) => error.reason === 'a monster finding the hidden hero',
    );
    state.u.uundetected = 0;
});

test('mattacku wields for an attacker with an empty hand', async () => {
    // mhitu.c:884-889. Either half of `weapon_check == NEED_WEAPON ||
    // !MON_WEP(mtmp)` sends the attacker to mon_wield_item(); a goblin that
    // wants no weapon and holds none still reaches it through the second.
    const state = await meleeHero();
    const goblin = meleeAttacker(state, PM_GOBLIN, 1, 0, {
        weapon_check: NO_WEAPON_WANTED,
    });
    let wields = 0;
    const bare = meleeEnv(state, [17], {
        wieldMonsterItem: async () => { wields += 1; return 0; },
    });
    assert.equal(await mattacku(goblin, bare.env), false);
    assert.equal(wields, 1);
    assert.equal(goblin.weapon_check, NEED_HTH_WEAPON);

    // A nonzero answer means mon_wield_item() printed and took the turn, so
    // C breaks out of the loop before rolling.
    goblin.mw = mksobj(LONG_SWORD, false, false, { state });
    goblin.weapon_check = NEED_WEAPON;
    const took = meleeEnv(state, [17], {
        wieldMonsterItem: async () => { wields += 1; return 1; },
    });
    assert.equal(await mattacku(goblin, took.env), false);
    assert.equal(wields, 2);
    assert.deepEqual(took.bounds, []);
    assert.deepEqual(took.lines, []);
});

test('mattacku swings only where mswings() would print', async () => {
    // mhitu.c:131. All three of verbose, sight and visibility are needed.
    const state = await meleeHero();
    const goblin = meleeAttacker(state, PM_GOBLIN, 1, 0);
    const sword = mksobj(LONG_SWORD, false, false, { state });
    sword.nobj = null;
    goblin.minvent = sword;
    goblin.mw = sword;
    goblin.weapon_check = NO_WEAPON_WANTED;

    state.flags.verbose = false;
    const quiet = meleeEnv(state, [17]);
    assert.equal(await mattacku(goblin, quiet.env), false);
    assert.deepEqual(quiet.lines, ['The goblin misses!']);
    state.flags.verbose = true;

    // A blind hero drops the swing line and keeps the miss, which is the
    // second of mswings()'s three terms on its own.
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const blind = meleeEnv(state, [17]);
    assert.equal(await mattacku(goblin, blind.env), false);
    assert.deepEqual(blind.lines, ['The goblin misses!']);
    state.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };

    // The third term is mon_visible(), which display.h keeps separate from
    // whether the hero can see at all.
    const unseen = meleeEnv(state, [17], { monsterVisible: () => false });
    assert.equal(await mattacku(goblin, unseen.env), false);
    assert.deepEqual(unseen.lines, ['The goblin misses!']);
});

test('mattacku demands a random source that answers all three bounds',
    async () => {
    // Not a source line: mattacku() draws through rn2() for the steed, rnd()
    // for the differential and the to-hit test, and d() for the damage a
    // landed blow does, so a source missing any one of them would silently
    // fall back to the live PRNG in a caller that meant to isolate it.
    //
    // Each row leaves exactly one out, and each asserts the guard's own
    // message: a later `random.<name> is not a function` is a TypeError too,
    // so a guard that had stopped covering one of the three would still make a
    // bare `assert.rejects(..., TypeError)` pass.
    const state = await meleeHero();
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    const refuse = (reason) => {
        throw new UnsupportedSimpleMonsterActionError(reason);
    };
    const guarded = (error) => error instanceof TypeError
        && error.message === 'mattacku requires an rn2, rnd and d random source';
    for (const random of [
        { rnd: () => 1, d: () => 1 },
        { rn2: () => 0, d: () => 1 },
        { rn2: () => 0, rnd: () => 1 },
    ]) {
        await assert.rejects(
            () => mattacku(rat, { state, unsupported: refuse, random }),
            guarded,
        );
    }
});

test('getmattk separates the two damage types its holder guard names',
    async () => {
    const state = await meleeHero();
    const refuse = {
        state,
        unsupported: (reason) => {
            throw new UnsupportedSimpleMonsterActionError(reason);
        },
    };
    const sum = [M_ATTK_MISS, M_ATTK_MISS];
    // A lichen's one attack is AT_TUCH for AD_STCK, which separates both
    // guards that could claim it. mhitu.c:412-413 needs AT_TUCH *and*
    // AD_COLD, so the lichen keeps its attack;
    const lichen = meleeAttacker(state, PM_LICHEN, -1, 0);
    assert.equal(getmattk(lichen, state.youmonst, 0, sum, refuse),
        state.mons[PM_LICHEN].mattk[0]);
    // and mhitu.c:370-373 claims it through the adtyp half of its
    // disjunction rather than through AT_ENGL or AT_HUGS.
    lichen.mspec_used = 1;
    assert.throws(() => getmattk(lichen, state.youmonst, 0, sum, refuse),
        (error) => error.reason === 'a substituted monster attack');
});

// ---- mhitu.c hitmsg(), hitmu(), mdamageu() and passiveum() ----

// hitmsg() reads a monster, an attack record and the two gh fields; the env
// carries the printer and the refusal could_seduce() may raise.
function hitmsgEnv(state) {
    const lines = [];
    return {
        lines,
        env: {
            state,
            message: async (text) => { lines.push(text); },
            unsupported: (reason) => {
                throw new UnsupportedSimpleMonsterActionError(reason);
            },
        },
    };
}

test('hitmsg picks its verb and its punctuation from the attack type',
    async () => {
    // mhitu.c:43-71. Each arm names one aatyp; AT_CLAW and AT_WEAP fall to the
    // default, which is why a clawing owlbear "hits".
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    for (const [aatyp, said] of [
        [AT_BITE, 'The grid bug bites!'],
        [AT_STNG, 'The grid bug stings!'],
        [AT_BUTT, 'The grid bug butts!'],
        [AT_TUCH, 'The grid bug touches you!'],
        [AT_EXPL, 'The grid bug explodes!'],
        [AT_BOOM, 'The grid bug explodes!'],
        [AT_CLAW, 'The grid bug hits!'],
    ]) {
        const printer = hitmsgEnv(state);
        await hitmsg(bug, { aatyp }, state, printer.env);
        assert.deepEqual(printer.lines, [said]);
    }

    // mhitu.c:63-66 replaces the name with its possessive, which is
    // capitalized because C wraps Monnam() rather than mon_nam().
    const tentacled = hitmsgEnv(state);
    await hitmsg(bug, { aatyp: AT_TENT }, state, tentacled.env);
    assert.deepEqual(tentacled.lines,
        ["The grid bug's tentacles suck your brain!"]);

    // mhitu.c:48-50, the one arm that changes the punctuation: a kick that
    // lands on a thick-skinned defender ends in a full stop. No role is
    // thick-skinned, so the form is fabricated from the hero's own.
    const kicked = hitmsgEnv(state);
    await hitmsg(bug, { aatyp: AT_KICK }, state, kicked.env);
    assert.deepEqual(kicked.lines, ['The grid bug kicks!']);
    const ordinary = state.youmonst.data;
    state.youmonst.data = {
        ...ordinary,
        mflags1: ordinary.mflags1 | M1_THICK_HIDE,
    };
    const thick = hitmsgEnv(state);
    await hitmsg(bug, { aatyp: AT_KICK }, state, thick.env);
    assert.deepEqual(thick.lines, ['The grid bug kicks.']);
    state.youmonst.data = ordinary;
});

test('hitmsg says "again" only for the next slot of the same monster',
    async () => {
    // mhitu.c:72-76. C's test is `mattk == gh.hitmsg_prev + 1`, pointer
    // arithmetic inside one monster's mattk[]; an owlbear's first two attacks
    // are both AT_CLAW, which is the only shape that can print the word.
    const state = await meleeHero();
    // Levelled down to zero so that the miss below can lose its rolls; the
    // differential is 16 for this hero and an owlbear's own level would put it
    // past twenty.
    const owlbear = meleeAttacker(state, PM_OWLBEAR, 1, 0, { m_lev: 0 });
    const attacks = state.mons[PM_OWLBEAR].mattk;
    assert.equal(attacks[0].aatyp, attacks[1].aatyp);
    const repeated = hitmsgEnv(state);
    await hitmsg(owlbear, attacks[0], state, repeated.env);
    await hitmsg(owlbear, attacks[1], state, repeated.env);
    assert.deepEqual(repeated.lines,
        ['The owlbear hits!', 'The owlbear hits again!']);

    // The same slot twice is not the next slot, even though the attack types
    // match and the monster is the same.
    const stuck = hitmsgEnv(state);
    await hitmsg(owlbear, attacks[0], state, stuck.env);
    await hitmsg(owlbear, attacks[0], state, stuck.env);
    assert.deepEqual(stuck.lines, ['The owlbear hits!', 'The owlbear hits!']);

    // A second owlbear shares the catalog's mattk[] with the first, so the
    // m_id test is the whole of what keeps the word off its line.
    const other = meleeAttacker(state, PM_OWLBEAR, -1, 0);
    const swapped = hitmsgEnv(state);
    await hitmsg(owlbear, attacks[0], state, swapped.env);
    await hitmsg(other, attacks[1], state, swapped.env);
    assert.deepEqual(swapped.lines, ['The owlbear hits!', 'The owlbear hits!']);

    // missmu() clears both fields, so a miss between two blows costs the word.
    const interrupted = hitmsgEnv(state);
    await hitmsg(owlbear, attacks[0], state, interrupted.env);
    const missed = meleeEnv(state, [20, 20]);
    await mattacku(owlbear, missed.env);
    assert.deepEqual(missed.lines,
        ['The owlbear misses!', 'The owlbear misses!']);
    await hitmsg(owlbear, attacks[1], state, interrupted.env);
    assert.deepEqual(interrupted.lines,
        ['The owlbear hits!', 'The owlbear hits!']);
});

test('a grid bug bite zaps the hero and costs the damage it rolled',
    async () => {
    // The whole AD_ELEC path: mhitu.c hitmu() rolls d(1,1), uhitm.c
    // mhitm_ad_elec() prints through hitmsg(), asks
    // mhitm_mgc_atk_negated() for the cancellation roll, tests the attacker's
    // level against rn2(20) for item destruction, and hitmu() then calls
    // mhitm_knockback(), whose two draws are spent before it rejects a
    // non-AD_PHYS attack.
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    const before = state.u.uhp;
    // tmp is 6 + 10 + 0 = 16 for this Valkyrie, so a roll of one lands.
    const zap = meleeEnv(state, [1]);
    assert.equal(await mattacku(bug, zap.env), false);
    assert.deepEqual(zap.lines, ['The grid bug bites!', 'You get zapped!']);
    assert.deepEqual(zap.bounds, [
        'rnd(20)', 'd(1,1)', 'rn2(10)', 'rn2(20)', 'rn2(3)', 'rn2(6)',
    ]);
    assert.equal(state.u.uhp, before - 1);

    // A cancelled attacker is turned aside before the cancellation roll, so
    // the bite prints its own line and nothing else happens.
    bug.mcan = 1;
    const cancelled = meleeEnv(state, [1]);
    assert.equal(await mattacku(bug, cancelled.env), false);
    assert.deepEqual(cancelled.lines, ['The grid bug bites!']);
    assert.deepEqual(cancelled.bounds,
        ['rnd(20)', 'd(1,1)', 'rn2(3)', 'rn2(6)']);
    assert.equal(state.u.uhp, before - 1);
    bug.mcan = 0;
});

test('magic cancellation turns a bite aside at the roll C compares',
    async () => {
    // uhitm.c:83, `negated = !(rn2(10) >= 3 * armpro)`. Leather armor is
    // a_can 1, so the boundary sits at three: below it the bite is thwarted.
    const state = await meleeHero();
    state.invent = { otyp: LEATHER_ARMOR, owornmask: W_ARM, nobj: state.invent };
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    const before = state.u.uhp;

    const avoided = meleeEnv(state, [1],
        { rn2: (bound) => (bound === 10 ? 2 : 1) });
    assert.equal(await mattacku(bug, avoided.env), false);
    assert.deepEqual(avoided.lines,
        ['The grid bug bites!', 'You avoid harm.']);
    // No rn2(20): the item-destruction test sits inside the arm that ran.
    assert.deepEqual(avoided.bounds,
        ['rnd(20)', 'd(1,1)', 'rn2(10)', 'rn2(3)', 'rn2(6)']);
    assert.equal(state.u.uhp, before);

    const landed = meleeEnv(state, [1],
        { rn2: (bound) => (bound === 10 ? 3 : 1) });
    assert.equal(await mattacku(bug, landed.env), false);
    assert.deepEqual(landed.lines, ['The grid bug bites!', 'You get zapped!']);
    assert.equal(state.u.uhp, before - 1);

    // An unarmored hero has armpro 0, which no roll can beat, so the draw
    // happens and never spares anything.
    state.invent = state.invent.nobj;
    const bare = meleeEnv(state, [1], { rn2: () => 0 });
    assert.equal(await mattacku(bug, bare.env), false);
    assert.deepEqual(bare.lines, ['The grid bug bites!', 'You get zapped!']);
    assert.ok(bare.bounds.includes('rn2(10)'));
});

test('a shock attack stops where the hero resists or loses items',
    async () => {
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);

    // uhitm.c:2712-2716. mondata.c monstseesu() has no port, so the whole
    // resistant arm stops rather than printing and forgetting the sighting.
    state.u.uprops[SHOCK_RES] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    await assert.rejects(
        () => mattacku(bug, meleeEnv(state, [1]).env),
        (error) => error.reason
            === 'a shock-resistant hero shrugging off an attack',
    );
    state.u.uprops[SHOCK_RES] = { intrinsic: 0, extrinsic: 0, blocked: 0 };

    // uhitm.c:2719-2720, `(int) magr->m_lev > rn2(20)`. A level-zero grid bug
    // never wins that comparison, so the roll happens and destroy_items() does
    // not; one level up, the same roll reaches it.
    const spared = meleeEnv(state, [1], { rn2: () => 0 });
    assert.equal(await mattacku(bug, spared.env), false);
    assert.ok(spared.bounds.includes('rn2(20)'));

    bug.m_lev = 1;
    await assert.rejects(
        () => mattacku(bug, meleeEnv(state, [1], { rn2: () => 0 }).env),
        (error) => error.reason
            === "electricity destroying the hero's items",
    );
    bug.m_lev = 0;
});

test('hitmu reduces damage for a negative armor class and not for zero',
    async () => {
    // mhitu.c:1207-1211. The armor-class differential has already spent one
    // rnd(-u.uac) in the preamble; this is the second, and it comes out of the
    // damage rather than out of the chance to hit.
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    // Several blows land in this test; a raised maximum keeps the hero out of
    // mdamageu()'s death edge, which is a separate case below.
    state.u.uhpmax = 60;
    state.u.uhp = 60;
    state.u.uac = -4;
    let before = state.u.uhp;
    // rnd(4) of one leaves tmp at 9, the rnd(20) of one lands, the bite rolls
    // five, and the second rnd(4) of two takes it to three.
    const reduced = meleeEnv(state, [1, 1, 2], { d: () => 5 });
    assert.equal(await mattacku(bug, reduced.env), false);
    assert.deepEqual(reduced.bounds, [
        'rnd(4)', 'rnd(20)', 'd(1,1)', 'rn2(10)', 'rn2(20)', 'rn2(3)',
        'rn2(6)', 'rnd(4)',
    ]);
    assert.equal(state.u.uhp, before - 3);

    // A thwarted bite carries no damage, so the reduction is skipped and the
    // second rnd(4) is never drawn.
    state.invent = { otyp: LEATHER_ARMOR, owornmask: W_ARM, nobj: state.invent };
    before = state.u.uhp;
    const thwarted = meleeEnv(state, [1, 1],
        { rn2: (bound) => (bound === 10 ? 0 : 1), d: () => 5 });
    assert.equal(await mattacku(bug, thwarted.env), false);
    assert.deepEqual(thwarted.bounds,
        ['rnd(4)', 'rnd(20)', 'd(1,1)', 'rn2(10)', 'rn2(3)', 'rn2(6)']);
    assert.equal(state.u.uhp, before);
    state.invent = state.invent.nobj;

    // Armor class zero is the non-negative side of C's test, so neither the
    // preamble nor the damage spends a draw on it.
    state.u.uac = 0;
    before = state.u.uhp;
    const plain = meleeEnv(state, [1], { d: () => 5 });
    assert.equal(await mattacku(bug, plain.env), false);
    assert.deepEqual(plain.bounds, [
        'rnd(20)', 'd(1,1)', 'rn2(10)', 'rn2(20)', 'rn2(3)', 'rn2(6)',
    ]);
    assert.equal(state.u.uhp, before - 5);
    state.u.uac = 6;
});

test('hitmu halves damage for a hero who takes half physical damage',
    async () => {
    // mhitu.c:1216-1221 over youprop.h:339-341: the intrinsic or the
    // extrinsic, either on its own.
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    state.u.uhpmax = 60;
    state.u.uhp = 60;
    for (const halved of [{ intrinsic: 1, extrinsic: 0 },
        { intrinsic: 0, extrinsic: 1 }]) {
        state.u.uprops[HALF_PHDAM] = { ...halved, blocked: 0 };
        const before = state.u.uhp;
        const soft = meleeEnv(state, [1], { d: () => 5 });
        assert.equal(await mattacku(bug, soft.env), false);
        // (5 + 1) / 2 rounded down is three, not two.
        assert.equal(state.u.uhp, before - 3);
    }
    state.u.uprops[HALF_PHDAM] = { intrinsic: 0, extrinsic: 0, blocked: 0 };

    const full = state.u.uhp;
    const hard = meleeEnv(state, [1], { d: () => 5 });
    assert.equal(await mattacku(bug, hard.env), false);
    assert.equal(state.u.uhp, full - 5);
});

test('hitmu halves damage for the Mitre of Holiness and needs all four terms',
    async () => {
    // mhitu.c:1218-1220. No role starts with its quest artifact and no AD_ELEC
    // species hates blessings, so every term is set by hand here: the second
    // disjunct is unreachable in play and each of its four conjuncts still has
    // to be able to answer no on its own.
    const state = await meleeHero();
    const QUEST_ARTIFACT = 42; // any nonzero artifact number; only equality matters
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    /* mondata.c mon_hates_blessings() answers TRUE for a vampire shifter */
    bug.cham = PM_VAMPIRE;
    state.urole = { ...state.urole, mnum: PM_CLERIC, questarti: QUEST_ARTIFACT };
    state.uarmh = { oartifact: QUEST_ARTIFACT };

    state.u.uhpmax = 60;
    const halve = async () => {
        state.u.uhp = state.u.uhpmax;
        const before = state.u.uhp;
        const blow = meleeEnv(state, [1], { d: () => 5 });
        assert.equal(await mattacku(bug, blow.env), false);
        return before - state.u.uhp;
    };
    assert.equal(await halve(), 3);

    // Each term withdrawn in turn takes the halving away.
    state.urole = { ...state.urole, mnum: PM_HUMAN };
    assert.equal(await halve(), 5);
    state.urole = { ...state.urole, mnum: PM_CLERIC };

    const helm = state.uarmh;
    state.uarmh = null;
    assert.equal(await halve(), 5);

    state.uarmh = { oartifact: QUEST_ARTIFACT + 1 };
    assert.equal(await halve(), 5);
    state.uarmh = helm;

    bug.cham = NON_PM;
    assert.equal(await halve(), 5);
});

test('hitmu doubles an undead attacker\'s damage during the midnight hour',
    async () => {
    // mhitu.c:1188-1190. The second d() is the whole of the branch, so the
    // draw list is the oracle rather than the hit points.
    const state = await meleeHero('20260214010000');
    assert.equal(midnight(state), true);
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    const ordinary = meleeEnv(state, [1]);
    assert.equal(await mattacku(bug, ordinary.env), false);
    assert.deepEqual(ordinary.bounds.filter((b) => b.startsWith('d(')),
        ['d(1,1)']);

    // mondata.c is_vampshifter() reads the monster's cham field, which is the
    // other half of C's disjunction and needs no undead species of its own.
    bug.cham = PM_VAMPIRE;
    const doubled = meleeEnv(state, [1]);
    assert.equal(await mattacku(bug, doubled.env), false);
    assert.deepEqual(doubled.bounds.filter((b) => b.startsWith('d(')),
        ['d(1,1)', 'd(1,1)']);

    // Three in the morning is not the midnight hour, so the same shifter rolls
    // once.
    const daytime = await meleeHero();
    assert.equal(midnight(daytime), false);
    const shifter = meleeAttacker(daytime, PM_GRID_BUG, 1, 0);
    shifter.cham = PM_VAMPIRE;
    const single = meleeEnv(daytime, [1]);
    assert.equal(await mattacku(shifter, single.env), false);
    assert.deepEqual(single.bounds.filter((b) => b.startsWith('d(')),
        ['d(1,1)']);
});

test('hitmu stops for an attacker that was hiding under something',
    async () => {
    // mhitu.c:1159-1185. The two refusals sit one after the other. C first
    // calls map_invisible() for an attacker the hero cannot spot, and
    // display.h canseemon() answers no for an undetected one; C then reveals a
    // hider or an eel and names what it was under, which needs doname(),
    // Amonnam() and tp_sensemon().
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0, { mundetected: 1 });
    await assert.rejects(
        () => mattacku(bug, meleeEnv(state, [1]).env),
        (error) => error.reason
            === 'a hit by a monster the hero cannot spot',
    );

    // Telepathy and detect-monsters are how C gets past that first test with
    // the attacker still undetected, and canspotmon() is the seam this file
    // already lets a caller supply. Past it, an undetected grid bug is neither
    // a hider nor an eel, so both terms of C's guard leave it alone.
    const sensed = { canSpotMonster: () => true };
    const through = meleeEnv(state, [1], sensed);
    assert.equal(await mattacku(bug, through.env), false);
    assert.deepEqual(through.lines, ['The grid bug bites!', 'You get zapped!']);

    // A giant eel qualifies through the S_EEL half alone -- it carries no
    // M1_CONCEAL -- so it stops here rather than on its AD_PHYS bite.
    const eel = meleeAttacker(state, PM_GIANT_EEL, -1, 0,
        { m_lev: 0, mundetected: 1 });
    await assert.rejects(
        () => mattacku(eel, meleeEnv(state, [1], sensed).env),
        (error) => error.reason === 'a hit by a monster that was hiding',
    );
    // Detected, the same eel reaches its own damage type instead.
    eel.mundetected = 0;
    await assert.rejects(
        () => mattacku(eel, meleeEnv(state, [1]).env),
        (error) => error.reason === PHYS_HIT_STOP,
    );
});

test('mdamageu stops at the hero\'s death and not one hit point above it',
    async () => {
    // mhitu.c:1922-1925. done_in_by() owns the killer, the tombstone and the
    // whole end of game; the goal declares this the fail-closed edge.
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    state.u.uhp = 2;
    const survived = meleeEnv(state, [1]);
    assert.equal(await mattacku(bug, survived.env), false);
    assert.equal(state.u.uhp, 1);

    await assert.rejects(
        () => mattacku(bug, meleeEnv(state, [1]).env),
        (error) => error.reason === 'the hero dying of a monster attack',
    );

    // mhitu.c:1199-1202 asks the same question before the blow lands, and one
    // hit point is above its boundary too: a thwarted bite leaves the hero
    // alive at 1 rather than spending mdamageu(mtmp, 1) on a corpse.
    state.u.uhp = 1;
    state.invent = { otyp: LEATHER_ARMOR, owornmask: W_ARM, nobj: state.invent };
    const spared = meleeEnv(state, [1],
        { rn2: (bound) => (bound === 10 ? 0 : 1) });
    assert.equal(await mattacku(bug, spared.env), false);
    assert.deepEqual(spared.lines, ['The grid bug bites!', 'You avoid harm.']);
    assert.equal(state.u.uhp, 1);
    state.invent = state.invent.nobj;
});

test('a thwarted bite leaves the status line alone and a landed one marks it',
    async () => {
    // mhitu.c:1908 sets disp.botl inside mdamageu(), which is the only writer
    // on this path once the preamble's nomul(0) has declined: hack.c:4161
    // returns at `gm.multi < nval` for a helpless hero, before the line that
    // raises the flag. The stub clears the flag because botl.c bot():270 does,
    // which is what keeps one landed blow to one refresh across the six
    // iterations of the attack loop.
    const state = await meleeHero();
    state.invent = { otyp: LEATHER_ARMOR, owornmask: W_ARM, nobj: state.invent };
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    state.multi = -3;
    state.disp.botl = false;
    const refreshes = [];
    const watchStatus = async () => {
        refreshes.push('bot');
        state.disp.botl = false;
    };
    const thwarted = meleeEnv(state, [1], {
        rn2: (bound) => (bound === 10 ? 0 : 1),
        statusRefresh: watchStatus,
    });
    // The differential gains four for a helpless hero, so the roll still lands.
    assert.equal(await mattacku(bug, thwarted.env), false);
    assert.deepEqual(thwarted.lines,
        ['The grid bug bites!', 'You avoid harm.']);
    assert.deepEqual(refreshes, []);

    const landed = meleeEnv(state, [1], {
        rn2: (bound) => (bound === 10 ? 9 : 1),
        statusRefresh: watchStatus,
    });
    assert.equal(await mattacku(bug, landed.env), false);
    assert.deepEqual(landed.lines, ['The grid bug bites!', 'You get zapped!']);
    assert.deepEqual(refreshes, ['bot']);
    state.multi = 0;
    state.invent = state.invent.nobj;
});

test('a landed blow wakes a sleeping hero on the roll C spends', async () => {
    // mhitu.c:938-943. u.usleep is the turn the hero fell asleep, so the
    // comparison against svm.moves keeps the roll off the turn it started.
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    state.moves = 40;
    // hack.c nomul():4161-4163 zeroes u.usleep, and mattacku()'s preamble
    // calls nomul(0) for an adjacent attacker. A sleeping hero has gm.multi
    // below zero, so that call returns at its own guard and the field
    // survives; without the negative multi this arm could never be reached.
    state.multi = -5;

    // Awake: no roll, whatever the attack did.
    const awake = meleeEnv(state, [1]);
    assert.equal(await mattacku(bug, awake.env), false);
    assert.equal(awake.bounds.filter((b) => b === 'rn2(10)').length, 1);
    assert.equal(state.nomovemsg ?? null, null);

    // Asleep since this very turn: C's `u.usleep < svm.moves` is false, so the
    // roll is still not spent.
    state.u.usleep = 40;
    const justAsleep = meleeEnv(state, [1]);
    assert.equal(await mattacku(bug, justAsleep.env), false);
    assert.equal(
        justAsleep.bounds.filter((b) => b === 'rn2(10)').length, 1);
    assert.equal(state.nomovemsg ?? null, null);

    // Asleep since an earlier turn: the roll happens, and zero wakes the hero.
    state.u.usleep = 39;
    const woken = meleeEnv(state, [1], { rn2: () => 0 });
    assert.equal(await mattacku(bug, woken.env), false);
    assert.equal(woken.bounds.filter((b) => b === 'rn2(10)').length, 2);
    assert.equal(state.multi, -1);
    assert.equal(state.nomovemsg, 'The combat suddenly awakens you.');

    // A nonzero roll leaves the hero asleep, which is what makes the draw
    // decide something rather than merely happen.
    state.multi = -5;
    state.nomovemsg = null;
    state.u.usleep = 39;
    const stillAsleep = meleeEnv(state, [1], { rn2: () => 1 });
    assert.equal(await mattacku(bug, stillAsleep.env), false);
    assert.equal(stillAsleep.bounds.filter((b) => b === 'rn2(10)').length, 2);
    assert.equal(state.multi, -5);
    assert.equal(state.nomovemsg ?? null, null);
    state.u.usleep = 0;
    state.multi = 0;
});

test('passiveum finds the hero form\'s empty slot and rolls its dice',
    async () => {
    // mhitu.c:2448-2461. An ordinary hero's mattk[1] is NO_ATTK, whose damn
    // and damd are both zero, so the counter-attack costs nothing; the forms
    // below are fabricated because polyself is unported and no role can carry
    // a filled attack list.
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    const ordinary = state.youmonst.data;
    const quiet = meleeEnv(state, [1]);
    assert.equal(await mattacku(bug, quiet.env), false);
    assert.deepEqual(quiet.bounds.filter((b) => b.startsWith('d(')),
        ['d(1,1)']);

    // A slot with dice of its own is rolled where C rolls it, after the blow's
    // own damage and after mhitm_knockback().
    const armed = (aatyp) => ({
        ...ordinary,
        mlevel: 3,
        mattk: [ordinary.mattk[0],
            { aatyp, adtyp: AD_PHYS, damn: 2, damd: 4 },
            ...ordinary.mattk.slice(2)],
    });
    for (const aatyp of [AT_NONE, AT_BOOM]) {
        state.youmonst.data = armed(aatyp);
        const rolled = meleeEnv(state, [1]);
        assert.equal(await mattacku(bug, rolled.env), false);
        assert.deepEqual(rolled.bounds.filter((b) => b.startsWith('d(')),
            ['d(1,1)', 'd(2,4)']);
    }

    // damn zero and damd nonzero is C's second arm, which rolls the form's own
    // level plus one instead of the attack's count.
    state.youmonst.data = {
        ...armed(AT_NONE),
        mattk: [ordinary.mattk[0],
            { aatyp: AT_NONE, adtyp: AD_PHYS, damn: 0, damd: 4 },
            ...ordinary.mattk.slice(2)],
    };
    const levelled = meleeEnv(state, [1]);
    assert.equal(await mattacku(bug, levelled.env), false);
    assert.deepEqual(levelled.bounds.filter((b) => b.startsWith('d(')),
        ['d(1,1)', 'd(4,4)']);

    // A form with no empty slot at all returns at C's `i >= NATTK` without
    // touching mattk[NATTK], which does not exist.
    state.youmonst.data = {
        ...ordinary,
        mattk: ordinary.mattk.map(
            () => ({ aatyp: AT_CLAW, adtyp: AD_PHYS, damn: 1, damd: 2 }),
        ),
    };
    const full = meleeEnv(state, [1]);
    assert.equal(await mattacku(bug, full.env), false);
    assert.deepEqual(full.bounds.filter((b) => b.startsWith('d(')), ['d(1,1)']);
    state.youmonst.data = ordinary;
});
