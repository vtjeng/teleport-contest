import assert from 'node:assert/strict';
import test from 'node:test';

import { COLNO, DOOR, D_CLOSED, D_ISOPEN, ROWNO } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadMonsterDoorOpenRecipe } from './run-monster-door-open.mjs';

// Every segment spends its whole turn budget on the search command, so the
// hero never moves and every recorded difference belongs to a monster.
const SEGMENT_KEYS = new Set(['s']);

function doorMasks() {
    const masks = new Map();
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const location = game.level.at(x, y);
            if (location?.typ !== DOOR) continue;
            masks.set(`${x},${y}`, location.flags || location.doormask || 0);
        }
    }
    return masks;
}

test('monster-door-open matrix contains only source-selected inputs', () => {
    const recipe = loadMonsterDoorOpenRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 8);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment spends its turns on the search command',
        );
    }
    // The three gates that can silence monmove.c:1583-1591 each get exactly
    // one segment, and the rest leave every gate at its default so that the
    // feedback line is printed.
    for (const option of ['!acoustics', 'deaf', '!verbose']) {
        assert.equal(
            recipe.segments.filter(
                ({ nethackrc }) => nethackrc.includes(`OPTIONS=${option}\n`),
            ).length,
            1,
            option,
        );
    }
});

test('every matrix segment opens a closed door and replays to its last key',
    async () => {
        // The port emits one screen per consumed key plus the opening prompt,
        // so a segment that stops early emits fewer. Before this behavior
        // landed, every one of these segments stopped on the turn a monster
        // stepped onto a closed door.
        const { segments } = loadMonsterDoorOpenRecipe();
        for (const [index, segment] of segments.entries()) {
            await runSegment({ ...segment, moves: '' });
            const before = doorMasks();

            const replay = await runSegment(segment);
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `segment ${index} emits one screen per key plus the prompt`,
            );

            const opened = [...doorMasks()].filter(
                ([key, mask]) => before.get(key) === D_CLOSED
                    && mask === D_ISOPEN,
            );
            assert.ok(
                opened.length > 0,
                `segment ${index} leaves a door open that started closed`,
            );
        }
    });
