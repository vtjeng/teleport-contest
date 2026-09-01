// End-to-end assertions for the bounded wizard Plane-of-Fire level-teleport
// branch. The runner beside this test compares the same replay inputs with C;
// these assertions pin the state changes that a terminal trace cannot show.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACH_AMUL,
    FIRE_TRAP,
    MAGIC_PORTAL,
    OBJ_INVENT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { AMULET_OF_YENDOR, BOULDER } from '../js/objects.js';
import {
    FIRE_PLANE_DATETIME,
    FIRE_PLANE_MOVES,
    FIRE_PLANE_NETHACKRC,
    FIRE_PLANE_SEED,
    loadWizardFirePlaneTeleRecipe,
} from './run-wizard-fire-level-tele.mjs';

function inventoryObjects() {
    const objects = [];
    for (let obj = game.invent; obj; obj = obj.nobj) objects.push(obj);
    return objects;
}

function floorObjects() {
    const objects = [];
    for (const column of game.level.objects) {
        for (let head of column) {
            for (let obj = head; obj; obj = obj.nexthere)
                objects.push(obj);
        }
    }
    return objects;
}

test('the recipe is the fresh wizard Plane-of-Fire menu case', () => {
    const recipe = loadWizardFirePlaneTeleRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    assert.equal(recipe.segments[0].seed, FIRE_PLANE_SEED);
    assert.equal(recipe.segments[0].datetime, FIRE_PLANE_DATETIME);
    assert.equal(recipe.segments[0].nethackrc, FIRE_PLANE_NETHACKRC);
    assert.equal(recipe.segments[0].moves, FIRE_PLANE_MOVES);
    assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
    assert.equal(FIRE_PLANE_MOVES.match(/\x16/gu).length, 1);
    assert.equal(FIRE_PLANE_MOVES.match(/L/gu).length, 1);
});

test('wizard Plane-of-Fire teleport creates the prerequisite and arrives',
    async () => {
        const [segment] = loadWizardFirePlaneTeleRecipe().segments;
        await runSegment(segment);

        assert.deepEqual(game.u.uz, game.fire_level);
        assert.equal(game.u.uhave.amulet, 1);
        assert.ok(game.u.uachieved.includes(ACH_AMUL));

        const amulets = inventoryObjects().filter(
            (obj) => obj.otyp === AMULET_OF_YENDOR,
        );
        assert.equal(amulets.length, 1);
        assert.equal(amulets[0].where, OBJ_INVENT);
        assert.match(amulets[0].invlet, /^[a-zA-Z]$/u);
        assert.ok(amulets[0].o_id > 0);

        assert.equal(game.level.flags.noteleport, true);
        assert.equal(game.level.flags.hardfloor, true);
        assert.equal(game.level.flags.shortsighted, true);
        assert.equal(game.level.flags.temperature, 1);
        assert.equal(game.level.flags.fumaroles, true);
        assert.ok(game.level.traps.some(
            (trap) => trap.ttyp === MAGIC_PORTAL
                && trap.dst?.dnum === 7
                && trap.dst?.dlevel === 2,
        ));
        assert.ok(game.level.traps.some(
            (trap) => trap.ttyp === FIRE_TRAP,
        ));
        assert.equal(
            floorObjects()
                .filter((obj) => obj.otyp === BOULDER)
                .reduce((total, obj) => total + obj.quan, 0),
            5,
        );

        assert.match(
            game._ttyToplines,
            /Endgame prerequisite: [a-zA-Z] - the Amulet of Yendor\./u,
        );
        assert.match(game._ttyToplines, /You hear a (?:loud )?whoosh!/u);
    });
