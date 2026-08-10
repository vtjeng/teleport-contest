// Focused tests for options.c doset_simple_menu(), the 'O' menu.
//
// The two configurations these tests start from are the last two segments
// scripts/run-options-menu.mjs records with the patched C reference, so every
// row literal here is text the C program printed for that exact
// configuration and the differential is what keeps them honest.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import {
    doset_simple,
    doset_simple_menu,
    dosetSimpleMenuItems,
    longest_option_name,
    UnsupportedOptionMenuError,
} from '../js/options.js';
import { ECMD_OK, PICK_ONE } from '../js/const.js';
import { ATR_INVERSE, NO_COLOR } from '../js/terminal.js';
import { ttyMenuLayout } from '../js/tty_menu.js';
import { loadOptionsMenuRecipes } from './run-options-menu.mjs';

// loadOptionsMenuRecipes() returns doset()'s five recipes first and
// doset_simple()'s two last.
const STOCK = 5;
const CONFIGURED = 6;

function menuHelpers(overrides = {}) {
    return {
        headingStyle: { attr: ATR_INVERSE, color: NO_COLOR },
        // Neither recipe rebinds a key, and no row the simple menu shows
        // reads this anyway: "bind keys" sits in OptS_Advanced.
        countBindKeys: () => 0,
        ...overrides,
    };
}

// Start one configuration's game and stop on the first command prompt, which
// is where the recorded runs type 'O'.
async function startSimpleGame(index) {
    const segment = loadOptionsMenuRecipes()[index].segments[0];
    await runSegment({ ...segment, moves: ' ' });
    return game;
}

async function simpleItemsFor(index, helpers = menuHelpers()) {
    return dosetSimpleMenuItems(await startSimpleGame(index), helpers);
}

function selectable(item) {
    return Object.hasOwn(item, 'value');
}

// An item's stored text. tty_add_menu() prefixes the selector and its "- "
// marker while rendering, so the literals below carry neither.
function rowTexts(items) {
    return items.map((item) => item.text);
}

// The heading text add_menu_heading() receives, `Sprintf(buf, " %-30s ")`.
function heading(name) {
    return ` ${name.padEnd(30)} `;
}

// The recorded first page of the stock configuration, top to bottom. Every
// value is the compiled-in default the C program printed: 'X' or ' ' for a
// boolean, and the option's own get_val answer for a compound or other one.
const STOCK_PAGE_ONE = [
    'show help',
    '',
    heading('General'),
    'fruit                   [slime mold]',
    'number_pad              [0=off]',
    'price_quotes            [ ]',
    '',
    heading('Behavior'),
    'autodig                 [ ]',
    'autoopen                [X]',
    'autopickup              [ ]',
    'autopickup exceptions   [(0 currently set)]',
    'autoquiver              [ ]',
    'autounlock              [apply-key]',
    'cmdassist               [X]',
    'dropped_nopick          [X]  (for autopickup)',
    'fireassist              [X]',
    'pickup_stolen           [X]  (for autopickup)',
    'pickup_thrown           [X]  (for autopickup)',
    'pickup_types            [all]  (for autopickup)',
    'pushweapon              [ ]',
];

// The recorded second page of the same run.
const STOCK_PAGE_TWO = [
    '',
    heading('Map'),
    'bgcolors                [X]',
    'color                   [X]',
    'customcolors            [X]',
    'customsymbols           [X]',
    'hilite_pet              [ ]',
    'hilite_pile             [ ]',
    'showrace                [ ]',
    'sparkle                 [X]',
    'symset                  [default]',
    '',
    heading('Status'),
    'hitpointbar             [ ]',
    'menu colors             [(0 currently set)]',
    'showexp                 [ ]',
    'status condition fields [(16 currently set)]',
    'status highlight rules  [(0 currently set)]',
    'statuslines             [2]',
    'time                    [ ]',
];

test('the stock simple menu lists the four OptSection groups in order',
    async () => {
        const items = await simpleItemsFor(STOCK);
        assert.deepEqual(
            rowTexts(items),
            [...STOCK_PAGE_ONE, ...STOCK_PAGE_TWO],
        );
        // Only the help entry and the option rows are pickable; the blank
        // separator and the section heading above each group are not.
        assert.deepEqual(
            items.filter((item) => !selectable(item)).map((item) => item.text),
            ['', heading('General'), '', heading('Behavior'),
                '', heading('Map'), '', heading('Status')],
        );
        // add_menu_heading() styles the heading and add_menu_str() leaves the
        // blank line alone, so only four of those eight carry a style.
        assert.deepEqual(
            items.filter((item) => item.text.startsWith(' ')
                && !selectable(item))
                .map(({ attr, color }) => ({ attr, color })),
            Array.from({ length: 4 },
                () => ({ attr: ATR_INVERSE, color: NO_COLOR })),
        );
    });

// C ref: options.c doset_simple_menu()'s fmtstr_doset_simple, which pads with
// longest_option_name(set_gameview, set_in_game) rather than doset()'s pass
// range. The two happen to agree outside debug mode, and this is the width
// every row literal above was measured at.
test('every row pads its name to the same width', async () => {
    const items = await simpleItemsFor(STOCK);
    const width = longest_option_name(3, 4); /* set_gameview, set_in_game */
    assert.equal(width, 23);
    for (const item of items.filter(selectable).slice(1))
        assert.equal(item.text.indexOf('['), width + 1, item.text);
});

// C ref: options.c doset_simple_menu()'s `bool_p = allopt[i].addr;
// if (!bool_p) continue;`. This build compiles neither SCORE_ON_BOTL nor
// TIMED_DELAY, so optlist.h gives those two options a null pointer where
// every other boolean names its storage, and their rows never appear.
test('a boolean with no storage keeps its row out of the menu', async () => {
    const items = await simpleItemsFor(STOCK);
    for (const name of ['showscore', 'timed_delay']) {
        const option = allopt.find((entry) => entry.name === name);
        assert.equal(option.opttyp, 'BoolOpt', name);
        assert.equal(option.addr, null, name);
        assert.equal(option.section < 4, true, name);
        assert.equal(
            items.some((item) => item.text.startsWith(`${name} `)), false, name,
        );
    }
});

// C ref: options.c doset_simple_menu()'s
// `if (iflags.wc_tiled_map && allopt[i].idx == opt_color) continue;`.
// parseNethackrc() has no 'tiled_map' arm, so no configuration file can raise
// iflags.wc_tiled_map and this test writes the flag itself.
test('a tiled map hides the color row', async () => {
    const state = await startSimpleGame(STOCK);
    assert.equal(
        dosetSimpleMenuItems(state, menuHelpers())
            .some((item) => item.text.startsWith('color ')),
        true,
    );
    state.iflags.wc_tiled_map = true;
    const items = dosetSimpleMenuItems(state, menuHelpers());
    assert.equal(items.some((item) => item.text.startsWith('color ')), false);
    // Only that one row goes; the rest of the Map section stays.
    assert.equal(items.length, STOCK_PAGE_ONE.length + STOCK_PAGE_TWO.length - 1);
});

// C ref: options.c doset_simple_menu()'s `if (allopt[i].optfn == optfn_symset
// && Is_rogue_level(&u.uz))`, which swaps in opt_roguesymset -- its name, its
// value and its identifier -- for the row symset would have filled.
test('the Rogue level shows roguesymset in the symset row', async () => {
    const state = await startSimpleGame(STOCK);
    const symsetRow = (items) => items.find(
        (item) => item.text.startsWith('symset ')
            || item.text.startsWith('roguesymset '),
    );
    assert.equal(symsetRow(dosetSimpleMenuItems(state, menuHelpers())).text,
        'symset                  [default]');
    // dungeon.c's rogue level, named here by the branch the hero stands in so
    // that Is_rogue_level() answers TRUE without moving the hero.
    state.rogue_level = { dnum: state.u.uz.dnum, dlevel: state.u.uz.dlevel };
    const row = symsetRow(dosetSimpleMenuItems(state, menuHelpers()));
    // optfn_symset() reports the active set and its handler; optfn_roguesymset
    // reports neither, because the rogue set is not the one in force.
    assert.equal(row.text, 'roguesymset             [default]');
    assert.equal(
        row.value,
        allopt.findIndex((option) => option.name === 'roguesymset') + 1,
    );
});

// C ref: options.c doset_simple_menu()'s `any.a_int = i + 1` and its
// `any.a_int = -2 + 1` help entry. The pick loop subtracts the same 1 back
// off, so the number has to be exact; unlike doset() there is no indexoffset.
test('each selectable row carries its own allopt[] identifier', async () => {
    const items = await simpleItemsFor(STOCK);
    const [help, ...rows] = items.filter(selectable);
    assert.equal(help.value, -1);
    assert.equal(help.selector, '?');
    for (const row of rows) {
        // The name occupies the padded column, whether or not it fills it;
        // "status condition fields" is exactly as wide as the column.
        const name = row.text.slice(0, longest_option_name(3, 4)).trim();
        assert.equal(
            row.value,
            allopt.findIndex((option) => option.name === name) + 1,
            name,
        );
        // Every other row takes the letter tty_end_menu() hands out.
        assert.equal(row.selector, undefined, name);
    }
    const values = items.filter(selectable).map((item) => item.value);
    assert.equal(new Set(values).size, values.length);
});

test('the session\'s own settings fill the value column', async () => {
    const items = await simpleItemsFor(CONFIGURED);
    const value = (name) => items.find(
        (item) => item.text.startsWith(`${name} `),
    )?.text.slice(24);
    // One row from each section, each recorded by the second simple-menu
    // recipe: a boolean flipped on, a boolean flipped off, and the four
    // compound rows whose value that recipe changes.
    assert.equal(value('autodig'), '[X]');
    assert.equal(value('autoopen'), '[ ]');
    assert.equal(value('pickup_thrown'), '[ ]  (for autopickup)');
    assert.equal(value('fruit'), '[kiwi]');
    assert.equal(value('number_pad'), '[1=on]');
    assert.equal(value('symset'), '[DECgraphics, active, handler=DEC]');
    assert.equal(value('statuslines'), '[3]');
});

// C ref: wintty.c tty_end_menu(). menuLines() puts end_menu()'s "Options"
// prompt and its blank separator ahead of the items, and both count against
// the first page, so the break lands at the end of the Behavior section.
test('the simple menu breaks its pages after the Behavior section',
    async () => {
        const state = await startSimpleGame(STOCK);
        const spec = {
            items: dosetSimpleMenuItems(state, menuHelpers()),
            title: 'Options',
        };
        const first = ttyMenuLayout(state.nhDisplay, spec, 0);
        assert.equal(first.pageCount, 2);
        assert.equal(first.footerText, '(1 of 2)');
        // Two lead lines plus the whole of page one.
        assert.equal(first.lines.length, 2 + STOCK_PAGE_ONE.length);
        assert.equal(
            first.lines.at(-1).text, 'p - pushweapon              [ ]',
        );
        const second = ttyMenuLayout(state.nhDisplay, spec, 1);
        assert.equal(second.lines.length, STOCK_PAGE_TWO.length);
        assert.equal(second.lines.at(-1).text, 'p - time                    [ ]');
    });

// C ref: options.c doset_simple_menu()'s fmtstr_tab_doset_simple branch, which
// this port does not build. menu_tab_sep is set_wizonly, so neither menu lists
// it, but optfn_boolean()'s do_set arm still lets a configuration file turn it
// on in an ordinary game.
test('menu_tab_sep stops the simple menu before it is built', async () => {
    const state = await startSimpleGame(STOCK);
    // The parse leaves the option under its own name rather than in
    // iflags.menu_tab_sep, so a configuration file stops one step earlier;
    // scripts/options-menu.test.mjs pins that stop for the other menu.
    state.iflags.menu_tab_sep = true;
    assert.throws(
        () => dosetSimpleMenuItems(state, menuHelpers()),
        (error) => error instanceof UnsupportedOptionMenuError
            && error.what === 'doset_simple_menu() with menu_tab_sep',
    );
    state.iflags.menu_tab_sep = false;
    assert.equal(
        dosetSimpleMenuItems(state, menuHelpers()).length,
        STOCK_PAGE_ONE.length + STOCK_PAGE_TWO.length,
    );
});

// C ref: options.c doset_simple_menu()'s pick handling, which this port
// refuses. The refusal has to come between select_menu() answering and the
// first arm below it, so nothing the player picked is applied.
test('a pick stops before the menu applies it', async () => {
    const state = await startSimpleGame(STOCK);
    const items = dosetSimpleMenuItems(state, menuHelpers());
    // 'autopickup' is a BoolOpt arm, 'pickup_types' the compound one with a
    // handler, 'statuslines' the compound one without, and -1 the help toggle.
    const picks = [-1, ...['autopickup', 'pickup_types', 'statuslines'].map(
        (name) => items.find(
            (item) => item.text.startsWith(`${name} `),
        ).value,
    )];
    for (const pick of picks) {
        const before = { ...state.flags };
        await assert.rejects(
            doset_simple_menu(state, menuHelpers({ menu: () => pick })),
            (error) => error instanceof UnsupportedOptionMenuError
                && error.what === "doset_simple_menu()'s pick handling",
            String(pick),
        );
        assert.deepEqual({ ...state.flags }, before, String(pick));
    }
});

// C ref: options.c doset_simple(). select_menu() answers 0 for a commit that
// picked nothing and -1 for a cancelled menu; both end the do/while, and
// reset_needed_visuals() then finds the five flags doset_simple_menu() cleared
// ahead of select_menu().
test('an empty commit ends the loop after one menu', async () => {
    const state = await startSimpleGame(STOCK);
    const calls = [];
    const helpers = menuHelpers({
        menu: (items, prompt, how) => {
            calls.push({ count: items.length, prompt, how });
            return null;
        },
    });
    state.go.opt_need_redraw = true;
    assert.equal(await doset_simple(state, helpers), ECMD_OK);
    assert.deepEqual(calls, [{
        count: STOCK_PAGE_ONE.length + STOCK_PAGE_TWO.length,
        prompt: 'Options',
        how: PICK_ONE,
    }]);
    assert.equal(state.go.opt_need_redraw, false);
});
