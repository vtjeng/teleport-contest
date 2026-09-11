// mklev.js — Level generation.
// C ref: mklev.c — makelevel, makerooms, makecorridors, generate_stairs.
// Also includes parts of sp_lev.c (create_room) and mkmap.c (litstate_rnd).
// Stripped-down version for contest: generates regular dungeon levels with
// room placement, corridors, doors, stairs, niches, and fill.
// Uses the real game PRNG (not a separate layout PRNG) for bit-exact parity.

import { game } from './gstate.js';
import { GameMap } from './game.js';
import {
    Can_dig_down,
    Can_fall_thru,
    In_hell,
    In_W_tower,
    Is_special,
    at_dgn_entrance,
    depth,
    dungeon_branch,
    find_level,
    init_mapseen,
    level_difficulty,
    on_level,
} from './dungeon.js';
import { UnsupportedLevelChangeError } from './do.js';
import {
    UnsupportedSpecialRoomError,
    do_mkroom,
    fill_zoo,
    mk_tt_object,
} from './mkroom.js';
import { mkcorpstat } from './corpstat.js';
import {
    del_engr_at,
    engr_at,
    make_engr_at,
    wipe_engr_at,
} from './engrave.js';
import {
    back_to_glyph,
    glyph_is_cmap,
    map_background,
    map_object,
    map_trap,
    set_wall_state,
} from './display.js';
import { def_char_to_monclass, def_char_to_objclass } from './drawing.js';
import { add_to_container, obj_extract_self, obfree } from './invent.js';
import { UnsupportedMonsterCreationError, makemon, dmonsfree } from './makemon_create.js';
import { mkclass, rndmonnum } from './makemon.js';
import { mineralize } from './mineralize.js';
import { make_grave } from './grave.js';
import {
    is_female,
    is_male,
    name_to_monplus,
    pm_resistance,
    poly_when_stoned,
} from './mondata.js';
import {
    get_table_boolean_opt,
    get_table_int,
    get_table_int_opt,
    get_table_option,
    get_table_str,
    get_table_str_opt,
    lcheck_param_table,
    lua_tointeger,
    luaL_checkinteger,
    luaL_checkoption,
    luaL_checkstring,
    luaL_typename,
} from './nhlua.js';
import {
    create_maze,
    check_ransacked,
    fixup_special,
    is_solid,
    iswall,
    iswall_or_stone,
    mkportal,
    okay,
    set_levltyp_lit,
} from './mkmaze.js';
import { d, rn2, rnd, rn1, rne, rnz } from './rng.js';
import {
    init_rect,
    rnd_rect,
    get_rect,
    split_rects,
    within_bounded_area,
} from './rect.js';
import {
    mkaltar,
    mkfount,
    mkgrave,
    mksink,
} from './room_features.js';
import { in_rooms } from './rooms.js';
import { oinit } from './o_init.js';
import {
    objectGenerationEnv,
    objectGenerationHooks,
} from './object_generation.js';
import {
    SPBOOK_NO_NOVEL,
    dealloc_obj,
    mkgold,
    mkobj,
    mkobj_at,
    mksobj,
    mksobj_at,
    set_corpsenm,
    sobj_at,
    objectType,
    weight,
} from './obj.js';
import {
    ARMOR_CLASS,
    BOULDER,
    CHEST,
    CORPSE,
    CRAM_RATION,
    FOOD_CLASS,
    FOOD_RATION,
    GEM_CLASS,
    LARGE_BOX,
    LEMBAS_WAFER,
    MAXOCLASSES,
    NUM_OBJECTS,
    OBJ_DESCR,
    OBJ_NAME,
    POTION_CLASS,
    POT_EXTRA_HEALING,
    POT_GAIN_ENERGY,
    POT_HEALING,
    POT_SPEED,
    RANDOM_CLASS,
    RIN_TELEPORTATION,
    RING_CLASS,
    SCROLL_CLASS,
    SCR_CONFUSE_MONSTER,
    SCR_ENCHANT_ARMOR,
    SCR_ENCHANT_WEAPON,
    SCR_SCARE_MONSTER,
    SCR_TELEPORTATION,
    SPBOOK_CLASS,
    SPE_HEALING,
    STATUE,
    STRANGE_OBJECT,
    WAN_DIGGING,
    WAN_TELEPORTATION,
    WAND_CLASS,
    WEAPON_CLASS,
    PICK_AXE,
    DWARVISH_MATTOCK,
    getObjects,
} from './objects.js';
import { goodpos } from './teleport.js';
import { deltrap, maketrap, t_at } from './trap.js';
import { recalc_block_point } from './vision.js';
import {
    mktrap as make_level_trap,
    occupied,
    traptype_rnd,
} from './mktrap.js';
import { random_engraving } from './random_engraving.js';
import {
    get_free_room_loc,
    get_location,
    get_location_coord,
    get_room_loc,
    inside_room,
    is_ok_location,
    set_ok_location_func,
    somex,
    somey,
    somexy,
} from './room_coordinates.js';
import { count_level_features, set_levltyp } from './terrain.js';
import { stock_room } from './shknam.js';
import {
    lspo_object,
    new_sp_lev_object_context,
} from './sp_lev_object.js';
import {
    create_monster,
    sp_amask_to_amask,
    spo_end_moninvent,
    initialize_themeroom_postprocess_branch,
    run_themeroom_postprocess,
    themeroom_fill,
} from './themeroom_fill.js';
import {
    G_IGNORE,
    G_NOGEN,
    LOW_PM,
    MR_STONE,
    NUMMONS,
    PM_COCKATRICE,
    PM_GIANT_SPIDER,
    PM_KILLER_BEE,
    PM_LEPRECHAUN,
    PM_MINOTAUR,
    PM_SOLDIER,
    PM_GIANT_ZOMBIE,
    PM_ETTIN_ZOMBIE,
    PM_VAMPIRE_LEADER,
    S_HUMAN,
    S_LICH,
    S_MUMMY,
    S_VAMPIRE,
    S_ZOMBIE,
} from './monsters.js';
import { stairway_add } from './stairs.js';
import { stairway_find_dir } from './stairs.js';
import { THEMEROOM_DEFINITIONS } from './themeroom_data.js';
import {
    selection_floodfill,
    selection_clear,
    selection_iterate,
    selection_new,
    set_selection_floodfillchk,
    ThemeroomSelection,
} from './themerooms.js';
import { create_gas_cloud, create_gas_cloud_selection } from './region.js';
import {
    COLNO, ROWNO, STONE, ROOM, CORR, DOOR, STAIRS, LADDER,
    LA_UP, LA_DOWN, DRY, WET, HOT,
    HWALL, VWALL, TLCORNER, TRCORNER, BLCORNER, BRCORNER,
    CROSSWALL, TUWALL, TDWALL, TLWALL, TRWALL,
    D_NODOOR, D_BROKEN, D_CLOSED, D_ISOPEN, D_LOCKED, D_TRAPPED, D_SECRET,
    OROOM, THEMEROOM, COURT, SWAMP, VAULT, BEEHIVE, MORGUE,
    BARRACKS, ZOO, TEMPLE, LEPREHALL, COCKNEST, ANTHOLE, SHOPBASE,
    ARMORSHOP, SCROLLSHOP, POTIONSHOP, WEAPONSHOP,
    FOODSHOP, RINGSHOP, WANDSHOP, TOOLSHOP,
    BOOKSHOP, FODDERSHOP, CANDLESHOP,
    ROOMOFFSET, MAXNROFROOMS, MAX_NESTED_ROOMS, MAX_SUBROOMS, SHARED,
    SDOOR, SCORR, IRONBARS, FOUNTAIN, SINK, THRONE, TREE,
    DUST, ENGRAVE, BURN, ENGR_BLOOD,
    DIR_N, DIR_S, DIR_E, DIR_W, DIR_180,
    IS_WALL, IS_STWALL, IS_DOOR, IS_ROOM, IS_OBSTRUCTED, IS_FURNITURE, IS_POOL,
    IS_LAVA,
    isok, SPACE_POS, W_NONDIGGABLE, W_NONPASSWALL,
    W_RANDOM, W_NORTH, W_SOUTH, W_EAST, W_WEST, W_ANY,
    FILL_NONE, FILL_NORMAL,
    G_GONE,
    ICE, MOAT, POOL, WATER, LAVAPOOL, LAVAWALL,
    DBWALL,
    DB_NORTH, DB_SOUTH, DB_EAST, DB_WEST,
    AIR, CLOUD, GRAVE, ACCESSIBLE,
    MAX_TYPE, MATCH_WALL,
    A_LAWFUL, A_NEUTRAL, A_CHAOTIC,
    ALTAR,
    DELPHI,
    LR_BRANCH, LR_DOWNSTAIR, LR_PORTAL, LR_UPSTAIR,
    LR_TELE, LR_UPTELE, LR_DOWNTELE, LR_MONGEN, MALE,
    NO_TRAP,
    ARROW_TRAP, DART_TRAP, ROCKTRAP, SQKY_BOARD, BEAR_TRAP,
    LANDMINE, ROLLING_BOULDER_TRAP, SLP_GAS_TRAP, RUST_TRAP, FIRE_TRAP,
    PIT, SPIKED_PIT, HOLE, TRAPDOOR, TELEP_TRAP, LEVEL_TELEP,
    MAGIC_PORTAL, WEB, STATUE_TRAP, MAGIC_TRAP, ANTI_MAGIC,
    POLY_TRAP, VIBRATING_SQUARE,
    SET_LIT_RANDOM, SET_LIT_NOCHANGE,
    MKTRAP_NOFLAGS, MKTRAP_MAZEFLAG, MKTRAP_NOSPIDERONWEB,
    MKTRAP_NOVICTIM, MKTRAP_SEEN,
    BR_PORTAL, BR_NO_END1, BR_NO_END2, SVALL,
    CORPSTAT_INIT, CORPSTAT_NONE, MARK, MM_NOGRP, NO_MM_FLAGS,
    AM_SHRINE, AM_SANCTUM,
    In_quest, Is_medusa_level, NO_ROOM,
    TRAPNUM,
    In_endgame,
    Is_rogue_level,
    is_hole,
    is_pit,
    undestroyable_trap,
    ANY_LOC,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    AM_NONE,
    AM_SPLEV_CO,
    AM_SPLEV_NONCO,
    AM_SPLEV_RANDOM,
    BOOL_RANDOM,
    CUSTOM_INVENT,
    DB_DIR,
    DEFAULT_INVENT,
    EGD,
    FEMALE,
    INVALID_TYPE,
    IS_DOORJOIN,
    IS_DRAWBRIDGE,
    IS_TREE,
    LVLINIT_MAZE,
    LVLINIT_MAZEGRID,
    LVLINIT_MINES,
    LVLINIT_NONE,
    LVLINIT_ROGUE,
    LVLINIT_SOLIDFILL,
    LVLINIT_SWAMP,
    MAP_Y_LIM,
    MM_ADJACENTOK,
    MM_IGNOREWATER,
    MM_NOCOUNTBIRTH,
    MM_NOTAIL,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    NEUTRAL,
    NON_PM,
    NO_INVENT,
    NO_LOC_WARN,
    SP_COORD_PACK,
    SP_COORD_PACK_RANDOM,
    F_LOOTED, F_WARNED, S_LPUDDING, S_LDWASHER, S_LRING, T_LOOTED,
    TREE_LOOTED, TREE_SWARM,
} from './const.js';
import {
    distmin,
    lcase,
    str_lines_maxlen,
    stripdigits,
    strstri,
    swapbits,
} from './hacklib.js';
import { create_drawbridge } from './dbridge.js';
import { priestini } from './priest.js';
import { makeroguerooms, makerogueghost } from './extralev.js';

const XLIM = 4;
const YLIM = 3;

// sp_lev.c room alignment values are private to that loader. The source
// names the vertical pair TOP and BOTTOM.
const SPLEV_LEFT = 1;
const SPLEV_H_LEFT = 2;
const SPLEV_CENTER = 3;
const SPLEV_H_RIGHT = 4;
const SPLEV_RIGHT = 5;
const SPLEV_TOP = 1;
const SPLEV_BOTTOM = 5;

const THEMEROOM_RANDOM_METHODS = Object.freeze([
    'd', 'rn1', 'rn2', 'rnd', 'rne', 'rnz',
]);
const SOURCE_THEMEROOM_RANDOM = Object.freeze({ d, rn1, rn2, rnd, rne, rnz });

// Direction deltas
const xdir = [-1, -1, 0, 1, 1, 1, 0, -1];
const ydir = [0, -1, -1, -1, 0, 1, 1, 1];

// C ref: mklev.c trap_engravings[]. Indices without a source string are
// intentionally absent.
const TRAP_ENGRAVINGS = new Map([
    [TRAPDOOR, 'Vlad was here'],
    [TELEP_TRAP, 'ad aerarium'],
    [LEVEL_TELEP, 'ad aerarium'],
]);

function levelObjectEnv(overrides = {}) {
    return objectGenerationEnv({ state: game, ...overrides });
}

// C ref: dat/nhlib.lua shuffle(). Lua's one-based math.random(i) becomes the
// injected zero-based rn2(i) index used at each source call site below.
function shuffle_core_values(values, random) {
    for (let i = values.length; i > 1; --i) {
        const j = random(i);
        [values[i - 1], values[j]] = [values[j], values[i - 1]];
    }
}

// ============================================================
// Core mklev functions (ported from main project's mklev.js)
// ============================================================

// C ref: bones.c getbones() (630-756). Checks whether a bones file exists
// for the current level and, if found, loads it. In wizard mode, prompts
// before loading ("Get bones?") and before deleting ("Unlink bones?").
async function getbones() {
    const state = game;
    if (state.discover) return false;
    if (state.flags.bones === false) return false;
    // C: rn2(3) -- only once in three times do we find bones
    if (rn2(3) && !state.wizard) return false;

    const {
        getbones: loadBones,
        no_bones_level,
        deleteBonesFile,
    } = await import('./bones.js');

    if (no_bones_level(state.u.uz, state)) return false;

    const { yn_function } = await import('./cmd.js');

    // Check if bones exist before any prompts. C opens the file here; the
    // port checks VFS directly.
    const { vfsReadFile } = await import('./storage.js');
    const path = `bones_D${state.u.uz.dnum}.${state.u.uz.dlevel}`;
    if (!vfsReadFile(path)) return false;

    // Wizard mode: ask whether to load the bones.
    if (state.wizard) {
        const answer = await yn_function(
            'Get bones?', 'yn', 'n', false, state,
        );
        if (answer === 'n'.charCodeAt(0)) return false;
    }

    // getlev() suppresses map output while it rebuilds the level. The C TTY
    // still has the departing level's map when custompline() prints the
    // following Unlink prompt; the restored level is first painted by the
    // arrival redraw after this prompt. JS's full-screen flush would
    // otherwise rebuild the terminal from the restored level too early.
    if (state.wizard) state._bonesRestorePrompt = true;
    let ok;
    try {
        ok = loadBones(state);

        // C ref: bones.c:739-744. Wizard mode: ask whether to delete the
        // bones file. If 'n', keep it for next time.
        if (state.wizard) {
            const answer = await yn_function(
                'Unlink bones?', 'yn', 'n', false, state,
            );
            if (answer === 'n'.charCodeAt(0)) {
                return ok;
            }
        }
    } finally {
        delete state._bonesRestorePrompt;
    }

    return deleteBonesFile(state.u.uz) ? ok : false;
}

// C ref: allmain.c l_nhcore_init()
export function l_nhcore_init(state = game, random = rn2) {
    const align = [A_LAWFUL, A_NEUTRAL, A_CHAOTIC];
    shuffle_core_values(align, random);
    state.splev_align = align;
}

// C ref: mklev.c mklev()
export async function mklev({ specialLevelLoader = null } = {}) {
    const g = game;
    init_mapseen(g.u.uz, g);
    if (await getbones()) return;
    g.in_mklev = true;
    await makelevel(specialLevelLoader);
    level_finalize_topology();
    g.in_mklev = false;
}

// C ref: mklev.c clear_level_structures()
function clear_level_structures() {
    const g = game;
    g.level = new GameMap();
    g.subrooms = [];
    g.nsubroom = 0;
    g.made_branch = false;
    g.smeq = new Array(MAXNROFROOMS + 1).fill(0);
    g.stairs = null;
    g.head_engr = null;
    g.exclusion_zones = null;
    // C ref: gl.lregions / gn.num_lregions, the level regions a special
    // level's des.levregion() and des.teleport_region() add through
    // levregion_add(). C allocates it on the first add and frees it at the
    // end of mkmaze.c fixup_special(); the port empties it in both places.
    g.lregions = [];
    g.vault_x = -1;
    const lf = g.level.flags;
    lf.has_shop = false;
    lf.has_vault = false;
    lf.has_zoo = false;
    lf.has_court = false;
    lf.has_morgue = false;
    lf.graveyard = false;
    lf.has_beehive = false;
    lf.has_barracks = false;
    lf.has_temple = false;
    lf.has_swamp = false;
    lf.noteleport = false;
    lf.hardfloor = false;
    lf.nommap = false;
    lf.shortsighted = false;
    lf.sokoban_rules = false;
    lf.is_cavernous_lev = false;
    lf.arboreal = false;
    lf.has_town = false;
    lf.wizard_bones = false;
    lf.corrmaze = false;
    lf.temperature = 0;
    lf.rndmongen = true;
    lf.deathdrops = true;
    lf.noautosearch = false;
    lf.fumaroles = false;
    lf.stormy = false;
    lf.stasis_until = 0;
    // C ref: mklev.c clear_level_structures() frees gl.lev_message before
    // evaluating the next special-level description.
    g.gl ??= {};
    g.gl.lev_message = null;
    init_rect();
}

// C ref: mkmap.c litstate_rnd()
function litstate_rnd(litstate, random = rn2, randomOneBased = rnd) {
    if (litstate < 0) {
        const d = depth(game.u?.uz);
        return (randomOneBased(1 + Math.abs(d)) < 11 && random(77)) ? true : false;
    }
    return !!litstate;
}

// C ref: sp_lev.c fill_special_room(). Shops are backed by stock_room(); the
// selected ordinary D:5 special-room family is backed by mkroom.c fill_zoo().
export function fill_special_room(croom, env = {}) {
    if (!croom) return;

    const state = env.state ?? game;
    const normalized = { ...env, state };
    const randomOneBased = env.random?.rn1 ?? rn1;
    const subrooms = croom.sbrooms ?? [];
    const subroomCount = croom.nsubrooms ?? subrooms.length;
    for (let index = 0; index < subroomCount; ++index)
        fill_special_room(subrooms[index], normalized);

    if (croom.rtype === OROOM || croom.rtype === THEMEROOM
        || croom.needfill === FILL_NONE) {
        return;
    }

    const flags = state.level?.flags;
    if (!flags)
        throw new Error('fill_special_room requires initialized level flags');

    if (croom.needfill === FILL_NORMAL) {
        if (croom.rtype >= SHOPBASE) {
            const stockRoom = env.stockRoom ?? stock_room;
            stockRoom(croom.rtype - SHOPBASE, croom, normalized);
            flags.has_shop = true;
            return;
        }

        switch (croom.rtype) {
        case VAULT: {
            const amountRange = Math.abs(depth(state.u?.uz, state)) * 100;
            for (let x = croom.lx; x <= croom.hx; ++x) {
                for (let y = croom.ly; y <= croom.hy; ++y) {
                    mkgold(randomOneBased(amountRange, 51), x, y, normalized);
                }
            }
            break;
        }
        case COURT:
        case BEEHIVE:
        case MORGUE:
        case BARRACKS:
        case ZOO:
            fill_zoo(croom, normalized);
            break;
        case ANTHOLE:
        case COCKNEST:
        case LEPREHALL:
            throw new UnsupportedSpecialRoomError(
                `fill_special_room(${croom.rtype}) beyond the Morgue boundary`,
            );
        default:
            break;
        }
    }

    switch (croom.rtype) {
    case VAULT:
        flags.has_vault = true;
        break;
    case ZOO:
        flags.has_zoo = true;
        break;
    case COURT:
        flags.has_court = true;
        break;
    case MORGUE:
        flags.has_morgue = true;
        break;
    case BEEHIVE:
        flags.has_beehive = true;
        break;
    case BARRACKS:
        flags.has_barracks = true;
        break;
    case TEMPLE:
        flags.has_temple = true;
        break;
    case SWAMP:
        flags.has_swamp = true;
        break;
    default:
        break;
    }
}

function roomIsFillable(croom) {
    return Boolean(croom
        && (croom.rtype === OROOM || croom.rtype === THEMEROOM)
        && croom.needfill === FILL_NORMAL);
}

// C refs: nhlua.c nhl_init(); dat/nhlib.lua. Each dungeon branch retains its
// own themed-room Lua state, including nhlib's shuffled alignment array.
export function initialize_themeroom_branch(state = game, random = rn2) {
    const dnum = state.u?.uz?.dnum ?? 0;
    state._luathemes_loaded ??= {};
    state.themeroom_align ??= {};
    if (!state._luathemes_loaded[dnum]) {
        const align = ['law', 'neutral', 'chaos'];
        shuffle_core_values(align, random);
        state.themeroom_align[dnum] = align;
        state._luathemes_loaded[dnum] = true;
    }
    initialize_themeroom_postprocess_branch(state);
    return state.themeroom_align[dnum];
}

// C ref: mklev.c makelevel()
async function makelevel(specialLevelLoader = null) {
    const g = game;
    oinit();
    clear_level_structures();

    // C ref: mklev.c:1267-1270. Check for a special level and dispatch
    // through makemaz() when one exists. This takes priority over both the
    // explicit specialLevelLoader (tutorial) and the regular room path.
    // Only dispatch when the port has a loader for this level's proto;
    // unported special levels fall through to regular generation, which
    // is wrong but preserves the session's later matched screens.
    if (!specialLevelLoader) {
        const slev = Is_special(g.u.uz, g);
        if (slev && slev.proto && !Is_rogue_level(g.u.uz, g)) {
            await ensureSpecialLevelLoaders();
            // Determine the resolved protofile the same way makemaz() will.
            // For bigrm, slev.rndlevs is 13, so the proto is
            // "bigrm-<rnd(13)>". We cannot call rnd() here because it
            // would consume a random number before makemaz() does. Instead,
            // check the base proto: if ANY variant exists, dispatch.
            const hasLoader = slev.rndlevs
                ? Object.keys(SPECIAL_LEVEL_LOADERS).some(
                    (k) => k.startsWith(`${slev.proto}-`),
                )
                : Boolean(SPECIAL_LEVEL_LOADERS[slev.proto]);
            if (hasLoader) {
                await makemaz(slev.proto, slev, g);
                return;
            }
            throw new UnsupportedLevelChangeError(
                `makelevel: load_special() has no loader for special level "${slev.proto}"`,
            );
        }
    }

    if (specialLevelLoader) {
        // C refs: nhlua.c nhl_init(); dat/nhlib.lua. Loading an isolated
        // special-level Lua state shuffles its private alignment table before
        // evaluating the level file. Do not mark the persistent themed-room
        // branch as loaded: that Lua state has a different lifetime.
        const align = ['law', 'neutral', 'chaos'];
        shuffle_core_values(align, rn2);
        g.specialLevelAlign = align;
        const specialLevelApi = createSpecialLevelApi(g);
        await specialLevelLoader(specialLevelApi, g);
        specialLevelApi.finish();
        return;
    }

    // C ref: mklev.c:1271-1274. Dungeon-wide prototype or fill level.
    const dungeonRecord = g.dungeons[g.u.uz.dnum];
    if (dungeonRecord.proto) {
        await makemaz('', null, g);
        return;
    }
    if (dungeonRecord.fill_lvl) {
        await makemaz(dungeonRecord.fill_lvl, null, g);
        return;
    }

    // C ref: mklev.c:1275-1285. Quest filler levels (those not named
    // in the dungeon definition) are generated via makemaz() with a
    // role-specific proto: Bar-fila (above the locate level) or
    // Bar-filb (at or below it).
    if (In_quest(g.u.uz)) {
        const filecode = g.urole?.filecode;
        const locaName = `${filecode}-loca`;
        const loc_lev = find_level(locaName, g);
        const fillName = `${filecode}-fil`
            + (g.u.uz.dlevel < loc_lev.dlevel.dlevel ? 'a' : 'b');
        await ensureSpecialLevelLoaders();
        if (SPECIAL_LEVEL_LOADERS[fillName]) {
            await makemaz(fillName, null, g);
            return;
        }
    }

    // C ref: mklev.c:1295 — check for below-Medusa maze level
    // This rn2(5) is consumed even when the condition fails (short-circuit)
    const medusa = g.medusa_level;
    if (rn2(5) && g.u?.uz?.dnum === medusa?.dnum
        && (g.u?.uz?.dlevel ?? 1) > (medusa?.dlevel ?? 999)) {
        // Would generate maze — not applicable for contest level 1
    }

    // Regular level generation
    // C ref: mklev.c:382-388 — load themerms.lua for themed rooms
    // nhlib.lua shuffle when loading themerms.lua (first level of branch)
    const rogue = Is_rogue_level(g.u.uz, g);
    if (!rogue) initialize_themeroom_branch(g, rn2);

    if (rogue) {
        makeroguerooms(g);
        makerogueghost(g);
    } else {
        await makerooms();
    }

    if (g.level.nroom <= 0) return;
    sort_rooms();
    await generate_stairs();

    // Branch check
    const branchp = is_branchlev();
    // C ref: mklev.c:1306. A level that carries a dungeon branch needs one
    // more room before it can spare one for a special room.
    let room_threshold = branchp ? 4 : 3;

    if (!rogue) {
        makecorridors();
        await make_niches();
    }

    // C ref: mklev.c makelevel() secret-vault realization and retry. Rogue
    // levels jump over this block together with corridors and niches.
    if (!rogue && g.vault_x !== -1) {
        const vw = { v: 1 }, vh = { v: 1 };
        const vx = { v: g.vault_x }, vy = { v: g.vault_y };
        let realized = check_room(vx, vw, vy, vh, true);
        if (!realized && rnd_rect() && create_vault()) {
            const staged = g.level.rooms[g.level.nroom];
            g.vault_x = vx.v = staged.lx;
            g.vault_y = vy.v = staged.ly;
            realized = check_room(vx, vw, vy, vh, true);
            if (!realized) staged.hx = -1;
        }
        if (realized) {
            add_room(vx.v, vy.v, vx.v + vw.v, vy.v + vh.v, true, VAULT, false);
            g.level.flags.has_vault = true;
            ++room_threshold;
            const vaultRoom = g.level.rooms[g.level.nroom - 1];
            if (vaultRoom) {
                vaultRoom.needfill = FILL_NORMAL;
                fill_special_room(vaultRoom);
            }
            mk_knox_portal(vx.v + vw.v, vy.v + vh.v);
            if (!g.level.flags.noteleport && !rn2(3))
                await makeniche(TELEP_TRAP);
        }
    }

    // C ref: mklev.c makelevel() (1344-1375). At most one special room per
    // level, chosen by depth. Shops and the first depth-gated family, COURT,
    // are selected here; later families retain their source-labelled
    // selection branches.
    // `room_threshold` counts the rooms a level must have before it can spare
    // one: four when the level carries a dungeon branch, three otherwise, plus
    // one more when a vault was placed above.
    const u_depth = depth(g.u.uz);
    if (!rogue) {
        if (u_depth > 1 && u_depth < depth(g.medusa_level)
            && g.level.nroom >= room_threshold && rn2(u_depth) < 3) {
            do_mkroom(SHOPBASE, g);
        } else if (u_depth > 4 && !rn2(6)) {
            do_mkroom(COURT, g);
        } else if (u_depth > 5 && !rn2(8)
                   && !(g.mvitals[PM_LEPRECHAUN].mvflags & G_GONE)) {
            do_mkroom(LEPREHALL, g);
        } else if (u_depth > 6 && !rn2(7)) {
            do_mkroom(ZOO, g);
        } else if (u_depth > 8 && !rn2(5)) {
            do_mkroom(TEMPLE, g);
        } else if (u_depth > 9 && !rn2(5)
                   && !(g.mvitals[PM_KILLER_BEE].mvflags & G_GONE)) {
            do_mkroom(BEEHIVE, g);
        } else if (u_depth > 11 && !rn2(6)) {
            do_mkroom(MORGUE, g);
        } else if (u_depth > 12 && !rn2(8)) {
            // C's antholemon() picks the ant species that fills the hole and
            // answers NON_PM when every candidate is gone.
            do_mkroom(ANTHOLE, g);
        } else if (u_depth > 14 && !rn2(4)
                   && !(g.mvitals[PM_SOLDIER].mvflags & G_GONE)) {
            do_mkroom(BARRACKS, g);
        } else if (u_depth > 15 && !rn2(6)) {
            do_mkroom(SWAMP, g);
        } else if (u_depth > 16 && !rn2(8)
                   && !(g.mvitals[PM_COCKATRICE].mvflags & G_GONE)) {
            do_mkroom(COCKNEST, g);
        }
    }

    const previousStairs = g.stairs;

    // Place dungeon branch
    if (branchp) {
        place_branch(branchp);
    }
    if (g.u.uz.dnum === 0 && g.u.uz.dlevel === 1
        && g.stairs !== previousStairs) {
        g.stairs.u_traversed = true;
    }

    let fillableRoomCount = 0;
    for (let index = 0; index < g.level.nroom; ++index) {
        if (roomIsFillable(g.level.rooms[index])) ++fillableRoomCount;
    }
    let bonusItemRoomCountdown = fillableRoomCount
        ? rn2(fillableRoomCount)
        : -1;
    for (let index = 0; index < g.level.nroom; ++index) {
        const room = g.level.rooms[index];
        const fillable = roomIsFillable(room);
        fill_ordinary_room(
            room,
            fillable && bonusItemRoomCountdown === 0,
        );
        if (fillable) --bonusItemRoomCountdown;
    }

    const specialRoomEnv = levelObjectEnv();
    for (let index = 0; index < g.level.nroom; ++index)
        fill_special_room(g.level.rooms[index], specialRoomEnv);

    // themerooms_post_level_generate() is completed by
    // level_finalize_topology(), after every ordinary and special room fill.
}


// C ref: mklev.c mk_knox_portal(), which makelevel() calls once a vault has
// been placed. Fort Ludios is reached through a magic portal rather than a
// staircase, and the branch is deferred from level to level until one deep
// enough accepts it.
//
// The placement itself stops: insert_branch() rewrites the branch list and
// place_branch() puts a MAGIC_PORTAL trap on the map, and no level above depth
// ten can reach either, so what runs here is the deferral and its rn2(3).
function mk_knox_portal(x, y) {
    const g = game;
    const br = dungeon_branch('Fort Ludios', g);
    const sourceIsEnd2 = on_level(g.knox_level, br.end1);
    if (!sourceIsEnd2) {
        /* disallow Knox branch on a level with one branch already */
        if (is_branchlev()) return;
    }
    const source = sourceIsEnd2 ? br.end2 : br.end1;

    /* Already set or 2/3 chance of deferring until a later level. */
    if (source.dnum < g.n_dgns || rn2(3)) return;

    const u_depth = depth(g.u.uz);
    if (!(g.u.uz.dnum === g.oracle_level.dnum /* in main dungeon */
          && !at_dgn_entrance('The Quest', g) /* but not Quest's entry */
          && u_depth > 10                     /* beneath 10 */
          && u_depth < depth(g.medusa_level))) /* above Medusa */
        return;

    throw new UnsupportedSpecialRoomError(
        `mk_knox_portal() placing the Fort Ludios portal at <${x},${y}>`,
    );
}

// C ref: mklev.c makerooms()
async function makerooms() {
    const g = game;
    let tried_vault = false;
    const difficulty = level_difficulty(g);
    let themeroom_tries = 0;

    while (g.level.nroom < (MAXNROFROOMS - 1) && rnd_rect()) {
        if (g.level.nroom >= Math.trunc(MAXNROFROOMS / 6) && rn2(2) && !tried_vault) {
            tried_vault = true;
            if (create_vault()) {
                g.vault_x = g.level.rooms[g.level.nroom]?.lx ?? -1;
                g.vault_y = g.level.rooms[g.level.nroom]?.ly ?? -1;
                if (g.level.rooms[g.level.nroom]) g.level.rooms[g.level.nroom].hx = -1;
            }
        } else {
            // Themed room selection (reservoir sampling)
            g.in_mk_themerooms = true;
            g.themeroom_failed = false;
            let generated;
            try {
                generated = await themerooms_generate(difficulty);
            } finally {
                g.in_mk_themerooms = false;
            }
            if (!generated) {
                if (themeroom_tries++ > 10
                    || g.level.nroom >= Math.trunc(MAXNROFROOMS / 6))
                    break;
            }
        }
    }
}

function is_themeroom_eligible(room, difficulty) {
    if (room.mindiff != null && difficulty < room.mindiff) return false;
    if (room.maxdiff != null && difficulty > room.maxdiff) return false;
    return true;
}

// C ref: themerms.lua themerooms_generate().
export function select_themeroom(difficulty, random = rn2) {
    let pick = null;
    let total_frequency = 0;
    for (const meta of THEMEROOM_DEFINITIONS) {
        if (!is_themeroom_eligible(meta, difficulty)) continue;
        const this_frequency = meta.frequency;
        total_frequency += this_frequency;
        if (this_frequency > 0 && random(total_frequency) < this_frequency) {
            pick = meta;
        }
    }
    return pick;
}

// C ref: nhlua.c splev_chr2typ() (379-391). The cases below are char2typ[]
// (340-377) entry for entry. The default arm returns MAX_TYPE (C's
// INVALID_TYPE); selection_match and lspo_map skip those cells, while
// get_table_mapchr_opt and nhlsel.c's selection filter raise a Lua error.
// bigrm3 uses "[" in a mapfrag pattern, which reaches here via
// selection_match and must return MAX_TYPE to be skipped.
export function splev_chr2typ(char) {
    switch (char) {
    case ' ': return STONE;
    case '#': return CORR;
    case '.': return ROOM;
    case '-': return HWALL;
    case '|': return VWALL;
    case '+': return DOOR;
    case 'A': return AIR;
    case 'C': return CLOUD;
    case 'S': return SDOOR;
    case 'H': return SCORR;
    case '{': return FOUNTAIN;
    case '\\': return THRONE;
    case 'K': return SINK;
    case '}': return MOAT;
    case 'P': return POOL;
    case 'L': return LAVAPOOL;
    case 'Z': return LAVAWALL;
    case 'I': return ICE;
    case 'W': return WATER;
    case 'T': return TREE;
    case 'F': return IRONBARS;
    case 'x': return MAX_TYPE;
    case 'B': return CROSSWALL;
    case 'w': return MATCH_WALL;
    default: return MAX_TYPE;
    }
}

// C ref: nhlua.c check_mapchr(). The terrain type of a one-character map
// string; anything else is INVALID_TYPE. It lives here rather than in
// nhlua.js because it needs splev_chr2typ() and nhlua.js imports nothing.
export function check_mapchr(s) {
    if (s && s.length === 1) return splev_chr2typ(s);
    return INVALID_TYPE;
}

// C ref: nhlua.c get_table_mapchr(). A required map-character field.
export function get_table_mapchr(table, name) {
    const ter = get_table_str(table, name);
    const typ = check_mapchr(ter);
    if (typ === INVALID_TYPE) throw new Error('Erroneous map char');
    return typ;
}

// C ref: nhlua.c get_table_mapchr_opt(). An absent or empty field yields
// `defval`; a string that is not a map character is an error.
export function get_table_mapchr_opt(table, name, defval) {
    const ter = get_table_str_opt(table, name, '');
    if (ter) {
        const typ = check_mapchr(ter);
        if (typ === INVALID_TYPE) throw new Error('Erroneous map char');
        return typ;
    }
    return defval;
}

// C ref: sp_lev.c mapfrag_fromstr(). Parses a mapfragment string into the
// source's record: the digit-stripped text, the widest line, and the line
// count. Returns null past MAP_Y_LIM lines. The text is kept as one string
// because mapfrag_get() indexes it the way the source does.
export function mapfrag_fromstr(str) {
    const mf = {};

    mf.data = stripdigits(str);
    mf.wid = str_lines_maxlen(mf.data);
    mf.hei = 0;
    let tmps = 0;
    while (tmps !== null && tmps < mf.data.length) {
        let s1 = mf.data.indexOf('\n', tmps);

        if (mf.hei > MAP_Y_LIM)
            return null;
        if (s1 >= 0)
            s1++;
        tmps = s1 >= 0 ? s1 : null;
        mf.hei++;
    }
    return mf;
}

// C ref: sp_lev.c mapfrag_free(). Releases the fragment's text; the record
// itself is garbage collected.
export function mapfrag_free(mf) {
    if (mf) {
        mf.data = null;
    }
}

// C ref: sp_lev.c mapfrag_get(). Reads the terrain at (x, y) of the fragment.
// Each line is assumed to be `wid` wide plus its newline, as in the source.
export function mapfrag_get(mf, x, y) {
    if (y < 0 || x < 0 || y > mf.hei - 1 || x > mf.wid - 1)
        throw new Error(`outside mapfrag (${mf.wid},${mf.hei}), wanted (${x},${y})`);
    return splev_chr2typ(mf.data[y * (mf.wid + 1) + x]);
}

// C ref: sp_lev.c mapfrag_canmatch(). A pattern needs odd dimensions so it
// has a center cell.
export function mapfrag_canmatch(mf) {
    return Boolean((mf.wid % 2) && (mf.hei % 2));
}

// C ref: sp_lev.c TYP_CANNOT_MATCH(). A transparent (MAX_TYPE) or invalid
// fragment center cannot anchor a match; MATCH_WALL can.
function TYP_CANNOT_MATCH(typ) {
    return typ === MAX_TYPE || typ === INVALID_TYPE;
}

// C ref: sp_lev.c mapfrag_error(). The message a caller reports for an
// unusable fragment, or null when the fragment can be matched.
export function mapfrag_error(mf) {
    let res = null;

    if (!mf) {
        res = 'mapfragment error';
    } else if (!mapfrag_canmatch(mf)) {
        mapfrag_free(mf);
        res = 'mapfragment needs to have odd height and width';
    } else if (TYP_CANNOT_MATCH(mapfrag_get(mf, Math.trunc(mf.wid / 2),
                                            Math.trunc(mf.hei / 2)))) {
        mapfrag_free(mf);
        res = 'mapfragment center must be valid terrain';
    }
    return res;
}

// C ref: sp_lev.c match_maptyps(). MATCH_WALL matches any stone wall;
// MAX_TYPE (transparency) matches anything.
function match_maptyps(mapc, levltyp) {
    if (mapc === MATCH_WALL && !IS_STWALL(levltyp)) return false;
    if (mapc < MAX_TYPE && mapc !== levltyp) return false;
    return true;
}

// C ref: sp_lev.c mapfrag_match(). Matches the pattern centered on (x, y);
// cells off the map count as STONE.
export function mapfrag_match(mf, x, y, state = game) {
    const halfw = Math.trunc(mf.wid / 2);
    const halfh = Math.trunc(mf.hei / 2);
    for (let rx = -halfw; rx <= halfw; rx++)
        for (let ry = -halfh; ry <= halfh; ry++) {
            const mapc = mapfrag_get(mf, rx + halfw, ry + halfh);
            const levc = isok(x + rx, y + ry)
                ? state.level.at(x + rx, y + ry).typ : STONE;

            if (!match_maptyps(mapc, levc))
                return false;
        }
    return true;
}

function themeroom_map_fits(definition, xstart, ystart, state) {
    const { width, height, map: rows } = definition;
    for (let y = ystart - 1; y < Math.min(ROWNO, ystart + height) + 1; y++) {
        for (let x = xstart - 1; x < Math.min(COLNO, xstart + width) + 1; x++) {
            if (!isok(x, y)) return false;
            const inside = y >= ystart && y < ystart + height
                && x >= xstart && x < xstart + width;
            const loc = state.level.at(x, y);
            if (!inside) {
                if (!loc || loc.typ !== STONE || loc.roomno !== 0) return false;
                continue;
            }
            const mapType = splev_chr2typ(rows[y - ystart][x - xstart]);
            if (mapType >= MAX_TYPE) continue;
            if (!loc || (loc.typ !== STONE && loc.typ !== mapType) || loc.roomno !== 0)
                return false;
        }
    }
    return true;
}

// C ref: sp_lev.c sel_set_ter(), as called by lspo_map(). Map loading clears
// the location metadata before setting terrain. The map's default lit=false
// still leaves lava lit, and door orientation depends on the already-loaded
// cell immediately to its left.
function set_themeroom_map_terrain(x, y, typ, state) {
    const loc = state.level.at(x, y);
    loc.flags = 0;
    loc.doormask = 0;
    loc.horizontal = false;
    loc.roomno = 0;
    loc.edge = false;
    if (!set_levltyp(x, y, typ, { state })) return;
    loc.lit = IS_LAVA(typ);

    if (typ === SDOOR || IS_DOOR(typ)) {
        if (typ === SDOOR) loc.doormask = D_CLOSED;
        const left = x ? state.level.at(x - 1, y) : null;
        if (left && (IS_WALL(left.typ) || left.horizontal))
            loc.horizontal = true;
    } else if (typ === HWALL || typ === IRONBARS) {
        loc.horizontal = true;
    } else if (typ === CLOUD) {
        del_engr_at(x, y, state);
    }
}

// C ref: mkmaze.c pick_vibrasquare_location().  The invocation trap is not
// placed with an ordinary random DRY coordinate: its position must leave
// room for mkinvokearea() and stay away from the upstairs.  `inv_pos` is the
// shared C state used by occupied(), so clear it before testing candidates.
function pick_vibrasquare_location(frame, state) {
    const xMazeMin = 2;
    const yMazeMin = 2;
    const invXMargin = 6 - 2;
    const invYMargin = 5 - 2;
    const invDistance = 11;
    const xRange = frame.xMazeMax - xMazeMin - 2 * invXMargin - 1;
    const yRange = frame.yMazeMax - yMazeMin - 2 * invYMargin - 1;
    const upstairs = stairway_find_dir(true, state);

    state.inv_pos = { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    let tryCount = 0;
    do {
        x = rn1(xRange, xMazeMin + invXMargin + 1);
        y = rn1(yRange, yMazeMin + invYMargin + 1);
        ++tryCount;
    } while (upstairs && tryCount <= 1000 && (
        x === upstairs.sx
        || y === upstairs.sy
        || Math.abs(x - upstairs.sx) === Math.abs(y - upstairs.sy)
        || distmin(x, y, upstairs.sx, upstairs.sy) <= invDistance
        || !SPACE_POS(state.level.at(x, y).typ)
        || occupied(x, y, state)
    ));
    return { x, y };
}

// C ref: sp_lev.c sel_set_ter(), which calls mkmaze.c set_levltyp_lit() and
// then fixes up the door, wall, ice, and cloud arms. This is the special-level
// API's terrain() writer; set_themeroom_map_terrain() above is the same
// function as called by lspo_map(), whose metadata reset differs. The ice arm
// (`splev_init_present && ICE` sets icedpool from the coder's icedpools flag)
// and the cloud arm (del_engr_at()) are not ported; both stop here, ahead of
// set_levltyp_lit(), so a refused paint changes nothing.
function sel_set_ter(x, y, typ, lit, state) {
    if (typ === ICE || typ === CLOUD) {
        throw new UnsupportedLevelChangeError(
            `sel_set_ter: ${typ === ICE ? 'ice' : 'cloud'} terrain not ported`,
        );
    }
    if (!set_levltyp(x, y, typ, { state })) return false;
    const location = state.level.at(x, y);
    if (lit !== SET_LIT_NOCHANGE) {
        location.lit = IS_LAVA(typ)
            || (lit === SET_LIT_RANDOM ? Boolean(rn2(2)) : Boolean(lit));
    }
    if (typ === SDOOR || IS_DOOR(typ)) {
        if (typ === SDOOR) location.doormask = D_CLOSED;
        const left = x > 0 ? state.level.at(x - 1, y) : null;
        if (left && (IS_WALL(left.typ) || left.horizontal))
            location.horizontal = true;
    } else if (typ === HWALL || typ === IRONBARS) {
        location.horizontal = true;
    }
    return true;
}

// C ref: sp_lev.c sel_set_wall_property(). Flags one wall, tree, or iron
// bars square with a W_NONDIGGABLE/W_NONPASSWALL property; other terrain is
// left alone. selection_iterate() and set_wall_property() call it per square.
function sel_set_wall_property(x, y, prop, state = game) {
    const loc = state.level.at(x, y);
    if (IS_STWALL(loc.typ) || IS_TREE(loc.typ, state)
        /* 3.6.2: made iron bars eligible to be flagged nondiggable
           (checked by chewing(hack.c) and zap_over_floor(zap.c)) */
        || loc.typ === IRONBARS)
        loc.wall_info |= prop;
}

// C ref: sp_lev.c set_wall_property(). Makes the walls of the area
// (x1, y1, x2, y2) non diggable/non passwall-able, clamped to the map.
function set_wall_property(x1, y1, x2, y2, prop, state = game) {
    x1 = Math.max(x1, 1);
    x2 = Math.min(x2, COLNO - 1);
    y1 = Math.max(y1, 0);
    y2 = Math.min(y2, ROWNO - 1);
    for (let y = y1; y <= y2; y++)
        for (let x = x1; x <= x2; x++) {
            sel_set_wall_property(x, y, prop, state);
        }
}

// C ref: sp_lev.c remove_boundary_syms(). CROSSWALLs mark "invisible"
// boundaries where door symbols look bad; once regions are laid out, the
// ones the map placed become ROOM.
function remove_boundary_syms(frame, state = game) {
    let has_bounds = false;

    for (let x = 0; x < COLNO - 1; x++)
        for (let y = 0; y < ROWNO - 1; y++)
            if (state.level.at(x, y).typ === CROSSWALL) {
                has_bounds = true;
                break;
            }
    if (has_bounds) {
        for (let x = 0; x < frame.xMazeMax; x++)
            for (let y = 0; y < frame.yMazeMax; y++)
                if ((state.level.at(x, y).typ === CROSSWALL)
                    && frame.splevMap[x][y])
                    state.level.at(x, y).typ = ROOM;
    }
}

// C ref: sp_lev.c set_door_orientation(), used by sel_set_door() and
// link_doors_rooms(). A door with a wall or door on its left or right is
// horizontal; with none adjacent, solid rock that has not been wallified yet
// (and the map edge) counts as an implicit wall.
function set_door_orientation(x, y, state = game) {
    const typAt = (xx, yy) => state.level.at(xx, yy).typ;
    const isDoorWall = (xx, yy) => isok(xx, yy)
        && (IS_WALL(typAt(xx, yy)) || IS_DOOR(typAt(xx, yy))
            || typAt(xx, yy) === SDOOR);
    let wleft = isDoorWall(x - 1, y);
    let wright = isDoorWall(x + 1, y);
    let wup = isDoorWall(x, y - 1);
    let wdown = isDoorWall(x, y + 1);
    if (!wleft && !wright && !wup && !wdown) {
        wleft = (!isok(x - 1, y) || IS_DOORJOIN(typAt(x - 1, y)));
        wright = (!isok(x + 1, y) || IS_DOORJOIN(typAt(x + 1, y)));
        wup = (!isok(x, y - 1) || IS_DOORJOIN(typAt(x, y - 1)));
        wdown = (!isok(x, y + 1) || IS_DOORJOIN(typAt(x, y + 1)));
    }
    state.level.at(x, y).horizontal = ((wleft || wright) && !(wup && wdown));
}

// C ref: sp_lev.c create_trap(). Resolves the trap's location (the
// vibrating square has its own picker; a room uses get_free_room_loc(); the
// map retries up to 100 times to avoid stairs and ladders), then hands the
// MKTRAP_ flags and the square to mktrap().
function create_trap(t, croom, frame, env) {
    const { state } = env;
    const tm = { x: -1, y: -1 };
    let mktrap_flags = MKTRAP_MAZEFLAG;

    if (t.type === VIBRATING_SQUARE) {
        state.inv_pos = pick_vibrasquare_location(frame, state);
        maketrap(state.inv_pos.x, state.inv_pos.y, VIBRATING_SQUARE, env);
        return;
    } else if (croom) {
        get_free_room_loc(tm, croom, t.coord, { frame, state });
    } else {
        let trycnt = 0;

        do {
            get_location_coord(tm, DRY, croom, t.coord, { frame, state });
        } while ((state.level.at(tm.x, tm.y).typ === STAIRS
                  || state.level.at(tm.x, tm.y).typ === LADDER)
                 && ++trycnt <= 100);
        if (trycnt > 100)
            return;
    }

    if (!t.spider_on_web)
        mktrap_flags |= MKTRAP_NOSPIDERONWEB;
    if (t.seen)
        mktrap_flags |= MKTRAP_SEEN;
    if (t.novictim)
        mktrap_flags |= MKTRAP_NOVICTIM;

    make_level_trap(t.type, mktrap_flags, null, tm, env);
}

// C ref: sp_lev.c good_stair_loc(). The is_ok_location_func that
// l_create_stairway() installs while it picks a random square.
function good_stair_loc(x, y, state = game) {
    const typ = state.level.at(x, y).typ;

    return (typ === ROOM || typ === CORR || typ === ICE);
}

// C ref: sp_lev.c get_table_align(). The "align" option of an altar or
// monster table; its default is "random".
function get_table_align(spec) {
    const aligns2i = {
        noalign: AM_NONE, law: AM_LAWFUL, neutral: AM_NEUTRAL,
        chaos: AM_CHAOTIC, coaligned: AM_SPLEV_CO,
        noncoaligned: AM_SPLEV_NONCO, random: AM_SPLEV_RANDOM,
    };
    const a = aligns2i[spec.align ?? 'random'];
    if (a == null)
        throw new Error(`unknown special-level alignment ${spec.align}`);
    return a;
}

// C ref: sp_lev.c create_altar(). Places an altar at the resolved square,
// stores its alignment mask, and for a shrine or sanctum inside a temple
// installs the priest and marks the level as having a temple.
function create_altar(a, croom, frame, env) {
    const { state } = env;
    const c = { x: -1, y: -1 };
    let croom_is_temple = true;

    if (croom) {
        get_free_room_loc(c, croom, a.coord, { frame, state });
        if (croom.rtype !== TEMPLE)
            croom_is_temple = false;
    } else {
        get_location_coord(c, DRY, croom, a.coord, { frame, state });
        const sprooms = in_rooms(c.x, c.y, TEMPLE, state);
        if (sprooms.length > 0)
            croom = state.level.rooms[sprooms[0] - ROOMOFFSET];
        else
            croom_is_temple = false;
    }
    const { x, y } = c;

    /* check for existing features */
    if (!set_levltyp(x, y, ALTAR, { state }))
        return;

    const amask = sp_amask_to_amask(a.sp_amask, env);

    // struct rm's altarmask aliases its flags field.
    const loc = state.level.at(x, y);
    loc.flags = amask;

    if (a.shrine < 0)
        a.shrine = rn2(2); /* handle random case */

    if (!croom_is_temple || !a.shrine)
        return;

    if (a.shrine) { /* Is it a shrine  or sanctum? */
        priestini(state.u.uz, croom, x, y, (a.shrine > 1), env);
        loc.flags |= AM_SHRINE;
        if (a.shrine === 2) /* high altar or sanctum */
            loc.flags |= AM_SANCTUM;
        state.level.flags.has_temple = true;
    }
}

// C ref: sp_lev.c search_door(). Searches for the cnt'th door in a room on
// the specified wall; returns its square, or null when there are fewer.
export function search_door(croom, wall, cnt, state = game) {
    let dx, dy;
    let xx, yy;

    switch (wall) {
    case W_SOUTH:
        dy = 0;
        dx = 1;
        xx = croom.lx;
        yy = croom.hy + 1;
        break;
    case W_NORTH:
        dy = 0;
        dx = 1;
        xx = croom.lx;
        yy = croom.ly - 1;
        break;
    case W_EAST:
        dy = 1;
        dx = 0;
        xx = croom.hx + 1;
        yy = croom.ly;
        break;
    case W_WEST:
        dy = 1;
        dx = 0;
        xx = croom.lx - 1;
        yy = croom.ly;
        break;
    default:
        throw new Error('search_door: Bad wall!');
    }
    while (xx <= croom.hx + 1 && yy <= croom.hy + 1) {
        const typ = state.level.at(xx, yy).typ;
        if (IS_DOOR(typ) || typ === SDOOR) {
            if (cnt-- <= 0)
                return { x: xx, y: yy };
        }
        xx += dx;
        yy += dy;
    }
    return null;
}

// C ref: sp_lev.c create_corridor(). A source room of -1 asks for the
// ordinary makecorridors(); otherwise the corridor runs from the door on
// the source wall to the door on the destination wall, each stepped one
// square outward from its wall.
function create_corridor(c, state = game) {
    if (c.src.room === -1) {
        makecorridors(); /*makecorridors(c->src.door);*/
        return;
    }

    /* Safety railings - if there's ever a case where des.corridor() needs
     * to be called with src/destwall="random", that logic first needs to be
     * implemented in search_door. */
    if (c.src.wall === W_ANY || c.src.wall === W_RANDOM
        || c.dest.wall === W_ANY || c.dest.wall === W_RANDOM) {
        // C: impossible("create_corridor to/from a random wall");
        return;
    }
    const org = search_door(state.level.rooms[c.src.room], c.src.wall,
                            c.src.door, state);
    if (!org)
        return;
    if (c.dest.room !== -1) {
        const dest = search_door(state.level.rooms[c.dest.room],
                                 c.dest.wall, c.dest.door, state);
        if (!dest)
            return;
        switch (c.src.wall) {
        case W_NORTH:
            org.y--;
            break;
        case W_SOUTH:
            org.y++;
            break;
        case W_WEST:
            org.x--;
            break;
        case W_EAST:
            org.x++;
            break;
        }
        switch (c.dest.wall) {
        case W_NORTH:
            dest.y--;
            break;
        case W_SOUTH:
            dest.y++;
            break;
        case W_WEST:
            dest.x--;
            break;
        case W_EAST:
            dest.x++;
            break;
        }
        dig_corridor(org, dest, null, false, CORR, STONE);
    }
}

// C ref: sp_lev.c light_region(). Sets the lighting of a rectangular
// region; a lit region grows by one square so its walls are lit too, and
// lava stays lit either way.
function light_region(tmpregion, state = game) {
    const litstate = tmpregion.rlit ? 1 : 0;
    let hiy = tmpregion.y2;
    let lowy = tmpregion.y1;
    let lowx = tmpregion.x1, hix = tmpregion.x2;

    if (litstate) {
        /* adjust region size for walls, but only if lighted */
        lowx = Math.max(lowx - 1, 1);
        hix = Math.min(hix + 1, COLNO - 1);
        lowy = Math.max(lowy - 1, 0);
        hiy = Math.min(hiy + 1, ROWNO - 1);
    }
    for (let x = lowx; x <= hix; x++) {
        for (let y = lowy; y <= hiy; y++) {
            const lev = state.level.at(x, y);
            lev.lit = IS_LAVA(lev.typ) ? true : Boolean(litstate);
        }
    }
}

// C ref: sp_lev.c lvlfill_maze_grid(). Writes the maze grid's terrain
// directly: STONE on the top two rows and at odd-odd cells, `filling`
// elsewhere; a corridor maze is all STONE.
function lvlfill_maze_grid(x1, y1, x2, y2, filling, state) {
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) {
            if (state.level.flags.corrmaze)
                state.level.at(x, y).typ = STONE;
            else
                state.level.at(x, y).typ = (y < 2 || ((x % 2) && (y % 2)))
                    ? STONE : filling;
        }
}

// C ref: sp_lev.c lvlfill_solid(). Fills the maze area with one terrain and
// lighting, clearing each written cell's door, room, and edge metadata.
function lvlfill_solid(filling, lit, frame, state) {
    for (let x = 2; x <= frame.xMazeMax; x++)
        for (let y = 0; y <= frame.yMazeMax; y++) {
            if (!set_levltyp_lit(x, y, filling, lit, state))
                continue;
            const loc = state.level.at(x, y);
            loc.flags = 0;
            loc.doormask = 0;
            loc.horizontal = false;
            loc.roomno = 0;
            loc.edge = false;
        }
}

// C ref: sp_lev.c lvlfill_swamp(). Jamis Buck's "relaxed blockwise maze":
// over a solid `bg` fill, every even cell becomes `fg`, and where the three
// cells below and to the right of it are all still `bg`, rn2(3) picks one of
// them to become `fg` too.
function lvlfill_swamp(fg, bg, lit, frame, state) {
    lvlfill_solid(bg, lit, frame, state);

    for (let x = 2; x <= Math.min(frame.xMazeMax, COLNO - 2); x += 2)
        for (let y = 0; y <= Math.min(frame.yMazeMax, ROWNO - 2); y += 2) {
            let c = 0;

            set_levltyp_lit(x, y, fg, lit, state);
            if (state.level.at(x + 1, y).typ === bg)
                ++c;
            if (state.level.at(x, y + 1).typ === bg)
                ++c;
            if (state.level.at(x + 1, y + 1).typ === bg)
                ++c;
            if (c === 3) {
                switch (rn2(3)) {
                case 0:
                    set_levltyp_lit(x + 1, y, fg, lit, state);
                    break;
                case 1:
                    set_levltyp_lit(x, y + 1, fg, lit, state);
                    break;
                case 2:
                    set_levltyp_lit(x + 1, y + 1, fg, lit, state);
                    break;
                default:
                    break;
                }
            }
        }
}

// C ref: sp_lev.c splev_initlev(). Dispatches a des.level_init() request to
// the fill routine its style names.
function splev_initlev(linit, frame, state) {
    switch (linit.init_style) {
    default:
        throw new Error('Unrecognized level init style.');
    case LVLINIT_NONE:
        break;
    case LVLINIT_SOLIDFILL:
        if (linit.lit === BOOL_RANDOM)
            linit.lit = rn2(2);
        lvlfill_solid(linit.filling, linit.lit, frame, state);
        break;
    case LVLINIT_MAZEGRID:
        lvlfill_maze_grid(2, 0, frame.xMazeMax, frame.yMazeMax, linit.bg,
                          state);
        break;
    case LVLINIT_MAZE:
        create_maze(linit.corrwid, linit.wallthick, linit.rm_deadends, frame,
                    state);
        break;
    case LVLINIT_ROGUE:
        // Rogue-style special level descriptions use the same procedural
        // generator as makelevel() and do not fill a rectangular map first.
        // The Lua path is not a caller in the selected production branch yet;
        // keep this dispatch source-shaped for future level definitions.
        makeroguerooms(state);
        break;
    case LVLINIT_MINES:
        if (linit.lit === BOOL_RANDOM)
            linit.lit = rn2(2);
        if (linit.filling > -1)
            lvlfill_solid(linit.filling, 0, frame, state);
        // C: the file-scope icedpools flag lspo_level_flags("icedpools")
        // sets; this port keeps it on the frame.
        linit.icedpools = frame.icedpools;
        mkmap(linit, state);
        break;
    case LVLINIT_SWAMP:
        if (linit.lit === BOOL_RANDOM)
            linit.lit = rn2(2);
        lvlfill_swamp(linit.fg, linit.bg, linit.lit, frame, state);
        break;
    }
}

// C ref: sp_lev.c sp_code_jmpaddr(). The source keeps it under `#if 0`
// with no caller; it is a relic of the pre-Lua bytecode interpreter.
export function sp_code_jmpaddr(curpos, jmpaddr) {
    return (curpos + jmpaddr);
}

// C ref: sp_lev.c l_push_wid_hei_table(). The table a des.map() contents
// callback receives: {width=wid, height=hei}.
export function l_push_wid_hei_table(wid, hei) {
    return { width: wid, height: hei };
}

// C ref: sp_lev.c room_types[] and get_mkroom_name(). The Lua name of a
// room type, "unknown" for one the table lacks.
const room_types = [
    ['ordinary', OROOM],
    ['themed', THEMEROOM],
    ['throne', COURT],
    ['swamp', SWAMP],
    ['vault', VAULT],
    ['beehive', BEEHIVE],
    ['morgue', MORGUE],
    ['barracks', BARRACKS],
    ['zoo', ZOO],
    ['delphi', DELPHI],
    ['temple', TEMPLE],
    ['anthole', ANTHOLE],
    ['cocknest', COCKNEST],
    ['leprehall', LEPREHALL],
    ['shop', SHOPBASE],
    ['armor shop', ARMORSHOP],
    ['scroll shop', SCROLLSHOP],
    ['potion shop', POTIONSHOP],
    ['weapon shop', WEAPONSHOP],
    ['food shop', FOODSHOP],
    ['ring shop', RINGSHOP],
    ['wand shop', WANDSHOP],
    ['tool shop', TOOLSHOP],
    ['book shop', BOOKSHOP],
    ['health food shop', FODDERSHOP],
    ['candle shop', CANDLESHOP],
];

export function get_mkroom_name(rtype) {
    for (const [name, type] of room_types)
        if (type === rtype)
            return name;

    // C: impossible("get_mkroom_name unknown rtype %d", rtype);
    return 'unknown'; /* not NULL */
}

// C ref: sp_lev.c l_push_mkroom_table(). The table a des.room() or
// des.region() contents callback receives, describing the room.
export function l_push_mkroom_table(tmpr) {
    return {
        width: 1 + (tmpr.hx - tmpr.lx),
        height: 1 + (tmpr.hy - tmpr.ly),
        region: { x1: tmpr.lx, y1: tmpr.ly, x2: tmpr.hx, y2: tmpr.hy },
        lit: Boolean(tmpr.rlit),
        irregular: Boolean(tmpr.irregular),
        needjoining: Boolean(tmpr.needjoining),
        type: get_mkroom_name(tmpr.rtype),
    };
}

// C ref: sp_lev.c, the lspo_* handlers a des-file calls. makelevel() builds one
// of these only when mklev() was given a specialLevelLoader; the special-level
// loaders (js/tutorial_level.js loadTutorialLevel() for dat/tut-1.lua among
// them) call its methods the way the Lua files call des.*.
//
// scripts/tutorial-startup.test.mjs replays the tutorial loader against a
// recording stub and pins the level_init styles, level_flags names, and door
// states it supplies.

// Lazily populated on first use to avoid a circular import: bigrm.js
// imports splev_chr2typ from this file, and this file imports
// BIGRM_LOADERS from bigrm.js. The dynamic import() in makemaz()
// resolves the cycle after both modules have finished evaluating.
let SPECIAL_LEVEL_LOADERS = null;

// Lazy-loads all special level loader modules and populates
// SPECIAL_LEVEL_LOADERS. The dynamic import() breaks the circular
// dependency between mklev.js and bigrm.js.
async function ensureSpecialLevelLoaders() {
    if (SPECIAL_LEVEL_LOADERS) return;
    const { BIGRM_LOADERS } = await import('./bigrm.js');
    const { QUEST_LEVEL_LOADERS } = await import('./quest_levels.js');
    const { SOKOBAN_LEVEL_LOADERS } = await import('./sokoban_levels.js');
    const { CASTLE_LEVEL_LOADERS } = await import('./castle_levels.js');
    const { MINES_LEVEL_LOADERS } = await import('./mines_levels.js');
    const { FIRE_LEVEL_LOADERS } = await import('./fire_levels.js');
    const { AIR_LEVEL_LOADERS } = await import('./air_levels.js');
    const { HELL_LEVEL_LOADERS } = await import('./hell_levels.js');
    const { VALLEY_LEVEL_LOADERS } = await import('./valley_levels.js');
    const { MEDUSA_LEVEL_LOADERS } = await import('./medusa_levels.js');
    const { SANCTUM_LEVEL_LOADERS } = await import('./sanctum_levels.js');
    const { ASMODEUS_LEVEL_LOADERS } = await import('./asmodeus_levels.js');
    const { BAALZ_LEVEL_LOADERS } = await import('./baalz_levels.js');
    const { JUIBLEX_LEVEL_LOADERS } = await import('./juiblex_levels.js');
    SPECIAL_LEVEL_LOADERS = {
        ...BIGRM_LOADERS,
        ...QUEST_LEVEL_LOADERS,
        ...SOKOBAN_LEVEL_LOADERS,
        ...CASTLE_LEVEL_LOADERS,
        ...MINES_LEVEL_LOADERS,
        ...FIRE_LEVEL_LOADERS,
        ...AIR_LEVEL_LOADERS,
        ...HELL_LEVEL_LOADERS,
        ...VALLEY_LEVEL_LOADERS,
        ...MEDUSA_LEVEL_LOADERS,
        ...SANCTUM_LEVEL_LOADERS,
        ...ASMODEUS_LEVEL_LOADERS,
        ...BAALZ_LEVEL_LOADERS,
        ...JUIBLEX_LEVEL_LOADERS,
    };
}

// C ref: sp_lev.c load_special(). Initializes the level coder, runs the
// level definition loader (the JS equivalent of load_lua), and applies
// post-processing. Returns true when the level loaded, false when no
// loader exists for the given name.
export async function load_special(name, state) {
    await ensureSpecialLevelLoaders();
    const loader = SPECIAL_LEVEL_LOADERS[name];
    if (!loader) return false; // C: !load_lua() -> give_up

    // C ref: nhlua.c nhl_init(); dat/nhlib.lua. The Lua state shuffles
    // its private alignment table before evaluating the level file.
    const align = ['law', 'neutral', 'chaos'];
    shuffle_core_values(align, rn2);
    state.specialLevelAlign = align;

    const specialLevelApi = createSpecialLevelApi(state);
    await loader(specialLevelApi, state);

    // Post-processing: finish() covers link_doors_rooms,
    // remove_boundary_syms, map_cleanup, wallification, flip_level_rnd,
    // count_level_features, solidify_map, fixup_special, premap_detect, and
    // fill_special_room. ensure_way_out (conditional on check_inaccessibles)
    // is recorded as a gap.
    specialLevelApi.finish();

    return true;
}

// C ref: mkmaze.c makemaz(). Selects the special level variant, loads
// and runs the corresponding level definition through the special level
// API, and applies post-processing.
async function makemaz(proto, slev, state) {
    let protofile;
    if (proto) {
        if (slev && slev.rndlevs) {
            protofile = `${proto}-${rnd(slev.rndlevs)}`;
        } else {
            protofile = proto;
        }
    } else {
        protofile = '';
    }

    if (protofile) {
        check_ransacked(protofile, state);
        // C ref: mkmaze.c:1184-1193. load_special() runs the Lua level
        // definition and applies post-processing.
        if (await load_special(protofile, state)) {
            // C ref: mkmaze.c:1191. Dead monsters created during level
            // loading are freed here.
            dmonsfree(state);
            return;
        }
        // C: impossible("Couldn't load \"%s\" - making a maze.", protofile);
        throw new UnsupportedLevelChangeError(
            `makemaz: no loader for "${protofile}"`,
        );
    }

    // C ref: mkmaze.c:1197-1223. Procedural maze generation when no
    // protofile is found. Not yet reached by any development session.
    throw new UnsupportedLevelChangeError('makemaz: procedural maze generation not ported');
}

// C ref: sp_lev.c lspo_map() halign/valign positioning. Translates
// alignment names to x/y offsets within the maze area.
function mapAlignX(halign, width, frame) {
    switch (halign) {
    // C: splev_init_present ? 1 : 3, the file-scope flag lspo_level_init()
    // sets; this port keeps it on the frame.
    case 'left': return frame.splev_init_present ? 1 : 3;
    case 'half-left': return 2 + Math.trunc((frame.xMazeMax - 2 - width) / 4);
    case 'center': return 2 + Math.trunc((frame.xMazeMax - 2 - width) / 2);
    case 'half-right':
        return 2 + Math.trunc(((frame.xMazeMax - 2 - width) * 3) / 4);
    case 'right': return frame.xMazeMax - width - 1;
    default: return 2 + Math.trunc((frame.xMazeMax - 2 - width) / 2);
    }
}

function mapAlignY(valign, height, frame) {
    switch (valign) {
    case 'top': return 3;
    case 'center': return 2 + Math.trunc((frame.yMazeMax - 2 - height) / 2);
    case 'bottom': return frame.yMazeMax - height - 1;
    default: return 2 + Math.trunc((frame.yMazeMax - 2 - height) / 2);
    }
}

// C ref: sp_lev.c update_croom(). Synchronizes coder->croom from the
// tmproomlist stack. After each room enter (n_subroom++) or exit
// (n_subroom--), croom points to the innermost active room, or null
// when at the top level.
function update_croom(coder) {
    if (!coder) return;
    if (coder.n_subroom) {
        coder.croom = coder.tmproomlist[coder.n_subroom - 1];
    } else {
        coder.croom = null;
    }
}

// C ref: sp_lev.c reset_xystart_size(). The map frame that get_location()
// converts Lua-relative coordinates through: column 0 is off limits, so the
// frame starts at (1, 0) and covers COLNO-1 by ROWNO. `frame` holds C's
// gx.xstart/gy.ystart/gx.xsize/gy.ysize for one special-level load;
// state.xstart and friends mirror them for trap.js's launch offsets, and
// lspo_map() sets both the same way. mklev.c also calls this before and
// after each level build; the JS frame is created fresh per load instead.
function reset_xystart_size(frame, state) {
    frame.xstart = 1; /* column [0] is off limits */
    frame.ystart = 0;
    frame.xsize = COLNO - 1; /* 1..COLNO-1 */
    frame.ysize = ROWNO; /* 0..ROWNO-1 */
    state.xstart = frame.xstart;
    state.ystart = frame.ystart;
    state.xsize = frame.xsize;
    state.ysize = frame.ysize;
}

// C ref: sp_lev.c sp_level_coder_init(). Allocates and initializes the
// sp_coder structure, resets file-scope level-generation state, and sets
// default level flags. Returns the coder. SpLev_Map is created by
// createSpecialLevelApi since it is not part of the C sp_coder struct.
function sp_level_coder_init(state, frame) {
    const coder = {
        premapped: false,
        solidify: false,
        check_inaccessibles: false,
        allow_flips: 3,  // allow flipping level horiz/vert
        croom: null,
        n_subroom: 1,
        lvl_is_joined: false,
        room_stack: 0,
        tmproomlist: new Array(MAX_NESTED_ROOMS + 1).fill(null),
        failed_room: new Array(MAX_NESTED_ROOMS + 1).fill(false),
    };

    // C: splev_init_present = FALSE; icedpools = FALSE. Both are sp_lev.c
    // file-scope flags for one special-level load, so the frame holds them:
    // lspo_level_init() and lspo_level_flags() set them, and lspo_map(),
    // splev_initlev(), and sel_set_ter() read them.
    frame.splev_init_present = false;
    frame.icedpools = false;

    update_croom(coder);

    // C: container_obj[0..MAX_CONTAINMENT-1] = NULL; container_idx = 0;
    // invent_carrying_monster = NULL;
    // In JS these live in the sp_lev_object context, created separately.

    // C: memset(SpLev_Map, 0, sizeof SpLev_Map);
    // In JS, splevMap is created by createSpecialLevelApi.

    // C: level.flags initialization
    state.level.flags.is_maze_lev = false;
    state.level.flags.temperature = In_hell(state.u.uz, state) ? 1 : 0;
    state.level.flags.rndmongen = true;
    state.level.flags.deathdrops = true;

    reset_xystart_size(frame, state);

    return coder;
}

// C ref: sp_lev.c nhl_functions[] / l_register_des(). In C, creates the
// des.* Lua table from the nhl_functions array, mapping each name to its
// lspo_* C function. In JS, the equivalent dispatch is the API object
// returned by createSpecialLevelApi; its methods correspond to the C
// entries: message, monster, object, level_flags, level_init, engraving,
// mineralize, door, stair, ladder, grave, altar, map, feature, terrain,
// replace_terrain, room, corridor, random_corridors, gold, trap,
// mazewalk, drawbridge, region, levregion, exclusion, wallify,
// wall_property, non_diggable, non_passwall, teleport_region,
// reset_level, finalize_level, gas_cloud.
function l_register_des(api) {
    return api;
}

// C ref: sp_lev.c create_des_coder(). In C, allocates the coder on first
// use (each lspo_* function calls this as a guard). In JS, the coder is
// created once per special level by createSpecialLevelApi.
function create_des_coder(state, frame) {
    return sp_level_coder_init(state, frame);
}

// The des.* functions below take their Lua arguments as the array `args`
// and read C's globals from `env`: `env.state` for svl.level, `env.coder`
// for gc.coder, and `env.frame` for sp_lev.c's file-scope placement state.

// C ref: sp_lev.c lspo_message(). Appends a line to gl.lev_message, which
// do.c delivers after the destination map is drawn.
export function lspo_message(args, env) {
    const { state } = env;
    if (args.length < 1) throw new Error('Wrong parameters');
    const msg = luaL_checkstring(args[0]);
    state.gl ??= {};
    const old = state.gl.lev_message;
    state.gl.lev_message = old != null ? `${old}\n${msg}` : msg;
}

// C ref: sp_lev.c get_table_monclass(). The class of a one-character
// `class` field, or -1. The C keeps the character and converts it in
// create_monster(); this port stores the class index def_char_to_monclass()
// returns, which its level loaders also pass directly.
export function get_table_monclass(table) {
    if (Number.isInteger(table.class)) return table.class;
    const s = get_table_str_opt(table, 'class', null);
    let ret = -1;
    if (s && s.length === 1) ret = def_char_to_monclass(s);
    return ret;
}

// C ref: sp_lev.c find_montype(). The species a monster name denotes, with
// its gender: a one-gender species keeps its own, and any other takes the
// name's gender or a coin flip. The C reads the name through
// name_to_monplus(); the port's level loaders may instead pass the index
// that call would return, with `parsedGender` standing for the gender it
// would report.
export function find_montype(s, env, parsedGender = NEUTRAL) {
    const { state } = env;
    let i;
    let mgend;
    if (typeof s === 'string') {
        const parsed = name_to_monplus(s, { state, gender: NEUTRAL });
        i = parsed.mnum;
        mgend = parsed.gender;
    } else {
        i = s;
        mgend = parsedGender;
    }
    if (i >= LOW_PM && i < NUMMONS) {
        const ptr = state.mons[i];
        if (is_male(ptr) || is_female(ptr))
            mgend = is_female(ptr) ? FEMALE : MALE;
        else
            mgend = (mgend === FEMALE) ? FEMALE
                : (mgend === MALE) ? MALE : env.random.rn2(2);
        return { montype: i, mgender: mgend };
    }
    return { montype: NON_PM, mgender: NEUTRAL };
}

// C ref: sp_lev.c get_table_montype(). The species and gender of the `id`
// field through find_montype(). An absent field answers NON_PM and NEUTRAL,
// the value the C caller's gender variable already holds. The `id` may be
// a species index with `parsedGender`, as find_montype() describes.
export function get_table_montype(table, env) {
    const s = Number.isInteger(table.id)
        ? table.id : get_table_str_opt(table, 'id', null);
    if (s != null) {
        const found = find_montype(s, env, table.parsedGender ?? NEUTRAL);
        if (found.montype === NON_PM) throw new Error('Unknown monster id');
        return found;
    }
    return { montype: NON_PM, mgender: NEUTRAL };
}

// C ref: sp_lev.c get_table_xy_or_coord(). The x and y of a table that
// gives either x= and y= or coord=; -1 for an axis it omits. The result is
// absolute rather than map-relative; the caller decides how to interpret it.
export function get_table_xy_or_coord(table) {
    let mx = get_table_int_opt(table, 'x', -1);
    let my = get_table_int_opt(table, 'y', -1);

    if (mx === -1 && my === -1) {
        const c = { x: mx, y: my };
        get_coord(table.coord, c);
        mx = c.x;
        my = c.y;
    }
    return { x: mx, y: my };
}

// C ref: sp_lev.c lspo_monster(). `args` holds the des.monster() arguments
// in Lua order and `croom` is gc.coder->croom; the themed-room fills pass
// their room the way their Lua contents functions call des.monster().
// Fills the C `monster` descriptor, creates the monster, and runs a custom
// inventory callback. The port stores `class` as the class index
// def_char_to_monclass() returns rather than the class character.
export function lspo_monster(args, croom, rawEnv = {}) {
    const env = {
        ...rawEnv,
        state: rawEnv.state ?? game,
        random: rawEnv.random ?? SOURCE_THEMEROOM_RANDOM,
        spObjectContext: rawEnv.spObjectContext
            ?? new_sp_lev_object_context(),
    };
    const { state } = env;
    const argc = args.length;
    const tmpmons = {
        id: NON_PM,
        class: -1,
        coord: 0,
        x: -1,
        y: -1,
        peaceful: -1,
        asleep: -1,
        name: null,
        appear: 0,
        appear_as: null,
        sp_amask: AM_SPLEV_RANDOM,
        female: 0,
        invis: 0,
        cancelled: 0,
        revived: 0,
        avenge: 0,
        fleeing: 0,
        blinded: 0,
        paralyzed: 0,
        stunned: 0,
        confused: 0,
        seentraps: 0,
        has_invent: DEFAULT_INVENT,
        waiting: 0,
        mm_flags: NO_MM_FLAGS,
        m_lev_adj: 0,
    };
    let mx = -1;
    let my = -1;
    let mgend = NEUTRAL;
    let inventory = null;

    // The C repeats this reading of the string argument in each of its
    // three positional forms.
    const readParamstr = (paramstr) => {
        if (paramstr.length === 1) {
            tmpmons.class = def_char_to_monclass(paramstr);
            tmpmons.id = NON_PM;
        } else {
            tmpmons.class = -1;
            ({ montype: tmpmons.id, mgender: mgend }
                = find_montype(paramstr, env));
            tmpmons.female = (mgend === FEMALE) ? FEMALE
                : (mgend === MALE) ? MALE : env.random.rn2(2);
        }
    };

    if (argc === 1 && typeof args[0] === 'string') {
        readParamstr(luaL_checkstring(args[0]));
    } else if (argc === 2 && typeof args[0] === 'string'
               && args[1] != null && typeof args[1] === 'object') {
        const paramstr = luaL_checkstring(args[0]);
        const c = { x: mx, y: my };
        get_coord(args[1], c);
        mx = c.x;
        my = c.y;
        readParamstr(paramstr);
    } else if (argc === 3) {
        const paramstr = luaL_checkstring(args[0]);
        mx = luaL_checkinteger(args[1]);
        my = luaL_checkinteger(args[2]);
        readParamstr(paramstr);
    } else {
        let keep_default_invent = -1; /* -1 = unspecified */
        const table = lcheck_param_table(args);

        tmpmons.peaceful = get_table_boolean_opt(table, 'peaceful', BOOL_RANDOM);
        tmpmons.asleep = get_table_boolean_opt(table, 'asleep', BOOL_RANDOM);
        tmpmons.name = get_table_str_opt(table, 'name', null);
        tmpmons.appear = 0;
        tmpmons.appear_as = null;
        tmpmons.sp_amask = get_table_align(table);
        tmpmons.female = get_table_boolean_opt(table, 'female', BOOL_RANDOM);
        tmpmons.invis = get_table_boolean_opt(table, 'invisible', 0);
        tmpmons.cancelled = get_table_boolean_opt(table, 'cancelled', 0);
        tmpmons.revived = get_table_boolean_opt(table, 'revived', 0);
        tmpmons.avenge = get_table_boolean_opt(table, 'avenge', 0);
        tmpmons.fleeing = get_table_int_opt(table, 'fleeing', 0);
        tmpmons.blinded = get_table_int_opt(table, 'blinded', 0);
        tmpmons.paralyzed = get_table_int_opt(table, 'paralyzed', 0);
        tmpmons.stunned = get_table_boolean_opt(table, 'stunned', 0);
        tmpmons.confused = get_table_boolean_opt(table, 'confused', 0);
        tmpmons.waiting = get_table_boolean_opt(table, 'waiting', 0);
        tmpmons.m_lev_adj = get_table_int_opt(table, 'm_lev_adj', 0);
        tmpmons.seentraps = 0; /* TODO: list of trap names to bitfield */
        keep_default_invent
            = get_table_boolean_opt(table, 'keep_default_invent', -1);

        if (!get_table_boolean_opt(table, 'tail', 1))
            tmpmons.mm_flags |= MM_NOTAIL;
        if (!get_table_boolean_opt(table, 'group', 1))
            tmpmons.mm_flags |= MM_NOGRP;
        if (get_table_boolean_opt(table, 'adjacentok', 0))
            tmpmons.mm_flags |= MM_ADJACENTOK;
        if (get_table_boolean_opt(table, 'ignorewater', 0))
            tmpmons.mm_flags |= MM_IGNOREWATER;
        if (!get_table_boolean_opt(table, 'countbirth', 1))
            tmpmons.mm_flags |= MM_NOCOUNTBIRTH;

        const mappear = get_table_str_opt(table, 'appear_as', null);
        if (mappear) {
            if (mappear.startsWith('obj:')) {
                tmpmons.appear = M_AP_OBJECT;
            } else if (mappear.startsWith('mon:')) {
                tmpmons.appear = M_AP_MONSTER;
            } else if (mappear.startsWith('ter:')) {
                tmpmons.appear = M_AP_FURNITURE;
            } else {
                throw new Error('Unknown appear_as type');
            }
            tmpmons.appear_as = mappear.slice(4);
        }

        ({ x: mx, y: my } = get_table_xy_or_coord(table));

        ({ montype: tmpmons.id, mgender: mgend }
            = get_table_montype(table, env));
        /* get_table_montype will return a random gender if the species isn't
         * all-male or all-female; if the level designer specified a certain
         * gender, override that random one now, unless it *is* a one-gender
         * species, in which case don't override (don't permit creation of a
         * male nymph or female Nazgul, etc.) */
        if (mgend !== NEUTRAL
            && (tmpmons.female === BOOL_RANDOM
                || is_female(state.mons[tmpmons.id])
                || is_male(state.mons[tmpmons.id])))
            tmpmons.female = mgend;
        /* safety net - if find_montype did not find a gender for this species
         * (should cause a lua error anyway) */
        if (tmpmons.female === BOOL_RANDOM)
            tmpmons.female = 0;

        tmpmons.class = get_table_monclass(table);

        inventory = table.inventory ?? null;
        if (inventory != null) {
            /* overwrite DEFAULT_INVENT - most times inventory is specified,
             * the monster should not get its species' default inventory. Only
             * provide it if explicitly requested. */
            tmpmons.has_invent = CUSTOM_INVENT;
            if (keep_default_invent === 1)
                tmpmons.has_invent |= DEFAULT_INVENT;
        } else {
            /* if keep_default_invent was not specified (-1), keep has_invent
             * as DEFAULT_INVENT and provide the species' default inventory.
             * But if it was explicitly set to false, provide *no* inventory. */
            if (keep_default_invent === 0)
                tmpmons.has_invent = NO_INVENT;
        }
    }

    if (mx === -1 && my === -1)
        tmpmons.coord = SP_COORD_PACK_RANDOM(0);
    else
        tmpmons.coord = SP_COORD_PACK(mx, my);

    // C: tmpmons.class = monsym(&mons[tmpmons.id]), the class character;
    // the port's class index is the species' mlet.
    if (tmpmons.id !== NON_PM && tmpmons.class === -1)
        tmpmons.class = state.mons[tmpmons.id].mlet;

    const mtmp = create_monster(tmpmons, croom, env);

    if ((tmpmons.has_invent & CUSTOM_INVENT)
        && typeof inventory === 'function') {
        const context = env.spObjectContext;
        try {
            inventory(mtmp, env);
        } catch (e) {
            // C has no exception path; keep the shared carrier from leaking
            // into a later descriptor when the callback fails.
            context.inventCarryingMonster = null;
            throw e;
        }
        spo_end_moninvent(context, env);
    }

    return mtmp;
}

// C ref: sp_lev.c get_table_int_or_random(). The field's integer, or
// `rndval` when it is absent or "random".
export function get_table_int_or_random(table, name, rndval) {
    const value = table[name];
    if (value == null) return rndval;
    if (typeof value !== 'number') {
        const tmp = typeof value === 'string' ? value : null;

        if (tmp && lcase(tmp) === 'random') return rndval;
        throw new Error(
            `Expected integer or "random" for "${name}", got `
            + (tmp ? `"${tmp}"` : '<Null>'),
        );
    }
    return luaL_checkinteger(value);
}

// C ref: sp_lev.c get_table_buc(). The curse state create_object() applies:
// 0 random, 1 blessed, 2 uncursed, 3 cursed, 4 not-cursed, 5 not-uncursed,
// 6 not-blessed.
export function get_table_buc(table) {
    const bucs = [
        'random', 'blessed', 'uncursed', 'cursed',
        'not-cursed', 'not-uncursed', 'not-blessed',
    ];
    const bucs2i = [0, 1, 2, 3, 4, 5, 6, 0];
    const curse_state = bucs2i[get_table_option(table, 'buc', 'random', bucs)];

    return curse_state;
}

// C ref: sp_lev.c get_table_objclass(). The class of a one-character
// `class` field, or -1. As with get_table_monclass(), this port stores the
// class index def_char_to_objclass() returns, which its loaders also pass
// directly, where the C keeps the character.
export function get_table_objclass(table) {
    if (Number.isInteger(table.class)) return table.class;
    const s = get_table_str_opt(table, 'class', null);
    let ret = -1;
    if (s && s.length === 1) ret = def_char_to_objclass(s);
    return ret;
}

// C ref: sp_lev.c find_objtype(). The object type named by `s`, matched
// first by name (within `oclass` when given, or the class a "ring of "-style
// prefix implies) and then by description. `oclass` is the class index the
// C would derive from its class character; MAXOCLASSES or a negative value
// means any class.
export function find_objtype(s, oclass, state = game) {
    if (s) {
        const objects = getObjects(state);
        let objname;
        let cls = oclass;

        /* In objects.h, some item classes are defined without prefixes
           (such as "scroll of ") in their names, making some names (such
           as "teleportation") ambiguous.  Get the object class if it is
           specified, and only return an object of the matching class. */
        const class_prefixes = [
            ['ring of ', RING_CLASS],
            ['potion of ', POTION_CLASS],
            ['scroll of ', SCROLL_CLASS],
            ['spellbook of ', SPBOOK_CLASS],
            ['wand of ', WAND_CLASS],
        ];

        if (cls === MAXOCLASSES || cls < 0)
            cls = 0;

        if (strstri(s, ' of ') >= 0) {
            for (const [p, pclass] of class_prefixes) {
                if (lcase(s).startsWith(p)) {
                    cls = pclass;
                    s = s.slice(p.length);
                    break;
                }
            }
        }

        /* find by object name */
        for (let i = 0; i < NUM_OBJECTS; i++) {
            objname = OBJ_NAME(objects[i], state);
            if ((!cls || cls === objects[i].oc_class)
                && objname && lcase(s) === lcase(objname))
                return i;
        }

        /*
         * FIXME:
         *  If the file specifies "orange potion", the actual object
         *  description is just "orange" and won't match.  [There's a
         *  reason that wish handling is insanely complicated.]  And
         *  even if that gets fixed, if the file specifies "gray stone"
         *  it will start matching but would always pick the first one.
         *
         *  "orange potion" is an unlikely thing to have in a special
         *  level description but "gray stone" is not....
         */

        /* find by object description */
        for (let i = 0; i < NUM_OBJECTS; i++) {
            objname = OBJ_DESCR(objects[i], state);
            if (objname && lcase(s) === lcase(objname))
                return i;
        }

        throw new Error('Unknown object id');
    }
    return STRANGE_OBJECT;
}

// C ref: sp_lev.c get_table_objtype(). The object type of the `id` field
// through find_objtype(), restricted to the `class` field's class. The
// port's loaders may give `id` as the object type index instead.
export function get_table_objtype(table, state = game) {
    if (Number.isInteger(table.id)) return table.id;
    const s = get_table_str_opt(table, 'id', null);
    const oclass = get_table_objclass(table);
    const ret = find_objtype(s, oclass, state);

    return ret;
}

// C ref: sp_lev.c lspo_level_flags(). Each argument names a level flag;
// the names compare case-insensitively.
export function lspo_level_flags(args, env) {
    const { state, coder, frame } = env;
    const flags = state.level.flags;

    if (args.length < 1) throw new Error('expected string params');

    for (const arg of args) {
        const s = luaL_checkstring(arg);

        switch (lcase(s)) {
        case 'noteleport': flags.noteleport = true; break;
        case 'hardfloor': flags.hardfloor = true; break;
        case 'nommap': flags.nommap = true; break;
        case 'shortsighted': flags.shortsighted = true; break;
        case 'arboreal': flags.arboreal = true; break;
        case 'mazelevel': flags.is_maze_lev = true; break;
        case 'shroud': flags.hero_memory = true; break;
        case 'graveyard': flags.graveyard = true; break;
        case 'icedpools': frame.icedpools = true; break;
        case 'corrmaze': flags.corrmaze = true; break;
        case 'premapped': coder.premapped = true; break;
        case 'solidify': coder.solidify = true; break;
        case 'sokoban': flags.sokoban_rules = true; break; /* C: Sokoban */
        case 'inaccessibles': coder.check_inaccessibles = true; break;
        case 'noflipx': coder.allow_flips &= ~2; break;
        case 'noflipy': coder.allow_flips &= ~1; break;
        case 'noflip': coder.allow_flips = 0; break;
        case 'temperate': flags.temperature = 0; break;
        case 'hot': flags.temperature = 1; break;
        case 'cold': flags.temperature = -1; break;
        case 'nomongen': flags.rndmongen = false; break;
        case 'nodeathdrops': flags.deathdrops = false; break;
        case 'noautosearch': flags.noautosearch = true; break;
        case 'fumaroles': flags.fumaroles = true; break;
        case 'stormy': flags.stormy = true; break;
        default:
            throw new Error(`Unknown level flag ${s}`);
        }
    }
}

// C ref: sp_lev.c lspo_level_init(). Reads the style table into a lev_init
// record and hands it to splev_initlev().
export function lspo_level_init(args, env) {
    const { state, coder, frame } = env;
    const initstyles = [
        'solidfill', 'mazegrid', 'maze', 'rogue', 'mines', 'swamp',
    ];
    const initstyles2i = [
        LVLINIT_SOLIDFILL, LVLINIT_MAZEGRID, LVLINIT_MAZE, LVLINIT_ROGUE,
        LVLINIT_MINES, LVLINIT_SWAMP, 0,
    ];
    const init_lev = {};

    const table = lcheck_param_table(args);

    frame.splev_init_present = true;

    init_lev.init_style
        = initstyles2i[get_table_option(table, 'style', 'solidfill', initstyles)];
    init_lev.fg = get_table_mapchr_opt(table, 'fg', ROOM);
    init_lev.bg = get_table_mapchr_opt(table, 'bg', INVALID_TYPE);
    init_lev.smoothed = get_table_boolean_opt(table, 'smoothed', 0);
    init_lev.joined = get_table_boolean_opt(table, 'joined', 0);
    init_lev.lit = get_table_boolean_opt(table, 'lit', BOOL_RANDOM);
    init_lev.walled = get_table_boolean_opt(table, 'walled', 0);
    init_lev.filling = get_table_mapchr_opt(table, 'filling', init_lev.fg);
    init_lev.corrwid = get_table_int_opt(table, 'corrwid', -1);
    init_lev.wallthick = get_table_int_opt(table, 'wallthick', -1);
    init_lev.rm_deadends = !get_table_boolean_opt(table, 'deadends', 1);

    coder.lvl_is_joined = init_lev.joined;

    if (init_lev.bg === INVALID_TYPE)
        init_lev.bg = (init_lev.init_style === LVLINIT_SWAMP) ? MOAT : STONE;

    splev_initlev(init_lev, frame, state);
}

// C ref: sp_lev.c lspo_engraving(). Forms: engraving({ x, y, type, text })
// or engraving({ coord, type, text }), and engraving({x, y}, type, text).
// A square that is absent or -1,-1 is chosen at random.
export function lspo_engraving(args, env) {
    const { state, coder } = env;
    const engrtypes = ['dust', 'engrave', 'burn', 'mark', 'blood'];
    const engrtypes2i = [DUST, ENGRAVE, BURN, MARK, ENGR_BLOOD, 0];
    let etyp = DUST;
    let txt = null;
    let ecoord;
    let x = -1;
    let y = -1;
    const argc = args.length;
    let guardobjs = 0;
    let wipeout = 1;

    if (argc === 1) {
        const table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        etyp = engrtypes2i[get_table_option(table, 'type', 'engrave', engrtypes)];
        txt = get_table_str(table, 'text');
        wipeout = get_table_boolean_opt(table, 'degrade', 1);
        guardobjs = get_table_boolean_opt(table, 'guardobjects', 0);
    } else if (argc === 3) {
        const c = { x, y };
        get_coord(args[0], c);
        x = c.x;
        y = c.y;
        etyp = engrtypes2i[luaL_checkoption(args[1], 'engrave', engrtypes)];
        txt = luaL_checkstring(args[2]);
    } else {
        throw new Error('Wrong parameters');
    }

    if (x === -1 && y === -1)
        ecoord = SP_COORD_PACK_RANDOM(0);
    else
        ecoord = SP_COORD_PACK(x, y);

    const c = { x, y };
    get_location_coord(c, DRY, coder.croom, ecoord, env);
    make_engr_at(c.x, c.y, txt, null, 0, etyp, env);
    const ep = engr_at(c.x, c.y, state);
    if (ep) {
        ep.guardobjects = Boolean(guardobjs);
        ep.nowipeout = !wipeout;
    }
}

// C ref: sp_lev.c lspo_mineralize(). Seeds the level's rock with gold, gems,
// and kelp at the table's probabilities, skipping mklev.c's level checks.
export function lspo_mineralize(args, env) {
    const table = lcheck_param_table(args);
    /* -1 produces default mineralize behavior */
    const gem_prob = get_table_int_opt(table, 'gem_prob', -1);
    const gold_prob = get_table_int_opt(table, 'gold_prob', -1);
    const kelp_moat = get_table_int_opt(table, 'kelp_moat', -1);
    const kelp_pool = get_table_int_opt(table, 'kelp_pool', -1);

    mineralize(kelp_pool, kelp_moat, gold_prob, gem_prob, true,
               { state: env.state });
}

// C ref: sp_lev.c get_table_roomtype_opt(). The room type the field names
// in room_types[], compared case-insensitively; `defval` when the field is
// absent, empty, or unknown (the C reports an unknown name through
// impossible()).
export function get_table_roomtype_opt(table, name, defval, env = {}) {
    const roomstr = get_table_str_opt(table, name, '');
    let res = defval;

    if (roomstr) {
        const found = room_types.find(
            ([rname]) => lcase(rname) === lcase(roomstr),
        );
        if (found)
            res = found[1];
        else if (typeof env.hooks?.impossible === 'function')
            env.hooks.impossible(`Unknown room type '${roomstr}'`, env);
    }
    return res;
}

// C ref: sp_lev.c get_table_intarray_entry(). Entry `entrynum`, counted
// from 1 as Lua does, of an array table; it must be a number. The C names
// entry #1 in its error whatever the entry asked for.
export function get_table_intarray_entry(table, entrynum) {
    const value = table[entrynum - 1];
    if (typeof value === 'number')
        return Number.isInteger(value) ? value : 0;
    throw new Error(
        `Array entry #1 is ${luaL_typename(value)}, expected number`,
    );
}

// C ref: sp_lev.c get_table_region(). Reads the four-entry array field
// `name` into `r` as x1, y1, x2, y2. An absent optional field leaves `r`
// untouched; a field that is not a four-entry array is an error. Answers 1
// as the source does on every path it returns from.
export function get_table_region(table, name, r, optional) {
    const value = table[name];
    if (optional && value == null)
        return 1;

    if (value == null || typeof value !== 'object')
        throw new Error(`table expected, got ${luaL_typename(value)}`);

    const arrlen = Array.isArray(value) ? value.length : 0;
    if (arrlen !== 4)
        throw new Error('Not a region');

    r.x1 = get_table_intarray_entry(value, 1);
    r.y1 = get_table_intarray_entry(value, 2);
    r.x2 = get_table_intarray_entry(value, 3);
    r.y2 = get_table_intarray_entry(value, 4);

    return 1;
}

// C ref: sp_lev.c get_coord(). Reads a coordinate table into `c`: either
// x= and y= fields or a two-entry array. A nil value leaves `c` unchanged
// and answers false; any other non-table is an error.
export function get_coord(value, c) {
    let ret = false;

    if (value != null && typeof value === 'object') {
        let gotx = false;

        if (value.x != null) {
            c.x = luaL_checkinteger(value.x);
            gotx = true;
        }

        if (gotx) {
            if (value.y != null) {
                c.y = luaL_checkinteger(value.y);
                ret = true;
            } else {
                throw new Error('Not a coordinate');
            }
        } else {
            const arrlen = Array.isArray(value) ? value.length : 0;
            if (arrlen !== 2)
                throw new Error('Not a coordinate');

            c.x = get_table_intarray_entry(value, 1);
            c.y = get_table_intarray_entry(value, 2);

            return true;
        }
    } else if (value != null) {
        /* non-existent coord is ok */
        throw new Error('non-table coord specified');
    }
    return ret;
}

// A Lua table argument: a des.* call receives tables as objects or arrays.
function isLuaTable(value) {
    return value != null && typeof value === 'object';
}

// C ref: nhlua.c nhl_get_xy_params(). The x and y of a two-integer argument
// list or a single coordinate table; false, leaving `c` alone, for anything
// else. It lives here rather than in nhlua.js because it reads the table
// through sp_lev.c's get_coord().
export function nhl_get_xy_params(args, c) {
    const argc = args.length;
    let ret = false;

    if (argc === 2) {
        c.x = lua_tointeger(args[0]);
        c.y = lua_tointeger(args[1]);
        ret = true;
    } else if (argc === 1 && isLuaTable(args[0])) {
        ret = get_coord(args[0], c);
    }
    return ret;
}

// C ref: sp_lev.c lspo_room(). Reads the room table, builds the room or
// subroom under gc.coder->croom, runs its contents callback with the room
// table, and closes it with spo_endroom(). A failed room, or a room whose
// parent failed, still pushes an entry so that nested contents stay
// balanced. During themed-room generation a failure sets
// gt.themeroom_failed, which the port keeps in state.themeroom_failed.
export function lspo_room(args, env) {
    const { state, coder, frame } = env;

    if (state.in_mk_themerooms && state.themeroom_failed)
        return;

    const table = lcheck_param_table(args);

    if (coder.n_subroom > MAX_NESTED_ROOMS) {
        throw new Error('Too deeply nested rooms?!');
    } else {
        const left_or_right = [
            'left', 'half-left', 'center', 'half-right', 'right',
            'none', 'random',
        ];
        const l_or_r2i = [
            SPLEV_LEFT, SPLEV_H_LEFT, SPLEV_CENTER, SPLEV_H_RIGHT,
            SPLEV_RIGHT, -1, -1, -1,
        ];
        const top_or_bot = ['top', 'center', 'bottom', 'none', 'random'];
        const t_or_b2i = [SPLEV_TOP, SPLEV_CENTER, SPLEV_BOTTOM, -1, -1, -1];
        const tmproom = {};

        const { x: rx, y: ry } = get_table_xy_or_coord(table);
        tmproom.x = rx;
        tmproom.y = ry;
        if ((tmproom.x === -1 || tmproom.y === -1) && tmproom.x !== tmproom.y)
            throw new Error('Room must have both x and y');

        tmproom.w = get_table_int_opt(table, 'w', -1);
        tmproom.h = get_table_int_opt(table, 'h', -1);

        if ((tmproom.w === -1 || tmproom.h === -1) && tmproom.w !== tmproom.h)
            throw new Error('Room must have both w and h');

        tmproom.xalign = l_or_r2i[get_table_option(table, 'xalign', 'random',
                                                   left_or_right)];
        tmproom.yalign = t_or_b2i[get_table_option(table, 'yalign', 'random',
                                                   top_or_bot)];
        tmproom.rtype = get_table_roomtype_opt(table, 'type', OROOM, env);
        tmproom.chance = get_table_int_opt(table, 'chance', 100);
        tmproom.rlit = get_table_int_opt(table, 'lit', -1);
        /* theme rooms default to unfilled */
        tmproom.needfill = get_table_int_opt(table, 'filled',
                                             state.in_mk_themerooms ? 0 : 1);
        tmproom.joined = get_table_boolean_opt(table, 'joined', true);

        if (!coder.failed_room[coder.n_subroom - 1]) {
            const tmpcr = build_room(tmproom, coder.croom,
                                     env.random.rn2, env.random.rnd);
            if (tmpcr) {
                const n = coder.n_subroom;

                coder.tmproomlist[n] = tmpcr; /* TRUE to get here... */
                coder.failed_room[n] = false;
                /* added a subroom, make parent room irregular */
                if (coder.tmproomlist[n - 1])
                    coder.tmproomlist[n - 1].irregular = true;
                coder.n_subroom++;
                update_croom(coder);
                if (typeof table.contents === 'function')
                    table.contents(l_push_mkroom_table(tmpcr));
                spo_endroom(coder, frame, state);
                add_doors_to_room(tmpcr);
                return;
            }
            if (state.in_mk_themerooms)
                state.themeroom_failed = true;
        } /* failed to create parent room, so fail this too */
    }
    coder.tmproomlist[coder.n_subroom] = null;
    coder.failed_room[coder.n_subroom] = true;
    coder.n_subroom++;
    update_croom(coder);
    spo_endroom(coder, frame, state);
    if (state.in_mk_themerooms)
        state.themeroom_failed = true;
}

// C ref: sp_lev.c spo_endroom(). Pops the current room; leaving the
// top-level room restores the whole-map frame when no map set one.
function spo_endroom(coder, frame, state) {
    if (coder.n_subroom > 1) {
        coder.n_subroom--;
        coder.tmproomlist[coder.n_subroom] = null;
        coder.failed_room[coder.n_subroom] = true;
    } else {
        /* no subroom, get out of top-level room */
        /* Need to ensure xstart/ystart/xsize/ysize have something sensible,
           in case there's some stuff to be created outside the outermost
           room, and there's no MAP. */
        if (frame.xsize <= 1 && frame.ysize <= 1)
            reset_xystart_size(frame, state);
    }
    update_croom(coder);
}

// C ref: sp_lev.c l_create_stairway(), shared by lspo_stair() and
// lspo_ladder(). Takes a table with dir and x/y or coord, or a direction
// string followed by the coordinate forms nhl_get_xy_params() reads. A
// random square is chosen under good_stair_loc(); any trap there is
// removed, and the square is marked in SpLev_Map.
function l_create_stairway(args, using_ladder, env) {
    const { state, coder, frame } = env;
    const stairdirs = ['down', 'up'];
    const stairdirs2i = [0, 1];
    const argc = args.length;
    let x = -1, y = -1;
    let up = 0; /* default is down */

    if (argc === 1 && isLuaTable(args[0])) {
        const table = lcheck_param_table(args);
        const a = get_table_xy_or_coord(table);
        up = stairdirs2i[get_table_option(table, 'dir', 'down', stairdirs)];
        x = a.x;
        y = a.y;
    } else {
        const c = { x: -1, y: -1 };
        let rest = args;
        if (argc > 0 && typeof args[0] === 'string') {
            up = stairdirs2i[luaL_checkoption(args[0], 'down', stairdirs)];
            rest = args.slice(1);
        }
        nhl_get_xy_params(rest, c);
        x = c.x;
        y = c.y;
    }

    let scoord;
    if (x === -1 && y === -1) {
        set_ok_location_func(good_stair_loc);
        scoord = SP_COORD_PACK_RANDOM(0);
    } else
        scoord = SP_COORD_PACK(x, y);

    const c = { x, y };
    get_location_coord(c, DRY, coder.croom, scoord, { frame, state });
    set_ok_location_func(null);
    ({ x, y } = c);
    const badtrap = t_at(x, y, state);
    if (badtrap)
        deltrap(badtrap, state);
    frame.splevMap[x][y] = 1;

    if (using_ladder) {
        const loc = state.level.at(x, y);
        loc.typ = LADDER;
        if (up) {
            const dest = {
                dnum: state.u.uz.dnum,
                dlevel: state.u.uz.dlevel - 1,
            };
            stairway_add(x, y, true, true, dest);
            loc.ladder = LA_UP;
        } else {
            const dest = {
                dnum: state.u.uz.dnum,
                dlevel: state.u.uz.dlevel + 1,
            };
            stairway_add(x, y, false, true, dest);
            loc.ladder = LA_DOWN;
        }
    } else {
        // C passes a fifth argument, !(scoord & SP_COORD_IS_RANDOM);
        // mklev.js mkstairs() does not take it.
        mkstairs(x, y, up, coder.croom);
    }
}

// C ref: sp_lev.c lspo_stair().
export function lspo_stair(args, env) {
    return l_create_stairway(args, false, env);
}

// C ref: sp_lev.c lspo_ladder().
export function lspo_ladder(args, env) {
    return l_create_stairway(args, true, env);
}

// C ref: sp_lev.c lspo_grave(). grave(), grave(x, y, "text"), and the
// table form with x/y or coord and an optional text. A random square is a
// DRY one; a square without a trap becomes a grave through make_grave(),
// which composes an epitaph when the text is absent.
export function lspo_grave(args, env) {
    const { state, coder, frame } = env;
    const argc = args.length;
    let x, y, ax, ay, txt;

    if (argc === 3) {
        x = ax = luaL_checkinteger(args[0]);
        y = ay = luaL_checkinteger(args[1]);
        txt = luaL_checkstring(args[2]);
    } else {
        const table = lcheck_param_table(args);

        ({ x: ax, y: ay } = get_table_xy_or_coord(table));
        x = ax;
        y = ay;
        txt = get_table_str_opt(table, 'text', null);
    }

    let scoord;
    if (x === -1 && y === -1)
        scoord = SP_COORD_PACK_RANDOM(0);
    else
        scoord = SP_COORD_PACK(ax, ay);

    const c = { x, y };
    get_location_coord(c, DRY, coder.croom, scoord, { frame, state });
    ({ x, y } = c);

    if (isok(x, y) && !t_at(x, y, state)) {
        state.level.at(x, y).typ = GRAVE;
        make_grave(x, y, txt, env); /* note: 'txt' might be Null */
    }
}

// C ref: sp_lev.c lspo_altar(). Reads x/y or coord, the alignment through
// get_table_align(), and the shrine kind, then calls create_altar().
export function lspo_altar(args, env) {
    const { coder, frame } = env;
    const shrines = ['altar', 'shrine', 'sanctum'];
    const shrines2i = [0, 1, 2, 0];

    const table = lcheck_param_table(args);

    const { x, y } = get_table_xy_or_coord(table);

    const al = get_table_align(table);
    const shrine = shrines2i[get_table_option(table, 'type', 'altar', shrines)];

    let acoord;
    if (x === -1 && y === -1)
        acoord = SP_COORD_PACK_RANDOM(0);
    else
        acoord = SP_COORD_PACK(x, y);

    const tmpaltar = { coord: acoord, sp_amask: al, shrine };

    create_altar(tmpaltar, coder.croom, frame, env);
}

// C ref: sp_lev.c trap_types[]. The Lua trap names in the source's order;
// "random" stands for a random trap type (-1).
const trap_types = Object.freeze([
    ['arrow', ARROW_TRAP],
    ['dart', DART_TRAP],
    ['falling rock', ROCKTRAP],
    ['board', SQKY_BOARD],
    ['bear', BEAR_TRAP],
    ['land mine', LANDMINE],
    ['rolling boulder', ROLLING_BOULDER_TRAP],
    ['sleep gas', SLP_GAS_TRAP],
    ['rust', RUST_TRAP],
    ['fire', FIRE_TRAP],
    ['pit', PIT],
    ['spiked pit', SPIKED_PIT],
    ['hole', HOLE],
    ['trap door', TRAPDOOR],
    ['teleport', TELEP_TRAP],
    ['level teleport', LEVEL_TELEP],
    ['magic portal', MAGIC_PORTAL],
    ['web', WEB],
    ['statue', STATUE_TRAP],
    ['magic', MAGIC_TRAP],
    ['anti magic', ANTI_MAGIC],
    ['polymorph', POLY_TRAP],
    ['vibrating square', VIBRATING_SQUARE],
    ['random', -1],
]);

// C ref: sp_lev.c get_table_traptype_opt(). The trap type of an optional
// name field, compared case-insensitively; `defval` when the field is
// absent, empty, or not a trap name.
export function get_table_traptype_opt(table, name, defval) {
    const trapstr = get_table_str_opt(table, name, '');
    let res = defval;

    if (trapstr) {
        for (const [trapname, type] of trap_types)
            if (lcase(trapstr) === trapname) {
                res = type;
                break;
            }
    }
    return res;
}

// C ref: sp_lev.c get_trapname_bytype(). The Lua name of a trap type, or
// null for a type the table lacks (NO_TRAP among them).
export function get_trapname_bytype(ttyp) {
    for (const [trapname, type] of trap_types)
        if (ttyp === type)
            return trapname;

    return null;
}

// C ref: sp_lev.c get_traptype_byname(). The trap type of a Lua trap name,
// compared case-insensitively; NO_TRAP for an unknown name.
export function get_traptype_byname(trapname) {
    for (const [name, type] of trap_types)
        if (lcase(trapname) === name)
            return type;

    return NO_TRAP;
}

// C ref: sp_lev.c lspo_trap(). trap(), trap("name"), trap("name", {x, y}),
// trap("name", x, y), and the table form with type, x/y or coord,
// spider_on_web, seen, victim, launchfrom, and teledest. Fills the spltrap
// descriptor and hands it to create_trap(); gl.launchplace (the port's
// state.launchplace) holds the launch or teleport square meanwhile and is
// cleared afterwards.
export function lspo_trap(args, env) {
    const { state, coder, frame } = env;
    const tmptrap = {
        spider_on_web: true,
        seen: false,
        novictim: false,
    };
    let x, y;
    const argc = args.length;

    if (argc === 1 && typeof args[0] === 'string') {
        const trapstr = luaL_checkstring(args[0]);

        tmptrap.type = get_traptype_byname(trapstr);
        x = y = -1;
    } else if (argc === 2 && typeof args[0] === 'string'
               && isLuaTable(args[1])) {
        const trapstr = luaL_checkstring(args[0]);

        tmptrap.type = get_traptype_byname(trapstr);
        const c = { x: -1, y: -1 };
        get_coord(args[1], c);
        ({ x, y } = c);
    } else if (argc === 3) {
        const trapstr = luaL_checkstring(args[0]);

        tmptrap.type = get_traptype_byname(trapstr);
        x = luaL_checkinteger(args[1]);
        y = luaL_checkinteger(args[2]);
    } else {
        const table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        tmptrap.type = get_table_traptype_opt(table, 'type', -1);
        tmptrap.spider_on_web = get_table_boolean_opt(table, 'spider_on_web',
                                                      1);
        tmptrap.seen = get_table_boolean_opt(table, 'seen', false);
        tmptrap.novictim = !get_table_boolean_opt(table, 'victim', true);

        if (isLuaTable(table.launchfrom)) {
            const l = { x: -1, y: -1 };

            get_coord(table.launchfrom, l);
            state.launchplace = { x: l.x, y: l.y };
        }

        if (isLuaTable(table.teledest)) {
            const l = { x: -1, y: -1 };

            get_coord(table.teledest, l);
            state.launchplace = { x: l.x, y: l.y };
        }
    }

    if (tmptrap.type === NO_TRAP)
        throw new Error('Unknown trap type');

    if (x === -1 && y === -1)
        tmptrap.coord = SP_COORD_PACK_RANDOM(0);
    else
        tmptrap.coord = SP_COORD_PACK(x, y);

    create_trap(tmptrap, coder.croom, frame, env);
    state.launchplace = { x: 0, y: 0 };
}

// C ref: sp_lev.c lspo_gold(). gold(amount, x, y), gold(amount, {x, y}),
// the table form with amount and x/y or coord, and gold(). A random square
// is a DRY one; a negative or absent amount becomes rnd(200).
export function lspo_gold(args, env) {
    const { state, coder, frame } = env;
    const argc = args.length;
    let x, y;
    let amount;
    let gldx, gldy;

    if (argc === 3) {
        amount = luaL_checkinteger(args[0]);
        x = gldx = luaL_checkinteger(args[1]);
        y = gldy = luaL_checkinteger(args[2]);
    } else if (argc === 2 && isLuaTable(args[1])) {
        amount = luaL_checkinteger(args[0]);
        const c = { x: -1, y: -1 };
        get_coord(args[1], c);
        gldx = c.x;
        gldy = c.y;
        x = gldx;
        y = gldy;
    } else if (argc === 0 || (argc === 1 && isLuaTable(args[0]))) {
        const table = lcheck_param_table(args);

        amount = get_table_int_opt(table, 'amount', -1);
        ({ x: gldx, y: gldy } = get_table_xy_or_coord(table));
        x = gldx;
        y = gldy;
    } else {
        throw new Error('Wrong parameters');
    }

    let gcoord;
    if (x === -1 && y === -1)
        gcoord = SP_COORD_PACK_RANDOM(0);
    else
        gcoord = SP_COORD_PACK(gldx, gldy);

    const c = { x, y };
    get_location_coord(c, DRY, coder.croom, gcoord, { frame, state });
    if (amount < 0)
        amount = env.random.rnd(200);
    mkgold(amount, c.x, c.y, env);
}

// C ref: sp_lev.c lspo_corridor(). A corridor between the given doors of
// two rooms; each wall defaults to "all", which create_corridor() rejects.
export function lspo_corridor(args, env) {
    const { state } = env;
    const walldirs = ['all', 'random', 'north', 'west', 'east', 'south'];
    const walldirs2i = [W_ANY, W_RANDOM, W_NORTH, W_WEST, W_EAST, W_SOUTH, 0];

    const table = lcheck_param_table(args);

    const tc = {
        src: {
            room: get_table_int(table, 'srcroom'),
            door: get_table_int(table, 'srcdoor'),
            wall: walldirs2i[get_table_option(table, 'srcwall', 'all',
                                              walldirs)],
        },
        dest: {
            room: get_table_int(table, 'destroom'),
            door: get_table_int(table, 'destdoor'),
            wall: walldirs2i[get_table_option(table, 'destwall', 'all',
                                              walldirs)],
        },
    };

    create_corridor(tc, state);
}

// C ref: sp_lev.c lspo_random_corridors(). A corridor descriptor with every
// field -1 asks create_corridor() for makecorridors().
export function lspo_random_corridors(args, env) {
    const { state } = env;
    const tc = {
        src: { room: -1, door: -1, wall: -1 },
        dest: { room: -1, door: -1, wall: -1 },
    };

    create_corridor(tc, state);
}

// C ref: sp_lev.c random_wdir(). Choose a single random W_* direction.
// selvar.c selection_do_grow() (ThemeroomSelection.grow() in
// themerooms.js) makes the same draw inline, since that module cannot
// import this one.
export function random_wdir() {
    const wdirs = [W_NORTH, W_SOUTH, W_EAST, W_WEST];
    return wdirs[rn2(4)];
}

// C ref: sp_lev.c floodfillchk_match_under_typ, the file-scope terrain type
// that set_floodfillchk_match_under() stores for floodfillchk_match_under().
let floodfillchk_match_under_typ = STONE;

// C ref: sp_lev.c floodfillchk_match_under(). The selection flood check
// that accepts squares of the stored terrain type.
export function floodfillchk_match_under(x, y, state = game) {
    return (floodfillchk_match_under_typ === state.level.at(x, y).typ);
}

// C ref: sp_lev.c set_floodfillchk_match_under(). Stores the terrain type
// and installs floodfillchk_match_under() as selvar.c's flood check.
export function set_floodfillchk_match_under(typ) {
    floodfillchk_match_under_typ = typ;
    set_selection_floodfillchk(floodfillchk_match_under);
}

// C ref: sp_lev.c floodfillchk_match_accessible(). The flood check
// ensure_way_out() uses: any accessible square, secret door, or secret
// corridor.
export function floodfillchk_match_accessible(x, y, state = game) {
    const typ = state.level.at(x, y).typ;
    return (ACCESSIBLE(typ) || typ === SDOOR || typ === SCORR);
}

// C ref: sp_lev.c sel_set_feature(). Sets a square's terrain to the feature
// type unless the square is off the map or already holds furniture.
function sel_set_feature(x, y, typ, state = game) {
    if (!isok(x, y))
        return;
    const loc = state.level.at(x, y);
    if (IS_FURNITURE(loc.typ))
        return;
    loc.typ = typ;
}

// C ref: sp_lev.c sel_set_door(). Makes the square a door or secret door
// when it is neither, strips the D_SECRET bit from the state (a secret
// door is at least closed), orients it, and marks it in SpLev_Map.
function sel_set_door(dx, dy, typ, frame, state = game) {
    const x = dx, y = dy;
    const loc = state.level.at(x, y);

    if (!IS_DOOR(loc.typ) && loc.typ !== SDOOR)
        loc.typ = (typ & D_SECRET) ? SDOOR : DOOR;
    if (typ & D_SECRET) {
        typ &= ~D_SECRET;
        if (typ < D_CLOSED)
            typ = D_CLOSED;
    }
    set_door_orientation(x, y, state); /* set/clear levl[x][y].horizontal */
    loc.doormask = typ;
    frame.splevMap[x][y] = 1;
}

// C ref: sp_lev.c lspo_door(). door("state", x, y) or the table form with
// state and either x/y or coord, or wall and pos. A random state draws
// rnddoor() before the branch, so the wall form spends that draw and then
// lets create_door() choose again; a square form resolves the coordinate
// through get_location_coord() and writes it with sel_set_door().
export function lspo_door(args, env) {
    const { state, coder, frame } = env;
    const doorstates = [
        'random', 'open', 'closed', 'locked', 'nodoor', 'broken', 'secret',
    ];
    const doorstates2i = [
        -1, D_ISOPEN, D_CLOSED, D_LOCKED, D_NODOOR, D_BROKEN, D_SECRET,
    ];
    let msk;
    let x, y;
    const argc = args.length;

    if (argc === 3) {
        msk = doorstates2i[luaL_checkoption(args[0], 'random', doorstates)];
        x = luaL_checkinteger(args[1]);
        y = luaL_checkinteger(args[2]);
    } else {
        const table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        msk = doorstates2i[get_table_option(table, 'state', 'random',
                                            doorstates)];
    }

    const typ = (msk === -1) ? rnddoor(env.random.rn2) : msk;

    if (x === -1 && y === -1) {
        const walldirs = ['all', 'random', 'north', 'west', 'east', 'south'];
        /* Note that "random" is also W_ANY, because create_door just wants a
         * mask of acceptable walls */
        const walldirs2i = [W_ANY, W_ANY, W_NORTH, W_WEST, W_EAST, W_SOUTH, 0];
        // C reads pos and wall from the table at the top of the Lua stack,
        // which the positional form does not leave there.
        const table = lcheck_param_table(args);
        const tmpd = {
            secret: (typ === D_SECRET) ? 1 : 0,
            mask: msk,
            pos: get_table_int_opt(table, 'pos', -1),
            wall: walldirs2i[get_table_option(table, 'wall', 'all',
                                              walldirs)],
        };

        create_door(tmpd, coder.croom, env.random.rn2);
    } else {
        const c = { x, y };
        get_location_coord(c, ANY_LOC, coder.croom, SP_COORD_PACK(x, y),
                           { frame, state });
        if (!isok(c.x, c.y))
            throw new Error('door coord not ok');
        sel_set_door(c.x, c.y, typ, frame, state);
    }
}

// C ref: sp_lev.c l_table_getset_feature_flag(). Sets or clears one flag
// bit of a feature square from an optional boolean field. Its caller,
// lspo_feature(), is not ported yet.
export function l_table_getset_feature_flag(table, x, y, name, flag, env) {
    let val = get_table_boolean_opt(table, name, -2);

    if (val !== -2) {
        if (val === -1)
            val = env.random.rn2(2);
        const loc = env.state.level.at(x, y);
        if (val)
            loc.flags |= flag;
        else
            loc.flags &= ~flag;
    }
}

// C ref: sp_lev.c cvt_to_abscoord(). Converts a coordinate relative to the
// current room, or otherwise to the map frame, into an absolute one. Unlike
// get_location(), it accepts negative input. `env.coder` is gc.coder and
// `env.frame` holds gx.xstart/gy.ystart.
export function cvt_to_abscoord(c, env) {
    if (env.coder && env.coder.croom) {
        c.x += env.coder.croom.lx;
        c.y += env.coder.croom.ly;
    } else {
        c.x += env.frame.xstart;
        c.y += env.frame.ystart;
    }
}

// C ref: sp_lev.c cvt_to_relcoord(). The inverse of cvt_to_abscoord().
export function cvt_to_relcoord(c, env) {
    if (env.coder && env.coder.croom) {
        c.x -= env.coder.croom.lx;
        c.y -= env.coder.croom.ly;
    } else {
        c.x -= env.frame.xstart;
        c.y -= env.frame.ystart;
    }
}

// C ref: sp_lev.c nhl_abs_coord(), nhlua.c's nh.abscoord(). Two integers
// answer [x, y]; a table with x and y answers {x, y}. This port has no nh
// table, so nothing calls it yet.
export function nhl_abs_coord(args, env) {
    const argc = args.length;
    const c = { x: -1, y: -1 };

    if (argc === 2) {
        c.x = lua_tointeger(args[0]);
        c.y = lua_tointeger(args[1]);
        cvt_to_abscoord(c, env);
        return [c.x, c.y];
    } else if (argc === 1 && isLuaTable(args[0])) {
        c.x = get_table_int(args[0], 'x');
        c.y = get_table_int(args[0], 'y');
        cvt_to_abscoord(c, env);
        return { x: c.x, y: c.y };
    }
    throw new Error('nhl_abs_coord: Wrong args');
}

// C ref: nhlsel.c l_selection_check(), which answers the selection a des.*
// argument holds or raises "Selection error". C selections hold map
// coordinates; this port's relative selections hold Lua-relative ones (see
// ThemeroomSelection.absolute in themerooms.js), so a relative one is
// answered as a copy shifted to the map frame, the conversion sp_lev.c
// get_location() makes when a relative coordinate is used. Squares that
// leave the map are dropped, as selection_setpoint() drops them.
function l_selection_check(value, frame) {
    if (!(value instanceof ThemeroomSelection))
        throw new Error('Selection error');
    if (value.absolute)
        return value;
    const sel = new ThemeroomSelection(null, true);
    const b = value.bounds();
    for (let x = b.lx; x <= b.hx; ++x)
        for (let y = b.ly; y <= b.hy; ++y)
            if (value.get(x, y))
                sel.set(frame.xstart + x, frame.ystart + y, true);
    return sel;
}

// C ref: sp_lev.c lspo_feature(). feature("name"), feature("name", {x, y}),
// feature("name", x, y), or the table form with type and x/y or coord,
// which alone may carry the feature's flag fields. A random square is a
// DRY one; a given square is taken as is. The flags are set only when the
// square took the feature.
export function lspo_feature(args, env) {
    const { state, coder, frame } = env;
    const features = ['fountain', 'sink', 'pool', 'throne', 'tree'];
    const features2i = [FOUNTAIN, SINK, POOL, THRONE, TREE, STONE];
    let x, y;
    let typ;
    const argc = args.length;
    let can_have_flags = false;
    let fcoord;
    let humidity;
    let table = null;

    if (argc === 1 && typeof args[0] === 'string') {
        typ = features2i[luaL_checkoption(args[0], null, features)];
        x = y = -1;
    } else if (argc === 2 && typeof args[0] === 'string'
               && isLuaTable(args[1])) {
        const c = { x: -1, y: -1 };
        typ = features2i[luaL_checkoption(args[0], null, features)];
        get_coord(args[1], c);
        x = c.x;
        y = c.y;
    } else if (argc === 3) {
        typ = features2i[luaL_checkoption(args[0], null, features)];
        x = luaL_checkinteger(args[1]);
        y = luaL_checkinteger(args[2]);
    } else {
        table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        typ = features2i[get_table_option(table, 'type', null, features)];
        can_have_flags = true;
    }

    if (x === -1 && y === -1) {
        fcoord = SP_COORD_PACK_RANDOM(0);
        humidity = DRY; /* pick a regular space, no rock or other furniture */
    } else {
        fcoord = SP_COORD_PACK(x, y);
        humidity = ANY_LOC; /* assume the author knows what they're doing */
    }
    const c = { x, y };
    get_location_coord(c, humidity, coder.croom, fcoord, { frame, state });
    x = c.x;
    y = c.y;

    if (typ === STONE) {
        // C: impossible("feature has unknown type param.");
    } else {
        sel_set_feature(x, y, typ, state);
    }

    const loc = state.level.at(x, y);
    if (!loc || loc.typ !== typ || !can_have_flags)
        return;

    switch (typ) {
    default:
        break;
    case FOUNTAIN:
        l_table_getset_feature_flag(table, x, y, 'looted', F_LOOTED, env);
        l_table_getset_feature_flag(table, x, y, 'warned', F_WARNED, env);
        break;
    case SINK:
        l_table_getset_feature_flag(table, x, y, 'pudding', S_LPUDDING, env);
        l_table_getset_feature_flag(table, x, y, 'dishwasher', S_LDWASHER,
                                    env);
        l_table_getset_feature_flag(table, x, y, 'ring', S_LRING, env);
        break;
    case THRONE:
        l_table_getset_feature_flag(table, x, y, 'looted', T_LOOTED, env);
        break;
    case TREE:
        l_table_getset_feature_flag(table, x, y, 'looted', TREE_LOOTED, env);
        l_table_getset_feature_flag(table, x, y, 'swarm', TREE_SWARM, env);
        break;
    }
}

// C ref: sp_lev.c lspo_gas_cloud(). gas_cloud({ selection, damage, ttl })
// or the same table with x/y or coord for a one-square cloud. A ttl above
// the -2 default overrides the region's own.
export function lspo_gas_cloud(args, env) {
    const { state, frame } = env;
    let x = 0, y = 0;
    let sel = null;
    const argc = args.length;
    let damage = 0;
    let ttl = -2;

    if (argc === 1 && isLuaTable(args[0])) {
        let reg;

        const table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        if (x === -1 && y === -1) {
            sel = l_selection_check(table.selection, frame);
        }
        damage = get_table_int_opt(table, 'damage', 0);
        ttl = get_table_int_opt(table, 'ttl', -2);
        if (!sel) {
            // region.c create_gas_cloud() is async for the arrival message
            // it prints outside level creation; it appends its region before
            // its first await, so the newest region is the one it made, and
            // the settled promise is released. The C resolves the square
            // through no frame, and neither does this.
            void create_gas_cloud(x, y, 1, damage, {
                state, random: env.random, hooks: env.hooks,
            });
            reg = state.level.regions[state.level.regions.length - 1];
        } else {
            reg = create_gas_cloud_selection(sel, damage, {
                state, random: env.random, hooks: env.hooks,
            });
        }
        if (ttl > -2)
            reg.ttl = ttl;
    } else {
        throw new Error('wrong parameters');
    }
}

// C ref: sp_lev.c lspo_terrain(). terrain({ x, y | coord | selection, typ,
// lit }), terrain({x, y}, MAPCHAR), terrain(SELECTION, MAPCHAR), or
// terrain(x, y, MAPCHAR). A selection is painted square by square through
// sel_set_ter(); a square is resolved through get_location_coord() and must
// be on the map.
export function lspo_terrain(args, env) {
    const { state, coder, frame } = env;
    const tmpterrain = { tlit: SET_LIT_NOCHANGE, ter: INVALID_TYPE };
    let x = 0, y = 0;
    let sel = null;
    const argc = args.length;

    if (argc === 1) {
        const table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        if (x === -1 && y === -1) {
            sel = l_selection_check(table.selection, frame);
        }
        tmpterrain.ter = get_table_mapchr(table, 'typ');
        tmpterrain.tlit = get_table_int_opt(table, 'lit', SET_LIT_NOCHANGE);
    } else if (argc === 2 && isLuaTable(args[0])
               && !(args[0] instanceof ThemeroomSelection)
               && typeof args[1] === 'string') {
        const c = { x: -1, y: -1 };
        tmpterrain.ter = check_mapchr(luaL_checkstring(args[1]));
        get_coord(args[0], c);
        x = c.x;
        y = c.y;
    } else if (argc === 2) {
        sel = l_selection_check(args[0], frame);
        tmpterrain.ter = check_mapchr(luaL_checkstring(args[1]));
    } else if (argc === 3) {
        x = luaL_checkinteger(args[0]);
        y = luaL_checkinteger(args[1]);
        tmpterrain.ter = check_mapchr(luaL_checkstring(args[2]));
    } else {
        throw new Error('wrong parameters');
    }

    if (tmpterrain.ter === INVALID_TYPE)
        throw new Error('Erroneous map char');

    if (sel) {
        selection_iterate(sel, (sx, sy) => {
            sel_set_ter(sx, sy, tmpterrain.ter, tmpterrain.tlit, state);
        });
    } else {
        const c = { x, y };
        get_location_coord(c, ANY_LOC, coder.croom, SP_COORD_PACK(x, y),
                           { frame, state });
        if (!isok(c.x, c.y))
            throw new Error('terrain coord not ok');
        sel_set_ter(c.x, c.y, tmpterrain.ter, tmpterrain.tlit, state);
    }
}

// C ref: sp_lev.c lspo_replace_terrain(). The area is x1/y1/x2/y2, else
// region, else selection, else the whole map; the match is fromterrain, or
// a mapfragment when that is absent. Each selected square that matches
// draws rn2(100) against chance and is rewritten with set_levltyp_lit().
export function lspo_replace_terrain(args, env) {
    const { state, coder, frame } = env;
    let mf = null;
    let sel = null;
    let x, y;

    const table = lcheck_param_table(args);

    const totyp = get_table_mapchr(table, 'toterrain');

    if (totyp >= MAX_TYPE)
        return;

    const fromtyp = get_table_mapchr_opt(table, 'fromterrain', INVALID_TYPE);

    if (fromtyp === INVALID_TYPE) {
        const tmpstr = get_table_str(table, 'mapfragment');
        mf = mapfrag_fromstr(tmpstr);

        const err = mapfrag_error(mf);
        if (err != null)
            throw new Error(err);
    }

    const chance = get_table_int_opt(table, 'chance', 100);
    const tolit = get_table_int_opt(table, 'lit', SET_LIT_NOCHANGE);
    const r = {
        x1: get_table_int_opt(table, 'x1', -1),
        y1: get_table_int_opt(table, 'y1', -1),
        x2: get_table_int_opt(table, 'x2', -1),
        y2: get_table_int_opt(table, 'y2', -1),
    };
    const noArea = () => (r.x1 === -1 && r.y1 === -1
                          && r.x2 === -1 && r.y2 === -1);

    if (noArea()) {
        get_table_region(table, 'region', r, true);
    }

    if (noArea()) {
        if (table.selection != null)
            sel = l_selection_check(table.selection, frame);
    }

    if (!sel) {
        sel = new ThemeroomSelection(null, true);

        if (noArea()) {
            // C: selection_clear(sel, 1), every square of the map.
            for (x = 0; x < COLNO; x++)
                for (y = 0; y < ROWNO; y++)
                    sel.set(x, y, true);
        } else {
            const c1 = { x: r.x1, y: r.y1 };
            const c2 = { x: r.x2, y: r.y2 };
            get_location(c1, ANY_LOC, coder.croom, { frame, state });
            get_location(c2, ANY_LOC, coder.croom, { frame, state });
            for (x = Math.max(c1.x, 0); x <= Math.min(c2.x, COLNO - 1); x++)
                for (y = Math.max(c1.y, 0); y <= Math.min(c2.y, ROWNO - 1);
                     y++)
                    sel.set(x, y, true);
        }
    }

    const rect = sel.bounds();

    for (x = Math.max(1, rect.lx); x <= rect.hx; x++)
        for (y = rect.ly; y <= rect.hy; y++)
            if (sel.get(x, y)) {
                if (mf) {
                    if (mapfrag_match(mf, x, y, state) && rn2(100) < chance)
                        set_levltyp_lit(x, y, totyp, tolit, state);
                } else {
                    const typ = state.level.at(x, y).typ;
                    if (((fromtyp === MATCH_WALL && IS_STWALL(typ))
                         || typ === fromtyp)
                        && rn2(100) < chance)
                        set_levltyp_lit(x, y, totyp, tolit, state);
                }
            }

    mapfrag_free(mf);
}

// C ref: sp_lev.c generate_way_out_method(). Gives the pocket of accessible
// squares around (nx, ny), which `ov` does not reach, a way out: a secret
// door through one wall into `ov`, else a hole or trap door on a level one
// can fall through, else an escape item. The pocket is flooded with the
// check ensure_way_out() installed. Answers whether a way was made.
function generate_way_out_method(nx, ny, ov, env) {
    const { state } = env;
    const escapeitems = [
        PICK_AXE, DWARVISH_MATTOCK, WAN_DIGGING,
        WAN_TELEPORTATION, SCR_TELEPORTATION, RIN_TELEPORTATION,
    ];
    const ov2 = new ThemeroomSelection(null, true);
    let ov3;
    let c;
    const levl = (x, y) => state.level.at(x, y);

    selection_floodfill(ov2, nx, ny, true);
    ov3 = ov2.clone();

    /* try to make a secret door */
    while ((c = ov3.rndcoord(true)).x !== -1) {
        const { x, y } = c;
        if (isok(x + 1, y) && !ov.get(x + 1, y)
            && IS_WALL(levl(x + 1, y).typ)
            && isok(x + 2, y) && ov.get(x + 2, y)
            && ACCESSIBLE(levl(x + 2, y).typ)) {
            levl(x + 1, y).typ = SDOOR;
            return true;
        }
        if (isok(x - 1, y) && !ov.get(x - 1, y)
            && IS_WALL(levl(x - 1, y).typ)
            && isok(x - 2, y) && ov.get(x - 2, y)
            && ACCESSIBLE(levl(x - 2, y).typ)) {
            levl(x - 1, y).typ = SDOOR;
            return true;
        }
        if (isok(x, y + 1) && !ov.get(x, y + 1)
            && IS_WALL(levl(x, y + 1).typ)
            && isok(x, y + 2) && ov.get(x, y + 2)
            && ACCESSIBLE(levl(x, y + 2).typ)) {
            levl(x, y + 1).typ = SDOOR;
            return true;
        }
        if (isok(x, y - 1) && !ov.get(x, y - 1)
            && IS_WALL(levl(x, y - 1).typ)
            && isok(x, y - 2) && ov.get(x, y - 2)
            && ACCESSIBLE(levl(x, y - 2).typ)) {
            levl(x, y - 1).typ = SDOOR;
            return true;
        }
    }

    /* try to make a hole or a trapdoor */
    if (Can_fall_thru(state.u.uz, state)) {
        ov3 = ov2.clone();
        while ((c = ov3.rndcoord(true)).x !== -1) {
            if (maketrap(c.x, c.y, rn2(2) ? HOLE : TRAPDOOR, env))
                return true;
        }
    }

    /* generate one of the escape items */
    if ((c = ov2.rndcoord(false)).x !== -1) {
        mksobj_at(escapeitems[rn2(escapeitems.length)], c.x, c.y, true,
                  false, levelObjectEnv());
        return true;
    }

    return false;
}

// C ref: sp_lev.c ensure_way_out(). Floods the squares reachable from every
// stairway of this dungeon and from every undestroyable trap or hole, then
// gives each accessible square left outside a way out, flooding from it
// when one was made, until none is left. Called by load_special() when the
// level asked for "inaccessibles".
function ensure_way_out(env) {
    const { state } = env;
    const ov = new ThemeroomSelection(null, true);
    let ret = true;

    set_selection_floodfillchk(
        (x, y) => floodfillchk_match_accessible(x, y, state),
    );

    for (let stway = state.stairs; stway; stway = stway.next) {
        if (stway.tolev.dnum === state.u.uz.dnum)
            selection_floodfill(ov, stway.sx, stway.sy, true);
    }

    for (const ttmp of state.level.traps) {
        if ((undestroyable_trap(ttmp.ttyp) || is_hole(ttmp.ttyp))
            && !ov.get(ttmp.tx, ttmp.ty))
            selection_floodfill(ov, ttmp.tx, ttmp.ty, true);
    }

    do {
        ret = true;
        outhere:
        for (let x = 1; x < COLNO; x++)
            for (let y = 0; y < ROWNO; y++)
                if (ACCESSIBLE(state.level.at(x, y).typ)
                    && !ov.get(x, y)) {
                    if (generate_way_out_method(x, y, ov, env))
                        selection_floodfill(ov, x, y, true);
                    ret = false;
                    break outhere;
                }
    } while (!ret);
}

// C ref: sp_lev.c levregion_add(). Resolves each area that is not already
// in level coordinates through get_location() with no room, and appends
// the record to gl.lregions (the port's state.lregions), which
// fixup_special() consumes in finish().
function levregion_add(lregion, env) {
    const { state, frame } = env;
    if (!lregion.in_islev) {
        const c1 = { x: lregion.inarea.x1, y: lregion.inarea.y1 };
        const c2 = { x: lregion.inarea.x2, y: lregion.inarea.y2 };
        get_location(c1, ANY_LOC, null, { frame, state });
        get_location(c2, ANY_LOC, null, { frame, state });
        lregion.inarea = { x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y };
    }

    if (!lregion.del_islev) {
        const c1 = { x: lregion.delarea.x1, y: lregion.delarea.y1 };
        const c2 = { x: lregion.delarea.x2, y: lregion.delarea.y2 };
        get_location(c1, ANY_LOC, null, { frame, state });
        get_location(c2, ANY_LOC, null, { frame, state });
        lregion.delarea = { x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y };
    }
    // C reallocates the array one record longer, or allocates it for the
    // first record, and copies the new record in.
    (state.lregions ??= []).push({ ...lregion });
}

// C ref: sp_lev.c l_get_lregion(). Reads region, the optional exclude,
// and the two _islev flags of a levregion/teleport_region table. Without
// an exclude, exclude_islev is forced on so the -1,-1,-1,-1 area stays off
// the map.
export function l_get_lregion(table, tmplregion) {
    const r = { x1: 0, y1: 0, x2: 0, y2: 0 };

    get_table_region(table, 'region', r, false);
    tmplregion.inarea = { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 };

    r.x1 = r.y1 = r.x2 = r.y2 = -1;
    get_table_region(table, 'exclude', r, true);
    tmplregion.delarea = { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 };

    tmplregion.in_islev = get_table_boolean_opt(table, 'region_islev', 0);
    tmplregion.del_islev = get_table_boolean_opt(table, 'exclude_islev', 0);

    /* if x1 is still negative, exclude wasn't specified, so we should treat
     * it as if there is no exclude region at all. Force exclude_islev to
     * true so the -1,-1,-1,-1 region is safely off the map and won't
     * interfere with branch or portal placement. */
    if (r.x1 < 0)
        tmplregion.del_islev = true;
}

// C ref: sp_lev.c lspo_teleport_region(). teleport_region({ region,
// [region_islev,] [exclude, [exclude_islev,]] [dir] }); dir defaults to
// both. The record's rname is the C's rname.str.
export function lspo_teleport_region(args, env) {
    const teledirs = ['both', 'down', 'up'];
    const teledirs2i = [LR_TELE, LR_DOWNTELE, LR_UPTELE, -1];
    const tmplregion = {};

    const table = lcheck_param_table(args);
    l_get_lregion(table, tmplregion);
    tmplregion.rtype = teledirs2i[get_table_option(table, 'dir', 'both',
                                                   teledirs)];
    tmplregion.padding = 0;
    tmplregion.rname = null;

    levregion_add(tmplregion, env);
}

// C ref: sp_lev.c lspo_levregion(). levregion({ region, exclude, type,
// name, padding }); type defaults to stair-down.
export function lspo_levregion(args, env) {
    const regiontypes = [
        'stair-down', 'stair-up', 'portal', 'branch',
        'teleport', 'teleport-up', 'teleport-down',
    ];
    const regiontypes2i = [
        LR_DOWNSTAIR, LR_UPSTAIR, LR_PORTAL, LR_BRANCH,
        LR_TELE, LR_UPTELE, LR_DOWNTELE, 0,
    ];
    const tmplregion = {};

    const table = lcheck_param_table(args);
    l_get_lregion(table, tmplregion);
    tmplregion.rtype = regiontypes2i[get_table_option(table, 'type',
                                                      'stair-down',
                                                      regiontypes)];
    tmplregion.padding = get_table_int_opt(table, 'padding', 0);
    tmplregion.rname = get_table_str_opt(table, 'name', null);

    levregion_add(tmplregion, env);
}

// C ref: sp_lev.c lspo_exclusion(). exclusion({ type, region }); the
// corners go through get_location_coord() with the current room, and the
// zone is pushed onto sve.exclusion_zones (the port's
// state.exclusion_zones).
export function lspo_exclusion(args, env) {
    const { state, frame } = env;
    const ez_types = [
        'teleport', 'teleport-up', 'teleport-down', 'monster-generation',
    ];
    const ez_types2i = [LR_TELE, LR_UPTELE, LR_DOWNTELE, LR_MONGEN, 0];
    const ez = {};
    const r = { x1: 0, y1: 0, x2: 0, y2: 0 };

    const table = lcheck_param_table(args);
    ez.zonetype = ez_types2i[get_table_option(table, 'type', 'teleport',
                                              ez_types)];
    get_table_region(table, 'region', r, false);

    const a = { x: r.x1, y: r.y1 };
    const b = { x: r.x2, y: r.y2 };

    const croom = env.coder?.croom ?? null;
    get_location_coord(a, ANY_LOC | NO_LOC_WARN, croom,
                       SP_COORD_PACK(a.x, a.y), { frame, state });
    get_location_coord(b, ANY_LOC | NO_LOC_WARN, croom,
                       SP_COORD_PACK(b.x, b.y), { frame, state });

    ez.lx = a.x;
    ez.ly = a.y;
    ez.hx = b.x;
    ez.hy = b.y;

    ez.next = state.exclusion_zones ?? null;
    state.exclusion_zones = ez;
}

// C ref: sp_lev.c sel_set_lit(). Lights or darkens one square; lava is
// always lit.
function sel_set_lit(x, y, lit, state) {
    const loc = state.level.at(x, y);

    loc.lit = Boolean(IS_LAVA(loc.typ) || lit);
}

// C ref: sp_lev.c get_table_coords_or_region(). Reads x1/y1/x2/y2 into `d`,
// or, when all four are absent, the required region field.
export function get_table_coords_or_region(table, d) {
    d.x1 = get_table_int_opt(table, 'x1', -1);
    d.y1 = get_table_int_opt(table, 'y1', -1);
    d.x2 = get_table_int_opt(table, 'x2', -1);
    d.y2 = get_table_int_opt(table, 'y2', -1);

    if (d.x1 === -1 && d.y1 === -1 && d.x2 === -1 && d.y2 === -1) {
        const r = { x1: 0, y1: 0, x2: 0, y2: 0 };

        get_table_region(table, 'region', r, false);
        d.x1 = r.x1;
        d.y1 = r.y1;
        d.x2 = r.x2;
        d.y2 = r.y2;
    }
}

// C ref: sp_lev.c lspo_region(). region(selection, "lit"|"unlit") clones
// the selection, grows it when lit, and sets each square's lighting. The
// table form, with x1/y1/x2/y2 or region and lit, type, joined, irregular,
// filled, arrival_room, and contents, lights a plain rectangle through
// light_region() and otherwise makes a room: flood-filled from its first
// corner when irregular, else add_room() plus topologize(). The room
// becomes the current room for its contents callback, is left through
// spo_endroom(), and gets its doors from add_doors_to_room().
export function lspo_region(args, env) {
    const { state, coder, frame } = env;
    const d = { x1: 0, y1: 0, x2: 0, y2: 0 };
    let troom;
    let do_arrival_room = false, room_not_needed,
        irregular = false, joined = true;
    let rtype = OROOM, rlit = 1, needfill = 0;
    const argc = args.length;
    let table = null;

    if (argc <= 1) {
        table = lcheck_param_table(args);

        /* TODO: "unfilled" => filled=0, "filled" => filled=1, and
         * "lvflags_only" => filled=2, probably in a get_table_needfill_opt */
        needfill = get_table_int_opt(table, 'filled', 0);
        irregular = get_table_boolean_opt(table, 'irregular', 0);
        joined = get_table_boolean_opt(table, 'joined', true);
        do_arrival_room = get_table_boolean_opt(table, 'arrival_room', 0);
        rtype = get_table_roomtype_opt(table, 'type', OROOM, env);
        rlit = get_table_int_opt(table, 'lit', -1);

        get_table_coords_or_region(table, d);

        if (d.x1 === -1 && d.y1 === -1 && d.x2 === -1 && d.y2 === -1) {
            throw new Error('region needs region');
        }

    } else if (argc === 2) {
        /* region(selection, "lit"); */
        const lits = ['unlit', 'lit'];
        const orig = l_selection_check(args[0], frame);
        let sel = orig.clone();

        rlit = luaL_checkoption(args[1], 'lit', lits);

        /*
    TODO: lit=random
        */
        // selvar.c selection_do_grow() grows in place; the port's grow()
        // answers the grown copy.
        if (rlit)
            sel = sel.grow(W_ANY);
        selection_iterate(sel, (x, y) => sel_set_lit(x, y, rlit, state));

        /* TODO: skip the rest of this function? */
        return;
    } else {
        throw new Error('Wrong parameters');
    }

    rlit = litstate_rnd(rlit);

    const c1 = { x: d.x1, y: d.y1 };
    const c2 = { x: d.x2, y: d.y2 };
    get_location(c1, ANY_LOC, null, { frame, state });
    get_location(c2, ANY_LOC, null, { frame, state });
    d.x1 = c1.x;
    d.y1 = c1.y;
    d.x2 = c2.x;
    d.y2 = c2.y;

    /* Many regions are simple, rectangular areas that just need to set
     * lighting in an area. In that case, we don't need to do anything
     * complicated by creating a room. The exceptions are:
     *  - Special rooms (which usually need to be filled).
     *  - Irregular regions (more convenient to use the room-making code).
     *  - Themed room regions (which often have contents).
     *  - When a room is desired to constrain the arrival of migrating
     *    monsters (see the mon_arrive function for details).
     */
    room_not_needed = (rtype === OROOM && !irregular
                       && !do_arrival_room && !state.in_mk_themerooms);
    if (room_not_needed || state.level.nroom >= MAXNROFROOMS) {
        // C: if (!room_not_needed) impossible("Too many rooms on new level!");
        light_region({
            rlit, x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
        }, state);

        return;
    }

    // C writes needfill and needjoining into svr.rooms[svn.nroom] before
    // add_room() fills the rest of that record and leaves those two alone
    // for a special room. The port's add_room() makes the record, so the
    // two are written once it exists.
    const roomFields = (room) => {
        /* mark rooms that must be filled, but do it later */
        room.needfill = needfill;

        room.needjoining = joined;
    };

    if (irregular) {
        state._mkmap_min_rx = state._mkmap_max_rx = d.x1;
        state._mkmap_min_ry = state._mkmap_max_ry = d.y1;
        state.smeq[state.level.nroom] = state.level.nroom;
        flood_fill_rm(d.x1, d.y1, state.level.nroom + ROOMOFFSET, rlit,
                      true, state);
        add_room(state._mkmap_min_rx, state._mkmap_min_ry,
                 state._mkmap_max_rx, state._mkmap_max_ry, false, rtype,
                 true);
        troom = state.level.rooms[state.level.nroom - 1];
        roomFields(troom);
        troom.rlit = rlit;
        troom.irregular = true;
    } else {
        add_room(d.x1, d.y1, d.x2, d.y2, rlit, rtype, true);
        troom = state.level.rooms[state.level.nroom - 1];
        roomFields(troom);
        topologize(troom, state); /* set roomno */
    }

    if (!room_not_needed) {
        if (coder.n_subroom > 1) {
            // C: impossible("region as subroom");
        } else {
            coder.tmproomlist[coder.n_subroom] = troom;
            coder.failed_room[coder.n_subroom] = false;
            coder.n_subroom++;
            update_croom(coder);
            if (typeof table.contents === 'function') {
                table.contents(l_push_mkroom_table(troom));
            }
            spo_endroom(coder, frame, state);
            add_doors_to_room(troom);
        }
    }
}

// C ref: sp_lev.c lspo_drawbridge(). The table form with x/y or coord, a
// dir of north/south/west/east/random, and a state of open/closed/random.
// A random state draws rn2(2) once the square is resolved; the bridge and
// its wall come from dbridge.c create_drawbridge(). The coordinate check
// reads the Lua values before conversion, as the source does.
export function lspo_drawbridge(args, env) {
    const { state, coder, frame } = env;
    const mwdirs = ['north', 'south', 'west', 'east', 'random'];
    const mwdirs2i = [DB_NORTH, DB_SOUTH, DB_WEST, DB_EAST, -1, -2];
    const dbopens = ['open', 'closed', 'random'];
    const dbopens2i = [1, 0, -1, -2];

    const table = lcheck_param_table(args);

    const { x: mx, y: my } = get_table_xy_or_coord(table);

    const dir = mwdirs2i[get_table_option(table, 'dir', 'random', mwdirs)];
    const dcoord = SP_COORD_PACK(mx, my);
    let db_open = dbopens2i[get_table_option(table, 'state', 'random',
                                             dbopens)];
    const c = { x: mx, y: my };

    get_location_coord(c, DRY | WET | HOT, coder.croom, dcoord,
                       { frame, state });
    if (!isok(mx, my)) {
        throw new Error('drawbridge coord not ok');
    }
    if (db_open === -1)
        db_open = rn2(2) ? 0 : 1;
    if (!create_drawbridge(c.x, c.y, dir, Boolean(db_open), state)) {
        // C: impossible("Cannot create drawbridge.");
    }
    frame.splevMap[c.x][c.y] = 1;
}

// C ref: sp_lev.c lspo_mazewalk(). mazewalk(x, y, dir) or the table form
// with x/y or coord, typ, stocked, and dir. Steps one square in the walk
// direction, moves the start onto odd parity, carves from it through
// walkfrom(), and fills the maze through fill_empty_maze() when stocked.
export function lspo_mazewalk(args, env) {
    const { state, coder, frame } = env;
    const mwdirs = ['north', 'south', 'east', 'west', 'random'];
    const mwdirs2i = [W_NORTH, W_SOUTH, W_EAST, W_WEST, W_RANDOM, -2];
    let mx, my;
    let ftyp = ROOM;
    let fstocked = 1, dir = -1;
    const argc = args.length;

    if (argc === 3) {
        mx = luaL_checkinteger(args[0]);
        my = luaL_checkinteger(args[1]);
        dir = mwdirs2i[luaL_checkoption(args[2], 'random', mwdirs)];
    } else {
        const table = lcheck_param_table(args);

        ({ x: mx, y: my } = get_table_xy_or_coord(table));
        ftyp = get_table_mapchr_opt(table, 'typ', ROOM);
        fstocked = get_table_boolean_opt(table, 'stocked', 1);
        dir = mwdirs2i[get_table_option(table, 'dir', 'random', mwdirs)];
    }

    const mcoord = SP_COORD_PACK(mx, my);
    const c = { x: mx, y: my };

    get_location_coord(c, ANY_LOC, coder.croom, mcoord, { frame, state });
    let { x, y } = c;

    if (!isok(x, y)) {
        throw new Error('mazewalk coord not ok');
    }

    if (ftyp < 1) {
        ftyp = state.level.flags.corrmaze ? CORR : ROOM;
    }

    if (dir === W_RANDOM)
        dir = random_wdir();

    /* don't use move() - it doesn't use W_NORTH, etc. */
    switch (dir) {
    case W_NORTH:
        --y;
        break;
    case W_SOUTH:
        y++;
        break;
    case W_EAST:
        x++;
        break;
    case W_WEST:
        --x;
        break;
    default:
        // C: impossible("mazewalk: Bad direction");
        break;
    }

    if (!IS_DOOR(state.level.at(x, y).typ)) {
        state.level.at(x, y).typ = ftyp;
        state.level.at(x, y).flags = 0;
    }

    /*
     * We must be sure that the parity of the coordinates for
     * walkfrom() is odd.  But we must also take into account
     * what direction was chosen.
     */
    if (!(x % 2)) {
        if (dir === W_EAST)
            x++;
        else
            x--;

        /* no need for IS_DOOR check; out of map bounds */
        state.level.at(x, y).typ = ftyp;
        state.level.at(x, y).flags = 0;
    }

    if (!(y % 2)) {
        if (dir === W_SOUTH)
            y++;
        else
            y--;
    }

    walkfrom(x, y, ftyp, state);
    if (fstocked)
        fill_empty_maze(frame, state, env);
}

// C ref: sp_lev.c lspo_wall_property(). A rectangle from x1/y1/x2/y2 or
// region, each absent corner defaulting to the frame plus a one-square
// border, converted through get_location() and flagged nondiggable or
// nonpasswall through set_wall_property().
export function lspo_wall_property(args, env) {
    const { state, frame } = env;
    const wprops = ['nondiggable', 'nonpasswall'];
    const wprop2i = [W_NONDIGGABLE, W_NONPASSWALL, -1];
    const d = { x1: -1, y1: -1, x2: -1, y2: -1 };

    const table = lcheck_param_table(args);

    get_table_coords_or_region(table, d);

    const wprop = wprop2i[get_table_option(table, 'property', 'nondiggable',
                                           wprops)];

    if (d.x1 === -1)
        d.x1 = frame.xstart - 1;
    if (d.y1 === -1)
        d.y1 = frame.ystart - 1;
    if (d.x2 === -1)
        d.x2 = frame.xstart + frame.xsize + 1;
    if (d.y2 === -1)
        d.y2 = frame.ystart + frame.ysize + 1;

    const c1 = { x: d.x1, y: d.y1 };
    const c2 = { x: d.x2, y: d.y2 };
    get_location(c1, ANY_LOC, null, { frame, state });
    get_location(c2, ANY_LOC, null, { frame, state });

    set_wall_property(c1.x, c1.y, c2.x, c2.y, wprop, state);
}

// C ref: sp_lev.c set_wallprop_in_selection(). One argument is the
// selection to flag; none means a fresh selection cleared to 1, so every
// map square is visited. Each square goes through sel_set_wall_property().
// The source frees the fresh selection afterwards; the port leaves it to
// the collector.
function set_wallprop_in_selection(args, env, prop) {
    const { state, frame } = env;
    const argc = args.length;
    let sel = null;

    if (argc === 1) {
        sel = l_selection_check(args[0], frame);
    } else if (argc === 0) {
        sel = selection_new();
        selection_clear(sel, 1);
    }

    if (sel) {
        selection_iterate(sel,
                          (x, y) => sel_set_wall_property(x, y, prop, state));
    }
}

// C ref: sp_lev.c lspo_non_diggable(). non_diggable(selection) or
// non_diggable().
export function lspo_non_diggable(args, env) {
    set_wallprop_in_selection(args, env, W_NONDIGGABLE);
}

// C ref: sp_lev.c lspo_non_passwall(). non_passwall(selection) or
// non_passwall().
export function lspo_non_passwall(args, env) {
    set_wallprop_in_selection(args, env, W_NONPASSWALL);
}

// C ref: sp_lev.c sel_set_wallify(). The source keeps it under `#if 0`
// with no caller: the selection form that lspo_wallify()'s
// "TODO: wallify(selection)" would iterate through it.
export function sel_set_wallify(x, y, arg, state = game) {
    wallify_map(x, y, x, y, state);
}

// C ref: sp_lev.c lspo_wallify(). wallify({ x1, y1, x2, y2 }), whose four
// fields are all required, or wallify(). A negative or absent corner
// defaults to the frame plus a one-square border; wallify_map() walls the
// stone next to the floor inside it.
export function lspo_wallify(args, env) {
    const { state, frame } = env;
    let dx1 = -1, dy1 = -1, dx2 = -1, dy2 = -1;

    /* TODO: clamp coord values */
    /* TODO: maybe allow wallify({x1,y1}, {x2,y2}) */
    /* TODO: is_table_coord(), is_table_area(),
             get_table_coord(), get_table_area() */

    if (args.length === 1) {
        const table = args[0];
        dx1 = get_table_int(table, 'x1');
        dy1 = get_table_int(table, 'y1');
        dx2 = get_table_int(table, 'x2');
        dy2 = get_table_int(table, 'y2');
    }

    wallify_map(dx1 < 0 ? (frame.xstart - 1) : dx1,
                dy1 < 0 ? (frame.ystart - 1) : dy1,
                dx2 < 0 ? (frame.xstart + frame.xsize + 1) : dx2,
                dy2 < 0 ? (frame.ystart + frame.ysize + 1) : dy2,
                state);
}

// C ref: sp_lev.c lspo_reset_level(). "Only needed for testing purposes":
// des.reset_level() in the Lua test scripts, and wizcmds.c
// wiz_load_splua(), which is not ported, with no Lua state. Marks Lua
// testing, remakes the coder, and clears the level for a fresh generation.
// The port's coder is the object createSpecialLevelApi() made, shared with
// its closures, so the remake writes sp_level_coder_init()'s fields into
// it in place and clears the SpLev_Map the frame holds.
export async function lspo_reset_level(args, env) {
    const { state, coder, frame } = env;
    const wtower = In_W_tower(state.u.ux, state.u.uy, state.u.uz, state);

    state.iflags ??= {};
    state.iflags.lua_testing = true;
    // C: if (L) { Free(gc.coder); gc.coder = NULL; create_des_coder(); }
    Object.assign(coder, sp_level_coder_init(state, frame));
    // Dynamic import keeps cmd.c's port in js/cmd.js without adding a static
    // cmd -> do -> mklev -> cmd initialization cycle.
    const { makemap_prepost } = await import('./cmd.js');
    await makemap_prepost(true, wtower, state);
    for (const column of frame.splevMap) column.fill(0);
    state.in_mklev = true;
    oinit(state); /* assign level dependent obj probabilities */
    clear_level_structures();
}

// C ref: sp_lev.c lspo_finalize_level(). "Only needed for testing
// purposes": des.finalize_level() in the Lua test scripts, and wizcmds.c
// wiz_load_splua(), which is not ported, with no Lua state; that caller's
// L-less arms skip the coder's inaccessibles, flip, solidify, and premap
// steps, and the port, with only the Lua caller, runs every arm. The
// sequence up to premap_detect() is the one load_special() runs in
// finish(); this adds level_finalize_topology() and the special-room
// fills.
export async function lspo_finalize_level(args, env) {
    const { state, coder, frame } = env;
    const wtower = In_W_tower(state.u.ux, state.u.uy, state.u.uz, state);

    link_doors_rooms();
    remove_boundary_syms(frame, state);

    /* TODO: ensure_way_out() needs rewrite */
    if (coder.check_inaccessibles)
        ensure_way_out(env);

    map_cleanup(state);

    /* FIXME: Ideally, we want this call to only cover areas of the map
     * which were not inserted directly by the special level file (see
     * the insect legs on Baalzebub's level, for instance). Since that
     * is currently not possible, we overload the corrmaze flag for this
     * purpose.
     */
    if (!state.level.flags.corrmaze)
        wallification(1, 0, COLNO - 1, ROWNO - 1);

    flip_level_rnd(coder.allow_flips);

    count_level_features(state);

    if (coder.solidify)
        solidify_map(state);

    /* This must be done before premap_detect(),
     * otherwise branch stairs won't be premapped. */
    finishFixupSpecial(state);

    if (coder.premapped)
        premap_detect(state);

    level_finalize_topology();

    for (let i = 0; i < state.level.nroom; ++i) {
        fill_special_room(state.level.rooms[i], levelObjectEnv());
    }

    const { makemap_prepost } = await import('./cmd.js');
    await makemap_prepost(false, wtower, state);
    state.iflags ??= {};
    state.iflags.lua_testing = false;
}


function finishFixupSpecial(state) {
    fixup_special(state, {
        findLevel: find_level,
        isMedusaLevel: Is_medusa_level,
        somex: (room) => somex(room),
        somey: (room) => somey(room),
        goodpos,
        levelObjectEnv,
        mkTtObject: (x, y, env) => mk_tt_object(STATUE, x, y, env),
        mkCorpstat: (x, y, env) => mkcorpstat(
            STATUE, null, null, x, y, CORPSTAT_NONE, env,
        ),
        badStatueSpecies: (mnum, currentState) =>
            poly_when_stoned(currentState.mons[mnum], currentState)
                || pm_resistance(currentState.mons[mnum], MR_STONE),
        setCorpsenm: set_corpsenm,
        rndmonnum,
    });
}

function createSpecialLevelApi(state) {
    // C ref: sp_lev.c SpLev_Map[COLNO][ROWNO]. Tracks which cells were
    // placed by lspo_map, lspo_door, lspo_stair, or lspo_drawbridge.
    // maze1xy avoids these cells when placing fill objects.
    const splevMap = Array.from({ length: COLNO }, () =>
        new Uint8Array(ROWNO),
    );
    // The frame's xstart/ystart/xsize/ysize are set by reset_xystart_size()
    // from sp_level_coder_init(); des.map() overrides them with the map's
    // placement, and map-less levels keep the whole-map defaults.
    const frame = {
        xMazeMax: (COLNO - 1) & ~1,
        yMazeMax: (ROWNO - 1) & ~1,
        splevMap,
    };
    const coder = create_des_coder(state, frame);
    const spObjectContext = new_sp_lev_object_context();
    // The C globals the des.* functions read: svl.level through `state`,
    // gc.coder, and sp_lev.c's file-scope placement state through `frame`.
    const env = {
        state,
        random: SOURCE_THEMEROOM_RANDOM,
        hooks: {
            ...objectGenerationHooks(),
            makeMonster(species, x, y, mmflags, monEnv) {
                try {
                    return makemon(species, x, y, mmflags, monEnv);
                } catch (e) {
                    if (e instanceof UnsupportedMonsterCreationError)
                        return null;
                    throw e;
                }
            },
        },
        frame,
        coder,
        spObjectContext,
    };

    return l_register_des({
        random: SOURCE_THEMEROOM_RANDOM,
        get frame() { return frame; },

        level_init(...args) { return lspo_level_init(args, env); },

        message(...args) { return lspo_message(args, env); },

        level_flags(...args) { return lspo_level_flags(args, env); },

        mineralize(...args) { return lspo_mineralize(args, env); },

        // C ref: sp_lev.c lspo_map(). The array form is the source's
        // string form (centered, no contents); the table form places the
        // fragment at halign/valign or at a given square, runs its contents
        // with the {width, height} table, and then resets the frame.
        map(rowsOrSpec) {
            if (Array.isArray(rowsOrSpec)) {
                return mapFromRows(rowsOrSpec, frame, state);
            }
            const spec = rowsOrSpec;
            const mf = mapfrag_fromstr(spec.map);
            const has_contents = typeof spec.contents === 'function';
            if (!mf) throw new Error('Map data error');

            // C ref: sp_lev.c lspo_map() l_or_r2i[]/t_or_b2i[]: an absent
            // alignment is "none" (-1), which leaves that axis's start as it
            // was; only both absent makes the call a placement at x,y.
            const lr = spec.halign ?? -1;
            const tb = spec.valign ?? -1;
            frame.xsize = mf.wid;
            frame.ysize = mf.hei;
            if (lr === -1 && tb === -1) {
                // C ref: sp_lev.c:6162-6175. An explicit square is a map
                // coordinate; inside a room it is room-relative and the
                // fragment is clipped to the room.
                const [x, y] = (spec.x != null || spec.y != null)
                    ? [spec.x ?? -1, spec.y ?? -1]
                    : (spec.coord ?? [-1, -1]);
                if (!isok(x, y)) {
                    mapfrag_free(mf);
                    throw new Error(
                        'Map requires either x,y or halign,valign params',
                    );
                }
                if (coder.croom) {
                    frame.xstart = x + coder.croom.lx;
                    frame.ystart = y + coder.croom.ly;
                    frame.xsize = Math.min(mf.wid,
                                           (coder.croom.hx - coder.croom.lx));
                    frame.ysize = Math.min(mf.hei,
                                           (coder.croom.hy - coder.croom.ly));
                } else {
                    frame.xstart = x;
                    frame.ystart = y;
                }
            } else {
                // C ref: sp_lev.c lspo_map() halign/valign placement.
                // Aligns the map fragment within the maze area.
                if (lr !== -1)
                    frame.xstart = mapAlignX(lr, mf.wid, frame);
                if (tb !== -1)
                    frame.ystart = mapAlignY(tb, mf.hei, frame);
                if (!(frame.xstart % 2)) frame.xstart++;
                if (!(frame.ystart % 2)) frame.ystart++;
            }
            // C ref: sp_lev.c:6227-6238 overflow adjustment.
            if (frame.ystart < 0 || frame.ystart + frame.ysize > ROWNO) {
                frame.ystart += (frame.ystart > 0) ? -2 : 2;
                if (frame.ysize === ROWNO) frame.ystart = 0;
                if (frame.ystart < 0 || frame.ystart + frame.ysize > ROWNO)
                    frame.ystart = 0;
            }
            state.xstart = frame.xstart;
            state.ystart = frame.ystart;
            state.xsize = frame.xsize;
            state.ysize = frame.ysize;
            if (frame.xsize <= 1 && frame.ysize <= 1) {
                reset_xystart_size(frame, state);
            } else {
                /* Load the map */
                for (let y = frame.ystart;
                     y < Math.min(ROWNO, frame.ystart + frame.ysize); y++)
                    for (let x = frame.xstart;
                         x < Math.min(COLNO, frame.xstart + frame.xsize); x++) {
                        const mptyp = mapfrag_get(mf, x - frame.xstart,
                                                  y - frame.ystart);
                        if (mptyp === INVALID_TYPE) continue;
                        if (mptyp >= MAX_TYPE) continue;
                        set_themeroom_map_terrain(x, y, mptyp, state);
                        frame.splevMap[x][y] = 1;
                    }
            }
            mapfrag_free(mf);

            const placed = {
                xstart: frame.xstart, ystart: frame.ystart,
                xsize: frame.xsize, ysize: frame.ysize,
            };
            if (has_contents) {
                spec.contents(l_push_wid_hei_table(frame.xsize, frame.ysize));
                reset_xystart_size(frame, state);
            }
            return placed;
        },

        region(...args) { return lspo_region(args, env); },

        non_diggable(...args) { return lspo_non_diggable(args, env); },

        non_passwall(...args) { return lspo_non_passwall(args, env); },

        wall_property(...args) { return lspo_wall_property(args, env); },

        exclusion(...args) { return lspo_exclusion(args, env); },

        teleport_region(...args) {
            return lspo_teleport_region(args, env);
        },

        parse_config(name, enabled) {
            state.flags ??= {};
            state.flags[name] = Boolean(enabled);
        },

        engraving(...args) { return lspo_engraving(args, env); },

        door(...args) { return lspo_door(args, env); },

        trap(...args) { return lspo_trap(args, env); },

        drawbridge(...args) { return lspo_drawbridge(args, env); },

        // C ref: sp_lev.c lspo_object() argument forms: object("sack"),
        // object("scimitar", 6, 7), object("scimitar", {6, 7}), and the
        // table form. A one-character string is an object class; a longer
        // one is an object name for find_objtype(). The descriptor keeps
        // map-relative coordinates until sp_lev_object.js consumes the
        // frame, so no offset is applied here.
        object(...args) {
            const argc = args.length;
            const objectParamstr = (paramstr) => (paramstr.length === 1
                ? { class: def_char_to_objclass(paramstr) }
                : { id: find_objtype(paramstr, -1, state) });
            let spec;
            if (argc === 1 && typeof args[0] === 'string') {
                spec = objectParamstr(luaL_checkstring(args[0]));
            } else if (argc === 2 && typeof args[0] === 'string'
                       && args[1] != null && typeof args[1] === 'object') {
                const c = { x: -1, y: -1 };
                get_coord(args[1], c);
                spec = { ...objectParamstr(luaL_checkstring(args[0])), ...c };
            } else if (argc === 3 && typeof args[1] === 'number'
                       && typeof args[2] === 'number') {
                spec = {
                    ...objectParamstr(luaL_checkstring(args[0])),
                    x: luaL_checkinteger(args[1]),
                    y: luaL_checkinteger(args[2]),
                };
            } else {
                spec = lcheck_param_table(args);
            }
            // C ref: sp_lev.c lspo_object(). When montype is a single
            // character, resolve it as a monster class letter to a PM_ index
            // the same way C does: mkclass(def_char_to_monclass(ch), flags).
            let corpsenm = spec.montype;
            if (typeof corpsenm === 'string' && corpsenm.length === 1) {
                const cls = def_char_to_monclass(corpsenm);
                const species = mkclass(cls, G_NOGEN | G_IGNORE, {
                    state,
                    random: SOURCE_THEMEROOM_RANDOM,
                });
                corpsenm = species
                    ? state.mons.indexOf(species)
                    : undefined;
            }
            const coordinate = get_table_xy_or_coord(spec);
            const normalized = {
                ...spec,
                coordinate,
                corpsenm,
            };
            return lspo_object(normalized, coder.croom, env);
        },

        gold(...args) { return lspo_gold(args, env); },

        monster(...args) {
            try {
                return lspo_monster(args, coder.croom, env);
            } catch (e) {
                if (e instanceof UnsupportedMonsterCreationError) return null;
                throw e;
            }
        },

        stair(...args) { return lspo_stair(args, env); },

        ladder(...args) { return lspo_ladder(args, env); },

        grave(...args) { return lspo_grave(args, env); },

        shuffle(values) {
            shuffle_core_values(values, rn2);
            return values;
        },

        room(...args) { return lspo_room(args, env); },

        corridor(...args) { return lspo_corridor(args, env); },

        random_corridors(...args) {
            return lspo_random_corridors(args, env);
        },

        altar(...args) { return lspo_altar(args, env); },

        replace_terrain(...args) {
            return lspo_replace_terrain(args, env);
        },

        terrain(...args) { return lspo_terrain(args, env); },

        wallify(...args) { return lspo_wallify(args, env); },

        feature(...args) { return lspo_feature(args, env); },

        mazewalk(...args) { return lspo_mazewalk(args, env); },

        levregion(...args) { return lspo_levregion(args, env); },

        gas_cloud(...args) { return lspo_gas_cloud(args, env); },

        async reset_level(...args) { return lspo_reset_level(args, env); },

        async finalize_level(...args) { return lspo_finalize_level(args, env); },

        finish() {
            link_doors_rooms();
            remove_boundary_syms(frame, state);

            /* TODO: ensure_way_out() needs rewrite */
            if (coder.check_inaccessibles)
                ensure_way_out(env);

            // C ref: sp_lev.c load_special() post-processing.
            map_cleanup(state);
            if (!state.level.flags.corrmaze)
                wallification(1, 0, COLNO - 1, ROWNO - 1);
            // C ref: sp_lev.c flip_level_rnd(). Each allowed flip axis
            // consumes rn2(2). bigrm-12's "noflipy" clears bit 1, leaving
            // only the horizontal axis flip.
            const flipCode = flip_level_rnd(coder.allow_flips);
            count_level_features(state);

            // C ref: sp_lev.c solidify_map(). Marks non-map STONE walls as
            // non-diggable and non-passwall.
            if (coder.solidify) {
                solidify_map(state);
            }

            finishFixupSpecial(state);

            // C ref: sp_lev.c:6052-6053. Reveal the entire map for
            // premapped levels (Sokoban).
            if (coder.premapped) {
                premap_detect(state);
            }

            // C ref: sp_lev.c load_special() calls fill_special_room for
            // every room after fixup_special. For rooms created by
            // des.room() or des.region(table), this sets level flags
            // (has_temple etc.) and fills shops/zoos when needfill is
            // FILL_NORMAL.
            const nroom = state.level?.nroom ?? 0;
            const rooms = state.level?.rooms ?? [];
            for (let i = 0; i < nroom; i++) {
                fill_special_room(rooms[i], levelObjectEnv());
            }
        },
    });
}

// C ref: sp_lev.c lspo_map(), array form. Sets the map frame and paints
// terrain for the main des.map([...rows]) call in a special level file.
function mapFromRows(rows, frame, state) {
    const height = rows.length;
    const width = rows[0]?.length ?? 0;
    if (!width || rows.some((row) => row.length !== width))
        throw new Error('special-level map rows must have equal width');
    frame.xsize = width;
    frame.ysize = height;
    frame.xstart = 2 + Math.trunc(
        (frame.xMazeMax - 2 - width) / 2,
    );
    frame.ystart = 2 + Math.trunc(
        (frame.yMazeMax - 2 - height) / 2,
    );
    if (!(frame.xstart % 2)) ++frame.xstart;
    if (!(frame.ystart % 2)) ++frame.ystart;
    // C ref: sp_lev.c:6227-6238. After the odd-parity adjustment the map
    // may overflow the level grid. Shift it back until it fits.
    if (frame.ystart < 0 || frame.ystart + height > ROWNO) {
        frame.ystart += (frame.ystart > 0) ? -2 : 2;
        if (height === ROWNO) frame.ystart = 0;
        if (frame.ystart < 0 || frame.ystart + height > ROWNO)
            frame.ystart = 0;
    }
    state.xstart = frame.xstart;
    state.ystart = frame.ystart;
    state.xsize = frame.xsize;
    state.ysize = frame.ysize;
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const ax = frame.xstart + x;
            const ay = frame.ystart + y;
            const mptyp = splev_chr2typ(rows[y][x]);
            if (mptyp >= MAX_TYPE) continue;
            set_themeroom_map_terrain(ax, ay, mptyp, state);
            // C ref: sp_lev.c:6292. Mark cells placed by the map fragment
            // so fill_empty_maze and maze1xy avoid them.
            if (frame.splevMap) frame.splevMap[ax][ay] = 1;
        }
    }
    return { ...frame };
}

// C ref: sp_lev.c wallify_map(). Converts STONE tiles adjacent to ROOM or
// CROSSWALL tiles into HWALL (horizontal neighbor) or VWALL (vertical
// neighbor). Distinct from wallification(), which cleans up wall subtypes.
function wallify_map(x1, y1, x2, y2, state) {
    y1 = Math.max(y1, 0);
    x1 = Math.max(x1, 1);
    y2 = Math.min(y2, ROWNO - 1);
    x2 = Math.min(x2, COLNO - 1);
    for (let y = y1; y <= y2; ++y) {
        const loYY = y > 0 ? y - 1 : 0;
        const hiYY = y < y2 ? y + 1 : y2;
        for (let x = x1; x <= x2; ++x) {
            if (state.level.at(x, y).typ !== STONE) continue;
            const loXX = x > 1 ? x - 1 : 1;
            const hiXX = x < x2 ? x + 1 : x2;
            let done = false;
            for (let yy = loYY; yy <= hiYY && !done; ++yy) {
                for (let xx = loXX; xx <= hiXX; ++xx) {
                    const t = state.level.at(xx, yy).typ;
                    if (IS_ROOM(t) || t === CROSSWALL) {
                        state.level.at(x, y).typ
                            = (yy !== y) ? HWALL : VWALL;
                        done = true;
                        break;
                    }
                }
            }
        }
    }
}

// =========================================================================
// C ref: mkmap.c — Cellular-automata cave generation (mines-style levels).
// =========================================================================

const HEIGHT = ROWNO - 1;
const WIDTH = COLNO - 2;

const N_P1_ITER = 1;
const N_P2_ITER = 1;
const N_P3_ITER = 2;

const mkmap_dirs = [
    -1, -1, -1, 0, -1, 1, 0, -1,
    0, 1, 1, -1, 1, 0, 1, 1,
];

// C ref: mkmap.c init_map(). Fill every map cell with bg_typ.
function mkmap_init_map(bg_typ, state) {
    for (let x = 1; x < COLNO; x++) {
        for (let y = 0; y < ROWNO; y++) {
            const loc = state.level.at(x, y);
            loc.roomno = NO_ROOM;
            loc.typ = bg_typ;
            loc.lit = false;
        }
    }
}

// C ref: mkmap.c init_fill(). Randomly place fg_typ cells until 40% of
// the interior is filled.
function mkmap_init_fill(bg_typ, fg_typ, state) {
    const limit = Math.trunc((WIDTH * HEIGHT * 2) / 5);
    let count = 0;
    while (count < limit) {
        const x = rn1(WIDTH - 1, 2);
        const y = rnd(HEIGHT - 1);
        if (state.level.at(x, y).typ === bg_typ) {
            state.level.at(x, y).typ = fg_typ;
            count++;
        }
    }
}

// C ref: mkmap.c get_map(). Return the terrain at (col,row), or bg_typ
// if out of bounds.
function mkmap_get_map(col, row, bg_typ, state) {
    if (col <= 0 || row < 0 || col > WIDTH || row >= HEIGHT)
        return bg_typ;
    return state.level.at(col, row).typ;
}

// C ref: mkmap.c pass_one(). Cellular automata: cells with <= 2 fg
// neighbors die; cells with >= 5 fg neighbors are born.
function mkmap_pass_one(bg_typ, fg_typ, state) {
    for (let x = 2; x <= WIDTH; x++) {
        for (let y = 1; y < HEIGHT; y++) {
            let count = 0;
            for (let dr = 0; dr < 8; dr++) {
                if (mkmap_get_map(
                    x + mkmap_dirs[dr * 2],
                    y + mkmap_dirs[dr * 2 + 1],
                    bg_typ, state,
                ) === fg_typ)
                    count++;
            }
            switch (count) {
            case 0: case 1: case 2:
                state.level.at(x, y).typ = bg_typ;
                break;
            case 5: case 6: case 7: case 8:
                state.level.at(x, y).typ = fg_typ;
                break;
            default:
                break;
            }
        }
    }
}

// C ref: mkmap.c pass_two(). Cells with exactly 5 fg neighbors become bg.
function mkmap_pass_two(bg_typ, fg_typ, state) {
    const newLocs = new Array((WIDTH + 1) * HEIGHT);
    for (let x = 2; x <= WIDTH; x++) {
        for (let y = 1; y < HEIGHT; y++) {
            let count = 0;
            for (let dr = 0; dr < 8; dr++) {
                if (mkmap_get_map(
                    x + mkmap_dirs[dr * 2],
                    y + mkmap_dirs[dr * 2 + 1],
                    bg_typ, state,
                ) === fg_typ)
                    count++;
            }
            if (count === 5)
                newLocs[y * (WIDTH + 1) + x] = bg_typ;
            else
                newLocs[y * (WIDTH + 1) + x]
                    = mkmap_get_map(x, y, bg_typ, state);
        }
    }
    for (let x = 2; x <= WIDTH; x++)
        for (let y = 1; y < HEIGHT; y++)
            state.level.at(x, y).typ = newLocs[y * (WIDTH + 1) + x];
}

// C ref: mkmap.c pass_three(). Smoothing: cells with < 3 fg neighbors
// become bg.
function mkmap_pass_three(bg_typ, fg_typ, state) {
    const newLocs = new Array((WIDTH + 1) * HEIGHT);
    for (let x = 2; x <= WIDTH; x++) {
        for (let y = 1; y < HEIGHT; y++) {
            let count = 0;
            for (let dr = 0; dr < 8; dr++) {
                if (mkmap_get_map(
                    x + mkmap_dirs[dr * 2],
                    y + mkmap_dirs[dr * 2 + 1],
                    bg_typ, state,
                ) === fg_typ)
                    count++;
            }
            if (count < 3)
                newLocs[y * (WIDTH + 1) + x] = bg_typ;
            else
                newLocs[y * (WIDTH + 1) + x]
                    = mkmap_get_map(x, y, bg_typ, state);
        }
    }
    for (let x = 2; x <= WIDTH; x++)
        for (let y = 1; y < HEIGHT; y++)
            state.level.at(x, y).typ = newLocs[y * (WIDTH + 1) + x];
}

// C ref: mkmap.c flood_fill_rm(). Flood-fill from (sx,sy) marking all
// contiguous cells of the same terrain type with roomno. Tracks bounding
// box in state._mkmap_min/max. When anyroom is true, IS_ROOM terrain
// matches and adjacent walls receive the roomno as well.
function flood_fill_rm(sx, sy, rmno, lit, anyroom, state) {
    const fg_typ = state.level.at(sx, sy).typ;

    // Back up to leftmost uninitialized location.
    while (sx > 0
        && (anyroom
            ? IS_ROOM(state.level.at(sx, sy).typ)
            : state.level.at(sx, sy).typ === fg_typ)
        && state.level.at(sx, sy).roomno !== rmno)
        sx--;
    sx++;

    if (sx < state._mkmap_min_rx) state._mkmap_min_rx = sx;
    if (sy < state._mkmap_min_ry) state._mkmap_min_ry = sy;

    let i;
    for (i = sx;
        i <= WIDTH && state.level.at(i, sy).typ === fg_typ;
        i++) {
        state.level.at(i, sy).roomno = rmno;
        state.level.at(i, sy).lit = lit;
        if (anyroom) {
            for (let ii = (i === sx ? i - 1 : i); ii <= i + 1; ii++) {
                for (let jj = sy - 1; jj <= sy + 1; jj++) {
                    if (isok(ii, jj)
                        && (IS_WALL(state.level.at(ii, jj).typ)
                            || IS_DOOR(state.level.at(ii, jj).typ)
                            || state.level.at(ii, jj).typ === SDOOR)) {
                        state.level.at(ii, jj).edge = true;
                        if (lit)
                            state.level.at(ii, jj).lit = lit;
                        if (state.level.at(ii, jj).roomno === NO_ROOM)
                            state.level.at(ii, jj).roomno = rmno;
                        else if (state.level.at(ii, jj).roomno !== rmno)
                            state.level.at(ii, jj).roomno = SHARED;
                    }
                }
            }
        }
        state._mkmap_n_loc_filled++;
    }
    const nx = i;

    if (isok(sx, sy - 1)) {
        for (i = sx; i < nx; i++) {
            if (state.level.at(i, sy - 1).typ === fg_typ) {
                if (state.level.at(i, sy - 1).roomno !== rmno)
                    flood_fill_rm(i, sy - 1, rmno, lit, anyroom, state);
            } else {
                if ((i > sx || isok(i - 1, sy - 1))
                    && state.level.at(i - 1, sy - 1).typ === fg_typ) {
                    if (state.level.at(i - 1, sy - 1).roomno !== rmno)
                        flood_fill_rm(
                            i - 1, sy - 1, rmno, lit, anyroom, state,
                        );
                }
                if ((i < nx - 1 || isok(i + 1, sy - 1))
                    && state.level.at(i + 1, sy - 1).typ === fg_typ) {
                    if (state.level.at(i + 1, sy - 1).roomno !== rmno)
                        flood_fill_rm(
                            i + 1, sy - 1, rmno, lit, anyroom, state,
                        );
                }
            }
        }
    }
    if (isok(sx, sy + 1)) {
        for (i = sx; i < nx; i++) {
            if (state.level.at(i, sy + 1).typ === fg_typ) {
                if (state.level.at(i, sy + 1).roomno !== rmno)
                    flood_fill_rm(i, sy + 1, rmno, lit, anyroom, state);
            } else {
                if ((i > sx || isok(i - 1, sy + 1))
                    && state.level.at(i - 1, sy + 1).typ === fg_typ) {
                    if (state.level.at(i - 1, sy + 1).roomno !== rmno)
                        flood_fill_rm(
                            i - 1, sy + 1, rmno, lit, anyroom, state,
                        );
                }
                if ((i < nx - 1 || isok(i + 1, sy + 1))
                    && state.level.at(i + 1, sy + 1).typ === fg_typ) {
                    if (state.level.at(i + 1, sy + 1).roomno !== rmno)
                        flood_fill_rm(
                            i + 1, sy + 1, rmno, lit, anyroom, state,
                        );
                }
            }
        }
    }

    if (nx > state._mkmap_max_rx) state._mkmap_max_rx = nx - 1;
    if (sy > state._mkmap_max_ry) state._mkmap_max_ry = sy;
}

// C ref: mkmap.c join_map_cleanup(). Clear room assignments after joining.
function mkmap_join_map_cleanup(state) {
    for (let x = 1; x < COLNO; x++)
        for (let y = 0; y < ROWNO; y++)
            state.level.at(x, y).roomno = NO_ROOM;
    state.level.nroom = 0;
    state.nsubroom = 0;
    if (state.level.rooms[0]) state.level.rooms[0].hx = -1;
    if (state.subrooms?.[0]) state.subrooms[0].hx = -1;
}

// C ref: mkmap.c join_map(). Flood-fill to find fg_typ regions, create
// temporary rooms for them, then dig corridors to connect adjacent regions.
function mkmap_join_map(bg_typ, fg_typ, state) {
    // Find all regions via flood fill and create rooms for them.
    for (let x = 2; x <= WIDTH; x++) {
        for (let y = 1; y < HEIGHT; y++) {
            if (state.level.at(x, y).typ === fg_typ
                && state.level.at(x, y).roomno === NO_ROOM) {
                state._mkmap_min_rx = x;
                state._mkmap_max_rx = x;
                state._mkmap_min_ry = y;
                state._mkmap_max_ry = y;
                state._mkmap_n_loc_filled = 0;
                flood_fill_rm(
                    x, y,
                    state.level.nroom + ROOMOFFSET,
                    false, false, state,
                );
                if (state._mkmap_n_loc_filled > 3) {
                    add_room(
                        state._mkmap_min_rx, state._mkmap_min_ry,
                        state._mkmap_max_rx, state._mkmap_max_ry,
                        false, OROOM, true,
                    );
                    state.level.rooms[state.level.nroom - 1].irregular
                        = true;
                    if (state.level.nroom >= MAXNROFROOMS * 2)
                        break; // goto joinm
                } else {
                    // Tiny hole: erase it.
                    for (let sx = state._mkmap_min_rx;
                        sx <= state._mkmap_max_rx; sx++) {
                        for (let sy = state._mkmap_min_ry;
                            sy <= state._mkmap_max_ry; sy++) {
                            if (state.level.at(sx, sy).roomno
                                === state.level.nroom + ROOMOFFSET) {
                                state.level.at(sx, sy).typ = bg_typ;
                                state.level.at(sx, sy).roomno = NO_ROOM;
                            }
                        }
                    }
                }
            }
        }
    }

    // Connect adjacent regions with corridors.
    const rooms = state.level.rooms;
    let ci = 0;
    let ci2 = 1;
    while (ci2 < state.level.nroom) {
        const croom = rooms[ci];
        const croom2 = rooms[ci2];
        const sm = {};
        const em = {};
        if (!somexy(croom, sm) || !somexy(croom2, em)) {
            sm.x = croom.lx + Math.trunc((croom.hx - croom.lx) / 2);
            sm.y = croom.ly + Math.trunc((croom.hy - croom.ly) / 2);
            em.x = croom2.lx + Math.trunc((croom2.hx - croom2.lx) / 2);
            em.y = croom2.ly + Math.trunc((croom2.hy - croom2.ly) / 2);
        }
        dig_corridor(sm, em, null, false, fg_typ, bg_typ);
        if (croom2.lx > croom.hx
            || ((croom2.ly > croom.hy || croom2.hy < croom.ly)
                && rn2(3))) {
            ci = ci2;
        }
        ci2++;
    }
    mkmap_join_map_cleanup(state);
}

// C ref: mkmap.c finish_map(). Apply wallification and lighting.
function mkmap_finish_map(fg_typ, bg_typ, lit, walled, icedpools, state) {
    if (walled)
        wallify_map(1, 0, COLNO - 1, ROWNO - 1, state);

    if (lit) {
        for (let x = 1; x < COLNO; x++) {
            for (let y = 0; y < ROWNO; y++) {
                const loc = state.level.at(x, y);
                if ((!IS_OBSTRUCTED(fg_typ) && loc.typ === fg_typ)
                    || (!IS_OBSTRUCTED(bg_typ) && loc.typ === bg_typ)
                    || (bg_typ === TREE && loc.typ === bg_typ)
                    || (walled && IS_WALL(loc.typ)))
                    loc.lit = true;
            }
        }
        for (let i = 0; i < state.level.nroom; i++)
            state.level.rooms[i].rlit = 1;
    }
    // Light lava; tag ice as frozen pool or moat.
    for (let x = 1; x < COLNO; x++) {
        for (let y = 0; y < ROWNO; y++) {
            const loc = state.level.at(x, y);
            if (loc.typ === LAVAPOOL) loc.lit = true;
            else if (loc.typ === ICE)
                loc.icedpool = icedpools ? 1 /* ICED_POOL */ : 2;
        }
    }
}

// C ref: mkmap.c mkmap(). Top-level cave generator: fill, automata passes,
// optional smoothing and joining, then finish with walls and lighting.
function mkmap(init_lev, state) {
    const bg_typ = init_lev.bg;
    const fg_typ = init_lev.fg;
    const smooth = init_lev.smoothed;
    const join = init_lev.joined;
    let lit = init_lev.lit;
    const walled = init_lev.walled;

    lit = litstate_rnd(lit);

    mkmap_init_map(bg_typ, state);
    mkmap_init_fill(bg_typ, fg_typ, state);

    for (let i = 0; i < N_P1_ITER; i++)
        mkmap_pass_one(bg_typ, fg_typ, state);

    for (let i = 0; i < N_P2_ITER; i++)
        mkmap_pass_two(bg_typ, fg_typ, state);

    if (smooth)
        for (let i = 0; i < N_P3_ITER; i++)
            mkmap_pass_three(bg_typ, fg_typ, state);

    if (join)
        mkmap_join_map(bg_typ, fg_typ, state);

    mkmap_finish_map(
        fg_typ, bg_typ, lit, walled,
        init_lev.icedpools ?? false, state,
    );
    // A walled, joined level is cavernous, not mazelike.
    if (walled && join) {
        state.level.flags.is_maze_lev = false;
        state.level.flags.is_cavernous_lev = true;
    }
}

// C ref: sp_lev.c flip_dbridge_horizontal(). A drawbridge facing west now
// faces east, and the reverse.
function flip_dbridge_horizontal(lev) {
    if (IS_DRAWBRIDGE(lev.typ)) {
        if ((lev.drawbridgemask & DB_DIR) === DB_WEST) {
            lev.drawbridgemask &= ~DB_WEST;
            lev.drawbridgemask |= DB_EAST;
        } else if ((lev.drawbridgemask & DB_DIR) === DB_EAST) {
            lev.drawbridgemask &= ~DB_EAST;
            lev.drawbridgemask |= DB_WEST;
        }
    }
}

// C ref: sp_lev.c flip_dbridge_vertical(). A drawbridge facing north now
// faces south, and the reverse.
function flip_dbridge_vertical(lev) {
    if (IS_DRAWBRIDGE(lev.typ)) {
        if ((lev.drawbridgemask & DB_DIR) === DB_NORTH) {
            lev.drawbridgemask &= ~DB_NORTH;
            lev.drawbridgemask |= DB_SOUTH;
        } else if ((lev.drawbridgemask & DB_DIR) === DB_SOUTH) {
            lev.drawbridgemask &= ~DB_SOUTH;
            lev.drawbridgemask |= DB_NORTH;
        }
    }
}

// C ref: sp_lev.c flip_visuals(). For #wizfliplevel; not needed when
// flipping during level creation. Updates the seen vector of every seen
// square in the flip area and the glyph of remembered walls.
function flip_visuals(flp, minx, miny, maxx, maxy, state = game) {
    for (let y = miny; y <= maxy; ++y) {
        for (let x = minx; x <= maxx; ++x) {
            const lev = state.level.at(x, y);
            let seenv = lev.seenv & 0xff;
            /* locations which haven't been seen can be skipped */
            if (seenv === 0)
                continue;
            /* flip <x,y>'s seen vector; not necessary for locations seen
               from all directions (the whole level after magic mapping) */
            if (seenv !== SVALL) {
                /* SV2 SV1 SV0 *
                 * SV3 -+- SV7 *
                 * SV4 SV5 SV6 */
                if (flp & 1) { /* swap top and bottom */
                    seenv = swapbits(seenv, 2, 4);
                    seenv = swapbits(seenv, 1, 5);
                    seenv = swapbits(seenv, 0, 6);
                }
                if (flp & 2) { /* swap left and right */
                    seenv = swapbits(seenv, 2, 0);
                    seenv = swapbits(seenv, 3, 7);
                    seenv = swapbits(seenv, 4, 6);
                }
                lev.seenv = seenv & 0xff;
            }
            /* if <x,y> is displayed as a wall, reset its display glyph so
               that remembered, out of view T's and corners get flipped */
            if ((IS_WALL(lev.typ) || lev.typ === SDOOR)
                && glyph_is_cmap(lev.glyph))
                lev.glyph = back_to_glyph(x, y, state);
        }
    }
}

// C ref: sp_lev.c flip_encoded_dir_bits(). Transposes an encoded direction
// bit set (the xdir[]/ydir[] order) for a vertical (flp & 1) or horizontal
// (flp & 2) flip.
export function flip_encoded_dir_bits(flp, val) {
    /* these depend on xdir[] and ydir[] order */
    if (flp & 1) {
        val = swapbits(val, 1, 7);
        val = swapbits(val, 2, 6);
        val = swapbits(val, 3, 5);
    }
    if (flp & 2) {
        val = swapbits(val, 1, 3);
        val = swapbits(val, 0, 4);
        val = swapbits(val, 7, 5);
    }

    return val;
}

// C ref: sp_lev.c flip_vault_guard(). For #wizfliplevel; flips the guard's
// egd data (its two goal squares and the fake corridor) within the flip
// area. Not needed for level creation.
export function flip_vault_guard(flp, grd, minx, miny, maxx, maxy) {
    const FlipX = (val) => (maxx - val) + minx;
    const FlipY = (val) => (maxy - val) + miny;
    const inFlipArea = (x, y) => x >= minx && x <= maxx
        && y >= miny && y <= maxy;
    const egd = EGD(grd);

    if (inFlipArea(egd.gdx, egd.gdy)) {
        if (flp & 1)
            egd.gdy = FlipY(egd.gdy);
        if (flp & 2)
            egd.gdx = FlipX(egd.gdx);
    }
    if (inFlipArea(egd.ogx, egd.ogy)) {
        if (flp & 1)
            egd.ogy = FlipY(egd.ogy);
        if (flp & 2)
            egd.ogx = FlipX(egd.ogx);
    }
    for (let i = egd.fcbeg; i < egd.fcend; ++i) {
        const fx = egd.fakecorr[i].fx, fy = egd.fakecorr[i].fy;

        if (inFlipArea(fx, fy)) {
            if (flp & 1)
                egd.fakecorr[i].fy = FlipY(fy);
            if (flp & 2)
                egd.fakecorr[i].fx = FlipX(fx);
        }
    }
}

// C ref: sp_lev.c flip_level() (533-922). Transposes the level horizontally
// (flp & 2, left↔right) or vertically (flp & 1, top↔bottom) or both. Level
// creation passes extras=false; #wizfliplevel (not ported) would pass true,
// and only its vault-guard and visual updates are wired here: the hero,
// ball and chain, migrating monsters, timers, travel and digging positions
// stay unflipped.
function flip_level(flp, extras = false) {
    if ((flp & 3) === 0) return;

    let { xmin: minx, xmax: maxx, ymin: miny, ymax: maxy } = get_level_extends();
    if (miny < 0) miny = 0;
    if (minx < 1) minx = 1;
    if (maxx >= COLNO) maxx = COLNO - 1;
    if (maxy >= ROWNO) maxy = ROWNO - 1;

    const FlipX = (val) => (maxx - val) + minx;
    const FlipY = (val) => (maxy - val) + miny;
    const inFlipArea = (x, y) => x >= minx && x <= maxx && y >= miny && y <= maxy;

    const level = game.level;

    // C ref: sp_lev.c:587-592. Stairs and ladders.
    for (let stway = game.stairs; stway; stway = stway.next) {
        if (flp & 1) stway.sy = FlipY(stway.sy);
        if (flp & 2) stway.sx = FlipX(stway.sx);
    }

    // C ref: sp_lev.c:594-616. Traps.
    for (const trap of level.traps) {
        if (!inFlipArea(trap.tx, trap.ty)) continue;
        if (flp & 1) {
            trap.ty = FlipY(trap.ty);
            if (trap.ttyp === ROLLING_BOULDER_TRAP) {
                trap.launch.y = FlipY(trap.launch.y);
                trap.launch2.y = FlipY(trap.launch2.y);
            } else if (is_pit(trap.ttyp) && trap.conjoined) {
                trap.conjoined = flip_encoded_dir_bits(flp, trap.conjoined);
            }
        }
        if (flp & 2) {
            trap.tx = FlipX(trap.tx);
            if (trap.ttyp === ROLLING_BOULDER_TRAP) {
                trap.launch.x = FlipX(trap.launch.x);
                trap.launch2.x = FlipX(trap.launch2.x);
            } else if (is_pit(trap.ttyp) && trap.conjoined) {
                trap.conjoined = flip_encoded_dir_bits(flp, trap.conjoined);
            }
        }
    }

    // C ref: sp_lev.c:618-626. Floor objects.
    for (let otmp = level.objlist; otmp; otmp = otmp.nobj) {
        if (!inFlipArea(otmp.ox, otmp.oy)) continue;
        if (flp & 1) otmp.oy = FlipY(otmp.oy);
        if (flp & 2) otmp.ox = FlipX(otmp.ox);
    }

    // C ref: sp_lev.c:628-636. Buried objects.
    for (let otmp = level.buriedobjlist; otmp; otmp = otmp.nobj) {
        if (!inFlipArea(otmp.ox, otmp.oy)) continue;
        if (flp & 1) otmp.oy = FlipY(otmp.oy);
        if (flp & 2) otmp.ox = FlipX(otmp.ox);
    }

    // C ref: sp_lev.c:638-673. Monsters.
    for (let mtmp = level.monlist; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.isgd) {
            if (extras) /* flip mtmp->mextra->egd */
                flip_vault_guard(flp, mtmp, minx, miny, maxx, maxy);
            if (mtmp.mx === 0) /* not on map so don't flip guard->mx,my */
                continue;
        }
        /* skip the occasional earth elemental outside the flip area */
        if (!inFlipArea(mtmp.mx, mtmp.my)) continue;
        if (flp & 1) mtmp.my = FlipY(mtmp.my);
        if (flp & 2) mtmp.mx = FlipX(mtmp.mx);
        // C ref: sp_lev.c:654 Flip_coord(mtmp->mgoal)
        if (mtmp.mgoal) {
            if (flp & 1 && mtmp.mgoal.y !== undefined) mtmp.mgoal.y = FlipY(mtmp.mgoal.y);
            if (flp & 2 && mtmp.mgoal.x !== undefined) mtmp.mgoal.x = FlipX(mtmp.mgoal.x);
        }
        // C ref: sp_lev.c:656-666. Priest/shopkeeper/worm special coords are
        // not yet ported; skip for level creation.
    }

    // C ref: sp_lev.c:689-695. Engravings.
    for (let etmp = game.head_engr; etmp; etmp = etmp.nxt_engr) {
        if (flp & 1) etmp.engr_y = FlipY(etmp.engr_y);
        if (flp & 2) etmp.engr_x = FlipX(etmp.engr_x);
    }

    // C ref: sp_lev.c:697-733. Level (teleport) regions, which
    // levregion_add() stored and fixup_special() has not consumed yet. Both
    // areas are mirrored, an absent exclusion's -1 corners included.
    for (const lr of game.lregions) {
        for (const area of [lr.inarea, lr.delarea]) {
            if (flp & 1) {
                area.y1 = FlipY(area.y1);
                area.y2 = FlipY(area.y2);
                if (area.y1 > area.y2) {
                    const t = area.y1; area.y1 = area.y2; area.y2 = t;
                }
            }
        }
        for (const area of [lr.inarea, lr.delarea]) {
            if (flp & 2) {
                area.x1 = FlipX(area.x1);
                area.x2 = FlipX(area.x2);
                if (area.x1 > area.x2) {
                    const t = area.x1; area.x1 = area.x2; area.x2 = t;
                }
            }
        }
    }

    // C ref: sp_lev.c:735-762. Active regions (poison clouds, etc.).
    for (const region of level.regions) {
        const bb = region.bounding_box;
        if (flp & 1) {
            const t1 = FlipY(bb.ly), t2 = FlipY(bb.hy);
            bb.ly = Math.min(t1, t2); bb.hy = Math.max(t1, t2);
            for (const rect of region.rects) {
                const r1 = FlipY(rect.ly), r2 = FlipY(rect.hy);
                rect.ly = Math.min(r1, r2); rect.hy = Math.max(r1, r2);
            }
        }
        if (flp & 2) {
            const t1 = FlipX(bb.lx), t2 = FlipX(bb.hx);
            bb.lx = Math.min(t1, t2); bb.hx = Math.max(t1, t2);
            for (const rect of region.rects) {
                const r1 = FlipX(rect.lx), r2 = FlipX(rect.hx);
                rect.lx = Math.min(r1, r2); rect.hx = Math.max(r1, r2);
            }
        }
    }

    // C ref: sp_lev.c:764-811. Rooms and subrooms.
    for (const sroom of level.rooms) {
        if (sroom.hx < 0) break;
        if (flp & 1) {
            sroom.ly = FlipY(sroom.ly); sroom.hy = FlipY(sroom.hy);
            if (sroom.ly > sroom.hy) { const t = sroom.ly; sroom.ly = sroom.hy; sroom.hy = t; }
        }
        if (flp & 2) {
            sroom.lx = FlipX(sroom.lx); sroom.hx = FlipX(sroom.hx);
            if (sroom.lx > sroom.hx) { const t = sroom.lx; sroom.lx = sroom.hx; sroom.hx = t; }
        }
        if (sroom.sbrooms) {
            for (const sub of sroom.sbrooms) {
                if (flp & 1) {
                    sub.ly = FlipY(sub.ly); sub.hy = FlipY(sub.hy);
                    if (sub.ly > sub.hy) { const t = sub.ly; sub.ly = sub.hy; sub.hy = t; }
                }
                if (flp & 2) {
                    sub.lx = FlipX(sub.lx); sub.hx = FlipX(sub.hx);
                    if (sub.lx > sub.hx) { const t = sub.lx; sub.lx = sub.hx; sub.hx = t; }
                }
            }
        }
    }

    // C ref: sp_lev.c:813-816. Doors.
    for (let i = 0; i < level.doorindex; i++) {
        const door = level.doors[i];
        if (flp & 1) door.y = FlipY(door.y);
        if (flp & 2) door.x = FlipX(door.x);
    }

    // C ref: sp_lev.c:818-860. The map: swap terrain, object grid, and
    // monster grid, turning drawbridges to face the other way first.
    if (flp & 1) {
        for (let x = minx; x <= maxx; x++) {
            const half = miny + Math.trunc((maxy - miny + 1) / 2);
            for (let y = miny; y < half; y++) {
                const ny = FlipY(y);

                flip_dbridge_vertical(level.locations[x][y]);
                flip_dbridge_vertical(level.locations[x][ny]);

                const trm = level.locations[x][y];
                level.locations[x][y] = level.locations[x][ny];
                level.locations[x][ny] = trm;
                const otmp = level.objects[x][y];
                level.objects[x][y] = level.objects[x][ny];
                level.objects[x][ny] = otmp;
                const mtmp = level.monsters[x][y];
                level.monsters[x][y] = level.monsters[x][ny];
                level.monsters[x][ny] = mtmp;
            }
        }
    }
    if (flp & 2) {
        const half = minx + Math.trunc((maxx - minx + 1) / 2);
        for (let x = minx; x < half; x++) {
            for (let y = miny; y <= maxy; y++) {
                const nx = FlipX(x);

                flip_dbridge_horizontal(level.locations[x][y]);
                flip_dbridge_horizontal(level.locations[nx][y]);

                const trm = level.locations[x][y];
                level.locations[x][y] = level.locations[nx][y];
                level.locations[nx][y] = trm;
                const otmp = level.objects[x][y];
                level.objects[x][y] = level.objects[nx][y];
                level.objects[nx][y] = otmp;
                const mtmp = level.monsters[x][y];
                level.monsters[x][y] = level.monsters[nx][y];
                level.monsters[nx][y] = mtmp;
            }
        }
    }

    // C ref: sp_lev.c:877-896. Exclusion zones.
    for (let ez = game.exclusion_zones; ez; ez = ez.next) {
        if (flp & 1) {
            ez.ly = FlipY(ez.ly); ez.hy = FlipY(ez.hy);
            if (ez.ly > ez.hy) { const t = ez.ly; ez.ly = ez.hy; ez.hy = t; }
        }
        if (flp & 2) {
            ez.lx = FlipX(ez.lx); ez.hx = FlipX(ez.hx);
            if (ez.lx > ez.hx) { const t = ez.lx; ez.lx = ez.hx; ez.hx = t; }
        }
    }

    // C ref: sp_lev.c:915. Recalculate wall junction types after the swap.
    fix_wall_spines(1, 0, COLNO - 1, ROWNO - 1);
    if (extras && flp) {
        set_wall_state(game);
        /* after wall_spines; flips seenv and wall joins */
        flip_visuals(flp, minx, miny, maxx, maxy, game);
    }
}

// C ref: sp_lev.c flip_level_rnd() (967-982). Each bit of flp enables one
// axis; each enabled axis consumes rn2(2). When the combined result is
// nonzero, flip_level() mirrors the map.
function flip_level_rnd(flp) {
    let c = 0;
    if ((flp & 1) && rn2(2)) c |= 1;
    if ((flp & 2) && rn2(2)) c |= 2;
    if (c) flip_level(c);
    return c;
}

// C ref: mkmaze.c walkfrom() (non-MICRO recursive version). Carves a
// maze by picking a random viable direction, setting the intermediate
// cell, then recursing into the destination. The C code modifies x,y
// in place via mz_move before the recursive call, so after the call
// returns the while loop continues from the DESTINATION, not the
// original cell. This produces a different carving order from a
// standard iterative DFS, so an iterative stack-based version would
// NOT match the C. The Castle level's maze wings are small enough
// (about 8x17 cells) that recursion depth stays well within limits.
// bounds defaults match the full maze area used by special levels.
// create_maze() passes reduced bounds when generating a scaled maze.
function walkfrom(x, y, typ, state, bounds) {
    if (!typ) {
        typ = state.level.flags.corrmaze ? CORR : ROOM;
    }
    if (!IS_DOOR(state.level.at(x, y).typ)) {
        state.level.at(x, y).typ = typ;
        state.level.at(x, y).flags = 0;
    }
    // C ref: mkmaze.c mz_move(). Direction mapping:
    // 0=north(y--), 1=east(x++), 2=south(y++), 3=west(x--).
    const dx = [0, 1, 0, -1];
    const dy = [-1, 0, 1, 0];
    for (;;) {
        let q = 0;
        const dirs = [0, 0, 0, 0];
        for (let a = 0; a < 4; ++a) {
            if (okay(x, y, a, state, bounds)) dirs[q++] = a;
        }
        if (!q) return;
        const dir = dirs[rn2(q)];
        // mz_move step 1: advance to intermediate cell and set it.
        x += dx[dir];
        y += dy[dir];
        if (!IS_DOOR(state.level.at(x, y).typ)) {
            state.level.at(x, y).typ = typ;
            state.level.at(x, y).flags = 0;
        }
        // mz_move step 2: advance to destination cell.
        x += dx[dir];
        y += dy[dir];
        // Recurse; after it returns, x,y still point to the destination
        // (matching the C behavior where mz_move modifies x,y in place).
        walkfrom(x, y, typ, state, bounds);
    }
}

// C ref: mkmaze.c move(). Opens the cell between the old and new
// positions during maze walking.
function maze_move(x, y, typ, state) {
    if (!IS_DOOR(state.level.at(x, y).typ)) {
        state.level.at(x, y).typ = typ;
        state.level.at(x, y).flags = 0;
    }
}

// C ref: sp_lev.c rndtrap(). Picks a random trap type, excluding holes,
// vibrating squares, magic portals, and conditionally trapdoors and
// teleport traps.
function rndtrap(state) {
    let rtrap;
    do {
        rtrap = rnd(TRAPNUM - 1);
        switch (rtrap) {
        case HOLE:
        case VIBRATING_SQUARE:
        case MAGIC_PORTAL:
            rtrap = NO_TRAP;
            break;
        case TRAPDOOR:
            if (!Can_dig_down(state.u?.uz, state))
                rtrap = NO_TRAP;
            break;
        case LEVEL_TELEP:
        case TELEP_TRAP:
            if (state.level.flags.noteleport)
                rtrap = NO_TRAP;
            break;
        case ROLLING_BOULDER_TRAP:
        case ROCKTRAP:
            if (In_endgame(state.u?.uz))
                rtrap = NO_TRAP;
            break;
        }
    } while (rtrap === NO_TRAP);
    return rtrap;
}

// C ref: sp_lev.c maze1xy(). Finds a random odd-parity location in the
// maze area that is not covered by SpLev_Map and satisfies the humidity
// check. Uses rn1 for x and y, burning RNG calls on each attempt.
function maze1xy(humidity, frame, state) {
    let x, y, tryct = 2000;
    do {
        x = rn1(frame.xMazeMax - 3, 3);
        y = rn1(frame.yMazeMax - 3, 3);
        if (--tryct < 0) break;
    } while (
        !(x % 2) || !(y % 2)
        || (frame.splevMap && frame.splevMap[x][y])
        || !is_ok_location(x, y, humidity, { state })
    );
    return { x, y };
}

// C ref: sp_lev.c fill_empty_maze(). Fills unused maze area with random
// objects, boulders, minotaurs, monsters, gold, and traps proportional
// to how much of the maze the special-level map did not cover.
function fill_empty_maze(frame, state, env) {
    let mapcountmax, mapcount;
    mapcountmax = mapcount =
        (frame.xMazeMax - 2) * (frame.yMazeMax - 2);
    mapcountmax = Math.trunc(mapcountmax / 2);

    for (let x = 2; x < frame.xMazeMax; x++) {
        for (let y = 0; y < frame.yMazeMax; y++) {
            if (frame.splevMap && frame.splevMap[x][y])
                mapcount--;
        }
    }

    if (mapcount > Math.trunc(mapcountmax / 10)) {
        const mapfact = Math.trunc((mapcount * 100) / mapcountmax);
        // Objects: gems or random class
        for (let i = rnd(Math.trunc((20 * mapfact) / 100)); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            mkobj_at(rn2(2) ? GEM_CLASS : RANDOM_CLASS,
                mm.x, mm.y, true, env);
        }
        // Boulders
        for (let i = rnd(Math.trunc((12 * mapfact) / 100)); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            const ttmp = t_at(mm.x, mm.y, state);
            if (ttmp && (is_pit(ttmp.ttyp) || is_hole(ttmp.ttyp)))
                continue;
            mksobj_at(BOULDER, mm.x, mm.y, true, false, env);
        }
        // Minotaurs
        for (let i = rn2(2); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            makemon(
                state.mons[PM_MINOTAUR],
                mm.x,
                mm.y,
                NO_MM_FLAGS,
                { ...env, _fillEmptyMazeMinotaur: true },
            );
        }
        // Random monsters
        for (let i = rnd(Math.trunc((12 * mapfact) / 100)); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            makemon(null, mm.x, mm.y, NO_MM_FLAGS, env);
        }
        // Gold
        for (let i = rn2(Math.trunc((15 * mapfact) / 100)); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            mkgold(0, mm.x, mm.y, env);
        }
        // Traps
        for (let i = rn2(Math.trunc((15 * mapfact) / 100)); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            let trytrap = rndtrap(state);
            if (sobj_at(BOULDER, mm.x, mm.y, state)) {
                while (is_pit(trytrap) || is_hole(trytrap))
                    trytrap = rndtrap(state);
            }
            maketrap(mm.x, mm.y, trytrap, env);
        }
    }
}

// C ref: sp_lev.c lspo_map(). The themed-room form chooses an unconstrained
// origin, preserves transparent cells, and retries rather than overwriting a
// previously generated room.
export function lspo_map(definition, random = rn2, state = game) {
    const { width, height, map: rows } = definition;
    if (!rows || width <= 0 || height <= 0) return null;
    let tryct = 0;
    let xstart;
    let ystart;
    for (;;) {
        xstart = 1 + random(COLNO - 1 - width);
        ystart = random(ROWNO - height);
        if (themeroom_map_fits(definition, xstart, ystart, state)) break;
        if (tryct++ >= 100) return null;
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const typ = splev_chr2typ(rows[y][x]);
            if (typ >= MAX_TYPE) continue;
            set_themeroom_map_terrain(xstart + x, ystart + y, typ, state);
        }
    }
    return { x: xstart, y: ystart, width, height };
}

// C ref: mkmap.c flood_fill_rm(..., anyroom=TRUE), as used by
// sp_lev.c:lspo_region() for an irregular themed-room region.
function flood_fill_themeroom(sx, sy, roomno, lit, state) {
    const target = state.level.at(sx, sy)?.typ;
    if (target !== ROOM) return null;
    const stack = [[sx, sy]];
    let minx = sx, maxx = sx, miny = sy, maxy = sy;
    while (stack.length) {
        const [x, y] = stack.pop();
        const loc = state.level.at(x, y);
        if (!loc || loc.typ !== target || loc.roomno === roomno) continue;
        loc.roomno = roomno;
        loc.lit = !!lit;
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);

        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
        for (let xx = x - 1; xx <= x + 1; xx++) {
            for (let yy = y - 1; yy <= y + 1; yy++) {
                const edge = state.level.at(xx, yy);
                if (!edge || !(IS_WALL(edge.typ) || IS_DOOR(edge.typ) || edge.typ === SDOOR))
                    continue;
                edge.edge = true;
                if (lit) edge.lit = true;
                if (edge.roomno === 0) edge.roomno = roomno;
                else if (edge.roomno !== roomno) edge.roomno = SHARED;
            }
        }
    }
    return { minx, maxx, miny, maxy };
}

export class UnsupportedThemeroomActionError extends Error {
    constructor(definition, detail) {
        super(`themed room ${JSON.stringify(definition?.name ?? definition?.id)} ${detail}`);
        this.name = 'UnsupportedThemeroomActionError';
        this.definitionId = definition?.id ?? null;
    }
}

function themeroom_random_facade(context, operation, streams) {
    const facade = context.randomFacade;
    for (const method of THEMEROOM_RANDOM_METHODS) {
        if (typeof facade?.[method] !== 'function') {
            throw new UnsupportedThemeroomActionError(
                context.definition,
                `requires randomFacade.${method} for ${operation}`,
            );
        }
    }
    if (facade.rn2 !== context.random
        || facade.rnd !== context.randomOneBased) {
        throw new UnsupportedThemeroomActionError(
            context.definition,
            `requires randomFacade.rn2/rnd to match the ${streams} RNG streams`,
        );
    }
    return facade;
}

function preflight_themeroom_fill(definition, context) {
    if (typeof context.themeroomFill !== 'function') {
        throw new UnsupportedThemeroomActionError(
            definition,
            'requires an injected themeroom-fill callback',
        );
    }
    if (!Number.isInteger(context.difficulty)) {
        throw new UnsupportedThemeroomActionError(
            definition,
            'requires an integer difficulty for its themeroom-fill callback',
        );
    }
    themeroom_random_facade(
        context,
        'its themeroom-fill callback',
        'map',
    );
    return true;
}

function invoke_themeroom_fill(room, definition, context) {
    // Callers validate before creating the room or loading its map.
    // Lua invokes contents before leaving the current room context. Keep this
    // call synchronous. This is the exact themeroom_fill(room, difficulty,
    // rawEnv) contract, including the indexed room that selection.room() needs.
    context.themeroomFill(room, context.difficulty, {
        state: game,
        random: context.randomFacade,
    });
}

// C ref: sp_lev.c lspo_region() irregular-room branch.
function register_irregular_map_region(
    seed,
    roomType,
    needfill,
    joined,
    context,
) {
    const state = game;
    const lit = litstate_rnd(
        -1,
        context.random,
        context.randomOneBased,
    );
    const roomIndex = state.level.nroom;
    const bounds = flood_fill_themeroom(
        seed.x,
        seed.y,
        roomIndex + ROOMOFFSET,
        lit,
        state,
    );
    if (!bounds) return null;
    state.smeq ??= new Array(MAXNROFROOMS + 1).fill(0);
    state.smeq[roomIndex] = roomIndex;
    add_room(
        bounds.minx, bounds.miny, bounds.maxx, bounds.maxy,
        false, roomType, true,
    );
    const room = state.level.rooms[roomIndex];
    room.rlit = lit ? 1 : 0;
    room.irregular = true;
    room.needjoining = joined;
    room.needfill = needfill;
    return room;
}

// C refs: themerms.lua filler_region(); sp_lev.c lspo_region().
function filler_region(filler, origin, definition, context) {
    const themed = context.random(100) < 30;
    if (themed) preflight_themeroom_fill(definition, context);
    const room = register_irregular_map_region(
        { x: origin.x + filler.x, y: origin.y + filler.y },
        themed ? THEMEROOM : OROOM,
        FILL_NORMAL,
        true,
        context,
    );
    if (!room) return false;
    if (themed) invoke_themeroom_fill(room, definition, context);
    return true;
}

const THEMEROOM_TYPE_MAP = {
    ordinary: OROOM, themed: THEMEROOM,
    shop: SHOPBASE, 'armor shop': ARMORSHOP,
    'scroll shop': SCROLLSHOP, 'potion shop': POTIONSHOP,
    'weapon shop': WEAPONSHOP, 'food shop': FOODSHOP,
    'ring shop': RINGSHOP, 'wand shop': WANDSHOP,
    'tool shop': TOOLSHOP, 'book shop': BOOKSHOP,
    'health food shop': FODDERSHOP,
    'candle shop': CANDLESHOP,
};
function room_type_from_schema(type, definition) {
    const rtype = THEMEROOM_TYPE_MAP[type];
    if (rtype !== undefined) return rtype;
    throw new UnsupportedThemeroomActionError(
        definition,
        `has unsupported room type ${JSON.stringify(type)}`,
    );
}

// C ref: sp_lev.c lspo_room(). Keep the callback boundary in one place so
// nested handlers share room failure propagation, parent irregularity, and
// the post-callback door-table scan. A returned room means that this descriptor
// was created; callers must inspect game.themeroom_failed (C's
// gt.themeroom_failed, which lspo_room() also sets) for aggregate failure
// because a nested descriptor can fail while this room still finalizes.
export function run_room_descriptor(spec, parent, context, contents = null) {
    if (game.themeroom_failed) return null;
    const room = build_room(
        {
            x: spec.x ?? -1,
            y: spec.y ?? -1,
            w: spec.w ?? -1,
            h: spec.h ?? -1,
            xalign: spec.xalign ?? -1,
            yalign: spec.yalign ?? -1,
            rtype: room_type_from_schema(
                spec.type ?? 'ordinary',
                context.definition,
            ),
            chance: spec.chance ?? 100,
            rlit: spec.lit ?? -1,
            needfill: spec.filled ?? FILL_NONE,
            joined: spec.joined ?? true,
        },
        parent,
        context.random,
        context.randomOneBased,
    );
    if (!room) {
        game.themeroom_failed = true;
        return null;
    }
    if (parent) parent.irregular = true;
    if (contents) contents(room);
    add_doors_to_room(room);
    return room;
}

// C refs: sp_lev.c build_room(), lspo_room(). Preserve the room construction
// boundary: chance, create, topology, deferred-fill/join flags, then contents.
function dispatch_room_action(definition, context) {
    const action = definition.action;
    const spec = action.room;
    if (action.contents && action.contents.kind !== 'themeroom-fill') {
        throw new UnsupportedThemeroomActionError(
            definition,
            `has unsupported room contents ${JSON.stringify(action.contents.kind)}`,
        );
    }
    if (action.contents) preflight_themeroom_fill(definition, context);

    const room = run_room_descriptor(
        spec,
        null,
        context,
        action.contents
            ? (created) => invoke_themeroom_fill(created, definition, context)
            : null,
    );
    if (!room) return false;
    return !game.themeroom_failed;
}

// C ref: themerms.lua "Fake Delphi" callback.
function fake_delphi(context) {
    const room = run_room_descriptor(
        { type: 'ordinary', w: 11, h: 9, filled: FILL_NORMAL },
        null,
        context,
        (parent) => {
            run_room_descriptor(
                {
                    type: 'ordinary',
                    x: 4,
                    y: 3,
                    w: 3,
                    h: 3,
                    filled: FILL_NORMAL,
                },
                parent,
                context,
                (child) => {
                    create_room_door(
                        { state: 'random', wall: 'all' },
                        child,
                        context.random,
                    );
                },
            );
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

// C ref: themerms.lua "Room in a room" callback.
function room_in_a_room(context) {
    const room = run_room_descriptor(
        { type: 'ordinary', filled: FILL_NORMAL },
        null,
        context,
        (parent) => {
            run_room_descriptor(
                { type: 'ordinary' },
                parent,
                context,
                (child) => {
                    create_room_door(
                        { state: 'random', wall: 'all' },
                        child,
                        context.random,
                    );
                },
            );
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

// C ref: themerms.lua "Huge room with another room inside" callback.
function huge_room_with_another_room_inside(context) {
    const width = context.random(10) + 11;
    const height = context.random(5) + 8;
    const room = run_room_descriptor(
        { type: 'ordinary', w: width, h: height, filled: FILL_NORMAL },
        null,
        context,
        (parent) => {
            if (context.random(100) >= 90) return;
            run_room_descriptor(
                { type: 'ordinary', filled: FILL_NORMAL },
                parent,
                context,
                (child) => {
                    create_room_door(
                        { state: 'random', wall: 'all' },
                        child,
                        context.random,
                    );
                    if (context.random(100) < 50) {
                        create_room_door(
                            { state: 'random', wall: 'all' },
                            child,
                            context.random,
                        );
                    }
                },
            );
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

// C ref: themerms.lua "Nesting rooms" callback.
function nesting_rooms(context) {
    const width = context.random(4) + 9;
    const height = context.random(4) + 9;
    const room = run_room_descriptor(
        { type: 'ordinary', w: width, h: height, filled: FILL_NORMAL },
        null,
        context,
        (parent) => {
            const parentWidth = parent.hx - parent.lx + 1;
            const parentHeight = parent.hy - parent.ly + 1;
            const minWidth = Math.floor(parentWidth / 2);
            const minHeight = Math.floor(parentHeight / 2);
            const childWidth = minWidth
                + context.random(parentWidth - 1 - minWidth);
            const childHeight = minHeight
                + context.random(parentHeight - 1 - minHeight);
            run_room_descriptor(
                {
                    type: 'ordinary',
                    w: childWidth,
                    h: childHeight,
                    filled: FILL_NORMAL,
                },
                parent,
                context,
                (child) => {
                    if (context.random(100) < 90) {
                        run_room_descriptor(
                            { type: 'ordinary', filled: FILL_NORMAL },
                            child,
                            context,
                            (grandchild) => {
                                create_room_door(
                                    { state: 'random', wall: 'all' },
                                    grandchild,
                                    context.random,
                                );
                                if (context.random(100) < 15) {
                                    create_room_door(
                                        { state: 'random', wall: 'all' },
                                        grandchild,
                                        context.random,
                                    );
                                }
                            },
                        );
                    }
                    create_room_door(
                        { state: 'random', wall: 'all' },
                        child,
                        context.random,
                    );
                    if (context.random(100) < 15) {
                        create_room_door(
                            { state: 'random', wall: 'all' },
                            child,
                            context.random,
                        );
                    }
                },
            );
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

// C ref: sp_lev.c sel_set_ter(), restricted to the SET_LIT_NOCHANGE terrain
// used by these direct handlers. Coordinates are relative to the current room.
function set_room_terrain(room, relativeX, relativeY, typ) {
    const x = room.lx + relativeX;
    const y = room.ly + relativeY;
    if (!set_levltyp(x, y, typ, { state: game })) return false;
    const location = game.level.at(x, y);
    if (typ === HWALL || typ === IRONBARS) {
        location.horizontal = true;
    } else if (typ === CLOUD) {
        del_engr_at(x, y, game);
    }
    return true;
}

// C ref: themerms.lua "Pillars" callback.
function pillars(context) {
    const room = run_room_descriptor(
        { type: 'themed', w: 10, h: 10 },
        null,
        context,
        (parent) => {
            const terrain = [
                HWALL, HWALL, HWALL, HWALL, LAVAPOOL, POOL, TREE,
            ];
            shuffle_core_values(terrain, context.random);
            const columns = Math.trunc((parent.hx - parent.lx + 1) / 4);
            const rows = Math.trunc((parent.hy - parent.ly + 1) / 4);
            for (let x = 0; x < columns; ++x) {
                for (let y = 0; y < rows; ++y) {
                    const left = x * 4 + 2;
                    const top = y * 4 + 2;
                    set_room_terrain(parent, left, top, terrain[0]);
                    set_room_terrain(parent, left + 1, top, terrain[0]);
                    set_room_terrain(parent, left, top + 1, terrain[0]);
                    set_room_terrain(parent, left + 1, top + 1, terrain[0]);
                }
            }
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

function direct_creation_environment(context) {
    const facade = themeroom_random_facade(
        context,
        'special-level creation',
        'room',
    );
    return {
        state: game,
        random: facade,
        spObjectContext: new_sp_lev_object_context(),
    };
}

// C ref: themerms.lua "Mausoleum" callback.
function mausoleum(context) {
    const creationEnvironment = direct_creation_environment(context);
    const width = 5 + context.random(3) * 2;
    const height = 5 + context.random(3) * 2;
    const room = run_room_descriptor(
        { type: 'themed', w: width, h: height },
        null,
        context,
        (parent) => {
            run_room_descriptor(
                {
                    type: 'themed',
                    x: Math.trunc((width - 1) / 2),
                    y: Math.trunc((height - 1) / 2),
                    w: 1,
                    h: 1,
                    joined: false,
                },
                parent,
                context,
                (child) => {
                    if (context.random(100) < 50) {
                        const classes = [
                            S_MUMMY, S_VAMPIRE, S_LICH, S_ZOMBIE,
                        ];
                        shuffle_core_values(classes, context.random);
                        lspo_monster(
                            [{
                                class: classes[0],
                                coord: [0, 0],
                                waiting: true,
                            }],
                            child,
                            creationEnvironment,
                        );
                    } else {
                        const species = mkclass(
                            S_HUMAN,
                            G_NOGEN | G_IGNORE,
                            creationEnvironment,
                        );
                        if (!species) {
                            throw new Error(
                                'Mausoleum could not resolve a human corpse species',
                            );
                        }
                        lspo_object(
                            {
                                id: CORPSE,
                                corpsenm: species.pmidx,
                                coordinate: { x: 0, y: 0 },
                            },
                            child,
                            creationEnvironment,
                        );
                    }
                    if (context.random(100) < 20) {
                        create_room_door(
                            { state: 'secret', wall: 'all' },
                            child,
                            context.random,
                        );
                    }
                },
            );
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

// C ref: themerms.lua "Random dungeon feature in the middle of an odd-sized
// room" callback.
function random_dungeon_feature_in_odd_room(context) {
    const width = 3 + context.random(3) * 2;
    const height = 3 + context.random(3) * 2;
    const room = run_room_descriptor(
        { type: 'ordinary', filled: FILL_NORMAL, w: width, h: height },
        null,
        context,
        (parent) => {
            const features = [CLOUD, LAVAPOOL, ICE, POOL, TREE];
            shuffle_core_values(features, context.random);
            set_room_terrain(
                parent,
                Math.trunc((width - 1) / 2),
                Math.trunc((height - 1) / 2),
                features[0],
            );
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

// C ref: themerms.lua "Twin businesses" callback. Constructing the Lua
// placements table evaluates all twelve directional helpers before the
// shop-type swap and d(8) placement choice; retain that surprising draw order.
function twin_businesses(context) {
    const percent = (chance) => context.random(100) < chance;
    const southeast = () => (percent(50) ? 'south' : 'east');
    const northeast = () => (percent(50) ? 'north' : 'east');
    const northwest = () => (percent(50) ? 'north' : 'west');
    const southwest = () => (percent(50) ? 'south' : 'west');

    const outer = run_room_descriptor(
        { type: 'themed', w: 9, h: 5 },
        null,
        context,
        (parent) => {
            const placements = [
                {
                    lx: 1, ly: 1, rx: 4, ry: 1,
                    leftWall: 'south', rightWall: southeast(),
                },
                {
                    lx: 1, ly: 2, rx: 4, ry: 2,
                    leftWall: 'north', rightWall: northeast(),
                },
                {
                    lx: 1, ly: 1, rx: 5, ry: 1,
                    leftWall: southeast(), rightWall: southwest(),
                },
                {
                    lx: 1, ly: 1, rx: 5, ry: 2,
                    leftWall: southeast(), rightWall: northwest(),
                },
                {
                    lx: 1, ly: 2, rx: 5, ry: 1,
                    leftWall: northeast(), rightWall: southwest(),
                },
                {
                    lx: 1, ly: 2, rx: 5, ry: 2,
                    leftWall: northeast(), rightWall: northwest(),
                },
                {
                    lx: 2, ly: 1, rx: 5, ry: 1,
                    leftWall: southwest(), rightWall: 'south',
                },
                {
                    lx: 2, ly: 2, rx: 5, ry: 2,
                    leftWall: northwest(), rightWall: 'north',
                },
            ];

            let leftType = 'weapon shop';
            let rightType = 'armor shop';
            if (percent(50))
                [leftType, rightType] = [rightType, leftType];

            const shopDoorState = () => {
                if (percent(1)) return 'locked';
                if (percent(50)) return 'closed';
                return 'open';
            };
            const placement = placements[context.randomOneBased(8) - 1];

            run_room_descriptor(
                {
                    type: leftType,
                    x: placement.lx,
                    y: placement.ly,
                    w: 3,
                    h: 3,
                    filled: FILL_NORMAL,
                    joined: false,
                },
                parent,
                context,
                (room) => create_room_door({
                    state: shopDoorState(),
                    wall: placement.leftWall,
                }, room, context.random),
            );
            run_room_descriptor(
                {
                    type: rightType,
                    x: placement.rx,
                    y: placement.ry,
                    w: 3,
                    h: 3,
                    filled: FILL_NORMAL,
                    joined: false,
                },
                parent,
                context,
                (room) => create_room_door({
                    state: shopDoorState(),
                    wall: placement.rightWall,
                }, room, context.random),
            );
        },
    );
    return Boolean(outer && !game.themeroom_failed);
}

const DIRECT_THEMEROOM_HANDLERS = new Map([
    ['fake-delphi', fake_delphi],
    ['room-in-a-room', room_in_a_room],
    [
        'huge-room-with-another-room-inside',
        huge_room_with_another_room_inside,
    ],
    ['nesting-rooms', nesting_rooms],
    ['pillars', pillars],
    ['mausoleum', mausoleum],
    [
        'random-dungeon-feature-in-the-middle-of-an-odd-sized-room',
        random_dungeon_feature_in_odd_room,
    ],
    ['twin-businesses', twin_businesses],
]);

function dispatch_direct_action(definition, context) {
    const handler = DIRECT_THEMEROOM_HANDLERS.get(definition.action.handler);
    if (!handler) {
        throw new UnsupportedThemeroomActionError(
            definition,
            `requires unimplemented direct handler ${JSON.stringify(definition.action.handler)}`,
        );
    }
    return handler(context);
}

// C refs: dat/nhlib.lua shuffle(); sp_lev.c lspo_replace_terrain(). nhlib's
// math.random(i) shim is 1 + nh.rn2(i), so Fisher-Yates and every matching-cell
// chance check consume the same injected core stream as the recorder.
function blocked_center_contents(definition, origin, context) {
    if (context.random(100) < 30) {
        const terrain = [HWALL, POOL];
        shuffle_core_values(terrain, context.random);
        const toTerrain = terrain[0];
        for (let x = origin.x + 1; x <= origin.x + 9; ++x) {
            for (let y = origin.y + 1; y <= origin.y + 9; ++y) {
                const loc = game.level.at(x, y);
                if (loc?.typ === LAVAPOOL && context.random(100) < 100)
                    set_levltyp(x, y, toTerrain, { state: game });
            }
        }
    }
    return filler_region(
        definition.action.contents.filler,
        origin,
        definition,
        context,
    );
}

// C refs: nhlobj.c l_obj_new_readobjnam(); objnam.c readobjnam(). The Water
// vault uses four exact, wishable names. Their common path is mksobj(...,
// TRUE, FALSE); a mergeable exact object also evaluates the source rnd(6)
// quantity guard even though its requested count and generated count are one.
function new_water_vault_escape_object(otyp, env) {
    // readobjnam() resolves the unambiguous class-qualified name through
    // rnd_otyp_by_namedesc(..., xtra_prob=1) before constructing it.
    env.random.rn2(objectType(otyp, env.state).oc_prob + 1);
    const obj = mksobj(otyp, true, false, env);
    if (objectType(otyp, env.state).oc_merge)
        env.random.rnd(6);
    return obj;
}

// C ref: themerms.lua "Water-surrounded vault" map callback.
function water_surrounded_vault_contents(
    origin,
    context,
    baseCreationEnvironment,
) {
    const room = register_irregular_map_region(
        { x: origin.x + 3, y: origin.y + 3 },
        THEMEROOM,
        FILL_NONE,
        false,
        context,
    );
    if (!room) return false;

    const creationEnvironment = objectGenerationEnv({
        ...baseCreationEnvironment,
        frame: {
            xstart: origin.x,
            ystart: origin.y,
            xsize: origin.width,
            ysize: origin.height,
        },
    });
    const nastyUndead = [
        PM_GIANT_ZOMBIE,
        PM_ETTIN_ZOMBIE,
        PM_VAMPIRE_LEADER,
    ];
    const chestSpots = [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
    ];
    shuffle_core_values(chestSpots, context.random);

    const escapeTypes = [
        SCR_TELEPORTATION,
        RIN_TELEPORTATION,
        WAN_TELEPORTATION,
        WAN_DIGGING,
    ];
    const escapeObject = new_water_vault_escape_object(
        escapeTypes[context.random(escapeTypes.length)],
        creationEnvironment,
    );
    const firstChestSpec = {
        id: CHEST,
        coordinate: chestSpots[0],
    };
    // themerms.lua spells this field `olocked`; lspo_object() only reads
    // `locked`, so the source retains the chest's randomly generated state.
    const firstChest = lspo_object(
        firstChestSpec,
        null,
        creationEnvironment,
    );
    add_to_container(firstChest, escapeObject, creationEnvironment);
    firstChest.owt = weight(firstChest, creationEnvironment);

    for (let index = 1; index < chestSpots.length; ++index) {
        lspo_object(
            { id: CHEST, coordinate: chestSpots[index] },
            null,
            creationEnvironment,
        );
    }

    shuffle_core_values(nastyUndead, context.random);
    lspo_monster(
        [{
            id: nastyUndead[0],
            coord: [2, 2],
            // The source string is "vampire lord", whose male pmname makes
            // find_montype() skip its otherwise-random parser gender draw.
            ...(nastyUndead[0] === PM_VAMPIRE_LEADER
                ? { parsedGender: MALE } : {}),
        }],
        null,
        creationEnvironment,
    );
    lspo_exclusion(
        [{ type: 'teleport', region: [2, 2, 3, 3] }],
        creationEnvironment,
    );
    return true;
}

function dispatch_map_action(definition, context) {
    const contents = definition.action.contents;
    const supported = contents?.kind === 'filler-region'
        || (contents?.kind === 'handler'
            && (contents.handler === 'blocked-center'
                || contents.handler === 'water-surrounded-vault'));
    if (!supported) {
        const handler = contents?.handler ?? contents?.kind ?? 'missing contents';
        throw new UnsupportedThemeroomActionError(
            definition,
            `requires unimplemented map handler ${JSON.stringify(handler)}`,
        );
    }
    const waterVault = contents?.kind === 'handler'
        && contents.handler === 'water-surrounded-vault';
    const creationEnvironment = waterVault
        ? direct_creation_environment(context)
        : null;
    if (!waterVault) preflight_themeroom_fill(definition, context);

    const origin = lspo_map(definition, context.random);
    if (!origin) return false;
    if (waterVault) {
        return water_surrounded_vault_contents(
            origin,
            context,
            creationEnvironment,
        );
    }
    if (contents.kind === 'handler')
        return blocked_center_contents(definition, origin, context);
    return filler_region(contents.filler, origin, definition, context);
}

// Runtime counterpart to a selected themerms.lua contents function. Keep this
// export narrow so focused tests and future direct-name diagnostics can execute
// a source-derived descriptor without recreating reservoir selection.
export function dispatch_themeroom(
    definition,
    random = rn2,
    randomOneBased = rnd,
    env = {},
) {
    // The strict dispatcher currently owns the process-global level just like
    // the live generator. Reject an apparent alternate-state injection before
    // any source draw or level mutation instead of silently writing `game`.
    if (env.state !== undefined && env.state !== game) {
        throw new TypeError(
            'dispatch_themeroom only supports the global game state',
        );
    }
    const sourceRandomFacade = random === rn2 && randomOneBased === rnd
        ? SOURCE_THEMEROOM_RANDOM
        : null;
    const context = {
        definition,
        difficulty: env.difficulty ?? level_difficulty(game),
        random,
        randomOneBased,
        randomFacade: env.randomFacade ?? sourceRandomFacade,
        themeroomFill: env.themeroomFill,
    };
    switch (definition?.action?.kind) {
    case 'room':
        return dispatch_room_action(definition, context);
    case 'map':
        return dispatch_map_action(definition, context);
    case 'handler':
        return dispatch_direct_action(definition, context);
    default:
        throw new UnsupportedThemeroomActionError(
            definition,
            `has unsupported action ${JSON.stringify(definition?.action?.kind)}`,
        );
    }
}

// C ref: themerms.lua themerooms_generate(). Generic room descriptors use the
// strict synchronous dispatcher and the complete source-order fill reservoir.
// Every initial-generation definition now uses its registered source handler;
// dispatch_themeroom() remains the strict completion seam.
export async function themerooms_generate(
    difficulty,
    random = rn2,
    randomOneBased = rnd,
    rawEnv = {},
) {
    const pick = select_themeroom(difficulty, random);
    if (!pick) return false;
    // Local closure diagnostics observe the already-selected definition;
    // absent diagnostics, this optional chain has no runtime effect.
    game._themeroomSelectionCollector?.record('room', pick.id);
    const sourceRandomFacade = random === rn2 && randomOneBased === rnd
        ? SOURCE_THEMEROOM_RANDOM
        : null;
    const useDefaultFill = rawEnv.themeroomFill == null;
    return dispatch_themeroom(pick, random, randomOneBased, {
        difficulty,
        randomFacade: rawEnv.randomFacade ?? sourceRandomFacade,
        themeroomFill: useDefaultFill
            ? themeroom_fill
            : rawEnv.themeroomFill,
    });
}

// C ref: sp_lev.c check_room()
function check_room(lowx, ddx, lowy, ddy, vault, random = rn2) {
    const map = game.level;
    let hix = lowx.v + ddx.v, hiy = lowy.v + ddy.v;
    const xlim = XLIM + (vault ? 1 : 0);
    const ylim = YLIM + (vault ? 1 : 0);
    const s_lowx = lowx.v, s_ddx = ddx.v;
    const s_lowy = lowy.v, s_ddy = ddy.v;
    if (lowx.v < 3) lowx.v = 3;
    if (lowy.v < 2) lowy.v = 2;
    if (hix > COLNO - 3) hix = COLNO - 3;
    if (hiy > ROWNO - 3) hiy = ROWNO - 3;
    for (;;) {
        if (hix <= lowx.v || hiy <= lowy.v) return false;
        if (game.in_mk_themerooms
            && s_lowx !== lowx.v && s_ddx !== ddx.v
            && s_lowy !== lowy.v && s_ddy !== ddy.v) {
            return false;
        }
        let retry = false;
        for (let x = lowx.v - xlim; x <= hix + xlim && !retry; x++) {
            if (x <= 0 || x >= COLNO) continue;
            let y = Math.max(lowy.v - ylim, 0);
            const ymax = Math.min(hiy + ylim, ROWNO - 1);
            for (; y <= ymax; y++) {
                const loc = map.at(x, y);
                if (loc && loc.typ !== STONE) {
                    if (!random(3)) return false;
                    if (game.in_mk_themerooms) return false;
                    if (x < lowx.v) lowx.v = x + xlim + 1;
                    else hix = x - xlim - 1;
                    if (y < lowy.v) lowy.v = y + ylim + 1;
                    else hiy = y - ylim - 1;
                    retry = true;
                    break;
                }
            }
        }
        if (!retry) break;
    }
    ddx.v = hix - lowx.v;
    ddy.v = hiy - lowy.v;
    if (game.in_mk_themerooms
        && s_lowx !== lowx.v && s_ddx !== ddx.v
        && s_lowy !== lowy.v && s_ddy !== ddy.v) {
        return false;
    }
    return true;
}

// C ref: sp_lev.c create_room()
function create_room(
    x, y, w, h, xal, yal, rtype, rlit,
    random = rn2,
    randomOneBased = rnd,
) {
    const g = game;
    let xabs = 0, yabs = 0;
    let r1 = null, r2 = null;
    let wtmp, htmp;
    let trycnt = 0;
    let vault = false;
    let xlim = XLIM, ylim = YLIM;
    if (rtype === -1) rtype = OROOM;
    if (rtype === VAULT) {
        vault = true;
        xlim++;
        ylim++;
    }
    rlit = litstate_rnd(rlit, random, randomOneBased);
    do {
        wtmp = w; htmp = h;
        let xtmp = x, ytmp = y;
        let xaltmp = xal, yaltmp = yal;
        if ((xtmp < 0 && ytmp < 0 && wtmp < 0 && xaltmp < 0 && yaltmp < 0) || vault) {
            r1 = rnd_rect(random);
            if (!r1) return false;
            const hx = r1.hx, hy = r1.hy, lx = r1.lx, ly = r1.ly;
            let dx, dy;
            if (vault) {
                dx = dy = 1;
            } else {
                dx = 2 + random((hx - lx > 28) ? 12 : 8);
                dy = 2 + random(4);
                if (dx * dy > 50) dy = Math.trunc(50 / dx);
            }
            const xborder = (lx > 0 && hx < COLNO - 1) ? 2 * xlim : xlim + 1;
            const yborder = (ly > 0 && hy < ROWNO - 1) ? 2 * ylim : ylim + 1;
            if (hx - lx < dx + 3 + xborder || hy - ly < dy + 3 + yborder) {
                r1 = null;
                continue;
            }
            xabs = lx + (lx > 0 ? xlim : 3)
                   + random(hx - (lx > 0 ? lx : 3) - dx - xborder + 1);
            yabs = ly + (ly > 0 ? ylim : 2)
                   + random(hy - (ly > 0 ? ly : 2) - dy - yborder + 1);
            if (ly === 0 && hy >= ROWNO - 1
                && (!g.level.nroom || !random(g.level.nroom))
                && (yabs + dy > Math.trunc(ROWNO / 2))) {
                // hack.h defines rn1(x, y) as the macro rn2(x) + y; the
                // recorder therefore identifies this source call as rn2(3).
                yabs = random(3) + 2;
                if (g.level.nroom < 4 && dy > 1) dy--;
            }
            const lowx = { v: xabs }, ddx = { v: dx };
            const lowy = { v: yabs }, ddy = { v: dy };
            if (!check_room(lowx, ddx, lowy, ddy, vault, random)) {
                r1 = null;
                continue;
            }
            xabs = lowx.v;
            yabs = lowy.v;
            wtmp = ddx.v + 1;
            htmp = ddy.v + 1;
            r2 = { lx: xabs - 1, ly: yabs - 1, hx: xabs + wtmp, hy: yabs + htmp };
        } else {
            // sp_lev.c create_room(): some, but not all, parameters are
            // random. Random positions reserve the source's extra border.
            let rndpos = 0;
            if (xtmp < 0 && ytmp < 0) {
                xtmp = randomOneBased(5);
                ytmp = randomOneBased(5);
                rndpos = 1;
            }
            if (wtmp < 0 || htmp < 0) {
                wtmp = random(15) + 3;
                htmp = random(8) + 2;
            }
            if (xaltmp === -1) xaltmp = randomOneBased(3);
            if (yaltmp === -1) yaltmp = randomOneBased(3);

            xabs = Math.trunc(((xtmp - 1) * COLNO) / 5) + 1;
            yabs = Math.trunc(((ytmp - 1) * ROWNO) / 5) + 1;
            if (xaltmp === SPLEV_RIGHT) {
                xabs += Math.trunc(COLNO / 5) - wtmp;
            } else if (xaltmp === SPLEV_CENTER) {
                xabs += Math.trunc((Math.trunc(COLNO / 5) - wtmp) / 2);
            }
            if (yaltmp === SPLEV_BOTTOM) {
                yabs += Math.trunc(ROWNO / 5) - htmp;
            } else if (yaltmp === SPLEV_CENTER) {
                yabs += Math.trunc((Math.trunc(ROWNO / 5) - htmp) / 2);
            }

            if (xabs + wtmp - 1 > COLNO - 2)
                xabs = COLNO - wtmp - 3;
            if (xabs < 2) xabs = 2;
            if (yabs + htmp - 1 > ROWNO - 2)
                yabs = ROWNO - htmp - 3;
            if (yabs < 2) yabs = 2;

            r2 = {
                lx: xabs - 1,
                ly: yabs - 1,
                hx: xabs + wtmp + rndpos,
                hy: yabs + htmp + rndpos,
            };
            r1 = get_rect(r2);
            if (r1) {
                const lowx = { v: xabs }, ddx = { v: wtmp };
                const lowy = { v: yabs }, ddy = { v: htmp };
                if (!check_room(lowx, ddx, lowy, ddy, vault, random)) {
                    r1 = null;
                } else {
                    xabs = lowx.v;
                    yabs = lowy.v;
                }
            }
        }
    } while (++trycnt <= 100 && !r1);
    if (!r1) return false;
    split_rects(r1, r2);
    if (!vault) {
        g.smeq[g.level.nroom] = g.level.nroom;
        add_room(xabs, yabs, xabs + wtmp - 1, yabs + htmp - 1, rlit, rtype, false);
    } else {
        if (!g.level.rooms[g.level.nroom]) g.level.rooms[g.level.nroom] = {};
        g.level.rooms[g.level.nroom].lx = xabs;
        g.level.rooms[g.level.nroom].ly = yabs;
    }
    return true;
}

function create_vault() {
    return create_room(-1, -1, 2, 2, -1, -1, VAULT, true);
}

// C ref: mklev.c add_room()
function add_room(lowx, lowy, hix, hiy, lit, rtype, special) {
    const g = game;
    const croom = {
        roomnoidx: g.level.nroom,
        needfill: 0,
    };
    do_room_or_subroom(croom, lowx, lowy, hix, hiy, lit, rtype, special, true);
    g.level.rooms[g.level.nroom] = croom;
    g.level.nroom++;
    if (g.level.nroom < MAXNROFROOMS) {
        g.level.rooms[g.level.nroom] = { hx: -1 };
    }
}

// C ref: mklev.c add_subroom(). Subrooms occupy the second half of the
// conceptual rooms[] allocation, so their topology room numbers remain stable
// when the top-level room array is later sorted.
function add_subroom(proom, lowx, lowy, hix, hiy, lit, rtype, special) {
    const g = game;
    g.subrooms ??= [];
    g.nsubroom ??= 0;
    proom.sbrooms ??= [];
    proom.nsubrooms ??= proom.sbrooms.length;
    if (g.nsubroom >= MAXNROFROOMS)
        throw new Error('level has too many subrooms');
    if (proom.nsubrooms >= MAX_SUBROOMS)
        throw new Error('room has too many subrooms');

    const croom = {
        roomnoidx: MAXNROFROOMS + 1 + g.nsubroom,
        needfill: FILL_NONE,
    };
    do_room_or_subroom(
        croom,
        lowx,
        lowy,
        hix,
        hiy,
        lit,
        rtype,
        special,
        false,
    );
    proom.sbrooms[proom.nsubrooms++] = croom;
    g.subrooms[g.nsubroom++] = croom;
    g.subrooms[g.nsubroom] = { hx: -1 };
}

// C ref: sp_lev.c create_subroom(). Coordinates are relative to the parent
// room; the paired edge adjustments intentionally retain the source's
// one-based random-position quirks.
function create_subroom(
    proom,
    x,
    y,
    w,
    h,
    rtype,
    rlit,
    random = rn2,
    randomOneBased = rnd,
) {
    const width = proom.hx - proom.lx + 1;
    const height = proom.hy - proom.ly + 1;
    if (width < 4 || height < 4) return false;

    if (w === -1) w = randomOneBased(width - 3);
    if (h === -1) h = randomOneBased(height - 3);
    if (x === -1) x = randomOneBased(width - w);
    if (y === -1) y = randomOneBased(height - h);
    if (x === 1) x = 0;
    if (y === 1) y = 0;
    if (x + w + 1 === width) ++x;
    if (y + h + 1 === height) ++y;
    if (rtype === -1) rtype = OROOM;
    rlit = litstate_rnd(rlit, random, randomOneBased);
    add_subroom(
        proom,
        proom.lx + x,
        proom.ly + y,
        proom.lx + x + w - 1,
        proom.ly + y + h - 1,
        rlit,
        rtype,
        false,
    );
    return true;
}

// C ref: sp_lev.c build_room(). This low-level boundary accepts normalized
// rtype/rlit/needfill fields; direct handlers adapt their Lua-shaped fields via
// run_room_descriptor(). chance selects the requested type versus OROOM, not
// whether a room exists. create_room()/create_subroom() append one room and
// return only success, so null below means construction itself failed.
export function build_room(
    spec,
    parent = null,
    random = rn2,
    randomOneBased = rnd,
) {
    const requestedType = spec.rtype ?? OROOM;
    const chance = spec.chance ?? 100;
    const rtype = (!chance || random(100) < chance)
        ? requestedType : OROOM;
    const roomIndex = parent
        ? (game.nsubroom ?? 0) : game.level.nroom;
    const ok = parent
        ? create_subroom(
            parent,
            spec.x ?? -1,
            spec.y ?? -1,
            spec.w ?? -1,
            spec.h ?? -1,
            rtype,
            spec.rlit ?? -1,
            random,
            randomOneBased,
        )
        : create_room(
            spec.x ?? -1,
            spec.y ?? -1,
            spec.w ?? -1,
            spec.h ?? -1,
            spec.xalign ?? -1,
            spec.yalign ?? -1,
            rtype,
            spec.rlit ?? -1,
            random,
            randomOneBased,
        );
    if (!ok) return null;

    const room = parent
        ? game.subrooms[roomIndex] : game.level.rooms[roomIndex];
    topologize(room);
    room.needfill = spec.needfill ?? FILL_NONE;
    room.needjoining = spec.joined ?? true;
    return room;
}

// C ref: mklev.c do_room_or_subroom()
function do_room_or_subroom(croom, lowx, lowy, hix, hiy, lit, _rtype, special, is_room) {
    const map = game.level;
    if (!lowx) lowx++;
    if (!lowy) lowy++;
    if (hix >= COLNO - 1) hix = COLNO - 2;
    if (hiy >= ROWNO - 1) hiy = ROWNO - 2;
    if (lit) {
        for (let x = lowx - 1; x <= hix + 1; x++)
            for (let y = Math.max(lowy - 1, 0); y <= hiy + 1; y++)
                if (map.at(x, y)) map.at(x, y).lit = true;
        croom.rlit = 1;
    } else {
        croom.rlit = 0;
    }
    croom.lx = lowx; croom.hx = hix;
    croom.ly = lowy; croom.hy = hiy;
    croom.rtype = _rtype;
    croom.doorct = 0;
    croom.fdoor = game.level.doorindex;
    croom.irregular = false;
    croom.needjoining = !special;
    croom.nsubrooms = 0;
    croom.sbrooms = [];
    if (!special) {
        for (let x = lowx - 1; x <= hix + 1; x++)
            for (let y = lowy - 1; y <= hiy + 1; y += (hiy - lowy + 2)) {
                const loc = map.at(x, y);
                if (loc) { loc.typ = HWALL; loc.horizontal = true; }
            }
        for (let x = lowx - 1; x <= hix + 1; x += (hix - lowx + 2))
            for (let y = lowy; y <= hiy; y++) {
                const loc = map.at(x, y);
                if (loc) { loc.typ = VWALL; loc.horizontal = false; }
            }
        for (let x = lowx; x <= hix; x++)
            for (let y = lowy; y <= hiy; y++) {
                const loc = map.at(x, y);
                if (loc) loc.typ = ROOM;
            }
        if (is_room) {
            const tl = map.at(lowx - 1, lowy - 1);
            const tr = map.at(hix + 1, lowy - 1);
            const bl = map.at(lowx - 1, hiy + 1);
            const br = map.at(hix + 1, hiy + 1);
            if (tl) tl.typ = TLCORNER;
            if (tr) tr.typ = TRCORNER;
            if (bl) bl.typ = BLCORNER;
            if (br) br.typ = BRCORNER;
        } else {
            wallification(lowx - 1, lowy - 1, hix + 1, hiy + 1);
        }
    }
}

// C ref: mklev.c sort_rooms()
function sort_rooms() {
    const g = game;
    const n = g.level.nroom;
    const oldToNew = new Array(n).fill(0);
    const liveRooms = g.level.rooms.slice(0, n)
        .sort((a, b) => (a?.lx || 0) - (b?.lx || 0));
    g.level.rooms = liveRooms;
    if (n < MAXNROFROOMS) g.level.rooms[n] = { hx: -1 };
    for (let i = 0; i < n; i++) {
        if (g.level.rooms[i]) {
            oldToNew[g.level.rooms[i].roomnoidx] = i;
            g.level.rooms[i].roomnoidx = i;
        }
    }
    for (let x = 1; x < COLNO; x++)
        for (let y = 0; y < ROWNO; y++) {
            const loc = g.level.at(x, y);
            const rno = loc?.roomno ?? 0;
            if (rno >= ROOMOFFSET && rno < MAXNROFROOMS + 1) {
                loc.roomno = oldToNew[rno - ROOMOFFSET] + ROOMOFFSET;
            }
        }
}

// C ref: mklev.c topologize()
export function topologize(croom, state = game) {
    if (!croom || croom.irregular) return;
    const roomno = (croom.roomnoidx ?? -1) + ROOMOFFSET;
    const lowx = croom.lx, lowy = croom.ly;
    const hix = croom.hx, hiy = croom.hy;
    if (!state.level || roomno < ROOMOFFSET) return;
    if ((state.level.at(lowx, lowy)?.roomno ?? 0) === roomno) return;
    for (let x = lowx; x <= hix; x++)
        for (let y = lowy; y <= hiy; y++) {
            const loc = state.level.at(x, y);
            if (loc) loc.roomno = roomno;
        }
    for (let x = lowx - 1; x <= hix + 1; x++)
        for (let y = lowy - 1; y <= hiy + 1; y += (hiy - lowy + 2)) {
            const loc = state.level.at(x, y);
            if (loc) { loc.edge = true; loc.roomno = loc.roomno ? SHARED : roomno; }
        }
    for (let x = lowx - 1; x <= hix + 1; x += (hix - lowx + 2))
        for (let y = lowy; y <= hiy; y++) {
            const loc = state.level.at(x, y);
            if (loc) { loc.edge = true; loc.roomno = loc.roomno ? SHARED : roomno; }
        }
}

// ============================================================
// Corridors
// ============================================================

function good_rm_wall_doorpos(x, y, dir, room) {
    const map = game.level;
    const rmno = game.level.rooms.indexOf(room) + ROOMOFFSET;
    if (!isok(x, y) || !room.needjoining) return false;
    const loc = map.at(x, y);
    if (!loc) return false;
    if (!(loc.typ === HWALL || loc.typ === VWALL || IS_DOOR(loc.typ) || loc.typ === SDOOR))
        return false;
    if (bydoor(x, y)) return false;
    const tx = x + xdir[dir], ty = y + ydir[dir];
    if (!isok(tx, ty)) return false;
    const tloc = map.at(tx, ty);
    if (!tloc || IS_OBSTRUCTED(tloc.typ)) return false;
    if (rmno !== tloc.roomno) return false;
    return true;
}

function finddpos_shift(xp, yp, dir, aroom) {
    const rdir = DIR_180(dir);
    if (good_rm_wall_doorpos(xp.v, yp.v, rdir, aroom)) return true;
    // C ref: mklev.c finddpos_shift(). An irregular room's actual wall can be
    // inset from its rectangular bounds; walk inward through rock/corridor to
    // find the first usable wall on that side.
    if (aroom.irregular) {
        const dx = xdir[rdir], dy = ydir[rdir];
        let rx = xp.v, ry = yp.v;
        let fail = false;
        for (;;) {
            const loc = game.level.at(rx, ry);
            if (fail || !isok(rx, ry) || !loc
                || (loc.typ !== STONE && loc.typ !== CORR)) break;
            rx += dx;
            ry += dy;
            if (good_rm_wall_doorpos(rx, ry, rdir, aroom)) {
                xp.v = rx;
                yp.v = ry;
                return true;
            }
            const shifted = game.level.at(rx, ry);
            if (!shifted || (shifted.typ !== STONE && shifted.typ !== CORR)) fail = true;
            if (rx < aroom.lx || rx > aroom.hx || ry < aroom.ly || ry > aroom.hy)
                fail = true;
        }
    }
    return false;
}

// C ref: mklev.c finddpos()
function finddpos(cc, dir, aroom) {
    let x1, y1, x2, y2;
    switch (dir) {
    case DIR_N: x1 = aroom.lx; x2 = aroom.hx; y1 = y2 = aroom.ly - 1; break;
    case DIR_S: x1 = aroom.lx; x2 = aroom.hx; y1 = y2 = aroom.hy + 1; break;
    case DIR_W: x1 = x2 = aroom.lx - 1; y1 = aroom.ly; y2 = aroom.hy; break;
    case DIR_E: x1 = x2 = aroom.hx + 1; y1 = aroom.ly; y2 = aroom.hy; break;
    default: return false;
    }
    let tryct = 0;
    let x, y;
    do {
        x = (x2 - x1) ? rn1(x2 - x1 + 1, x1) : x1;
        y = (y2 - y1) ? rn1(y2 - y1 + 1, y1) : y1;
        const xp = { v: x }, yp = { v: y };
        if (finddpos_shift(xp, yp, dir, aroom)) {
            cc.x = xp.v; cc.y = yp.v;
            return true;
        }
    } while (++tryct < 20);
    for (x = x1; x <= x2; x++)
        for (y = y1; y <= y2; y++) {
            const xp = { v: x }, yp = { v: y };
            if (finddpos_shift(xp, yp, dir, aroom)) {
                cc.x = xp.v; cc.y = yp.v;
                return true;
            }
        }
    cc.x = x1; cc.y = y1;
    return false;
}

function maybe_sdoor(chance) {
    const d = depth(game.u?.uz);
    return (d > 2) && !rn2(Math.max(2, chance));
}

// C ref: sp_lev.c dig_corridor()
function dig_corridor(org, dest, npoints_out, nxcor, ftyp, btyp) {
    const map = game.level;
    let dx = 0, dy = 0;
    let xx = org.x, yy = org.y;
    const tx = dest.x, ty = dest.y;
    let npoints = 0;
    if (npoints_out) npoints_out.v = 0;
    if (xx <= 0 || yy <= 0 || tx <= 0 || ty <= 0
        || xx > COLNO - 1 || tx > COLNO - 1 || yy > ROWNO - 1 || ty > ROWNO - 1)
        return false;
    if (tx > xx) dx = 1;
    else if (ty > yy) dy = 1;
    else if (tx < xx) dx = -1;
    else dy = -1;
    xx -= dx; yy -= dy;
    let cct = 0;
    while (xx !== tx || yy !== ty) {
        if (cct++ > 500 || (nxcor && !rn2(35))) return false;
        xx += dx; yy += dy;
        if (xx >= COLNO - 1 || xx <= 0 || yy <= 0 || yy >= ROWNO - 1) return false;
        const crm = map.at(xx, yy);
        if (!crm) return false;
        if (crm.typ === btyp) {
            if (ftyp === CORR && maybe_sdoor(100)) {
                npoints++;
                if (npoints_out) npoints_out.v = npoints;
                crm.typ = SCORR;
            } else {
                npoints++;
                if (npoints_out) npoints_out.v = npoints;
                crm.typ = ftyp;
                if (nxcor && !rn2(50)) {
                    mksobj_at(
                        BOULDER,
                        xx,
                        yy,
                        true,
                        false,
                        levelObjectEnv(),
                    );
                }
            }
        } else if (crm.typ !== ftyp && crm.typ !== SCORR) {
            return false;
        }
        let dix = Math.abs(xx - tx);
        let diy = Math.abs(yy - ty);
        if ((dix > diy) && diy && !rn2(dix - diy + 1)) dix = 0;
        else if ((diy > dix) && dix && !rn2(diy - dix + 1)) diy = 0;
        if (dy && dix > diy) {
            const ddx = (xx > tx) ? -1 : 1;
            const ncr = map.at(xx + ddx, yy);
            if (ncr && (ncr.typ === btyp || ncr.typ === ftyp || ncr.typ === SCORR)) {
                dx = ddx; dy = 0; continue;
            }
        } else if (dx && diy > dix) {
            const ddy = (yy > ty) ? -1 : 1;
            const ncr = map.at(xx, yy + ddy);
            if (ncr && (ncr.typ === btyp || ncr.typ === ftyp || ncr.typ === SCORR)) {
                dy = ddy; dx = 0; continue;
            }
        }
        const straight = map.at(xx + dx, yy + dy);
        if (straight && (straight.typ === btyp || straight.typ === ftyp || straight.typ === SCORR))
            continue;
        if (dx) { dx = 0; dy = (ty < yy) ? -1 : 1; }
        else { dy = 0; dx = (tx < xx) ? -1 : 1; }
        const alt = map.at(xx + dx, yy + dy);
        if (alt && (alt.typ === btyp || alt.typ === ftyp || alt.typ === SCORR)) continue;
        dy = -dy; dx = -dx;
    }
    if (npoints_out) npoints_out.v = npoints;
    return true;
}

// C ref: mklev.c dosdoor()
function dosdoor(x, y, aroom, type) {
    const map = game.level;
    const loc = map.at(x, y);
    if (!loc) return;
    const shdoor = in_rooms(x, y, SHOPBASE).length > 0;
    if (!IS_WALL(loc.typ)) type = DOOR;
    loc.typ = type;
    if (type === DOOR) {
        if (!rn2(3)) {
            if (!rn2(5)) loc.flags = D_ISOPEN;
            else if (!rn2(6)) loc.flags = D_LOCKED;
            else loc.flags = D_CLOSED;
            if (loc.flags !== D_ISOPEN && !shdoor
                && level_difficulty() >= 5 && !rn2(25))
                loc.flags |= D_TRAPPED;
        } else {
            loc.flags = shdoor ? D_ISOPEN : D_NODOOR;
        }
        if (loc.flags & D_TRAPPED) {
            if (level_difficulty() >= 9 && !rn2(5)) {
                loc.flags = D_NODOOR;
            }
        }
    } else {
        if (shdoor || !rn2(5)) loc.flags = D_LOCKED;
        else loc.flags = D_CLOSED;
        if (!shdoor && level_difficulty() >= 4 && !rn2(20))
            loc.flags |= D_TRAPPED;
    }
    add_door(x, y, aroom);
}

function dodoor(x, y, aroom) {
    dosdoor(x, y, aroom, maybe_sdoor(8) ? SDOOR : DOOR);
}

function add_door(x, y, aroom) {
    const g = game;
    if (!g.level.doors) g.level.doors = [];
    for (let i = 0; i < aroom.doorct; i++) {
        const d = g.level.doors[aroom.fdoor + i];
        if (d && d.x === x && d.y === y) return;
    }
    // level.doors concatenates each room's [fdoor, fdoor + doorct) slice.
    // Inserting into an earlier slice shifts every later room's starting index.
    if (aroom.doorct === 0) aroom.fdoor = g.level.doorindex;
    aroom.doorct++;
    for (let tmp = g.level.doorindex; tmp > aroom.fdoor; tmp--)
        g.level.doors[tmp] = g.level.doors[tmp - 1];
    for (let i = 0; i < g.level.nroom; ++i) {
        const broom = g.level.rooms[i];
        if (!broom || broom === aroom || !(broom.doorct > 0)) continue;
        if ((broom.fdoor ?? 0) >= aroom.fdoor) broom.fdoor++;
    }
    for (let i = 0; i < (g.nsubroom ?? 0); ++i) {
        const broom = g.subrooms?.[i];
        if (!broom || broom === aroom || !(broom.doorct > 0)) continue;
        if ((broom.fdoor ?? 0) >= aroom.fdoor) broom.fdoor++;
    }
    g.level.doors[aroom.fdoor] = { x, y };
    g.level.doorindex++;
}

function bydoor(x, y) {
    const map = game.level;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!isok(x + dx, y + dy)) continue;
        const loc = map.at(x + dx, y + dy);
        if (loc && (IS_DOOR(loc.typ) || loc.typ === SDOOR)) return true;
    }
    return false;
}

function okdoor(x, y) {
    const map = game.level;
    const loc = map.at(x, y);
    if (!loc) return false;
    if (!(loc.typ === HWALL || loc.typ === VWALL)) return false;
    if (bydoor(x, y)) return false;
    return (
        (isok(x - 1, y) && !IS_OBSTRUCTED(map.at(x - 1, y).typ))
        || (isok(x + 1, y) && !IS_OBSTRUCTED(map.at(x + 1, y).typ))
        || (isok(x, y - 1) && !IS_OBSTRUCTED(map.at(x, y - 1).typ))
        || (isok(x, y + 1) && !IS_OBSTRUCTED(map.at(x, y + 1).typ))
    );
}

const ROOM_DOOR_STATE_MASKS = Object.freeze({
    random: -1,
    open: D_ISOPEN,
    closed: D_CLOSED,
    locked: D_LOCKED,
    nodoor: D_NODOOR,
    broken: D_BROKEN,
    secret: D_SECRET,
});

const ROOM_DOOR_WALL_MASKS = Object.freeze({
    all: W_ANY,
    random: W_ANY,
    north: W_NORTH,
    south: W_SOUTH,
    east: W_EAST,
    west: W_WEST,
});

function rnddoor(random) {
    // C ref: sp_lev.c rnddoor(). ROLL_FROM chooses among these five states.
    return [D_NODOOR, D_BROKEN, D_ISOPEN, D_CLOSED, D_LOCKED][random(5)];
}

// C ref: sp_lev.c create_door(). The descriptor is deliberately mutable:
// source resolves its random fields in place before attempting placement.
export function create_door(dd, broom, random = rn2) {
    if (dd.secret === -1) dd.secret = random(2);
    if (dd.wall === W_RANDOM) dd.wall = W_ANY;

    if (dd.mask === -1) {
        if (!dd.secret) {
            if (!random(3)) {
                if (!random(5)) dd.mask = D_ISOPEN;
                else if (!random(6)) dd.mask = D_LOCKED;
                else dd.mask = D_CLOSED;
                if (dd.mask !== D_ISOPEN && !random(25))
                    dd.mask |= D_TRAPPED;
            } else {
                dd.mask = D_NODOOR;
            }
        } else {
            if (!random(5)) dd.mask = D_LOCKED;
            else dd.mask = D_CLOSED;
            if (!random(20)) dd.mask |= D_TRAPPED;
        }
    }

    let x = 0;
    let y = 0;
    let trycnt;
    for (trycnt = 0; trycnt < 100; ++trycnt) {
        const dwall = dd.wall;
        const dpos = dd.pos;
        switch (random(4)) {
        case 0:
            if (!(dwall & W_NORTH)) continue;
            y = broom.ly - 1;
            x = broom.lx + (dpos === -1
                ? random(1 + broom.hx - broom.lx) : dpos);
            if (!isok(x, y - 1)
                || IS_OBSTRUCTED(game.level.at(x, y - 1).typ)) continue;
            break;
        case 1:
            if (!(dwall & W_SOUTH)) continue;
            y = broom.hy + 1;
            x = broom.lx + (dpos === -1
                ? random(1 + broom.hx - broom.lx) : dpos);
            if (!isok(x, y + 1)
                || IS_OBSTRUCTED(game.level.at(x, y + 1).typ)) continue;
            break;
        case 2:
            if (!(dwall & W_WEST)) continue;
            x = broom.lx - 1;
            y = broom.ly + (dpos === -1
                ? random(1 + broom.hy - broom.ly) : dpos);
            if (!isok(x - 1, y)
                || IS_OBSTRUCTED(game.level.at(x - 1, y).typ)) continue;
            break;
        case 3:
            if (!(dwall & W_EAST)) continue;
            x = broom.hx + 1;
            y = broom.ly + (dpos === -1
                ? random(1 + broom.hy - broom.ly) : dpos);
            if (!isok(x + 1, y)
                || IS_OBSTRUCTED(game.level.at(x + 1, y).typ)) continue;
            break;
        }
        if (okdoor(x, y)) break;
    }
    if (trycnt >= 100) return false;
    if (!set_levltyp(x, y, dd.secret ? SDOOR : DOOR, { state: game }))
        return false;

    // struct rm.flags is a five-bit field. In particular, the parser's
    // D_SECRET pseudo-mask is truncated when it is assigned to an SDOOR.
    const mask = dd.mask & 0x1f;
    const loc = game.level.at(x, y);
    loc.flags = mask;
    loc.doormask = mask;
    return true;
}

// C ref: sp_lev.c lspo_door(), restricted to its room-wall form. Lua's
// random state resolution consumes and discards rnddoor() before create_door()
// rolls the actual state; rnddoor() never yields the parser-only secret state.
export function create_room_door(spec, broom, random = rn2) {
    const stateName = spec.state ?? 'random';
    const wallName = spec.wall ?? 'all';
    if (!Object.hasOwn(ROOM_DOOR_STATE_MASKS, stateName))
        throw new RangeError(`unsupported room door state ${JSON.stringify(stateName)}`);
    if (!Object.hasOwn(ROOM_DOOR_WALL_MASKS, wallName))
        throw new RangeError(`unsupported room door wall ${JSON.stringify(wallName)}`);

    const mask = ROOM_DOOR_STATE_MASKS[stateName];
    if (mask === -1) rnddoor(random);
    return create_door({
        secret: mask === D_SECRET ? 1 : 0,
        mask,
        pos: spec.pos ?? -1,
        wall: ROOM_DOOR_WALL_MASKS[wallName],
    }, broom, random);
}

// C ref: sp_lev.c shared_with_room()/maybe_add_door().
function shared_with_room(x, y, droom) {
    const map = game.level;
    const loc = map.at(x, y);
    const rmno = (droom.roomnoidx ?? -1) + ROOMOFFSET;
    if (!loc || rmno < ROOMOFFSET) return false;
    if (loc.roomno === rmno && !loc.edge) return false;
    if (isok(x - 1, y) && map.at(x - 1, y).roomno === rmno
        && x - 1 <= droom.hx) return true;
    if (isok(x + 1, y) && map.at(x + 1, y).roomno === rmno
        && x + 1 >= droom.lx) return true;
    if (isok(x, y - 1) && map.at(x, y - 1).roomno === rmno
        && y - 1 <= droom.hy) return true;
    if (isok(x, y + 1) && map.at(x, y + 1).roomno === rmno
        && y + 1 >= droom.ly) return true;
    return false;
}

function maybe_add_door(x, y, droom) {
    const loc = game.level.at(x, y);
    const rmno = (droom.roomnoidx ?? -1) + ROOMOFFSET;
    if (droom.hx >= 0 && loc
        && ((!droom.irregular && inside_room(droom, x, y))
            || loc.roomno === rmno
            || shared_with_room(x, y, droom))) {
        add_door(x, y, droom);
    }
}

// C ref: sp_lev.c link_doors_rooms(). Scans every tile for doors and links
// each to its adjacent room. Called from finish() after special level creation.
function link_doors_rooms() {
    const nroom = game.level?.nroom ?? 0;
    const rooms = game.level?.rooms ?? [];
    for (let y = 0; y < ROWNO; ++y) {
        for (let x = 0; x < COLNO; ++x) {
            const typ = game.level.at(x, y).typ;
            if (IS_DOOR(typ) || typ === SDOOR) {
                set_door_orientation(x, y, game);
                for (let i = 0; i < nroom; ++i) {
                    maybe_add_door(x, y, rooms[i]);
                    const subrooms = rooms[i].sbrooms ?? [];
                    const nsub = rooms[i].nsubrooms ?? subrooms.length;
                    for (let m = 0; m < nsub; ++m)
                        maybe_add_door(x, y, subrooms[m]);
                }
            }
        }
    }
}

// C ref: sp_lev.c add_doors_to_room(). lspo_room() calls this after a room's
// contents callback, then recurses through any already-completed subrooms.
export function add_doors_to_room(croom) {
    for (let x = croom.lx - 1; x <= croom.hx + 1; ++x) {
        for (let y = croom.ly - 1; y <= croom.hy + 1; ++y) {
            const typ = game.level.at(x, y)?.typ;
            if (IS_DOOR(typ) || typ === SDOOR)
                maybe_add_door(x, y, croom);
        }
    }
    const subrooms = croom.sbrooms ?? [];
    const count = croom.nsubrooms ?? subrooms.length;
    for (let i = 0; i < count; ++i)
        add_doors_to_room(subrooms[i]);
}

// C ref: mklev.c join()
function join(a, b, nxcor) {
    const g = game;
    const croom = g.level.rooms[a];
    const troom = g.level.rooms[b];
    if (!croom || !troom) return;
    if (!croom.needjoining || !troom.needjoining) return;
    if (troom.hx < 0 || croom.hx < 0) return;
    let dx, dy;
    const cc = { x: 0, y: 0 }, tt = { x: 0, y: 0 };
    if (troom.lx > croom.hx) {
        dx = 1; dy = 0;
        if (!finddpos(cc, DIR_E, croom)) return;
        if (!finddpos(tt, DIR_W, troom)) return;
    } else if (troom.hy < croom.ly) {
        dy = -1; dx = 0;
        if (!finddpos(cc, DIR_N, croom)) return;
        if (!finddpos(tt, DIR_S, troom)) return;
    } else if (troom.hx < croom.lx) {
        dx = -1; dy = 0;
        if (!finddpos(cc, DIR_W, croom)) return;
        if (!finddpos(tt, DIR_E, troom)) return;
    } else {
        dy = 1; dx = 0;
        if (!finddpos(cc, DIR_S, croom)) return;
        if (!finddpos(tt, DIR_N, troom)) return;
    }
    const xx = cc.x, yy = cc.y;
    const tx = tt.x - dx, ty = tt.y - dy;
    if (nxcor) {
        const loc = game.level.at(xx + dx, yy + dy);
        if (loc && loc.typ !== STONE) return;
    }
    const org = { x: xx + dx, y: yy + dy };
    const dest = { x: tx, y: ty };
    const npoints = { v: 0 };
    const ftyp = CORR;
    const dig_result = dig_corridor(org, dest, npoints, nxcor, ftyp, STONE);
    if ((npoints.v > 0) && (okdoor(xx, yy) || !nxcor))
        dodoor(xx, yy, croom);
    if (!dig_result) return;
    if (okdoor(tt.x, tt.y) || !nxcor)
        dodoor(tt.x, tt.y, troom);
    if (g.smeq[a] < g.smeq[b]) g.smeq[b] = g.smeq[a];
    else g.smeq[a] = g.smeq[b];
}

// C ref: mklev.c makecorridors()
function makecorridors() {
    const g = game;
    let any = true;
    for (let i = 0; i < g.level.nroom; i++) g.smeq[i] = i;
    for (let a = 0; a < g.level.nroom - 1; a++) {
        join(a, a + 1, false);
        if (!rn2(50)) break;
    }
    for (let a = 0; a < g.level.nroom - 2; a++)
        if (g.smeq[a] !== g.smeq[a + 2]) join(a, a + 2, false);
    for (let a = 0; any && a < g.level.nroom; a++) {
        any = false;
        for (let b = 0; b < g.level.nroom; b++)
            if (g.smeq[a] !== g.smeq[b]) { join(a, b, false); any = true; }
    }
    if (g.level.nroom > 2) {
        const count = rn2(g.level.nroom) + 4;
        for (let i = 0; i < count; i++) {
            let a = rn2(g.level.nroom);
            let b = rn2(g.level.nroom - 2);
            if (b >= a) b += 2;
            join(a, b, true);
        }
    }
}

// Keep the long-standing mklev.js surface while the shared implementation
// lives below both level generation and themed-fill creation.
export {
    add_room,
    dodoor,
    get_free_room_loc,
    get_location,
    get_location_coord,
    get_room_loc,
    inside_room,
    is_ok_location,
    occupied,
    place_branch,
    somex,
    somey,
    somexy,
    traptype_rnd,
    walkfrom,
};

// C ref: mkroom.c somexyspace(). The source do-while attempts one initial
// candidate plus at most 100 retries, for 101 total calls to somexy().
export function somexyspace(croom, c, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    let tryCnt = 0;
    let okay;
    do {
        okay = somexy(croom, c, env)
            && isok(c.x, c.y)
            && !occupied(c.x, c.y, state)
            && (state.level.at(c.x, c.y).typ === ROOM
                || state.level.at(c.x, c.y).typ === CORR
                || state.level.at(c.x, c.y).typ === ICE);
    } while (tryCnt++ < 100 && !okay);
    return okay;
}

// ============================================================
// Stairs
// ============================================================

function generate_stairs_room_good(croom, phase) {
    if (!croom || croom.hx < 0) return false;
    if (!croom.needjoining && phase >= 0) return false;
    let hasDown = false, hasUp = false;
    for (let st = game.stairs; st; st = st.next) {
        const inRoom = st.sx >= croom.lx && st.sx <= croom.hx
            && st.sy >= croom.ly && st.sy <= croom.hy;
        if (!inRoom) continue;
        if (st.up) hasUp = true; else hasDown = true;
    }
    if (phase >= 1 && (hasDown || hasUp)) return false;
    if (croom.rtype !== OROOM && !(phase < 2 && croom.rtype === THEMEROOM)) return false;
    return true;
}

function generate_stairs_find_room() {
    const g = game;
    if (!g.level.nroom) return null;
    for (let phase = 2; phase > -1; phase--) {
        const candidates = [];
        for (let i = 0; i < g.level.nroom; i++)
            if (generate_stairs_room_good(g.level.rooms[i], phase))
                candidates.push(i);
        if (candidates.length > 0) {
            const pick = rn2(candidates.length);
            return g.level.rooms[candidates[pick]];
        }
    }
    return g.level.rooms[rn2(g.level.nroom)];
}

export function mkstairs(x, y, up, croom) {
    const g = game;
    const loc = g.level.at(x, y);
    if (loc) {
        loc.typ = STAIRS;
        loc.ladder = up ? 1 : 2;
    }
    const dest = {
        dnum: g.u?.uz?.dnum ?? 0,
        dlevel: (g.u?.uz?.dlevel ?? 1) + (up ? -1 : 1),
    };
    stairway_add(x, y, !!up, false, dest);
    if (up) g.level.upstair = { x, y };
    else g.level.dnstair = { x, y };
}

async function generate_stairs() {
    const g = game;
    const pos = { x: 0, y: 0 };
    // Down stairs
    {
        const croom = generate_stairs_find_room();
        if (croom) {
            if (!somexyspace(croom, pos)) {
                pos.x = somex(croom);
                pos.y = somey(croom);
            }
            mkstairs(pos.x, pos.y, 0, croom);
        }
    }
    // Up stairs only if not level 1
    if ((g.u?.uz?.dlevel ?? 1) !== 1) {
        const croom = generate_stairs_find_room();
        if (croom) {
            if (!somexyspace(croom, pos)) {
                pos.x = somex(croom);
                pos.y = somey(croom);
            }
            mkstairs(pos.x, pos.y, 1, croom);
        }
    }
}

// ============================================================
// Niches
// ============================================================

function cardinal_nextto_room(aroom, x, y) {
    const map = game.level;
    const rmno = game.level.rooms.indexOf(aroom) + ROOMOFFSET;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if (!isok(x + dx, y + dy)) continue;
        const loc = map.at(x + dx, y + dy);
        if (loc && !loc.edge && loc.roomno === rmno) return true;
    }
    return false;
}

function place_niche(aroom) {
    let dy;
    const dd = { x: 0, y: 0 };
    if (rn2(2)) {
        dy = 1;
        if (!finddpos(dd, DIR_S, aroom)) return null;
    } else {
        dy = -1;
        if (!finddpos(dd, DIR_N, aroom)) return null;
    }
    const xx = dd.x, yy = dd.y;
    const niche = game.level.at(xx, yy + dy);
    const back = game.level.at(xx, yy - dy);
    if (!niche || niche.typ !== STONE) return null;
    if (!back || IS_POOL(back.typ) || IS_FURNITURE(back.typ)) return null;
    if (!cardinal_nextto_room(aroom, xx, yy)) return null;
    return { dy, xx, yy };
}

export async function makeniche(trap_type) {
    const g = game;
    let vct = 8;
    while (vct--) {
        const aroom = g.level.rooms[rn2(g.level.nroom)];
        if (!aroom || aroom.rtype !== OROOM) continue;
        if (aroom.doorct === 1 && rn2(5)) continue;
        const niche = place_niche(aroom);
        if (!niche) continue;
        const { dy, xx, yy } = niche;
        const rm = g.level.at(xx, yy + dy);
        if (!rm) continue;
        if (trap_type || !rn2(4)) {
            rm.typ = SCORR;
            if (trap_type) {
                if (is_hole(trap_type) && !Can_fall_thru(g.u.uz, g))
                    trap_type = ROCKTRAP;
                const trap = await maketrap(xx, yy + dy, trap_type);
                if (trap) {
                    if (trap_type !== ROCKTRAP) trap.once = true;
                    const engraving = TRAP_ENGRAVINGS.get(trap_type);
                    if (engraving) {
                        make_engr_at(xx, yy - dy, engraving, null, 0, DUST);
                        wipe_engr_at(xx, yy - dy, 5, false);
                    }
                }
            }
            dosdoor(xx, yy, aroom, SDOOR);
        } else {
            rm.typ = CORR;
            if (rn2(7)) {
                dosdoor(xx, yy, aroom, rn2(5) ? SDOOR : DOOR);
            } else {
                const loc = g.level.at(xx, yy);
                if (!rn2(5) && loc && IS_WALL(loc.typ)) {
                    set_levltyp(xx, yy, IRONBARS, { state: g });
                    if (rn2(3)) {
                        const species = mkclass(S_HUMAN, 0);
                        mkcorpstat(
                            CORPSE,
                            null,
                            species,
                            xx,
                            yy + dy,
                            1,
                            levelObjectEnv(),
                        );
                    }
                }
                if (!g.level.flags.noteleport) {
                    mksobj_at(
                        SCR_TELEPORTATION,
                        xx,
                        yy + dy,
                        true,
                        false,
                        levelObjectEnv(),
                    );
                }
                if (!rn2(3)) {
                    mkobj_at(
                        RANDOM_CLASS,
                        xx,
                        yy + dy,
                        true,
                        levelObjectEnv(),
                    );
                }
            }
        }
        return;
    }
}

async function make_niches() {
    const g = game;
    let ct = rnd(Math.trunc(g.level.nroom / 2) + 1);
    let ltptr = ((g.u?.uz?.dlevel ?? 1) > 15);
    let vamp = ((g.u?.uz?.dlevel ?? 1) > 5 && (g.u?.uz?.dlevel ?? 1) < 25);
    while (ct--) {
        if (ltptr && !rn2(6)) {
            ltptr = false;
            await makeniche(LEVEL_TELEP);
        } else if (vamp && !rn2(6)) {
            vamp = false;
            await makeniche(TRAPDOOR);
        } else {
            await makeniche(NO_TRAP);
        }
    }
}

// ============================================================
// Branch placement
// ============================================================

function is_branchlev() {
    const g = game;
    if (!g.branches) return null;
    for (const br of g.branches) {
        if (br?.end1?.dnum === (g.u?.uz?.dnum ?? 0) && br?.end1?.dlevel === (g.u?.uz?.dlevel ?? 1)) return br;
        if (br?.end2?.dnum === (g.u?.uz?.dnum ?? 0) && br?.end2?.dlevel === (g.u?.uz?.dlevel ?? 1)) return br;
    }
    return null;
}

function find_branch_room(mp) {
    const croom = generate_stairs_find_room();
    if (croom) somexyspace(croom, mp);
    return croom;
}

// C ref: mklev.c place_branch(). When x is nonzero the branch is placed at
// (x, y) directly; otherwise find_branch_room picks a random location.
function place_branch(branchp, x = 0, y = 0) {
    const g = game;
    if (!branchp || g.made_branch) return;
    if (!x) {
        const mp = { x: 0, y: 0 };
        const croom = find_branch_room(mp);
        if (!croom || mp.x <= 0) { g.made_branch = true; return; }
        x = mp.x;
        y = mp.y;
    }
    const on_end1 = (branchp.end1?.dnum === g.u?.uz?.dnum
        && branchp.end1?.dlevel === g.u?.uz?.dlevel);
    const dest = on_end1 ? branchp.end2 : branchp.end1;
    // C ref: mklev.c:1727-1739
    if (branchp.type === BR_PORTAL) {
        mkportal(x, y, dest.dnum, dest.dlevel, g);
    } else {
        const make_stairs = on_end1
            ? branchp.type !== BR_NO_END1
            : branchp.type !== BR_NO_END2;
        if (make_stairs) {
            const goes_up = on_end1 ? !!branchp.end1_up : !branchp.end1_up;
            stairway_add(x, y, goes_up, false, dest || { dnum: 0, dlevel: 0 });
            const loc = g.level?.at(x, y);
            if (loc) {
                loc.typ = STAIRS;
                loc.ladder = goes_up ? LA_UP : LA_DOWN;
            }
        }
    }
    g.made_branch = true;
}

// C ref: detect.c premap_detect() (2134-2159). Reveals the full map for
// premapped levels (Sokoban). Called after fixup_special so branch stairs
// are included.
function premap_detect(state) {
    for (let x = 1; x < COLNO; x++) {
        for (let y = 0; y < ROWNO; y++) {
            const loc = state.level.at(x, y);
            if (loc.typ === STONE
                && (loc.wall_info & (W_NONDIGGABLE | W_NONPASSWALL)) !== 0)
                continue;
            loc.seenv = SVALL;
            loc.waslit = true;
            if (loc.typ === SDOOR) loc.wall_info = 0;
            map_background(x, y, 1, state);
            const obj = sobj_at(BOULDER, x, y, state);
            if (obj) map_object(obj, 1, state);
        }
    }
    for (const trap of state.level.traps) {
        trap.tseen = 1;
        map_trap(trap, 1, state);
    }
}

// ============================================================
// Wallification
// ============================================================

function extend_spine(locale, wall_there, dx, dy) {
    const nx = 1 + dx, ny = 1 + dy;
    if (!wall_there) return 0;
    if (dx) {
        if (locale[1][0] && locale[1][2] && locale[nx][0] && locale[nx][2]) return 0;
        return 1;
    }
    if (locale[0][1] && locale[2][1] && locale[0][ny] && locale[2][ny]) return 0;
    return 1;
}
function wall_cleanup(x1, y1, x2, y2, state = game) {
    const map = state.level;
    if (!map) return;
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) {
            const protectedArea = state.bughack?.inarea;
            if (protectedArea && within_bounded_area(
                x, y,
                protectedArea.x1, protectedArea.y1,
                protectedArea.x2, protectedArea.y2,
            )) continue;
            const loc = map.at(x, y);
            const typ = loc?.typ ?? STONE;
            if (!(IS_WALL(typ) && typ !== DBWALL)) continue;
            if (is_solid(x-1,y-1,state) && is_solid(x-1,y,state)
                && is_solid(x-1,y+1,state) && is_solid(x,y-1,state)
                && is_solid(x,y+1,state) && is_solid(x+1,y-1,state)
                && is_solid(x+1,y,state) && is_solid(x+1,y+1,state))
                loc.typ = STONE;
        }
}
function fix_wall_spines(x1, y1, x2, y2, state = game) {
    const spineArray = [VWALL, HWALL, HWALL, HWALL,
        VWALL, TRCORNER, TLCORNER, TDWALL,
        VWALL, BRCORNER, BLCORNER, TUWALL,
        VWALL, TLWALL, TRWALL, CROSSWALL];
    const map = state.level;
    if (!map) return;
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) {
            const loc = map.at(x, y);
            const typ = loc?.typ ?? STONE;
            if (!(IS_WALL(typ) && typ !== DBWALL)) continue;
            const protectedArea = state.bughack?.inarea;
            const locationTest = protectedArea && within_bounded_area(
                x, y,
                protectedArea.x1, protectedArea.y1,
                protectedArea.x2, protectedArea.y2,
            ) ? iswall : iswall_or_stone;
            const locale = [
                [locationTest(x-1,y-1,state), locationTest(x-1,y,state), locationTest(x-1,y+1,state)],
                [locationTest(x,y-1,state), 0, locationTest(x,y+1,state)],
                [locationTest(x+1,y-1,state), locationTest(x+1,y,state), locationTest(x+1,y+1,state)],
            ];
            const bits = (extend_spine(locale, iswall(x,y-1,state), 0, -1) << 3)
                | (extend_spine(locale, iswall(x,y+1,state), 0, 1) << 2)
                | (extend_spine(locale, iswall(x+1,y,state), 1, 0) << 1)
                | extend_spine(locale, iswall(x-1,y,state), -1, 0);
            if (bits) loc.typ = spineArray[bits];
        }
}
export function wallification(x1, y1, x2, y2, state = game) {
    wall_cleanup(x1, y1, x2, y2, state);
    fix_wall_spines(x1, y1, x2, y2, state);
}

// C ref: sp_lev.c map_cleanup(). Liquid squares cannot retain boulders,
// ordinary traps, or engravings after a special level has been loaded.
export function map_cleanup(state = game) {
    const objectEnv = objectGenerationEnv({
        state,
        hooks: {
            recalcBlockPoint: (x, y, env) => {
                recalc_block_point(x, y, env.state);
            },
        },
    });

    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const typ = state.level.at(x, y).typ;
            if (!IS_LAVA(typ) && !IS_POOL(typ)) continue;

            // C ref: remove every BOULDER with sobj_at(), obj_extract_self(),
            // and obfree(), preserving the level and square object chains.
            let boulder;
            while ((boulder = sobj_at(BOULDER, x, y, state)) !== null) {
                obj_extract_self(boulder, objectEnv);
                obfree(boulder, null, objectEnv);
            }

            // C ref: deltrap() removes a liquid-cell trap unless it is one of
            // the two traps explicitly protected by undestroyable_trap().
            const trap = t_at(x, y, state);
            if (trap && !undestroyable_trap(trap.ttyp)) deltrap(trap, state);

            if (engr_at(x, y, state)) del_engr_at(x, y, state);
        }
    }
}

// C ref: sp_lev.c solidify_map(). Marks STONE wall tiles that are outside the
// map fragment as non-diggable and non-passwall. SpLev_Map is the C-side
// bitmap tracking which tiles the special level actually placed; because the
// JS port does not maintain that bitmap, every STONE tile receives the flags.
// This is equivalent to the C behavior for levels whose map covers all walls
// (tower1-3, for example, fill every non-STONE tile explicitly).
function solidify_map(state) {
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const loc = state.level.at(x, y);
            if (IS_STWALL(loc.typ))
                loc.wall_info |= (W_NONDIGGABLE | W_NONPASSWALL);
        }
    }
}

// ============================================================
// Fill ordinary room
// ============================================================

const SUPPLY_ITEMS = [
    POT_EXTRA_HEALING,
    POT_SPEED,
    POT_GAIN_ENERGY,
    SCR_ENCHANT_WEAPON,
    SCR_ENCHANT_ARMOR,
    SCR_CONFUSE_MONSTER,
    SCR_SCARE_MONSTER,
    WAN_DIGGING,
    SPE_HEALING,
];

// Built per call rather than at module scope. SPBOOK_NO_NOVEL is a js/obj.js
// module-scope const, and js/obj.js imports js/eat.js, which since the #eat
// command landed reaches this file: a module-scope read here would run while
// js/obj.js's own body is still in its temporal dead zone. The table is read
// once per supply chest, so rebuilding it costs nothing a level pays.
function supplyExtraClasses() {
    return [
        FOOD_CLASS,
        WEAPON_CLASS,
        ARMOR_CLASS,
        GEM_CLASS,
        SCROLL_CLASS,
        POTION_CLASS,
        RING_CLASS,
        SPBOOK_NO_NOVEL,
        SPBOOK_NO_NOVEL,
        SPBOOK_NO_NOVEL,
    ];
}

function isMinesEntrance(branch, state) {
    const mines = state.mines_dnum;
    return Boolean(branch
        && state.u.uz.dnum !== mines
        && (branch.end1?.dnum === mines || branch.end2?.dnum === mines));
}

export function populateSupplyChest(position, env) {
    const { state } = env;
    const random = env.random?.rn2 ?? rn2;
    const chest = mksobj_at(
        random(3) ? CHEST : LARGE_BOX,
        position.x,
        position.y,
        false,
        false,
        env,
    );
    chest.olocked = Boolean(random(6));

    let tries = 0;
    let cursed;
    do {
        const otyp = random(2)
            ? POT_HEALING
            : SUPPLY_ITEMS[random(SUPPLY_ITEMS.length)];
        const obj = mksobj(otyp, true, false, env);
        if (otyp === POT_HEALING && random(2)) {
            obj.quan = 2;
            obj.owt = weight(obj, env);
        }
        cursed = obj.cursed;
        add_to_container(chest, obj, env);
        if (++tries === 50) break;
    } while (cursed || !random(5));

    if (random(3)) {
        const extraClasses = supplyExtraClasses();
        const objectClass = extraClasses[random(extraClasses.length)];
        let obj = mkobj(objectClass, false, env);
        if (objectClass === SPBOOK_NO_NOVEL) {
            const maxPass = depth(state.u.uz, state) > 2 ? 2 : 3;
            for (let pass = 1; pass <= maxPass; ++pass) {
                const candidate = mkobj(objectClass, false, env);
                if (state.objects[obj.otyp].oc_level
                    <= state.objects[candidate.otyp].oc_level) {
                    dealloc_obj(candidate, env);
                } else {
                    dealloc_obj(obj, env);
                    obj = candidate;
                }
            }
        }
        add_to_container(chest, obj, env);
    }

    chest.owt = weight(chest, env);
    return chest;
}

// C ref: mklev.c fill_ordinary_room().
export function fill_ordinary_room(croom, bonusItems) {
    const state = game;
    if (!croom || (croom.rtype !== OROOM && croom.rtype !== THEMEROOM))
        return;

    const subrooms = croom.sbrooms ?? [];
    const subroomCount = croom.nsubrooms ?? subrooms.length;
    for (let index = 0; index < subroomCount; ++index) {
        const subroom = subrooms[index];
        if (!subroom) return;
        fill_ordinary_room(subroom, false);
    }

    if (croom.needfill !== FILL_NORMAL) return;

    const env = levelObjectEnv({
        hooks: { bydoor, makeMonster: makemon, somexyspace },
    });
    const position = { x: 0, y: 0 };
    let tryCount = 0;

    if ((state.u.uhave.amulet || !rn2(3))
        && somexyspace(croom, position)) {
        const monster = makemon(
            null,
            position.x,
            position.y,
            MM_NOGRP,
            env,
        );
        if (monster?.data === state.mons[PM_GIANT_SPIDER]
            && !occupied(position.x, position.y, state)) {
            maketrap(position.x, position.y, WEB, env);
        }
    }

    let chance = 8 - Math.trunc(level_difficulty(state) / 6);
    if (chance <= 1) chance = 2;
    while (!rn2(chance) && ++tryCount < 1000) {
        make_level_trap(0, MKTRAP_NOFLAGS, croom, null, env);
    }

    if (!rn2(3) && somexyspace(croom, position))
        mkgold(0, position.x, position.y, env);

    if (!on_level(state.u.uz, state.rogue_level)) {
        if (!rn2(10)) mkfount(croom, env);
        if (!rn2(60)) mksink(croom, env);
        if (!rn2(60)) mkaltar(croom, env);

        chance = 80 - depth(state.u.uz, state) * 2;
        if (chance < 2) chance = 2;
        if (!rn2(chance)) mkgrave(croom, env);

        if (!rn2(20) && somexyspace(croom, position)) {
            mkcorpstat(
                STATUE,
                null,
                null,
                position.x,
                position.y,
                CORPSTAT_INIT,
                env,
            );
        }

        let skipChests = false;
        if (bonusItems && somexyspace(croom, position)) {
            const branch = is_branchlev();
            if (isMinesEntrance(branch, state)) {
                const food = rn2(5) < 3
                    ? FOOD_RATION
                    : rn2(2) ? CRAM_RATION : LEMBAS_WAFER;
                mksobj_at(
                    food,
                    position.x,
                    position.y,
                    true,
                    false,
                    env,
                );
            } else if (state.oracle_level
                && state.u.uz.dnum === state.oracle_level.dnum
                && state.u.uz.dlevel < state.oracle_level.dlevel
                && rn2(3)) {
                populateSupplyChest(position, env);
                skipChests = true;
            }
        }

        const chestBound = Math.trunc(state.level.nroom * 5 / 2);
        if (!skipChests && !rn2(chestBound)
            && somexyspace(croom, position)) {
            mksobj_at(
                rn2(3) ? LARGE_BOX : CHEST,
                position.x,
                position.y,
                true,
                false,
                env,
            );
        }

        if (!rn2(27 + 3 * Math.abs(depth(state.u.uz, state)))) {
            const engraving = random_engraving();
            if (engraving.text) {
                do {
                    somexyspace(croom, position);
                } while (state.level.at(position.x, position.y).typ !== ROOM
                    && !rn2(40));
                if (state.level.at(position.x, position.y).typ === ROOM) {
                    make_engr_at(
                        position.x,
                        position.y,
                        engraving.text,
                        engraving.pristine,
                        0,
                        MARK,
                    );
                }
            }
        }
    }

    if (!rn2(3) && somexyspace(croom, position)) {
        mkobj_at(
            RANDOM_CLASS,
            position.x,
            position.y,
            true,
            env,
        );
        tryCount = 0;
        while (!rn2(5)) {
            if (++tryCount > 100) break;
            if (somexyspace(croom, position)) {
                mkobj_at(
                    RANDOM_CLASS,
                    position.x,
                    position.y,
                    true,
                    env,
                );
            }
        }
    }
}

// ============================================================
// Level finalize topology
// ============================================================

function get_level_extends() {
    const map = game.level;
    let xmin = 0, xmax = COLNO - 1, ymin = 0, ymax = ROWNO - 1;
    let found = false, nonwall = false;
    for (xmin = 0; !found && xmin <= COLNO - 1; xmin++) {
        for (let y = 0; y <= ROWNO - 1; y++) {
            const typ = map.at(xmin, y)?.typ ?? STONE;
            if (typ !== STONE) { found = true; if (!IS_WALL(typ)) nonwall = true; }
        }
    }
    xmin -= (nonwall || !game.level?.flags?.is_maze_lev) ? 2 : 1;
    found = false; nonwall = false;
    for (xmax = COLNO - 1; !found && xmax >= 0; xmax--) {
        for (let y = 0; y <= ROWNO - 1; y++) {
            const typ = map.at(xmax, y)?.typ ?? STONE;
            if (typ !== STONE) { found = true; if (!IS_WALL(typ)) nonwall = true; }
        }
    }
    xmax += (nonwall || !game.level?.flags?.is_maze_lev) ? 2 : 1;
    found = false; nonwall = false;
    for (ymin = 0; !found && ymin <= ROWNO - 1; ymin++) {
        for (let x = xmin; x <= xmax; x++) {
            const typ = map.at(x, ymin)?.typ ?? STONE;
            if (typ !== STONE) { found = true; if (!IS_WALL(typ)) nonwall = true; }
        }
    }
    ymin -= (nonwall || !game.level?.flags?.is_maze_lev) ? 2 : 1;
    found = false; nonwall = false;
    for (ymax = ROWNO - 1; !found && ymax >= 0; ymax--) {
        for (let x = xmin; x <= xmax; x++) {
            const typ = map.at(x, ymax)?.typ ?? STONE;
            if (typ !== STONE) { found = true; if (!IS_WALL(typ)) nonwall = true; }
        }
    }
    ymax += (nonwall || !game.level?.flags?.is_maze_lev) ? 2 : 1;
    return { xmin, xmax, ymin, ymax };
}

function bound_digging() {
    const map = game.level;
    const { xmin, xmax, ymin, ymax } = get_level_extends();
    for (let x = 0; x < COLNO; x++)
        for (let y = 0; y < ROWNO; y++) {
            const loc = map.at(x, y);
            if (!loc) continue;
            if (IS_STWALL(loc.typ) && (y <= ymin || y >= ymax || x <= xmin || x >= xmax)) {
                loc.wall_info = (loc.wall_info || 0) | W_NONDIGGABLE;
            }
        }
}

function level_finalize_topology() {
    const dnum = game.u?.uz?.dnum ?? 0;
    if (game._luathemes_loaded?.[dnum]) {
        // C ref: mklev.c themerooms_post_level_generate(). Deferred themed
        // work runs after every room fill and before final wallification.
        run_themeroom_postprocess();
        wallification(1, 0, COLNO - 1, ROWNO - 1);
    }
    bound_digging();
    mineralize(-1, -1, -1, -1, false, { state: game });
    game.in_mklev = false;
    // mklev.c:level_finalize_topology() clears the Lua coordinate origin after
    // post-level callbacks because xstart/ystart are not persisted with a
    // level.  Later special-level operations must start from the zero frame.
    game.xstart = 0;
    game.ystart = 0;
    if (!game.level?.flags?.is_maze_lev) {
        const nroom = game.level?.nroom ?? 0;
        for (let i = 0; i < nroom; i++)
            topologize(game.level.rooms?.[i]);
    }
    set_wall_state();
    const rooms = game.level?.rooms ?? [];
    for (let i = 0; i < rooms.length; i++) {
        const rm = rooms[i];
        if (rm && rm.rtype != null) rm.orig_rtype = rm.rtype;
    }
}
