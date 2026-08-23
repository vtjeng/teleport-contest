import assert from 'node:assert/strict';
import test from 'node:test';

import {
    INVOPT_FULL,
    INVOPT_FULL_GRID,
    INVOPT_IN_USE,
    INVOPT_NONE,
    INVOPT_ON,
    INVOPT_ON_GRID,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { allopt } from '../js/optlist_data.js';
import {
    dosetMenuItems,
    optionValue,
    parseNethackrc,
} from '../js/options.js';
import {
    loadStartupPerminvModeRecipe,
    STARTUP_PERMINV_MODE_CASES,
    verifyStartupPerminvModeSegment,
} from './run-startup-perminv-mode.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function fields(parsed) {
    return [parsed.iflags.perminv_mode, parsed.iflags.perm_invent];
}

test('perminv_mode starts in its zeroed field beside the boolean default', () => {
    const parsed = parseNethackrc('');
    assert.deepEqual(fields(parsed), [INVOPT_NONE, false]);
    assert.equal(parsed.flags.perminv_mode, undefined);
});

test('compiled permanent inventory modes and aliases couple both fields', () => {
    for (const [value, mode] of [
        ['none', INVOPT_NONE], ['off', INVOPT_NONE],
        ['all', INVOPT_ON], ['on', INVOPT_ON],
        ['full', INVOPT_FULL], ['gold', INVOPT_FULL],
        ['in-use', INVOPT_IN_USE], ['inuse-only', INVOPT_IN_USE],
    ]) {
        const parsed = parse(`perminv_mode:${value.toUpperCase()}`);
        assert.deepEqual(fields(parsed), [mode, true], value);
        assert.equal(parsed.flags.perminv_mode, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('source prefixes and the first numeric byte select the first mode', () => {
    for (const [value, mode] of [
        ['n', INVOPT_NONE], ['o', INVOPT_NONE],
        ['a', INVOPT_ON], ['on', INVOPT_ON],
        ['f', INVOPT_FULL], ['g', INVOPT_FULL],
        ['i', INVOPT_IN_USE],
        ['0trailing', INVOPT_NONE], ['1trailing', INVOPT_ON],
        ['2trailing', INVOPT_FULL], ['8trailing', INVOPT_IN_USE],
    ]) {
        const parsed = parse(`perminv_mode:${value}`);
        assert.deepEqual(fields(parsed), [mode, true], value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('grid modes absent from this build report unknown and reset state', () => {
    for (const value of [
        'on+grid', 'all+grid', 'gold+grid', 'full+grid',
        `${INVOPT_ON_GRID}`, `${INVOPT_ON_GRID}trailing`,
        `${INVOPT_FULL_GRID}`, `${INVOPT_FULL_GRID}trailing`,
    ]) {
        const line = `OPTIONS=perminv_mode:${value},perminv_mode:all`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.deepEqual(fields(parsed), [INVOPT_NONE, false], value);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' perminv_mode.',
            ` * Line 1: Unknown perminv_mode parameter '${value}'.`,
        ], value);
    }
});

test('missing values report and preserve the right-hand setting', () => {
    for (const suffix of ['', ':', '=']) {
        const statement = `perminv_mode${suffix}`;
        const line = `OPTIONS=${statement},perminv_mode:full`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.deepEqual(fields(parsed), [INVOPT_FULL, true], suffix);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' perminv_mode.',
            ` * Line 1: Missing parameter for '${statement}'.`,
        ], suffix);
    }
});

test('unknown values report and reset both fields', () => {
    const line = 'OPTIONS=perminv_mode:zqxj,perminv_mode:full';
    const parsed = parseNethackrc(`${line}\n`);
    assert.deepEqual(fields(parsed), [INVOPT_NONE, false]);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times: perminv_mode.',
        " * Line 1: Unknown perminv_mode parameter 'zqxj'.",
    ]);
});

test('valued negation reports and preserves both fields', () => {
    const line = 'OPTIONS=!perminv_mode:all,perminv_mode:full';
    const parsed = parseNethackrc(`${line}\n`);
    assert.deepEqual(fields(parsed), [INVOPT_FULL, true]);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times: perminv_mode.',
        ' * Line 1: The perminv_mode option may not both have a value and be'
            + ' negated.',
    ]);
});

test('bare and empty-valued negation reset both fields', () => {
    for (const suffix of ['', ':', '=']) {
        const line = `OPTIONS=!perminv_mode${suffix},perminv_mode:full`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.deepEqual(fields(parsed), [INVOPT_NONE, false], suffix);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' perminv_mode.',
        ], suffix);
    }
});

test('duplicates apply right to left and then across later lines', () => {
    const line = 'OPTIONS=perminv_mode:all,perminv_mode:full';
    const parsed = parseNethackrc([
        line,
        'OPTIONS=perminv_mode:in-use',
    ].join('\n'));
    assert.deepEqual(fields(parsed), [INVOPT_IN_USE, true]);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times: perminv_mode.',
        '\nOPTIONS=perminv_mode:in-use',
        ' * Line 2: compound option specified multiple times: perminv_mode.',
    ]);
});

test('the source getter describes each compiled mode and disabled pairing', () => {
    const option = allopt.find(({ name }) => name === 'perminv_mode');
    const parsed = parseNethackrc('');
    for (const [mode, expected] of [
        [INVOPT_NONE, 'no permanent inventory window'],
        [INVOPT_ON, 'all inventory except for gold'],
        [INVOPT_FULL, 'full inventory including gold'],
        [INVOPT_IN_USE, 'subset: items currently in use'],
    ]) {
        parsed.iflags.perminv_mode = mode;
        parsed.iflags.perm_invent = true;
        assert.equal(optionValue(parsed, option, {}), expected, mode);
    }
    for (const [mode, expected] of [
        [INVOPT_ON, "all invent except for gold ('perm_invent' is Off)"],
        [INVOPT_FULL, "full invent including gold ('perm_invent' is Off)"],
        [INVOPT_IN_USE, "subset: items in use ('perm_invent' is Off)"],
    ]) {
        parsed.iflags.perminv_mode = mode;
        parsed.iflags.perm_invent = false;
        assert.equal(optionValue(parsed, option, {}), expected, mode);
    }
});

test('the fresh matrix contains replay inputs only', () => {
    const recipe = loadStartupPerminvModeRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, STARTUP_PERMINV_MODE_CASES.length);
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured permanent inventory mode reaches its source boundary', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupPerminvModeRecipe().segments)
            await verifyStartupPerminvModeSegment(segment);
    })
));

test('TTY excludes both permanent inventory settings from optionsfull', () => (
    withSerializedGrids(async () => {
        await verifyStartupPerminvModeSegment(
            loadStartupPerminvModeRecipe().segments[3],
        );
        const items = dosetMenuItems(game, {
            headingStyle: {},
            countBindKeys: () => 0,
        }, true);
        for (const name of ['perm_invent', 'perminv_mode']) {
            assert.equal(items.some(({ text }) => (
                text.trim().startsWith(`${name} `)
            )), false, name);
        }
    })
));
