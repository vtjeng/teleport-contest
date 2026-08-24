import assert from 'node:assert/strict';
import test from 'node:test';

import {
    count_menucolors,
    MENU_COLOR_ATTRIBUTES,
} from '../js/coloratt.js';
import {
    MENU_ITEMFLAGS_SKIPMENUCOLORS,
    PICK_ANY,
} from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { parseNethackrc } from '../js/options.js';
import {
    ATR_BOLD,
    ATR_INVERSE,
    ATR_UNDERLINE,
    CLR_BLUE,
    CLR_GREEN,
    CLR_RED,
    NO_COLOR,
} from '../js/terminal.js';
import { renderTtyMenu, selectTtyMenu } from '../js/tty_menu.js';
import { add_menu, get_menu_coloring } from '../js/windows.js';
import {
    loadStartupMenucolorRecipe,
    STARTUP_MENUCOLOR_CASES,
    verifyStartupMenucolorSegment,
} from './run-startup-menucolor.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function rules(state) {
    const result = [];
    for (let rule = state.gm?.menu_colorings; rule; rule = rule.next) {
        result.push({
            pattern: rule.origstr,
            color: rule.color,
            attr: rule.attr,
        });
    }
    return result;
}

test('the menu attribute catalog preserves source values and aliases', () => {
    assert.deepEqual(MENU_COLOR_ATTRIBUTES, [
        { name: 'none', attr: 0 },
        { name: 'bold', attr: 1 },
        { name: 'dim', attr: 2 },
        { name: 'italic', attr: 3 },
        { name: 'underline', attr: 4 },
        { name: 'blink', attr: 5 },
        { name: 'inverse', attr: 7 },
        { name: null, attr: 0 },
        { name: 'normal', attr: 0 },
        { name: 'uline', attr: 4 },
        { name: 'reverse', attr: 7 },
    ]);
});

test('valid menu colors prepend rules and force the boolean on', () => {
    const parsed = parseNethackrc([
        'OPTIONS=!menucolors',
        'MENUCOLOR="scalpel"=green&bold',
        "MENUCOLOR='healing'=BRIGHT_BLUE&u_line",
        'MENUCOLOR=stethoscope=15suffix&reverse',
        '',
    ].join('\n'));

    assert.deepEqual(parsed.configErrorFrame.output, []);
    assert.equal(parsed.unportedConfigStatements.includes('menucolor'), false);
    assert.equal(parsed.iflags.use_menu_color, true);
    assert.equal(count_menucolors(parsed), 3);
    assert.deepEqual(rules(parsed), [
        { pattern: 'stethoscope', color: 15, attr: 7 },
        { pattern: 'healing', color: 12, attr: 4 },
        { pattern: 'scalpel', color: 2, attr: 1 },
    ]);
});

test('a later boolean can disable installed menu colors', () => {
    const parsed = parseNethackrc([
        'MENUCOLOR="scalpel"=green&bold',
        'OPTIONS=!menucolors',
        '',
    ].join('\n'));
    assert.equal(parsed.iflags.use_menu_color, false);
    assert.equal(count_menucolors(parsed), 1);
    assert.equal(get_menu_coloring('a +0 scalpel', parsed), null);
});

test('menu color diagnostics reject only their own rows', () => {
    const cases = [
        [
            'MENUCOLOR=scalpel',
            'Malformed MENUCOLOR',
        ],
        [
            'MENUCOLOR="scalpel"=zebra',
            "Unknown color 'zebra'",
        ],
        [
            'MENUCOLOR="scalpel"=red&sparkle',
            "Unknown text attribute 'sparkle'",
        ],
        [
            'MENUCOLOR="["=red',
            'Menucolor regex error: Invalid regular expression',
        ],
    ];
    for (const [line, message] of cases) {
        const parsed = parseNethackrc([
            line,
            'MENUCOLOR="healing"=green',
            '',
        ].join('\n'));
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ` * Line 1: ${message}.`,
        ], line);
        assert.equal(parsed.iflags.use_menu_color, true, line);
        assert.deepEqual(rules(parsed), [
            { pattern: 'healing', color: CLR_GREEN, attr: 0 },
        ], line);
    }
});

test('the newest matching rule wins and nonmatches fall through', () => {
    const parsed = parseNethackrc([
        'MENUCOLOR=".*"=green&bold',
        'MENUCOLOR="scalpel"=red&underline',
        'MENUCOLOR="never"=blue&inverse',
        '',
    ].join('\n'));
    assert.deepEqual(get_menu_coloring('a +0 scalpel', parsed), {
        color: CLR_RED,
        attr: 4,
    });
    assert.deepEqual(get_menu_coloring('a potion of healing', parsed), {
        color: CLR_GREEN,
        attr: 1,
    });
});

test('add_menu honors and clears the skip flag', () => {
    const parsed = parseNethackrc('MENUCOLOR=".*"=green&bold\n');
    const ordinary = {
        label: 'a +0 scalpel', value: 'a', color: NO_COLOR, attr: 0,
    };
    add_menu(parsed, ordinary);
    assert.deepEqual(
        [ordinary.color, ordinary.attr],
        [CLR_GREEN, ATR_BOLD],
    );

    const skipped = {
        text: 'Weapons',
        color: CLR_BLUE,
        attr: ATR_INVERSE,
        itemflags: MENU_ITEMFLAGS_SKIPMENUCOLORS,
    };
    add_menu(parsed, skipped);
    assert.deepEqual(
        [skipped.color, skipped.attr, skipped.itemflags],
        [CLR_BLUE, ATR_INVERSE, 0],
    );

    const displayOnly = add_menu(parsed, 'plain menu text');
    assert.deepEqual(displayOnly, {
        text: 'plain menu text', color: CLR_GREEN, attr: ATR_BOLD,
    });
});

test('TTY starts a selectable menu color after its selector prefix', () => {
    const state = parseNethackrc([
        'MENUCOLOR="scalpel"=blue&underline',
        'MENUCOLOR="Weapons"=red&bold',
        '',
    ].join('\n'));
    state.nhDisplay = new GameDisplay(null);
    const heading = {
        text: 'Weapons',
        heading: true,
        color: NO_COLOR,
        attr: ATR_INVERSE,
    };
    const item = { selector: 'a', label: 'a +0 scalpel', value: 'a' };
    add_menu(state, heading);
    add_menu(state, item);

    const rendered = renderTtyMenu(state, { items: [heading, item] });
    const column = rendered.layout.startColumn;
    const headingCell = state.nhDisplay.grid[0][column];
    assert.deepEqual(
        [headingCell.color, headingCell.attr],
        [NO_COLOR, ATR_INVERSE],
    );
    for (let offset = 0; offset < 4; ++offset) {
        const cell = state.nhDisplay.grid[1][column + offset];
        assert.deepEqual([cell.color, cell.attr], [NO_COLOR, 0], offset);
    }
    const description = state.nhDisplay.grid[1][column + 4];
    assert.deepEqual(
        [description.color, description.attr],
        [CLR_BLUE, ATR_UNDERLINE],
    );
});

test('interactive menu refresh styles its selection marker', async () => {
    const state = parseNethackrc('MENUCOLOR="scalpel"=blue&underline\n');
    state.nhDisplay = new GameDisplay(null);
    const item = {
        selector: 'a', label: 'a +0 scalpel', value: 'scalpel',
    };
    add_menu(state, item);
    for (const character of 'a12aa\n')
        state.nhDisplay.pushKey(character.charCodeAt(0));

    const markers = [];
    state._preNhgetchHook = () => {
        for (const row of state.nhDisplay.grid) {
            const text = row.map((cell) => cell.ch).join('');
            const labelColumn = text.indexOf('a +0 scalpel');
            if (labelColumn < 0) continue;
            const marker = row[labelColumn - 2];
            markers.push({
                ch: marker.ch, color: marker.color, attr: marker.attr,
            });
            return;
        }
    };
    assert.deepEqual(await selectTtyMenu(state, {
        title: 'Inventory', titleAttr: 0, how: PICK_ANY, items: [item],
    }), []);
    assert.deepEqual(markers[0], { ch: '-', color: NO_COLOR, attr: 0 });
    assert.deepEqual(
        markers[1],
        { ch: '+', color: CLR_BLUE, attr: ATR_UNDERLINE },
    );
    assert.deepEqual(
        markers[4],
        { ch: '#', color: CLR_BLUE, attr: ATR_UNDERLINE },
    );
    assert.deepEqual(
        markers[5],
        { ch: '-', color: CLR_BLUE, attr: ATR_UNDERLINE },
    );
});

test('the fresh matrix retains the survey witness and source catalogs', () => {
    const recipe = loadStartupMenucolorRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, STARTUP_MENUCOLOR_CASES.length);
    assert.deepEqual(recipe.segments[0], {
        seed: 6201103,
        datetime: '20370115091700',
        nethackrc: 'OPTIONS=name:MenuProbe,role:Healer,race:human,'
            + 'gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,'
            + '!acoustics\n'
            + 'MENUCOLOR=".*"=red\n',
        moves: 'i ',
    });
    assert.equal(STARTUP_MENUCOLOR_CASES[5].expected.length, 37);
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('each startup menu-color case reaches installed and rendered state',
    async () => {
        await withSerializedGrids(async () => {
            for (const segment of loadStartupMenucolorRecipe().segments)
                await verifyStartupMenucolorSegment(segment);
        });
    });
