import assert from 'node:assert/strict';
import test from 'node:test';

import { allopt } from '../js/optlist_data.js';
import {
    optionValue,
    parseNethackrc,
    UNPARSED_COMPOUND_OPTIONS,
} from '../js/options.js';
import {
    loadStartupSortvanquishedRecipe,
    STARTUP_SORTVANQUISHED_CASES,
    verifyStartupSortvanquishedSegment,
} from './run-startup-sortvanquished.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

const VANQORDER_VALUES = Object.freeze([
    't: traditional: by monster level',
    'd: by monster difficulty rating',
    'a: alphabetically, unique monsters separate',
    'A: alphabetically, unique monsters intermixed',
    'C: by monster class, high to low level in class',
    'c: by monster class, low to high level in class',
    'n: by count, high to low',
    'z: by count, low to high',
]);

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

test('sortvanquished defaults to traditional order in flags', () => {
    const parsed = parseNethackrc('');
    assert.equal(parsed.flags.vanq_sortmode, 0);
    assert.equal(parsed.flags.sortvanquished, undefined);
});

test('sortvanquished accepts every source letter and numeric alias', () => {
    for (let index = 0; index < 8; ++index) {
        for (const value of [VANQORDER_VALUES[index][0], `${index}`]) {
            const parsed = parse(`sortvanquished:${value}suffix`);
            assert.equal(parsed.flags.vanq_sortmode, index, value);
            assert.equal(parsed.flags.sortvanquished, undefined, value);
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }
    }
});

test('sortvanquished letter modes remain case-sensitive', () => {
    for (const value of ['T', 'D', 'N', 'Z']) {
        const line = `OPTIONS=sortvanquished:${value}`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(parsed.flags.vanq_sortmode, 0, value);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ` * Line 1: Unknown sortvanquished parameter '${value}'.`,
        ], value);
    }
});

test('missing and invalid values report without changing prior order', () => {
    for (const [suffix, reported] of [
        ['', "Missing parameter for 'sortvanquished'."],
        [':', "Missing parameter for 'sortvanquished:'."],
        ['=', "Missing parameter for 'sortvanquished='."],
        [':bogus', "Unknown sortvanquished parameter 'bogus'."],
    ]) {
        const line = `OPTIONS=sortvanquished${suffix},sortvanquished:n`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(parsed.flags.vanq_sortmode, 6, suffix);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' sortvanquished.',
            ` * Line 1: ${reported}`,
        ], suffix);
    }
});

test('sortvanquished negation parses a missing value then resets', () => {
    for (const [spelling, reported] of [
        ['!sortvanquished', true],
        ['!sortvanquished:', true],
        ['!sortvanquished=bogus', false],
        ['!sortvanquished:Aignored', false],
    ]) {
        const line = `OPTIONS=${spelling},sortvanquished:n`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(parsed.flags.vanq_sortmode, 0, spelling);
        const output = [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' sortvanquished.',
        ];
        if (reported) {
            output.push(
                ` * Line 1: Missing parameter for '${spelling.slice(1)}'.`,
            );
        }
        assert.deepEqual(parsed.configErrorFrame.output, output, spelling);
    }
});

test('sortvanquished duplicates apply right to left and across later lines',
    () => {
        const parsed = parseNethackrc([
            'OPTIONS=sortvanquished:a,sortvanquished:C',
            'OPTIONS=sortvanquished:z',
        ].join('\n'));
        assert.equal(parsed.flags.vanq_sortmode, 7);
        assert.deepEqual(parsed.configErrorFrame.output, [
            '\nOPTIONS=sortvanquished:a,sortvanquished:C',
            ' * Line 1: compound option specified multiple times:'
                + ' sortvanquished.',
            '\nOPTIONS=sortvanquished:z',
            ' * Line 2: compound option specified multiple times:'
                + ' sortvanquished.',
        ]);
    });

test('the optionsfull getter names all eight vanquished orders', () => {
    const row = allopt.find(({ name }) => name === 'sortvanquished');
    const parsed = parseNethackrc('');
    for (let index = 0; index < VANQORDER_VALUES.length; ++index) {
        parsed.flags.vanq_sortmode = index;
        assert.equal(optionValue(parsed, row, {}), VANQORDER_VALUES[index]);
    }
    assert.equal(UNPARSED_COMPOUND_OPTIONS.has('sortvanquished'), false);
});

test('the fresh sortvanquished matrix contains replay inputs only', () => {
    const recipe = loadStartupSortvanquishedRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_SORTVANQUISHED_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured vanquished orders reach startup state and optionsfull', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupSortvanquishedRecipe().segments)
            await verifyStartupSortvanquishedSegment(segment);
    })
));
