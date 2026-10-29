// Source-pinned tests for nhlua.c's timer lookup and Lua table-entry helpers.
// The test uses the port's text-backed array/object boundary rather than a
// fabricated Lua VM.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    nhl_add_table_entry_bool,
    nhl_add_table_entry_char,
    nhl_add_table_entry_int,
    nhl_add_table_entry_region,
    nhl_add_table_entry_str,
    nhl_get_timertype,
} from '../js/nhlua.js';

test('nhlua.c nhl_get_timertype keeps Lua option order and stack indexing', () => {
    // timeout.h orders the timer enum from ROT_ORGANIC (0) through
    // MELT_ICE_AWAY (8); nhlua.c's names follow that same order.
    assert.equal(nhl_get_timertype(['rot-organic'], 1), 0);
    assert.equal(nhl_get_timertype(['melt-ice'], 1), 8);

    // C accepts a negative Lua stack index; -1 is the last argument.
    assert.equal(nhl_get_timertype(['coordinate', 'shrink-glob'], -1), 7);
    assert.throws(
        () => nhl_get_timertype(['unknown'], 1),
        /invalid option 'unknown'/u,
    );
});

test('nhlua.c table-entry helpers mutate the represented Lua table', () => {
    const table = {};

    // The values exercise each C push operation and the source's field names.
    assert.equal(nhl_add_table_entry_int(table, 'count', 37), undefined);
    assert.equal(nhl_add_table_entry_char(table, 'symbol', 64), undefined);
    assert.equal(nhl_add_table_entry_str(table, 'name', 'altar'), undefined);
    assert.equal(nhl_add_table_entry_bool(table, 'lit', true), undefined);
    assert.deepEqual(table, {
        count: 37,
        symbol: '@',
        name: 'altar',
        lit: true,
    });

    // JS state already stores C chars as one-character strings in several
    // ported records, so the boundary accepts that established representation.
    nhl_add_table_entry_char(table, 'class', 'A');
    nhl_add_table_entry_region(table, 'region', 3, 4, 10, 12);
    assert.deepEqual(table.region, { x1: 3, y1: 4, x2: 10, y2: 12 });
    assert.equal(table.class, 'A');

    // lua_rawset with a nil value removes an existing field.
    nhl_add_table_entry_str(table, 'name', null);
    assert.equal('name' in table, false);
});
