import assert from 'node:assert/strict';
import test from 'node:test';

import { createArtifactTable } from '../js/artifacts.js';
import {
    ALTAR,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_MASK,
    AM_NEUTRAL,
    AM_SANCTUM,
    BLCORNER,
    BLINDED,
    BRCORNER,
    BURN,
    CONFUSION,
    CORPSTAT_FEMALE,
    CORPSTAT_MALE,
    CORR,
    CROSSWALL,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    DB_FLOOR,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DBWALL,
    def_warnsyms,
    DETECT_MONSTERS,
    DOOR,
    DRAWBRIDGE_DOWN,
    DRAWBRIDGE_UP,
    DUST,
    FLYING,
    FOUNTAIN,
    H_UNK,
    HALLUC,
    HALLUC_RES,
    HL_BLINK,
    HL_BOLD,
    HL_DIM,
    HL_INVERSE,
    HL_ITALIC,
    HL_NONE,
    HL_ULINE,
    HL_UNDEF,
    HWALL,
    ICE,
    IN_SIGHT,
    LA_DOWN,
    LADDER,
    LANDMINE,
    LAVAPOOL,
    LAVAWALL,
    LEVITATION,
    M_AP_F_DKNOWN,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    MAXTCHARS,
    OBJ_FLOOR,
    PIT,
    POOL,
    PROT_FROM_SHAPE_CHANGERS,
    ROGUESET,
    ROOM,
    ROT_CORPSE,
    SATIATED,
    SCORR,
    SDOOR,
    SEE_INVIS,
    SICK,
    SICK_NONVOMITABLE,
    SICK_VOMITABLE,
    SINK,
    SLIMED,
    STAIRS,
    STONE,
    STONED,
    STRANGLED,
    STUNNED,
    SVALL,
    SYM_NOTHING,
    TDWALL,
    TIMER_OBJECT,
    TLCORNER,
    TLWALL,
    TRCORNER,
    TRWALL,
    TUWALL,
    VWALL,
    W_SADDLE,
    WARNCOUNT,
    WARNING,
    WATER,
    WEB,
} from '../js/const.js';
import * as symbolExports from '../js/symbols.js';
import {
    ALTAR_CUSTOMIZATION_NAMES,
    altar_chaotic,
    altar_lawful,
    altar_neutral,
    altar_other,
    altar_to_glyph,
    altar_unaligned,
    armor_status,
    back_to_glyph,
    bot,
    classify_terrain,
    cls,
    cmap_c_to_glyph,
    cmap_to_glyph,
    cmap_walls_to_glyph,
    corpse_to_glyph,
    docrt,
    engraving_to_glyph,
    feel_location,
    feel_newsym,
    flush_screen,
    generic_obj_to_glyph,
    glyph_is_body,
    GLYPH_INVISIBLE,
    glyph_is_body_piletop,
    glyph_is_cmap,
    glyph_is_cmap_zap,
    glyph_is_fem_statue,
    glyph_is_fem_statue_piletop,
    glyph_is_generic_object,
    glyph_is_invisible,
    glyph_is_male_statue,
    glyph_is_male_statue_piletop,
    glyph_is_normal_generic_obj,
    glyph_is_normal_object,
    glyph_is_normal_piletop_obj,
    glyph_is_object,
    glyph_is_piletop_generic_obj,
    glyph_is_statue,
    glyph_to_cmap,
    hallucinated_statue_glyph_info,
    hero_glyph_info,
    map_glyphinfo,
    map_invisible,
    map_trap,
    MG_CORPSE,
    MG_FEMALE,
    MG_INVIS,
    MG_MALE,
    MG_OBJPILE,
    MG_STATUE,
    monster_glyph_info,
    newsym,
    NO_GLYPH,
    normal_obj_to_glyph,
    object_glyph_info,
    objnum_to_glyph,
    random_object_glyph_info,
    reglyph_darkroom,
    remembered_glyph_from_presentation,
    remembered_glyph_presentation,
    same_remembered_glyph,
    see_nearby_objects,
    show_glyph_cell,
    statue_to_glyph,
    timebot,
    trap_glyph_info,
    trap_to_glyph,
    tty_capacity_status,
    unmap_invisible,
    unmap_object,
    UnsupportedMapMemoryError,
    UnsupportedStatusRefreshError,
    weapon_status,
} from '../js/display.js';
import {
    GLYPH_ALTAR_OFF,
    GLYPH_BODY_OFF,
    GLYPH_BODY_PILETOP_OFF,
    GLYPH_CMAP_A_OFF,
    GLYPH_CMAP_B_OFF,
    GLYPH_CMAP_C_OFF,
    GLYPH_CMAP_GEH_OFF,
    GLYPH_CMAP_KNOX_OFF,
    GLYPH_CMAP_MAIN_OFF,
    GLYPH_CMAP_MINES_OFF,
    GLYPH_CMAP_SOKO_OFF,
    GLYPH_CMAP_STONE_OFF,
    GLYPH_NOTHING_OFF,
    GLYPH_OBJ_OFF,
    GLYPH_OBJ_PILETOP_OFF,
    GLYPH_PET_MALE_OFF,
    GLYPH_STATUE_FEM_OFF,
    GLYPH_STATUE_FEM_PILETOP_OFF,
    GLYPH_STATUE_MALE_OFF,
    GLYPH_STATUE_MALE_PILETOP_OFF,
    GLYPH_UNEXPLORED_OFF,
    GLYPH_ZAP_OFF,
    NUM_ZAP,
} from '../js/glyph_offsets.js';
import { rndmonnam } from '../js/do_name.js';
import { engr_at, make_engr_at } from '../js/engrave.js';
import { GameMap, makeLocation } from '../js/game.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { init_objects } from '../js/o_init.js';
import { parseNethackrc } from '../js/options.js';
import { sourceGlyphName } from '../js/glyph_ids.js';
import {
    add_rect_to_reg,
    add_region,
    create_region,
} from '../js/region.js';
import {
    M1_HUMANOID,
    NON_PM,
    NUMMONS,
    PM_GOBLIN,
    PM_GARTER_SNAKE,
    PM_JACKAL,
    PM_LURKER_ABOVE,
    PM_SEWER_RAT,
    PM_ROCK_PIERCER,
    PM_TENGU,
    S_FELINE,
    S_HUMAN,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    enableRngLog,
    getRngLog,
    initRng,
    rn2,
    rn2_on_display_rng,
} from '../js/rng.js';
import {
    ARROW,
    BOULDER,
    CHEST,
    CLOAK_OF_PROTECTION,
    COIN_CLASS,
    CORPSE,
    CROSSBOW_BOLT,
    DIAMOND,
    FEDORA,
    FIRST_OBJECT,
    FOOD_CLASS,
    GOLD_PIECE,
    ILLOBJ_CLASS,
    LEATHER_ARMOR,
    LEATHER_GLOVES,
    LOW_BOOTS,
    NUM_OBJECTS,
    OBJ_DESCR,
    objects_globals_init,
    POT_BOOZE,
    POTION_CLASS,
    QUARTERSTAFF,
    ROCK,
    SCR_IDENTIFY,
    SMALL_SHIELD,
    SLIME_MOLD,
    SPEAR,
    SPE_FORCE_BOLT,
    STATUE,
    STRANGE_OBJECT,
    T_SHIRT,
    TWO_HANDED_SWORD,
    WEAPON_CLASS,
    WORTHLESS_BLACK_GLASS,
} from '../js/objects.js';
import { start_timer, timeout_globals_init } from '../js/timeout.js';
import { HLIQUIDS } from '../js/random_text_data.js';
import {
    ATR_BOLD,
    ATR_INVERSE,
    ATR_NONE,
    ATR_UNDERLINE,
    CLR_BLACK,
    CLR_BRIGHT_BLUE,
    CLR_BRIGHT_GREEN,
    CLR_BRIGHT_MAGENTA,
    CLR_BROWN,
    CLR_GRAY,
    CLR_ORANGE,
    CLR_RED,
    CLR_WHITE,
    CLR_YELLOW,
    NO_COLOR,
} from '../js/terminal.js';
import {
    SYMBOL_INDEX_BY_NAME,
    SYM_OFF_P,
    SYM_OFF_X,
} from '../js/symbol_data.js';
import {
    cmap_symbol,
    defsym_to_trap,
    glyph_customization,
    initialize_symbols_from_options,
    MAXPCHARS,
    misc_symbol,
    monster_class_symbol,
    object_class_symbol,
    S_altar,
    S_arrow_trap,
    S_brdnladder,
    S_brdnstair,
    S_brupstair,
    S_cloud,
    S_corr,
    S_darkroom,
    S_digbeam,
    S_dnladder,
    S_engrcorr,
    S_engroom,
    S_fountain,
    S_goodpos,
    S_grave,
    S_hcdoor,
    S_hodoor,
    S_hwall,
    S_ice,
    S_lava,
    S_lavawall,
    S_litcorr,
    S_ndoor,
    S_poisoncloud,
    S_pool,
    S_room,
    S_sink,
    S_stone,
    S_tlcorn,
    S_trwall,
    S_upstair,
    S_vbeam,
    S_vcdoor,
    S_vodoor,
    S_vwall,
    sym_val,
    trap_to_defsym,
} from '../js/symbols.js';
import {
    _startupA11yInternals,
    describeMonster,
    emitGlyphUpdateNotices,
} from '../js/startup_a11y.js';
import {
    enableBrowserGlyphProjection,
} from './browser-projection-test-support.mjs';

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

// C's back_to_glyph() reads levl[x][y], and cmap_walls_to_glyph() beneath it
// reads the hero's dungeon position, so a synthetic square is installed on a
// map before it is drawn. A square that is already the map's own is left in
// place, so that later assertions still see the cell they set up.
function terrainGlyphAt(loc, x, y, state) {
    if (typeof state.level?.at !== 'function') {
        const map = new GameMap();
        // Keep whatever level flags the caller set up: back_to_glyph() reads
        // level.flags.arboreal, and some callers toggle it between draws.
        if (state.level?.flags) map.flags = state.level.flags;
        state.level = map;
    }
    // cmap_walls_to_glyph() asks which branch the hero is in, which needs both
    // a position and a dungeon list to look it up in.
    state.dungeons ??= [{ flags: {} }];
    state.u ??= {};
    state.u.uz ??= { dnum: 0, dlevel: 1 };
    const square = state.level.at(x, y);
    if (square !== loc) {
        // Reset before merging, so that a field left by an earlier synthetic
        // square cannot leak into this one; the cell object itself is kept,
        // because callers hold a reference to it.
        for (const key of Object.keys(square)) delete square[key];
        Object.assign(square, makeLocation(), loc);
    }
    return map_glyphinfo(back_to_glyph(x, y, state), state);
}

function displaySymbol(loc, state) {
    const { ch, dec } = terrainGlyphAt(loc, 7, 4, state);
    return { ch, dec };
}

function visibleCellState({ x = 7, y = 4, ux = 1, uy = 1 } = {}) {
    const state = resetGame();
    state.context = { ident: 2 };
    state.moves = 1;
    timeout_globals_init(state);
    state.level = new GameMap();
    state.level.at(x, y).typ = ROOM;
    state.dungeons = [{
        ledger_start: 0,
        depth_start: 1,
        entry_lev: 1,
        num_dunlevs: 20,
        flags: 0,
    }];
    state.quest_dnum = -1;
    state.rogue_level = { dnum: 0, dlevel: 0 };
    state.sanctum_level = { dnum: 0, dlevel: 0 };
    state.specialLevels = [];
    state.u = {
        ux,
        uy,
        umonnum: 0,
        ulevel: 1,
        uhave: { amulet: 0 },
        uz: { dnum: 0, dlevel: 1 },
    };
    state.urace = { mnum: 0 };
    state.urole = { mnum: PM_TENGU };
    state.flags = {};
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    state.viz_array[y] = [];
    state.viz_array[y][x] = 0x2;
    return state;
}

function enableGlyphNotices(state) {
    state.a11y = {
        accessiblemsg: false,
        glyph_updates: true,
        mon_notices: false,
        mon_notices_blocked: 0,
    };
    state.program_state = {};
}

function glyphPresentationRecord(glyph) {
    const color = glyph.color ?? NO_COLOR;
    const displayCh = glyph.displayCh ?? null;
    const record = {
        ch: glyph.ch,
        color,
        dec: Boolean(glyph.dec),
        attr: glyph.attr ?? 0,
        displayCh,
        displayColor: glyph.displayColor ?? (displayCh ? color : null),
        a11yKind: glyph.a11yKind ?? null,
        a11yDescription: glyph.a11yDescription ?? null,
    };
    if (glyph.rgb) record.rgb = [...glyph.rgb];
    return record;
}

function captureDisplayWrites(location) {
    let logicalPresentation = location.disp_glyph;
    const writes = [];
    Object.defineProperty(location, 'disp_glyph', {
        configurable: true,
        enumerable: true,
        get() {
            return logicalPresentation;
        },
        set(value) {
            writes.push(value);
            logicalPresentation = value;
        },
    });
    return writes;
}

function terminalRow(state, row) {
    return state.nhDisplay.grid[row].map((cell) => cell.ch).join('');
}

function assertCellRange(state, row, start, length, expected, label) {
    assert.ok(start >= 0, `${label}: missing range`);
    for (let column = start; column < start + length; ++column) {
        assert.deepEqual(
            {
                color: state.nhDisplay.grid[row][column].color,
                attr: state.nhDisplay.grid[row][column].attr,
            },
            expected,
            `${label}: column ${column}`,
        );
    }
}

function assertStatusTextStyle(
    state,
    row,
    text,
    expected,
    { from = 0, before = true, after = true, label = text } = {},
) {
    const start = terminalRow(state, row).indexOf(text, from);
    assert.notEqual(start, -1, label);
    assertCellRange(state, row, start, text.length, expected, label);
    const normal = { color: NO_COLOR, attr: ATR_NONE };
    if (before && start > 0) {
        assert.deepEqual(
            {
                color: state.nhDisplay.grid[row][start - 1].color,
                attr: state.nhDisplay.grid[row][start - 1].attr,
            },
            normal,
            `${label}: preceding cell`,
        );
    }
    if (after && start + text.length < 79) {
        assert.deepEqual(
            {
                color: state.nhDisplay.grid[row][start + text.length].color,
                attr: state.nhDisplay.grid[row][start + text.length].attr,
            },
            normal,
            `${label}: following cell`,
        );
    }
    return start;
}

// Every status row rendered below reaches botl.c describe_level(), which asks
// dungeon.c depth() for svd.dungeons[u.uz.dnum].depth_start. The Dungeons of
// Doom is dungeon 0 and starts at depth 1, so the Dlvl field equals u.uz.dlevel
// wherever this fills a fixture's dungeon list.
function dungeonsOfDoom() {
    return [{ depth_start: 1 }];
}

function statusRenderingState() {
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
    state.dungeons = dungeonsOfDoom();
    state.flags = {
        female: false,
        showexp: true,
        showvers: true,
        time: true,
        versinfo: 1,
        weaponstatus: true,
        armorstatus: true,
        terrainstatus: true,
    };
    state.iflags = { wc2_statuslines: 2 };
    state.urole = {
        name: { m: 'Barbarian' },
        rank: { m: 'Plunderer' },
    };
    state.plname = 'Hero';
    state.u = {
        ux: 7,
        uy: 4,
        uz: { dnum: 0, dlevel: 1 },
        umonnum: 0,
        ulevel: 1,
        uexp: 42,
        uhp: 16,
        uhpmax: 16,
        uen: 4,
        uenmax: 6,
        uac: 8,
        ualign: { type: -1 },
        acurr: { a: [18, 13, 14, 15, 16, 17] },
        uprops: [],
        uroleplay: {},
    };
    state.moves = 7;
    state.mons = [{ mflags1: M1_HUMANOID }];
    state.uwep = object(SPEAR);
    state.uarms = object(SMALL_SHIELD);
    state.invent = { oclass: COIN_CLASS, quan: 50, nobj: null };
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
            terrainGlyphAt(expected.loc, 7, 4, decState).color,
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
        terrainGlyphAt({ typ: STAIRS, ladder: 0 }, 7, 4, state),
        { ch: '<', color: CLR_YELLOW, dec: false },
    );
    assert.equal(cmap_symbol(S_brupstair, state).ch, '<');

    state.stairs.u_traversed = false;
    assert.deepEqual(
        terrainGlyphAt({ typ: STAIRS, ladder: LA_DOWN }, 7, 4, state),
        { ch: '>', color: NO_COLOR, dec: false },
    );

    state.stairs.u_traversed = true;
    assert.deepEqual(
        terrainGlyphAt({ typ: STAIRS, ladder: LA_DOWN }, 7, 4, state),
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

    assert.equal(terrainGlyphAt({ typ: STONE }, 7, 4, state).ch, 's');
    assert.equal(terrainGlyphAt({ typ: SCORR }, 7, 4, state).ch, 's');
    state.level.flags.arboreal = true;
    assert.equal(terrainGlyphAt({ typ: STONE }, 7, 4, state).ch, 't');
    assert.equal(terrainGlyphAt({ typ: SCORR }, 7, 4, state).ch, 't');
    assert.equal(
        terrainGlyphAt({ typ: SDOOR, seenv: 0, candig: true }, 7, 4, state).ch,
        't',
    );
    state.level.flags.arboreal = false;

    assert.equal(
        terrainGlyphAt({ typ: LADDER, ladder: 0 }, 7, 4, state).ch,
        'u',
    );
    assert.equal(
        terrainGlyphAt({ typ: LADDER, ladder: LA_DOWN }, 7, 4, state).ch,
        'd',
    );
    state.stairs.u_traversed = true;
    assert.equal(
        terrainGlyphAt({ typ: LADDER, ladder: 0 }, 7, 4, state).ch,
        'U',
    );
    assert.equal(
        terrainGlyphAt({ typ: LADDER, ladder: LA_DOWN }, 7, 4, state).ch,
        'D',
    );

    assert.equal(
        terrainGlyphAt({ typ: DBWALL, horizontal: false }, 7, 4, state).ch,
        'V',
    );
    assert.equal(
        terrainGlyphAt({ typ: DBWALL, horizontal: true }, 7, 4, state).ch,
        'H',
    );
    assert.equal(
        terrainGlyphAt({ typ: DRAWBRIDGE_DOWN, horizontal: false }, 7, 4, state).ch,
        'v',
    );
    assert.equal(
        terrainGlyphAt({ typ: DRAWBRIDGE_DOWN, horizontal: true }, 7, 4, state).ch,
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
            terrainGlyphAt({
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
            terrainGlyphAt({ typ: ALTAR, altarmask }, 7, 4, state),
            { ch: '_', color, dec: false },
            `altar mask ${altarmask}`,
        );
    }
});

test('disabled color suppresses colored terrain glyphs', () => {
    const state = { iflags: { wc_color: false } };
    initialize_symbols_from_options({ flags: {} }, state);

    assert.equal(
        terrainGlyphAt({ typ: DOOR, flags: D_CLOSED }, 7, 4, state).color,
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
        terrainGlyphAt({ typ: STAIRS, ladder: 0 }, 7, 4, state).color,
        NO_COLOR,
    );
});

test('disabled color uses tty inverse cues for ambiguous terrain symbols', () => {
    const state = {
        iflags: { wc_color: false, wc_inverse: true },
    };
    initialize_symbols_from_options({ flags: {} }, state);

    for (const typ of [SINK, ICE, LAVAPOOL, LAVAWALL]) {
        assert.equal(
            terrainGlyphAt({ typ }, 7, 4, state).attr,
            ATR_INVERSE,
            `terrain type ${typ}`,
        );
    }
    for (const typ of [FOUNTAIN, POOL, WATER]) {
        assert.equal(
            terrainGlyphAt({ typ }, 7, 4, state).attr,
            undefined,
            `reference terrain type ${typ}`,
        );
    }
    assert.equal(
        terrainGlyphAt({ typ: DRAWBRIDGE_UP, flags: DB_LAVA }, 7, 4, state).attr,
        ATR_INVERSE,
        'raised drawbridge lava uses the same cmap cue',
    );

    state.iflags.wc_inverse = false;
    assert.equal(
        terrainGlyphAt({ typ: SINK }, 7, 4, state).attr,
        undefined,
    );
    state.iflags.wc_inverse = true;
    state.iflags.wc_color = true;
    assert.equal(
        terrainGlyphAt({ typ: SINK }, 7, 4, state).attr,
        undefined,
    );
});

test('lit corridors use their symbol and retain the black-and-white cue', () => {
    const state = { flags: {}, iflags: { wc_color: true } };
    initialize_symbols_from_options({ flags: {} }, state);

    assert.deepEqual(
        terrainGlyphAt({ typ: CORR, waslit: false }, 7, 4, state),
        { ch: '#', color: NO_COLOR, dec: false },
    );
    assert.deepEqual(
        terrainGlyphAt({ typ: CORR, waslit: true }, 7, 4, state),
        { ch: '#', color: CLR_WHITE, dec: false },
    );
    state.flags.lit_corridor = true;
    assert.equal(
        terrainGlyphAt({ typ: CORR, waslit: false }, 7, 4, state).color,
        CLR_WHITE,
    );

    state.iflags.wc_color = false;
    assert.equal(
        terrainGlyphAt({ typ: CORR, waslit: true }, 7, 4, state).color,
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

test('failed primary selections clear metadata without undoing earlier bytes',
    () => {
        const selected = (rc) => {
            const state = {};
            initialize_symbols_from_options(parseNethackrc(rc), state);
            return { state, symbol: cmap_symbol(S_vwall, state) };
        };

        const invalidOnly = selected('OPTIONS=symset:NoSuchSymbols');
        assert.deepEqual(invalidOnly.symbol, { ch: '|', dec: false });
        assert.equal(invalidOnly.state.gs.symset[0].name, null);

        // parseoptions() evaluates comma-separated OPTIONS from right to left.
        // The failed right-hand selection is therefore followed by DEC here.
        const invalidBeforeValid = selected(
            'OPTIONS=symset:DECgraphics,symset:NoSuchSymbols',
        );
        assert.deepEqual(invalidBeforeValid.symbol, { ch: 'x', dec: true });
        assert.equal(invalidBeforeValid.state.gs.symset[0].name, 'DECgraphics');

        // Reversing the text loads DEC first.  read_sym_file() then misses and
        // clear_symsetentry() removes its metadata without calling
        // init_primary_symbols() or switch_symbols(FALSE), so DEC bytes remain.
        const invalidAfterValid = selected(
            'OPTIONS=symset:NoSuchSymbols,symset:DECgraphics',
        );
        assert.deepEqual(invalidAfterValid.symbol, { ch: 'x', dec: true });
        assert.equal(invalidAfterValid.state.gs.symset[0].name, null);
        assert.equal(invalidAfterValid.state.gs.symset[0].handling, H_UNK);
        assert.equal(invalidAfterValid.state.gs.symset[0].nocolor, 0);
        assert.equal(invalidAfterValid.state.gs.symset[0].primary, 0);
        assert.equal(invalidAfterValid.state.gs.symset[0].rogue, 0);

        for (const rc of [
            'SYMBOLS=S_vwall:!\nOPTIONS=symset:NoSuchSymbols',
            'OPTIONS=symset:NoSuchSymbols\nSYMBOLS=S_vwall:!',
        ]) {
            const overridden = selected(rc);
            assert.deepEqual(overridden.symbol, { ch: '!', dec: false }, rc);
            assert.equal(overridden.state.gs.symset[0].name, null, rc);
        }
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
        // umonster as well as umonnum: you.h:554's Upolyd compares the two, so
        // a hero carrying only one of them reads as polymorphed, and
        // display.h hero_glyph's `Upolyd ||` disjunct would then show the form
        // where this test means to show the race.
        u: { umonnum: 0, umonster: 0 },
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

test('UTF-8 hero and pet overrides survive zero raw optional symbols', async () => {
    const configured = parseNethackrc([
        'OPTIONS=symset:Enhanced1',
        'SYMBOLS=S_pet_override:U+2603,S_hero_override:U+2602',
    ].join('\n'));
    const makeState = (heroAtCell) => {
        const state = resetGame();
        state.level = new GameMap();
        state.level.at(7, 4).typ = ROOM;
        state.flags = {};
        state.sysopt = { accessibility: 1 };
        state.dungeons = dungeonsOfDoom();
        state.u = {
            ux: heroAtCell ? 7 : 1,
            uy: heroAtCell ? 4 : 1,
            uz: { dnum: 0, dlevel: 1 },
            umonnum: 0,
        };
        state.urace = { mnum: 1 };
        state.mons = [
            { mlet: S_HUMAN, mcolor: CLR_RED },
            { mlet: S_FELINE, mcolor: CLR_WHITE },
        ];
        state.iflags = { ...configured.iflags };
        initialize_symbols_from_options(configured, state);
        state.viz_array = [];
        state.viz_array[4] = [];
        state.viz_array[4][7] = 0x2; // vision.h IN_SIGHT
        state.nhDisplay = new GameDisplay(null);
        return state;
    };

    let state = makeState(true);
    assert.deepEqual(hero_glyph_info(state), {
        ch: null,
        color: CLR_RED,
        dec: false,
        displayCh: '☂',
    });
    newsym(7, 4);
    assert.deepEqual(
        {
            ch: state.level.at(7, 4).disp_ch,
            color: state.level.at(7, 4).disp_color,
            attr: state.level.at(7, 4).disp_attr,
            browserCh: state.level.at(7, 4).disp_browser_ch,
        },
        { ch: ' ', color: NO_COLOR, attr: ATR_NONE, browserCh: '☂' },
    );
    enableBrowserGlyphProjection(state.nhDisplay);
    await flush_screen(1);
    assert.deepEqual(
        state.nhDisplay.grid[5][6],
        { ch: '☂', color: CLR_RED, attr: ATR_NONE },
    );

    state = makeState(false);
    const pet = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        mtame: 10,
        minvis: false,
        mundetected: false,
        m_ap_type: 0,
        mx: 7,
        my: 4,
    };
    state.level.monsters[7][4] = pet;
    assert.deepEqual(monster_glyph_info(pet, state), {
        ch: null,
        color: CLR_WHITE,
        dec: false,
        displayCh: '☃',
    });
    newsym(7, 4);
    assert.deepEqual(
        {
            ch: state.level.at(7, 4).disp_ch,
            color: state.level.at(7, 4).disp_color,
            attr: state.level.at(7, 4).disp_attr,
            browserCh: state.level.at(7, 4).disp_browser_ch,
        },
        { ch: ' ', color: NO_COLOR, attr: ATR_NONE, browserCh: '☃' },
    );
    enableBrowserGlyphProjection(state.nhDisplay);
    await flush_screen(1);
    assert.deepEqual(
        state.nhDisplay.grid[5][6],
        { ch: '☃', color: CLR_WHITE, attr: ATR_NONE },
    );

    state.iflags.customsymbols = false;
    assert.deepEqual(hero_glyph_info(state), {
        ch: '@', color: CLR_RED, dec: false,
    });
    assert.deepEqual(monster_glyph_info(pet, state), {
        ch: 'f', color: CLR_WHITE, dec: false,
    });
});

// C ref: win/tty/wintty.c tty_print_glyph() (3923-3937), whose second arm is
// MG_PET under iflags.hilite_pet and whose third is ATR_INVERSE under
// iflags.use_inverse. A glyph matches at most one arm, and the first match
// wins, so which attribute a female pet shows is a question about order.
test('monster glyphs run the tty attribute chain in source order', () => {
    const state = {
        flags: {},
        iflags: {
            wc_color: true,
            wc_hilite_pet: true,
            // ATR_BOLD rather than the compiled-in ATR_INVERSE, so that the
            // two arms can be told apart by the attribute each leaves.
            wc2_petattr: ATR_BOLD,
        },
    };
    initialize_symbols_from_options({ flags: {} }, state);
    const monster = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        mtame: 0,
        // display.h mon_to_glyph() (554-556) reads mon->female to pick the
        // male or female half of the monster range; 0 is the male half, which
        // reset_glyphmap() (3058-3065) marks MG_MALE and no arm reads.
        female: 0,
        m_ap_type: 0,
    };

    assert.equal(monster_glyph_info(monster, state).attr, undefined);
    monster.mtame = 10;
    assert.equal(monster_glyph_info(monster, state).attr, ATR_BOLD);
    state.iflags.wc_hilite_pet = false;
    assert.equal(monster_glyph_info(monster, state).attr, undefined);

    // A female pet raises MG_PET and MG_FEMALE together, so it can match both
    // arms; 'hilite_pet' decides which. iflags.wizmgender is set_wizonly, so
    // tty_print_glyph() (3930) tests `wizard` beside the option.
    monster.female = 1;
    state.wizard = true;
    state.iflags.wizmgender = true;
    assert.equal(monster_glyph_info(monster, state).attr, ATR_INVERSE);
    state.iflags.wc_hilite_pet = true;
    assert.equal(monster_glyph_info(monster, state).attr, ATR_BOLD);

    // The inverse arm as a whole sits behind iflags.use_inverse; the pet arm
    // above it does not.
    state.iflags.wc_hilite_pet = false;
    state.iflags.wc_inverse = false;
    assert.equal(monster_glyph_info(monster, state).attr, undefined);
    state.iflags.wc_hilite_pet = true;
    assert.equal(monster_glyph_info(monster, state).attr, ATR_BOLD);

    // Both halves of tty_print_glyph()'s MG_FEMALE conjunct are required: a
    // debug game with the option off, and an ordinary game with it on, each
    // leave a female monster plain.
    state.iflags.wc_inverse = true;
    state.iflags.wc_hilite_pet = false;
    monster.mtame = 0;
    state.iflags.wizmgender = false;
    assert.equal(monster_glyph_info(monster, state).attr, undefined);
    state.iflags.wizmgender = true;
    state.wizard = false;
    assert.equal(monster_glyph_info(monster, state).attr, undefined);
    state.wizard = true;
    assert.equal(monster_glyph_info(monster, state).attr, ATR_INVERSE);
});

// C ref: display.h hero_glyph (654-656), which passes you.h:555's Ugender to
// monnum_to_glyph(). The hero's square carries an ordinary monster glyph, so
// reset_glyphmap()'s two GLYPH_MON arms give it MG_FEMALE or MG_MALE from
// that value rather than from any mon->female.
test("the hero's own glyph takes its gender bit from Ugender", () => {
    const state = {
        // umonnum equal to umonster is you.h:554's !Upolyd, where Ugender
        // reads flags.female rather than u.mfemale.
        u: { umonnum: 0, umonster: 0, mfemale: true },
        flags: { female: false },
        iflags: { wc_color: true, wizmgender: true },
        wizard: true,
        mons: [{ mlet: S_HUMAN, mcolor: CLR_RED }],
    };
    initialize_symbols_from_options({ flags: {} }, state);

    assert.equal(hero_glyph_info(state).attr, undefined);
    state.flags.female = true;
    assert.equal(hero_glyph_info(state).attr, ATR_INVERSE);
    // Polymorphed, Ugender reads u.mfemale instead, and this hero's form is
    // female while she is not.
    state.flags.female = false;
    state.u.umonnum = 1;
    // The form's colour must differ from HI_DOMESTIC, which js/const.js:2424
    // defines as CLR_WHITE: the species and colour halves of hero_glyph are
    // two separate tests of the same disjunct, and a form coloured white
    // would leave the colour half unable to separate them.
    state.mons.push({ mlet: S_FELINE, mcolor: CLR_RED });
    assert.equal(hero_glyph_info(state).attr, ATR_INVERSE);

    // display.h hero_glyph's species half is
    // (Upolyd || !flags.showrace) ? u.umonnum : gu.urace.mnum, so the
    // polymorph disjunct outranks the option: a polymorphed hero shows her
    // form even with 'showrace' on. Without the disjunct she would show her
    // race's letter in HI_DOMESTIC instead, which is what the option alone
    // selects.
    state.urace = { mnum: 0 };
    state.flags.showrace = true;
    const polymorphed = hero_glyph_info(state);
    assert.equal(polymorphed.ch, monster_class_symbol(S_FELINE, state).ch);
    // Back in her own form the option decides again, and she takes the race's
    // letter in HI_DOMESTIC. Both halves are asserted, because the species
    // and the colour read the disjunct separately.
    state.u.umonnum = state.u.umonster;
    const ownForm = hero_glyph_info(state);
    assert.equal(ownForm.ch, monster_class_symbol(S_HUMAN, state).ch);
    assert.notEqual(ownForm.color, polymorphed.color);
});

// C refs: display.c display_monster():524, which reads mgendercode from the
// *mimicking* monster, and :578-581, which passes it to monnum_to_glyph()
// beside the appearance's species. The two halves of a disguised glyph
// therefore come from two different monsters.
test('a monster disguise shows the mimic gender, not the appearance one',
    () => {
        const state = visibleCellState();
        state.wizard = true;
        state.iflags = { wc_color: true, wizmgender: true };
        const monster = {
            data: state.mons[PM_TENGU],
            mtame: 0,
            female: 1,
            m_ap_type: M_AP_MONSTER,
            mappearance: PM_GOBLIN,
            mx: 7,
            my: 4,
        };
        assert.equal(monster_glyph_info(monster, state).attr, ATR_INVERSE);
        monster.female = 0;
        assert.equal(monster_glyph_info(monster, state).attr, undefined);
    });

// C refs: display.h maybe_display_usteed() (246-249) and ridden_mon_to_glyph()
// (560-562), resolved by display.c reset_glyphmap()'s two ridden arms
// (2986-3003), which raise MG_RIDDEN beside the gender bit. MG_RIDDEN reaches
// no arm of tty_print_glyph()'s chain, so a mount is highlighted by its own
// gender and never by 'hilite_pet', tame though every mount is.
test('a ridden mount takes its gender bit and no pet highlight', () => {
    const state = visibleCellState({ ux: 7, uy: 4 });
    state.wizard = true;
    state.iflags = {
        wc_color: true,
        wizmgender: true,
        wc_hilite_pet: true,
        // Distinct from ATR_INVERSE so that a mount wrongly routed through the
        // pet arm would show this instead.
        wc2_petattr: ATR_BOLD,
    };
    // Monster row 3 is arbitrary: any row gives the mount a symbol to draw.
    state.u.usteed = {
        data: state.mons[3],
        mtame: 10,
        female: 1,
        minvis: false,
        mundetected: false,
        mx: 7,
        my: 4,
    };

    newsym(7, 4);
    assert.equal(state.level.at(7, 4).disp_attr, ATR_INVERSE);
    state.u.usteed.female = 0;
    newsym(7, 4);
    assert.equal(state.level.at(7, 4).disp_attr, ATR_NONE);
});

// C ref: display.h statue_to_glyph() (950-964), its Hallucination arm (951-953):
// random_monster(rng) + (!(rng)(2) ? GLYPH_MON_MALE_OFF : GLYPH_MON_FEM_OFF).
// The species draw comes first and the gender draw second, and the pair build
// an ordinary monster glyph rather than either statue glyph, so
// reset_glyphmap()'s GLYPH_MON_FEM arm (3050-3057) is what marks it MG_FEMALE.
test('a hallucinated statue takes its gender from the second display draw',
    () => {
        const state = visibleCellState();
        state.wizard = true;
        // hilite_pet and its attribute are set so the synthetic monster's
        // mtame: 0 is observed rather than assumed: C's chain takes the pet
        // arm above the gender one, so a draw that treated this as a pet
        // would answer ATR_BOLD here instead of ATR_INVERSE.
        state.iflags = {
            wc_color: true,
            wizmgender: true,
            wc_hilite_pet: true,
            wc2_petattr: ATR_BOLD,
        };
        const scripted = (values) => {
            let index = 0;
            return () => values[index++];
        };
        // Monster row 3 is arbitrary: every row leaves the gender to the
        // second draw, which is the one under test.
        assert.equal(
            hallucinated_statue_glyph_info(state, scripted([3, 0])).attr,
            undefined,
        );
        assert.equal(
            hallucinated_statue_glyph_info(state, scripted([3, 1])).attr,
            ATR_INVERSE,
        );
    });

test('object glyphs apply tty pile highlighting with the source boulder rule', () => {
    const state = visibleCellState();
    const x = 7;
    const y = 4;
    state.iflags = {
        wc_color: true,
        wc_inverse: true,
        hilite_pile: true,
    };
    const lower = { otyp: SPEAR };
    const top = {
        otyp: ARROW,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        nexthere: lower,
    };
    state.level.objects[x][y] = top;

    assert.equal(object_glyph_info(top, state).attr, ATR_INVERSE);

    state.iflags.hilite_pile = false;
    assert.equal(object_glyph_info(top, state).attr, undefined);
    state.iflags.hilite_pile = true;
    state.iflags.wc_inverse = false;
    assert.equal(object_glyph_info(top, state).attr, undefined);

    state.iflags.wc_inverse = true;
    top.otyp = BOULDER;
    assert.equal(object_glyph_info(top, state).attr, undefined);
    lower.otyp = BOULDER;
    assert.equal(object_glyph_info(top, state).attr, ATR_INVERSE);

    top.where = 0;
    assert.equal(object_glyph_info(top, state).attr, undefined);
});

test('each object glyph macro picks the base display.h gives it', () => {
    const state = visibleCellState();
    const x = 7;
    const y = 4;
    // obj_is_piletop() reads the head of the square's object list, so the
    // object under test becomes that head and carries a second object behind
    // it. SPEAR is an arbitrary non-boulder filler: the boulder rule at
    // display.h:798-804 is covered by the test above.
    const placed = (obj, piletop) => {
        const object = {
            ...obj,
            where: OBJ_FLOOR,
            ox: x,
            oy: y,
            nexthere: piletop ? { otyp: SPEAR } : null,
        };
        state.level.objects[x][y] = object;
        return object;
    };
    // corpsenm 0 is the first monster row; any row separates the two bases,
    // which is all these cases measure.
    const corpsenm = 0;

    // display.h corpse_to_glyph() (937-939) and generic_obj_to_glyph()
    // (940-942) each choose between a plain base and a pile-top base. Without
    // the pair, dropping either pile-top base leaves the whole suite green,
    // and a remembered corpse or unseen potion on a pile silently loses the
    // MG_OBJPILE that a 'hilite_pile' toggle is supposed to give it.
    assert.equal(
        corpse_to_glyph(placed({ otyp: CORPSE, corpsenm }, false), state),
        corpsenm + GLYPH_BODY_OFF,
    );
    assert.equal(
        corpse_to_glyph(placed({ otyp: CORPSE, corpsenm }, true), state),
        corpsenm + GLYPH_BODY_PILETOP_OFF,
    );
    assert.equal(
        generic_obj_to_glyph(
            placed({ otyp: POT_BOOZE, oclass: POTION_CLASS }, false), state,
        ),
        POTION_CLASS + GLYPH_OBJ_OFF,
    );
    assert.equal(
        generic_obj_to_glyph(
            placed({ otyp: POT_BOOZE, oclass: POTION_CLASS }, true), state,
        ),
        POTION_CLASS + GLYPH_OBJ_PILETOP_OFF,
    );

    // display.h statue_to_glyph() (950-961), its !Hallucination arm: gender
    // crossed with pile-top, four distinct bases. `spe` carries the gender in
    // its CORPSTAT_GENDER bits, and only CORPSTAT_FEMALE selects the female
    // ranges -- CORPSTAT_MALE and an unset `spe` both take the male one.
    const statueCases = [
        [CORPSTAT_FEMALE, false, GLYPH_STATUE_FEM_OFF],
        [CORPSTAT_FEMALE, true, GLYPH_STATUE_FEM_PILETOP_OFF],
        [CORPSTAT_MALE, false, GLYPH_STATUE_MALE_OFF],
        [CORPSTAT_MALE, true, GLYPH_STATUE_MALE_PILETOP_OFF],
        [0, false, GLYPH_STATUE_MALE_OFF],
    ];
    for (const [spe, piletop, base] of statueCases) {
        assert.equal(
            statue_to_glyph(
                placed({ otyp: STATUE, corpsenm, spe }, piletop), state,
            ),
            corpsenm + base,
            `statue spe ${spe} piletop ${piletop}`,
        );
    }

    // display.h objnum_to_glyph() (638) has no consumer in the running game:
    // botl.c's encglyph(objnum_to_glyph(GOLD_PIECE)) is unported, so this is
    // the only proof of its value. It adds the plain object base and asks
    // obj_is_piletop() nothing, which is why C's own comment says it draws
    // the generic body and the generic statue rather than the species the
    // corpse and statue ranges carry.
    assert.equal(objnum_to_glyph(STRANGE_OBJECT), GLYPH_OBJ_OFF);
    for (const otyp of [CORPSE, STATUE]) {
        const glyph = objnum_to_glyph(otyp);
        assert.equal(glyph, otyp + GLYPH_OBJ_OFF, `objnum ${otyp}`);
        assert.equal(glyph_is_normal_object(glyph), true, `normal ${otyp}`);
        assert.equal(glyph_is_body(glyph), false, `body ${otyp}`);
        assert.equal(glyph_is_statue(glyph), false, `statue ${otyp}`);
    }

    // The two exported entry points into the range predicates refuse anything
    // that is not a number. Both took a map location before this port stored
    // one, and both would otherwise answer a plain `false` for one, since
    // every comparison against an object is false -- the wrong answer rather
    // than a missing one.
    for (const wrong of [{}, state.level.at(x, y), 'abc', null]) {
        assert.throws(() => glyph_is_object(wrong), TypeError);
        assert.throws(() => glyph_is_generic_object(wrong), TypeError);
    }
    // `undefined` is the square the hero remembers nothing of, which answers
    // no rather than throwing, as C's GLYPH_UNEXPLORED does.
    assert.equal(glyph_is_object(undefined), false);
    assert.equal(glyph_is_generic_object(undefined), false);
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
    // display.c reset_glyphmap()'s object arm reads objects[offset].oc_class
    // for the symbol and objects[offset].oc_color for the colour, both keyed
    // by the glyph number's offset rather than by the object.
    state.objects[42] = { oc_class: WEAPON_CLASS, oc_color: CLR_YELLOW };
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
    // display.h normal_obj_to_glyph(): map memory records the object's glyph
    // number, not the monster standing over it, and nothing else -- the ')'
    // and the colour below are re-derived from that number at each draw.
    assert.deepEqual(state.level.at(x, y).remembered_glyph, {
        glyph: GLYPH_OBJ_OFF + 42,
    });

    state.level.monsters[x][y] = null;
    state.u.ux = x;
    state.u.uy = y;
    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, '@');
    assert.equal(
        state.level.at(x, y).remembered_glyph.glyph, GLYPH_OBJ_OFF + 42,
    );
    assert.deepEqual(object_glyph_info(weapon, state), {
        ch: ')',
        color: CLR_YELLOW,
        dec: false,
    });
    assert.deepEqual(
        remembered_glyph_presentation(
            state.level.at(x, y).remembered_glyph, state,
        ),
        { ch: ')', color: CLR_YELLOW, dec: false },
    );
});

// C ref: display.c feel_newsym(). The two arms do different work, not the same
// work by two routes: feel_location() records a tactile viewing vector and
// draws the terrain, while newsym() draws whatever occupies the square. Only
// the sighted arm is live -- js/hack.js refuses a blind hero before lock.c's
// autoopen pull reaches it -- so nothing in the running game tells them apart.
test('feel_newsym draws the occupant when sighted and the terrain when blind',
    () => {
        const state = resetGame();
        // An interior square with the hero one step west: feel_location()'s
        // obstacle subset accepts only an adjacent square.
        const x = 7;
        const y = 4;
        state.level = new GameMap();
        state.level.at(x, y).typ = ROOM;
        state.u = { ux: x - 1, uy: y, umonnum: 0, uprops: [] };
        state.urace = { mnum: 0 };
        // options.c optlist.h gives 'dark_room' the initial value TRUE and
        // 'color' is on by default, which is the pair feel_location()'s tail
        // at display.c:894-897 reads.
        state.flags = { dark_room: true };
        // engrave.c can_reach_floor(), which feel_location() consults before
        // it feels anything, reads the hero's form: no flags, medium size
        // (monst.h MZ_MEDIUM), no attacks. u_init.c:275 builds the real one.
        state.youmonst = { data: { mflags1: 0, msize: 2, mattk: [] } };
        state.mons = [{ mlet: S_HUMAN, mcolor: CLR_RED }];
        state.objects = [];
        initialize_symbols_from_options({ flags: {} }, state);
        state.viz_array = [];
        state.viz_array[y] = [];
        state.viz_array[y][x] = 0x2; // vision.h IN_SIGHT
        state.level.monsters[x][y] = {
            data: { mlet: S_FELINE, mcolor: CLR_WHITE },
            mtame: 10,
            minvis: false,
            mundetected: false,
            mx: x,
            my: y,
        };

        feel_newsym(x, y, state);
        assert.equal(state.level.at(x, y).disp_ch, 'f');
        // newsym() records no viewing vector; only the blind arm does.
        assert.equal(state.level.at(x, y).seenv ?? 0, 0);

        state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
        feel_newsym(x, y, state);
        // The blind hero feels floor, not the cat standing on it. The symbol
        // is still S_room's byte: this state never ran reglyph_darkroom(), so
        // showsyms[S_darkroom] is still defsym.h:113's own '.'.
        assert.equal(state.level.at(x, y).disp_ch, '.');
        // display.c:894-897. The square is ROOM and unlit, so map memory moves
        // off S_room whatever 'dark_room' says; with it on, to S_darkroom.
        assert.equal(
        glyph_to_cmap(state.level.at(x, y).remembered_glyph.glyph),
        S_darkroom,
    );
        // display.c seenv_matrix[1 - dy][dx + 1] for a step due east.
        assert.equal(state.level.at(x, y).seenv, 0x80);

        // With 'dark_room' off the same square becomes S_stone, which draws a
        // space rather than a floor symbol.
        state.flags.dark_room = false;
        state.level.at(x, y).remembered_glyph = null;
        newsym(x, y);
        feel_newsym(x, y, state);
        assert.equal(
        glyph_to_cmap(state.level.at(x, y).remembered_glyph.glyph),
        S_stone,
    );
        assert.equal(state.level.at(x, y).disp_ch, ' ');
    });

// A hero standing one step west of <x,y>, blind, on her own feet, with
// 'dark_room' and colour on: the state display.c feel_location()'s
// reachable-floor branch needs, minus whatever the square itself holds.
function feelingHeroBeside(x, y) {
    const state = resetGame();
    state.level = new GameMap();
    state.u = {
        ux: x - 1,
        uy: y,
        umonnum: 0,
        uprops: [],
    };
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.urace = { mnum: 0 };
    state.flags = { dark_room: true };
    // engrave.c can_reach_floor() reads the hero's form: no flags, medium
    // size (monst.h MZ_MEDIUM), no attacks.
    state.youmonst = { data: { mflags1: 0, msize: 2, mattk: [] } };
    state.mons = [{ mlet: S_HUMAN, mcolor: CLR_RED }];
    state.objects = [];
    initialize_symbols_from_options({ flags: {} }, state);
    return state;
}

test('feel_location darkens a remembered lit corridor', () => {
    // display.c:898-900, the second arm of the same tail. A corridor
    // remembered as lit but recorded as never permanently lit goes back to
    // the dark corridor symbol.
    const x = 7;
    const y = 4;
    const state = feelingHeroBeside(x, y);
    const corridor = state.level.at(x, y);
    corridor.typ = CORR;
    corridor.waslit = false;
    state.flags.lit_corridor = true; // makes back_to_glyph() answer S_litcorr
    feel_location(x, y, state);
    assert.equal(glyph_to_cmap(corridor.remembered_glyph.glyph), S_corr);
    assert.equal(corridor.disp_ch, cmap_symbol(S_corr, state).ch);

    // A corridor the hero has seen lit keeps the lit symbol, because C's
    // condition is `!lev->waslit`.
    corridor.waslit = true;
    corridor.remembered_glyph = null;
    feel_location(x, y, state);
    assert.equal(glyph_to_cmap(corridor.remembered_glyph.glyph), S_litcorr);
});

// display.c map_invisible() (377-385) with the GLYPH_INVIS_OFF arm of
// reset_glyphmap() (3029-3035) that lets its number round-trip through map
// memory. defsym.h:336 gives SYM_INVISIBLE the byte 'I'; invis_color()
// (display.c:2687) is `color = NO_COLOR`.
test('map_invisible remembers and draws the invisible-monster marker', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y });
    const location = state.level.at(x, y);

    map_invisible(x, y, state);
    assert.equal(location.remembered_glyph.glyph, GLYPH_INVISIBLE);
    assert.equal(glyph_is_invisible(location.remembered_glyph.glyph), true);
    assert.equal(location.disp_ch, 'I');
    assert.equal(location.disp_color, NO_COLOR);

    // MG_INVIS raises no attribute in tty_print_glyph()'s chain
    // (wintty.c:3923-3937 tests MG_PET, MG_OBJPILE, MG_FEMALE and the
    // MG_DETECT group, and no arm names MG_INVIS), so the marker prints plain
    // with every highlighting option on. MG_DETECT or MG_OBJPILE in its place
    // would answer ATR_INVERSE here.
    state.wizard = true;
    state.iflags = {
        ...state.iflags,
        hilite_pile: true,
        wizmgender: true,
        wc_hilite_pet: true,
    };
    map_invisible(x, y, state);
    assert.equal(location.disp_attr, 0);
});

test('map_invisible declines the hero square and gates only memory', () => {
    const x = 7;
    const y = 4;
    // The hero standing on the very square the marker would go to.
    const state = visibleCellState({ x, y, ux: x, uy: y });
    const location = state.level.at(x, y);

    // display.c:379, "don't display I at hero's location": neither half runs.
    location.disp_ch = null;
    map_invisible(x, y, state);
    assert.equal(location.remembered_glyph, undefined);
    assert.equal(location.disp_ch, null);

    // display.c:380-382. hero_memory gates the memory write alone, so the
    // draw at 383 still happens with it off. No ported path clears the flag,
    // which is why this is pinned here rather than by a recording.
    state.u.ux = x - 1;
    state.level.flags.hero_memory = false;
    map_invisible(x, y, state);
    assert.equal(location.remembered_glyph, undefined);
    assert.equal(location.disp_ch, 'I');
});

test('newsym re-asserts a remembered marker instead of the floor under it',
    () => {
    // display.c:1032-1033. A visible square with no monster on it whose
    // memory already holds the marker keeps the marker; without the arm the
    // layer choice would put the room floor back on the next repaint.
    const x = 7;
    const y = 4;
    // The hero shares this square's row and neither its column nor its square,
    // so C's `x != u.ux || y != u.uy` guard inside map_invisible() answers
    // "not the hero's square" on one coordinate rather than on both.
    const state = visibleCellState({ x, y, ux: 1, uy: y });
    const location = state.level.at(x, y);
    state.viz_array[y][x] = IN_SIGHT;

    newsym(x, y);
    const floor = location.remembered_glyph.glyph;
    assert.equal(glyph_is_invisible(floor), false);

    map_invisible(x, y, state);
    newsym(x, y);
    assert.equal(location.remembered_glyph.glyph, GLYPH_INVISIBLE);
    assert.equal(location.disp_ch, 'I');

    // The same square out of sight draws its memory, which is still the
    // marker: newsym()'s unsighted arm resolves the remembered number.
    state.viz_array[y][x] = 0;
    location.disp_ch = null;
    newsym(x, y);
    assert.equal(location.remembered_glyph.glyph, GLYPH_INVISIBLE);
    assert.equal(location.disp_ch, 'I');
});

test('the marker arm yields to a monster and to the hero', () => {
    // display.c:1013-1035 is a four-arm chain, and the marker is its third
    // arm. Every guard that decides which arm a square takes is read here,
    // because the row above passes with any of them deleted. The state each
    // row sets is the ordinary one: mhitm.c pre_mm_attack() writes the marker
    // onto the square a monster is standing on, so "marker and monster
    // together" is the follow-up state rather than a corner.
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: x - 1, uy: y });
    const location = state.level.at(x, y);
    state.viz_array[y][x] = IN_SIGHT;

    newsym(x, y);
    const floor = location.remembered_glyph.glyph;

    // A monster the hero can spot takes the first arm. display.c
    // show_mon_or_warn() (486-493) clears the marker before drawing on the
    // monster layer, so the memory comes back from the layers.
    map_invisible(x, y, state);
    state.level.monsters[x][y] = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        m_ap_type: 0,
        minvis: false,
        mundetected: false,
        mx: x,
        my: y,
    };
    newsym(x, y);
    assert.equal(location.disp_ch, 'f');
    assert.equal(location.remembered_glyph.glyph, floor);

    // The hero's own square takes C's `if (u_at(x, y))` arm above the chain.
    // map_invisible() declines to write the hero's square, so the marker is
    // planted directly to prove the arm is not taken rather than the write.
    state.level.monsters[x][y] = null;
    location.remembered_glyph = { glyph: GLYPH_INVISIBLE };
    state.u.ux = x;
    state.u.uy = y;
    newsym(x, y);
    assert.notEqual(location.disp_ch, 'I');
    assert.equal(location.remembered_glyph.glyph, floor);
});

test('unmap_invisible clears a remembered marker and repaints the square',
    () => {
    // display.c unmap_invisible() (387-396). The FALSE arm answers for a
    // square that holds no marker and for one off the map; the TRUE arm is
    // `unmap_object(x, y); newsym(x, y); return TRUE;`.
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y });
    const location = state.level.at(x, y);
    state.viz_array[y][x] = IN_SIGHT;

    assert.equal(unmap_invisible(x, y, state), false);
    assert.equal(unmap_invisible(-1, y, state), false);

    newsym(x, y);
    const floor = location.remembered_glyph.glyph;
    map_invisible(x, y, state);
    assert.equal(unmap_invisible(x, y, state), true);
    assert.equal(location.remembered_glyph.glyph, floor);
    assert.equal(location.disp_ch, cmap_symbol(S_room, state).ch);
    // Clearing it twice is a no-op: the second call finds no marker.
    assert.equal(unmap_invisible(x, y, state), false);
});

test('feel_location leaves an accurate marker over a monster alone', () => {
    // display.c:763-767. The hero feels the square her pet is standing on and
    // whose memory already holds the marker; C returns before set_seenv() so
    // that searching does not rediscover the monster every turn.
    const x = 7;
    const y = 4;
    const state = feelingHeroBeside(x, y);
    const location = state.level.at(x, y);
    location.typ = ROOM;
    location.remembered_glyph = { glyph: GLYPH_INVISIBLE };
    state.level.monsters[x][y] = {
        mx: x, my: y, mhp: 3, data: { mlet: S_HUMAN, mflags1: 0 },
    };

    feel_location(x, y, state);
    assert.equal(location.remembered_glyph.glyph, GLYPH_INVISIBLE);
    assert.equal(location.seenv ?? 0, 0);

    // Remove the monster and the same square is felt normally: C's condition
    // is a conjunction, so the marker alone does not stop it.
    state.level.monsters[x][y] = null;
    feel_location(x, y, state);
    assert.equal(glyph_is_invisible(location.remembered_glyph.glyph), false);
    assert.notEqual(location.seenv ?? 0, 0);
});

// display.c newsym() corrects map memory only on the pass where the square is
// out of sight, so every case below needs a sighted pass to lay the memory
// down and an unsighted one to correct it. newsym() reads the module-global
// game, which resetGame() inside visibleCellState() has just made current.
function seeThenLoseSight(x, y, state) {
    state.viz_array[y][x] = IN_SIGHT;
    newsym(x, y);
    state.viz_array[y][x] = 0;
    newsym(x, y);
}

test('newsym darkens a remembered lit corridor once it leaves sight', () => {
    // display.c:1086-1089. 'lit_corridor' makes back_to_glyph()
    // (display.c:2302) answer S_litcorr for a corridor square in sight; the
    // pass where the same square is out of sight puts S_corr back.
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y });
    const corridor = state.level.at(x, y);
    corridor.typ = CORR;
    corridor.lit = false; // never permanently lit, so waslit stays false
    state.flags.lit_corridor = true;

    newsym(x, y);
    assert.equal(glyph_to_cmap(corridor.remembered_glyph.glyph), S_litcorr);
    // defsym.h:116-117 colours both corridor cmaps CLR_GRAY, so
    // reset_glyphmap() (display.c:2938-2940) recolours the lit one to
    // CLR_WHITE while the two draw the same byte.
    assert.equal(corridor.disp_color, CLR_WHITE);

    state.viz_array[y][x] = 0;
    newsym(x, y);
    assert.equal(glyph_to_cmap(corridor.remembered_glyph.glyph), S_corr);
    // recorderMapColor() folds S_corr's CLR_GRAY onto the terminal default.
    assert.equal(corridor.disp_color, NO_COLOR);
    assert.equal(corridor.disp_ch, cmap_symbol(S_corr, state).ch);

    // C's outer condition is `!lev->waslit || (flags.dark_room &&
    // iflags.use_color)`. A corridor the hero saw permanently lit keeps the
    // lit symbol while either half of that pair is off.
    corridor.lit = true;
    state.flags.dark_room = false;
    state.iflags = { ...state.iflags, wc_color: true };
    seeThenLoseSight(x, y, state);
    assert.equal(corridor.waslit, true);
    assert.equal(glyph_to_cmap(corridor.remembered_glyph.glyph), S_litcorr);

    state.flags.dark_room = true;
    state.iflags = { ...state.iflags, wc_color: false };
    seeThenLoseSight(x, y, state);
    assert.equal(glyph_to_cmap(corridor.remembered_glyph.glyph), S_litcorr);

    // Both halves on, and the same square darkens despite waslit.
    state.iflags = { ...state.iflags, wc_color: true };
    seeThenLoseSight(x, y, state);
    assert.equal(glyph_to_cmap(corridor.remembered_glyph.glyph), S_corr);
});

test('newsym replaces a remembered room floor with DARKROOMSYM', () => {
    // display.c:1090-1092. sym.h:96 resolves DARKROOMSYM to S_darkroom off
    // the rogue level, which is the only place this arm runs: the rogue arm
    // above it uses S_stone instead.
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y }); // typ is already ROOM
    const room = state.level.at(x, y);
    room.lit = true;
    state.flags.dark_room = true;
    state.iflags = { ...state.iflags, wc_color: true };

    newsym(x, y);
    assert.equal(glyph_to_cmap(room.remembered_glyph.glyph), S_room);
    state.viz_array[y][x] = 0;
    newsym(x, y);
    assert.equal(glyph_to_cmap(room.remembered_glyph.glyph), S_darkroom);
    // reglyph_darkroom() has not run over this state, so S_darkroom still
    // carries defsym.h:114's own byte; only the cmap index is asserted here.
    // The pair drawing alike is scripts/display-symbols.test.mjs's
    // 'reglyph_darkroom points S_darkroom at S_room or at nothing'.

    // 'dark_room' off leaves a room square the hero saw lit alone, because
    // the outer condition's other half, `!lev->waslit`, is false too.
    state.flags.dark_room = false;
    seeThenLoseSight(x, y, state);
    assert.equal(room.waslit, true);
    assert.equal(glyph_to_cmap(room.remembered_glyph.glyph), S_room);

    // An unlit room square passes `!lev->waslit` and darkens with
    // 'dark_room' still off.
    room.lit = false;
    seeThenLoseSight(x, y, state);
    assert.equal(room.waslit, false);
    assert.equal(glyph_to_cmap(room.remembered_glyph.glyph), S_darkroom);
});

test('newsym uses the rogue level pair of darkening rules', () => {
    // display.c:1078-1085. The rogue level has no dark part of a room: an
    // unlit room square becomes S_stone, and a room square the hero saw lit
    // is left alone however 'dark_room' and colour stand.
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y });
    // visibleCellState() puts the hero on dungeon level 1 of dnum 0.
    state.rogue_level = { dnum: 0, dlevel: 1 };
    state.flags.dark_room = true;
    state.iflags = { ...state.iflags, wc_color: true };
    const square = state.level.at(x, y);

    square.lit = false;
    seeThenLoseSight(x, y, state);
    assert.equal(glyph_to_cmap(square.remembered_glyph.glyph), S_stone);

    square.lit = true;
    seeThenLoseSight(x, y, state);
    assert.equal(glyph_to_cmap(square.remembered_glyph.glyph), S_room);

    // The corridor half is the same on both levels.
    square.typ = CORR;
    square.lit = false;
    state.flags.lit_corridor = true;
    seeThenLoseSight(x, y, state);
    assert.equal(glyph_to_cmap(square.remembered_glyph.glyph), S_corr);

    // Both halves of `lev->glyph == cmap_to_glyph(S_litcorr) && lev->typ ==
    // CORR` are load-bearing. A corridor square the hero remembers an object
    // on satisfies the second and fails the first, and C leaves that memory
    // alone: only a square remembered as a lit corridor is corrected.
    state.level.objects[x][y] = { otyp: SPEAR, oclass: WEAPON_CLASS };
    seeThenLoseSight(x, y, state);
    assert.equal(glyph_is_object(square.remembered_glyph.glyph), true);
    assert.equal(
        square.remembered_glyph.glyph,
        normal_obj_to_glyph(state.level.objects[x][y], state),
    );
});

test('feel_location stops on a sensed monster and a distant square', () => {
    const x = 7;
    const y = 4;
    const state = feelingHeroBeside(x, y);
    state.level.at(x, y).typ = ROOM;
    // display.c:902-905 finishes with display_monster() for a monster the
    // hero senses. Detect_monsters is the cheapest of sensemon()'s operands.
    state.level.monsters[x][y] = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE, mflags1: 0 },
        mx: x,
        my: y,
        minvis: false,
        mundetected: false,
    };
    state.u.uprops[DETECT_MONSTERS] = {
        intrinsic: 0, extrinsic: 1, blocked: 0,
    };
    // C runs this test last, after set_seenv(), _map_location() and the
    // dark-room rewrite; the port hoists it above all three so the stop
    // leaves the map exactly as it found it. Nothing else holds the hoist in
    // place, so the square is read back here field by field. `seenv`,
    // `remembered_glyph` and `lastseentyp` are the three map-memory writes,
    // and `disp_ch` is the drawn cell a show_glyph_cell() below the guard
    // would have painted.
    const square = state.level.at(x, y);
    const rememberedBefore = square.remembered_glyph ?? null;
    const cellBefore = {
        seenv: square.seenv ?? null,
        disp_ch: square.disp_ch ?? null,
        disp_color: square.disp_color ?? null,
        lastseentyp: state.level.lastseentyp?.[x]?.[y] ?? null,
    };
    assert.throws(
        () => feel_location(x, y, state),
        UnsupportedMapMemoryError,
    );
    // Compared by identity: every map-memory write replaces the record with a
    // fresh object, so a surviving reference means no write happened.
    assert.equal(square.remembered_glyph ?? null, rememberedBefore);
    assert.deepEqual({
        seenv: square.seenv ?? null,
        disp_ch: square.disp_ch ?? null,
        disp_color: square.disp_color ?? null,
        lastseentyp: state.level.lastseentyp?.[x]?.[y] ?? null,
    }, cellBefore);

    // Without the sensing the same square is felt normally.
    state.u.uprops[DETECT_MONSTERS] = {
        intrinsic: 0, extrinsic: 0, blocked: 0,
    };
    feel_location(x, y, state);
    assert.equal(
        glyph_to_cmap(state.level.at(x, y).remembered_glyph.glyph),
        S_darkroom,
    );

    // C's comment restricts the square to the hero's own or one adjacent to
    // it; this port asserts that rather than assuming it.
    assert.throws(() => feel_location(x + 2, y, state), /adjacent square/);
});

test('reglyph_darkroom points S_darkroom at S_room or at nothing', () => {
    // display.c:1850-1853. The tail is what makes a dark room square draw the
    // same byte as a lit one, and options.c initoptions_finish():7347 is where
    // it first runs -- before any level exists, which is why the repair-loop
    // refusal asks for a level first.
    const state = resetGame();
    state.flags = { dark_room: true };
    state.iflags = { ...(state.iflags ?? {}), wc_color: true };
    initialize_symbols_from_options({ flags: {} }, state);
    // defsym.h:113 gives S_darkroom its own '.', which is not what C draws.
    assert.equal(state.gs.showsyms[S_darkroom], '.'.charCodeAt(0));
    reglyph_darkroom(state);
    assert.equal(state.gs.showsyms[S_darkroom], state.gs.showsyms[S_room]);

    // With either option off C points it at the SYM_NOTHING byte instead.
    state.flags.dark_room = false;
    reglyph_darkroom(state);
    assert.equal(
        state.gs.showsyms[S_darkroom],
        state.gs.showsyms[SYM_OFF_X + SYM_NOTHING],
    );

    // Once a level exists the repair loop has squares to walk, and the tail
    // still runs after it under either option value.
    state.level = new GameMap();
    state.u = { ...state.u, ux: 1, uy: 1, uz: { dnum: 0, dlevel: 1 } };
    state.viz_array = [];
    reglyph_darkroom(state);
    assert.equal(
        state.gs.showsyms[S_darkroom],
        state.gs.showsyms[SYM_OFF_X + SYM_NOTHING],
    );
    state.flags.dark_room = true;
    reglyph_darkroom(state);
    assert.equal(state.gs.showsyms[S_darkroom], state.gs.showsyms[S_room]);

    // display.c:1836-1837 puts Is_rogue_level() beside the two options, so the
    // rogue level takes the GLYPH_NOTHING arm whatever they say -- and the
    // tail follows the two options alone, which is why it still points
    // S_darkroom at S_room here.
    state.u = { ...state.u, uz: { dnum: 3, dlevel: 15 } };
    state.rogue_level = { dnum: 3, dlevel: 15 };
    reglyph_darkroom(state);
    assert.equal(state.gs.showsyms[S_darkroom], state.gs.showsyms[S_room]);
});

test('reglyph_darkroom runs the two arms that need GLYPH_NOTHING', () => {
    // display.c:1838-1840 and 1845-1847, the pair the second gate's arms
    // reach when 'dark_room' or colour is off. Between them they move a
    // remembered dark-room square to GLYPH_NOTHING and back, which is the
    // whole reason this port needed a glyph number rather than a drawn cell.
    const state = feelingHeroBeside(1, 1);
    state.iflags = { ...(state.iflags ?? {}), wc_color: true };
    state.viz_array = [];
    const seen = state.level.at(10, 6);
    Object.assign(seen, { typ: ROOM, seenv: SVALL, waslit: false });
    seen.remembered_glyph = remembered_glyph_from_presentation(
        map_glyphinfo(cmap_to_glyph(S_darkroom, state), state),
    );
    const lit = state.level.at(12, 6);
    Object.assign(lit, { typ: ROOM, seenv: SVALL, waslit: true });
    lit.remembered_glyph = remembered_glyph_from_presentation(
        map_glyphinfo(cmap_to_glyph(S_darkroom, state), state),
    );

    // 1838-1840: with colour off nothing draws S_darkroom, so a square the
    // hero saw lit goes back to plain floor and one she did not goes blank.
    state.iflags.wc_color = false;
    reglyph_darkroom(state);
    assert.equal(seen.remembered_glyph.glyph, GLYPH_NOTHING_OFF);
    assert.equal(lit.remembered_glyph.glyph, cmap_to_glyph(S_room, state));

    // 1845-1847: with colour back on the blank square becomes dark floor
    // again, which is the arm that reads GLYPH_NOTHING back.
    state.iflags.wc_color = true;
    reglyph_darkroom(state);
    assert.equal(
        seen.remembered_glyph.glyph, cmap_to_glyph(S_darkroom, state),
    );
    // 1842-1844 moves the lit one the same way, by its own arm.
    assert.equal(
        lit.remembered_glyph.glyph, cmap_to_glyph(S_darkroom, state),
    );

    // 1827-1830, the first pair's other arm: with 'dark_room' off a corridor
    // the hero saw lit is drawn lit again wherever she is standing.
    const corridor = state.level.at(14, 6);
    Object.assign(corridor, { typ: CORR, seenv: SVALL, waslit: true });
    corridor.remembered_glyph = remembered_glyph_from_presentation(
        map_glyphinfo(cmap_to_glyph(S_corr, state), state),
    );
    state.flags.dark_room = false;
    reglyph_darkroom(state);
    assert.equal(
        corridor.remembered_glyph.glyph, cmap_to_glyph(S_litcorr, state),
    );
    // Both of that arm's conjuncts matter. A room square the hero saw lit
    // satisfies `lev->waslit` and not the glyph test, and a corridor she never
    // saw lit satisfies the glyph test and not `lev->waslit`; neither is
    // promoted.
    assert.equal(lit.remembered_glyph.glyph, cmap_to_glyph(S_room, state));
    const unlitCorridor = state.level.at(16, 6);
    Object.assign(unlitCorridor, { typ: CORR, seenv: SVALL, waslit: false });
    unlitCorridor.remembered_glyph = remembered_glyph_from_presentation(
        map_glyphinfo(cmap_to_glyph(S_corr, state), state),
    );
    reglyph_darkroom(state);
    assert.equal(
        unlitCorridor.remembered_glyph.glyph, cmap_to_glyph(S_corr, state),
    );
});

test('reglyph_darkroom repairs the corridor and room squares it can decide',
    () => {
    // display.c:1831-1833 and 1842-1844, the two arms the else branches reach
    // with 'dark_room' and colour both on. options.c reaches them from
    // reset_needed_visuals() (8999) after an `O`-menu 'lit_corridor' toggle,
    // which is a repaint of remembered, out-of-sight squares only: C rewrites
    // levl[x][y].glyph here and leaves the screen to docrt().
    const state = feelingHeroBeside(7, 4);
    state.iflags = { ...(state.iflags ?? {}), wc_color: true };
    // The row is clear of the hero at <6,4>, so nothing here is adjacent to
    // her and the squares differ only in the terms the two arms read.
    const row = 6;
    const remember = (x, apply) => {
        const square = state.level.at(x, row);
        apply(square);
        square.remembered_glyph = remembered_glyph_from_presentation(
            terrainGlyphAt(square, x, row, state),
        );
        return square;
    };
    // back_to_glyph() answers S_litcorr for a corridor while 'lit_corridor'
    // is on, and reset_glyphmap() colours it CLR_WHITE so it stays visibly
    // distinct from the dark corridor symbol.
    state.flags.lit_corridor = true;
    const corridor = remember(10, (square) => {
        square.typ = CORR;
        square.waslit = false;
    });
    assert.equal(glyph_to_cmap(corridor.remembered_glyph.glyph), S_litcorr);
    assert.equal(
        remembered_glyph_presentation(corridor.remembered_glyph, state).color,
        CLR_WHITE,
    );
    const seenCorridor = remember(18, (square) => {
        square.typ = CORR;
        square.waslit = false;
    });
    state.flags.lit_corridor = false;

    // 1842-1844 needs all three of seenv, waslit and !cansee, so each of the
    // last two squares drops one of them.
    const room = remember(12, (square) => {
        square.typ = ROOM;
        square.waslit = true;
        square.seenv = SVALL;
    });
    const unseenRoom = remember(14, (square) => {
        square.typ = ROOM;
        square.waslit = true;
        square.seenv = 0;
    });
    const unlitRoom = remember(16, (square) => {
        square.typ = ROOM;
        square.waslit = false;
        square.seenv = SVALL;
    });
    assert.equal(glyph_to_cmap(room.remembered_glyph.glyph), S_room);

    // cansee() reads viz_array; only <18,6> is in sight.
    state.viz_array = [];
    state.viz_array[row] = [];
    state.viz_array[row][18] = IN_SIGHT;

    reglyph_darkroom(state);

    // The whole point of the corridor arm: C repaints the cell in the
    // terminal default rather than in CLR_WHITE.
    assert.equal(glyph_to_cmap(corridor.remembered_glyph.glyph), S_corr);
    assert.equal(
        remembered_glyph_presentation(corridor.remembered_glyph, state).color,
        NO_COLOR,
    );
    assert.equal(glyph_to_cmap(room.remembered_glyph.glyph), S_darkroom);
    // A square the hero can see is repainted by docrt() from what is really
    // there, so C leaves its memory alone.
    assert.equal(glyph_to_cmap(seenCorridor.remembered_glyph.glyph), S_litcorr);
    assert.equal(glyph_to_cmap(unseenRoom.remembered_glyph.glyph), S_room);
    assert.equal(glyph_to_cmap(unlitRoom.remembered_glyph.glyph), S_room);
});

test('same_remembered_glyph separates S_room from S_darkroom', () => {
    // lock.c:584 asks whether map memory changed. Once reglyph_darkroom() has
    // run, the two room cmaps draw one byte in one colour, so only the cmap
    // index the record carries can answer.
    const x = 7;
    const y = 4;
    const state = feelingHeroBeside(x, y);
    state.iflags = { ...(state.iflags ?? {}), wc_color: true };
    reglyph_darkroom(state);
    const floor = state.level.at(x, y);
    floor.typ = ROOM;
    floor.waslit = true;

    const lit = remembered_glyph_from_presentation(
        terrainGlyphAt(floor, x, y, state),
    );
    assert.equal(glyph_to_cmap(lit.glyph), S_room);
    // A second record for the same square is a different object holding the
    // same identity, which is what C's `oldglyph != door->glyph` would call
    // unchanged.
    const again = remembered_glyph_from_presentation(
        terrainGlyphAt(floor, x, y, state),
    );
    assert.notEqual(lit, again);
    assert.equal(same_remembered_glyph(lit, again), true);

    floor.remembered_glyph = lit;
    feel_location(x, y, state);
    const dark = floor.remembered_glyph;
    assert.equal(glyph_to_cmap(dark.glyph), S_darkroom);
    // Same drawn cell, different glyph.
    const drawnDark = remembered_glyph_presentation(dark, state);
    const drawnLit = remembered_glyph_presentation(lit, state);
    assert.equal(drawnDark.ch, drawnLit.ch);
    assert.equal(drawnDark.color, drawnLit.color);
    assert.equal(drawnDark.dec, drawnLit.dec);
    assert.equal(same_remembered_glyph(lit, dark), false);

    // A missing record on either side is a change; two missing records are not.
    assert.equal(same_remembered_glyph(null, dark), false);
    assert.equal(same_remembered_glyph(dark, null), false);
    assert.equal(same_remembered_glyph(null, null), true);
});

test('same_remembered_glyph separates each glyph number a square can hold',
    () => {
    // lock.c:584 answers "changed" whenever the two numbers differ, and the
    // number is the whole of what map memory holds, so one pair of numbers
    // covers the comparison. GLYPH_OBJ_OFF + 1 and + 2 are what display.h
    // normal_obj_to_glyph() returns for ordinary objects of type 1 and type 2,
    // neither the top of a pile.
    const oneObject = { glyph: GLYPH_OBJ_OFF + 1 };
    const otherObject = { glyph: GLYPH_OBJ_OFF + 2 };
    assert.equal(same_remembered_glyph(oneObject, otherObject), false);
    assert.equal(same_remembered_glyph(otherObject, oneObject), false);
    assert.equal(same_remembered_glyph(oneObject, { ...oneObject }), true);

    // The invisible-monster marker is one more number, which is the whole
    // reason the sidecar it replaced is gone: map_invisible() stores
    // GLYPH_INVISIBLE in levl[x][y].glyph and lock.c:584's `!=` separates it
    // from an object with no extra term.
    const invisible = { glyph: GLYPH_INVISIBLE };
    assert.equal(same_remembered_glyph(oneObject, invisible), false);
    assert.equal(same_remembered_glyph(invisible, oneObject), false);
    assert.equal(same_remembered_glyph(invisible, { ...invisible }), true);

    // A missing record on either side is a change; two missing records are not.
    assert.equal(same_remembered_glyph(null, oneObject), false);
    assert.equal(same_remembered_glyph(oneObject, null), false);
    assert.equal(same_remembered_glyph(null, null), true);
});

test('same_remembered_glyph separates two objects that draw the same cell',
    () => {
    // display.h obj_to_glyph() (963-968) numbers a corpse by corpsenm and an
    // ordinary object by otyp, so C's `door->glyph != oldglyph` at lock.c:584
    // answers "changed" for two objects of one class and one colour. This
    // port stores a presentation, which cannot tell them apart on its own.
    const state = visibleCellState();
    const corpse = (corpsenm) => remembered_glyph_from_presentation(
        object_glyph_info({
            otyp: CORPSE,
            oclass: state.objects[CORPSE].oc_class,
            corpsenm,
            dknown: true,
        }, state),
    );
    // monst.c gives PM_JACKAL and PM_SEWER_RAT the same mcolor, so their
    // corpses draw one '%' in one colour; C compares GLYPH_BODY_OFF + 12
    // against GLYPH_BODY_OFF + 88.
    const jackal = corpse(PM_JACKAL);
    const rat = corpse(PM_SEWER_RAT);
    const drawnJackal = remembered_glyph_presentation(jackal, state);
    const drawnRat = remembered_glyph_presentation(rat, state);
    assert.equal(drawnJackal.ch, drawnRat.ch);
    assert.equal(drawnJackal.color, drawnRat.color);
    assert.equal(same_remembered_glyph(jackal, rat), false);
    // Two records for the same species are the same glyph number.
    assert.equal(same_remembered_glyph(jackal, corpse(PM_JACKAL)), true);

    // The same holds one range up: ARROW and CROSSBOW_BOLT are both
    // WEAPON_CLASS with the same objects[].oc_color, and C numbers them
    // GLYPH_OBJ_OFF + 18 against GLYPH_OBJ_OFF + 23.
    const weapon = (otyp) => remembered_glyph_from_presentation(
        object_glyph_info({
            otyp,
            oclass: state.objects[otyp].oc_class,
            dknown: true,
        }, state),
    );
    const arrow = weapon(ARROW);
    const bolt = weapon(CROSSBOW_BOLT);
    assert.equal(arrow.ch, bolt.ch);
    assert.equal(arrow.color, bolt.color);
    assert.equal(same_remembered_glyph(arrow, bolt), false);
    assert.equal(same_remembered_glyph(arrow, weapon(ARROW)), true);
});

test('feel_location keeps its four tactile-state terms apart', () => {
    // display.c:769-771 and 776-891. Each state has its own single writer in
    // js/, so each is set on its own here; a guard that had folded them into
    // one condition would let three of the four through.
    const x = 7;
    const y = 4;
    for (const set of [
        (state) => { state.u.uinwater = true; },
        (state) => { state.uball = { where: OBJ_FLOOR }; },
        (state) => { state.uchain = { where: OBJ_FLOOR }; },
        // engrave.c can_reach_floor()'s levitation gate.
        (state) => {
            state.u.uprops[LEVITATION] = {
                intrinsic: 1, extrinsic: 0, blocked: 0,
            };
        },
    ]) {
        const state = feelingHeroBeside(x, y);
        state.level.at(x, y).typ = ROOM;
        set(state);
        assert.throws(
            () => feel_location(x, y, state),
            /unsupported tactile floor state/,
        );
    }

    // C passes FALSE, so a hero teetering at the edge of a pit she can see
    // still feels the square beside her. can_reach_floor(TRUE) would refuse.
    const state = feelingHeroBeside(x, y);
    state.level.at(x, y).typ = ROOM;
    state.level.traps = [{
        ttyp: PIT, tx: state.u.ux, ty: state.u.uy, tseen: 1,
    }];
    feel_location(x, y, state);
    assert.equal(
        glyph_to_cmap(state.level.at(x, y).remembered_glyph.glyph),
        S_darkroom,
    );
});

test('feel_location reveals only an engraving that can be felt', () => {
    // display.c:859-860 through engrave.c engr_can_be_felt(). Dust cannot be
    // read by touch, so feeling the square must not mark it revealed.
    const x = 7;
    const y = 4;
    for (const [engr_type, revealed] of [[DUST, false], [BURN, true]]) {
        const state = feelingHeroBeside(x, y);
        state.level.at(x, y).typ = ROOM;
        make_engr_at(x, y, 'X', 'X', 0, engr_type, { state });
        feel_location(x, y, state);
        assert.equal(
            Boolean(engr_at(x, y, state).erevealed), revealed, `${engr_type}`,
        );
    }
});

test('feel_location maps a seen trap, and an object above it', () => {
    // display.c _map_location() (455-458) tries the object layer first, then a
    // tseen trap, then the engraving, then the background. pick_lock() can
    // name any adjacent square, so a trapped one is squarely within reach of
    // the widened function.
    const x = 7;
    const y = 4;
    const state = feelingHeroBeside(x, y);
    const square = state.level.at(x, y);
    square.typ = ROOM;
    // PIT is one ordinary floor trap.
    const trap = { ttyp: PIT, tx: x, ty: y, tseen: 1 };
    state.level.traps = [trap];
    const trapGlyph = trap_glyph_info(trap, state);

    feel_location(x, y, state);
    assert.equal(square.remembered_glyph.glyph, trap_to_glyph(trap, state));
    // rm.h trap_to_defsym() is one cmap index per trap type, so the stored
    // number names the trap without a second field beside it.
    assert.equal(
        defsym_to_trap(glyph_to_cmap(square.remembered_glyph.glyph)), PIT,
    );
    assert.equal(square.disp_ch, trapGlyph.ch);

    // An object on the same square takes the arm above, and the trap identity
    // does not travel with a record that no longer represents the trap.
    // display.c reset_glyphmap()'s object arm reads objects[ARROW] for the
    // symbol class and the colour.
    state.objects[ARROW] = { oc_class: WEAPON_CLASS, oc_color: CLR_GRAY };
    state.level.objects[x][y] = {
        otyp: ARROW,
        oclass: WEAPON_CLASS,
        dknown: true,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        nexthere: null,
    };
    feel_location(x, y, state);
    assert.equal(glyph_is_object(square.remembered_glyph.glyph), true);
    // glyphs.c glyph_to_cmap() answers MAXPCHARS, defsyms[]'s fencepost, for
    // a number in no cmap range: the trap identity is gone with the number.
    assert.equal(glyph_to_cmap(square.remembered_glyph.glyph), MAXPCHARS);
});

test('feel_location writes a felt engraving to memory only under hero_memory',
    () => {
    // display.c map_engraving() (313-320) guards its memory write with
    // svl.level.flags.hero_memory and draws either way, so a level that keeps
    // no memory still shows the engraving under the hero's fingers.
    const x = 7;
    const y = 4;
    for (const heroMemory of [true, false]) {
        const state = feelingHeroBeside(x, y);
        state.level.flags.hero_memory = heroMemory;
        const square = state.level.at(x, y);
        square.typ = ROOM;
        // BURN is one of the engraving types engr_can_be_felt() admits, so
        // feel_location() reveals it before _map_location() reads it back.
        make_engr_at(x, y, 'X', 'X', 0, BURN, { state });

        feel_location(x, y, state);
        assert.equal(
            square.disp_ch,
            cmap_symbol(S_engroom, state).ch,
            `hero_memory ${heroMemory}`,
        );
        assert.equal(
            square.remembered_glyph
                ? glyph_to_cmap(square.remembered_glyph.glyph) : null,
            heroMemory ? S_engroom : null,
            `hero_memory ${heroMemory}`,
        );
    }
});

test('feel_location darkens a lit room only under dark_room and colour', () => {
    // display.c:894-897. A square the hero has seen lit keeps S_room unless
    // both options are on; only `!lev->waslit` reaches the rewrite otherwise.
    const x = 7;
    const y = 4;
    const state = feelingHeroBeside(x, y);
    state.iflags = { ...(state.iflags ?? {}), wc_color: true };
    const floor = state.level.at(x, y);
    floor.typ = ROOM;
    floor.waslit = true;
    state.flags.dark_room = false;
    feel_location(x, y, state);
    assert.equal(glyph_to_cmap(floor.remembered_glyph.glyph), S_room);

    state.flags.dark_room = true;
    feel_location(x, y, state);
    assert.equal(glyph_to_cmap(floor.remembered_glyph.glyph), S_darkroom);

    // C's second operand is `flags.dark_room && iflags.use_color`, so turning
    // colour off puts a square the hero has seen lit back out of reach of the
    // rewrite however 'dark_room' stands. Under OPTIONS=!color the port still
    // reaches here: js/jsmain.js runs reglyph_darkroom() before any level
    // exists, so its refusal does not fire, and showsyms[S_darkroom] is
    // pointed at the SYM_NOTHING byte -- which is why losing this operand
    // would erase the square from the map rather than merely recolour it.
    state.iflags = { ...state.iflags, wc_color: false };
    feel_location(x, y, state);
    assert.equal(glyph_to_cmap(floor.remembered_glyph.glyph), S_room);

    // The `!lev->waslit` half still fires without colour, because C's two
    // operands are joined by `||`.
    floor.waslit = false;
    feel_location(x, y, state);
    assert.equal(glyph_to_cmap(floor.remembered_glyph.glyph), S_darkroom);
});

test('feel_location paints a gas cloud only for a hero who can see it', () => {
    // display.c:470-471. _map_location()'s region tail is `show && !Blind`,
    // and feel_location() always passes show = 1, so blindness is the whole
    // condition. The square is stone rather than room floor because the
    // dark-room rewrite at 894-897 would otherwise redraw over the cloud --
    // as it does in C, which is why the observable case is one the tail
    // leaves alone.
    const x = 7;
    const y = 4;
    for (const blind of [true, false]) {
        const state = feelingHeroBeside(x, y);
        state.level.at(x, y).typ = STONE;
        if (!blind) state.u.uprops[BLINDED] = null;
        const cloud = create_region();
        add_rect_to_reg(cloud, { lx: x, ly: y, hx: x, hy: y });
        cloud.visible = true;
        cloud.glyph_cmap = S_poisoncloud;
        add_region(cloud, state, { deferVisual: true });

        feel_location(x, y, state);
        assert.equal(
            state.level.at(x, y).disp_ch,
            cmap_symbol(blind ? S_stone : S_poisoncloud, state).ch,
            `blind ${blind}`,
        );
        // Either way the region is presentation only: map memory holds what
        // the hero felt underneath it.
        assert.equal(
        glyph_to_cmap(state.level.at(x, y).remembered_glyph.glyph),
        S_stone,
    );
    }
});

test('hallucinated map_object paths preserve presentation, memory, and RNG', () => {
    const cases = [
        {
            label: 'covered ordinary floor object',
            originalType: ARROW,
            seed: 2026072400,
            statue: false,
            dknown: true,
            cover: 'monster',
        },
        {
            label: 'covered corpse result',
            originalType: CORPSE,
            seed: 2026073840,
            statue: false,
            dknown: true,
            cover: 'monster',
        },
        {
            label: 'unidentified potion remains unobserved',
            originalType: POT_BOOZE,
            seed: 2026072402,
            statue: false,
            dknown: false,
            cover: 'monster',
            nearby: true,
        },
        {
            label: 'covered statue with separate memory',
            originalType: STATUE,
            seed: 2026072400,
            statue: true,
            dknown: true,
            heroMemory: true,
            cover: 'monster',
        },
        {
            label: 'covered statue without memory draw',
            originalType: STATUE,
            seed: 2026072401,
            statue: true,
            dknown: true,
            heroMemory: false,
            cover: 'monster',
        },
        {
            label: 'bare ordinary floor object',
            originalType: ARROW,
            seed: 2026072400,
            statue: false,
            dknown: true,
            cover: 'none',
        },
        {
            label: 'bare corpse result',
            originalType: CORPSE,
            seed: 2026073840,
            statue: false,
            dknown: true,
            cover: 'none',
        },
        {
            label: 'bare statue presentation',
            originalType: STATUE,
            seed: 2026072400,
            statue: true,
            dknown: true,
            cover: 'none',
        },
        {
            label: 'hero over ordinary object with memory',
            originalType: ARROW,
            seed: 2026072400,
            statue: false,
            dknown: true,
            cover: 'hero',
        },
        {
            label: 'hero over statue with memory',
            originalType: STATUE,
            seed: 2026072400,
            statue: true,
            dknown: true,
            cover: 'hero',
        },
        {
            label: 'hero over ordinary object without memory',
            originalType: ARROW,
            seed: 2026072401,
            statue: false,
            dknown: true,
            heroMemory: false,
            cover: 'hero',
        },
        {
            label: 'hero over statue without memory',
            originalType: STATUE,
            seed: 2026072401,
            statue: true,
            dknown: true,
            heroMemory: false,
            cover: 'hero',
        },
    ];
    for (const {
        label,
        originalType,
        seed,
        statue,
        dknown,
        heroMemory = true,
        cover,
        nearby = false,
    } of cases) {
        const x = 7;
        const y = 4;
        const state = visibleCellState({
            x,
            y,
            ux: cover === 'hero' ? x : nearby ? x - 1 : 1,
            uy: cover === 'hero' || nearby ? y : 1,
        });
        state.u.uprops = [];
        state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
        state.level.flags.hero_memory = heroMemory;
        const floorObject = {
            otyp: originalType,
            oclass: state.objects[originalType].oc_class,
            corpsenm: PM_TENGU,
            dknown,
            where: OBJ_FLOOR,
            ox: x,
            oy: y,
            nexthere: null,
        };
        state.level.objects[x][y] = floorObject;
        const monster = cover === 'monster'
            ? {
                data: state.mons[PM_TENGU],
                mhp: 10,
                mtame: 0,
                minvis: false,
                mundetected: false,
                m_ap_type: 0,
                mx: x,
                my: y,
            }
            : null;
        if (monster) state.level.monsters[x][y] = monster;
        const priorMemory = {
            ch: '?',
            color: CLR_YELLOW,
            decgfx: false,
            displayCh: null,
        };
        if (!heroMemory)
            state.level.at(x, y).remembered_glyph = priorMemory;

        initRng(seed);
        let statueSpecies = NON_PM;
        if (statue) {
            statueSpecies = rn2_on_display_rng(NUMMONS);
            rn2_on_display_rng(2);
        }
        let randomType = NON_PM;
        let randomBody = NON_PM;
        if (!statue || heroMemory) {
            randomType = FIRST_OBJECT + rn2_on_display_rng(
                NUM_OBJECTS - FIRST_OBJECT,
            );
            if (randomType === CORPSE)
                randomBody = rn2_on_display_rng(NUMMONS);
        }
        const randomMonster = monster
            ? rn2_on_display_rng(NUMMONS) : NON_PM;
        const followingDraw = rn2_on_display_rng(NUMMONS);
        initRng(seed);

        state.u.uprops[HALLUC].intrinsic = 0;
        const expectedObject = randomType !== NON_PM
            ? object_glyph_info({
                otyp: randomType,
                oclass: state.objects[randomType].oc_class,
                corpsenm: randomBody,
                dknown: true,
            }, state)
            : null;
        const expectedStatue = statue
            ? monster_glyph_info({
                data: state.mons[statueSpecies],
                mtame: 0,
                m_ap_type: 0,
            }, state)
            : null;
        const expectedMonster = monster
            ? monster_glyph_info({
                ...monster,
                data: state.mons[randomMonster],
            }, state)
            : null;
        const expectedShown = monster
            ? expectedMonster
            : cover === 'hero'
                ? hero_glyph_info(state)
                : statue ? expectedStatue : expectedObject;
        state.u.uprops[HALLUC].intrinsic = 1;

        newsym(x, y);

        const location = state.level.at(x, y);
        assert.deepEqual(
            [
                location.disp_ch,
                location.disp_color,
                location.disp_attr,
            ],
            [
                expectedShown.ch,
                expectedShown.color,
                expectedShown.attr ?? 0,
            ],
            `${label}: displayed glyph`,
        );
        if (heroMemory) {
            assert.deepEqual(
                location.remembered_glyph,
                remembered_glyph_from_presentation(expectedObject),
                `${label}: remembered object`,
            );
        } else {
            assert.deepEqual(
                location.remembered_glyph,
                priorMemory,
                `${label}: disabled memory preserves prior state`,
            );
        }
        if (!dknown) {
            assert.equal(floorObject.dknown, false, label);
            assert.equal(
                state.objects[originalType].oc_encountered,
                0,
                label,
            );
        }
        assert.equal(
            rn2_on_display_rng(NUMMONS),
            followingDraw,
            `${label}: display RNG tail`,
        );
    }

    const x = 7;
    const y = 4;
    const control = visibleCellState({ x, y, ux: x - 1, uy: y });
    init_objects(control, () => 0);
    const potion = {
        otyp: POT_BOOZE,
        oclass: control.objects[POT_BOOZE].oc_class,
        dknown: false,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        nexthere: null,
    };
    control.level.objects[x][y] = potion;
    newsym(x, y);
    assert.equal(potion.dknown, true);
    assert.equal(control.objects[POT_BOOZE].oc_encountered, 1);
});

test('out-of-sight objects retain memory without display-RNG work', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    state.u.uprops = [];
    state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
    state.viz_array[y][x] = 0;
    state.level.objects[x][y] = {
        otyp: STATUE,
        oclass: state.objects[STATUE].oc_class,
        corpsenm: PM_TENGU,
        dknown: true,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        nexthere: null,
    };
    // Any number outside the object ranges the square could draw for itself,
    // so that a redraw from memory is visibly not a redraw from the statue.
    // display.h cmap_to_glyph(S_fountain) is the arbitrary choice.
    const priorMemory = { glyph: cmap_to_glyph(S_fountain, state) };
    state.level.at(x, y).remembered_glyph = priorMemory;

    const seed = 2026072410;
    initRng(seed);
    const firstDraw = rn2_on_display_rng(NUMMONS);
    initRng(seed);

    newsym(x, y);

    const location = state.level.at(x, y);
    assert.deepEqual(location.remembered_glyph, priorMemory);
    const drawn = map_glyphinfo(priorMemory.glyph, state);
    assert.deepEqual(
        [
            location.disp_ch,
            location.disp_color,
            location.disp_decgfx,
        ],
        [drawn.ch, drawn.color, drawn.dec],
    );
    assert.equal(rn2_on_display_rng(NUMMONS), firstDraw);
});

test('hallucinated revealed object mimics map disguise before real form', () => {
    const cases = [
        {
            label: 'detection',
            property: DETECT_MONSTERS,
            source: 'intrinsic',
        },
        {
            label: 'intrinsic shape-changer protection',
            property: PROT_FROM_SHAPE_CHANGERS,
            source: 'intrinsic',
        },
        {
            label: 'extrinsic shape-changer protection',
            property: PROT_FROM_SHAPE_CHANGERS,
            source: 'extrinsic',
        },
    ];
    for (const { label, property, source } of cases) {
        const x = 7;
        const y = 4;
        const state = visibleCellState({ x, y, ux: 1, uy: 1 });
        state.u.uprops = [];
        state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
        state.u.uprops[property] = { intrinsic: 0, extrinsic: 0 };
        state.u.uprops[property][source] = 1;
        const monster = {
            data: state.mons[PM_TENGU],
            mhp: 10,
            mtame: 0,
            minvis: false,
            mundetected: false,
            m_ap_type: M_AP_OBJECT,
            mappearance: CHEST,
            mx: x,
            my: y,
        };
        state.level.monsters[x][y] = monster;

        const seed = 2026072400;
        initRng(seed);
        const randomType = FIRST_OBJECT + rn2_on_display_rng(
            NUM_OBJECTS - FIRST_OBJECT,
        );
        const randomBody = randomType === CORPSE
            ? rn2_on_display_rng(NUMMONS) : NON_PM;
        const randomMonster = rn2_on_display_rng(NUMMONS);
        const followingDraw = rn2_on_display_rng(NUMMONS);
        initRng(seed);

        state.u.uprops[HALLUC].intrinsic = 0;
        const expectedDisguise = object_glyph_info({
            otyp: randomType,
            oclass: state.objects[randomType].oc_class,
            corpsenm: randomBody,
            dknown: true,
        }, state);
        const expectedMonster = monster_glyph_info({
            ...monster,
            data: state.mons[randomMonster],
            m_ap_type: 0,
        }, state);
        state.u.uprops[HALLUC].intrinsic = 1;

        newsym(x, y);

        const location = state.level.at(x, y);
        assert.deepEqual(
            [
                location.disp_ch,
                location.disp_color,
                location.disp_attr,
            ],
            [
                expectedMonster.ch,
                expectedMonster.color,
                expectedMonster.attr ?? 0,
            ],
            label,
        );
        assert.deepEqual(
            location.remembered_glyph,
            remembered_glyph_from_presentation(expectedDisguise),
            label,
        );
        assert.equal(
            rn2_on_display_rng(NUMMONS),
            followingDraw,
            label,
        );
    }
});

test('shape-changer protection does not reveal an unsensed invisible mimic',
    () => {
        const x = 7;
        const y = 4;
        const state = visibleCellState({ x, y, ux: 1, uy: 1 });
        state.u.uprops = [];
        state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
        state.u.uprops[PROT_FROM_SHAPE_CHANGERS] = {
            intrinsic: 1,
            extrinsic: 0,
        };
        state.level.monsters[x][y] = {
            data: state.mons[PM_TENGU],
            mhp: 10,
            mtame: 0,
            minvis: true,
            mundetected: false,
            m_ap_type: M_AP_OBJECT,
            mappearance: CHEST,
            mx: x,
            my: y,
        };
        const expected = terrainGlyphAt(state.level.at(x, y), x, y, state);
        const seed = 2026072411;
        initRng(seed);
        const firstDraw = rn2_on_display_rng(NUMMONS);
        initRng(seed);

        newsym(x, y);

        const location = state.level.at(x, y);
        assert.deepEqual(
            [
                location.disp_ch,
                location.disp_color,
                location.disp_attr,
            ],
            [expected.ch, expected.color, expected.attr ?? 0],
        );
        assert.deepEqual(
            location.remembered_glyph,
            remembered_glyph_from_presentation(expected),
        );
        assert.equal(rn2_on_display_rng(NUMMONS), firstDraw);
    });

test('protected furniture mimics remember disguise regardless of hero memory',
    () => {
        for (const heroMemory of [true, false]) {
            const x = 7;
            const y = 4;
            const state = visibleCellState({ x, y, ux: 1, uy: 1 });
            state.level.flags.hero_memory = heroMemory;
            state.u.uprops = [];
            state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
            state.u.uprops[PROT_FROM_SHAPE_CHANGERS] = {
                intrinsic: 1,
                extrinsic: 0,
            };
            const monster = {
                data: state.mons[PM_TENGU],
                mhp: 10,
                mtame: 0,
                minvis: false,
                mundetected: false,
                m_ap_type: M_AP_FURNITURE,
                mappearance: S_hcdoor,
                mx: x,
                my: y,
            };
            state.level.monsters[x][y] = monster;
            state.level.at(x, y).remembered_glyph = {
                ch: '?',
                color: CLR_YELLOW,
                decgfx: false,
                displayCh: null,
            };

            const seed = 2026072412;
            initRng(seed);
            const randomMonster = rn2_on_display_rng(NUMMONS);
            const followingDraw = rn2_on_display_rng(NUMMONS);
            initRng(seed);

            state.u.uprops[HALLUC].intrinsic = 0;
            const expectedDisguise = monster_glyph_info(monster, state);
            const expectedMonster = monster_glyph_info({
                ...monster,
                data: state.mons[randomMonster],
                m_ap_type: 0,
            }, state);
            state.u.uprops[HALLUC].intrinsic = 1;

            newsym(x, y);

            const location = state.level.at(x, y);
            assert.deepEqual(
                [
                    location.disp_ch,
                    location.disp_color,
                    location.disp_attr,
                ],
                [
                    expectedMonster.ch,
                    expectedMonster.color,
                    expectedMonster.attr ?? 0,
                ],
                `hero_memory=${heroMemory}`,
            );
            assert.deepEqual(
                location.remembered_glyph,
                remembered_glyph_from_presentation(expectedDisguise),
                `hero_memory=${heroMemory}`,
            );
            assert.equal(
                rn2_on_display_rng(NUMMONS),
                followingDraw,
                `hero_memory=${heroMemory}`,
            );
        }
    });

test('unprotected furniture mimics bypass disabled hero memory without RNG',
    () => {
        const x = 7;
        const y = 4;
        const state = visibleCellState({ x, y, ux: 1, uy: 1 });
        state.level.flags.hero_memory = false;
        state.u.uprops = [];
        const monster = {
            data: state.mons[PM_TENGU],
            mhp: 10,
            mtame: 0,
            minvis: false,
            mundetected: false,
            m_ap_type: M_AP_FURNITURE,
            mappearance: S_hcdoor,
            mx: x,
            my: y,
        };
        state.level.monsters[x][y] = monster;
        state.level.at(x, y).remembered_glyph = {
            ch: '?',
            color: CLR_YELLOW,
            decgfx: false,
            displayCh: null,
        };
        const expected = monster_glyph_info(monster, state);
        const seed = 2026072415;
        initRng(seed);
        const firstDraw = rn2_on_display_rng(NUMMONS);
        initRng(seed);

        newsym(x, y);

        const location = state.level.at(x, y);
        assert.deepEqual(
            [
                location.disp_ch,
                location.disp_color,
                location.disp_attr,
            ],
            [expected.ch, expected.color, expected.attr ?? 0],
        );
        assert.deepEqual(
            location.remembered_glyph,
            remembered_glyph_from_presentation(expected),
        );
        assert.equal(rn2_on_display_rng(NUMMONS), firstDraw);
    });

test('map_trap paints on show and remembers only under hero memory', () => {
    // C ref: display.c map_trap() (295-305): one glyph, written to
    // levl[x][y].glyph while svl.level.flags.hero_memory is set and handed to
    // show_glyph() while `show` is nonzero. trap.c feeltrap() is the ported
    // caller and passes 1, so only hero_memory varies in play -- but both
    // guards are C's and both are pinned here.
    const x = 7;
    const y = 4;
    // Any trap type CMAP_COLORS gives a colour serves; a pit is the one the
    // neighbouring cases in this file already use, and trap_to_defsym() is
    // what turns its ttyp into the index.
    const trap = { tx: x, ty: y, ttyp: PIT };
    // The memory a previous look at the square left. It has to be a glyph
    // number, because that is all map memory holds now, and one no trap arm
    // can produce, so that the no-hero-memory case below shows the square was
    // left alone rather than rewritten with the same value.
    const priorMemory = { glyph: GLYPH_OBJ_OFF };

    const mapped = (heroMemory, show) => {
        const state = visibleCellState({ x, y });
        state.level.flags.hero_memory = heroMemory;
        state.level.at(x, y).remembered_glyph = { ...priorMemory };
        const glyph = trap_glyph_info(trap, state);
        map_trap(trap, show, state);
        return { location: state.level.at(x, y), glyph };
    };

    // Both halves run. Recomputing the glyph from the same two helpers the
    // body uses proves the plumbing -- that the trap's own glyph number is
    // what reaches the memory and the buffer -- and not that the number is
    // right. A wrong entry in CMAP_COLORS or trap_to_defsym() would satisfy
    // it just as well; the recorded screens are what answer for that.
    const shown = mapped(true, 1);
    assert.deepEqual(
        shown.location.remembered_glyph,
        remembered_glyph_from_presentation(shown.glyph),
    );
    assert.equal(shown.location.disp_ch, shown.glyph.ch);
    assert.equal(shown.location.gnew, 1);

    // show 0 writes the memory and leaves the display buffer untouched, which
    // is the state a fresh cell starts in.
    const unshown = mapped(true, 0);
    assert.deepEqual(
        unshown.location.remembered_glyph,
        remembered_glyph_from_presentation(unshown.glyph),
    );
    assert.equal(unshown.location.disp_glyph, undefined);
    assert.equal(unshown.location.gnew, 0);

    // Without hero memory the paint still happens and the square keeps
    // whatever it remembered before.
    const forgotten = mapped(false, 1);
    assert.deepEqual(forgotten.location.remembered_glyph, priorMemory);
    assert.equal(forgotten.location.disp_ch, forgotten.glyph.ch);
    assert.equal(forgotten.location.gnew, 1);
});

test('monster disguises are transient and preserve display-RNG order', () => {
    const cases = [
        {
            label: 'physical disguise',
            hallucinating: true,
            protected: false,
            detectedOnly: false,
        },
        {
            label: 'protected physical disguise',
            hallucinating: true,
            protected: true,
            detectedOnly: false,
        },
        {
            label: 'detected-only real form',
            hallucinating: true,
            protected: false,
            detectedOnly: true,
        },
        {
            label: 'non-hallucinated tame disguise',
            hallucinating: false,
            protected: false,
            detectedOnly: false,
            tame: true,
        },
        {
            label: 'non-hallucinated protected tame real form',
            hallucinating: false,
            protected: true,
            detectedOnly: false,
            tame: true,
        },
    ];
    for (const {
        label,
        hallucinating,
        protected: protectedHero,
        detectedOnly,
        tame = false,
    } of cases) {
        const x = 7;
        const y = 4;
        const state = visibleCellState({ x, y, ux: 1, uy: 1 });
        state.u.uprops = [];
        state.u.uprops[HALLUC] = {
            intrinsic: hallucinating ? 1 : 0,
            extrinsic: 0,
        };
        state.iflags ??= {};
        state.iflags.wc_hilite_pet = true;
        state.iflags.wc2_petattr = ATR_UNDERLINE;
        if (protectedHero) {
            state.u.uprops[PROT_FROM_SHAPE_CHANGERS] = {
                intrinsic: 1,
                extrinsic: 0,
            };
        }
        if (detectedOnly) {
            state.u.uprops[DETECT_MONSTERS] = {
                intrinsic: 1,
                extrinsic: 0,
            };
        }
        const monster = {
            data: state.mons[PM_TENGU],
            mhp: 10,
            mtame: tame ? 1 : 0,
            minvis: detectedOnly,
            mundetected: false,
            m_ap_type: M_AP_MONSTER,
            mappearance: PM_GOBLIN,
            mx: x,
            my: y,
        };
        state.level.monsters[x][y] = monster;
        const expectedMemory = remembered_glyph_from_presentation(
            terrainGlyphAt(state.level.at(x, y), x, y, state),
        );

        const seed = 2026072413;
        initRng(seed);
        const disguiseSpecies = detectedOnly
            ? NON_PM
            : hallucinating
                ? rn2_on_display_rng(NUMMONS)
                : monster.mappearance;
        const realSpecies = protectedHero || detectedOnly
            ? hallucinating
                ? rn2_on_display_rng(NUMMONS)
                : PM_TENGU
            : NON_PM;
        const followingDraw = rn2_on_display_rng(NUMMONS);
        initRng(seed);

        state.u.uprops[HALLUC].intrinsic = 0;
        const shownSpecies = protectedHero || detectedOnly
            ? realSpecies : disguiseSpecies;
        const expectedShown = monster_glyph_info({
            ...monster,
            data: state.mons[shownSpecies],
            m_ap_type: 0,
            mtame: tame && (protectedHero || detectedOnly) ? 1 : 0,
        }, state);
        const expectedDisguise = detectedOnly
            ? null
            : monster_glyph_info({
                ...monster,
                data: state.mons[disguiseSpecies],
                m_ap_type: 0,
                mtame: 0,
            }, state);
        if (detectedOnly) expectedShown.attr = ATR_INVERSE;
        state.u.uprops[HALLUC].intrinsic = hallucinating ? 1 : 0;
        const location = state.level.at(x, y);
        const glyphWrites = captureDisplayWrites(location);

        newsym(x, y);

        assert.deepEqual(
            [
                location.disp_ch,
                location.disp_color,
                location.disp_attr,
            ],
            [
                expectedShown.ch,
                expectedShown.color,
                expectedShown.attr ?? 0,
            ],
            label,
        );
        assert.deepEqual(
            glyphWrites,
            protectedHero
                ? [
                    glyphPresentationRecord(expectedDisguise),
                    glyphPresentationRecord(expectedShown),
                ]
                : [glyphPresentationRecord(expectedShown)],
            `${label}: ordered glyph writes`,
        );
        assert.deepEqual(location.remembered_glyph, expectedMemory, label);
        assert.equal(
            rn2_on_display_rng(NUMMONS),
            followingDraw,
            label,
        );
    }
});

test('monster disguises preserve divergent hallucinated statue memory', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    state.u.uprops = [];
    state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
    state.u.uprops[PROT_FROM_SHAPE_CHANGERS] = {
        intrinsic: 1,
        extrinsic: 0,
    };
    state.level.objects[x][y] = {
        otyp: STATUE,
        oclass: state.objects[STATUE].oc_class,
        corpsenm: PM_TENGU,
        dknown: true,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        nexthere: null,
    };
    const monster = {
        data: state.mons[PM_TENGU],
        mhp: 10,
        mtame: 0,
        minvis: false,
        mundetected: false,
        m_ap_type: M_AP_MONSTER,
        mappearance: PM_GOBLIN,
        mx: x,
        my: y,
    };
    state.level.monsters[x][y] = monster;

    const seed = 2026072414;
    initRng(seed);
    const floorSpecies = rn2_on_display_rng(NUMMONS);
    rn2_on_display_rng(2);
    const rememberedType = FIRST_OBJECT + rn2_on_display_rng(
        NUM_OBJECTS - FIRST_OBJECT,
    );
    const rememberedBody = rememberedType === CORPSE
        ? rn2_on_display_rng(NUMMONS) : NON_PM;
    const disguiseSpecies = rn2_on_display_rng(NUMMONS);
    const realSpecies = rn2_on_display_rng(NUMMONS);
    const followingDraw = rn2_on_display_rng(NUMMONS);
    initRng(seed);

    state.u.uprops[HALLUC].intrinsic = 0;
    const expectedFloor = monster_glyph_info({
        data: state.mons[floorSpecies],
        mtame: 0,
        m_ap_type: 0,
    }, state);
    const expectedMemory = object_glyph_info({
        otyp: rememberedType,
        oclass: state.objects[rememberedType].oc_class,
        corpsenm: rememberedBody,
        dknown: true,
    }, state);
    const expectedDisguise = monster_glyph_info({
        ...monster,
        data: state.mons[disguiseSpecies],
        m_ap_type: 0,
    }, state);
    const expectedReal = monster_glyph_info({
        ...monster,
        data: state.mons[realSpecies],
        m_ap_type: 0,
    }, state);
    state.u.uprops[HALLUC].intrinsic = 1;
    const location = state.level.at(x, y);
    const glyphWrites = captureDisplayWrites(location);

    newsym(x, y);

    assert.deepEqual(
        [
            location.disp_ch,
            location.disp_color,
            location.disp_attr,
        ],
        [expectedReal.ch, expectedReal.color, expectedReal.attr ?? 0],
    );
    assert.deepEqual(
        glyphWrites,
        [
            glyphPresentationRecord(expectedDisguise),
            glyphPresentationRecord(expectedReal),
        ],
    );
    assert.deepEqual(
        location.remembered_glyph,
        remembered_glyph_from_presentation(expectedMemory),
    );
    // The transient floor draw now retains its C monster glyph number for the
    // display buffer. It still must not replace the independently drawn
    // object glyph which map_object() files in map memory.
    assert.notDeepEqual(
        location.remembered_glyph,
        remembered_glyph_from_presentation(expectedFloor),
        'the transient statue presentation did not replace its object memory',
    );
    assert.equal(rn2_on_display_rng(NUMMONS), followingDraw);
});

test('protected monster disguises queue their transient glyph update', async () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    state.a11y = {
        accessiblemsg: false,
        glyph_updates: true,
        mon_notices: false,
        mon_notices_blocked: 0,
    };
    state.program_state = {};
    state.u.uprops = [];
    state.u.uprops[HALLUC] = { intrinsic: 0, extrinsic: 0 };
    state.u.uprops[PROT_FROM_SHAPE_CHANGERS] = {
        intrinsic: 1,
        extrinsic: 0,
    };
    const monster = {
        data: state.mons[PM_TENGU],
        mhp: 10,
        mtame: 5,
        minvis: false,
        mundetected: false,
        m_ap_type: M_AP_MONSTER,
        mappearance: PM_GOBLIN,
        misc_worn_check: W_SADDLE,
        mextra: { mgivenname: 'Fido' },
        mx: x,
        my: y,
    };
    state.level.monsters[x][y] = monster;
    const expectedDisguise = monster_glyph_info(monster, state);
    const expectedReal = monster_glyph_info({
        ...monster,
        m_ap_type: 0,
    }, state);
    const location = state.level.at(x, y);
    const glyphWrites = captureDisplayWrites(location);

    newsym(x, y);

    assert.deepEqual(glyphWrites, [
        glyphPresentationRecord(expectedDisguise),
        glyphPresentationRecord(expectedReal),
    ]);
    assert.deepEqual(
        state._glyphUpdateNotices?.map((notice) => ({
            message: notice.message,
            current: notice.current,
        })),
        [{
            message: '(3south,6east): tame saddled goblin called Fido.',
            current: glyphPresentationRecord(expectedDisguise),
        }],
        'the disguise transition is captured before the real form overwrites it',
    );

    const emitted = [];
    const returned = await emitGlyphUpdateNotices(state, {
        pline: async (message, receivedState) => {
            assert.equal(receivedState, state);
            assert.deepEqual(
                glyphPresentationRecord(location.disp_glyph),
                glyphPresentationRecord(expectedDisguise),
                'the notice flush sees the disguise frame',
            );
            emitted.push(message);
        },
    });
    assert.deepEqual(
        returned,
        ['(3south,6east): tame saddled goblin called Fido.'],
    );
    assert.deepEqual(emitted, returned);
    assert.deepEqual(state._glyphUpdateNotices, []);
    assert.deepEqual(
        glyphPresentationRecord(location.disp_glyph),
        glyphPresentationRecord(expectedReal),
        'the later real form remains buffered after the notice',
    );
    assert.equal(
        location.gnew,
        1,
        'the unflushed final form remains dirty after the transient frame',
    );
});

test('glyph updates describe newly revealed objects, traps, and furniture', async () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    state.a11y = {
        accessiblemsg: false,
        glyph_updates: true,
        mon_notices: false,
        mon_notices_blocked: 0,
    };
    state.program_state = {};
    init_objects(state, () => 0);
    const location = state.level.at(x, y);
    const object = {
        otyp: CHEST,
        oclass: state.objects[CHEST].oc_class,
        dknown: true,
        quan: 1,
        ox: x,
        oy: y,
    };
    state.level.objects[x][y] = object;
    const cases = [
        [object_glyph_info(object, state), 'a chest.'],
        [trap_glyph_info({ ttyp: PIT }, state), 'pit.'],
        [
            terrainGlyphAt({ ...location, typ: FOUNTAIN }, x, y, state),
            'fountain.',
        ],
    ];

    for (const [glyph, suffix] of cases) {
        location.disp_glyph = null;
        location.gnew = 0;
        show_glyph_cell(x, y, glyph);
        assert.equal(
            state._glyphUpdateNotices?.at(-1)?.message,
            `(3south,6east): ${suffix}`,
        );
        await emitGlyphUpdateNotices(state, {
            pline: async () => {},
        });
    }
});

test('disabled glyph updates do not decorate ordinary render records', () => {
    const state = visibleCellState();
    state.a11y = { glyph_updates: false };
    init_objects(state, () => 0);
    const records = [
        terrainGlyphAt({ ...state.level.at(7, 4), typ: FOUNTAIN }, 7, 4, state),
        object_glyph_info({
            otyp: CHEST,
            oclass: state.objects[CHEST].oc_class,
            dknown: true,
        }, state),
        monster_glyph_info({
            data: state.mons[PM_TENGU],
            mtame: 0,
            m_ap_type: 0,
        }, state),
        trap_glyph_info({ ttyp: PIT }, state),
    ];
    for (const record of records) {
        assert.deepEqual(
            Object.getOwnPropertyNames(record).filter(
                (name) => name.startsWith('a11y'),
            ),
            [],
        );
    }
});

test('cumulative sparse notice frames retain filtered writes', async () => {
    const state = visibleCellState();
    enableGlyphNotices(state);
    const first = state.level.at(7, 4);
    const second = state.level.at(8, 4);
    const unannounced = state.level.at(9, 4);
    const third = state.level.at(10, 4);
    const fountain = terrainGlyphAt(
        { ...first, typ: FOUNTAIN },
        7,
        4,
        state,
    );
    const pit = trap_glyph_info({ ttyp: PIT }, state);
    const room = terrainGlyphAt(
        { ...unannounced, typ: ROOM },
        9,
        4,
        state,
    );
    const altar = terrainGlyphAt(
        { ...third, typ: ALTAR },
        10,
        4,
        state,
    );

    show_glyph_cell(7, 4, fountain);
    // ROOM is ineligible for a notice, but its intervening buffer write must be
    // present when the subsequent pit notice replays its cumulative frame.
    show_glyph_cell(9, 4, room);
    show_glyph_cell(8, 4, pit);
    show_glyph_cell(10, 4, altar);

    const frames = [];
    const sidecars = (glyph) => glyph
        ? Object.fromEntries(
            ['a11yIdentity', 'a11ySubject'].map((field) => [
                field,
                Object.getOwnPropertyDescriptor(glyph, field),
            ]),
        )
        : null;
    const roomSidecars = [];
    const roomSubjects = [];
    const roomGlyphs = [];
    const messages = await emitGlyphUpdateNotices(state, {
        pline: async () => {
            frames.push([
                first.disp_glyph
                    ? glyphPresentationRecord(first.disp_glyph) : null,
                second.disp_glyph
                    ? glyphPresentationRecord(second.disp_glyph) : null,
                unannounced.disp_glyph
                    ? glyphPresentationRecord(unannounced.disp_glyph) : null,
                third.disp_glyph
                    ? glyphPresentationRecord(third.disp_glyph) : null,
            ]);
            roomSidecars.push(sidecars(unannounced.disp_glyph));
            roomSubjects.push(unannounced.disp_glyph?.a11ySubject ?? null);
            roomGlyphs.push(unannounced.disp_glyph?.glyph ?? null);
        },
    });
    assert.deepEqual(messages, [
        '(3south,6east): fountain.',
        '(3south,7east): pit.',
        // terrainGlyphAt() installs the square, so the map really holds an
        // unaligned altar and js/startup_a11y.js altarDescription() names it.
        '(3south,9east): unaligned altar.',
    ]);
    assert.deepEqual(frames, [
        [glyphPresentationRecord(fountain), null, null, null],
        [
            glyphPresentationRecord(fountain),
            glyphPresentationRecord(pit),
            glyphPresentationRecord(room),
            null,
        ],
        [
            glyphPresentationRecord(fountain),
            glyphPresentationRecord(pit),
            glyphPresentationRecord(room),
            glyphPresentationRecord(altar),
        ],
    ]);
    const expectedRoomSidecars = sidecars(room);
    assert.deepEqual(
        roomSidecars,
        [null, expectedRoomSidecars, expectedRoomSidecars],
        'filtered accessibility sidecars were replayed in later frames',
    );
    const [
        beforeFilteredWrite,
        pitFrameSubject,
        altarFrameSubject,
    ] = roomSubjects;
    assert.equal(beforeFilteredWrite, null);
    assert.strictEqual(pitFrameSubject, room.a11ySubject);
    assert.strictEqual(altarFrameSubject, room.a11ySubject);
    assert.deepEqual(
        roomGlyphs,
        [null, room.glyph, room.glyph],
        'filtered logical glyph IDs were replayed in later frames',
    );
    assert.deepEqual(
        sidecars(unannounced.disp_glyph),
        expectedRoomSidecars,
        'filtered accessibility sidecars survived final-buffer restoration',
    );
    assert.strictEqual(
        unannounced.disp_glyph.a11ySubject,
        room.a11ySubject,
        'final restoration retained the mutable subject reference',
    );
    assert.equal(
        unannounced.disp_glyph.glyph,
        room.glyph,
        'final restoration retained the logical glyph ID',
    );
    assert.deepEqual(
        [first.gnew, second.gnew, unannounced.gnew, third.gnew],
        [0, 0, 0, 0],
        'all cumulative presentations were flushed by the final notice',
    );
});

test('a dirty same-identity furniture rewrite still queues a notice', async () => {
    const state = visibleCellState();
    enableGlyphNotices(state);
    const location = state.level.at(7, 4);
    const fountain = terrainGlyphAt(
        { ...location, typ: FOUNTAIN },
        7,
        4,
        state,
    );

    show_glyph_cell(7, 4, fountain);
    assert.equal(location.gnew, 1);
    show_glyph_cell(7, 4, fountain);

    assert.deepEqual(
        state._glyphUpdateNotices.map((notice) => notice.message),
        [
            '(3south,6east): fountain.',
            '(3south,6east): fountain.',
        ],
    );
    await emitGlyphUpdateNotices(state, { pline: async () => {} });
    assert.equal(location.gnew, 0);
});

test('hallucinated water notices consume hliquid display RNG in order', () => {
    const state = visibleCellState();
    enableGlyphNotices(state);
    state.u.uprops = [];
    state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
    state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
    const location = state.level.at(7, 4);
    location.typ = POOL;
    const pool = terrainGlyphAt(location, 7, 4, state);
    const seed = 0x71abn;

    initRng(seed);
    show_glyph_cell(7, 4, pool);
    const followingDraw = rn2_on_display_rng(997);

    initRng(seed);
    const liquidIndex = rn2_on_display_rng(HLIQUIDS.length + 1);
    const expectedLiquid = HLIQUIDS[liquidIndex] ?? 'water';
    const expectedFollowingDraw = rn2_on_display_rng(997);
    assert.equal(
        state._glyphUpdateNotices[0].message,
        `(3south,6east): pool of ${expectedLiquid}.`,
    );
    assert.equal(followingDraw, expectedFollowingDraw);
});

test('warning notices preserve ordinary and hallucinated display RNG', () => {
    for (const hallucinating of [false, true]) {
        const state = visibleCellState();
        enableGlyphNotices(state);
        state.context = { warnlevel: 1 };
        state.u.uprops = [];
        state.u.uprops[WARNING] = {
            intrinsic: 1,
            extrinsic: 0,
            blocked: 0,
        };
        state.u.uprops[HALLUC] = {
            intrinsic: hallucinating ? 1 : 0,
            extrinsic: 0,
        };
        state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
        state.level.monsters[7][4] = {
            data: state.mons[PM_TENGU],
            m_lev: 8,
            mpeaceful: false,
            minvis: true,
            mundetected: false,
            m_ap_type: 0,
            mx: 7,
            my: 4,
        };
        // m_lev 8 maps to warning level 2 and clears the warnlevel-1 threshold.
        // The fixed seed makes the hallucinated warning reproducible;
        // rn2(997) is a sentinel for the next draw on the display stream.
        const seed = 0x2a17n;
        initRng(seed);
        newsym(7, 4);
        const followingDraw = rn2_on_display_rng(997);

        initRng(seed);
        const warning = hallucinating
            ? rn2_on_display_rng(WARNCOUNT - 1) + 1 : 2;
        const expectedFollowingDraw = rn2_on_display_rng(997);
        assert.equal(
            state._glyphUpdateNotices[0].message,
            `(3south,6east): ${def_warnsyms[warning].desc}.`,
        );
        assert.equal(followingDraw, expectedFollowingDraw);
    }
});

test('hallucinated object notices reconstruct buffered near and far identity', () => {
    for (const near of [false, true]) {
        const x = 7;
        const y = 4;
        const state = visibleCellState({
            x,
            y,
            ux: near ? x - 1 : 1,
            uy: near ? y : 1,
        });
        enableGlyphNotices(state);
        init_objects(state, () => 0);
        state.u.uprops = [];
        state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
        state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
        state.level.objects[x][y] = {
            otyp: CHEST,
            oclass: state.objects[CHEST].oc_class,
            dknown: true,
            ox: x,
            oy: y,
        };
        const seed = 1126n; // First display draw selects POT_BOOZE.
        initRng(seed);
        const glyph = random_object_glyph_info(state);
        show_glyph_cell(x, y, glyph);
        const followingDraw = rn2_on_display_rng(997);

        initRng(seed);
        assert.equal(
            FIRST_OBJECT + rn2_on_display_rng(NUM_OBJECTS - FIRST_OBJECT),
            POT_BOOZE,
        );
        const expectedFollowingDraw = rn2_on_display_rng(997);
        const appearance = OBJ_DESCR(state.objects[POT_BOOZE], state);
        const description = near
            ? `${/^[aeiou]/iu.test(appearance) ? 'an' : 'a'} ${
                appearance
            } potion`
            : 'a potion';
        assert.ok(
            state._glyphUpdateNotices[0].message.endsWith(`${description}.`),
        );
        assert.equal(followingDraw, expectedFollowingDraw);
    }
});

test('a random statue and corpse take random_obj_to_glyph()\'s two bases',
    () => {
        const state = visibleCellState();
        init_objects(state, () => 0);
        // display.h random_obj_to_glyph() (932-936) numbers a random corpse as
        // random_monster() + GLYPH_BODY_OFF and every other random object as
        // otg_temp + GLYPH_OBJ_OFF. Neither arm asks obj_is_piletop() and
        // neither reaches statue_to_glyph(), so a random STATUE takes the
        // plain object base like any other type, which is what draws the
        // generic rock-class statue. Routing the synthetic object back through
        // object_glyph_info() instead sends otyp === STATUE to
        // statue_to_glyph(), which reads a corpsenm the synthetic object does
        // not carry; the NaN that returns reaches map_glyphinfo() as a number
        // it cannot resolve.
        const scripted = (values) => {
            let index = 0;
            return () => values[index++];
        };

        const statue = random_object_glyph_info(
            state, scripted([STATUE - FIRST_OBJECT]),
        );
        assert.equal(statue.glyph, objnum_to_glyph(STATUE));
        assert.equal(
            statue.ch, map_glyphinfo(objnum_to_glyph(STATUE), state).ch,
        );

        // The corpse arm draws the species second, and takes the plain body
        // base rather than the pile-top one. Monster row 3 is arbitrary: any
        // row separates the two bases.
        const corpsenm = 3;
        const corpse = random_object_glyph_info(
            state, scripted([CORPSE - FIRST_OBJECT, corpsenm]),
        );
        assert.equal(corpse.glyph, corpsenm + GLYPH_BODY_OFF);
    });

test('object-shaped mimic notices name buffered object classes and bodies', () => {
    const cases = [
        [POT_BOOZE, null, 'a potion', 'a brown potion'],
        [SCR_IDENTIFY, null, 'a scroll', 'a scroll labeled KERNOD WEL'],
        [GOLD_PIECE, null, 'gold pieces', 'gold pieces'],
        // zeroobj has class zero; obj_to_glyph() therefore encodes these
        // generic-by-type disguises as STRANGE_OBJECT, not mappearance.
        [DIAMOND, null, 'a strange object', 'a strange object'],
        [SPE_FORCE_BOLT, null, 'a strange object', 'a strange object'],
        [CORPSE, PM_GOBLIN, 'a goblin corpse', 'a goblin corpse'],
        [STATUE, PM_GOBLIN, 'a statue of a goblin', 'a statue of a goblin'],
    ];
    for (const near of [false, true]) {
        for (const [otyp, corpsenm, distant, adjacent] of cases) {
            const x = 7;
            const y = 4;
            const state = visibleCellState({
                x,
                y,
                ux: near ? x - 1 : 1,
                uy: near ? y : 1,
            });
            enableGlyphNotices(state);
            init_objects(state, () => 0);
            initRng(2026072413);
            const monster = {
                data: state.mons[PM_TENGU],
                mtame: 0,
                minvis: false,
                mundetected: false,
                m_ap_type: M_AP_OBJECT,
                mappearance: otyp,
                mextra: corpsenm == null ? undefined : { mcorpsenm: corpsenm },
                mx: x,
                my: y,
            };
            state.level.monsters[x][y] = monster;
            show_glyph_cell(x, y, monster_glyph_info(monster, state));
            const message = state._glyphUpdateNotices[0].message;
            const expected = near ? adjacent : distant;
            assert.ok(
                message.endsWith(`${expected}.`),
                `${otyp}: ${message}`,
            );
        }
    }
});

test('buffered goblin corpse uses the live tengu corpse of that object type', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    enableGlyphNotices(state);
    init_objects(state, () => 0);
    const pileSuccessor = {
        otyp: ARROW,
        oclass: state.objects[ARROW].oc_class,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        nexthere: null,
        nobj: null,
    };
    const listSuccessor = {
        otyp: SPEAR,
        oclass: state.objects[SPEAR].oc_class,
        where: OBJ_FLOOR,
        ox: x + 1,
        oy: y,
        nexthere: null,
        nobj: pileSuccessor,
    };
    const extra = { marker: 'object extra' };
    const liveCorpse = {
        otyp: CORPSE,
        oclass: state.objects[CORPSE].oc_class,
        corpsenm: PM_TENGU,
        dknown: true,
        quan: 1,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        nexthere: pileSuccessor,
        nobj: listSuccessor,
        timed: 0,
        oextra: extra,
    };
    state.level.objects[x][y] = liveCorpse;
    state.level.objects[x + 1][y] = listSuccessor;
    state.level.objlist = liveCorpse;
    assert.equal(
        start_timer(25, TIMER_OBJECT, ROT_CORPSE, liveCorpse, state),
        true,
    );
    const liveTimer = state.gt.timer_base;
    const buffered = object_glyph_info({
        otyp: CORPSE,
        oclass: state.objects[CORPSE].oc_class,
        corpsenm: PM_GOBLIN,
        dknown: true,
    }, state);
    // pager.c:object_from_map() matches the live object by CORPSE otyp only;
    // the goblin species in the buffered glyph does not displace the tengu.
    const seed = 2026072412;
    initRng(seed);
    const expectedFollowingDraw = rn2(997);
    initRng(seed);

    show_glyph_cell(x, y, buffered);

    assert.equal(
        state._glyphUpdateNotices[0].message,
        '(3south,6east): a tengu corpse.',
    );
    assert.equal(state.context.ident, 2);
    assert.equal(rn2(997), expectedFollowingDraw);
    assert.equal(state.level.objects[x][y], liveCorpse);
    assert.equal(state.level.objlist, liveCorpse);
    assert.equal(liveCorpse.where, OBJ_FLOOR);
    assert.equal(liveCorpse.nexthere, pileSuccessor);
    assert.equal(liveCorpse.nobj, listSuccessor);
    assert.equal(listSuccessor.nobj, pileSuccessor);
    assert.equal(liveCorpse.timed, 1);
    assert.equal(state.gt.timer_base, liveTimer);
    assert.equal(liveTimer.arg, liveCorpse);
    assert.equal(liveTimer.next, null);
    assert.equal(liveCorpse.oextra, extra);
});

test('synthetic buffered objects preserve constructor RNG and cleanup', () => {
    // These cases cover a direct mksobj(), generic-class mkobj(), and corpse
    // finalization plus timer cleanup. trace is the complete constructor draw
    // sequence, ident is next_ident state afterward, and following verifies the
    // next gameplay RNG draw after reconstruction and cleanup.
    const scenarios = [
        {
            name: 'regular',
            seed: 2026072415,
            ident: 3,
            trace: ['rnd(2)=1'],
            following: 280,
            message: '(3south,6east): a tool.',
            object: (state) => ({
                otyp: CHEST,
                oclass: state.objects[CHEST].oc_class,
                dknown: true,
            }),
        },
        {
            name: 'generic',
            seed: 2026072416,
            ident: 4,
            trace: [
                'rnd(1000)=995',
                'rnd(2)=2',
                'rn2(4)=0',
                'rn2(2)=1',
            ],
            following: 532,
            message: '(3south,6east): a potion.',
            object: (state) => ({
                otyp: POT_BOOZE,
                oclass: state.objects[POT_BOOZE].oc_class,
                dknown: false,
            }),
        },
        {
            name: 'corpse',
            seed: 2026072417,
            ident: 4,
            trace: [
                'rnd(2)=2',
                'rn2(3)=1',
                'rn2(4)=1',
                'rn2(5)=0',
                'rn2(7)=3',
                'rn2(8)=6',
                'rn2(11)=9',
                'rn2(15)=11',
                'rn2(16)=3',
                'rn2(21)=6',
                'rn2(2)=0',
                'rn2(1000)=174',
                'rn2(4)=1',
                'rne(4)=1',
                'rn2(2)=1',
                'rnz(10)=11',
            ],
            following: 91,
            message: '(3south,6east): a goblin corpse.',
            object: (state) => ({
                otyp: CORPSE,
                oclass: state.objects[CORPSE].oc_class,
                corpsenm: PM_GOBLIN,
                dknown: true,
            }),
        },
    ];
    for (const scenario of scenarios) {
        const x = 7;
        const y = 4;
        const state = visibleCellState({ x, y, ux: 1, uy: 1 });
        enableGlyphNotices(state);
        init_objects(state, () => 0);
        const glyph = object_glyph_info(scenario.object(state), state);
        initRng(scenario.seed);
        enableRngLog();

        show_glyph_cell(x, y, glyph);

        const trace = [...getRngLog()];
        const following = rn2(997);
        assert.equal(state.context.ident, scenario.ident, scenario.name);
        assert.deepEqual(trace, scenario.trace, scenario.name);
        assert.equal(following, scenario.following, scenario.name);
        assert.equal(
            state._glyphUpdateNotices[0].message,
            scenario.message,
            scenario.name,
        );
        assert.equal(state.gt.timer_base, null, scenario.name);
        assert.equal(state.level.objects[x][y], null, scenario.name);
    }
});

test('synthetic buffered names retain constructor-selected material and fruit', () => {
    const x = 7;
    const y = 4;
    const gemScenarios = [
        {
            seed: 2,
            selected: ROCK,
            trace: ['rnd(1000)=934', 'rnd(2)=1', 'rn2(6)=2'],
            message: '(3south,6east): some stones.',
        },
        {
            seed: 1,
            selected: WORTHLESS_BLACK_GLASS,
            trace: ['rnd(1000)=646', 'rnd(2)=1', 'rn2(6)=0'],
            message: '(3south,6east): some gems.',
        },
    ];
    for (const scenario of gemScenarios) {
        const state = visibleCellState({ x, y, ux: 1, uy: 1 });
        enableGlyphNotices(state);
        init_objects(state, () => 0);
        const glyph = object_glyph_info({
            otyp: DIAMOND,
            oclass: state.objects[DIAMOND].oc_class,
            dknown: false,
        }, state);
        initRng(scenario.seed);
        enableRngLog();

        show_glyph_cell(x, y, glyph);

        assert.deepEqual([...getRngLog()], scenario.trace);
        assert.equal(state.context.ident, 3);
        assert.equal(
            state._glyphUpdateNotices[0].message,
            scenario.message,
            `seed ${scenario.seed} must retain generic ${
                scenario.selected
            }'s material identity`,
        );
    }
    {
        const state = visibleCellState({ x, y, ux: 1, uy: 1 });
        enableGlyphNotices(state);
        init_objects(state, () => 0);
        state.context.current_fruit = 7;
        state.gf = {
            ffruit: {
                fname: 'dragon fruit',
                fid: 7,
                nextf: null,
            },
        };
        const glyph = object_glyph_info({
            otyp: SLIME_MOLD,
            oclass: state.objects[SLIME_MOLD].oc_class,
            dknown: true,
        }, state);
        initRng(2026072420);

        show_glyph_cell(x, y, glyph);

        assert.equal(
            state._glyphUpdateNotices[0].message,
            '(3south,6east): a dragon fruit.',
        );
    }
});

test('protected object mimics describe the buffered zeroobj identity', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    enableGlyphNotices(state);
    init_objects(state, () => 0);
    state.u.uprops = [];
    state.u.uprops[PROT_FROM_SHAPE_CHANGERS] = {
        intrinsic: 1,
        extrinsic: 0,
    };
    initRng(2026072414);
    const monster = {
        data: state.mons[PM_TENGU],
        mhp: 10,
        mtame: 0,
        minvis: false,
        mundetected: false,
        m_ap_type: M_AP_OBJECT,
        mappearance: DIAMOND,
        mx: x,
        my: y,
    };
    state.level.monsters[x][y] = monster;

    newsym(x, y);

    assert.deepEqual(
        state._glyphUpdateNotices.map((notice) => notice.message),
        ['(3south,6east): tengu, mimicking a strange object.'],
    );

    const location = state.level.at(x, y);
    location.remembered_glyph = terrainGlyphAt(
        { ...location, typ: ROOM },
        x,
        y,
        state,
    );
    assert.equal(
        describeMonster(monster, { state }),
        'tengu, mimicking something',
        'an explicit remembered non-object does not leak live mappearance',
    );
    location.remembered_glyph = { ch: ')' };
    assert.equal(
        describeMonster(monster, { state }),
        'tengu, mimicking a strange object',
        'legacy memory without semantic metadata retains its fallback',
    );
    const coinMonster = { ...monster, mappearance: GOLD_PIECE };
    state.level.monsters[x][y] = coinMonster;
    location.remembered_glyph = object_glyph_info({
        otyp: GOLD_PIECE,
        oclass: 0,
        dknown: false,
    }, state);
    assert.equal(
        describeMonster(coinMonster, { state }),
        'tengu, mimicking gold pieces',
        'mhidden_description pluralizes a two-coin synthetic disguise',
    );
    const potionMonster = { ...monster, mappearance: POT_BOOZE };
    state.level.monsters[x][y] = potionMonster;
    state.u.ux = x - 1;
    state.u.uy = y;
    location.remembered_glyph = object_glyph_info({
        otyp: POT_BOOZE,
        oclass: 0,
        dknown: false,
    }, state);
    assert.equal(
        describeMonster(potionMonster, { state }),
        'tengu, mimicking a brown potion',
        'an adjacent synthetic disguise is observed before simple naming',
    );
    assert.ok(potionMonster.m_ap_type & M_AP_F_DKNOWN);
    state.u.ux = 1;
    state.u.uy = 1;
    assert.equal(
        describeMonster(potionMonster, { state }),
        'tengu, mimicking a brown potion',
        'the remembered disguise-known flag observes later distant fakes',
    );

    state.level.flags.hero_memory = false;
    state.u.ux = 1;
    state.u.uy = 1;
    location.disp_glyph = null;
    location.remembered_glyph = null;
    state._glyphUpdateNotices = [];
    newsym(x, y);
    assert.deepEqual(
        state._glyphUpdateNotices.map((notice) => notice.message),
        ['(3south,6east): tengu, mimicking something.'],
    );
});

test('monster look-at descriptions include hidden and region suffixes', () => {
    const state = visibleCellState({ x: 7, y: 4, ux: 6, uy: 4 });
    enableGlyphNotices(state);
    init_objects(state, () => 0);
    const monster = (species, overrides = {}) => ({
        data: state.mons[species],
        mtame: 0,
        minvis: false,
        mundetected: true,
        m_ap_type: 0,
        mx: 7,
        my: 4,
        ...overrides,
    });
    assert.match(
        describeMonster(monster(PM_ROCK_PIERCER), { state }),
        /, hiding on the ceiling$/u,
    );
    assert.match(
        describeMonster(monster(PM_LURKER_ABOVE), { state }),
        /, hiding on the ceiling$/u,
    );

    state.level.objects[7][4] = {
        otyp: CHEST,
        oclass: state.objects[CHEST].oc_class,
        dknown: true,
        ox: 7,
        oy: 4,
    };
    assert.match(
        describeMonster(monster(PM_GARTER_SNAKE), { state }),
        /, hiding under a chest$/u,
        'metadata-absent memory retains the live-object fallback',
    );

    const location = state.level.at(7, 4);
    location.remembered_glyph = terrainGlyphAt(location, 7, 4, state);
    assert.match(
        describeMonster(monster(PM_GARTER_SNAKE), { state }),
        /, hiding under something$/u,
        'explicit remembered terrain suppresses the live-object fallback',
    );

    state.objects[POT_BOOZE].oc_name_known = true;
    const potions = {
        otyp: POT_BOOZE,
        oclass: state.objects[POT_BOOZE].oc_class,
        dknown: true,
        quan: 2,
        where: OBJ_FLOOR,
        ox: 7,
        oy: 4,
        nexthere: null,
    };
    state.level.objects[7][4] = potions;
    location.remembered_glyph = object_glyph_info(potions, state);
    assert.match(
        describeMonster(monster(PM_GARTER_SNAKE), { state }),
        /, hiding under potions of booze$/u,
        'simpleonames pluralizes the noun before a compound suffix',
    );

    const corpse = {
        otyp: CORPSE,
        oclass: state.objects[CORPSE].oc_class,
        corpsenm: PM_GOBLIN,
        dknown: true,
        quan: 1,
        where: OBJ_FLOOR,
        ox: 7,
        oy: 4,
        nexthere: null,
    };
    state.level.objects[7][4] = corpse;
    location.remembered_glyph = object_glyph_info(corpse, state);
    assert.match(
        describeMonster(monster(PM_GARTER_SNAKE), { state }),
        /, hiding under a corpse$/u,
        'minimal_xname suppresses the hidden corpse species',
    );
    assert.equal(
        _startupA11yInternals.describeObject(corpse, state),
        'a goblin corpse',
        'full object descriptions retain the corpse species',
    );

    const cloud = create_region();
    add_rect_to_reg(cloud, { lx: 7, ly: 4, hx: 7, hy: 4 });
    cloud.visible = true;
    cloud.glyph_cmap = S_poisoncloud;
    add_region(cloud, state, { deferVisual: true });
    assert.match(
        describeMonster(monster(PM_TENGU, { mundetected: false }), { state }),
        /, in a cloud of poison gas$/u,
    );
});

test('fruit object descriptions preserve source articles and plural order', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: x - 1, uy: y });
    enableGlyphNotices(state);
    init_objects(state, () => 0);
    state.artilist = createArtifactTable();
    state.gf = {
        ffruit: {
            fname: 'Excalibur',
            fid: 7,
            nextf: null,
        },
    };
    const fruit = {
        otyp: SLIME_MOLD,
        oclass: state.objects[SLIME_MOLD].oc_class,
        spe: 7,
        dknown: true,
        quan: 1,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        nexthere: null,
    };
    const hider = {
        data: state.mons[PM_GARTER_SNAKE],
        mtame: 0,
        minvis: false,
        mundetected: true,
        m_ap_type: 0,
        mx: x,
        my: y,
    };
    state.level.objects[x][y] = fruit;
    const location = state.level.at(x, y);
    location.remembered_glyph = object_glyph_info(fruit, state);

    state.gf.ffruit.fname = 'the eXcALiBuR';
    assert.equal(
        _startupA11yInternals.describeObject(fruit, state),
        'the eXcALiBuR',
        'candidate-side the is ignored while matching canonical Excalibur',
    );
    assert.match(
        describeMonster(hider, { state }),
        /, hiding under the eXcALiBuR$/u,
    );

    state.gf.ffruit.fname = 'eXcALiBuR';
    assert.equal(
        _startupA11yInternals.describeObject(fruit, state),
        'eXcALiBuR',
        'fake-artifact lookup ignores case and omits an indefinite article',
    );
    assert.match(
        describeMonster(hider, { state }),
        /, hiding under an eXcALiBuR$/u,
        'hidden simple naming still applies an() to case-varied Excalibur',
    );

    fruit.greased = true;
    assert.equal(
        _startupA11yInternals.describeObject(fruit, state),
        'greased eXcALiBuR',
        'artifact-fruit lookup precedes outer doname modifiers',
    );

    state.gf.ffruit.fname = 'orb of detection';
    assert.equal(
        _startupA11yInternals.describeObject(fruit, state),
        'the greased orb of detection',
        'canonical artifact the is optional during lookup and forced outside modifiers',
    );
    fruit.greased = false;
    state.gf.ffruit.fname = 'The Orb of Detection';
    assert.equal(
        _startupA11yInternals.describeObject(fruit, state),
        'the Orb of Detection',
        'full fake-artifact fruit forces its canonical definite article',
    );
    assert.match(
        describeMonster(hider, { state }),
        /, hiding under The Orb of Detection$/u,
        'hidden an() suppresses a second article before an existing the',
    );

    state.gf.ffruit.fname = 'the ordinary fruit';
    assert.match(
        describeMonster(hider, { state }),
        /, hiding under the ordinary fruit$/u,
        'just_an suppresses an added article for non-artifact names too',
    );

    state.gf.ffruit.fname = 'pair of boots';
    fruit.greased = true;
    fruit.quan = 2;
    assert.equal(
        _startupA11yInternals.describeObject(fruit, state),
        '2 greased pair of boots',
        'fruit pluralization precedes outer doname modifiers',
    );
    show_glyph_cell(x, y, object_glyph_info(fruit, state));
    assert.equal(
        state._glyphUpdateNotices.at(-1).message,
        '(east): 2 greased pair of boots.',
    );

    state.gf.ffruit.fname = 'blueberries';
    fruit.greased = false;
    assert.equal(
        _startupA11yInternals.describeObject(fruit, state),
        '2 blueberries',
        'already-plural fruit is singularized before being pluralized again',
    );
    location.remembered_glyph = object_glyph_info(fruit, state);
    assert.match(
        describeMonster(hider, { state }),
        /, hiding under blueberries$/u,
    );

    state.gf.ffruit.fname = 'foo@';
    assert.equal(
        _startupA11yInternals.describeObject(fruit, state),
        '2 foo@s',
        "NetHack's letter() treats @ as a pluralizable letter",
    );
    location.remembered_glyph = object_glyph_info(fruit, state);
    assert.match(
        describeMonster(hider, { state }),
        /, hiding under foo@s$/u,
    );
});

test('glyph update identity ignores pile highlighting', async () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    state.a11y = {
        accessiblemsg: false,
        glyph_updates: true,
        mon_notices: false,
        mon_notices_blocked: 0,
    };
    state.program_state = {};
    state.iflags = {
        wc_color: true,
        wc_inverse: true,
        hilite_pile: false,
    };
    const object = {
        otyp: ARROW,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        nexthere: { otyp: SPEAR },
    };
    state.level.objects[x][y] = object;
    const location = state.level.at(x, y);

    show_glyph_cell(x, y, object_glyph_info(object, state));
    await emitGlyphUpdateNotices(state, { pline: async () => {} });
    assert.equal(location.gnew, 0);

    state.iflags.hilite_pile = true;
    show_glyph_cell(x, y, object_glyph_info(object, state));

    assert.equal(location.disp_glyph.attr, ATR_INVERSE);
    assert.deepEqual(
        state._glyphUpdateNotices,
        [],
        'glyph flags can dirty gbuf without changing its numeric glyph',
    );
});

test('docrt suppresses glyph notices for its entire redraw', async () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    state.a11y = {
        accessiblemsg: false,
        glyph_updates: true,
        mon_notices: false,
        mon_notices_blocked: 0,
    };
    state.program_state = {};
    state.u.uprops = [];
    state.u.uprops[PROT_FROM_SHAPE_CHANGERS] = {
        intrinsic: 1,
        extrinsic: 0,
    };
    state.level.monsters[x][y] = {
        data: state.mons[PM_TENGU],
        mhp: 10,
        mtame: 0,
        minvis: false,
        mundetected: false,
        m_ap_type: M_AP_MONSTER,
        mappearance: PM_GOBLIN,
        mx: x,
        my: y,
    };

    await docrt();

    assert.equal(state.program_state.in_docrt, false);
    assert.deepEqual(state._glyphUpdateNotices ?? [], []);
});

test('hallucinated monster glyph notices consume rndmonnam display RNG', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    state.a11y = {
        accessiblemsg: false,
        glyph_updates: true,
        mon_notices: false,
        mon_notices_blocked: 0,
    };
    state.program_state = {};
    state.u.uprops = [];
    state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
    state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
    const monster = {
        data: state.mons[PM_TENGU],
        mhp: 10,
        mtame: 0,
        minvis: true,
        mundetected: false,
        m_ap_type: 0,
        mx: x,
        my: y,
    };
    const seed = 0x5a17n;

    initRng(seed);
    show_glyph_cell(x, y, monster_glyph_info(monster, state));
    const followingDraw = rn2_on_display_rng(997);

    initRng(seed);
    rn2_on_display_rng(NUMMONS); // hallucinated on-map species
    const expectedName = rndmonnam({ state });
    const expectedFollowingDraw = rn2_on_display_rng(997);

    assert.equal(
        state._glyphUpdateNotices?.[0]?.message,
        `(3south,6east): invisible ${expectedName}.`,
    );
    assert.equal(followingDraw, expectedFollowingDraw);
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
    assert.equal(
        remembered_glyph_presentation(
            state.level.at(x, y).remembered_glyph, state,
        ).ch,
        '(',
    );
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
    // display.h generic_obj_to_glyph() numbers a generic object by its class,
    // and display_monster()'s zeroobj has class zero, so the glyph is
    // GLYPH_OBJ_OFF itself -- objects[STRANGE_OBJECT]. That row's oc_class is
    // ILLOBJ_CLASS rather than zero (include/objects.h:78-83 says so in as
    // many words), so reset_glyphmap()'s object arm draws the strange-object
    // ']' rather than the RANDOM_CLASS symbol. objects[STRANGE_OBJECT]'s
    // oc_color is CLR_BLACK, which recorderMapColor() folds onto the
    // terminal default.
    const genericZeroClass = {
        ch: object_class_symbol(ILLOBJ_CLASS, state, STRANGE_OBJECT).ch,
        color: NO_COLOR,
        dec: false,
    };
    // display.h obj_to_glyph() numbers a generic object into the range
    // glyph_is_generic_object() recognizes, and every case here into the wider
    // range glyph_is_object() recognizes. The number rides the presentation
    // non-enumerably, so deepEqual below compares the drawn fields and the
    // glyph_is_* assertions compare the number.
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
        { otyp: DIAMOND, expected: genericZeroClass, generic: true },
        { otyp: SPE_FORCE_BOLT, expected: genericZeroClass, generic: true },
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

    for (const { otyp, expected, generic, mcorpsenm } of cases) {
        fake.mappearance = otyp;
        fake.mextra = mcorpsenm === undefined ? null : { mcorpsenm };
        const presented = monster_glyph_info(fake, state);
        assert.deepEqual(presented, expected, `${otyp}`);
        assert.equal(glyph_is_object(presented.glyph), true, `${otyp}`);
        // obj_is_generic() and glyph_is_generic_object() disagree here, and
        // C makes them: the zeroobj passes the first by otyp, but its class
        // is zero, so generic_obj_to_glyph() lands on GLYPH_OBJ_OFF itself,
        // which the second excludes with `> GLYPH_OBJ_OFF`.
        assert.equal(
            presented.glyph === GLYPH_OBJ_OFF, Boolean(generic), `${otyp}`,
        );
        assert.equal(
            glyph_is_generic_object(presented.glyph), false, `${otyp}`,
        );
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
        assert.equal(
            state.level.at(x, y).remembered_glyph.glyph, presented.glyph,
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
        object_class_symbol(ILLOBJ_CLASS, state, STRANGE_OBJECT).ch,
    );
    assert.equal(state.level.at(x, y).disp_color, NO_COLOR);
    assert.equal(
        remembered_glyph_presentation(
            state.level.at(x, y).remembered_glyph, state,
        ).ch,
        object_class_symbol(ILLOBJ_CLASS, state, STRANGE_OBJECT).ch,
    );
    // display.h glyph_is_generic_object(): class zero is GLYPH_OBJ_OFF
    // itself, which the macro's `> GLYPH_OBJ_OFF` term excludes.
    assert.equal(
        state.level.at(x, y).remembered_glyph.glyph, GLYPH_OBJ_OFF,
    );
    assert.equal(
        glyph_is_generic_object(state.level.at(x, y).remembered_glyph.glyph),
        false,
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
    const remembered = remembered_glyph_presentation(
        state.level.at(x, y).remembered_glyph, state,
    );
    assert.equal(remembered.ch, '+');
    assert.equal(remembered.color, CLR_BROWN);
    assert.equal(state.level.lastseentyp[x][y], DOOR);
});

test('a visible gas region covers the hero without refreshing map memory', () => {
    const state = resetGame();
    const x = 7;
    const y = 4;
    state.level = new GameMap();
    state.level.at(x, y).typ = ROOM;
    // Any glyph a region draw would not write for itself, so an untouched
    // memory is visible as such. cmap_to_glyph(S_fountain) is arbitrary.
    const priorMemory = cmap_to_glyph(S_fountain, state);
    state.level.at(x, y).remembered_glyph = { glyph: priorMemory };
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
    cloud.glyph_cmap = S_cloud;
    add_region(cloud, state, { deferVisual: true });

    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, '#');
    assert.equal(state.level.at(x, y).remembered_glyph.glyph, priorMemory);
});

test('gas colors and ordinary/disguised monster precedence follow newsym', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    const cloud = create_region();
    add_rect_to_reg(cloud, { lx: x, ly: y, hx: x, hy: y });
    cloud.visible = true;
    cloud.glyph_cmap = S_cloud;
    add_region(cloud, state, { deferVisual: true });

    newsym(x, y);
    assert.deepEqual(
        [state.level.at(x, y).disp_ch, state.level.at(x, y).disp_color],
        ['#', NO_COLOR],
    );

    cloud.arg = 1;
    cloud.glyph_cmap = S_poisoncloud;
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

test('a remembered marker overrides gas with no monster to prefer', () => {
    // display.c mon_overrides_region()'s closing line (697-699): with no
    // monster to prefer, `glyph_is_invisible(levl[mx][my].glyph)` still
    // answers TRUE, so a cloud drifting over a remembered 'I' does not erase
    // it. The negative row is the one that keeps the positive from passing for
    // the wrong reason.
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    const location = state.level.at(x, y);
    const cloud = create_region();
    add_rect_to_reg(cloud, { lx: x, ly: y, hx: x, hy: y });
    cloud.visible = true;
    cloud.glyph_cmap = S_cloud;
    add_region(cloud, state, { deferVisual: true });

    newsym(x, y);
    assert.equal(location.disp_ch, '#');

    map_invisible(x, y, state);
    newsym(x, y);
    assert.equal(location.disp_ch, 'I');
    assert.equal(location.remembered_glyph.glyph, GLYPH_INVISIBLE);
});

test('generic monster warning overrides gas without hiding a visible monster', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    state.u.uprops = [];
    state.u.uprops[WARNING] = {
        intrinsic: 1,
        extrinsic: 0,
        blocked: 0,
    };
    state.context = { warnlevel: 1 };
    const cloud = create_region();
    add_rect_to_reg(cloud, { lx: x, ly: y, hx: x, hy: y });
    cloud.visible = true;
    cloud.glyph_cmap = S_poisoncloud;
    cloud.arg = 1;
    add_region(cloud, state, { deferVisual: true });
    const monster = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        mhp: 10,
        m_lev: 8, // warning_of() maps level 8 to warning glyph 2.
        mpeaceful: false,
        m_ap_type: 0,
        minvis: true,
        mundetected: false,
        mx: x,
        my: y,
    };
    state.level.monsters[x][y] = monster;
    // Squared distance 45 is below mon_warning()'s 100 cutoff but outside the
    // adjacent-visible-monster override, whose fresh xray radius is one.

    assert.equal(newsym(x, y), undefined);
    assert.deepEqual(
        [state.level.at(x, y).disp_ch, state.level.at(x, y).disp_color],
        ['2', CLR_RED],
        'an unseen dangerous monster floats its warning above gas',
    );

    monster.minvis = false;
    assert.equal(newsym(x, y), undefined);
    assert.deepEqual(
        [state.level.at(x, y).disp_ch, state.level.at(x, y).disp_color],
        ['f', CLR_WHITE],
        'ordinary physical visibility takes precedence over warning',
    );
});

test('see invisible keeps a warned detected mimic physically visible', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    state.u.uprops = [];
    state.u.uprops[SEE_INVIS] = { intrinsic: 1, extrinsic: 0 };
    state.u.uprops[WARNING] = { intrinsic: 1, extrinsic: 0 };
    state.context = { warnlevel: 1 };
    state.iflags ??= {};
    state.iflags.wc_inverse = true;
    const monster = {
        data: state.mons[PM_TENGU],
        mhp: 10,
        m_lev: 8, // warning_of() maps level 8 to warning glyph 2.
        mpeaceful: false,
        mtame: 0,
        minvis: true,
        mundetected: false,
        m_ap_type: M_AP_OBJECT,
        mappearance: CHEST,
        mx: x,
        my: y,
    };
    state.level.monsters[x][y] = monster;
    const disguise = monster_glyph_info(monster, state);
    const actual = monster_glyph_info({
        ...monster,
        m_ap_type: 0,
    }, state);

    newsym(x, y);
    assert.deepEqual(
        [
            state.level.at(x, y).disp_ch,
            state.level.at(x, y).disp_color,
            state.level.at(x, y).disp_attr,
        ],
        [disguise.ch, disguise.color, disguise.attr ?? 0],
        'physical visibility shows an unsensed disguise instead of warning',
    );

    state.u.uprops[DETECT_MONSTERS] = { intrinsic: 1, extrinsic: 0 };
    newsym(x, y);
    assert.deepEqual(
        [
            state.level.at(x, y).disp_ch,
            state.level.at(x, y).disp_color,
            state.level.at(x, y).disp_attr,
        ],
        [actual.ch, actual.color, actual.attr ?? 0],
        'detection defeats the physically visible disguise without inversion',
    );
    assert.equal(
        remembered_glyph_presentation(
            state.level.at(x, y).remembered_glyph, state,
        ).ch,
        disguise.ch,
        'PHYSICALLY_SEEN retains the mimic disguise in map memory',
    );

    state.u.uprops[SEE_INVIS] = { intrinsic: 0, extrinsic: 0 };
    newsym(x, y);
    assert.deepEqual(
        [
            state.level.at(x, y).disp_ch,
            state.level.at(x, y).disp_color,
            state.level.at(x, y).disp_attr,
        ],
        [actual.ch, actual.color, ATR_INVERSE],
        'detection alone uses detected presentation',
    );
    assert.equal(
        remembered_glyph_presentation(
            state.level.at(x, y).remembered_glyph, state,
        ).ch,
        '.',
        'DETECTED retains the underlying terrain rather than the disguise',
    );
});

test('detected monsters preserve tame and hallucination display-RNG rules', () => {
    const cases = [
        { tame: false, hallucination: null },
        { tame: true, hallucination: null },
        { tame: false, hallucination: 'intrinsic' },
        { tame: true, hallucination: 'intrinsic' },
        {
            tame: false,
            hallucination: 'intrinsic',
            resistance: 'intrinsic',
        },
        {
            tame: true,
            hallucination: 'intrinsic',
            resistance: 'extrinsic',
        },
        { tame: false, hallucination: 'extrinsic' },
        { tame: true, hallucination: 'extrinsic' },
    ];
    for (const [
        caseIndex,
        { tame, hallucination, resistance },
    ] of cases.entries()) {
        const x = 7;
        const y = 4;
        const state = visibleCellState({ x, y, ux: 1, uy: 1 });
        state.iflags ??= {};
        state.iflags.wc_inverse = true;
        state.iflags.wc_hilite_pet = true;
        state.iflags.wc2_petattr = ATR_UNDERLINE;
        state.u.uprops = [];
        state.u.uprops[DETECT_MONSTERS] = { intrinsic: 1, extrinsic: 0 };
        if (hallucination) {
            state.u.uprops[HALLUC] = {
                intrinsic: hallucination === 'intrinsic' ? 1 : 0,
                extrinsic: hallucination === 'extrinsic' ? 1 : 0,
            };
        }
        if (resistance) {
            state.u.uprops[HALLUC_RES] = {
                intrinsic: resistance === 'intrinsic' ? 1 : 0,
                extrinsic: resistance === 'extrinsic' ? 1 : 0,
            };
        }
        const monster = {
            data: state.mons[PM_TENGU],
            mhp: 10,
            mtame: tame ? 10 : 0,
            minvis: true,
            mundetected: false,
            m_ap_type: 0,
            mx: x,
            my: y,
        };
        state.level.monsters[x][y] = monster;

        // Distinct fixed seeds make each case reproducible; the first two
        // NUMMONS draws establish both the displayed identity and stream tail.
        const seed = 2026072400 + caseIndex;
        initRng(seed);
        const randomMonster = rn2_on_display_rng(NUMMONS);
        const followingDraw = rn2_on_display_rng(NUMMONS);
        initRng(seed);

        newsym(x, y);

        const effectiveHallucination = hallucination === 'intrinsic'
            && !resistance;
        const expectedMonster = effectiveHallucination
            ? {
                ...monster,
                data: state.mons[randomMonster],
                mtame: 0,
            }
            : monster;
        if (effectiveHallucination)
            state.u.uprops[HALLUC].intrinsic = 0;
        const expected = monster_glyph_info(expectedMonster, state);
        if (effectiveHallucination)
            state.u.uprops[HALLUC].intrinsic = 1;
        const expectedAttr = tame && !effectiveHallucination
            ? ATR_UNDERLINE : ATR_INVERSE;
        const label = `tame=${tame}, hallucination=${hallucination ?? 'none'}, `
            + `resistance=${resistance ?? 'none'}`;
        assert.deepEqual(
            [
                state.level.at(x, y).disp_ch,
                state.level.at(x, y).disp_color,
                state.level.at(x, y).disp_attr,
            ],
            [expected.ch, expected.color, expectedAttr],
            label,
        );
        assert.equal(
            rn2_on_display_rng(NUMMONS),
            effectiveHallucination ? followingDraw : randomMonster,
            `display RNG order for ${label}`,
        );
    }
});

test('monster_glyph_info directly owns one hallucinated species draw', () => {
    const state = visibleCellState();
    state.u.uprops = [];
    state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
    const monster = {
        data: state.mons[PM_TENGU],
        mtame: 0,
        m_ap_type: 0,
    };
    const seed = 2026072407;
    initRng(seed);
    const randomMonster = rn2_on_display_rng(NUMMONS);
    const followingDraw = rn2_on_display_rng(NUMMONS);
    initRng(seed);

    const glyph = monster_glyph_info(monster, state);

    state.u.uprops[HALLUC].intrinsic = 0;
    const expected = monster_glyph_info({
        ...monster,
        data: state.mons[randomMonster],
    }, state);
    state.u.uprops[HALLUC].intrinsic = 1;
    assert.deepEqual(glyph, expected);
    assert.equal(glyph.attr, undefined);
    assert.equal(rn2_on_display_rng(NUMMONS), followingDraw);
});

test('physical sight owns hallucinated monster presentation over detection', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });
    state.u.uprops = [];
    state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
    state.u.uprops[SEE_INVIS] = { intrinsic: 1, extrinsic: 0 };
    state.u.uprops[DETECT_MONSTERS] = { intrinsic: 1, extrinsic: 0 };
    state.iflags ??= {};
    state.iflags.wc_inverse = true;
    const monster = {
        data: state.mons[PM_TENGU],
        mhp: 10,
        mtame: 0,
        minvis: true,
        mundetected: false,
        m_ap_type: 0,
        mx: x,
        my: y,
    };
    state.level.monsters[x][y] = monster;

    const seed = 2026072406;
    initRng(seed);
    const randomMonster = rn2_on_display_rng(NUMMONS);
    const followingDraw = rn2_on_display_rng(NUMMONS);
    initRng(seed);

    newsym(x, y);

    state.u.uprops[HALLUC].intrinsic = 0;
    const expected = monster_glyph_info({
        ...monster,
        data: state.mons[randomMonster],
    }, state);
    state.u.uprops[HALLUC].intrinsic = 1;
    assert.deepEqual(
        [
            state.level.at(x, y).disp_ch,
            state.level.at(x, y).disp_color,
            state.level.at(x, y).disp_attr,
        ],
        [expected.ch, expected.color, expected.attr ?? 0],
        'physically seen hallucinated monsters do not use inverse detection',
    );
    assert.equal(
        rn2_on_display_rng(NUMMONS),
        followingDraw,
        'the physical presentation consumes one display-RNG species draw',
    );
});

test('show_glyph_cell accepts presentation records, not map-memory records', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y });

    assert.throws(
        () => show_glyph_cell(x, y, {
            ch: 'x',
            color: CLR_RED,
            decgfx: true,
        }),
        /show_glyph_cell requires a glyph-presentation record/u,
    );
    show_glyph_cell(x, y, { ch: 'x', color: CLR_RED, dec: true });
    assert.deepEqual(
        [
            state.level.at(x, y).disp_ch,
            state.level.at(x, y).disp_color,
            state.level.at(x, y).disp_decgfx,
        ],
        ['x', CLR_RED, true],
    );
});

test('show_glyph_cell retains a non-enumerable logical monster glyph', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y });
    const presentation = monster_glyph_info({
        data: state.mons[PM_TENGU],
        female: false,
        mtame: 10,
    }, state);

    assert.equal(
        presentation.glyph,
        GLYPH_PET_MALE_OFF + PM_TENGU,
    );
    assert.equal(
        Object.getOwnPropertyDescriptor(presentation, 'glyph').enumerable,
        false,
    );
    show_glyph_cell(x, y, presentation);

    const buffered = state.level.at(x, y).disp_glyph;
    assert.equal(buffered.glyph, presentation.glyph);
    assert.equal(
        Object.getOwnPropertyDescriptor(buffered, 'glyph').enumerable,
        false,
    );
    assert.deepEqual(buffered, glyphPresentationRecord(presentation));
});

test('show_glyph_cell retains each complete ordered presentation', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y });
    const location = state.level.at(x, y);
    const glyphWrites = captureDisplayWrites(location);
    const presentations = [
        {
            ch: 'i',
            color: CLR_RED,
            dec: false,
            attr: ATR_NONE,
        },
        {
            ch: 'i',
            color: CLR_YELLOW,
            dec: true,
            attr: ATR_UNDERLINE,
            displayCh: 'ı',
            displayColor: CLR_BRIGHT_BLUE,
        },
        {
            ch: null,
            color: CLR_WHITE,
            dec: false,
            attr: ATR_BOLD,
            displayCh: '☃',
            displayColor: CLR_BRIGHT_GREEN,
            rgb: [12, 34, 56],
        },
    ];

    for (const presentation of presentations)
        show_glyph_cell(x, y, presentation);

    assert.deepEqual(
        glyphWrites,
        presentations.map(glyphPresentationRecord),
        'same-character style changes and browser-only glyphs remain distinct',
    );
    assert.equal(
        location.disp_ch,
        'i',
        'a null recorder glyph preserves the prior recorder-facing character',
    );
    assert.deepEqual(location.disp_glyph, glyphPresentationRecord(
        presentations.at(-1),
    ));
});

test('newsym is side-effect-only for ordinary, hero, and gas updates', () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y, ux: 1, uy: 1 });

    assert.equal(newsym(x, y), undefined);
    assert.equal(state.level.at(x, y).disp_ch, '.');

    state.u.ux = x;
    state.u.uy = y;
    assert.equal(newsym(x, y), undefined);
    assert.equal(
        state.level.at(x, y).disp_ch,
        hero_glyph_info(state).ch,
    );

    state.u.ux = 1;
    state.u.uy = 1;
    const cloud = create_region();
    add_rect_to_reg(cloud, { lx: x, ly: y, hx: x, hy: y });
    cloud.visible = true;
    cloud.glyph_cmap = S_cloud;
    add_region(cloud, state, { deferVisual: true });
    assert.equal(newsym(x, y), undefined);
    assert.equal(state.level.at(x, y).disp_ch, '#');
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
    // display.c reset_glyphmap()'s object arm reads objects[offset], where
    // the offset is the glyph number's index: oc_class picks the symbol and
    // oc_color the colour.
    state.objects[42] = { oc_class: WEAPON_CLASS, oc_color: CLR_YELLOW };
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
    assert.deepEqual(
        remembered_glyph_presentation(
            state.level.at(x, y).remembered_glyph, state,
        ),
        {
            ch: '`',
            color: CLR_BRIGHT_BLUE,
            dec: false,
        },
    );

    state.level.objects[x][y] = { otyp: 42, oclass: WEAPON_CLASS };
    newsym(x, y);
    assert.equal(engraving.erevealed, true);
    assert.equal(state.level.at(x, y).disp_ch, ')');
    assert.equal(
        remembered_glyph_presentation(
            state.level.at(x, y).remembered_glyph, state,
        ).ch,
        ')',
    );

    state.level.objects[x][y] = null;
    state.level.at(x, y).typ = CORR;
    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_ch, '#');
    assert.equal(state.level.at(x, y).disp_color, CLR_BRIGHT_BLUE);
    assert.equal(state.level.at(x, y).disp_attr, ATR_INVERSE);
    assert.equal(
        remembered_glyph_presentation(
            state.level.at(x, y).remembered_glyph, state,
        ).attr,
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

test('flush_screen preserves final map attributes for recorder and browser cells', async () => {
    const x = 7;
    const y = 4;
    const state = visibleCellState({ x, y });
    state.nhDisplay = new GameDisplay(null);
    state.level.flags.hero_memory = true;
    const gridCell = () => state.nhDisplay.grid[y + 1][x - 1];

    state.iflags = {
        wc_color: true,
        wc_hilite_pet: true,
        wc2_petattr: ATR_BOLD,
    };
    state.level.monsters[x][y] = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        mtame: 10,
        minvis: false,
        mundetected: false,
        mx: x,
        my: y,
    };
    newsym(x, y);
    await flush_screen(1);
    assert.deepEqual(gridCell(), {
        ch: 'f', color: CLR_WHITE, attr: ATR_BOLD,
    });

    state.level.monsters[x][y] = null;
    const lower = { otyp: SPEAR };
    state.level.objects[x][y] = {
        otyp: ARROW,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        nexthere: lower,
    };
    state.iflags.hilite_pile = true;
    state.iflags.wc_inverse = true;
    newsym(x, y);
    await flush_screen(1);
    assert.deepEqual(gridCell(), {
        ch: ')', color: state.objects[ARROW].oc_color, attr: ATR_INVERSE,
    });

    state.level.objects[x][y] = null;
    state.level.at(x, y).typ = LAVAPOOL;
    state.iflags = { wc_color: false, wc_inverse: true };
    newsym(x, y);
    await flush_screen(1);
    assert.deepEqual(gridCell(), {
        ch: '}', color: NO_COLOR, attr: ATR_INVERSE,
    });

    state.level.at(x, y).typ = CORR;
    state.iflags = { wc_color: true, wc_inverse: true };
    const engraving = make_engr_at(
        x, y, 'final grid', null, 0, DUST, { state },
    );
    newsym(x, y);
    await flush_screen(1);
    assert.equal(engraving.erevealed, true);
    assert.deepEqual(gridCell(), {
        ch: '#', color: CLR_BRIGHT_BLUE, attr: ATR_INVERSE,
    });

    state.viz_array[y][x] = 0;
    newsym(x, y);
    await flush_screen(1);
    assert.deepEqual(gridCell(), {
        ch: '#', color: CLR_BRIGHT_BLUE, attr: ATR_INVERSE,
    }, 'remembered engraving retains its presentation attributes');

    state.viz_array[y][x] = 0x2;
    const enhanced = parseNethackrc('OPTIONS=symset:Enhanced1');
    state.iflags = { ...enhanced.iflags, wc_inverse: true };
    initialize_symbols_from_options(enhanced, state);
    newsym(x, y);
    const browserCharacter = state.level.at(x, y).disp_browser_ch;
    assert.ok(browserCharacter);
    enableBrowserGlyphProjection(state.nhDisplay);
    await flush_screen(1);
    assert.deepEqual(gridCell(), {
        ch: browserCharacter,
        color: state.level.at(x, y).disp_browser_color,
        attr: ATR_INVERSE,
    });
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
    // display.c reset_glyphmap()'s object arm reads objects[offset], where
    // the offset is the glyph number's index: oc_class picks the symbol and
    // oc_color the colour.
    state.objects[42] = { oc_class: WEAPON_CLASS, oc_color: CLR_YELLOW };
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
    assert.equal(
        remembered_glyph_presentation(
            state.level.at(x, y).remembered_glyph, state,
        ).ch,
        '^',
    );

    trap.ttyp = PIT;
    state.iflags ??= {};
    state.iflags.wc2_darkgray = true;
    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_color, NO_COLOR);
    state.iflags.wc2_darkgray = false;
    newsym(x, y);
    assert.equal(state.level.at(x, y).disp_color, NO_COLOR);
    trap.ttyp = LANDMINE;

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
    assert.equal(state.level.lastseentyp[x][y], CORR);

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

    const unknown = object_glyph_info(potion, state);
    assert.deepEqual(unknown, { ch: '!', color: NO_COLOR, dec: false });
    // display.h generic_obj_to_glyph() numbers this by class, into the range
    // display.c see_nearby_objects() reads back out of map memory to decide
    // whether a nearer look needs a redraw, and within the wider range
    // dogmove.c dog_move() asks glyph_is_object() about.
    assert.equal(unknown.glyph, GLYPH_OBJ_OFF + POTION_CLASS);
    assert.equal(glyph_is_generic_object(unknown.glyph), true);
    assert.equal(glyph_is_object(unknown.glyph), true);

    potion.dknown = true;
    const known = object_glyph_info(potion, state);
    assert.deepEqual(known, {
        ch: '!',
        color: state.objects[POT_BOOZE].oc_color,
        dec: false,
    });
    // An identified potion leaves the generic range but stays an object,
    // because normal_obj_to_glyph() numbers it by otyp instead.
    assert.equal(known.glyph, GLYPH_OBJ_OFF + POT_BOOZE);
    assert.equal(glyph_is_generic_object(known.glyph), false);
    assert.equal(glyph_is_object(known.glyph), true);
});

// ── display.h object glyph ranges ──
//
// Every predicate below is a transcription of a display.h macro, and the only
// thing that can be wrong about a transcription is a bound. Each case is one
// glyph number at a bound, chosen from the macro's own text: the first number
// the macro admits, the last, and the one on each side of them. NUMMONS,
// NUM_OBJECTS and FIRST_OBJECT are the widths display.h uses, and they come
// from the generated tables rather than from literals here, so a count that
// moves moves the cases with it.

// Each row is [predicate name, the macro's text, the numbers it admits and
// the numbers on either side]. `true` and `false` are the answers read off
// the macro at include/display.h:814-879.
function glyphRangeCases() {
    return [
        // glyph_is_body_piletop(): >= GLYPH_BODY_PILETOP_OFF and
        // < GLYPH_BODY_PILETOP_OFF + NUMMONS.
        [glyph_is_body_piletop, [
            [GLYPH_BODY_PILETOP_OFF - 1, false],
            [GLYPH_BODY_PILETOP_OFF, true],
            [GLYPH_BODY_PILETOP_OFF + NUMMONS - 1, true],
            [GLYPH_BODY_PILETOP_OFF + NUMMONS, false],
        ]],
        // glyph_is_body(): the same over GLYPH_BODY_OFF, or the piletop range.
        [glyph_is_body, [
            [GLYPH_BODY_OFF - 1, false],
            [GLYPH_BODY_OFF, true],
            [GLYPH_BODY_OFF + NUMMONS - 1, true],
            [GLYPH_BODY_OFF + NUMMONS, false],
            [GLYPH_BODY_PILETOP_OFF, true],
            [GLYPH_BODY_PILETOP_OFF + NUMMONS, false],
        ]],
        [glyph_is_fem_statue_piletop, [
            [GLYPH_STATUE_FEM_PILETOP_OFF - 1, false],
            [GLYPH_STATUE_FEM_PILETOP_OFF, true],
            [GLYPH_STATUE_FEM_PILETOP_OFF + NUMMONS - 1, true],
            [GLYPH_STATUE_FEM_PILETOP_OFF + NUMMONS, false],
        ]],
        [glyph_is_male_statue_piletop, [
            [GLYPH_STATUE_MALE_PILETOP_OFF - 1, false],
            [GLYPH_STATUE_MALE_PILETOP_OFF, true],
            [GLYPH_STATUE_MALE_PILETOP_OFF + NUMMONS - 1, true],
            [GLYPH_STATUE_MALE_PILETOP_OFF + NUMMONS, false],
        ]],
        [glyph_is_fem_statue, [
            [GLYPH_STATUE_FEM_OFF - 1, false],
            [GLYPH_STATUE_FEM_OFF, true],
            [GLYPH_STATUE_FEM_OFF + NUMMONS - 1, true],
            [GLYPH_STATUE_FEM_OFF + NUMMONS, false],
            [GLYPH_STATUE_FEM_PILETOP_OFF, true],
            [GLYPH_STATUE_FEM_PILETOP_OFF + NUMMONS, false],
        ]],
        [glyph_is_male_statue, [
            [GLYPH_STATUE_MALE_OFF - 1, false],
            [GLYPH_STATUE_MALE_OFF, true],
            [GLYPH_STATUE_MALE_OFF + NUMMONS - 1, true],
            [GLYPH_STATUE_MALE_OFF + NUMMONS, false],
            [GLYPH_STATUE_MALE_PILETOP_OFF, true],
            [GLYPH_STATUE_MALE_PILETOP_OFF + NUMMONS, false],
        ]],
        // glyph_is_statue(): the union of the two above, so its cases are one
        // number inside each of the four ranges and the number below the
        // lowest of them.
        [glyph_is_statue, [
            [GLYPH_STATUE_MALE_OFF - 1, false],
            [GLYPH_STATUE_MALE_OFF, true],
            [GLYPH_STATUE_FEM_OFF, true],
            [GLYPH_STATUE_MALE_PILETOP_OFF, true],
            [GLYPH_STATUE_FEM_PILETOP_OFF, true],
            [GLYPH_STATUE_FEM_PILETOP_OFF + NUMMONS, false],
        ]],
        // glyph_is_normal_generic_obj(): > GLYPH_OBJ_OFF, so the base itself
        // is excluded, and < GLYPH_OBJ_OFF + FIRST_OBJECT - 1.
        [glyph_is_normal_generic_obj, [
            [GLYPH_OBJ_OFF, false],
            [GLYPH_OBJ_OFF + 1, true],
            [GLYPH_OBJ_OFF + FIRST_OBJECT - 2, true],
            [GLYPH_OBJ_OFF + FIRST_OBJECT - 1, false],
        ]],
        [glyph_is_piletop_generic_obj, [
            [GLYPH_OBJ_PILETOP_OFF, false],
            [GLYPH_OBJ_PILETOP_OFF + 1, true],
            [GLYPH_OBJ_PILETOP_OFF + FIRST_OBJECT - 2, true],
            [GLYPH_OBJ_PILETOP_OFF + FIRST_OBJECT - 1, false],
        ]],
        [glyph_is_generic_object, [
            [GLYPH_OBJ_OFF, false],
            [GLYPH_OBJ_OFF + 1, true],
            [GLYPH_OBJ_PILETOP_OFF, false],
            [GLYPH_OBJ_PILETOP_OFF + 1, true],
        ]],
        // glyph_is_normal_piletop_obj(): the base on its own, then
        // > base + FIRST_OBJECT - 1 -- one higher than its non-piletop
        // sibling below, which is the asymmetry display.h leaves in place.
        [glyph_is_normal_piletop_obj, [
            [GLYPH_OBJ_PILETOP_OFF - 1, false],
            [GLYPH_OBJ_PILETOP_OFF, true],
            [GLYPH_OBJ_PILETOP_OFF + 1, false],
            [GLYPH_OBJ_PILETOP_OFF + FIRST_OBJECT - 1, false],
            [GLYPH_OBJ_PILETOP_OFF + FIRST_OBJECT, true],
            [GLYPH_OBJ_PILETOP_OFF + NUM_OBJECTS - 1, true],
            [GLYPH_OBJ_PILETOP_OFF + NUM_OBJECTS, false],
        ]],
        [glyph_is_normal_object, [
            [GLYPH_OBJ_OFF - 1, false],
            [GLYPH_OBJ_OFF, true],
            [GLYPH_OBJ_OFF + 1, false],
            [GLYPH_OBJ_OFF + FIRST_OBJECT - 2, false],
            [GLYPH_OBJ_OFF + FIRST_OBJECT - 1, true],
            [GLYPH_OBJ_OFF + NUM_OBJECTS - 1, true],
            [GLYPH_OBJ_OFF + NUM_OBJECTS, false],
            [GLYPH_OBJ_PILETOP_OFF, true],
        ]],
        // glyph_is_object(): the union of all four families. One number
        // inside each, and the two numbers just outside the whole span.
        [glyph_is_object, [
            [GLYPH_BODY_OFF - 1, false],
            [GLYPH_BODY_OFF, true],
            [GLYPH_OBJ_OFF, true],
            [GLYPH_OBJ_OFF + FIRST_OBJECT, true],
            [GLYPH_OBJ_OFF + 1, true],
            [GLYPH_STATUE_MALE_OFF, true],
            [GLYPH_STATUE_FEM_PILETOP_OFF + NUMMONS, false],
        ]],
    ];
}

test('the object glyph range predicates answer at every display.h bound',
    () => {
        for (const [predicate, cases] of glyphRangeCases()) {
            for (const [glyph, expected] of cases) {
                assert.equal(
                    predicate(glyph), expected, `${predicate.name}(${glyph})`,
                );
            }
            // A square the hero remembers nothing of carries no number, and
            // every comparison against undefined is false.
            assert.equal(predicate(undefined), false, predicate.name);
        }
    });

// ── display.c reset_glyphmap()'s eight object arms ──

test('map_glyphinfo resolves each object arm at its own first glyph', () => {
    const state = visibleCellState();
    const mons = state.mons;
    state.iflags = { ...state.iflags, hilite_pile: false };

    const statue = monster_class_symbol(mons[0].mlet, state).ch;
    const lastStatue = monster_class_symbol(
        mons[NUMMONS - 1].mlet, state,
    ).ch;
    const corpse = object_class_symbol(FOOD_CLASS, state, CORPSE).ch;
    const statueColor = state.objects[STATUE].oc_color;
    // The first glyph of each arm, and the glyph one below it, which belongs
    // to the arm underneath. reset_glyphmap() tests `>= 0` on each
    // subtraction, so these pairs are what separates one arm from the next.
    // Each expectation is read from the arm's own three statements in
    // src/display.c: the symbol index, the colour macro, and the glyphflags.
    const cases = [
        [GLYPH_BODY_OFF, {
            ch: corpse, color: mons[0].mcolor, flags: MG_CORPSE,
        }],
        [GLYPH_BODY_OFF + NUMMONS - 1, {
            ch: corpse, color: mons[NUMMONS - 1].mcolor, flags: MG_CORPSE,
        }],
        [GLYPH_OBJ_OFF + FIRST_OBJECT - 1, {
            ch: object_class_symbol(
                state.objects[FIRST_OBJECT - 1].oc_class,
                state,
                FIRST_OBJECT - 1,
            ).ch,
            // objects[FIRST_OBJECT - 1] is the last GENERIC row, whose
            // include/objects.h:72-75 colour is CLR_GRAY; recorderMapColor()
            // folds gray onto the terminal default.
            color: NO_COLOR,
            flags: 0,
        }],
        [GLYPH_STATUE_MALE_OFF, {
            ch: statue, color: statueColor, flags: MG_STATUE | MG_MALE,
        }],
        [GLYPH_STATUE_MALE_OFF + NUMMONS - 1, {
            ch: lastStatue, color: statueColor, flags: MG_STATUE | MG_MALE,
        }],
        [GLYPH_STATUE_FEM_OFF, {
            ch: statue, color: statueColor, flags: MG_STATUE | MG_FEMALE,
        }],
        [GLYPH_OBJ_PILETOP_OFF, {
            ch: object_class_symbol(
                state.objects[STRANGE_OBJECT].oc_class,
                state,
                STRANGE_OBJECT,
            ).ch,
            color: NO_COLOR, // objects[STRANGE_OBJECT] is CLR_BLACK.
            flags: MG_OBJPILE,
        }],
        [GLYPH_BODY_PILETOP_OFF, {
            ch: corpse,
            color: mons[0].mcolor,
            flags: MG_CORPSE | MG_OBJPILE,
        }],
        [GLYPH_STATUE_MALE_PILETOP_OFF, {
            ch: statue,
            color: statueColor,
            flags: MG_STATUE | MG_MALE | MG_OBJPILE,
        }],
        [GLYPH_STATUE_FEM_PILETOP_OFF, {
            ch: statue,
            color: statueColor,
            flags: MG_STATUE | MG_FEMALE | MG_OBJPILE,
        }],
    ];
    for (const [glyph, expected] of cases) {
        const resolved = map_glyphinfo(glyph, state);
        assert.equal(resolved.ch, expected.ch, `ch at ${glyph}`);
        assert.equal(resolved.color, expected.color, `color at ${glyph}`);
        assert.equal(resolved.glyph, glyph, `glyph at ${glyph}`);
        // Two flags of the column reach a presentation, each through the
        // attribute win/tty/wintty.c tty_print_glyph() gives it, so each is
        // asserted by turning its option on and reading the attribute back.
        // MG_OBJPILE is the first.
        state.iflags.hilite_pile = true;
        assert.equal(
            map_glyphinfo(glyph, state).attr ?? 0,
            expected.flags & MG_OBJPILE ? ATR_INVERSE : 0,
            `pile attribute at ${glyph}`,
        );
        state.iflags.hilite_pile = false;
        // MG_FEMALE is the second, under `wizard && iflags.wizmgender`. It
        // separates the male arm from the female one on both the piletop and
        // the plain statue ranges, which the pile term alone cannot do.
        // MG_STATUE and MG_CORPSE reach no attribute in C's chain, so the
        // column records them and nothing asserts them.
        state.wizard = true;
        state.iflags.wizmgender = true;
        assert.equal(
            map_glyphinfo(glyph, state).attr ?? 0,
            expected.flags & MG_FEMALE ? ATR_INVERSE : 0,
            `gender attribute at ${glyph}`,
        );
        state.iflags.wizmgender = false;
        state.wizard = false;
    }

    // Everything outside the four object families and the cmap ranges is
    // refused rather than resolved through the arm underneath it. The zap
    // range is inside glyph_is_cmap()'s contiguous span and now has an arm of
    // its own, so it belongs above rather than here; the zap-ray tests pin it.
    for (const glyph of [
        GLYPH_BODY_OFF - 1,
        GLYPH_BODY_OFF + NUMMONS,
        GLYPH_OBJ_OFF - 1,
        GLYPH_STATUE_MALE_OFF - 1,
        GLYPH_STATUE_FEM_PILETOP_OFF + NUMMONS,
    ]) {
        assert.throws(
            () => map_glyphinfo(glyph, state),
            TypeError,
            `${glyph}`,
        );
    }
});

test('the pile and gender attributes are resolved at print time', () => {
    const state = visibleCellState();
    // win/tty/wintty.c tty_print_glyph() (3930-3936). Each row is one
    // combination of the option values that arm reads, over one glyph that
    // carries the flag under test. A female statue on a pile carries both
    // MG_OBJPILE and MG_FEMALE, so the rows below use the non-piletop female
    // statue for the gender term and an ordinary pile-top object for the
    // pile term, keeping the two independent.
    const pile = GLYPH_OBJ_PILETOP_OFF + FIRST_OBJECT;
    const femaleStatue = GLYPH_STATUE_FEM_OFF;
    const maleStatue = GLYPH_STATUE_MALE_OFF;
    const cases = [
        [pile, { hilite_pile: true }, false, ATR_INVERSE],
        [pile, { hilite_pile: false }, false, 0],
        // use_inverse gates the whole arm, whatever raised it.
        [pile, { hilite_pile: true, wc_inverse: false }, false, 0],
        // MG_OBJPILE is absent here, so hilite_pile alone must not invert.
        [GLYPH_OBJ_OFF + FIRST_OBJECT, { hilite_pile: true }, false, 0],
        [femaleStatue, { wizmgender: true }, true, ATR_INVERSE],
        // Each of the three terms on its own leaves the attribute off.
        [femaleStatue, { wizmgender: true }, false, 0],
        [femaleStatue, { wizmgender: false }, true, 0],
        [maleStatue, { wizmgender: true }, true, 0],
        [femaleStatue, { wizmgender: true, wc_inverse: false }, true, 0],
    ];
    for (const [glyph, iflags, wizard, expected] of cases) {
        state.wizard = wizard;
        state.iflags = { ...state.iflags, wc_inverse: true, ...iflags };
        assert.equal(
            map_glyphinfo(glyph, state).attr ?? 0,
            expected,
            `${glyph} ${JSON.stringify(iflags)} wizard ${wizard}`,
        );
    }
});

// ── display.c see_nearby_objects() ──

// display.c:1581-1583 computes r as 2 whenever u.xray_range is 2 or less, and
// neardist as r * r * 2 - r, which is 6. objnam.c distant_name() and display.c
// map_object() repeat the same two lines.
const NEAR_RADIUS = 2;

// A map on which every square is lit floor the hero can see, so that a test
// below can switch off exactly one of see_nearby_objects()'s conditions.
function nearbyObjectsState(ux, uy) {
    const state = visibleCellState({ x: ux, y: uy, ux, uy });
    init_objects(state, () => 0);
    state.viz_array = Array.from(
        { length: 21 }, // ROWNO
        () => new Array(80).fill(IN_SIGHT), // COLNO
    );
    for (let y = 0; y < 21; ++y)
        for (let x = 0; x < 80; ++x) state.level.at(x, y).typ = ROOM;
    return state;
}

function unobservedPotion(state, x, y) {
    const potion = {
        otyp: POT_BOOZE,
        oclass: state.objects[POT_BOOZE].oc_class,
        dknown: false,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        nexthere: null,
    };
    state.level.objects[x][y] = potion;
    return potion;
}

test('a nearer look repaints a remembered generic object in its own colour',
    () => {
        // Recording the memory from far away is what makes the remembered
        // glyph generic: newsym()'s own map_object() arm observes an object
        // only inside the same near square this function scans.
        const state = nearbyObjectsState(10, 3);
        const potion = unobservedPotion(state, 10, 12);
        newsym(10, 12);
        const remembered = state.level.at(10, 12).remembered_glyph;
        assert.equal(potion.dknown, false);
        assert.equal(
            remembered_glyph_presentation(remembered, state).color, NO_COLOR,
        );
        assert.equal(glyph_is_generic_object(remembered.glyph), true);

        // dungeon.c u_on_newpos() moves the hero first and calls this after.
        state.u.ux = 10;
        state.u.uy = 10;
        see_nearby_objects(state);

        assert.equal(potion.dknown, true);
        assert.equal(state.objects[POT_BOOZE].oc_encountered, 1);
        assert.equal(
            remembered_glyph_presentation(
                state.level.at(10, 12).remembered_glyph, state,
            ).color,
            state.objects[POT_BOOZE].oc_color,
        );
        assert.equal(
            glyph_is_generic_object(
                state.level.at(10, 12).remembered_glyph.glyph,
            ),
            false,
        );
    });

test('see_nearby_objects scans the whole near square and nothing outside it',
    () => {
        const state = nearbyObjectsState(10, 10);
        // The four squares at the ends of display.c:1585-1586's two loops. A
        // loop that stopped one short of `<=` would miss the far end of each.
        const lowRow = unobservedPotion(state, 10, 10 - NEAR_RADIUS);
        const highRow = unobservedPotion(state, 10, 10 + NEAR_RADIUS);
        const lowColumn = unobservedPotion(state, 10 - NEAR_RADIUS, 10);
        const highColumn = unobservedPotion(state, 10 + NEAR_RADIUS, 10);
        // Inside the loops' square but outside the rounded near distance:
        // 2 * 2 + 2 * 2 is 8, above 6.
        const corner = unobservedPotion(
            state, 10 + NEAR_RADIUS, 10 + NEAR_RADIUS,
        );
        // Adjacent, so well inside the near distance, but display.c:1592's
        // cansee() rejects it.
        const unseen = unobservedPotion(state, 11, 11);
        state.viz_array[11][11] = 0;

        see_nearby_objects(state);

        assert.equal(lowRow.dknown, true, 'row y - r');
        assert.equal(highRow.dknown, true, 'row y + r');
        assert.equal(lowColumn.dknown, true, 'column x - r');
        assert.equal(highColumn.dknown, true, 'column x + r');
        assert.equal(corner.dknown, false, 'diagonal beyond the near distance');
        assert.equal(unseen.dknown, false, 'square the hero cannot see');

        // Off the map entirely, which display.c:1587's isok() drops before
        // vobj_at() could be asked for it. This second map has to be built
        // after the first scan has run, because nearbyObjectsState() calls
        // resetGame(), and see_nearby_objects() refuses any state but the one
        // resetGame() last installed as the global.
        const edge = nearbyObjectsState(1, 10);
        const offMap = unobservedPotion(edge, 0, 10);

        see_nearby_objects(edge);

        // isok() rejects column 0, so the scan neither reads nor observes it.
        assert.equal(offMap.dknown, false, 'column zero');
    });

test('see_nearby_objects leaves a memory that is not a generic object alone',
    () => {
        const state = nearbyObjectsState(10, 10);
        // display.c:1601-1603 reads levl[ix][iy].glyph and redraws only cells
        // whose *remembered* glyph is generic. A seen trap recorded before
        // the object arrived is not in obj_is_generic()'s range, so C keeps
        // that stale memory even though the nearer look identifies the object
        // underneath it.
        state.level.traps.push({ tx: 10, ty: 12, ttyp: LANDMINE, tseen: true });
        newsym(10, 12);
        const remembered = state.level.at(10, 12).remembered_glyph;
        // The predicate takes C's levl[x][y].glyph. This square remembers a
        // trap, whose record is a presentation carrying no number at all, so
        // the answer is no for want of a glyph rather than for want of a
        // range. Passing the location instead answered no vacuously.
        assert.equal(glyph_is_generic_object(remembered.glyph), false);

        const potion = unobservedPotion(state, 10, 12);
        see_nearby_objects(state);

        // display.c:1599's observe_object() still runs above the guard, so the
        // object becomes dknown whatever the map remembers.
        assert.equal(potion.dknown, true);
        // Deep-equal the whole glyph, so a redraw that rewrote only part of
        // the memory is caught too. newsym() would replace this trap glyph
        // with the potion's, because an object covers a seen trap.
        assert.deepEqual(state.level.at(10, 12).remembered_glyph, remembered);
        assert.equal(
            remembered_glyph_presentation(remembered, game).ch, '^',
        );
    });

test('see_nearby_objects refuses a state that is not the global one', () => {
    const stale = nearbyObjectsState(10, 10);
    // Each nearbyObjectsState() call runs resetGame(), which js/gstate.js
    // rebinds to a fresh object, so building the second one makes the first
    // stale. The refusal, not a threaded state, is what keeps
    // observe_object() and newsym() reading one map: newsym() takes no state
    // and reads the module-global, exactly as js/hack.js:1491-1497 records
    // for curs_on_u().
    nearbyObjectsState(10, 10);

    assert.throws(
        () => see_nearby_objects(stale),
        /redraws the global game/u,
    );
});

test('see_nearby_objects skips an object it has already observed', () => {
    const state = nearbyObjectsState(10, 10);
    const potion = unobservedPotion(state, 10, 11);
    potion.dknown = true;
    // display.c:1590's `obj->dknown` short-circuit means no discovery ledger
    // entry is written for an object the hero has already looked at closely.
    see_nearby_objects(state);
    assert.equal(state.objects[POT_BOOZE].oc_encountered, 0);
});

test('Enhanced glyph customization reaches the concrete fountain glyph', () => {
    const state = {};
    initialize_symbols_from_options(
        parseNethackrc('OPTIONS=symset:Enhanced1'),
        state,
    );

    assert.deepEqual(
        terrainGlyphAt({ typ: FOUNTAIN }, 7, 4, state),
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
        terrainGlyphAt({ typ: FOUNTAIN }, 7, 4, state),
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
        terrainGlyphAt({ typ: FOUNTAIN }, 7, 4, state),
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
        terrainGlyphAt({ typ: FOUNTAIN }, 7, 4, state),
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
    assert.deepEqual(
        remembered_glyph_presentation(
            live.level.at(7, 4).remembered_glyph, live,
        ).rgb,
        [0, 150, 255],
    );

    live.viz_array[4][7] = 0;
    live.level.at(7, 4).disp_glyph = null;
    live.level.at(7, 4).disp_browser_ch = null;
    live.level.at(7, 4).disp_browser_color = null;
    newsym(7, 4);
    assert.deepEqual(
        live.level.at(7, 4).disp_glyph.rgb,
        [0, 150, 255],
        'out-of-sight reconstruction retains the remembered custom RGB',
    );
    assert.equal(
        live.level.at(7, 4).disp_browser_color,
        'rgb(0, 150, 255)',
    );
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
        terrainGlyphAt({ typ: FOUNTAIN }, 7, 4, overridden).displayCh,
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
        terrainGlyphAt({ typ: FOUNTAIN }, 7, 4, resetBySelection).displayCh,
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

    // Each of the five altar numbers carries its own customization name, and
    // glyphs.c:1015-1027 builds four of them by prefixing the alignment to the
    // base while the sanctum altar takes "altar other" with skip_base set --
    // so the fifth is G_altar_other, not G_other_altar. Without this loop a
    // name the registry does not hold looks the same as one it does: the
    // lookup simply finds nothing and the altar draws uncustomized.
    for (const name of [
        'G_unaligned_altar', 'G_chaotic_altar', 'G_neutral_altar',
        'G_lawful_altar', 'G_altar_other',
    ]) {
        assert.doesNotThrow(
            () => parseNethackrc(`SYMBOLS=${name}:U+2603`), name,
        );
    }
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
    // parseoptions() checks for the "S_" prefix case-sensitively before it
    // calls parsesymbols(), so a G_ statement never reaches match_glyph()
    // there and keeps its whole text in the report.
    assert.deepEqual(
        parseNethackrc('OPTIONS=G_fountain:U+2603').configErrorFrame.output,
        [
            '\nOPTIONS=G_fountain:U+2603',
            " * Line 1: Unknown option 'G_fountain:U+2603'.",
        ],
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
    state.dungeons = dungeonsOfDoom();
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

// botl.c bot_via_windowport() fills BL_CAP from near_capacity(), and tty's
// two-line field order puts the resulting enc_stat word after hunger.
test('the two-line status row reports carrying capacity', async () => {
    const state = statusRenderingState();
    state.flags.showexp = false;
    state.flags.showvers = false;
    state.flags.time = false;
    state.flags.weaponstatus = false;
    state.flags.armorstatus = false;
    state.flags.terrainstatus = false;
    state.invent = {
        oclass: WEAPON_CLASS,
        otyp: SPEAR,
        owt: 2000,
        quan: 1,
        nobj: null,
    };
    state.iflags.hilite_delta = 3;
    state.iflags.status_hilites = [{
        field: 'carrying-capacity',
        behavior: 'text',
        text: 'Strained',
        style: {
            attrib: HL_BOLD,
            color: CLR_RED,
        },
    }];
    let capacityWrites = 0;
    let storedCapacity;
    state.gw = {};
    Object.defineProperty(state.gw, 'wc', {
        configurable: true,
        get: () => storedCapacity,
        set: (value) => {
            storedCapacity = value;
            capacityWrites += 1;
        },
    });

    await bot();

    assert.match(terminalRow(state, 23), / Strained\s*$/u);
    assert.equal(capacityWrites, 1);
    assertStatusTextStyle(state, 23, 'Strained', {
        attr: ATR_BOLD,
        color: CLR_RED,
    }, { after: false });
});

// C ref: botl.c do_statusline2():140-142 and bot_via_windowport():1036-1037,
// the same `if (hp < 0) hp = 0` written once for the string the status line
// draws and once for the BL_HP value the field system stores and compares.
//
// hack.c losehp() leaves u.uhp wherever the killing blow put it and calls
// done() from there, so every status drawn between the two reads a negative.
// -18 of 12 is what seed5002-wizard-coverage-pair records: zhitu()'s d(6, 6)
// took 25 from a Wizard standing at 7.
test('a hero below zero hit points is drawn and compared at zero', async () => {
    for (const lines of [2, 3]) {
        const state = statusRenderingState();
        state.iflags = { wc2_statuslines: lines };
        state.u.uhp = -18;
        state.u.uhpmax = 12;

        await bot();

        const rows = [21, 22, 23].map((row) => terminalRow(state, row));
        const health = rows.find((row) => row.includes('HP:'));
        assert.match(health, /HP:0\(12\)/u, `${lines} lines`);
        assert.equal(health.includes('-18'), false, health);
    }

    // The stored value is clamped too, which a threshold highlight is what
    // reads back: `hp>=0` matches a dead hero because BL_HP holds zero, and
    // would not match the -18 that u.uhp still carries.
    const state = statusRenderingState();
    state.u.uhp = -18;
    state.u.uhpmax = 12;
    state.iflags = {
        wc2_statuslines: 2,
        // optfn_hilite_status() stores this default duration whenever a rule
        // is accepted; render_status() draws no highlight while it is zero.
        hilite_delta: 3,
        status_hilites: [{
            field: 'hitpoints',
            behavior: 'absolute',
            relation: '>=',
            value: 0,
            text: '',
            // CLR_RED is a colour the recorder keeps as itself, so a wrong
            // attribute cannot hide behind a colour the grid normalizes.
            style: { attrib: HL_UNDEF, color: CLR_RED },
        }],
    };

    await bot();

    assertStatusTextStyle(state, 23, 'HP:0', {
        attr: ATR_NONE,
        color: CLR_RED,
    });
});

// wintty.c Begin_Attr() turns a status highlight's HL_ mask into
// term_start_attr() calls, and recorder patch 006 nomux_set_attr() records
// only ATR_INVERSE, ATR_BOLD and ATR_ULINE.  Every row below was read off the
// reference build for hilite_status:hitpoints/always/<action> at seed 7710041
// and 20010704120000; the mask is what botl.c parse_status_hl2() leaves for
// that action.
test('a status highlight draws only the attributes tty can emit', async () => {
    for (const [attrib, expected, action] of [
        // The three tty keeps, whose HL_ bit and captured bit differ in value
        // for two of the three.
        [HL_BOLD, ATR_BOLD, 'bold'],
        [HL_ULINE, ATR_UNDERLINE, 'underline'],
        [HL_INVERSE, ATR_INVERSE, 'inverse'],
        // The three nomux_set_attr() has no case for.
        [HL_DIM, ATR_NONE, 'dim'],
        [HL_ITALIC, ATR_NONE, 'italic'],
        [HL_BLINK, ATR_NONE, 'blink'],
        // A dropped attribute beside a kept one leaves the kept one alone;
        // this is the pair the ledger entry was measured on.
        [HL_BOLD | HL_DIM, ATR_BOLD, 'bold&dim'],
        // "normal" replaces the mask instead of adding to it, so the bold
        // ahead of it is gone; HL_UNDEF is the no-attribute-named action.
        [HL_NONE, ATR_NONE, 'bold&normal'],
        [HL_UNDEF, ATR_NONE, 'red alone'],
        // A bit named after "normal" ORs in and leaves HL_NONE set.
        [HL_NONE | HL_BOLD, ATR_BOLD, 'none&bold'],
    ]) {
        const state = statusRenderingState();
        state.flags.showexp = false;
        state.flags.showvers = false;
        state.flags.time = false;
        state.flags.weaponstatus = false;
        state.flags.armorstatus = false;
        state.flags.terrainstatus = false;
        // optfn_hilite_status() stores this default duration whenever a rule
        // is accepted; render_status() draws no highlight while it is zero.
        state.iflags.hilite_delta = 3;
        state.iflags.status_hilites = [{
            field: 'hitpoints',
            behavior: 'always',
            // CLR_RED is any colour the recorder keeps as itself, so a wrong
            // attribute cannot hide behind a colour the grid normalizes.
            style: { attrib, color: CLR_RED },
        }];

        await bot();

        assertStatusTextStyle(state, 23, `HP:${state.u.uhp}`, {
            attr: expected,
            color: CLR_RED,
        }, { label: action });
    }
});

// C refs: botl.c parse_condition() writes gc.cond_hilites[], one array entry
// per attribute and one per colour, and wintty.c condattr() (4920-4952) and
// condcolor() (4907-4918) read the entries back for the condition being drawn.
// Those entries outlive the statement that set them, which is what
// distinguishes the accumulating rows below.  condcolor() scans from index 0
// and returns the first entry holding the condition, so the lowest colour
// index wins whichever statement named it.
test('a condition highlight replays the bits each rule set and cleared',
    async () => {
        for (const [statements, expected, color, label] of [
            [['condition/blind/bold&underline'],
                ATR_BOLD | ATR_UNDERLINE, NO_COLOR, 'one rule'],
            // Without "none" the second statement only adds to the first.
            [['condition/blind/bold', 'condition/blind/underline'],
                ATR_BOLD | ATR_UNDERLINE, NO_COLOR, 'two rules accumulate'],
            // "none" clears all six entries for these conditions, so the
            // bits the earlier statement set are gone and only the name
            // behind it survives.
            [['condition/blind/bold&underline', 'condition/blind/none&inverse'],
                ATR_INVERSE, NO_COLOR, 'a later none discards the earlier bits'],
            // CLR_RED is 1 and CLR_BLUE is 4, so the array entry condcolor()
            // reaches first is red's whichever statement named it.  "Last one
            // wins" and "first one wins" each answer one of these two rows
            // wrongly.
            [['condition/blind/blue', 'condition/blind/red'],
                ATR_NONE, CLR_RED, 'the lower colour index wins'],
            [['condition/blind/red', 'condition/blind/blue'],
                ATR_NONE, CLR_RED, 'and does so in either order'],
            // A group that fails on a bad colour keeps the attributes C has
            // already ORed into gc.cond_hilites[] and skips only
            // `gc.cond_hilites[coloridx] |= conditions_bitmask`, so the
            // condition is drawn inverse with no colour of its own.
            [['condition/blind/bold', 'condition/blind/inverse+mauve'],
                ATR_BOLD | ATR_INVERSE, NO_COLOR,
                'a group that failed on its colour keeps its attributes'],
            // The same failed group beside a rule that did name a colour:
            // condcolor() still answers red, because the failed group left no
            // entry of its own for the scan to reach first.
            [['condition/blind/red', 'condition/blind/inverse+mauve'],
                ATR_INVERSE, CLR_RED,
                'and contributes no colour index of its own'],
            // "none" clears all six entries before the bad colour ends the
            // group, so the earlier statement's bold is gone even though the
            // statement holding the sweep failed.
            [['condition/blind/bold', 'condition/blind/none+mauve'],
                ATR_NONE, NO_COLOR,
                'a failed group still performs its none sweep'],
            // With the failed group the only rule naming the condition, no
            // entry below CLR_MAX holds it and condcolor() runs out of its
            // loop.  The hitpoints rule is there to give parse_status_hl1() a
            // statement it accepts, so the duration is set at all.
            [['hitpoints/always/red', 'condition/blind/inverse+mauve'],
                ATR_INVERSE, NO_COLOR,
                'a condition with no colour entry at all answers NO_COLOR'],
        ]) {
            const options = parseNethackrc(`${statements
                .map((rule) => `OPTIONS=hilite_status:${rule}`)
                .join('\n')}\n`);
            const state = statusRenderingState();
            state.iflags.hilite_delta = options.iflags.hilite_delta;
            state.iflags.status_hilites = options.iflags.status_hilites;
            state.iflags.status_conditions = options.iflags.status_conditions;
            state.u.uprops[BLINDED] = {
                intrinsic: 1, extrinsic: 0, blocked: 0,
            };

            await bot();

            assertStatusTextStyle(state, 23, 'Blind', {
                attr: expected,
                // NO_COLOR is what condcolor() answers when no entry below
                // CLR_MAX holds the condition, which is also where
                // parse_condition() leaves coloridx when no rule names one.
                color,
            }, { label });
        }
    });

test('tty carrying-capacity vocabulary matches every source row', () => {
    // wintty.c shrink_enc() selects full, shortened, then shortest wording at
    // levels zero through two.
    const cases = [
        {
            name: 'full',
            shrinkLevel: 0,
            expected: [
                '', 'Burdened', 'Stressed', 'Strained',
                'Overtaxed', 'Overloaded',
            ],
        },
        {
            name: 'shortened',
            shrinkLevel: 1,
            expected: [
                '', 'Burden', 'Stress', 'Strain', 'Overtax', 'Overload',
            ],
        },
        {
            name: 'shortest',
            shrinkLevel: 2,
            expected: ['', 'Brd', 'Strs', 'Strn', 'Ovtx', 'Ovld'],
        },
    ];
    for (const { name, shrinkLevel, expected } of cases) {
        assert.deepEqual(
            Array.from({ length: 6 }, (_, capacity) =>
                tty_capacity_status(capacity, shrinkLevel)),
            expected,
            name,
        );
    }
});

test('two-line capacity shrinking uses strict 79-column overflow edges',
    async () => {
        const cases = [
            {
                name: 'full capacity form',
                capacity: 'Strained',
                inventory: {
                    oclass: WEAPON_CLASS, otyp: SPEAR, owt: 2000,
                    quan: 1, nobj: null,
                },
                extra: (state) => {
                    state.flags.time = true;
                    state.flags.weaponstatus = true;
                    state.flags.armorstatus = true;
                    state.flags.terrainstatus = true;
                    state.moves = 999;
                },
                expected: 'Dlvl:1 $:0 HP:16(16) Pw:4(6) AC:8 Xp:1 T:999'
                    + ' Strained Spear Shield Stairs 5.0.0',
            },
            {
                name: 'first shortened capacity form',
                capacity: 'Strain',
                inventory: {
                    oclass: WEAPON_CLASS, otyp: SPEAR, owt: 2000,
                    quan: 1, nobj: null,
                },
                extra: (state) => {
                    state.flags.time = true;
                    state.flags.weaponstatus = true;
                    state.flags.armorstatus = true;
                    state.flags.terrainstatus = true;
                    state.flags.showexp = true;
                    state.moves = 99;
                },
                expected: 'Dlvl:1 $:0 HP:16(16) Pw:4(6) AC:8 Xp:1/42 T:99'
                    + ' Strain Spear Shield Stairs 5.0.0',
            },
            {
                name: 'second shortened capacity form',
                capacity: 'Strn',
                inventory: {
                    oclass: WEAPON_CLASS, otyp: SPEAR, owt: 2000,
                    quan: 1, nobj: null,
                },
                extra: (state) => {
                    state.flags.time = true;
                    state.flags.weaponstatus = true;
                    state.flags.armorstatus = true;
                    state.flags.terrainstatus = true;
                    state.flags.showexp = true;
                    state.moves = 99;
                    state.u.uhpmax = 999;
                },
                expected: 'Dlvl:1 $:0 HP:16(999) Pw:4(6) AC:8 Xp:1/42 T:99'
                    + ' Strn Spear Shield Stairs  5.0.0',
            },
            {
                name: 'conditions shorten before capacity',
                capacity: 'Strained',
                inventory: {
                    oclass: WEAPON_CLASS, otyp: SPEAR, owt: 2000,
                    quan: 1, nobj: null,
                },
                extra: (state) => {
                    state.flags.time = true;
                    state.flags.weaponstatus = true;
                    state.flags.armorstatus = true;
                    state.flags.terrainstatus = false;
                    state.moves = 999;
                    state.u.usick_type = SICK_VOMITABLE;
                    state.u.uprops[SICK] = { intrinsic: 1 };
                },
                expected: 'Dlvl:1 $:0 HP:16(16) Pw:4(6) AC:8 Xp:1 T:999'
                    + ' Strained Fpois Spear Shield  5.0.0',
            },
            {
                name: 'capacity shortens after conditions reach shortest form',
                capacity: 'Strn',
                inventory: {
                    oclass: WEAPON_CLASS, otyp: SPEAR, owt: 2000,
                    quan: 1, nobj: null,
                },
                extra: (state) => {
                    state.flags.time = true;
                    state.flags.weaponstatus = true;
                    state.flags.armorstatus = true;
                    state.flags.terrainstatus = true;
                    state.flags.showexp = true;
                    state.moves = 999;
                    state.u.usick_type = SICK_VOMITABLE;
                    state.u.uprops[SICK] = { intrinsic: 1 };
                },
                expected: 'Dl:1 $:0 HP:16(16) Pw:4(6) AC:8 Xp:1/42 T:999'
                    + ' Strn Poi Spear Shield Stairs 5.0.',
            },
            {
                name: 'empty capacity padding',
                inventory: { oclass: COIN_CLASS, quan: 50, nobj: null },
                extra: (state) => {
                    state.flags.time = true;
                    state.flags.weaponstatus = true;
                    state.flags.armorstatus = true;
                    state.flags.terrainstatus = true;
                    state.flags.showexp = true;
                    state.moves = 1000;
                    state.u.uhpmax = 999999;
                },
                expected: 'Dlvl:1 $:50 HP:16(999999) Pw:4(6) AC:8 Xp:1/42'
                    + ' T:1000 Spear Shield Stairs 5.0.0',
            },
        ];

        for (const { name, inventory, extra, expected, capacity } of cases) {
            const state = statusRenderingState();
            state.flags.showexp = false;
            state.flags.showvers = true;
            state.flags.time = false;
            state.flags.weaponstatus = false;
            state.flags.armorstatus = false;
            state.flags.terrainstatus = false;
            state.moves = 1;
            state.invent = inventory;
            extra?.(state);
            if (capacity) {
                state.iflags.hilite_delta = 3;
                state.iflags.status_hilites = [{
                    field: 'carrying-capacity',
                    behavior: 'text',
                    text: 'Strained',
                    style: {
                        attrib: HL_BOLD,
                        color: CLR_RED,
                    },
                }];
            }

            await bot();

            const text = terminalRow(state, 23).trimEnd();
            assert.equal(text, expected, name);
            assert.ok(text.length >= 79, `${name}: reaches the tty edge`);
            if (capacity) {
                assertStatusTextStyle(state, 23, capacity, {
                    attr: ATR_BOLD,
                    color: CLR_RED,
                });
            }
        }
});

test('three-line conditions align to hunger before carrying capacity',
    async () => {
        const state = bareThreeLineState();
        state.u.uhs = SATIATED;
        state.invent = {
            oclass: WEAPON_CLASS,
            otyp: SPEAR,
            owt: 2000,
            quan: 1,
            nobj: null,
        };
        setConditionProperties(state, [BLINDED]);
        state.iflags.hilite_delta = 3;
        state.iflags.status_hilites = [{
            field: 'carrying-capacity',
            behavior: 'text',
            text: 'Strained',
            style: {
                attrib: HL_BOLD,
                color: CLR_RED,
            },
        }];
        let capacityWrites = 0;
        let storedCapacity;
        state.gw = {};
        Object.defineProperty(state.gw, 'wc', {
            configurable: true,
            get: () => storedCapacity,
            set: (value) => {
                storedCapacity = value;
                capacityWrites += 1;
            },
        });

        await bot();

        const vitals = terminalRow(state, 22);
        const details = terminalRow(state, 23);
        assert.match(vitals, / Satiated Strained\s*$/u);
        // wintty.c aligns BL_CONDITION to BL_HUNGER's fixed column, and the
        // following BL_CAP starts after the complete hunger field.
        assert.equal(details.indexOf('Blind'), 40);
        assert.equal(vitals.indexOf('Satiated'), 40);
        assert.equal(vitals.indexOf('Strained'), 49);
        assert.equal(capacityWrites, 1);
        for (let column = 49; column < 57; ++column) {
            assert.deepEqual({
                attr: state.nhDisplay.grid[22][column].attr,
                color: state.nhDisplay.grid[22][column].color,
            }, { attr: ATR_BOLD, color: CLR_RED });
        }
    });

test('tutorial overflow shrinking preserves complete status grids and attributes', async () => {
    const state = statusRenderingState();
    state.tutorial_dnum = state.u.uz.dnum;
    state.level.at(state.u.ux, state.u.uy).typ = ICE;
    state.uwep = null;
    state.u.uroleplay.deaf = true;
    state.u.usick_type = SICK_NONVOMITABLE | SICK_VOMITABLE;
    for (const property of [
        BLINDED,
        CONFUSION,
        FLYING,
        HALLUC,
        LEVITATION,
        SICK,
        SLIMED,
        STONED,
        STRANGLED,
        STUNNED,
    ]) {
        state.u.uprops[property] = {
            intrinsic: 1,
            extrinsic: 0,
            blocked: 0,
        };
    }
    const expected = {
        2: [
            'Hero the Plunderer             St:18 Dx:15 Co:16 In:13 Wi:14 Ch:17 Chaotic',
            'Dl:1 $:50 HP:16(16) Pw:4(6) AC:8 Xp:1/42 T:7  Str Poi Slm Sto Ill Bl Cf Df Fl H',
        ],
        3: [
            'Hero the Plunderer             St:18 Dx:15 Co:16 In:13 Wi:14 Ch:17',
            'Chaotic $:50 HP:16(16) Pw:4(6) AC:8 Xp:1/42',
            'Dl:1 T:7                         Str Poi Slm Sto Ill Bl Bare-hnds Shield Ice 5.',
        ],
    };

    for (const lines of [2, 3]) {
        const parsed = parseNethackrc(
            'OPTIONS=cond_barehanded,cond_ice\n'
            + 'OPTIONS=hilite_status:dungeon-level/always/red&bold',
        );
        state.iflags = { ...parsed.iflags, wc2_statuslines: lines };
        await bot();
        for (let index = 0; index < expected[lines].length; ++index) {
            const screenRow = 24 - lines + index;
            const text = expected[lines][index];
            assert.equal(terminalRow(state, screenRow), text.padEnd(80));
            const detailRow = index === expected[lines].length - 1;
            assert.deepEqual(
                state.nhDisplay.grid[screenRow].map((cell, column) => ({
                    color: cell.color,
                    attr: cell.attr,
                })),
                Array.from({ length: 80 }, (_, column) => {
                    if (detailRow && column < 4) {
                        return { color: CLR_RED, attr: ATR_BOLD };
                    }
                    return column < text.length
                        ? { color: NO_COLOR, attr: ATR_NONE }
                        : { color: CLR_GRAY, attr: ATR_NONE };
                }),
                `${lines}-line row ${screenRow}`,
            );
        }
    }
});

// A hero whose only status options are the turn counter and a three-row
// layout, which leaves wintty.c render_status()'s BL_CONDITION indent as the
// one thing deciding where the condition words land.
function bareThreeLineState() {
    const state = statusRenderingState();
    state.flags.showexp = false;
    state.flags.showvers = false;
    state.flags.weaponstatus = false;
    state.flags.armorstatus = false;
    state.flags.terrainstatus = false;
    state.iflags.wc2_statuslines = 3;
    return state;
}

function setConditionProperties(state, properties) {
    for (const property of properties) {
        state.u.uprops[property] = { blocked: 0, extrinsic: 0, intrinsic: 1 };
    }
}

test('the vitals row prints the hero experience level, not a constant',
    async () => {
        // botl.c:1089 fills blstats[BL_XP] from u.ulevel, under the
        // " Xp:%s" format initblstats[] gives it at 717. The port's
        // `u.ulevel || 1` fallback covers an absent level and must not
        // flatten a real one.
        const state = statusRenderingState();
        state.flags.showexp = false;
        state.flags.showvers = false;
        state.flags.weaponstatus = false;
        state.flags.armorstatus = false;
        state.flags.terrainstatus = false;
        state.u.ulevel = 3;

        await bot();

        assert.match(terminalRow(state, 23), /\bXp:3\b/u);
    });

test('conditions right justify once lining up with hunger would overrun',
    async () => {
        // wintty.c render_status():5053-5057 takes BL_HUNGER's column only
        // while the conditions still end before cw->cols - 1. Six conditions
        // spell 38 columns, and BL_HUNGER stands at column 41 on the row
        // above, so they would end exactly at that limit rather than before
        // it; C right justifies instead, one column further right.
        const state = bareThreeLineState();
        state.u.usick_type = SICK_NONVOMITABLE | SICK_VOMITABLE;
        setConditionProperties(state, [
            FLYING, LEVITATION, SICK, SLIMED, STRANGLED,
        ]);

        await bot();

        assert.equal(
            terminalRow(state, 22).trimEnd(),
            'Chaotic $:50 HP:16(16) Pw:4(6) AC:8 Xp:1',
        );
        assert.equal(
            terminalRow(state, 23).trimEnd(),
            `Dlvl:1 T:7${' '.repeat(31)} Strngl FoodPois Slime TermIll Fly Lev`,
        );
        // Right justified means ending on cw->cols - 1, one column right of
        // where lining up with hunger would have ended.
        assert.equal(terminalRow(state, 23).trimEnd().length, 79);
    });

test('conditions stay where they fall once right justifying would not fit',
    async () => {
        // render_status():5058-5061, the third arm. Eleven conditions spell 67
        // columns and BL_HUNGER stands at column 41, so lining up with it
        // overruns; right justifying needs the conditions to end before
        // cw->cols - 1, and at 67 columns from column 12 they end exactly on
        // it. C leaves them at the column check_fields() gave them.
        const state = bareThreeLineState();
        // Two digits of turn counter put BL_CONDITION at column 12.
        state.moves = 10;
        state.u.uroleplay.deaf = true;
        state.u.usick_type = SICK_NONVOMITABLE | SICK_VOMITABLE;
        setConditionProperties(state, [
            BLINDED, CONFUSION, HALLUC, LEVITATION, SICK,
            SLIMED, STONED, STRANGLED, STUNNED,
        ]);

        await bot();

        assert.equal(
            terminalRow(state, 23).trimEnd(),
            'Dlvl:1 T:10 Strngl FoodPois Slime Stone TermIll Blind Conf Deaf '
            + 'Hallu Lev Stun',
        );
        // One column short of the right margin, which is what refusing to
        // right justify costs.
        assert.equal(terminalRow(state, 23).trimEnd().length, 78);
    });

test('initial three-line status preserves tty overlap until the forced refresh', async () => {
    const state = statusRenderingState();
    state.uwep = null;
    state.uarms = null;
    state.u.uroleplay.deaf = true;
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const parsed = parseNethackrc(
        'OPTIONS=cond_barehanded\n'
        + 'OPTIONS=hilite_status:condition/blind/red&bold '
        + 'version/always/bright-blue',
    );
    state.iflags = { ...parsed.iflags, wc2_statuslines: 3 };
    state.program_state = { in_moveloop: 0 };
    state.disp = {};

    // The first pass seeds wintty's BEFORE values; the explicit second pass
    // then exposes the unchanged-field overlap under test.
    await bot();
    await bot({ initialTtyRefresh: true });

    // The condition starts at the preceding row's hunger slot (column 45),
    // while the right-justified version starts at column 75.
    const initialRow = 'Dlvl:1 T:7'.padEnd(44)
        + 'Blind'.padEnd(30)
        + '5.0.0';
    assert.equal(terminalRow(state, 23), initialRow.padEnd(80));
    assertCellRange(
        state,
        23,
        44,
        5,
        { color: CLR_RED, attr: ATR_BOLD },
        'initial overlapping Blind condition',
    );
    assertCellRange(
        state,
        23,
        49,
        25,
        { color: NO_COLOR, attr: ATR_NONE },
        'initial condition-to-version gap',
    );
    assertCellRange(
        state,
        23,
        74,
        5,
        { color: CLR_BRIGHT_BLUE, attr: ATR_NONE },
        'initial overlapping version',
    );

    state.disp.botlx = false;
    await docrt();
    assert.equal(state.disp.botlx, true, 'docrt invalidates tty status');
    state.program_state.in_moveloop = 1;
    await flush_screen(1);

    // On the forced steady-state pass, the first optional value begins at
    // its nominal column 28 and overwrites the indented conditions.
    const refreshedRow = 'Dlvl:1 T:7'.padEnd(27)
        + 'Bare-hnds Naked Stairs'.padEnd(47)
        + '5.0.0';
    assert.equal(terminalRow(state, 23), refreshedRow.padEnd(80));
    assertCellRange(
        state,
        23,
        74,
        5,
        { color: CLR_BRIGHT_BLUE, attr: ATR_NONE },
        'steady-state version',
    );
    assert.equal(state.disp.botlx, false);

    state.disp.botlx = false;
    await cls();
    assert.equal(state.disp.botlx, true, 'cls invalidates tty status');
});

test('disabled status updates retain blank reserved tty rows', async () => {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    state.level = new GameMap();
    state.iflags = { status_updates: false, wc2_statuslines: 2 };
    state.level.at(7, 20).disp_ch = '.';

    await flush_screen(1);

    const row = (index) => state.nhDisplay.grid[index]
        .map((cell) => cell.ch).join('');
    assert.equal(row(21)[6], '.', 'the full map viewport remains visible');
    assert.equal(row(22), ' '.repeat(80));
    assert.equal(row(23), ' '.repeat(80));
});

test('status uses source attribute order and exceptional strength text', async () => {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    state.dungeons = dungeonsOfDoom();
    state.flags = { female: false, showexp: true, time: true };
    state.urole = {
        name: { m: 'Barbarian' },
        rank: { m: 'Plunderer' },
    };
    state.u = {
        ux: 0,
        uy: 0,
        uz: { dnum: 0, dlevel: 1 },
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

    state.u.atemp = [-1, 0, 0, 0, 0, 0];
    await bot();
    assert.match(
        row(22),
        /St:18\/\*\* Dx:15 Co:16 In:13 Wi:14 Ch:17 Chaotic$/u,
        'status renders ACURR rather than raw base attributes',
    );

    state.iflags = parseNethackrc(
        'OPTIONS=hilite_status:strength/<119/red',
    ).iflags;
    await bot();
    const strengthColumn = row(22).indexOf('St:18/**');
    assert.notEqual(strengthColumn, -1);
    assert.equal(
        state.nhDisplay.grid[22][strengthColumn].color,
        CLR_RED,
        'numeric status highlighting receives effective Strength',
    );
    state.u.atemp[0] = 0;
    await bot();
    assert.equal(
        state.nhDisplay.grid[22][strengthColumn].color,
        NO_COLOR,
        'numeric highlighting exits when effective Strength crosses threshold',
    );

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
    await bot();
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

test('status highlights, condition filters, and hitpoint bar reach the grid', async () => {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    state.level = new GameMap();
    const options = parseNethackrc(
        'OPTIONS=hilite_status:title/always/bright-blue&bold '
        + 'dexterity/always/bright-green&underline '
        + 'hitpoints/always/red&inverse\n'
        + 'OPTIONS=hilite_status:'
        + 'condition/blind/bright-magenta&inverse',
    );
    state.dungeons = dungeonsOfDoom();
    state.flags = options.flags;
    state.iflags = options.iflags;
    state.urole = {
        name: { m: 'Barbarian' },
        rank: { m: 'Plunderer' },
    };
    state.plname = 'Hero';
    state.u = {
        ux: 0,
        uy: 0,
        uz: { dnum: 0, dlevel: 1 },
        ulevel: 1,
        uexp: 0,
        uhp: 16,
        uhpmax: 16,
        uen: 1,
        uenmax: 1,
        uac: 8,
        ualign: { type: -1 },
        // Storage order is STR, INT, WIS, DEX, CON, CHA.
        acurr: { a: [18, 13, 14, 15, 16, 17] },
        uprops: [],
        uroleplay: {},
    };
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };

    await flush_screen(1);
    const row = (index) => state.nhDisplay.grid[index]
        .map((cell) => cell.ch).join('').trimEnd();
    const styledCell = (rowIndex, text) => {
        const column = row(rowIndex).indexOf(text);
        assert.notEqual(column, -1, text);
        return state.nhDisplay.grid[rowIndex][column];
    };
    assert.deepEqual(
        [styledCell(22, 'Hero').color, styledCell(22, 'Hero').attr],
        [CLR_BRIGHT_BLUE, ATR_BOLD],
    );
    assert.deepEqual(
        [styledCell(22, 'Dx:15').color, styledCell(22, 'Dx:15').attr],
        [CLR_BRIGHT_GREEN, ATR_UNDERLINE],
    );
    assert.deepEqual(
        [styledCell(23, 'HP:16').color, styledCell(23, 'HP:16').attr],
        [CLR_RED, ATR_INVERSE],
    );
    assert.deepEqual(
        [styledCell(23, 'Blind').color, styledCell(23, 'Blind').attr],
        [CLR_BRIGHT_MAGENTA, ATR_INVERSE],
    );

    state.iflags.status_conditions.blind = false;
    await bot();
    assert.doesNotMatch(row(23), /Blind/u);

    state.iflags.wc2_hitpointbar = true;
    await bot();
    assert.equal(row(22).slice(0, 19), '[Hero the Plunderer');
    assertCellRange(
        state,
        22,
        1,
        18,
        { color: CLR_RED, attr: ATR_INVERSE },
        'full-HP visible title',
    );
    assertCellRange(
        state,
        22,
        19,
        12,
        { color: NO_COLOR, attr: ATR_NONE },
        'the full compressed title-padding run remains unowned',
    );
    assertCellRange(
        state,
        22,
        31,
        1,
        { color: NO_COLOR, attr: ATR_NONE },
        'the closing bracket remains outside the highlighted slice',
    );

    // Eight of sixteen HP places the 15-cell split inside the visible title.
    state.u.uhp = 8;
    await bot();
    assert.deepEqual(
        [
            state.nhDisplay.grid[22][15].attr,
            state.nhDisplay.grid[22][16].attr,
        ],
        [ATR_INVERSE, ATR_NONE],
        'an injured hitpoint split styles the visible percentage prefix',
    );

    state.u.uhp = 0;
    await bot();
    assert.deepEqual(
        [
            state.nhDisplay.grid[22][1].color,
            state.nhDisplay.grid[22][1].attr,
        ],
        [NO_COLOR, ATR_NONE],
        'zero hitpoints leave the entire bar in its unhighlighted part',
    );

    // One hit point out of sixteen makes exactly one of the thirty bar cells
    // highlighted and activates the source low-HP dash padding.
    state.u.uhp = 1;
    await bot();
    assert.match(row(22).slice(0, 32), /-/u);
    assert.deepEqual(
        [
            state.nhDisplay.grid[22][1].color,
            state.nhDisplay.grid[22][1].attr,
            state.nhDisplay.grid[22][2].color,
            state.nhDisplay.grid[22][2].attr,
        ],
        [CLR_RED, ATR_INVERSE, NO_COLOR, ATR_NONE],
    );

    state.iflags = parseNethackrc(
        'OPTIONS=hilite_status:'
        + 'hitpoints/<20/red/<=100%/bright-blue',
    ).iflags;
    state.u.uhp = state.u.uhpmax;
    await bot();
    assert.equal(
        styledCell(23, 'HP:16').color,
        CLR_BRIGHT_BLUE,
        'absolute and percentage thresholds keep separate best-fit bounds',
    );

    state.plname = 'Neutral';
    state.iflags = parseNethackrc(
        'OPTIONS=hilite_status:title/always/bright-blue '
        + 'alignment/always/yellow',
    ).iflags;
    await bot();
    assert.equal(styledCell(22, 'Neutral').color, CLR_BRIGHT_BLUE);
    const alignmentColumn = row(22).lastIndexOf('Chaotic');
    assert.notEqual(alignmentColumn, -1);
    assert.equal(
        state.nhDisplay.grid[22][alignmentColumn].color,
        CLR_YELLOW,
        'alignment styling targets the field rather than a matching name',
    );
});

test('status field ownership styles every dispatch branch in both layouts', async () => {
    const state = statusRenderingState();
    const cases = [
        { field: 'dungeon-level', text: 'Dlvl:1', threeRow: 23,
            before: false },
        { field: 'gold', text: '$:50', threeRow: 22 },
        { field: 'power', text: 'Pw:4', threeRow: 22 },
        { field: 'power-max', text: '(6)', threeRow: 22 },
        { field: 'hitpoints-max', text: '(16)', threeRow: 22 },
        { field: 'armor-class', text: 'AC:8', threeRow: 22 },
        { field: 'experience-level', text: 'Xp:1', threeRow: 22 },
        { field: 'experience', text: '42', threeRow: 22,
            afterPrefix: 'Xp:1/', after: false },
        { field: 'time', text: 'T:7', threeRow: 23 },
        { field: 'version', text: '5.0.0', threeRow: 23, after: false },
        { field: 'weapon', text: 'Spear', threeRow: 23 },
        { field: 'armor', text: 'Shield', threeRow: 23 },
        { field: 'terrain', text: 'Stairs', threeRow: 23 },
        { field: 'alignment', text: 'Chaotic', twoRow: 22, threeRow: 22,
            twoAfter: false },
    ];
    const expected = { color: CLR_RED, attr: ATR_BOLD };

    for (const lines of [2, 3]) {
        for (const expectedField of cases) {
            const parsed = parseNethackrc(
                `OPTIONS=hilite_status:${expectedField.field}/always/red&bold`,
            );
            state.iflags = {
                ...parsed.iflags,
                wc2_statuslines: lines,
            };
            await bot();
            const row = lines === 2
                ? expectedField.twoRow ?? 23 : expectedField.threeRow;
            const from = expectedField.afterPrefix
                ? terminalRow(state, row).indexOf(expectedField.afterPrefix)
                    + expectedField.afterPrefix.length
                : 0;
            assertStatusTextStyle(
                state,
                row,
                expectedField.text,
                expected,
                {
                    from,
                    before: expectedField.before !== false,
                    after: lines === 2
                        ? expectedField.twoAfter !== false
                        : expectedField.after !== false,
                },
            );
        }

        const parsed = parseNethackrc(
            'OPTIONS=hilite_status:title/always/red&bold',
        );
        state.iflags = { ...parsed.iflags, wc2_statuslines: lines };
        await bot();
        const titleRow = lines === 2 ? 22 : 21;
        assertCellRange(
            state,
            titleRow,
            0,
            30,
            expected,
            `${lines}-line padded title`,
        );
        assert.deepEqual(
            {
                color: state.nhDisplay.grid[titleRow][30].color,
                attr: state.nhDisplay.grid[titleRow][30].attr,
            },
            { color: NO_COLOR, attr: ATR_NONE },
            'the title separator is not part of BL_TITLE',
        );
    }
});

test('status highlight rules preserve source matching and precedence', async () => {
    const state = statusRenderingState();
    const install = (rules) => {
        const parsed = parseNethackrc(`OPTIONS=hilite_status:${rules}`);
        state.iflags = { ...parsed.iflags, wc2_statuslines: 2 };
    };
    const goldStyle = () => {
        const row = terminalRow(state, 23);
        const column = row.indexOf('$:');
        return state.nhDisplay.grid[23][column];
    };

    install('gold/<100/red/<75/bright-green/>10/bright-blue/>40/yellow/=50/bright-magenta');
    await bot();
    assert.equal(goldStyle().color, CLR_BRIGHT_MAGENTA, 'exact equality wins');

    state.invent.quan = 51;
    await bot();
    assert.equal(
        goldStyle().color,
        CLR_YELLOW,
        'the tightest matching greater-than bound wins after equality stops matching',
    );

    state.invent.quan = 5;
    await bot();
    assert.equal(
        goldStyle().color,
        CLR_BRIGHT_GREEN,
        'the tightest matching less-than bound wins',
    );

    state.invent.quan = 50;
    install('gold/<50/red/<=50/bright-green/>50/bright-blue/>=50/yellow');
    await bot();
    assert.equal(
        goldStyle().color,
        CLR_YELLOW,
        'inclusive greater-than and less-than relations both match equality in rule order',
    );

    install('title/"Plunderer"/bright-green/always/red');
    await bot();
    assert.equal(
        state.nhDisplay.grid[22][0].color,
        CLR_RED,
        'a later always rule replaces an earlier text match',
    );
    install('title/always/red/"Plunderer"/bright-green');
    await bot();
    assert.equal(
        state.nhDisplay.grid[22][0].color,
        CLR_BRIGHT_GREEN,
        'a later fuzzy text match replaces the always fallback',
    );
    state.plname = 'ABCDEFGHIJKLMNOPQRSTUVWX';
    await bot();
    assert.equal(
        state.nhDisplay.grid[22][0].color,
        CLR_RED,
        'title matching skips by the full source player-name length',
    );
    state.plname = 'Hero';

    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.u.uroleplay.deaf = true;
    state.flags.showvers = false;
    state.flags.time = false;
    state.flags.weaponstatus = false;
    state.flags.armorstatus = false;
    state.flags.terrainstatus = false;
    install('condition/blind+deaf/red&bold/blind/bright-blue&underline');
    await bot();
    assertStatusTextStyle(
        state,
        23,
        'Blind',
        { color: CLR_RED, attr: ATR_BOLD | ATR_UNDERLINE },
    );
    assertStatusTextStyle(
        state,
        23,
        'Deaf',
        { color: CLR_RED, attr: ATR_BOLD },
        { after: false },
    );
});

// botl.c get_hilite()'s BL_TH_CRITICALHP arm asks critically_low_hp(FALSE) for
// BL_HP, and on a match sets crit_hp, which its loop head then uses to skip
// every later rule that is not itself a criticalhp rule.
test('a criticalhp hilite follows pray.c and outranks later rules', async () => {
    const state = statusRenderingState();
    const install = (rules) => {
        const parsed = parseNethackrc(`OPTIONS=hilite_status:${rules}`);
        state.iflags = { ...parsed.iflags, wc2_statuslines: 2 };
    };
    const hpStyle = () => {
        const row = terminalRow(state, 23);
        const column = row.indexOf('HP:');
        return state.nhDisplay.grid[23][column];
    };
    // pray.c critically_low_hp() reads u.uhp and u.uhpmax only when Upolyd is
    // false, which you.h:554 spells (u.umonnum != u.umonster). The fixture
    // above leaves u.umonnum at 0, so u.umonster matches it here.
    state.u.umonster = 0;

    install('hitpoints/criticalhp/red&bold');

    // At experience level 1 the divisor is 5 and hplim is 15, so 16 of 16 hit
    // points clears both of critically_low_hp()'s tests: 16 > 5, and 16*5 is
    // above the 15 that maxhp is clamped to. The rule must not fire.
    await bot();
    assert.deepEqual(
        { color: hpStyle().color, attr: hpStyle().attr },
        { color: NO_COLOR, attr: ATR_NONE },
        'a hero above the critical threshold takes no criticalhp hilite',
    );

    // 3 of 3 is critically low by the "curhp <= 5" test while leaving the hero
    // uninjured, which is the case the FALSE argument selects: passing TRUE
    // would return early on !(curhp < maxhp).
    state.u.uhp = 3;
    state.u.uhpmax = 3;
    await bot();
    assert.deepEqual(
        { color: hpStyle().color, attr: hpStyle().attr },
        { color: CLR_RED, attr: ATR_BOLD },
        'an uninjured hero at 3 of 3 hit points still takes the hilite',
    );

    // A percentage rule that also matches at 10% sits after the criticalhp
    // rule; C's crit_hp skip keeps the criticalhp colour.
    state.u.uhp = 3;
    state.u.uhpmax = 30;
    install('hitpoints/criticalhp/red&bold/<50%/yellow');
    await bot();
    assert.deepEqual(
        { color: hpStyle().color, attr: hpStyle().attr },
        { color: CLR_RED, attr: ATR_BOLD },
        'a matching later percentage rule cannot displace a criticalhp match',
    );

    // The same two rules in the other order: the percentage rule matches
    // first, and the criticalhp rule that follows still replaces it.
    install('hitpoints/<50%/yellow/criticalhp/red&bold');
    await bot();
    assert.deepEqual(
        { color: hpStyle().color, attr: hpStyle().attr },
        { color: CLR_RED, attr: ATR_BOLD },
        'a criticalhp match replaces an earlier percentage match',
    );
});

test('title formatting and matching use source byte limits', async () => {
    const state = statusRenderingState();
    state.urole = {
        name: { m: 'Test role' },
        rank: { m: 'Digger' },
    };
    state.iflags = {
        ...parseNethackrc(
            'OPTIONS=hilite_status:title/always/red/"Digger"/bright-green',
        ).iflags,
        wc2_statuslines: 2,
    };

    for (const { name, prefix, color, styleColumn } of [
        {
            name: 'ABCDEFGHIJKLMNOP',
            prefix: 'ABCDEFGHIJKLMNOP',
            color: CLR_BRIGHT_GREEN,
        },
        {
            name: 'ABCDEFGHIJKLMNOPQ',
            prefix: 'ABCDEFGHIJKLMNOPQ',
            color: CLR_BRIGHT_GREEN,
        },
        {
            name: 'ABCDEFGHIJKLMNOPQRSTUVWX',
            prefix: 'ABCDEFGHIJKLMNOPQRS',
            color: CLR_RED,
        },
        {
            // Thirteen characters occupy twenty-six UTF-8 bytes. Formatting
            // truncates the byte string to nineteen cells, but get_hilite()
            // still advances by the complete strlen(plname), past Digger.
            name: 'é'.repeat(13),
            prefix: ' '.repeat(19),
            color: NO_COLOR,
            styleColumn: 20,
        },
    ]) {
        state.plname = name;
        await bot();
        assert.match(
            terminalRow(state, 22),
            new RegExp(`^${prefix} the Digger`, 'u'),
        );
        assert.equal(
            state.nhDisplay.grid[22][styleColumn ?? 0].color,
            color,
            name,
        );
        if (styleColumn) {
            assert.equal(state.nhDisplay.grid[22][0].color, NO_COLOR, name);
        }
    }

    // parse_status_hl2() copies only 79 bytes into hilite.textmatch[], then
    // trims it.  The tab is byte 79 and the significant x is byte 80: only
    // truncating before trimming leaves the fuzzy text "Digger".
    const longThreshold = 'Digger' + '-'.repeat(72) + '\t' + 'x';
    state.iflags = {
        ...parseNethackrc(
            'OPTIONS=hilite_status:title/always/red\n'
                + `OPTIONS=hilite_status:title/${longThreshold}/bright-green`,
        ).iflags,
        wc2_statuslines: 2,
    };
    state.plname = 'Edge';
    await bot();
    assert.equal(
        state.nhDisplay.grid[22][0].color,
        CLR_BRIGHT_GREEN,
        'the byte-79 tab is trimmed only after the suffix is discarded',
    );
});

test('gray and black status rules normalize at the recorder-facing grid boundary', async () => {
    const state = statusRenderingState();
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const parsed = parseNethackrc(
        'OPTIONS=hilite_status:gold/always/gray&bold '
        + 'armor-class/always/gray\n'
        + 'OPTIONS=hilite_status:power/always/red&underline '
        + 'hitpoints/always/black&bold time/always/black\n'
        + 'OPTIONS=hilite_status:condition/blind/black&underline',
    );
    state.iflags = { ...parsed.iflags, wc2_statuslines: 2 };
    await bot();

    assertStatusTextStyle(
        state,
        23,
        '$:50',
        { color: NO_COLOR, attr: ATR_BOLD },
    );
    assertStatusTextStyle(
        state,
        23,
        'AC:8',
        { color: NO_COLOR, attr: ATR_NONE },
    );
    assertStatusTextStyle(
        state,
        23,
        'Pw:4',
        { color: CLR_RED, attr: ATR_UNDERLINE },
    );
    assertStatusTextStyle(
        state,
        23,
        'HP:16',
        { color: NO_COLOR, attr: ATR_BOLD },
    );
    assertStatusTextStyle(
        state,
        23,
        'Blind',
        { color: NO_COLOR, attr: ATR_UNDERLINE },
    );
    assertStatusTextStyle(
        state,
        23,
        'T:7',
        { color: NO_COLOR, attr: ATR_NONE },
    );

    state.iflags.wc2_hitpointbar = true;
    await bot();
    assertCellRange(
        state,
        22,
        1,
        18,
        { color: NO_COLOR, attr: ATR_INVERSE },
        'black full-HP visible title',
    );
    assert.deepEqual(
        {
            color: state.nhDisplay.grid[22][19].color,
            attr: state.nhDisplay.grid[22][19].attr,
        },
        { color: NO_COLOR, attr: ATR_NONE },
        'five-or-more-byte HP-bar padding is compressed to cursor movement',
    );

    state.plname = 'FourPadTitle';
    await bot();
    assertCellRange(
        state,
        22,
        1,
        30,
        { color: NO_COLOR, attr: ATR_INVERSE },
        'four-byte HP-bar padding remains literal and highlighted',
    );

    state.plname = 'FivePadName';
    await bot();
    assertCellRange(
        state,
        22,
        26,
        5,
        { color: NO_COLOR, attr: ATR_NONE },
        'five-byte HP-bar padding becomes unowned after compression',
    );
    assert.deepEqual(
        {
            color: state.nhDisplay.grid[22][31].color,
            attr: state.nhDisplay.grid[22][31].attr,
        },
        { color: NO_COLOR, attr: ATR_NONE },
        'the closing bracket remains outside the highlighted slice',
    );

    state.plname = 'Foo    Bar';
    await bot();
    assertCellRange(
        state,
        22,
        4,
        4,
        { color: NO_COLOR, attr: ATR_INVERSE },
        'an internal four-space run remains literal and highlighted',
    );

    state.plname = 'Foo     Bar';
    await bot();
    assertCellRange(
        state,
        22,
        4,
        5,
        { color: NO_COLOR, attr: ATR_NONE },
        'an internal five-space run is compressed to cursor movement',
    );
    assertCellRange(
        state,
        22,
        1,
        3,
        { color: NO_COLOR, attr: ATR_INVERSE },
        'the highlighted prefix survives internal compression',
    );
    assertCellRange(
        state,
        22,
        9,
        17,
        { color: NO_COLOR, attr: ATR_INVERSE },
        'the highlighted suffix survives internal compression',
    );

    state.plname = 'Foo      Bar';
    await bot();
    assertCellRange(
        state,
        22,
        4,
        6,
        { color: NO_COLOR, attr: ATR_NONE },
        'an internal six-space run is fully compressed',
    );
    assertCellRange(
        state,
        22,
        1,
        3,
        { color: NO_COLOR, attr: ATR_INVERSE },
        'the six-space run retains its highlighted prefix',
    );
    assertCellRange(
        state,
        22,
        10,
        21,
        { color: NO_COLOR, attr: ATR_INVERSE },
        'the six-space run retains its highlighted suffix and tail padding',
    );

    state.plname = 'Hero';
    state.iflags.wc2_darkgray = false;
    state.iflags.wc2_hitpointbar = false;
    await bot();
    assertStatusTextStyle(
        state,
        23,
        'HP:16',
        { color: NO_COLOR, attr: ATR_BOLD },
    );
    assertStatusTextStyle(
        state,
        23,
        'Blind',
        { color: NO_COLOR, attr: ATR_UNDERLINE },
    );
    assertStatusTextStyle(
        state,
        23,
        'T:7',
        { color: NO_COLOR, attr: ATR_NONE },
    );
    assertStatusTextStyle(
        state,
        23,
        '$:50',
        { color: NO_COLOR, attr: ATR_BOLD },
    );

    state.iflags.wc2_hitpointbar = true;
    await bot();
    assertCellRange(
        state,
        22,
        1,
        18,
        { color: NO_COLOR, attr: ATR_INVERSE },
        'both use_darkgray states canonicalize black recorder cells',
    );
    assert.notEqual(CLR_GRAY, NO_COLOR, 'the assertion detects normalization');
    assert.notEqual(CLR_BLACK, NO_COLOR, 'black is distinct before capture');
});

test('three-line status clips the map around a bottom-row hero', async () => {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    state.level = new GameMap();
    state.dungeons = dungeonsOfDoom();
    state.flags = {};
    state.iflags = { wc2_statuslines: 3 };
    state.urole = {
        name: { m: 'Archeologist' },
        rank: { m: 'Digger' },
    };
    state.u = {
        ux: 1,
        uy: 20,
        uz: { dnum: 0, dlevel: 1 },
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

// do.c goto_level() calls flush_screen(-1) at 1718 to postpone every map flush
// while it builds the destination, and again at 1839 to release it. Nothing
// pinned either half: mutating the `-1` the toggle tests for left the whole
// suite green, so the delay could have stopped engaging without a failure.
test('flush_screen(-1) postpones the map flush, and a new segment starts undelayed', async () => {
    const x = 7;
    const y = 4;
    const cat = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        mtame: 10,
        minvis: false,
        mundetected: false,
        mx: x,
        my: y,
    };

    const state = visibleCellState({ x, y });
    state.nhDisplay = new GameDisplay(null);
    state.level.flags.hero_memory = true;
    state.iflags = {
        wc_color: true,
        wc_hilite_pet: true,
        wc2_petattr: ATR_BOLD,
    };
    const gridCell = () => state.nhDisplay.grid[y + 1][x - 1];

    state.level.monsters[x][y] = cat;
    newsym(x, y);
    await flush_screen(1);
    assert.equal(gridCell().ch, 'f', 'the undelayed flush paints the pet');

    // do.c:1718. Everything drawn from here is held back.
    await flush_screen(-1);
    state.level.monsters[x][y] = null;
    newsym(x, y);
    await flush_screen(1);
    assert.equal(
        gridCell().ch, 'f',
        'a flush issued while delayed leaves the previous cell standing',
    );

    // do.c:1839. The release flushes what accumulated.
    await flush_screen(-1);
    assert.notEqual(
        gridCell().ch, 'f',
        'releasing the delay paints the square the pet left',
    );

    // The port can leave goto_level() between that pair, because nine
    // fail-closed throws sit between them. A module-level flag would stay
    // latched and suppress every flush in every later segment of the session;
    // the flag lives on the game state, which resetGame() replaces per
    // runSegment(), so the next segment paints normally.
    await flush_screen(-1);
    const next = visibleCellState({ x, y });
    next.nhDisplay = new GameDisplay(null);
    next.level.flags.hero_memory = true;
    next.iflags = {
        wc_color: true,
        wc_hilite_pet: true,
        wc2_petattr: ATR_BOLD,
    };
    next.level.monsters[x][y] = cat;
    newsym(x, y);
    await flush_screen(1);
    assert.equal(
        next.nhDisplay.grid[y + 1][x - 1].ch, 'f',
        'a delay left latched by an aborted level change does not survive resetGame()',
    );
});

// A hero standing one turn into an ordinary level with the turn counter on the
// status line, which is what botl.c timebot() exists to refresh. 'options'
// names the status-line options under test; every caller keeps 'time', because
// botl.c timebot() returns without doing anything when it is off.
async function timedStartup(options = 'time') {
    await runSegment({
        seed: 5310007,
        datetime: '20310203040506',
        nethackrc: 'OPTIONS=name:Timebot,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen\n'
            + `OPTIONS=pettype:none,!acoustics,!autopickup,${options}\n`,
        moves: '.',
    });
    assert.equal(game.flags.time, true);
}

// The last terminal row, which holds the second status line.
function statusRow() {
    return terminalRow(game, game.nhDisplay.rows - 1).trimEnd();
}

test('timebot refreshes the turn counter and leaves the rest of the row',
    async () => {
        // botl.c timebot() calls stat_update_time(), which writes
        // blstats[BL_TIME] alone. Every other field keeps the status_vals[]
        // string the last full status pass left, so a value that moved with
        // nothing marking the status line stays off the row.
        await timedStartup();
        const before = statusRow();
        game.u.uhp -= 4;
        game.moves += 1;
        game.disp.botl = false;
        game.disp.botlx = false;
        game.disp.time_botl = true;

        await timebot();

        assert.equal(game.disp.time_botl, false);
        assert.equal(
            statusRow(),
            before.replace(/T:\d+/u, `T:${game.moves}`),
        );
    });

// C ref: botl.c bot() (254-256). The gb.bot_disabled test returns before the
// status window is written and before disp.botl, disp.botlx and disp.time_botl
// are cleared, so the update it skipped is still pending for the next enabled
// pass. windows.c select_menu() (1861) and getlin() (1898) are the two writers
// of the flag.
test('bot leaves the status row and the pending flag alone while disabled',
    async () => {
        await timedStartup();
        const before = statusRow();
        // Four points off a Valkyrie's starting hit points, enough to change
        // the HP field this row carries.
        game.u.uhp -= 4;
        game.disp.botl = true;
        (game.gb ??= {}).bot_disabled = true;

        await bot();

        assert.equal(statusRow(), before);
        assert.equal(game.disp.botl, true);

        // The same call once the menu that raised the flag has gone.
        game.gb.bot_disabled = false;
        await bot();

        assert.notEqual(statusRow(), before);
        assert.equal(game.disp.botl, false);
    });

// C ref: botl.c timebot() (276-278), the same early return over the turn
// counter's own refresh path.
test('timebot leaves the turn counter and disp.time_botl alone while disabled',
    async () => {
        await timedStartup();
        const before = statusRow();
        game.moves += 1;
        game.disp.botl = false;
        game.disp.botlx = false;
        game.disp.time_botl = true;
        (game.gb ??= {}).bot_disabled = true;

        await timebot();

        assert.equal(statusRow(), before);
        assert.equal(game.disp.time_botl, true);
    });

test('timebot shifts the fields a widened turn counter displaces',
    async () => {
        // wintty.c check_fields() re-lays every field out from the cached
        // lengths, so a field whose own text is unchanged still moves when an
        // earlier one grows. Nine to ten is the first width change a game
        // reaches.
        await timedStartup();
        game.moves = 9;
        // hu_stat[SATIATED] puts a word to the right of the turn counter.
        game.u.uhs = SATIATED;
        game.disp.botl = true;
        await bot();
        assert.equal(statusRow().endsWith('T:9 Satiated'), true, statusRow());

        game.moves = 10;
        game.disp.botl = false;
        game.disp.botlx = false;
        game.disp.time_botl = true;
        await timebot();

        assert.equal(statusRow().endsWith('T:10 Satiated'), true, statusRow());
    });

// wintty.c render_status() runs on the BL_FLUSH that botl.c
// stat_update_time() sends, exactly as it does on the one bot() sends, so a
// turn-counter refresh must leave the row where a whole-status pass leaves it.
// Two of the row's fields make that more than a shift: BL_VERS right justifies
// at cw->cols - lth when it ends its row (wintty.c:5185-5210) and the
// three-row BL_CONDITION indents to tty_status[BEFORE][BL_HUNGER].x on the row
// above (wintty.c:5036-5062). Neither column reads BL_TIME's width.
//
// Renders the same state twice: once through a whole-status pass at the turn
// the counter widens, and once through a whole-status pass at the turn before
// plus the refresh. Returns both rows for a byte comparison.
async function rowBothWays(options, prepare = () => {}) {
    // The counter gains its fourth digit here, which is the widest gain a
    // single turn can produce and the one the recorded reproduction used.
    const widened = 1000;
    await timedStartup(options);
    prepare();
    game.moves = widened;
    game.disp.botl = true;
    await bot();
    const wholePass = statusRow();

    await timedStartup(options);
    prepare();
    game.moves = widened - 1;
    game.disp.botl = true;
    await bot();
    game.moves = widened;
    game.disp.botl = false;
    game.disp.botlx = false;
    game.disp.time_botl = true;
    await timebot();

    return { timeRefresh: statusRow(), wholePass };
}

test('a turn-counter refresh leaves the version where a whole pass does',
    async () => {
        const { timeRefresh, wholePass } = await rowBothWays('time,showvers');
        // status_version() is "5.0.0" and status_fieldfmt[] prefixes a space,
        // so vstart is 80 - 6 and the version text sits in columns 75-79,
        // one-based, whatever the turn counter costs.
        assert.equal(wholePass.endsWith('5.0.0'), true, wholePass);
        assert.equal(wholePass.length, 79, wholePass);
        assert.equal(timeRefresh, wholePass);
    });

test('a turn-counter refresh leaves the conditions where a whole pass does',
    async () => {
        const { timeRefresh, wholePass } = await rowBothWays(
            'time,statuslines:3',
            // botl.c:1202 reads Stunned for BL_MASK_STUN, which
            // _propertyIntrinsic() answers from this timer.
            () => { game.u.uprops[STUNNED] = { intrinsic: 50 }; },
        );
        // BL_HUNGER sits one column past "Neutral $:0 HP:16(16) Pw:2(2)
        // AC:6 Xp:1" on the row above, so the indent puts the space at
        // column 40 and "Stun" at 41, one-based.
        assert.equal(wholePass.endsWith(' Stun'), true, wholePass);
        assert.equal(wholePass.length, 44, wholePass);
        assert.equal(timeRefresh, wholePass);
    });

test('a turn-counter refresh clears the indent the version overwrites',
    async () => {
        const { timeRefresh, wholePass } = await rowBothWays(
            'time,statuslines:3,showvers',
            () => { game.u.uprops[STUNNED] = { intrinsic: 50 }; },
        );
        // BL_VERS pads from its own nominal column, which sits just past the
        // conditions' *unindented* end, so it erases the indented word on its
        // way to column 75. wintty.c:5194-5196 calls that out as a FIXME; it
        // is the rendering C produces and the row both paths must show.
        assert.equal(wholePass.includes('Stun'), false, wholePass);
        assert.equal(wholePass.endsWith('5.0.0'), true, wholePass);
        assert.equal(timeRefresh, wholePass);
    });

test('a turn-counter refresh refuses a row it would have to shrink',
    async () => {
        // wintty.c make_things_fit() re-runs its shrink ladder on the BL_FLUSH
        // stat_update_time() sends, from the unshrunk strings the core last
        // supplied. This port holds only the rendered row, so a refresh that
        // needs a shorter rung than the whole-status pass chose stops the
        // segment instead of guessing at one.
        await timedStartup('time,showexp');
        // Six conditions at their full spellings, which is the most that fits
        // before make_things_fit() abbreviates them.
        for (const property of [
            BLINDED, CONFUSION, FLYING, HALLUC, LEVITATION, STUNNED,
        ]) {
            game.u.uprops[property] = { intrinsic: 50 };
        }
        // Three experience points' worth of digits, plus BL_EXP's '/', leave
        // the row one column short of the 79 wintty.c allows it.
        game.u.uexp = 123;
        game.moves = 999;
        game.disp.botl = true;
        await bot();
        assert.equal(statusRow().length, 78, statusRow());

        const refreshAt = async (moves) => {
            game.moves = moves;
            game.disp.botl = false;
            game.disp.botlx = false;
            game.disp.time_botl = true;
            return timebot();
        };

        // A row that lands exactly on the limit still fits, so C shrinks
        // nothing and this port renders it.
        await refreshAt(1000);
        assert.equal(statusRow().length, 79, statusRow());

        // One column past it, C would abbreviate the condition words.
        await assert.rejects(refreshAt(10000), UnsupportedStatusRefreshError);
    });

test('timebot with the time option off only clears its own flag', async () => {
    // botl.c timebot()'s `if (flags.time && ...)` guard. allmain.c only sets
    // disp.time_botl when the option is on, so the guard is reached with it
    // off through options.c toggling the option mid-game.
    await timedStartup();
    const before = statusRow();
    game.flags.time = false;
    game.u.uhp -= 4;
    // The counter moves too, so the row would change if the guard were gone.
    game.moves += 1;
    game.disp.botl = false;
    game.disp.botlx = false;
    game.disp.time_botl = true;

    await timebot();

    assert.equal(game.disp.time_botl, false);
    assert.equal(statusRow(), before);
});

test('timebot with status updates suppressed leaves the row untouched',
    async () => {
        // The other half of timebot()'s guard, `iflags.status_updates`, which
        // the 'status_updates' option turns off.
        await timedStartup();
        const before = statusRow();
        game.iflags.status_updates = false;
        game.moves += 1;
        game.disp.botl = false;
        game.disp.botlx = false;
        game.disp.time_botl = true;

        await timebot();

        assert.equal(game.disp.time_botl, false);
        assert.equal(statusRow(), before);
    });

test('flush_screen takes timebot when only the turn counter is marked',
    async () => {
        // display.c flush_screen():2236-2239 repeats moveloop_core()'s gate:
        // `if (disp.botl || disp.botlx) bot(); else if (disp.time_botl)
        // timebot();`.
        await timedStartup();
        const before = statusRow();
        game.u.uhp -= 4;
        game.moves += 1;
        game.disp.botl = false;
        game.disp.botlx = false;
        game.disp.time_botl = true;

        await flush_screen(1);

        assert.equal(
            statusRow(),
            before.replace(/T:\d+/u, `T:${game.moves}`),
        );

        // The first arm still redraws everything.
        game.disp.botl = true;
        await flush_screen(1);
        assert.match(statusRow(), new RegExp(`HP:${game.u.uhp}\\b`, 'u'));
    });

// ── display.h cmap glyph numbers ──

// The dungeon position cmap_walls_to_glyph() reads, made explicit. The three
// branch numbers are dungeon.c's own d_*_dnum topology fields, and the
// hellish flag is what In_hell() reads. js/const.js In_mines(), In_sokoban()
// and Is_knox_level() read those fields off the module-global game rather than
// off a threaded state, as C reads svd.dungeon_topology, so this installs the
// state as that global.
function branchedState({ dnum = 0, dlevel = 1, hellish = false } = {}) {
    const state = resetGame();
    state.level = new GameMap();
    initialize_symbols_from_options({ flags: {} }, state);
    state.u = { uz: { dnum, dlevel } };
    state.dungeons = [
        { flags: {} }, { flags: {} }, { flags: {} }, { flags: {} },
    ];
    state.dungeons[dnum] = { flags: { hellish } };
    state.mines_dnum = 1;
    state.sokoban_dnum = 2;
    state.knox_level = { dnum: 3, dlevel: 1 };
    return state;
}

test('cmap_to_glyph walks display.h\'s six arms in order', () => {
    // display.h:621-628. Each expectation is the arm's own arithmetic, spelled
    // out rather than recomputed by the code under test.
    const state = branchedState();
    assert.equal(cmap_to_glyph(S_stone, state), GLYPH_CMAP_STONE_OFF);
    // A wall in the main dungeon: cmap_walls_to_glyph(), whose base is
    // GLYPH_CMAP_MAIN_OFF here.
    assert.equal(
        cmap_to_glyph(S_trwall, state),
        (S_trwall - S_vwall) + GLYPH_CMAP_MAIN_OFF,
    );
    // Everything from S_ndoor up to but excluding S_altar is cmap A.
    assert.equal(cmap_to_glyph(S_ndoor, state), GLYPH_CMAP_A_OFF);
    assert.equal(
        cmap_to_glyph(S_brdnladder, state),
        (S_brdnladder - S_ndoor) + GLYPH_CMAP_A_OFF,
    );
    // S_altar carries no alignment, so the macro chooses the neutral altar.
    assert.equal(
        cmap_to_glyph(S_altar, state), GLYPH_ALTAR_OFF + altar_neutral,
    );
    // Cmap B runs from S_grave to the last trap symbol.
    assert.equal(cmap_to_glyph(S_grave, state), GLYPH_CMAP_B_OFF);
    assert.equal(
        cmap_to_glyph(S_arrow_trap + MAXTCHARS - 1, state),
        (S_arrow_trap + MAXTCHARS - 1 - S_grave) + GLYPH_CMAP_B_OFF,
    );
    // Cmap C runs from S_digbeam to S_goodpos, skipping the zap symbols
    // between it and cmap B.
    assert.equal(cmap_to_glyph(S_digbeam, state), GLYPH_CMAP_C_OFF);
    assert.equal(
        cmap_to_glyph(S_goodpos, state),
        (S_goodpos - S_digbeam) + GLYPH_CMAP_C_OFF,
    );
    // Past the last cmap index there is no glyph. S_sw_tl is the first
    // swallow symbol, which cmap_to_glyph() deliberately cannot name.
    assert.equal(cmap_to_glyph(S_goodpos + 1, state), NO_GLYPH);
    // The one boundary whose answer is unusable either way. C's cmap B test
    // ends at S_arrow_trap + MAXTCHARS, which is S_vbeam, the first zap
    // symbol; the chain hands it to the cmap C arm instead, whose subtraction
    // from S_digbeam goes negative. C has no arm that can name a zap symbol
    // and this transcribes the boundary rather than inventing one.
    assert.equal(
        cmap_to_glyph(S_arrow_trap + MAXTCHARS, state),
        cmap_c_to_glyph(S_arrow_trap + MAXTCHARS),
    );
});

test('cmap_walls_to_glyph reads the branch the hero is standing in', () => {
    // display.h:598-604, tested in its own order: mines first, then hell,
    // then Knox, then Sokoban, with the main dungeon as the default.
    for (const [label, options, base] of [
        ['main', {}, GLYPH_CMAP_MAIN_OFF],
        ['mines', { dnum: 1 }, GLYPH_CMAP_MINES_OFF],
        ['gehennom', { dnum: 0, hellish: true }, GLYPH_CMAP_GEH_OFF],
        ['knox', { dnum: 3 }, GLYPH_CMAP_KNOX_OFF],
        ['sokoban', { dnum: 2 }, GLYPH_CMAP_SOKO_OFF],
    ]) {
        const state = branchedState(options);
        assert.equal(cmap_walls_to_glyph(S_vwall, state), base, label);
        assert.equal(
            cmap_walls_to_glyph(S_trwall, state),
            (S_trwall - S_vwall) + base,
            label,
        );
        // The whole chain routes a wall index through the same arm.
        assert.equal(cmap_to_glyph(S_hwall, state), (S_hwall - S_vwall) + base,
            label);
    }
    // Mines wins over hell, which is C's order and not an alphabetical one:
    // the Mines' End levels are not hellish, but the test pins the precedence
    // rather than the dungeon that happens to reach it.
    assert.equal(
        cmap_walls_to_glyph(S_vwall, branchedState({
            dnum: 1, hellish: true,
        })),
        GLYPH_CMAP_MINES_OFF,
    );
});

test('altar_to_glyph reads the sanctum bit before the alignment', () => {
    // display.h:569-579 over enum altar_types (346-352). AM_SANCTUM is tested
    // first and as a whole mask, so a sanctum altar of any alignment is
    // "other"; everything the three alignment tests miss is unaligned.
    assert.equal(altar_to_glyph(AM_LAWFUL), GLYPH_ALTAR_OFF + altar_lawful);
    assert.equal(altar_to_glyph(AM_NEUTRAL), GLYPH_ALTAR_OFF + altar_neutral);
    assert.equal(altar_to_glyph(AM_CHAOTIC), GLYPH_ALTAR_OFF + altar_chaotic);
    assert.equal(altar_to_glyph(0), GLYPH_ALTAR_OFF + altar_unaligned);
    assert.equal(
        altar_to_glyph(AM_SANCTUM | AM_LAWFUL), GLYPH_ALTAR_OFF + altar_other,
    );
    // AM_MASK is three bits with four defined values; the four that are not
    // defined all fall to unaligned rather than off the end of the range.
    assert.equal(altar_to_glyph(AM_MASK), GLYPH_ALTAR_OFF + altar_unaligned);
});

test('glyph_is_cmap answers TRUE for a zap glyph, as display.h:723 does', () => {
    // The compiled macro is one contiguous span and the `#if 0` decomposition
    // above it is not; GLYPH_ZAP_OFF sits inside the span, so the two differ
    // in result. glyphs.c:983 spells the disjunction that makes that visible.
    assert.equal(glyph_is_cmap(GLYPH_CMAP_STONE_OFF), true);
    assert.equal(glyph_is_cmap(GLYPH_CMAP_STONE_OFF - 1), false);
    assert.equal(glyph_is_cmap(GLYPH_ZAP_OFF), true);
    assert.equal(glyph_is_cmap(GLYPH_ZAP_OFF + (NUM_ZAP << 2) - 1), true);
    const lastCmapC = GLYPH_CMAP_C_OFF + (S_goodpos - S_digbeam);
    assert.equal(glyph_is_cmap(lastCmapC), true);
    assert.equal(glyph_is_cmap(lastCmapC + 1), false);

    // display.h:699-700, the one per-range predicate the port needs.
    assert.equal(glyph_is_cmap_zap(GLYPH_ZAP_OFF - 1), false);
    assert.equal(glyph_is_cmap_zap(GLYPH_ZAP_OFF), true);
    assert.equal(
        glyph_is_cmap_zap(GLYPH_ZAP_OFF + (NUM_ZAP << 2) - 1), true,
    );
    assert.equal(glyph_is_cmap_zap(GLYPH_ZAP_OFF + (NUM_ZAP << 2)), false);
});

test('glyph_to_cmap inverts cmap_to_glyph where the number allows', () => {
    // glyphs.c:199-231. Two places are lossy by construction: every branch's
    // walls come back as the main dungeon's indices, and all five altars come
    // back as S_altar.
    const state = branchedState();
    for (const cmap of [
        S_stone, S_vwall, S_trwall, S_ndoor, S_brdnladder, S_grave,
        S_fountain, S_digbeam, S_goodpos,
    ]) {
        assert.equal(
            glyph_to_cmap(cmap_to_glyph(cmap, state)), cmap, `cmap ${cmap}`,
        );
    }
    for (const options of [{ dnum: 1 }, { dnum: 2 }, { dnum: 3 }]) {
        assert.equal(
            glyph_to_cmap(cmap_walls_to_glyph(S_hwall, branchedState(options))),
            S_hwall,
        );
    }
    for (let type = 0; type < 5; ++type)
        assert.equal(glyph_to_cmap(GLYPH_ALTAR_OFF + type), S_altar);
    // glyphs.c:1003-1004 answers the zap range with a beam direction rather
    // than the fencepost: four directions per zap type, recovered by the
    // remainder. Nothing in this port produces a zap glyph, so this pins the
    // transcription rather than a reachable answer.
    for (const direction of [0, 1, 2, 3]) {
        assert.equal(
            glyph_to_cmap(GLYPH_ZAP_OFF + direction), S_vbeam + direction,
            `zap direction ${direction}`,
        );
    }
    // The fifth glyph is the next zap type's first direction, so the
    // remainder wraps back to S_vbeam.
    assert.equal(glyph_to_cmap(GLYPH_ZAP_OFF + 4), S_vbeam);
    // Everything outside the cmap ranges answers defsyms[]'s fencepost entry.
    assert.equal(glyph_to_cmap(GLYPH_OBJ_OFF), MAXPCHARS);
    assert.equal(glyph_to_cmap(GLYPH_CMAP_STONE_OFF - 1), MAXPCHARS);
});

test('trap and engraving glyph numbers come from their own cmap indices', () => {
    // display.h:630-634 over rm.h trap_to_defsym() and engrave.h
    // engraving_to_defsym(). PIT and WEB are two ordinary trap types.
    const state = branchedState();
    for (const ttyp of [PIT, WEB]) {
        assert.equal(
            trap_to_glyph({ ttyp }, state),
            cmap_to_glyph(S_arrow_trap + ttyp - 1, state),
            `trap ${ttyp}`,
        );
    }
    // engraving_to_defsym() reads the terrain under the engraving, not the
    // engraving, so the same record answers differently on two squares.
    state.level.at(7, 4).typ = CORR;
    state.level.at(8, 4).typ = ROOM;
    assert.equal(
        engraving_to_glyph({ engr_x: 7, engr_y: 4 }, state),
        cmap_to_glyph(S_engrcorr, state),
    );
    assert.equal(
        engraving_to_glyph({ engr_x: 8, engr_y: 4 }, state),
        cmap_to_glyph(S_engroom, state),
    );
});

test('map_glyphinfo colours every cmap arm from its own source table', () => {
    // display.c reset_glyphmap()'s cmap arms (2884-2984) over its
    // cmap_color(), wall_color() and altar_color() macros (2684-2694). Each
    // expectation is the defsym.h, wallcolors[] or altarcolors[] value.
    const state = branchedState();
    state.iflags = { wc_color: true };
    const colorOf = (glyph) => map_glyphinfo(glyph, state).color;
    // cmap_color(), which reads defsyms[].color for cmaps A, B, C and stone.
    assert.equal(colorOf(cmap_to_glyph(S_vodoor, state)), CLR_BROWN);
    assert.equal(colorOf(cmap_to_glyph(S_fountain, state)), CLR_BRIGHT_BLUE);
    assert.equal(colorOf(cmap_to_glyph(S_lavawall, state)), CLR_ORANGE);
    assert.equal(colorOf(cmap_to_glyph(S_poisoncloud, state)), CLR_BRIGHT_GREEN);
    // S_stone and S_room are both NO_COLOR on the wire: defsym.h gives the
    // first NO_COLOR outright and the second CLR_GRAY, which recorder patch
    // 006 serializes as the terminal default.
    assert.equal(colorOf(cmap_to_glyph(S_stone, state)), NO_COLOR);
    assert.equal(colorOf(cmap_to_glyph(S_room, state)), NO_COLOR);
    // wall_color(), whose table display.c leaves at CLR_GRAY for all five
    // branches; the four branch ranges have no other source of colour.
    for (const options of [
        {}, { dnum: 1 }, { dnum: 2 }, { dnum: 3 }, { dnum: 0, hellish: true },
    ]) {
        const branch = branchedState(options);
        branch.iflags = { wc_color: true };
        assert.equal(
            map_glyphinfo(cmap_walls_to_glyph(S_vwall, branch), branch).color,
            NO_COLOR,
        );
    }
    // altar_color(), display.h enum altar_colors (290-311) without
    // USE_GENERAL_ALTAR_COLORS: three aligned altars share CLR_GRAY.
    assert.equal(colorOf(GLYPH_ALTAR_OFF + altar_unaligned), CLR_RED);
    assert.equal(colorOf(GLYPH_ALTAR_OFF + altar_chaotic), NO_COLOR);
    assert.equal(colorOf(GLYPH_ALTAR_OFF + altar_neutral), NO_COLOR);
    assert.equal(colorOf(GLYPH_ALTAR_OFF + altar_lawful), NO_COLOR);
    assert.equal(colorOf(GLYPH_ALTAR_OFF + altar_other), CLR_BRIGHT_MAGENTA);
    // The closing clamp: with colour off every arm answers NO_COLOR.
    state.iflags = { wc_color: false };
    assert.equal(colorOf(cmap_to_glyph(S_vodoor, state)), NO_COLOR);
    assert.equal(colorOf(GLYPH_ALTAR_OFF + altar_unaligned), NO_COLOR);
});

test('map_glyphinfo keeps the two black-and-white gates apart', () => {
    // The asymmetry display.c reset_glyphmap() has between its two arms.
    // CMAP_B computes MG_BW_LAVA, MG_BW_ICE and MG_BW_SINK only inside
    // `if (!iflags.use_color)` (2909-2929); CMAP_A raises MG_BW_ENGR in the
    // else branch of its rogue-colour test (2953-2958), whatever the colour
    // option says. Both bits reach the screen through
    // wintty.c tty_print_glyph()'s iflags.use_inverse arm.
    //
    // defsym.h gives each pair the same byte out of the box: S_lava and
    // S_pool are both '}', S_ice and S_room are both '.', S_sink and
    // S_fountain are both '{', and S_engrcorr and S_corr are both '#'.
    const state = branchedState();
    const attrOf = (cmap) => map_glyphinfo(cmap_to_glyph(cmap, state), state)
        .attr ?? 0;

    state.iflags = { wc_color: true, wc_inverse: true };
    for (const cmap of [S_lava, S_lavawall, S_ice, S_sink])
        assert.equal(attrOf(cmap), 0, `cmap ${cmap} with colour on`);
    assert.equal(attrOf(S_engrcorr), ATR_INVERSE, 'engraving with colour on');

    state.iflags = { wc_color: false, wc_inverse: true };
    for (const cmap of [S_lava, S_lavawall, S_ice, S_sink])
        assert.equal(attrOf(cmap), ATR_INVERSE, `cmap ${cmap} with colour off`);
    assert.equal(attrOf(S_engrcorr), ATR_INVERSE, 'engraving with colour off');
    // The three pairs are the only ones the switch names: a corridor draws
    // '#' like the engraving does and still takes no attribute, because
    // S_corr is not one of its cases.
    assert.equal(attrOf(S_corr), 0);

    // tty_print_glyph()'s own gate, which is separate from both of the above.
    state.iflags = { wc_color: false, wc_inverse: false };
    for (const cmap of [S_lava, S_ice, S_sink, S_engrcorr])
        assert.equal(attrOf(cmap), 0, `cmap ${cmap} without inverse`);

    // A symbol set that separates the pair takes the bit away again.
    const separated = branchedState();
    initialize_symbols_from_options(
        parseNethackrc('SYMBOLS=S_lava:L,S_ice:I,S_sink:K,S_engrcorr:E'),
        separated,
    );
    separated.iflags = { wc_color: false, wc_inverse: true };
    for (const cmap of [S_lava, S_ice, S_sink, S_engrcorr]) {
        assert.equal(
            map_glyphinfo(cmap_to_glyph(cmap, separated), separated).attr ?? 0,
            0,
            `cmap ${cmap} with its own symbol`,
        );
    }
});

test('map_glyphinfo brightens a lit corridor drawn with the dark byte', () => {
    // display.c:2949-2952. S_corr and S_litcorr are both '#' in defsym.h, so
    // the recolour is the only thing that keeps them apart.
    const state = branchedState();
    state.iflags = { wc_color: true };
    assert.equal(
        map_glyphinfo(cmap_to_glyph(S_litcorr, state), state).color,
        CLR_WHITE,
    );
    // Give the lit corridor a byte of its own and defsyms[].color answers
    // instead, which is CLR_GRAY and so the terminal default on the wire.
    const separated = branchedState();
    initialize_symbols_from_options(
        parseNethackrc('SYMBOLS=S_litcorr:L'), separated,
    );
    separated.iflags = { wc_color: true };
    assert.equal(
        map_glyphinfo(cmap_to_glyph(S_litcorr, separated), separated).color,
        NO_COLOR,
    );
});

test('map_glyphinfo resolves GLYPH_NOTHING to the blank the symset gives it',
    () => {
    // display.c:2774-2777, the first arm of C's chain. reglyph_darkroom()
    // is the ported writer of that number.
    const state = branchedState();
    state.iflags = { wc_color: true };
    const nothing = map_glyphinfo(GLYPH_NOTHING_OFF, state);
    assert.deepEqual(
        { ch: nothing.ch, color: nothing.color, dec: nothing.dec },
        { ch: ' ', color: NO_COLOR, dec: false },
    );
    // GLYPH_UNEXPLORED sits directly below it and has no ported writer, so it
    // is refused rather than resolved through the arm underneath.
    assert.throws(
        () => map_glyphinfo(GLYPH_UNEXPLORED_OFF, state), TypeError,
    );

    // The arm draws from no defsym index, so it takes its accessibility kind
    // directly rather than through the cmap classifier. js/startup_a11y.js
    // tests `oldKind === 'nothing'`, its transcription of display.c
    // show_glyph()'s disjunct on the old glyph; with no kind attached the
    // reader falls back to 'other' and that disjunct can never fire for a
    // square reglyph_darkroom() blanked.
    const announced = map_glyphinfo(
        GLYPH_NOTHING_OFF, { ...state, a11y: { glyph_updates: true } },
    );
    assert.equal(announced.a11yKind, 'nothing');
});

test('back_to_glyph fixes a wall\'s branch where the square is recorded', () => {
    // display.c back_to_glyph() (2286-2427) ends in cmap_to_glyph(), whose
    // wall arm reads u.uz. The number therefore records the branch, and a
    // repaint after the hero has left cannot change it.
    const state = branchedState({ dnum: 1 });
    Object.assign(state.level.at(7, 4), { typ: VWALL, seenv: SVALL });
    const inTheMines = back_to_glyph(7, 4, state);
    assert.equal(inTheMines, cmap_walls_to_glyph(S_vwall, state));
    state.u.uz = { dnum: 0, dlevel: 1 };
    assert.notEqual(back_to_glyph(7, 4, state), inTheMines);

    // Its one bypass: an altar's alignment picks one of five numbers, which
    // no single cmap index can name. struct rm aliases altarmask with flags,
    // and mkaltar() writes flags, so the live field takes the first case and
    // the shim keeps the second.
    Object.assign(state.level.at(8, 4), { typ: ALTAR, flags: AM_CHAOTIC });
    assert.equal(
        back_to_glyph(8, 4, state), GLYPH_ALTAR_OFF + altar_chaotic,
    );
    Object.assign(
        state.level.at(9, 4), { typ: ALTAR, altarmask: AM_SANCTUM | AM_LAWFUL },
    );
    assert.equal(back_to_glyph(9, 4, state), GLYPH_ALTAR_OFF + altar_other);

    // display.c:2325-2334 reads the doormask three ways, and struct rm aliases
    // it with `flags`. All three arms have to see the value, not only the
    // closed-door default at the bottom, and each has to see it through
    // whichever of the two aliased fields the writer filled: js/mklev.js and
    // js/lock.js write doormask, level generation writes flags.
    for (const [field, mask, horizontal, expected] of [
        ['flags', D_BROKEN, false, S_ndoor],
        ['doormask', D_BROKEN, false, S_ndoor],
        ['flags', D_ISOPEN, false, S_vodoor],
        ['doormask', D_ISOPEN, false, S_vodoor],
        ['flags', D_ISOPEN, true, S_hodoor],
        ['flags', D_CLOSED, false, S_vcdoor],
        ['doormask', D_CLOSED, false, S_vcdoor],
        ['flags', D_CLOSED, true, S_hcdoor],
        ['doormask', D_CLOSED, true, S_hcdoor],
        // Neither field set is the no-door default.
        ['flags', 0, false, S_ndoor],
    ]) {
        Object.assign(
            state.level.at(10, 4),
            makeLocation(), { typ: DOOR, [field]: mask, horizontal },
        );
        assert.equal(
            back_to_glyph(10, 4, state),
            cmap_to_glyph(expected, state),
            `${field} ${mask} horizontal ${horizontal}`,
        );
    }
});

test('each altar number takes its own customization name', () => {
    // map_glyphinfo() looks a customization up by the name glyphs.c gives the
    // number, so the five altar names have to line up with the five numbers in
    // order. glyphs.c:1015-1027 builds four of them by prefixing the alignment
    // to the base name and gives the sanctum altar "altar other" with
    // skip_base set, which is why the fifth is G_altar_other rather than
    // G_other_altar. No symbol set defines an altar customization today and a
    // standalone SYMBOLS line does not apply one, so the drawn character
    // cannot separate the five; what can is that each name is one the glyph
    // registry holds, since a name it does not hold applies nothing at all and
    // looks exactly like a name that applies nothing because no set defines
    // it.
    assert.deepEqual(
        [...ALTAR_CUSTOMIZATION_NAMES],
        [
            'G_unaligned_altar', 'G_chaotic_altar', 'G_neutral_altar',
            'G_lawful_altar', 'G_altar_other',
        ],
    );
    assert.equal(ALTAR_CUSTOMIZATION_NAMES.length, altar_other + 1);
    for (const offset of [
        altar_unaligned, altar_chaotic, altar_neutral, altar_lawful,
        altar_other,
    ]) {
        assert.equal(
            sourceGlyphName(ALTAR_CUSTOMIZATION_NAMES[offset]),
            ALTAR_CUSTOMIZATION_NAMES[offset],
            `altar ${offset}`,
        );
    }
});

test('each black-and-white cue reads both of its own comparisons', () => {
    // display.c:2911-2925 asks two symbol questions for lava and two for ice,
    // and defsym.h answers both the same way out of the box: S_pool and
    // S_water are both '}', S_room and S_darkroom are both '.'. A symbol set
    // that separates one of each pair is what tells the two disjuncts apart.
    for (const [rc, cases] of [
        // Water alone moves, so S_lava still matches S_pool.
        ['SYMBOLS=S_water:W', [[S_lava, ATR_INVERSE], [S_ice, ATR_INVERSE]]],
        // Pool alone moves, so S_lava now matches only S_water.
        ['SYMBOLS=S_pool:P', [[S_lava, ATR_INVERSE], [S_ice, ATR_INVERSE]]],
        // Both move, so neither comparison can succeed.
        ['SYMBOLS=S_water:W,S_pool:P', [[S_lava, 0], [S_ice, ATR_INVERSE]]],
        ['SYMBOLS=S_darkroom:D', [[S_lava, ATR_INVERSE], [S_ice, ATR_INVERSE]]],
        ['SYMBOLS=S_room:R', [[S_lava, ATR_INVERSE], [S_ice, ATR_INVERSE]]],
        ['SYMBOLS=S_room:R,S_darkroom:D', [[S_lava, ATR_INVERSE], [S_ice, 0]]],
    ]) {
        const state = branchedState();
        initialize_symbols_from_options(parseNethackrc(rc), state);
        state.iflags = { wc_color: false, wc_inverse: true };
        for (const [cmap, expected] of cases) {
            assert.equal(
                map_glyphinfo(cmap_to_glyph(cmap, state), state).attr ?? 0,
                expected,
                `${rc} cmap ${cmap}`,
            );
        }
    }

    // The same for MG_BW_ENGR's pair at display.c:2955-2957: an engraving
    // matching either the dark or the lit corridor byte takes the bit.
    for (const [rc, expected] of [
        ['SYMBOLS=S_litcorr:L', ATR_INVERSE],
        ['SYMBOLS=S_corr:C', ATR_INVERSE],
        ['SYMBOLS=S_corr:C,S_litcorr:L', 0],
    ]) {
        const state = branchedState();
        initialize_symbols_from_options(parseNethackrc(rc), state);
        state.iflags = { wc_color: true, wc_inverse: true };
        assert.equal(
            map_glyphinfo(cmap_to_glyph(S_engrcorr, state), state).attr ?? 0,
            expected,
            rc,
        );
    }
});

test('map_glyphinfo enters each cmap range at its own first glyph', () => {
    // display.c reset_glyphmap()'s chain subtracts each offset in turn and
    // takes the first arm whose difference is not negative, so the first
    // glyph of every range is the one that separates its arm from the arm
    // below. The cmap index each arm drew from is what says which one ran.
    const state = branchedState();
    state.iflags = { wc_color: true };
    state.a11y = { glyph_updates: true };
    for (const [base, cmap, label] of [
        [GLYPH_CMAP_C_OFF, S_digbeam, 'cmap C'],
        [GLYPH_CMAP_B_OFF, S_grave, 'cmap B'],
        [GLYPH_ALTAR_OFF, S_altar, 'altar'],
        [GLYPH_CMAP_A_OFF, S_ndoor, 'cmap A'],
        [GLYPH_CMAP_SOKO_OFF, S_vwall, 'sokoban walls'],
        [GLYPH_CMAP_KNOX_OFF, S_vwall, 'knox walls'],
        [GLYPH_CMAP_GEH_OFF, S_vwall, 'gehennom walls'],
        [GLYPH_CMAP_MINES_OFF, S_vwall, 'mines walls'],
        [GLYPH_CMAP_MAIN_OFF, S_vwall, 'main walls'],
        [GLYPH_CMAP_STONE_OFF, S_stone, 'stone'],
    ]) {
        assert.equal(
            map_glyphinfo(base, state).a11ySubject.symbol, cmap, label,
        );
    }
    // The altar arm is the one whose five glyphs differ from each other, and
    // altarcolors[] is what separates them.
    assert.equal(
        map_glyphinfo(GLYPH_ALTAR_OFF + altar_unaligned, state).color, CLR_RED,
    );
    assert.equal(
        map_glyphinfo(GLYPH_ALTAR_OFF + altar_other, state).color,
        CLR_BRIGHT_MAGENTA,
    );
});

test('a cmap glyph carries the accessibility kind its index falls in', () => {
    // The port's own classification, which js/startup_a11y.js reads off the
    // glyph. Each pair below is a range boundary, so a comparison that moved
    // by one would reclassify exactly one of them.
    const state = branchedState();
    state.iflags = { wc_color: true };
    state.a11y = { glyph_updates: true };
    const kindOf = (cmap) => map_glyphinfo(
        cmap_to_glyph(cmap, state), state,
    ).a11yKind;
    assert.equal(kindOf(S_stone), 'wall');
    assert.equal(kindOf(S_trwall), 'wall');
    assert.equal(kindOf(S_ndoor), 'cmap');
    assert.equal(kindOf(S_room), 'room');
    assert.equal(kindOf(S_darkroom), 'room');
    assert.equal(kindOf(S_engroom), 'cmap');
    assert.equal(kindOf(S_upstair), 'furniture');
    assert.equal(kindOf(S_fountain), 'furniture');
    assert.equal(kindOf(S_dnladder), 'furniture');
    // S_grave and S_sink sit inside the same run, so "furniture" reaches past
    // the staircases into cmap B; S_pool is the first index past its end.
    assert.equal(kindOf(S_grave), 'furniture');
    assert.equal(kindOf(S_pool), 'cmap');
});
