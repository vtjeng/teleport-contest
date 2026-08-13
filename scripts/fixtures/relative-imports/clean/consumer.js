// A fixture for scripts/check-relative-imports.test.mjs: every specifier here
// is relative, so the check must pass over this directory.

import { HELPER } from './helper.js';
import './helper.js';
export { HELPER as ALSO_HELPER } from './helper.js';

export async function load() {
    return import('../clean/helper.js');
}

export const value = HELPER;
