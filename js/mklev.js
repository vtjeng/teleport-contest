// mklev.js — Level generation.
// C ref: mklev.c — makelevel, makerooms, makecorridors, generate_stairs.
// Also includes parts of sp_lev.c (create_room) and mkmap.c (litstate_rnd).
// Stripped-down version for contest: generates regular dungeon levels with
// room placement, corridors, doors, stairs, niches, and fill.
// Uses the real game PRNG (not a separate layout PRNG) for bit-exact parity.

import { game } from './gstate.js';
import { GameMap } from './game.js';
import {
    Can_fall_thru,
    depth as dungeon_depth,
    level_difficulty,
    on_level,
} from './dungeon.js';
import { mkcorpstat } from './corpstat.js';
import { del_engr_at, make_engr_at, wipe_engr_at } from './engrave.js';
import { add_to_container } from './invent.js';
import { makemon } from './makemon_create.js';
import { mkclass } from './makemon.js';
import { mineralize } from './mineralize.js';
import { d, rn2, rnd, rn1, rne, rnz } from './rng.js';
import { init_rect, rnd_rect, get_rect, split_rects } from './rect.js';
import {
    mkaltar,
    mkfount,
    mkgrave,
    mksink,
} from './room_features.js';
import { in_rooms } from './rooms.js';
import { depth as depth_of_level } from './hacklib.js';
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
    WEAPON_CLASS,
} from './objects.js';
import { maketrap } from './trap.js';
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
import { set_levltyp } from './terrain.js';
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
    PM_GIANT_SPIDER,
    S_HUMAN,
    S_LICH,
    S_MUMMY,
    S_VAMPIRE,
    S_ZOMBIE,
} from './monsters.js';
import { THEMEROOM_DEFINITIONS } from './themeroom_data.js';
import {
    COLNO, ROWNO, STONE, ROOM, CORR, DOOR, STAIRS,
    HWALL, VWALL, TLCORNER, TRCORNER, BLCORNER, BRCORNER,
    CROSSWALL, TUWALL, TDWALL, TLWALL, TRWALL,
    D_NODOOR, D_BROKEN, D_CLOSED, D_ISOPEN, D_LOCKED, D_TRAPPED, D_SECRET,
    OROOM, THEMEROOM, COURT, SWAMP, VAULT, BEEHIVE, MORGUE,
    BARRACKS, ZOO, TEMPLE, LEPREHALL, COCKNEST, ANTHOLE, SHOPBASE,
    ROOMOFFSET, MAXNROFROOMS, MAX_SUBROOMS, SHARED,
    SDOOR, SCORR, IRONBARS, FOUNTAIN, SINK, THRONE, TREE,
    DUST,
    DIR_N, DIR_S, DIR_E, DIR_W, DIR_180,
    IS_WALL, IS_STWALL, IS_DOOR, IS_OBSTRUCTED, IS_FURNITURE, IS_POOL,
    IS_LAVA,
    SPACE_POS, isok, W_NONDIGGABLE,
    W_RANDOM, W_NORTH, W_SOUTH, W_EAST, W_WEST, W_ANY,
    FILL_NONE, FILL_NORMAL,
    ICE, MOAT, POOL, WATER, LAVAPOOL, LAVAWALL,
    DBWALL, AIR, CLOUD,
    MAX_TYPE, MATCH_WALL,
    A_LAWFUL, A_NEUTRAL, A_CHAOTIC,
    LR_UPTELE,
    NO_TRAP, TRAPNUM, ARROW_TRAP, DART_TRAP, ROCKTRAP,
    SQKY_BOARD, LANDMINE, ROLLING_BOULDER_TRAP,
    SLP_GAS_TRAP, RUST_TRAP, FIRE_TRAP, PIT, SPIKED_PIT, HOLE,
    TRAPDOOR, TELEP_TRAP, LEVEL_TELEP, MAGIC_PORTAL, WEB,
    STATUE_TRAP, MAGIC_TRAP, POLY_TRAP,
    VIBRATING_SQUARE, TRAPPED_DOOR, TRAPPED_CHEST,
    MKTRAP_NOFLAGS, MKTRAP_NOSPIDERONWEB,
    CORPSTAT_INIT, MARK, MM_NOGRP,
    is_hole, is_pit,
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

// Stairway list management
function stairway_add(x, y, up, isladder, dest) {
    const node = { sx: x, sy: y, up, isladder, tolev: { ...dest }, next: game.stairs };
    game.stairs = node;
}

// ── Stairway lookup ──

function stairway_find_dir(up) {
    const direction = Boolean(up);
    for (let s = game.stairs; s; s = s.next)
        if (Boolean(s.up) === direction) return s;
    return null;
}

function stairway_find_special_dir(up) {
    const direction = Boolean(up);
    for (let s = game.stairs; s; s = s.next)
        if (s.tolev.dnum !== (game.u?.uz?.dnum ?? 0)
            && Boolean(s.up) !== direction) return s;
    return null;
}

// ── Hero placement (C ref: stairs.c, mkmaze.c) ──

export function u_on_newpos(x, y, state = game) {
    if (!isok(x, y))
        throw new RangeError(`u_on_newpos: hero location is off map <${x},${y}>`);

    const hero = state.u;
    hero.ux = x;
    hero.uy = y;
    hero.uundetected = false;
    if (hero.usteed) {
        hero.usteed.mx = x;
        hero.usteed.my = y;
    }

    if (!on_level(hero.uz, hero.uz0)) {
        hero.ux0 = x;
        hero.uy0 = y;

        // dungeon.c:u_on_newpos() calls map_location(FALSE). Preserve its
        // independent lastseentyp[x][y] write here; the [x][y] matrix lives
        // with the fresh GameMap so a new level starts cleared. The current
        // display layer does not yet map objects, seen traps, or revealed
        // engravings, so it remains responsible for replacing this seam with
        // map_location's remembered-glyph priority once those layers exist.
        const level = state.level;
        if (level) {
            level.lastseentyp ??= Array.from(
                { length: COLNO },
                () => new Array(ROWNO).fill(0),
            );
            level.lastseentyp[x][y] = level.at(x, y)?.typ ?? STONE;
        }
        state.iflags ??= {};
        state.iflags.terrain_typ = MAX_TYPE;
    }
    // Same-level nearby-object remapping and dungeon.c:earth_sense() are not
    // reached by this new-game placement boundary and remain explicit future
    // dependencies before this function can serve general level movement.
}

// C ref: mkmaze.c bad_location — simplified for skeleton
function bad_location(x, y, nlx, nly, nhx, nhy) {
    const loc = game.level?.at(x, y);
    if (!loc) return true;
    // Excluded region
    if (nlx && x >= nlx && x <= nhx && y >= nly && y <= nhy) return true;
    // Must be ROOM or (CORR in maze)
    if (loc.typ !== ROOM && !(loc.typ === CORR && game.level?.flags?.is_maze_lev))
        return true;
    return false;
}

// C ref: mkmaze.c place_lregion — place hero (LR_UPTELE/LR_DOWNTELE)
export function place_lregion(lx, ly, hx, hy, nlx, nly, nhx, nhy, rtype, lev) {
    if (!lx) {
        lx = 1; hx = COLNO - 1; ly = 0; hy = ROWNO - 1;
    }
    if (lx < 1) lx = 1;
    if (hx > COLNO - 1) hx = COLNO - 1;
    if (ly < 0) ly = 0;
    if (hy > ROWNO - 1) hy = ROWNO - 1;

    // Probabilistic search
    for (let trycnt = 0; trycnt < 200; trycnt++) {
        const x = rn1((hx - lx) + 1, lx);
        const y = rn1((hy - ly) + 1, ly);
        if (!bad_location(x, y, nlx, nly, nhx, nhy)) {
            u_on_newpos(x, y);
            return;
        }
    }
    // Deterministic fallback
    for (let x = lx; x <= hx; x++)
        for (let y = ly; y <= hy; y++)
            if (!bad_location(x, y, nlx, nly, nhx, nhy)) {
                u_on_newpos(x, y);
                return;
            }
}

// C ref: stairs.c u_on_upstairs — place hero on upstairs or fallback
export function u_on_upstairs() {
    const stway = stairway_find_dir(true);
    if (stway) { u_on_newpos(stway.sx, stway.sy); return; }
    // No upstair — try special stairs, then random
    const special = stairway_find_special_dir(false);
    if (special) { u_on_newpos(special.sx, special.sy); return; }
    // Random placement via place_lregion
    place_lregion(0, 0, 0, 0, 0, 0, 0, 0, LR_UPTELE, null);
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

// C ref: bones.c getbones()
function getbones() {
    const flags = game.flags || {};
    if (flags.explore) return false;
    if (flags.bones === false) return false;
    if (rn2(3) && !game.flags?.debug) return false;
    return false;
}

// C ref: allmain.c l_nhcore_init()
export function l_nhcore_init(state = game, random = rn2) {
    const align = [A_LAWFUL, A_NEUTRAL, A_CHAOTIC];
    shuffle_core_values(align, random);
    state.splev_align = align;
}

// C ref: mklev.c mklev()
export async function mklev() {
    const g = game;
    if (getbones()) return;
    g.in_mklev = true;
    await makelevel();
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
        const d = depth_of_level(game.u?.uz);
        return (randomOneBased(1 + Math.abs(d)) < 11 && random(77)) ? true : false;
    }
    return !!litstate;
}

// C ref: sp_lev.c fill_special_room(). Shops and zoo-family rooms keep narrow
// hooks until their population subsystems are ported; vault filling and all
// recursion, fill-policy, and level-flag behavior are complete here.
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
            if (typeof env.stockRoom !== 'function')
                throw new Error('fill_special_room requires the stock_room subsystem');
            env.stockRoom(croom.rtype - SHOPBASE, croom, normalized);
            flags.has_shop = true;
            return;
        }

        switch (croom.rtype) {
        case VAULT: {
            const amountRange = Math.abs(dungeon_depth(state.u?.uz, state)) * 100;
            for (let x = croom.lx; x <= croom.hx; ++x) {
                for (let y = croom.ly; y <= croom.hy; ++y) {
                    mkgold(randomOneBased(amountRange, 51), x, y, normalized);
                }
            }
            break;
        }
        case COURT:
        case ZOO:
        case BEEHIVE:
        case ANTHOLE:
        case COCKNEST:
        case LEPREHALL:
        case MORGUE:
        case BARRACKS:
            if (typeof env.fillZoo !== 'function')
                throw new Error('fill_special_room requires the fill_zoo subsystem');
            env.fillZoo(croom, normalized);
            break;
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
async function makelevel() {
    const g = game;
    oinit();
    clear_level_structures();

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

    makecorridors();
    await make_niches();

    // Vault creation (simplified for contest)
    if (g.vault_x !== -1) {
        const vw = { v: 1 }, vh = { v: 1 };
        const vx = { v: g.vault_x }, vy = { v: g.vault_y };
        if (check_room(vx, vw, vy, vh, true)) {
            add_room(vx.v, vy.v, vx.v + vw.v, vy.v + vh.v, true, VAULT, false);
            g.level.flags.has_vault = true;
            const vaultRoom = g.level.rooms[g.level.nroom - 1];
            if (vaultRoom) {
                vaultRoom.needfill = FILL_NORMAL;
                fill_special_room(vaultRoom);
            }
            if (!g.level.flags.noteleport && !rn2(3))
                await makeniche(TELEP_TRAP);
        } else if (rnd_rect()) {
            // Fallback vault attempt — simplified
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

// C ref: nhlua.c splev_chr2typ(). This table covers the special-level map
// alphabet even though the first generated slice only uses '.', '-', '|',
// and transparent 'x' cells.
function splev_chr2typ(char) {
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

function preflight_themeroom_fill(definition, context) {
    if (typeof context.themeroomFill !== 'function') {
        if (context.allowMissingFill) return false;
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
    const facade = context.randomFacade;
    for (const method of THEMEROOM_RANDOM_METHODS) {
        if (typeof facade?.[method] !== 'function') {
            throw new UnsupportedThemeroomActionError(
                definition,
                `requires randomFacade.${method} for its themeroom-fill callback`,
            );
        }
    }
    if (facade.rn2 !== context.random
        || facade.rnd !== context.randomOneBased) {
        throw new UnsupportedThemeroomActionError(
            definition,
            'requires randomFacade.rn2/rnd to match the map RNG streams',
        );
    }
    return true;
}

function invoke_themeroom_fill(room, definition, context) {
    // Strict callers validate before creating the room or loading its map.
    // The missing-callback case is the live generator's temporary partial port.
    if (typeof context.themeroomFill !== 'function') return;
    // Lua invokes contents before leaving the current room context. Keep this
    // call synchronous. This is the exact themeroom_fill(room, difficulty,
    // rawEnv) contract, including the indexed room that selection.room() needs.
    context.themeroomFill(room, context.difficulty, {
        state: game,
        random: context.randomFacade,
    });
}

// C refs: themerms.lua filler_region(); sp_lev.c lspo_region().
function filler_region(filler, origin, definition, context) {
    const state = game;
    const themed = context.random(100) < 30;
    if (themed) preflight_themeroom_fill(definition, context);
    const lit = litstate_rnd(
        -1,
        context.random,
        context.randomOneBased,
    );
    const sx = origin.x + filler.x;
    const sy = origin.y + filler.y;
    const roomIndex = state.level.nroom;
    const bounds = flood_fill_themeroom(sx, sy, roomIndex + ROOMOFFSET, lit, state);
    if (!bounds) return false;
    state.smeq ??= new Array(MAXNROFROOMS + 1).fill(0);
    state.smeq[roomIndex] = roomIndex;
    add_room(
        bounds.minx, bounds.miny, bounds.maxx, bounds.maxy,
        false, themed ? THEMEROOM : OROOM, true,
    );
    const room = state.level.rooms[roomIndex];
    room.rlit = lit ? 1 : 0;
    room.irregular = true;
    room.needjoining = true;
    room.needfill = FILL_NORMAL;
    if (themed) invoke_themeroom_fill(room, definition, context);
    return true;
}

function room_type_from_schema(type, definition) {
    if (type === 'ordinary') return OROOM;
    if (type === 'themed') return THEMEROOM;
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
    const facade = context.randomFacade;
    for (const method of THEMEROOM_RANDOM_METHODS) {
        if (typeof facade?.[method] !== 'function') {
            throw new UnsupportedThemeroomActionError(
                context.definition,
                `requires randomFacade.${method} for special-level creation`,
            );
        }
    }
    if (facade.rn2 !== context.random
        || facade.rnd !== context.randomOneBased) {
        throw new UnsupportedThemeroomActionError(
            context.definition,
            'requires randomFacade.rn2/rnd to match the room RNG streams',
        );
    }
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

function dispatch_map_action(definition, context) {
    const contents = definition.action.contents;
    const supported = contents?.kind === 'filler-region'
        || (contents?.kind === 'handler' && contents.handler === 'blocked-center');
    if (!supported) {
        const handler = contents?.handler ?? contents?.kind ?? 'missing contents';
        throw new UnsupportedThemeroomActionError(
            definition,
            `requires unimplemented map handler ${JSON.stringify(handler)}`,
        );
    }
    preflight_themeroom_fill(definition, context);

    const origin = lspo_map(definition, context.random);
    if (!origin) return false;
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
// All generic fill bodies and registered direct handlers are live. Direct
// filler maps still omit their optional fill, and unported direct callbacks
// use the ordinary-room fallback.
// dispatch_themeroom() remains the strict completion seam.
export async function themerooms_generate(
    difficulty,
    random = rn2,
    randomOneBased = rnd,
    rawEnv = {},
) {
    const pick = select_themeroom(difficulty, random);
    if (!pick) return false;
    if (pick.action?.kind === 'room'
        || DIRECT_THEMEROOM_HANDLERS.has(pick.action?.handler)) {
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
    if (pick.map && pick.filler) {
        const origin = lspo_map(pick, random);
        return origin ? filler_region(
            pick.filler,
            origin,
            pick,
            {
                allowMissingFill: true,
                difficulty,
                random,
                randomOneBased,
                themeroomFill: null,
            },
        ) : false;
    }

    // sp_lev.c build_room() evaluates the default 100% chance with rn2(100).
    random(100);
    const ok = create_room(
        -1, -1, -1, -1, -1, -1, OROOM, -1,
        random,
        randomOneBased,
    );
    if (ok) {
        const room = game.level.rooms[game.level.nroom - 1];
        if (room) {
            topologize(room);
            room.needfill = FILL_NORMAL;
        }
    }
    return ok;
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
function topologize(croom) {
    if (!croom || croom.irregular) return;
    const roomno = (croom.roomnoidx ?? -1) + ROOMOFFSET;
    const lowx = croom.lx, lowy = croom.ly;
    const hix = croom.hx, hiy = croom.hy;
    if (!game.level || roomno < ROOMOFFSET) return;
    if ((game.level.at(lowx, lowy)?.roomno ?? 0) === roomno) return;
    for (let x = lowx; x <= hix; x++)
        for (let y = lowy; y <= hiy; y++) {
            const loc = game.level.at(x, y);
            if (loc) loc.roomno = roomno;
        }
    for (let x = lowx - 1; x <= hix + 1; x++)
        for (let y = lowy - 1; y <= hiy + 1; y += (hiy - lowy + 2)) {
            const loc = game.level.at(x, y);
            if (loc) { loc.edge = true; loc.roomno = loc.roomno ? SHARED : roomno; }
        }
    for (let x = lowx - 1; x <= hix + 1; x += (hix - lowx + 2))
        for (let y = lowy; y <= hiy; y++) {
            const loc = game.level.at(x, y);
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
    const d = depth_of_level(game.u?.uz);
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

function place_branch(branchp) {
    const g = game;
    const mp = { x: 0, y: 0 };
    const croom = find_branch_room(mp);
    if (croom && mp.x > 0) {
        const on_end1 = (branchp.end1?.dnum === g.u?.uz?.dnum
            && branchp.end1?.dlevel === g.u?.uz?.dlevel);
        const dest = on_end1 ? branchp.end2 : branchp.end1;
        const goes_up = on_end1 ? !!branchp.end1_up : !branchp.end1_up;
        const loc = g.level?.at(mp.x, mp.y);
        if (loc) {
            loc.typ = STAIRS;
            loc.ladder = goes_up ? 1 : 2;
        }
        stairway_add(mp.x, mp.y, goes_up, false, dest || { dnum: 0, dlevel: 0 });
        if (goes_up) g.level.upstair = { x: mp.x, y: mp.y };
        else g.level.dnstair = { x: mp.x, y: mp.y };
    }
    g.made_branch = true;
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

const SUPPLY_EXTRA_CLASSES = [
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
        const objectClass = SUPPLY_EXTRA_CLASSES[
            random(SUPPLY_EXTRA_CLASSES.length)
        ];
        let obj = mkobj(objectClass, false, env);
        if (objectClass === SPBOOK_NO_NOVEL) {
            const maxPass = dungeon_depth(state.u.uz, state) > 2 ? 2 : 3;
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

        chance = 80 - dungeon_depth(state.u.uz, state) * 2;
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

        if (!rn2(27 + 3 * Math.abs(dungeon_depth(state.u.uz, state)))) {
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

function set_wall_state() { /* no-op for contest */ }

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
