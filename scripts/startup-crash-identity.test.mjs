import assert from 'node:assert/strict';
import test from 'node:test';

import { allopt } from '../js/optlist_data.js';
import {
    parseNethackrc,
    UNPARSED_COMPOUND_OPTIONS,
} from '../js/options.js';
import {
    loadStartupCrashIdentityRecipe,
    STARTUP_CRASH_IDENTITY_CASES,
    verifyStartupCrashIdentitySegment,
} from './run-startup-crash-identity.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function identity(parsed) {
    return [parsed.gc.crash_email, parsed.gc.crash_name];
}

test('crash report identities start at the two source nulls', () => {
    const parsed = parseNethackrc('');
    assert.deepEqual(identity(parsed), [null, null]);
    assert.equal(parsed.flags.crash_email, undefined);
    assert.equal(parsed.flags.crash_name, undefined);
});

test('crash report identities accept both separators and valid prefixes', () => {
    const longName = 'Source Reader whose reporting name exceeds PL_NSIZ';
    const parsed = parseNethackrc([
        'OPTIONS=CrAsH_E:selector@example.invalid',
        `OPTIONS=CRASH_N=${longName}`,
    ].join('\n'));
    assert.deepEqual(identity(parsed), [
        'selector@example.invalid',
        longName,
    ]);
    assert.ok(longName.length > 32);
    assert.deepEqual(parsed.configErrorFrame.output, []);
});

test('missing crash identities report and preserve prior state', () => {
    for (const [name, other, suffix] of [
        ['crash_email', 'crash_name', ''],
        ['crash_email', 'crash_name', ':'],
        ['crash_name', 'crash_email', ''],
        ['crash_name', 'crash_email', '='],
    ]) {
        const before = name === 'crash_email'
            ? 'before@example.invalid' : 'Before Name';
        const line = `OPTIONS=${name}${suffix},${name}:${before},`
            + `${other}:independent`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(parsed.gc[name], before, `${name}${suffix}`);
        assert.equal(parsed.gc[other], 'independent', `${name}${suffix}`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ` * Line 1: compound option specified multiple times: ${name}.`,
            ` * Line 1: Missing parameter for '${name}${suffix}'.`,
        ], `${name}${suffix}`);
    }
});

test('outer crash identity negation is rejected before either handler', () => {
    for (const name of ['crash_email', 'crash_name']) {
        const row = allopt.find((option) => option.name === name);
        assert.equal(row?.negateok, false, name);
        const line = `OPTIONS=!${name}:rejected,${name}:preserved`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(parsed.gc[name], 'preserved', name);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ` * Line 1: compound option specified multiple times: ${name}.`,
            ` * Line 1: The ${name} option may not both have a value and be`
                + ' negated.',
        ], name);
    }
});

test('crash identity duplicates overwrite in source application order', () => {
    const parsed = parseNethackrc([
        'OPTIONS=crash_email:left@example.invalid,'
            + 'crash_name:Left Name,crash_email:right@example.invalid,'
            + 'crash_name:Right Name',
        'OPTIONS=crash_email:last@example.invalid',
        'OPTIONS=crash_name:Last Name',
    ].join('\n'));
    assert.deepEqual(identity(parsed), [
        'last@example.invalid',
        'Last Name',
    ]);
    assert.deepEqual(parsed.configErrorFrame.output, [
        '\nOPTIONS=crash_email:left@example.invalid,'
            + 'crash_name:Left Name,crash_email:right@example.invalid,'
            + 'crash_name:Right Name',
        ' * Line 1: compound option specified multiple times: crash_name.',
        ' * Line 1: compound option specified multiple times: crash_email.',
        '\nOPTIONS=crash_email:last@example.invalid',
        ' * Line 2: compound option specified multiple times: crash_email.',
        '\nOPTIONS=crash_name:Last Name',
        ' * Line 3: compound option specified multiple times: crash_name.',
    ]);
    assert.equal(UNPARSED_COMPOUND_OPTIONS.has('crash_email'), false);
    assert.equal(UNPARSED_COMPOUND_OPTIONS.has('crash_name'), false);
});

test('the fresh crash identity matrix contains replay inputs only', () => {
    const recipe = loadStartupCrashIdentityRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_CRASH_IDENTITY_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured crash identities reach startup state and optionsfull', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupCrashIdentityRecipe().segments)
            await verifyStartupCrashIdentitySegment(segment);
    })
));
