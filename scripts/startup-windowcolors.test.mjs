import assert from 'node:assert/strict';
import test from 'node:test';

import { NH_BASIC_COLOR } from '../js/const.js';
import { COLOR_TABLE } from '../js/color_data.js';
import { check_enhanced_colors, wc_color_name } from '../js/coloratt.js';
import { game } from '../js/gstate.js';
import { allopt } from '../js/optlist_data.js';
import {
    dosetMenuItems,
    optionValue,
    parseNethackrc,
    windowColorsConfigValue,
} from '../js/options.js';
import {
    loadStartupWindowcolorsRecipe,
    STARTUP_WINDOWCOLORS_CASES,
    verifyStartupWindowcolorsSegment,
} from './run-startup-windowcolors.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function windowcolorsOption() {
    return allopt.find(({ name }) => name === 'windowcolors');
}

test('generated color table preserves the complete source ordering', () => {
    assert.equal(COLOR_TABLE.length, 155);
    assert.deepEqual(COLOR_TABLE[0], {
        type: 'nh_color', tableIndex: 0, rgbIndex: 0,
        name: 'black', r: 0, g: 0, b: 0,
    });
    assert.deepEqual(COLOR_TABLE[8], {
        type: 'no_color', tableIndex: 8, rgbIndex: 0,
        name: 'nocolor', r: 0, g: 0, b: 0,
    });
    assert.deepEqual(COLOR_TABLE[154], {
        type: 'rgb_color', tableIndex: 154, rgbIndex: 138,
        name: 'white', r: 255, g: 255, b: 255,
    });
});

test('enhanced colors accept basic aliases, indices, hex, and names', () => {
    for (const [input, color, canonical] of [
        ['red', 1 | NH_BASIC_COLOR, 'red'],
        ['bright red', 9 | NH_BASIC_COLOR, 'orange'],
        ['transparent', 8 | NH_BASIC_COLOR, 'nocolor'],
        ['15suffix', 15 | NH_BASIC_COLOR, 'white'],
        ['dark_red', 0x8B0000, 'dark-red'],
        ['DARK-GREY', 0xA9A9A9, 'dark-gray'],
        ['#12345', 0x123405, '#123405'],
        ['#ff0000', 0xFF0000, 'red'],
        ['#0x1234', 0x001234, '#001234'],
        ['#+12345', 0x012345, '#012345'],
    ]) {
        const parsed = check_enhanced_colors(input);
        assert.equal(parsed, color, input);
        assert.equal(wc_color_name(parsed), canonical, input);
    }
    for (const input of ['16', '#1234', '#123456x', 'not-a-color']) {
        assert.equal(check_enhanced_colors(input), -1, input);
    }
    assert.ok(check_enhanced_colors('#-12345') < 0);
    assert.equal(wc_color_name(-1), 'no-color');
});

test('window colors start in their source-owned zeroed state', () => {
    const parsed = parseNethackrc('');
    assert.deepEqual(parsed.iflags.wcolors, [
        { fg: null, bg: null },
        { fg: null, bg: null },
        { fg: null, bg: null },
        { fg: null, bg: null },
    ]);
    assert.deepEqual(parsed.wcolors_opt, [0, 0, 0, 0]);
    assert.equal(parsed.options_set_window_colors_flag, false);
    assert.equal(parsed.flags.windowcolors, undefined);
});

test('window colors accept long and short window names without case', () => {
    const parsed = parse(
        'windowcolors:MeNu RED/black MSG dark_grey/#12345'
            + ' sts unknown/def TxT transparent/#ff0000',
    );
    assert.deepEqual(parsed.iflags.wcolors, [
        { fg: 'red', bg: 'black' },
        { fg: 'dark-gray', bg: '#123405' },
        { fg: 'unknown', bg: 'def' },
        { fg: 'nocolor', bg: 'red' },
    ]);
    assert.deepEqual(parsed.wcolors_opt, [1, 1, 1, 1]);
    assert.equal(parsed.options_set_window_colors_flag, true);
    assert.deepEqual(parsed.configErrorFrame.output, []);
});

test('window color getters use source full-name and default rules', () => {
    const option = windowcolorsOption();
    const parsed = parse(
        'windowcolors:menu red/def message def/blue text /black',
    );
    const expected = 'menu red/def message def/blue sts def/def text def/black';
    assert.equal(optionValue(parsed, option, {}), expected);
    assert.equal(windowColorsConfigValue(parsed), expected);
});

test('window color duplicates report per window and replace in source order',
    () => {
        const line = 'OPTIONS=windowcolors:menu red/black menu blue/white'
            + ',windowcolors:mnu green/brown';
        const parsed = parseNethackrc([
            line,
            'OPTIONS=windowcolors:MENU cyan/gray',
        ].join('\n'));
        assert.deepEqual(parsed.iflags.wcolors[0], { fg: 'cyan', bg: 'gray' });
        assert.equal(parsed.wcolors_opt[0], 4);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: windowcolors for menu windows specified multiple times.',
            ' * Line 1: windowcolors for menu windows specified multiple times.',
            '\nOPTIONS=windowcolors:MENU cyan/gray',
            ' * Line 2: windowcolors for menu windows specified multiple times.',
        ]);
    });

test('unknown windows report and continue through later groups', () => {
    const line = 'OPTIONS=windowcolors:zqxj red/black text cyan/white';
    const parsed = parseNethackrc(`${line}\n`);
    assert.deepEqual(parsed.iflags.wcolors[3], { fg: 'cyan', bg: 'white' });
    assert.deepEqual(parsed.wcolors_opt, [0, 0, 0, 1]);
    assert.equal(parsed.options_set_window_colors_flag, true);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: windowcolors for unrecognized window type: zqxj.',
    ]);
});

test('malformed tails keep partial writes but do not raise the set flag', () => {
    const statement = 'windowcolors:menu red/black status cyan/white text';
    const line = `OPTIONS=${statement}`;
    const parsed = parseNethackrc(`${line}\n`);
    assert.deepEqual(parsed.iflags.wcolors, [
        { fg: 'red', bg: 'black' },
        { fg: null, bg: null },
        { fg: 'cyan', bg: 'white' },
        { fg: null, bg: null },
    ]);
    assert.deepEqual(parsed.wcolors_opt, [1, 0, 1, 0]);
    assert.equal(parsed.options_set_window_colors_flag, false);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        " * Line 1: Could not set windowcolors 'menu red/black status "
            + "cyan/white text'.",
    ]);
});

test('spaces in foreground names skip only that source write', () => {
    const parsed = parse(
        'windowcolors:menu light blue/black message red/light blue',
    );
    assert.deepEqual(parsed.iflags.wcolors[0], { fg: null, bg: 'black' });
    assert.deepEqual(parsed.iflags.wcolors[1], { fg: 'red', bg: 'light' });
    assert.deepEqual(parsed.wcolors_opt, [1, 1, 0, 0]);
    assert.equal(parsed.options_set_window_colors_flag, false);
});

test('missing, empty, malformed, and negated values keep source diagnostics',
    () => {
        for (const statement of ['windowcolors', 'windowcolors:']) {
            const line = `OPTIONS=${statement}`;
            const parsed = parseNethackrc(`${line}\n`);
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\n${line}`,
                ` * Line 1: Missing parameter for '${statement}'.`,
            ], statement);
            assert.equal(parsed.options_set_window_colors_flag, false);
        }

        const malformed = parse('windowcolors:menu');
        assert.deepEqual(malformed.configErrorFrame.output, [
            '\nOPTIONS=windowcolors:menu',
            " * Line 1: Could not set windowcolors 'menu'.",
        ]);

        for (const statement of [
            '!windowcolors', '!windowcolors:', '!windowcolors:menu red/black',
        ]) {
            const line = `OPTIONS=${statement}`;
            const parsed = parseNethackrc(`${line}\n`);
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\n${line}`,
                ' * Line 1: The windowcolors option may not both have a value'
                    + ' and be negated.',
            ], statement);
        }
    });

test('the fresh window colors matrix contains replay inputs only', () => {
    const recipe = loadStartupWindowcolorsRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_WINDOWCOLORS_CASES.map(({ seed, datetime }) => [seed, datetime]),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured window colors reach installed startup state', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupWindowcolorsRecipe().segments)
            await verifyStartupWindowcolorsSegment(segment);
    })
));

test('TTY excludes window colors from optionsfull', () => (
    withSerializedGrids(async () => {
        const row = windowcolorsOption();
        assert.equal(row?.setwhere, 3);
        assert.equal(row?.negateok, false);
        assert.equal(row?.valok, true);
        assert.equal(row?.has_handler, false);

        await verifyStartupWindowcolorsSegment(
            loadStartupWindowcolorsRecipe().segments[0],
        );
        assert.equal(game.options_set_window_colors_flag, true);
        const items = dosetMenuItems(game, {
            headingStyle: {},
            countBindKeys: () => 0,
        }, true);
        assert.equal(
            items.some(({ text }) => text.trim().startsWith('windowcolors ')),
            false,
        );
    })
));
