import assert from 'node:assert/strict';
import test from 'node:test';

import { allopt } from '../js/optlist_data.js';
import {
    parseNethackrc,
    UNPARSED_COMPOUND_OPTIONS,
} from '../js/options.js';
import {
    loadStartupMenuinvertmodeRecipe,
    STARTUP_MENUINVERTMODE_CASES,
    verifyStartupMenuinvertmodeSegment,
} from './run-startup-menuinvertmode.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

test('menuinvertmode keeps its default for bare and empty values', () => {
    assert.equal(parseNethackrc('').iflags.menuinvertmode, 1);
    for (const statement of ['menuinvertmode', 'menuinvertmode:']) {
        const parsed = parse(statement);
        assert.equal(parsed.iflags.menuinvertmode, 1, statement);
        assert.equal(parsed.flags.menuinvertmode, undefined, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
    }
});

test('menuinvertmode applies C atoi before its range check', () => {
    for (const [value, expected] of [
        ['0', 0], ['1', 1], ['2', 2], ['garbage', 0], ['2junk', 2],
        ['4294967296', 0], ['4294967298', 2],
    ]) {
        const parsed = parse(`menuinvertmode:${value}`);
        assert.equal(parsed.iflags.menuinvertmode, expected, value);
        assert.equal(parsed.flags.menuinvertmode, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('an out-of-range menuinvertmode reports and preserves prior state', () => {
    for (const value of ['-1', '3']) {
        const line = `OPTIONS=menuinvertmode:${value},menuinvertmode:2`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(parsed.iflags.menuinvertmode, 2, value);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' menuinvertmode.',
            ` * Line 1: Illegal menuinvertmode parameter '${value}'.`,
        ], value);
    }
});

test('optlist rejects menuinvertmode negation before its handler', () => {
    const row = allopt.find(({ name }) => name === 'menuinvertmode');
    assert.equal(row?.negateok, false);

    const line = 'OPTIONS=!menuinvertmode:0,menuinvertmode:2';
    const parsed = parseNethackrc(`${line}\n`);
    assert.equal(parsed.iflags.menuinvertmode, 2);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times:'
            + ' menuinvertmode.',
        ' * Line 1: The menuinvertmode option may not both have a value and'
            + ' be negated.',
    ]);
});

test('comma recursion applies menuinvertmode right to left', () => {
    const line = 'OPTIONS=menuinvertmode:0,menuinvertmode:2';
    const parsed = parseNethackrc(`${line}\n`);
    assert.equal(parsed.iflags.menuinvertmode, 0);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times:'
            + ' menuinvertmode.',
    ]);
    assert.equal(UNPARSED_COMPOUND_OPTIONS.has('menuinvertmode'), false);
});

test('the fresh recipe pins both non-default bulk-selection modes', () => {
    const recipe = loadStartupMenuinvertmodeRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        [
            [7331049, '20360422111700'],
            [7331051, '20360422111900'],
            [7331053, '20360422112100'],
            [7331055, '20360422112300'],
        ],
    );
    assert.deepEqual(
        STARTUP_MENUINVERTMODE_CASES.map(({ mode }) => mode),
        [0, 2, 0, 2],
    );
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.equal(segment.moves, ' OoA@\r\x1b\x1b');
    }
});

test('configured modes reach optionsfull and the TTY bulk consumer', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupMenuinvertmodeRecipe().segments)
            await verifyStartupMenuinvertmodeSegment(segment);
    })
));
