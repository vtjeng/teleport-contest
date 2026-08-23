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
    loadStartupTermSizeRecipe,
    STARTUP_TERM_SIZE_CASES,
    verifyStartupTermSizeSegment,
} from './run-startup-term-size.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function termSize(parsed) {
    return [
        parsed.iflags.wc2_term_cols,
        parsed.iflags.wc2_term_rows,
    ];
}

test('terminal dimensions start only in their zeroed iflags fields', () => {
    const parsed = parseNethackrc('');
    assert.deepEqual(termSize(parsed), [0, 0]);
    assert.equal(parsed.flags.term_cols, undefined);
    assert.equal(parsed.flags.term_rows, undefined);
});

test('terminal dimension getters print default or the installed decimal',
    () => {
        const cols = allopt.find(({ name }) => name === 'term_cols');
        const rows = allopt.find(({ name }) => name === 'term_rows');
        const parsed = parseNethackrc('');
        assert.equal(optionValue(parsed, cols, {}), 'default');
        assert.equal(optionValue(parsed, rows, {}), 'default');

        parsed.iflags.wc2_term_cols = 1;
        parsed.iflags.wc2_term_rows = 32766;
        assert.equal(optionValue(parsed, cols, {}), '1');
        assert.equal(optionValue(parsed, rows, {}), '32766');
    });

test('terminal dimensions accept the LP64 decimal prefix within source bounds',
    () => {
        for (const [value, expected] of [
            ['1', 1],
            ['32766', 32766],
            ['+23tail', 23],
            [' \t+17suffix', 17],
            ['00042rest', 42],
        ]) {
            const parsed = parse(`term_cols:${value},term_rows:${value}`);
            assert.deepEqual(termSize(parsed), [expected, expected], value);
            assert.equal(parsed.flags.term_cols, undefined, value);
            assert.equal(parsed.flags.term_rows, undefined, value);
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }
    });

test('invalid and overflowing LP64 values report exactly and preserve state',
    () => {
        for (const [value, reported] of [
            ['0', '0'],
            ['-1tail', '-1'],
            ['text', '0'],
            ['32767', '32767'],
            ['9223372036854775807', '9223372036854775807'],
            ['9223372036854775808', '9223372036854775807'],
            ['-9223372036854775808', '-9223372036854775808'],
            ['-9223372036854775809', '-9223372036854775808'],
        ]) {
            for (const [name, expected] of [
                ['term_cols', [17, 19]],
                ['term_rows', [17, 19]],
            ]) {
                const line = `OPTIONS=${name}:${value},term_cols:17,`
                    + 'term_rows:19';
                const parsed = parseNethackrc(`${line}\n`);
                assert.deepEqual(termSize(parsed), expected, name + value);
                assert.deepEqual(parsed.configErrorFrame.output, [
                    `\n${line}`,
                    ` * Line 1: compound option specified multiple times: ${name}.`,
                    ` * Line 1: Invalid ${name}: ${reported}.`,
                ], name + value);
            }
        }
    });

test('missing and negated dimensions report after duplicates and preserve state',
    () => {
        for (const [name, statement, message] of [
            [
                'term_cols', 'term_cols',
                "Missing parameter for 'term_cols'.",
            ],
            [
                'term_rows', 'term_rows:',
                "Missing parameter for 'term_rows:'.",
            ],
            [
                'term_cols', '!term_cols:12',
                'The term_cols option may not both have a value and be negated.',
            ],
            [
                'term_rows', '!term_rows',
                'The term_rows option may not both have a value and be negated.',
            ],
        ]) {
            const line = `OPTIONS=${statement},term_cols:17,term_rows:19`;
            const parsed = parseNethackrc(`${line}\n`);
            assert.deepEqual(termSize(parsed), [17, 19], statement);
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\n${line}`,
                ` * Line 1: compound option specified multiple times: ${name}.`,
                ` * Line 1: ${message}`,
            ], statement);
        }
    });

test('termcolumns is an exact alias for the term_cols row and diagnostics',
    () => {
        const accepted = parse('termcolumns:+23tail');
        assert.deepEqual(termSize(accepted), [23, 0]);
        assert.equal(accepted.flags.termcolumns, undefined);

        for (const [statement, message] of [
            ['termcolumns', "Missing parameter for 'termcolumns'."],
            ['termcolumns:0', 'Invalid term_cols: 0.'],
            [
                '!termcolumns:12',
                'The term_cols option may not both have a value and be negated.',
            ],
        ]) {
            const parsed = parse(statement);
            assert.deepEqual(termSize(parsed), [0, 0], statement);
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\nOPTIONS=${statement}`,
                ` * Line 1: ${message}`,
            ], statement);
        }
    });

test('terminal-size duplicates apply right to left and across later lines',
    () => {
        const line = 'OPTIONS=term_cols:11,term_rows:22,termcolumns:33';
        const parsed = parseNethackrc([
            line,
            'OPTIONS=term_rows:44',
            'OPTIONS=termcolumns:55',
        ].join('\n'));
        assert.deepEqual(termSize(parsed), [55, 44]);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: term_cols'
                + ' (via alias: termcolumns).',
            '\nOPTIONS=term_rows:44',
            ' * Line 2: compound option specified multiple times: term_rows.',
            '\nOPTIONS=termcolumns:55',
            ' * Line 3: compound option specified multiple times: term_cols'
                + ' (via alias: termcolumns).',
        ]);

        const sameLine = parse(line.slice('OPTIONS='.length));
        assert.deepEqual(termSize(sameLine), [11, 22]);
    });

test('the fresh terminal-size matrix contains replay inputs only', () => {
    const recipe = loadStartupTermSizeRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_TERM_SIZE_CASES.map(({ seed, datetime }) => [seed, datetime]),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured terminal dimensions reach installed startup iflags', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupTermSizeRecipe().segments)
            await verifyStartupTermSizeSegment(segment);
    })
));

test('TTY excludes terminal dimensions from optionsfull', () => (
    withSerializedGrids(async () => {
        for (const name of ['term_cols', 'term_rows']) {
            const row = allopt.find((option) => option.name === name);
            assert.equal(row?.setwhere, 1, name);
            assert.equal(row?.negateok, false, name);
            assert.equal(row?.valok, true, name);
        }

        await verifyStartupTermSizeSegment(
            loadStartupTermSizeRecipe().segments[1],
        );
        assert.deepEqual(termSize(game), [1, 32766]);
        const items = dosetMenuItems(game, {
            headingStyle: {},
            countBindKeys: () => 0,
        }, true);
        for (const name of ['term_cols', 'term_rows']) {
            assert.equal(
                items.some(({ text }) => text.trim().startsWith(`${name} `)),
                false,
                name,
            );
        }
    })
));
