import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    AM_SANCTUM,
    ALTAR,
    BLINDED,
    DBWALL,
    DB_FLOOR,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DRAWBRIDGE_DOWN,
    DRAWBRIDGE_UP,
    H_UNK,
    ROGUESET,
    BLCORNER,
    BRCORNER,
    CORR,
    CROSSWALL,
    D_CLOSED,
    D_ISOPEN,
    DUST,
    DOOR,
    FOUNTAIN,
    HWALL,
    LADDER,
    LANDMINE,
    LA_DOWN,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    POOL,
    ROOM,
    SCORR,
    SDOOR,
    STAIRS,
    STONE,
    SVALL,
    TDWALL,
    TLCORNER,
    TLWALL,
    TRCORNER,
    TRWALL,
    TUWALL,
    VWALL,
} from '../js/const.js';
import * as symbolExports from '../js/symbols.js';
import {
    bot,
    armor_status,
    classify_terrain,
    flush_screen,
    hero_glyph_info,
    monster_glyph_info,
    newsym,
    object_glyph_info,
    terrain_glyph,
    weapon_status,
} from '../js/display.js';
import { make_engr_at } from '../js/engrave.js';
import { GameMap } from '../js/game.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { init_objects } from '../js/o_init.js';
import { parseNethackrc } from '../js/options.js';
import {
    add_rect_to_reg,
    add_region,
    create_region,
} from '../js/region.js';
import {
    M1_HUMANOID,
    NON_PM,
    PM_GOBLIN,
    PM_TENGU,
    S_FELINE,
    S_HUMAN,
    monst_globals_init,
} from '../js/monsters.js';
import {
    ARROW,
    CHEST,
    CLOAK_OF_PROTECTION,
    COIN_CLASS,
    CORPSE,
    CROSSBOW_BOLT,
    DIAMOND,
    FEDORA,
    LEATHER_ARMOR,
    LEATHER_GLOVES,
    LOW_BOOTS,
    objects_globals_init,
    POT_BOOZE,
    POTION_CLASS,
    QUARTERSTAFF,
    SMALL_SHIELD,
    SPEAR,
    SPE_FORCE_BOLT,
    STATUE,
    T_SHIRT,
    TWO_HANDED_SWORD,
    WEAPON_CLASS,
} from '../js/objects.js';
import {
    ATR_INVERSE,
    CLR_BRIGHT_BLUE,
    CLR_BRIGHT_GREEN,
    CLR_BRIGHT_MAGENTA,
    CLR_BROWN,
    CLR_RED,
    CLR_WHITE,
    CLR_YELLOW,
    NO_COLOR,
} from '../js/terminal.js';
import {
    SYMBOL_INDEX_BY_NAME,
    SYM_OFF_P,
} from '../js/symbol_data.js';
import {
    cmap_symbol,
    glyph_customization,
    initialize_symbols_from_options,
    misc_symbol,
    monster_class_symbol,
    object_class_symbol,
    S_hwall,
    S_arrow_trap,
    S_room,
    S_brdnstair,
    S_brupstair,
    S_cloud,
    S_hcdoor,
    S_poisoncloud,
    S_tlcorn,
    S_vwall,
    trap_to_defsym,
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

function visibleCellState({ x = 7, y = 4, ux = 1, uy = 1 } = {}) {
    const state = resetGame();
    state.level = new GameMap();
    state.level.at(x, y).typ = ROOM;
    state.u = { ux, uy, umonnum: 0 };
    state.urace = { mnum: 0 };
    state.flags = {};
    monst_globals_init(state);
    objects_globals_init(state);
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    state.viz_array[y] = [];
    state.viz_array[y][x] = 0x2;
    return state;
}

test('public S_* indices are owned by the generated defsym table', () => {
    for (const [name, value] of Object.entries(symbolExports)) {
        if (!/^S_/u.test(name) || !Number.isInteger(value)) continue;
        assert.equal(
            value,
            SYMBOL_INDEX_BY_NAME[name.toLowerCase()] - SYM_OFF_P,
            name,
        );
    }

    assert.equal(trap_to_defsym(LANDMINE), S_arrow_trap + LANDMINE - 1);
    assert.throws(() => trap_to_defsym(0), /outside the source range/u);
});

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

test('terrain conversion covers source backgrounds omitted by the old switch', () => {
    const state = {
        level: { flags: { arboreal: false } },
        u: { uz: { dnum: 0, dlevel: 1 } },
        stairs: {
            sx: 7,
            sy: 4,
            tolev: { dnum: 1, dlevel: 1 },
            u_traversed: false,
            next: null,
        },
    };
    // Distinct test symbols make direction and drawbridge orientation
    // observable even though the default pairs share '<', '>', '.', or '#'.
    initialize_symbols_from_options(parseNethackrc(
        'SYMBOLS=S_stone:s,S_tree:t,'
        + 'S_upladder:u,S_dnladder:d,'
        + 'S_brupladder:U,S_brdnladder:D,'
        + 'S_vcdbridge:V,S_hcdbridge:H,'
        + 'S_vodbridge:v,S_hodbridge:h,'
        + 'S_pool:p,S_lava:l,S_ice:i,S_room:r',
    ), state);

    assert.equal(terrain_glyph({ typ: STONE }, 7, 4, state).ch, 's');
    assert.equal(terrain_glyph({ typ: SCORR }, 7, 4, state).ch, 's');
    state.level.flags.arboreal = true;
    assert.equal(terrain_glyph({ typ: STONE }, 7, 4, state).ch, 't');
    assert.equal(terrain_glyph({ typ: SCORR }, 7, 4, state).ch, 't');
    assert.equal(
        terrain_glyph({ typ: SDOOR, seenv: 0, candig: true }, 7, 4, state).ch,
        't',
    );
    state.level.flags.arboreal = false;

    assert.equal(
        terrain_glyph({ typ: LADDER, ladder: 0 }, 7, 4, state).ch,
        'u',
    );
    assert.equal(
        terrain_glyph({ typ: LADDER, ladder: LA_DOWN }, 7, 4, state).ch,
        'd',
    );
    state.stairs.u_traversed = true;
    assert.equal(
        terrain_glyph({ typ: LADDER, ladder: 0 }, 7, 4, state).ch,
        'U',
    );
    assert.equal(
        terrain_glyph({ typ: LADDER, ladder: LA_DOWN }, 7, 4, state).ch,
        'D',
    );

    assert.equal(
        terrain_glyph({ typ: DBWALL, horizontal: false }, 7, 4, state).ch,
        'V',
    );
    assert.equal(
        terrain_glyph({ typ: DBWALL, horizontal: true }, 7, 4, state).ch,
        'H',
    );
    assert.equal(
        terrain_glyph({ typ: DRAWBRIDGE_DOWN, horizontal: false }, 7, 4, state).ch,
        'v',
    );
    assert.equal(
        terrain_glyph({ typ: DRAWBRIDGE_DOWN, horizontal: true }, 7, 4, state).ch,
        'h',
    );

    for (const [underlay, expected] of [
        [DB_MOAT, 'p'], // Water below the raised span.
        [DB_LAVA, 'l'], // Lava below the raised span.
        [DB_ICE, 'i'], // Ice below the raised span.
        [DB_FLOOR, 'r'], // Ordinary floor below the raised span.
        [DB_LAVA | DB_ICE, 'r'], // Invalid masks use source's room fallback.
    ]) {
        assert.equal(
            terrain_glyph({
                typ: DRAWBRIDGE_UP,
                drawbridgemask: underlay,
            }, 7, 4, state).ch,
            expected,
            `drawbridge underlay ${underlay}`,
        );
    }
});

test('altar presentation follows source alignment and sanctum categories', () => {
    const state = {};
    initialize_symbols_from_options({ flags: {} }, state);

    for (const [altarmask, color] of [
        [0, CLR_RED], // Unaligned altar.
        [AM_CHAOTIC, NO_COLOR], // Default build uses gray for aligned altars.
        [AM_NEUTRAL, NO_COLOR],
        [AM_LAWFUL, NO_COLOR],
        [AM_SANCTUM | AM_LAWFUL, CLR_BRIGHT_MAGENTA], // Other/sanctum glyph.
    ]) {
        assert.deepEqual(
            terrain_glyph({ typ: ALTAR, altarmask }, 7, 4, state),
            { ch: '_', color, dec: false },
            `altar mask ${altarmask}`,
        );
    }
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

test('newsym maps a visible object mimic as its remembered chest', () => {
    const state = resetGame();
    const x = 7;
    const y = 4;
    state.level = new GameMap();
    state.level.at(x, y).typ = ROOM;
    state.u = { ux: 1, uy: 1, umonnum: 0 };
    state.urace = { mnum: 0 };
    state.flags = {};
    state.mons = [{ mlet: S_HUMAN, mcolor: CLR_RED }];
    objects_globals_init(state);
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    state.viz_array[y] = [];
    state.viz_array[y][x] = 0x2;
    state.level.monsters[x][y] = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        m_ap_type: M_AP_OBJECT,
        mappearance: CHEST,
        minvis: false,
        mundetected: false,
        mx: x,
        my: y,
    };

    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, '(');
    assert.equal(state.level.at(x, y).remembered_glyph.ch, '(');
});

test('object mimics use display_monster zeroobj glyph and corpse metadata', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y });
    const fake = {
        data: state.mons[PM_TENGU],
        m_ap_type: M_AP_OBJECT,
        minvis: false,
        mundetected: false,
        mx: x,
        my: y,
    };
    const genericZeroClass = {
        ch: object_class_symbol(0, state).ch,
        // Illegal-object class zero is black in objects.c; map_glyphinfo()
        // suppresses black as the terminal's default color.
        color: NO_COLOR,
        dec: false,
    };
    const cases = [
        {
            otyp: POT_BOOZE,
            expected: {
                ch: '!',
                color: state.objects[POT_BOOZE].oc_color,
                dec: false,
            },
        },
        // obj_is_generic() consults otyp for gems and spellbooks, then the
        // zeroobj's untouched oclass selects generic object class zero.
        { otyp: DIAMOND, expected: genericZeroClass },
        { otyp: SPE_FORCE_BOLT, expected: genericZeroClass },
        {
            otyp: CORPSE,
            expected: {
                ch: '%',
                color: state.mons[PM_TENGU].mcolor,
                dec: false,
            },
        },
        {
            otyp: STATUE,
            mcorpsenm: NON_PM,
            expected: {
                ch: monster_class_symbol(
                    state.mons[PM_TENGU].mlet,
                    state,
                ).ch,
                color: state.objects[STATUE].oc_color,
                dec: false,
            },
        },
        {
            otyp: STATUE,
            mcorpsenm: PM_GOBLIN,
            expected: {
                ch: monster_class_symbol(
                    state.mons[PM_GOBLIN].mlet,
                    state,
                ).ch,
                color: state.objects[STATUE].oc_color,
                dec: false,
            },
        },
    ];

    for (const { otyp, expected, mcorpsenm } of cases) {
        fake.mappearance = otyp;
        fake.mextra = mcorpsenm === undefined ? null : { mcorpsenm };
        assert.deepEqual(monster_glyph_info(fake, state), expected, `${otyp}`);
        state.level.monsters[x][y] = fake;
        newsym(x, y);
        assert.deepEqual(
            {
                ch: state.level.at(x, y).disp_ch,
                color: state.level.at(x, y).disp_color,
                dec: state.level.at(x, y).disp_decgfx,
            },
            expected,
            `visible ${otyp}`,
        );
        assert.equal(state.level.at(x, y).remembered_glyph.ch, expected.ch);
        assert.equal(
            state.level.at(x, y).remembered_glyph.color,
            expected.color,
        );
    }
});

test('nearby zero-class object mimics stay outside the generic-glyph range', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 6, uy: 4 });
    init_objects(state, () => 0);
    state.level.monsters[x][y] = {
        data: state.mons[PM_TENGU],
        m_ap_type: M_AP_OBJECT,
        mappearance: SPE_FORCE_BOLT,
        minvis: false,
        mundetected: false,
        mx: x,
        my: y,
    };

    newsym(x, y);
    assert.equal(state.objects[SPE_FORCE_BOLT].oc_encountered, 0);
    assert.equal(
        state.level.at(x, y).disp_ch,
        object_class_symbol(0, state).ch,
    );
    assert.equal(state.level.at(x, y).disp_color, NO_COLOR);
    assert.equal(
        state.level.at(x, y).remembered_glyph.ch,
        object_class_symbol(0, state).ch,
    );
});

test('newsym maps a visible furniture mimic into display and memory', () => {
    const state = resetGame();
    const x = 7;
    const y = 4;
    state.level = new GameMap();
    state.level.at(x, y).typ = ROOM;
    state.u = { ux: 1, uy: 1, umonnum: 0 };
    state.urace = { mnum: 0 };
    state.flags = {};
    state.mons = [{ mlet: S_HUMAN, mcolor: CLR_RED }];
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    state.viz_array[y] = [];
    state.viz_array[y][x] = 0x2;
    state.level.monsters[x][y] = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        m_ap_type: M_AP_FURNITURE,
        mappearance: S_hcdoor,
        minvis: false,
        mundetected: false,
        mx: x,
        my: y,
    };

    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, '+');
    assert.equal(state.level.at(x, y).disp_color, CLR_BROWN);
    assert.equal(state.level.at(x, y).remembered_glyph.ch, '+');
    assert.equal(state.level.at(x, y).remembered_glyph.color, CLR_BROWN);
});

test('a visible gas region covers the hero without refreshing map memory', () => {
    const state = resetGame();
    const x = 7;
    const y = 4;
    state.level = new GameMap();
    state.level.at(x, y).typ = ROOM;
    state.level.at(x, y).remembered_glyph = {
        ch: 'x',
        color: NO_COLOR,
        decgfx: false,
        displayCh: null,
    };
    state.u = { ux: x, uy: y, umonnum: 0 };
    state.urace = { mnum: 0 };
    state.flags = {};
    state.mons = [{ mlet: S_HUMAN, mcolor: CLR_RED }];
    state.objects = [];
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    state.viz_array[y] = [];
    state.viz_array[y][x] = 0x2;
    const cloud = create_region();
    add_rect_to_reg(cloud, { lx: x, ly: y, hx: x, hy: y });
    cloud.visible = true;
    cloud.glyph = S_cloud;
    add_region(cloud, state);

    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, '#');
    assert.equal(state.level.at(x, y).remembered_glyph.ch, 'x');
});

test('gas colors and ordinary/disguised monster precedence follow newsym', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    const cloud = create_region();
    add_rect_to_reg(cloud, { lx: x, ly: y, hx: x, hy: y });
    cloud.visible = true;
    cloud.glyph = S_cloud;
    add_region(cloud, state);

    newsym(x, y);
    assert.deepEqual(
        [state.level.at(x, y).disp_ch, state.level.at(x, y).disp_color],
        ['#', NO_COLOR],
    );

    cloud.arg = 1;
    cloud.glyph = S_poisoncloud;
    newsym(x, y);
    assert.deepEqual(
        [state.level.at(x, y).disp_ch, state.level.at(x, y).disp_color],
        ['#', CLR_BRIGHT_GREEN],
    );

    const monster = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        m_ap_type: 0,
        minvis: false,
        mundetected: false,
        mx: x,
        my: y,
    };
    state.level.monsters[x][y] = monster;
    state.u.ux = x - 1;
    state.u.uy = y;
    newsym(x, y);
    assert.deepEqual(
        [state.level.at(x, y).disp_ch, state.level.at(x, y).disp_color],
        ['f', CLR_WHITE],
        'an adjacent ordinary monster overrides gas',
    );

    for (const [appearanceType, appearance] of [
        [M_AP_OBJECT, CHEST],
        [M_AP_FURNITURE, S_hcdoor],
    ]) {
        monster.m_ap_type = appearanceType;
        monster.mappearance = appearance;
        newsym(x, y);
        assert.deepEqual(
            [state.level.at(x, y).disp_ch, state.level.at(x, y).disp_color],
            ['#', CLR_BRIGHT_GREEN],
            'a disguised mimic remains behind gas',
        );
    }
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

test('newsym layers seen traps below objects and above engravings', () => {
    const state = resetGame();
    const x = 7;
    const y = 4;
    state.level = new GameMap();
    state.level.at(x, y).typ = ROOM;
    state.u = { ux: 1, uy: 1, uinwater: false };
    state.flags = {};
    state.objects = [];
    state.objects[42] = { oc_color: CLR_YELLOW };
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    state.viz_array[y] = [];
    state.viz_array[y][x] = 0x2; // vision.h IN_SIGHT
    const engraving = make_engr_at(
        x, y, 'beneath trap', null, 0, DUST, { state },
    );
    const trap = {
        tx: x,
        ty: y,
        // A land mine exercises a colored ordinary '^' trap glyph.
        ttyp: LANDMINE,
        tseen: true,
    };
    state.level.traps.push(trap);

    newsym(x, y);
    assert.equal(engraving.erevealed, true);
    assert.equal(state.level.at(x, y).disp_ch, '^');
    assert.equal(state.level.at(x, y).disp_color, CLR_RED);
    assert.equal(state.level.at(x, y).remembered_glyph.ch, '^');

    state.level.objects[x][y] = {
        otyp: 42,
        oclass: WEAPON_CLASS,
    };
    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, ')');

    state.level.objects[x][y] = null;
    trap.tseen = false;
    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, '`');

    trap.tseen = true;
    state.level.at(x, y).typ = POOL;
    newsym(x, y);
    assert.equal(
        state.level.at(x, y).disp_ch,
        '}',
        'water covers floor objects, traps, and engravings',
    );

    // Underwater newsym() is restricted to adjacent liquid positions in C.
    state.u.ux = x - 1;
    state.u.uy = y;
    state.u.uinwater = true;
    newsym(x, y);
    assert.equal(
        state.level.at(x, y).disp_ch,
        '^',
        'an underwater hero sees the trap through the pool layer',
    );
});

test('newsym snapshots permanent lighting only at the visible boundary', () => {
    const state = resetGame();
    const x = 7;
    const y = 4;
    state.level = new GameMap();
    const loc = state.level.at(x, y);
    loc.typ = CORR;
    loc.lit = true;
    loc.waslit = false;
    state.u = { ux: 1, uy: 1 };
    state.flags = {};
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    state.viz_array[y] = [];
    state.viz_array[y][x] = 0x2; // vision.h IN_SIGHT

    newsym(x, y);
    assert.equal(loc.waslit, true);
    assert.equal(loc.disp_color, CLR_WHITE);

    loc.lit = false;
    newsym(x, y);
    assert.equal(loc.waslit, false);
    assert.equal(loc.disp_color, NO_COLOR);

    loc.lit = true;
    state.viz_array[y][x] = 0;
    newsym(x, y);
    assert.equal(
        loc.waslit,
        false,
        'out-of-sight temporary light must not refresh remembered lighting',
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

    assert.deepEqual(
        terrain_glyph({ typ: FOUNTAIN }, 7, 4, state),
        {
            ch: null,
            color: CLR_BRIGHT_BLUE,
            dec: false,
            displayCh: '⌠',
            // dat/symbols configures the concrete fountain as 0-150-255.
            rgb: [0, 150, 255],
            displayColor: 'rgb(0, 150, 255)',
        },
    );

    state.iflags = { customcolors: false };
    assert.deepEqual(
        terrain_glyph({ typ: FOUNTAIN }, 7, 4, state),
        {
            ch: null,
            color: CLR_BRIGHT_BLUE,
            dec: false,
            displayCh: '⌠',
        },
        'customcolors does not disable the independent Unicode glyph',
    );

    state.iflags = { customsymbols: false, customcolors: true };
    assert.deepEqual(
        terrain_glyph({ typ: FOUNTAIN }, 7, 4, state),
        {
            ch: '{',
            color: CLR_BRIGHT_BLUE,
            dec: false,
            rgb: [0, 150, 255],
            displayColor: 'rgb(0, 150, 255)',
        },
        'customsymbols does not disable the independent RGB customization',
    );

    state.iflags = {
        customsymbols: true,
        customcolors: true,
        wc_color: false,
    };
    assert.deepEqual(
        terrain_glyph({ typ: FOUNTAIN }, 7, 4, state),
        {
            ch: null,
            color: NO_COLOR,
            dec: false,
            displayCh: '⌠',
        },
        'the global color option suppresses both palette and custom colors',
    );

    const live = resetGame();
    live.level = new GameMap();
    live.level.at(7, 4).typ = FOUNTAIN;
    live.level.at(7, 4).disp_ch = 'x';
    live.level.at(7, 4).disp_color = CLR_RED;
    live.u = { ux: 1, uy: 1 };
    live.flags = {};
    live.viz_array = [];
    live.viz_array[4] = [];
    live.viz_array[4][7] = 0x2; // vision.h IN_SIGHT
    const options = parseNethackrc('OPTIONS=symset:Enhanced1');
    live.iflags = { ...options.iflags };
    initialize_symbols_from_options(options, live);
    newsym(7, 4);
    assert.equal(
        live.level.at(7, 4).disp_ch,
        'x',
        'recorder patch 006 leaves the prior cell under g_pututf8()',
    );
    assert.equal(live.level.at(7, 4).disp_color, CLR_RED);
    assert.equal(live.level.at(7, 4).disp_browser_ch, '⌠');
    assert.equal(
        live.level.at(7, 4).disp_browser_color,
        'rgb(0, 150, 255)',
    );
    assert.deepEqual(live.level.at(7, 4).remembered_glyph.rgb, [0, 150, 255]);
});

test('standalone SYMBOLS validates but does not apply G_* customizations', () => {
    const configured = (rc) => {
        const state = {};
        initialize_symbols_from_options(parseNethackrc(rc), state);
        return state;
    };

    const overridden = configured([
        'OPTIONS=symset:Enhanced1',
        'SYMBOLS=G_FoUnTaIn:U+2603,G_vWaLl_SoKoBaN:U+2602',
    ].join('\n'));
    assert.equal(
        terrain_glyph({ typ: FOUNTAIN }, 7, 4, overridden).displayCh,
        '⌠',
    );
    assert.equal(
        glyph_customization('G_vwall_sokoban', overridden).displayCh,
        '│',
    );

    // Loading order does not change the source no-op; the named set retains
    // the concrete glyph mappings defined in the symbols data file.
    const resetBySelection = configured([
        'SYMBOLS=G_fountain:U+2603',
        'OPTIONS=symset:Enhanced1',
    ].join('\n'));
    assert.equal(
        terrain_glyph({ typ: FOUNTAIN }, 7, 4, resetBySelection).displayCh,
        '⌠',
    );

    assert.throws(
        () => parseNethackrc('SYMBOLS=G_not_a_source_glyph:U+2603'),
        /unknown symbol/u,
    );
    assert.throws(
        () => parseNethackrc('SYMBOLS=g_fountain:U+2603'),
        /unknown symbol/u,
    );
    // Exercise every source family that is absent from or only partially
    // represented by dat/symbols.
    for (const glyphId of [
        'G_male_giant_ant',
        'G_pet_female_giant_ant',
        'G_detected_male_giant_ant',
        'G_body_giant_ant',
        'G_ridden_female_giant_ant',
        'G_LONG_SWORD',
        'G_stone_substrate',
        'G_unaligned_altar',
        'G_trapped_chest',
        'G_missile_zap_vbeam',
        'G_swallow_giant_ant_top_left',
        'G_dark_expl_tl',
        'G_warning5',
        'G_statue_of_female_apprentice',
        'G_piletop_long_sword',
        'G_piletop_body_giant_ant',
        'G_piletop_statue_of_male_giant_ant',
        'G_nothing',
    ]) {
        assert.doesNotThrow(
            () => parseNethackrc(`SYMBOLS=${glyphId}:U+2603`),
            glyphId,
        );
    }
    assert.throws(
        () => parseNethackrc('SYMBOLS=G_piletop_generic_weapon:U+2603'),
        /unknown symbol/u,
    );
    assert.equal(
        glyph_customization(
            'G_long_sword',
            configured([
                'OPTIONS=symset:Enhanced1',
                'SYMBOLS=G_long_sword:U+2603',
            ].join('\n')),
        ),
        null,
    );
    assert.throws(
        () => parseNethackrc('OPTIONS=G_fountain:U+2603'),
        /unknown option/u,
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

test('weapon and armor status descriptions follow botl source categories', () => {
    const state = resetGame();
    objects_globals_init(state);
    init_objects(state, () => 0);
    const object = (otyp) => ({
        otyp,
        oclass: state.objects[otyp].oc_class,
    });
    state.u = { umonnum: 0, twoweap: false, usteed: null };
    state.mons = [{ mflags1: M1_HUMANOID }];

    assert.equal(weapon_status(state), 'Bare-hnds');
    state.uarmg = object(LEATHER_GLOVES);
    assert.equal(weapon_status(state), 'Empty-hnd');
    state.uarmg = null;

    // Quarterstaves and two-handed swords exercise capitalization after the
    // source's 2H- prefix rather than capitalization of the prefix itself.
    state.uwep = object(QUARTERSTAFF);
    assert.equal(weapon_status(state), '2H-Staff');
    state.uwep = object(TWO_HANDED_SWORD);
    assert.equal(weapon_status(state), '2H-Sword');
    state.uwep = object(ARROW);
    assert.equal(weapon_status(state), 'Arrow');
    state.uwep = object(CROSSBOW_BOLT);
    assert.equal(weapon_status(state), 'Bolt');

    state.uwep = null;
    assert.equal(armor_status(state), 'Naked');
    state.uarmh = object(FEDORA);
    assert.equal(armor_status(state), 'Hat');

    state.uarmg = object(LEATHER_GLOVES);
    state.uarmc = object(CLOAK_OF_PROTECTION);
    state.uarm = object(LEATHER_ARMOR);
    state.uarmu = object(T_SHIRT);
    state.uarmf = object(LOW_BOOTS);
    state.uarms = object(SMALL_SHIELD);
    assert.equal(
        armor_status(state),
        'GCAUHBS+',
        'multiple pieces use source slot order and mark protection',
    );
});

test('terrain status classifies map and pseudo-terrain types', () => {
    const state = resetGame();
    state.level = new GameMap();
    state.iflags = {};
    state.u = {
        // This interior coordinate permits every synthetic terrain case.
        ux: 7,
        uy: 4,
        uz: { dnum: 0, dlevel: 1 },
        uinwater: false,
    };
    const loc = state.level.at(7, 4);

    loc.typ = ROOM;
    assert.equal(classify_terrain(state), 39, 'room becomes xFLOOR');
    loc.typ = DOOR;
    loc.flags = D_ISOPEN;
    assert.equal(classify_terrain(state), 41, 'open door becomes xOPENDOOR');
    loc.flags = D_CLOSED;
    assert.equal(classify_terrain(state), 42, 'closed door becomes xSHUTDOOR');
    loc.typ = DRAWBRIDGE_UP;
    loc.flags = DB_LAVA;
    assert.equal(classify_terrain(state), 20, 'lava underlay becomes LAVAPOOL');
    state.u.uinwater = true;
    assert.equal(classify_terrain(state), 44, 'underwater becomes xSUBMERGED');
    assert.equal(state.iflags.terrain_typ, 44);
});

test('optional status fields preserve tty placement and overflow shrinking', async () => {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    state.level = new GameMap();
    objects_globals_init(state);
    init_objects(state, () => 0);
    const object = (otyp) => ({
        otyp,
        oclass: state.objects[otyp].oc_class,
    });
    state.level.at(7, 4).typ = STAIRS;
    state.flags = {
        weaponstatus: true,
        armorstatus: true,
        terrainstatus: true,
    };
    state.iflags = { wc2_statuslines: 3 };
    state.urole = {
        name: { m: 'Valkyrie' },
        rank: { m: 'Stripling' },
    };
    state.u = {
        ux: 7,
        uy: 4,
        uz: { dnum: 0, dlevel: 1 },
        umonnum: 0,
        ulevel: 1,
        uexp: 0,
        uhp: 18,
        uhpmax: 18,
        uen: 1,
        uenmax: 1,
        uac: 6,
        ualign: { type: 1 },
        // Storage order is STR, INT, WIS, DEX, CON, CHA.
        acurr: { a: [15, 10, 8, 13, 20, 9] },
        uprops: [],
        uroleplay: {},
    };
    state.mons = [{ mflags1: M1_HUMANOID }];
    state.uwep = object(SPEAR);
    state.uarms = object(SMALL_SHIELD);

    await flush_screen(1);
    const row = (index) => state.nhDisplay.grid[index]
        .map((cell) => cell.ch).join('').trimEnd();
    assert.equal(row(23), 'Dlvl:1 Spear Shield Stairs');

    // Maximal first-command options force make_things_fit() through both
    // condition abbreviations, its empty-capacity blank, and short "Dl".
    state.iflags.wc2_statuslines = 2;
    state.flags.showexp = true;
    state.flags.showvers = true;
    state.flags.time = true;
    state.flags.versinfo = 1;
    state.moves = 1;
    state.u.uroleplay.deaf = true;
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.uwep = null;
    state.uarms = null;
    state.uarmu = object(T_SHIRT);
    // 999 is the three-digit starting-gold case which makes all enabled
    // fields exceed tty's 79 printable columns.
    state.invent = { oclass: COIN_CLASS, quan: 999, nobj: null };
    await flush_screen(1);
    assert.match(row(23), /^Dl:1 .* T:1  Bl Df Bare-hnds Shirt Stairs/u);
    assert.equal(row(23).length, 79);
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

    state.plname = 'Hero';
    state.iflags = { wc2_statuslines: 3 };
    state.u.uroleplay = {};
    await flush_screen(1);
    assert.match(
        row(21),
        /St:19 Dx:15 Co:16 In:13 Wi:14 Ch:17$/u,
    );
    assert.equal(
        row(22),
        'Chaotic $:0 HP:16(16) Pw:1(1) AC:8 Xp:1',
    );
    assert.equal(row(23), 'Dlvl:1');

    state.u.uroleplay = { deaf: true };
    await bot();
    assert.equal(
        row(23).indexOf('Deaf'),
        row(22).length + 1,
        'three-row conditions align with the preceding hunger field',
    );

    state.flags.showvers = true;
    state.flags.versinfo = 1;
    await bot();
    assert.equal(row(23).slice(0, 6), 'Dlvl:1');
    assert.equal(row(23).slice(74), '5.0.0');
    assert.doesNotMatch(
        row(23),
        /Deaf/u,
        'initial tty version padding overwrites an indented condition',
    );
});

test('three-line status clips the map around a bottom-row hero', async () => {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    state.level = new GameMap();
    state.flags = {};
    state.iflags = { wc2_statuslines: 3 };
    state.urole = {
        name: { m: 'Archeologist' },
        rank: { m: 'Digger' },
    };
    state.u = {
        ux: 1,
        uy: 20,
        uz: { dlevel: 1 },
        ulevel: 1,
        uhp: 12,
        uhpmax: 12,
        uen: 3,
        uenmax: 3,
        uac: 10,
        ualign: { type: 1 },
        // Attribute storage is STR, INT, WIS, DEX, CON, CHA. Distinct
        // values expose both field order and the clipped cursor projection.
        acurr: { a: [12, 13, 14, 15, 16, 17] },
    };
    state.level.at(1, 0).disp_ch = 'A';
    state.level.at(1, 20).disp_ch = 'Z';

    await flush_screen(1);

    const row = (index) => state.nhDisplay.grid[index]
        .map((cell) => cell.ch).join('').trimEnd();
    assert.equal(row(1), '', 'map row zero is above the clipped viewport');
    assert.equal(row(20), 'Z', 'map row twenty occupies the last map row');
    assert.match(row(21), /^Hero the Digger/u);
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [0, 20],
    );
});
