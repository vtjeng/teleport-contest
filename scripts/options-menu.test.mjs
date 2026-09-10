// Focused tests for options.c doset(), the '#optionsfull' menu.
//
// The two configurations these tests start from are the first two segments
// scripts/run-options-menu.mjs records with the patched C reference, so every
// literal here is a value the C program printed for that exact configuration
// and the differential is what keeps them honest. Its third segment covers
// the "bind keys" count, which no configuration here moves.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import {
    can_set_perm_invent,
    check_perm_invent_again,
    disclosureCategoryItems,
    doset,
    doset_simple,
    dosetMenuItems,
    longest_option_name,
    menuObjsymItems,
    parseNethackrc,
    term_for_boolean,
    UNPARSED_COMPOUND_OPTIONS,
    UnsupportedOptionMenuError,
} from '../js/options.js';
import {
    ALIGN_BOTTOM,
    ALIGN_LEFT,
    ALIGN_RIGHT,
    ALIGN_TOP,
    AUTOUNLOCK_KICK,
    AUTOUNLOCK_UNTRAP,
    ECMD_OK,
    H_DEC,
    H_IBM,
    H_UNK,
    MENU_PARTIAL,
    PICK_ANY,
    PICK_ONE,
    PRIMARYSET,
    ROGUESET,
} from '../js/const.js';
import { ATR_INVERSE, NO_COLOR } from '../js/terminal.js';
import { ttyMenuLayout } from '../js/tty_menu.js';
import { optionsMenuRecipe } from './run-options-menu.mjs';

// The two recipes that page doset() without picking, named the way
// run-options-menu.mjs names them. Every row literal below was recorded at one
// of these two configurations.
const STOCK = 'stock options menu';
const CONFIGURED = 'configured options menu';

// global.h enum optset_restrictions, the values doset() passes around.
const SET_IN_CONFIG = 1;
const SET_GAMEVIEW = 3;
const SET_IN_GAME = 4;

function menuHelpers(overrides = {}) {
    return {
        headingStyle: { attr: ATR_INVERSE, color: NO_COLOR },
        // cmd.c count_bind_keys() answers 0 for the default binding set,
        // which neither recipe changes.
        countBindKeys: () => 0,
        ...overrides,
    };
}

// Start each configuration's game and stop on the first command prompt, which
// is where the recorded runs type 'm' then 'O'.
async function startConfiguredGame(name) {
    const segment = optionsMenuRecipe(name).segments[0];
    await runSegment({ ...segment, moves: ' ' });
    return game;
}

// The stock configuration with extra configuration-file lines appended, for
// the settings the recorded recipes do not carry.
async function startGameWithConfig(...lines) {
    const segment = optionsMenuRecipe(STOCK).segments[0];
    await runSegment({
        ...segment,
        nethackrc: segment.nethackrc + lines.map((line) => `${line}\n`).join(''),
        moves: ' ',
    });
    return game;
}

async function menuItemsFor(name, helpers = menuHelpers()) {
    const state = await startConfiguredGame(name);
    return dosetMenuItems(state, helpers, !state.iflags.cmdassist);
}

function itemText(items, name) {
    const found = items.find(
        (item) => item.text.trim().startsWith(`${name} `)
            || item.text.trim().startsWith(`${name}  `),
    );
    return found?.text ?? null;
}

// "name [value]" with the name left-padded to longest_option_name()'s width.
function valueOf(items, name) {
    const text = itemText(items, name);
    if (text === null) return null;
    return text.slice(text.indexOf('[') + 1, -1);
}

// longest_option_name(set_gameview, set_in_game) for this build, which is
// what "%s%-Nus [%s]" pads each name to.
const NAME_WIDTH = 23;

// An option entry opens its value column at a fixed offset: one space past
// the padded name, or four more when doset()'s first pass indents it. The
// help line that mentions the 'cmdassist' option also ends in a bracket, so
// the offset rather than the bracket is what tells them apart.
function hasValueColumn(text) {
    const bracket = text.indexOf('[');
    return bracket === NAME_WIDTH + 1 || bracket === 4 + NAME_WIDTH + 1;
}

function selectable(item) {
    return Object.hasOwn(item, 'value');
}

test('the stock menu lists doset()\'s three sections in source order',
    async () => {
        const items = await menuItemsFor(STOCK);
        // 5 help lines + 1 heading + 131 booleans that survive the window-port
        // filter + blank + heading + 47 compounds + blank + heading + 7 other.
        assert.equal(items.length, 150);
        assert.deepEqual(
            items.filter((item) => !selectable(item)
                && !hasValueColumn(item.text))
                .map((item) => item.text),
            [
                // options.c doset()'s helptext[], each line printed with
                // Sprintf(buf, "%4s%.75s", "", ...).
                "    For a brief explanation of how this works, type '?' to select",
                '    the next menu choice, then press <enter> or <return>.',
                "    [To suppress this menu help, toggle off the 'cmdassist' option.]",
                '    ',
                'Booleans (selecting will toggle value):',
                '',
                'Compounds (selecting will prompt for new value):',
                '',
                'Other settings:',
            ],
        );
        // The '?' entry carries its own selector and group accelerator, which
        // is why the first option below it still gets 'a'.
        const help = items[2];
        assert.equal(help.text, 'view help for options menu');
        assert.equal(help.selector, '?');
        assert.equal(help.groupSelector, '?');
        // HELP_IDX is SIZE(allopt), the table plus its terminator, and
        // doset()'s pick loop subtracts one from every a_int.
        assert.equal(help.value, allopt.length + 2);
    });

test('pass 0 lists the booleans a running game cannot change, indented',
    async () => {
        const items = await menuItemsFor(STOCK);
        const indented = items
            .filter((item) => item.text.startsWith('    ')
                && hasValueColumn(item.text))
            .map((item) => item.text.trim().split(' ')[0]);
        // Every boolean whose setwhere is at most set_gameview. C gives them
        // any.a_int == 0, so the menu cannot select them, and a four-space
        // indent stands in for the "a - " an accelerator would print.
        assert.deepEqual(indented.slice(0, 14), [
            'blind', 'bones', 'deaf', 'legacy', 'news', 'nudist', 'pauper',
            'reroll', 'selectsaved', 'status_updates', 'tutorial',
            'use_darkgray', 'use_truecolor', 'voices',
        ]);
        for (const name of indented.slice(0, 14)) {
            const item = items.find(
                (candidate) => candidate.text.trim().startsWith(`${name} `),
            );
            assert.equal(selectable(item), false, name);
        }
        // The modifiable booleans follow, starting the second pass, and are
        // selectable with no indent.
        const firstModifiable = items.find(
            (item) => selectable(item) && item.text.startsWith('accessiblemsg'),
        );
        assert.ok(firstModifiable, 'accessiblemsg opens the second pass');
    });

test('every boolean is spelled with its own terminology vocabulary',
    async () => {
        const items = await menuItemsFor(STOCK);
        // options.c booleanterms[][]: column 0 is false/true, column 1 is
        // off/on, and column 3 is "excluded from build"/"included".
        // optlist.h gives bgcolors and sounds Term_Off and voices
        // Term_Excluded; every other option in this build takes column 0.
        assert.equal(valueOf(items, 'bones'), 'true');
        assert.equal(valueOf(items, 'blind'), 'false');
        assert.equal(valueOf(items, 'bgcolors'), 'on');
        assert.equal(valueOf(items, 'sounds'), 'off');
        assert.equal(valueOf(items, 'voices'), 'excluded from build');
    });

test('term_for_boolean answers both columns of each vocabulary', () => {
    const indexOf = (name) => allopt.findIndex(
        (option) => option.name === name,
    );
    // Term_False, the vocabulary all but three of this build's booleans use.
    assert.equal(term_for_boolean(indexOf('bones'), true), 'true');
    assert.equal(term_for_boolean(indexOf('bones'), false), 'false');
    // Term_Off.
    assert.equal(term_for_boolean(indexOf('bgcolors'), true), 'on');
    assert.equal(term_for_boolean(indexOf('bgcolors'), false), 'off');
    // Term_Excluded. Its true column is "included", which no option in this
    // build reaches, because C only gives the vocabulary to a feature the
    // build compiled out.
    assert.equal(term_for_boolean(indexOf('voices'), false),
        'excluded from build');
    assert.equal(term_for_boolean(indexOf('voices'), true), 'included');
});

test('longest_option_name measures only the passes it is asked for', () => {
    // "status condition fields" is 23 bytes, the longest name that a running
    // game can reach, which is what fixes the menu's value column.
    assert.equal(longest_option_name(SET_GAMEVIEW, SET_IN_GAME), 23);
    // Narrowing to set_gameview alone leaves "windowtype" and "msghistory",
    // 10 bytes each; a startpass test that excluded its own pass answers 0.
    assert.equal(longest_option_name(SET_GAMEVIEW, SET_GAMEVIEW), 10);
    // Narrowing to set_in_config alone leaves "menu_deselect_page", 18 bytes.
    assert.equal(longest_option_name(SET_IN_CONFIG, SET_IN_CONFIG), 18);
});

test('the window-port filter hides what tty does not advertise', async () => {
    const items = await menuItemsFor(STOCK);
    // win/tty/wintty.c tty_procs.wincap holds WC_COLOR, WC_HILITE_PET,
    // WC_INVERSE and WC_EIGHT_BIT_IN, so those four options are shown.
    for (const name of ['color', 'hilite_pet', 'use_inverse', 'eight_bit_tty'])
        assert.notEqual(itemText(items, name), null, name);
    // Neither WC_ASCII_MAP nor WC_PERM_INVENT nor WC_POPUP_DIALOG is set, and
    // wincap2 carries neither WC2_GUICOLOR nor WC2_FULLSCREEN.
    for (const name of ['ascii_map', 'perm_invent', 'perminv_mode',
        'popup_dialog', 'guicolor', 'fullscreen'])
        assert.equal(itemText(items, name), null, name);
    // WC2_EXTRASTATUS, WC2_HITPOINTBAR, WC2_PETATTR, WC2_DARKGRAY,
    // WC2_STATUSLINES and WC2_HILITE_STATUS are all set.
    for (const name of ['armorstatus', 'terrainstatus', 'weaponstatus',
        'hitpointbar', 'petattr', 'use_darkgray', 'statuslines',
        'hilite_status', 'statushilites'])
        assert.notEqual(itemText(items, name), null, name);
});

test('each compound and other option reports its live value', async () => {
    const items = await menuItemsFor(STOCK);
    // Every pair is the value column the C reference printed for this
    // configuration; scripts/run-options-menu.mjs records it.
    const expected = {
        // set_gameview compounds, listed first and not selectable.
        windowtype: 'tty',
        playmode: 'normal',
        name: 'Optster',
        role: 'Valkyrie',
        race: 'human',
        gender: 'female',
        alignment: 'lawful',
        catname: '(none)',
        dogname: '(none)',
        horsename: '(none)',
        msghistory: '20',
        pettype: 'none',
        soundlib: 'nosound',
        // set_in_game compounds.
        autounlock: 'apply-key',
        boulder: '`',
        crash_email: 'unknown',
        crash_name: 'unknown',
        crash_urlmax: '-1',
        disclose: 'ni na nv ng nc no',
        fruit: 'slime mold',
        glyph: '(to be done)',
        hilite_status: '(none)',
        menu_headings: 'no-color&inverse',
        menu_objsyms: 'conditional',
        menuinvertmode: '1',
        menustyle: 'full',
        msg_window: 'single',
        number_pad: '0=off',
        packorder: '$")[%?+!=/(*`0_',
        paranoid_confirmation: 'pray trap swim',
        petattr: 'inverse',
        pickup_burden: 'stressed',
        pickup_types: 'all',
        pile_limit: '5',
        roguesymset: 'default',
        runmode: 'run',
        scores: '3 top/2 around',
        sortdiscoveries: 'by order of discovery within each class',
        sortloot: 'loot',
        sortvanquished: 't: traditional: by monster level',
        statushilites: "0 (off: don't highlight status fields)",
        statuslines: '2',
        suppress_alert: '(none)',
        symset: 'default',
        versinfo: '1: number (5.0.0)',
        whatis_coord: 'none',
        whatis_filter: 'none',
        // OthrOpt entries, each an n_currently_set count.
        autocompletions: '(0 currently set)',
        'autopickup exceptions': '(0 currently set)',
        'bind keys': '(0 currently set)',
        'menu colors': '(0 currently set)',
        'message types': '(0 currently set)',
        // botl.c condtests[] enables 16 of its 30 conditions by default.
        'status condition fields': '(16 currently set)',
        'status highlight rules': '(0 currently set)',
    };
    for (const [name, value] of Object.entries(expected))
        assert.equal(valueOf(items, name), value, name);
    // The set_gameview compounds come first and cannot be selected; the rest
    // can.
    assert.equal(selectable(
        items.find((item) => item.text.trim().startsWith('windowtype ')),
    ), false);
    assert.equal(selectable(
        items.find((item) => item.text.startsWith('autounlock ')),
    ), true);
});

test('the options menu reads the configured boulder override', async () => {
    const state = await startGameWithConfig('OPTIONS=boulder:0');
    assert.equal(state.flags.boulder, undefined);
    assert.equal(
        valueOf(dosetMenuItems(state, menuHelpers(), false), 'boulder'),
        '0',
    );
});

test('the options menu reads the configured whatis filter', async () => {
    const state = await startGameWithConfig('OPTIONS=whatis_filter:view');
    assert.equal(state.flags.whatis_filter, undefined);
    assert.equal(
        valueOf(dosetMenuItems(state, menuHelpers(), false), 'whatis_filter'),
        'view',
    );
    assert.equal(UNPARSED_COMPOUND_OPTIONS.has('whatis_filter'), false);
});

test('a configured session reaches the menu\'s value column', async () => {
    const items = await menuItemsFor(CONFIGURED);
    // !cmdassist drops doset()'s five-line help block.
    assert.equal(items.length, 145);
    assert.equal(itemText(items, 'view help for options menu'), null);
    const expected = {
        catname: 'Mittens',
        color: 'false',
        fruit: 'kiwi',
        hilite_pet: 'true',
        msg_window: 'reversed',
        pile_limit: '3',
        runmode: 'walk',
        sortloot: 'full',
        statuslines: '3',
        // versinfo 7 requests all three parts; version.c status_version()
        // answers "nethack 5.0.0" because this build has no git branch.
        versinfo: '7: name+branch+number (nethack 5.0.0)',
        whatis_coord: 'map',
    };
    for (const [name, value] of Object.entries(expected))
        assert.equal(valueOf(items, name), value, name);
});

test('the menu value column renders every parsed menustyle enum', async () => {
    for (const style of [
        'traditional', 'combination', 'full', 'partial',
    ]) {
        const state = await startGameWithConfig(`OPTIONS=menustyle:${style}`);
        assert.equal(
            valueOf(dosetMenuItems(state, menuHelpers(), false), 'menustyle'),
            style,
        );
    }
});

test('the menu value column reads the parsed inventory order', async () => {
    const state = await startGameWithConfig('OPTIONS=packorder:%)[');
    assert.equal(state.flags.packorder, undefined);
    assert.equal(
        valueOf(dosetMenuItems(state, menuHelpers(), false), 'packorder'),
        '$%)["?+!=/(*`0_',
    );
});

test('the menu value column reads the parsed discovery order', async () => {
    const state = await startGameWithConfig('OPTIONS=sortdiscoveries:2-tail');
    assert.equal(state.flags.sortdiscoveries, undefined);
    assert.equal(
        valueOf(dosetMenuItems(state, menuHelpers(), false),
            'sortdiscoveries'),
        'alphabetical within each class',
    );
});

test('the menu value column reads the parsed paranoia bitset', async () => {
    const state = await startGameWithConfig(
        'OPTIONS=paranoid_confirmation:death hit pray Takeoff',
    );
    assert.equal(state.flags.paranoid_confirmation, undefined);
    assert.equal(
        valueOf(
            dosetMenuItems(state, menuHelpers(), false),
            'paranoid_confirmation',
        ),
        'die attack pray Remove',
    );
});

test('the paranoia value column hides bones except in wizard play and stops '
    + 'before config-only rows', async () => {
        const state = await startGameWithConfig(
            'OPTIONS=paranoid_confirmation:all',
        );
        const value = () => valueOf(
            dosetMenuItems(state, menuHelpers(), false),
            'paranoid_confirmation',
        );
        assert.equal(
            value(),
            'Confirm quit die attack wand-break eat Were-change pray trap '
                + 'Autoall swim Remove',
        );
        state.wizard = true;
        assert.equal(
            value(),
            'Confirm quit die bones attack wand-break eat Were-change pray '
                + 'trap Autoall swim Remove',
        );
        assert.doesNotMatch(value(), /\b(?:none|all)\b/u);
    });

test('the menu counts final status highlight rows without changing rules',
    async () => {
        const state = await startGameWithConfig(
            'OPTIONS=hilite_status:hitpoints/<50%/red&bold '
                + 'hitpoints/<25%/orange title/always/blue',
            'OPTIONS=hilite_status:condition/blind+deaf/red&bold/'
                + 'conf/red&bold',
            // normal clears blind's bold bit, then underline gives it a
            // distinct final style. Deaf and conf retain the shared red+bold
            // style, so the three condition statements gather into two rows.
            'OPTIONS=hilite_status:condition/blind/normal&underline',
        );
        const configuredRules = structuredClone(state.iflags.status_hilites);

        const first = dosetMenuItems(state, menuHelpers(), false);
        assert.equal(
            valueOf(first, 'hilite_status'),
            '(see "status highlight rules" below)',
        );
        // Three ordinary field rules plus two final condition-style groups.
        assert.equal(
            valueOf(first, 'status highlight rules'),
            '(5 currently set)',
        );

        const second = dosetMenuItems(state, menuHelpers(), false);
        assert.equal(
            valueOf(second, 'status highlight rules'),
            '(5 currently set)',
        );
        assert.deepEqual(state.iflags.status_hilites, configuredRules);
    });

test('the menu refuses an option whose value it cannot derive', async () => {
    const state = await startConfiguredGame(STOCK);
    // versinfo is another option whose parsed home is its own name. Its parse
    // arm sits behind the test for a value, so `OPTIONS=versinfo` -- which C
    // answers with a config error that leaves flags.versinfo at its default --
    // reaches applyBooleanOption() here and leaves a boolean in that field.
    const savedVersinfo = state.flags.versinfo;
    for (const raw of ['kick', true]) {
        state.flags.versinfo = raw;
        assert.throws(
            () => dosetMenuItems(state, menuHelpers(), false),
            (error) => error instanceof UnsupportedOptionMenuError
                && error.what === "parseoptions() to interpret 'versinfo'",
            `versinfo:${raw}`,
        );
    }
    state.flags.versinfo = savedVersinfo;
    // A boolean option with no live value would otherwise read as false.
    delete state.flags.acoustics;
    assert.throws(
        () => dosetMenuItems(state, menuHelpers(), false),
        (error) => error instanceof UnsupportedOptionMenuError
            && error.what.includes("'acoustics'"),
    );
    state.flags.acoustics = true;
    assert.equal(dosetMenuItems(state, menuHelpers(), false).length, 150);
});

// C ref: cmd.c count_bind_keys(), reached through options.c
// optfn_o_bind_keys(). Every other test here calls dosetMenuItems() with the
// stub in menuHelpers(), so this is the one that builds the helper object
// runOptionsCommand() passes and proves the seam between the two files.
test("the 'O' command wires the real count_bind_keys() into the menu",
    async () => {
        const segment = optionsMenuRecipe(STOCK).segments[0];
        let boundary = null;
        await runSegment(
            {
                ...segment,
                nethackrc: `${segment.nethackrc}BINDINGS=Z:apply\n`,
                // The recorded route: 'm' then 'O', then six spaces to page
                // through to the last of doset()'s seven pages, where the
                // "Other settings" block sits.
                moves: ' mO      ',
            },
            { onBoundary: (error) => { boundary = error; } },
        );
        assert.equal(boundary, null);
        // The overlay's left margin is the paging differential's business;
        // this test is about which count reaches the row.
        const screen = game.nhDisplay.grid.map(
            (row) => row.map(({ ch }) => ch).join('').trim(),
        );
        // count_bind_keys() answers 1 here: cmdbinds' 'Z' entry now holds
        // #apply, whose own extcmdlist[] key is 'a'. menuHelpers()' stub
        // answers 0 for every configuration, so no stubbed run prints this.
        assert.ok(
            screen.includes('h - bind keys               [(1 currently set)]'),
            screen.join('\n'),
        );
    });

// C ref: options.c doset()'s boolean pass and doset_add_menu(), which both
// set any.a_int = (indexoffset == 0) ? 0 : i + 1 + indexoffset. doset()'s
// pick loop subtracts the 1 back off, so the number has to be exact.
test('each selectable item carries its own allopt[] identifier', async () => {
    const items = await menuItemsFor(STOCK);
    const identifier = (name) => items.find(
        (item) => item.text.trim().startsWith(`${name} `),
    )?.value;
    const allow = (name) => allopt.findIndex(
        (option) => option.name === name,
    ) + 2;
    // indexoffset is 1 for every pass a running game can set, so a selectable
    // item's identifier is its allopt[] index plus two. One from each of the
    // three places doset() builds it: the boolean pass, a CompOpt row and an
    // OthrOpt row.
    assert.equal(identifier('accessiblemsg'), allow('accessiblemsg'));
    assert.equal(identifier('autounlock'), allow('autounlock'));
    assert.equal(identifier('bind keys'), allow('bind keys'));
    // The passes a running game cannot set take indexoffset 0, which makes
    // a_int 0 and the row a plain display line: doset()'s pass 0 booleans and
    // its set_gameview compounds.
    for (const name of ['blind', 'windowtype', 'msghistory'])
        assert.equal(identifier(name), undefined, name);
    // No two rows share an identifier, so a pick names one option.
    const values = items.filter(selectable).map((item) => item.value);
    assert.equal(new Set(values).size, values.length);
});

// UNPARSED_COMPOUND_OPTIONS and the by-type guards inside the value handlers
// are together the whole defence against the menu printing a compiled-in
// default where the session set something else. Derive the rule rather than
// listing it: an option needs a guard exactly when parseNethackrc() can leave
// raw text under flags[<option name>].
test('every shown compound option guards its unparsed raw text', async () => {
    const state = await startConfiguredGame(STOCK);
    const shown = new Set(dosetMenuItems(state, menuHelpers(), false)
        .map((item) => item.text.trim())
        .map((text) => text.slice(0, text.indexOf('[')).trim())
        .filter(Boolean));
    // A value no parse arm would leave behind, and not a legal value for any
    // shown option.
    const RAW = 'kick';
    const needsGuard = [];
    for (const option of allopt) {
        if (option.opttyp !== 'CompOpt' || !shown.has(option.name)) continue;
        let parsed;
        // The parse rejects the value outright: nothing can reach flags[name].
        try {
            parsed = parseNethackrc(`OPTIONS=${option.name}:${RAW}\n`);
        } catch {
            continue;
        }
        // The parse routes the value to the field the handler reads.
        if (parsed.flags[option.name] !== RAW) continue;
        const saved = state.flags[option.name];
        state.flags[option.name] = RAW;
        assert.throws(
            () => dosetMenuItems(state, menuHelpers(), false),
            (error) => error instanceof UnsupportedOptionMenuError,
            option.name,
        );
        if (saved === undefined) delete state.flags[option.name];
        else state.flags[option.name] = saved;
        needsGuard.push(option.name);
    }
    // The two routes that answer the loop above, and nothing else: the frozen
    // set, plus the options whose handler reads flags[<option name>] itself
    // and tests its type there. versinfo and pickup_burden are two more of
    // those, but each has a parse arm that rejects a value it cannot read --
    // a non-number and a letter outside "ubsnotl" -- so raw text reaches
    // their fields only through the value-less spelling the refusal test
    // covers, and the loop above never reaches their guards.
    assert.deepEqual(
        needsGuard.slice().sort(),
        [...UNPARSED_COMPOUND_OPTIONS].sort(),
    );
    // The other-settings rows need no guard: each counts live state instead
    // of reading an option field, so raw text under their names is inert.
    for (const name of UNPARSED_COMPOUND_OPTIONS) {
        assert.equal(
            allopt.find((option) => option.name === name)?.opttyp, 'CompOpt',
            name,
        );
    }
});

// C ref: options.c optfn_boolean()'s do_set arm, which writes
// *allopt[optidx].addr.  The configuration parser and this menu share that
// generated address, so the menu prints the configured value directly.
test('the menu reads configured booleans from their generated addresses',
    async () => {
        // optlist.h binds fixinv to &flags.invlet_constant, mail to
        // &flags.biff and travel to &flags.travelcmd.  None leaves a second
        // copy under the spelling from the configuration file.
        const state = await startGameWithConfig('OPTIONS=!fixinv,!mail,!travel');
        assert.equal(state.flags.invlet_constant, false);
        assert.equal(state.flags.biff, false);
        assert.equal(state.flags.travelcmd, false);
        for (const name of ['fixinv', 'mail', 'travel'])
            assert.equal(state.flags[name], undefined, name);
        const items = dosetMenuItems(state, menuHelpers(), false);
        for (const name of ['fixinv', 'mail', 'travel'])
            assert.equal(valueOf(items, name), 'false', name);
    });

// C ref: options.c doset()'s fmtstr_doset choice. menu_tab_sep's set_wizonly
// restriction keeps doset() from listing the option, not from acting on it,
// and a configuration file can turn it on in an ordinary game.
test('the menu refuses the tab-separated layout menu_tab_sep asks for',
    async () => {
        const configured = await startGameWithConfig('OPTIONS=menu_tab_sep');
        // The parse writes iflags.menu_tab_sep, so the format helper reaches
        // the tab-separated layout branch itself.  That layout remains
        // outside this slice.
        assert.throws(
            () => dosetMenuItems(configured, menuHelpers(), false),
            (error) => error instanceof UnsupportedOptionMenuError
                && error.what
                    === 'doset() with menu_tab_sep',
        );
        // With the flag itself on, C drops the four-space indent and formats
        // every line "%s%s\t[%s]". That branch is not ported.
        const state = await startConfiguredGame(STOCK);
        state.iflags.menu_tab_sep = true;
        assert.throws(
            () => dosetMenuItems(state, menuHelpers(), false),
            (error) => error instanceof UnsupportedOptionMenuError
                && error.what === 'doset() with menu_tab_sep',
        );
        state.iflags.menu_tab_sep = false;
        assert.equal(dosetMenuItems(state, menuHelpers(), false).length, 150);
    });

// C ref: coloratt.c count_menucolors(). Every valid direct configuration row
// prepends one node, including a duplicate pattern.
test('the menu colors row counts configured list nodes', async () => {
    const state = await startGameWithConfig([
        'MENUCOLOR="blessed"=green',
        'MENUCOLOR="blessed"=red&bold',
    ].join('\n'));
    const items = dosetMenuItems(state, menuHelpers(), false);
    assert.equal(valueOf(items, 'menu colors'), '(2 currently set)');
    for (const row of ['message types', 'autocompletions',
        'autopickup exceptions'])
        assert.equal(valueOf(items, row), '(0 currently set)', row);
});

// C ref: cfgfiles.c cnf_line_MSGTYPE() prepends one gp.plinemsg_types node per
// valid row, and options.c msgtype_count() reports every node without merging.
test('the message types row counts configured list nodes', async () => {
    const state = await startGameWithConfig(
        'MSGTYPE=hide "You swap places*"',
        'MSGTYPE=show "You swap places*"',
    );
    assert.equal(
        valueOf(dosetMenuItems(state, menuHelpers(), false), 'message types'),
        '(2 currently set)',
    );
});

// C ref: cfgfiles.c cnf_line_AUTOPICKUP_EXCEPTION() appends one ga.apelist
// node per valid row, and options.c count_apes() supplies the Other settings
// value without deduplicating identical patterns.
test('the autopickup exceptions row counts configured list nodes', async () => {
    const state = await startGameWithConfig(
        'AUTOPICKUP_EXCEPTION=">.*wand"',
        'AUTOPICKUP_EXCEPTION=">.*wand"',
    );
    assert.equal(
        valueOf(dosetMenuItems(state, menuHelpers(), false),
            'autopickup exceptions'),
        '(2 currently set)',
    );
});

test('the autocompletions row counts AUTOCOMP_ADJ command flags',
    async () => {
        const changed = await startGameWithConfig('AUTOCOMPLETE=!terrain');
        assert.equal(
            valueOf(dosetMenuItems(changed, menuHelpers(), false),
                'autocompletions'),
            '(1 currently set)',
        );

        // Changing the row back to its compiled-in setting clears AUTOCOMP_ADJ
        // rather than recording two configuration statements.
        const reverted = await startGameWithConfig(
            'AUTOCOMPLETE=!terrain',
            'AUTOCOMPLETE=terrain',
        );
        assert.equal(
            valueOf(dosetMenuItems(reverted, menuHelpers(), false),
                'autocompletions'),
            '(0 currently set)',
        );
    });

test('perm_invent handlers follow the TTY capability and pending retry rules',
    () => {
        const state = parseNethackrc('');
        state.iflags.perm_invent = false;
        state.iflags.perm_invent_pending = false;
        // win/tty/wintty.c leaves WC_PERM_INVENT unset in this build, so the
        // capability guard returns FALSE before it changes perminv_mode.
        assert.equal(can_set_perm_invent(state), false);
        assert.equal(state.iflags.perminv_mode, 0);

        state.iflags.perm_invent = true;
        state.iflags.perm_invent_pending = true;
        check_perm_invent_again(state);
        assert.equal(state.iflags.perm_invent, false);
        assert.equal(state.iflags.perm_invent_pending, false);
    });

test('special option handlers preserve C choice order and state fields',
    async () => {
        async function runHandler(name, selected) {
            const state = await startConfiguredGame(STOCK);
            const optionIndex = allopt.findIndex(
                (option) => option.name === name,
            );
            const handlerMenus = [];
            let firstMenu = true;
            await doset_simple(state, menuHelpers({
                menu: (_items, _prompt, how) => {
                    if (firstMenu) {
                        firstMenu = false;
                        assert.equal(how, PICK_ONE);
                        // doset_simple_menu() assigns allopt[] index + 1.
                        return optionIndex + 1;
                    }
                    return null;
                },
                selectMenu: (spec) => {
                    handlerMenus.push(spec);
                    return selected;
                },
            }));
            assert.equal(handlerMenus.length, 1, name);
            return { state, spec: handlerMenus[0] };
        }

        // The fourth source row is MENU_PARTIAL, and handler values are
        // one-based because C stores i + 1 in anything.a_int.
        const menustyle = await runHandler('menustyle', MENU_PARTIAL + 1);
        assert.equal(menustyle.state.flags.menu_style, MENU_PARTIAL);
        assert.equal(menustyle.spec.title, 'Select menustyle:');
        assert.deepEqual(
            menustyle.spec.items.filter((item) => item.value).map((item) => (
                [item.selector, item.value, item.selected]
            )),
            // C's four menu rows are traditional, combination, full and
            // partial, with only full preselected in the stock game.
            [
                ['t', 1, false], ['c', 2, false],
                ['f', 3, true], ['p', 4, false],
            ],
        );

        const alignMessage = await runHandler('align_message', ALIGN_LEFT);
        assert.equal(alignMessage.state.iflags.wc_align_message, ALIGN_LEFT);
        assert.equal(
            alignMessage.spec.title,
            'Select message window placement relative to the map:',
        );
        assert.deepEqual(
            alignMessage.spec.items.map(({ selector, text, value }) => (
                [selector, text, value]
            )),
            [
                ['t', 'top', ALIGN_TOP], ['b', 'bottom', ALIGN_BOTTOM],
                ['l', 'left', ALIGN_LEFT], ['r', 'right', ALIGN_RIGHT],
            ],
        );

        const alignStatus = await runHandler('align_status', ALIGN_RIGHT);
        assert.equal(alignStatus.state.iflags.wc_align_status, ALIGN_RIGHT);
        assert.equal(
            alignStatus.spec.title,
            'Select status window placement relative to the map:',
        );
    });

test('disclosure and object-symbol menu builders preserve C rows', () => {
    // options.c handler_disclose() omits the two sort-order rows for ordinary
    // categories, but includes them for vanquished and genocides.
    assert.deepEqual(
        disclosureCategoryItems('inventory', 'n').map((item) => ({
            text: item.text,
            value: item.value,
            groupSelector: item.groupSelector,
            selected: item.selected,
        })),
        [
            { text: 'Never disclose, without prompting', value: '-',
                groupSelector: undefined, selected: false },
            { text: 'Always disclose, without prompting', value: '+',
                groupSelector: '+', selected: false },
            { text: 'Prompt, with default answer of "No"', value: 'n',
                groupSelector: 'n', selected: true },
            { text: 'Prompt, with default answer of "Yes"', value: 'y',
                groupSelector: 'y', selected: false },
        ],
    );
    assert.deepEqual(
        disclosureCategoryItems('vanquished', '?').map((item) => [
            item.value, item.groupSelector, item.selected,
        ]),
        [
            ['-', undefined, false], ['+', '+', false],
            ['#', '#', false], ['n', 'n', false],
            ['y', 'y', false], ['?', '?', true],
        ],
    );

    // options.c objsymvals[] contains six rows. The fourth mode is the
    // compiled-in default, so it is the only preselected row here.
    assert.deepEqual(
        menuObjsymItems(4).map((item) => ({
            text: item.text,
            value: item.value,
            selector: item.selector,
            groupSelector: item.groupSelector,
            selected: item.selected,
        })),
        [
            { text: "none         don't show object symbols in menus",
                value: 1, selector: '0', groupSelector: 'n', selected: false },
            { text: 'headers      show object symbols in menu header lines',
                value: 2, selector: '1', groupSelector: 'h', selected: false },
            { text: 'entries      show object symbols in individual menu entries',
                value: 3, selector: '2', groupSelector: 'e', selected: false },
            { text: 'both         show object symbols in headers and menu entries',
                value: 4, selector: '3', groupSelector: 'b', selected: false },
            { text: 'conditional  show objsyms in entries if no headers are shown',
                value: 5, selector: '4', groupSelector: 'c', selected: true },
            { text: 'one-or-other show objsyms in header, in entries if no header',
                value: 6, selector: '5', groupSelector: 'o', selected: false },
        ],
    );
});

test('disclosure and object-symbol handlers preserve choices and cancellation',
    async () => {
        const disclosureState = await startConfiguredGame(STOCK);
        const disclosureIndex = allopt.findIndex(
            (option) => option.name === 'disclose',
        );
        const disclosureMenus = [];
        let firstDisclosureMenu = true;
        await doset_simple(disclosureState, menuHelpers({
            menu: (_items, _prompt, how) => {
                if (firstDisclosureMenu) {
                    firstDisclosureMenu = false;
                    assert.equal(how, PICK_ONE);
                    return disclosureIndex + 1;
                }
                return null;
            },
            selectMenu: (spec) => {
                disclosureMenus.push(spec);
                if (disclosureMenus.length === 1) {
                    // C's PICK_ANY result is ordered by menu row order; this
                    // selects inventory, vanquished and genocides.
                    return [{ value: 1 }, { value: 3 }, { value: 4 }];
                }
                if (spec.title.endsWith('inventory:')) {
                    // C ignores the preselected first pick when a second pick
                    // is present, so this changes inventory from 'n' to '+'.
                    return [{ value: 'n' }, { value: '+' }];
                }
                return spec.title.endsWith('vanquished:') ? '#' : '?';
            },
        }));
        assert.deepEqual(disclosureState.flags.end_disclose, [
            '+', 'n', '#', '?', 'n', 'n',
        ]);
        assert.equal(disclosureMenus[0].title,
            'Change which disclosure options categories:');
        assert.deepEqual(
            disclosureMenus[0].items.map(({ text, selector, value }) => (
                [text, selector, value]
            )),
            [
                ['inventory   [ni]', 'i', 1],
                ['attributes  [na]', 'a', 2],
                ['vanquished  [nv]', 'v', 3],
                ['genocides   [ng]', 'g', 4],
                ['conduct     [nc]', 'c', 5],
                ['overview    [no]', 'o', 6],
            ],
        );
        assert.deepEqual(
            disclosureMenus[1].items.map(({ text, groupSelector, selected }) => (
                [text, groupSelector, selected]
            )),
            [
                ['Never disclose, without prompting', undefined, false],
                ['Always disclose, without prompting', '+', false],
                ['Prompt, with default answer of "No"', 'n', true],
                ['Prompt, with default answer of "Yes"', 'y', false],
            ],
        );
        assert.equal(disclosureMenus.length, 4);

        const cancelledDisclosure = await startConfiguredGame(STOCK);
        let firstCancelledMenu = true;
        let disclosureMenuCalls = 0;
        await doset_simple(cancelledDisclosure, menuHelpers({
            menu: (_items, _prompt, how) => {
                if (firstCancelledMenu) {
                    firstCancelledMenu = false;
                    assert.equal(how, PICK_ONE);
                    return disclosureIndex + 1;
                }
                return null;
            },
            selectMenu: () => {
                disclosureMenuCalls += 1;
                return disclosureMenuCalls === 1 ? [{ value: 1 }] : null;
            },
        }));
        assert.deepEqual(cancelledDisclosure.flags.end_disclose, [
            'n', 'n', 'n', 'n', 'n', 'n',
        ]);
        assert.equal(disclosureMenuCalls, 2);

        const cancelled = await startConfiguredGame(STOCK);
        const menuIndex = allopt.findIndex(
            (option) => option.name === 'menu_objsyms',
        );
        let firstMenu = true;
        const cancelledMenus = [];
        await doset_simple(cancelled, menuHelpers({
            menu: (_items, _prompt, how) => {
                if (firstMenu) {
                    firstMenu = false;
                    assert.equal(how, PICK_ONE);
                    return menuIndex + 1;
                }
                return null;
            },
            selectMenu: (spec) => {
                cancelledMenus.push(spec);
                return null;
            },
        }));
        assert.equal(cancelled.iflags.menuobjsyms, 4);
        assert.deepEqual(cancelledMenus[0].items.map((item) => item.selected), [
            false, false, false, false, true, false,
        ]);
    });

test('the m prefix routes doset_simple() to doset() exactly once',
    async () => {
        const state = await startConfiguredGame(STOCK);
        const calls = [];
        const helpers = menuHelpers({
            // selectTtyMenu() answers a PICK_ANY commit with the pick list
            // and a PICK_ONE one with the cancel value; both mean "nothing
            // picked" here.
            menu: (items, prompt, how) => {
                calls.push({ count: items.length, prompt, how });
                return how === PICK_ANY ? [] : null;
            },
        });
        state.iflags.menu_requested = true;
        // An empty commit runs no pick and leaves reset_needed_visuals() with
        // nothing to do, so doset() answers ECMD_OK (options.c:8974).
        assert.equal(await doset_simple(state, helpers), ECMD_OK);
        assert.deepEqual(calls, [{
            count: 150, prompt: 'Set what options?', how: PICK_ANY,
        }]);
        // doset_simple() cleared the flag, so a second call goes to the simple
        // menu instead, which asks for one pick rather than any number. Its 41
        // items are the '?' row, a blank line and a heading for each of the
        // four OptSection groups, and 32 option rows;
        // scripts/options-simple-menu.test.mjs pins every one of them.
        assert.equal(state.iflags.menu_requested, false);
        assert.equal(await doset_simple(state, helpers), ECMD_OK);
        assert.deepEqual(calls[1], {
            count: 41, prompt: 'Options', how: PICK_ONE,
        });
        // Escape, which select_menu() answers with the cancel value, reaches
        // the same place an empty commit does.
        state.iflags.menu_requested = true;
        assert.equal(
            await doset_simple(state, menuHelpers({ menu: () => null })),
            ECMD_OK,
        );
        // 24 is the a_int doset_add_menu() gave allopt[22], the compound
        // option 'autounlock'. Its do_handler menu returns selected values
        // directly to the option state.
        assert.equal(allopt[22].name, 'autounlock');
        const handlerMenus = [];
        state.give_opt_msg = false;
        state.iflags.menu_requested = true;
        assert.equal(await doset_simple(state, menuHelpers({
            menu: () => [{ value: 24, count: -1 }],
            selectMenu: (spec) => {
                handlerMenus.push(spec);
                return [
                    { value: 1, count: -1 },
                    { value: 3, count: -1 },
                ];
            },
        })), ECMD_OK);
        assert.equal(state.flags.autounlock, AUTOUNLOCK_UNTRAP
            | AUTOUNLOCK_KICK);
        assert.equal(handlerMenus.length, 1);
        assert.equal(handlerMenus[0].title, "Select 'autounlock' actions:");
        assert.deepEqual(
            handlerMenus[0].items.map(({ text, value, selected }) => (
                { text, value, selected }
            )),
            [
                { text: 'untrap     (might fail)', value: 1, selected: false },
                { text: 'apply-key  ', value: 2, selected: true },
                { text: 'kick       (doors only)', value: 3, selected: false },
                {
                    text: 'force      (chests/boxes only)',
                    value: 4,
                    selected: false,
                },
            ],
        );
        // doset() reached directly with the prefix still set delegates the
        // other way, to the simple menu.
        calls.length = 0;
        state.iflags.menu_requested = true;
        assert.equal(await doset(state, helpers), ECMD_OK);
        assert.deepEqual(calls, [{
            count: 41, prompt: 'Options', how: PICK_ONE,
        }]);
    });

test('tty_end_menu() restarts its accelerators on every page', async () => {
    const state = await startConfiguredGame(STOCK);
    const items = await menuItemsFor(STOCK);
    const spec = {
        title: 'Set what options?',
        items,
        overlay: false,
    };
    // A 24-row terminal gives tty_end_menu() lmax == 23, and the prompt plus
    // its blank separator occupy the first two of those lines.
    const layout = ttyMenuLayout(state.nhDisplay, spec, 0);
    assert.equal(layout.pageSize, 23);
    assert.equal(layout.pageCount, 7);
    // Page 1 holds the title, the blank, the five help lines, the Booleans
    // heading and the fourteen unselectable booleans, so its only assigned
    // letter goes to the first modifiable boolean at its last row.
    assert.equal(layout.lines[22].text, 'a - accessiblemsg           [false]');
    // Page 2 restarts at 'a' rather than continuing from 'b'.
    const second = ttyMenuLayout(state.nhDisplay, spec, 1);
    assert.equal(second.lines[0].text, 'a - acoustics               [false]');
    assert.equal(second.lines[22].text, 'w - goldX                   [false]');
    // The '?' entry keeps the selector its caller supplied.
    assert.equal(layout.lines[4].text, '? - view help for options menu');
});

test('the scores line spells only the parts that are switched on',
    async () => {
        const state = await startConfiguredGame(STOCK);
        // options.c optfn_scores()'s get_val arm builds its value from three
        // independent fields. initoptions_init() starts them at 3, 2 and
        // FALSE; each case writes those source-owned fields directly to pin
        // the getter independently from startup parsing.
        const cases = [
            [3, 2, false, '3 top/2 around'],
            [3, 0, false, '3 top'],
            [0, 2, false, '2 around'],
            [0, 0, true, 'own'],
            [3, 2, true, '3 top/2 around/own'],
            [0, 2, true, '2 around/own'],
            [3, 0, true, '3 top/own'],
            // Every part off leaves the buffer empty, which C reports as
            // "none".
            [0, 0, false, 'none'],
        ];
        for (const [top, around, own, expected] of cases) {
            state.flags.end_top = top;
            state.flags.end_around = around;
            state.flags.end_own = own;
            assert.equal(
                valueOf(dosetMenuItems(state, menuHelpers(), false), 'scores'),
                expected,
                `${top}/${around}/${own}`,
            );
        }
    });

test('versinfo names each requested part and joins them with +', async () => {
    const state = await startConfiguredGame(STOCK);
    // options.c optfn_versinfo()'s get_val arm, over the three bits
    // version.h defines: 1 number, 2 name, 4 branch. version.c
    // status_version() drops the branch for this release build, and names
    // the program only when bit 2 is set.
    const cases = [
        [1, '1: number (5.0.0)'],
        [2, '2: name (nethack)'],
        [4, '4: branch (5.0.0)'],
        [3, '3: name+number (nethack 5.0.0)'],
        [5, '5: branch+number (5.0.0)'],
        [6, '6: name+branch (nethack)'],
        [7, '7: name+branch+number (nethack 5.0.0)'],
    ];
    for (const [versinfo, expected] of cases) {
        state.flags.versinfo = versinfo;
        assert.equal(
            valueOf(dosetMenuItems(state, menuHelpers(), false), 'versinfo'),
            expected,
            `versinfo:${versinfo}`,
        );
    }
});

test('only the primary symset reports its handler', async () => {
    const state = await startConfiguredGame(STOCK);
    // options.c optfn_symset() appends ", handler=<name>" from symbols.c
    // known_handling[]; optfn_roguesymset() has no such tail. Both append
    // ", active" only for the set gc.currentgraphics points at.
    state.gs.symset[PRIMARYSET] = { name: 'DECgraphics', handling: H_DEC };
    state.gs.symset[ROGUESET] = { name: 'RogueEpyx', handling: H_IBM };
    state.gc.currentgraphics = PRIMARYSET;
    let items = dosetMenuItems(state, menuHelpers(), false);
    assert.equal(valueOf(items, 'symset'), 'DECgraphics, active, handler=DEC');
    assert.equal(valueOf(items, 'roguesymset'), 'RogueEpyx');

    state.gc.currentgraphics = ROGUESET;
    items = dosetMenuItems(state, menuHelpers(), false);
    assert.equal(valueOf(items, 'symset'), 'DECgraphics, handler=DEC');
    assert.equal(valueOf(items, 'roguesymset'), 'RogueEpyx, active');

    // An unnamed set is "default", and neither tail applies to it.
    state.gs.symset[PRIMARYSET] = { name: null, handling: H_UNK };
    state.gc.currentgraphics = PRIMARYSET;
    items = dosetMenuItems(state, menuHelpers(), false);
    assert.equal(valueOf(items, 'symset'), 'default');
});
