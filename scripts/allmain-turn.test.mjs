import assert from 'node:assert/strict';
import test from 'node:test';

import {
    finishHeroTimeEffects,
    interrupt_multi,
    maybe_generate_rnd_mon,
    maybeRunClairvoyance,
    maybeWipeHeroEngraving,
    moveloop_core,
    UnsupportedTurnBoundaryError,
    u_calc_moveamt,
} from '../js/allmain.js';
import {
    CLAIRVOYANT,
    COLNO,
    DUST,
    EXT_ENCUMBER,
    FAST,
    FLYING,
    FROMOUTSIDE,
    HOLE,
    HUNGER,
    HVY_ENCUMBER,
    HUNGRY,
    INTRINSIC,
    LEVITATION,
    M_AP_MONSTER,
    MOD_ENCUMBER,
    NORMAL_SPEED,
    NO_SPELL,
    OVERLOADED,
    PIT,
    PROT_FROM_SHAPE_CHANGERS,
    SEARCHING,
    DOOR,
    SLT_ENCUMBER,
    SV0,
    WEAK,
    W_ARMF,
    W_RINGL,
} from '../js/const.js';
import { make_engr_at } from '../js/engrave.js';
import { game } from '../js/gstate.js';
import {
    near_capacity,
    projected_capacity,
    weight_cap,
} from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { getRngLog } from '../js/rng.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    AT_HUGS,
    M1_CLING,
    M1_HIDE,
    PM_GOBLIN,
    PM_KITTEN,
    PM_LICHEN,
    PM_TENGU,
} from '../js/monsters.js';
import { SACK, TOOL_CLASS } from '../js/objects.js';
import { create_region } from '../js/region.js';
import { clearTtyMessageWindow, ttyPline } from '../js/tty_message.js';
import { cansee, vision_recalc } from '../js/vision.js';
import {
    loadFirstCompleteTurnRecipe,
} from './run-first-complete-turn.mjs';
import {
    chunkRecipe,
    RECORDER_SEGMENT_LIMIT,
} from './run-first-command-closure.mjs';
import { completeSecondTurnSnapshot } from './second-turn-snapshot.mjs';
import { freezeLiveState } from './planning-isolation-test-support.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function movementState(speed = 12, umovement = 0) {
    const uprops = [];
    uprops[FAST] = { intrinsic: 0, extrinsic: 0 };
    return {
        u: { umovement, umoved: false, usteed: null, uprops },
        youmonst: { data: { mmove: speed } },
        context: {},
    };
}

function randomMonsterTurnState({ demigod = false, depth = 1 } = {}) {
    return {
        dungeons: [{ depth_start: 1 }],
        stronghold_level: { dnum: 0, dlevel: 10 },
        u: {
            uevent: { udemigod: demigod },
            uz: { dnum: 0, dlevel: depth },
        },
    };
}

function draws(results) {
    const bounds = [];
    return {
        random(bound) {
            bounds.push(bound);
            assert.ok(results.length, `unexpected rn2(${bound})`);
            return results.shift();
        },
        assertBounds(expected) {
            assert.deepEqual(bounds, expected);
            assert.deepEqual(results, []);
        },
    };
}

function engravingTurnState(dexterity = 13) {
    const uprops = [];
    uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[FLYING] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return {
        u: {
            ux: 23,
            uy: 9,
            // Index 3 is Dexterity; the other attributes are inert fixtures.
            acurr: { a: [10, 10, 10, dexterity, 10, 10] },
            abon: [0, 0, 0, 0, 0, 0],
            atemp: [0, 0, 0, 0, 0, 0],
            uprops,
            uswallow: false,
            ustuck: null,
            usteed: null,
            uundetected: false,
            uz: { dnum: 0, dlevel: 1 },
            utrap: 0,
            utraptype: 0,
        },
        youmonst: {
            data: { mflags1: 0, msize: 2, mlet: 0, mattk: [] },
        },
        level: { at: () => null, traps: [] },
        head_engr: null,
    };
}

function clairvoyanceTurnState({ moves = 20, seerTurn = 20 } = {}) {
    const uprops = [];
    uprops[CLAIRVOYANT] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return {
        moves,
        hero_seq: moves * 8,
        context: { seer_turn: seerTurn },
        astral_level: { dnum: 5, dlevel: 1 },
        u: {
            uz: { dnum: 0, dlevel: 1 },
            uhave: { amulet: false },
            uprops,
        },
    };
}

function turnDraws(events) {
    const remaining = [...events];
    const take = (kind, bound) => {
        const expected = remaining.shift();
        assert.ok(expected, `unexpected ${kind}(${bound})`);
        assert.deepEqual(expected.slice(0, 2), [kind, bound]);
        if (kind === 'rn2')
            assert.ok(expected[2] >= 0 && expected[2] < bound);
        else
            assert.ok(expected[2] >= 1 && expected[2] <= bound);
        return expected[2];
    };
    return {
        random: {
            rn2: (bound) => take('rn2', bound),
            rnd: (bound) => take('rnd', bound),
        },
        done() {
            assert.deepEqual(remaining, []);
        },
    };
}

test('u_calc_moveamt distinguishes intrinsic and very fast movement', () => {
    const intrinsic = movementState();
    intrinsic.u.uprops[FAST].intrinsic = INTRINSIC;
    let script = draws([0]);
    u_calc_moveamt(0, intrinsic, script.random);
    assert.equal(intrinsic.u.umovement, 24);
    script.assertBounds([3]);

    const ordinaryIntrinsicTurn = movementState();
    ordinaryIntrinsicTurn.u.uprops[FAST].intrinsic = FROMOUTSIDE;
    script = draws([1]);
    u_calc_moveamt(0, ordinaryIntrinsicTurn, script.random);
    assert.equal(ordinaryIntrinsicTurn.u.umovement, 12);
    script.assertBounds([3]);

    for (const speedProperty of [
        { intrinsic: 1, extrinsic: 0 },
        { intrinsic: 0, extrinsic: W_ARMF },
    ]) {
        const veryFast = movementState();
        veryFast.u.uprops[FAST] = speedProperty;
        script = draws([1]);
        u_calc_moveamt(0, veryFast, script.random);
        assert.equal(veryFast.u.umovement, 24);
        script.assertBounds([3]);
    }

    const veryFastMiss = movementState();
    veryFastMiss.u.uprops[FAST].extrinsic = W_ARMF;
    script = draws([0]);
    u_calc_moveamt(0, veryFastMiss, script.random);
    assert.equal(veryFastMiss.u.umovement, 12);
    script.assertBounds([3]);
});

test('u_calc_moveamt uses a moved steed instead of hero speed', () => {
    const state = movementState(30, 4);
    const steed = { data: { mmove: 13 }, mspeed: 0 };
    state.u.usteed = steed;
    state.u.umoved = true;
    state.u.uprops[FAST].extrinsic = W_ARMF;
    const script = draws([1]);

    u_calc_moveamt(0, state, script.random);
    assert.equal(state.u.umovement, 16);
    script.assertBounds([12]);

    const stationary = movementState(30, 4);
    stationary.u.usteed = steed;
    u_calc_moveamt(0, stationary, () => {
        assert.fail('a stationary steed must not replace hero speed');
    });
    assert.equal(stationary.u.umovement, 34);
});

test('u_calc_moveamt applies every source encumbrance fraction', () => {
    for (const [capacity, expected] of [
        [0, 16],
        [SLT_ENCUMBER, 12],
        [MOD_ENCUMBER, 8],
        [HVY_ENCUMBER, 4],
        [EXT_ENCUMBER, 2],
        [OVERLOADED, 16],
    ]) {
        const state = movementState(16, 3);
        u_calc_moveamt(capacity, state, () => {
            assert.fail('ordinary speed must not draw');
        });
        assert.equal(state.u.umovement, 3 + expected);
    }

    const clamped = movementState(0, -3);
    u_calc_moveamt(0, clamped);
    assert.equal(clamped.u.umovement, 0);

    // Speed 13 makes every encumbrance division fractional, so these cases
    // distinguish C's truncation toward zero from floating-point subtraction.
    for (const [capacity, expected] of [
        [SLT_ENCUMBER, 10],
        [MOD_ENCUMBER, 7],
        [HVY_ENCUMBER, 4],
        [EXT_ENCUMBER, 2],
    ]) {
        const fractional = movementState(13);
        u_calc_moveamt(capacity, fractional, () => {
            assert.fail('ordinary speed must not draw');
        });
        assert.equal(fractional.u.umovement, expected);
    }
});

test('maybe_generate_rnd_mon preserves every source gate', () => {
    for (const scenario of [
        {
            name: 'ordinary dungeon level',
            state: randomMonsterTurnState(),
            expectedBound: 70,
        },
        {
            name: 'below the stronghold',
            // Depth 11 is the first level deeper than the depth-10 Castle.
            state: randomMonsterTurnState({ depth: 11 }),
            expectedBound: 50,
        },
        {
            name: 'demigod',
            state: randomMonsterTurnState({ demigod: true }),
            expectedBound: 25,
        },
        {
            name: 'demigod below the stronghold',
            // Demigod status takes precedence even at depth 11, where an
            // ordinary hero would use the deeper-level bound of 50.
            state: randomMonsterTurnState({ demigod: true, depth: 11 }),
            expectedBound: 25,
        },
    ]) {
        const bounds = [];
        const creations = [];
        const random = {
            rn2(bound) {
                bounds.push(bound);
                return 0; // Take the rare creation branch for each gate.
            },
        };
        const created = { scenario: scenario.name };
        assert.equal(
            maybe_generate_rnd_mon(scenario.state, {
                random,
                makemon(...args) {
                    creations.push(args);
                    return created;
                },
            }),
            created,
            scenario.name,
        );
        assert.deepEqual(bounds, [scenario.expectedBound], scenario.name);
        assert.equal(creations.length, 1, scenario.name);
        assert.deepEqual(creations[0].slice(0, 4), [null, 0, 0, 0]);
        assert.equal(creations[0][4].state, scenario.state);
        assert.equal(creations[0][4].random, random);
    }

    const state = randomMonsterTurnState();
    const bounds = [];
    assert.equal(
        maybe_generate_rnd_mon(state, {
            random: {
                rn2(bound) {
                    bounds.push(bound);
                    return 1; // Nonzero is the ordinary no-creation outcome.
                },
            },
            makemon: () => assert.fail('a missed gate must not create'),
        }),
        null,
    );
    assert.deepEqual(bounds, [70]);
});

test('clairvoyance cadence preserves gating, mapping, and update order', () => {
    const early = clairvoyanceTurnState({ moves: 19, seerTurn: 20 });
    assert.equal(maybeRunClairvoyance(early, {
        random: { rn1: () => assert.fail('early cadence must not draw') },
    }), false);
    assert.equal(early.context.seer_turn, 20);

    const due = clairvoyanceTurnState();
    const events = [];
    due.u.uhave.amulet = true;
    assert.equal(maybeRunClairvoyance(due, {
        doVicinityMap(object, context) {
            assert.equal(object, null);
            assert.deepEqual(context, { state: due });
            events.push('map');
        },
        random: {
            rn1(range, base) {
                assert.deepEqual([range, base], [31, 15]);
                events.push('schedule');
                return 36;
            },
        },
    }), true);
    assert.deepEqual(events, ['map', 'schedule']);
    assert.equal(due.context.seer_turn, 56);

    for (const source of ['intrinsic', 'extrinsic']) {
        const propertyOnly = clairvoyanceTurnState();
        propertyOnly.u.uprops[CLAIRVOYANT][source] = 1;
        const propertyEvents = [];
        assert.equal(maybeRunClairvoyance(propertyOnly, {
            doVicinityMap: () => propertyEvents.push('map'),
            random: {
                rn1: () => { propertyEvents.push('schedule'); return 15; },
            },
        }), true, source);
        assert.deepEqual(propertyEvents, ['map', 'schedule'], source);
        assert.equal(propertyOnly.context.seer_turn, 35, source);
    }

    // A blocking cornuthaum suppresses even Amulet-based mapping, but not the
    // cadence update itself. Endgame levels have the same mapping-only gate.
    const blocked = clairvoyanceTurnState();
    blocked.u.uhave.amulet = true;
    blocked.u.uprops[CLAIRVOYANT].blocked = 1;
    const endgame = clairvoyanceTurnState();
    endgame.u.uz.dnum = endgame.astral_level.dnum;
    endgame.u.uprops[CLAIRVOYANT].intrinsic = 1;
    for (const [name, state] of [
        ['blocked', blocked],
        ['endgame', endgame],
    ]) {
        assert.equal(maybeRunClairvoyance(state, {
            doVicinityMap: () => assert.fail(`${name} must not map`),
            random: { rn1: () => 15 },
        }), true, name);
        assert.equal(state.context.seer_turn, 35, name);
    }
});

test('hero time effects order sequence, encumbrance, then seer cadence',
    async () => {
    const state = clairvoyanceTurnState();
    const order = [];
    // A fake that records during its synchronous prologue reports the same
    // order whether or not the caller awaits it. encumber_msg() writes through
    // ttyPline, which can raise a --More-- and consume input, so the caller
    // must be blocked until it resolves. Holding the fake open on an
    // unresolved promise is what makes the missing await observable.
    let releaseEncumbrance;
    const encumbranceStarted = new Promise((resolve) => {
        releaseEncumbrance = resolve;
    });
    let started = false;
    const finished = finishHeroTimeEffects(state, {
        encumberMessage: async () => {
            started = true;
            order.push('encumbrance');
            assert.equal(state.hero_seq, 161);
            await encumbranceStarted;
        },
        random: {
            rn1(range, base) {
                order.push('clairvoyance');
                assert.deepEqual([range, base], [31, 15]);
                assert.equal(state.hero_seq, 161);
                return 15;
            },
        },
    });
    await Promise.resolve();
    assert.equal(started, true, 'encumbrance owner ran');
    assert.deepEqual(order, ['encumbrance'], 'clairvoyance waits');
    assert.equal(state.context.seer_turn, 20, 'seer cadence waits');
    releaseEncumbrance();
    await finished;
    assert.deepEqual(order, ['encumbrance', 'clairvoyance']);
    assert.equal(state.hero_seq, 161);
    assert.equal(state.context.seer_turn, 35);
});

test('hero time effects validate due clairvoyance owners atomically',
    async () => {
    const missingMap = clairvoyanceTurnState();
    missingMap.u.uprops[CLAIRVOYANT].extrinsic = 1;
    await assert.rejects(
        () => finishHeroTimeEffects(missingMap, {
            encumberMessage: () => assert.fail('missing map must not notify'),
            random: { rn1: () => assert.fail('missing map must not draw') },
        }),
        /requires doVicinityMap/u,
    );
    assert.equal(missingMap.hero_seq, 160);
    assert.equal(missingMap.context.seer_turn, 20);

    const missingRandom = clairvoyanceTurnState();
    await assert.rejects(
        () => finishHeroTimeEffects(missingRandom, {
            encumberMessage: () =>
                assert.fail('missing random must not notify'),
            random: {},
        }),
        /requires rn1/u,
    );
    assert.equal(missingRandom.hero_seq, 160);
    assert.equal(missingRandom.context.seer_turn, 20);
});

test('maybeWipeHeroEngraving derives its gate from effective Dexterity', () => {
    const state = engravingTurnState(11);
    // +2 permanent and -1 temporary adjustment make effective Dexterity 12,
    // so allmain.c uses 40 + 12 * 3 = 76 for the wear gate.
    state.u.abon[3] = 2;
    state.u.atemp[3] = -1;
    const script = turnDraws([
        ['rn2', 76, 1], // Nonzero skips the rare engraving-wear branch.
    ]);

    assert.equal(maybeWipeHeroEngraving(state, script.random), false);
    script.done();
});

test('maybeWipeHeroEngraving consumes rnd(3) before touching the engraving', () => {
    const state = engravingTurnState();
    make_engr_at(23, 9, '_', null, 0, DUST, {
        state,
        random: {
            rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
            rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
        },
    });
    const script = turnDraws([
        ['rn2', 79, 0], // Dexterity 13 makes the source gate 40 + 13 * 3.
        ['rnd', 3, 1], // Source evaluates the u_wipe_engr() argument first.
        ['rn2', 1, 0], // Select the engraving's only character.
        ['rn2', 4, 3], // Erase its small punctuation mark.
    ]);

    assert.equal(maybeWipeHeroEngraving(state, script.random), true);
    script.done();
    assert.equal(state.head_engr, null);
});

test('maybeWipeHeroEngraving skips unreachable floors after rnd', () => {
    for (const [label, makeUnreachable] of [
        ['swallowed', (state) => { state.u.uswallow = true; }],
        ['held by hugs', (state) => {
            state.u.ustuck = {
                data: { mattk: [{ aatyp: AT_HUGS, adtyp: 0 }] },
            };
        }],
        ['unskilled rider', (state) => {
            state.u.usteed = { data: { mflags1: 0 } };
        }],
        ['ceiling hider', (state) => {
            state.u.uundetected = true;
            state.youmonst.data.mflags1 = M1_HIDE | M1_CLING;
        }],
        ['levitating', (state) => {
            state.u.uprops[LEVITATION].intrinsic = 1;
        }],
        ['teetering over a seen pit', (state) => {
            state.level.traps.push({
                tx: state.u.ux, ty: state.u.uy, ttyp: PIT, tseen: true,
            });
        }],
        ['escaped seen shaft', (state) => {
            state.level.traps.push({
                tx: state.u.ux, ty: state.u.uy, ttyp: HOLE, tseen: true,
            });
        }],
    ]) {
        const state = engravingTurnState();
        makeUnreachable(state);
        const script = turnDraws([
            ['rn2', 79, 0], // Enter the rare branch at Dexterity 13.
            ['rnd', 3, 2], // Evaluate the argument before floor reachability.
        ]);

        assert.equal(
            maybeWipeHeroEngraving(state, script.random),
            false,
            label,
        );
        script.done();
    }

    // A blocked property does not satisfy NetHack's Levitation macro.
    const state = engravingTurnState();
    state.u.uprops[LEVITATION].intrinsic = 1;
    state.u.uprops[LEVITATION].blocked = 1;
    const blocked = turnDraws([
        ['rn2', 79, 0], // Re-enter the Dexterity-13 rare branch.
        ['rnd', 3, 3], // rnd(3) returns the source range 1 through 3.
    ]);
    assert.equal(maybeWipeHeroEngraving(state, blocked.random), true);
    blocked.done();
});

function firstTurnInput({
    seed,
    datetime,
    name,
    role,
    race,
    gender,
    align,
    command,
    options = '',
    startupKeys = '',
}) {
    return {
        seed,
        datetime,
        nethackrc: `OPTIONS=name:${name},role:${role},race:${race},`
            + `gender:${gender},align:${align},!legacy,!tutorial,`
            + `!splash_screen${options}\n`,
        // The command is the first gameplay input. Queue exhaustion captures
        // the next prompt after its complete elapsed-turn continuation.
        moves: `${startupKeys}${command}`,
    };
}

function liveMonsters() {
    const monsters = [];
    for (let monster = game.level.monlist;
        monster;
        monster = monster.nmon) {
        if (monster.mhp > 0) monsters.push(monster);
    }
    return monsters;
}

test('first wait reaches the next prompt through live turn upkeep', async () => {
    const replay = await runSegment(firstTurnInput({
        seed: 2026072301,
        datetime: '20260723120000',
        name: 'FirstWait',
        role: 'Healer',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        command: '.',
    }));

    assert.equal(replay.getScreens().length, 2);
    assert.equal(game.moves, 2);
    assert.equal(game.hero_seq, 17);
    assert.equal(game.u.umovement, 12);
    assert.equal(game.u.uhunger, 899);
    assert.equal(game.u.ublesscnt, 299);
    assert.equal(game.u.umoved, false);
    assert.equal(game.track.utcnt, 1);
    assert.deepEqual(
        game.track.utrack[0],
        { x: game.u.ux, y: game.u.uy },
    );

    // mcalcmove() rounds the speed-18 kitten up to 24 on rn2(12)=2,
    // while the speed-1 lichen rounds down to zero on rn2(12)=4.
    assert.deepEqual(
        liveMonsters().map((monster) => [
            monster.data.pmidx,
            monster.movement,
        ]),
        [[PM_KITTEN, 24], [PM_LICHEN, 0]],
    );
    const knownSpells = game.svs.spl_book
        .filter((spell) => spell.sp_id !== NO_SPELL);
    assert.ok(knownSpells.length > 0);
    assert.ok(knownSpells.every((spell) => spell.sp_know === 19999));
});

test('fainting boundaries stop before any elapsed-turn mutation',
    async () => {
    const cases = [
        { nutrition: 1, hungerProperty: false },
        { nutrition: 2, hungerProperty: true },
    ];
    for (const hungerCase of cases) {
        const replay = await runSegment({
            seed: 2026072301,
            datetime: '20260723120000',
            nethackrc: 'OPTIONS=name:HungerBoundary,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.u.uhunger = hungerCase.nutrition;
        game.u.uhs = WEAK;
        game.u.uprops[HUNGER] = {
            intrinsic: hungerCase.hungerProperty ? FROMOUTSIDE : 0,
            extrinsic: 0,
        };
        game.context.move = 1;
        const before = completeSecondTurnSnapshot(game, replay);

        for (let attempt = 0; attempt < 2; ++attempt) {
            await assert.rejects(
                moveloop_core(),
                (error) => error instanceof UnsupportedTurnBoundaryError
                    && error.reason
                        === 'unported hunger-status transition',
                `nutrition ${hungerCase.nutrition}, attempt ${attempt + 1}`,
            );
            assert.deepEqual(
                completeSecondTurnSnapshot(game, replay),
                before,
            );
        }
    }
});

test('retained hero movement skips upkeep that C does not reach', async () => {
    await runSegment({
        seed: 2026072301,
        datetime: '20260723120000',
        nethackrc: 'OPTIONS=name:RetainedRation,role:Healer,'
            + 'race:human,gender:female,align:neutral,!legacy,'
            + '!tutorial,!splash_screen,pettype:none,!acoustics',
        moves: '',
    });
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.u.umovement = NORMAL_SPEED * 2;
    game.hero_seq = game.moves * 8;
    game.context.seer_turn = 1000;
    game.u.uhunger = 51;
    game.u.uhs = HUNGRY;
    game.gt.timer_base = {
        timeout: game.moves + 1,
        next: null,
    };
    game.context.move = 1;
    game.nhDisplay.pushKey('.'.charCodeAt(0));

    await moveloop_core();

    assert.equal(game.moves, 1);
    assert.equal(game.u.umovement, NORMAL_SPEED);
    assert.equal(game.u.uhunger, 51);
    assert.equal(game.gt.timer_base.timeout, 2);
});

test('due timeout retries stop at the elapsed coordinator before mutation',
    async () => {
        const replay = await runSegment({
            seed: 2026072301,
            datetime: '20260723120000',
            nethackrc: 'OPTIONS=name:TimeoutBoundary,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.context.move = 1;
        game.context.seer_turn = 1000;
        game.u.umovement = NORMAL_SPEED;
        game.gt.timer_base = {
            timeout: game.moves + 1,
            next: null,
        };
        const before = completeSecondTurnSnapshot(game, replay);
        const timerBefore = structuredClone(game.gt.timer_base);

        for (let attempt = 0; attempt < 2; ++attempt) {
            await assert.rejects(
                moveloop_core(),
                (error) => error instanceof UnsupportedTurnBoundaryError
                    && error.reason === 'no timer due by move 2',
            );
            assert.deepEqual(
                completeSecondTurnSnapshot(game, replay),
                before,
            );
            assert.deepEqual(game.gt.timer_base, timerBefore);
        }

        game.gt.timer_base.timeout = game.moves + 100;
        game.nhDisplay.pushKey('.'.charCodeAt(0));
        await moveloop_core();
        assert.equal(game.moves, 2);
        assert.equal(game.gt.timer_base.timeout, 101);
    });

test('the billionth turn capitulates before hero sequence and upkeep',
    () => withSerializedGrids(async () => {
        const replay = await runSegment({
            seed: 2026072301,
            datetime: '20260723120000',
            nethackrc: 'OPTIONS=name:TurnLimit,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        clearTtyMessageWindow(game);
        await ttyPline('A prior message.', game);
        const terminalScreenCount = replay.getScreens().length;
        const terminalCursorCount = replay.getCursors().length;
        const waitEpoch = game.nhDisplay.waitEpoch;
        game.context.move = 1;
        game.u.umovement = NORMAL_SPEED;
        game.moves = 999999999;
        game.hero_seq = game.moves * 8;
        game.invent = {
            oclass: TOOL_CLASS,
            otyp: SACK,
            owt: weight_cap(game) + 5,
            nobj: null,
        };
        game.u.uprops[SEARCHING] = { intrinsic: 1, extrinsic: 0 };
        const laterRegion = create_region([{
            lx: game.u.ux,
            ly: game.u.uy,
            hx: game.u.ux,
            hy: game.u.uy,
        }]);
        game.level.regions.push(laterRegion);
        const priorHeroSequence = game.hero_seq;
        const priorHunger = game.u.uhunger;
        game.nhDisplay.pushKey(' '.charCodeAt(0));
        game.nhDisplay.pushKey(' '.charCodeAt(0));

        // allmain.c reaches done(ESCAPED) here, which is not ported. The turn
        // must stop rather than invent the disclosure, summary, and topten
        // frames that C's nh_terminate() capture would show.
        await assert.rejects(
            () => moveloop_core(),
            (error) => (
                error instanceof UnsupportedTurnBoundaryError
                && /done\(ESCAPED\)/u.test(error.message)
            ),
        );

        // The hero is burdened, so advanceElapsedTurn supplies advanceRound
        // and the dry run reaches the limit first. The rejection is therefore
        // atomic: the live turn never starts, so moves does not even reach
        // 1,000,000,000 and no key is consumed.
        assert.equal(game.moves, 999999999);
        assert.equal(game.hero_seq, priorHeroSequence);
        assert.equal(game.u.uhunger, priorHunger);
        assert.equal(game.nhDisplay.waitEpoch, waitEpoch);
        assert.equal(replay.getScreens().length, terminalScreenCount);
        assert.equal(replay.getCursors().length, terminalCursorCount);
        // "The dungeon capitulates." is urgent_pline() output belonging to the
        // unported branch, so it must never reach the topline.
        assert.equal(game._pending_message, 'A prior message.');
        assert.notEqual(
            game.nhDisplay.toplines,
            'The dungeon capitulates.',
        );
        // The once-per-turn upkeep beyond the limit never ran.
        assert.equal(game.level.regions.includes(laterRegion), true);
        assert.notEqual(game.program_state?.gameover, true);
    }));

// allmain.c gives an invulnerable hero UNENCUMBERED in place of the snapshot
// before regen_pw() and the overexertion check, so both read the substituted
// value. regen_pw() regenerates only below MOD_ENCUMBER, which makes its
// energy draw the observable difference between substituting and not.
test('an invulnerable hero regenerates energy as if unencumbered',
    async () => {
        await runSegment({
            seed: 2026072301,
            datetime: '20260723120000',
            nethackrc: 'OPTIONS=name:Invulnerable,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.level.regions = [];
        game.head_engr = null;
        game.invent = {
            oclass: TOOL_CLASS,
            otyp: SACK,
            owt: weight_cap(game) * 2,
            nobj: null,
        };
        assert.equal(near_capacity(game), HVY_ENCUMBER);
        // encumber_msg() prints only on a change, and its message would need
        // a More dismissal that has nothing to do with this branch.
        game.go = { oldcap: HVY_ENCUMBER };
        // regen_pw()'s divisor is (MAXULEV + 8 - ulevel) * 4 / 6 for a
        // non-Wizard, which is 24 at experience level 1; the read happens
        // after moves is incremented.
        game.moves = 23;
        game.hero_seq = game.moves * 8;
        game.u.umoved = false;
        game.u.uen = 0;
        game.u.uenmax = 5;
        game.u.uinvulnerable = true;
        game.context.move = 1;
        game.u.umovement = 0;
        game.context.seer_turn = 100000;
        game.context.next_attrib_check = 100000;
        game.nhDisplay.pushKey('.'.charCodeAt(0));

        await moveloop_core();

        // A burdened hero needs several allocations for one command, so the
        // turn whose moves reach the divisor is one of them rather than the
        // last. rn1(upper, 1) always adds at least one energy point, so the
        // regeneration is observable without pinning the count.
        assert.ok(game.moves >= 24, `moves reached ${game.moves}`);
        assert.ok(game.u.uen > 0, 'invulnerable hero regenerated energy');
    });

test('hunger weakness drives the next live multi-allocation path', async () => {
    await runSegment({
        seed: 2026072301,
        datetime: '20260723120000',
        nethackrc: 'OPTIONS=name:LiveBurden,role:Healer,'
            + 'race:human,gender:female,align:neutral,!legacy,'
            + '!tutorial,!splash_screen,pettype:none,!acoustics',
        moves: '',
    });
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.level.regions = [];
    game.head_engr = null;
    clearTtyMessageWindow(game);
    game.u.acurr.a[0] = 10;
    game.u.acurr.a[4] = 10;
    game.u.abon[0] = game.u.abon[4] = 0;
    game.u.atemp[0] = game.u.atemp[4] = 0;
    game.u.uhs = HUNGRY;
    game.u.uhunger = 51;
    // Independent hack.c arithmetic: 25 * (Str 10 + Con 10) + 50
    // gives 550 before weakness and 525 after its -1 Strength penalty.
    const preWeakCapacity = 550;
    const weakCapacity = 525;
    const carriedWeight = weakCapacity + 5;
    assert.ok(carriedWeight <= preWeakCapacity);
    game.invent = {
        oclass: TOOL_CLASS,
        otyp: SACK,
        owt: carriedWeight,
        nobj: null,
    };
    assert.equal(projected_capacity(game), 0);
    game.go = { oldcap: 0 };
    game.context.move = 1;
    game.context.seer_turn = 100000;
    game.context.next_attrib_check = 100000;
    game.u.umovement = NORMAL_SPEED;
    const priorMoves = game.moves;
    const priorHunger = game.u.uhunger;
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    game.nhDisplay.pushKey('.'.charCodeAt(0));

    await moveloop_core();
    assert.equal(game.u.uhs, WEAK);
    assert.equal(game.u.atemp[0], -1);
    assert.equal(projected_capacity(game), 1);
    assert.equal(game.go.oldcap, 1);
    assert.equal(game.gw.wc, weakCapacity);
    assert.equal(game.moves, priorMoves + 1);
    assert.equal(game.u.uhunger, priorHunger - 1);
    assert.equal(
        game.nhDisplay.toplines,
        'Your movements are slowed slightly because of your load.',
    );

    game.nhDisplay.pushKey('.'.charCodeAt(0));
    await moveloop_core();

    assert.equal(game.go.oldcap, 1);
    assert.equal(game.gw.wc, weakCapacity);
    assert.equal(game.moves, priorMoves + 3);
    assert.equal(game.u.umovement, 18);
    assert.equal(game.u.uhunger, priorHunger - 3);
    assert.equal(
        game.nhDisplay.toplines,
        'Your movements are slowed slightly because of your load.',
    );
});

test('the live elapsed path reaches the scheduled move-600 attribute check',
    async () => {
    await runSegment({
        seed: 2026072301,
        datetime: '20260723120000',
        nethackrc: 'OPTIONS=name:LiveAttributeCheck,role:Healer,'
            + 'race:human,gender:female,align:neutral,!legacy,'
            + '!tutorial,!splash_screen,pettype:none,!acoustics',
        moves: '',
    });
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.moves = 599;
    game.hero_seq = 599 * 8;
    game.context.next_attrib_check = 600;
    game.context.seer_turn = 1000;
    game.context.move = 1;
    game.multi = 0;
    game.u.umovement = 12;
    game.u.uhunger = 900;
    game.u.acurr.a.fill(18);
    game.u.amax.a.fill(18);
    game.u.aexe.fill(0);

    await assert.rejects(moveloop_core(), /Input queue empty/u);

    assert.equal(game.moves, 600);
    assert.ok(
        game.context.next_attrib_check >= 1400
            && game.context.next_attrib_check <= 1599,
    );
});

test('first unobstructed move records its destination before the next prompt', async () => {
    const replay = await runSegment(firstTurnInput({
        seed: 2026072302,
        datetime: '20260723124500',
        name: 'FirstMove',
        role: 'Wizard',
        race: 'gnome',
        gender: 'male',
        align: 'neutral',
        command: 'l',
    }));

    assert.equal(replay.getScreens().length, 2);
    assert.deepEqual(
        [game.u.ux, game.u.uy],
        [game.u.ux0 + 1, game.u.uy0],
    );
    assert.deepEqual(
        game.track.utrack[0],
        { x: game.u.ux, y: game.u.uy },
    );
    assert.equal(game.moves, 2);
    assert.equal(game.hero_seq, 17);
    assert.equal(game.u.umoved, false);
    const nearbyLichen = liveMonsters().find(
        (monster) => monster.data.pmidx === PM_LICHEN,
    );
    assert.ok(nearbyLichen, 'the selected east step ends beside a lichen');
    assert.equal(game.mvitals[PM_LICHEN].seen_close, 1);
    assert.equal(game.context.lifelist.total_seen_upclose, 2);
    assert.deepEqual(
        game.gb.bhitpos,
        { x: nearbyLichen.mx, y: nearbyLichen.my },
    );
    assert.equal(game.gn.notonhead, false);
});

test('movement glyph notices precede later first-turn region messages',
    async () => {
        const input = firstTurnInput({
            seed: 2026072302,
            datetime: '20260723124500',
            name: 'NoticeOrder',
            role: 'Wizard',
            race: 'human',
            gender: 'male',
            align: 'neutral',
            command: '',
        });
        // This seed supplies an unobstructed east step. From the new square,
        // the branch staircase is west and the newly revealed disguised
        // monster is southeast.
        // Stop at the first command boundary so this test can install a
        // source-reachable reveal immediately before parse() reads movement.
        input.moves = '';
        const replay = await runSegment(input);
        clearTtyMessageWindow(game);

        const oldHero = { x: game.u.ux, y: game.u.uy };
        const target = { x: oldHero.x + 2, y: oldHero.y + 1 };
        for (let x = oldHero.x - 3; x <= oldHero.x + 4; ++x) {
            for (let y = oldHero.y - 3; y <= oldHero.y + 3; ++y) {
                const location = game.level.at(x, y);
                if (!location) continue;
                location.lit = false;
                location.waslit = false;
            }
        }
        vision_recalc(0);
        assert.equal(cansee(target.x, target.y), false);

        const targetLocation = game.level.at(target.x, target.y);
        Object.assign(targetLocation, {
            disp_ch: null,
            disp_glyph: null,
            gnew: 0,
            remembered_glyph: null,
            seenv: 0,
        });
        game._glyphUpdateNotices = [];
        game.a11y = {
            ...game.a11y,
            glyph_updates: true,
            mon_notices: false,
            mon_notices_blocked: 0,
        };
        game.u.uprops[PROT_FROM_SHAPE_CHANGERS] = {
            intrinsic: 0,
            extrinsic: W_RINGL,
            blocked: 0,
        };
        place_monster(newMonster({
            data: game.mons[PM_TENGU],
            mnum: PM_TENGU,
            mhp: 10,
            mhpmax: 10,
            m_lev: 6,
            mcansee: true,
            mcanmove: true,
            m_ap_type: M_AP_MONSTER,
            mappearance: PM_GOBLIN,
        }), target.x, target.y, game);

        const inputFrames = [];
        const captureInputBoundary = game._preNhgetchHook;
        game._preNhgetchHook = async () => {
            inputFrames.push({
                message: game.nhDisplay.grid[0]
                    .map((cell) => cell.ch)
                    .join('')
                    .trimEnd(),
                target: {
                    ...game.nhDisplay.grid[target.y + 1][target.x - 1],
                },
                cursor: [
                    game.nhDisplay.cursorCol,
                    game.nhDisplay.cursorRow,
                ],
            });
            await captureInputBoundary();
        };

        game.nhDisplay.pushKey('l'.charCodeAt(0));
        await moveloop_core();

        assert.deepEqual(
            [game.u.ux, game.u.uy],
            [oldHero.x + 1, oldHero.y],
        );
        assert.equal(cansee(target.x, target.y), true);
        assert.equal(
            game._pending_message,
            '(west): branch staircase up.  (southeast): goblin.',
        );
        assert.equal(game._glyphUpdateNotices.length, 0);
        // display.c installs and flushes the transient disguise for
        // show_glyph()'s pline_xy(), then leaves the real monster in gbuf.
        assert.equal(
            game.nhDisplay.grid[target.y + 1][target.x - 1].ch,
            'o',
        );
        assert.equal(targetLocation.disp_ch, 'i');
        assert.deepEqual(
            [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow],
            [game.u.ux - 1, game.u.uy + 1],
        );

        // C ref: allmain.c moveloop_core() runs region expiry after movement
        // allocation on the next elapsed turn. Its ordinary pline first
        // exposes the source-earlier glyph notice at a More boundary.
        const cloud = create_region([{
            lx: oldHero.x,
            ly: oldHero.y,
            hx: oldHero.x,
            hy: oldHero.y,
        }]);
        Object.assign(cloud, {
            ttl: 0,
            visible: true,
            expire_f: 1,
            arg: 0,
        });
        game.level.regions.push(cloud);
        game.nhDisplay.pushKey(' '.charCodeAt(0));
        await assert.rejects(
            moveloop_core(),
            /Input queue empty/u,
        );

        assert.equal(game.level.regions.includes(cloud), false);
        assert.equal(
            game._pending_message,
            'You see a gas cloud dissipate.',
        );
        assert.equal(targetLocation.disp_ch, 'i');
        assert.deepEqual(
            inputFrames.map(({ message, target: cell, cursor }) => ({
                message,
                target: cell.ch,
                cursor,
            })),
            [
                {
                    message: '',
                    target: ' ',
                    cursor: [oldHero.x - 1, oldHero.y + 1],
                },
                {
                    message: '(west): branch staircase up.  '
                        + '(southeast): goblin.--More--',
                    target: 'i',
                    // The 50-byte notice plus the eight-byte --More-- prompt
                    // leaves the tty cursor at column 58.
                    cursor: [58, 0],
                },
                {
                    message: 'You see a gas cloud dissipate.',
                    target: 'i',
                    cursor: [game.u.ux - 1, game.u.uy + 1],
                },
            ],
        );
        assert.deepEqual(
            replay.getCursors().slice(-3),
            inputFrames.map(({ cursor }) => [...cursor, 1]),
        );
    });

test('blind first-turn search maps a discovered door by touch', async () => {
    // Reuse the seed sighted first.  The contestant module serves multiple
    // runSegment() calls, while each C segment starts with zeroed file-static
    // vision buffers.
    await runSegment(firstTurnInput({
        seed: 3200018,
        datetime: '20260723161500',
        name: 'SearchHit',
        role: 'Ranger',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        command: '.',
    }));
    const replay = await runSegment(firstTurnInput({
        seed: 3200018,
        datetime: '20260723161500',
        name: 'BlindSearchHit',
        role: 'Ranger',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        command: '.',
        options: ',blind',
        startupKeys: ' ',
    }));

    assert.equal(replay.getScreens().length, 3);
    assert.equal(game.moves, 2);
    assert.equal(game.hero_seq, 17);
    // cls() must leave an untouched northwest cell out of pending disp_* state;
    // otherwise the temporary trap frame can repopulate it during flush.
    assert.equal(
        game.level.at(game.u.ux - 1, game.u.uy - 1).disp_ch,
        null,
    );
    // This seed's successful rnl(7) converts the southeast SDOOR and
    // feel_location() records the southeast viewing vector. display.c
    // computes its vertical sign from hero to target, so southeast is SV0.
    const foundDoor = game.level.at(game.u.ux + 1, game.u.uy + 1);
    assert.equal(foundDoor.typ, DOOR);
    assert.equal(foundDoor.seenv & SV0, SV0);
    assert.equal(foundDoor.remembered_glyph.ch, foundDoor.disp_ch);
});

test('first-turn automatic search stays between allocation and ambient sound', async () => {
    const replay = await runSegment(firstTurnInput({
        seed: 2026072415,
        datetime: '20260723131500',
        name: 'SearchTurn',
        role: 'Ranger',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        command: '.',
    }));
    const tail = replay.getRngLog()
        .slice(-8)
        .map((entry) => entry.replace(/=.*/u, ''));

    assert.deepEqual(tail, [
        'rn2(12)',
        'rn2(12)',
        'rn2(12)',
        'rn2(70)',
        'rnl(8)',
        'rn2(400)',
        'rn2(20)',
        'rn2(70)',
    ]);
});

test('first turn maintains the source cloud-room region in monster order', async () => {
    await runSegment(firstTurnInput({
        seed: 441,
        datetime: '20260723123000',
        name: 'CloudTurn',
        role: 'Wizard',
        race: 'gnome',
        gender: 'male',
        align: 'neutral',
        command: '.',
    }));

    assert.equal(game.level.regions.length, 1);
    const [cloud] = game.level.regions;
    assert.equal(cloud.arg, 0);
    assert.equal(cloud.rects.length, 42);
    assert.equal(cloud.monsters.length, 10);
    // The permanent region begins at -1; its first five fog-cloud occupants
    // each add five until ttl reaches the source's 20-point maintenance gate.
    assert.equal(cloud.ttl, 24);
});

test('first-complete-turn matrix stays clean and recorder-sized', () => {
    const recipe = loadFirstCompleteTurnRecipe();
    assert.equal(recipe.segments.length, 18);
    const chunks = chunkRecipe(recipe);
    assert.deepEqual(
        chunks.map(({ segments }) => segments.length),
        [RECORDER_SEGMENT_LIMIT, 8],
    );
    assert.equal(
        chunks.reduce((total, chunk) => total + chunk.segments.length, 0),
        recipe.segments.length,
    );
    assert.ok(
        chunks.every(
            ({ segments }) => segments.length <= RECORDER_SEGMENT_LIMIT,
        ),
    );
    let dismissalSegments = 0;
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        if (segment.moves.endsWith(' ')) {
            ++dismissalSegments;
            assert.match(segment.nethackrc, /name:TrapOverlay/u);
            // The first space dismisses the welcome, '.' consumes turn one,
            // and the final space dismisses trap discovery's --More-- prompt.
            assert.equal(segment.moves, ' . ');
        } else {
            assert.match(segment.moves, /^ +[.hl]$/u);
        }
    }
    assert.equal(dismissalSegments, 1);
});

// Row 2 of the third re-audit: both burdened planning stops deleted cleanly
// with the whole suite green, because the capitulation case only proved they
// stay silent. These reach them without the turn limit.
test('burdened multi-cycle upkeep stops before region and search work',
    async () => {
        for (const [name, reason, install] of [
            [
                'region upkeep',
                'burdened multi-cycle region upkeep',
                () => {
                    game.level.regions.push(create_region([{
                        lx: game.u.ux,
                        ly: game.u.uy,
                        hx: game.u.ux,
                        hy: game.u.uy,
                    }]));
                },
            ],
            [
                'automatic search',
                'burdened multi-cycle automatic search',
                () => {
                    // FROMOUTSIDE rather than a small integer: the low bits
                    // of intrinsic are nh_timeout()'s property countdown, and
                    // a countdown of 1 would stop the turn earlier.
                    game.u.uprops[SEARCHING] = {
                        intrinsic: FROMOUTSIDE,
                        extrinsic: 0,
                        blocked: 0,
                    };
                    game.level.flags.noautosearch = false;
                    game.multi = 0;
                },
            ],
            [
                'overexertion',
                'overexertion hit point loss',
                () => {
                    // allmain.c runs overexert_hp() only above MOD_ENCUMBER.
                    // calc_capacity() returns excess * 2 / wc + 1, so an
                    // inventory of twice the carrying capacity leaves an
                    // excess of one capacity and lands on HVY_ENCUMBER.
                    game.invent = {
                        oclass: TOOL_CLASS,
                        otyp: SACK,
                        owt: weight_cap(game) * 2,
                        nobj: null,
                    };
                    assert.equal(near_capacity(game), HVY_ENCUMBER);
                    // Below EXT_ENCUMBER the cadence is svm.moves % 30, read
                    // after the increment, and the hero must have moved.
                    game.moves = 29;
                    game.hero_seq = game.moves * 8;
                    game.u.umoved = true;
                },
            ],
        ]) {
            const replay = await runSegment({
                seed: 2026072807,
                datetime: '20260728120000',
                nethackrc: 'OPTIONS=name:BurdenedUpkeep,role:Healer,'
                    + 'race:human,gender:female,align:neutral,!legacy,'
                    + '!tutorial,!splash_screen,pettype:none,!acoustics',
                moves: '',
            });
            for (const column of game.level.monsters) column.fill(null);
            game.level.monlist = null;
            game.level.regions = [];
            // A burdened hero is what makes advanceElapsedTurn supply
            // advanceRound, so finishElapsedTurn runs on the clone first.
            game.invent = {
                oclass: TOOL_CLASS,
                otyp: SACK,
                owt: weight_cap(game) + 5,
                nobj: null,
            };
            assert.ok(projected_capacity(game) > 0, name);
            install();

            game.context.move = 1;
            game.u.umovement = 0;
            // Siblings compare a complete snapshot rather than a few
            // scalars, because a stop that leaves any live state or the PRNG
            // moved is not retryable even when moves and hunger happen to
            // match.
            const before = completeSecondTurnSnapshot(game, replay);
            const beforeRng = getRngLog().length;

            for (let attempt = 0; attempt < 2; ++attempt) {
                game.context.move = 1;
                await assert.rejects(
                    () => moveloop_core(),
                    (error) => (
                        error instanceof UnsupportedTurnBoundaryError
                        && error.message === `elapsed turn reached ${reason}`
                    ),
                    `${name}, attempt ${attempt}`,
                );
                // The dry run refuses before any live state moves.
                assert.deepEqual(
                    completeSecondTurnSnapshot(game, replay),
                    before,
                    `${name}, attempt ${attempt}`,
                );
                assert.equal(getRngLog().length, beforeRng, name);
            }
        }
    });

// The cloned round reaches makemon() through maybe_generate_rnd_mon(), so
// UnsupportedMonsterCreationError is one of the classes it can raise. Unlike
// the boundary classes, js/jsmain.js does not break the segment for it, so a
// conversion that misses it discards every matching screen the segment had
// already produced instead of stopping on the last one.
test('a refused planned monster becomes a turn boundary, not a hard failure',
    async () => {
        const replay = await runSegment({
            // At this seed the first planned round's rn2(70) selects a random
            // monster, which is what carries the refusal below into the
            // caller.
            seed: 2026080005,
            datetime: '20260728120000',
            nethackrc: 'OPTIONS=name:PlannedMonGen,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.level.regions = [];
        game.head_engr = null;
        game.invent = {
            oclass: TOOL_CLASS,
            otyp: SACK,
            owt: weight_cap(game) + 5,
            nobj: null,
        };
        assert.ok(projected_capacity(game) > 0);
        game.go = { oldcap: 1 };
        // makemon() supports the species mklev places on D:1. Moving the hero
        // off that level makes every random creation refuse, so the branch
        // under test is the conversion rather than which species was rolled.
        game.u.uz.dlevel = 2;
        game.context.seer_turn = 100000;
        game.context.next_attrib_check = 100000;
        game.u.umovement = 0;
        game.context.move = 1;

        const before = completeSecondTurnSnapshot(game, replay);
        const beforeRng = getRngLog().length;
        for (let attempt = 0; attempt < 2; ++attempt) {
            game.context.move = 1;
            await assert.rejects(
                () => moveloop_core(),
                (error) => (
                    error instanceof UnsupportedTurnBoundaryError
                    && /monster creation/u.test(error.message)
                ),
                `rejects attempt ${attempt}`,
            );
            assert.deepEqual(
                completeSecondTurnSnapshot(game, replay),
                before,
                `snapshot attempt ${attempt}`,
            );
            assert.equal(getRngLog().length, beforeRng, `rng attempt ${attempt}`);
        }
    });

test('the billionth turn stops atomically for an unburdened hero too',
    () => withSerializedGrids(async () => {
        const replay = await runSegment({
            seed: 2026072301,
            datetime: '20260723120000',
            nethackrc: 'OPTIONS=name:TurnLimitLight,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        clearTtyMessageWindow(game);
        await ttyPline('A prior message.', game);

        // No burden, so advanceElapsedTurn supplies no advanceRound and the
        // dry run never reaches finishElapsedTurn. The stop must still be
        // atomic, or the segment is left with moves past the wrap value and
        // the ISAAC stream advanced, which no retry can reproduce.
        assert.equal(projected_capacity(game), 0);
        game.context.move = 1;
        game.u.umovement = NORMAL_SPEED;
        game.moves = 999999999;
        game.hero_seq = game.moves * 8;
        const before = {
            moves: game.moves,
            heroSeq: game.hero_seq,
            hunger: game.u.uhunger,
            pending: game._pending_message,
            waitEpoch: game.nhDisplay.waitEpoch,
            screens: replay.getScreens().length,
            cursors: replay.getCursors().length,
            rng: getRngLog().length,
        };

        for (let attempt = 0; attempt < 2; ++attempt) {
            game.context.move = 1;
            await assert.rejects(
                () => moveloop_core(),
                (error) => (
                    error instanceof UnsupportedTurnBoundaryError
                    && /done\(ESCAPED\)/u.test(error.message)
                ),
                `attempt ${attempt}`,
            );
            assert.deepEqual({
                moves: game.moves,
                heroSeq: game.hero_seq,
                hunger: game.u.uhunger,
                pending: game._pending_message,
                waitEpoch: game.nhDisplay.waitEpoch,
                screens: replay.getScreens().length,
                cursors: replay.getCursors().length,
                rng: getRngLog().length,
            }, before, `attempt ${attempt}`);
        }
    }));

// Audit rows 3 and 11: the switch from moveloop_core()'s mvl_wtcap snapshot to
// a live near_capacity() for gethungry() and exerchk() had no oracle at all --
// reverting both injections left the whole suite green and the development
// score unchanged. attrib.c exerper() switches on near_capacity() after
// gethungry() has run, and a HUNGRY-to-WEAK transition lowers weight_cap()
// through ATEMP(A_STR), so the snapshot can sit a whole encumbrance band low.
test('exerper sees the capacity the weakness transition produced', async () => {
    await runSegment({
        seed: 2026072301,
        datetime: '20260723120000',
        nethackrc: 'OPTIONS=name:LiveExerper,role:Healer,'
            + 'race:human,gender:female,align:neutral,!legacy,'
            + '!tutorial,!splash_screen,pettype:none,!acoustics',
        moves: '',
    });
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.level.regions = [];
    game.head_engr = null;
    clearTtyMessageWindow(game);
    game.u.acurr.a[0] = 10;
    game.u.acurr.a[4] = 10;
    game.u.abon[0] = game.u.abon[4] = 0;
    game.u.atemp[0] = game.u.atemp[4] = 0;
    game.u.uhs = HUNGRY;
    game.u.uhunger = 51;

    // Independent hack.c arithmetic. weight_cap() is 25 * (Str + Con) + 50,
    // so 550 before the transition and 525 after its -1 Strength penalty.
    // calc_capacity() is trunc(excess * 2 / cap) + 1 for a positive excess:
    //   800 - 550 = 250 -> trunc(500 / 550) + 1 = 1 = SLT_ENCUMBER
    //   800 - 525 = 275 -> trunc(550 / 525) + 1 = 2 = MOD_ENCUMBER
    // Only MOD_ENCUMBER reaches exerper()'s exercise(A_STR, TRUE), so the
    // snapshot spends no draw here and the live read spends one rn2(19).
    game.invent = {
        oclass: TOOL_CLASS,
        otyp: SACK,
        owt: 800,
        nobj: null,
    };
    assert.equal(projected_capacity(game), 1);
    game.go = { oldcap: 1 };
    // exerper()'s encumbrance cadence runs when the turn it enters is a
    // multiple of ten.
    game.moves = 9;
    game.u.umovement = NORMAL_SPEED;
    game.context.move = 1;
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    game.nhDisplay.pushKey('.'.charCodeAt(0));

    const before = getRngLog().length;
    await moveloop_core();

    // A burdened hero can need more than one allocation, so the turn counter
    // may pass ten rather than land on it; the cadence still fires once.
    assert.ok(game.moves >= 10, `moves ${game.moves}`);
    assert.ok(game.moves < 20, `moves ${game.moves}`);
    assert.equal(game.u.uhs, WEAK);
    assert.equal(game.u.atemp[0], -1);
    // The Strength exercise draw attrib.c makes only at MOD_ENCUMBER or above.
    const drawn = getRngLog().slice(before)
        .filter((entry) => entry.startsWith('rn2(19)'));
    assert.equal(drawn.length, 1);
});

test('the overexertion cadence follows both of allmain.c\'s divisors',
    async () => {
    // allmain.c:298-303 stops only when wtcap > MOD_ENCUMBER, the hero moved,
    // and the turn count divides: 30 below EXT_ENCUMBER, 10 at or above it.
    // Each row below moves exactly one of those three away from the stopping
    // point, so a guard that dropped a term would pass one and fail another.
    for (const [name, install, expectStop] of [
        // HVY_ENCUMBER at moves reaching 30 is the stopping point.
        ['heavy, 30th turn', (state) => {
            state.moves = 29;
        }, true],
        // 20 divides the ext cadence but not the heavy one, so the ternary's
        // untaken arm must not fire here.
        ['heavy, 20th turn', (state) => {
            state.moves = 19;
        }, false],
        // The hero has to have moved, whatever the turn count.
        ['heavy, 30th turn, unmoved', (state) => {
            state.moves = 29;
            state.u.umoved = false;
        }, false],
    ]) {
        const replay = await runSegment({
            seed: 2026072807,
            datetime: '20260728120000',
            nethackrc: 'OPTIONS=name:BurdenedUpkeep,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.level.regions = [];
        game.invent = {
            oclass: TOOL_CLASS,
            otyp: SACK,
            owt: weight_cap(game) * 2,
            nobj: null,
        };
        assert.equal(near_capacity(game), HVY_ENCUMBER, name);
        game.context.move = 1;
        game.u.umovement = 0;
        game.u.umoved = true;
        install(game);
        game.hero_seq = game.moves * 8;
        // moves and seer_turn advance together; moving one without the other
        // trips clairvoyancePlan()'s own consistency check.
        game.context.seer_turn = game.moves + 1;
        const startingMoves = game.moves;

        if (expectStop) {
            await assert.rejects(
                moveloop_core(),
                (error) => error instanceof UnsupportedTurnBoundaryError
                    && /overexertion hit point loss/u.test(error.message),
                name,
            );
            assert.equal(game.moves, startingMoves, name);
        } else {
            // The turn's encumbrance message raises a More prompt, and
            // moveloop_core() then asks for the next command; the Space
            // answers the first and the wait answers the second.
            game.nhDisplay.pushKey(' '.charCodeAt(0));
            game.nhDisplay.pushKey('.'.charCodeAt(0));
            await moveloop_core();
            // How many turns one command elapses depends on the hero's
            // movement points, so the assertion is that the cadence point was
            // crossed without stopping, not the exact count.
            assert.ok(game.moves > startingMoves, name);
        }
        void replay;
    }
});

// ── interrupt_multi() ──

function multiState(overrides = {}) {
    return {
        u: { uinvulnerable: true, usleep: 3 },
        context: { run: 1, travel: 0, travel1: 0, mv: 1 },
        disp: {},
        flags: { verbose: true },
        multi: COLNO,
        ...overrides,
    };
}

test('interrupt_multi exempts a run and a travel', () => {
    // allmain.c interrupt_multi() acts only when multi > 0 and neither
    // context.travel nor context.run is set. A run is the only way this port
    // reaches a positive multi, so both exemptions must hold.
    for (const context of [
        { run: 1, travel: 0, travel1: 0, mv: 1 },
        { run: 0, travel: 1, travel1: 0, mv: 1 },
    ]) {
        const state = multiState({ context });
        interrupt_multi('You are in full health.', state);
        assert.equal(state.multi, COLNO);
        assert.equal(state.u.uinvulnerable, true);
    }
});

test('interrupt_multi ignores a multi that is not positive', () => {
    const state = multiState({ multi: 0, context: { run: 0, travel: 0 } });
    interrupt_multi('You feel full of energy.', state);
    assert.equal(state.multi, 0);
    assert.equal(state.u.usleep, 3);
});

test('interrupt_multi ends a silent counted repeat through nomul(0)', () => {
    // With flags.verbose off, C calls nomul(0) and prints nothing.
    const state = multiState({
        context: { run: 0, travel: 0, travel1: 0, mv: 0 },
        flags: { verbose: false },
    });
    interrupt_multi('You are in full health.', state);
    assert.equal(state.multi, 0);
    assert.equal(state.u.usleep, 0);
    assert.equal(state.disp.botl, true);
});

test('interrupt_multi stops before Norep on a verbose counted repeat', () => {
    // Norep() needs the message window and regen_hp() is synchronous, so this
    // arm stops before nomul(0) writes anything.
    const state = multiState({
        context: { run: 0, travel: 0, travel1: 0, mv: 0 },
    });
    assert.throws(
        () => interrupt_multi('You are in full health.', state),
        (error) => error instanceof UnsupportedTurnBoundaryError,
    );
    assert.equal(state.multi, COLNO);
});

// The four freeze cases in scripts/unported-monster-actions.test.mjs call the
// preflight directly, so none of them supplies advanceRound and none reaches
// the once-per-turn planning round. That round runs the whole of
// finishElapsedTurn() on the clone -- hunger, region upkeep, monster
// generation, timeouts -- and is the largest single surface the clone has to
// isolate. This case is the only one that covers it.
//
// finishElapsedTurn() is not exported, so the round is reached the way the
// game reaches it: a burdened hero makes projected_capacity() positive, which
// is what makes advanceElapsedTurn() supply advanceRound at all.
//
// The assertion is about where the turn's first live write happens rather than
// whether one happens. Under a total freeze the live pass must fail -- it is
// supposed to write -- so what distinguishes an isolated planning round from a
// leaking one is whether that first failure lands after the preflight returned
// or inside it. Sharing the hero instead of cloning it moves the reported
// frame from js/allmain.js into js/unported_monster_actions.js, which is the
// mutation this was confirmed against.
test('a planned once-per-turn round writes nothing to frozen live state',
    async () => {
        await runSegment({
            seed: 2026072301,
            datetime: '20260723120000',
            nethackrc: 'OPTIONS=name:FrozenUpkeep,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.level.regions = [];
        game.head_engr = null;
        game.invent = {
            oclass: TOOL_CLASS,
            otyp: SACK,
            owt: weight_cap(game) * 2,
            nobj: null,
        };
        // encumber_msg() prints only on a change, and its message would need a
        // More dismissal unrelated to this case.
        game.go = { oldcap: near_capacity(game) };
        game.context.move = 1;
        game.u.umovement = 0;
        game.context.seer_turn = 100000;
        game.context.next_attrib_check = 100000;
        game.nhDisplay.pushKey('.'.charCodeAt(0));
        freezeLiveState(game);

        let caught = null;
        try {
            await moveloop_core();
        } catch (error) {
            caught = error;
        }

        assert.ok(caught instanceof TypeError, `threw ${caught}`);
        const firstFrame = caught.stack.split('\n')[1] ?? '';
        assert.match(firstFrame, /js\/allmain\.js/u);
    });
