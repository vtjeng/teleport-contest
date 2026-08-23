import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { allopt } from '../js/optlist_data.js';
import {
    dosetMenuItems,
    optionValue,
    parseNethackrc,
    tileFileConfigValue,
} from '../js/options.js';
import {
    loadStartupTileFileRecipe,
    STARTUP_TILE_FILE_CASES,
    verifyStartupTileFileSegment,
} from './run-startup-tile-file.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function tileFile(parsed) {
    return parsed.iflags.wc_tile_file;
}

test('tile file starts only in its zeroed iflags field', () => {
    const parsed = parseNethackrc('');
    assert.equal(tileFile(parsed), null);
    assert.equal(parsed.flags.tile_file, undefined);
});

test('tile file getters distinguish display and saved-config defaults', () => {
    const option = allopt.find(({ name }) => name === 'tile_file');
    const parsed = parseNethackrc('');
    assert.equal(optionValue(parsed, option, {}), 'default');
    assert.equal(tileFileConfigValue(parsed), '');

    parsed.iflags.wc_tile_file = './tiles/My Tiles.xpm';
    assert.equal(optionValue(parsed, option, {}), './tiles/My Tiles.xpm');
    assert.equal(tileFileConfigValue(parsed), './tiles/My Tiles.xpm');
});

test('nonempty tile files replace the exact prior string', () => {
    const parsed = parseNethackrc([
        'OPTIONS=tile_file:first.xpm',
        'OPTIONS=TiLe_FiLe:./tiles/My Tiles.xpm',
    ].join('\n'));
    assert.equal(tileFile(parsed), './tiles/My Tiles.xpm');
    assert.equal(parsed.flags.tile_file, undefined);
    assert.deepEqual(parsed.configErrorFrame.output, [
        '\nOPTIONS=TiLe_FiLe:./tiles/My Tiles.xpm',
        ' * Line 2: compound option specified multiple times: tile_file.',
    ]);
});

test('missing and empty tile files silently preserve prior state', () => {
    for (const statement of ['tile_file', 'tile_file:', 'tile_file=']) {
        const line = `OPTIONS=${statement},tile_file:prior.xpm`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(tileFile(parsed), 'prior.xpm', statement);
        assert.equal(parsed.flags.tile_file, undefined, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: tile_file.',
        ], statement);
    }
});

test('parseoptions rejects tile file negation before its handler', () => {
    const row = allopt.find(({ name }) => name === 'tile_file');
    assert.equal(row?.negateok, false);
    for (const statement of [
        '!tile_file', '!tile_file:', '!tile_file:new.xpm', '!tile_f:new.xpm',
    ]) {
        const line = `OPTIONS=${statement},tile_file:prior.xpm`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(tileFile(parsed), 'prior.xpm', statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: tile_file.',
            ' * Line 1: The tile_file option may not both have a value and'
                + ' be negated.',
        ], statement);
    }
});

test('tile file duplicates apply right to left and across later lines', () => {
    const line = 'OPTIONS=tile_file:left.xpm,tile_file:right.xpm';
    const sameLine = parseNethackrc(`${line}\n`);
    assert.equal(tileFile(sameLine), 'left.xpm');
    assert.deepEqual(sameLine.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times: tile_file.',
    ]);

    const later = parseNethackrc([
        line,
        'OPTIONS=tile_file:later.xpm',
    ].join('\n'));
    assert.equal(tileFile(later), 'later.xpm');
});

test('the fresh tile file matrix contains replay inputs only', () => {
    const recipe = loadStartupTileFileRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_TILE_FILE_CASES.map(({ seed, datetime }) => [seed, datetime]),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured tile file reaches installed startup iflags', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupTileFileRecipe().segments)
            await verifyStartupTileFileSegment(segment);
    })
));

test('Unix TTY excludes tile file from optionsfull', () => (
    withSerializedGrids(async () => {
        const row = allopt.find(({ name }) => name === 'tile_file');
        assert.equal(row?.setwhere, 3);
        assert.equal(row?.negateok, false);
        assert.equal(row?.valok, true);
        assert.equal(row?.has_handler, false);

        await verifyStartupTileFileSegment(
            loadStartupTileFileRecipe().segments[0],
        );
        assert.equal(tileFile(game), 'survey-tiles.xpm');
        const items = dosetMenuItems(game, {
            headingStyle: {},
            countBindKeys: () => 0,
        }, true);
        assert.equal(
            items.some(({ text }) => text.trim().startsWith('tile_file ')),
            false,
        );
    })
));
