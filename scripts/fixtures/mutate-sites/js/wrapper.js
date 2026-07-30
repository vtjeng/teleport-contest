// A second fixture module, imported by scripts/wrapper.test.mjs and importing
// js/bounds.js. It exists so scripts/mutate-sites.test.mjs can check that the
// covering-test walk stops at the first js/ module: wrapper.test.mjs reaches
// js/bounds.js only through this file and must not be listed as covering it.

import { forwarded } from './bounds.js';

export function allowed(n) {
    return forwarded(n);
}
