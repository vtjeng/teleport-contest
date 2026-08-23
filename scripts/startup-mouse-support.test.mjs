import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { allopt } from '../js/optlist_data.js';
import {
    dosetMenuItems,
    optionValue,
    parseNethackrc,
} from '../js/options.js';
import {
    loadStartupMouseSupportRecipe,
    STARTUP_MOUSE_SUPPORT_CASES,
    verifyStartupMouseSupportSegment,
} from './run-startup-mouse-support.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function mouseSupport(parsed) {
    return parsed.iflags.wc_mouse_support;
}

test('mouse support starts only in its zeroed iflags field', () => {
    const parsed = parseNethackrc('');
    assert.equal(mouseSupport(parsed), 0);
    assert.equal(parsed.flags.mouse_support, undefined);
});

test('mouse support getter describes the three source modes', () => {
    const option = allopt.find(({ name }) => name === 'mouse_support');
    const parsed = parseNethackrc('');
    for (const [mode, expected] of [
        [0, '0=off'],
        [1, '1=on, O/S adjusted'],
        [2, '2=on, O/S unchanged'],
        [3, ''],
    ]) {
        parsed.iflags.wc_mouse_support = mode;
        assert.equal(optionValue(parsed, option, {}), expected, mode);
    }
});

test('mouse support accepts source modes after C atoi', () => {
    for (const [value, expected] of [
        ['0', 0],
        ['0junk', 0],
        ['00tail', 0],
        ['1', 1],
        ['1junk', 1],
        ['2', 2],
        ['2junk', 2],
        ['4294967297tail', 1],
        ['4294967298tail', 2],
    ]) {
        const parsed = parse(`mouse_support:${value}`);
        assert.equal(mouseSupport(parsed), expected, value);
        assert.equal(parsed.flags.mouse_support, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('zero mode requires a literal zero as the first value byte', () => {
    for (const value of ['zqxj', '+0', '-0', ' 0', '\t0']) {
        const line = `OPTIONS=mouse_support:${value},mouse_support:2`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(mouseSupport(parsed), 2, value);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' mouse_support.',
            ` * Line 1: Illegal mouse_support parameter '${value}'.`,
        ], value);
    }
});

test('out-of-range mouse modes report and preserve prior state', () => {
    for (const value of ['-1', '3', '2147483648', '9223372036854775808']) {
        const line = `OPTIONS=mouse_support:${value},mouse_support:2`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(mouseSupport(parsed), 2, value);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' mouse_support.',
            ` * Line 1: Illegal mouse_support parameter '${value}'.`,
        ], value);
    }
});

test('statement length controls missing-value compatibility', () => {
    for (const statement of ['mou', 'mou:', 'mouse_support']) {
        const parsed = parse(statement);
        assert.equal(mouseSupport(parsed), 1, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
    }

    for (const statement of ['mouse_support:', 'mouse_support=']) {
        const parsed = parse(statement);
        assert.equal(mouseSupport(parsed), 1, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=${statement}`,
            ` * Line 1: Missing parameter for '${statement}'.`,
        ], statement);
    }
});

test('parseoptions rejects mouse support negation before its handler', () => {
    const row = allopt.find(({ name }) => name === 'mouse_support');
    assert.equal(row?.negateok, false);
    for (const statement of [
        '!mouse_support', '!mouse_support:', '!mouse_support:2', '!mou',
    ]) {
        const line = `OPTIONS=${statement},mouse_support:1`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(mouseSupport(parsed), 1, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' mouse_support.',
            ' * Line 1: The mouse_support option may not both have a value'
                + ' and be negated.',
        ], statement);
    }
});

test('mouse support duplicates apply right to left and across later lines',
    () => {
        const line = 'OPTIONS=mouse_support:1,mouse_support:2';
        const parsed = parseNethackrc([
            line,
            'OPTIONS=mouse_support:0',
        ].join('\n'));
        assert.equal(mouseSupport(parsed), 0);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' mouse_support.',
            '\nOPTIONS=mouse_support:0',
            ' * Line 2: compound option specified multiple times:'
                + ' mouse_support.',
        ]);

        assert.equal(
            mouseSupport(parse(line.slice('OPTIONS='.length))),
            1,
        );
    });

test('the fresh mouse support matrix contains replay inputs only', () => {
    const recipe = loadStartupMouseSupportRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_MOUSE_SUPPORT_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured mouse support reaches installed startup iflags', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupMouseSupportRecipe().segments)
            await verifyStartupMouseSupportSegment(segment);
    })
));

test('TTY excludes mouse support from optionsfull', () => (
    withSerializedGrids(async () => {
        const row = allopt.find(({ name }) => name === 'mouse_support');
        assert.equal(row?.setwhere, 4);
        assert.equal(row?.negateok, false);
        assert.equal(row?.valok, true);
        assert.equal(row?.has_handler, false);

        await verifyStartupMouseSupportSegment(
            loadStartupMouseSupportRecipe().segments[1],
        );
        assert.equal(mouseSupport(game), 1);
        const items = dosetMenuItems(game, {
            headingStyle: {},
            countBindKeys: () => 0,
        }, true);
        assert.equal(
            items.some(({ text }) => text.trim().startsWith('mouse_support ')),
            false,
        );
    })
));
