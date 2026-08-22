import assert from 'node:assert/strict';
import test from 'node:test';

import { allopt } from '../js/optlist_data.js';
import { optionValue, parseNethackrc } from '../js/options.js';
import {
    loadStartupScrollOptionsRecipe,
    STARTUP_SCROLL_OPTIONS_CASES,
    verifyStartupScrollOptionsSegment,
} from './run-startup-scroll-options.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function scrollValues(parsed) {
    return [
        parsed.iflags.wc_scroll_amount,
        parsed.iflags.wc_scroll_margin,
    ];
}

test('scroll amount and margin start in their zeroed iflags fields', () => {
    const parsed = parseNethackrc('');
    assert.deepEqual(scrollValues(parsed), [0, 0]);
    assert.equal(parsed.flags.scroll_amount, undefined);
    assert.equal(parsed.flags.scroll_margin, undefined);
});

test('scroll value getters print default or the signed decimal', () => {
    const amount = allopt.find(({ name }) => name === 'scroll_amount');
    const margin = allopt.find(({ name }) => name === 'scroll_margin');
    const parsed = parseNethackrc('');
    assert.equal(optionValue(parsed, amount, {}), 'default');
    assert.equal(optionValue(parsed, margin, {}), 'default');

    parsed.iflags.wc_scroll_amount = -17;
    parsed.iflags.wc_scroll_margin = 23;
    assert.equal(optionValue(parsed, amount, {}), '-17');
    assert.equal(optionValue(parsed, margin, {}), '23');
});

test('scroll amount and margin store unrestricted C atoi results', () => {
    for (const [value, expected] of [
        ['text', 0],
        ['-17tail', -17],
        [' \t+23suffix', 23],
        ['2147483648', -2147483648],
    ]) {
        const parsed = parse(
            `scroll_amount:${value},scroll_margin:${value}`,
        );
        assert.deepEqual(scrollValues(parsed), [expected, expected], value);
        assert.equal(parsed.flags.scroll_amount, undefined, value);
        assert.equal(parsed.flags.scroll_margin, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('bare negation installs each source fallback including empty values', () => {
    for (const statement of [
        '!scroll_amount,!scroll_margin',
        '!scroll_amount:,!scroll_margin=',
    ]) {
        const parsed = parse(statement);
        assert.deepEqual(scrollValues(parsed), [1, 5], statement);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
    }
});

test('missing and negated values report after duplicates and preserve state',
    () => {
        for (const [name, sibling, suffix, expectedMessage] of [
            [
                'scroll_amount', 'scroll_margin', '',
                "Missing parameter for 'scroll_amount'.",
            ],
            [
                'scroll_margin', 'scroll_amount', ':',
                "Missing parameter for 'scroll_margin:'.",
            ],
            [
                'scroll_amount', 'scroll_margin', ':12',
                'The scroll_amount option may not both have a value and be'
                    + ' negated.',
            ],
            [
                'scroll_margin', 'scroll_amount', ':12',
                'The scroll_margin option may not both have a value and be'
                    + ' negated.',
            ],
        ]) {
            const rejected = suffix === ':12' ? `!${name}${suffix}`
                : `${name}${suffix}`;
            const line = `OPTIONS=${rejected},${name}:17,${sibling}:29`;
            const parsed = parseNethackrc(`${line}\n`);
            const expected = name === 'scroll_amount' ? [17, 29] : [29, 17];
            assert.deepEqual(scrollValues(parsed), expected, name + suffix);
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\n${line}`,
                ` * Line 1: compound option specified multiple times: ${name}.`,
                ` * Line 1: ${expectedMessage}`,
            ], name + suffix);
        }
    });

test('scroll duplicate counters are independent and apply right to left', () => {
    const line = 'OPTIONS=scroll_amount:11,scroll_margin:22,'
        + 'scroll_amount:33,scroll_margin:44';
    const parsed = parseNethackrc([
        line,
        'OPTIONS=scroll_margin:55',
    ].join('\n'));
    assert.deepEqual(scrollValues(parsed), [11, 55]);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times: scroll_margin.',
        ' * Line 1: compound option specified multiple times: scroll_amount.',
        '\nOPTIONS=scroll_margin:55',
        ' * Line 2: compound option specified multiple times: scroll_margin.',
    ]);
});

test('scroll option abbreviations report the canonical name on bad negation',
    () => {
        const amount = parse('!scroll_a:4');
        assert.deepEqual(amount.configErrorFrame.output, [
            '\nOPTIONS=!scroll_a:4',
            ' * Line 1: The scroll_amount option may not both have a value'
                + ' and be negated.',
        ]);
        const margin = parse('!scroll_m:4');
        assert.deepEqual(margin.configErrorFrame.output, [
            '\nOPTIONS=!scroll_m:4',
            ' * Line 1: The scroll_margin option may not both have a value'
                + ' and be negated.',
        ]);
    });

test('the fresh scroll-option matrix contains replay inputs only', () => {
    const recipe = loadStartupScrollOptionsRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_SCROLL_OPTIONS_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured scroll values reach installed startup iflags', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupScrollOptionsRecipe().segments)
            await verifyStartupScrollOptionsSegment(segment);
    })
));

test('scroll option rows retain the source window-capability contract', () => {
    for (const name of ['scroll_amount', 'scroll_margin']) {
        const row = allopt.find((option) => option.name === name);
        assert.equal(row?.setwhere, 3, name);
        assert.equal(row?.negateok, true, name);
        assert.equal(row?.valok, true, name);
    }
});
