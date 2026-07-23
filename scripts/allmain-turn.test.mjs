import assert from 'node:assert/strict';
import test from 'node:test';

import {
    finishHeroTimeEffects,
    maybe_generate_rnd_mon,
    maybeRunClairvoyance,
    maybeWipeHeroEngraving,
    u_calc_moveamt,
} from '../js/allmain.js';
import {
    CLAIRVOYANT,
    DUST,
    EXT_ENCUMBER,
    FAST,
    FLYING,
    FROMOUTSIDE,
    HOLE,
    HVY_ENCUMBER,
    INTRINSIC,
    LEVITATION,
    MOD_ENCUMBER,
    NO_SPELL,
    OVERLOADED,
    PIT,
    SLT_ENCUMBER,
    W_ARMF,
} from '../js/const.js';
import { make_engr_at } from '../js/engrave.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { AT_HUGS, M1_CLING, M1_HIDE } from '../js/monsters.js';

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

test('hero time effects increment the sequence before seer cadence', () => {
    const state = clairvoyanceTurnState();
    finishHeroTimeEffects(state, {
        random: {
            rn1(range, base) {
                assert.deepEqual([range, base], [31, 15]);
                assert.equal(state.hero_seq, 161);
                return 15;
            },
        },
    });
    assert.equal(state.hero_seq, 161);
    assert.equal(state.context.seer_turn, 35);
});

test('hero time effects validate due clairvoyance owners atomically', () => {
    const missingMap = clairvoyanceTurnState();
    missingMap.u.uprops[CLAIRVOYANT].extrinsic = 1;
    assert.throws(
        () => finishHeroTimeEffects(missingMap, {
            random: { rn1: () => assert.fail('missing map must not draw') },
        }),
        /requires doVicinityMap/u,
    );
    assert.equal(missingMap.hero_seq, 160);
    assert.equal(missingMap.context.seer_turn, 20);

    const missingRandom = clairvoyanceTurnState();
    assert.throws(
        () => finishHeroTimeEffects(missingRandom, { random: {} }),
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
}) {
    return {
        seed,
        datetime,
        nethackrc: `OPTIONS=name:${name},role:${role},race:${race},`
            + `gender:${gender},align:${align},!legacy,!tutorial,`
            + `!splash_screen${options}\n`,
        // The leading space dismisses the welcome message; command is the
        // first gameplay input. Queue exhaustion captures the next prompt.
        moves: ` ${command}`,
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

    assert.equal(replay.getScreens().length, 3);
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

    const pet = liveMonsters().find((monster) => monster.mtame);
    assert.ok(pet, 'the starting pet remains on the live monster list');
    assert.ok(
        pet.movement >= 12,
        'the starting pet receives its first source movement ration',
    );
    const knownSpells = game.svs.spl_book
        .filter((spell) => spell.sp_id !== NO_SPELL);
    assert.ok(knownSpells.length > 0);
    assert.ok(knownSpells.every((spell) => spell.sp_know === 19999));
    assert.notEqual(game.context.turn_replay_blocked, true);
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

    assert.equal(replay.getScreens().length, 3);
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
