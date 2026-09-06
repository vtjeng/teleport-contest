import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCDefines, parseJsConstants, findMismatches } from './check-constants.mjs';

test('parseCDefines extracts simple integer defines', () => {
    const text = [
        '#define FOO 42',
        '#define BAR -7',
        '#define BAZ 0 /* comment */',
        '#define EXPR (1 + 2)',
        '#define STR "hello"',
        '/* #define COMMENTED 99 */',
    ].join('\n');
    const defines = parseCDefines(text);
    assert.equal(defines.get('FOO'), 42);
    assert.equal(defines.get('BAR'), -7);
    assert.equal(defines.get('BAZ'), 0);
    // Expression and string defines are out of scope.
    assert.equal(defines.has('EXPR'), false);
    assert.equal(defines.has('STR'), false);
    assert.equal(defines.has('COMMENTED'), false);
});

test('parseJsConstants extracts export const declarations', () => {
    const text = [
        'export const FOO = 42;',
        'export const BAR = -3;',
        'export const lowercase = 1;',
        'const NOT_EXPORTED = 5;',
        'export const STR = "hello";',
    ].join('\n');
    const consts = parseJsConstants(text);
    assert.equal(consts.get('FOO'), 42);
    assert.equal(consts.get('BAR'), -3);
    // Lowercase names do not match the [A-Z_] regex.
    assert.equal(consts.has('lowercase'), false);
    // Non-exported consts and non-integer values are skipped.
    assert.equal(consts.has('NOT_EXPORTED'), false);
    assert.equal(consts.has('STR'), false);
});

test('findMismatches reports differing values and skips allowlisted names', () => {
    const cDefines = new Map([['FOO', 1], ['BAR', 2], ['SKIP', 10]]);
    const jsConsts = new Map([['FOO', 1], ['BAR', 3], ['SKIP', 99], ['EXTRA', 5]]);
    const allowlist = new Map([['SKIP', 'known difference']]);

    const mismatches = findMismatches(cDefines, jsConsts, allowlist);
    // BAR differs and is not allowlisted.
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].name, 'BAR');
    assert.equal(mismatches[0].c, 2);
    assert.equal(mismatches[0].js, 3);
});

test('findMismatches returns empty when all values match', () => {
    const cDefines = new Map([['A', 1], ['B', 2]]);
    const jsConsts = new Map([['A', 1], ['B', 2], ['C', 3]]);
    assert.deepEqual(findMismatches(cDefines, jsConsts, new Map()), []);
});
