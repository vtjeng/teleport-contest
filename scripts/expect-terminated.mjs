// expectTerminated(fn) runs a call that should end the game and checks that
// it did.
//
// js/end.js nh_terminate() suspends its caller for good, as C's exits the
// process, so a test cannot simply await done(), dosave(), bail() or any
// command that reaches them: the promise never settles, and node:test then
// cancels the test and the rest of its file. This helper races fn() against
// the segment's termination notice (js/rng.js, "Segment termination") the way
// NethackGame.start() and moveloop_core() do, requires that the notice won and
// that nothing was recorded as a violation, and then clears the termination
// state so later tests in the file start from a live segment, even when an
// assertion here fails.
import assert from 'node:assert/strict';

import {
    raceTermination,
    resetTermination,
    terminationViolations,
} from '../js/rng.js';

export async function expectTerminated(fn, message = 'the call ended the game') {
    try {
        const outcome = await raceTermination(Promise.resolve().then(fn));
        assert.equal(outcome.terminated, true,
            `${message}: it returned instead of terminating the segment`);
        assert.deepEqual(terminationViolations(), [],
            `${message}: nothing ran after termination`);
    } finally {
        resetTermination();
    }
}
