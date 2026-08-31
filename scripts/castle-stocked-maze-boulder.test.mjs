import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { OBJ_FLOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { sobj_at } from '../js/obj.js';
import { BOULDER } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';

function loadRecipe() {
    const data = JSON.parse(readFileSync(
        'recipes/castle-stocked-maze-boulder.session.json',
        'utf8',
    ));
    return validateCleanRecipe(data, 'Castle stocked-maze boulder recipe');
}

test('Castle stocked mazewalk links boulders through the vision hook',
    async () => {
        const recipe = loadRecipe();
        assert.equal(recipe.segments.length, 1);

        let boundary;
        await runSegment(recipe.segments[0], {
            onBoundary: (error) => { boundary = error; },
        });

        // The optional minotaur is the next independent fill_empty_maze()
        // boundary for this seed. place_object() resolves blockPoint before it
        // links a boulder, so reaching this boundary with floor boulders proves
        // that the stocked mazewalk supplied and ran the vision owner.
        assert.equal(
            boundary?.message,
            'unsupported initial-level monster creation: monster 177',
        );

        const boulders = [];
        for (let obj = game.level.objlist; obj; obj = obj.nobj) {
            if (obj.otyp === BOULDER) boulders.push(obj);
        }
        assert.ok(boulders.length > 0, 'stocked mazewalk should place boulders');

        const locations = new Set();
        for (const boulder of boulders) {
            assert.equal(boulder.where, OBJ_FLOOR);
            assert.equal(
                sobj_at(BOULDER, boulder.ox, boulder.oy, game),
                boulder,
            );
            locations.add(`${boulder.ox},${boulder.oy}`);
        }
        assert.equal(
            locations.size,
            boulders.length,
            'the fresh case should keep the no-existing-boulder precondition',
        );
    });
