import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORR,
    D_CLOSED,
    D_LOCKED,
    DOOR,
    IS_WALL,
    ROOM,
    RUN_CRAWL,
    RUN_LEAP,
    RUN_STEP,
    RUN_TPORT,
    STONE,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { ctrl, loadRushRunsRecipe, RUSH_CASES } from './run-rush-runs.mjs';

// cmd.c binds the control byte of each direction key to a rush command, which
// set_move_cmd() gives svc.context.run == 3.
const WALK_KEYS = new Set([...'hjklyubn']);
const RUSH_KEYS = new Set([...WALK_KEYS].map(ctrl));

function runmodeOf(nethackrc) {
    if (nethackrc.includes('runmode:teleport')) return RUN_TPORT;
    if (nethackrc.includes('runmode:walk')) return RUN_STEP;
    if (nethackrc.includes('runmode:crawl')) return RUN_CRAWL;
    return RUN_LEAP;
}

// The keystrokes before the first ctrl byte, which walk the hero to the square
// the rush starts from.
function prefixBeforeFirstRush(moves) {
    const index = [...moves].findIndex((key) => RUSH_KEYS.has(key));
    assert.notEqual(index, -1);
    return moves.slice(0, index);
}

test('the rush recipe contains only replay inputs', () => {
    const recipe = loadRushRunsRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, RUSH_CASES.length);
    assert.ok(recipe.segments.length >= 25);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        // A leading space dismisses the welcome message, lower-case direction
        // keys walk to the square the rush starts from, and at least one ctrl
        // byte drives a rush.
        const keys = [...segment.moves];
        assert.equal(keys[0], ' ');
        assert.ok(keys.slice(1).every(
            (key) => WALK_KEYS.has(key) || RUSH_KEYS.has(key),
        ));
        const firstRush = keys.findIndex((key) => RUSH_KEYS.has(key));
        assert.ok(firstRush > 0);
        assert.ok(keys.slice(1, firstRush).every(
            (key) => WALK_KEYS.has(key),
        ));
        assert.ok(Number.isInteger(segment.seed));
    }
});

test('every checked-in run mode is exercised', () => {
    const modes = new Set(
        loadRushRunsRecipe().segments.map(
            (segment) => runmodeOf(segment.nethackrc),
        ),
    );
    assert.deepEqual(
        [...modes].sort((a, b) => a - b),
        [RUN_TPORT, RUN_LEAP, RUN_STEP, RUN_CRAWL].sort((a, b) => a - b),
    );
});

// The predicates hack.c uses for each stop, read at the square the rush ended
// on. u.dx and u.dy still hold the direction the last step took, which is the
// direction lookaround() read, so `front` is the square the rush was moving
// onto even after a corridor corner turn.
function stopEvidence(arm) {
    const { ux, uy, dx, dy } = game.u;
    const front = { x: ux + dx, y: uy + dy };
    const neighbours = [];
    for (let x = ux - 1; x <= ux + 1; ++x) {
        for (let y = uy - 1; y <= uy + 1; ++y) {
            if (x !== ux || y !== uy) neighbours.push({ x, y });
        }
    }
    const closedDoor = ({ x, y }) => {
        const location = game.level.at(x, y);
        return location?.typ === DOOR
            && Boolean((location.flags ?? 0) & (D_CLOSED | D_LOCKED));
    };
    switch (arm) {
    case 'monster-front':
        return Boolean(m_at(front.x, front.y));
    case 'monster-side':
        return neighbours.some(
            ({ x, y }) => m_at(x, y) && !m_at(x, y).mtame
                && !(x === front.x && y === front.y),
        );
    case 'door':
        return neighbours.some(
            ({ x, y }) => (x === ux || y === uy) && closedDoor({ x, y }),
        );
    case 'terrain': {
        // lookaround()'s trailing else is reached only by terrain its earlier
        // branches pass over: not rock, not a wall, not a room square, not a
        // corridor, and not a closed door.
        return neighbours.some(({ x, y }) => {
            const typ = game.level.at(x, y)?.typ;
            return typ !== undefined && typ !== STONE && !IS_WALL(typ)
                && typ !== ROOM && typ !== CORR && !closedDoor({ x, y });
        });
    }
    case 'stone': {
        const typ = game.level.at(front.x, front.y)?.typ;
        return typ === STONE || IS_WALL(typ);
    }
    case 'edge':
        // hack.c move_out_of_bounds() ends the rush before test_move() runs.
        return !game.level.at(front.x, front.y);
    case 'doorway':
        return game.level.at(ux, uy)?.typ === DOOR;
    default:
        throw new Error(`unknown rush stop ${arm}`);
    }
}

test('each checked-in rush reaches the stop it was chosen for', async () => {
    const recipe = loadRushRunsRecipe();
    const armCounts = new Map();
    for (let index = 0; index < recipe.segments.length; ++index) {
        const segment = recipe.segments[index];
        const rushCase = RUSH_CASES[index];
        const label = `${segment.seed} ${rushCase.rush}`;

        let boundary = null;
        const replay = await runSegment(
            segment,
            { onBoundary: (error) => { boundary = error; } },
        );
        assert.equal(
            boundary,
            null,
            `${label} stopped at ${boundary?.message}`,
        );
        // nomul(0) ends every stop hack.c can reach here, so neither the rush
        // nor its multi sentinel survives the keystroke.
        assert.equal(game.context.run, 0, `${label} run`);
        assert.equal(game.multi, 0, `${label} multi`);
        // One keystroke drives the whole rush, so the recorded boundary count
        // equals the keystroke count plus the opening prompt.
        assert.equal(
            replay.getScreens().length,
            segment.moves.length + 1,
            `${label} screens`,
        );
        if (rushCase.arm === null) continue;
        assert.ok(
            stopEvidence(rushCase.arm),
            `${label} does not end on its ${rushCase.arm} stop`,
        );
        armCounts.set(rushCase.arm, (armCounts.get(rushCase.arm) ?? 0) + 1);
    }
    // The three arms that only svc.context.run == 3 reaches each need more
    // than one case, because this matrix is the whole evidence for them.
    for (const arm of ['monster-side', 'door', 'terrain']) {
        assert.ok(
            (armCounts.get(arm) ?? 0) >= 3,
            `${arm} has ${armCounts.get(arm) ?? 0} cases`,
        );
    }
});

test('a corridor rush starts off a room square', async () => {
    // hack.c lookaround() reaches its bcorr label, and therefore the corner
    // turn that lists svc.context.run == 3 beside 1, only while
    // levl[u.ux][u.uy].typ != ROOM. These four segments walk the hero there
    // first; the room cases deliberately do not.
    let offRoom = 0;
    for (const segment of loadRushRunsRecipe().segments) {
        const prefix = prefixBeforeFirstRush(segment.moves);
        if (prefix === ' ') continue;
        await runSegment({ ...segment, moves: prefix });
        const typ = game.level.at(game.u.ux, game.u.uy).typ;
        assert.ok(
            typ === DOOR || typ === CORR,
            `${segment.seed} starts its rush on terrain ${typ}`,
        );
        offRoom += 1;
    }
    assert.ok(offRoom >= 6, `${offRoom} rushes start off a room square`);
});

test('a rush stops where a run keeps going', async () => {
    // The whole point of svc.context.run == 3: lookaround()'s trailing else
    // stops a rush beside the doorway at <49,4>, while a run sends the same
    // square to bcorr and walks onto it. Both keys are the same direction, so
    // the difference is the run value cmd.c gave the command.
    const [segment] = loadRushRunsRecipe().segments.filter(
        (candidate) => candidate.seed === 6200024,
    );
    await runSegment(segment);
    assert.deepEqual([game.u.ux, game.u.uy], [50, 4]);
    assert.equal(game.level.at(49, 4).typ, DOOR);
    await runSegment({ ...segment, moves: ' H' });
    assert.deepEqual([game.u.ux, game.u.uy], [49, 4]);
});
