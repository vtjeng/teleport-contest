import assert from 'node:assert/strict';
import test from 'node:test';

import {
    OBJ_CONTAINED,
    OBJ_FREE,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MINVENT,
} from '../js/const.js';
import {
    newObject,
    replace_object,
    unknwn_contnr_contents,
} from '../js/obj.js';

// ---------------------------------------------------------------------------
// unknwn_contnr_contents -- pure function
// C ref: mkobj.c unknwn_contnr_contents() (684-695)
// ---------------------------------------------------------------------------

test('unknwn_contnr_contents() returns null for a free object', () => {
    // An object not inside any container (where !== OBJ_CONTAINED)
    // stops the loop immediately and returns null (C: result starts at 0).
    const obj = newObject({ where: OBJ_FREE });
    assert.equal(unknwn_contnr_contents(obj), null);
});

test('unknwn_contnr_contents() returns null when every container is known', () => {
    // obj is inside a known container (cknown true); the parent is not
    // contained, so the loop runs once and result stays null.
    const bag = newObject({ where: OBJ_INVENT, cknown: true });
    const item = newObject({ where: OBJ_CONTAINED, ocontainer: bag });
    assert.equal(unknwn_contnr_contents(item), null);
});

test('unknwn_contnr_contents() returns the unknown container', () => {
    // obj is inside a container whose cknown is false; the function
    // returns that container as the outermost unknown one.
    const bag = newObject({ where: OBJ_INVENT, cknown: false });
    const item = newObject({ where: OBJ_CONTAINED, ocontainer: bag });
    assert.equal(unknwn_contnr_contents(item), bag);
});

test('unknwn_contnr_contents() returns the outermost unknown container in a nested chain', () => {
    // C walks the whole chain. Two levels of nesting, both unknown:
    // the outer container is the one returned.
    const outer = newObject({ where: OBJ_FLOOR, cknown: false });
    const inner = newObject({ where: OBJ_CONTAINED, ocontainer: outer, cknown: false });
    const item = newObject({ where: OBJ_CONTAINED, ocontainer: inner });
    // C: result is set first to inner (parent of item), then to outer
    // (parent of inner). The last assignment wins.
    assert.equal(unknwn_contnr_contents(item), outer);
});

test('unknwn_contnr_contents() skips known middle containers', () => {
    // Three levels: outer (unknown), middle (known), item.
    // The function should still return outer as the outermost unknown.
    const outer = newObject({ where: OBJ_INVENT, cknown: false });
    const middle = newObject({ where: OBJ_CONTAINED, ocontainer: outer, cknown: true });
    const item = newObject({ where: OBJ_CONTAINED, ocontainer: middle });
    assert.equal(unknwn_contnr_contents(item), outer);
});

test('unknwn_contnr_contents() returns inner when only inner is unknown', () => {
    // Two levels: outer (known), inner (unknown), item.
    // Only the inner container matches !cknown.
    const outer = newObject({ where: OBJ_INVENT, cknown: true });
    const inner = newObject({ where: OBJ_CONTAINED, ocontainer: outer, cknown: false });
    const item = newObject({ where: OBJ_CONTAINED, ocontainer: inner });
    assert.equal(unknwn_contnr_contents(item), inner);
});

// ---------------------------------------------------------------------------
// replace_object -- impure (modifies chain state) but structurally testable
// C ref: mkobj.c replace_object() (641-680)
// ---------------------------------------------------------------------------

test('replace_object() OBJ_FREE sets otmp.where without chain changes', () => {
    // C: case OBJ_FREE does nothing to chains, only copies where.
    const obj = newObject({ where: OBJ_FREE, o_id: 1 });
    const otmp = newObject({ where: OBJ_FREE, o_id: 2 });
    replace_object(obj, otmp, { state: {} });
    assert.equal(otmp.where, OBJ_FREE);
});

test('replace_object() OBJ_INVENT replaces at head of inventory', () => {
    // obj is the head of the inventory chain (state.invent).
    // After replacement, otmp should be the new head.
    const obj = newObject({ where: OBJ_INVENT, o_id: 1 });
    const tail = newObject({ where: OBJ_INVENT, o_id: 3 });
    obj.nobj = tail;
    const state = { invent: obj };
    const otmp = newObject({ where: OBJ_FREE, o_id: 2 });
    replace_object(obj, otmp, { state });
    assert.equal(state.invent, otmp, 'otmp becomes inventory head');
    assert.equal(otmp.nobj, tail, 'otmp links to the old successor');
    assert.equal(obj.where, OBJ_FREE, 'obj is freed');
    assert.equal(obj.nobj, null, 'obj nobj is cleared');
});

test('replace_object() OBJ_INVENT replaces in middle of inventory', () => {
    // obj is in the middle: head -> obj -> tail.
    const head = newObject({ where: OBJ_INVENT, o_id: 1 });
    const obj = newObject({ where: OBJ_INVENT, o_id: 2 });
    const tail = newObject({ where: OBJ_INVENT, o_id: 3 });
    head.nobj = obj;
    obj.nobj = tail;
    const state = { invent: head };
    const otmp = newObject({ where: OBJ_FREE, o_id: 4 });
    replace_object(obj, otmp, { state });
    assert.equal(state.invent, head, 'head unchanged');
    assert.equal(head.nobj, otmp, 'predecessor links to otmp');
    assert.equal(otmp.nobj, tail, 'otmp links to the old successor');
    assert.equal(obj.where, OBJ_FREE, 'obj is freed');
});

test('replace_object() OBJ_CONTAINED replaces inside a container', () => {
    // obj is the only item in a container.
    const container = newObject({ where: OBJ_INVENT, o_id: 10, cknown: true });
    const obj = newObject({ where: OBJ_CONTAINED, o_id: 1, ocontainer: container });
    container.cobj = obj;
    const state = {};
    const otmp = newObject({ where: OBJ_FREE, o_id: 2 });
    replace_object(obj, otmp, { state });
    assert.equal(container.cobj, otmp, 'container head updated');
    assert.equal(otmp.ocontainer, container, 'otmp knows its container');
    assert.equal(otmp.where, OBJ_CONTAINED);
    assert.equal(obj.where, OBJ_FREE, 'obj is freed');
});

test('replace_object() OBJ_MINVENT replaces in monster inventory', () => {
    // obj is the only item carried by a monster.
    const mon = { minvent: null, o_id: 0 };
    const obj = newObject({ where: OBJ_MINVENT, o_id: 1, ocarry: mon });
    mon.minvent = obj;
    const state = {};
    const otmp = newObject({ where: OBJ_FREE, o_id: 2 });
    replace_object(obj, otmp, { state });
    assert.equal(mon.minvent, otmp, 'monster inventory head updated');
    assert.equal(otmp.ocarry, mon, 'otmp knows its carrier');
    assert.equal(otmp.where, OBJ_MINVENT);
    assert.equal(obj.where, OBJ_FREE, 'obj is freed');
});
