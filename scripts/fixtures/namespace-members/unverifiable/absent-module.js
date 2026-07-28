// Fixture for scripts/check-namespace-members.test.mjs: the imported module
// does not exist. Nothing in this file is ever imported at run time, so only a
// static scan notices.

import * as NS from './no-such-module.js';

export function value() {
    return NS.ALPHA;
}
