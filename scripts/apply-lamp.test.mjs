// Pure naming support used by apply.c use_candle() query construction.
// Source-pinned inputs keep C's byte limits and temporary-name restoration
// visible without depending on a live object-name branch.

import assert from 'node:assert/strict';
import test from 'node:test';

import { QBUFSZ } from '../js/const.js';
import { encodeUtf8ByteString } from '../js/hacklib.js';
import { safe_qbuf, short_oname } from '../js/objnam.js';

test('short_oname truncates both assigned names before stripping attributes', () => {
    const state = {
        objects: [null, { oc_uname: 'abcdefghijklmnop' }],
    };
    const object = {
        otyp: 1,
        oextra: { oname: 'qrstuvwxyzABCDEF' },
        bknown: 1,
        rknown: 1,
        greased: true,
        oeroded: 2,
        oeroded2: 3,
    };
    const seen = [];
    const primary = (obj, currentState) => {
        seen.push([
            currentState.objects[1].oc_uname,
            obj.oextra.oname,
            obj.bknown,
        ]);
        return currentState.objects[1].oc_uname === 'abcdefgh...'
            && obj.oextra.oname === 'qrstuvwx...'
            ? 'short' : 'a formatter result longer than ten';
    };

    assert.equal(short_oname(object, primary, null, 10, state), 'short');
    assert.deepEqual(seen, [
        ['abcdefghijklmnop', 'qrstuvwxyzABCDEF', 1],
        ['abcdefgh...', 'qrstuvwxyzABCDEF', 1],
        ['abcdefghijklmnop', 'qrstuvwx...', 1],
        ['abcdefgh...', 'qrstuvwx...', 1],
    ]);
    assert.equal(state.objects[1].oc_uname, 'abcdefghijklmnop');
    assert.equal(object.oextra.oname, 'qrstuvwxyzABCDEF');
    assert.deepEqual(
        [object.bknown, object.rknown, object.greased,
            object.oeroded, object.oeroded2],
        [1, 1, true, 2, 3],
    );
});

test('short_oname strips fields and restores them if the formatter throws', () => {
    const object = {
        bknown: 1,
        rknown: 1,
        greased: true,
        oeroded: 2,
        oeroded2: 3,
    };
    let call = 0;
    assert.throws(() => short_oname(object, (obj) => {
        call += 1;
        if (call === 1) return 'too long';
        assert.deepEqual(
            [obj.bknown, obj.rknown, obj.greased, obj.oeroded, obj.oeroded2],
            [0, 0, 0, 0, 0],
        );
        throw new Error('formatter boundary');
    }, null, 3), /formatter boundary/u);
    assert.deepEqual(
        [object.bknown, object.rknown, object.greased,
            object.oeroded, object.oeroded2],
        [1, 1, true, 2, 3],
    );
});

test('safe_qbuf selects the shorter formatter before the literal fallback', () => {
    const object = {};
    assert.equal(
        safe_qbuf(
            'Attach ', '?', object,
            () => 'x'.repeat(QBUFSZ), () => 'candles', 'it',
        ),
        'Attach candles?',
    );
    assert.equal(
        safe_qbuf(
            'Attach ', '?', object,
            () => 'x'.repeat(QBUFSZ), () => 'y'.repeat(QBUFSZ), 'it',
        ),
        'Attach it?',
    );
});

test('safe_qbuf respects the C buffer byte limit, including UTF-8 names', () => {
    const result = safe_qbuf(
        'P:', '!', {},
        () => '界'.repeat(QBUFSZ), () => '短い名前', 'x',
    );
    assert.equal(result, 'P:短い名前!');
    assert.ok(encodeUtf8ByteString(result).length < QBUFSZ);
});
