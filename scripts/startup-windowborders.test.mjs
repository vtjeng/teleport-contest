import assert from 'node:assert/strict';
import test from 'node:test';

import { allopt } from '../js/optlist_data.js';
import { parseNethackrc } from '../js/options.js';
import {
    loadStartupWindowbordersRecipe,
    STARTUP_WINDOWBORDERS_CASES,
    verifyStartupWindowbordersSegment,
} from './run-startup-windowborders.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function windowbordersValue(parsed) {
    return parsed.iflags.wc2_windowborders;
}

test('windowborders starts at the source auto default in iflags', () => {
    const parsed = parseNethackrc('');
    assert.equal(windowbordersValue(parsed), 2);
    assert.equal(parsed.flags.windowborders, undefined);
});

test('windowborders accepts modes 0 through 4 after C atoi', () => {
    for (const [value, expected] of [
        ['0tail', 0],
        ['1tail', 1],
        ['2tail', 2],
        ['3tail', 3],
        ['4tail', 4],
        ['zqxj', 0],
        [' \t+3suffix', 3],
        ['4294967296', 0],
        ['-9223372036854775809tail', 0],
    ]) {
        const parsed = parse(`windowborders:${value}`);
        assert.equal(windowbordersValue(parsed), expected, value);
        assert.equal(parsed.flags.windowborders, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('bare and empty positive values report then install mode 1', () => {
    for (const suffix of ['', ':', '=']) {
        const line = `OPTIONS=windowborders${suffix}`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(windowbordersValue(parsed), 1, suffix);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ` * Line 1: Missing parameter for 'windowborders${suffix}'.`,
        ], suffix);
    }
});

test('bare and empty-valued negations install mode 0', () => {
    for (const suffix of ['', ':', '=']) {
        const line = `OPTIONS=!windowborders${suffix},windowborders:4`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(windowbordersValue(parsed), 0, suffix);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' windowborders.',
        ], suffix);
    }
});

test('valued negation reports and preserves the previous mode', () => {
    for (const separator of [':', '=']) {
        const line = `OPTIONS=!windowborders${separator}4,windowborders:3`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(windowbordersValue(parsed), 3, separator);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' windowborders.',
            ' * Line 1: The windowborders option may not both have a value'
                + ' and be negated.',
        ], separator);
    }
});

test('out-of-range and overflowing atoi results preserve state', () => {
    for (const value of [
        '-1',
        '5',
        '2147483648',
        '9223372036854775808',
    ]) {
        const statement = `windowborders:${value}`;
        const line = `OPTIONS=${statement},windowborders:3`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(windowbordersValue(parsed), 3, value);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' windowborders.',
            ' * Line 1: Invalid windowborders (should be within 0 to 4):'
                + ` ${statement}.`,
        ], value);
    }
});

test('windowborders duplicates apply right to left and across later lines',
    () => {
        const line = 'OPTIONS=windowborders:1,windowborders:4';
        const parsed = parseNethackrc([
            line,
            'OPTIONS=windowborders:3',
        ].join('\n'));
        assert.equal(windowbordersValue(parsed), 3);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' windowborders.',
            '\nOPTIONS=windowborders:3',
            ' * Line 2: compound option specified multiple times:'
                + ' windowborders.',
        ]);
    });

test('windowborders retains its source option and capability contract', () => {
    const row = allopt.find(({ name }) => name === 'windowborders');
    assert.equal(row?.setwhere, 4);
    assert.equal(row?.negateok, true);
    assert.equal(row?.valok, true);
    assert.equal(row?.has_handler, true);
});

test('the fresh windowborders matrix contains replay inputs only', () => {
    const recipe = loadStartupWindowbordersRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_WINDOWBORDERS_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
    }
});

test('configured windowborders reaches installed startup iflags', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupWindowbordersRecipe().segments) {
            await verifyStartupWindowbordersSegment(segment);
        }
    })
));
