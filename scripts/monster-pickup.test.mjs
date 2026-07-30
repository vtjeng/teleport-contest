import assert from 'node:assert/strict';
import test from 'node:test';

import { OBJ_MINVENT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { FOOD_RATION } from '../js/objects.js';
import { loadMonsterPickupRecipe } from './run-monster-pickup.mjs';

// The matrix drives the hero with the search command and the four orthogonal
// movement commands; nothing else is bound in these segments.
const SEGMENT_KEYS = new Set(['s', 'h', 'j', 'k', 'l']);

function untamedMonsters() {
    const monsters = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        if (!monster.mtame) monsters.push(monster);
    return monsters;
}

function carried(monster, otyp) {
    for (let obj = monster.minvent; obj; obj = obj.nobj)
        if (obj.otyp === otyp) return obj;
    return null;
}

test('monster-pickup matrix contains only source-selected inputs', () => {
    const recipe = loadMonsterPickupRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 9);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // A starting pet cannot reach mpickstuff(), and its own carry arm
        // belongs to scripts/run-pet-pickup.mjs.
        assert.match(segment.nethackrc, /pettype:none/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment spends its turns on search or a step',
        );
    }
    // Both pline() gates in mpickstuff() need a segment: flags.verbose decides
    // whether the line prints at all, and accessiblemsg decides whether
    // pline_mon()'s coordinate prefix precedes it.
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('!verbose'),
        ).length,
        1,
    );
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('accessiblemsg'),
        ).length,
        1,
    );
});

test('every matrix segment replays to its last key', async () => {
    // The port emits one screen per consumed key plus the opening prompt, so
    // a segment that stops early emits fewer. Each of these segments was
    // sized to the boundary the port reaches, and before mpickstuff() landed
    // several of them stopped on the turn of the pickup instead.
    const { segments } = loadMonsterPickupRecipe();
    for (const [index, segment] of segments.entries()) {
        const replay = await runSegment(segment);
        assert.equal(
            replay.getScreens().length,
            segment.moves.length + 1,
            `segment ${index} emits one screen per key plus the first prompt`,
        );
    }
});

test('the visible base segment ends on a monster holding the ration',
    async () => {
        // Segment 0 is the case the matrix exists for: a goblin lifts a food
        // ration on a square the hero can see. Pinning the object here keeps
        // the screen-count test above from being the only thing that would
        // notice mpickstuff() quietly declining to carry anything.
        const [base] = loadMonsterPickupRecipe().segments;
        await runSegment(base);

        const carriers = untamedMonsters()
            .filter((monster) => carried(monster, FOOD_RATION));
        assert.equal(carriers.length, 1);
        const ration = carried(carriers[0], FOOD_RATION);
        assert.equal(ration.where, OBJ_MINVENT);
        assert.equal(ration.ocarry, carriers[0]);
        // obj_extract_self() unlinked it from the level list as well as from
        // the pile, so nothing on the floor can reach it any more.
        for (let obj = game.level.objlist; obj; obj = obj.nobj)
            assert.notEqual(obj, ration);
    });
