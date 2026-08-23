import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MAP_MODE_ASCII4x6,
    MAP_MODE_ASCII6x8,
    MAP_MODE_ASCII8x8,
    MAP_MODE_ASCII16x8,
    MAP_MODE_ASCII7x12,
    MAP_MODE_ASCII8x12,
    MAP_MODE_ASCII16x12,
    MAP_MODE_ASCII12x16,
    MAP_MODE_ASCII10x18,
    MAP_MODE_ASCII_FIT_TO_SCREEN,
    MAP_MODE_TILES,
    MAP_MODE_TILES_FIT_TO_SCREEN,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { allopt } from '../js/optlist_data.js';
import {
    dosetMenuItems,
    optionValue,
    parseNethackrc,
} from '../js/options.js';
import {
    loadStartupMapModeRecipe,
    STARTUP_MAP_MODE_CASES,
    verifyStartupMapModeSegment,
} from './run-startup-map-mode.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function mapMode(parsed) {
    return parsed.iflags.wc_map_mode;
}

const SOURCE_MODES = Object.freeze([
    ['tiles', MAP_MODE_TILES],
    ['ascii4x6', MAP_MODE_ASCII4x6],
    ['ascii6x8', MAP_MODE_ASCII6x8],
    ['ascii8x8', MAP_MODE_ASCII8x8],
    ['ascii16x8', MAP_MODE_ASCII16x8],
    ['ascii7x12', MAP_MODE_ASCII7x12],
    ['ascii8x12', MAP_MODE_ASCII8x12],
    ['ascii16x12', MAP_MODE_ASCII16x12],
    ['ascii12x16', MAP_MODE_ASCII12x16],
    ['ascii10x18', MAP_MODE_ASCII10x18],
    ['fit_to_screen', MAP_MODE_ASCII_FIT_TO_SCREEN],
    ['ascii_fit_to_screen', MAP_MODE_ASCII_FIT_TO_SCREEN],
    ['tiles_fit_to_screen', MAP_MODE_TILES_FIT_TO_SCREEN],
]);

test('map mode constants and the zeroed iflags default match winprocs.h', () => {
    assert.deepEqual(
        SOURCE_MODES.map(([, mode]) => mode),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11],
    );
    const parsed = parseNethackrc('');
    assert.equal(mapMode(parsed), MAP_MODE_TILES);
    assert.equal(parsed.flags.map_mode, undefined);
});

test('map mode accepts every source spelling without case', () => {
    for (const [value, expected] of SOURCE_MODES) {
        const parsed = parse(`map_mode:${value.toUpperCase()}`);
        assert.equal(mapMode(parsed), expected, value);
        assert.equal(parsed.flags.map_mode, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('non-tile map modes accept trailing bytes but tiles stays exact', () => {
    for (const [value, expected] of SOURCE_MODES.slice(1)) {
        const parsed = parse(`map_mode:${value}-tail`);
        assert.equal(mapMode(parsed), expected, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }

    const line = 'OPTIONS=map_mode:tiles-tail,map_mode:ascii12x16';
    const parsed = parseNethackrc(`${line}\n`);
    assert.equal(mapMode(parsed), MAP_MODE_ASCII12x16);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times: map_mode.',
        " * Line 1: Unknown map_mode parameter 'tiles-tail'.",
    ]);
});

test('missing and invalid map modes report and preserve prior state', () => {
    for (const [statement, message] of [
        ['map_mode', "Missing parameter for 'map_mode'."],
        ['map_mode:', "Missing parameter for 'map_mode:'."],
        ['map', "Missing parameter for 'map'."],
        ['map_mode:ascii4x', "Unknown map_mode parameter 'ascii4x'."],
        ['map_mode: tiles', "Unknown map_mode parameter ' tiles'."],
        ['map_mode:zqxj', "Unknown map_mode parameter 'zqxj'."],
    ]) {
        const line = `OPTIONS=${statement},map_mode:ascii16x12`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(mapMode(parsed), MAP_MODE_ASCII16x12, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: map_mode.',
            ` * Line 1: ${message}`,
        ], statement);
    }
});

test('map mode rejects every negation after duplicate detection', () => {
    const row = allopt.find(({ name }) => name === 'map_mode');
    assert.equal(row?.negateok, true);
    for (const statement of [
        '!map_mode', '!map_mode:', '!map_mode:tiles', '!map:ascii4x6',
    ]) {
        const line = `OPTIONS=${statement},map_mode:ascii6x8`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(mapMode(parsed), MAP_MODE_ASCII6x8, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: map_mode.',
            ' * Line 1: The map_mode option may not both have a value and be negated.',
        ], statement);
    }
});

test('map mode duplicates apply right to left and then across later lines',
    () => {
        const line = 'OPTIONS=map_mode:ascii4x6,map_mode:ascii6x8';
        const sameLine = parseNethackrc(`${line}\n`);
        assert.equal(mapMode(sameLine), MAP_MODE_ASCII4x6);
        assert.deepEqual(sameLine.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: map_mode.',
        ]);

        const later = parseNethackrc([
            line,
            'OPTIONS=map_mode:ascii10x18',
        ].join('\n'));
        assert.equal(mapMode(later), MAP_MODE_ASCII10x18);
    });

test('map mode getter preserves the source omission of tile fit mode', () => {
    const option = allopt.find(({ name }) => name === 'map_mode');
    const parsed = parseNethackrc('');
    const expected = [
        'tiles', 'ascii4x6', 'ascii6x8', 'ascii8x8', 'ascii16x8',
        'ascii7x12', 'ascii8x12', 'ascii16x12', 'ascii12x16',
        'ascii10x18', 'fit_to_screen', 'default', 'default',
    ];
    expected.forEach((value, mode) => {
        parsed.iflags.wc_map_mode = mode;
        assert.equal(optionValue(parsed, option, {}), value, mode);
    });
});

test('the fresh map mode matrix contains replay inputs only', () => {
    const recipe = loadStartupMapModeRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_MAP_MODE_CASES.map(({ seed, datetime }) => [seed, datetime]),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured map mode reaches installed startup iflags', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupMapModeRecipe().segments)
            await verifyStartupMapModeSegment(segment);
    })
));

test('TTY excludes map mode from optionsfull', () => (
    withSerializedGrids(async () => {
        const row = allopt.find(({ name }) => name === 'map_mode');
        assert.equal(row?.setwhere, 3);
        assert.equal(row?.negateok, true);
        assert.equal(row?.valok, true);
        assert.equal(row?.has_handler, false);

        await verifyStartupMapModeSegment(
            loadStartupMapModeRecipe().segments[3],
        );
        assert.equal(mapMode(game), MAP_MODE_TILES_FIT_TO_SCREEN);
        const items = dosetMenuItems(game, {
            headingStyle: {},
            countBindKeys: () => 0,
        }, true);
        assert.equal(
            items.some(({ text }) => text.trim().startsWith('map_mode ')),
            false,
        );
    })
));
