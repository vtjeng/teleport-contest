import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACH_TUNE, A_WIS, DB_EAST, DB_NORTH, DB_SOUTH, DB_WEST, DBWALL, DEAF,
    DOOR, DRAWBRIDGE_DOWN, DRAWBRIDGE_UP, ROOM, SLEEP_RES, STRAT_WAITMASK,
    TIMEOUT, UNCHANGING, OBJ_INVENT } from '../js/const.js';
import { find_drawbridge, is_db_wall, is_drawbridge_wall } from '../js/dbridge.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { awaken_monsters, awaken_scare, do_improvisation, do_play_instrument,
    generic_lvl_desc, improvised_notes, put_monsters_to_sleep } from '../js/music.js';
import { PM_GRID_BUG, PM_LICHEN } from '../js/monsters.js';
import { DRUM_OF_EARTHQUAKE, LEATHER_DRUM, TOOL_CLASS, WOODEN_FLUTE } from '../js/objects.js';

// Fixed fixture seed, selected before inspection; these source-pinned tests
// replace only local objects/monsters, never the recorded C input stream.
async function startedGame() {
    await runSegment({ seed: 8547721, datetime: '20350812112743',
        nethackrc: 'OPTIONS=name:MusicTest,role:Barbarian,race:human,gender:female,'
            + 'align:neutral,!legacy,!tutorial,!splash_screen,pettype:none', moves: '' });
    game.level.monlist = null;
    return game;
}
function scripted(steps) {
    const pending = [...steps];
    const random = Object.fromEntries(['d', 'rn2', 'rnd', 'rn1'].map(name => [name, (...args) => {
        const step = pending.shift();
        assert.ok(step, `unexpected ${name}(${args})`);
        assert.deepEqual([name, ...args], step.slice(0, -1));
        return step.at(-1);
    }]));
    return { random, finished: () => assert.deepEqual(pending, []) };
}

test('drawbridge lookup preserves four directions, negative failure, and in/out coordinates', () => {
    const source = readFileSync(new URL('../nethack-c/upstream/src/dbridge.c', import.meta.url), 'utf8');
    assert.match(source, /dir = is_drawbridge_wall\(\*x, \*y\)/u);
    // C checks east, west, north, south neighbours, in this exact order.
    for (const [dx, dy, dir] of [[1, 0, DB_WEST], [-1, 0, DB_EAST],
        [0, -1, DB_SOUTH], [0, 1, DB_NORTH]]) {
        const map = new Map();
        const state = { level: { at: (x, y) => map.get(`${x},${y}`) ?? { typ: ROOM } } };
        map.set('10,10', { typ: DOOR }); // Interior position permits all neighbours.
        map.set(`${10 + dx},${10 + dy}`, { typ: DRAWBRIDGE_DOWN, drawbridgemask: dir });
        assert.equal(is_drawbridge_wall(10, 10, state), dir);
        const position = { x: 10, y: 10 };
        assert.equal(find_drawbridge(position, state), true);
        assert.deepEqual(position, { x: 10 + dx, y: 10 + dy });
        assert.equal(find_drawbridge(position, state), true); // Already on bridge.
        assert.equal(is_db_wall(10, 10, state), false);
        map.set('10,10', { typ: DBWALL });
        assert.equal(is_db_wall(10, 10, state), true);
        assert.equal(is_drawbridge_wall(0, 10, state), -1); // C isok excludes x=0.
        const missing = { x: 30, y: 10 }; // Interior floor, away from the bridge.
        assert.equal(find_drawbridge(missing, state), false);
        assert.deepEqual(missing, { x: 30, y: 10 });
    }
});

test('generic_lvl_desc follows source level precedence and branch names', () => {
    const state = { u: { uz: { dnum: 1, dlevel: 1 } }, astral_level: { dnum: 1, dlevel: 1 },
        sanctum_level: { dnum: 2, dlevel: 3 }, sokoban_dnum: 4, tower_dnum: 5 };
    // Each location selects one source return; the final one is ordinary dungeon.
    for (const [dnum, dlevel, expected] of [[1, 1, 'astral plane'], [1, 2, 'plane'],
        [2, 3, 'sanctum'], [4, 1, 'puzzle'], [5, 1, 'tower'], [6, 1, 'dungeon']]) {
        state.u.uz = { dnum, dlevel };
        assert.equal(generic_lvl_desc(state), expected);
    }
});

test('improvised_notes draws one to five notes, then preserves the saved jingle when Unchanging', () => {
    const state = { u: { uprops: [] }, context: {} };
    // The three source table indices spell ACG, with one count draw first.
    const first = scripted([['rnd', 5, 3], ['rn2', 7, 0], ['rn2', 7, 2], ['rn2', 7, 6]]);
    assert.deepEqual(improvised_notes(state, first.random), { notes: 'ACG', same: false });
    first.finished();
    state.u.uprops[UNCHANGING] = { extrinsic: 1 };
    const repeated = scripted([]);
    assert.deepEqual(improvised_notes(state, repeated.random), { notes: 'ACG', same: true });
    repeated.finished();
    const restored = JSON.parse(JSON.stringify(state)); // Existing context save field.
    assert.deepEqual(improvised_notes(restored, repeated.random), { notes: 'ACG', same: true });
});

function monster(state, overrides = {}) {
    // Adjacent living grid bug: level1 fixes resistance defense, HP4 survives
    // a damage-free scare, and frozen8 makes wake-up reset observable.
    return { data: state.mons[PM_GRID_BUG], m_lev: 1, mhp: 4,
        mx: state.u.ux + 1, my: state.u.uy, msleeping: true, mcanmove: false,
        mfrozen: 8, mstrategy: 0, mtrack: [], ...overrides };
}

test('awaken_scare skips resistance for waiting and mindless monsters', async () => {
    const state = await startedGame();
    const noDraws = scripted([]);
    const waiting = monster(state, { mstrategy: STRAT_WAITMASK });
    await awaken_scare(waiting, true, state, { random: noDraws.random });
    assert.deepEqual([waiting.msleeping, waiting.mcanmove, waiting.mfrozen, waiting.mstrategy], [0, 1, 0, 0]);
    const mindless = monster(state, { data: state.mons[PM_LICHEN] });
    await awaken_scare(mindless, true, state, { random: noDraws.random });
    assert.equal(Boolean(mindless.mflee), false);
    noDraws.finished();
});

test('awaken_monsters uses the live monster chain and strict squared ranges', async () => {
    const state = await startedGame();
    const close = monster(state, { mx: state.u.ux + 3 }); // 9 < floor(40/3).
    const wakeOnly = monster(state, { mx: state.u.ux + 4 }); // 16 < 40, outside scare.
    const far = monster(state, { mx: state.u.ux + 7 }); // 49 >= 40.
    const dead = monster(state, { mhp: 0 });
    close.nmon = wakeOnly; wakeOnly.nmon = far; far.nmon = dead;
    state.level.monlist = close;
    const draw = scripted([['rn2', 109, 108]]); // TOOL attack10 - defense1 +100.
    await awaken_monsters(40, state, { random: draw.random, canSeeMonster: () => false });
    draw.finished();
    assert.equal(close.mflee, true);
    assert.equal(wakeOnly.msleeping, 0);
    assert.equal(Boolean(wakeOnly.mflee), false);
    assert.equal(far.msleeping, true);
    assert.equal(dead.msleeping, true);
});

test('put_monsters_to_sleep skips dead and out-of-range monsters and consumes sleep_monst result', async () => {
    const source = readFileSync(new URL('../nethack-c/upstream/src/music.c', import.meta.url), 'utf8');
    assert.match(source, /mdistu\(mtmp\) < distance\s*&& sleep_monst\(mtmp, d\(10, 10\), TOOL_CLASS\)/u);

    const state = await startedGame();
    const dead = monster(state, { mhp: 0 });
    const far = monster(state, { mx: state.u.ux + 3, mcanmove: true });
    const grabber = monster(state, {
        msleeping: false,
        mcanmove: true,
        mfrozen: 0,
        meating: 0,
    });
    dead.nmon = far;
    far.nmon = grabber;
    state.level.monlist = dead;
    state.u.ustuck = grabber;
    state.u.uswallow = false;
    // Only the live adjacent target is in range. It takes 25 turns of sleep,
    // then slept_monst releases the hero from its now-helpless grip.
    const draws = scripted([['d', 10, 10, 25], ['rn2', 109, 108]]);
    const messages = [];

    await put_monsters_to_sleep(5, state, {
        random: draws.random,
        message: line => messages.push(line),
    });

    draws.finished();
    assert.deepEqual(
        [grabber.mcanmove, grabber.mfrozen, grabber.msleeping],
        [false, 25, true],
    );
    assert.equal(state.u.ustuck, null);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /grip relaxes/u);
});

test('put_monsters_to_sleep leaves an in-range sleep-resistant monster unchanged', async () => {
    const state = await startedGame();
    const resistant = monster(state, {
        data: {
            ...state.mons[PM_GRID_BUG],
            mresists: state.mons[PM_GRID_BUG].mresists
                | (1 << (SLEEP_RES - 1)),
        },
        msleeping: false,
        mcanmove: true,
        mfrozen: 0,
    });
    state.level.monlist = resistant;
    const draws = scripted([['d', 10, 10, 25]]);

    await put_monsters_to_sleep(5, state, { random: draws.random });

    draws.finished();
    assert.deepEqual(
        [resistant.mcanmove, resistant.mfrozen, resistant.msleeping],
        [true, 0, false],
    );
});

test('a leather drum draws its tune before deafness and wisdom exercise', async () => {
    const state = await startedGame();
    const messages = [];
    const drum = { otyp: LEATHER_DRUM, oclass: TOOL_CLASS, quan: 1, spe: 0,
        dknown: true, where: OBJ_INVENT };
    const draws = scripted([['rn2', 2, 1], ['rnd', 5, 1], ['rn2', 7, 2],
        ['rn1', 20, 30, 34], ['rn2', 2, 1]]);
    const oldExercise = state.u.aexe[A_WIS];
    assert.equal(await do_improvisation(drum, state, { random: draws.random,
        message: line => messages.push(line) }), 2);
    draws.finished();
    assert.equal(state.context.jingle, 'C');
    assert.equal(state.u.uprops[DEAF].intrinsic & TIMEOUT, 34);
    assert.equal(state.u.aexe[A_WIS], oldExercise - 1);
    assert.deepEqual(messages, ['You start playing your drum.', 'You beat a deafening row!']);
    assert.equal(state.disp.botl, true);
});

test('an already-deaf drummer does not add deafness or draw its duration', async () => {
    const state = await startedGame();
    state.u.uprops[DEAF].intrinsic = 9; // Existing timeout remains exactly nine.
    const draws = scripted([['rn2', 2, 0], ['rnd', 5, 1], ['rn2', 7, 0], ['rn2', 2, 0]]);
    const messages = [];
    await do_improvisation({ otyp: LEATHER_DRUM, oclass: TOOL_CLASS, quan: 1, spe: 0, dknown: true },
        state, { random: draws.random, message: line => messages.push(line) });
    draws.finished();
    assert.equal(state.u.uprops[DEAF].intrinsic, 9);
    assert.equal(messages.at(-1), 'You pound on the drum.');
});

test('a depleted earthquake drum chooses its mundane riff without deafness or exercise', async () => {
    const state = await startedGame();
    // Two false choices select "pull off"; table index seven is "train".
    const draws = scripted([['rn2', 2, 1], ['rnd', 5, 1], ['rn2', 7, 0],
        ['rn2', 2, 0], ['rn2', 2, 0], ['rn2', 8, 7]]);
    const messages = [];
    const oldExercise = state.u.aexe[A_WIS];
    const drum = { otyp: DRUM_OF_EARTHQUAKE, oclass: TOOL_CLASS, quan: 1, spe: 0, dknown: true };
    await do_improvisation(drum, state, { random: draws.random, message: line => messages.push(line) });
    draws.finished();
    assert.equal(messages.at(-1), 'You pull off a train.');
    assert.equal(state.u.uprops[DEAF].intrinsic, 0);
    assert.equal(state.u.aexe[A_WIS], oldExercise);
    assert.equal(drum.otyp, DRUM_OF_EARTHQUAKE); // Only the C local copy changed.
});

test('five correct notes plus excess reveal the tune even when acoustics suppresses hints', async () => {
    for (const acoustics of [false, true]) {
        const state = await startedGame();
        state.flags.acoustics = acoustics;
        state.stronghold_level = { ...state.u.uz };
        state.tune = 'ABCDE'; // Five distinct notes make exact matches unambiguous.
        state.u.uevent.uheard_tune = 0;
        Object.assign(state.level.at(state.u.ux + 1, state.u.uy), { typ: DRAWBRIDGE_UP });
        state._pending_message = state._ttyToplines = state._ttyPreviousMessage = '';
        state._ttyMessageStopped = false;
        for (const key of 'nABCDEZ\n') state.nhDisplay.pushKey(key.charCodeAt(0));
        const draws = scripted([['rn2', 19, 0]]); // Source wisdom exercise for trying.
        const messages = [];
        await do_play_instrument({ otyp: WOODEN_FLUTE, oclass: TOOL_CLASS, quan: 1,
            spe: 0, dknown: true }, state,
        { random: draws.random, message: line => messages.push(line) });
        draws.finished();
        assert.equal(state.u.uevent.uheard_tune, 2);
        assert.ok(state.u.uachieved.includes(ACH_TUNE));
        assert.equal(messages.includes('You hear 5 gears turn.'), acoustics);
        assert.equal(state.nhDisplay.inputQueueLength, 0);
    }
});
