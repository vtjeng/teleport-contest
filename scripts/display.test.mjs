import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BLINDED,
    DETECT_MONSTERS,
    IN_SIGHT,
    SEE_INVIS,
    TELEPAT,
} from '../js/const.js';
import { knowninvisible, see_nearby_objects } from '../js/display.js';
import { GameMap } from '../js/game.js';
import { init_objects } from '../js/o_init.js';
import { game } from '../js/gstate.js';
import { POT_HEALING, POTION_CLASS } from '../js/objects.js';
import { GLYPH_OBJ_OFF } from '../js/glyph_offsets.js';

function nearbyObjectState() {
    const state = {
        u: { ux: 10, uy: 10, xray_range: 0, uprops: [] },
        level: new GameMap(),
        viz_array: Array.from({ length: 24 }, () => new Uint8Array(80)),
    };
    init_objects(state, () => 0);
    const object = {
        otyp: POT_HEALING,
        ox: 11,
        oy: 10,
        dknown: false,
    };
    state.level.objects[object.ox][object.oy] = object;
    // C's object-class glyph is generic before close observation.
    state.level.at(object.ox, object.oy).remembered_glyph = {
        glyph: GLYPH_OBJ_OFF + POTION_CLASS,
    };
    // The 11,10 square is one cardinal step from the 10,10 hero; IN_SIGHT
    // makes display.c:see_nearby_objects take its observation arm.
    state.viz_array[object.oy][object.ox] = IN_SIGHT;
    return { state, object };
}

function invisibleState() {
    const state = {
        u: { ux: 10, uy: 10, uprops: [] },
        viz_array: [],
    };
    return state;
}

test('knowninvisible uses visible see-invisible and monster-detection senses', () => {
    // display.h:_knowninvisible() is pure: it reads minvis, cansee, three
    // properties, and the squared bolt-range distance without changing state.
    const state = invisibleState();
    const monster = { mx: 12, my: 13, minvis: true };
    state.viz_array[13] = [];
    state.viz_array[13][12] = IN_SIGHT;

    state.u.uprops[SEE_INVIS] = { intrinsic: 1, extrinsic: 0 };
    assert.equal(knowninvisible(monster, state), true);
    state.u.uprops[SEE_INVIS] = { intrinsic: 0, extrinsic: 0 };
    state.u.uprops[DETECT_MONSTERS] = { intrinsic: 0, extrinsic: 1 };
    assert.equal(knowninvisible(monster, state), true);
    monster.minvis = false;
    assert.equal(knowninvisible(monster, state), false);
});

test('knowninvisible requires unblinded extrinsic telepathy within bolt range', () => {
    // display.h uses ETelepat (not intrinsic blind telepathy) and mdistu <=
    // BOLT_LIM squared; hack.h defines mdistu() with squared Euclidean range.
    const state = invisibleState();
    const monster = { mx: 16, my: 14, minvis: true };
    state.u.uprops[TELEPAT] = { intrinsic: 0, extrinsic: 1 };
    assert.equal(knowninvisible(monster, state), true);

    monster.mx = 17;
    assert.equal(knowninvisible(monster, state), false);
    monster.mx = 16;
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    assert.equal(knowninvisible(monster, state), false);

    state.u.uprops[TELEPAT] = { intrinsic: 1, extrinsic: 0 };
    state.u.uprops[BLINDED] = null;
    assert.equal(knowninvisible(monster, state), false);
});

test('planned nearby-object observation mutates only its supplied state', () => {
    const cDisplay = readFileSync(
        new URL('../nethack-c/upstream/src/display.c', import.meta.url),
        'utf8',
    );
    const cOInit = readFileSync(
        new URL('../nethack-c/upstream/src/o_init.c', import.meta.url),
        'utf8',
    );
    const jsDisplay = readFileSync(
        new URL('../js/display.js', import.meta.url),
        'utf8',
    );
    const cStart = cDisplay.indexOf('\nsee_nearby_objects(void)');
    const cEnd = cDisplay.indexOf('\n/*\n * Update hallucinated traps', cStart);
    assert.ok(cStart >= 0 && cEnd > cStart,
        'the complete C nearby-object helper is available');
    assert.match(cDisplay.slice(cStart, cEnd),
        /observe_object\(obj\);[\s\S]*?glyph_is_generic_object\(glyph\)[\s\S]*?newsym_force\(ix, iy\);/u);
    const observeStart = cOInit.indexOf('\nobserve_object(struct obj *obj)');
    const observeEnd = cOInit.indexOf('\nvoid\ndiscover_object', observeStart);
    assert.ok(observeStart >= 0 && observeEnd > observeStart,
        'the complete C object-observation helper is available');
    assert.match(cOInit.slice(observeStart, observeEnd),
        /obj->dknown = 1;\s*discover_object\(oindx, FALSE, TRUE, FALSE\);/u);
    assert.match(jsDisplay,
        /observe_object\(object, state\);[\s\S]*?redrawCell\(ix, iy, state\);/u);
    assert.match(jsDisplay,
        /state !== game && typeof redraw !== 'function'[\s\S]*?newsym\(x, y\)/u);

    const { state, object } = nearbyObjectState();
    // With no explicit redraw owner, a foreign state remains guarded before
    // C's observation writes; only the planning caller can opt into a seam.
    assert.throws(
        () => see_nearby_objects(state),
        /redraws the global game/u,
    );
    const redraws = [];
    see_nearby_objects(state, {
        redraw: (x, y, target) => {
            redraws.push({ x, y, target, dknown: object.dknown,
                encountered: target.objects[POT_HEALING].oc_encountered,
                discovered: target.svd.disco.includes(POT_HEALING) });
        },
    });
    assert.equal(object.dknown, true);
    assert.equal(state.objects[POT_HEALING].oc_encountered, 1);
    assert.ok(state.svd.disco.includes(POT_HEALING));
    assert.deepEqual(redraws, [{
        x: 11,
        y: 10,
        target: state,
        dknown: true,
        encountered: 1,
        discovered: true,
    }]);
    assert.equal(game.objects?.[POT_HEALING]?.oc_encountered, undefined,
        'clone discovery does not write through to the live game');
});
