// Keeps every line of the runtime JavaScript short enough to read and diff.
// The Phase 2 judge scores maintainability by diffing js/ against the Phase 1
// freeze, and the organisers warned that very long lines damage that score
// (mazesofmenace.ai/thanksgiving-threshold, 26 November 2026). Generated
// tables put one source line or one array element on each line; see
// scripts/js-source-literal.mjs.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const JS_DIR = new URL('../js/', import.meta.url);

// 400 characters sits above every hand-written line in js/ (the longest is a
// 309-character template message) and below the generated table rows that
// LONG_ROW_FILES lists.
const LINE_LIMIT = 400;

// Generated tables with one C record per line: a changed monster or object
// changes one line. Their rows run to 783 characters (monsters.js) and 439
// (objects.js) on 27 November 2026; ROW_LIMIT leaves room for longer names.
const LONG_ROW_FILES = Object.freeze({
    'monsters.js': 'scripts/generate-monsters.mjs: one monsters.h MON() entry per line',
    'objects.js': 'scripts/generate-objects.mjs: one objects.h OBJECT() entry per line',
});
const ROW_LIMIT = 1000;

function longLines(name, limit) {
    return readFileSync(new URL(name, JS_DIR), 'utf8').split('\n')
        .map((line, index) => ({ line: index + 1, length: line.length }))
        .filter(({ length }) => length > limit)
        .map(({ line, length }) => `js/${name}:${line} has ${length} characters`);
}

const files = readdirSync(JS_DIR).filter((name) => name.endsWith('.js')).sort();

test(`no js/ line is longer than ${LINE_LIMIT} characters`, () => {
    const found = files.filter((name) => !Object.hasOwn(LONG_ROW_FILES, name))
        .flatMap((name) => longLines(name, LINE_LIMIT));
    assert.deepEqual(found, []);
});

test(`generated table rows stay under ${ROW_LIMIT} characters`, () => {
    for (const name of Object.keys(LONG_ROW_FILES))
        assert.deepEqual(longLines(name, ROW_LIMIT), []);
});

test('each long-row exemption still has a row over the line limit', () => {
    // Two exemptions on 27 November 2026. Drop an entry when its file no
    // longer needs it; add one only with the generator and layout it allows.
    assert.equal(Object.keys(LONG_ROW_FILES).length, 2);
    for (const name of Object.keys(LONG_ROW_FILES))
        assert.ok(longLines(name, LINE_LIMIT).length > 0, `js/${name} no longer needs an exemption`);
});
