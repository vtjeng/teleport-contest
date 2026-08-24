// Room-topology projections and the special room one level may receive.
// C refs: mkroom.c cmap_to_type(), isbig(), do_mkroom(), mkshop(),
// pick_room(), mkzoo(), fill_zoo(), courtmon(), has_dnstairs(),
// has_upstairs() and invalid_shop_shape().

import {
    AIR,
    ALTAR,
    BEEHIVE,
    BLCORNER,
    BRCORNER,
    CLOUD,
    CORR,
    COURT,
    CROSSWALL,
    DBWALL,
    DOOR,
    DRAWBRIDGE_DOWN,
    FILL_NORMAL,
    FOUNTAIN,
    GRAVE,
    HWALL,
    ICE,
    IRONBARS,
    LADDER,
    LAVAPOOL,
    LAVAWALL,
    OROOM,
    POOL,
    ROOM,
    ROOMOFFSET,
    SHOPBASE,
    SINK,
    STAIRS,
    STONE,
    TDWALL,
    THRONE,
    TLCORNER,
    TLWALL,
    TREE,
    TRCORNER,
    TRWALL,
    TUWALL,
    VWALL,
    WATER,
    MM_ASLEEP,
    MM_NOGRP,
    SPACE_POS,
} from './const.js';
import { level_difficulty } from './dungeon.js';
import { game } from './gstate.js';
import { add_to_container } from './invent.js';
import { occupied, somexyspace, topologize } from './mklev.js';
import { makemon, mongets } from './makemon_create.js';
import { mkclass, set_malign } from './makemon.js';
import {
    PM_BUGBEAR,
    PM_DWARF_RULER,
    PM_ELVEN_MONARCH,
    PM_GNOME_RULER,
    PM_HOBGOBLIN,
    PM_KILLER_BEE,
    PM_OGRE_TYRANT,
    PM_QUEEN_BEE,
    S_CENTAUR,
    S_DRAGON,
    S_GIANT,
    S_GNOME,
    S_KOBOLD,
    S_ORC,
    S_TROLL,
} from './monsters.js';
import {
    CHEST,
    GOLD_PIECE,
    LUMP_OF_ROYAL_JELLY,
    MACE,
    SPBOOK_CLASS,
    WAND_CLASS,
} from './objects.js';
import { mksobj, mksobj_at, weight } from './obj.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { inside_room } from './room_coordinates.js';
import { SHTYPES } from './shtypes_data.js';
import {
    S_air,
    S_altar,
    S_bars,
    S_blcorn,
    S_brcorn,
    S_cloud,
    S_corr,
    S_crwall,
    S_darkroom,
    S_dnladder,
    S_dnstair,
    S_fountain,
    S_grave,
    S_hcdoor,
    S_hcdbridge,
    S_hodbridge,
    S_hodoor,
    S_hwall,
    S_ice,
    S_lava,
    S_lavawall,
    S_litcorr,
    S_ndoor,
    S_pool,
    S_room,
    S_sink,
    S_stone,
    S_tdwall,
    S_throne,
    S_tlcorn,
    S_tlwall,
    S_tree,
    S_trcorn,
    S_trwall,
    S_tuwall,
    S_upladder,
    S_upstair,
    S_vcdoor,
    S_vcdbridge,
    S_vodbridge,
    S_vodoor,
    S_vwall,
    S_water,
} from './symbols.js';

const SOURCE_RANDOM = Object.freeze({ d, rn1, rn2, rnd, rne, rnz });

export function cmap_to_type(symbol) {
    switch (symbol) {
    case S_vwall: return VWALL;
    case S_hwall: return HWALL;
    case S_tlcorn: return TLCORNER;
    case S_trcorn: return TRCORNER;
    case S_blcorn: return BLCORNER;
    case S_brcorn: return BRCORNER;
    case S_crwall: return CROSSWALL;
    case S_tuwall: return TUWALL;
    case S_tdwall: return TDWALL;
    case S_tlwall: return TLWALL;
    case S_trwall: return TRWALL;
    case S_ndoor:
    case S_vodoor:
    case S_hodoor:
    case S_vcdoor:
    case S_hcdoor:
        return DOOR;
    case S_bars: return IRONBARS;
    case S_tree: return TREE;
    case S_room:
    case S_darkroom:
        return ROOM;
    case S_corr:
    case S_litcorr:
        return CORR;
    case S_upstair:
    case S_dnstair:
        return STAIRS;
    case S_upladder:
    case S_dnladder:
        return LADDER;
    case S_altar: return ALTAR;
    case S_grave: return GRAVE;
    case S_throne: return THRONE;
    case S_sink: return SINK;
    case S_fountain: return FOUNTAIN;
    case S_pool: return POOL;
    case S_ice: return ICE;
    case S_lava: return LAVAPOOL;
    case S_vodbridge:
    case S_hodbridge:
        return DRAWBRIDGE_DOWN;
    case S_vcdbridge:
    case S_hcdbridge:
        return DBWALL;
    case S_air: return AIR;
    case S_cloud: return CLOUD;
    case S_water: return WATER;
    case S_lavawall: return LAVAWALL;
    case S_stone:
    default:
        return STONE;
    }
}

// A special room this port cannot build yet.
export class UnsupportedSpecialRoomError extends Error {
    constructor(reason) {
        super(`unsupported special room: ${reason}`);
        this.name = 'UnsupportedSpecialRoomError';
        this.reason = reason;
    }
}

// C ref: mkroom.c isbig(). A room of more than twenty squares.
export function isbig(sroom) {
    const area = (sroom.hx - sroom.lx + 1) * (sroom.hy - sroom.ly + 1);
    return area > 20;
}

// C ref: mkroom.c has_dnstairs().
export function has_dnstairs(sroom, state = game) {
    for (let stway = state.stairs; stway; stway = stway.next)
        if (!stway.up && inside_room(sroom, stway.sx, stway.sy, state))
            return true;
    return false;
}

// C ref: mkroom.c has_upstairs().
export function has_upstairs(sroom, state = game) {
    for (let stway = state.stairs; stway; stway = stway.next)
        if (stway.up && inside_room(sroom, stway.sx, stway.sy, state))
            return true;
    return false;
}

// C ref: mkroom.c invalid_shop_shape(). A shopkeeper standing just inside the
// door needs somewhere else to step; a room that leaves it only one square is
// rejected as a shop.
export function invalid_shop_shape(sroom, state = game) {
    const door = state.level.doors[sroom.fdoor];
    const doorx = door.x;
    const doory = door.y;
    let insidex = 0;
    let insidey = 0;
    let insidect = 0;

    for (let x = Math.max(doorx - 1, sroom.lx);
        x <= Math.min(doorx + 1, sroom.hx); ++x) {
        for (let y = Math.max(doory - 1, sroom.ly);
            y <= Math.min(doory + 1, sroom.hy); ++y) {
            if (state.level.at(x, y)?.typ === ROOM) {
                insidex = x;
                insidey = y;
                ++insidect;
            }
        }
    }
    if (insidect < 1) {
        // C's impossible() answers TRUE and carries on.
        throw new Error('invalid_shop_shape: no squares inside door?');
    }
    // More than one square beside the door already gives the shopkeeper room
    // to move, so no further check is needed.
    if (insidect === 1) {
        insidect = 0;
        for (let x = Math.max(insidex - 1, sroom.lx);
            x <= Math.min(insidex + 1, sroom.hx); ++x) {
            for (let y = Math.max(insidey - 1, sroom.ly);
                y <= Math.min(insidey + 1, sroom.hy); ++y) {
                if (x === insidex && y === insidey) continue;
                if (state.level.at(x, y)?.typ === ROOM) ++insidect;
            }
        }
        if (insidect === 1) return true;
    }
    return false;
}

// C ref: mkroom.c mkshop(). The room search draws no random number: it walks
// the level's rooms in order and takes the first ordinary one that holds no
// staircase, has exactly one door, and leaves the shopkeeper somewhere to
// stand. C returns when no room qualifies, and the level gets no shop.
//
// After the search, the only random number mkshop() draws is the single
// rnd(100) that picks the shop type. The room is not stocked here: mkshop()
// marks it FILL_NORMAL and makelevel()'s tail calls fill_special_room(), which
// reaches js/shknam.js stock_room().
//
// C's wizard-mode SHOPTYPE arm above the search is unreachable: the port never
// sets wizard mode, and game code may not read the environment. That arm is
// also the only way `i` reaches the type roll already set, so the roll's
// `if (i < 0)` guard is always true here.
function mkshop(state, random) {
    let sroom = null;
    for (let index = 0; index < state.level.nroom; ++index) {
        const candidate = state.level.rooms[index];
        if (!candidate || candidate.hx < 0) return;
        if (candidate.rtype !== OROOM) continue;
        if (has_dnstairs(candidate, state) || has_upstairs(candidate, state))
            continue;
        if (candidate.doorct === 1) {
            if (invalid_shop_shape(candidate, state)) continue;
            sroom = candidate;
            break;
        }
    }
    if (!sroom) return;

    // A dark shop is lit, along with the one-cell border that holds its walls
    // and its door, so the hero sees the stock from the doorway.
    if (!sroom.rlit) {
        for (let x = sroom.lx - 1; x <= sroom.hx + 1; x++)
            for (let y = sroom.ly - 1; y <= sroom.hy + 1; y++) {
                const loc = state.level.at(x, y);
                if (loc) loc.lit = 1;
            }
        sroom.rlit = 1;
    }

    // C: for (j = rnd(100), i = 0; (j -= shtypes[i].prob) > 0; i++). One draw
    // whatever the outcome, so an off-by-one here shifts every shop type
    // without changing the random-number log.
    let j = random.rnd(100);
    let i = 0;
    while ((j -= SHTYPES[i].prob) > 0) i++;

    // A big room cannot be a wand or spellbook shop, because those two stock
    // too much value for a room this size; C makes it a general store instead.
    if (isbig(sroom)
        && (SHTYPES[i].symb === WAND_CLASS
            || SHTYPES[i].symb === SPBOOK_CLASS)) {
        i = 0;
    }
    sroom.rtype = SHOPBASE + i;

    // Set the room's squares before it is stocked.
    topologize(sroom, state);

    sroom.needfill = FILL_NORMAL;
}

// C ref: mkroom.c pick_room(). Zoo-family rooms prefer a one-door ordinary
// room, may use the down-stair room one time in three, and never use the
// up-stair room. The non-strict form is the one mkzoo() calls.
export function pick_room(strict, state = game, random = SOURCE_RANDOM) {
    let index = random.rn2(state.level.nroom);
    for (let remaining = state.level.nroom; remaining-- > 0;) {
        const sroom = state.level.rooms[index];
        index = (index + 1) % state.level.nroom;
        if (!sroom || sroom.hx < 0) return null;
        if (sroom.rtype !== OROOM) continue;
        if (!strict) {
            if (has_upstairs(sroom, state)
                || (has_dnstairs(sroom, state) && random.rn2(3))) continue;
        } else if (has_upstairs(sroom, state) || has_dnstairs(sroom, state)) {
            continue;
        }
        // rn2(5) is evaluated even for a wizard; C's `|| wizard` is last.
        if (sroom.doorct === 1 || !random.rn2(5) || state.wizard)
            return sroom;
    }
    return null;
}

function mkzoo(type, state, random) {
    const sroom = pick_room(false, state, random);
    if (!sroom) return;
    sroom.rtype = type;
    sroom.needfill = FILL_NORMAL;
}

// C ref: mkroom.c courtmon(). D:5 can reach the kobold, gnome, hobgoblin,
// bugbear and orc outcomes; the higher thresholds remain source-complete for
// callers that exercise this pure selector at a deeper difficulty.
export function courtmon(state = game, random = SOURCE_RANDOM) {
    const i = random.rn2(60) + random.rn2(3 * level_difficulty(state));
    if (i > 100) return mkclass(S_DRAGON, 0, { state, random });
    if (i > 95) return mkclass(S_GIANT, 0, { state, random });
    if (i > 85) return mkclass(S_TROLL, 0, { state, random });
    if (i > 75) return mkclass(S_CENTAUR, 0, { state, random });
    if (i > 60) return mkclass(S_ORC, 0, { state, random });
    if (i > 45) return state.mons[PM_BUGBEAR];
    if (i > 30) return state.mons[PM_HOBGOBLIN];
    if (i > 15) return mkclass(S_GNOME, 0, { state, random });
    return mkclass(S_KOBOLD, 0, { state, random });
}

function mk_zoo_thronemon(x, y, normalized) {
    const { random, state } = normalized;
    const roll = random.rnd(level_difficulty(state));
    const species = state.mons[
        roll > 9 ? PM_OGRE_TYRANT
            : roll > 5 ? PM_ELVEN_MONARCH
                : roll > 2 ? PM_DWARF_RULER : PM_GNOME_RULER
    ];
    const monster = makemon(species, x, y, 0, normalized);
    if (!monster) return null;
    monster.msleeping = true;
    monster.mpeaceful = false;
    set_malign(monster, state);
    mongets(monster, MACE, normalized);
    return monster;
}

export function courtCellIsFillable(sroom, x, y, state) {
    const roomno = (sroom.roomnoidx ?? state.level.rooms.indexOf(sroom))
        + ROOMOFFSET;
    if (sroom.irregular) {
        const location = state.level.at(x, y);
        if (!location || location.roomno !== roomno || location.edge)
            return false;
        if (!sroom.doorct) return true;
        const door = state.level.doors[sroom.fdoor];
        return Math.max(Math.abs(x - door.x), Math.abs(y - door.y)) > 1;
    }
    const location = state.level.at(x, y);
    if (!location || !SPACE_POS(location.typ)) return false;
    if (!sroom.doorct) return true;
    const door = state.level.doors[sroom.fdoor];
    return !((x === sroom.lx && door.x === x - 1)
        || (x === sroom.hx && door.x === x + 1)
        || (y === sroom.ly && door.y === y - 1)
        || (y === sroom.hy && door.y === y + 1));
}

// C ref: mkroom.c fill_zoo(). The COURT and BEEHIVE arms are ported;
// remaining zoo families retain their named generation boundary.
export function fill_zoo(sroom, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? SOURCE_RANDOM;
    const normalized = { ...env, state, random };
    const type = sroom.rtype;
    if (type !== COURT && type !== BEEHIVE) {
        throw new UnsupportedSpecialRoomError(
            `fill_zoo(${type}) beyond the Beehive boundary`,
        );
    }

    // C ref: fill_zoo() lines 288-321 — pre-loop, type-specific setup.
    // tx/ty hold the throne position (COURT) or the queen-bee center (BEEHIVE).
    let tx = 0;
    let ty = 0;
    if (type === COURT) {
        const throne = { x: 0, y: 0 };
        let remaining = 100;
        do {
            somexyspace(sroom, throne, normalized);
        } while (occupied(throne.x, throne.y, state) && --remaining > 0);
        tx = throne.x;
        ty = throne.y;
        mk_zoo_thronemon(tx, ty, normalized);
    } else if (type === BEEHIVE) {
        // C ref: fill_zoo() lines 305-316. Center of the room; irregular rooms
        // relocate the queen when the center is outside the room.
        tx = sroom.lx + Math.trunc((sroom.hx - sroom.lx + 1) / 2);
        ty = sroom.ly + Math.trunc((sroom.hy - sroom.ly + 1) / 2);
        if (sroom.irregular) {
            const rmno = (sroom.roomnoidx
                ?? state.level.rooms.indexOf(sroom)) + ROOMOFFSET;
            const loc = state.level.at(tx, ty);
            if (!loc || loc.roomno !== rmno || loc.edge) {
                const mm = { x: 0, y: 0 };
                somexyspace(sroom, mm, normalized);
                tx = mm.x;
                ty = mm.y;
            }
        }
    }

    // C ref: fill_zoo() lines 323-419 — per-cell loop shared across zoo types.
    for (let x = sroom.lx; x <= sroom.hx; ++x) {
        for (let y = sroom.ly; y <= sroom.hy; ++y) {
            if (!courtCellIsFillable(sroom, x, y, state)) continue;
            // C ref: line 342 — skip an explicitly placed throne (COURT only).
            if (type === COURT && state.level.at(x, y).typ === THRONE) continue;

            // C ref: lines 344-361 — type-specific monster selection.
            const species = type === COURT
                ? courtmon(state, random)
                : (x === tx && y === ty
                    ? state.mons[PM_QUEEN_BEE]
                    : state.mons[PM_KILLER_BEE]);
            const monster = makemon(
                species,
                x,
                y,
                MM_ASLEEP | MM_NOGRP,
                normalized,
            );
            if (monster && type === COURT && monster.mpeaceful) {
                monster.mpeaceful = false;
                set_malign(monster, state);
            }

            // C ref: lines 369-418 — type-specific post-monster items.
            if (type === BEEHIVE && !random.rn2(3)) {
                mksobj_at(LUMP_OF_ROYAL_JELLY, x, y, true, false, normalized);
            }
        }
    }

    // C ref: fill_zoo() lines 420-451 — post-loop, type-specific finalization.
    if (type === COURT) {
        state.level.at(tx, ty).typ = THRONE;
        const coffers = { x: 0, y: 0 };
        somexyspace(sroom, coffers, normalized);
        const gold = mksobj(GOLD_PIECE, true, false, normalized);
        gold.quan = random.rn1(50 * level_difficulty(state), 10);
        gold.owt = weight(gold, normalized);
        const chest = mksobj_at(
            CHEST,
            coffers.x,
            coffers.y,
            true,
            false,
            normalized,
        );
        add_to_container(chest, gold, normalized);
        chest.owt = weight(chest, normalized);
        chest.spe = 2;
        state.level.flags.has_court = true;
    } else if (type === BEEHIVE) {
        state.level.flags.has_beehive = true;
    }
}

// C ref: mkroom.c do_mkroom(). mklev.c makelevel() calls it at most once per
// level, with the type its depth selects.
//
// The ordinary boundary reaches shops, COURT, and BEEHIVE. Later zoo
// families, swamps, and temples stay named refusals until their complete
// population and entry effects are selected.
export function do_mkroom(roomtype, state = game, random = SOURCE_RANDOM) {
    if (roomtype >= SHOPBASE) {
        mkshop(state, random);
        return;
    }
    if (roomtype === COURT || roomtype === BEEHIVE) {
        mkzoo(roomtype, state, random);
        return;
    }
    throw new UnsupportedSpecialRoomError(`do_mkroom(${roomtype})`);
}
