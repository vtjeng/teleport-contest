import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DOOR,
    IN_SIGHT,
    ROOMOFFSET,
    SHOPBASE,
    SVALL,
} from '../js/const.js';
import { add_damage } from '../js/shk.js';

const C_SHK = readFileSync('nethack-c/upstream/src/shk.c', 'utf8');
const JS_SHK = readFileSync('js/shk.js', 'utf8');

function shopState({ typ, flags = 0, roomno = 0, keeper = null, seen = false }) {
    const location = { typ, flags, roomno, seenv: 0 };
    const level = {
        rooms: keeper ? [{ rtype: SHOPBASE, resident: keeper }] : [],
        damagelist: null,
        at: () => location,
    };
    return {
        level,
        moves: 41,
        viz_array: seen ? [[IN_SIGHT]] : [],
    };
}

function shopKeeper(x, y) {
    return {
        isshk: true,
        mpeaceful: true,
        mextra: { eshk: { shd: { x, y } } },
    };
}

test('add_damage follows shk.c guard, accumulation and new-record order', () => {
    const cBody = C_SHK.match(
        /void\s+add_damage\s*\(\s*coordxy x,\s*coordxy y,\s*long cost\s*\)\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    assert.ok(cBody, 'the complete C add_damage definition is present');
    assert.match(cBody, /IS_DOOR\(levl\[x\]\[y\]\.typ\)/u);
    assert.match(cBody, /shop_keeper\(\*shops\)/u);
    assert.match(cBody, /ESHK\(mtmp\)->shd\.x\s*&&\s*y\s*==\s*ESHK\(mtmp\)->shd\.y/u);
    assert.match(cBody, /tmp_dam->cost\s*\+=\s*cost;\s*tmp_dam->when\s*=\s*svm\.moves;/u);
    assert.match(cBody, /tmp_dam->typ\s*=\s*levl\[x\]\[y\]\.typ;[\s\S]*tmp_dam->flags\s*=\s*levl\[x\]\[y\]\.flags;/u);
    assert.match(cBody, /if \(cansee\(x, y\)\)\s*levl\[x\]\[y\]\.seenv\s*=\s*SVALL;/u);
    assert.match(JS_SHK, /export function add_damage\(x, y, cost, state = game\)/u);

    const state = shopState({ typ: 42, flags: 7 });
    state.viz_array = Array.from({ length: 9 }, () => Array(5).fill(0));
    state.viz_array[8][4] = IN_SIGHT;
    add_damage(4, 8, 25, state);
    const first = state.level.damagelist;
    assert.deepEqual(first, {
        when: 41,
        place: { x: 4, y: 8 },
        cost: 25,
        typ: 42,
        flags: 7,
        next: null,
    });
    assert.equal(state.level.at(4, 8).seenv, SVALL);

    state.moves = 44;
    add_damage(4, 8, 9, state);
    assert.equal(state.level.damagelist, first);
    assert.equal(first.cost, 34);
    assert.equal(first.when, 44);
});

test('add_damage records a real shop door but ignores other doors', () => {
    const outside = shopState({ typ: DOOR, flags: 3 });
    add_damage(2, 3, 400, outside);
    assert.equal(outside.level.damagelist, null);

    const keeper = shopKeeper(2, 3);
    const state = shopState({
        typ: DOOR,
        flags: 5,
        roomno: ROOMOFFSET,
        keeper,
    });
    add_damage(2, 3, 400, state);
    assert.equal(state.level.damagelist?.cost, 400);
    assert.equal(state.level.damagelist?.flags, 5);

    const otherDoor = shopState({
        typ: DOOR,
        roomno: ROOMOFFSET,
        keeper: shopKeeper(8, 9),
    });
    add_damage(2, 3, 400, otherDoor);
    assert.equal(otherDoor.level.damagelist, null);
});
