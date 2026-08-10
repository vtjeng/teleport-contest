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
    parseoptions,
    UnsupportedOptionMenuError,
} from '../js/options.js';
import { ECMD_OK, PICK_ANY, PICK_ONE } from '../js/const.js';
import { FOOD_CLASS, WEAPON_CLASS } from '../js/objects.js';
import { ATR_INVERSE, NO_COLOR } from '../js/terminal.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { ttyMenuLayout } from '../js/tty_menu.js';
import { loadOptionsMenuRecipes } from './run-options-menu.mjs';

// loadOptionsMenuRecipes() returns doset()'s five recipes first and
// doset_simple()'s five last. The two named here are the two that page the
// menu without picking, so their configurations are the ones every row
// literal below was recorded at.
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

// The row whose option name opens it, as dosetSimpleMenuItems() stored it.
function rowFor(items, name) {
    const row = items.find((item) => item.text.startsWith(`${name} `));
    assert.notEqual(row, undefined, `no '${name}' row`);
    return row;
}

// Answer each pass of doset_simple()'s loop with the named option's row, then
// answer null, which is what the window-port seam returns for both of
// select_menu()'s no-pick results. `passes` collects the item list each pass
// built, so a later pass's rows can be read back.
function pickingHelpers(names, passes = [], classPicks) {
    return menuHelpers({
        menu: (items, prompt, how) => {
            if (prompt === 'Autopickup what?') {
                // windows.c choose_classes_menu(), which
                // handler_pickup_types() opens from inside the pick loop.
                assert.equal(how, PICK_ANY);
                assert.notEqual(classPicks, undefined, 'unexpected class menu');
                return classPicks;
            }
            assert.equal(prompt, 'Options');
            assert.equal(how, PICK_ONE);
            passes.push(items);
            const name = names[passes.length - 1];
            return name === undefined ? null : rowFor(items, name).value;
        },
    });
}

// tty_clear_nhwindow(WIN_MESSAGE) keeps gt.toplines for message history and
// hands it back as the window's current text, so a test that wants a blank
// top line has to drop the history too.
function clearTopline(state) {
    clearTtyMessageWindow(state);
    state._ttyToplines = '';
    state._ttyPreviousMessage = '';
    if (state.nhDisplay) state.nhDisplay.topMessage = '';
}

// putmesg() writes C's top line straight to the terminal; this port hands it
// to the window port as topMessage and paints it at the next flush.
function topline() {
    return game.nhDisplay.topMessage ?? '';
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

// C ref: options.c doset_simple_menu()'s three unported picks. Each refusal
// has to come between select_menu() answering and anything that would apply
// the pick, so the game is exactly as the player left it.
test('an unported pick stops before the menu applies it', async () => {
    const state = await startSimpleGame(STOCK);
    const items = dosetSimpleMenuItems(state, menuHelpers());
    // -1 is the help toggle; 'fruit' and 'statuslines' are the two compound
    // rows this menu shows whose has_handler is false, so C prompts for a
    // replacement value with getlin(); 'symset' has a handler, but no
    // do_handler arm is ported for it.
    const refusals = [
        [-1, "doset_simple_menu()'s 'show help' toggle"],
        [rowFor(items, 'fruit').value, 'getlin("Set fruit to what?")'],
        [rowFor(items, 'statuslines').value,
            'getlin("Set statuslines to what?")'],
        [rowFor(items, 'symset').value,
            "optfn_symset()'s do_handler request"],
    ];
    for (const [pick, what] of refusals) {
        const before = {
            flags: { ...state.flags }, iflags: { ...state.iflags },
            fruit: state.svp.pl_fruit,
        };
        await assert.rejects(
            doset_simple_menu(state, menuHelpers({ menu: () => pick })),
            (error) => error instanceof UnsupportedOptionMenuError
                && error.what === what,
            what,
        );
        assert.deepEqual({
            flags: { ...state.flags }, iflags: { ...state.iflags },
            fruit: state.svp.pl_fruit,
        }, before, what);
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

// C ref: options.c doset_simple_menu()'s BoolOpt arm, `Sprintf(buf, "%s%s",
// *allopt[k].addr ? "!" : "", allopt[k].name)`, and doset_simple()'s do/while
// around it. The second pass has to read the value the first pass wrote, which
// is the only thing that makes the "!" prefix visible.
test('a boolean pick is applied and the next menu shows the new value',
    async () => {
        const state = await startSimpleGame(STOCK);
        // The compiled-in default, which the stock recipe leaves alone.
        assert.equal(state.flags.autoopen, true);
        const passes = [];
        assert.equal(
            await doset_simple(
                state, pickingHelpers(['autoopen', 'autoopen'], passes),
            ),
            ECMD_OK,
        );
        // Two picks, then a third menu the player leaves without picking.
        assert.equal(passes.length, 3);
        assert.deepEqual(
            passes.map((items) => rowFor(items, 'autoopen').text),
            ['autoopen                [X]', 'autoopen                [ ]',
                'autoopen                [X]'],
        );
        assert.equal(state.flags.autoopen, true);
    });

// C ref: options.c doset_simple()'s `give_opt_msg = FALSE` ... `= TRUE`
// bracket. optfn_boolean() ends with "'%s' option toggled %s." unless the flag
// is off; this menu redraws the row instead, and the restore is what lets
// '#optionsfull' speak again afterwards.
test('the pick loop toggles silently and the next menu speaks again',
    async () => {
        const state = await startSimpleGame(STOCK);
        clearTopline(state);
        await doset_simple(state, pickingHelpers(['autoopen']));
        assert.equal(topline(), '');
        assert.equal(state.give_opt_msg, true);
        // doset()'s pick loop reaches optfn_boolean() through the same
        // statement, and outside the bracket it prints.
        await parseoptions(state, 'autoopen', false, false);
        assert.equal(topline(), "'autoopen' option toggled on.");
    });

// flush_screen() ends by clearing every gbuf entry's gnew flag, so a square
// marked dirty beforehand tells the two arms apart: only the flushing one
// leaves it clean.
async function pickWithDirtySquare(name) {
    const state = await startSimpleGame(STOCK);
    clearTopline(state);
    state.level.at(1, 0).gnew = 1;
    await doset_simple(state, pickingHelpers([name]));
    return state;
}

// The last status row, which bot() rewrites.
function statusRow(state) {
    const display = state.nhDisplay;
    return display.grid[display.rows - 1].map(({ ch }) => ch).join('').trimEnd();
}

// C ref: options.c doset_simple()'s `flush = go.opt_need_redraw;` before
// reset_needed_visuals() and `if (flush) flush_screen(1);` after it. Three
// picks split the decision: optfn_boolean()'s 'hilite_pet' arm raises
// go.opt_need_redraw, its 'time' arm raises disp.botl alone, and 'autoopen'
// falls to its default and raises neither.
test('only a pick that asked for a repaint flushes the map', async () => {
    const redrawn = await pickWithDirtySquare('hilite_pet');
    assert.equal(redrawn.iflags.wc_hilite_pet, true);
    assert.equal(redrawn.level.at(1, 0).gnew, 0);

    const statused = await pickWithDirtySquare('time');
    assert.equal(statused.flags.time, true);
    assert.equal(statused.level.at(1, 0).gnew, 1);
    // reset_needed_visuals() still spent disp.botl, so the turn counter the
    // option just switched on is on screen.
    assert.match(statusRow(statused), /T:1$/u);

    const quiet = await pickWithDirtySquare('autoopen');
    assert.equal(quiet.flags.autoopen, false);
    assert.equal(quiet.level.at(1, 0).gnew, 1);
    assert.doesNotMatch(statusRow(quiet), /T:/u);
});

// C ref: options.c doset_simple_menu()'s compound arm, `optfn(allopt[k].idx,
// do_handler, ...)`. 'pickup_types' is the one row on this menu whose handler
// the port runs, and doset_simple() offers the menu again once it returns.
test('a compound pick runs its handler and the loop offers the menu again',
    async () => {
        const state = await startSimpleGame(STOCK);
        clearTopline(state);
        const passes = [];
        // choose_classes_menu() gives each entry the class symbol as its
        // value, and def_char_to_objclass() turns that back into the class
        // index optfn_pickup_types() stores.
        const classPicks = [
            { value: ')', count: -1 }, { value: '%', count: -1 },
        ];
        assert.equal(
            await doset_simple(
                state, pickingHelpers(['pickup_types'], passes, classPicks),
            ),
            ECMD_OK,
        );
        assert.deepEqual(state.flags.pickup_types, [WEAPON_CLASS, FOOD_CLASS]);
        assert.equal(passes.length, 2);
        assert.deepEqual(
            passes.map((items) => rowFor(items, 'pickup_types').text),
            // optfn_pickup_types()'s get_val arm is
            // `Sprintf(opts, "%s", ocl[0] ? ocl : "all")`, so the second row
            // carries the two class symbols with nothing around them.
            ['pickup_types            [all]  (for autopickup)',
                'pickup_types            [)%]  (for autopickup)'],
        );
    });
