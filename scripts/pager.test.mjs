import assert from 'node:assert/strict';
import test from 'node:test';

import { whatisMenuItems } from '../js/pager.js';

test('the map whatis row keeps C’s hidden y group accelerator', () => {
    // pager.c do_look() passes '/' as add_menu()'s visible ch and 'y' as gch
    // when flags.lootabc is false; windows.c add_menu() defines gch as the
    // group accelerator. The selected item still returns the '/' identifier.
    const [map] = whatisMenuItems({
        flags: { lootabc: false },
        u: { uprops: [] },
    });

    assert.equal(map.value, '/');
    assert.equal(map.selector, '/');
    assert.equal(map.groupSelector, 'y');
});
