// Monster destination selection and short-range relocation.
// C ref: teleport.c goodpos(), enexto(), enexto_core(), collect_coords();
// mon.c mnexto().

import {
    ACCESSIBLE,
    ALTAR,
    CC_INCL_CENTER,
    CC_NO_FLAGS,
    CC_RING_PAIRS,
    CC_SKIP_INACCS,
    CC_SKIP_MONS,
    CC_UNSHUFFLED,
    COLNO,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    D_CLOSED,
    D_LOCKED,
    DOOR,
    DRAWBRIDGE_UP,
    GP_ALLOW_U,
    GP_ALLOW_XY,
    GP_AVOID_MONPOS,
    GP_CHECKSCARY,
    HEADSTONE,
    ICE,
    IS_LAVA,
    IS_STWALL,
    LAVAPOOL,
    LR_MONGEN,
    MM_IGNORELAVA,
    MM_IGNOREWATER,
    MOAT,
    POOL,
    ROWNO,
    STONE,
    WATER,
    W_NONPASSWALL,
    ZAP_POS,
    isok,
} from './const.js';
import { on_level } from './dungeon.js';
import { engr_at } from './engrave.js';
import { game } from './gstate.js';
import { is_rider } from './mondata.js';
import { m_at, relocate_monster } from './monst.js';
import {
    G_UNIQ,
    M1_AMORPHOUS,
    M1_FLY,
    M1_SWIM,
    PM_FIRE_ELEMENTAL,
    PM_FLOATING_EYE,
    PM_MINOTAUR,
    PM_SALAMANDER,
    S_ANGEL,
    S_EEL,
    S_EYE,
    S_HUMAN,
    S_LIGHT,
    S_VAMPIRE,
} from './monsters.js';
import { sobj_at } from './obj.js';
import { BOULDER, SCR_SCARE_MONSTER } from './objects.js';
import { rn2 } from './rng.js';

// These generated-monster masks are source data which monsters.js does not
// currently export. Keep their names and values traceable to monflag.h.
const M1_WALLWALK = 0x00000008;
const M1_CLING = 0x00000010;
const M1_NOEYES = 0x00001000;
const M2_ROCKTHROW = 0x08000000;

export class UnsupportedPositionCheckError extends Error {
    constructor(operation) {
        super(`unsupported monster position check: ${operation}`);
        this.name = 'UnsupportedPositionCheckError';
        this.operation = operation;
    }
}

function teleportEnv(env = {}) {
    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('teleport random injection requires rn2');
    return { ...env, random, state: env.state ?? game };
}

function closedDoor(location) {
    const mask = (location.flags || location.doormask || 0);
    return location.typ === DOOR && Boolean(mask & (D_LOCKED | D_CLOSED));
}

function drawbridgeMask(location) {
    return (location.flags || location.drawbridgemask || 0) & DB_UNDER;
}

function isPoolAt(location, state) {
    if (location.typ === POOL || location.typ === MOAT
        || location.typ === WATER) {
        return true;
    }
    return location.typ === DRAWBRIDGE_UP
        && drawbridgeMask(location) === DB_MOAT
        && !on_level(state.u?.uz, state.juiblex_level);
}

function isLavaAt(location) {
    return IS_LAVA(location.typ)
        || (location.typ === DRAWBRIDGE_UP
            && drawbridgeMask(location) === DB_LAVA);
}

function surfaceType(location) {
    if (location.typ !== DRAWBRIDGE_UP) return location.typ;
    switch (drawbridgeMask(location)) {
    case DB_ICE: return ICE;
    case DB_LAVA: return LAVAPOOL;
    case DB_MOAT: return MOAT;
    default: return STONE;
    }
}

function currentDungeonIsHellish(state) {
    const dnum = state.u?.uz?.dnum;
    return Number.isInteger(dnum)
        && Boolean(state.dungeons?.[dnum]?.flags?.hellish);
}

function inEndgame(state) {
    const uz = state.u?.uz;
    return Boolean(uz && state.astral_level
        && uz.dnum === state.astral_level.dnum);
}

function inWaterLevel(state) {
    return on_level(state.u?.uz, state.water_level);
}

function isFloater(species) {
    return species.mlet === S_EYE || species.mlet === S_LIGHT;
}

// C ref: mon.c m_in_air(). A fake monster used by enexto_core() is never
// undetected, so its clinger branch is false; retain the live-monster form for
// direct goodpos() callers which provide a hasCeiling hook.
function monsterInAir(monster, normalized) {
    const species = monster.data;
    if ((species.mflags1 & M1_FLY) || isFloater(species)) return true;
    if (!(species.mflags1 & M1_CLING) || !monster.mundetected) return false;
    const hasCeiling = normalized.hasCeiling;
    if (typeof hasCeiling !== 'function') {
        throw new UnsupportedPositionCheckError(
            'undetected clinger without hasCeiling hook',
        );
    }
    return Boolean(hasCeiling(normalized.state.u?.uz, normalized));
}

function mayPasswall(location) {
    return !(IS_STWALL(location.typ)
        && (location.wall_info & W_NONPASSWALL));
}

function engravingSaysElbereth(x, y, state) {
    const engraving = engr_at(x, y, state);
    return Boolean(engraving
        && engraving.engr_type !== HEADSTONE
        && engraving.engr_time <= (state.moves ?? 0)
        && String(engraving.engr_txt?.[0] ?? '').toLowerCase() === 'elbereth');
}

// C ref: teleport.c goodpos_onscary(). This deliberately needs only species
// data, which is why enexto_core() can use a zero-id fake monster without
// changing ordinary onscary() semantics.
export function goodpos_onscary(x, y, species, env = {}) {
    const { state } = teleportEnv(env);
    const location = state.level?.at?.(x, y);
    if (!species || !location) return false;
    if (species.mlet === S_HUMAN || species.mlet === S_ANGEL
        || is_rider(species) || (species.geno & G_UNIQ)) {
        return false;
    }
    if (location.typ === ALTAR && species.mlet === S_VAMPIRE) return true;
    if (sobj_at(SCR_SCARE_MONSTER, x, y, state)) return true;
    if (currentDungeonIsHellish(state) || inEndgame(state)) return false;
    if (species.pmidx === PM_MINOTAUR || (species.mflags1 & M1_NOEYES))
        return false;
    return engravingSaysElbereth(x, y, state);
}

// C ref: teleport.c goodpos(). This covers the species-only fake-monster path
// used by NEW_ENEXTO and the corresponding ordinary-monster terrain checks.
// Callers which request live-monster scary handling must supply onscary;
// silently substituting goodpos_onscary() there would change game behavior.
export function goodpos(x, y, monster, gpflags = 0, env = {}) {
    const normalized = teleportEnv(env);
    const { random, state } = normalized;
    if (!isok(x, y)) return false;

    const allowHero = Boolean(gpflags & GP_ALLOW_U);
    if (!allowHero && state.u?.ux === x && state.u?.uy === y
        && monster !== state.youmonst
        && (monster !== state.u?.ustuck || !state.u?.uswallow)
        && (!state.u?.usteed || monster !== state.u.usteed)) {
        return false;
    }

    if ((gpflags & GP_AVOID_MONPOS) && m_at(x, y, state)) return false;

    let species = null;
    if (monster) {
        const occupant = m_at(x, y, state);
        if (occupant && (occupant !== monster || monster.wormno)) return false;
        species = monster.data;
        if (!species)
            throw new TypeError('goodpos monster requires species data');

        const location = state.level?.at?.(x, y);
        if (!location) return false;
        const ignoreWater = Boolean(gpflags & MM_IGNOREWATER);
        const ignoreLava = Boolean(gpflags & MM_IGNORELAVA);
        if (isPoolAt(location, state) && !ignoreWater) {
            if (monster === state.youmonst) {
                if (typeof normalized.heroCanOccupyPool !== 'function') {
                    throw new UnsupportedPositionCheckError(
                        'hero pool placement without heroCanOccupyPool hook',
                    );
                }
                return Boolean(normalized.heroCanOccupyPool(x, y, normalized));
            }
            return Boolean((species.mflags1 & M1_SWIM)
                || (!inWaterLevel(state) && location.typ !== WATER
                    && monsterInAir(monster, normalized)));
        } else if (species.mlet === S_EEL && random.rn2(13) && !ignoreWater) {
            return false;
        } else if (isLavaAt(location) && !ignoreLava) {
            if (species.pmidx === PM_FLOATING_EYE) return false;
            if (monster === state.youmonst) {
                if (typeof normalized.heroCanOccupyLava !== 'function') {
                    throw new UnsupportedPositionCheckError(
                        'hero lava placement without heroCanOccupyLava hook',
                    );
                }
                return Boolean(normalized.heroCanOccupyLava(x, y, normalized));
            }
            return monsterInAir(monster, normalized)
                || species.pmidx === PM_FIRE_ELEMENTAL
                || species.pmidx === PM_SALAMANDER;
        }
        if ((species.mflags1 & M1_WALLWALK) && mayPasswall(location))
            return true;
        if ((species.mflags1 & M1_AMORPHOUS) && closedDoor(location))
            return true;
        if (gpflags & GP_CHECKSCARY) {
            const scary = monster.m_id
                ? (() => {
                    if (typeof normalized.onscary !== 'function') {
                        throw new UnsupportedPositionCheckError(
                            'live-monster scary placement without onscary hook',
                        );
                    }
                    return normalized.onscary(x, y, monster, normalized);
                })()
                : goodpos_onscary(x, y, species, normalized);
            if (scary) return false;
        }
    }

    const location = state.level?.at?.(x, y);
    if (!location) return false;
    const accessible = ACCESSIBLE(surfaceType(location))
        && !closedDoor(location);
    if (!accessible) {
        if (!(isPoolAt(location, state) && (gpflags & MM_IGNOREWATER))
            && !(isLavaAt(location) && (gpflags & MM_IGNORELAVA))) {
            return false;
        }
    }
    if (sobj_at(BOULDER, x, y, state)
        && (!species || !(species.mflags2 & M2_ROCKTHROW))) {
        return false;
    }
    if ((gpflags & GP_AVOID_MONPOS)
        && typeof normalized.isExclusionZone === 'function'
        && normalized.isExclusionZone(LR_MONGEN, x, y, normalized)) {
        return false;
    }
    return true;
}

// C ref: teleport.c collect_coords(). Each completed ring (or ring pair) is
// shuffled before the next is collected, preserving every rn2() bound.
export function collect_coords(
    cx,
    cy,
    maxradius,
    ccFlags = CC_NO_FLAGS,
    filter = null,
    env = {},
) {
    const normalized = teleportEnv(env);
    const { random, state } = normalized;
    const coordinates = [];
    const includeCenter = Boolean(ccFlags & CC_INCL_CENTER);
    const scramble = !(ccFlags & CC_UNSHUFFLED);
    const ringPairs = scramble && Boolean(ccFlags & CC_RING_PAIRS);
    const skipMonsters = Boolean(ccFlags & CC_SKIP_MONS);
    const skipInaccessible = Boolean(ccFlags & CC_SKIP_INACCS);
    const rowrange = cy < Math.trunc(ROWNO / 2) ? ROWNO - 1 - cy : cy;
    const colrange = cx < Math.trunc(COLNO / 2) ? COLNO - 1 - cx : cx;
    const mapRadius = Math.max(rowrange, colrange);
    maxradius = maxradius
        ? Math.min(maxradius, mapRadius)
        : mapRadius;

    let passStart = 0;
    let passCount = 0;
    for (let radius = includeCenter ? 0 : 1;
        radius <= maxradius;
        ++radius) {
        let newPass;
        let passEnd;
        if (!ringPairs) {
            newPass = passEnd = true;
        } else {
            newPass = Boolean(radius % 2) || radius === 0;
            passEnd = !(radius % 2) || radius === maxradius;
        }
        if (newPass) {
            passStart = coordinates.length;
            passCount = 0;
        }

        const lox = cx - radius;
        const hix = cx + radius;
        const loy = cy - radius;
        const hiy = cy + radius;
        for (let y = Math.max(loy, 0); y <= hiy; ++y) {
            if (y > ROWNO - 1) break;
            for (let x = Math.max(lox, 1); x <= hix; ++x) {
                if (x > COLNO - 1) break;
                if (x !== lox && x !== hix && y !== loy && y !== hiy)
                    continue;
                if ((skipMonsters && m_at(x, y, state))
                    || (skipInaccessible
                        && !ZAP_POS(state.level?.at?.(x, y)?.typ))) {
                    continue;
                }
                if (filter && !filter(x, y)) continue;
                coordinates.push({ x, y });
                ++passCount;
            }
        }

        if (scramble && passEnd) {
            while (passCount > 1) {
                const offset = random.rn2(passCount);
                if (offset) {
                    const other = passStart + offset;
                    [coordinates[passStart], coordinates[other]] = [
                        coordinates[other],
                        coordinates[passStart],
                    ];
                }
                ++passStart;
                --passCount;
            }
        }
    }
    return coordinates;
}

// C ref: teleport.c enexto_core() under NEW_ENEXTO.
export function enexto_core(xx, yy, species, entflags = 0, env = {}) {
    const normalized = teleportEnv(env);
    const { state } = normalized;
    species ??= state.mons?.[state.u?.umonster];
    if (!species) throw new TypeError('enexto_core requires monster species');
    const fakeMonster = {
        data: species,
        m_id: 0,
        mundetected: false,
        wormno: 0,
    };

    const nearby = collect_coords(xx, yy, 3, CC_NO_FLAGS, null, normalized);
    for (const coordinate of nearby) {
        if (goodpos(coordinate.x, coordinate.y, fakeMonster,
            entflags, normalized)) {
            return coordinate;
        }
    }

    const all = collect_coords(xx, yy, 0, CC_NO_FLAGS, null, normalized);
    for (let index = nearby.length; index < all.length; ++index) {
        const coordinate = all[index];
        if (goodpos(coordinate.x, coordinate.y, fakeMonster,
            entflags, normalized)) {
            return coordinate;
        }
    }

    if (entflags & GP_ALLOW_XY) {
        const coordinate = { x: xx, y: yy };
        if (goodpos(xx, yy, fakeMonster, entflags, normalized))
            return coordinate;
    }
    return null;
}

export function enexto(xx, yy, species, env = {}) {
    return enexto_core(xx, yy, species, GP_CHECKSCARY, env)
        ?? enexto_core(xx, yy, species, 0, env);
}

// C ref: mon.c mnexto(). Overcrowding and wizard destination control remain
// explicit subsystem seams; both are reached at their source call boundary.
export function mnexto(monster, _rlocflags = 0, env = {}) {
    const normalized = teleportEnv(env);
    const { state } = normalized;
    if (monster === state.u?.usteed) {
        monster.mx = state.u.ux;
        monster.my = state.u.uy;
        return monster;
    }
    let coordinate = enexto(
        state.u?.ux,
        state.u?.uy,
        monster?.data,
        normalized,
    );
    if (!coordinate) {
        if (typeof normalized.dealWithOvercrowding === 'function')
            normalized.dealWithOvercrowding(monster, normalized);
        return null;
    }
    if (state.iflags?.mon_telecontrol) {
        const controlMonsterTeleport = normalized.controlMonsterTeleport;
        if (typeof controlMonsterTeleport !== 'function') {
            throw new UnsupportedPositionCheckError(
                'montelecontrol without controlMonsterTeleport hook',
            );
        }
        const selected = { ...coordinate };
        if (controlMonsterTeleport(
            monster,
            selected,
            _rlocflags,
            false,
            normalized,
        )) {
            if (!Number.isInteger(selected.x) || !Number.isInteger(selected.y)
                || !isok(selected.x, selected.y)) {
                throw new RangeError(
                    'controlMonsterTeleport accepted an invalid coordinate',
                );
            }
            coordinate = selected;
        }
    }
    const relocated = relocate_monster(
        monster,
        coordinate.x,
        coordinate.y,
        state,
    );
    // allmain.c invokes this before the first turn, with an undisplaced,
    // visible hero; set_apparxy() therefore resolves directly to the hero and
    // consumes no RNG in the supported startup call shape.
    relocated.mux = state.u.ux;
    relocated.muy = state.u.uy;
    return relocated;
}
