// Room-topology projections and the special room one level may receive.
// C refs: mkroom.c cmap_to_type(), isbig(), do_mkroom(), mkshop(),
// has_dnstairs(), has_upstairs() and invalid_shop_shape().

import {
    AIR,
    ALTAR,
    BLCORNER,
    BRCORNER,
    CLOUD,
    CORR,
    CROSSWALL,
    DBWALL,
    DOOR,
    DRAWBRIDGE_DOWN,
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
} from './const.js';
import { game } from './gstate.js';
import { inside_room } from './room_coordinates.js';
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

// C ref: mkroom.c mkshop(), through its room search. The search draws no
// random number: it walks the level's rooms in order and takes the first
// ordinary one that holds no staircase, has exactly one door, and leaves the
// shopkeeper somewhere to stand.
//
// Everything after that search stops. C lights the room, rolls the shop type
// from shtypes[] with rnd(100), sets rtype and marks the room for filling,
// after which stock_room() populates it and shkinit() creates its keeper. The
// port stocks only the two themed "twin business" shop types that
// dat/themerms.lua asks for by name; a shop chosen from the whole shtypes[]
// table, and the shopkeeper that comes with it, are the shop work.
//
// C's wizard-mode SHOPTYPE arm above the search is unreachable: the port never
// sets wizard mode, and game code may not read the environment.
function mkshop(state) {
    for (let index = 0; index < state.level.nroom; ++index) {
        const sroom = state.level.rooms[index];
        if (!sroom || sroom.hx < 0) return;
        if (sroom.rtype !== OROOM) continue;
        if (has_dnstairs(sroom, state) || has_upstairs(sroom, state)) continue;
        if (sroom.doorct === 1) {
            if (invalid_shop_shape(sroom, state)) continue;
            throw new UnsupportedSpecialRoomError(
                `mkshop() choosing a shop for room ${index}`,
            );
        }
    }
}

// C ref: mkroom.c do_mkroom(). mklev.c makelevel() calls it at most once per
// level, with the type its depth selects.
//
// Only the shop arm has a caller the port reaches: makelevel()'s chain tests
// the shop first and every other room type needs a depth greater than four.
// mkzoo(), mkswamp() and mktemple() populate their rooms with monsters,
// fountains, an altar and a priest, none of which is ported.
export function do_mkroom(roomtype, state = game) {
    if (roomtype >= SHOPBASE) {
        mkshop(state);
        return;
    }
    throw new UnsupportedSpecialRoomError(`do_mkroom(${roomtype})`);
}
