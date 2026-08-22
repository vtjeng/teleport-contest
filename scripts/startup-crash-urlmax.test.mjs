import assert from 'node:assert/strict';
import test from 'node:test';

import { allopt } from '../js/optlist_data.js';
import {
    parseNethackrc,
    UNPARSED_COMPOUND_OPTIONS,
} from '../js/options.js';
import {
    loadStartupCrashUrlmaxRecipe,
    STARTUP_CRASH_URLMAX_CASES,
    verifyStartupCrashUrlmaxSegment,
} from './run-startup-crash-urlmax.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

test('crash_urlmax starts at the decl.c default and has one gc owner', () => {
    const parsed = parseNethackrc('');
    assert.equal(parsed.gc.crash_urlmax, -1);
    assert.equal(parsed.flags.crash_urlmax, undefined);
});

test('crash_urlmax applies recorder-platform atoi before its lower bound', () => {
    for (const [value, expected] of [
        ['75', 75],
        ['84suffix', 84],
        [' \t+96tail', 96],
        ['2147483647', 2147483647],
    ]) {
        const parsed = parse(`crash_urlmax:${value}`);
        assert.equal(parsed.gc.crash_urlmax, expected, value);
        assert.equal(parsed.flags.crash_urlmax, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('missing and below-minimum crash_urlmax values preserve prior state', () => {
    for (const [suffix, message] of [
        ['', "Missing parameter for 'crash_urlmax'."],
        [':', "Missing parameter for 'crash_urlmax:'."],
        [':74', 'Invalid value 74 for crash_urlmax.  Minimum value is 75.'],
        [':-1', 'Invalid value -1 for crash_urlmax.  Minimum value is 75.'],
        [':text', 'Invalid value 0 for crash_urlmax.  Minimum value is 75.'],
    ]) {
        const line = `OPTIONS=crash_urlmax${suffix},crash_urlmax:84`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(parsed.gc.crash_urlmax, 84, suffix);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' crash_urlmax.',
            ` * Line 1: ${message}`,
        ], suffix);
    }
});

test('crash_urlmax duplicate writes follow comma and line source order', () => {
    const comma = parse('crash_urlmax:84,crash_urlmax:96');
    assert.equal(comma.gc.crash_urlmax, 84);
    assert.deepEqual(comma.configErrorFrame.output, [
        '\nOPTIONS=crash_urlmax:84,crash_urlmax:96',
        ' * Line 1: compound option specified multiple times: crash_urlmax.',
    ]);

    const parsed = parseNethackrc([
        'OPTIONS=crash_urlmax:74,crash_urlmax:96',
        'OPTIONS=crash_urlmax:108',
    ].join('\n'));
    assert.equal(parsed.gc.crash_urlmax, 108);
    assert.deepEqual(parsed.configErrorFrame.output, [
        '\nOPTIONS=crash_urlmax:74,crash_urlmax:96',
        ' * Line 1: compound option specified multiple times: crash_urlmax.',
        ' * Line 1: Invalid value 74 for crash_urlmax.  Minimum value is 75.',
        '\nOPTIONS=crash_urlmax:108',
        ' * Line 2: compound option specified multiple times: crash_urlmax.',
    ]);
});

test('optlist rejects crash_urlmax negation before its handler', () => {
    const row = allopt.find(({ name }) => name === 'crash_urlmax');
    assert.equal(row?.negateok, false);

    const line = 'OPTIONS=!crash_urlmax:200,crash_urlmax:84';
    const parsed = parseNethackrc(`${line}\n`);
    assert.equal(parsed.gc.crash_urlmax, 84);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times: crash_urlmax.',
        ' * Line 1: The crash_urlmax option may not both have a value and be'
            + ' negated.',
    ]);
    assert.equal(UNPARSED_COMPOUND_OPTIONS.has('crash_urlmax'), false);
});

test('the fresh crash_urlmax matrix contains replay inputs only', () => {
    const recipe = loadStartupCrashUrlmaxRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_CRASH_URLMAX_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured crash_urlmax reaches startup state and optionsfull', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupCrashUrlmaxRecipe().segments)
            await verifyStartupCrashUrlmaxSegment(segment);
    })
));
