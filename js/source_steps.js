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
// sequence. Any other caller gets gap_impossible(), which records the
// unported print and continues. scripts/level-difficulty-steps.test.mjs lists
// the synchronous callers that still do that for dungeon.c builds_up().

import { note_unported } from './unported.js';

// The text of one impossible() call, yielded where C makes it.
export class ImpossibleCall {
    constructor(text) {
        this.text = text;
    }
}

// The onImpossible of a caller that cannot wait.
export function gap_impossible() {
    note_unported('pline.c impossible');
}

// Run `steps` to its return value. Synchronous until a step yields a promise
// or onImpossible returns one; from then on it returns a promise.
export function finish_steps(steps, onImpossible = gap_impossible) {
    const advance = (input, failed) => {
        let value = input;
        let threw = failed;
        for (;;) {
            const step = threw ? steps.throw(value) : steps.next(value);
            if (step.done) return step.value;
            value = step.value instanceof ImpossibleCall
                ? onImpossible(step.value.text)
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
