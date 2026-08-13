import assert from 'node:assert/strict';
import test from 'node:test';

import { createArtifactTable } from '../js/artifacts.js';
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
    BURN,
    CONFUSION,
    CORR,
    CROSSWALL,
    D_CLOSED,
    DETECT_MONSTERS,
    D_ISOPEN,
    DUST,
    DOOR,
    FOUNTAIN,
    FLYING,
    HALLUC,
    HALLUC_RES,
    HWALL,
    ICE,
    IN_SIGHT,
    LADDER,
    LANDMINE,
    LA_DOWN,
    LAVAPOOL,
    LAVAWALL,
    LEVITATION,
    M_AP_FURNITURE,
    M_AP_F_DKNOWN,
    M_AP_MONSTER,
    M_AP_OBJECT,
    OBJ_FLOOR,
    PIT,
    POOL,
    PROT_FROM_SHAPE_CHANGERS,
    ROOM,
    ROT_CORPSE,
    SCORR,
    SATIATED,
    SDOOR,
    SEE_INVIS,
    SICK,
    SICK_NONVOMITABLE,
    SICK_VOMITABLE,
    SINK,
    SLIMED,
    STAIRS,
    STONE,
    SYM_NOTHING,
    STONED,
    STRANGLED,
    STUNNED,
    SVALL,
    TDWALL,
    TLCORNER,
    TLWALL,
    TRCORNER,
    TRWALL,
    TUWALL,
    TIMER_OBJECT,
    VWALL,
    WATER,
    WARNING,
    WARNCOUNT,
    W_SADDLE,
    def_warnsyms,
} from '../js/const.js';
import * as symbolExports from '../js/symbols.js';
import {
    bot,
    armor_status,
    classify_terrain,
    cls,
    docrt,
    feel_location,
    feel_newsym,
    flush_screen,
    glyph_is_generic_object,
    hero_glyph_info,
    map_trap,
    monster_glyph_info,
    newsym,
    object_glyph_info,
    random_object_glyph_info,
    reglyph_darkroom,
    remembered_glyph_from_presentation,
    same_remembered_glyph,
    see_nearby_objects,
    show_glyph_cell,
    terrain_glyph,
    timebot,
    trap_glyph_info,
    tty_capacity_status,
    UnsupportedGlyphRepairError,
    UnsupportedMapMemoryError,
    UnsupportedStatusRefreshError,
    weapon_status,
} from '../js/display.js';
import { rndmonnam } from '../js/do_name.js';
import { engr_at, make_engr_at } from '../js/engrave.js';
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
    GOLD_PIECE,
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
    glyph_customization,
    initialize_symbols_from_options,
    misc_symbol,
    monster_class_symbol,
    object_class_symbol,
    S_hwall,
    S_arrow_trap,
    S_engroom,
    S_room,
    S_corr,
    S_darkroom,
    S_litcorr,
    S_stone,
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

function displaySymbol(loc, state) {
    const { ch, dec } = terrain_glyph(loc, 7, 4, state);
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
    { from = 0, before = true, after = true } = {},
) {
    const start = terminalRow(state, row).indexOf(text, from);
    assert.notEqual(start, -1, text);
    assertCellRange(state, row, start, text.length, expected, text);
    const normal = { color: NO_COLOR, attr: ATR_NONE };
    if (before && start > 0) {
        assert.deepEqual(
            {
                color: state.nhDisplay.grid[row][start - 1].color,
                attr: state.nhDisplay.grid[row][start - 1].attr,
            },
            normal,
            `${text}: preceding cell`,
        );
    }
    if (after && start + text.length < 79) {
        assert.deepEqual(
            {
                color: state.nhDisplay.grid[row][start + text.length].color,
                attr: state.nhDisplay.grid[row][start + text.length].attr,
            },
            normal,
            `${text}: following cell`,
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

test('disabled color uses tty inverse cues for ambiguous terrain symbols', () => {
    const state = {
        iflags: { wc_color: false, wc_inverse: true },
    };
    initialize_symbols_from_options({ flags: {} }, state);

    for (const typ of [SINK, ICE, LAVAPOOL, LAVAWALL]) {
        assert.equal(
            terrain_glyph({ typ }, 7, 4, state).attr,
            ATR_INVERSE,
            `terrain type ${typ}`,
        );
    }
    for (const typ of [FOUNTAIN, POOL, WATER]) {
        assert.equal(
            terrain_glyph({ typ }, 7, 4, state).attr,
            undefined,
            `reference terrain type ${typ}`,
        );
    }
    assert.equal(
        terrain_glyph({ typ: DRAWBRIDGE_UP, flags: DB_LAVA }, 7, 4, state).attr,
        ATR_INVERSE,
        'raised drawbridge lava uses the same cmap cue',
    );

    state.iflags.wc_inverse = false;
    assert.equal(
        terrain_glyph({ typ: SINK }, 7, 4, state).attr,
        undefined,
    );
    state.iflags.wc_inverse = true;
    state.iflags.wc_color = true;
    assert.equal(
        terrain_glyph({ typ: SINK }, 7, 4, state).attr,
        undefined,
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

test('monster glyphs apply the configured tty attribute only to pets', () => {
    const state = {
        flags: {},
        iflags: {
            wc_color: true,
            wc_hilite_pet: true,
            wc2_petattr: ATR_BOLD,
        },
    };
    initialize_symbols_from_options({ flags: {} }, state);
    const monster = {
        data: { mlet: S_FELINE, mcolor: CLR_WHITE },
        mtame: 0,
        m_ap_type: 0,
    };

    assert.equal(monster_glyph_info(monster, state).attr, undefined);
    monster.mtame = 10;
    assert.equal(monster_glyph_info(monster, state).attr, ATR_BOLD);
    state.iflags.wc_hilite_pet = false;
    assert.equal(monster_glyph_info(monster, state).attr, undefined);
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
        // display.h glyph_is_object(): map memory records that an object, not
        // the monster standing over it, is what the hero remembers here.
        objectGlyph: true,
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
        objectGlyph: true,
    });
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
        assert.equal(state.level.at(x, y).remembered_glyph.cmap, S_darkroom);
        // display.c seenv_matrix[1 - dy][dx + 1] for a step due east.
        assert.equal(state.level.at(x, y).seenv, 0x80);

        // With 'dark_room' off the same square becomes S_stone, which draws a
        // space rather than a floor symbol.
        state.flags.dark_room = false;
        state.level.at(x, y).remembered_glyph = null;
        newsym(x, y);
        feel_newsym(x, y, state);
        assert.equal(state.level.at(x, y).remembered_glyph.cmap, S_stone);
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
    assert.equal(corridor.remembered_glyph.cmap, S_corr);
    assert.equal(corridor.disp_ch, cmap_symbol(S_corr, state).ch);

    // A corridor the hero has seen lit keeps the lit symbol, because C's
    // condition is `!lev->waslit`.
    corridor.waslit = true;
    corridor.remembered_glyph = null;
    feel_location(x, y, state);
    assert.equal(corridor.remembered_glyph.cmap, S_litcorr);
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
    assert.equal(corridor.remembered_glyph.cmap, S_litcorr);
    // defsym.h:116-117 colours both corridor cmaps CLR_GRAY, so
    // reset_glyphmap() (display.c:2938-2940) recolours the lit one to
    // CLR_WHITE while the two draw the same byte.
    assert.equal(corridor.disp_color, CLR_WHITE);

    state.viz_array[y][x] = 0;
    newsym(x, y);
    assert.equal(corridor.remembered_glyph.cmap, S_corr);
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
    assert.equal(corridor.remembered_glyph.cmap, S_litcorr);

    state.flags.dark_room = true;
    state.iflags = { ...state.iflags, wc_color: false };
    seeThenLoseSight(x, y, state);
    assert.equal(corridor.remembered_glyph.cmap, S_litcorr);

    // Both halves on, and the same square darkens despite waslit.
    state.iflags = { ...state.iflags, wc_color: true };
    seeThenLoseSight(x, y, state);
    assert.equal(corridor.remembered_glyph.cmap, S_corr);
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
    assert.equal(room.remembered_glyph.cmap, S_room);
    state.viz_array[y][x] = 0;
    newsym(x, y);
    assert.equal(room.remembered_glyph.cmap, S_darkroom);
    // reglyph_darkroom() has not run over this state, so S_darkroom still
    // carries defsym.h:114's own byte; only the cmap index is asserted here.
    // The pair drawing alike is scripts/display-symbols.test.mjs's
    // 'reglyph_darkroom points S_darkroom at S_room or at nothing'.

    // 'dark_room' off leaves a room square the hero saw lit alone, because
    // the outer condition's other half, `!lev->waslit`, is false too.
    state.flags.dark_room = false;
    seeThenLoseSight(x, y, state);
    assert.equal(room.waslit, true);
    assert.equal(room.remembered_glyph.cmap, S_room);

    // An unlit room square passes `!lev->waslit` and darkens with
    // 'dark_room' still off.
    room.lit = false;
    seeThenLoseSight(x, y, state);
    assert.equal(room.waslit, false);
    assert.equal(room.remembered_glyph.cmap, S_darkroom);
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
    assert.equal(square.remembered_glyph.cmap, S_stone);

    square.lit = true;
    seeThenLoseSight(x, y, state);
    assert.equal(square.remembered_glyph.cmap, S_room);

    // The corridor half is the same on both levels.
    square.typ = CORR;
    square.lit = false;
    state.flags.lit_corridor = true;
    seeThenLoseSight(x, y, state);
    assert.equal(square.remembered_glyph.cmap, S_corr);

    // Both halves of `lev->glyph == cmap_to_glyph(S_litcorr) && lev->typ ==
    // CORR` are load-bearing. A corridor square the hero remembers an object
    // on satisfies the second and fails the first, and C leaves that memory
    // alone: only a square remembered as a lit corridor is corrected.
    state.level.objects[x][y] = { otyp: SPEAR, oclass: WEAPON_CLASS };
    seeThenLoseSight(x, y, state);
    assert.equal(square.remembered_glyph.objectGlyph, true);
    assert.equal(
        square.remembered_glyph.ch, object_glyph_info(
            state.level.objects[x][y], state,
        ).ch,
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
    assert.equal(state.level.at(x, y).remembered_glyph.cmap, S_darkroom);

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

    // Once a level exists the repair loop would have squares to rewrite, and
    // this port cannot run it.
    state.level = new GameMap();
    assert.throws(() => reglyph_darkroom(state), UnsupportedGlyphRepairError);
    state.flags.dark_room = true;
    reglyph_darkroom(state);
    assert.equal(state.gs.showsyms[S_darkroom], state.gs.showsyms[S_room]);

    // display.c:1836-1837 puts Is_rogue_level() beside the two options, so the
    // rogue level takes the GLYPH_NOTHING arm whatever they say.
    state.u = { ...state.u, uz: { dnum: 3, dlevel: 15 } };
    state.rogue_level = { dnum: 3, dlevel: 15 };
    assert.throws(() => reglyph_darkroom(state), UnsupportedGlyphRepairError);
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
            terrain_glyph(square, x, row, state),
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
    assert.equal(corridor.remembered_glyph.cmap, S_litcorr);
    assert.equal(corridor.remembered_glyph.color, CLR_WHITE);
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
    assert.equal(room.remembered_glyph.cmap, S_room);

    // cansee() reads viz_array; only <18,6> is in sight.
    state.viz_array = [];
    state.viz_array[row] = [];
    state.viz_array[row][18] = IN_SIGHT;

    reglyph_darkroom(state);

    // The whole point of the corridor arm: C repaints the cell in the
    // terminal default rather than in CLR_WHITE.
    assert.equal(corridor.remembered_glyph.cmap, S_corr);
    assert.equal(corridor.remembered_glyph.color, NO_COLOR);
    assert.equal(room.remembered_glyph.cmap, S_darkroom);
    // A square the hero can see is repainted by docrt() from what is really
    // there, so C leaves its memory alone.
    assert.equal(seenCorridor.remembered_glyph.cmap, S_litcorr);
    assert.equal(unseenRoom.remembered_glyph.cmap, S_room);
    assert.equal(unlitRoom.remembered_glyph.cmap, S_room);
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
        terrain_glyph(floor, x, y, state),
    );
    assert.equal(lit.cmap, S_room);
    // A second record for the same square is a different object holding the
    // same identity, which is what C's `oldglyph != door->glyph` would call
    // unchanged.
    const again = remembered_glyph_from_presentation(
        terrain_glyph(floor, x, y, state),
    );
    assert.notEqual(lit, again);
    assert.equal(same_remembered_glyph(lit, again), true);

    floor.remembered_glyph = lit;
    feel_location(x, y, state);
    const dark = floor.remembered_glyph;
    assert.equal(dark.cmap, S_darkroom);
    // Same drawn cell, different glyph.
    assert.equal(dark.ch, lit.ch);
    assert.equal(dark.color, lit.color);
    assert.equal(dark.decgfx, lit.decgfx);
    assert.equal(same_remembered_glyph(lit, dark), false);

    // A missing record on either side is a change; two missing records are not.
    assert.equal(same_remembered_glyph(null, dark), false);
    assert.equal(same_remembered_glyph(dark, null), false);
    assert.equal(same_remembered_glyph(null, null), true);

    // `rgb` reaches a remembered record from a SYMBOLS colour customization,
    // and is the one identity field held in an array. The arbitrary triples
    // below differ in their last component only, so a comparison that stopped
    // at the length would call them equal.
    const coloured = (rgb) => remembered_glyph_from_presentation({
        ch: '.', color: NO_COLOR, dec: false, rgb,
    });
    assert.equal(
        same_remembered_glyph(coloured([1, 2, 3]), coloured([1, 2, 3])), true,
    );
    assert.equal(
        same_remembered_glyph(coloured([1, 2, 3]), coloured([1, 2, 4])), false,
    );
    assert.equal(
        same_remembered_glyph(coloured([1, 2, 3]), coloured([1, 2])), false,
    );
    // One side customized and the other not is also a change.
    const plain = remembered_glyph_from_presentation({
        ch: '.', color: NO_COLOR, dec: false,
    });
    assert.equal(same_remembered_glyph(coloured([1, 2, 3]), plain), false);
    assert.equal(same_remembered_glyph(plain, coloured([1, 2, 3])), false);
});

test('same_remembered_glyph separates each part of a glyph number', () => {
    // lock.c:584 answers "changed" whenever the two glyph numbers differ, so
    // every part of a glyph number this port keeps has to separate a pair on
    // its own. Each case below changes exactly one term of a presentation
    // that is otherwise identical, so a term dropped from the comparison
    // leaves its case answering "unchanged".
    const base = { ch: '.', color: NO_COLOR, dec: false };
    const from = (extra, trap = null) => remembered_glyph_from_presentation(
        { ...base, ...extra }, trap,
    );
    const reference = from({});
    const cases = [
        // terrainCmap() stamps `cmap`, which is what cmap_to_glyph() encodes
        // for a piece of terrain. S_room is an arbitrary index: any value
        // separates a terrain record from one carrying none.
        ['cmap', from({ cmap: S_room })],
        // object_glyph_info() stamps `objectGlyphId`, which is what
        // display.h normal_obj_to_glyph() encodes. The string below is the
        // shape that function writes for an ordinary object.
        ['objectGlyphId', from({ objectGlyphId: 'obj:1' })],
        ['ch', from({ ch: '#' })],
        ['color', from({ color: CLR_RED })],
        // `dec` is the presentation term; `decgfx` is the remembered one.
        ['decgfx', from({ dec: true })],
        // The two browser projection fields, which a SYMBOLS customization
        // fills in and the terminal draw does not.
        ['displayCh', from({ displayCh: 'x' })],
        ['displayColor', from({ displayColor: CLR_RED })],
        ['attr', from({ attr: ATR_INVERSE })],
        // The trap identity comes from the second argument rather than from
        // the presentation. PIT is one arbitrary ttyp.
        ['trapType', from({}, { ttyp: PIT })],
        ['objectGlyph', from({ objectGlyph: true })],
        ['genericObject', from({ genericObject: true })],
        // Nothing writes `invisible_monster` yet: it stands for C's
        // GLYPH_INVISIBLE range, which only the unported map_invisible()
        // fills, so this pair is built on the record rather than through a
        // presentation.
        ['invisible_monster', { ...reference, invisible_monster: true }],
    ];
    for (const [field, other] of cases) {
        assert.equal(same_remembered_glyph(reference, other), false, field);
        assert.equal(same_remembered_glyph(other, reference), false, field);
    }
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
    assert.equal(jackal.ch, rat.ch);
    assert.equal(jackal.color, rat.color);
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
    assert.equal(state.level.at(x, y).remembered_glyph.cmap, S_darkroom);
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
    // PIT is one ordinary floor trap; its ttyp is what map_trap() keeps
    // beside the presentation.
    const trap = { ttyp: PIT, tx: x, ty: y, tseen: 1 };
    state.level.traps = [trap];
    const trapGlyph = trap_glyph_info(trap, state);

    feel_location(x, y, state);
    assert.equal(square.remembered_glyph.cmap, trapGlyph.cmap);
    assert.equal(square.remembered_glyph.trapType, PIT);
    assert.equal(square.disp_ch, trapGlyph.ch);

    // An object on the same square takes the arm above, and the trap identity
    // does not travel with a record that no longer represents the trap.
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
    assert.equal(square.remembered_glyph.objectGlyph, true);
    assert.equal(square.remembered_glyph.trapType ?? null, null);
    assert.equal(square.remembered_glyph.cmap ?? null, null);
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
            square.remembered_glyph?.cmap ?? null,
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
    assert.equal(floor.remembered_glyph.cmap, S_room);

    state.flags.dark_room = true;
    feel_location(x, y, state);
    assert.equal(floor.remembered_glyph.cmap, S_darkroom);

    // C's second operand is `flags.dark_room && iflags.use_color`, so turning
    // colour off puts a square the hero has seen lit back out of reach of the
    // rewrite however 'dark_room' stands. Under OPTIONS=!color the port still
    // reaches here: js/jsmain.js runs reglyph_darkroom() before any level
    // exists, so its refusal does not fire, and showsyms[S_darkroom] is
    // pointed at the SYM_NOTHING byte -- which is why losing this operand
    // would erase the square from the map rather than merely recolour it.
    state.iflags = { ...state.iflags, wc_color: false };
    feel_location(x, y, state);
    assert.equal(floor.remembered_glyph.cmap, S_room);

    // The `!lev->waslit` half still fires without colour, because C's two
    // operands are joined by `||`.
    floor.waslit = false;
    feel_location(x, y, state);
    assert.equal(floor.remembered_glyph.cmap, S_darkroom);
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
        cloud.glyph = S_poisoncloud;
        add_region(cloud, state, { deferVisual: true });

        feel_location(x, y, state);
        assert.equal(
            state.level.at(x, y).disp_ch,
            cmap_symbol(blind ? S_stone : S_poisoncloud, state).ch,
            `blind ${blind}`,
        );
        // Either way the region is presentation only: map memory holds what
        // the hero felt underneath it.
        assert.equal(state.level.at(x, y).remembered_glyph.cmap, S_stone);
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
    const priorMemory = {
        ch: '?',
        color: CLR_YELLOW,
        decgfx: false,
        displayCh: null,
    };
    state.level.at(x, y).remembered_glyph = priorMemory;

    const seed = 2026072410;
    initRng(seed);
    const firstDraw = rn2_on_display_rng(NUMMONS);
    initRng(seed);

    newsym(x, y);

    const location = state.level.at(x, y);
    assert.deepEqual(location.remembered_glyph, priorMemory);
    assert.deepEqual(
        [
            location.disp_ch,
            location.disp_color,
            location.disp_decgfx,
        ],
        ['?', CLR_YELLOW, false],
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
        const expected = terrain_glyph(state.level.at(x, y), x, y, state);
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
    // Any trap type with a colour in TRAP_COLORS serves; a pit is the one the
    // neighbouring cases in this file already use.
    const trap = { tx: x, ty: y, ttyp: PIT };
    // The memory a previous look at the square left, distinguishable from
    // anything trap_glyph_info() can produce.
    const priorMemory = {
        ch: '?', color: CLR_YELLOW, decgfx: false, displayCh: null,
    };

    const mapped = (heroMemory, show) => {
        const state = visibleCellState({ x, y });
        state.level.flags.hero_memory = heroMemory;
        state.level.at(x, y).remembered_glyph = { ...priorMemory };
        const glyph = trap_glyph_info(trap, state);
        map_trap(trap, show, state);
        return { location: state.level.at(x, y), glyph };
    };

    // Both halves run. Recomputing the glyph from the same two helpers the
    // body uses proves the plumbing -- that the trap's own glyph, carried
    // through remembered_glyph_from_presentation() with the trap attached,
    // is what reaches the memory and the buffer -- and not that the glyph is
    // right. A wrong entry in TRAP_COLORS or trap_to_defsym() would satisfy
    // it just as well; the recorded screens are what answer for that.
    const shown = mapped(true, 1);
    assert.deepEqual(
        shown.location.remembered_glyph,
        remembered_glyph_from_presentation(shown.glyph, trap),
    );
    assert.equal(shown.location.disp_ch, shown.glyph.ch);
    assert.equal(shown.location.gnew, 1);

    // show 0 writes the memory and leaves the display buffer untouched, which
    // is the state a fresh cell starts in.
    const unshown = mapped(true, 0);
    assert.deepEqual(
        unshown.location.remembered_glyph,
        remembered_glyph_from_presentation(unshown.glyph, trap),
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
            terrain_glyph(state.level.at(x, y), x, y, state),
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
    assert.notDeepEqual(
        location.remembered_glyph,
        remembered_glyph_from_presentation(expectedFloor),
        'the transient statue presentation must not replace its object memory',
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
            terrain_glyph({ ...location, typ: FOUNTAIN }, x, y, state),
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
        terrain_glyph({ ...state.level.at(7, 4), typ: FOUNTAIN }, 7, 4, state),
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
    const fountain = terrain_glyph(
        { ...first, typ: FOUNTAIN },
        7,
        4,
        state,
    );
    const pit = trap_glyph_info({ ttyp: PIT }, state);
    const room = terrain_glyph(
        { ...unannounced, typ: ROOM },
        9,
        4,
        state,
    );
    const altar = terrain_glyph(
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
        },
    });
    assert.deepEqual(messages, [
        '(3south,6east): fountain.',
        '(3south,7east): pit.',
        '(3south,9east): altar.',
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
        sidecars(unannounced.disp_glyph),
        expectedRoomSidecars,
        'filtered accessibility sidecars survived final-buffer restoration',
    );
    assert.strictEqual(
        unannounced.disp_glyph.a11ySubject,
        room.a11ySubject,
        'final restoration retained the mutable subject reference',
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
    const fountain = terrain_glyph(
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
    const pool = terrain_glyph(location, 7, 4, state);
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
    location.remembered_glyph = terrain_glyph(
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
    location.remembered_glyph = terrain_glyph(location, 7, 4, state);
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
    cloud.glyph = S_poisoncloud;
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
    // display.h obj_to_glyph() numbers a generic object into the range
    // glyph_is_generic_object() recognizes, and every case here into the wider
    // range glyph_is_object() recognizes; object_glyph_info() carries both as
    // marks on the presentation. The map's disp_* fields hold no such mark, so
    // only the presentation comparison below expects them.
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
        assert.deepEqual(
            monster_glyph_info(fake, state),
            generic
                ? { ...expected, objectGlyph: true, genericObject: true }
                : { ...expected, objectGlyph: true },
            `${otyp}`,
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
    assert.equal(state.level.lastseentyp[x][y], DOOR);
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
    add_region(cloud, state, { deferVisual: true });

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
    add_region(cloud, state, { deferVisual: true });

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
    cloud.glyph = S_poisoncloud;
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
        state.level.at(x, y).remembered_glyph.ch,
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
        state.level.at(x, y).remembered_glyph.ch,
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
    cloud.glyph = S_cloud;
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

    assert.deepEqual(object_glyph_info(potion, state), {
        ch: '!',
        color: NO_COLOR,
        dec: false,
        // display.h obj_to_glyph() numbers this into the object range that
        // dogmove.c dog_move() asks glyph_is_object() about, and within it the
        // generic range that display.c see_nearby_objects() reads back out of
        // map memory to decide whether a nearer look needs a redraw.
        objectGlyph: true,
        genericObject: true,
    });

    potion.dknown = true;
    assert.deepEqual(object_glyph_info(potion, state), {
        ch: '!',
        color: state.objects[POT_BOOZE].oc_color,
        dec: false,
        // An identified potion leaves the generic range but stays an object.
        objectGlyph: true,
    });
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
        assert.equal(remembered.color, NO_COLOR);
        assert.equal(glyph_is_generic_object(state.level.at(10, 12)), true);

        // dungeon.c u_on_newpos() moves the hero first and calls this after.
        state.u.ux = 10;
        state.u.uy = 10;
        see_nearby_objects(state);

        assert.equal(potion.dknown, true);
        assert.equal(state.objects[POT_BOOZE].oc_encountered, 1);
        assert.equal(
            state.level.at(10, 12).remembered_glyph.color,
            state.objects[POT_BOOZE].oc_color,
        );
        assert.equal(glyph_is_generic_object(state.level.at(10, 12)), false);
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
        assert.equal(glyph_is_generic_object(state.level.at(10, 12)), false);

        const potion = unobservedPotion(state, 10, 12);
        see_nearby_objects(state);

        // display.c:1599's observe_object() still runs above the guard, so the
        // object becomes dknown whatever the map remembers.
        assert.equal(potion.dknown, true);
        // Deep-equal the whole glyph, so a redraw that rewrote only part of
        // the memory is caught too. newsym() would replace this trap glyph
        // with the potion's, because an object covers a seen trap.
        assert.deepEqual(state.level.at(10, 12).remembered_glyph, remembered);
        assert.equal(remembered.ch, '^');
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
            attr: ATR_BOLD,
            clearAttributes: false,
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
                        attr: ATR_BOLD,
                        clearAttributes: false,
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
                attr: ATR_BOLD,
                clearAttributes: false,
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
