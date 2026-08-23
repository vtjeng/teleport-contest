import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { encodeUtf8ByteString } from '../js/hacklib.js';
import { allopt } from '../js/optlist_data.js';
import {
    optionValue,
    parseNethackrc,
    UNPARSED_COMPOUND_OPTIONS,
} from '../js/options.js';
import {
    loadStartupWindowtypeRecipe,
    STARTUP_WINDOWTYPE_CASES,
    verifyStartupWindowtypeSegment,
} from './run-startup-windowtype.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function chosenWindowtype(state) {
    return state.gc?.chosen_windowtype;
}

function windowtypeOption() {
    return allopt.find(({ name }) => name === 'windowtype');
}

test('window type starts in its zeroed gc buffer with active TTY', () => {
    const parsed = parseNethackrc('');
    assert.equal(chosenWindowtype(parsed), '');
    assert.equal(parsed.flags.windowtype, undefined);
    assert.equal(optionValue(parsed, windowtypeOption(), {}), 'tty');
});

test('window type accepts TTY without case and retains its spelling', () => {
    for (const value of ['tty', 'TTY', 'TtY']) {
        const parsed = parse(`windowtype:${value}`);
        assert.equal(chosenWindowtype(parsed), value);
        assert.equal(parsed.flags.windowtype, undefined);
        assert.equal(optionValue(parsed, windowtypeOption(), {}), 'tty');
        assert.deepEqual(parsed.configErrorFrame.output, []);
    }
});

test('window type copies at most WINTYPELEN minus one source bytes', () => {
    const value = '0123456789abcdef-tail';
    const line = `OPTIONS=windowtype:${value}`;
    const parsed = parseNethackrc(`${line}\n`);
    assert.equal(chosenWindowtype(parsed), '0123456789abcde');
    assert.equal(optionValue(parsed, windowtypeOption(), {}), 'tty');
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: Window type 0123456789abcde not recognized.  The only'
            + ' choice is: tty.',
    ]);
});

test('window type truncation preserves an orphan UTF-8 boundary byte', () => {
    const value = '0123456789abcdé-tail';
    const truncated = `0123456789abcd${String.fromCharCode(0xDCC3)}`;
    const line = `OPTIONS=windowtype:${value}`;
    const parsed = parseNethackrc(`${line}\n`);
    assert.deepEqual(
        encodeUtf8ByteString(chosenWindowtype(parsed)),
        [...Buffer.from('0123456789abcd'), 0xC3],
    );
    assert.equal(chosenWindowtype(parsed), truncated);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ` * Line 1: Window type ${truncated} not recognized.  The only`
            + ' choice is: tty.',
    ]);
});

test('unknown window types retain active TTY and report the sole choice', () => {
    const line = 'OPTIONS=windowtype:zqxj';
    const parsed = parseNethackrc(`${line}\n`);
    assert.equal(chosenWindowtype(parsed), 'zqxj');
    assert.equal(optionValue(parsed, windowtypeOption(), {}), 'tty');
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: Window type zqxj not recognized.  The only choice is:'
            + ' tty.',
    ]);
});

test('missing and empty window types report and preserve prior state', () => {
    for (const statement of ['windowtype', 'windowtype:', 'windowtype=']) {
        const line = `OPTIONS=${statement},windowtype:TTY`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(chosenWindowtype(parsed), 'TTY', statement);
        assert.equal(optionValue(parsed, windowtypeOption(), {}), 'tty');
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' windowtype.',
            ` * Line 1: Missing parameter for '${statement}'.`,
        ], statement);
    }
});

test('parseoptions rejects window type negation before its handler', () => {
    const row = windowtypeOption();
    assert.equal(row?.negateok, false);
    for (const statement of [
        '!windowtype', '!windowtype:', '!windowtype:zqxj', '!windowt:zqxj',
    ]) {
        const line = `OPTIONS=${statement},windowtype:TTY`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(chosenWindowtype(parsed), 'TTY', statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' windowtype.',
            ' * Line 1: The windowtype option may not both have a value and'
                + ' be negated.',
        ], statement);
    }
});

test('window type duplicates apply right to left and across later lines', () => {
    const line = 'OPTIONS=windowtype:TtY,windowtype:TTY';
    const sameLine = parseNethackrc(`${line}\n`);
    assert.equal(chosenWindowtype(sameLine), 'TtY');
    assert.deepEqual(sameLine.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times: windowtype.',
    ]);

    const later = parseNethackrc([
        line,
        'OPTIONS=windowtype:tty',
    ].join('\n'));
    assert.equal(chosenWindowtype(later), 'tty');
});

test('the fresh window type matrix contains replay inputs only', () => {
    const recipe = loadStartupWindowtypeRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_WINDOWTYPE_CASES.map(({ seed, datetime }) => [seed, datetime]),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured window type reaches the running startup state', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupWindowtypeRecipe().segments)
            await verifyStartupWindowtypeSegment(segment);
    })
));

test('window type getters read active TTY after configuration', () => (
    withSerializedGrids(async () => {
        const row = windowtypeOption();
        assert.equal(row?.setwhere, 3);
        assert.equal(row?.negateok, false);
        assert.equal(row?.valok, true);
        assert.equal(row?.has_handler, false);

        await verifyStartupWindowtypeSegment(
            loadStartupWindowtypeRecipe().segments[1],
        );
        assert.equal(chosenWindowtype(game), 'zqxj');
        assert.equal(optionValue(game, row, {}), 'tty');
        assert.equal(UNPARSED_COMPOUND_OPTIONS.has('windowtype'), false);
    })
));
