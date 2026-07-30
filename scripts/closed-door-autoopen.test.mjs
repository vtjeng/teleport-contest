import assert from 'node:assert/strict';
import test from 'node:test';

import { DOOR, D_CLOSED, D_ISOPEN } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadClosedDoorAutoopenRecipe } from './run-closed-door-autoopen.mjs';

// cmd.c cmdlist[] binds these keys to the eight walking directions.
const DIRECTIONS = {
    h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
    y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};

// Replay each prefix of a segment's keys and report the door's mask after
// each one, together with the turn counter. Every segment walks in one
// direction throughout, so the door stays at the square the first key
// targeted.
async function doorMaskAfterEachKey(segment) {
    const [dx, dy] = DIRECTIONS[segment.moves[0]];
    const masks = [];
    const turns = [];
    let door = null;
    for (let keys = 0; keys <= segment.moves.length; ++keys) {
        await runSegment({ ...segment, moves: segment.moves.slice(0, keys) });
        if (keys === 0) {
            door = { x: game.u.ux + dx, y: game.u.uy + dy };
        }
        masks.push(game.level.at(door.x, door.y).flags);
        turns.push(game.moves);
    }
    return { door, masks, turns };
}

test('the autoopen matrix contains only source-selected inputs', () => {
    const recipe = loadClosedDoorAutoopenRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 10);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            DIRECTIONS[segment.moves[0]],
            'every segment opens with a walking key',
        );
    }
    // The three options that make otherwise invisible parts of the arm
    // observable, one segment each: the turn counter, a pet that must not
    // move, and set_msg_xy()'s coordinate prefix.
    for (const option of ['time', 'pettype:dog', 'accessiblemsg']) {
        assert.equal(
            recipe.segments.filter(
                ({ nethackrc }) => nethackrc.includes(option),
            ).length,
            1,
            `one segment sets ${option}`,
        );
    }
});

test('every matrix segment starts beside a plain closed door', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    for (const [index, segment] of segments.entries()) {
        const [dx, dy] = DIRECTIONS[segment.moves[0]];
        await runSegment({ ...segment, moves: '' });
        const door = game.level.at(game.u.ux + dx, game.u.uy + dy);
        assert.equal(door.typ, DOOR, `segment ${index} terrain`);
        // Exactly D_CLOSED: a locked, trapped or broken door belongs to a
        // different arm of doopen_indir() and is refused before the walk.
        assert.equal(door.flags, D_CLOSED, `segment ${index} mask`);
    }
});

test('every matrix segment runs to its last keystroke', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    for (const [index, segment] of segments.entries()) {
        const replay = await runSegment(segment);
        assert.equal(
            replay.getScreens().length,
            segment.moves.length + 1,
            `segment ${index} emits one screen per key plus the first prompt`,
        );
    }
});

test('the matrix covers both outcomes of the rnl(20) roll', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    let resisted = 0;
    let opened = 0;
    let walkedThrough = 0;
    for (const segment of segments) {
        const { door, masks } = await doorMaskAfterEachKey(segment);
        // masks[0] is the state before any key.
        if (masks[1] === D_CLOSED) ++resisted;
        if (masks.at(-1) === D_ISOPEN) ++opened;
        if (game.u.ux === door.x && game.u.uy === door.y) ++walkedThrough;
    }
    // Three segments miss on their first pull, seven open it straight away,
    // and every one of the ten ends with the door open.
    assert.equal(resisted, 3);
    assert.equal(opened, 10);
    // The doorway an opened door leaves behind has to be walkable, which is
    // the observable result the slice ends on. The two diagonal segments
    // cannot demonstrate it: test_move() refuses a diagonal doorway entry.
    assert.equal(walkedThrough, 7);
});

test('pulling at the door spends no game time', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    for (const [index, segment] of segments.entries()) {
        const { masks, turns } = await doorMaskAfterEachKey(segment);
        for (let keys = 1; keys < turns.length; ++keys) {
            // hack.c:1111 leaves svc.context.move FALSE for every pull, so
            // the turn counter may only advance on a key that moved the hero.
            const pulled = masks[keys - 1] !== D_ISOPEN;
            assert.equal(
                turns[keys] - turns[keys - 1],
                pulled ? 0 : 1,
                `segment ${index} key ${keys}`,
            );
        }
    }
});
