import assert from 'node:assert/strict';
import test from 'node:test';

import {
    H_UNK,
    ROGUESET,
    BLCORNER,
    BRCORNER,
    CORR,
    CROSSWALL,
    D_CLOSED,
    DUST,
    DOOR,
    FOUNTAIN,
    HWALL,
    LA_DOWN,
    ROOM,
    STAIRS,
    SVALL,
    TDWALL,
    TLCORNER,
    TLWALL,
    TRCORNER,
    TRWALL,
    TUWALL,
    VWALL,
} from '../js/const.js';
import {
    bot,
    flush_screen,
    hero_glyph_info,
    monster_glyph_info,
    newsym,
    object_glyph_info,
    terrain_glyph,
} from '../js/display.js';
import { make_engr_at } from '../js/engrave.js';
import { GameMap } from '../js/game.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { S_FELINE, S_HUMAN } from '../js/monsters.js';
import {
    objects_globals_init,
    POT_BOOZE,
    POTION_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import {
    ATR_INVERSE,
    CLR_BRIGHT_BLUE,
    CLR_RED,
    CLR_WHITE,
    CLR_YELLOW,
    NO_COLOR,
} from '../js/terminal.js';
import {
    cmap_symbol,
    initialize_symbols_from_options,
    misc_symbol,
    monster_class_symbol,
    object_class_symbol,
    S_hwall,
    S_room,
    S_brdnstair,
    S_brupstair,
    S_tlcorn,
    S_vwall,
    sym_val,
} from '../js/symbols.js';

const WALL_SYMBOL_CASES = [
    // Every wall enum is present so the test catches a swapped corner or T.
    { typ: VWALL, ascii: '|', dec: 'x' },
    { typ: HWALL, ascii: '-', dec: 'q' },
    { typ: TLCORNER, ascii: '-', dec: 'l' },
    { typ: TRCORNER, ascii: '-', dec: 'k' },
    { typ: BLCORNER, ascii: '-', dec: 'm' },
    { typ: BRCORNER, ascii: '-', dec: 'j' },
    { typ: CROSSWALL, ascii: '-', dec: 'n' },
    { typ: TUWALL, ascii: '-', dec: 'v' },
    { typ: TDWALL, ascii: '-', dec: 'w' },
    { typ: TLWALL, ascii: '|', dec: 'u' },
    { typ: TRWALL, ascii: '|', dec: 't' },
];

function displaySymbol(loc, state) {
    const { ch, dec } = terrain_glyph(loc, 7, 4, state);
    return { ch, dec };
}

test('walls use the selected default ASCII or DECgraphics cmap', () => {
    const asciiState = {};
    const decState = {};
    initialize_symbols_from_options({ flags: {} }, asciiState);
    initialize_symbols_from_options({
        symset: 'DECGraphics',
        flags: {},
    }, decState);

    for (const expected of WALL_SYMBOL_CASES) {
        assert.deepEqual(
            displaySymbol({ typ: expected.typ, seenv: SVALL }, asciiState),
            { ch: expected.ascii, dec: false },
        );
        assert.deepEqual(
            displaySymbol({ typ: expected.typ, seenv: SVALL }, decState),
            { ch: expected.dec, dec: true },
        );
    }
});

test('room floors and empty doorways follow the selected cmap', () => {
    const cases = [
        // D_NODOOR is represented by a zero doormask in rm.h.
        { loc: { typ: ROOM }, ascii: '.', dec: '~' },
        { loc: { typ: DOOR, doormask: 0 }, ascii: '.', dec: '~' },
    ];
    const asciiState = {};
    const decState = {};
    initialize_symbols_from_options({ flags: {} }, asciiState);
    initialize_symbols_from_options({
        symset: 'decgraphics',
        flags: {},
    }, decState);

    for (const expected of cases) {
        assert.deepEqual(
            displaySymbol(expected.loc, asciiState),
            { ch: expected.ascii, dec: false },
        );
        assert.deepEqual(
            displaySymbol(expected.loc, decState),
            { ch: expected.dec, dec: true },
        );
        assert.equal(
            terrain_glyph(expected.loc, 7, 4, decState).color,
            NO_COLOR,
        );
    }
});

test('generated doors read the struct-rm flags alias', () => {
    const state = {};
    initialize_symbols_from_options({ flags: {} }, state);

    assert.deepEqual(
        displaySymbol({
            typ: DOOR,
            // mklev.c:dosdoor() writes this canonical struct-rm alias while
            // makeLocation's legacy compatibility field remains zero.
            flags: D_CLOSED,
            doormask: 0,
            horizontal: false,
        }, state),
        { ch: '+', dec: false },
    );
});

test('stairs use rm direction and reveal only traversed branch symbols', () => {
    const state = {
        u: { uz: { dnum: 0, dlevel: 1 } },
        stairs: {
            sx: 7,
            sy: 4,
            tolev: { dnum: 1, dlevel: 1 },
            u_traversed: true,
            next: null,
        },
    };
    initialize_symbols_from_options({ flags: {} }, state);

    assert.deepEqual(
        terrain_glyph({ typ: STAIRS, ladder: 0 }, 7, 4, state),
        { ch: '<', color: CLR_YELLOW, dec: false },
    );
    assert.equal(cmap_symbol(S_brupstair, state).ch, '<');

    state.stairs.u_traversed = false;
    assert.deepEqual(
        terrain_glyph({ typ: STAIRS, ladder: LA_DOWN }, 7, 4, state),
        { ch: '>', color: NO_COLOR, dec: false },
    );

    state.stairs.u_traversed = true;
    assert.deepEqual(
        terrain_glyph({ typ: STAIRS, ladder: LA_DOWN }, 7, 4, state),
        { ch: '>', color: CLR_YELLOW, dec: false },
    );
    assert.equal(cmap_symbol(S_brdnstair, state).ch, '>');
});

test('disabled color suppresses colored terrain glyphs', () => {
    const state = { iflags: { wc_color: false } };
    initialize_symbols_from_options({ flags: {} }, state);

    assert.equal(
        terrain_glyph({ typ: DOOR, flags: D_CLOSED }, 7, 4, state).color,
        NO_COLOR,
    );
    state.u = { uz: { dnum: 0, dlevel: 1 } };
    state.stairs = {
        sx: 7,
        sy: 4,
        tolev: { dnum: 1, dlevel: 1 },
        u_traversed: true,
        next: null,
    };
    assert.equal(
        terrain_glyph({ typ: STAIRS, ladder: 0 }, 7, 4, state).color,
        NO_COLOR,
    );
});

test('lit corridors use their symbol and retain the black-and-white cue', () => {
    const state = { flags: {}, iflags: { wc_color: true } };
    initialize_symbols_from_options({ flags: {} }, state);

    assert.deepEqual(
        terrain_glyph({ typ: CORR, waslit: false }, 7, 4, state),
        { ch: '#', color: NO_COLOR, dec: false },
    );
    assert.deepEqual(
        terrain_glyph({ typ: CORR, waslit: true }, 7, 4, state),
        { ch: '#', color: CLR_WHITE, dec: false },
    );
    state.flags.lit_corridor = true;
    assert.equal(
        terrain_glyph({ typ: CORR, waslit: false }, 7, 4, state).color,
        CLR_WHITE,
    );

    state.iflags.wc_color = false;
    assert.equal(
        terrain_glyph({ typ: CORR, waslit: true }, 7, 4, state).color,
        NO_COLOR,
    );
});

test('disabled color suppresses the hero color', () => {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { ux: 7, uy: 4 };
    state.iflags = { wc_color: false };
    state.level.at(7, 4).typ = ROOM;
    initialize_symbols_from_options({ flags: {} }, state);

    newsym(7, 4);

    assert.equal(state.level.at(7, 4).disp_color, NO_COLOR);
});

test('legacy DECgraphics selects the same primary symbol table', () => {
    const state = {};
    const options = parseNethackrc('OPTIONS=DECgraphics');
    initialize_symbols_from_options(options, state);

    assert.deepEqual(cmap_symbol(S_room, state), { ch: '~', dec: true });
});

test('startup layers S_* overrides over the configured primary symset', async () => {
    await runSegment({
        // The arbitrary seed is immaterial because this stops at the initial
        // role-selection question, before random character selection.
        seed: 867530,
        datetime: '20401231235958',
        nethackrc: 'OPTIONS=name:Symbols,!legacy,!tutorial,'
            + 'symset:DECGraphics,S_vwall:!',
        moves: '',
        storage: null,
    });

    assert.equal(game.gp.primary_syms[S_vwall], 0xF8);
    assert.equal(game.go.ov_primary_syms[S_vwall], '!'.charCodeAt(0));
    assert.deepEqual(cmap_symbol(S_vwall, game), { ch: '!', dec: false });
});

test('canonical SYMBOLS directives preserve source recursion and casing', () => {
    const options = parseNethackrc([
        "SYMBOLS=S_vwall:',',S_hwall:!",
        'SYMB=s_tlcorn:?',
        'ROGU=S_vwall:;',
    ].join('\n'));
    const state = {};
    initialize_symbols_from_options(options, state);

    assert.deepEqual(cmap_symbol(S_vwall, state), { ch: ',', dec: false });
    assert.deepEqual(cmap_symbol(S_hwall, state), { ch: '!', dec: false });
    assert.deepEqual(cmap_symbol(S_tlcorn, state), { ch: '?', dec: false });
    assert.equal(state.go.ov_rogue_syms[S_vwall], ';'.charCodeAt(0));
});

test('symbol selection and overrides replay in source execution order', () => {
    const selected = (rc) => {
        const state = {};
        initialize_symbols_from_options(parseNethackrc(rc), state);
        return { state, symbol: cmap_symbol(S_vwall, state) };
    };

    for (const rc of [
        'OPTIONS=!DECgraphics,DECgraphics',
        'OPTIONS=DECgraphics,!DECgraphics',
        'OPTIONS=DECgraphics,symset:default',
    ]) {
        assert.deepEqual(selected(rc).symbol, { ch: 'x', dec: true }, rc);
    }
    assert.deepEqual(
        selected('OPTIONS=symset:default,DECgraphics').symbol,
        { ch: '|', dec: false },
    );
    assert.deepEqual(
        selected('OPTIONS=symset:default,S_vwall:!').symbol,
        { ch: '|', dec: false },
    );
    assert.deepEqual(
        selected('OPTIONS=S_vwall:!,symset:default').symbol,
        { ch: '!', dec: false },
    );

    const revealed = selected([
        'SYMBOLS=S_vwall:!',
        'OPTIONS=symset:default',
        'ROGUESYMBOLS=S_vwall:?',
    ].join('\n'));
    assert.deepEqual(revealed.symbol, { ch: '!', dec: false });
    assert.equal(revealed.state.go.ov_rogue_syms[S_vwall], '?'.charCodeAt(0));
});

test('named symbol sets load source-derived byte and Unicode maps', () => {
    const configured = (name) => {
        const state = {};
        initialize_symbols_from_options(
            parseNethackrc(`OPTIONS=symset:${name}`),
            state,
        );
        return state;
    };

    assert.deepEqual(
        cmap_symbol(S_tlcorn, configured('plain')),
        { ch: '+', dec: false },
    );
    assert.deepEqual(
        cmap_symbol(S_vwall, configured('IBMGraphics')),
        { ch: '3', dec: false, displayCh: '│' },
    );
    assert.deepEqual(
        cmap_symbol(S_vwall, configured('Enhanced1')),
        { ch: null, dec: false, displayCh: '│' },
    );
});

test('object and monster classes use their absolute source symbol slots', () => {
    const state = {};
    initialize_symbols_from_options(
        parseNethackrc(
            'SYMBOLS=S_feline:F,S_weapon:!,S_invisible:?',
        ),
        state,
    );

    assert.equal(monster_class_symbol(S_FELINE, state).ch, 'F');
    assert.equal(object_class_symbol(WEAPON_CLASS, state).ch, '!');
    // symbols.c's match table encounters the monster-class S_invisible
    // before the later miscellaneous entry of the same name.
    assert.equal(monster_class_symbol(35, state).ch, '?');
    assert.equal(misc_symbol(3, state).ch, 'I');
});

test('UTF-8 object-class overrides retain glyphs.c concrete-object semantics', () => {
    const state = {};
    initialize_symbols_from_options(
        parseNethackrc([
            'OPTIONS=symset:Enhanced1',
            'SYMBOLS=S_weapon:U+2603',
        ].join('\n')),
        state,
    );

    assert.deepEqual(object_class_symbol(WEAPON_CLASS, state), {
        ch: null,
        dec: false,
        displayCh: '☃',
    });
    assert.deepEqual(object_class_symbol(WEAPON_CLASS, state, 42), {
        ch: ')',
        dec: false,
    });
});

test('hero and pet symbol overrides require sysconf accessibility', () => {
    const state = {
        flags: {},
        u: { umonnum: 0 },
        urace: { mnum: 1 },
        mons: [
            { mlet: S_HUMAN, mcolor: CLR_RED },
            { mlet: S_FELINE, mcolor: CLR_WHITE },
        ],
    };
    initialize_symbols_from_options(
        parseNethackrc(
            'SYMBOLS=S_pet_override:!,S_hero_override:?',
        ),
        state,
    );
    const pet = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        mtame: 10,
    };

    assert.equal(hero_glyph_info(state).ch, '@');
    assert.equal(monster_glyph_info(pet, state).ch, 'f');

    state.sysopt = { accessibility: 1 };
    assert.equal(hero_glyph_info(state).ch, '?');
    assert.equal(monster_glyph_info(pet, state).ch, '!');

    state.flags.showrace = true;
    assert.equal(hero_glyph_info(state).ch, '?');
    delete state.sysopt;
    assert.equal(hero_glyph_info(state).ch, 'f');
});

test('newsym remembers an object underneath a visible monster and hero', () => {
    const state = resetGame();
    const x = 7;
    const y = 4;
    state.level = new GameMap();
    state.level.at(x, y).typ = ROOM;
    state.u = { ux: 1, uy: 1, umonnum: 0 };
    state.urace = { mnum: 0 };
    state.flags = {};
    state.mons = [{ mlet: S_HUMAN, mcolor: CLR_RED }];
    state.objects = [];
    state.objects[42] = { oc_color: CLR_YELLOW };
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    state.viz_array[y] = [];
    state.viz_array[y][x] = 0x2; // vision.h IN_SIGHT

    const weapon = { otyp: 42, oclass: WEAPON_CLASS };
    const pet = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        mtame: 10,
        minvis: false,
        mundetected: false,
        mx: x,
        my: y,
    };
    state.level.objects[x][y] = weapon;
    state.level.monsters[x][y] = pet;

    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, 'f');
    assert.deepEqual(state.level.at(x, y).remembered_glyph, {
        ch: ')',
        color: CLR_YELLOW,
        decgfx: false,
        displayCh: null,
    });

    state.level.monsters[x][y] = null;
    state.u.ux = x;
    state.u.uy = y;
    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, '@');
    assert.equal(state.level.at(x, y).remembered_glyph.ch, ')');
    assert.deepEqual(object_glyph_info(weapon, state), {
        ch: ')',
        color: CLR_YELLOW,
        dec: false,
    });
});

test('newsym reveals visible engravings beneath higher-priority layers', () => {
    const state = resetGame();
    const x = 7;
    const y = 4;
    state.level = new GameMap();
    state.level.at(x, y).typ = ROOM;
    state.u = { ux: 1, uy: 1 };
    state.flags = {};
    state.objects = [];
    state.objects[42] = { oc_color: CLR_YELLOW };
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    state.viz_array[y] = [];
    state.viz_array[y][x] = 0x2; // vision.h IN_SIGHT

    const engraving = make_engr_at(
        x,
        y,
        'source-shaped',
        null,
        0,
        DUST,
        { state },
    );
    assert.equal(engraving.erevealed, false);

    newsym(x, y);
    assert.equal(engraving.erevealed, true);
    assert.equal(state.level.at(x, y).disp_ch, '`');
    assert.equal(state.level.at(x, y).disp_color, CLR_BRIGHT_BLUE);
    assert.deepEqual(state.level.at(x, y).remembered_glyph, {
        ch: '`',
        color: CLR_BRIGHT_BLUE,
        decgfx: false,
        displayCh: null,
    });

    state.level.objects[x][y] = { otyp: 42, oclass: WEAPON_CLASS };
    newsym(x, y);
    assert.equal(engraving.erevealed, true);
    assert.equal(state.level.at(x, y).disp_ch, ')');
    assert.equal(state.level.at(x, y).remembered_glyph.ch, ')');

    state.level.objects[x][y] = null;
    state.level.at(x, y).typ = CORR;
    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, '#');
    assert.equal(state.level.at(x, y).disp_color, CLR_BRIGHT_BLUE);
    assert.equal(state.level.at(x, y).disp_attr, ATR_INVERSE);
    assert.equal(
        state.level.at(x, y).remembered_glyph.attr,
        ATR_INVERSE,
    );

    state.viz_array[y][x] = 0;
    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_attr, ATR_INVERSE);

    state.viz_array[y][x] = 0x2;
    state.iflags = { wc_inverse: false };
    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_attr, 0);

    const metaEngraving = parseNethackrc(
        String.raw`SYMBOLS=S_engrcorr:\m#`,
    );
    state.iflags = { ...metaEngraving.iflags };
    initialize_symbols_from_options(metaEngraving, state);
    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, '#');
    assert.equal(state.level.at(x, y).disp_attr, 0);

    const enhanced = parseNethackrc('OPTIONS=symset:Enhanced1');
    state.iflags = { ...enhanced.iflags };
    initialize_symbols_from_options(enhanced, state);
    newsym(x, y);
    assert.ok(state.level.at(x, y).disp_browser_ch);
    assert.equal(state.level.at(x, y).disp_browser_attr, ATR_INVERSE);
    assert.equal(
        state.level.at(x, y).disp_attr,
        0,
        'a UTF-8 browser glyph does not mutate the recorder-facing cell',
    );
});

test('unobserved floor objects use the source generic class glyph', () => {
    const state = resetGame();
    objects_globals_init(state);
    initialize_symbols_from_options({ flags: {} }, state);
    const potion = {
        otyp: POT_BOOZE,
        oclass: POTION_CLASS,
        dknown: false,
    };

    assert.deepEqual(object_glyph_info(potion, state), {
        ch: '!',
        color: NO_COLOR,
        dec: false,
    });

    potion.dknown = true;
    assert.deepEqual(object_glyph_info(potion, state), {
        ch: '!',
        color: state.objects[POT_BOOZE].oc_color,
        dec: false,
    });
});

test('Enhanced glyph customization reaches the concrete fountain glyph', () => {
    const state = {};
    initialize_symbols_from_options(
        parseNethackrc('OPTIONS=symset:Enhanced1'),
        state,
    );

    assert.equal(
        terrain_glyph({ typ: FOUNTAIN }, 7, 4, state).displayCh,
        '⌠',
    );
});

test('UTF-8 symbols honor handling, customization, and set-reset boundaries', () => {
    const configured = (rc) => {
        const options = parseNethackrc(rc);
        const state = {};
        state.iflags = { ...options.iflags };
        initialize_symbols_from_options(options, state);
        return state;
    };

    const inactive = configured('SYMBOLS=S_vwall:U+2603');
    assert.equal(inactive.gs.symset[0].handling, H_UNK);
    assert.deepEqual(cmap_symbol(S_vwall, inactive), {
        ch: '|', dec: false,
    });

    assert.deepEqual(
        cmap_symbol(
            S_vwall,
            configured('OPTIONS=symset:Enhanced1,!customsymbols'),
        ),
        { ch: '|', dec: false },
    );

    // A byte override from a prior non-UTF8 set does not mask a named UTF-8
    // glyph mapping, but loading a new set purges an active UTF-8 override.
    assert.deepEqual(
        cmap_symbol(
            S_vwall,
            configured([
                'SYMBOLS=S_vwall:!',
                'OPTIONS=symset:Enhanced1',
            ].join('\n')),
        ),
        { ch: null, dec: false, displayCh: '│' },
    );
    assert.deepEqual(
        cmap_symbol(
            S_vwall,
            configured([
                'OPTIONS=symset:Enhanced1',
                'SYMBOLS=S_vwall:U+2603',
                'OPTIONS=symset:Enhanced2',
            ].join('\n')),
        ),
        { ch: null, dec: false, displayCh: '║' },
    );

    for (const invalid of ['U+0000', 'U+D800', 'U+110000', 'U+Z']) {
        assert.deepEqual(
            cmap_symbol(
                S_vwall,
                configured([
                    'OPTIONS=symset:Enhanced1',
                    `SYMBOLS=S_vwall:${invalid}`,
                ].join('\n')),
            ),
            { ch: null, dec: false, displayCh: '│' },
            invalid,
        );
    }

    assert.deepEqual(
        cmap_symbol(S_vwall, configured('SYMBOLS=S_vwall:U+Z')),
        { ch: '|', dec: false },
    );
});

test('explicit rogue default selection restores clear_symsetentry color state', () => {
    const initial = {};
    initialize_symbols_from_options({ flags: {} }, initial);
    assert.equal(initial.gs.symset[ROGUESET].nocolor, 1);

    const selected = {};
    initialize_symbols_from_options(
        parseNethackrc('OPTIONS=roguesymset:default'),
        selected,
    );
    assert.equal(selected.gs.symset[ROGUESET].nocolor, 0);

    const retainedBytes = {};
    initialize_symbols_from_options(
        parseNethackrc([
            'OPTIONS=roguesymset:RogueIBM',
            'OPTIONS=roguesymset:default',
        ].join('\n')),
        retainedBytes,
    );
    assert.equal(retainedBytes.gr.rogue_syms[S_vwall], 0xBA);
    assert.equal(retainedBytes.gs.symset[ROGUESET].name, null);
    assert.equal(retainedBytes.gs.symset[ROGUESET].nocolor, 0);

    const namedColorless = {};
    initialize_symbols_from_options(
        parseNethackrc('OPTIONS=roguesymset:RogueIBM'),
        namedColorless,
    );
    assert.equal(namedColorless.gs.symset[ROGUESET].nocolor, 1);

    const namedColor = {};
    initialize_symbols_from_options(
        parseNethackrc('OPTIONS=roguesymset:RogueEpyx'),
        namedColor,
    );
    assert.equal(namedColor.gs.symset[ROGUESET].nocolor, 0);
});

test('SYMBOLS preserves the source mixed-delimiter recursion quirk', () => {
    const state = {};
    initialize_symbols_from_options(
        parseNethackrc('SYMBOLS=S_vwall=!,S_hwall:?'),
        state,
    );

    assert.deepEqual(cmap_symbol(S_vwall, state), { ch: '?', dec: false });
    assert.deepEqual(cmap_symbol(S_hwall, state), { ch: '?', dec: false });
});

test('sym_val consumes the first configured UTF-8 byte and source escapes', () => {
    assert.equal(sym_val(''), 0);
    assert.equal(sym_val(' '), 0);
    assert.equal(sym_val("' '"), 0x20);
    assert.equal(sym_val('é'), 0xC3);
    assert.equal(sym_val('😀'), 0xF0);
    assert.equal(sym_val("'é'"), 0xC3);
    assert.equal(sym_val("'''"), 0x27);
    assert.equal(sym_val(String.raw`'\\'`), 0x5C);
    assert.equal(sym_val(String.raw`'\"'`), 0x22);
    assert.equal(sym_val("'A"), 0);
    assert.equal(sym_val("'A'junk"), 0x41);
    assert.equal(sym_val(String.raw`\065`), 0x41);
    assert.equal(sym_val(String.raw`\o101`), 0x41);
    assert.equal(sym_val(String.raw`\x41`), 0x41);
    assert.equal(sym_val('^A'), 0x01);
    assert.equal(sym_val(String.raw`\mA`), 0xC1);
    assert.equal(sym_val(String.raw`\m\mA`), 0xED);
    assert.equal(sym_val(String.raw`\m\065`), 0xC1);
    assert.equal(sym_val('\\'), 0x5C);
    assert.equal(sym_val('^'), 0x5E);
    assert.equal(sym_val(String.raw`\xZ`), 0x78);
    assert.equal(sym_val(String.raw`\o8`), 0x6F);
});

test('status uses source attribute order and exceptional strength text', async () => {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    state.flags = { female: false, showexp: true, time: true };
    state.urole = {
        name: { m: 'Barbarian' },
        rank: { m: 'Plunderer' },
    };
    state.u = {
        ux: 0,
        uy: 0,
        uz: { dlevel: 1 },
        ulevel: 1,
        uexp: 42,
        uhp: 16,
        uhpmax: 16,
        uen: 1,
        uenmax: 1,
        uac: 8,
        ualign: { type: -1 },
        // Attribute storage is STR, INT, WIS, DEX, CON, CHA. These distinct
        // values expose a display-order swap while 118 exercises 18/**.
        acurr: { a: [118, 13, 14, 15, 16, 17] },
    };
    state.moves = 7;

    await flush_screen(1);

    const row = (index) => state.nhDisplay.grid[index]
        .map((cell) => cell.ch).join('').trimEnd();
    assert.match(
        row(22),
        /St:18\/\*\* Dx:15 Co:16 In:13 Wi:14 Ch:17 Chaotic$/,
    );
    assert.equal(
        row(23),
        'Dlvl:1 $:0 HP:16(16) Pw:1(1) AC:8 Xp:1/42 T:7',
    );

    // These values cover the two ends of exceptional strength and the first
    // ordinary value after it: 18/01, 18/99, then 19.
    for (const [strength, expected] of [
        [19, '18/01'],
        [117, '18/99'],
        [119, '19'],
    ]) {
        state.u.acurr.a[0] = strength;
        await bot();
        assert.match(row(22), new RegExp(`St:${expected.replace('/', '\\/')} `));
    }

    state.flags.showexp = false;
    state.flags.time = false;
    await bot();
    assert.equal(
        row(23),
        'Dlvl:1 $:0 HP:16(16) Pw:1(1) AC:8 Xp:1',
    );

    state.flags.showvers = true;
    state.flags.versinfo = 1;
    await bot();
    assert.equal(row(23).slice(74), '5.0.0');

    state.flags.versinfo = 3;
    await bot();
    assert.equal(row(23).slice(66), 'nethack 5.0.0');

    state.flags.showvers = false;
    state.u.uroleplay = { deaf: true };
    await bot();
    assert.match(row(23), / Xp:1 Deaf$/u);

    state.plname = 'lowercase';
    await bot();
    assert.match(row(22), /^Lowercase the Plunderer/);

    state.plname = 'ABCDEFGHIJKLMNOPQRSTUVWX';
    await bot();
    assert.match(row(22), /^ABCDEFGHIJKLMNOP the Plunderer/);
});
