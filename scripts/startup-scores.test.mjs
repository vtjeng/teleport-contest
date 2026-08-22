import assert from 'node:assert/strict';
import test from 'node:test';

import { allopt } from '../js/optlist_data.js';
import {
    parseNethackrc,
    UNPARSED_COMPOUND_OPTIONS,
} from '../js/options.js';
import {
    loadStartupScoresRecipe,
    STARTUP_SCORES_CASES,
    verifyStartupScoresSegment,
} from './run-startup-scores.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function scoreState(parsed) {
    return [
        parsed.flags.end_top,
        parsed.flags.end_around,
        parsed.flags.end_own,
    ];
}

test('scores starts at its three source defaults', () => {
    const parsed = parseNethackrc('');
    assert.deepEqual(scoreState(parsed), [3, 2, false]);
});

test('bare and empty scores values report and preserve prior state', () => {
    for (const suffix of ['', ':']) {
        const line = `OPTIONS=scores${suffix},scores:7top/4around/own`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.deepEqual(scoreState(parsed), [7, 4, true], suffix);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: scores.',
            ` * Line 1: Missing parameter for 'scores${suffix}'.`,
        ], suffix);
    }
});

test('scores accepts counts, spaces, one slash, and source letter suffixes',
    () => {
        for (const [value, expected] of [
            ['7 top/4 around/own', [7, 4, true]],
            ['2troll 5abracadabra ocelot', [2, 5, true]],
            // hacklib.c letter() deliberately classifies '@' as a letter.
            ['2top@/own', [2, 0, true]],
            ['top/around/own', [1, 1, true]],
            ['0top/0around/0own', [0, 0, false]],
        ]) {
            const parsed = parse(`scores:${value}`);
            assert.deepEqual(scoreState(parsed), expected, value);
            assert.equal(parsed.flags.scores, undefined, value);
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }
    });

test('scores narrows atoi counts to the recorder platform signed int', () => {
    for (const [value, expected] of [
        ['2147483648top', [-2147483648, 0, false]],
        ['4294967298top/2147483648around', [2, -2147483648, false]],
    ]) {
        const parsed = parse(`scores:${value}`);
        assert.deepEqual(scoreState(parsed), expected, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('scores applies one inner negation and none from left to right', () => {
    for (const [value, expected] of [
        ['7top/4around/own !top no-around noown', [0, 0, false]],
        ['top/around/own none/5around/2top', [2, 5, false]],
        // C compares exactly two bytes for "no", then checks byte two for
        // the optional hyphen. These retain the earlier top and distinguish
        // that walk from treating "n" or "no-" as the compared prefix.
        ['7top/no-around', [7, 0, false]],
        ['7top/notop', [0, 0, false]],
        ['n2top', [2, 0, false]],
        // The inner parser checks for one prefix rather than looping. After
        // stripping '!', the leading n is the "none" initial and clears all.
        ['7top/4around/own !notop', [0, 0, false]],
    ]) {
        assert.deepEqual(scoreState(parse(`scores:${value}`)), expected, value);
    }
});

test('scores errors retain writes made earlier in the entered handler', () => {
    for (const [value, expected, message] of [
        ['7top/-2around', [7, 0, false],
            'Values for scores:top and scores:around must not be negative'],
        ['4around/zqxj', [0, 4, false],
            "Unknown scores parameter 'zqxj'"],
        ['own//top', [0, 0, true], "Unknown scores parameter '/top'"],
        ['x2top', [0, 0, false], "Unknown scores parameter 'x2top'"],
        ['7', [0, 0, false], "Unknown scores parameter ''"],
    ]) {
        const line = `OPTIONS=scores:${value}`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.deepEqual(scoreState(parsed), expected, value);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ` * Line 1: ${message}.`,
        ], value);
    }
});

test('scores statements replace state in source application order', () => {
    const comma = parseNethackrc(
        'OPTIONS=scores:8around,scores:7top\n',
    );
    // parseoptions() applies the comma suffix first. The left element then
    // enters the handler, clears the right element's top value, and wins.
    assert.deepEqual(scoreState(comma), [0, 8, false]);
    assert.deepEqual(comma.configErrorFrame.output, [
        '\nOPTIONS=scores:8around,scores:7top',
        ' * Line 1: compound option specified multiple times: scores.',
    ]);

    const lines = parseNethackrc([
        'OPTIONS=scores:7top/4around',
        'OPTIONS=scores:own',
    ].join('\n'));
    assert.deepEqual(scoreState(lines), [0, 0, true]);
});

test('optlist rejects outer scores negation before the handler resets state',
    () => {
        const row = allopt.find(({ name }) => name === 'scores');
        assert.equal(row?.negateok, false);
        const line = 'OPTIONS=!scores:own,scores:7top';
        const parsed = parseNethackrc(`${line}\n`);
        assert.deepEqual(scoreState(parsed), [7, 0, false]);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: scores.',
            ' * Line 1: The scores option may not both have a value and be'
                + ' negated.',
        ]);
        assert.equal(UNPARSED_COMPOUND_OPTIONS.has('scores'), false);
    });

test('the fresh scores matrix contains replay inputs only', () => {
    const recipe = loadStartupScoresRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_SCORES_CASES.map(({ seed, datetime }) => [seed, datetime]),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured scores reach startup state and optionsfull', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupScoresRecipe().segments)
            await verifyStartupScoresSegment(segment);
    })
));
