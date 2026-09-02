import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARROW_TRAP,
    LAVAPOOL,
    MAGIC_PORTAL,
    OBJ_DELETED,
    POOL,
    STONE,
    VIBRATING_SQUARE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { map_cleanup } from '../js/mklev.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { newObject, place_object } from '../js/obj.js';
import {
    BOULDER,
    ROCK_CLASS,
    objects_globals_init,
} from '../js/objects.js';

function cleanupState() {
    const state = resetGame();
    state.context = { ident: 2, mon_moving: false };
    state.flags = {};
    state.program_state = { gameover: false };
    state.level = new GameMap();
    objects_globals_init(state);
    return state;
}

function boulder() {
    return newObject({
        oclass: ROCK_CLASS,
        otyp: BOULDER,
        quan: 1,
    });
}

test('map_cleanup removes liquid-cell boulders, traps, and engravings', () => {
    const state = cleanupState();
    state.level.at(10, 5).typ = POOL;
    state.level.at(11, 5).typ = LAVAPOOL;
    state.level.at(12, 5).typ = STONE;

    const poolBoulder = boulder();
    const secondPoolBoulder = boulder();
    const lavaBoulder = boulder();
    const dryBoulder = boulder();
    const objectEnv = objectGenerationEnv({ state });
    place_object(poolBoulder, 10, 5, objectEnv);
    place_object(secondPoolBoulder, 10, 5, objectEnv);
    place_object(lavaBoulder, 11, 5, objectEnv);
    place_object(dryBoulder, 12, 5, objectEnv);

    const poolTrap = { tx: 10, ty: 5, ttyp: ARROW_TRAP };
    const portal = { tx: 11, ty: 5, ttyp: MAGIC_PORTAL };
    const vibratingSquare = {
        tx: 10,
        ty: 5,
        ttyp: VIBRATING_SQUARE,
    };
    const dryTrap = { tx: 12, ty: 5, ttyp: ARROW_TRAP };
    state.level.traps = [poolTrap, portal, vibratingSquare, dryTrap];
    state.head_engr = {
        engr_x: 10,
        engr_y: 5,
        nxt_engr: { engr_x: 12, engr_y: 5, nxt_engr: null },
    };

    map_cleanup(state);

    assert.equal(state.level.objects[10][5], null);
    assert.equal(state.level.objects[11][5], null);
    assert.equal(state.level.objects[12][5], dryBoulder);
    assert.equal(poolBoulder.where, OBJ_DELETED);
    assert.equal(secondPoolBoulder.where, OBJ_DELETED);
    assert.equal(lavaBoulder.where, OBJ_DELETED);
    assert.deepEqual(state.level.traps, [
        portal,
        vibratingSquare,
        dryTrap,
    ]);
    assert.deepEqual(state.head_engr, {
        engr_x: 12,
        engr_y: 5,
        nxt_engr: null,
    });
});
