import assert from 'node:assert/strict';
import test from 'node:test';

import {
    finishElapsedTurn,
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
    A_DEX,
    BURN_OBJECT,
    CLAIRVOYANT,
    COLNO,
    DETECT_MONSTERS,
    DUST,
    EXT_ENCUMBER,
    FAST,
    FLYING,
    FROMOUTSIDE,
    G_GENOD,
    HOLE,
    HUNGER,
    HVY_ENCUMBER,
    HUNGRY,
    HALLUC,
    INTRINSIC,
    LEFT_SIDE,
    LEVITATION,
    M_AP_MONSTER,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    MOD_ENCUMBER,
    NORMAL_SPEED,
    NOT_HUNGRY,
    NO_SPELL,
    OBJ_CONTAINED,
    OBJ_DELETED,
    OBJ_FLOOR,
    OVERLOADED,
    PIT,
    PROT_FROM_SHAPE_CHANGERS,
    ROOM,
    ROT_CORPSE,
    RUN_STEP,
    SATIATED,
    SEARCHING,
    DOOR,
    SLT_ENCUMBER,
    SV0,
    TIMER_OBJECT,
    WEAK,
    WOUNDED_LEGS,
    W_ARMF,
    W_RINGL,
} from '../js/const.js';
import { set_occupation } from '../js/cmd.js';
import {
    flush_screen,
    remembered_glyph_presentation,
} from '../js/display.js';
import { doeat } from '../js/eat.js';
import { make_engr_at } from '../js/engrave.js';
import { game } from '../js/gstate.js';
import {
    near_capacity,
    projected_capacity,
    weight_cap,
} from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { getRngLog, initRng } from '../js/rng.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    AT_HUGS,
    M1_CLING,
    M1_HIDE,
    PM_GOBLIN,
    PM_KITTEN,
    PM_LICHEN,
    PM_ORC,
    PM_PONY,
    PM_SMALL_MIMIC,
    PM_TENGU,
} from '../js/monsters.js';
import {
    BOULDER,
    CORPSE,
    DAGGER,
    OIL_LAMP,
    ROCK,
    SACK,
    TOOL_CLASS,
} from '../js/objects.js';
import { create_region } from '../js/region.js';
import {
    UnsupportedObjectOperationError,
    newObject,
    place_object,
} from '../js/obj.js';
import { UnsupportedObjectNameError } from '../js/objnam.js';
import { UnsupportedMonsterPickupOperationError } from '../js/steal.js';
import { preflightSimpleMonsterActions } from '../js/unported_monster_actions.js';
import { clearTtyMessageWindow, ttyPline } from '../js/tty_message.js';
import { cansee, does_block, vision_recalc } from '../js/vision.js';
import { start_timer } from '../js/timeout.js';
import {
    loadFirstCompleteTurnRecipe,
} from './run-first-complete-turn.mjs';
import {
    chunkRecipe,
    RECORDER_SEGMENT_LIMIT,
} from './run-first-command-closure.mjs';
import { completeSecondTurnSnapshot } from './second-turn-snapshot.mjs';
import { loadEatOccupationRecipe } from './run-eat-occupation.mjs';
import { loadStatusRefreshRecipe } from './run-status-refresh.mjs';
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

test('maybe_generate_rnd_mon preserves every source gate', async () => {
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
            await maybe_generate_rnd_mon(scenario.state, {
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
        await maybe_generate_rnd_mon(state, {
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

test('random creation finishes a complete meal only for an actual threat',
    async () => {
        const segment = loadEatOccupationRecipe().segments.find(
            (entry) => entry.seed === 5820011,
        );
        assert.ok(segment);
        await runSegment({ ...segment, moves: '.' });
        game.nhDisplay.terminal.pushKey('d'.charCodeAt(0));
        await doeat(game, { statusRefresh: async () => {} });
        const occupation = game.go.occupation;
        assert.equal(typeof occupation, 'function');
        game.context.victual.usedtime = game.context.victual.reqtime;

        await maybe_generate_rnd_mon(game, {
            random: { rn2: () => 0 },
            makemon: async () => null,
        });
        assert.equal(game.go.occupation, occupation);
        assert.equal(
            game.context.victual.usedtime,
            game.context.victual.reqtime,
        );

        const messages = [];
        const threat = {};
        assert.equal(await maybe_generate_rnd_mon(game, {
            random: { rn2: () => 0 },
            message: async (text) => messages.push(text),
            statusRefresh: async () => {},
            async makemon(_ptr, _x, _y, _flags, runtimeEnv) {
                await runtimeEnv.hooks.stopOccupation(threat, runtimeEnv);
                return threat;
            },
        }), threat);
        assert.equal(game.go.occupation, null);
        assert.equal(game.context.victual.piece, null);
        assert.equal(messages.some((text) => text.startsWith('You stop ')), false);
        assert.equal(
            messages.some((text) => text.startsWith('You finish eating ')),
            true,
        );
    });

test('a planned random threat finishes only the cloned complete meal',
    async () => {
        const segment = loadEatOccupationRecipe().segments.find(
            (entry) => entry.seed === 5820011,
        );
        assert.ok(segment);
        await runSegment({ ...segment, moves: '.' });
        game.nhDisplay.terminal.pushKey('d'.charCodeAt(0));
        await doeat(game, { statusRefresh: async () => {} });
        game.context.victual.usedtime = game.context.victual.reqtime;
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.u.umovement = 0;

        const livePiece = game.context.victual.piece;
        const liveInventory = game.invent;
        const liveOccupation = game.go.occupation;
        const liveQuantity = livePiece.quan;
        const liveUsedTime = game.context.victual.usedtime;
        const liveRequiredTime = game.context.victual.reqtime;
        let reachedRound = false;
        await preflightSimpleMonsterActions(game, {
            async advanceRound(planned) {
                reachedRound = true;
                assert.notStrictEqual(planned.invent, liveInventory);
                assert.notStrictEqual(planned.context.victual.piece, livePiece);
                assert.ok((() => {
                    for (let obj = planned.invent; obj; obj = obj.nobj) {
                        if (obj === planned.context.victual.piece) return true;
                    }
                    return false;
                })(), 'the cloned victual piece must remain on cloned inventory');
                await maybe_generate_rnd_mon(planned, {
                    random: { rn2: () => 0 },
                    message: async () => {},
                    statusRefresh: async () => {},
                    async makemon(_ptr, _x, _y, _flags, runtimeEnv) {
                        await runtimeEnv.hooks.stopOccupation({}, runtimeEnv);
                        return {};
                    },
                });
                assert.equal(planned.go.occupation, null);
                assert.equal(planned.context.victual.piece, null);
                return true;
            },
        });
        assert.equal(reachedRound, true);
        assert.strictEqual(game.go.occupation, liveOccupation);
        assert.strictEqual(game.invent, liveInventory);
        assert.strictEqual(game.context.victual.piece, livePiece);
        assert.equal(livePiece.quan, liveQuantity);
        assert.equal(game.context.victual.usedtime, liveUsedTime);
        assert.equal(game.context.victual.reqtime, liveRequiredTime);
    });

test('runtime interruption preserves stop_occupation status invalidation',
    async () => {
        const state = randomMonsterTurnState();
        state.go = { occupation: () => 1, occtxt: 'waiting' };
        state.disp = { botl: false };
        // hack.c nomul(0) deliberately returns for a negative multi; C's
        // preceding stop_occupation() status write must still survive.
        state.multi = -1;
        const messages = [];
        await maybe_generate_rnd_mon(state, {
            random: { rn2: () => 0 },
            message: async (text) => messages.push(text),
            async makemon(_ptr, _x, _y, _flags, runtimeEnv) {
                await runtimeEnv.hooks.stopOccupation({}, runtimeEnv);
                return {};
            },
        });
        assert.deepEqual(messages, ['You stop waiting.']);
        assert.equal(state.go.occupation, null);
        assert.equal(state.disp.botl, true);
        assert.equal(state.multi, -1);
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

test('u_wipe_engr spares an unreachable floor after allmain.c draws rnd', () => {
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
        // The engraving is what makes engrave.c u_wipe_engr()'s
        // can_reach_floor(TRUE) observable from here: had the wipe run, it
        // would have drawn rn2(1) and rn2(4) as the reachable case below
        // does, and turnDraws() rejects a draw its script did not list.
        make_engr_at(23, 9, '_', null, 0, DUST, {
            state,
            random: {
                rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
                rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
            },
        });
        makeUnreachable(state);
        const script = turnDraws([
            ['rn2', 79, 0], // Enter the rare branch at Dexterity 13.
            ['rnd', 3, 2], // Evaluate the argument before floor reachability.
        ]);

        // allmain.c's own gate fired, so the wear branch ran; the floor test
        // that spared the engraving is engrave.c's, one call further in.
        assert.equal(
            maybeWipeHeroEngraving(state, script.random),
            true,
            label,
        );
        script.done();
        assert.equal(state.head_engr.engr_txt[0], '_', label);
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

// allmain.c:379-388. Every turn of an immobile wait draws a frame; only the
// turn that brings gm.multi back to zero releases the hero.
test('the immobility countdown draws a frame a turn and releases at zero',
    async () => {
        // Each row: the gm.multi the turn starts on, the gm.multi it ends on,
        // how many frames runmode_delay_output() drew, and whether unmul()
        // ran. The last row is the boundary of allmain.c:380's `gm.multi < 0`:
        // a hero who is free to act counts nothing down and draws no frame.
        for (const [multi, ended, frames, released] of [
            [-3, -2, 1, false],
            [-1, 0, 1, true],
            [0, 0, 0, false],
        ]) {
            await runSegment(firstTurnInput({
                seed: 2026080901,
                datetime: '20260809120000',
                name: 'Immobile',
                role: 'Healer',
                race: 'human',
                gender: 'female',
                align: 'neutral',
                command: '',
            }));
            // No keys were typed, so the welcome line is still waiting; take
            // it off the top line the way cmd.c parse() would before the
            // first command, or unmul()'s message stops for a --More--.
            clearTtyMessageWindow(game);
            // What pray.c dopray() leaves behind. The message is what keeps
            // trap.c unconscious() FALSE, so the turn runs at the ordinary
            // rate rather than stopping in eat.c gethungry().
            game.multi = multi;
            game.multi_reason = 'praying';
            game.nomovemsg = 'You finish your prayer.';
            // RUN_STEP draws on every call; the default RUN_LEAP would draw
            // only on the seventh turn and hide the difference here.
            game.flags.runmode = RUN_STEP;
            let drawn = 0;
            game._animationFrameHook = () => { drawn++; };
            game.context.move = 1;
            // The released turn ends at rhack(), which reads a key.
            game.nhDisplay.pushKey('.'.charCodeAt(0));
            try {
                await moveloop_core();
            } finally {
                game._animationFrameHook = null;
            }

            assert.equal(drawn, frames, `multi ${multi}`);
            assert.equal(game.multi, ended, `multi ${multi}`);
            // unmul() runs only at zero, and everything it clears stays put
            // until then.
            assert.equal(
                game.nomovemsg,
                released ? null : 'You finish your prayer.',
                `multi ${multi}`,
            );
            assert.equal(
                game.multi_reason, released ? null : 'praying', `multi ${multi}`,
            );
            if (released) {
                assert.match(
                    game._ttyToplines ?? '', /You finish your prayer\./u,
                );
            }
        }
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
        // A lit lamp burning down. timeout.c timeout_funcs[]'s BURN_OBJECT row
        // is unported, so the whole turn stops rather than draining the queue.
        game.gt.timer_base = {
            timeout: game.moves + 1,
            kind: TIMER_OBJECT,
            func_index: BURN_OBJECT,
            arg: { otyp: OIL_LAMP, timed: 1 },
            next: null,
        };
        const before = completeSecondTurnSnapshot(game, replay);
        const timerBefore = structuredClone(game.gt.timer_base);

        for (let attempt = 0; attempt < 2; ++attempt) {
            await assert.rejects(
                moveloop_core(),
                (error) => error instanceof UnsupportedTurnBoundaryError
                    && error.reason
                        === 'a ported timeout function, but burn_object() '
                            + 'is due',
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
    assert.equal(
        remembered_glyph_presentation(foundDoor.remembered_glyph, game).ch,
        foundDoor.disp_ch,
    );
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
                // allmain.c:380-388 counts a negative gm.multi up and, at
                // zero, prints through unmul(). The clone would spend one turn
                // of the wait and print from state that is thrown away, so it
                // stops the way region upkeep above it does.
                'immobility countdown',
                'burdened multi-cycle immobility countdown',
                () => {
                    // What pray.c dopray() leaves behind. The message matters:
                    // it is what keeps trap.c unconscious() FALSE, so eat.c
                    // gethungry() does not refuse the turn first.
                    game.multi = -3;
                    game.multi_reason = 'praying';
                    game.nomovemsg = 'You finish your prayer.';
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
                    // One hit point is hack.c overexert_hp()'s unported arm,
                    // the one that prints and faints; above it the hero just
                    // pays and plays on.
                    game.u.uhp = 1;
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

// C ref: allmain.c moveloop_core()'s once-per-turn nh_timeout() call.
// timeout.c:774-776 reaches do.c heal_legs(0) when a WOUNDED_LEGS countdown
// runs out, and that function writes a line. finishElapsedTurn() hands the
// owner a silent message() while it is dry running the turn on the clone, and
// that choice had no oracle: the clone's own _ttyToplines is a copy, and
// the shared display is repainted with the same text by the live pass a moment
// later, so passing ttyPline() there left the whole suite green.
//
// This case removes both cover stories at once. The plan stops at the region
// upkeep immediately below nh_timeout_elapsed_turn(), so no live pass follows
// to repaint what a printing dry run left behind. And the turn begins with the
// arrival message still pending, which is what an ordinary turn looks like:
// cmd.c parse() clears the physical row after reading its key and leaves the
// pending message for the next writer. A clone that printed would find that
// message occupying the top line, and topl.c update_topl() answers a message
// too long to share by calling more(), which reads a key from the display and
// the input queue the clone shares with the live game.
test('a planned timeout writes no line and reads no key', async () => {
    const replay = await runSegment({
        // Independently chosen; nothing below depends on the map this seed
        // generates beyond the hero having somewhere to stand.
        seed: 2026081502,
        datetime: '20260815094500',
        nethackrc: 'OPTIONS=name:MendingLoad,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!acoustics',
        moves: '',
    });
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.level.regions = [];
    game.head_engr = null;
    // A burdened hero is what makes advanceElapsedTurn() supply advanceRound,
    // so the clone runs the whole once-per-turn block and reaches nh_timeout.
    // An unburdened clone returns straight after random monster generation.
    game.invent = {
        oclass: TOOL_CLASS,
        otyp: SACK,
        owt: weight_cap(game) + 5,
        nobj: null,
    };
    assert.ok(projected_capacity(game) > 0, 'the fixture must burden the hero');
    // do.c set_wounded_legs() leaves the recovery countdown in the intrinsic
    // field and the wounded side in the extrinsic one. A countdown of 1 is the
    // turn timeout.c's per-property loop takes to zero, and heal_legs() then
    // needs the side bit to have anything to clear. The point of temporary
    // Dexterity is the one set_wounded_legs() spent, which heal_legs() returns.
    game.u.uprops[WOUNDED_LEGS] = {
        intrinsic: 1,
        extrinsic: LEFT_SIDE,
        blocked: 0,
    };
    game.u.atemp[A_DEX] = -1;
    // encumber_msg() prints only on a change, and its line would need a More
    // dismissal of its own that has nothing to do with this case.
    game.go = { ...(game.go ?? {}), oldcap: near_capacity(game) };
    // The clairvoyance and attribute cadences belong to later turns.
    game.context.seer_turn = 100000;
    game.context.next_attrib_check = 100000;
    // One region, so the plan stops at the guard directly below nh_timeout.
    game.level.regions.push(create_region([{
        lx: game.u.ux,
        ly: game.u.uy,
        hx: game.u.ux,
        hy: game.u.uy,
    }]));
    game.u.umovement = 0;
    game.context.move = 1;
    // The single key the live turn below spends on that More prompt. The plan
    // must leave it in the queue.
    game.nhDisplay.pushKey(' '.charCodeAt(0));

    const before = completeSecondTurnSnapshot(game, replay);
    const beforeRng = getRngLog().length;
    for (let attempt = 0; attempt < 2; ++attempt) {
        game.context.move = 1;
        await assert.rejects(
            () => moveloop_core(),
            (error) => (
                error instanceof UnsupportedTurnBoundaryError
                && error.message
                    === 'elapsed turn reached burdened multi-cycle region upkeep'
            ),
            `attempt ${attempt}`,
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, replay),
            before,
            `attempt ${attempt}`,
        );
        assert.equal(getRngLog().length, beforeRng, `attempt ${attempt}`);
    }

    // The snapshot is the detector; this is what shows the case arrives. With
    // the region gone the plan runs to the end and the live pass takes the
    // same turn for real: heal_legs() clears both halves of the property,
    // gives the Dexterity point back, and writes its line. The queue emptying
    // here is also what proves the line costs a key: topl.c update_topl()
    // cannot share a row with the pending arrival message, so it calls more()
    // first, and a clone that printed the same line would have spent this same
    // key above. The turn then stops where rhack() asks for the next command.
    game.level.regions = [];
    game.context.move = 1;
    await assert.rejects(() => moveloop_core(), /Input queue empty/u);
    assert.deepEqual(game.u.uprops[WOUNDED_LEGS], {
        intrinsic: 0,
        extrinsic: 0,
        blocked: 0,
    });
    assert.equal(game.u.atemp[A_DEX], 0);
    assert.equal(game._pending_message, 'Your leg feels better.');
    assert.equal(
        game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd(),
        'Your leg feels better.',
    );
    assert.equal(game.nhDisplay.terminal._inputQueue.length, 0);
});

test('a planned corpse rot touches neither the live map nor the live queue',
    async () => {
        const replay = await runSegment({
            // Independently chosen; nothing below depends on the map beyond
            // the hero having somewhere to stand.
            seed: 2026081711,
            datetime: '20260817101500',
            nethackrc: 'OPTIONS=name:PlannedRot,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.level.regions = [];
        game.head_engr = null;
        // A burdened hero is what makes advanceElapsedTurn() supply
        // advanceRound, so the clone runs the whole once-per-turn block and
        // reaches run_timers() at the end of nh_timeout.
        game.invent = {
            oclass: TOOL_CLASS,
            otyp: SACK,
            owt: weight_cap(game) + 5,
            nobj: null,
        };
        assert.ok(projected_capacity(game) > 0,
            'the fixture must burden the hero');
        game.go = { ...(game.go ?? {}), oldcap: near_capacity(game) };
        game.context.seer_turn = 100000;
        game.context.next_attrib_check = 100000;

        // The corpse lies on the hero's own square, so cansee() is true there
        // and newsym() takes its visible arm -- the one that writes
        // loc.waslit. That write is the leak this case watches for: newsym()
        // reads the module-global game rather than the state run_timers() was
        // handed, so a planned rot that drew through the live seam would
        // repaint a square the live turn has not reached yet.
        // An orc, not a lichen: mkobj.c start_corpse_timeout() (1402-1404)
        // returns before scheduling for PM_LIZARD and PM_LICHEN, "lizards and
        // lichen don't rot or revive", so no lichen corpse ever carries a
        // ROT_CORPSE element. rot_corpse() reads no species, so the seam this
        // case targets is the same either way, but the queue state has to be
        // one a recording can produce.
        const corpse = newObject({
            age: 0,
            corpsenm: PM_ORC,
            o_id: 90001,
            oclass: game.objects[CORPSE].oc_class,
            otyp: CORPSE,
            quan: 1,
        });
        place_object(corpse, game.u.ux, game.u.uy, { state: game });
        // start_timer() counts from the current move, and the once-per-turn
        // block runs against the turn being entered.
        start_timer(1, TIMER_OBJECT, ROT_CORPSE, corpse, game);
        const square = game.level.at(game.u.ux, game.u.uy);
        square.waslit = !square.lit;

        // One region, so the plan stops at the guard directly below
        // nh_timeout and the live pass never runs.
        game.level.regions.push(create_region([{
            lx: game.u.ux,
            ly: game.u.uy,
            hx: game.u.ux,
            hy: game.u.uy,
        }]));
        game.u.umovement = 0;
        game.context.move = 1;

        const before = completeSecondTurnSnapshot(game, replay);
        for (let attempt = 0; attempt < 2; ++attempt) {
            game.context.move = 1;
            await assert.rejects(
                () => moveloop_core(),
                (error) => error instanceof UnsupportedTurnBoundaryError
                    && error.message === 'elapsed turn reached burdened '
                        + 'multi-cycle region upkeep',
                `attempt ${attempt}`,
            );
            // world.locations and timers.queue are both in the snapshot, so
            // this one comparison covers the redraw and the drain alike.
            assert.deepEqual(
                completeSecondTurnSnapshot(game, replay),
                before,
                `attempt ${attempt}`,
            );
            assert.equal(corpse.where, OBJ_FLOOR, `attempt ${attempt}`);
            assert.equal(square.waslit, !square.lit, `attempt ${attempt}`);
        }

        // With the region gone the live pass takes the turn for real, and the
        // same corpse leaves the floor.
        game.level.regions = [];
        game.context.move = 1;
        await assert.rejects(() => moveloop_core(), /Input queue empty/u);
        assert.equal(corpse.where, OBJ_DELETED);
        assert.equal(game.level.objects[game.u.ux][game.u.uy], null);
        assert.equal(game.gt.timer_base, null);
        assert.equal(square.waslit, Boolean(square.lit));
    });

// The status seam of the same nh_timeout_elapsed_turn() call, which the case
// above cannot reach. timeout.c:775 calls stop_occupation() beside
// heal_legs(0), and js/allmain.js stop_occupation() reaches a status refresh
// only through eat.c maybe_finished_meal(), which runs eatfood() when
// go.occupation is eatfood and the meal has served its whole time. So one turn
// shape decides this seam alone: a meal that finishes on the same turn a
// WOUNDED_LEGS countdown runs out. No recording can close it either, because
// the clone and the live pass paint the same rows a moment apart; the plan has
// to stop between them, which is what the region below is for.
//
// display.c bot() takes no state. It repaints the live status rows and clears
// the live dirty flags whichever state called it, so a clone that refreshed
// here would spend disp.botl on a turn the live game has not taken.
test('a planned finished meal refreshes no status line', async () => {
    const segment = loadEatOccupationRecipe().segments.find(
        (entry) => entry.seed === 5820011,
    );
    assert.ok(segment);
    const replay = await runSegment({ ...segment, moves: '.' });
    // 'd' is this Valkyrie's food ration. The command installs the real
    // victual and the real eatfood() occupation.
    game.nhDisplay.terminal.pushKey('d'.charCodeAt(0));
    await doeat(game, { statusRefresh: async () => {} });
    // eat.c maybe_finished_meal() finishes a meal instead of abandoning it only
    // when usedtime has reached reqtime, so this is what makes
    // stop_occupation() run eatfood() rather than say "You stop eating".
    // Serving the four remaining turns for real would spend four more turns of
    // this same seam before the one under test.
    game.context.victual.usedtime = game.context.victual.reqtime;
    // The first mouthful already carried the hero past hungerStatus()'s 1000,
    // and bite() saved the status the meal started from. newuhs() reaches its
    // status refresh only on a change, so a meal that crossed no boundary
    // would return before the seam.
    assert.equal(game.saved_hs, true);
    assert.equal(game.save_hs, NOT_HUNGRY);
    assert.ok(game.u.uhunger > 1000, 'the meal must cross into SATIATED');

    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.head_engr = null;
    // A burdened hero is what makes advanceElapsedTurn() supply advanceRound,
    // so the clone runs the whole once-per-turn block and reaches nh_timeout.
    // An unburdened clone returns straight after random monster generation.
    // The long sword is the one carried object the meal does not consume.
    const ballast = game.invent;
    assert.notEqual(ballast, game.context.victual.piece);
    ballast.owt = weight_cap(game) + 5;
    assert.ok(projected_capacity(game) > 0, 'the fixture must burden the hero');
    // encumber_msg() prints only on a change, and its line would need a More
    // dismissal of its own that has nothing to do with this case.
    game.go.oldcap = near_capacity(game);
    // do.c set_wounded_legs() leaves the recovery countdown in the intrinsic
    // field and the wounded side in the extrinsic one. A countdown of 1 is the
    // turn timeout.c's per-property loop takes to zero, and heal_legs() reaches
    // stop_occupation() right after it.
    game.u.uprops[WOUNDED_LEGS] = {
        intrinsic: 1,
        extrinsic: LEFT_SIDE,
        blocked: 0,
    };
    game.u.atemp[A_DEX] = -1;
    // The clairvoyance and attribute cadences belong to later turns.
    game.context.seer_turn = 100000;
    game.context.next_attrib_check = 100000;
    // One region, so the plan stops at the guard directly below nh_timeout.
    game.level.regions.push(create_region([{
        lx: game.u.ux,
        ly: game.u.uy,
        hx: game.u.ux,
        hy: game.u.uy,
    }]));
    game.u.umovement = 0;
    game.context.move = 1;
    // The command that just ran left the status line dirty, which is the
    // ordinary state of a turn: moveloop_core() runs its own bot() after the
    // elapsed block, not before it. A clone that refreshed would clear this.
    assert.equal(game.disp.botl, true);

    const before = completeSecondTurnSnapshot(game, replay);
    const beforeRng = getRngLog().length;
    for (let attempt = 0; attempt < 2; ++attempt) {
        game.context.move = 1;
        await assert.rejects(
            () => moveloop_core(),
            (error) => (
                error instanceof UnsupportedTurnBoundaryError
                && error.message
                    === 'elapsed turn reached burdened multi-cycle region upkeep'
            ),
            `attempt ${attempt}`,
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, replay),
            before,
            `attempt ${attempt}`,
        );
        assert.equal(getRngLog().length, beforeRng, `attempt ${attempt}`);
    }

    // The snapshot is the detector; this is what shows the case arrives. With
    // the region gone the plan runs to the end and the live pass takes the same
    // turn for real: the countdown expires, stop_occupation() finishes the
    // meal, and newuhs() refreshes the status line for the hunger change the
    // whole meal made.
    game.level.regions = [];
    game.context.move = 1;
    await assert.rejects(() => moveloop_core(), /Input queue empty/u);
    assert.equal(game.go.occupation, null);
    assert.equal(game.context.victual.piece, null);
    assert.equal(game.u.uhs, SATIATED);
    assert.equal(game.saved_hs, false);
    assert.equal(game.u.uprops[WOUNDED_LEGS].intrinsic, 0);
});

// The cloned round reaches makemon() through maybe_generate_rnd_mon(), so
// UnsupportedMonsterCreationError is one of the classes it can raise. Unlike
// the boundary classes, js/jsmain.js does not break the segment for it, so a
// conversion that misses it discards every matching screen the segment had
// already produced instead of stopping on the last one.
test('a refused planned monster becomes a turn boundary, not a hard failure',
    async () => {
        const replay = await runSegment({
            // First qualifying seed in an independently selected fresh scan.
            // The shortened unburdened plan enters rn2(25), selects a mimic,
            // and reaches the still-unported roomless set_mimic_sym() arm
            // before live birth.
            seed: 2026123986,
            datetime: '20260804120000',
            nethackrc: 'OPTIONS=name:PlannedMimic,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.level.regions = [];
        game.head_engr = null;
        assert.equal(projected_capacity(game), 0);
        // Keep the generated D:1 map and topology coherent.  A returning
        // demigod carrying the Amulet raises the generation cadence while
        // level difficulty one keeps the random reservoir at difficulty 8,
        // where this draw selects a small mimic.
        game.u.ulevel = 15;
        game.u.uevent.udemigod = true;
        game.u.uhave.amulet = true;
        game.context.seer_turn = 100000;
        game.context.next_attrib_check = 100000;
        game.u.umovement = 0;
        game.context.move = 1;
        game.nhDisplay.pushKey('.'.charCodeAt(0));

        const before = completeSecondTurnSnapshot(game, replay);
        const beforeRng = getRngLog().length;
        for (let attempt = 0; attempt < 3; ++attempt) {
            game.context.move = 1;
            await assert.rejects(
                () => moveloop_core(),
                (error) => (
                    error instanceof UnsupportedTurnBoundaryError
                    && /mimic room type none/u.test(error.message)
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

test('a planned blocking mimic birth restores live vision on every exit',
    async () => {
        for (const refuseAfterBirth of [false, true]) {
            await runSegment({
                seed: 1,
                datetime: '20260804120000',
                nethackrc: 'OPTIONS=name:PlannedBlocker,role:Healer,'
                    + 'race:human,gender:female,align:neutral,!legacy,'
                    + '!tutorial,!splash_screen,pettype:none,!acoustics',
                moves: '',
            });
            for (const column of game.level.monsters) column.fill(null);
            game.level.monlist = null;
            game.level.regions = refuseAfterBirth ? [create_region([{
                lx: game.u.ux,
                ly: game.u.uy,
                hx: game.u.ux,
                hy: game.u.uy,
            }])] : [];
            game.head_engr = null;
            game.u.ulevel = 15;
            game.u.uevent.udemigod = true;
            game.u.uhave.amulet = true;
            game.context.seer_turn = 100000;
            game.context.next_attrib_check = 100000;
            game.u.umovement = 0;

            // Keep rndmonst()'s reservoir focused on the source behavior under
            // test. Seed 4509's independent stream enters the generation gate,
            // places that small mimic at <38,17>, and chooses ROCK_CLASS then
            // BOULDER for its ordinary-room disguise.
            for (let i = 0; i < game.mvitals.length; ++i) {
                if (i !== PM_SMALL_MIMIC)
                    game.mvitals[i].mvflags |= G_GENOD;
            }
            initRng(4509);
            const rngBefore = {
                core: structuredClone(game.coreCtx),
                display: structuredClone(game.displayCtx),
            };
            const guard = freezeLiveState(game);
            let plannedOutcome = null;
            let plannedRngSentinel = null;
            const run = preflightSimpleMonsterActions(game, {
                async advanceRound(planned, planningRandom) {
                    try {
                        return await finishElapsedTurn(
                            planned,
                            planningRandom,
                            {
                                planning: true,
                                randomMonsterOnly: !refuseAfterBirth,
                            },
                        );
                    } finally {
                        const mimic = planned.level.monlist;
                        plannedOutcome = {
                            mnum: mimic?.mnum,
                            x: mimic?.mx,
                            y: mimic?.my,
                            m_ap_type: mimic?.m_ap_type & M_AP_TYPMASK,
                            mappearance: mimic?.mappearance,
                            blocks: does_block(
                                mimic?.mx,
                                mimic?.my,
                                null,
                                planned,
                            ),
                            marked: planned._plannedVisionChange,
                        };
                        plannedRngSentinel = [
                            planningRandom.rn2(1000000),
                            planningRandom.rn2(1000000),
                            planningRandom.rn2(1000000),
                        ];
                    }
                },
            });
            if (refuseAfterBirth) {
                await assert.rejects(
                    run,
                    (error) => error instanceof UnsupportedTurnBoundaryError
                        && error.message === 'elapsed turn reached burdened '
                            + 'multi-cycle region upkeep',
                );
            } else {
                await run;
            }
            guard.assertNoLeak(assert);
            assert.ok(guard.frozen > 1000,
                `froze only ${guard.frozen} objects`);
            assert.ok(guard.views > 0,
                `snapshotted only ${guard.views} typed arrays`);

            assert.deepEqual(plannedOutcome, {
                mnum: PM_SMALL_MIMIC,
                x: 38,
                y: 17,
                m_ap_type: M_AP_OBJECT,
                mappearance: BOULDER,
                blocks: true,
                marked: { x: 38, y: 17 },
            });
            assert.deepEqual(plannedRngSentinel, [297084, 3732, 475708]);
            assert.equal(game.level.monlist, null);
            assert.equal(game.level.monsters[38][17], null);
            assert.equal(does_block(38, 17, null, game), false);
            assert.deepEqual(game.coreCtx, rngBefore.core);
            assert.deepEqual(game.displayCtx, rngBefore.display);
        }
    });

// The same conversion reached from recorded keystrokes rather than from a
// hand-built state, which is what shows the shape it protects: runSegment()
// returns the screens the segment had already matched instead of discarding
// them. Only wizard mode widens the reservoir far enough to reach a species
// this port refuses. allmain.c:164-167 calls makemon(NULL, 0, 0, NO_MM_FLAGS)
// once per turn, makemon.c rndmonst_adj() caps that draw at source difficulty
// (level_difficulty() + u.ulevel) / 2, and on D:1 at experience level 1 that
// ceiling is 1 -- narrow enough that every species left is one
// js/makemon_create.js supports, so no ordinary D:1 game reaches this stop.
test('a refused runtime monster keeps the segment prefix through runSegment',
    async () => {
        let boundary = null;
        const replay = await runSegment({
            // The first of six seeds an independently chosen scan of 8150001
            // through 8150060 found whose experience-level-30 rest run refuses
            // a runtime species, and the earliest of the six to refuse.
            seed: 8150028,
            // Independently chosen. A datetime whose calendar prints its own
            // startup line shifts every key below by one and strands '#'
            // inside a message dismissal; this one prints none.
            datetime: '20291112154500',
            nethackrc: [
                'OPTIONS=name:RndMonXL,role:Wizard,race:human,gender:male,'
                    + 'align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,playmode:debug',
                '',
            ].join('\n'),
            // The opening wait paints an ordinary D:1 frame. #levelchange to
            // 30 raises the ceiling above to (1 + 30) / 2 = 15 without
            // spending a turn, and 29 spaces dismiss its welcome and intrinsic
            // chain. The searches then rest on D:1 until a turn generates a
            // monster; twenty carry the C reference six keys past this stop.
            moves: `.#levelchange\n30\n${' '.repeat(29)}${'s'.repeat(20)}`,
        }, { onBoundary: (error) => { boundary = error; } });

        // What makes advanceElapsedTurn() supply the shortened planning round:
        // a burdened hero would get the full one, which covers this call for a
        // different reason.
        assert.equal(projected_capacity(game), 0);
        assert.ok(boundary instanceof UnsupportedTurnBoundaryError, 'boundary');
        // js/monsters.js index 122 is the Aleax, source difficulty 12, above
        // the difficulty-9 ceiling isOrdinaryD5ReservoirSpecies() admits.
        assert.match(boundary.message, /monster creation: monster 122$/u);
        // Recorded with the C reference program for this exact input:
        // `node scripts/diff-fresh.mjs` on it reports C=67 screens, C=67
        // cursors and C=3199 PRNG calls, with the first screen mismatch at
        // boundary 62 (kind js-missing) and the first PRNG mismatch at call
        // 2929, C's rn2(70)=0 from maybe_generate_rnd_mon(allmain.c:166). So
        // these three counts are the matching prefix, and the draw the port
        // has not made is the one the refused turn would have spent.
        assert.equal(replay.getScreens().length, 61);
        assert.equal(replay.getCursors().length, 61);
        assert.equal(replay.getRngLog().length, 2928);
        // The refused turn is not spent: C reaches turn 17 on this key.
        assert.equal(game.moves, 16);
    });

function fetchedFloorObject(x, y, otyp, o_id) {
    const type = game.objects[otyp];
    return {
        cobj: null,
        nobj: null,
        nexthere: null,
        o_id,
        oclass: type.oc_class,
        ox: x,
        oy: y,
        otyp,
        owt: type.oc_weight,
        quan: 1,
        spe: 0,
        where: OBJ_FLOOR,
    };
}

// A starting pony standing two squares west of the hero on the object
// buildObject() returns, with every other monster and object taken off the
// level. C reads svl.level.objects[omx][omy], the pet's own square, and gates
// the carry on `rn2(udist) || !rn2(edog->apport)` (dogmove.c:448), where udist
// is distu() from dogmove.c:1014. Beside the hero that is 1, rn2(1) is always
// 0, and the arm then needs the one-in-twenty second draw; two squares out it
// is 4 and the first draw carries the arm. The same distance keeps
// distant_name() inside its near square, where the name formats through
// doname().
async function prepareFetchingPet(buildObject) {
    const replay = await runSegment({
        // Independently chosen. What each row below needs from it is a plain
        // room square two west of the hero that the hero can see.
        seed: 2026081501,
        datetime: '20260815090000',
        nethackrc: 'OPTIONS=name:Fetching,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!acoustics',
        moves: '',
    });
    for (const column of game.level.monsters) column.fill(null);
    for (const column of game.level.objects) column.fill(null);
    game.level.monlist = null;
    game.level.objlist = null;
    game.level.regions = [];
    game.head_engr = null;

    const x = game.u.ux - 2;
    const y = game.u.uy;
    assert.equal(game.level.at(x, y).typ, ROOM);
    assert.equal(cansee(x, y), true);

    const pony = place_monster(newMonster({
        data: game.mons[PM_PONY],
        m_id: 9001,
        mnum: PM_PONY,
        m_lev: game.mons[PM_PONY].mlevel,
        mhp: 8,
        mhpmax: 8,
        mcanmove: true,
        mcansee: true,
        mpeaceful: true,
        mtame: 10,
        movement: NORMAL_SPEED,
        mux: game.u.ux,
        muy: game.u.uy,
        // dog.c's starting pet. An apport of 20 carries dog_invent()'s
        // `rn2(20) < edog->apport + 3` whatever the draw answers, leaving the
        // distance test above as the arm's only gate.
        mextra: {
            edog: {
                apport: 20,
                dropdist: 10000,
                droptime: 0,
                hungrytime: 1000,
                mhpmax_penalty: 0,
                ogoal: { x: 0, y: 0 },
                whistletime: 0,
            },
        },
    }), x, y, game);
    game.level.monlist = pony;
    game.context.startingpet_mid = pony.m_id;
    game.context.startingpet_typ = PM_PONY;

    const item = buildObject(x, y);
    game.level.objects[x][y] = item;
    game.level.objlist = item;

    game.u.umovement = 0;
    game.context.move = 1;
    return replay;
}

// C ref: dogmove.c dog_invent()'s carry arm (443-472). It splits the stack
// through splitobj(), names the result through distant_name(), and hands it to
// mpickobj(), all from inside the monster scan the elapsed turn dry runs. Each
// of those three owners refuses with a class of its own, and js/jsmain.js ends
// a segment only for a turn boundary, so a class the conversion misses escapes
// runSegment() and discards every screen the segment had already matched
// instead of stopping on the last one.
test('a refused planned pickup becomes a turn boundary, not a hard failure',
    async () => {
        for (const [name, buildObject, refusal] of [
            [
                // objnam.c's shop price suffix is unported. Any guarded branch
                // of doname() would serve; this is the cheapest to set, and it
                // is the same one the sibling case in
                // scripts/unported-monster-actions.test.mjs uses.
                'naming',
                (x, y) => Object.assign(
                    fetchedFloorObject(x, y, DAGGER, 9301),
                    { unpaid: true },
                ),
                UnsupportedObjectNameError,
            ],
            [
                // can_carry() caps a nohands pet at one item, so a stack of two
                // splits before anything is named. splitobj() reaches obj.js's
                // splitBill hook first, which is why this row refuses with a
                // different class than the row above despite the same `unpaid`
                // bit; the class assertion is what holds the two apart.
                'split',
                (x, y) => Object.assign(
                    fetchedFloorObject(x, y, DAGGER, 9302),
                    { quan: 2, owt: 20, unpaid: true },
                ),
                UnsupportedObjectOperationError,
            ],
            [
                // steal.c mpickobj() bills a container whose contents are
                // unpaid as well as an unpaid object, and count_unpaid() is
                // what reads the difference. The sack itself is paid for, so
                // the name formats and the refusal lands one owner further on.
                'pickup',
                (x, y) => {
                    const sack = fetchedFloorObject(x, y, SACK, 9303);
                    const inside = fetchedFloorObject(0, 0, ROCK, 9304);
                    inside.where = OBJ_CONTAINED;
                    inside.unpaid = true;
                    inside.v = sack;
                    sack.cobj = inside;
                    return sack;
                },
                UnsupportedMonsterPickupOperationError,
            ],
        ]) {
            const replay = await prepareFetchingPet(buildObject);

            let raw = null;
            try {
                await preflightSimpleMonsterActions(game);
            } catch (error) {
                raw = error;
            }
            assert.ok(raw instanceof refusal, `${name} raised ${raw}`);

            // The dry run above changed nothing, so the same turn can be taken
            // again through the coordinator that owns the conversion.
            const before = completeSecondTurnSnapshot(game, replay);
            const beforeRng = getRngLog().length;
            for (let attempt = 0; attempt < 2; ++attempt) {
                game.context.move = 1;
                await assert.rejects(
                    () => moveloop_core(),
                    (error) => (
                        error instanceof UnsupportedTurnBoundaryError
                        && error.message === raw.message
                    ),
                    `${name}, attempt ${attempt}`,
                );
                assert.deepEqual(
                    completeSecondTurnSnapshot(game, replay),
                    before,
                    `${name}, attempt ${attempt}`,
                );
                assert.equal(
                    getRngLog().length,
                    beforeRng,
                    `${name}, attempt ${attempt}`,
                );
            }
        }
    });

test('a planned hallucinated appearance advances only cloned display state',
    async () => {
        const replay = await runSegment({
            // Independently selected for the first planned rn2(70) to enter
            // maybe_generate_rnd_mon().  Detect monsters makes any successful
            // placement nameable regardless of its random coordinate.
            seed: 2026080005,
            datetime: '20260728120000',
            nethackrc: 'OPTIONS=name:PlannedDisplayRng,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.head_engr = null;
        game.invent = {
            oclass: TOOL_CLASS,
            otyp: SACK,
            owt: weight_cap(game) + 5,
            nobj: null,
        };
        assert.ok(projected_capacity(game) > 0);
        game.u.uprops[HALLUC] = {
            intrinsic: FROMOUTSIDE,
            extrinsic: 0,
            blocked: 0,
        };
        game.u.uprops[DETECT_MONSTERS] = {
            intrinsic: FROMOUTSIDE,
            extrinsic: 0,
            blocked: 0,
        };
        game.level.regions = [create_region([{
            lx: game.u.ux,
            ly: game.u.uy,
            hx: game.u.ux,
            hy: game.u.uy,
        }])];
        game.context.seer_turn = 100000;
        game.context.next_attrib_check = 100000;
        game.u.umovement = 0;
        game.context.move = 1;

        const before = completeSecondTurnSnapshot(game, replay);
        await assert.rejects(
            () => moveloop_core(),
            (error) => error instanceof UnsupportedTurnBoundaryError
                && /burdened multi-cycle region upkeep/u.test(error.message),
        );
        // The planned constructor reached redraw and hallucinated Amonnam
        // before the later region refusal.  All state, both RNG streams,
        // terminal output, and queued input remain live and retryable.
        assert.deepEqual(completeSecondTurnSnapshot(game, replay), before);
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
    // allmain.c:298-303 costs a hit point only when wtcap > MOD_ENCUMBER, the
    // hero moved, and the turn count divides: 30 below EXT_ENCUMBER, 10 at or
    // above it. Each row below moves exactly one of those three away from the
    // paying point, so a guard that dropped a term would pass one and fail
    // another.
    //
    // The first three rows put the hero at one hit point, where hack.c
    // overexert_hp() would faint and the port stops; the fourth leaves her at
    // full health and watches the hit point actually go. Full health also
    // keeps regen_hp() out of the way: allmain.c runs it just above this
    // block, and it returns at once while uhp is uhpmax.
    for (const [name, install, expectStop] of [
        // HVY_ENCUMBER at moves reaching 30 is the paying point.
        ['heavy, 30th turn', (state) => {
            state.moves = 29;
            state.u.uhp = 1;
        }, true],
        // 20 divides the ext cadence but not the heavy one, so the ternary's
        // untaken arm must not fire here.
        ['heavy, 20th turn', (state) => {
            state.moves = 19;
            state.u.uhp = 1;
        }, false],
        // The hero has to have moved, whatever the turn count. This row keeps
        // full health rather than one hit point, because regen_hp() above the
        // block heals a hero who did not move and would hand back what this
        // row is watching for.
        ['heavy, 30th turn, unmoved', (state) => {
            state.moves = 29;
            state.u.umoved = false;
            state.u.uhp = state.u.uhpmax;
        }, false],
        // The same stopping row with a hit point to spare plays on.
        ['heavy, 30th turn, healthy', (state) => {
            state.moves = 29;
            state.u.uhp = state.u.uhpmax;
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
        const startingHp = game.u.uhp;

        if (expectStop) {
            await assert.rejects(
                moveloop_core(),
                (error) => error instanceof UnsupportedTurnBoundaryError
                    && /overexertion hit point loss/u.test(error.message),
                name,
            );
            assert.equal(game.moves, startingMoves, name);
            assert.equal(game.u.uhp, startingHp, name);
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
            // Only the healthy row crosses a paying turn, and it crosses
            // exactly one: 30 is the sole multiple of 30 in the range the
            // command elapses.
            assert.equal(
                game.u.uhp,
                name === 'heavy, 30th turn, healthy'
                    ? startingHp - 1 : startingHp,
                name,
            );
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

// Records what Norep() was asked to print and what the count looked like at
// the moment it was asked, which is how C's statement order is measured.
function recordingNorep(state, printed) {
    return async (text) => {
        printed.push({ text, multi: state.multi });
    };
}

test('interrupt_multi exempts a run and a travel', async () => {
    // allmain.c interrupt_multi() acts only when multi > 0 and neither
    // context.travel nor context.run is set. A counted command is the port's
    // one positive multi outside a run, so both exemptions must hold.
    for (const context of [
        { run: 1, travel: 0, travel1: 0, mv: 1 },
        { run: 0, travel: 1, travel1: 0, mv: 1 },
    ]) {
        const state = multiState({ context });
        const printed = [];
        await interrupt_multi('You are in full health.', state, {
            norepMessage: recordingNorep(state, printed),
        });
        assert.equal(state.multi, COLNO);
        assert.equal(state.u.uinvulnerable, true);
        assert.deepEqual(printed, []);
    }
});

test('interrupt_multi ignores a multi that is not positive', async () => {
    const state = multiState({ multi: 0, context: { run: 0, travel: 0 } });
    const printed = [];
    await interrupt_multi('You feel full of energy.', state, {
        norepMessage: recordingNorep(state, printed),
    });
    assert.equal(state.multi, 0);
    assert.equal(state.u.usleep, 3);
    assert.deepEqual(printed, []);
});

test('interrupt_multi ends a silent counted repeat through nomul(0)',
    async () => {
        // With flags.verbose off, C calls nomul(0) and prints nothing. The
        // message argument is still supplied, so this separates the two terms
        // of `flags.verbose && msg`.
        const state = multiState({
            context: { run: 0, travel: 0, travel1: 0, mv: 0 },
            flags: { verbose: false },
        });
        const printed = [];
        await interrupt_multi('You are in full health.', state, {
            norepMessage: recordingNorep(state, printed),
        });
        assert.equal(state.multi, 0);
        assert.equal(state.u.usleep, 0);
        assert.equal(state.disp.botl, true);
        assert.deepEqual(printed, []);
    });

test('interrupt_multi ends the count before Norep prints', async () => {
    // allmain.c interrupt_multi() is `nomul(0); if (flags.verbose && msg)
    // Norep("%s", msg);`. The count is already spent when the line goes out,
    // which is what the recorded multi below reads: a port that printed first
    // would hand Norep() the count it is about to cancel.
    const state = multiState({
        context: { run: 0, travel: 0, travel1: 0, mv: 0 },
    });
    const printed = [];
    await interrupt_multi('You are in full health.', state, {
        norepMessage: recordingNorep(state, printed),
    });
    assert.deepEqual(printed, [{ text: 'You are in full health.', multi: 0 }]);
    assert.equal(state.multi, 0);
    assert.equal(state.u.usleep, 0);
});

test('interrupt_multi refuses to end a count it cannot announce', async () => {
    // A caller that reaches the printing arm without supplying Norep()'s owner
    // is a programming error, and the count must survive it: half an
    // interruption is worse than none, and js/jsmain.js does not convert a
    // TypeError into a segment boundary.
    const state = multiState({
        context: { run: 0, travel: 0, travel1: 0, mv: 0 },
    });
    await assert.rejects(
        () => interrupt_multi('You are in full health.', state, {}),
        (error) => error instanceof TypeError
            && /requires norepMessage/u.test(error.message),
    );
    assert.equal(state.multi, COLNO);
    assert.equal(state.u.usleep, 3);
});

// The four freeze cases in scripts/unported-monster-actions.test.mjs call the
// preflight directly, so none of them supplies advanceRound and none reaches
// the once-per-turn planning round. That round runs the whole of
// finishElapsedTurn() on the clone -- hunger, region upkeep, monster
// generation, timeouts -- and is the largest single surface the clone has to
// isolate. The blocking-mimic case above reaches it directly; this case also
// pins its production coordinator. A burdened hero makes projected_capacity()
// positive, which is what makes advanceElapsedTurn() supply advanceRound.
//
// The assertion is about where the turn's first live write happens rather than
// whether one happens. Under a total freeze the live pass must fail -- it is
// supposed to write -- so what distinguishes an isolated planning round from a
// leaking one is whether that first failure lands after the preflight returned
// or inside it.
//
// Asserting the frame's module is not enough to say that, and an earlier
// version of this case did. finishElapsedTurn() runs on the clone from inside
// preflightSimpleMonsterActions() and lives in js/allmain.js itself, so a leak
// written by the planning round reports the same module as the live pass it is
// meant to be distinguished from. What separates them is the call stack:
// a throw from the planning round carries a preflightSimpleMonsterActions
// frame, and a throw from the live pass does not.
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
        // The precondition the whole case rests on. advanceElapsedTurn()
        // supplies advanceRound only when this is positive; if the fixture
        // ever stopped burdening the hero, the planning round would not run at
        // all and every assertion below would still pass.
        assert.ok(
            projected_capacity(game) > 0,
            'the fixture must burden the hero',
        );
        const guard = freezeLiveState(game);

        let caught = null;
        try {
            await moveloop_core();
        } catch (error) {
            caught = error;
        }

        // The typed-array grids cannot be frozen, so the snapshot is the only
        // thing covering them. Every case in
        // scripts/unported-monster-actions.test.mjs calls this; leaving it out
        // here left the once-per-turn round -- the widest surface of the five
        // -- as the one case with no vision-grid coverage.
        guard.assertNoLeak(assert);

        assert.ok(caught instanceof TypeError, `threw ${caught}`);
        assert.doesNotMatch(
            caught.stack,
            /preflightSimpleMonsterActions/u,
            'the planning round wrote to frozen live state',
        );
        // Not a second discriminator: a planning-round throw carries an
        // advanceElapsedTurn frame too, since the preflight is called from
        // inside it. This only rules out the turn dying somewhere earlier than
        // the elapsed-turn coordinator entirely.
        assert.match(caught.stack, /advanceElapsedTurn/u);
    });

// The last terminal row, which is the second of the two status lines.
function statusRow() {
    const display = game.nhDisplay;
    return display.grid[display.rows - 1]
        .map(({ ch }) => ch).join('').trimEnd();
}

// The turn counter the status line is showing, as a number.
function statusTurn() {
    const shown = /T:(\d+)/u.exec(statusRow());
    assert.ok(shown, `the status row shows a turn counter: ${statusRow()}`);
    return Number(shown[1]);
}

// One wait, then an occupation that answers "still busy", which returns from
// moveloop_core() before rhack() asks for a key. That leaves the elapsed-turn
// block and the status gate as the whole of the turn.
async function occupiedTurn() {
    set_occupation(() => 1, 'testing', 0, game);
    game.context.move = 0;
    await moveloop_core();
}

test('moveloop_core repaints the status line only for a marked writer',
    async () => {
        // allmain.c moveloop_core():473-478. `if (disp.botl || disp.botlx) {
        // bot(); curs_on_u(); } else if (disp.time_botl) { timebot();
        // curs_on_u(); }` -- a clean status line is left alone.
        const segment = loadEatOccupationRecipe().segments.find(
            (entry) => entry.seed === 5820011,
        );
        assert.ok(segment, 'the eat matrix holds the five-turn meal segment');
        await runSegment({ ...segment, moves: '.' });
        const before = statusRow();

        // A field moving with nothing marking the status line is the shape
        // eat.c newuhs()'s occupation arm produces; one poked hit point keeps
        // the case to the gate itself.
        game.u.uhp -= 3;
        game.disp.botl = false;
        game.disp.botlx = false;
        game.disp.time_botl = false;
        await occupiedTurn();
        assert.equal(statusRow(), before);

        // disp.botlx is the other half of the first arm.
        game.disp.botlx = true;
        await occupiedTurn();
        assert.equal(statusRow(), before.replace(
            /HP:\d+/u, `HP:${game.u.uhp}`,
        ));
    });

test('a hunger word the meal moves silently stays off the status line',
    async () => {
        // eat.c newuhs()'s `go.occupation == eatfood` arm assigns u.uhs and
        // returns before any disp.botl = TRUE, so the turn that crosses a
        // hunger boundary in the middle of a meal marks nothing dirty. C then
        // reaches timebot(), which refreshes BL_TIME alone.
        const segment = loadEatOccupationRecipe().segments.find(
            (entry) => entry.seed === 5820079,
        );
        assert.ok(segment, 'the eat matrix holds the satiation segment');
        // The segment's own lead-in: the opening wait plus the 204 that carry
        // the hero to 695 nutrition. From there the meal's second bite crosses
        // 1000 and moves u.uhs, with the first bite's messages already flushed.
        await runSegment({ ...segment, moves: '.'.repeat(205) });
        // The second arm needs the turn counter on the status line; the
        // matrix segment sets it and this case rests on that.
        assert.equal(game.flags.time, true);
        assert.equal(game.u.uhs, NOT_HUNGRY);

        // doeat() returns once start_eating() has installed the occupation,
        // which is the only way to stop inside a meal: moveloop_core() reads
        // no key while one is set.
        game.nhDisplay.terminal.pushKey('d'.charCodeAt(0));
        await doeat(game, { statusRefresh: async () => {} });

        const rows = [];
        let crossed = null;
        while (game.go.occupation) {
            const was = game.u.uhs;
            await moveloop_core();
            rows.push(statusRow());
            if (crossed === null && game.u.uhs !== was) {
                crossed = rows.length - 1;
                // The precondition the whole case rests on: the crossing left
                // the status line unmarked.
                assert.equal(game.disp.botl, false);
                assert.equal(game.disp.botlx, false);
            }
        }
        assert.equal(game.u.uhs, SATIATED);
        assert.ok(crossed !== null, 'the meal crossed a hunger boundary');
        assert.ok(rows.length > crossed + 1,
            'the meal ran a turn after the crossing');
        // hu_stat[SATIATED]. Every turn from the crossing to the last bite
        // leaves the word off the row.
        for (const row of rows.slice(crossed + 1, -1)) {
            assert.doesNotMatch(row, /Satiated/u);
        }
        // The turn counter still advanced on each of them, so the row was
        // refreshed rather than frozen whole.
        assert.notEqual(rows[crossed + 1], rows[crossed]);
        assert.match(rows[crossed + 1], /T:\d+/u);

        // done_eating() clears the occupation before its own newuhs() call, so
        // that one takes the ordinary arm and marks the status line, and the
        // flush inside its own message repaints the row and clears the mark.
        assert.match(rows[rows.length - 1], /Satiated/u);
        assert.equal(game.disp.botl, false);
        await flush_screen(1);
        assert.match(statusRow(), /Satiated/u);
    });

test('the status-refresh matrix covers all three arms of the gate', () => {
    // loadStatusRefreshRecipe() runs validateCleanRecipe(), so calling it is
    // the cleanliness check as well.
    const { segments } = loadStatusRefreshRecipe();
    assert.ok(segments.length <= RECORDER_SEGMENT_LIMIT,
        'the matrix records in one chunk');
    const withTime = segments.filter(
        ({ nethackrc }) => /(^|,)time(,|\n)/u.test(nethackrc),
    );
    // Both settings of the option, because it decides whether the second arm
    // is reachable at all.
    assert.ok(withTime.length > 0, 'a segment turns the turn counter on');
    assert.ok(withTime.length < segments.length,
        'a segment leaves the turn counter off');
    // The terrain word is the field these cases watch go stale, and a run is
    // what keeps classify_terrain() from marking it.
    const runs = segments.filter(
        ({ moves, nethackrc }) => /[HJKL]/u.test(moves)
            && nethackrc.includes('terrainstatus'),
    );
    assert.ok(runs.length >= 2, 'runs cross terrain with the field shown');
    // hack.c runmode_delay_output() flushes a different number of times in
    // each cadence, and every flush re-enters the gate.
    for (const cadence of ['runmode:walk', 'runmode:crawl']) {
        assert.ok(runs.some(({ nethackrc }) => nethackrc.includes(cadence)),
            `a run uses ${cadence}`);
    }
    assert.ok(
        runs.some(({ nethackrc }) => !nethackrc.includes('runmode:')),
        'a run uses the default RUN_LEAP cadence',
    );
    // The counter's own width changes only after ten turns, and wintty.c
    // render_status() places BL_VERS and a three-row BL_CONDITION from the
    // row's width rather than from the counter's, so both need a segment that
    // runs that far.
    const widening = segments.filter(({ moves }) => moves.length > 10
        && /^s+$/u.test(moves));
    assert.ok(
        widening.some(({ nethackrc }) => nethackrc.includes('showvers')),
        'a widening counter runs with the version field shown',
    );
    assert.ok(
        widening.some(({ nethackrc }) => nethackrc.includes('statuslines:3')),
        'a widening counter runs with three status rows',
    );
    // The occupation case: C reads no key from the first bite to the last, so
    // the whole meal passes through the gate with nothing marked.
    assert.ok(
        segments.some(({ moves, nethackrc }) => moves.includes('ed')
            && !nethackrc.includes('time')),
        'a multi-turn meal runs with the turn counter off',
    );
});
