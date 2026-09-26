import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { doapply } from '../js/apply.js';
import { ECMD_TIME, HOMEMADE_TIN, OBJ_INVENT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_LICHEN, PM_NEWT } from '../js/monsters.js';
import { CORPSE, TIN, TINNING_KIT } from '../js/objects.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/apply.c/tinning-kit-lichen-floor-independent.session.json',
    import.meta.url,
), 'utf8'));
const floorRecipe = JSON.parse(readFileSync(new URL(
    '../recipes/apply.c/tinning-kit-newt-independent.session.json',
    import.meta.url,
), 'utf8'));

function inventoryObjects(state = game) {
    const objects = [];
    for (let object = state.invent; object; object = object.nobj)
        objects.push(object);
    return objects;
}

function inventoryObject(otyp, state = game) {
    const object = inventoryObjects(state).find((item) => item.otyp === otyp);
    assert.ok(object, `inventory contains object type ${otyp}`);
    return object;
}

test('doapply tins an inventory corpse and consumes one kit charge',
    async () => {
        await runSegment(recipe.segments[0]);

        const kit = inventoryObject(TINNING_KIT);
        const tin = inventoryObject(TIN);
        assert.equal(kit.spe, 51);
        assert.equal(tin.corpsenm, PM_LICHEN);
        assert.equal(tin.spe, -(HOMEMADE_TIN + 1));
        assert.equal(tin.known, true);
        assert.equal(tin.where, OBJ_INVENT);
        assert.equal(
            inventoryObjects().some((object) => object.otyp === CORPSE),
            false,
        );
    });

test('doapply tins a floor corpse through useupf', async () => {
    await runSegment(floorRecipe.segments[0]);

    const kit = inventoryObject(TINNING_KIT);
    const tin = inventoryObject(TIN);
    assert.equal(kit.spe, 84);
    assert.equal(tin.corpsenm, PM_NEWT);
    assert.equal(tin.spe, -(HOMEMADE_TIN + 1));
    assert.equal(tin.known, true);
    assert.equal(tin.where, OBJ_INVENT);
    const floor = game.level.objects[game.u.ux]?.[game.u.uy] ?? null;
    let corpseRemainsOnFloor = false;
    for (let object = floor; object; object = object.nexthere)
        corpseRemainsOnFloor ||= object.otyp === CORPSE;
    assert.equal(corpseRemainsOnFloor, false);
});

test('doapply reports an exhausted tinning kit without selecting a corpse',
    async () => {
        await runSegment({
            ...recipe.segments[0],
            moves: '\u0017tinning kit\n',
        });
        const kit = inventoryObject(TINNING_KIT);
        kit.spe = 0;
        game.nhDisplay.pushKey(' '.charCodeAt(0)); // dismiss wish message
        game.nhDisplay.pushKey(kit.invlet.charCodeAt(0));

        assert.equal(await doapply(game), ECMD_TIME);
        assert.equal(game._pending_message, 'You seem to be out of tins.');
        assert.equal(kit.spe, 0);
    });
