import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { COLNO, CORR, ROWNO, ROOM } from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { t_at } from '../js/trap.js';
import { hurtle_step } from '../js/dothrow.js';
import {
    isolatePlannedVision,
    planningState,
} from '../js/unported_monster_actions.js';
import {
    liveVisionBufferViews,
    vision_recalc,
} from '../js/vision.js';

const DATETIME = '20260930120000';

function mapMemory(state) {
    return state.level.locations.map((column) => column.map((location) => ({
        seenv: location.seenv,
        waslit: location.waslit,
    })));
}

test('planned hurtle recalculations own both vision buffers and map memory', async () => {
    const cSource = readFileSync(
        new URL('../nethack-c/upstream/src/dothrow.c', import.meta.url),
        'utf8',
    );
    const jsHurtle = readFileSync(
        new URL('../js/dothrow.js', import.meta.url),
        'utf8',
    );
    const jsHmon = readFileSync(
        new URL('../js/uhitm.js', import.meta.url),
        'utf8',
    );
    const jsPlanning = readFileSync(
        new URL('../js/unported_monster_actions.js', import.meta.url),
        'utf8',
    );
    const cStart = cSource.indexOf(
        'hurtle_step(genericptr_t arg, coordxy x, coordxy y)',
    );
    const cEnd = cSource.indexOf('\n/* used by mhurtle_step()', cStart);
    assert.ok(cStart >= 0 && cEnd > cStart,
        'the complete C hurtle_step source is available');
    assert.match(cSource.slice(cStart, cEnd),
        /u_on_newpos\(x, y\);[\s\S]*?newsym\(ox, oy\);[\s\S]*?vision_recalc\(1\);/u);
    assert.match(jsHurtle,
        /arg\.isolateVision\(state\);\s*\}\s*vision_recalc\(1, \{ state, redraw \}\);/u);
    assert.match(jsHmon,
        /isolateVision: env\?\.planning\s*\?\s*isolatePlannedVision\s*:\s*null/u);
    assert.match(jsPlanning,
        /export function isolatePlannedVision\(state\)[\s\S]*?state\._visionBuffers = makeVisionBuffers\(\);/u);

    resetGame();
    // This fixed startup seed initializes the same map and vision owners that
    // a hero-defender replay uses; the test then moves only the planned clone.
    const replay = await runSegment({
        seed: 2026093001,
        datetime: DATETIME,
        nethackrc: 'OPTIONS=name:VisionCopy,role:Valkyrie,race:human,'
            + 'gender:female,align:lawful\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',
        moves: '',
    });

    const planned = planningState(game);
    assert.equal(planned._visionBuffers, undefined,
        'the existing vision owner isolates its buffers lazily');
    const originalView = game.viz_array;
    const liveBuffers = liveVisionBufferViews().map((view) => view.slice());
    const liveVision = game.viz_array.map((row) => row.slice());
    const liveMemory = mapMemory(game);
    const initialCloneMemory = planned.level.locations;
    assert.notStrictEqual(initialCloneMemory, game.level.locations);
    assert.notStrictEqual(
        initialCloneMemory[game.u.ux][game.u.uy],
        game.level.locations[game.u.ux][game.u.uy],
        'planningState already gives the clone its own map-memory cells',
    );

    const roomCells = [];
    for (let x = 1; x < COLNO - 1; ++x) {
        for (let y = 1; y < ROWNO - 1; ++y) {
            const typ = game.level.at(x, y)?.typ;
            if (typ === ROOM || typ === CORR)
                roomCells.push({ x, y });
        }
    }
    const distanceFromStart = ({ x, y }) => (
        (x - game.u.ux) ** 2 + (y - game.u.uy) ** 2
    );
    roomCells.sort((left, right) => (
        distanceFromStart(right) - distanceFromStart(left)
    ));
    const destinations = [roomCells[0], roomCells.at(-1)];
    assert.ok(destinations[0] && destinations[1]
        && (destinations[0].x !== destinations[1].x
            || destinations[0].y !== destinations[1].y),
    'the initialized level supplies two distinct floor destinations');

    isolatePlannedVision(planned);
    for (const destination of destinations) {
        // Each destination is selected from this fixed initialized map so the
        // two calls exercise successive swaps of the planned buffer pair.
        planned.u.ux = destination.x;
        planned.u.uy = destination.y;
        vision_recalc(1, { state: planned, redraw: () => {} });
        assert.notStrictEqual(planned.viz_array, originalView,
            'vision_recalc writes the clone-owned pair');
    }

    const cloneMemoryChanged = planned.level.locations.some(
        (column, x) => column.some((location, y) => (
            location.seenv !== liveMemory[x][y].seenv
            || location.waslit !== liveMemory[x][y].waslit
        )),
    );
    assert.ok(cloneMemoryChanged,
        'successive recalculations update clone-owned seenv or waslit cells');
    assert.deepEqual(liveVisionBufferViews(), liveBuffers,
        'the planned pair never writes live rows, spare rows, rmin or rmax');
    assert.deepEqual(game.viz_array, liveVision,
        'the live COULD_SEE array remains unchanged');
    assert.deepEqual(mapMemory(game), liveMemory,
        'the planned vision map-memory writes stay on the clone');

    const movement = [
        { x: game.u.ux + 1, y: game.u.uy },
        { x: game.u.ux - 1, y: game.u.uy },
        { x: game.u.ux, y: game.u.uy + 1 },
        { x: game.u.ux, y: game.u.uy - 1 },
    ].find(({ x, y }) => (
        (game.level.at(x, y)?.typ === ROOM
            || game.level.at(x, y)?.typ === CORR)
        && !game.level.monsters?.[x]?.[y]
        && !t_at(x, y, game)
    ));
    assert.ok(movement,
        'the initialized starting square has an adjacent unoccupied floor step');
    const plannedStep = planningState(game);
    const stepLiveVision = game.viz_array.map((row) => row.slice());
    const stepLiveBuffers = liveVisionBufferViews().map((view) => view.slice());
    const stepLiveMemory = mapMemory(game);
    const stepLiveScreens = replay.getScreens().slice();
    const stepLiveCursors = replay.getCursors().map((cursor) => [...cursor]);
    const stepLiveRng = replay.getRngLog().slice();
    const stepRandom = {
        d: () => 1,
        rn1: () => 1,
        rn2: () => 1,
        rnd: () => 1,
        rne: () => 1,
        rnl: () => 1,
    };
    const step = {
        state: plannedStep,
        range: 1,
        planning: true,
        random: stepRandom,
        isolateVision: isolatePlannedVision,
    };
    assert.equal(await hurtle_step(step, movement.x, movement.y), true);
    assert.deepEqual([plannedStep.u.ux, plannedStep.u.uy],
        [movement.x, movement.y], 'the actual planner callback moves its clone');
    assert.equal(step.range, 0, 'the source callback consumes one range square');
    assert.ok(plannedStep._visionBuffers,
        'the production planned callback allocates clone-owned vision first');
    assert.deepEqual(game.viz_array, stepLiveVision,
        'planned hurtle movement leaves live vision unchanged');
    assert.deepEqual(liveVisionBufferViews(), stepLiveBuffers,
        'planned hurtle movement does not write live current or spare buffers');
    assert.deepEqual(mapMemory(game), stepLiveMemory,
        'planned hurtle movement leaves live map memory unchanged');
    assert.deepEqual(replay.getScreens(), stepLiveScreens,
        'planned hurtle movement emits no live terminal output');
    assert.deepEqual(replay.getCursors(), stepLiveCursors,
        'planned hurtle movement leaves the live cursor unchanged');
    assert.deepEqual(replay.getRngLog(), stepLiveRng,
        'planned hurtle movement consumes no live RNG');
});
