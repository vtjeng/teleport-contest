import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALIGN_BOTTOM,
    ALIGN_LEFT,
    ALIGN_RIGHT,
    ALIGN_TOP,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { allopt } from '../js/optlist_data.js';
import {
    dosetMenuItems,
    optionValue,
    parseNethackrc,
} from '../js/options.js';
import {
    loadStartupWindowAlignmentRecipe,
    STARTUP_WINDOW_ALIGNMENT_CASES,
    verifyStartupWindowAlignmentSegment,
} from './run-startup-window-alignments.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function alignments(parsed) {
    return [
        parsed.iflags.wc_align_message,
        parsed.iflags.wc_align_status,
    ];
}

test('window alignments start only in their source-default iflags fields',
    () => {
        const parsed = parseNethackrc('');
        assert.deepEqual(alignments(parsed), [ALIGN_TOP, ALIGN_BOTTOM]);
        assert.equal(parsed.flags.align_message, undefined);
        assert.equal(parsed.flags.align_status, undefined);
    });

test('alignment getters name each constant and use default otherwise', () => {
    const message = allopt.find(({ name }) => name === 'align_message');
    const status = allopt.find(({ name }) => name === 'align_status');
    const parsed = parseNethackrc('');

    for (const [value, expected] of [
        [ALIGN_LEFT, 'left'],
        [ALIGN_TOP, 'top'],
        [ALIGN_RIGHT, 'right'],
        [ALIGN_BOTTOM, 'bottom'],
        [0, 'default'],
        [99, 'default'],
    ]) {
        parsed.iflags.wc_align_message = value;
        parsed.iflags.wc_align_status = value;
        assert.equal(optionValue(parsed, message, {}), expected, value);
        assert.equal(optionValue(parsed, status, {}), expected, value);
    }
});

test('complete alignment tokens accept arbitrary suffixes without case',
    () => {
        const values = [
            ['LeFt-tail', ALIGN_LEFT],
            ['TOPsuffix', ALIGN_TOP],
            ['RiGhT123', ALIGN_RIGHT],
            ['BoTtOm_anything', ALIGN_BOTTOM],
        ];
        for (const [value, expected] of values) {
            const parsed = parse(
                `align_message:${value},align_status:${value}`,
            );
            assert.deepEqual(alignments(parsed), [expected, expected], value);
            assert.equal(parsed.flags.align_message, undefined, value);
            assert.equal(parsed.flags.align_status, undefined, value);
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }
    });

test('missing and invalid alignment values report and preserve prior state',
    () => {
        for (const [name, statement, message] of [
            [
                'align_message', 'align_message',
                "Missing parameter for 'align_message'.",
            ],
            [
                'align_status', 'align_status:',
                "Missing parameter for 'align_status:'.",
            ],
            [
                'align_message', 'align_message:lef',
                "Unknown align_message parameter 'lef'.",
            ],
            [
                'align_status', 'align_status: top',
                "Unknown align_status parameter ' top'.",
            ],
        ]) {
            const line = `OPTIONS=${statement},align_message:bottom,`
                + 'align_status:left';
            const parsed = parseNethackrc(`${line}\n`);
            assert.deepEqual(
                alignments(parsed), [ALIGN_BOTTOM, ALIGN_LEFT], statement,
            );
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\n${line}`,
                ` * Line 1: compound option specified multiple times: ${name}.`,
                ` * Line 1: ${message}`,
            ], statement);
        }
    });

test('message handler and status parser reject their source negation paths',
    () => {
        const message = allopt.find(({ name }) => name === 'align_message');
        const status = allopt.find(({ name }) => name === 'align_status');
        assert.equal(message.negateok, true);
        assert.equal(status.negateok, false);

        for (const [name, statement] of [
            ['align_message', '!align_message'],
            ['align_message', '!align_message:top'],
            ['align_status', '!align_status'],
            ['align_status', '!align_status:bottom'],
        ]) {
            const line = `OPTIONS=${statement},align_message:right,`
                + 'align_status:left';
            const parsed = parseNethackrc(`${line}\n`);
            assert.deepEqual(
                alignments(parsed), [ALIGN_RIGHT, ALIGN_LEFT], statement,
            );
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\n${line}`,
                ` * Line 1: compound option specified multiple times: ${name}.`,
                ` * Line 1: The ${name} option may not both have a value and be negated.`,
            ], statement);
        }
    });

test('alignment duplicates apply leftmost on one line and later across lines',
    () => {
        const line = 'OPTIONS=align_message:left,align_message:bottom,'
            + 'align_status:top,align_status:right';
        const sameLine = parseNethackrc(`${line}\n`);
        assert.deepEqual(alignments(sameLine), [ALIGN_LEFT, ALIGN_TOP]);
        assert.deepEqual(sameLine.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' align_status.',
            ' * Line 1: compound option specified multiple times:'
                + ' align_message.',
        ]);

        const later = parseNethackrc([
            line,
            'OPTIONS=align_message:right',
            'OPTIONS=align_status:bottom',
        ].join('\n'));
        assert.deepEqual(alignments(later), [ALIGN_RIGHT, ALIGN_BOTTOM]);
    });

test('the fresh alignment matrix contains replay inputs only', () => {
    const recipe = loadStartupWindowAlignmentRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_WINDOW_ALIGNMENT_CASES.map(
            ({ seed, datetime }) => [seed, datetime],
        ),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured alignments reach installed startup iflags', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupWindowAlignmentRecipe().segments)
            await verifyStartupWindowAlignmentSegment(segment);
    })
));

test('TTY excludes both window alignments from optionsfull', () => (
    withSerializedGrids(async () => {
        for (const name of ['align_message', 'align_status']) {
            const row = allopt.find((option) => option.name === name);
            assert.equal(row?.setwhere, 3, name);
            assert.equal(row?.valok, true, name);
        }

        await verifyStartupWindowAlignmentSegment(
            loadStartupWindowAlignmentRecipe().segments[0],
        );
        assert.deepEqual(alignments(game), [ALIGN_LEFT, ALIGN_TOP]);
        const items = dosetMenuItems(game, {
            headingStyle: {},
            countBindKeys: () => 0,
        }, true);
        for (const name of ['align_message', 'align_status']) {
            assert.equal(
                items.some(({ text }) => text.trim().startsWith(`${name} `)),
                false,
                name,
            );
        }
    })
));
