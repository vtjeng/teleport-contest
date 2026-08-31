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
    Is_branchlev,
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
} from './mkroom.js';
import { mkcorpstat } from './corpstat.js';
import { del_engr_at, make_engr_at, wipe_engr_at } from './engrave.js';
import { map_background, map_object, map_trap, set_wall_state } from './display.js';
import { def_char_to_monclass } from './drawing.js';
import { add_to_container } from './invent.js';
import { UnsupportedMonsterCreationError, makemon } from './makemon_create.js';
import { mkclass } from './makemon.js';
import { mineralize } from './mineralize.js';
import { place_lregion } from './mkmaze.js';
import { d, rn2, rnd, rn1, rne, rnz } from './rng.js';
import { init_rect, rnd_rect, get_rect, split_rects } from './rect.js';
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
    SPE_HEALING,
    STATUE,
    WAN_DIGGING,
    WAN_TELEPORTATION,
    WEAPON_CLASS,
} from './objects.js';
import { maketrap, t_at } from './trap.js';
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
    initialize_themeroom_postprocess_branch,
    run_themeroom_postprocess,
    themeroom_fill,
} from './themeroom_fill.js';
import {
    G_IGNORE,
    G_NOGEN,
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
import { THEMEROOM_DEFINITIONS } from './themeroom_data.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';
import {
    COLNO, ROWNO, STONE, ROOM, CORR, DOOR, STAIRS, LADDER,
    LA_UP, LA_DOWN, DRY, SP_COORD_IS_RANDOM,
    HWALL, VWALL, TLCORNER, TRCORNER, BLCORNER, BRCORNER,
    CROSSWALL, TUWALL, TDWALL, TLWALL, TRWALL,
    D_NODOOR, D_BROKEN, D_CLOSED, D_ISOPEN, D_LOCKED, D_TRAPPED, D_SECRET,
    OROOM, THEMEROOM, COURT, SWAMP, VAULT, BEEHIVE, MORGUE,
    BARRACKS, ZOO, TEMPLE, LEPREHALL, COCKNEST, ANTHOLE, SHOPBASE,
    ARMORSHOP, WEAPONSHOP,
    ROOMOFFSET, MAXNROFROOMS, MAX_SUBROOMS, SHARED,
    SDOOR, SCORR, IRONBARS, FOUNTAIN, SINK, THRONE, TREE,
    DUST, ENGRAVE, BURN, ENGR_BLOOD,
    DIR_N, DIR_S, DIR_E, DIR_W, DIR_180,
    IS_WALL, IS_STWALL, IS_DOOR, IS_ROOM, IS_OBSTRUCTED, IS_FURNITURE, IS_POOL,
    IS_LAVA,
    isok, W_NONDIGGABLE, W_NONPASSWALL,
    W_RANDOM, W_NORTH, W_SOUTH, W_EAST, W_WEST, W_ANY,
    FILL_NONE, FILL_NORMAL,
    G_GONE,
    ICE, MOAT, POOL, WATER, LAVAPOOL, LAVAWALL,
    DBWALL, DRAWBRIDGE_UP, DRAWBRIDGE_DOWN,
    DB_NORTH, DB_SOUTH, DB_EAST, DB_WEST, DB_LAVA,
    AIR, CLOUD,
    MAX_TYPE, MATCH_WALL,
    A_LAWFUL, A_NEUTRAL, A_CHAOTIC, A_NONE,
    Align2amask,
    ALTAR,
    DELPHI,
    LR_BRANCH, LR_DOWNSTAIR, LR_UPSTAIR,
    LR_TELE, MALE,
    NO_TRAP,
    ARROW_TRAP, DART_TRAP, ROCKTRAP, SQKY_BOARD, BEAR_TRAP,
    LANDMINE, ROLLING_BOULDER_TRAP, SLP_GAS_TRAP, RUST_TRAP, FIRE_TRAP,
    PIT, SPIKED_PIT, HOLE, TRAPDOOR, TELEP_TRAP, LEVEL_TELEP,
    MAGIC_PORTAL, WEB, STATUE_TRAP, MAGIC_TRAP, ANTI_MAGIC,
    POLY_TRAP, VIBRATING_SQUARE,
    MKTRAP_NOFLAGS, MKTRAP_MAZEFLAG, MKTRAP_NOSPIDERONWEB,
    MKTRAP_NOVICTIM, MKTRAP_SEEN,
    BR_PORTAL, BR_NO_END1, BR_NO_END2, SVALL,
    CORPSTAT_INIT, MARK, MM_NOGRP, NO_MM_FLAGS,
    In_quest, NO_ROOM,
    TRAPNUM,
    In_endgame,
    is_hole,
    is_pit,
} from './const.js';

const XLIM = 4;
const YLIM = 3;

// sp_lev.c room alignment values are private to that loader.
const SPLEV_CENTER = 3;
const SPLEV_RIGHT = 5;
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

// C ref: sp_lev.c trap_types[]. Maps Lua trap-name strings used in .des files
// to the numeric trap-type constants mktrap() expects.
const TRAP_TYPES_BY_NAME = new Map([
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
]);

// C ref: sp_lev.c get_traptype_byname(). Resolves a Lua trap-name string to
// its numeric constant. Returns NO_TRAP when the name is unrecognized.
function get_traptype_byname(name) {
    return TRAP_TYPES_BY_NAME.get(name?.toLowerCase()) ?? NO_TRAP;
}

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

    const ok = loadBones(state);

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

    deleteBonesFile(state.u.uz);
    return ok;
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
        if (slev && slev.proto) {
            if (!SPECIAL_LEVEL_LOADERS) {
                const { BIGRM_LOADERS } = await import('./bigrm.js');
                const { QUEST_LEVEL_LOADERS } = await import(
                    './quest_levels.js'
                );
                const { SOKOBAN_LEVEL_LOADERS } = await import(
                    './sokoban_levels.js'
                );
                const { CASTLE_LEVEL_LOADERS } = await import(
                    './castle_levels.js'
                );
                const { MINES_LEVEL_LOADERS } = await import(
                    './mines_levels.js'
                );
                SPECIAL_LEVEL_LOADERS = {
                    ...BIGRM_LOADERS,
                    ...QUEST_LEVEL_LOADERS,
                    ...SOKOBAN_LEVEL_LOADERS,
                    ...CASTLE_LEVEL_LOADERS,
                    ...MINES_LEVEL_LOADERS,
                };
            }
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
        if (!SPECIAL_LEVEL_LOADERS) {
            const { BIGRM_LOADERS } = await import('./bigrm.js');
            const { QUEST_LEVEL_LOADERS } = await import(
                './quest_levels.js'
            );
            const { SOKOBAN_LEVEL_LOADERS } = await import(
                './sokoban_levels.js'
            );
            SPECIAL_LEVEL_LOADERS = {
                ...BIGRM_LOADERS,
                ...QUEST_LEVEL_LOADERS,
                ...SOKOBAN_LEVEL_LOADERS,
            };
        }
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
    initialize_themeroom_branch(g, rn2);

    await makerooms();

    if (g.level.nroom <= 0) return;
    sort_rooms();
    await generate_stairs();

    // Branch check
    const branchp = is_branchlev();
    // C ref: mklev.c:1306. A level that carries a dungeon branch needs one
    // more room before it can spare one for a special room.
    let room_threshold = branchp ? 4 : 3;

    makecorridors();
    await make_niches();

    // C ref: mklev.c makelevel() secret-vault realization and retry.
    if (g.vault_x !== -1) {
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
// (340-377) entry for entry, so no character C accepts reaches the default arm.
//
// The default arm cannot be raised, and is not converted for that reason.
// C returns INVALID_TYPE there instead of failing, and its three consumers
// then diverge: lspo_map() skips the cell, while get_table_mapchr_opt() and
// nhlsel.c's selection filter raise a Lua error. Both data sources that reach
// here are fixed tables this repository ships, and both are covered --
// js/tutorial_level.js TUTORIAL_MAP uses " #+-.FLPSTWZ|", and the nineteen
// maps in js/themeroom_data.js use "-.Lx|}" between them. scripts/
// tutorial-startup.test.mjs and scripts/themeroom-data.test.mjs run every
// character of both through this function, so a map that ever needs a new
// one fails there rather than escaping runSegment().
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
    default: throw new Error(`unsupported special-level map character ${JSON.stringify(char)}`);
    }
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

const SPECIAL_DOOR_STATES = Object.freeze({
    open: D_ISOPEN,
    closed: D_CLOSED,
    locked: D_LOCKED,
    nodoor: D_NODOOR,
    broken: D_BROKEN,
});
const RANDOM_SPECIAL_DOOR_STATES = Object.freeze([
    D_NODOOR,
    D_BROKEN,
    D_ISOPEN,
    D_CLOSED,
    D_LOCKED,
]);

function specialCoordinate(frame, coordinate) {
    if (!Array.isArray(coordinate)
        || !Number.isInteger(coordinate[0])
        || !Number.isInteger(coordinate[1])) {
        throw new TypeError('special-level coordinate requires [x, y]');
    }
    return {
        x: frame.xstart + coordinate[0],
        y: frame.ystart + coordinate[1],
    };
}

// C ref: sp_lev.c set_door_orientation(). Tutorial doors all have an
// adjacent wall or door, so the source's unwallified-rock fallback is not
// reachable for this loader.
function setSpecialDoorOrientation(x, y, state) {
    const isDoorWall = (xx, yy) => {
        const typ = state.level.at(xx, yy)?.typ;
        return typ != null && (IS_WALL(typ) || IS_DOOR(typ) || typ === SDOOR);
    };
    const wleft = isDoorWall(x - 1, y);
    const wright = isDoorWall(x + 1, y);
    const wup = isDoorWall(x, y - 1);
    const wdown = isDoorWall(x, y + 1);
    state.level.at(x, y).horizontal = Boolean(
        (wleft || wright) && !(wup && wdown),
    );
}

function lightSpecialArea(frame, specification, state) {
    const [rx1, ry1, rx2, ry2] = specification.area;
    const grow = specification.lit ? 1 : 0;
    const x1 = Math.max(0, frame.xstart + rx1 - grow);
    const y1 = Math.max(0, frame.ystart + ry1 - grow);
    const x2 = Math.min(COLNO - 1, frame.xstart + rx2 + grow);
    const y2 = Math.min(ROWNO - 1, frame.ystart + ry2 + grow);
    for (let x = x1; x <= x2; ++x)
        for (let y = y1; y <= y2; ++y)
            state.level.at(x, y).lit = Boolean(specification.lit);
}

function lightSpecialMatch(frame, mapCharacter, lit, state) {
    const typ = splev_chr2typ(mapCharacter);
    for (let x = 0; x < frame.xsize; ++x) {
        for (let y = 0; y < frame.ysize; ++y) {
            const location = state.level.at(frame.xstart + x, frame.ystart + y);
            if (location.typ === typ) location.lit = Boolean(lit);
        }
    }
}

// C ref: sp_lev.c, the lspo_* handlers a des-file calls. makelevel() builds one
// of these only when mklev() was given a specialLevelLoader, and
// js/tutorial_startup.js is the only production caller that supplies one, with
// js/tutorial_level.js loadTutorialLevel() for dat/tut-1.lua.
//
// Three arms below refuse a value C accepts, and all three are unreachable for
// that reason, so none is converted to a boundary class:
//
//   level_init() takes only `solidfill`, where sp_lev.c lspo_level_init() also
//     takes mazegrid, maze, rogue, mines and swamp. The tutorial makes one
//     call, and it is solidfill.
//   level_flags() takes the five names the tutorial passes, where
//     lspo_level_flags() takes twenty-five. The other twenty appear in level
//     files this port does not ship, and three of the five appear in no file
//     but tut-1.lua and tut-2.lua.
//   door() takes SPECIAL_DOOR_STATES plus `random`, where lspo_door() also
//     takes `secret`. The tutorial's twelve door() calls use closed, locked,
//     nodoor, open and random.
//
// scripts/tutorial-startup.test.mjs replays the loader against a recording
// stub and fails if it ever supplies a value outside those sets, so a second
// ported level file reopens the question there rather than in a session.

// Lazily populated on first use to avoid a circular import: bigrm.js
// imports splev_chr2typ from this file, and this file imports
// BIGRM_LOADERS from bigrm.js. The dynamic import() in makemaz()
// resolves the cycle after both modules have finished evaluating.
let SPECIAL_LEVEL_LOADERS = null;

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
        // C ref: mkmaze.c:1184-1193. load_special() runs the Lua level
        // definition and applies post-processing.
        if (!SPECIAL_LEVEL_LOADERS) {
            // Lazy initialization breaks the circular import between
            // mklev.js and bigrm.js.
            const { BIGRM_LOADERS } = await import('./bigrm.js');
            const { QUEST_LEVEL_LOADERS } = await import(
                './quest_levels.js'
            );
            const { SOKOBAN_LEVEL_LOADERS } = await import(
                './sokoban_levels.js'
            );
            const { CASTLE_LEVEL_LOADERS } = await import(
                './castle_levels.js'
            );
            const { MINES_LEVEL_LOADERS } = await import(
                './mines_levels.js'
            );
            SPECIAL_LEVEL_LOADERS = {
                ...BIGRM_LOADERS,
                ...QUEST_LEVEL_LOADERS,
                ...SOKOBAN_LEVEL_LOADERS,
                ...CASTLE_LEVEL_LOADERS,
                ...MINES_LEVEL_LOADERS,
            };
        }
        const loader = SPECIAL_LEVEL_LOADERS[protofile];
        if (!loader) {
            throw new UnsupportedLevelChangeError(
                `makemaz: no loader for "${protofile}"`,
            );
        }
        // C refs: nhlua.c nhl_init(); dat/nhlib.lua. Same nhlib shuffle as
        // the tutorial special level path.
        const align = ['law', 'neutral', 'chaos'];
        shuffle_core_values(align, rn2);
        state.specialLevelAlign = align;

        const specialLevelApi = createSpecialLevelApi(state);
        await loader(specialLevelApi, state);
        specialLevelApi.finish();
        return;
    }

    // C ref: mkmaze.c:1197-1223. Procedural maze generation when no
    // protofile is found. Not yet reached by any development session.
    throw new UnsupportedLevelChangeError('makemaz: procedural maze generation not ported');
}

// C ref: sp_lev.c lspo_map() halign/valign positioning. Translates
// alignment names to x/y offsets within the maze area.
function mapAlignX(halign, width, frame) {
    switch (halign) {
    case 'left': return 3;
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

function createSpecialLevelApi(state) {
    // C ref: sp_lev.c sp_level_coder_init(). Each special level gets a fresh
    // coder with allow_flips = 3; reset state fields that correspond to
    // per-coder fields so a previous level's noflip does not leak.
    delete state.specialLevelAllowFlips;

    // C ref: sp_lev.c reset_xystart_size(), called by sp_level_coder_init()
    // before any level creation code runs. des.map() overrides these with
    // the map's placement; mines-style level_init and other map-less levels
    // keep these defaults, so get_location() covers the whole playable area.
    // C ref: sp_lev.c SpLev_Map[COLNO][ROWNO]. Tracks which cells were
    // placed by lspo_map, lspo_door, lspo_stair, or lspo_drawbridge.
    // maze1xy avoids these cells when placing fill objects.
    const splevMap = Array.from({ length: COLNO }, () =>
        new Uint8Array(ROWNO),
    );
    const frame = {
        xstart: 1,
        ystart: 0,
        xsize: COLNO - 1,
        ysize: ROWNO,
        xMazeMax: (COLNO - 1) & ~1,
        yMazeMax: (ROWNO - 1) & ~1,
        splevMap,
    };
    const spObjectContext = new_sp_lev_object_context();
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
        spObjectContext,
    };

    // C ref: sp_lev.c coder->tmproomlist / coder->croom. Tracks which room
    // des.room() or des.region() callbacks are executing inside, so that
    // coordinate-bearing methods offset from the room instead of the frame.
    const croomStack = [];
    let currentCroom = null;

    // C ref: sp_lev.c levregion_add() / mkmaze.c fixup_special(). Branch and
    // stair levregions are stored here and resolved in finish().
    const storedLregions = [];

    return {
        random: SOURCE_THEMEROOM_RANDOM,
        get frame() { return frame; },

        // C ref: sp_lev.c lspo_level_init(). Supports solidfill, mazegrid,
        // and mines styles. Mines uses mkmap() cellular-automata generation.
        level_init(specification) {
            const style = specification?.style;
            if (style === 'solidfill') {
                const filling = splev_chr2typ(specification.fg ?? ' ');
                const lit = specification.lit == null
                    ? Boolean(rn2(2))
                    : Boolean(specification.lit);
                for (let x = 2; x <= frame.xMazeMax; ++x) {
                    for (let y = 0; y <= frame.yMazeMax; ++y) {
                        set_themeroom_map_terrain(x, y, filling, state);
                        state.level.at(x, y).lit = lit;
                    }
                }
            } else if (style === 'mazegrid') {
                // C ref: sp_lev.c splev_initlev() LVLINIT_MAZEGRID case.
                // lvlfill_maze_grid(2, 0, x_maze_max, y_maze_max, bg).
                // Non-corrmaze: STONE where y < 2 or both x and y are odd;
                // bg (the filling) everywhere else.
                const bgRaw = specification.bg != null
                    ? splev_chr2typ(specification.bg) : STONE;
                const filling = bgRaw >= 0 ? bgRaw : STONE;
                for (let x = 2; x <= frame.xMazeMax; ++x) {
                    for (let y = 0; y <= frame.yMazeMax; ++y) {
                        if (state.level.flags.corrmaze) {
                            set_themeroom_map_terrain(x, y, STONE, state);
                        } else {
                            const typ = (y < 2 || ((x % 2) && (y % 2)))
                                ? STONE : filling;
                            set_themeroom_map_terrain(x, y, typ, state);
                        }
                    }
                }
            } else if (style === 'mines') {
                // C ref: sp_lev.c splev_initlev() LVLINIT_MINES case.
                const fg = splev_chr2typ(specification.fg ?? '.');
                const bg_raw = specification.bg != null
                    ? splev_chr2typ(specification.bg) : -1;
                const bg = bg_raw >= 0 ? bg_raw : STONE;
                // C ref: get_table_boolean_opt defaults to BOOL_RANDOM.
                // Lua passes lit=0 or lit=1; null means BOOL_RANDOM (-1).
                let lit = specification.lit ?? -1;
                const filling = specification.filling != null
                    ? splev_chr2typ(specification.filling) : fg;
                // C ref: splev_initlev MINES: if lit==BOOL_RANDOM, rn2(2).
                if (lit === -1) lit = rn2(2);
                // C ref: if (linit->filling > -1) lvlfill_solid(filling, 0)
                if (filling >= 0) {
                    for (let x = 2; x <= frame.xMazeMax; ++x)
                        for (let y = 0; y <= frame.yMazeMax; ++y) {
                            set_themeroom_map_terrain(
                                x, y, filling, state,
                            );
                            state.level.at(x, y).lit = false;
                        }
                }
                mkmap({
                    fg,
                    bg,
                    smoothed: specification.smoothed ?? false,
                    joined: specification.joined ?? false,
                    lit,
                    walled: specification.walled ?? false,
                    icedpools: false,
                }, state);
            } else {
                throw new Error(
                    `unsupported special-level init style ${style}`,
                );
            }
        },

        level_flags(...names) {
            for (const name of names) {
                switch (name) {
                case 'mazelevel': state.level.flags.is_maze_lev = true; break;
                case 'noflip': state.specialLevelAllowFlips = 0; break;
                // C ref: sp_lev.c lspo_level_flags(). allow_flips starts at
                // 3 (both axes). noflipy clears bit 1, noflipx clears bit 2.
                case 'noflipy':
                    state.specialLevelAllowFlips
                        = (state.specialLevelAllowFlips ?? 3) & ~1;
                    break;
                case 'noflipx':
                    state.specialLevelAllowFlips
                        = (state.specialLevelAllowFlips ?? 3) & ~2;
                    break;
                case 'noteleport': state.level.flags.noteleport = true; break;
                case 'hardfloor': state.level.flags.hardfloor = true; break;
                case 'nomongen': state.level.flags.rndmongen = false; break;
                case 'nodeathdrops': state.level.flags.deathdrops = false; break;
                case 'noautosearch': state.level.flags.noautosearch = true; break;
                // C ref: sp_lev.c lspo_level_flags(). solidify marks all
                // STONE walls not part of the map as non-diggable and
                // non-passwall during post-processing.
                case 'solidify': state._specialLevelSolidify = true; break;
                // C ref: sp_lev.c lspo_level_flags(). premapped is a
                // coder-only flag (gc.coder->premapped); no level flag
                // is set. Accept it as a no-op so loaders can pass it.
                case 'premapped': state._specialLevelPremapped = true; break;
                // C ref: sp_lev.c lspo_level_flags(). "sokoban" sets
                // Sokoban = 1, which is svl.level.flags.sokoban_rules.
                case 'sokoban': state.level.flags.sokoban_rules = true; break;
                default: throw new Error(`unsupported special-level flag ${name}`);
                }
            }
        },

        map(rowsOrSpec) {
            if (Array.isArray(rowsOrSpec)) {
                return mapFromRows(rowsOrSpec, frame, state);
            }
            const spec = rowsOrSpec;
            const mapStr = spec.map;
            const rows = mapStr.split('\n').filter((r) => r.length > 0);
            const height = rows.length;
            const width = rows[0]?.length ?? 0;
            let ox, oy;
            if (spec.halign != null || spec.valign != null) {
                // C ref: sp_lev.c lspo_map() halign/valign placement.
                // Aligns the map fragment within the maze area.
                ox = mapAlignX(spec.halign ?? 'center', width, frame);
                oy = mapAlignY(spec.valign ?? 'center', height, frame);
                if (!(ox % 2)) ox++;
                if (!(oy % 2)) oy++;
                // C ref: sp_lev.c:6227-6238 overflow adjustment.
                if (oy < 0 || oy + height > ROWNO) {
                    oy += (oy > 0) ? -2 : 2;
                    if (height === ROWNO) oy = 0;
                    if (oy < 0 || oy + height > ROWNO) oy = 0;
                }
                frame.xstart = ox;
                frame.ystart = oy;
                frame.xsize = width;
                frame.ysize = height;
                state.xstart = ox;
                state.ystart = oy;
                state.xsize = width;
                state.ysize = height;
            } else {
                // Table form: { coord: [x,y], map: string, contents: fn }
                // C ref: sp_lev.c lspo_map() table form, used by bigrm-13
                // to stamp small sub-maps at specific offsets inside the
                // main map.
                ox = frame.xstart + spec.coord[0];
                oy = frame.ystart + spec.coord[1];
            }
            for (let y = 0; y < height; ++y) {
                for (let x = 0; x < width; ++x) {
                    const typ = splev_chr2typ(rows[y][x]);
                    if (typ >= MAX_TYPE) continue;
                    const ax = ox + x;
                    const ay = oy + y;
                    set_themeroom_map_terrain(ax, ay, typ, state);
                    if (frame.splevMap) frame.splevMap[ax][ay] = 1;
                }
            }
            if (typeof spec.contents === 'function') spec.contents();
            return { xstart: ox, ystart: oy, xsize: width, ysize: height };
        },

        region(selectionOrSpec, litStr) {
            // C ref: sp_lev.c lspo_region() supports two calling
            // conventions. The bigrm lua files use the two-argument form
            // region(selection, "lit"/"unlit"), while the tutorial uses the
            // single-argument table form { area, lit }.
            if (litStr !== undefined) {
                // Two-argument: region(selection, "lit"/"unlit").
                // C clones, grows if lit, then iterates to set lighting.
                // C ref: sp_lev.c lspo_region() argc==2.
                // C selections store absolute coords (frame applied at
                // creation). JS selections store map-relative coords.
                // Convert to absolute before growing so the expansion
                // reaches into the frame margin (row ystart-1, column
                // xstart-1) instead of clamping at relative zero.
                const lit = litStr === 'lit';
                const src = selectionOrSpec;
                const { lx, ly, hx, hy } = src.bounds();
                const absSel = new ThemeroomSelection();
                for (let x = lx; x <= hx; ++x) {
                    for (let y = ly; y <= hy; ++y) {
                        if (src.get(x, y))
                            absSel.set(frame.xstart + x, frame.ystart + y);
                    }
                }
                const sel = lit ? absSel.grow() : absSel.clone();
                // C ref: selvar.c selection_iterate() — x-major from x=0
                const gb = sel.bounds();
                for (let x = gb.lx; x <= gb.hx; ++x) {
                    for (let y = gb.ly; y <= gb.hy; ++y) {
                        if (!sel.get(x, y)) continue;
                        const loc = state.level.at(x, y);
                        // C ref: sp_lev.c sel_set_lit()
                        if (loc) loc.lit = IS_LAVA(loc.typ) || lit;
                    }
                }
                return;
            }
            const specification = selectionOrSpec;
            if (specification.area) {
                lightSpecialArea(frame, specification, state);
            } else if (specification.match != null) {
                lightSpecialMatch(
                    frame,
                    specification.match,
                    specification.lit,
                    state,
                );
            } else if (specification.region) {
                // C ref: sp_lev.c lspo_region() table form with region coords.
                const ROOM_TYPE_MAP = {
                    ordinary: OROOM, delphi: DELPHI, temple: TEMPLE,
                    zoo: ZOO, throne: COURT, barracks: BARRACKS,
                };
                const [rx1, ry1, rx2, ry2] = specification.region;
                const rtype = ROOM_TYPE_MAP[specification.type] ?? OROOM;
                const needfill = specification.filled ?? 0;
                const irregular = Boolean(specification.irregular);
                const joined = specification.joined ?? true;
                let rlit = specification.lit ?? -1;
                rlit = litstate_rnd(rlit);
                const dx1 = frame.xstart + rx1;
                const dy1 = frame.ystart + ry1;
                const dx2 = frame.xstart + rx2;
                const dy2 = frame.ystart + ry2;
                // C ref: sp_lev.c lspo_region():5652-5654.
                // A room is needed for special room types, irregular
                // regions, and themed room contexts.
                const roomNotNeeded = (rtype === OROOM && !irregular);
                if (roomNotNeeded || game.level.nroom >= MAXNROFROOMS) {
                    // Just set lighting.
                    for (let x = dx1; x <= dx2; ++x)
                        for (let y = dy1; y <= dy2; ++y) {
                            const loc = state.level.at(x, y);
                            if (loc) loc.lit = rlit;
                        }
                } else if (irregular) {
                    // C ref: sp_lev.c:5675-5683. Flood-fill from (dx1,dy1)
                    // to discover the room's true bounds.
                    state._mkmap_min_rx = dx1;
                    state._mkmap_max_rx = dx1;
                    state._mkmap_min_ry = dy1;
                    state._mkmap_max_ry = dy1;
                    state.smeq[state.level.nroom] = state.level.nroom;
                    flood_fill_rm(
                        dx1, dy1,
                        state.level.nroom + ROOMOFFSET,
                        rlit, true, state,
                    );
                    add_room(
                        state._mkmap_min_rx, state._mkmap_min_ry,
                        state._mkmap_max_rx, state._mkmap_max_ry,
                        false, rtype, true,
                    );
                    const troom = game.level.rooms[game.level.nroom - 1];
                    troom.rlit = rlit;
                    troom.irregular = true;
                    troom.needfill = needfill;
                    troom.needjoining = joined;
                    if (typeof specification.contents === 'function') {
                        croomStack.push(currentCroom);
                        currentCroom = troom;
                        specification.contents(troom);
                        currentCroom = croomStack.pop();
                    }
                    add_doors_to_room(troom);
                } else {
                    add_room(dx1, dy1, dx2, dy2, rlit, rtype, true);
                    const troom = game.level.rooms[game.level.nroom - 1];
                    topologize(troom);
                    troom.needfill = needfill;
                    troom.needjoining = joined;
                    if (typeof specification.contents === 'function') {
                        croomStack.push(currentCroom);
                        currentCroom = troom;
                        specification.contents(troom);
                        currentCroom = croomStack.pop();
                    }
                    add_doors_to_room(troom);
                }
            } else {
                throw new Error('special-level region requires area, match, or region');
            }
        },

        non_diggable(sel) {
            // C ref: sp_lev.c lspo_non_diggable(). With a selection argument,
            // marks only the selected wall tiles; without, marks the whole map.
            const mark = (x, y) => {
                const location = state.level.at(x, y);
                if (IS_STWALL(location.typ)
                    || location.typ === TREE
                    || location.typ === IRONBARS) {
                    location.wall_info |= W_NONDIGGABLE;
                }
            };
            if (sel) {
                const b = sel.bounds();
                for (let x = b.lx; x <= b.hx; ++x)
                    for (let y = b.ly; y <= b.hy; ++y)
                        if (sel.get(x, y))
                            mark(frame.xstart + x, frame.ystart + y);
            } else {
                for (let x = 0; x < COLNO; ++x)
                    for (let y = 0; y < ROWNO; ++y)
                        mark(x, y);
            }
        },

        non_passwall(sel) {
            // C ref: sp_lev.c lspo_non_passwall(). Same structure as
            // non_diggable but marks W_NONPASSWALL instead.
            const mark = (x, y) => {
                const location = state.level.at(x, y);
                if (IS_STWALL(location.typ)
                    || location.typ === TREE
                    || location.typ === IRONBARS) {
                    location.wall_info |= W_NONPASSWALL;
                }
            };
            if (sel) {
                const b = sel.bounds();
                for (let x = b.lx; x <= b.hx; ++x)
                    for (let y = b.ly; y <= b.hy; ++y)
                        if (sel.get(x, y))
                            mark(frame.xstart + x, frame.ystart + y);
            } else {
                for (let x = 0; x < COLNO; ++x)
                    for (let y = 0; y < ROWNO; ++y)
                        mark(x, y);
            }
        },

        exclusion(specification) {
            // C ref: sp_lev.c lspo_exclusion(). Stores a rectangular zone
            // where random monster generation (or teleportation) is
            // suppressed. Uses get_location_coord to resolve coordinates
            // with the frame offset.
            const LR_MONGEN = 4; // C: LR_MONGEN in sp_lev.c
            const typeMap = {
                teleport: LR_TELE,
                'monster-generation': LR_MONGEN,
            };
            const zonetype = typeMap[specification.type] ?? LR_TELE;
            const [x1, y1, x2, y2] = specification.region;
            const ez = {
                zonetype,
                lx: frame.xstart + x1,
                ly: frame.ystart + y1,
                hx: frame.xstart + x2,
                hy: frame.ystart + y2,
                next: state.exclusion_zones ?? null,
            };
            state.exclusion_zones = ez;
        },

        // C ref: sp_lev.c lspo_teleport_region(). bigrm-10 uses the
        // extended form with exclude and dir. When region_islev is true,
        // coordinates are absolute level coordinates (not frame-relative).
        teleport_region(specification) {
            const islev = Boolean(specification.region_islev);
            const ox = islev ? 0 : frame.xstart;
            const oy = islev ? 0 : frame.ystart;
            const [x1, y1, x2, y2] = specification.region;
            const destination = {
                lx: ox + x1,
                ly: oy + y1,
                hx: ox + x2,
                hy: oy + y2,
                nlx: -1,
                nly: -1,
                nhx: -1,
                nhy: -1,
            };
            if (specification.exclude) {
                const exIslev = Boolean(
                    specification.exclude_islev ?? islev,
                );
                const eox = exIslev ? 0 : frame.xstart;
                const eoy = exIslev ? 0 : frame.ystart;
                const [ex1, ey1, ex2, ey2] = specification.exclude;
                destination.nlx = eox + ex1;
                destination.nly = eoy + ey1;
                destination.nhx = eox + ex2;
                destination.nhy = eoy + ey2;
            }
            if (specification.dir === 'up' || specification.dir == null) {
                state.updest = { ...destination };
            }
            if (specification.dir === 'down' || specification.dir == null) {
                state.dndest = { ...destination };
            }
        },

        parse_config(name, enabled) {
            state.flags ??= {};
            state.flags[name] = Boolean(enabled);
        },

        engraving(specification) {
            const ENGR_TYPE_MAP = {
                dust: DUST, engrave: ENGRAVE, burn: BURN,
                mark: MARK, blood: ENGR_BLOOD,
            };
            const coordinate = specialCoordinate(frame, specification.coord);
            const rawType = specification.type ?? 'dust';
            const etyp = typeof rawType === 'string'
                ? (ENGR_TYPE_MAP[rawType] ?? DUST)
                : rawType;
            const engraving = make_engr_at(
                coordinate.x,
                coordinate.y,
                specification.text,
                null,
                0,
                etyp,
                env,
            );
            engraving.nowipeout = specification.degrade === false;
            return engraving;
        },

        // C ref: sp_lev.c lspo_door(). Supports three forms:
        // - Table with coord: door({ state, coord })
        // - Table with wall (inside a room): door({ state, wall })
        // - 3-arg: door("state", x, y)
        door(specOrState, xOpt, yOpt) {
            // 3-arg form: door("state", x, y)
            if (typeof specOrState === 'string' && xOpt !== undefined) {
                return this.door({ state: specOrState, coord: [xOpt, yOpt] });
            }
            const specification = specOrState;
            // Wall form: door({ state, wall }) — C ref: sp_lev.c:4714-4720
            if (specification.wall != null && specification.coord == null) {
                if (!currentCroom) return null;
                const msk = specification.state === 'random'
                    ? -1
                    : SPECIAL_DOOR_STATES[specification.state];
                const dd = {
                    secret: (msk === D_SECRET) ? 1 : 0,
                    mask: msk ?? D_NODOOR,
                    pos: specification.pos ?? -1,
                    wall: ROOM_DOOR_WALL_MASKS[specification.wall]
                        ?? W_ANY,
                };
                create_door(dd, currentCroom, rn2);
                return null;
            }
            // Coord form: door({ state, coord })
            let coordinate;
            if (currentCroom && specification.coord) {
                // C ref: sp_lev.c:4723 get_location_coord with croom
                coordinate = {
                    x: currentCroom.lx + specification.coord[0],
                    y: currentCroom.ly + specification.coord[1],
                };
            } else {
                coordinate = specialCoordinate(frame, specification.coord);
            }
            // C ref: sp_lev.c sel_set_door()
            const msk = specification.state === 'random'
                ? RANDOM_SPECIAL_DOOR_STATES[rn2(
                    RANDOM_SPECIAL_DOOR_STATES.length,
                )]
                : SPECIAL_DOOR_STATES[specification.state];
            if (msk == null)
                throw new Error(`unsupported special-level door state ${specification.state}`);
            const location = state.level.at(coordinate.x, coordinate.y);
            if (!IS_DOOR(location.typ) && location.typ !== SDOOR)
                set_levltyp(coordinate.x, coordinate.y,
                    (msk & D_SECRET) ? SDOOR : DOOR, { state });
            setSpecialDoorOrientation(coordinate.x, coordinate.y, state);
            location.doormask = msk & 0x1f;
            // C ref: sp_lev.c:4661. Mark door cells in SpLev_Map.
            if (frame.splevMap) {
                frame.splevMap[coordinate.x][coordinate.y] = 1;
            }
            return location;
        },

        trap(specification) {
            // C ref: sp_lev.c create_trap(). Location is resolved by
            // get_location_coord BEFORE mktrap(), and mktrap receives
            // concrete coordinates.
            const spec = specification ?? {};
            let coordinate;
            let trapType;
            if (spec.coord) {
                if (currentCroom) {
                    coordinate = {
                        x: currentCroom.lx + spec.coord[0],
                        y: currentCroom.ly + spec.coord[1],
                    };
                } else {
                    coordinate = specialCoordinate(frame, spec.coord);
                }
            } else if (typeof specification === 'string') {
                trapType = specification;
                coordinate = { x: -1, y: -1 };
            } else {
                coordinate = { x: -1, y: -1 };
            }
            // Bare call or random coordinate: sp_lev.c:1825-1832
            // picks location with get_location_coord, retrying if
            // the spot is a stair or ladder.
            if (coordinate.x === -1 && coordinate.y === -1) {
                let trycnt = 0;
                do {
                    get_location_coord(
                        coordinate, DRY, currentCroom,
                        SP_COORD_IS_RANDOM, { frame, state },
                    );
                } while ((state.level.at(coordinate.x, coordinate.y)?.typ
                            === STAIRS
                        || state.level.at(coordinate.x, coordinate.y)?.typ
                            === LADDER)
                    && ++trycnt <= 100);
                if (trycnt > 100) return null;
            }
            let flags = MKTRAP_MAZEFLAG;
            if (spec.spider_on_web === false)
                flags |= MKTRAP_NOSPIDERONWEB;
            if (spec.seen) flags |= MKTRAP_SEEN;
            if (spec.victim === false) flags |= MKTRAP_NOVICTIM;
            // C ref: sp_lev.c create_trap() passes the numeric trap type
            // from get_traptype_byname() to mktrap(). Resolve string names
            // the same way; leave numbers and undefined (random) as-is.
            let rawType = trapType ?? spec.type;
            if (typeof rawType === 'string')
                rawType = get_traptype_byname(rawType);
            return make_level_trap(
                rawType,
                flags,
                null,
                coordinate,
                env,
            );
        },

        // C ref: sp_lev.c lspo_drawbridge() -> dbridge.c create_drawbridge().
        // Creates a drawbridge at the given coordinates with the specified
        // direction and open/closed state.
        drawbridge(specification) {
            const dirMap = {
                north: DB_NORTH,
                south: DB_SOUTH,
                east: DB_EAST,
                west: DB_WEST,
            };
            const coordinate = specialCoordinate(frame, [
                specification.x,
                specification.y,
            ]);
            const x = coordinate.x;
            const y = coordinate.y;
            let dir = dirMap[specification.dir];
            if (dir == null) dir = DB_WEST;
            let dbOpen;
            if (specification.state === 'open') dbOpen = true;
            else if (specification.state === 'closed') dbOpen = false;
            else dbOpen = !rn2(2); // random
            // C ref: dbridge.c create_drawbridge(). Compute the wall cell
            // adjacent to the drawbridge position.
            let x2 = x, y2 = y;
            let horiz;
            switch (dir) {
            case DB_NORTH: horiz = true; y2--; break;
            case DB_SOUTH: horiz = true; y2++; break;
            case DB_EAST: horiz = false; x2++; break;
            default: /* DB_WEST */ horiz = false; x2--; break;
            }
            const loc2 = state.level.at(x2, y2);
            if (!loc2 || !IS_WALL(loc2.typ)) return;
            const loc = state.level.at(x, y);
            const lava = loc.typ === LAVAPOOL;
            if (dbOpen) {
                loc.typ = DRAWBRIDGE_DOWN;
                loc2.typ = DOOR;
                loc2.doormask = D_NODOOR;
            } else {
                loc.typ = DRAWBRIDGE_UP;
                loc2.typ = DBWALL;
                loc2.wall_info = W_NONDIGGABLE;
            }
            loc.horizontal = !horiz;
            loc2.horizontal = horiz;
            loc.drawbridgemask = dir;
            if (lava) loc.drawbridgemask |= DB_LAVA;
            // C ref: sp_lev.c:5760. Mark drawbridge cell in SpLev_Map.
            if (frame.splevMap) {
                frame.splevMap[coordinate.x][coordinate.y] = 1;
            }
        },

        object(specification) {
            // sp_lev's object and monster descriptors retain map-relative
            // coordinates until their shared lspo_* adapters consume frame.
            // Terrain, doors, traps, engravings, and stairs convert eagerly
            // above, so applying specialCoordinate() here would offset twice.
            const spec = specification ?? {};
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
            const normalized = {
                ...spec,
                coordinate: spec.coord
                    ? { x: spec.coord[0], y: spec.coord[1] }
                    : undefined,
                corpsenm,
            };
            return lspo_object(normalized, currentCroom, env);
        },

        monster(specification) {
            const spec = specification ?? {};
            const normalized = {
                ...spec,
                coordinate: spec.coord
                    ? { x: spec.coord[0], y: spec.coord[1] }
                    : undefined,
            };
            try {
                return create_monster(normalized, currentCroom, env);
            } catch (e) {
                if (e instanceof UnsupportedMonsterCreationError) return null;
                throw e;
            }
        },

        stair(specification) {
            // C ref: sp_lev.c l_create_stairway(). Accepts a table with
            // .coord and .dir, or a bare "up"/"down" string with no
            // coordinates (in which case get_location picks a random DRY
            // spot inside the current room or map frame).
            let up, x, y;
            if (typeof specification === 'string') {
                up = specification === 'up';
                const coord = { x: -1, y: -1 };
                get_location_coord(
                    coord, DRY, currentCroom, SP_COORD_IS_RANDOM,
                    { frame, state },
                );
                x = coord.x;
                y = coord.y;
            } else {
                up = specification.dir === 'up';
                if (currentCroom && specification.coord) {
                    x = currentCroom.lx + specification.coord[0];
                    y = currentCroom.ly + specification.coord[1];
                } else {
                    const coord = specialCoordinate(
                        frame, specification.coord,
                    );
                    x = coord.x;
                    y = coord.y;
                }
            }
            mkstairs(x, y, up, null);
        },

        // C ref: sp_lev.c l_create_stairway() with using_ladder=TRUE.
        // Sets the square to LADDER and registers it as a stairway.
        ladder(specification) {
            let up, x, y;
            if (typeof specification === 'string') {
                up = specification === 'up';
                const coord = { x: -1, y: -1 };
                get_location_coord(
                    coord, DRY, null, SP_COORD_IS_RANDOM,
                    { frame, state },
                );
                x = coord.x;
                y = coord.y;
            } else {
                up = specification.dir === 'up';
                const coord = specialCoordinate(frame, specification.coord);
                x = coord.x;
                y = coord.y;
            }
            const loc = state.level.at(x, y);
            if (loc) {
                loc.typ = LADDER;
                loc.ladder = up ? LA_UP : LA_DOWN;
            }
            const dest = {
                dnum: state.u?.uz?.dnum ?? 0,
                dlevel: (state.u?.uz?.dlevel ?? 1) + (up ? -1 : 1),
            };
            stairway_add(x, y, !!up, true, dest);
        },

        shuffle(values) {
            shuffle_core_values(values, rn2);
            return values;
        },

        // C ref: sp_lev.c lspo_room(). Creates a room (or subroom when
        // called inside another room's contents callback), invokes the
        // contents callback with croom set, then registers doors.
        room(spec) {
            const SPLEV_ALIGN_MAP = {
                left: 0, 'half-left': 1, center: 3,
                'half-right': 4, right: 5,
                none: -1, random: -1,
            };
            const SPLEV_VALIGN_MAP = {
                top: 0, center: 3, bottom: 2, none: -1, random: -1,
            };
            const ROOM_TYPE_MAP = {
                ordinary: OROOM, delphi: DELPHI, temple: TEMPLE,
            };
            const roomSpec = {
                x: spec.x ?? -1,
                y: spec.y ?? -1,
                w: spec.w ?? -1,
                h: spec.h ?? -1,
                xalign: SPLEV_ALIGN_MAP[spec.xalign] ?? -1,
                yalign: SPLEV_VALIGN_MAP[spec.yalign] ?? -1,
                rtype: ROOM_TYPE_MAP[spec.type] ?? OROOM,
                chance: spec.chance ?? 100,
                rlit: spec.lit ?? -1,
                needfill: spec.filled ?? FILL_NORMAL,
                joined: spec.joined ?? true,
            };
            const parent = currentCroom;
            const room = build_room(roomSpec, parent, rn2, rnd);
            if (!room) return null;
            if (parent) parent.irregular = true;
            croomStack.push(currentCroom);
            currentCroom = room;
            if (typeof spec.contents === 'function') {
                spec.contents(room);
            }
            currentCroom = croomStack.pop();
            add_doors_to_room(room);
            return room;
        },

        // C ref: sp_lev.c lspo_random_corridors(). Connects all rooms on
        // the level with corridors, using the same algorithm as regular
        // level generation.
        random_corridors() {
            makecorridors();
        },

        // C ref: sp_lev.c lspo_feature() for altars. Sets a tile to ALTAR
        // and stores the alignment mask.
        altar(spec) {
            const ALIGN_STR_MAP = {
                noalign: A_NONE, law: A_LAWFUL, neutral: A_NEUTRAL,
                chaos: A_CHAOTIC, none: A_NONE, random: A_NONE,
                coaligned: A_NONE, noncoaligned: A_NONE,
            };
            let x, y;
            if (currentCroom) {
                x = currentCroom.lx + spec.x;
                y = currentCroom.ly + spec.y;
            } else {
                x = frame.xstart + spec.x;
                y = frame.ystart + spec.y;
            }
            set_levltyp(x, y, ALTAR, { state });
            const alignment = ALIGN_STR_MAP[spec.align] ?? A_NONE;
            const loc = state.level.at(x, y);
            if (loc) loc.flags = Align2amask(alignment);
        },

        // C ref: sp_lev.c lspo_replace_terrain(). Replaces all cells of
        // fromterrain with toterrain in the given region or selection.
        // chance defaults to 100 (always replace).
        replace_terrain(spec) {
            const toTyp = splev_chr2typ(spec.toterrain);
            if (toTyp >= MAX_TYPE) return;
            const fromTyp = spec.fromterrain != null
                ? splev_chr2typ(spec.fromterrain) : -1;
            const chance = spec.chance ?? 100;

            let sel = spec.selection ?? null;

            if (!sel) {
                const region = spec.region;
                if (region) {
                    const [rx1, ry1, rx2, ry2] = region;
                    sel = selection_area(
                        frame.xstart + rx1,
                        frame.ystart + ry1,
                        frame.xstart + rx2,
                        frame.ystart + ry2,
                    );
                } else {
                    // No region or selection: replace across the whole map.
                    sel = selection_area(0, 0, COLNO - 1, ROWNO - 1);
                }
            }

            const bounds = sel.bounds();
            for (let x = Math.max(1, bounds.lx); x <= bounds.hx; ++x) {
                for (let y = bounds.ly; y <= bounds.hy; ++y) {
                    if (!sel.get(x, y)) continue;
                    const loc = state.level.at(x, y);
                    if (fromTyp >= 0) {
                        if (fromTyp === MATCH_WALL) {
                            if (!IS_STWALL(loc.typ)) continue;
                        } else if (loc.typ !== fromTyp) continue;
                    }
                    if (rn2(100) < chance)
                        set_levltyp(x, y, toTyp, { state });
                }
            }
        },

        // C ref: sp_lev.c lspo_terrain(). Sets terrain on a selection or
        // at a single coordinate. Accepts (selection, char), (x, y, char),
        // ([x, y], char), or a table { selection, typ, lit }.
        terrain(selOrX, charOrY, charOpt) {
            if (Array.isArray(selOrX)) {
                // terrain([x, y], char) — array coord form
                const ox = currentCroom
                    ? currentCroom.lx : frame.xstart;
                const oy = currentCroom
                    ? currentCroom.ly : frame.ystart;
                const tx = ox + selOrX[0];
                const ty = oy + selOrX[1];
                const typ = splev_chr2typ(charOrY);
                if (typ < MAX_TYPE) set_levltyp(tx, ty, typ, { state });
            } else if (typeof selOrX === 'number') {
                // terrain(x, y, char)
                const ox = currentCroom
                    ? currentCroom.lx : frame.xstart;
                const oy = currentCroom
                    ? currentCroom.ly : frame.ystart;
                const tx = ox + selOrX;
                const ty = oy + charOrY;
                const typ = splev_chr2typ(charOpt);
                if (typ < MAX_TYPE) set_levltyp(tx, ty, typ, { state });
            } else {
                // terrain(selection, char)
                const typ = splev_chr2typ(charOrY);
                if (typ >= MAX_TYPE) return;
                // C ref: sp_lev.c lspo_terrain() uses selvar.c
                // selection_iterate(), x-major from x=0, with absolute
                // coords (frame offset already in the selection).
                const tb = selOrX.bounds();
                for (let x = tb.lx; x <= tb.hx; ++x) {
                    for (let y = tb.ly; y <= tb.hy; ++y) {
                        if (!selOrX.get(x, y)) continue;
                        set_levltyp(
                            frame.xstart + x,
                            frame.ystart + y,
                            typ,
                            { state },
                        );
                    }
                }
            }
        },

        // C ref: sp_lev.c lspo_wallify(). Converts STONE tiles adjacent to
        // ROOM or CROSSWALL tiles into HWALL/VWALL. The default region is
        // the map frame expanded by one tile in each direction.
        wallify(spec) {
            const dx1 = spec?.x1 ?? (frame.xstart - 1);
            const dy1 = spec?.y1 ?? (frame.ystart - 1);
            const dx2 = spec?.x2 ?? (frame.xstart + frame.xsize + 1);
            const dy2 = spec?.y2 ?? (frame.ystart + frame.ysize + 1);
            wallify_map(dx1, dy1, dx2, dy2, state);
        },

        // C ref: sp_lev.c lspo_feature(). Creates a fountain, sink, pool,
        // or throne at the given coordinates. Accepts ("fountain", x, y) or
        // ("fountain", {x, y}).
        feature(name, xOrSpec, yOpt) {
            const ox = currentCroom ? currentCroom.lx : frame.xstart;
            const oy = currentCroom ? currentCroom.ly : frame.ystart;
            let tx, ty;
            if (typeof xOrSpec === 'number') {
                tx = ox + xOrSpec;
                ty = oy + yOpt;
            } else {
                tx = ox + (xOrSpec?.x ?? xOrSpec?.[0] ?? -1);
                ty = oy + (xOrSpec?.y ?? xOrSpec?.[1] ?? -1);
            }
            const featureTypes = {
                fountain: FOUNTAIN,
                sink: SINK,
                pool: POOL,
                throne: THRONE,
            };
            const typ = featureTypes[name];
            if (typ == null) return;
            set_levltyp(tx, ty, typ, { state });
        },

        // C ref: sp_lev.c lspo_mazewalk(). Carves a maze starting from the
        // given coordinates. bigrm-10 uses this with stocked=0.
        mazewalk(spec) {
            let x = frame.xstart + spec.x;
            let y = frame.ystart + spec.y;
            const dirStr = spec.dir ?? 'random';
            let dir;
            if (dirStr === 'random') {
                // C ref: mkmaze.c random_wdir(). Pick a random cardinal.
                const dirs = [W_NORTH, W_SOUTH, W_EAST, W_WEST];
                dir = dirs[rn2(4)];
            } else {
                const dirMap = {
                    north: W_NORTH, south: W_SOUTH,
                    east: W_EAST, west: W_WEST,
                };
                dir = dirMap[dirStr] ?? W_NORTH;
            }
            let ftyp = spec.typ != null ? splev_chr2typ(spec.typ) : ROOM;
            if (ftyp < 1) {
                ftyp = state.level.flags.corrmaze ? CORR : ROOM;
            }
            // C ref: sp_lev.c lspo_mazewalk() step one cell in the
            // specified direction and set its type.
            switch (dir) {
            case W_NORTH: --y; break;
            case W_SOUTH: ++y; break;
            case W_EAST: ++x; break;
            case W_WEST: --x; break;
            }
            if (!IS_DOOR(state.level.at(x, y).typ)) {
                state.level.at(x, y).typ = ftyp;
                state.level.at(x, y).flags = 0;
            }
            // C ref: sp_lev.c lspo_mazewalk() parity adjustment.
            // Direction-dependent: adjusts toward the walk direction.
            if (!(x % 2)) {
                if (dir === W_EAST) ++x; else --x;
                state.level.at(x, y).typ = ftyp;
                state.level.at(x, y).flags = 0;
            }
            if (!(y % 2)) {
                if (dir === W_SOUTH) ++y; else --y;
            }
            walkfrom(x, y, ftyp, state);
            if (spec.stocked !== 0) {
                fill_empty_maze(frame, state, env);
            }
        },

        // C ref: sp_lev.c lspo_levregion(). Creates a level region for
        // stair, portal, branch, or teleport placement that place_lregion
        // resolves when fixup_special runs.
        levregion(spec) {
            const islev = Boolean(spec.region_islev);
            const ox = islev ? 0 : frame.xstart;
            const oy = islev ? 0 : frame.ystart;
            const [rx1, ry1, rx2, ry2] = spec.region;
            const region = {
                lx: ox + rx1,
                ly: oy + ry1,
                hx: ox + rx2,
                hy: oy + ry2,
                nlx: -1, nly: -1, nhx: -1, nhy: -1,
            };
            if (spec.exclude) {
                const exIslev = Boolean(spec.exclude_islev ?? islev);
                const eox = exIslev ? 0 : frame.xstart;
                const eoy = exIslev ? 0 : frame.ystart;
                const [ex1, ey1, ex2, ey2] = spec.exclude;
                region.nlx = eox + ex1;
                region.nly = eoy + ey1;
                region.nhx = eox + ex2;
                region.nhy = eoy + ey2;
            }
            // C ref: the type string maps to LR_* constants.
            const LREGION_TYPE_MAP = {
                'stair-up': LR_UPSTAIR,
                'stair-down': LR_DOWNSTAIR,
                branch: LR_BRANCH,
            };
            const rtype = LREGION_TYPE_MAP[spec.type];
            if (spec.type === 'stair-up') {
                state.upstair = region;
            } else if (spec.type === 'stair-down') {
                state.dnstair = region;
            } else if (rtype != null) {
                // C ref: sp_lev.c levregion_add(). Store for fixup_special.
                storedLregions.push({ region, rtype });
            }
        },

        finish() {
            link_doors_rooms();
            // C ref: sp_lev.c load_special() post-processing.
            if (!state.level.flags.corrmaze)
                wallification(1, 0, COLNO - 1, ROWNO - 1);
            // C ref: sp_lev.c flip_level_rnd(). Each allowed flip axis
            // consumes rn2(2). bigrm-12's "noflipy" clears bit 1, leaving
            // only the horizontal axis flip.
            flip_level_rnd(state.specialLevelAllowFlips ?? 3);
            count_level_features(state);

            // C ref: sp_lev.c solidify_map(). Marks non-map STONE walls as
            // non-diggable and non-passwall.
            if (state._specialLevelSolidify) {
                solidify_map(state);
                delete state._specialLevelSolidify;
            }

            // C ref: mkmaze.c fixup_special(). Process stored levregions
            // after wallification and flipping.
            let addedBranch = false;
            for (const lr of storedLregions) {
                const r = lr.region;
                if (lr.rtype === LR_BRANCH) addedBranch = true;
                place_lregion(
                    r.lx, r.ly, r.hx, r.hy,
                    r.nlx, r.nly, r.nhx, r.nhy,
                    lr.rtype, null, state,
                );
            }
            if (!addedBranch && Is_branchlev(state.u.uz, state)) {
                place_lregion(
                    0, 0, 0, 0, 0, 0, 0, 0,
                    LR_BRANCH, null, state,
                );
            }

            // C ref: sp_lev.c:6052-6053. Reveal the entire map for
            // premapped levels (Sokoban).
            if (state._specialLevelPremapped) {
                premap_detect(state);
                delete state._specialLevelPremapped;
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
    };
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

// C ref: sp_lev.c flip_level() (533-922). Transposes the level horizontally
// (flp & 2, left↔right) or vertically (flp & 1, top↔bottom) or both. Called
// during level creation (extras=false), so hero position, migrating monsters,
// timed effects, ball & chain, and visual state are not flipped.
function flip_level(flp) {
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
            }
            // C ref: conjoined pits use flip_encoded_dir_bits(); not yet
            // ported because no development session reaches conjoined pits
            // during level creation.
        }
        if (flp & 2) {
            trap.tx = FlipX(trap.tx);
            if (trap.ttyp === ROLLING_BOULDER_TRAP) {
                trap.launch.x = FlipX(trap.launch.x);
                trap.launch2.x = FlipX(trap.launch2.x);
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

    // C ref: sp_lev.c:697-733. Level regions (lregions). The JS port stores
    // the two level-creation regions on game.upstair and game.dnstair rather
    // than in a separate array. Flip their inarea and delarea bounds.
    for (const lr of [game.upstair, game.dnstair]) {
        if (!lr) continue;
        if (flp & 1) {
            lr.ly = FlipY(lr.ly);
            lr.hy = FlipY(lr.hy);
            if (lr.ly > lr.hy) { const t = lr.ly; lr.ly = lr.hy; lr.hy = t; }
            if (lr.nly >= 0) {
                lr.nly = FlipY(lr.nly);
                lr.nhy = FlipY(lr.nhy);
                if (lr.nly > lr.nhy) { const t = lr.nly; lr.nly = lr.nhy; lr.nhy = t; }
            }
        }
        if (flp & 2) {
            lr.lx = FlipX(lr.lx);
            lr.hx = FlipX(lr.hx);
            if (lr.lx > lr.hx) { const t = lr.lx; lr.lx = lr.hx; lr.hx = t; }
            if (lr.nlx >= 0) {
                lr.nlx = FlipX(lr.nlx);
                lr.nhx = FlipX(lr.nhx);
                if (lr.nlx > lr.nhx) { const t = lr.nlx; lr.nlx = lr.nhx; lr.nhx = t; }
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
    // monster grid. Drawbridge orientation flipping (flip_dbridge_vertical/
    // horizontal) is omitted; no development session flips a drawbridge level.
    if (flp & 1) {
        for (let x = minx; x <= maxx; x++) {
            const half = miny + Math.trunc((maxy - miny + 1) / 2);
            for (let y = miny; y < half; y++) {
                const ny = FlipY(y);
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
}

// C ref: sp_lev.c flip_level_rnd() (967-982). Each bit of flp enables one
// axis; each enabled axis consumes rn2(2). When the combined result is
// nonzero, flip_level() mirrors the map.
function flip_level_rnd(flp) {
    let c = 0;
    if ((flp & 1) && rn2(2)) c |= 1;
    if ((flp & 2) && rn2(2)) c |= 2;
    if (c) flip_level(c);
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
function walkfrom(x, y, typ, state) {
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
            if (maze_okay(x, y, a, state)) dirs[q++] = a;
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
        walkfrom(x, y, typ, state);
    }
}

// C ref: mkmaze.c okay(). Checks whether maze carving can extend two
// cells from (x,y) in direction a. Uses x_maze_max/y_maze_max which
// default to (COLNO-1)&~1 and (ROWNO-1)&~1 for special levels.
function maze_okay(x, y, a, state) {
    // C ref: mkmaze.c mz_move(). Direction mapping must match walkfrom():
    // 0=north(y--), 1=east(x++), 2=south(y++), 3=west(x--).
    const dx = [0, 1, 0, -1];
    const dy = [-1, 0, 1, 0];
    const nx = x + 2 * dx[a];
    const ny = y + 2 * dy[a];
    if (nx < 3 || ny < 3) return false;
    if (nx > ((COLNO - 1) & ~1)) return false;
    if (ny > ((ROWNO - 1) & ~1)) return false;
    if (state.level.at(nx, ny).typ !== STONE) return false;
    return true;
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

function room_type_from_schema(type, definition) {
    if (type === 'ordinary') return OROOM;
    if (type === 'themed') return THEMEROOM;
    if (type === 'armor shop') return ARMORSHOP;
    if (type === 'weapon shop') return WEAPONSHOP;
    throw new UnsupportedThemeroomActionError(
        definition,
        `has unsupported room type ${JSON.stringify(type)}`,
    );
}

// C ref: sp_lev.c lspo_room(). Keep the callback boundary in one place so
// nested handlers share room failure propagation, parent irregularity, and
// the post-callback door-table scan. A returned room means that this descriptor
// was created; callers must inspect context.roomFailed for aggregate failure
// because a nested descriptor can fail while this room still finalizes.
export function run_room_descriptor(spec, parent, context, contents = null) {
    if (context.roomFailed) return null;
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
        context.roomFailed = true;
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
    return !context.roomFailed;
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
    return Boolean(room && !context.roomFailed);
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
    return Boolean(room && !context.roomFailed);
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
    return Boolean(room && !context.roomFailed);
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
    return Boolean(room && !context.roomFailed);
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
    return Boolean(room && !context.roomFailed);
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
                        create_monster(
                            {
                                class: classes[0],
                                coordinate: { x: 0, y: 0 },
                                waiting: true,
                            },
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
    return Boolean(room && !context.roomFailed);
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
    return Boolean(room && !context.roomFailed);
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
    return Boolean(outer && !context.roomFailed);
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

function add_teleport_exclusion(origin, state = game) {
    state.exclusion_zones = {
        zonetype: LR_TELE,
        lx: origin.x + 2,
        ly: origin.y + 2,
        hx: origin.x + 3,
        hy: origin.y + 3,
        next: state.exclusion_zones ?? null,
    };
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
    create_monster(
        {
            id: nastyUndead[0],
            coordinate: { x: 2, y: 2 },
            // The source string is "vampire lord", whose male pmname makes
            // find_montype() skip its otherwise-random parser gender draw.
            ...(nastyUndead[0] === PM_VAMPIRE_LEADER
                ? { parsedGender: MALE } : {}),
        },
        null,
        creationEnvironment,
    );
    add_teleport_exclusion(origin);
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
        roomFailed: false,
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
                setSpecialDoorOrientation(x, y, game);
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

function mkstairs(x, y, up, croom) {
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
        const trap = maketrap(x, y, MAGIC_PORTAL);
        if (trap) {
            trap.dst = { dnum: dest.dnum, dlevel: dest.dlevel };
        }
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

function isSolidTile(x, y) {
    if (!isok(x, y)) return true;
    return IS_STWALL(game.level?.at(x, y)?.typ ?? STONE);
}
function isWallOrStone(x, y) {
    if (!isok(x, y)) return 1;
    const typ = game.level?.at(x, y)?.typ ?? STONE;
    return (typ === STONE || isWallTile(x, y)) ? 1 : 0;
}
function isWallTile(x, y) {
    if (!isok(x, y)) return 0;
    const typ = game.level?.at(x, y)?.typ ?? STONE;
    return (IS_WALL(typ) || IS_DOOR(typ) || typ === LAVAWALL
        || typ === WATER || typ === SDOOR || typ === IRONBARS) ? 1 : 0;
}
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
function wall_cleanup(x1, y1, x2, y2) {
    const map = game.level;
    if (!map) return;
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) {
            const loc = map.at(x, y);
            const typ = loc?.typ ?? STONE;
            if (!(IS_WALL(typ) && typ !== DBWALL)) continue;
            if (isSolidTile(x-1,y-1) && isSolidTile(x-1,y) && isSolidTile(x-1,y+1)
                && isSolidTile(x,y-1) && isSolidTile(x,y+1)
                && isSolidTile(x+1,y-1) && isSolidTile(x+1,y) && isSolidTile(x+1,y+1))
                loc.typ = STONE;
        }
}
function fix_wall_spines(x1, y1, x2, y2) {
    const spineArray = [VWALL, HWALL, HWALL, HWALL,
        VWALL, TRCORNER, TLCORNER, TDWALL,
        VWALL, BRCORNER, BLCORNER, TUWALL,
        VWALL, TLWALL, TRWALL, CROSSWALL];
    const map = game.level;
    if (!map) return;
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) {
            const loc = map.at(x, y);
            const typ = loc?.typ ?? STONE;
            if (!(IS_WALL(typ) && typ !== DBWALL)) continue;
            const locale = [
                [isWallOrStone(x-1,y-1), isWallOrStone(x-1,y), isWallOrStone(x-1,y+1)],
                [isWallOrStone(x,y-1), 0, isWallOrStone(x,y+1)],
                [isWallOrStone(x+1,y-1), isWallOrStone(x+1,y), isWallOrStone(x+1,y+1)],
            ];
            const bits = (extend_spine(locale, isWallTile(x,y-1), 0, -1) << 3)
                | (extend_spine(locale, isWallTile(x,y+1), 0, 1) << 2)
                | (extend_spine(locale, isWallTile(x+1,y), 1, 0) << 1)
                | extend_spine(locale, isWallTile(x-1,y), -1, 0);
            if (bits) loc.typ = spineArray[bits];
        }
}
function wallification(x1, y1, x2, y2) {
    wall_cleanup(x1, y1, x2, y2);
    fix_wall_spines(x1, y1, x2, y2);
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
