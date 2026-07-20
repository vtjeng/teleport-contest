// Dungeon topology initialization.
// C ref: src/dungeon.c init_dungeons() and its loader/placement helpers.
// Data ref: dat/dungeon.lua, translated in dungeon_data.js.

import { game } from './gstate.js';
import { rn2 } from './rng.js';
import { DUNGEON_DATA } from './dungeon_data.js';

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

function find_branch(name, pd) {
    for (let index = 0; index < pd.n_brs; ++index) {
        if (pd.tmpbranch[index].name === name)
            return index;
    }
    panic(`find_branch: can't find ${name}`);
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

export function depth(level, state = game) {
    return state.dungeons[level.dnum].depth_start + level.dlevel - 1;
}

export function ledger_no(level, state = game) {
    return level.dlevel + state.dungeons[level.dnum].ledger_start;
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

function same_level(left, right) {
    return left.dnum === right.dnum && left.dlevel === right.dlevel;
}

function fixup_level_locations(state, roleFilecode) {
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
                (candidate) => same_level(candidate.end2, location),
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
