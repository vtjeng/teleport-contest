import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BEAR_TRAP,
    BLINDED,
    INVIS,
    M_ATTK_HIT,
    M_ATTK_MISS,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    NO_WEAPON_WANTED,
    PIT,
    PROTECTION,
    SPIKED_PIT,
    TT_PIT,
    W_AMUL,
    W_ARM,
    W_ARMC,
    W_ARMU,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    could_seduce,
    getmattk,
    magic_negation,
    mattacku,
    mswings_verb,
    mtrapped_in_pit,
} from '../js/mhitu.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    monst_globals_init,
    NON_PM,
    PM_ALIGNED_CLERIC,
    PM_BARROW_WIGHT,
    PM_GIANT_EEL,
    PM_GOBLIN,
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

async function meleeHero() {
    await runSegment({
        seed: 7710044,
        datetime: MELEE_DATETIME,
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
function meleeEnv(state, rolls, extra = {}) {
    const lines = [];
    const bounds = [];
    const next = [...rolls];
    return {
        lines,
        bounds,
        env: {
            state,
            random: {
                rn2: (bound) => { bounds.push(`rn2(${bound})`); return 1; },
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
            stopOccupation: async () => {},
            wieldMonsterItem: async () => 0,
            throwRangedWeapon: () => {},
            ...extra,
        },
    };
}

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
            && error.reason === 'a monster landing a hit on the hero',
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
    // first attack could not lose to still loses on the second.
    const widened = meleeEnv(state, [20, 18]);
    await assert.rejects(
        () => mattacku(ant, widened.env),
        (error) => error.reason === 'a monster landing a hit on the hero',
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
        (error) => error.reason === 'a monster landing a hit on the hero',
    );
    state.multi = 0;
});

test('mattacku refuses each arm the slice leaves unported', async () => {
    const state = await meleeHero();
    // mhitu.c:743-755, the invulnerable hero. Only a monster four or more
    // squares away can reach it: hack.c nomul(), which mattacku()'s preamble
    // runs for every closer attacker, clears u.uinvulnerable itself.
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
        (error) => error.reason === 'a monster landing a hit on the hero',
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
        (error) => error.reason === 'a monster landing a hit on the hero',
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
        (error) => error.reason === 'a monster landing a hit on the hero',
    );
    assert.deepEqual(freed.bounds, ['rnd(20)']);
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
        (error) => error.reason === 'a monster landing a hit on the hero',
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

test('mattacku demands a random source that answers both bounds', async () => {
    // Not a source line: mattacku() draws through rn2() for the steed and
    // rnd() for the differential and the to-hit test, so a source missing
    // either would silently fall back to the live PRNG in a caller that
    // meant to isolate it.
    const state = await meleeHero();
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    const refuse = (reason) => {
        throw new UnsupportedSimpleMonsterActionError(reason);
    };
    await assert.rejects(
        () => mattacku(rat, { state, unsupported: refuse, random: {
            rn2: () => 0,
        } }),
        TypeError,
    );
    await assert.rejects(
        () => mattacku(rat, { state, unsupported: refuse, random: {
            rnd: () => 1,
        } }),
        TypeError,
    );
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
