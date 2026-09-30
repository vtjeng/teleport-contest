import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ROOM } from '../js/const.js';
import { display_binventory, only_here } from '../js/invent.js';

const INVENT_C = readFileSync(
    new URL('../nethack-c/upstream/src/invent.c', import.meta.url), 'utf8',
);

test('only_here reads C go.only and matches only its target square', () => {
    // The target (5,9) is the C go.only value; the second object differs in x
    // to pin the rejecting arm without relying on a runtime-selected square.
    const state = { go: { only: { x: 5, y: 9 } } };
    const target = { ox: 5, oy: 9 };
    const elsewhere = { ox: 4, oy: 9 };
    assert.ok(INVENT_C.includes(
        'return (obj->ox == go.only.x && obj->oy == go.only.y);',
    ));
    assert.equal(only_here(target, state), true);
    assert.equal(only_here(elsewhere, state), false);
});

test('display_binventory returns zero on an empty ordinary floor square', async () => {
    // The arbitrary in-bounds target (2,3) is a ROOM with no floor or buried
    // objects; C's down-probe continuation then reaches the no-find result.
    const state = {
        level: {
            at: () => ({ typ: ROOM }),
            buriedobjlist: null,
            objects: [],
        },
        u: { uinwater: false },
    };
    assert.equal(await display_binventory(2, 3, true, state), 0);
});

test('display_binventory owns go.only only while querying buried objects', async () => {
    // The target square (2,3) is a ROOM with one buried object. Its ox getter
    // returns the square once for the count, then records the C temp filter
    // during query_objlist and excludes the row so no menu/window is needed.
    const filterDuringQuery = [];
    let oxReads = 0;
    const state = {
        go: { only: { x: 0, y: 0 } },
        level: {
            at: () => ({ typ: ROOM }),
            buriedobjlist: null,
            objects: [],
        },
        u: { uinwater: false },
    };
    const buried = {
        nobj: null,
        get ox() {
            ++oxReads;
            if (oxReads === 1) return 2;
            filterDuringQuery.push({ ...state.go.only });
            return -1;
        },
        oy: 3,
    };
    state.level.buriedobjlist = buried;

    // C assigns go.only immediately before the query and zeros both fields
    // after it; the callback observation below pins that order in JS.
    assert.ok(INVENT_C.includes('go.only.x = x;\n        go.only.y = y;'));
    assert.ok(INVENT_C.includes('go.only.x = go.only.y = 0;'));
    assert.equal(await display_binventory(2, 3, false, state), 1);
    assert.deepEqual(filterDuringQuery, [{ x: 2, y: 3 }]);
    assert.deepEqual(state.go.only, { x: 0, y: 0 });
});
