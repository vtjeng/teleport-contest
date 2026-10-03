import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DRAWBRIDGE_UP,
    ICE,
    LAVAPOOL,
    LAVAWALL,
    MOAT,
    POOL,
    WATER,
} from '../js/const.js';
import {
    is_ice,
    is_lava,
    is_moat,
    is_pool_or_lava,
    is_waterwall,
} from '../js/dbridge.js';

const DBRIDGE_C = readFileSync(
    new URL('../nethack-c/upstream/src/dbridge.c', import.meta.url), 'utf8',
);

function levelState(cells, overrides = {}) {
    return {
        ...overrides,
        level: {
            at(x, y) { return cells.get(`${x},${y}`); },
        },
    };
}

test('dbridge terrain predicates retain the C source guards and bridge surfaces', () => {
    assert.match(DBRIDGE_C,
        /is_waterwall\(coordxy x, coordxy y\)[\s\S]*?isok\(x, y\) && IS_WATERWALL\(levl\[x\]\[y\]\.typ\)/u);
    assert.match(DBRIDGE_C,
        /is_lava\(coordxy x, coordxy y\)[\s\S]*?ltyp == LAVAPOOL \|\| ltyp == LAVAWALL[\s\S]*?drawbridgemask & DB_UNDER\) == DB_LAVA/u);
    assert.match(DBRIDGE_C,
        /is_pool_or_lava\(coordxy x, coordxy y\)[\s\S]*?is_pool\(x, y\) \|\| is_lava\(x, y\)/u);
    assert.match(DBRIDGE_C,
        /is_ice\(coordxy x, coordxy y\)[\s\S]*?ltyp == ICE[\s\S]*?drawbridgemask & DB_UNDER\) == DB_ICE/u);
    assert.match(DBRIDGE_C,
        /is_moat\(coordxy x, coordxy y\)[\s\S]*?!Is_juiblex_level\(&u\.uz\)[\s\S]*?ltyp == MOAT[\s\S]*?drawbridgemask & DB_UNDER\) == DB_MOAT/u);

    const cells = new Map([
        ['1,1', { typ: WATER }],
        ['2,1', { typ: LAVAPOOL }],
        ['3,1', { typ: LAVAWALL }],
        ['4,1', { typ: ICE }],
        // DB_UNDER is a mask; the packed field stores the surface value bits.
        ['5,1', { typ: DRAWBRIDGE_UP, flags: DB_LAVA }],
        ['6,1', { typ: DRAWBRIDGE_UP, flags: DB_ICE }],
        ['7,1', { typ: DRAWBRIDGE_UP, flags: DB_MOAT }],
        ['8,1', { typ: POOL }],
        ['9,1', { typ: MOAT }],
    ]);
    const state = levelState(cells, { juiblex_level: {} });

    assert.equal(is_waterwall(1, 1, state), true);
    assert.equal(is_waterwall(2, 1, state), false);
    assert.equal(is_waterwall(0, 1, state), false);
    assert.equal(is_lava(2, 1, state), true);
    assert.equal(is_lava(3, 1, state), true);
    assert.equal(is_lava(5, 1, state), true);
    assert.equal(is_lava(6, 1, state), false);
    assert.equal(is_pool_or_lava(2, 1, state), true);
    assert.equal(is_ice(4, 1, state), true);
    assert.equal(is_ice(6, 1, state), true);
    assert.equal(is_ice(5, 1, state), false);
    assert.equal(is_pool_or_lava(7, 1, state), true);
    assert.equal(is_pool_or_lava(8, 1, state), true);
    assert.equal(is_pool_or_lava(9, 1, state), true);
    assert.equal(is_moat(9, 1, state), true);
    assert.equal(is_moat(7, 1, state), true);
    assert.equal(is_ice(80, 1, state), false);

    const juiblex = levelState(cells, {
        u: { uz: { dnum: 2, dlevel: 5 } },
        juiblex_level: { dnum: 2, dlevel: 5 },
    });
    // dbridge.c:is_moat suppresses its drawbridge/moat result on Juiblex's level.
    assert.equal(is_pool_or_lava(9, 1, juiblex), true);
    assert.equal(is_pool_or_lava(7, 1, juiblex), false);
    assert.equal(is_moat(9, 1, juiblex), false);
    assert.equal(is_moat(7, 1, juiblex), false);
});
