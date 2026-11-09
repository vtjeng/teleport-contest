// pickup.c query_objlist() (1133-1135) chooses each object row's menu
// selector; invent.c display_minventory() reaches the same rows through its
// own query_objlist() call, which js/invent.js lays out itself. Both use
// js/pickup.js query_objlist_selector(); this test pins it to the C
// expression and fails if either layout stops using it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { USE_INVLET } from '../js/const.js';
import { COIN_CLASS, SCROLL_CLASS } from '../js/objects.js';
import { query_objlist_selector } from '../js/pickup.js';

const PICKUP_C = readFileSync('nethack-c/upstream/src/pickup.c', 'utf8');
const PICKUP_JS = readFileSync('js/pickup.js', 'utf8');
const INVENT_JS = readFileSync('js/invent.js', 'utf8');

test('query_objlist_selector follows pickup.c add_menu selector', () => {
    assert.match(PICKUP_C,
        /\(qflags & USE_INVLET\) \? curr->invlet\s*: \(first && curr->oclass == COIN_CLASS\) \? '\$' : 0,/u);
    // 'q' is an arbitrary inventory letter; the classes cover gold and a
    // non-gold row.
    const gold = { oclass: COIN_CLASS, invlet: 'q' };
    const scroll = { oclass: SCROLL_CLASS, invlet: 'q' };
    assert.equal(query_objlist_selector(gold, USE_INVLET, true), 'q');
    assert.equal(query_objlist_selector(scroll, USE_INVLET, false), 'q');
    assert.equal(query_objlist_selector(gold, 0, true), '$');
    assert.equal(query_objlist_selector(gold, 0, false), undefined);
    assert.equal(query_objlist_selector(scroll, 0, true), undefined);
});

test('query_objlist and display_minventory both use the shared selector', () => {
    const start = INVENT_JS.indexOf('export async function display_minventory(');
    const body = INVENT_JS.slice(start, INVENT_JS.indexOf('\n}\n', start));
    assert.match(body, /selector: query_objlist_selector\(obj, qflags, first\)/u);
    assert.doesNotMatch(body, /selector: undefined/u);
    const qstart = PICKUP_JS.indexOf('export async function query_objlist(');
    const qbody = PICKUP_JS.slice(qstart, PICKUP_JS.indexOf('\n}\n', qstart));
    assert.match(qbody, /selector: query_objlist_selector\(curr, qflags, first\)/u);
});
