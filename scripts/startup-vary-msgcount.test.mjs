import assert from 'node:assert/strict';
import test from 'node:test';

import { allopt } from '../js/optlist_data.js';
import { optionValue, parseNethackrc } from '../js/options.js';
import {
    loadStartupVaryMsgcountRecipe,
    STARTUP_VARY_MSGCOUNT_CASES,
    verifyStartupVaryMsgcountSegment,
} from './run-startup-vary-msgcount.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function varyMsgcount(parsed) {
    return parsed.iflags.wc_vary_msgcount;
}

test('vary_msgcount starts in its zeroed iflags field', () => {
    const parsed = parseNethackrc('');
    assert.equal(varyMsgcount(parsed), 0);
    assert.equal(parsed.flags.vary_msgcount, undefined);
});

test('vary_msgcount getters distinguish menu and configuration defaults',
    () => {
        const row = allopt.find(({ name }) => name === 'vary_msgcount');
        const parsed = parseNethackrc('');
        assert.equal(varyMsgcount(parsed), 0);
        assert.equal(optionValue(parsed, row, {}), 'default');

        parsed.iflags.wc_vary_msgcount = -17;
        assert.equal(optionValue(parsed, row, {}), '-17');
    });

test('vary_msgcount stores unrestricted C atoi results', () => {
    for (const [value, expected] of [
        ['text', 0],
        ['-17tail', -17],
        [' \t+23suffix', 23],
        ['2147483648', -2147483648],
    ]) {
        const parsed = parse(`vary_msgcount:${value}`);
        assert.equal(varyMsgcount(parsed), expected, value);
        assert.equal(parsed.flags.vary_msgcount, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('missing values report after duplicates and preserve prior state', () => {
    for (const suffix of ['', ':', '=']) {
        const line = `OPTIONS=vary_msgcount${suffix},vary_msgcount:17`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(varyMsgcount(parsed), 17, suffix);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' vary_msgcount.',
            ` * Line 1: Missing parameter for 'vary_msgcount${suffix}'.`,
        ], suffix);
    }
});

test('parseoptions rejects vary_msgcount negation before its handler', () => {
    const row = allopt.find(({ name }) => name === 'vary_msgcount');
    assert.equal(row?.negateok, false);
    for (const negated of [
        '!vary_msgcount',
        '!vary_msgcount:',
        '!vary_msgcount=',
        '!vary_msgcount:12',
        '!vary_m:12',
    ]) {
        const line = `OPTIONS=${negated},vary_msgcount:17`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(varyMsgcount(parsed), 17, negated);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' vary_msgcount.',
            ' * Line 1: The vary_msgcount option may not both have a value'
                + ' and be negated.',
        ], negated);
    }
});

test('vary_msgcount duplicates apply right to left and across later lines',
    () => {
        const line = 'OPTIONS=vary_msgcount:11,vary_msgcount:33';
        const parsed = parseNethackrc([
            line,
            'OPTIONS=vary_msgcount:55',
        ].join('\n'));
        assert.equal(varyMsgcount(parsed), 55);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' vary_msgcount.',
            '\nOPTIONS=vary_msgcount:55',
            ' * Line 2: compound option specified multiple times:'
                + ' vary_msgcount.',
        ]);
    });

test('the fresh vary_msgcount matrix contains replay inputs only', () => {
    const recipe = loadStartupVaryMsgcountRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_VARY_MSGCOUNT_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured vary_msgcount reaches installed startup iflags', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupVaryMsgcountRecipe().segments)
            await verifyStartupVaryMsgcountSegment(segment);
    })
));

test('vary_msgcount row retains its source window-capability contract', () => {
    const row = allopt.find(({ name }) => name === 'vary_msgcount');
    assert.equal(row?.setwhere, 3);
    assert.equal(row?.negateok, false);
    assert.equal(row?.valok, true);
});
