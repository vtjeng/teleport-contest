import assert from 'node:assert/strict';
import test from 'node:test';

import { fmt_ptr } from '../js/alloc.js';

test('alloc.c fmt_ptr reports only whether a pointer is null', () => {
    // Patch 007 replaces process-dependent PTR_FMT addresses with this exact
    // null/non-null distinction, so separate JS identities share one spelling.
    assert.equal(fmt_ptr(null), '<null>');
    assert.equal(fmt_ptr({}), '<ptr>');
    assert.equal(fmt_ptr({ id: 1 }), '<ptr>');
});
