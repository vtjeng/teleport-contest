// Pin end.c find_delayed_killer() (1726-1735), save_killers() (1759-1775)
// and restore_killers() (1778-1789), ported in js/end.js. The
// delayed-killer chain hangs off svk.killer.next; the property numbers used
// as ids are the youprop.h values js/const.js carries (SICK 17, STONED 18,
// POLYMORPH 61).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { POLYMORPH, SICK, STONED } from '../js/const.js';
import {
    dealloc_killer, find_delayed_killer, restore_killers, save_killers,
} from '../js/end.js';

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

test('save_killers writes the head, then each delayed record in chain order', () => {
    // A killer head named mid-death (format 1, KILLED_BY) ahead of two
    // delayed records, so the order and every field are visible.
    const state = {
        killer: {
            name: 'falling rock', format: 1,
            next: {
                id: STONED, format: 0, name: 'cockatrice egg',
                next: { id: SICK, format: 2, name: 'food poisoning', next: null },
            },
        },
    };
    assert.deepEqual(save_killers(state), [
        { id: 0, format: 1, name: 'falling rock' },
        { id: STONED, format: 0, name: 'cockatrice egg' },
        { id: SICK, format: 2, name: 'food poisoning' },
    ]);
    // C writes the zero-valued svk.killer even when nothing set it.
    assert.deepEqual(save_killers({}), [{ id: 0, format: 0, name: '' }]);
});

test('restore_killers rebuilds the chain that save_killers wrote', () => {
    const saved = [
        { id: 0, format: 0, name: '' },
        { id: STONED, format: 0, name: 'cockatrice egg' },
        { id: POLYMORPH, format: 1, name: 'self-genocide' },
    ];
    const state = {};
    restore_killers(saved, state);
    assert.equal(state.killer.name, '');
    assert.equal(find_delayed_killer(STONED, state).name, 'cockatrice egg');
    assert.equal(find_delayed_killer(POLYMORPH, state).format, 1);
    assert.equal(find_delayed_killer(POLYMORPH, state).next, null);
    assert.deepEqual(save_killers(state), saved);
});

test('end.c saves and restores svk.killer and every record linked from it', () => {
    assert.match(
        C_SOURCE,
        /save_killers\(NHFILE \*nhfp\)[\s\S]*?for \(kptr = &svk\.killer; kptr; kptr = kptr->next\) \{\s*Sfo_kinfo/u,
    );
    assert.match(
        C_SOURCE,
        /restore_killers\(NHFILE \*nhfp\)[\s\S]*?for \(kptr = &svk\.killer; kptr != \(struct kinfo \*\) 0; kptr = kptr->next\) \{\s*Sfi_kinfo\(nhfp, kptr, "kinfo"\);\s*if \(kptr->next\) \{\s*kptr->next = \(struct kinfo \*\) alloc/u,
    );
});
