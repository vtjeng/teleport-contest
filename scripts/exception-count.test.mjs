import assert from 'node:assert/strict';
import test from 'node:test';

import { assertExceptionCount } from './exception-count.mjs';

// A pin of 3 exceptions, checked against counts one either side of it.
const PIN = { what: 'listed sites', pin: 'PINS.sites in scripts/x.test.mjs' };

test('an exception count equal to its pin passes', () => {
    assertExceptionCount(3, 3, PIN);
});

test('a rise fails and names the pin to raise', () => {
    assert.throws(() => assertExceptionCount(4, 3, PIN), {
        message: '4 listed sites, above the pinned 3: remove the new ones, or give each '
            + 'a reason and raise PINS.sites in scripts/x.test.mjs from 3 to 4',
    });
});

test('a fall fails and names the pin to lower', () => {
    assert.throws(() => assertExceptionCount(2, 3, PIN), {
        message: '2 listed sites, below the pinned 3: lower PINS.sites in '
            + 'scripts/x.test.mjs from 3 to 2',
    });
});
