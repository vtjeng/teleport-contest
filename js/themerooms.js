// Themed-room fill selection and selection-map primitives.
// C refs: dat/themerms.lua themeroom_fill()/is_eligible();
// src/selvar.c and src/nhlsel.c selection operations.

import {
    COLNO,
    IS_STWALL,
    MATCH_WALL,
    MAX_TYPE,
    ROOMOFFSET,
    ROWNO,
    W_ANY,
    W_EAST,
    W_NORTH,
    W_RANDOM,
    W_SOUTH,
    W_WEST,
} from './const.js';
import { rn2 } from './rng.js';

function inSelectionBounds(x, y) {
    return Number.isInteger(x) && Number.isInteger(y)
        && x >= 0 && x < COLNO && y >= 0 && y < ROWNO;
}

function relativeCoordinate(x, y, origin) {
    return origin
        ? { x: x - origin.x, y: y - origin.y }
        : { x, y };
}

function terrainMatches(wanted, actual) {
    if (wanted === MATCH_WALL && !IS_STWALL(actual)) return false;
    return wanted >= MAX_TYPE || wanted === actual;
}

export class ThemeroomSelection {
    constructor(points = null) {
        this.points = new Uint8Array(COLNO * ROWNO);
        if (points) {
            for (const point of points) this.set(point.x, point.y, true);
        }
    }

    #index(x, y) {
        return y * COLNO + x;
    }

    clone() {
        const result = new ThemeroomSelection();
        result.points.set(this.points);
        return result;
    }

    get(x, y) {
        return inSelectionBounds(x, y)
            ? this.points[this.#index(x, y)] !== 0
            : false;
    }

    set(x, y, value = true) {
        if (inSelectionBounds(x, y))
            this.points[this.#index(x, y)] = value ? 1 : 0;
        return this;
    }

    // selvar.c returns the whole-map rectangle for an empty selection.
    bounds() {
        let lx = COLNO;
        let ly = ROWNO;
        let hx = 0;
        let hy = 0;
        for (let x = 0; x < COLNO; ++x) {
            for (let y = 0; y < ROWNO; ++y) {
                if (!this.get(x, y)) continue;
                lx = Math.min(lx, x);
                ly = Math.min(ly, y);
                hx = Math.max(hx, x);
                hy = Math.max(hy, y);
            }
        }
        return lx === COLNO
            ? { lx: 0, ly: 0, hx: COLNO - 1, hy: ROWNO - 1 }
            : { lx, ly, hx, hy };
    }

    numpoints() {
        const { lx, ly, hx, hy } = this.bounds();
        let result = 0;
        for (let x = lx; x <= hx; ++x) {
            for (let y = ly; y <= hy; ++y) {
                if (this.get(x, y)) ++result;
            }
        }
        return result;
    }

    // C's percentage filter consumes RNG in x-major order.
    percentage(percent, random = rn2) {
        const result = new ThemeroomSelection();
        const { lx, ly, hx, hy } = this.bounds();
        for (let x = lx; x <= hx; ++x) {
            for (let y = ly; y <= hy; ++y) {
                if (this.get(x, y) && random(100) < percent)
                    result.set(x, y);
            }
        }
        return result;
    }

    // selection_rndcoord() counts and chooses points in x-major order.
    // nhlsel.c converts its result to the active room/map coordinate frame.
    rndcoord(remove = false, random = rn2, origin = null) {
        const { lx, ly, hx, hy } = this.bounds();
        let count = 0;
        for (let x = lx; x <= hx; ++x) {
            for (let y = ly; y <= hy; ++y) {
                if (this.get(x, y)) ++count;
            }
        }
        if (!count) return { x: -1, y: -1 };

        let selected = random(count);
        for (let x = lx; x <= hx; ++x) {
            for (let y = ly; y <= hy; ++y) {
                if (!this.get(x, y)) continue;
                if (selected-- !== 0) continue;
                if (remove) this.set(x, y, false);
                return relativeCoordinate(x, y, origin);
            }
        }
        throw new RangeError('selection RNG returned an out-of-range result');
    }

    filter_mapchar(wanted, locationAt, options = {}) {
        if (typeof locationAt !== 'function')
            throw new TypeError('filter_mapchar requires a location accessor');
        const lit = options.lit ?? -2;
        const random = options.random ?? rn2;
        const result = new ThemeroomSelection();
        const { lx, ly, hx, hy } = this.bounds();
        for (let x = lx; x <= hx; ++x) {
            for (let y = ly; y <= hy; ++y) {
                if (!this.get(x, y)) continue;
                const location = locationAt(x, y);
                const actual = typeof location === 'number'
                    ? location
                    : location?.typ;
                if (!terrainMatches(wanted, actual)) continue;
                if (lit === -2) {
                    result.set(x, y);
                } else if (lit === -1) {
                    result.set(x, y, random(2));
                } else if (Number(Boolean(location?.lit)) === lit) {
                    result.set(x, y);
                }
            }
        }
        return result;
    }

    negate() {
        const result = new ThemeroomSelection();
        for (let x = 0; x < COLNO; ++x) {
            for (let y = 0; y < ROWNO; ++y)
                result.set(x, y, !this.get(x, y));
        }
        return result;
    }

    // l_selection_grow() clones before growing, so the receiver is unchanged.
    grow(direction = W_ANY, random = rn2) {
        if (direction === W_RANDOM) {
            direction = [W_NORTH, W_SOUTH, W_EAST, W_WEST][random(4)];
        }
        const result = this.clone();
        const { lx, ly, hx, hy } = this.bounds();
        for (let x = Math.max(0, lx - 1); x <= Math.min(COLNO - 1, hx + 1); ++x) {
            for (let y = Math.max(0, ly - 1); y <= Math.min(ROWNO - 1, hy + 1); ++y) {
                const west = Boolean(direction & W_WEST);
                const north = Boolean(direction & W_NORTH);
                const east = Boolean(direction & W_EAST);
                const south = Boolean(direction & W_SOUTH);
                const selected = (west && this.get(x + 1, y))
                    || (west && north && this.get(x + 1, y + 1))
                    || (north && this.get(x, y + 1))
                    || (north && east && this.get(x - 1, y + 1))
                    || (east && this.get(x - 1, y))
                    || (east && south && this.get(x - 1, y - 1))
                    || (south && this.get(x, y - 1))
                    || (south && west && this.get(x + 1, y - 1));
                if (selected) result.set(x, y);
            }
        }
        return result;
    }

    // Lua selection:iterate() is y-major and omits map column zero.
    iterate(callback, origin = null) {
        if (typeof callback !== 'function')
            throw new TypeError('selection iterate requires a callback');
        const { lx, ly, hx, hy } = this.bounds();
        for (let y = ly; y <= hy; ++y) {
            for (let x = Math.max(1, lx); x <= hx; ++x) {
                if (!this.get(x, y)) continue;
                const point = relativeCoordinate(x, y, origin);
                callback(point.x, point.y);
            }
        }
    }
}

export function selection_area(x1, y1, x2, y2) {
    const result = new ThemeroomSelection();
    if (y1 > y2) return result;
    const xstep = x1 <= x2 ? 1 : -1;
    for (let y = y1; y <= y2; ++y) {
        for (let x = x1;; x += xstep) {
            result.set(x, y);
            if (x === x2) break;
        }
    }
    return result;
}

// selection.negate() with no operand starts with selection_new(), whose map is
// empty, and therefore selects the whole map.
export function selection_negate(selection = null) {
    return (selection ?? new ThemeroomSelection()).negate();
}

export function selection_room(room, locationAt) {
    if (!room || !Number.isInteger(room.roomnoidx))
        throw new TypeError('selection_room requires an indexed room');
    if (typeof locationAt !== 'function')
        throw new TypeError('selection_room requires a location accessor');
    const result = new ThemeroomSelection();
    const roomNumber = room.roomnoidx + ROOMOFFSET;
    for (let y = room.ly; y <= room.hy; ++y) {
        for (let x = room.lx; x <= room.hx; ++x) {
            const location = locationAt(x, y);
            if (location && !location.edge && location.roomno === roomNumber)
                result.set(x, y);
        }
    }
    return result;
}

function fillDefinition(id, name, options = {}) {
    return Object.freeze({
        id,
        name,
        frequency: options.frequency ?? 1,
        mindiff: options.mindiff ?? null,
        maxdiff: options.maxdiff ?? null,
        requiredLit: options.requiredLit ?? null,
    });
}

// dat/themerms.lua themeroom_fills, kept in exact source order. Behavioral
// callbacks intentionally live outside this selection-only foundation.
export const THEMEROOM_FILL_DEFINITIONS = Object.freeze([
    fillDefinition('ice_room', 'Ice room'),
    fillDefinition('cloud_room', 'Cloud room'),
    fillDefinition('boulder_room', 'Boulder room', { mindiff: 4 }),
    fillDefinition('spider_nest', 'Spider nest'),
    fillDefinition('trap_room', 'Trap room'),
    fillDefinition('garden', 'Garden', { requiredLit: true }),
    fillDefinition('buried_treasure', 'Buried treasure'),
    fillDefinition('buried_zombies', 'Buried zombies'),
    fillDefinition('massacre', 'Massacre'),
    fillDefinition('statuary', 'Statuary'),
    fillDefinition('light_source', 'Light source', { requiredLit: false }),
    fillDefinition('temple_of_the_gods', 'Temple of the gods'),
    fillDefinition('ghost_of_an_adventurer', 'Ghost of an Adventurer'),
    fillDefinition('storeroom', 'Storeroom'),
    fillDefinition('teleportation_hub', 'Teleportation hub'),
]);

export function is_themeroom_fill_eligible(definition, difficulty, room) {
    if (definition.mindiff != null && difficulty < definition.mindiff)
        return false;
    if (definition.maxdiff != null && difficulty > definition.maxdiff)
        return false;
    return definition.requiredLit == null
        || room.lit === definition.requiredLit;
}

// dat/themerms.lua themeroom_fill(): weighted reservoir sampling consumes one
// rn2(cumulative weight) call for every eligible positive-frequency entry.
export function select_themeroom_fill(difficulty, room, random = rn2) {
    if (!room || typeof room.lit !== 'boolean')
        throw new TypeError('themeroom fill selection requires boolean room.lit');
    let pick = null;
    let totalFrequency = 0;
    for (const definition of THEMEROOM_FILL_DEFINITIONS) {
        if (!is_themeroom_fill_eligible(definition, difficulty, room))
            continue;
        const frequency = definition.frequency;
        totalFrequency += frequency;
        if (frequency > 0 && random(totalFrequency) < frequency)
            pick = definition;
    }
    return pick;
}
