// Mobile light-source ownership for burning objects and luminous monsters.
// C refs: src/light.c new_light_source(), del_light_source(),
// candle_light_range(); src/zap.c get_obj_location(), get_mon_location().

import {
    BURIED_TOO,
    COLNO,
    COULD_SEE,
    CONTAINED_TOO,
    LS_OBJECT,
    LS_MONSTER,
    MAX_RADIUS,
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MINVENT,
    ROWNO,
    TEMP_LIT,
} from './const.js';
import { game } from './gstate.js';
import { TALLOW_CANDLE, WAX_CANDLE } from './objects.js';

export class UnsupportedLightOperationError extends Error {
    constructor(operation) {
        super(`${operation} is not available`);
        this.name = 'UnsupportedLightOperationError';
        this.operation = operation;
    }
}

// decl.c initializes gl.light_base for each game. Keep the source owner (`gl`)
// separate from the flattened vision_full_recalc flag used by the current JS
// vision port.
export function light_globals_init(state = game) {
    state.gl ??= {};
    state.gl.light_base = null;
}

function lightGlobals(state) {
    if (!state.gl || !Object.hasOwn(state.gl, 'light_base'))
        throw new Error('light sources require light_globals_init()');
    return state.gl;
}

function requireMobileSource(type) {
    if (type !== LS_OBJECT && type !== LS_MONSTER)
        throw new UnsupportedLightOperationError(`light source type ${type}`);
}

// light.c:new_light_core(). The source prepends every light to gl.light_base
// and marks vision for a full recalculation.
export function new_light_source(x, y, range, type, id, state = game) {
    const globals = lightGlobals(state);
    requireMobileSource(type);
    const radius = Math.trunc(range);
    if (radius < 0 || radius > MAX_RADIUS
        || (radius === 0 && id != null)) {
        throw new RangeError(`new_light_source: illegal range ${range}`);
    }
    if (!id || typeof id !== 'object') {
        throw new TypeError(
            `${type === LS_MONSTER ? 'monster' : 'object'} light source requires an object identity`,
        );
    }

    const source = {
        next: globals.light_base,
        x: Math.trunc(x),
        y: Math.trunc(y),
        range: radius,
        type,
        id,
        flags: 0,
    };
    globals.light_base = source;
    state.vision_full_recalc = 1;
    return source;
}

// C ref: light.c del_light_source(). Object and monster sources use their
// owner identity directly; save/restore fixup ids remain outside this subset.
export function del_light_source(type, id, state = game) {
    const globals = lightGlobals(state);
    requireMobileSource(type);
    let previous = null;
    let current = globals.light_base;
    while (current && (current.type !== type || current.id !== id)) {
        previous = current;
        current = current.next;
    }
    if (!current)
        throw new Error('del_light_source: object light source not found');
    if (previous) previous.next = current.next;
    else globals.light_base = current.next;
    current.next = null;
    state.vision_full_recalc = 1;
}

// C ref: zap.c get_mon_location(), for a live level monster or steed.
export function get_mon_location(monster, locflags = 0, state = game) {
    if (!monster || typeof monster !== 'object') return null;
    if (monster === state.youmonst || monster === state.u?.usteed) {
        return Number.isInteger(state.u?.ux) && Number.isInteger(state.u?.uy)
            ? { x: Math.trunc(state.u.ux), y: Math.trunc(state.u.uy) }
            : null;
    }
    return monster.mx > 0 && (!monster.mburied || locflags)
        ? { x: Math.trunc(monster.mx), y: Math.trunc(monster.my) }
        : null;
}

// zap.c:get_obj_location(). Return null for the source's FALSE result.
export function get_obj_location(obj, locflags = 0, state = game) {
    switch (obj?.where) {
    case OBJ_INVENT:
        if (!state.u) return null;
        return { x: Math.trunc(state.u.ux), y: Math.trunc(state.u.uy) };
    case OBJ_FLOOR:
        return { x: Math.trunc(obj.ox), y: Math.trunc(obj.oy) };
    case OBJ_MINVENT:
        if (obj.ocarry?.mx)
            return { x: Math.trunc(obj.ocarry.mx), y: Math.trunc(obj.ocarry.my) };
        return null;
    case OBJ_BURIED:
        return locflags & BURIED_TOO
            ? { x: Math.trunc(obj.ox), y: Math.trunc(obj.oy) }
            : null;
    case OBJ_CONTAINED:
        return locflags & CONTAINED_TOO
            ? get_obj_location(obj.ocontainer, locflags, state)
            : null;
    default:
        return null;
    }
}

// light.c:candle_light_range(), restricted to ordinary candle stacks. Radius
// increases when radius squared is no longer greater than the stack size.
export function candle_light_range(obj) {
    if (obj?.otyp !== TALLOW_CANDLE && obj?.otyp !== WAX_CANDLE)
        throw new UnsupportedLightOperationError('candle_light_range object type');
    const quantity = Math.trunc(obj.quan);
    if (quantity < 1)
        throw new RangeError(`candle_light_range: invalid quantity ${obj.quan}`);

    let radius = 1;
    while (radius * radius <= quantity && radius < MAX_RADIUS) ++radius;
    return radius;
}

const LSF_SHOW = 0x1;

// light.c:do_light_sources(). NetHack gets clear_path() and circle_data[]
// from vision.c; this port receives the corresponding operations explicitly
// so light.js and vision.js do not form an import cycle.
export function do_light_sources(csRows, env = {}) {
    const state = env.state ?? game;
    const clearPath = env.clearPath;
    const circleOffset = env.circleOffset;
    let atHeroRange = 0;

    for (let source = state.gl?.light_base ?? null;
        source;
        source = source.next) {
        source.flags &= ~LSF_SHOW;

        if (source.type === LS_OBJECT) {
            const position = source.range === 0
                ? { x: source.x, y: source.y }
                : get_obj_location(source.id, 0, state);
            if (position) {
                source.x = position.x;
                source.y = position.y;
                source.flags |= LSF_SHOW;
            }
        } else if (source.type === LS_MONSTER) {
            const position = get_mon_location(source.id, 0, state);
            if (position) {
                source.x = position.x;
                source.y = position.y;
                source.flags |= LSF_SHOW;
            }
        }

        const atHero = state.u?.ux === source.x && state.u?.uy === source.y;
        if (atHero) {
            if (atHeroRange >= source.range)
                source.flags &= ~LSF_SHOW;
            else
                atHeroRange = source.range;
        }

        if (!(source.flags & LSF_SHOW)) continue;
        if (typeof circleOffset !== 'function')
            throw new TypeError('do_light_sources requires circleOffset');
        if (!atHero && typeof clearPath !== 'function')
            throw new TypeError('do_light_sources requires clearPath');

        const minY = Math.max(0, source.y - source.range);
        const maxY = Math.min(ROWNO - 1, source.y + source.range);
        for (let y = minY; y <= maxY; ++y) {
            const row = csRows[y];
            const offset = circleOffset(source.range, Math.abs(y - source.y));
            const minX = Math.max(1, source.x - offset);
            const maxX = Math.min(COLNO - 1, source.x + offset);
            for (let x = minX; x <= maxX; ++x) {
                if (atHero) {
                    if (row[x] & COULD_SEE) row[x] |= TEMP_LIT;
                } else if ((source.x === x && source.y === y)
                    || clearPath(source.x, source.y, x, y)) {
                    row[x] |= TEMP_LIT;
                }
            }
        }
    }
}
