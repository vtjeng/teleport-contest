import assert from 'node:assert/strict';
import test from 'node:test';

import { choose_passage, Death_quote, read_tribute } from '../js/files.js';

test('choose_passage selects without replacement, then resets its history', () => {
    const state = {};
    const bounds = [];
    const random = {
        rn2(bound) {
            bounds.push(bound);
            return bound - 1;
        },
    };

    assert.deepEqual([
        choose_passage(3, 17, state, random),
        choose_passage(3, 17, state, random),
        choose_passage(3, 17, state, random),
        choose_passage(3, 17, state, random),
    ], [3, 2, 1, 3]);
    assert.deepEqual(bounds, [3, 2, 1, 3]);
    assert.equal(state.svc.context.novel.id, 17);
    assert.equal(state.svc.context.novel.count, 2);
});

test('Death_quote uses its fixed id and bounds the C output buffer', async () => {
    const state = {};
    const bounds = [];
    const buffer = { value: 'stale' };
    const random = {
        rn2(bound) {
            bounds.push(bound);
            return 0;
        },
    };

    assert.equal(await Death_quote(buffer, 20, state, { random }), true);
    assert.equal(
        buffer.value,
        'WHERE THE FIRST PRI', // C copies at most bufsz - 1 bytes.
    );
    assert.deepEqual(bounds, [
        ...Array.from({ length: 31 }, (_, index) => 31 - index), 20,
    ]);
    assert.equal(state.svc.context.novel.id, 1);
    assert.equal(state.svc.context.novel.count, 19);
});

test('read_tribute clears an output buffer when its title is absent', async () => {
    const buffer = { value: 'old text' };

    assert.equal(await read_tribute(
        'books', 'not a NetHack novel', 0, buffer, 80, 2, {},
    ), false);
    assert.equal(buffer.value, '');
});
