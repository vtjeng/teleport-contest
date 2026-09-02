import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { OBJ_FLOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_MINOTAUR } from '../js/monsters.js';
import { sobj_at } from '../js/obj.js';
import { BOULDER } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';

function loadRecipe(
    path = 'recipes/castle-stocked-maze-boulder.session.json',
    label = 'Castle stocked-maze boulder recipe',
) {
    const data = JSON.parse(readFileSync(
        path,
        'utf8',
    ));
    return validateCleanRecipe(data, label);
}

test('Castle stocked mazewalk links boulders through the vision hook',
    async () => {
        const recipe = loadRecipe();
        assert.equal(recipe.segments.length, 1);

        // The recipe now reaches input exhaustion after the Castle's
        // source-owned ambient sound branches. place_object() resolves
        // blockPoint before it links a boulder, so the floor-boulder checks
        // below prove that the stocked mazewalk supplied and ran the vision
        // owner.
        let boundary;
        await runSegment(recipe.segments[0], {
            onBoundary: (error) => { boundary = error; },
        });
        assert.equal(boundary, undefined);

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

test('Castle stocked mazes place their explicit minotaur pair', async () => {
    const recipe = loadRecipe(
        'recipes/seed0360-wizard-world-tour-castle-minotaur.session.json',
        'Castle minotaur recipe',
    );
    assert.equal(recipe.segments.length, 1);

    let boundary;
    await runSegment(recipe.segments[0], {
        onBoundary: (error) => { boundary = error; },
    });

    assert.equal(game.u.uz.dnum, 0);
    assert.equal(game.u.uz.dlevel, 25);
    assert.notEqual(
        boundary?.message,
        'unsupported initial-level monster creation: monster 177',
    );

    const minotaurs = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        if (monster.data?.pmidx === PM_MINOTAUR) minotaurs.push(monster);
    }
    assert.equal(minotaurs.length, 2);
});
