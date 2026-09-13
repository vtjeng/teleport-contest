// Source-pinned pure predicates from apply.c check_jump() and
// get_valid_jump_position(). The expected terrain outcomes come directly from
// apply.c:1862-1883 and 1959-1964; no recorded session is needed for these
// functions because they only inspect their arguments and map state.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    D_CLOSED,
    D_ISOPEN,
    DOOR,
    IN_SIGHT,
    JUMPING,
    ROOM,
    STONE,
} from '../js/const.js';
import {
    check_jump,
    get_valid_jump_position,
} from '../js/apply.js';
import { GameMap } from '../js/game.js';

function makeState() {
    const level = new GameMap();
    const viz_array = Array.from(
        { length: 21 },
        () => Uint32Array.from({ length: 80 }, () => IN_SIGHT),
    );
    for (let x = 1; x < 80; ++x) {
        for (let y = 0; y < 21; ++y)
            level.at(x, y).typ = ROOM;
    }
    return {
        level,
        viz_array,
        u: {
            ux: 10,
            uy: 10,
            uprops: { [JUMPING]: { intrinsic: 0, extrinsic: 0 } },
        },
        gj: { jumping_is_magic: 0 },
        youmonst: { data: { mflags2: 0 } },
    };
}

test('check_jump rejects solid walls and closed doors', () => {
    const state = makeState();
    state.level.at(11, 10).typ = STONE;
    assert.equal(check_jump(0, 11, 10, state), false);

    state.level.at(11, 10).typ = DOOR;
    state.level.at(11, 10).doormask = D_CLOSED;
    assert.equal(check_jump(0, 11, 10, state), false);
});

test('get_valid_jump_position keeps the Knight distance and accessibility rules', async () => {
    const state = makeState();
    assert.equal(await get_valid_jump_position(12, 11, state), true);
    state.level.at(12, 11).typ = STONE;
    assert.equal(await get_valid_jump_position(12, 11, state), false);

    state.level.at(11, 10).typ = DOOR;
    state.level.at(11, 10).doormask = D_ISOPEN;
    state.level.at(11, 10).horizontal = true;
    assert.equal(await get_valid_jump_position(11, 10, state), false);
});
