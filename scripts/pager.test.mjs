import assert from 'node:assert/strict';
import test from 'node:test';

import { whatisMenuItems } from '../js/pager.js';

test('whatis rows keep C’s hidden group accelerators', () => {
    // pager.c do_look() passes '/' with gch 'y', '?' with 'n', 't' with '^',
    // 'T' with '"', 'e' with '`', and 'E' with '|' when lootabc is false.
    // windows.c add_menu() defines gch as the group accelerator; selection
    // still returns each row's visible C value.
    const rows = whatisMenuItems({
        flags: { lootabc: false },
        u: { uprops: [] },
    });

    const byValue = new Map(rows.map((row) => [row.value, row]));
    for (const [value, accelerator] of [
        ['/', 'y'],
        ['?', 'n'],
        ['t', '^'],
        ['T', '"'],
        ['e', '`'],
        ['E', '|'],
    ]) {
        assert.equal(byValue.get(value)?.selector, value);
        assert.equal(byValue.get(value)?.groupSelector, accelerator);
    }
});
