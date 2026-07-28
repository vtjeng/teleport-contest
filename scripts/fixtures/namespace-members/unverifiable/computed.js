// Fixture for scripts/check-namespace-members.test.mjs: a computed member
// access names no member in the source text, so the check counts it as
// unchecked rather than reporting it.

import * as NS from '../exports/exporter.js';

export function lookup(name) {
    return NS[name];
}

export function alsoUnchecked(name) {
    return NS[`${name}_SUFFIX`];
}
