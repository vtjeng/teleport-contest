// Focused tests for options.c parseoptions(), optfn_boolean() and
// reset_needed_visuals(), the three functions doset()'s pick loop reaches
// once the player has committed a selection.
//
// Every game here starts from the first configuration
// scripts/run-options-menu.mjs records with the patched C reference, and that
// script's fourth recipe commits the eight boolean picks end to end. The
// literals below are values read from the C source named beside each one.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import {
    doset,
    OPTION_MINMATCH,
    parseoptions,
    reset_needed_visuals,
    UnsupportedOptionMenuError,
} from '../js/options.js';
import { reglyph_darkroom } from '../js/display.js';
import { S_darkroom, S_room } from '../js/symbols.js';
import { ATR_INVERSE, NO_COLOR } from '../js/terminal.js';
import { clearTtyMessageWindow, ttyPline } from '../js/tty_message.js';
import { vision_recalc } from '../js/vision.js';
import { loadOptionsMenuRecipes } from './run-options-menu.mjs';

// Start the stock configuration and stop on the first command prompt, which
// is where the recorded run types 'm' then 'O'. The top line is cleared the
// way command parsing clears it after reading a key, which is also the state
// doset() runs in once select_menu() has dismissed its window. Without that,
// the startup message would still be pending and the first toggle message
// would open a --More--; nothing below may reach nhgetch(), because the
// replay queue is empty by then and the wait would never end.
async function startStockGame() {
    const segment = loadOptionsMenuRecipes()[0].segments[0];
    await runSegment({ ...segment, moves: ' ' });
    clearTopline(game);
    return game;
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

function optionIndex(name) {
    const at = allopt.findIndex((option) => option.name === name);
    assert.notEqual(at, -1, `no option named '${name}'`);
    return at;
}

// doset_add_menu() gives a selectable entry an a_int of its allopt[] index,
// plus one for select_menu()'s own offset, plus doset()'s indexoffset of 1.
function menuValue(name) {
    return optionIndex(name) + 2;
}

function menuHelpers(picks) {
    return {
        headingStyle: { attr: ATR_INVERSE, color: NO_COLOR },
        countBindKeys: () => 0,
        menu: () => picks,
    };
}

// putmesg() writes C's top line straight to the terminal; this port hands it
// to the window port as topMessage and paints it at the next flush, so a test
// that calls parseoptions() directly reads it here rather than from the grid.
function topline() {
    return game.nhDisplay.topMessage ?? '';
}

// invent is invent.c's object chain, linked through nobj.
function inventoryLetters(state) {
    const letters = [];
    for (let obj = state.invent; obj; obj = obj.nobj) letters.push(obj.invlet);
    return letters;
}

test('minmatch is the shortest prefix that separates an option name',
    async () => {
        // options.c determine_ambiguities() floors every count at 3 and caps
        // it at the name's own length. 'lit_corridor' shares no first
        // character with another option name, so it takes the floor.
        assert.equal(OPTION_MINMATCH[optionIndex('lit_corridor')], 3);
        // 'time' and 'timed_delay' share four characters, so the count is
        // five; 'time' is capped back to its own four.
        assert.equal(OPTION_MINMATCH[optionIndex('time')], 4);
        assert.equal(OPTION_MINMATCH[optionIndex('timed_delay')], 5);
        // 'autopickup' is wholly contained in 'autopickup exceptions', so it
        // needs all ten of its characters and the longer name needs eleven.
        assert.equal(OPTION_MINMATCH[optionIndex('autopickup')], 10);
        assert.equal(OPTION_MINMATCH[optionIndex('autopickup exceptions')], 11);

        // Every entry answers for itself when parseoptions() is handed its
        // full name, which is the only shape doset() builds.
        const resolved = allopt.map((option) => allopt.findIndex(
            (candidate, index) => option.name.length >= OPTION_MINMATCH[index]
                && candidate.name.slice(0, option.name.length).toLowerCase()
                    === option.name.toLowerCase(),
        ));
        assert.deepEqual(resolved, allopt.map((_option, index) => index));
    });

test('parseoptions() matches an abbreviation down to minmatch', async () => {
    const state = await startStockGame();
    assert.equal(state.flags.lit_corridor, false);

    // Three characters reach 'lit_corridor', which needs exactly three.
    assert.equal(await parseoptions(state, 'lit', false, false), true);
    assert.equal(state.flags.lit_corridor, true);

    // Two characters reach nothing at all, because 3 is determine_ambiguities'
    // floor, so parseoptions() falls through to its alias table.
    await assert.rejects(
        parseoptions(state, 'li', false, false),
        (error) => error instanceof UnsupportedOptionMenuError
            && error.what === "parseoptions()'s alias table",
    );
    // 'tim' is one short of 'time' and two short of 'timed_delay'.
    await assert.rejects(
        parseoptions(state, 'tim', false, false),
        (error) => error.what === "parseoptions()'s alias table",
    );
    assert.equal(state.flags.time, false);

    // 'timed' is longer than 'time', so match_optname() compares five
    // characters against a four-character name and C's NUL stops it; the
    // answer is 'timed_delay', which this build compiled without storage.
    assert.equal(await parseoptions(state, 'timed', false, false), true);
    assert.equal(state.flags.time, false);
});

test('parseoptions() splits a statement at its first separator', async () => {
    const state = await startStockGame();
    // length_without_val() measures the name alone, so all three of these
    // reach 'lit_corridor'; string_for_opt() then hands optfn_boolean() the
    // value, which is the shape doset() never builds.
    for (const statement of [
        'lit_corridor:true', 'lit_corridor=true', 'lit_corridor :true',
    ]) {
        await assert.rejects(
            parseoptions(state, statement, false, false),
            (error) => error instanceof UnsupportedOptionMenuError
                && error.what === "parseoptions() with a value on a boolean"
                    + " option's statement",
            statement,
        );
        assert.equal(state.flags.lit_corridor, false, statement);
    }
    // A separator with nothing after it is no value at all, so the same
    // statement toggles.
    assert.equal(
        await parseoptions(state, 'lit_corridor:', false, false), true,
    );
    assert.equal(state.flags.lit_corridor, true);
});

test('parseoptions() rejects an empty or over-long statement', async () => {
    const state = await startStockGame();
    // BUFSZ / 2 is the limit, and C compares strictly greater.
    const name = 'lit_corridor';
    const padded = name + ':' + 'x'.repeat(128 - name.length - 1);
    assert.equal(padded.length, 128);
    await assert.rejects(
        parseoptions(state, padded, false, false),
        (error) => error instanceof UnsupportedOptionMenuError,
    );
    assert.equal(await parseoptions(state, `${padded}x`, false, false), false);
    // Only whitespace is left once the leading and trailing strip has run.
    assert.equal(await parseoptions(state, ' \t ', false, false), false);
    assert.equal(state.flags.lit_corridor, false);
});

test('parseoptions() matches a prefix option without regard to case',
    async () => {
        const state = await startStockGame();
        // 'cond_' is one of the two NHOPTP entries, and str_start_is() is
        // handed caseblind TRUE, so an upper-case statement still reaches
        // pfxfn_cond_(). match_optname() could not: it compares the whole
        // statement against the shorter prefix name.
        await assert.rejects(
            parseoptions(state, 'COND_hp:red', false, false),
            (error) => error instanceof UnsupportedOptionMenuError
                && error.what === "pfxfn_cond_()'s do_set request",
        );
    });

test('parseoptions() refuses a negation the option does not allow',
    async () => {
        const state = await startStockGame();
        // 'rawio' and 'timed_delay' are the only two booleans optlist.h gives
        // negateok No. bad_negation() stops the negated form before
        // optfn_boolean() runs at all.
        assert.equal(allopt[optionIndex('rawio')].negateok, false);
        assert.equal(await parseoptions(state, '!rawio', false, false), false);
        // Without the negation it reaches optfn_boolean(), which takes its
        // silent retreat: this build compiled 'rawio' with a null storage
        // pointer, so there is nothing to write and nothing to complain about.
        assert.equal(allopt[optionIndex('rawio')].addr, null);
        assert.equal(await parseoptions(state, 'rawio', false, false), true);
        // 'blind' does have storage and is set_in_config too, so it reaches
        // the test that answers optn_err once the game has started.
        assert.equal(state.u.uroleplay.blind, false);
        assert.equal(await parseoptions(state, 'blind', false, false), false);
        assert.equal(state.u.uroleplay.blind, false);
    });

test('parseoptions() refuses the configuration-file pass', async () => {
    const state = await startStockGame();
    await assert.rejects(
        parseoptions(state, 'lit_corridor', true, false),
        (error) => error instanceof UnsupportedOptionMenuError
            && error.what === 'parseoptions() during option initialization',
    );
    await assert.rejects(
        parseoptions(state, 'lit_corridor', false, true),
        (error) => error.what === 'parseoptions() during option initialization',
    );
    assert.equal(state.flags.lit_corridor, false);
});

test('a status option reassesses the status line and announces itself',
    async () => {
        const state = await startStockGame();
        state.disp.botl = false;
        state.disp.botlx = false;
        assert.equal(state.flags.showexp, false);

        assert.equal(await parseoptions(state, 'showexp', false, false), true);
        assert.equal(state.flags.showexp, true);
        // status_initialize(REASSESS_ONLY) raises botlx and the arm itself
        // raises botl; vpline()'s flush_screen(1) spends both.
        assert.equal(state.disp.botl, false);
        assert.equal(state.disp.botlx, false);
        assert.equal(topline(), "'showexp' option toggled on.");
        // bot() ran inside that flush, so the experience field is on screen.
        const status = game.nhDisplay.grid[23]
            .map(({ ch }) => ch).join('').trimEnd();
        assert.match(status, /Xp:1\/0$/u);
    });

test('an inventory option reletters the pack only when letters float',
    async () => {
        const state = await startStockGame();
        // 'fixinv' stores flags.invlet_constant and starts On, so doset()
        // would build "!fixinv" for it; the negated form takes the same arm.
        assert.equal(state.flags.invlet_constant, true);
        const before = inventoryLetters(state);
        assert.ok(before.length > 1, 'the Valkyrie starts with a pack');

        assert.equal(await parseoptions(state, '!fixinv', false, false), true);
        assert.equal(state.flags.invlet_constant, false);
        // C writes the option first and only then runs the switch, so the
        // reassign() test reads the new value and the letters are rebuilt.
        assert.deepEqual(
            inventoryLetters(state),
            before.map((_letter, index) => String.fromCharCode(
                'a'.charCodeAt(0) + index,
            )),
        );
        assert.equal(topline(), "'fixinv' option toggled off.");
    });

test('lit_corridor shuts vision down and defers the recalculation',
    async () => {
        const state = await startStockGame();
        assert.equal(state.iflags.wc_color, true);
        state.go = {};

        assert.equal(
            await parseoptions(state, 'lit_corridor', false, false), true,
        );
        assert.equal(state.flags.lit_corridor, true);
        // vision_recalc(2) cleared the flag and the arm set it again; the
        // pline that follows spends it, so it is back to 0 here.
        assert.equal(state.vision_full_recalc, 0);
        // iflags.use_color is true, so the arm also asks for a redraw.
        assert.equal(state.go.opt_need_redraw, true);
        assert.equal(state.go.opt_need_glyph_reset, undefined);
        assert.equal(topline(), "'lit_corridor' option toggled on.");
    });

test('a redraw option raises both repair flags', async () => {
    const state = await startStockGame();
    // The seven options that share options.c:5378-5385 all ask for the same
    // pair; 'showrace' is the one of them a stock tty menu can reach.
    state.go = {};
    assert.equal(await parseoptions(state, 'showrace', false, false), true);
    assert.equal(state.flags.showrace, true);
    assert.equal(state.go.opt_need_redraw, true);
    assert.equal(state.go.opt_need_glyph_reset, true);

    // 'color' has an arm of its own that raises the same pair.
    state.go = {};
    assert.equal(await parseoptions(state, '!color', false, false), true);
    assert.equal(state.iflags.wc_color, false);
    assert.equal(state.go.opt_need_redraw, true);
    assert.equal(state.go.opt_need_glyph_reset, true);
});

test('the custom-colour options raise only their own repair flag',
    async () => {
        const state = await startStockGame();
        state.go = {};
        assert.equal(
            await parseoptions(state, '!customcolors', false, false), true,
        );
        assert.equal(state.go.opt_reset_customcolors, true);
        assert.equal(state.go.opt_need_redraw, undefined);

        state.go = {};
        // Their two messages are three characters too long to share a top
        // line, and no replay input is left to dismiss a --More--.
        clearTopline(state);
        assert.equal(
            await parseoptions(state, '!customsymbols', false, false), true,
        );
        assert.equal(state.go.opt_reset_customsymbols, true);
        assert.equal(state.go.opt_need_redraw, undefined);
    });

test('hitpointbar reassesses the status line and asks for a redraw',
    async () => {
        const state = await startStockGame();
        state.go = {};
        state.disp.botl = false;
        state.disp.botlx = false;
        assert.equal(await parseoptions(state, 'hitpointbar', false, false),
            true);
        assert.equal(state.iflags.wc2_hitpointbar, true);
        assert.equal(state.go.opt_need_redraw, true);
        // This arm raises no disp.botl of its own, so the botlx
        // status_initialize() leaves behind is what makes vpline()'s
        // flush_screen(1) call bot(); the redrawn first status row opens with
        // the hit-point bar's '['.
        const title = game.nhDisplay.grid[22].map(({ ch }) => ch).join('');
        assert.equal(title[0], '[');
        assert.equal(title[1 + 30], ']');
    });

test('hilite_pet supplies a pet attribute only while switching on',
    async () => {
        const state = await startStockGame();
        state.go = {};
        // petattr is 'inverse' out of the box, so clear it to see which of
        // the two tests options.c:5296-5303 makes actually gates the write.
        state.iflags.wc2_petattr = 0;
        state.iflags.wc_hilite_pet = true;
        assert.equal(
            await parseoptions(state, '!hilite_pet', false, false), true,
        );
        assert.equal(state.iflags.wc_hilite_pet, false);
        assert.equal(state.iflags.wc2_petattr, 0);
        assert.equal(state.go.opt_need_redraw, true);

        assert.equal(
            await parseoptions(state, 'hilite_pet', false, false), true,
        );
        assert.equal(state.iflags.wc2_petattr, ATR_INVERSE);
    });

test('idlecheckpoint reports the missing build support and goes quiet',
    async () => {
        const state = await startStockGame();
        assert.equal(state.give_opt_msg, undefined);
        assert.equal(
            await parseoptions(state, 'idlecheckpoint', false, false), true,
        );
        // The arm undoes its own write and replaces the toggled message.
        assert.equal(state.iflags.idlecheckpoint, false);
        assert.equal(state.give_opt_msg, false);
        assert.equal(
            topline(),
            "There is no underlying support for 'idlecheckpoint' compiled in.",
        );
        // give_opt_msg stays off for the rest of the game, so the next toggle
        // applies silently.
        clearTopline(state);
        assert.equal(await parseoptions(state, 'lootabc', false, false), true);
        assert.equal(state.flags.lootabc, true);
        assert.equal(topline(), '');
    });

test('a wizard-only option is refused only while options are initializing',
    async () => {
        const state = await startStockGame();
        // 'debug_hunger' is set_wiznofuz: a configuration file may not set it,
        // but 'O' during play may, and doset() lists it for a wizard.
        assert.equal(state.iflags.debug_hunger, false);
        assert.equal(
            await parseoptions(state, 'debug_hunger', false, false), true,
        );
        assert.equal(state.iflags.debug_hunger, true);
    });

test('the fuzzer leaves two options alone', async () => {
    const state = await startStockGame();
    // Without the fuzzer both toggle.
    assert.equal(state.flags.silent, true);
    assert.equal(await parseoptions(state, '!silent', false, false), true);
    assert.equal(state.flags.silent, false);

    // moveloop_preamble() sets iflags.debug_fuzzer from the -D fuzzer, and
    // options.c:5236-5241 then holds 'silent' and 'perm_invent' still.
    state.iflags.debug_fuzzer = 1;
    assert.equal(await parseoptions(state, 'silent', false, false), true);
    assert.equal(state.flags.silent, false);
    // Every other option still toggles, and still announces itself.
    clearTopline(state);
    assert.equal(await parseoptions(state, 'lootabc', false, false), true);
    assert.equal(state.flags.lootabc, true);
    assert.equal(topline(), "'lootabc' option toggled on.");
});

test('menucolors refreshes inventory and the menu prompt style', async () => {
    const state = await startStockGame();
    state.go = {};
    assert.equal(
        await parseoptions(state, 'menucolors', false, false), true,
    );
    assert.equal(state.iflags.use_menu_color, true);
    assert.equal(state.go.opt_need_promptstyle, true);
    // The arm sets no redraw, so reset_needed_visuals() skips docrt().
    assert.equal(state.go.opt_need_redraw, undefined);
    assert.equal(topline(), "'menucolors' option toggled on.");
});

test('reset_needed_visuals() clears the prompt style and refreshes status',
    async () => {
        const state = await startStockGame();
        state.go = { opt_need_promptstyle: true };
        state.disp.botl = true;
        state.disp.botlx = false;

        await reset_needed_visuals(state);
        assert.equal(state.go.opt_need_promptstyle, false);
        // bot() spends both bottom-line flags.
        assert.equal(state.disp.botl, false);
        assert.equal(state.disp.botlx, false);
    });

test('reset_needed_visuals() stops on each unported repair', async () => {
    const state = await startStockGame();
    for (const [flag, what] of [
        ['opt_need_glyph_reset', 'reset_glyphmap(gm_optionchange)'],
        ['opt_reset_customcolors', 'reset_customcolors()'],
        ['opt_reset_customsymbols', 'reset_customsymbols()'],
    ]) {
        state.go = { [flag]: true };
        await assert.rejects(
            reset_needed_visuals(state),
            (error) => error instanceof UnsupportedOptionMenuError
                && error.what === what,
            what,
        );
    }
    // change_palette() sits behind CHANGE_COLOR, which is not compiled, so
    // its flag only clears itself -- but it still opens the branch that
    // repaints, so docrt() runs and bot() spends the botlx it raises.
    state.go = { opt_update_basic_palette: true };
    state.disp.botl = false;
    state.disp.botlx = false;
    await reset_needed_visuals(state);
    assert.equal(state.go.opt_update_basic_palette, false);
    assert.equal(state.disp.botlx, false);
});

test('reset_needed_visuals() spends every flag it consumes', async () => {
    const state = await startStockGame();
    state.go = { opt_need_redraw: true };
    await reset_needed_visuals(state);
    // Its closing five assignments leave the next 'O' the clean slate the
    // first one had, whether or not this pass raised the flag.
    assert.equal(state.go.opt_need_redraw, false);
    assert.equal(state.go.opt_need_glyph_reset, false);
    assert.equal(state.go.opt_reset_customcolors, false);
    assert.equal(state.go.opt_reset_customsymbols, false);
    assert.equal(state.go.opt_update_basic_palette, false);
});

test('doset() applies its picks in menu order and answers ECMD_OK',
    async () => {
        const state = await startStockGame();
        assert.equal(state.flags.showexp, false);
        assert.equal(state.flags.time, false);
        // Two picks, because a third message would need a --More-- and no
        // replay input is left to dismiss it. scripts/run-options-menu.mjs
        // commits all eight against the C reference.
        await doset(state, menuHelpers([
            { value: menuValue('showexp'), count: -1 },
            { value: menuValue('time'), count: -1 },
        ]));
        assert.equal(state.flags.showexp, true);
        assert.equal(state.flags.time, true);
        assert.equal(
            topline(),
            "'showexp' option toggled on.  'time' option toggled on.",
        );
        const status = game.nhDisplay.grid[23]
            .map(({ ch }) => ch).join('').trimEnd();
        assert.match(status, /Xp:1\/0 T:1$/u);
    });

test('doset() stops on the picks whose handlers are unported', async () => {
    const state = await startStockGame();
    // HELP_IDX is SIZE(allopt), and the '?' entry's a_int is one more again.
    await assert.rejects(
        doset(state, menuHelpers([
            { value: allopt.length + 2, count: -1 },
        ])),
        (error) => error instanceof UnsupportedOptionMenuError
            && error.what === 'display_file(OPTMENUHELP)',
    );
    // 'boulder' is a compound option with no handler, so doset() would prompt
    // for a replacement value with getlin().
    assert.equal(allopt[optionIndex('boulder')].has_handler, false);
    await assert.rejects(
        doset(state, menuHelpers([
            { value: menuValue('boulder'), count: -1 },
        ])),
        (error) => error.what === 'getlin("Set boulder to what?")',
    );
    // 'pickup_types' does have one, and it is the pick seed0007 records.
    assert.equal(allopt[optionIndex('pickup_types')].has_handler, true);
    await assert.rejects(
        doset(state, menuHelpers([
            { value: menuValue('pickup_types'), count: -1 },
        ])),
        (error) => error.what === "optfn_pickup_types()'s do_handler request",
    );
});

test('doset() stops on a boolean whose post-change work is unported',
    async () => {
        const state = await startStockGame();
        for (const [name, what] of [
            ['dark_room', "reglyph_darkroom() over a 'dark_room' change"],
            ['rest_on_space', 'update_rest_on_space()'],
        ]) {
            await assert.rejects(
                doset(state, menuHelpers([
                    { value: menuValue(name), count: -1 },
                ])),
                (error) => error instanceof UnsupportedOptionMenuError
                    && error.what === what,
                name,
            );
        }
    });

test('vision_recalc(2) repaints every square that was in sight', async () => {
    const state = await startStockGame();
    const lit = [];
    vision_recalc(0, { state, redraw: () => {} });
    vision_recalc(2, { state, redraw: (x, y) => lit.push(`${x},${y}`) });
    // C's control == 2 shares the "you see nothing" arm with u.uswallow and
    // then falls into the ordinary update loop, so every square the hero had
    // in sight is handed to newsym() with the new, empty vision array. The
    // starting room is lit, so that is more than the eight around her.
    assert.ok(lit.length > 8, `expected a repainted room, got ${lit.length}`);
    assert.ok(lit.includes(`${state.u.ux},${state.u.uy}`));
});

test('a message spends a deferred vision recalculation', async () => {
    const state = await startStockGame();
    state.vision_full_recalc = 1;
    await ttyPline('Testing.', state);
    // pline.c:266-271 runs vision_recalc(0), whose first statement clears the
    // flag, before flush_screen() paints the map the message describes.
    assert.equal(state.vision_full_recalc, 0);
});

test('reglyph_darkroom() moves the dark-room symbol with the room symbol',
    async () => {
        const state = await startStockGame();
        assert.equal(state.flags.dark_room, true);
        assert.equal(state.iflags.wc_color, true);
        // A SYMBOLS=S_room override is the case the assignment exists for.
        state.gs.showsyms[S_room] = 'X'.charCodeAt(0);
        reglyph_darkroom(state);
        assert.equal(state.gs.showsyms[S_darkroom], 'X'.charCodeAt(0));

        // Either option switched off sends C down the arms that rewrite
        // remembered glyphs, which this port has no field to rewrite.
        state.flags.dark_room = false;
        assert.throws(() => reglyph_darkroom(state), /dark_room/u);
        state.flags.dark_room = true;
        state.iflags.wc_color = false;
        assert.throws(() => reglyph_darkroom(state), /dark_room/u);
    });
