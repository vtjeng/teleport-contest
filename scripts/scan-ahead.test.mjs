import assert from 'node:assert/strict';
import test from 'node:test';

import { aheadStretch, dedupeMessages } from './scan-ahead.mjs';

test('aheadStretch spans from the current stop to the next one', () => {
    // A session shape as scripts/scan-debt.mjs attachBehaviors() emits it:
    // stopped on `eat` at step 40, with `pray` visible at step 120 and 300
    // recorded steps in total.
    const row = {
        recordedSteps: 300,
        behaviors: [
            { member: 'eat', at: 40 },
            { member: 'pray', at: 120 },
        ],
    };
    assert.deepEqual(aheadStretch(row),
        { member: 'eat', from: 40, to: 120 });
    // With no second behavior visible, the stretch runs to the recording's
    // end, which is what makes the forecast an upper bound.
    assert.deepEqual(aheadStretch({ recordedSteps: 300,
        behaviors: [{ member: 'eat', at: 40 }] }),
    { member: 'eat', from: 40, to: 300 });
    // A session with nothing unmet forecasts nothing.
    assert.equal(aheadStretch({ recordedSteps: 300, behaviors: [] }), null);
});

test('dedupeMessages collapses consecutive identical lines only', () => {
    // The two separated "You hit it." lines must stay separate runs: the
    // classifier reads order, and a global dedupe would erase the sequence.
    assert.deepEqual(
        dedupeMessages(['You hit it.', 'You hit it.', 'It bites!',
            'You hit it.']),
        [
            { line: 'You hit it.', count: 2 },
            { line: 'It bites!', count: 1 },
            { line: 'You hit it.', count: 1 },
        ],
    );
    assert.deepEqual(dedupeMessages([]), []);
});
