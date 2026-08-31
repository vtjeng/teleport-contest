import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ERODE_BURN,
    ERODE_CORRODE,
    ERODE_CRACK,
    ERODE_NONE,
    ERODE_ROT,
    ERODE_RUST,
    W_ARM,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    BRONZE_PLATE_MAIL,
    CRYSTAL_PLATE_MAIL,
    DWARVISH_MITHRIL_COAT,
    IRON_SHOES,
    LEATHER_ARMOR,
    SCR_DESTROY_ARMOR,
    WHITE_DRAGON_SCALE_MAIL,
} from '../js/objects.js';
import { obj_erode_type } from '../js/do_wear.js';
import { objectType } from '../js/obj.js';
import { loadReadDestroyArmorRecipe } from './run-read-destroy-armor.mjs';

function inventorySnapshot(state = game) {
    const objects = [];
    for (let obj = state.invent; obj; obj = obj.nobj) objects.push(obj);
    return objects;
}

function typedObject(otyp, state = game) {
    return {
        otyp,
        oclass: objectType({ otyp }, state).oc_class,
    };
}

test('destroy armor erodes the one worn suit twice and consumes its scroll',
    async () => {
    const replay = await runSegment(loadReadDestroyArmorRecipe().segments[0]);
    const armor = inventorySnapshot().find((obj) => obj.invlet === 'e');

    assert.equal(armor?.otyp, LEATHER_ARMOR);
    assert.equal(armor?.owornmask, W_ARM);
    assert.equal(armor?.oeroded, 2);
    assert.equal(
        inventorySnapshot().some((obj) => obj.otyp === SCR_DESTROY_ARMOR),
        false,
    );

    // The selected fresh seed has the source sequence rn2(19), rn2(4)=1,
    // followed by one-item selection for both erosion hits.
    const rng = replay.getRngLog();
    const effect = rng.findIndex((value, index) => (
        value === 'rn2(19)=13'
        && rng.slice(index, index + 5).join('|')
            === 'rn2(19)=13|rn2(4)=1|rn2(1)=0|rn2(1)=0|rn2(19)=6'
    ));
    assert.notEqual(effect, -1);
});

test('obj_erode_type preserves the C predicate order', async () => {
    await runSegment({
        ...loadReadDestroyArmorRecipe().segments[0],
        moves: '.',
    });

    assert.equal(obj_erode_type(typedObject(LEATHER_ARMOR)), ERODE_BURN);
    assert.equal(obj_erode_type(typedObject(IRON_SHOES)), ERODE_RUST);
    assert.equal(
        obj_erode_type(typedObject(CRYSTAL_PLATE_MAIL)),
        ERODE_CRACK,
    );
    assert.equal(
        obj_erode_type(typedObject(WHITE_DRAGON_SCALE_MAIL)),
        ERODE_ROT,
    );
    assert.equal(
        obj_erode_type(typedObject(BRONZE_PLATE_MAIL)),
        ERODE_CORRODE,
    );
    assert.equal(
        obj_erode_type(typedObject(DWARVISH_MITHRIL_COAT)),
        ERODE_NONE,
    );
});
