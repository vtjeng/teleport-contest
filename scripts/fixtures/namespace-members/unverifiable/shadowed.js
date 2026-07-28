// Fixture for scripts/check-namespace-members.test.mjs: an inner binding
// reuses the namespace name, so a member access cannot be attributed to the
// import by reading the text. The check reports a note and verifies nothing
// in this file.

import * as NS from '../exports/exporter.js';

export function outer() {
    return NS.ALPHA;
}

export function inner() {
    const NS = { LOCAL_ONLY: 7 };
    return NS.LOCAL_ONLY;
}
