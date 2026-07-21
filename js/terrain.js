// Terrain mutation helpers.
// C refs: mkmaze.c set_levltyp(); mklev.c count_level_features();
// dbridge.c is_ice().

import {
    AIR,
    COLNO,
    DB_ICE,
    DB_UNDER,
    DRAWBRIDGE_UP,
    FOUNTAIN,
    ICE,
    IS_LAVA,
    LADDER,
    MAX_TYPE,
    MELT_ICE_AWAY,
    ROWNO,
    SDOOR,
    SINK,
    STAIRS,
    STONE,
    isok,
} from './const.js';
import { game } from './gstate.js';

export class UnsupportedTerrainTransitionError extends Error {
    constructor(operation) {
        super(`set_levltyp requires ${operation} when removing ice`);
        this.name = 'UnsupportedTerrainTransitionError';
        this.operation = operation;
    }
}

export function is_ice(x, y, state = game) {
    if (!isok(x, y)) return false;
    const location = state.level?.at(x, y);
    return location?.typ === ICE
        || (location?.typ === DRAWBRIDGE_UP
            && ((location.flags ?? 0) & DB_UNDER) === DB_ICE);
}

export function count_level_features(state = game) {
    const level = state.level;
    if (!level?.flags) return;
    let fountains = 0;
    let sinks = 0;
    for (let y = 0; y < ROWNO; ++y) {
        for (let x = 1; x < COLNO; ++x) {
            const typ = level.at(x, y)?.typ;
            if (typ === FOUNTAIN) ++fountains;
            else if (typ === SINK) ++sinks;
        }
    }
    level.flags.nfountains = fountains;
    level.flags.nsinks = sinks;
}

export function set_levltyp(x, y, newtyp, rawEnv = {}) {
    const env = { ...rawEnv, state: rawEnv.state ?? game };
    const { state } = env;
    if (!isok(x, y)
        || !Number.isInteger(newtyp)
        || newtyp < STONE
        || newtyp >= MAX_TYPE) return false;
    const location = state.level?.at(x, y);
    if (!location) return false;
    const oldtyp = location.typ;

    // arboreal_sdoor aliases struct rm's candig bit in rm.h.
    if (oldtyp === SDOOR && newtyp === AIR) {
        location.candig = true;
        return true;
    }
    if (!state.iflags?.debug_overwrite_stairs
        && (oldtyp === LADDER || oldtyp === STAIRS)) return false;

    const wasIce = is_ice(x, y, state);
    const removingIce = wasIce && newtyp !== ICE;
    const objIceEffects = env.objIceEffects ?? env.hooks?.objIceEffects;
    const spotStopTimers = env.spotStopTimers ?? env.hooks?.spotStopTimers;
    if (removingIce && typeof objIceEffects !== 'function')
        throw new UnsupportedTerrainTransitionError('obj_ice_effects');
    if (removingIce && typeof spotStopTimers !== 'function')
        throw new UnsupportedTerrainTransitionError('spot_stop_timers');

    location.typ = newtyp;
    if (IS_LAVA(newtyp)) location.lit = true;
    if (removingIce) {
        objIceEffects(x, y, true, env);
        spotStopTimers(x, y, MELT_ICE_AWAY, env);
    }
    if ((oldtyp === FOUNTAIN) !== (newtyp === FOUNTAIN)
        || (oldtyp === SINK) !== (newtyp === SINK)) {
        count_level_features(state);
    }
    return true;
}
