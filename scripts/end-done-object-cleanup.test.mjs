import assert from 'node:assert/strict';
import test from 'node:test';

import {
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    ROOM,
} from '../js/const.js';
import { done_object_cleanup } from '../js/end.js';
import { GameMap } from '../js/game.js';
import { newObject } from '../js/obj.js';

function cleanupState({ ux = 2, uy = 2, dx = 1, dy = 0 } = {}) {
    const level = new GameMap();
    level.at(ux, uy).typ = ROOM;
    if (level.at(ux + dx, uy + dy))
        level.at(ux + dx, uy + dy).typ = ROOM;
    return {
        u: { ux, uy, dx, dy },
        iflags: { perm_invent: true },
        invent: null,
        level,
    };
}

test('done_object_cleanup consumes in-use inventory and settles a free throw',
    () => {
        const state = cleanupState();
        const active = newObject({
            // A one-item ordinary inventory stack exercises useupall().
            where: OBJ_INVENT,
            in_use: true,
            quan: 1,
        });
        const thrown = newObject({
            // done_object_cleanup() places only objects still in OBJ_FREE.
            where: OBJ_FREE,
            quan: 1,
        });
        state.invent = active;
        state.thrownobj = thrown;

        done_object_cleanup(state);

        assert.equal(active.where, OBJ_DELETED);
        assert.equal(state.invent, null);
        assert.equal(thrown.where, OBJ_FLOOR);
        assert.equal(thrown.ox, 3);
        assert.equal(thrown.oy, 2);
        assert.equal(state.level.objects[3][2], thrown);
        assert.equal(state.level.objlist, thrown);
        assert.equal(state.thrownobj, null);
        assert.equal(state.iflags.perm_invent, false);
    });

test('done_object_cleanup falls back to the hero square and clears grouped kicks',
    () => {
        const state = cleanupState({ ux: 1, uy: 1, dx: -1, dy: 0 });
        const kicked = newObject({
            // x=0 is outside isok(); C uses u.ux,u.uy as the fallback.
            where: OBJ_FREE,
            quan: 1,
        });
        state.gk = { kickedobj: kicked };

        done_object_cleanup(state);

        assert.equal(kicked.where, OBJ_FLOOR);
        assert.equal(kicked.ox, 1);
        assert.equal(kicked.oy, 1);
        assert.equal(state.level.objects[1][1], kicked);
        assert.equal(state.gk.kickedobj, null);
    });

test('done_object_cleanup leaves non-free transit objects in place', () => {
    const state = cleanupState();
    const floorObject = newObject({ where: OBJ_FLOOR, ox: 2, oy: 2 });
    state.gt = { thrownobj: floorObject };

    done_object_cleanup(state);

    assert.equal(state.gt.thrownobj, floorObject);
    assert.equal(floorObject.where, OBJ_FLOOR);
});
