// Dungeon topology initialization.
// C ref: src/dungeon.c init_dungeons() and its loader/placement helpers.
// Data ref: dat/dungeon.lua, translated in dungeon_data.js.

import { game } from './gstate.js';
import { rn2 } from './rng.js';
import { DUNGEON_DATA } from './dungeon_data.js';
import {
    AGGRAVATE_MONSTER,
    ALTAR,
    AM_MASK,
    Align2amask,
    BLINDED,
    CLOUD,
    COLNO,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    DRAWBRIDGE_DOWN,
    DRAWBRIDGE_UP,
    CORR,
    DELPHI,
    FLYING,
    HALLUC,
    HALLUC_RES,
    ICE,
    IS_AIR,
    IS_ALTAR,
    IS_DOOR,
    IS_FOUNTAIN,
    IS_GRAVE,
    IS_ROOM,
    IS_WALL,
    LAVAPOOL,
    LEVITATION,
    LR_DOWNTELE,
    LR_UPTELE,
    MCORPSENM,
    M_AP_FURNITURE,
    M_AP_TYPMASK,
    MAXNROFROOMS,
    MAX_TYPE,
    MSA_NONE,
    MOAT,
    PICK_ONE,
    FOUNTAIN,
    GRAVE,
    ROWNO,
    ROOM,
    ROOMOFFSET,
    SDOOR,
    SHOPBASE,
    SINK,
    STONE,
    SVALL,
    TEMPLE,
    THRONE,
    TREE,
    Upolyd,
    VAULT,
    VISITED,
    has_mcorpsenm,
    isok,
} from './const.js';
import { PM_DWARF } from './monsters.js';
// js/display.js imports update_lastseentyp() from this file. Both sides use
// the other's exports only inside function bodies, so the cycle resolves.
import { see_nearby_objects } from './display.js';
import { hliquid } from './do_name.js';
import { makeplural } from './fruit.js';
import { switch_terrain } from './hack.js';
import { strstri } from './hacklib.js';
import { place_lregion } from './mkmaze.js';
import { cmap_to_type } from './mkroom.js';
import { within_bounded_area } from './rect.js';
// js/rooms.js reaches this file through js/hack.js, which this file already
// imports. Both sides use the other's exports only inside function bodies, so
// the cycle resolves.
import { in_rooms } from './rooms.js';
// js/stairs.js imports depth() and on_level() from this file. Both sides use
// the other's exports only inside function bodies, so the cycle resolves.
import { On_stairs, stairway_at } from './stairs.js';
import { is_ice } from './terrain.js';
// js/trap.js imports on_level() from this file. Both sides use the other's
// exports only inside function bodies, so the cycle resolves.
import { is_lava, is_pool } from './trap.js';
// js/windows.js does not import from this file, so there is no cycle.
import { add_menu_heading, select_menu } from './windows.js';

export const BR_STAIR = 0;
export const BR_NO_END1 = 1;
export const BR_NO_END2 = 2;
export const BR_PORTAL = 3;

const TBR_STAIR = 0;
const TBR_NO_UP = 1;
const TBR_NO_DOWN = 2;
const TBR_PORTAL = 3;

const TOWN = 0x01;
const HELLISH = 0x02;
const MAZELIKE = 0x04;
const ROGUELIKE = 0x08;
const UNCONNECTED = 0x10;

const D_ALIGN_CHAOTIC = 0x10;
const D_ALIGN_NEUTRAL = 0x20;
const D_ALIGN_LAWFUL = 0x40;
const D_ALIGN_MASK = 0x70;

const MAXDUNGEON = 16;
const MAXLEVEL = 32;
const LEV_LIMIT = 50;
const BRANCH_LIMIT = 32;

const FLAG_VALUES = {
    town: TOWN,
    hellish: HELLISH,
    mazelike: MAZELIKE,
    roguelike: ROGUELIKE,
    unconnected: UNCONNECTED,
};

const ALIGN_VALUES = {
    unaligned: 0,
    noalign: 0,
    lawful: D_ALIGN_LAWFUL,
    neutral: D_ALIGN_NEUTRAL,
    chaotic: D_ALIGN_CHAOTIC,
};

const BRANCH_TYPE_VALUES = {
    stair: TBR_STAIR,
    portal: TBR_PORTAL,
    no_down: TBR_NO_DOWN,
    no_up: TBR_NO_UP,
};

const LEVEL_MAP = [
    ['air', 'air_level'],
    ['asmodeus', 'asmodeus_level'],
    ['astral', 'astral_level'],
    ['baalz', 'baalzebub_level'],
    ['bigrm', 'bigroom_level'],
    ['castle', 'stronghold_level'],
    ['earth', 'earth_level'],
    ['fakewiz1', 'portal_level'],
    ['fire', 'fire_level'],
    ['juiblex', 'juiblex_level'],
    ['knox', 'knox_level'],
    ['medusa', 'medusa_level'],
    ['oracle', 'oracle_level'],
    ['orcus', 'orcus_level'],
    ['rogue', 'rogue_level'],
    ['sanctum', 'sanctum_level'],
    ['valley', 'valley_level'],
    ['water', 'water_level'],
    ['wizard1', 'wiz1_level'],
    ['wizard2', 'wiz2_level'],
    ['wizard3', 'wiz3_level'],
    ['minend', 'mineend_level'],
    ['soko1', 'sokoend_level'],
    ['x-strt', 'qstart_level'],
    ['x-loca', 'qlocate_level'],
    ['x-goal', 'nemesis_level'],
];

function panic(message) {
    throw new Error(message);
}

function get_dgn_flags(rawFlags) {
    if (rawFlags === undefined)
        return 0;
    const flags = Array.isArray(rawFlags) ? rawFlags : [rawFlags];
    let result = 0;
    for (const flag of flags) {
        if (!(flag in FLAG_VALUES))
            panic(`unknown dungeon flag: ${flag}`);
        result |= FLAG_VALUES[flag];
    }
    return result;
}

function get_dgn_align(rawAlignment = 'unaligned') {
    if (!(rawAlignment in ALIGN_VALUES))
        panic(`unknown dungeon alignment: ${rawAlignment}`);
    return ALIGN_VALUES[rawAlignment];
}

// `pd` is init_dungeons()'s per-call working state, mirroring C's
// `struct proto_dungeon` across these source-shaped loader helpers.
function find_temp_level(pd, name, end) {
    for (let index = 0; index < end; ++index) {
        if (pd.tmplevel[index]?.name === name)
            return index;
    }
    return -1;
}

function init_dungeon_levels(rawLevels, pd, dngidx) {
    const levels = rawLevels ?? [];
    pd.tmpdungeon[dngidx] ??= {};
    pd.tmpdungeon[dngidx].levels = levels.length;

    for (let f = 0; f < levels.length; ++f) {
        const raw = levels[f];
        const index = pd.n_levs + f;
        const tmpl = {
            name: raw.name,
            chainlvl: raw.chainlevel ?? null,
            lev: { base: raw.base, rand: raw.range ?? 0 },
            chance: raw.chance ?? 100,
            rndlevs: raw.nlevels ?? 0,
            flags: get_dgn_flags(raw.flags) | get_dgn_align(raw.alignment),
            boneschar: raw.bonetag?.[0] ?? '',
            chain: -1,
        };

        if (tmpl.chainlvl !== null) {
            tmpl.chain = find_temp_level(pd, tmpl.chainlvl, index);
            if (tmpl.chain === -1) {
                panic(`Could not chain level ${tmpl.name} to ${tmpl.chainlvl}`);
            }
        }
        pd.tmplevel[index] = tmpl;
    }

    pd.n_levs += levels.length;
    if (pd.n_levs > LEV_LIMIT)
        panic('init_dungeon: too many special levels');
}

function init_dungeon_branches(rawBranches, pd, dngidx) {
    const branches = rawBranches ?? [];
    pd.tmpdungeon[dngidx] ??= {};
    pd.tmpdungeon[dngidx].branches = branches.length;

    for (let f = 0; f < branches.length; ++f) {
        const raw = branches[f];
        const branchType = raw.branchtype ?? 'stair';
        if (!(branchType in BRANCH_TYPE_VALUES))
            panic(`unknown branch type: ${branchType}`);

        const tmpb = {
            name: raw.name,
            lev: { base: raw.base, rand: raw.range ?? 0 },
            chain: -1,
            type: BRANCH_TYPE_VALUES[branchType],
            up: (raw.direction ?? 'down') === 'up',
        };
        if (raw.direction !== undefined
            && raw.direction !== 'up'
            && raw.direction !== 'down') {
            panic(`unknown branch direction: ${raw.direction}`);
        }

        if (raw.chainlevel !== undefined) {
            // dungeon.c uses pd->n_levs + f - 1 as this loop's exclusive
            // upper bound. Preserve that unusual boundary.
            tmpb.chain = find_temp_level(
                pd,
                raw.chainlevel,
                pd.n_levs + f - 1,
            );
            if (tmpb.chain === -1) {
                panic(`Could not chain branch ${tmpb.name} to level ${raw.chainlevel}`);
            }
        }
        pd.tmpbranch[pd.n_brs + f] = tmpb;
    }

    pd.n_brs += branches.length;
    if (pd.n_brs > BRANCH_LIMIT)
        panic('init_dungeon: too many branches');
}

// C ref: dungeon.c find_branch() (310-337). Two functions share one name: with
// a proto-dungeon it answers an index into that structure's branch table, and
// without one it answers the packed ledger pair of the branch whose far
// dungeon is called `name`. lev_by_name() is the caller of the second form,
// which is why C describes it as "support for level tport by name".
function find_branch(name, pd, state = game) {
    let index;
    if (pd) {
        for (index = 0; index < pd.n_brs; ++index) {
            if (pd.tmpbranch[index].name === name)
                return index;
        }
        panic(`find_branch: can't find ${name}`);
    }
    /* support for level tport by name */
    const folded = name.toLowerCase();
    const branch = (state.branches ?? []).find((candidate) => {
        const dnam = state.dungeons[candidate.end2.dnum].dname;
        const foldedName = dnam.toLowerCase();
        return foldedName === folded
            || (foldedName.startsWith('the ')
                && foldedName.slice(4) === folded);
    }) ?? null;
    // C packs the two ledger numbers into one int so that the caller can
    // recover both ends of the branch; -1 means no branch carries that name.
    return branch
        ? ((ledger_no(branch.end1, state) << 8) | ledger_no(branch.end2, state))
        : -1;
}

function parent_dnum(name, pd) {
    let branchIndex = find_branch(name, pd);
    for (let pdnum = 0; pd.tmpdungeon[pdnum].name !== name; ++pdnum) {
        branchIndex -= pd.tmpdungeon[pdnum].branches;
        if (branchIndex < 0)
            return pdnum;
    }
    panic("parent_dnum: couldn't resolve branch");
}

// C ref: dungeon.c level_range. The returned pair replaces adjusted_base's
// output pointer with an object field.
export function level_range(dgn, baseValue, randc, chain, pd, state = game) {
    const lmax = state.dungeons[dgn].num_dunlevs;
    let base = baseValue;

    if (chain >= 0) {
        const chainedLevel = pd.final_lev[chain];
        if (!chainedLevel)
            panic('level_range: empty chain level');
        base += chainedLevel.dlevel.dlevel;
    } else if (base < 0) {
        base = lmax + base + 1;
    }

    if (base < 1 || base > lmax)
        panic('level_range: base value out of range');

    let count = 1;
    if (randc === -1)
        count = lmax - base + 1;
    else if (randc)
        count = base + randc - 1 > lmax ? lmax - base + 1 : randc;
    return { base, count };
}

function parent_dlevel(name, pd, state, random) {
    const dnum = parent_dnum(name, pd);
    const branchIndex = find_branch(name, pd);
    const tmpBranch = pd.tmpbranch[branchIndex];
    const { base, count } = level_range(
        dnum,
        tmpBranch.lev.base,
        tmpBranch.lev.rand,
        tmpBranch.chain,
        pd,
        state,
    );

    // The source checks the position after the initial random index first,
    // wrapping around until it reaches that initial position last.
    let index = random(count);
    const initialIndex = index;
    let occupied;
    do {
        if (++index >= count)
            index = 0;
        occupied = state.branches.some((branch) => (
            (branch.end1.dnum === dnum
             && branch.end1.dlevel === base + index)
            || (branch.end2.dnum === dnum
                && branch.end2.dlevel === base + index)
        ));
    } while (occupied && index !== initialIndex);
    return base + index;
}

function correct_branch_type(tmpBranch) {
    switch (tmpBranch.type) {
    case TBR_STAIR:
        return BR_STAIR;
    case TBR_NO_UP:
        return tmpBranch.up ? BR_NO_END1 : BR_NO_END2;
    case TBR_NO_DOWN:
        return tmpBranch.up ? BR_NO_END2 : BR_NO_END1;
    case TBR_PORTAL:
        return BR_PORTAL;
    default:
        panic('correct_branch_type: unknown branch type');
    }
}

function branch_value(branch) {
    return (((branch.end1.dnum * (MAXLEVEL + 1)) + branch.end1.dlevel)
            * (MAXDUNGEON + 1) * (MAXLEVEL + 1))
        + (branch.end2.dnum * (MAXLEVEL + 1))
        + branch.end2.dlevel;
}

function sync_branch_links(state) {
    for (let index = 0; index < state.branches.length; ++index)
        state.branches[index].next = state.branches[index + 1] ?? null;
    state.svb ??= {};
    state.svb.branches = state.branches[0] ?? null;
}

export function insert_branch(newBranch, extractFirst, state = game) {
    if (extractFirst) {
        const oldIndex = state.branches.indexOf(newBranch);
        if (oldIndex === -1)
            panic('insert_branch: not found');
        state.branches.splice(oldIndex, 1);
    }

    const newValue = branch_value(newBranch);
    let previousValue = -1;
    let insertAt = state.branches.length;
    for (let index = 0; index < state.branches.length; ++index) {
        const currentValue = branch_value(state.branches[index]);
        if (previousValue < newValue && newValue <= currentValue) {
            insertAt = index;
            break;
        }
        previousValue = currentValue;
    }
    state.branches.splice(insertAt, 0, newBranch);
    sync_branch_links(state);
}

function add_branch(dgn, childEntryLevel, pd, state, random) {
    const branchIndex = find_branch(state.dungeons[dgn].dname, pd);
    const tmpBranch = pd.tmpbranch[branchIndex];
    const branch = {
        next: null,
        id: pd.branch_id++,
        type: correct_branch_type(tmpBranch),
        end1: {
            dnum: parent_dnum(state.dungeons[dgn].dname, pd),
            dlevel: parent_dlevel(
                state.dungeons[dgn].dname,
                pd,
                state,
                random,
            ),
        },
        end2: { dnum: dgn, dlevel: childEntryLevel },
        end1_up: tmpBranch.up,
    };
    insert_branch(branch, false, state);
    return branch;
}

function init_level(dgn, protoIndex, pd, wizard, random) {
    const template = pd.tmplevel[protoIndex];
    pd.final_lev[protoIndex] = null;
    if (!wizard && template.chance <= random(100))
        return;

    const level = {
        next: null,
        proto: template.name,
        boneid: template.boneschar,
        dlevel: { dnum: dgn, dlevel: 0 },
        flags: {
            town: Boolean(template.flags & TOWN),
            hellish: Boolean(template.flags & HELLISH),
            maze_like: Boolean(template.flags & MAZELIKE),
            rogue_like: Boolean(template.flags & ROGUELIKE),
            align: (template.flags & D_ALIGN_MASK) >> 4,
            unconnected: false,
        },
        rndlevs: template.rndlevs,
    };
    if (!level.flags.align) {
        level.flags.align = (
            pd.tmpdungeon[dgn].flags & D_ALIGN_MASK
        ) >> 4;
    }
    pd.final_lev[protoIndex] = level;
}

export function possible_places(index, pd, state = game) {
    const map = Array(MAXLEVEL + 1).fill(false);
    const level = pd.final_lev[index];
    const template = pd.tmplevel[index];
    const range = level_range(
        level.dlevel.dnum,
        template.lev.base,
        template.lev.rand,
        template.chain,
        pd,
        state,
    );
    let count = range.count;
    for (let place = range.base; place < range.base + range.count; ++place)
        map[place] = true;

    for (let prior = pd.start; prior < index; ++prior) {
        const priorLevel = pd.final_lev[prior];
        if (priorLevel && map[priorLevel.dlevel.dlevel]) {
            map[priorLevel.dlevel.dlevel] = false;
            --count;
        }
    }
    return { map, count };
}

function pick_level(map, nth) {
    for (let level = 1; level <= MAXLEVEL; ++level) {
        if (map[level] && nth-- === 0)
            return level;
    }
    panic('pick_level: ran out of valid levels');
}

export function place_level(protoIndex, pd, state = game, random = rn2) {
    if (protoIndex === pd.n_levs)
        return true;

    const level = pd.final_lev[protoIndex];
    if (!level)
        return place_level(protoIndex + 1, pd, state, random);

    const possible = possible_places(protoIndex, pd, state);
    for (let count = possible.count; count; --count) {
        level.dlevel.dlevel = pick_level(possible.map, random(count));
        if (place_level(protoIndex + 1, pd, state, random))
            return true;
        possible.map[level.dlevel.dlevel] = false;
    }
    return false;
}

function add_level(newLevel, state) {
    let insertAt = state.specialLevels.length;
    for (let index = 0; index < state.specialLevels.length; ++index) {
        const current = state.specialLevels[index];
        if (current.dlevel.dnum === newLevel.dlevel.dnum
            && current.dlevel.dlevel > newLevel.dlevel.dlevel) {
            insertAt = index;
            break;
        }
    }
    state.specialLevels.splice(insertAt, 0, newLevel);
    for (let index = 0; index < state.specialLevels.length; ++index) {
        state.specialLevels[index].next = state.specialLevels[index + 1] ?? null;
    }
    state.sp_levchn = state.specialLevels[0] ?? null;
}

// C ref: dungeon.c depth(). The absolute depth of a level, counting from the
// start of the branch it belongs to. C reads svd.dungeons[] unguarded, so a
// caller reaching here before init_dungeons() has filled that array is a bug
// in the caller, and this throws rather than inventing a depth for it.
export function depth(level, state = game) {
    return state.dungeons[level.dnum].depth_start + level.dlevel - 1;
}

// C ref: dungeon.c dunlev(). The level number within its own dungeon branch.
export function dunlev(level) {
    return level.dlevel;
}

// C ref: dungeon.c dunlevs_in_dungeon(). The deepest level number this
// dungeon branch holds.
export function dunlevs_in_dungeon(level, state = game) {
    return state.dungeons[level.dnum].num_dunlevs;
}

// C ref: dungeon.c In_hell(). The Inhell macro is In_hell(&u.uz).
export function In_hell(level, state = game) {
    return Boolean(state.dungeons[level.dnum].flags.hellish);
}

// C ref: dungeon.c On_W_tower_level() (1913-1920) and In_W_tower()
// (1922-1940). The first asks whether the level holds the Wizard's tower, the
// second whether a square is inside it.
//
// dat/dungeon.lua puts wizard1, wizard2 and wizard3 in Gehennom, so both stay
// false everywhere this port can reach. They are ported rather than assumed
// because do.c goto_level() reads In_W_tower() before it can know where it is
// going, and a Gehennom arrival would otherwise pick the answer up silently.
export function On_W_tower_level(level, state = game) {
    return Boolean(on_level(level, state.wiz1_level)
        || on_level(level, state.wiz2_level)
        || on_level(level, state.wiz3_level));
}

export function In_W_tower(x, y, level, state = game) {
    if (!On_W_tower_level(level, state))
        return false;
    const dndest = state.dndest ?? {};
    if (!dndest.nlx) {
        // C's impossible("No boundary for Wizard's Tower?") reports a level
        // that claims the tower without carrying its exclusion region.
        throw new Error("No boundary for Wizard's Tower?");
    }
    /*
     * Both of the exclusion regions for arriving via level teleport
     * (from above or below) define the tower's boundary.
     */
    return within_bounded_area(x, y, dndest.nlx, dndest.nly,
                               dndest.nhx, dndest.nhy);
}

// C ref: dungeon.c single_level_branch() (1966-1975). C's own comment calls
// this a hard-coded assumption that Fort Ludios is the only one-level branch.
// teleport.c level_tele() refuses to send the hero anywhere from such a
// branch, and stairs.c stairs_description() names its level by branch depth.
export function single_level_branch(level, state = game) {
    return on_level(level, state.knox_level);
}

// C ref: dungeon.c get_level() (1795-1846). Translates the depth the player
// typed, which counts from the surface, into a dungeon number and a level
// within it. C's comment: teleporting "down" is confined to the current
// dungeon, and the search walks up the branch chain until it finds the dungeon
// that contains `levnum`.
export function get_level(newlevel, levnum, state = game) {
    let dgn = state.u.uz.dnum;

    if (levnum <= 0) {
        /* can only currently happen in endgame */
        levnum = state.u.uz.dlevel;
    } else if (levnum > (state.dungeons[dgn].depth_start
                         + state.dungeons[dgn].num_dunlevs - 1)) {
        /* beyond end of dungeon, jump to last level */
        levnum = state.dungeons[dgn].num_dunlevs;
    } else {
        /* The desired level is in this dungeon or a "higher" one. */
        if (levnum < state.dungeons[dgn].depth_start) {
            do {
                /*
                 * Find the parent dungeon of this dungeon.
                 *
                 * This assumes that end2 is always the "child" and it is
                 * unique.
                 */
                const br = (state.branches ?? []).find(
                    (candidate) => candidate.end2.dnum === dgn,
                );
                if (!br) panic("get_level: can't find parent dungeon");
                dgn = br.end1.dnum;
            } while (levnum < state.dungeons[dgn].depth_start);
        }

        /* We're within the same dungeon; calculate the level. */
        levnum = levnum - state.dungeons[dgn].depth_start + 1;
    }

    newlevel.dnum = dgn;
    newlevel.dlevel = levnum;
}

// C ref: dungeon.c Invocation_lev(), Can_dig_down(), and Can_fall_thru().
// Falling retains the Castle exception even when digging is blocked there.
export function Invocation_lev(level, state = game) {
    const dungeon = state.dungeons[level.dnum];
    return Boolean(
        dungeon.flags.hellish
        && level.dlevel === dungeon.num_dunlevs - 1
    );
}

export function Can_dig_down(level, state = game) {
    const dungeon = state.dungeons[level.dnum];
    return !state.level?.flags?.hardfloor
        && level.dlevel !== dungeon.num_dunlevs
        && !Invocation_lev(level, state);
}

export function Can_fall_thru(level, state = game) {
    return Can_dig_down(level, state)
        || Boolean(state.stronghold_level
            && on_level(level, state.stronghold_level));
}

// C ref: dungeon.c has_ceiling() (1689-1698). Every level has a ceiling
// except the endgame planes, and the earth plane is solid rock rather than
// open sky, so it keeps one. Its two readers are mondata.h:23 grounded(),
// where a clinger holds onto a ceiling and so avoids a pit only where one
// exists, and mon.c m_in_air().
//
// dungeon.h:141 In_endgame() and :114 Is_earthlevel() are spelled out against
// `state` rather than imported from js/const.js, whose copies read the module
// singleton `game`: every other topology predicate in this file is
// state-scoped, and grounded() is called with the planning clone in
// js/unported_monster_actions.js, which carries its own hero.
export function has_ceiling(level, state = game) {
    const inEndgame = level?.dnum != null
        && level.dnum === state.astral_level?.dnum;
    if (inEndgame && !on_level(level, state.earth_level))
        return false;
    return true;
}

export function builds_up(level, state = game) {
    const dungeon = state.dungeons[level.dnum];
    if (dungeon.num_dunlevs > 1)
        return dungeon.entry_lev === dungeon.num_dunlevs;
    const branch = state.branches.find(
        (candidate) => on_level(candidate.end2, level),
    );
    if (!branch)
        throw new Error(`builds_up: no branch for dungeon ${level.dnum}`);
    return Boolean(branch.end1_up);
}

// C ref: dungeon.c next_level() (1496-1514), the '>' command's descent.
//
// goto_level() lives in js/do.js, which already imports this file; taking it as
// an injected operation keeps the module graph acyclic. `env.gotoLevel` is
// required rather than defaulted for that reason.
export async function next_level(at_stairs, state = game, env = {}) {
    const gotoLevel = env.gotoLevel;
    if (typeof gotoLevel !== 'function')
        throw new TypeError('next_level requires a gotoLevel operation');
    const stway = stairway_at(state.u.ux, state.u.uy, state);

    if (at_stairs && stway) stway.u_traversed = true;

    if (at_stairs && stway) {
        return gotoLevel(
            { dnum: stway.tolev.dnum, dlevel: stway.tolev.dlevel },
            at_stairs,
            false,
            false,
            state,
        );
    }
    return gotoLevel(
        { dnum: state.u.uz.dnum, dlevel: state.u.uz.dlevel + 1 },
        at_stairs,
        !at_stairs,
        false,
        state,
    );
}

// C ref: dungeon.c prev_level() (1518-1543), the '<' command's ascent.
// Mirrors next_level() above. goto_level() is injected to keep the module
// graph acyclic.
export async function prev_level(at_stairs, state = game, env = {}) {
    const gotoLevel = env.gotoLevel;
    if (typeof gotoLevel !== 'function')
        throw new TypeError('prev_level requires a gotoLevel operation');
    const stway = stairway_at(state.u.ux, state.u.uy, state);

    if (at_stairs && stway) stway.u_traversed = true;

    if (at_stairs && stway && stway.tolev.dnum !== state.u.uz.dnum) {
        // Taking an up dungeon branch.
        if (!state.u.uz.dnum && state.u.uz.dlevel === 1
            && !state.u.uhave?.amulet) {
            // done(ESCAPED) -- escaping the dungeon. Not ported.
            throw new Error('prev_level: escaping the dungeon is not ported');
        } else {
            return gotoLevel(
                { dnum: stway.tolev.dnum, dlevel: stway.tolev.dlevel },
                at_stairs,
                false,
                false,
                state,
            );
        }
    } else {
        // Going up a stairs or rising through the ceiling.
        return gotoLevel(
            { dnum: state.u.uz.dnum, dlevel: state.u.uz.dlevel - 1 },
            at_stairs,
            false,
            false,
            state,
        );
    }
}

function deepest_lev_reached(state) {
    let deepest = 0;
    for (let dnum = 0; dnum < state.dungeons.length; ++dnum) {
        const dlevel = Math.trunc(state.dungeons[dnum].dunlev_ureached ?? 0);
        if (!dlevel) continue;
        deepest = Math.max(deepest, depth({ dnum, dlevel }, state));
    }
    return deepest;
}

// C ref: dungeon.c level_difficulty(). This value feeds random monster and
// object generation, so retain the source's endgame, Amulet, and upward-branch
// adjustments rather than treating dungeon depth as interchangeable.
export function level_difficulty(state = game) {
    const level = state.u?.uz;
    if (!level || !state.dungeons?.[level.dnum])
        throw new Error('level_difficulty requires initialized dungeon state');

    const astral = state.astral_level;
    const inEndgame = Number.isInteger(astral?.dlevel)
        && astral.dlevel > 0
        && level.dnum === astral.dnum;
    let result;
    if (inEndgame) {
        if (!Number.isInteger(state.sanctum_level?.dlevel)
            || state.sanctum_level.dlevel <= 0) {
            throw new Error('level_difficulty requires the Sanctum level');
        }
        result = depth(state.sanctum_level, state)
            + Math.trunc((state.u.ulevel ?? 0) / 2);
    } else if (state.u.uhave?.amulet) {
        result = deepest_lev_reached(state);
    } else {
        result = depth(level, state);
        if (builds_up(level, state)) {
            const dungeon = state.dungeons[level.dnum];
            result += 2 * (dungeon.entry_lev - level.dlevel + 1);
        }
    }
    if (state.u.uprops?.[AGGRAVATE_MONSTER]?.extrinsic)
        result = result > 25 ? 50 : result * 2;
    return result;
}

export function ledger_no(level, state = game) {
    return level.dlevel + state.dungeons[level.dnum].ledger_start;
}

// C refs: dungeon.c ledger_to_dnum() and ledger_to_dlev().
export function ledger_to_dnum(ledgerNumber, state = game) {
    const ledger = Math.trunc(ledgerNumber);
    for (let dnum = 0; dnum < state.dungeons.length; ++dnum) {
        const dungeon = state.dungeons[dnum];
        if (dungeon.ledger_start < ledger
            && ledger <= dungeon.ledger_start + dungeon.num_dunlevs) {
            return dnum;
        }
    }
    throw new RangeError(
        `level number out of range [ledger_to_dnum(${ledger})]`,
    );
}

export function ledger_to_dlev(ledgerNumber, state = game) {
    const dnum = ledger_to_dnum(ledgerNumber, state);
    return Math.trunc(ledgerNumber) - state.dungeons[dnum].ledger_start;
}

// C ref: dungeon.c assign_level(). It copies the two fields rather than
// replacing the destination, which is what lets a caller hold a reference to
// u.uz or u.uz0 across a level change.
export function assign_level(dest, src) {
    dest.dnum = src.dnum;
    dest.dlevel = src.dlevel;
    return dest;
}

// C refs: dungeon.c dname_to_dnum(), dungeon_branch() and at_dgn_entrance().
// The last answers whether the hero stands on the level a named branch leaves
// from, which do.c goto_level() asks about "The Quest" before its leader's
// summons is delivered.
export function dungeon_branch(dname, state = game) {
    const dnum = state.dungeons.findIndex(
        (dungeon) => dungeon.dname === dname,
    );
    if (dnum < 0) throw new Error(`dname_to_dnum: unknown dungeon ${dname}`);
    const branch = state.branches.find(
        (candidate) => candidate.end2.dnum === dnum,
    );
    if (!branch)
        throw new Error(`dungeon_branch: can't find entrance to ${dname}`);
    return branch;
}

export function at_dgn_entrance(dname, state = game) {
    return on_level(state.u.uz, dungeon_branch(dname, state).end1);
}

// C ref: dungeon.h dunlev_reached(), the deepest level of a dungeon the hero
// has reached.
export function dunlev_reached(level, state = game) {
    return Math.trunc(state.dungeons[level.dnum].dunlev_ureached ?? 0);
}

export function set_dunlev_reached(level, dlevel, state = game) {
    state.dungeons[level.dnum].dunlev_ureached = dlevel;
}

// C ref: dungeon.h `struct level_info`, the ledger-indexed array decl.c
// declares as `svl.level_info[MAXLINFO]`. Only its `flags` field has readers
// in the port: files.c create_levelfile() sets LFILE_EXISTS, save.c
// savelev_core() sets VISITED, and do.c goto_level() reads LFILE_EXISTS to
// decide between generating the destination level and reloading it. C's
// `where` and `time` fields describe a level file, which the port has none of.
//
// C's array is zero-initialized for a fresh game; the rows here are created on
// first use with the same zero flags.
export function level_info(ledgerNumber, state = game) {
    const ledger = Math.trunc(ledgerNumber);
    if (ledger < 0 || ledger > maxledgerno(state))
        throw new RangeError(`level_info: ledger ${ledger} out of range`);
    state.svl ??= {};
    state.svl.level_info ??= [];
    state.svl.level_info[ledger] ??= { flags: 0 };
    return state.svl.level_info[ledger];
}

export function maxledgerno(state = game) {
    const last = state.dungeons[state.n_dgns - 1];
    return last.ledger_start + last.num_dunlevs;
}

function init_dungeon_set_entry(pd, dngidx, state) {
    const configuredEntry = pd.tmpdungeon[dngidx].entry_lev;
    const dungeon = state.dungeons[dngidx];
    if (configuredEntry < 0) {
        dungeon.entry_lev = dungeon.num_dunlevs + configuredEntry + 1;
        if (dungeon.entry_lev <= 0)
            dungeon.entry_lev = 1;
    } else if (configuredEntry > 0) {
        dungeon.entry_lev = configuredEntry;
        if (dungeon.entry_lev > dungeon.num_dunlevs)
            dungeon.entry_lev = dungeon.num_dunlevs;
    } else {
        dungeon.entry_lev = 1;
    }
}

function init_dungeon_set_depth(pd, dngidx, state, random) {
    const dungeon = state.dungeons[dngidx];
    const branch = add_branch(dngidx, dungeon.entry_lev, pd, state, random);
    let fromDepth;
    let fromUp;
    if (branch.end1.dnum === dngidx) {
        fromDepth = depth(branch.end2, state);
        fromUp = !branch.end1_up;
    } else {
        fromDepth = depth(branch.end1, state);
        fromUp = branch.end1_up;
    }
    dungeon.depth_start = fromDepth
        + (branch.type === BR_PORTAL ? 0 : (fromUp ? -1 : 1))
        - (dungeon.entry_lev - 1);
}

function init_dungeon_dungeons(raw, pd, dngidx, state, wizard, random) {
    const chance = raw.chance ?? 100;
    if (!wizard && chance && chance <= random(100))
        return false;

    init_dungeon_levels(raw.levels, pd, dngidx);
    init_dungeon_branches(raw.branches, pd, dngidx);

    const dungeonFlags = get_dgn_flags(raw.flags);
    const dungeonAlign = get_dgn_align(raw.alignment);
    const tmpDungeon = pd.tmpdungeon[dngidx];
    Object.assign(tmpDungeon, {
        name: raw.name,
        protoname: raw.protofile ?? '',
        boneschar: raw.bonetag?.[0] ?? '',
        lev: { base: raw.base, rand: raw.range ?? 0 },
        flags: dungeonFlags,
        align: dungeonAlign,
        chance,
        entry_lev: raw.entry ?? 0,
    });

    const dungeon = {
        dname: raw.name,
        proto: raw.protofile ?? '',
        fill_lvl: raw.lvlfill ?? '',
        themerms: raw.themerooms ?? '',
        boneid: raw.bonetag?.[0] ?? '',
        entry_lev: 0,
        num_dunlevs: raw.range
            ? random(raw.range) + raw.base
            : raw.base,
        dunlev_ureached: dngidx === 0 ? 1 : 0,
        ledger_start: dngidx === 0
            ? 0
            : state.dungeons[dngidx - 1].ledger_start
                + state.dungeons[dngidx - 1].num_dunlevs,
        depth_start: dngidx === 0 ? 1 : 0,
        flags: {
            town: false,
            hellish: Boolean(dungeonFlags & HELLISH),
            maze_like: Boolean(dungeonFlags & MAZELIKE),
            rogue_like: Boolean(dungeonFlags & ROGUELIKE),
            // The recorder build uses a three-bit C bitfield. dungeon.c
            // assigns the loader's shifted alignment mask directly, which
            // truncates all configured values to zero.
            align: dungeonAlign & 0x07,
            unconnected: Boolean(dungeonFlags & UNCONNECTED),
        },
    };
    state.dungeons[dngidx] = dungeon;

    init_dungeon_set_entry(pd, dngidx, state);
    if (dungeon.flags.unconnected)
        dungeon.depth_start = 1;
    else if (dngidx)
        init_dungeon_set_depth(pd, dngidx, state, random);

    if (dungeon.num_dunlevs > MAXLEVEL)
        dungeon.num_dunlevs = MAXLEVEL;
    return true;
}

function init_castle_tune(state, random) {
    let tune = '';
    for (let index = 0; index < 5; ++index)
        tune += String.fromCharCode('A'.charCodeAt(0) + random(7));
    state.tune = tune;
    state.svt ??= {};
    state.svt.tune = tune;
}

export function find_level(name, state = game) {
    const foldedName = name.toLowerCase();
    return (state.specialLevels ?? []).find(
        (level) => level.proto.toLowerCase() === foldedName,
    ) ?? null;
}

function dname_to_dnum(name, state) {
    const foldedName = name.toLowerCase();
    const index = state.dungeons.findIndex(
        (dungeon) => dungeon.dname.toLowerCase() === foldedName,
    );
    if (index === -1)
        panic(`Couldn't resolve dungeon number for ${name}`);
    return index;
}

// C ref: youprop.h Blind (103) and Hallucination (116). Both are read once,
// by the same-level arm of u_on_newpos() below. Blindness is intrinsic or
// extrinsic unless an artifact blocks it; hallucination is solely an intrinsic
// timeout that either kind of resistance suppresses.
function heroBlind(state) {
    const blindness = state.u?.uprops?.[BLINDED];
    return Boolean((blindness?.intrinsic || blindness?.extrinsic)
        && !blindness?.blocked);
}

function heroHallucinating(state) {
    const halluc = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(halluc?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: dungeon.c u_on_newpos() (1567-1601). The one place that writes the
// hero's map position, and with it the ridden steed's, which always shares it.
export function u_on_newpos(
    x,
    y,
    state = game,
    { earthSenseMessage = null, preflightPosition = null } = {},
) {
    if (!isok(x, y))
        throw new RangeError(
            `u_on_newpos: hero location is off map <${x},${y}>`,
        );
    preflightPosition?.(x, y, state);

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
    } else if (!heroBlind(state)
        && !heroHallucinating(state)
        && !hero.uswallow) {
        // still on same level; might have come close enough to
        // generic object(s) to redisplay them as specific objects
        see_nearby_objects(state);
    }
    earth_sense(state, { message: earthSenseMessage });
}

// C ref: dungeon.c u_on_rndspot() (1604-1638). Live mode places the hero at a
// random spot in the arrival region a level change left behind. Planning mode
// repeats the same candidate selection with the supplied RNG and calls the
// required preflight without changing position or terrain.
//
// `upflag` packs two bits, as C's own `int up = (upflag & 1),
// was_in_W_tower = (upflag & 2)` shows.
//
// In live mode, hack.c switch_terrain() closes the function because the hero
// may have just left solid rock. Every arm of it needs terrain that blocks
// levitation or flight, or one of those properties already blocked; a hero
// arriving on a ROOM square with neither reaches only its terrainstatus tail.
export function u_on_rndspot(
    upflag,
    state = game,
    {
        earthSenseMessage = null,
        deferSwitchTerrain = false,
        preflightPosition = null,
        planPositionOnly = false,
        randomOneBased = null,
    } = {},
) {
    const up = (upflag & 1), was_in_W_tower = (upflag & 2);
    const dndest = state.dndest ?? {};
    const updest = state.updest ?? {};

    /*
     * Select a random location within the relevant region. Live placement
     * reaches u_on_newpos(); planPositionOnly reaches preflightPosition.
     * Unspecified region (.lx == 0) defaults to entire level.
     */
    if (was_in_W_tower && On_W_tower_level(state.u.uz, state))
        /* Stay inside the Wizard's tower when feasible. */
        place_lregion(dndest.nlx, dndest.nly, dndest.nhx, dndest.nhy,
                      0, 0, 0, 0, LR_DOWNTELE, null, state,
                      {
                          earthSenseMessage, preflightPosition,
                          planPositionOnly, randomOneBased,
                      });
    else if (up)
        place_lregion(updest.lx, updest.ly, updest.hx, updest.hy,
                      updest.nlx, updest.nly, updest.nhx, updest.nhy,
                      LR_UPTELE, null, state,
                      {
                          earthSenseMessage, preflightPosition,
                          planPositionOnly, randomOneBased,
                      });
    else
        place_lregion(dndest.lx, dndest.ly, dndest.hx, dndest.hy,
                      dndest.nlx, dndest.nly, dndest.nhx, dndest.nhy,
                      LR_DOWNTELE, null, state,
                      {
                          earthSenseMessage, preflightPosition,
                          planPositionOnly, randomOneBased,
                      });

    /* might have just left solid rock and unblocked levitation */
    if (!deferSwitchTerrain && !planPositionOnly) switch_terrain(state);
}

export class UnsupportedEarthSenseError extends Error {
    constructor(reason) {
        super(`unsupported earth sense: ${reason}`);
        this.name = 'UnsupportedEarthSenseError';
        this.reason = reason;
    }
}

// C ref: youprop.h Levitation (240) and Flying (253-255). Both are read once,
// by earth_sense() below. C's Flying carries a third term,
// `u.usteed && is_flyer(u.usteed->data)`, which earth_sense() cannot observe:
// its own `u.usteed` test returns one operand earlier.
function heroLevitating(state) {
    const levitation = state.u?.uprops?.[LEVITATION];
    return Boolean((levitation?.intrinsic || levitation?.extrinsic)
        && !levitation?.blocked);
}

function heroFlying(state) {
    const flying = state.u?.uprops?.[FLYING];
    return Boolean((flying?.intrinsic || flying?.extrinsic)
        && !flying?.blocked);
}

// C ref: dungeon.c earth_sense() (1543-1565). A dwarf standing on ROOM or
// CORR terrain senses a buried object at her square unless mounted, flying,
// levitating, or polymorphed. The placement helpers are synchronous, so an
// arrival caller supplies a message collector and prints the line at its
// source-ordered async point. Other movement callers retain the explicit
// boundary below until their message path is ported.
function earth_sense(state, { message = null } = {}) {
    const hero = state.u;
    if (state.urace?.mnum !== PM_DWARF) return;
    if (hero.usteed || heroFlying(state) || heroLevitating(state)
        || Upolyd(hero)) return;
    const typ = state.level?.at(hero.ux, hero.uy)?.typ;
    if (typ !== CORR && typ !== ROOM) return;

    for (let obj = state.level?.buriedobjlist ?? null; obj; obj = obj.nobj) {
        if (obj.ox === hero.ux && obj.oy === hero.uy) {
            if (message) {
                message('You sense something below your feet.');
                return;
            }
            throw new UnsupportedEarthSenseError(
                'the buried-object notice a dwarf feels underfoot',
            );
        }
    }
}


// C ref: dungeon.c dlev_in_current_branch() (2086-2093), the macro
// lev_by_name() uses twice. Its comment: within the same branch, or else main
// dungeon <-> Gehennom.
function dlev_in_current_branch(dlev, state) {
    const here = state.u.uz;
    return dlev.dnum === here.dnum
        || (here.dnum === state.valley_level?.dnum
            && dlev.dnum === state.medusa_level?.dnum)
        || (here.dnum === state.medusa_level?.dnum
            && dlev.dnum === state.valley_level?.dnum);
}

// C ref: dungeon.c lev_by_name() (2095-2170). Matches one word against a level
// the player can name, and answers its depth, or 0 for no match. teleport.c
// level_tele() asks it before falling back to atoi(), so a purely numeric
// answer runs the whole function and drops out with 0.
//
// C's first leg is find_mapseen_by_str(), which searches the player's own
// #annotate notes in the canonical mapseen chain.
export function lev_by_name(nam, state = game) {
    let lev = 0;
    let slev = null;
    let dlev = null;
    const mseen = find_mapseen_by_str(nam, state);

    if (mseen) dlev = mseen.lev;

    if (!mseen) {
        /* no matching annotation, check whether they used a name we know */
        /* allow strings like "the oracle level" to find "oracle" */
        if (nam.slice(0, 4).toLowerCase() === 'the ')
            nam = nam.slice(4);
        // C's `(p = strstri(nam, " level")) != 0 && p == eos(nam) - 6`
        // accepts the suffix only where it ends the string, and strstri()
        // answers the first occurrence, so "level level" keeps its second
        // word. The `>= 0` stands for C's NULL test: without it a five-
        // character name would match the no-match answer of -1 against its
        // own length minus six.
        const levelSuffix = strstri(nam, ' level');
        if (levelSuffix >= 0 && levelSuffix === nam.length - 6)
            nam = nam.slice(0, -6);
        /* hell is the old name, and wouldn't match; gehennom would match its
           branch, yielding the castle level instead of valley of the dead */
        if (nam.toLowerCase() === 'gehennom'
            || nam.toLowerCase() === 'hell') {
            nam = state.u.uz.dnum === state.tower_dnum
                ? " to Vlad's tower" /* branch to... */
                : 'valley';
        } else if (nam.toLowerCase() === 'delphi') {
            /* Oracle says "welcome to Delphi" so recognize that name too */
            nam = 'oracle';
        }

        slev = find_level(nam, state);
        if (slev) dlev = slev.dlevel;
    }

    if (mseen || slev) {
        const idx = ledger_no(dlev, state);
        if (dlev_in_current_branch(dlev, state)
            /* either wizard mode or else seen and not forgotten */
            && (state.wizard
                || (level_info(idx, state).flags & VISITED) === VISITED)) {
            lev = depth(dlev, state);
        }
    } else { /* not a specific level; try branch names */
        let idx = find_branch(nam, null, state);
        /* "<branch> to Xyzzy" */
        const p = strstri(nam, ' to ');
        if (idx < 0 && p >= 0)
            idx = find_branch(nam.slice(p + 4), null, state);

        if (idx >= 0) {
            const idxtoo = (idx >> 8) & 0x00FF;
            idx &= 0x00FF;
            /* either wizard mode, or else _both_ sides of branch seen */
            if (state.wizard
                || (((level_info(idx, state).flags & VISITED) === VISITED)
                    && ((level_info(idxtoo, state).flags & VISITED)
                        === VISITED))) {
                if (ledger_to_dnum(idxtoo, state) === state.u.uz.dnum)
                    idx = idxtoo;
                dlev = {
                    dnum: ledger_to_dnum(idx, state),
                    dlevel: ledger_to_dlev(idx, state),
                };
                if (dlev_in_current_branch(dlev, state))
                    lev = depth(dlev, state);
            }
        }
    }
    return lev;
}

// C ref: dungeon.c on_level(). Optional topology locations compare false when
// either operand is absent.
export function on_level(left, right) {
    return Boolean(left && right
        && left.dnum === right.dnum
        && left.dlevel === right.dlevel);
}

// C ref: dungeon.c Is_special(). The C chain and state.specialLevels are two
// views of the same topology; init_dungeons() links the array entries through
// `next` and stores its head in sp_levchn. Iterating the array also lets
// focused callers provide a minimal source-shaped topology without rebuilding
// that linked-list cache.
export function Is_special(level, state = game) {
    for (const special of state.specialLevels ?? []) {
        if (on_level(level, special.dlevel)) return special;
    }
    return null;
}

// C ref: dungeon.c Is_branchlev() (1464-1474). Return the branch record when
// either endpoint names the requested level, or null for an ordinary level.
export function Is_branchlev(level, state = game) {
    for (const branch of state.branches ?? []) {
        if (on_level(level, branch.end1) || on_level(level, branch.end2))
            return branch;
    }
    return null;
}

// C ref: dungeon.c Is_botlevel() (1643-1647). Dungeon level numbers are
// one-based, and num_dunlevs is the bottom level's number.
export function Is_botlevel(level, state = game) {
    return level.dlevel === state.dungeons[level.dnum].num_dunlevs;
}

// ---------------------------------------------------------------------------
// print_dungeon() and its helpers, ported for the bymenu=TRUE path only.
// C ref: dungeon.c unplaced_floater(), unreachable_level(), tport_menu(),
// br_string(), chr_u_on_lvl(), print_branch(), print_dungeon() (2174-2398).
// ---------------------------------------------------------------------------

// C ref: dungeon.c unplaced_floater() (2174-2187). Returns true when the
// dungeon at index `idx` is Fort Ludios and its branch parent is the sentinel
// n_dgns, meaning init_dungeons() did not place it.
function unplaced_floater(idx, state) {
    if (idx !== state.knox_level?.dnum) return false;
    for (let br = state.svb?.branches; br; br = br.next) {
        if (br.end1.dnum === state.n_dgns && br.end2.dnum === idx)
            return true;
    }
    return false;
}

// C ref: dungeon.c unreachable_level() (2189-2201). Decides whether a level
// should be shown but not selectable in the teleport menu.
function unreachable_level(lvl_p, unplaced, state) {
    if (unplaced) return true;
    // In_endgame spelled out against state, as has_ceiling() does.
    const inEndgame = state.u.uz.dnum === state.astral_level?.dnum;
    if (inEndgame && lvl_p.dnum !== state.astral_level?.dnum) return true;
    const dummy = find_level('dummy', state);
    if (dummy && on_level(lvl_p, dummy.dlevel)) return true;
    return false;
}

// C ref: dungeon.c tport_menu() (2203-2236). Pushes one level entry into the
// items array and the lchoices bookkeeping struct. An unreachable entry is
// displayed with four leading spaces in place of a menu selector.
function tport_menu(items, entry, lchoices, lvl_p, cannotreach, state) {
    lchoices.lev[lchoices.idx] = lvl_p.dlevel;
    lchoices.dgn[lchoices.idx] = lvl_p.dnum;
    lchoices.playerlev[lchoices.idx] = depth(lvl_p, state);
    if (cannotreach) {
        // Not selectable: prepend padding in place of missing selector.
        items.push({ text: `    ${entry}` });
    } else {
        items.push({
            selector: lchoices.menuletter,
            label: entry,
            value: lchoices.idx + 1,  // any.a_int = idx + 1
        });
    }
    // Advance the menu letter; C assumes at most 52 interesting levels.
    lchoices.menuletter = lchoices.menuletter === 'z'
        ? 'A'
        : String.fromCharCode(lchoices.menuletter.charCodeAt(0) + 1);
    lchoices.idx++;
}

// C ref: dungeon.c br_string() (2238-2253). Converts a branch type constant
// to a display string.
export function br_string(type) {
    switch (type) {
    case BR_PORTAL:   return 'Portal';
    case BR_NO_END1:  return 'Connection';
    case BR_NO_END2:  return 'One way stair';
    case BR_STAIR:    return 'Stair';
    }
    return ' (unknown)';
}

// C ref: dungeon.c chr_u_on_lvl() (2255-2259). Returns '*' if the hero is on
// the given level, ' ' otherwise.
function chr_u_on_lvl(dlev, state) {
    return (state.u.uz.dnum === dlev.dnum
        && state.u.uz.dlevel === dlev.dlevel) ? '*' : ' ';
}

// C ref: dungeon.c print_branch() (2261-2286). Pushes branch entries whose
// parent end (end1) falls between the lower and upper bounds in the given
// dungeon. Only the bymenu=TRUE arm is ported.
function print_branch(items, dnum, lower_bound, upper_bound, lchoices, state) {
    for (let br = state.svb?.branches; br; br = br.next) {
        if (br.end1.dnum === dnum && lower_bound < br.end1.dlevel
            && br.end1.dlevel <= upper_bound) {
            const buf = `${chr_u_on_lvl(br.end1, state)} ${br_string(br.type)}`
                + ` to ${state.dungeons[br.end2.dnum].dname}: `
                + `${depth(br.end1, state)}`;
            tport_menu(items, buf, lchoices, br.end1,
                unreachable_level(br.end1, false, state), state);
        }
    }
}

// C ref: dungeon.c print_dungeon() (2288-2398), bymenu=TRUE path only.
// Builds a PICK_ONE menu of all dungeon levels and branches, highlights
// dungeon headings with iflags.menu_headings, and returns { playerlev, dnum,
// dlevel } for the selected entry or null when the hero cancels.
//
// The bymenu=FALSE informational path uses putstr/NHW_TEXT and is not ported.
export async function print_dungeon(state = game) {
    const items = [];
    const lchoices = {
        lev: [],
        dgn: [],
        playerlev: [],
        menuletter: 'a',
        idx: 0,
    };

    for (let i = 0; i < state.n_dgns; i++) {
        const dptr = state.dungeons[i];
        // In_endgame spelled out against state.
        const inEndgame = state.u.uz.dnum === state.astral_level?.dnum;
        if (inEndgame && i !== state.astral_level?.dnum) continue;

        const isUnplaced = unplaced_floater(i, state);
        const descr = isUnplaced ? 'depth' : 'level';
        const nlev = dptr.num_dunlevs;
        let buf;
        if (nlev > 1) {
            buf = `${dptr.dname}: ${makeplural(descr)} ${dptr.depth_start}`
                + ` to ${dptr.depth_start + nlev - 1}`;
        } else {
            buf = `${dptr.dname}: ${descr} ${dptr.depth_start}`;
        }

        // Most entrances are uninteresting.
        if (dptr.entry_lev !== 1) {
            if (dptr.entry_lev === nlev) {
                buf += ', entrance from below';
            } else {
                buf += `, entrance on ${dptr.depth_start + dptr.entry_lev - 1}`;
            }
        }
        items.push(add_menu_heading(buf, state));

        // Circle through the special levels to find levels in this dungeon.
        let last_level = 0;
        for (let slev = state.sp_levchn; slev; slev = slev.next) {
            if (slev.dlevel.dnum !== i) continue;

            // Print any branches before this level.
            print_branch(items, i, last_level, slev.dlevel.dlevel,
                lchoices, state);

            let entry = `${chr_u_on_lvl(slev.dlevel, state)} ${slev.proto}: `
                + `${depth(slev.dlevel, state)}`;
            // Is_stronghold spelled out against state.
            if (on_level(slev.dlevel, state.stronghold_level)) {
                entry += ` (tune ${state.svt?.tune ?? state.tune ?? ''})`;
            }
            tport_menu(items, entry, lchoices, slev.dlevel,
                unreachable_level(slev.dlevel, isUnplaced, state), state);

            last_level = slev.dlevel.dlevel;
        }
        // Print branches after the last special level.
        print_branch(items, i, last_level, MAXLEVEL, lchoices, state);
    }

    state._captureMenuItems?.(items);
    const selected = await select_menu(state, {
        title: 'Level teleport to where:',
        items,
        how: PICK_ONE,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    });

    if (selected != null) {
        const idx = selected - 1;  // C: idx = selected[0].item.a_int - 1
        return {
            playerlev: lchoices.playerlev[idx],
            dlevel: lchoices.lev[idx],
            dnum: lchoices.dgn[idx],
        };
    }
    return null;
}

// C ref: dbridge.c db_under_typ() (115-128). A closed drawbridge remembers the
// terrain it spans in the DB_UNDER bits of its mask; both readers of that mask
// in this file go through here.
function db_under_typ(mask) {
    switch (mask & DB_UNDER) {
    case DB_ICE: return ICE;
    case DB_LAVA: return LAVAPOOL;
    case DB_MOAT: return MOAT;
    default: return STONE;
    }
}

// C ref: rm.h SURFACE_AT() (146-149). DRAWBRIDGE_UP is the square in front of a
// closed drawbridge rather than a surface, so it reports what lies beneath.
function surface_typ(location) {
    if (location?.typ !== DRAWBRIDGE_UP) return location?.typ;
    return db_under_typ(location.flags || location.drawbridgemask || 0);
}

// C ref: dungeon.c ceiling() (1713-1746). Names what is overhead at <x,y> for
// a message, the way surface() below names what is underfoot. Every arm is
// ported: unlike surface()'s engulfed arm, none of them needs mondata.c.
//
// The three room arms come first and win over every terrain test, so a shop or
// a temple keeps its own ceiling even on the levels the later arms rename. C
// reads the first character of the room-number string in_rooms() returns; the
// port's in_rooms() returns those numbers as an array, and every entry it can
// hold is at least ROOMOFFSET, so a non-empty array is the same answer.
//
// C reads `lev->typ` directly here rather than through SURFACE_AT(), which
// decides what a raised drawbridge answers. DRAWBRIDGE_UP is 19 (rm.h:75), so
// it is neither IS_DOOR(), which rm.h:121 defines as `typ == DOOR`, nor
// IS_WALL(), which rm.h:117 caps at DBWALL; it therefore falls past every arm
// of the disjunction below and answers "rock cavern". Reading it through
// SURFACE_AT() instead would substitute the terrain the bridge spans, and for
// three of the four under-types that changes nothing: dbridge.c db_under_typ()
// answers MOAT (17) for DB_MOAT, LAVAPOOL (20) for DB_LAVA and STONE (0) for
// DB_FLOOR, and all three fall past IS_ROOM, whose floor is ROOM (25). Only
// DB_ICE differs, because it answers ICE (33), which IS_ROOM admits and which
// would make this function say "ceiling". surface_typ() is deliberately not
// used, and DB_ICE is the case that decides it.
//
// Is_waterlevel(), Is_firelevel(), In_quest() and Is_earthlevel() are spelled
// out against `state` for the reason has_ceiling() gives above, and Underwater
// is youprop.h:279's whole macro, `u.uinwater`.
export function ceiling(x, y, state = game) {
    const location = state.level?.at(x, y);
    let what;

    /* other room types will no longer exist when we're interested --
     * see check_special_room()
     */
    if (in_rooms(x, y, VAULT, state).length)
        what = "vault's ceiling";
    else if (in_rooms(x, y, TEMPLE, state).length)
        what = "temple's ceiling";
    else if (in_rooms(x, y, SHOPBASE, state).length)
        what = "shop's ceiling";
    else if (on_level(state.u?.uz, state.water_level))
        /* water plane has no surface; its air bubbles aren't below sky */
        what = 'water above';
    else if (IS_AIR(location?.typ))
        what = 'sky';
    else if (on_level(state.u?.uz, state.fire_level))
        what = 'flames above';
    else if (state.u?.uz?.dnum === state.quest_dnum)
        /* just in case; try to avoid in caller if you can */
        what = 'expanse above';
    else if (state.u?.uinwater)
        what = "water's surface";
    else if ((IS_ROOM(location?.typ)
        && !on_level(state.u?.uz, state.earth_level))
        || IS_WALL(location?.typ) || IS_DOOR(location?.typ)
        || location?.typ === SDOOR)
        what = 'ceiling';
    else
        what = 'rock cavern';

    return what;
}

// C ref: dungeon.c surface() (1749-1788). Every arm but the first is ported.
// The engulfed arm needs mondata.c digests() and enfolds(), neither of which is
// ported. It cannot be raised: the only caller is invent.c look_here()'s
// admission in js/invent.js preflight_look_here(), which refuses u.uswallow
// before it asks. C reads is_animal(u.ustuck->data) as well, so this stop is
// wider than the branch it stands for and also covers a non-animal engulfer
// that C would answer with terrain.
//
// Is_waterlevel() and Is_earthlevel() are spelled out against `state` for the
// reason has_ceiling() gives above.
export function surface(x, y, state = game) {
    const location = state.level?.at(x, y);
    const levtyp = surface_typ(location);

    if (x === state.u?.ux && y === state.u?.uy && state.u?.uswallow)
        throw new Error('surface has no noun for an engulfer');
    else if (IS_AIR(levtyp))
        return on_level(state.u?.uz, state.water_level) ? 'air bubble'
            : (levtyp === CLOUD) ? 'cloud' : 'air';
    else if (is_pool(x, y, state))
        return (state.u?.uinwater
            && !on_level(state.u?.uz, state.water_level))
            ? 'bottom' : hliquid('water', { state });
    else if (is_ice(x, y, state))
        return 'ice';
    else if (is_lava(x, y, state))
        return hliquid('lava', { state });
    else if (location?.typ === DRAWBRIDGE_DOWN)
        return 'bridge';
    else if (IS_ALTAR(levtyp))
        return 'altar';
    else if (IS_GRAVE(levtyp))
        return 'headstone';
    else if (IS_FOUNTAIN(levtyp))
        return 'fountain';
    else if (On_stairs(x, y, state))
        return 'stairs';
    else if (IS_WALL(levtyp) || levtyp === SDOOR)
        return 'wall'; /* 'surface' during Passes_walls */
    else if (IS_DOOR(levtyp))
        return 'doorway'; /* even for closed door */
    else if (IS_ROOM(levtyp) && !on_level(state.u?.uz, state.earth_level))
        return 'floor';
    else
        return 'ground';
}

// C ref: dungeon.c update_lastseentyp(). The caller supplies canseemon()
// because dungeon topology does not own hero sensing.
export function update_lastseentyp(
    x,
    y,
    state = game,
    { canSeeMonster = () => false } = {},
) {
    const location = state.level?.at(x, y);
    if (!location) return STONE;
    let typ = surface_typ(location);
    const monster = state.level?.monsters?.[x]?.[y] ?? null;
    if (monster
        && (monster.m_ap_type & M_AP_TYPMASK) === M_AP_FURNITURE
        && canSeeMonster(monster)) {
        typ = cmap_to_type(monster.mappearance);
    }
    state.level.lastseentyp ??= Array.from(
        { length: COLNO },
        () => new Array(ROWNO).fill(STONE),
    );
    state.level.lastseentyp[x][y] = typ;
    return typ;
}

function emptyMapseenFeat() {
    return {
        nfount: 0,
        nsink: 0,
        naltar: 0,
        nthrone: 0,
        ngrave: 0,
        ntree: 0,
        water: 0,
        lava: 0,
        ice: 0,
        nshop: 0,
        ntemple: 0,
        msalign: 0,
        shoptype: 0,
    };
}

function emptyMapseenFlags() {
    return {
        notreachable: 0,
        forgot: 0,
        knownbones: 0,
        oracle: 0,
        sokosolved: 0,
        bigroom: 0,
        castle: 0,
        castletune: 0,
        valley: 0,
        msanctum: 0,
        ludios: 0,
        roguelevel: 0,
        quest_summons: 0,
        questing: 0,
        vibrating_square: 0,
        spare1: 0,
    };
}

// C ref: dungeon.c find_mapseen() (2638-2649).
export function find_mapseen(lev, state = game) {
    return state.svm?.mapseenchn?.find((entry) => on_level(entry.lev, lev))
        ?? null;
}

// C ref: dungeon.c find_mapseen_by_str() (2651-2663).
function find_mapseen_by_str(value, state = game) {
    const folded = value.toLowerCase();
    return state.svm?.mapseenchn?.find(
        (entry) => entry.custom?.toLowerCase() === folded,
    ) ?? null;
}

// C ref: dungeon.c init_mapseen() (2834-2872). An array represents C's linked
// list while preserving its sorted dungeon-and-level order.
export function init_mapseen(lev, state = game) {
    state.svm ??= {};
    state.svm.mapseenchn ??= [];
    const entry = {
        br: null,
        lev: { dnum: lev.dnum, dlevel: lev.dlevel },
        feat: emptyMapseenFeat(),
        flags: emptyMapseenFlags(),
        custom: null,
        custom_lth: 0,
        msrooms: Array.from(
            { length: (MAXNROFROOMS + 1) * 2 },
            () => ({ seen: 0, untended: 0 }),
        ),
        final_resting_place: null,
    };
    const after = state.svm.mapseenchn.findIndex((candidate) =>
        candidate.lev.dnum > entry.lev.dnum
        || (candidate.lev.dnum === entry.lev.dnum
            && candidate.lev.dlevel > entry.lev.dlevel));
    if (after < 0) state.svm.mapseenchn.push(entry);
    else state.svm.mapseenchn.splice(after, 0, entry);

    // C clears the separate live svl.lastseentyp grid for the destination.
    // The port's destination GameMap is newly allocated and starts clear;
    // mutating state.level here would instead erase the departing GameMap
    // that savelev() has already retained by reference.
    return entry;
}

function incrementMapseenFeature(feat, key) {
    if (feat[key] < 3) feat[key] += 1;
}

// C ref: pray.c altarmask_at() (2490-2504). The remembered ALTAR type can
// come from a visible furniture mimic even when the underlying terrain is not
// an altar, so alignment must follow the mimic's mcorpsenm overlay too.
function altarmask_at(x, y, state) {
    const monster = state.level?.monsters?.[x]?.[y] ?? null;
    if (monster
        && (monster.m_ap_type & M_AP_TYPMASK) === M_AP_FURNITURE
        && cmap_to_type(monster.mappearance) === ALTAR) {
        return has_mcorpsenm(monster) ? MCORPSENM(monster) : 0;
    }
    const location = state.level?.at(x, y);
    return IS_ALTAR(location?.typ)
        ? location.altarmask ?? location.flags ?? 0
        : 0;
}

function count_feat_lastseentyp(mapseen, x, y, state) {
    switch (state.level?.lastseentyp?.[x]?.[y] ?? STONE) {
    case TREE:
        incrementMapseenFeature(mapseen.feat, 'ntree');
        break;
    case FOUNTAIN:
        incrementMapseenFeature(mapseen.feat, 'nfount');
        break;
    case THRONE:
        incrementMapseenFeature(mapseen.feat, 'nthrone');
        break;
    case SINK:
        incrementMapseenFeature(mapseen.feat, 'nsink');
        break;
    case GRAVE:
        incrementMapseenFeature(mapseen.feat, 'ngrave');
        break;
    case ALTAR: {
        const location = state.level.at(x, y);
        const mask = altarmask_at(x, y, state);
        const astral = on_level(state.u?.uz, state.astral_level);
        const alignment = astral && (location?.seenv & SVALL) !== SVALL
            ? MSA_NONE
            : (mask & AM_MASK) === 4 ? 3 : mask & AM_MASK;
        if (!mapseen.feat.naltar) mapseen.feat.msalign = alignment;
        else if (mapseen.feat.msalign !== alignment)
            mapseen.feat.msalign = MSA_NONE;
        incrementMapseenFeature(mapseen.feat, 'naltar');
        break;
    }
    default:
        break;
    }
}

// C ref: dungeon.c recalc_mapseen() (3073-3261), through the ordinary-level
// room and remembered-feature branches used by magic mapping. Special-level
// annotations, unattended shop ownership, and bones records remain outside
// the current ordinary-level boundary.
export function recalc_mapseen(state = game) {
    const mapseen = find_mapseen(state.u?.uz, state);
    if (!mapseen) return;

    mapseen.feat = emptyMapseenFeat();
    mapseen.flags.notreachable = 0;
    mapseen.flags.knownbones = 0;
    mapseen.flags.oracle = 0;
    mapseen.flags.castletune = 0;
    mapseen.flags.forgot = 0;

    for (const roomno of state.u?.urooms ?? []) {
        if (!roomno) break;
        const roomIndex = roomno - ROOMOFFSET;
        if (mapseen.msrooms[roomIndex]) mapseen.msrooms[roomIndex].seen = 1;
    }

    for (let roomIndex = 0; roomIndex < mapseen.msrooms.length; ++roomIndex) {
        if (!mapseen.msrooms[roomIndex].seen) continue;
        const room = state.level?.rooms?.[roomIndex];
        if (!room) continue;
        if (room.rtype >= SHOPBASE) {
            if (mapseen.msrooms[roomIndex].untended)
                mapseen.feat.shoptype = SHOPBASE - 1;
            else if (!mapseen.feat.nshop)
                mapseen.feat.shoptype = room.rtype;
            else if (mapseen.feat.shoptype !== room.rtype)
                mapseen.feat.shoptype = 0;
            incrementMapseenFeature(mapseen.feat, 'nshop');
        } else if (room.rtype === TEMPLE) {
            incrementMapseenFeature(mapseen.feat, 'ntemple');
        } else if (room.orig_rtype === DELPHI) {
            mapseen.flags.oracle = 1;
        }
    }

    if (!heroLevitating(state))
        update_lastseentyp(state.u.ux, state.u.uy, state);
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y)
            count_feat_lastseentyp(mapseen, x, y, state);
    }
}

// C ref: dungeon.c room_discovered() (3282-3290).
export function room_discovered(roomno, state = game) {
    const mapseen = find_mapseen(state.u?.uz, state);
    const room = mapseen?.msrooms?.[roomno];
    if (room && !room.seen) {
        room.seen = 1;
        recalc_mapseen(state);
    }
}

// C ref: dungeon.c update_mapseen_for() (2942-2947).
export function update_mapseen_for(x, y, state = game) {
    recalc_mapseen(state);
    return state.level?.lastseentyp?.[x]?.[y] ?? STONE;
}

// C ref: dungeon.c induced_align(). Special-level and dungeon alignment masks
// each get their own short-circuiting percentage check before the fallback.
export function induced_align(pct, state = game, random = rn2) {
    const current = state.u?.uz;
    const special = (state.specialLevels ?? []).find(
        (level) => on_level(level.dlevel, current),
    );
    const specialAlignment = special?.flags?.align ?? 0;
    if (specialAlignment && random(100) < pct) return specialAlignment;

    const dungeonAlignment = state.dungeons?.[current?.dnum]?.flags?.align ?? 0;
    if (dungeonAlignment && random(100) < pct) return dungeonAlignment;

    return Align2amask(random(3) - 1);
}

export function fixup_level_locations(state, roleFilecode) {
    const topology = {};
    for (const [, target] of LEVEL_MAP) {
        const location = { dnum: 0, dlevel: 0 };
        topology[`d_${target}`] = location;
        // C aliases each macro (for example, bigroom_level) to its zeroed
        // dungeon_topology field even when the optional level is absent.
        state[target] = location;
    }

    for (const [name, target] of LEVEL_MAP) {
        const special = find_level(name, state);
        if (!special)
            continue;

        const location = { ...special.dlevel };
        topology[`d_${target}`] = location;
        state[target] = location;
        if (name.startsWith('x-')) {
            special.proto = `${roleFilecode}${name.slice(1)}`;
        } else if (target === 'knox_level') {
            const branch = state.branches.find(
                (candidate) => on_level(candidate.end2, location),
            );
            if (branch) {
                branch.end1.dnum = state.n_dgns;
                insert_branch(branch, true, state);
            }
        }
    }

    const dungeonNumbers = [
        ['quest_dnum', 'The Quest'],
        ['sokoban_dnum', 'Sokoban'],
        ['mines_dnum', 'The Gnomish Mines'],
        ['tower_dnum', "Vlad's Tower"],
        ['tutorial_dnum', 'The Tutorial'],
    ];
    for (const [target, name] of dungeonNumbers) {
        const value = dname_to_dnum(name, state);
        topology[`d_${target}`] = value;
        state[target] = value;
    }

    const dummy = find_level('dummy', state);
    if (dummy) {
        const dungeon = state.dungeons[dummy.dlevel.dnum];
        if (dungeon.num_dunlevs > 1 - dungeon.depth_start)
            --dungeon.depth_start;
    }
    state.dungeon_topology = topology;
}

function init_private_lua(random) {
    // C ref: nhlua.c nhl_init() loads nhlib.lua before dungeon.lua. The
    // private state's global align table is shuffled even though dungeon.lua
    // does not use the resulting order, then that Lua state is discarded.
    const align = ['law', 'neutral', 'chaos'];
    for (let index = align.length; index > 1; --index) {
        const selected = random(index);
        [align[index - 1], align[selected]] = [align[selected], align[index - 1]];
    }
}

// Initialize all dungeon, special-level, branch, ledger, depth, and topology
// state. The caller must run role_init first so the quest filecode is known.
export function init_dungeons(
    state = game,
    random = rn2,
    {
        wizard = Boolean(state.flags?.debug),
        roleFilecode = state.urole?.filecode,
    } = {},
) {
    if (typeof roleFilecode !== 'string' || roleFilecode.length === 0) {
        panic('init_dungeons requires state.urole.filecode from role_init');
    }

    init_private_lua(random);

    const pd = {
        tmpdungeon: [],
        tmplevel: [],
        final_lev: [],
        tmpbranch: [],
        start: 0,
        n_levs: 0,
        n_brs: 0,
        branch_id: 0,
    };
    state.dungeons = [];
    state.specialLevels = [];
    state.sp_levchn = null;
    state.branches = [];
    state.n_dgns = DUNGEON_DATA.length;

    let dngidx = 0;
    let initializedLevelCount = 0;
    for (const rawDungeon of DUNGEON_DATA) {
        if (!init_dungeon_dungeons(
            rawDungeon,
            pd,
            dngidx,
            state,
            wizard,
            random,
        )) {
            --state.n_dgns;
            continue;
        }

        for (; initializedLevelCount < pd.n_levs; ++initializedLevelCount) {
            init_level(
                dngidx,
                initializedLevelCount,
                pd,
                wizard,
                random,
            );
        }
        if (!place_level(pd.start, pd, state, random))
            panic("init_dungeon: couldn't place levels");
        for (; pd.start < pd.n_levs; ++pd.start) {
            if (pd.final_lev[pd.start])
                add_level(pd.final_lev[pd.start], state);
        }
        ++dngidx;
    }

    init_castle_tune(state, random);
    fixup_level_locations(state, roleFilecode);
    return state;
}
