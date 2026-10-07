import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as drop from '../js/do.js';
import * as worn from '../js/worn.js';
import * as pickup from '../js/pickup.js';
import { COIN_CLASS, WEAPON_CLASS } from '../js/objects.js';
import { ckvalidcat } from '../js/invent.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadMultipleDropRecipe } from './run-multiple-drop.mjs';
import { W_WEP, W_SADDLE, WORN_TYPES, BY_NEXTHERE, PARANOID_AUTOALL } from '../js/const.js';

const DO_C = fs.readFileSync(new URL('../nethack-c/upstream/src/do.c', import.meta.url), 'utf8');
const WORN_C = fs.readFileSync(new URL('../nethack-c/upstream/src/worn.c', import.meta.url), 'utf8');
const PICKUP_C = fs.readFileSync(new URL('../nethack-c/upstream/src/pickup.c', import.meta.url), 'utf8');

test('the whole multiple-drop family and required traversal owners exist', () => {
    for (const name of ['doddrop', 'better_not_try_to_drop_that', 'menudrop_split', 'menu_drop']) {
        assert.match(DO_C, new RegExp(`${name}\\(`, 'u'));
        assert.equal(typeof drop[name], 'function', name);
    }
    for (const name of ['bypass_objlist', 'nxt_unbypassed_obj', 'nxt_unbypassed_loot']) {
        assert.match(WORN_C, new RegExp(`${name}\\(`, 'u'));
        assert.equal(typeof worn[name], 'function', name);
    }
});

test('bypass traversal marks before returning and rescans the current head', () => {
    // worn.c:1127-1151 walks nobj only; contents have independent bypass bits.
    const inside = { bypass: true };
    const third = { bypass: false, nobj: null };
    const second = { bypass: false, nobj: third };
    const first = { bypass: true, nobj: second, cobj: inside };
    const state = { context: { bypasses: false } };
    worn.bypass_objlist(first, false, state);
    assert.equal(inside.bypass, true);
    assert.equal(state.context.bypasses, false);
    assert.equal(worn.nxt_unbypassed_obj(first, state), first);
    assert.equal(first.bypass, true);
    assert.equal(state.context.bypasses, true);
    // A destructive callback removes the second item. Restart with the live head.
    first.nobj = third;
    assert.equal(worn.nxt_unbypassed_obj(first, state), third);
    assert.equal(worn.nxt_unbypassed_obj(first, state), null);
    worn.bypass_objlist(first, false, state);
    // C clear-list leaves the cleanup-needed context flag set.
    assert.equal(state.context.bypasses, true);
    assert.equal(first.bypass, false);
    assert.equal(third.bypass, false);
});

test('sorted bypass traversal rejects deleted pointers and marks returned objects', () => {
    // worn.c:1159-1173 compares each saved pointer with the live nobj chain.
    const stale = { bypass: false };
    const live = { bypass: false, nobj: null };
    const snapshot = [{ obj: stale }, { obj: live }, { obj: null }];
    const state = { context: {} };
    assert.equal(worn.nxt_unbypassed_loot(snapshot, live, state), live);
    assert.equal(live.bypass, true);
    assert.equal(worn.nxt_unbypassed_loot(snapshot, live, state), null);
});

test('count_categories uses source class order and excludes saddle-only worn items', () => {
    assert.match(PICKUP_C, /W_ARMOR \| W_ACCESSORY \| W_WEAPONS/u);
    // Two synthetic class bytes exercise the literal class comparison, not naming.
    const other = { oclass: 2, owornmask: W_SADDLE, nobj: null };
    const duplicate = { oclass: 1, owornmask: 0, nobj: other };
    const head = { oclass: 1, owornmask: W_WEP, nobj: duplicate };
    const state = { flags: { inv_order: [1, 2] } };
    assert.equal(pickup.count_categories(head, 0, state), 2);
    assert.equal(pickup.count_categories(head, WORN_TYPES, state), 1);
    head.nexthere = other;
    assert.equal(pickup.count_categories(head, BY_NEXTHERE, state), 2);
});


test('category filters keep the source coin shortcut and paranoid empty-filter arm', () => {
    assert.match(PICKUP_C, /!gp\.picked_filter && !ParanoidAutoAll/u);
    const state = { flags: {}, urole: {}, gc: {}, gs: {}, gb: {}, gp: {}, gv: {} };
    const weapon = { oclass: WEAPON_CLASS, bknown: true, blessed: true };
    assert.equal(pickup.allow_category(weapon, state), false);
    state.flags.paranoia_bits = PARANOID_AUTOALL;
    assert.equal(pickup.allow_category(weapon, state), true);
    pickup.add_valid_menu_class(0, state);
    pickup.add_valid_menu_class('U', state);
    assert.equal(pickup.allow_category(weapon, state), false);
    pickup.add_valid_menu_class(COIN_CLASS, state);
    // Coins return before the unpaid and BUC filters if a class is requested.
    pickup.add_valid_menu_class('u', state);
    const coins = { oclass: COIN_CLASS, unpaid: false };
    assert.equal(pickup.allow_category(coins, state), true);
    assert.equal(ckvalidcat(coins, state), 1);
    assert.equal(ckvalidcat(weapon, state), 0);
});


test('traditional BUC selection does not activate an object-class filter', async () => {
    // invent.c:ggetobj uses add_valid_menu_class for U; that sets bucx_filter,
    // while class_filter belongs only to actual object classes.
    const segment = loadMultipleDropRecipe('traditional-filtered').segments[0];
    const boundaries = [];
    await runSegment(segment, { onBoundary: error => boundaries.push(error) });
    assert.deepEqual(boundaries, []);
    assert.equal(game.gc.class_filter, false);
    assert.equal(game.gb.bucx_filter, true);
    assert.ok(game.level.objects[game.u.ux][game.u.uy]);
});
