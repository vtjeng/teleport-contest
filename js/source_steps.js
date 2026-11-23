// A C function that can stop in the middle to wait for the player, and whose
// callers are partly synchronous in this port, is written once as a `*_steps`
// generator and run by finish_steps(). C ref: no single upstream file.
//
// A step generator yields:
// - a promise (or any thenable), for an operation that may wait; the rest of
//   the body runs after it settles, with its value or its error;
// - an ImpossibleCall, where C calls pline.c impossible().
//
// impossible() prints three lines that can each stop at --More--, so C waits
// for keys in the middle of the calling function. Whether the port can do
// the same depends on the caller, not on the body: a caller that can wait
// passes an `onImpossible` that prints and returns impossible()'s promise,
// so everything after the call runs after the keys, at C's point in the RNG
// sequence. A caller that cannot wait passes sync_impossible and its game
// state, which queue the report for the next message.
// scripts/level-difficulty-steps.test.mjs lists the synchronous callers that
// still do that for dungeon.c builds_up(). Every caller chooses one of the
// two: scripts/impossible-sites.test.mjs fails on a call without one, since a
// report with no handler would be dropped.

import { queueImpossibleNotice } from './startup_a11y.js';

// The text of one impossible() call, yielded where C makes it.
export class ImpossibleCall {
    constructor(text) {
        this.text = text;
    }
}

// Run `steps` to its return value. Synchronous until a step yields a promise
// or onImpossible returns one; from then on it returns a promise. `state` is
// onImpossible's second argument, which sync_impossible needs.
export function finish_steps(steps, onImpossible, state) {
    const advance = (input, failed) => {
        let value = input;
        let threw = failed;
        for (;;) {
            const step = threw ? steps.throw(value) : steps.next(value);
            if (step.done) return step.value;
            value = step.value instanceof ImpossibleCall
                ? onImpossible(step.value.text, state)
                : step.value;
            threw = false;
            if (value && typeof value.then === 'function') {
                return Promise.resolve(value).then(
                    (result) => advance(result, false),
                    (error) => advance(error, true),
                );
            }
        }
    };
    return advance(undefined, false);
}

// C ref: pline.c impossible(), called from a synchronous port function. C
// prints the report there and then; the port queues it with the map frame of
// that moment (startup_a11y.js queueImpossibleNotice()), and the next message,
// menu, text window, prompt or turn boundary prints it first. In the common
// case, pline("You drop %s.", doname(obj)), that is C's order: doname()'s
// report, then the message that uses the name.
export function sync_impossible(text, state) {
    queueImpossibleNotice(text, state);
}
