// A fixture for scripts/check-relative-imports.test.mjs: a bare specifier and
// a Node builtin, the two shapes that would break a judge run in Chrome and in
// a scored Node run with no node_modules. The check must reject both.

import { readFile } from 'node:fs/promises';
import { pick } from 'lodash';

export const read = readFile;
export const choose = pick;
