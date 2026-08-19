// Pin mon.c restrap(), the function that lets an unwatched M1_HIDE monster
// hide again, and the recipe that records it against the C reference program.
//
// restrap() produces no message and repaints nothing: cansee() being false is
// a precondition of every success, so a reviewer looking for a screen will not
// find one. What it does produce is a single rn2(3) at the fourth position of
// an eight-term guard, and every case below therefore asserts on the draws the
// call spends as well as on its answer. A port that rolled before it tested
// cansee() would pass every screen comparison in the repository and fail only
// these.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BEAR_TRAP,
    CORR,
    DETECT_MONSTERS,
    IN_SIGHT,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    NON_PM,
    PIT,
    PROT_FROM_SHAPE_CHANGERS,
    ROOM,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { set_mimic_sym } from '../js/makemon_create.js';
import { restrap } from '../js/mon.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import {
    PM_ROCK_PIERCER,
    PM_SMALL_MIMIC,
    PM_TRAPPER,
} from '../js/monsters.js';
import { BOULDER, GOLD_PIECE, STRANGE_OBJECT } from '../js/objects.js';
import { preflightSimpleMonsterActions } from '../js/unported_monster_actions.js';
import { block_point, does_block } from '../js/vision.js';
import { freezeLiveState } from './planning-isolation-test-support.mjs';
import { loadCostlyMimicRedisguiseRecipe } from './run-apply-stethoscope.mjs';
import { GENESIS_KEY, loadMonsterHidingRecipe } from './run-monster-hiding.mjs';

// The seed scripts/run-monster-hiding.mjs records its watched segment on,
// played without that matrix's playmode:debug so the fixture is an ordinary
// game. Its hero stands at the west end of a room seven squares wide, which
// leaves both neighbouring squares and squares outside m_next2u()'s reach.
const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Hidr,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

// Fresh squares are handed out in order, so two fixtures in one test never
// land on top of each other -- place_monster() would overwrite the first and
// the second case would answer for a monster that is no longer on the map.
let nextNear = 0;
let nextFar = 0;

async function hero() {
    await runSegment({
        seed: 9130009, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.level.traps = [];
    game.u.ustuck = null;
    nextNear = 0;
    nextFar = 0;
    return game;
}

// hack.h distu() is a squared distance, so these three offsets answer 1, 1 and
// 2, and m_next2u()'s `<= 2` accepts all of them. The hero stands against the
// room's west wall, so every offset points east or north of her.
const NEAR_OFFSETS = [[1, 0], [0, -1], [1, -1]];

function near() {
    const [dx, dy] = NEAR_OFFSETS[nextNear++];
    return [game.u.ux + dx, game.u.uy + dy];
}

// Two columns east and onward: distu() answers 4 or more, so m_next2u() is
// false for every square this hands out.
function far() {
    return [game.u.ux + 2 + nextFar++, game.u.uy];
}

let nextFixtureId = 700;

// A hider standing on <x,y>, shaped the way makemon() leaves one. The square
// is forced out of the hero's sight unless a case asks otherwise, because
// cansee() is restrap()'s third guard term and the starting room is lit.
function hiderAt(pmidx, [x, y], overrides = {}) {
    const species = game.mons[pmidx];
    const mon = newMonster({
        cham: NON_PM,
        m_lev: Math.max(1, species.mlevel),
        m_id: ++nextFixtureId,
        mhp: 20,
        mhpmax: 20,
        mcanmove: 1,
        mcansee: true,
        data: species,
        mnum: pmidx,
        mx: x,
        my: y,
        ...overrides,
    });
    place_monster(mon, x, y, game);
    mon.nmon = game.level.monlist;
    game.level.monlist = mon;
    game.viz_array[y][x] &= ~IN_SIGHT;
    // ROOM is what restrap()'s second arm requires; the starting room already
    // supplies it, and asserting it here keeps a case that silently moved onto
    // another terrain from passing for the wrong reason.
    assert.equal(game.level.at(x, y).typ, ROOM);
    return mon;
}

// Every call goes through this, so a case can never forget to count draws.
// `rolls` is consumed in order; an extra draw runs off the end and fails
// rather than returning a stale value.
function listenToRestrap(monster, rolls = []) {
    const bounds = [];
    const answer = restrap(monster, {
        state: game,
        random: {
            rn2(bound) {
                bounds.push(bound);
                assert.ok(bounds.length <= rolls.length,
                    `restrap drew rn2(${bound}) more often than expected`);
                return rolls[bounds.length - 1];
            },
        },
        setMimicSym: () => assert.fail('set_mimic_sym() is unported'),
    });
    return { answer, bounds };
}

test('restrap answers the first four guard terms without drawing', async () => {
    await hero();

    // mon.c:4666 term 1, `mtmp->mcan`. A cancelled hider gives up before
    // anything else is read, so no rn2(3) is spent on it.
    const cancelled = hiderAt(PM_ROCK_PIERCER, far(), { mcan: 1 });
    assert.deepEqual(listenToRestrap(cancelled), { answer: false, bounds: [] });

    // Term 2, `M_AP_TYPE(mtmp)`. This is the term seed5002's small mimic stops
    // at: makemon.c:1305 gave it a disguise, so it never reaches the roll.
    const disguised = hiderAt(PM_SMALL_MIMIC, far(),
        { m_ap_type: M_AP_OBJECT });
    assert.deepEqual(listenToRestrap(disguised), { answer: false, bounds: [] });

    // Term 3, `cansee(mtmp->mx, mtmp->my)`. A watched hider stays where it is
    // and, because the roll sits below this term, spends nothing doing so.
    // This is the case that pins the draw's position in the chain.
    const [wx, wy] = far();
    const watched = hiderAt(PM_ROCK_PIERCER, [wx, wy]);
    game.viz_array[wy][wx] |= IN_SIGHT;
    assert.deepEqual(listenToRestrap(watched), { answer: false, bounds: [] });

    // Term 4, the roll itself: two of its three outcomes refuse the hide, and
    // the bound is 3 rather than any other number.
    const unlucky = hiderAt(PM_ROCK_PIERCER, far());
    assert.deepEqual(listenToRestrap(unlucky, [1]),
        { answer: false, bounds: [3] });
});

test('restrap answers the four guard terms below the roll', async () => {
    await hero();

    // mon.c:4667 term 5, `mtmp == u.ustuck`. The roll has already happened, so
    // the held monster costs a draw and hides anyway not at all.
    const held = hiderAt(PM_ROCK_PIERCER, near());
    game.u.ustuck = held;
    assert.deepEqual(listenToRestrap(held, [0]),
        { answer: false, bounds: [3] });
    game.u.ustuck = null;

    // Terms 6, mon.c:4670-4672: "can't hide while trapped except in pits". A
    // bear trap holds the monster where it is; a pit does not, which is the
    // whole point of the is_pit() operand.
    const [bx, by] = far();
    const bearTrapped = hiderAt(PM_TRAPPER, [bx, by], { mtrapped: 1 });
    game.level.traps = [{ tx: bx, ty: by, ttyp: BEAR_TRAP, tseen: false }];
    assert.deepEqual(listenToRestrap(bearTrapped, [0]),
        { answer: false, bounds: [3] });

    game.level.traps = [{ tx: bx, ty: by, ttyp: PIT, tseen: false }];
    assert.deepEqual(listenToRestrap(bearTrapped, [0]),
        { answer: true, bounds: [3] });
    assert.equal(bearTrapped.mundetected, 1);
    game.level.traps = [];

    // Term 7, mon.c:4674: "can't hide on ceiling if there isn't one". D:1 has
    // one, so a rock piercer -- which mondata.h ceiling_hider() accepts on
    // M1_CLING -- hides rather than being turned away by this term.
    const clinger = hiderAt(PM_ROCK_PIERCER, far());
    assert.deepEqual(listenToRestrap(clinger, [0]),
        { answer: true, bounds: [3] });
    assert.equal(clinger.mundetected, 1);

    // Term 8, mon.c:4676: "won't hide when adjacent to hero". Both operands
    // are needed. A trapper beside a hero who senses it stays visible; the
    // same trapper five squares away hides, and so does one beside a hero who
    // senses nothing.
    const [dx, dy] = near();
    const sensed = hiderAt(PM_TRAPPER, [dx, dy]);
    game.u.uprops[DETECT_MONSTERS] = { intrinsic: 1 };
    assert.deepEqual(listenToRestrap(sensed, [0]),
        { answer: false, bounds: [3] });

    const distant = hiderAt(PM_TRAPPER, far());
    assert.deepEqual(listenToRestrap(distant, [0]),
        { answer: true, bounds: [3] });
    game.u.uprops[DETECT_MONSTERS] = undefined;

    const unsensed = hiderAt(PM_TRAPPER, near());
    assert.deepEqual(listenToRestrap(unsensed, [0]),
        { answer: true, bounds: [3] });
});

test('restrap hides a floor monster and leaves a corridor one alone',
    async () => {
        await hero();

        // mon.c:4687-4690, the ROOM arm. The success is silent: it writes
        // mundetected and calls no display function, so this field is the only
        // observable the port produces.
        const inRoom = hiderAt(PM_TRAPPER, far());
        assert.ok(!inRoom.mundetected);
        assert.deepEqual(listenToRestrap(inRoom, [0]),
            { answer: true, bounds: [3] });
        assert.equal(inRoom.mundetected, 1);

        // mon.c:4692, the fall-through. A hider that is neither a mimic nor
        // standing on ROOM passes the whole guard, spends the roll and hides
        // nowhere. The square is rewritten rather than searched for, because
        // which corridor square the level generated is not what this measures.
        const [cx, cy] = far();
        const inCorridor = hiderAt(PM_TRAPPER, [cx, cy]);
        game.level.at(cx, cy).typ = CORR;
        assert.deepEqual(listenToRestrap(inCorridor, [0]),
            { answer: false, bounds: [3] });
        assert.ok(!inCorridor.mundetected);
        game.level.at(cx, cy).typ = ROOM;
    });

test('restrap re-disguises only a mimic that is awake and undisguised',
    async () => {
        await hero();

        // mon.c:4678-4685. "The mimic needs to be awake to disguise itself as
        // something else", and C tests two fields for that: a sleeping mimic
        // and a frozen one both return FALSE with the roll already spent.
        const asleep = hiderAt(PM_SMALL_MIMIC, far(), { msleeping: 1 });
        assert.deepEqual(listenToRestrap(asleep, [0]),
            { answer: false, bounds: [3] });
        assert.ok(!asleep.mundetected);

        const frozen = hiderAt(PM_SMALL_MIMIC, far(), { mfrozen: 4 });
        assert.deepEqual(listenToRestrap(frozen, [0]),
            { answer: false, bounds: [3] });
        assert.ok(!frozen.mundetected);

        // A nonzero rn2(3) result stops before set_mimic_sym(), even for the
        // exact monster type which owns that success arm.
        const unlucky = hiderAt(PM_SMALL_MIMIC, far());
        assert.deepEqual(listenToRestrap(unlucky, [2]),
            { answer: false, bounds: [3] });
        assert.equal(unlucky.m_ap_type & M_AP_TYPMASK, 0);

        // mon.c:4684-4685. The zero result reaches makemon.c
        // set_mimic_sym(). Selecting S_MIMIC_DEF needs no temporary object,
        // so these are exactly the two source draws and STRANGE_OBJECT is the
        // resulting disguise. The mimic arm returns before the ROOM arm, so
        // mundetected stays clear even on a ROOM square.
        const awake = hiderAt(PM_SMALL_MIMIC, far());
        const rolls = [0, 15];
        const bounds = [];
        const answer = restrap(awake, {
            state: game,
            random: {
                rn2(bound) {
                    bounds.push(bound);
                    assert.ok(bounds.length <= rolls.length);
                    return rolls[bounds.length - 1];
                },
            },
            setMimicSym: set_mimic_sym,
        });
        assert.equal(answer, true);
        assert.deepEqual(bounds, [3, 17]);
        assert.equal(awake.m_ap_type & M_AP_TYPMASK, M_AP_OBJECT);
        assert.equal(awake.mappearance, STRANGE_OBJECT);
        assert.ok(!awake.mundetected);

        // makemon.c:2402 returns before disguise selection when the hero has
        // Protection_from_shape_changers. restrap() has already won its own
        // roll and still returns TRUE, so the mimic forfeits the action while
        // remaining revealed and spends no rn2(17).
        game.u.uprops[PROT_FROM_SHAPE_CHANGERS] = { intrinsic: 1 };
        const protectedMimic = hiderAt(PM_SMALL_MIMIC, far());
        const protectedBounds = [];
        assert.equal(restrap(protectedMimic, {
            state: game,
            random: {
                rn2(bound) {
                    protectedBounds.push(bound);
                    return 0;
                },
            },
            setMimicSym: set_mimic_sym,
        }), true);
        assert.deepEqual(protectedBounds, [3]);
        assert.equal(protectedMimic.m_ap_type & M_AP_TYPMASK, 0);
        game.u.uprops[PROT_FROM_SHAPE_CHANGERS] = undefined;
    });

test('a blocking mimic disguise updates vision after its final draw',
    async () => {
        await hero();
        const awake = hiderAt(PM_SMALL_MIMIC, far());
        assert.equal(does_block(awake.mx, awake.my, null, game), false);

        const draws = [];
        const visionCalls = [];
        const random = {
            d: () => assert.fail('boulder disguise drew d()'),
            rn1: () => assert.fail('boulder disguise drew rn1()'),
            rn2(bound) {
                draws.push(`rn2(${bound})`);
                if (bound === 3) return 0;
                if (bound === 17) return 12; // ROCK_CLASS in makemon.c syms[]
                return assert.fail(`unexpected rn2(${bound})`);
            },
            rnd(bound) {
                draws.push(`rnd(${bound})`);
                return 1;
            },
            rne: () => assert.fail('boulder disguise drew rne()'),
        };
        const answer = restrap(awake, {
            state: game,
            random,
            setMimicSym: (mimic, env) => set_mimic_sym(mimic, {
                ...env,
                hooks: {
                    doesBlock(x, y, location, normalized) {
                        visionCalls.push('doesBlock');
                        assert.deepEqual(draws, [
                            'rn2(3)',
                            'rn2(17)',
                            'rnd(1000)',
                            'rnd(2)',
                        ]);
                        assert.equal(mimic.mappearance, BOULDER);
                        return does_block(
                            x,
                            y,
                            location,
                            normalized.state,
                        );
                    },
                    blockPoint(x, y, normalized) {
                        visionCalls.push('blockPoint');
                        block_point(x, y, normalized.state);
                    },
                },
            }),
        });

        assert.equal(answer, true);
        assert.equal(awake.mappearance, BOULDER);
        assert.equal(does_block(awake.mx, awake.my, null, game), true);
        assert.deepEqual(visionCalls, ['doesBlock', 'blockPoint']);
    });

test('a costly listen re-disguises its revealed mimic through the sentinel',
    async () => {
        const [input] = loadCostlyMimicRedisguiseRecipe().segments;
        const replay = await runSegment(input);
        const mimic = m_at(game.u.ux, game.u.uy + 1, game);

        // Freshly recorded from the C reference for this recipe. The extra 27
        // calls begin with restrap()'s rn2(3), then run set_mimic_sym()'s
        // ordinary-room selection. Matching through the final wait also shows
        // that the selected disguise made the monster forfeit its action.
        assert.equal(replay.getRngLog().length, 3138);
        assert.equal(replay.getScreens().length, 25);
        assert.equal(replay.getCursors().length, 25);
        assert.equal(game.nhDisplay.inputQueueLength, 0);
        assert.equal(mimic.mnum, PM_SMALL_MIMIC);
        assert.equal(mimic.m_ap_type & M_AP_TYPMASK, M_AP_OBJECT);
    });

test('the costly-listen planning disguise changes only the cloned monster',
    async () => {
        const [recorded] = loadCostlyMimicRedisguiseRecipe().segments;
        // Remove the message dismissal and wait which follow the second
        // listen. The live game now holds an undisguised mimic immediately
        // before moveloop_core() plans the costly turn.
        assert.ok(recorded.moves.endsWith(' .'));
        const input = { ...recorded, moves: recorded.moves.slice(0, -2) };
        await runSegment(input);
        const mimic = m_at(game.u.ux, game.u.uy + 1, game);
        assert.equal(game.context.move, 1);
        assert.equal(mimic.m_ap_type & M_AP_TYPMASK, 0);

        const coreBefore = structuredClone(game.coreCtx);
        const guard = freezeLiveState(game);
        let plannedAppearance = null;
        let plannedRngSentinel = null;
        await preflightSimpleMonsterActions(game, {
            // The callback runs after the cloned monster scans and receives
            // their cloned ISAAC stream. Returning true stops before a second
            // allocation round, which is outside this test's boundary.
            advanceRound(planned, planningRandom) {
                const plannedMimic = m_at(
                    planned.u.ux,
                    planned.u.uy + 1,
                    planned,
                );
                plannedAppearance = {
                    m_ap_type: plannedMimic.m_ap_type & M_AP_TYPMASK,
                    mappearance: plannedMimic.mappearance,
                };
                plannedRngSentinel = [
                    planningRandom.rn2(1000000),
                    planningRandom.rn2(1000000),
                    planningRandom.rn2(1000000),
                ];
                return true;
            },
        });
        guard.assertNoLeak(assert);

        // makemon.c set_mimic_sym()'s object-at-square arm gives this cloned
        // mimic the floor gold piece's disguise. The fixed-seed sentinel pins
        // the cloned stream after the whole planned scan; the live stream
        // remains at its entry state.
        assert.deepEqual(plannedAppearance, {
            m_ap_type: M_AP_OBJECT,
            mappearance: GOLD_PIECE,
        });
        assert.deepEqual(plannedRngSentinel, [590788, 802859, 924435]);
        assert.equal(mimic.m_ap_type & M_AP_TYPMASK, 0);
        assert.deepEqual(game.coreCtx, coreBefore);
    });

test('the monster hiding matrix carries replay inputs only', () => {
    const recipe = loadMonsterHidingRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // Every segment creates its hider with C('g'), which cmd.c
    // can_do_extcmd() admits only in debug mode, so a segment that lost the
    // playmode option would record an ordinary game and create nothing.
    assert.ok(recipe.segments.every(
        ({ moves, nethackrc }) => moves.includes(GENESIS_KEY)
            && nethackrc.includes('playmode:debug'),
    ));
    // The seed list is the tripwire for a silent re-recording. The first is a
    // lit starting room and the other two are one unlit room, played twice.
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [9130009, 9130095, 9130095],
    );
});
