import assert from 'node:assert/strict';
import test from 'node:test';

import { allopt } from '../js/optlist_data.js';
import { optionValue, parseNethackrc } from '../js/options.js';
import {
    loadStartupTileDimensionsRecipe,
    STARTUP_TILE_DIMENSION_CASES,
    verifyStartupTileDimensionsSegment,
} from './run-startup-tile-dimensions.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function tileDimensions(parsed) {
    return [
        parsed.iflags.wc_tile_height,
        parsed.iflags.wc_tile_width,
    ];
}

test('tile dimensions start in their zeroed iflags fields', () => {
    const parsed = parseNethackrc('');
    assert.deepEqual(tileDimensions(parsed), [0, 0]);
    assert.equal(parsed.flags.tile_height, undefined);
    assert.equal(parsed.flags.tile_width, undefined);
});

test('tile dimension getters print default or the signed decimal', () => {
    const height = allopt.find(({ name }) => name === 'tile_height');
    const width = allopt.find(({ name }) => name === 'tile_width');
    const parsed = parseNethackrc('');
    assert.equal(optionValue(parsed, height, {}), 'default');
    assert.equal(optionValue(parsed, width, {}), 'default');

    parsed.iflags.wc_tile_height = -17;
    parsed.iflags.wc_tile_width = 23;
    assert.equal(optionValue(parsed, height, {}), '-17');
    assert.equal(optionValue(parsed, width, {}), '23');
});

test('tile dimensions store unrestricted C atoi results', () => {
    for (const [value, expected] of [
        ['text', 0],
        ['-17tail', -17],
        [' \t+23suffix', 23],
        ['2147483648', -2147483648],
    ]) {
        const parsed = parse(`tile_height:${value},tile_width:${value}`);
        assert.deepEqual(tileDimensions(parsed), [expected, expected], value);
        assert.equal(parsed.flags.tile_height, undefined, value);
        assert.equal(parsed.flags.tile_width, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('bare and empty-valued negations reset both dimensions', () => {
    for (const suffix of ['', ':', '=']) {
        const parsed = parseNethackrc([
            'OPTIONS=tile_height:17,tile_width:23',
            `OPTIONS=!tile_height${suffix},!tile_width${suffix}`,
        ].join('\n'));
        assert.deepEqual(tileDimensions(parsed), [0, 0], suffix);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=!tile_height${suffix},!tile_width${suffix}`,
            ' * Line 2: compound option specified multiple times: tile_width.',
            ' * Line 2: compound option specified multiple times: tile_height.',
        ], suffix);
    }
});

test('missing and negated values report after duplicates and preserve state',
    () => {
        for (const [name, sibling, suffix, expectedMessage] of [
            [
                'tile_height', 'tile_width', '',
                "Missing parameter for 'tile_height'.",
            ],
            [
                'tile_width', 'tile_height', ':',
                "Missing parameter for 'tile_width:'.",
            ],
            [
                'tile_height', 'tile_width', ':12',
                'The tile_height option may not both have a value and be'
                    + ' negated.',
            ],
            [
                'tile_width', 'tile_height', ':12',
                'The tile_width option may not both have a value and be'
                    + ' negated.',
            ],
        ]) {
            const rejected = suffix === ':12' ? `!${name}${suffix}`
                : `${name}${suffix}`;
            const line = `OPTIONS=${rejected},${name}:17,${sibling}:29`;
            const parsed = parseNethackrc(`${line}\n`);
            const expected = name === 'tile_height' ? [17, 29] : [29, 17];
            assert.deepEqual(tileDimensions(parsed), expected, name + suffix);
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\n${line}`,
                ` * Line 1: compound option specified multiple times: ${name}.`,
                ` * Line 1: ${expectedMessage}`,
            ], name + suffix);
        }
    });

test('tile dimension duplicate counters apply independently right to left',
    () => {
        const line = 'OPTIONS=tile_height:11,tile_width:22,'
            + 'tile_height:33,tile_width:44';
        const parsed = parseNethackrc([
            line,
            'OPTIONS=tile_width:55',
        ].join('\n'));
        assert.deepEqual(tileDimensions(parsed), [11, 55]);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: tile_width.',
            ' * Line 1: compound option specified multiple times: tile_height.',
            '\nOPTIONS=tile_width:55',
            ' * Line 2: compound option specified multiple times: tile_width.',
        ]);
    });

test('tile dimension abbreviations use canonical bad-negation names', () => {
    for (const [abbreviation, name] of [
        ['tile_h', 'tile_height'],
        ['tile_w', 'tile_width'],
    ]) {
        const parsed = parse(`!${abbreviation}:4`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=!${abbreviation}:4`,
            ` * Line 1: The ${name} option may not both have a value and be`
                + ' negated.',
        ]);
    }
});

test('the fresh tile-dimension matrix contains replay inputs only', () => {
    const recipe = loadStartupTileDimensionsRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_TILE_DIMENSION_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
    }
});

test('configured tile dimensions reach installed startup iflags', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupTileDimensionsRecipe().segments) {
            await verifyStartupTileDimensionsSegment(segment);
        }
    })
));

test('tile dimension rows retain the source window-capability contract', () => {
    for (const name of ['tile_height', 'tile_width']) {
        const row = allopt.find((option) => option.name === name);
        assert.equal(row?.setwhere, 3, name);
        assert.equal(row?.negateok, true, name);
        assert.equal(row?.valok, true, name);
    }
});
