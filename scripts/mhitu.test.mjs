import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BEAR_TRAP,
    BLINDED,
    CONFLICT,
    CQ_CANNED,
    DETECT_MONSTERS,
    HALF_PHDAM,
    INVIS,
    M_ATTK_HIT,
    M_ATTK_MISS,
    M_SEEN_ACID,
    M_SEEN_FIRE,
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
    W_ARMG,
    W_ARMC,
    W_ARMU,
} from '../js/const.js';
import { midnight } from '../js/calendar.js';
import {
    cmdq_add_ec,
    cmdq_peek,
    extcmdRow,
    set_occupation,
} from '../js/cmd.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    could_seduce,
    getmattk,
    hitmsg,
    magic_negation,
    mattacku,
    MonsterDeathPlanningError,
    mswings_verb,
    mtrapped_in_pit,
    ranged_attk_available,
} from '../js/mhitu.js';
import { sticks, thick_skinned } from '../js/mondata.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    monst_globals_init,
    AD_COLD,
    AD_PHYS,
    AT_BITE,
    AT_ENGL,
    AT_BOOM,
    AT_BUTT,
    AT_CLAW,
    AT_EXPL,
    AT_HUGS,
    AT_KICK,
    AT_NONE,
    AT_STNG,
    AT_TENT,
    AT_TUCH,
    AT_WEAP,
    M1_THICK_HIDE,
    NON_PM,
    PM_ALIGNED_CLERIC,
    PM_AMOROUS_DEMON,
    PM_BARROW_WIGHT,
    PM_BLACK_PUDDING,
    PM_BLACK_NAGA,
    PM_CHROMATIC_DRAGON,
    PM_CLERIC,
    PM_COBRA,
    PM_COCKATRICE,
    PM_GIANT_EEL,
    PM_BABY_GRAY_DRAGON,
    PM_GOBLIN,
    PM_PURPLE_WORM,
    PM_SHRIEKER,
    PM_GRID_BUG,
    PM_HUMAN,
    PM_ICE_VORTEX,
    PM_JACKAL,
    PM_KI_RIN,
    PM_LICH,
    PM_LICHEN,
    PM_OWLBEAR,
    PM_PONY,
    PM_PESTILENCE,
    PM_PLAINS_CENTAUR,
    PM_PYTHON,
    PM_RUST_MONSTER,
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
    CORPSE,
    DAGGER,
    ELVEN_MITHRIL_COAT,
    HALBERD,
    HAWAIIAN_SHIRT,
    GAUNTLETS_OF_POWER,
    LEATHER_ARMOR,
    LONG_SWORD,
    ORCISH_DAGGER,
    SILVER_DAGGER,
    objects_globals_init,
} from '../js/objects.js';
import { mhitm_ad_phys } from '../js/uhitm.js';
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

async function meleeHero(datetime = MELEE_DATETIME, role = 'Valkyrie') {
    await runSegment({
        seed: 7710044,
        datetime,
        nethackrc: MELEE_RC.replace('role:Valkyrie', `role:${role}`),
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
            markInvisible: () => {},
            statusRefresh: async () => {},
            wieldMonsterItem: async () => 0,
            throwRangedWeapon: () => {},
            ...envExtra,
        },
    };
}

// What an AD_PHYS blow says and what it costs, for the fixtures below. Every
// one of them is unarmed, so uhitm.c mhitm_ad_phys():4122-4126 prints
// hitmsg()'s verb and hitmu() takes the rolled damage off the hero.
//
// meleeEnv()'s d() answers its first argument, so every 1dN blow below costs
// exactly one hit point unless the test overrides d().
function physHit(said) {
    return { lines: [said], cost: 1 };
}

// The draws one landed AD_PHYS blow makes, in order: the to-hit roll
// (mhitu.c:806), hitmu()'s damage roll (mhitu.c:1187), and
// mhitm_knockback()'s pair (uhitm.c:5258 and :5269).
function physHitBounds(toHitBound, damn, damd) {
    return [`rnd(${toHitBound})`, `d(${damn},${damd})`, 'rn2(3)', 'rn2(6)'];
}

test('mattacku prints the miss its to-hit test loses and the hit it wins',
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

    // One below tmp is C's `tmp > j`, the hit side. A sewer rat's mattk[0] is
    // {AT_BITE, AD_PHYS, 1d3}, so hitmsg():195-197 picks "bites" and the
    // rolled damage comes off the hero.
    const hit = meleeEnv(state, [15]);
    const before = state.u.uhp;
    assert.equal(await mattacku(rat, hit.env), false);
    const bite = physHit('The sewer rat bites!');
    assert.deepEqual(hit.lines, bite.lines);
    assert.deepEqual(hit.bounds, physHitBounds(20, 1, 3));
    assert.equal(state.u.uhp, before - bite.cost);
});

test('an ice vortex swallows, freezes, and expels an ordinary hero',
    async () => {
    // mhitu.c:848-850 and gulpmu():1292, 1392-1393, 1502-1508. The first
    // attack rolls its hit, damage, and non-digestion swallow timer before
    // the cold gate; the already-swallowed attack skips the hit roll and
    // repeats only the damage and cold gate. When the timer expires,
    // gulpmu():1461-1465 calls expels(), which releases the hero, relocates
    // the vortex, and applies the landing square's effects.
    const state = await meleeHero(MELEE_DATETIME, 'Wizard');
    const vortex = meleeAttacker(state, PM_ICE_VORTEX, 1, 0, {
        m_lev: 5,
        mhp: 20,
        mhpmax: 20,
    });
    // meleeHero() deliberately stops startup at its first empty input
    // boundary, leaving that message to the same display_nhwindow(FALSE)
    // dismissal that gulpmu() performs before setting uswallow.
    state.nhDisplay.pushKey(' '.charCodeAt(0));
    const first = meleeEnv(state, [1, 9], {
        urgentMessage: async (text) => first.lines.push(text),
    });
    const before = state.u.uhp;
    assert.equal(await mattacku(vortex, first.env), false);
    assert.deepEqual(first.lines, [
        'The ice vortex engulfs you!',
        'You are freezing to death!',
    ]);
    assert.deepEqual(first.bounds, [
        'rnd(20)', 'd(1,6)', 'rnd(10)', 'rn2(2)',
    ]);
    assert.equal(state.u.uswallow, 1);
    assert.equal(state.u.ustuck, vortex);
    assert.equal(state.u.uswldtim, 8);
    assert.equal(state.u.uhp, before - 1);

    const second = meleeEnv(state, [], {
        urgentMessage: async (text) => second.lines.push(text),
    });
    assert.equal(await mattacku(vortex, second.env), false);
    assert.deepEqual(second.lines, ['You are freezing to death!']);
    assert.deepEqual(second.bounds, ['d(1,6)', 'rn2(2)']);
    assert.equal(state.u.uswldtim, 7);
    assert.equal(state.u.uhp, before - 2);

    // The timer is normally eight turns here; setting it to one isolates the
    // expiry branch without replaying seven identical turns. expels() also
    // calls unstuck(), whose rehold-prevention check is the final rnd(2).
    state.u.uswldtim = 1;
    const expelled = meleeEnv(state, []);
    assert.equal(await mattacku(vortex, expelled.env), false);
    assert.deepEqual(expelled.lines, [
        'You are freezing to death!',
        'You get expelled!',
    ]);
    // The relocation itself enters mnexto()/enexto(), whose map-dependent
    // candidate scan is covered by teleport tests; pin the expulsion-local
    // draws before that scan instead of duplicating its coordinate fixture.
    assert.deepEqual(expelled.bounds.slice(0, 3), [
        'd(1,6)', 'rn2(2)', 'rnd(2)',
    ]);
    assert.equal(state.u.uswallow, 0);
    assert.equal(state.u.uswldtim, 0);
    assert.equal(state.u.ustuck, null);
    // mon.c:unstuck() raises the flag before docrt(), whose
    // vision_recalc(0) clears it again (vision.c:532).
    assert.equal(state.vision_full_recalc, 0);
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
    const widened = meleeEnv(state, [20, 18], {
        // mhitm_ad_drst() first spends the magic-cancellation roll, then
        // spends the 1/8 poison-effect roll. Keep the former from negating
        // the sting and force the latter into its still-unported continuation.
        rn2: (bound) => bound === 8 ? 0 : 9,
    });
    await assert.rejects(
        () => mattacku(ant, widened.env),
        (error) => error.reason
            === 'a non-resistant hero poisoned by a monster',
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
    // Seventeen misses in the sibling test above and lands here, so the line
    // that appears is the whole evidence that the four points were added.
    state.multi = -3;
    const helpless = meleeEnv(state, [17]);
    assert.equal(await mattacku(rat, helpless.env), false);
    assert.deepEqual(helpless.lines, physHit('The sewer rat bites!').lines);
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

    // mhitu.c:955-993, summonmu(). A were-creature next to the hero
    // triggers the were-creature summoning arm before it strikes.
    const were = meleeAttacker(state, PM_WERERAT, 0, 1);
    await assert.rejects(
        () => mattacku(were, meleeEnv(state, [17]).env),
        (error) => error.reason
            === 'a were creature summoning critters',
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

    // A roll of 17 now hits. hitmu() rolls the goblin's 1d4 base for 1,
    // dmgval() rolls the +2 long sword's 1d8 for 1 and adds its enchantment,
    // and the knockback gate rejects the hit after its two draws. The four
    // damage points leave this 16-hit-point Valkyrie at 12.
    const raised = meleeEnv(state, [17]);
    assert.equal(await mattacku(goblin, raised.env), false);
    assert.deepEqual(raised.lines, [
        'The goblin swings his long sword.',
        'The goblin hits!',
    ]);
    assert.deepEqual(raised.bounds,
        ['rnd(20)', 'd(1,4)', 'rnd(8)', 'rn2(3)', 'rn2(6)']);
    assert.equal(state.u.uhp, 12);
});

test('a raw fatal weapon roll survives negative-AC mitigation', async () => {
    // uhitm.c mhitm_ad_phys() adds the goblin's 1d4 attack and a dagger's
    // 1d4 damage before mhitu.c hitmu() subtracts rnd(-u.uac). Two raw points
    // equal the hero's two HP, but AC -1 removes one and leaves her alive.
    const state = await meleeHero();
    const goblin = meleeAttacker(state, PM_GOBLIN, 1, 0);
    const dagger = mksobj(DAGGER, false, false, { state });
    dagger.nobj = null;
    dagger.spe = 0;
    goblin.minvent = dagger;
    goblin.mw = dagger;
    goblin.weapon_check = NO_WEAPON_WANTED;
    state.u.uac = -1;
    state.u.uhp = 2;
    state.u.uhpmax = 2;

    // rnd(1) fixes AC_VALUE at -1; rnd(20)=8 lands below tmp 9; rnd(4)=1
    // supplies dagger damage; the final rnd(1)=1 is hitmu()'s mitigation.
    const survived = meleeEnv(state, [1, 8, 1, 1]);
    assert.equal(await mattacku(goblin, survived.env), false);
    assert.deepEqual(survived.lines, [
        'The goblin thrusts his dagger.',
        'The goblin hits!',
    ]);
    assert.deepEqual(survived.bounds, [
        'rnd(1)', 'rnd(20)', 'd(1,4)', 'rnd(4)', 'rn2(3)', 'rn2(6)',
        'rnd(1)',
    ]);
    assert.equal(state.u.uhp, 1);
});

// mhitu.c:801-804. An armed monster declines to touch a cockatrice, and
// confusion or Conflict suspends that instinct. A plains centaur is the
// shortest fixture that reaches the test the way C does: monsters.h gives it
// ATTK(AT_WEAP, AD_PHYS, 1, 6) then ATTK(AT_KICK, AD_PHYS, 1, 6), so
// mattacku()'s AT_WEAP arm reads MON_WEP() at slot 0 and slot 1 arrives at the
// physical case with that weapon still in hand.
test('mattacku suspends the armed cockatrice instinct under conflict',
    async () => {
    const state = await meleeHero();
    // mondata.c touch_petrifies() answers TRUE for the cockatrice and the
    // chickatrice alone, so the hero has to wear one of those forms before the
    // instinct engages at all.
    state.youmonst.data = state.mons[PM_COCKATRICE];
    const centaur = meleeAttacker(state, PM_PLAINS_CENTAUR, 1, 0);
    const sword = mksobj(LONG_SWORD, false, false, { state });
    sword.nobj = null;
    sword.spe = 0; // hitval() adds spe, and a long sword's oc_hitbon is 0
    centaur.minvent = sword;
    centaur.mw = sword;
    // NO_WEAPON_WANTED keeps mattacku()'s AT_WEAP arm from re-wielding, so the
    // weapon this fixture put in hand is the one both slots see.
    centaur.weapon_check = NO_WEAPON_WANTED;

    // tmp is 6 + 10 + 4: the Valkyrie's AC 6, mhitu.c:806's constant, and a
    // plains centaur's level. The weapon adds nothing, so 20 is slot 0's near
    // miss on rnd(20) and 21 is slot 1's ordinary miss on rnd(21). Both slots
    // miss, which keeps hitmu() and the armed blow's fail-closed edge out of
    // the comparison and leaves the draws as the whole observable.
    const instinct = meleeEnv(state, [20, 21]);
    assert.equal(await mattacku(centaur, instinct.env), false);
    // Slot 1 spends no draw: the centaur holds a weapon, so it declines to
    // kick a cockatrice and mhitu.c:805's `rnd(20 + i)` never runs.
    assert.deepEqual(instinct.bounds, ['rnd(20)']);
    assert.deepEqual(instinct.lines, [
        'The plains centaur swings his long sword.',
        'The plains centaur just misses!',
    ]);

    // An intrinsic alone answers youprop.h:218's first disjunct, and the kick
    // it admits is the second draw.
    state.u.uprops[CONFLICT] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const conflicted = meleeEnv(state, [20, 21]);
    assert.equal(await mattacku(centaur, conflicted.env), false);
    assert.deepEqual(conflicted.bounds, ['rnd(20)', 'rnd(21)']);
    assert.deepEqual(conflicted.lines, [
        'The plains centaur swings his long sword.',
        'The plains centaur just misses!',
        'The plains centaur misses!',
    ]);

    // youprop.h:218 declares no BConflict, so a blocked mask must leave the
    // answer alone. W_ARMC is the cloak mask worn.c:127 writes for the six
    // properties that do have a blocked alias; no C path writes any mask for
    // CONFLICT, so this state is unreachable in play and the case pins the
    // spelling rather than a reachable divergence.
    state.u.uprops[CONFLICT].blocked = W_ARMC;
    const blocked = meleeEnv(state, [20, 21]);
    assert.equal(await mattacku(centaur, blocked.env), false);
    assert.deepEqual(blocked.bounds, ['rnd(20)', 'rnd(21)']);
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
    // mhitu.c:371-392. When mspec_used is set, the holder's hug attack is
    // rewritten to a simpler melee attack. The owlbear's AT_HUGS/AD_PHYS
    // is not elemental, so it becomes AT_CLAW/AD_PHYS with 1d6 damage.
    owlbear.mspec_used = 1;
    const owlSub = getmattk(owlbear, state.youmonst, 2, sum, refuse);
    assert.notEqual(owlSub, state.mons[PM_OWLBEAR].mattk[2]);
    assert.equal(owlSub.aatyp, AT_CLAW);
    assert.equal(owlSub.adtyp, AD_PHYS);
    assert.equal(owlSub.damn, 1);
    assert.equal(owlSub.damd, 6);

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

    // The refusal is wider than C's nonzero answer, which is what makes it a
    // stop rather than the arm's boundary. mhitu.c:1976-1977 is a disjunction
    // and the port tests only its species half, so an amorous demon's claw --
    // its second and third slots, ATTK(AT_CLAW, AD_PHYS, 1, 3) at
    // monsters.h:2922-2923 -- refuses here where C returns 0 at :1978 and
    // hitmsg() prints "hits". Completing the adtyp half would land that blow
    // instead, and this is where that change has to be argued.
    const demon = meleeAttacker(state, PM_AMOROUS_DEMON, -1, 1);
    const claw = demon.data.mattk[1];
    assert.equal(claw.aatyp, AT_CLAW);
    assert.equal(claw.adtyp, AD_PHYS);
    assert.throws(
        () => could_seduce(demon, state.youmonst, claw, refuse),
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
    assert.equal(await mattacku(rat, blocked.env), false);
    assert.deepEqual(blocked.lines, physHit('The sewer rat bites!').lines);
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

    // Out of the pit the kick rolls first and lands, and the bite behind it
    // lands too. Both of the pony's attacks are AD_PHYS, so the turn spends
    // hitmu()'s whole sequence twice over.
    pony.mtrapped = false;
    const freed = meleeEnv(state, [1]);
    assert.equal(await mattacku(pony, freed.env), false);
    // hitmu() rolls the blow's base damage, mhitu.c:1187, before handing the
    // attack to its damage type; a pony's kick is 1d6 and its bite 1d2.
    assert.deepEqual(freed.bounds, [
        ...physHitBounds(20, 1, 6), ...physHitBounds(21, 1, 2),
    ]);
    // hitmsg():198-202 and :195-197. The two verbs differ, so C's `again`
    // term at :77 stays empty even though the slots are adjacent.
    assert.deepEqual(freed.lines, ['The pony kicks!', 'The pony bites!']);
    state.level.traps.length = 0;
});

test('mattacku carries a landed kick to hitmu for an ordinary hero',
    async () => {
    // mhitu.c:809-811. A landed kick reaches hitmu() only when the defender
    // is not thick-skinned, and no hero this port can build is, so a pony's
    // AT_KICK prints hitmsg()'s kick verb rather than being dropped.
    //
    // hitmsg():199-201 also chooses the punctuation from the same test, so
    // this pins the exclamation mark a thick-skinned defender would lose.
    const missState = await meleeHero();
    const missPony = meleeAttacker(
        missState, PM_PONY, 1, 0, { m_lev: 0 },
    );
    // The pony still tests its existing second bite after a missed kick;
    // feed that wider roll too so this pins both the AT_KICK miss and the
    // already-supported following-slot miss.
    const missed = meleeEnv(missState, [20, 20]);
    assert.equal(await mattacku(missPony, missed.env), false);
    assert.deepEqual(missed.bounds, ['rnd(20)', 'rnd(21)']);
    assert.deepEqual(missed.lines, ['The pony misses!', 'The pony misses!']);

    const state = await meleeHero();
    const pony = meleeAttacker(state, PM_PONY, 1, 0, { m_lev: 0 });
    const kicked = meleeEnv(state, [1]);
    assert.equal(await mattacku(pony, kicked.env), false);
    assert.deepEqual(kicked.lines, ['The pony kicks!', 'The pony bites!']);
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

    // The same site under a planning clone. js/unported_monster_actions.js
    // replays every monster turn twice, once against the clone and then live,
    // so mattacku() binds newsym() to a no-op while env.planning is set; an
    // ungated call would repaint each striking eel's square twice. This is
    // the only newsym() mattacku() reaches, and the clone is where the
    // suppression has to hold, so the same fixture runs again with the flag
    // on. Clearing minvis is state rather than display, and still happens.
    eel.minvis = true;
    const planned = meleeEnv(state, [20, 21], {
        planning: true,
        redraw: () => assert.fail('a planned reveal repaints nothing'),
    });
    assert.equal(await mattacku(eel, planned.env), false);
    assert.equal(eel.minvis, false);

    // A visible eel has nothing to reveal, and neither has an invisible
    // non-eel: both terms are needed.
    const rat = meleeAttacker(state, PM_SEWER_RAT, -1, 0,
        { minvis: true, m_lev: 0 });
    const marked = [];
    const quiet = meleeEnv(state, [20, 21], {
        canSpotMonster: () => false,
        markInvisible: (x, y) => marked.push([x, y]),
        redraw: () => assert.fail('a non-eel needs no reveal'),
    });
    // An invisible non-eel keeps its invisibility. missmu() marks its square,
    // prints the source's anonymous miss, and completes the attack.
    assert.equal(await mattacku(rat, quiet.env), false);
    assert.deepEqual(quiet.lines, ['It misses!']);
    assert.deepEqual(marked, [[rat.mx, rat.my]]);
    assert.equal(rat.minvis, true);

    // See Invisible makes the monster spottable, but do_name.c Monnam() then
    // needs the unported invisible adjective (and hallucination can add display
    // RNG). The narrower boundary must stay ahead of the miss message.
    const spottedMarks = [];
    const spotted = meleeEnv(state, [20], {
        canSpotMonster: () => true,
        markInvisible: (x, y) => spottedMarks.push([x, y]),
    });
    await assert.rejects(
        () => mattacku(rat, spotted.env),
        (error) => error.reason
            === 'a miss by an invisible monster the hero can see',
    );
    assert.deepEqual(spotted.lines, []);
    assert.deepEqual(spottedMarks, []);
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
    // and mhitu.c:370-373 claims it through the adtyp half (AD_STCK) of
    // its disjunction rather than through AT_ENGL or AT_HUGS.
    // mhitu.c:375: wimpy is true because damd is 0.  The non-elemental
    // branch fires (AT_CLAW/AD_PHYS), then the wimpy guard converts
    // AT_CLAW to AT_TUCH with 0d0.
    lichen.mspec_used = 1;
    const lichenSub = getmattk(lichen, state.youmonst, 0, sum, refuse);
    assert.notEqual(lichenSub, state.mons[PM_LICHEN].mattk[0]);
    assert.equal(lichenSub.aatyp, AT_TUCH);
    assert.equal(lichenSub.adtyp, AD_PHYS);
    assert.equal(lichenSub.damn, 0);
    assert.equal(lichenSub.damd, 0);

    // An ice vortex's AT_ENGL/AD_COLD, the goal's witness case.
    // mhitu.c:380-382: AD_COLD is elemental, so the attack becomes
    // AT_TUCH (not AT_CLAW) and keeps AD_COLD.
    const vortex = meleeAttacker(state, PM_ICE_VORTEX, 1, 0);
    assert.equal(getmattk(vortex, state.youmonst, 0, sum, refuse).aatyp,
        AT_ENGL);
    vortex.mspec_used = 1;
    const vortexSub = getmattk(vortex, state.youmonst, 0, sum, refuse);
    assert.equal(vortexSub.aatyp, AT_TUCH);
    assert.equal(vortexSub.adtyp, AD_COLD);
    assert.equal(vortexSub.damn, 1);
    assert.equal(vortexSub.damd, 6);
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

    // mhitu.c:1210-1211, the floor under the reduction. A grid bug's 1d1 bite
    // rolls one -- meleeEnv()'s d() answers its first argument -- and the
    // second rnd(4) answers four, so the reduction exceeds the roll. C leaves
    // one point rather than a negative number, and the hero pays it. Without
    // the two clamp lines mhm.damage is -3, which fails hitmu()'s
    // `mhm.damage > 0` and skips mdamageu() altogether; `mhm.damage = 0`
    // skips it too. Both spellings cost the hero nothing, so the exact value
    // is what this asserts, not its sign.
    before = state.u.uhp;
    const floored = meleeEnv(state, [1, 1, 4]);
    assert.equal(await mattacku(bug, floored.env), false);
    assert.deepEqual(floored.bounds, [
        'rnd(4)', 'rnd(20)', 'd(1,1)', 'rn2(10)', 'rn2(20)', 'rn2(3)',
        'rn2(6)', 'rnd(4)',
    ]);
    assert.equal(state.u.uhp, before - 1);

    // The clamp's own boundary, which the case above does not reach. There
    // the reduction overshoots to -3, where `mhm.damage < 1` and a mutant
    // `mhm.damage < 0` both fire and both leave one point. They disagree at
    // exactly zero and nowhere else: the same 1d1 bite rolls one and the
    // second rnd(4) answers one, so C's `< 1` pays a point while `< 0` leaves
    // zero, fails hitmu()'s `mhm.damage > 0`, and skips mdamageu() entirely.
    before = state.u.uhp;
    const atZero = meleeEnv(state, [1, 1, 1]);
    assert.equal(await mattacku(bug, atZero.env), false);
    assert.equal(state.u.uhp, before - 1);

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

test('hitmu marks an invisible-monster square for an unspotted attacker',
    async () => {
    // mhitu.c:1155-1156. When canspotmon(mtmp) is false -- the hero is blind,
    // the attacker is invisible, or the attacker is undetected -- C calls
    // map_invisible() and continues the damage computation unchanged. An
    // undetected grid bug has canspotmon() false because monsterVisible()
    // returns false for mundetected monsters. The grid bug is neither a hider
    // nor an eel, so both terms of the next guard (mhitu.c:1161) leave it
    // alone, and the bite lands through hitmu()'s full path.
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0, { mundetected: 1 });
    const marked = [];
    // markInvisible tracks which squares map_invisible() would mark.
    const marking = meleeEnv(state, [1], {
        markInvisible: (x, y) => marked.push([x, y]),
    });
    assert.equal(await mattacku(bug, marking.env), false);
    // The attacker's square is marked as containing an invisible monster.
    assert.deepEqual(marked, [[bug.mx, bug.my]]);
    // Monnam() sees canspotmon() false and names the attacker "It".
    assert.deepEqual(marking.lines, ['It bites!', 'You get zapped!']);
});

test('hitmu stops for an attacker that was hiding under something',
    async () => {
    // mhitu.c:1161-1184. After map_invisible(), hitmu() checks whether the
    // attacker was hiding. A detected grid bug with DETECT_MONSTERS is neither
    // a hider nor an eel, so both terms of C's guard leave it alone.
    //
    // The property is set as well as the seam, because hitmu()'s line names
    // the attacker through Monnam(), whose do_it arm (do_name.c:863-865) reads
    // display.h canspotmon() itself rather than through this env. Without a
    // hero who really senses the grid bug the two would disagree and the line
    // would read "It bites!".
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0, { mundetected: 1 });
    state.u.uprops[DETECT_MONSTERS] = {
        intrinsic: 1, extrinsic: 0, blocked: 0,
    };
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
    // Detected, the same eel's bite reaches mhitm_ad_phys() and lands. Its
    // mattk[1] is {AT_TUCH, AD_WRAP, 0d0}, an arm mhitm_adtyping() still
    // refuses, so the turn prints the bite and then stops.
    eel.mundetected = 0;
    const seen = meleeEnv(state, [1]);
    await assert.rejects(
        () => mattacku(eel, seen.env),
        (error) => error.reason === 'uhitm.c mhitm_ad_wrap()',
    );
    assert.deepEqual(seen.lines, ['The giant eel bites!']);
});

// ---- uhitm.c mhitm_ad_phys() ----

// The function called on its own, which is the only way to reach three of its
// branches. C's `magr == &gy.youmonst` and monster-versus-monster arms have no
// ported caller at all; the held-touch guard at :4122-4123 needs u.ustuck
// pointing at the attacker, and js/mon.js set_ustuck()'s one ported caller
// passes null.
function physEnv(state) {
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

// mhitu.c hitmu():1149-1153 builds this record and only mhm.damage arrives
// with a value; the rest start where C starts them.
function physMhm(damage) {
    return {
        damage,
        hitflags: M_ATTK_MISS,
        permdmg: 0,
        specialdmg: 0,
        done: false,
    };
}

test('mhitm_ad_phys silences only a held touch that costs nothing', async () => {
    // uhitm.c:4122-4123, `mattk->aatyp != AT_TUCH || mhm->damage != 0
    // || magr != u.ustuck`. A python's mattk[1] is {AT_TUCH, AD_PHYS, 0d0},
    // the attack C gives a snake for keeping hold of a hero it has already
    // grabbed, so all three terms go false together only for that snake while
    // it is u.ustuck. Every other combination prints and records the hit.
    const state = await meleeHero();
    const python = meleeAttacker(state, PM_PYTHON, 1, 0);
    const [bite, touch] = python.data.mattk;
    assert.equal(touch.aatyp, AT_TUCH, 'mattk[1] is the holding touch');
    assert.equal(touch.damn, 0, 'and it rolls no damage of its own');
    assert.equal(bite.aatyp, AT_BITE);

    const held = async (mattk, damage, ustuck) => {
        state.u.ustuck = ustuck;
        const { lines, env } = physEnv(state);
        const mhm = physMhm(damage);
        await mhitm_ad_phys(python, mattk, state.youmonst, mhm, state, env);
        state.u.ustuck = null;
        return { lines, hitflags: mhm.hitflags };
    };

    // All three false: C prints nothing and leaves hitflags at M_ATTK_MISS,
    // so the hero holds still with no line repeated each turn.
    assert.deepEqual(await held(touch, 0, python),
        { lines: [], hitflags: M_ATTK_MISS });
    // Each term on its own is enough to restore the line. Damage first,
    assert.deepEqual(await held(touch, 1, python),
        { lines: ['The python touches you!'], hitflags: M_ATTK_HIT });
    // then a touch from a snake that has not grabbed the hero,
    assert.deepEqual(await held(touch, 0, null),
        { lines: ['The python touches you!'], hitflags: M_ATTK_HIT });
    // then an attack that is not a touch at all, from the same held snake.
    assert.deepEqual(await held(bite, 0, python),
        { lines: ['The python bites!'], hitflags: M_ATTK_HIT });
});

test('mhitm_ad_phys adds an ordinary wielded weapon and not an empty hand',
    async () => {
    // uhitm.c:4041, `mattk->aatyp == AT_WEAP && otmp`. Both terms have to
    // hold: mattacku()'s AT_WEAP arm reaches hitmu() with MON_WEP(mtmp) still
    // null whenever mon_wield_item() found the monster nothing to wield, and
    // that blow takes the last arm with every bare-handed one.
    const state = await meleeHero();
    const goblin = meleeAttacker(state, PM_GOBLIN, 1, 0);
    const weap = goblin.data.mattk[0];
    assert.equal(weap.aatyp, AT_WEAP);
    const sword = mksobj(LONG_SWORD, false, false, { state });
    sword.nobj = null;

    const swing = async (mattk, wielded) => {
        goblin.mw = wielded;
        const { lines, env } = physEnv(state);
        // weapon.c dmgval() rolls a long sword's 1d8 against the human hero.
        // One makes the weapon's contribution distinguishable from the base
        // point without making the result depend on the global RNG.
        env.random = { rnd: () => 1 };
        const mhm = physMhm(1);
        const thrown = await mhitm_ad_phys(
            goblin, mattk, state.youmonst, mhm, state, env,
        ).then(() => null, (error) => error);
        goblin.mw = null;
        return { lines, hitflags: mhm.hitflags, reason: thrown?.reason };
    };

    assert.deepEqual(await swing(weap, sword),
        { lines: ['The goblin hits!'], hitflags: M_ATTK_HIT,
            reason: undefined });
    // hitmsg()'s default verb, :221-222, is what an AT_WEAP blow prints.
    assert.deepEqual(await swing(weap, null),
        { lines: ['The goblin hits!'], hitflags: M_ATTK_HIT, reason: undefined });
    // The weapon alone decides nothing: a species that claws while holding a
    // sword still claws, because C reads otmp only under AT_WEAP.
    const claw = { aatyp: AT_CLAW, adtyp: AD_PHYS, damn: 1, damd: 4 };
    assert.deepEqual(await swing(claw, sword),
        { lines: ['The goblin hits!'], hitflags: M_ATTK_HIT, reason: undefined });
});

test('mhitm_ad_phys keeps special and fatal weapon hits fail-closed',
    async () => {
    // uhitm.c:4041-4121 contains eight continuations beyond the ordinary
    // weapon path. This slice excludes each one, so every fixture changes
    // exactly the field that selects its continuation.
    const state = await meleeHero();
    const goblin = meleeAttacker(state, PM_GOBLIN, 1, 0);
    const weap = goblin.data.mattk[0];

    const stopped = async (weapon, configure = () => {}) => {
        const savedData = state.youmonst.data;
        const savedHp = state.u.uhp;
        configure();
        goblin.mw = weapon;
        const { env } = physEnv(state);
        // weapon.c dmgval() rolls one die for every weapon used below.
        env.random = { rnd: () => 1 };
        const error = await mhitm_ad_phys(
            goblin, weap, state.youmonst, physMhm(1), state, env,
        ).then(() => null, (caught) => caught);
        goblin.mw = null;
        goblin.minvent = null;
        state.youmonst.data = savedData;
        state.u.uhp = savedHp;
        return error?.reason;
    };

    const corpse = mksobj(CORPSE, false, false, { state });
    // Cockatrice flesh selects do_stone_u(), not ordinary weapon damage.
    corpse.corpsenm = PM_COCKATRICE;
    assert.equal(await stopped(corpse), 'a petrifying corpse weapon');

    const powered = mksobj(DAGGER, false, false, { state });
    assert.equal(await stopped(powered, () => {
        const gloves = mksobj(GAUNTLETS_OF_POWER, false, false, { state });
        // W_ARMG is the slot which which_armor() tests for the 3..6 bonus.
        gloves.owornmask = W_ARMG;
        goblin.minvent = gloves;
    }), 'gauntlets of power adding weapon damage');

    const artifact = mksobj(DAGGER, false, false, { state });
    // Any nonzero oartifact selects artifact_hit().
    artifact.oartifact = 1;
    assert.equal(await stopped(artifact), 'an artifact weapon hitting the hero');

    // objects.c declares the silver dagger separately from the iron dagger.
    // youprop.h Hate_silver also requires lycanthropy or a silver-hating hero
    // form, so an ordinary human stays on the normal weapon path.
    const silver = mksobj(SILVER_DAGGER, false, false, { state });
    assert.equal(await stopped(silver), undefined);
    assert.equal(await stopped(silver, () => {
        // LOW_PM is zero; any valid lycanthrope monster index makes the
        // youprop.h macro true before it consults the current form.
        state.u.ulycn = 0;
    }), 'a silver weapon hitting the hero');
    state.u.ulycn = NON_PM;

    const pudding = mksobj(DAGGER, false, false, { state });
    assert.equal(await stopped(pudding, () => {
        state.youmonst.data = state.mons[PM_BLACK_PUDDING];
    }), 'an iron or metal weapon splitting the hero');

    const rusty = mksobj(DAGGER, false, false, { state });
    assert.equal(await stopped(rusty, () => {
        state.youmonst.data = state.mons[PM_RUST_MONSTER];
    }), 'the hero eroding a monster weapon');

    const poisoned = mksobj(DAGGER, false, false, { state });
    poisoned.opoisoned = true;
    assert.equal(await stopped(poisoned), 'a poisoned weapon hitting the hero');

    const fatal = mksobj(DAGGER, false, false, { state });
    assert.equal(await stopped(fatal, () => {
        // mhitm_ad_phys() reports the hit before hitmu() applies armor and
        // half-damage mitigation; raw damage equal to HP is not itself a
        // special weapon continuation.
        state.u.uhp = 2;
    }), undefined);
});

test('mhitm_ad_phys stops on the two arms no ported path reaches',
    async () => {
    // uhitm.c:4023, `mattk->aatyp == AT_HUGS && !sticks(pd)`, and the uhitm
    // arm at :3988. mattacku() refuses AT_HUGS at js/mhitu.js:626 and
    // damageum() is unported, so these are fail-closed guards rather than
    // reachable stops. The mhitm arm at :4128 is no longer one of them:
    // mhitm.c mdamagem() reaches it on every landed monster-versus-monster
    // blow, and the rows at the end of this test cover it.
    const state = await meleeHero();
    const python = meleeAttacker(state, PM_PYTHON, 1, 0);
    const hugs = python.data.mattk[2];
    assert.equal(hugs.aatyp, AT_HUGS);
    // mondata.h sticks() is the second half of C's condition, and it reads the
    // defender. No hero this port can build wraps, holds or hugs, so the
    // condition rests on the aatyp alone.
    assert.equal(sticks(state.youmonst.data), false);

    const refused = async (magr, mattk, mdef) => {
        const { env } = physEnv(state);
        return mhitm_ad_phys(magr, mattk, mdef, physMhm(1), state, env)
            .then(() => null, (error) => error.reason);
    };

    assert.equal(await refused(python, hugs, state.youmonst),
        'a monster grabbing the hero');

    // The second term decides the arm on its own. A defender that sticks
    // sends C past :4023 to the hand-to-hand arm, which lands the blow and
    // prints hitmsg()'s default verb at :221-222; a bare
    // `mattk->aatyp == AT_HUGS` test would refuse there instead. No role can
    // carry an AT_HUGS attack, so the form is fabricated from the hero's own,
    // as the thick-hide and passiveum cases in this file do. mondata.h
    // sticks() answers on the attack list alone, so one slot is enough.
    const ordinary = state.youmonst.data;
    state.youmonst.data = {
        ...ordinary,
        mattk: [{ aatyp: AT_HUGS, adtyp: AD_PHYS, damn: 1, damd: 2 },
            ...ordinary.mattk.slice(1)],
    };
    assert.equal(sticks(state.youmonst.data), true);
    const grappled = physEnv(state);
    const grabbed = physMhm(1);
    await mhitm_ad_phys(
        python, hugs, state.youmonst, grabbed, state, grappled.env,
    );
    assert.deepEqual(grappled.lines, ['The python hits!']);
    assert.equal(grabbed.hitflags, M_ATTK_HIT);
    state.youmonst.data = ordinary;

    assert.equal(await refused(state.youmonst, hugs, python),
        "the hero's own physical attack");
});

// uhitm.c mhitm_ad_phys():4128-4200, the arm mhitm.c mdamagem() reaches. It
// adjusts the damage mdamagem() already rolled and prints nothing, because
// hitmm() has printed already.
test('mhitm_ad_phys adjusts one monster\'s blow on another in silence',
    async () => {
    const state = await meleeHero();
    const python = meleeAttacker(state, PM_PYTHON, 1, 0);
    const rat = meleeAttacker(state, PM_SEWER_RAT, 0, 1);
    const bite = python.data.mattk[0];
    assert.equal(bite.aatyp, AT_BITE);
    const refused = async (magr, mattk, mdef) => {
        const { env } = physEnv(state);
        return mhitm_ad_phys(magr, mattk, mdef, physMhm(1), state, env)
            .then(() => null, (error) => error.reason);
    };

    // The ordinary case: no weapon, no shade, no kick, so C falls off the end
    // of the chain and leaves mdamagem()'s roll untouched.
    const plain = physEnv(state);
    const kept = physMhm(5);
    await mhitm_ad_phys(python, bite, rat, kept, state, plain.env);
    assert.deepEqual(plain.lines, []);
    assert.equal(kept.damage, 5);
    assert.equal(kept.hitflags, M_ATTK_MISS);

    // uhitm.c:4138-4142. A kick against a thick-skinned defender costs it
    // nothing. A python has no kick, so the attack record is fabricated the
    // way this file's other structural cases are.
    const kick = { aatyp: AT_KICK, adtyp: AD_PHYS, damn: 1, damd: 4 };
    const dragon = meleeAttacker(state, PM_BABY_GRAY_DRAGON, -1, 0);
    assert.equal(thick_skinned(dragon.data), true);
    const kicked = physMhm(5);
    await mhitm_ad_phys(python, kick, dragon, kicked, state, physEnv(state).env);
    assert.equal(kicked.damage, 0);
    // The same kick against a defender without a thick hide keeps its damage,
    // so the arm rests on thick_skinned() rather than on the aatyp.
    const soft = physMhm(5);
    await mhitm_ad_phys(python, kick, rat, soft, state, physEnv(state).env);
    assert.equal(soft.damage, 5);

    // uhitm.c:4143-4188. A wielded weapon is this arm's fail-closed edge, and
    // only AT_WEAP or AT_CLAW reads one: mhitm.c mattackm() refuses AT_WEAP
    // outright, so an armed claw is the one way in.
    const armed = meleeAttacker(state, PM_GOBLIN, 0, -1);
    armed.mw = mksobj(ORCISH_DAGGER, false, false, { state });
    const clawed = { aatyp: AT_CLAW, adtyp: AD_PHYS, damn: 1, damd: 3 };
    assert.equal(
        await refused(armed, clawed, rat),
        "a monster's wielded weapon landing on another",
    );
    // The same attacker biting rather than clawing drops the weapon from the
    // decision and lands an ordinary blow.
    const bit = physMhm(4);
    await mhitm_ad_phys(armed, bite, rat, bit, state, physEnv(state).env);
    assert.equal(bit.damage, 4);

    // uhitm.c:4189-4198. A purple worm's bite is held one point short of
    // killing a shrieker, so that its engulf attack can swallow the corpse.
    // Both species have to match, and the target has to be worth sparing.
    const worm = meleeAttacker(state, PM_PURPLE_WORM, 1, 1);
    const shrieker = meleeAttacker(state, PM_SHRIEKER, -1, 1,
                                   { mhp: 4, mhpmax: 4 });
    const spared = physMhm(9);
    await mhitm_ad_phys(worm, bite, shrieker, spared, state,
                        physEnv(state).env);
    assert.equal(spared.damage, 3);
    // Damage below the target's hit points is left alone, which is the first
    // half of C's `mhm->damage >= mdef->mhp` test. The shrieker is raised to
    // six hit points first, so that the clamp's own answer, mhp - 1 = 5,
    // differs from the damage the guard preserves; at four they agree and the
    // row cannot fail.
    shrieker.mhp = 6;
    const light = physMhm(3);
    await mhitm_ad_phys(worm, bite, shrieker, light, state,
                        physEnv(state).env);
    assert.equal(light.damage, 3);
    shrieker.mhp = 4;
    // Exactly the target's hit points is still clamped.
    const exact = physMhm(4);
    await mhitm_ad_phys(worm, bite, shrieker, exact, state,
                        physEnv(state).env);
    assert.equal(exact.damage, 3);
    // A shrieker already down to one hit point is not worth sparing.
    shrieker.mhp = 1;
    const doomed = physMhm(9);
    await mhitm_ad_phys(worm, bite, shrieker, doomed, state,
                        physEnv(state).env);
    assert.equal(doomed.damage, 9);
    // The same blow from anything else, or against anything else, keeps its
    // damage, so both halves of the species test are load-bearing.
    shrieker.mhp = 4;
    const other = physMhm(9);
    await mhitm_ad_phys(python, bite, shrieker, other, state,
                        physEnv(state).env);
    assert.equal(other.damage, 9);
    const elsewhere = physMhm(9);
    rat.mhp = 4;
    await mhitm_ad_phys(worm, bite, rat, elsewhere, state, physEnv(state).env);
    assert.equal(elsewhere.damage, 9);
});

test('mdamageu stops at the hero\'s death and not one hit point above it',
    async () => {
    // mhitu.c:1922-1925. done_in_by() sets up the killer and calls done();
    // done() calls bot() on the module-level game and paranoid_query() reads
    // input, so it cannot run on the planning pass's clone. The planning pass
    // raises its internal death signal here, carrying the attacker identity.
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    state.u.uhp = 2;
    const survived = meleeEnv(state, [1], { planning: true });
    assert.equal(await mattacku(bug, survived.env), false);
    assert.equal(state.u.uhp, 1);

    await assert.rejects(
        () => mattacku(bug, meleeEnv(state, [1], { planning: true }).env),
        (error) => error instanceof MonsterDeathPlanningError
            && error.message === 'the hero dying of a monster attack'
            && error.monsterId === bug.m_id,
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

test('planning pass simulates wizard-mode survival instead of throwing',
    async () => {
    // When the hero is in wizard or discover mode and u.uhp drops below 1,
    // done() asks "Die? [yn]" and the player answers "n", then savelife()
    // restores the hero. The planning pass cannot run done() (it needs the
    // live terminal), so it simulates the survival inline: umortality
    // increments, HP is restored from the savelife() constitution formula,
    // and the turn continues.
    //
    // C ref: end.c done():1071, :1077, savelife():719-722.
    const state = await meleeHero();
    const bug = meleeAttacker(state, PM_GRID_BUG, 1, 0);
    state.u.uhp = 1;
    // Set uhpmax above givehp so the formula result is the binding
    // constraint, not uhpmax itself.
    state.u.uhpmax = 200;

    // Wizard mode: the planning pass should survive, not throw.
    state.wizard = true;
    const before = state.u.umortality ?? 0;
    const wizEnv = meleeEnv(state, [1], { planning: true });
    assert.equal(await mattacku(bug, wizEnv.env), false);
    // savelife() formula: givehp = 50 + 10 * floor(CON / 2). This
    // Valkyrie's ACURR(A_CON) is 18, giving givehp = 50 + 90 = 140.
    // uhpmax (200) > givehp (140), so uhp = givehp = 140.
    assert.equal(state.u.uhp, 140, 'HP restored to givehp');
    assert.equal(state.u.umortality, before + 1, 'mortality incremented');
    assert.equal(state.context.move, 0, 'context.move cleared');
    assert.equal(state.multi, -1, 'multi set to -1');

    // Explore mode: same survival path. uhpmax is still 200 from above.
    state.wizard = false;
    state.discover = true;
    state.u.uhp = 1;
    const exploreEnv = meleeEnv(state, [1], { planning: true });
    assert.equal(await mattacku(bug, exploreEnv.env), false);
    assert.equal(state.u.uhp, 140, 'explore mode also restores HP to givehp');
    assert.equal(state.u.umortality, before + 2, 'mortality incremented again');

    // Non-wizard, non-discover: the internal planning death signal is correct.
    state.discover = false;
    state.u.uhp = 1;
    await assert.rejects(
        () => mattacku(bug, meleeEnv(state, [1], { planning: true }).env),
        (error) => error instanceof MonsterDeathPlanningError
            && error.message === 'the hero dying of a monster attack'
            && error.monsterId === bug.m_id,
    );
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

test('a landed blow and a missed one each end a multi-turn action',
    async () => {
    // allmain.c stop_occupation() (683-696), which mhitu.c reaches from
    // hitmu():1265 and from missmu():99. It prints "You stop <occtxt>.",
    // clears go.occupation, and discards a canned command sequence at
    // allmain.c:695, outside both of its arms.
    //
    // A helpless hero is what makes the last of those attributable to these
    // two calls rather than to the preamble: mattacku() runs nomul(0) for an
    // adjacent attacker, and nomul() clears CQ_CANNED itself, but hack.c:4161
    // returns at `gm.multi < nval` before reaching that line.
    const state = await meleeHero();
    const rat = meleeAttacker(state, PM_SEWER_RAT, 1, 0);
    // cmd.c set_occupation() owns the three go fields. `() => 1` is an
    // occupation that answers "still busy"; any callback but eat.c eatfood()
    // sends stop_occupation() down its "You stop" arm instead of
    // maybe_finished_meal()'s finished-meal one, and eatfood() is the port's
    // only installer, so the callback is fabricated the way
    // scripts/allmain-turn.test.mjs fabricates one.
    const interrupted = () => {
        set_occupation(() => 1, 'waiting', 0, state);
        cmdq_add_ec(CQ_CANNED, extcmdRow('fire'), state);
        state.multi = -3;
        state.disp.botl = false;
    };

    // The differential is this Valkyrie's AC 6, plus 10, plus a level-zero
    // rat, plus the 4 a helpless hero gives away at mhitu.c:711-712: 20. So a
    // roll of 19 is the hit side of `tmp > j` and 20 is the miss side.
    interrupted();
    const landed = meleeEnv(state, [19]);
    assert.equal(await mattacku(rat, landed.env), false);
    assert.deepEqual(landed.lines,
        ['The sewer rat bites!', 'You stop waiting.']);
    assert.equal(state.go.occupation, null);
    assert.equal(cmdq_peek(CQ_CANNED, state), null);

    interrupted();
    const missed = meleeEnv(state, [20]);
    assert.equal(await mattacku(rat, missed.env), false);
    assert.deepEqual(missed.lines,
        ['The sewer rat just misses!', 'You stop waiting.']);
    assert.equal(state.go.occupation, null);
    assert.equal(cmdq_peek(CQ_CANNED, state), null);
    // mdamageu():1908 raises disp.botl on the landed side, so only the miss
    // leaves stop_occupation() as its one writer.
    assert.equal(state.disp.botl, true);
    state.multi = 0;
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

// mhitu.c ranged_attk_available() reads only mtmp->data->mattk[] and
// mtmp->seen_resistance, so the fixture is the real permonst row plus that one
// field. The species below are chosen for the shape of their attack lists,
// read from monsters.h.
function rangedAttacker(mnum, seen_resistance = 0) {
    const state = {};
    monst_globals_init(state);
    return { data: state.mons[mnum], seen_resistance };
}

test('ranged_attk_available finds the distance attacks C tests for', () => {
    const refuse = {
        rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
    };

    // A jackal's only attack is AT_BITE, which monattk.h DISTANCE_ATTK_TYPE()
    // rejects, so the loop ends without calling get_atkdam_type() at all.
    assert.equal(
        ranged_attk_available(rangedAttacker(PM_JACKAL), { random: refuse }),
        false,
    );

    // A cobra spits AD_BLND, which cvt_adtyp_to_mseenres() maps to
    // M_SEEN_NOTHING. C's test is `m_seenres(...) == 0`, so an unmapped damage
    // type can never be declined: the mask is zero and the AND is zero.
    assert.equal(
        ranged_attk_available(rangedAttacker(PM_COBRA), { random: refuse }),
        true,
    );

    // A black naga spits AD_ACID. Having watched the hero resist acid is what
    // makes it decline, and that is the only difference between these two.
    assert.equal(
        ranged_attk_available(rangedAttacker(PM_BLACK_NAGA), {
            random: refuse,
        }),
        true,
    );
    assert.equal(
        ranged_attk_available(rangedAttacker(PM_BLACK_NAGA, M_SEEN_ACID), {
            random: refuse,
        }),
        false,
    );
});

test('ranged_attk_available rolls a random breath and keeps looking', () => {
    // The Chromatic Dragon is the one species whose list holds two distance
    // attacks with AT_BREA/AD_RBRE first (monsters.h, Chromatic Dragon), so it
    // is the only fixture that shows a declined slot leaving the loop running.
    const bounds = [];
    const random = {
        rn2: (bound) => {
            bounds.push(bound);
            return 1; // AD_FIRE, rnd_breath_typ[1]
        },
    };

    // The roll answers AD_FIRE and the dragon has watched the hero resist
    // fire, so slot 0 is declined. Slot 1 is AT_MAGC/AD_SPEL, whose
    // M_SEEN_NOTHING mask cannot be declined, so the answer is still TRUE --
    // reached from the second slot, after the first slot's draw.
    assert.equal(
        ranged_attk_available(
            rangedAttacker(PM_CHROMATIC_DRAGON, M_SEEN_FIRE),
            { random },
        ),
        true,
    );
    assert.deepEqual(bounds, [8]);

    // Without that resistance the first slot answers on its own, and the draw
    // still happens: C rolls the breath before it tests the resistance.
    bounds.length = 0;
    assert.equal(
        ranged_attk_available(rangedAttacker(PM_CHROMATIC_DRAGON), { random }),
        true,
    );
    assert.deepEqual(bounds, [8]);
});
