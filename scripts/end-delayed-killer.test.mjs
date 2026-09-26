// Pin end.c find_delayed_killer() (1726-1735), ported in js/end.js. The
// delayed-killer chain hangs off svk.killer.next; the property numbers used
// as ids are the youprop.h values js/const.js carries (SICK 17, STONED 18,
// POLYMORPH 61).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { POLYMORPH, SICK, STONED } from '../js/const.js';
import { dealloc_killer, find_delayed_killer } from '../js/end.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/end.c', 'utf8');

test('find_delayed_killer returns the chain entry with the id', () => {
    const polymorphKiller = { id: POLYMORPH, format: 1, name: 'self-genocide', next: null };
    const state = {
        killer: {
            name: '', format: 0,
            next: { id: SICK, format: 0, name: 'food poisoning', next: polymorphKiller },
        },
    };
    // The match is the second entry, so the walk must pass the first.
    assert.equal(find_delayed_killer(POLYMORPH, state), polymorphKiller);
    assert.equal(find_delayed_killer(SICK, state), state.killer.next);
});

test('find_delayed_killer returns null when no entry has the id', () => {
    const state = {
        killer: { name: '', format: 0, next: { id: SICK, format: 0, name: '', next: null } },
    };
    assert.equal(find_delayed_killer(STONED, state), null);
    // A hero who has never had a delayed killer has no chain at all.
    assert.equal(find_delayed_killer(POLYMORPH, { killer: { name: '', format: 0 } }), null);
    assert.equal(find_delayed_killer(POLYMORPH, {}), null);
});

test('dealloc_killer unlinks only the supplied delayed record', () => {
    const tail = { id: STONED, next: null };
    const middle = { id: SICK, next: tail };
    const head = { id: POLYMORPH, next: middle };
    const state = { killer: { name: '', format: 0, next: head } };

    dealloc_killer(middle, state);
    assert.equal(state.killer.next, head);
    assert.equal(head.next, tail);
    assert.equal(middle.next, tail);
    dealloc_killer(head, state);
    assert.equal(state.killer.next, tail);
    dealloc_killer(tail, state);
    assert.equal(state.killer.next, null);
    dealloc_killer(null, state);
});

test('end.c dealloc_killer searches from the svk killer head and unlinks by identity', () => {
    assert.match(
        C_SOURCE,
        /dealloc_killer\(struct kinfo \*kptr\)[\s\S]*?if \(kptr == \(struct kinfo \*\) 0\)[\s\S]*?for \(k = svk\.killer\.next;[\s\S]*?if \(k == kptr\)[\s\S]*?prev->next = k->next;/u,
    );
});
