// Monster destination selection and short-range relocation.
// C ref: teleport.c goodpos(), enexto(), enexto_core(), collect_coords();
// mon.c mnexto().

import {
    ACCESSIBLE,
    ALTAR,
    BLINDED,
    BOLT_LIM,
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
    HOLE,
    ICE,
    IS_LAVA,
    IS_STWALL,
    LAVAPOOL,
    LR_MONGEN,
    MIGR_RANDOM,
    MM_IGNORELAVA,
    MM_IGNOREWATER,
    MON_FLOOR,
    MOAT,
    NO_TRAP,
    OBJ_FREE,
    POOL,
    ROWNO,
    SLT_ENCUMBER,
    STONE,
    STRAT_APPEARMSG,
    TELEDS_ALLOW_DRAG,
    TELEDS_TELEPORT,
    TRAPDOOR,
    TT_BURIEDBALL,
    WATER,
    W_NONPASSWALL,
    ZAP_POS,
    isok,
} from './const.js';
import {
    ledger_no,
    on_level,
    u_on_newpos,
} from './dungeon.js';
import {
    capitalizedMonsterName,
    monsterCommonName,
} from './do_name.js';
import { newsym, see_monsters } from './display.js';
import { engr_at } from './engrave.js';
import { game } from './gstate.js';
import {
    invocation_message,
    near_capacity,
    nomul,
    notice_all_mons,
    notice_mon_off,
    notice_mon_on,
    requireSimpleHeroDestination,
    spoteffects,
    switch_terrain,
    UnsupportedHeroMoveBoundaryError,
} from './hack.js';
import { dist2, distmin } from './hacklib.js';
import {
    is_covetous,
    is_dlord,
    is_dprince,
    is_rider,
    passes_walls,
} from './mondata.js';
import {
    m_at,
    mon_track_clear,
    place_monster,
    relocate_monster,
    remove_monster,
} from './monst.js';
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
    S_MIMIC,
    S_VAMPIRE,
} from './monsters.js';
import { set_ustuck } from './mon.js';
import { sobj_at } from './obj.js';
import { BOULDER, SCR_SCARE_MONSTER } from './objects.js';
import { within_bounded_area } from './rect.js';
import { update_monster_region, update_player_regions } from './region.js';
import { rn2, rnd } from './rng.js';
import {
    canSeeMonster,
    canSpotMonster,
    sensesMonster,
} from './startup_a11y.js';
import { fill_pit, reset_utrap } from './trap.js';
import { ttyPline } from './tty_message.js';
import { vault_occupied } from './vault.js';
import { couldsee, vision_recalc } from './vision.js';

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
    const random = env.random ?? { rn2, rnd };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('teleport random injection requires rn2');
    return { ...env, random, state: env.state ?? game };
}

function teleJumpOk(x1, y1, x2, y2, state) {
    if (!isok(x2, y2)) return false;
    for (const bounds of [state.dndest, state.updest]) {
        if (!(bounds?.nlx > 0)) continue;
        const wasInside = within_bounded_area(
            x1,
            y1,
            bounds.nlx,
            bounds.nly,
            bounds.nhx,
            bounds.nhy,
        );
        const isInside = within_bounded_area(
            x2,
            y2,
            bounds.nlx,
            bounds.nly,
            bounds.nhx,
            bounds.nhy,
        );
        if (wasInside !== isInside) return false;
    }
    return true;
}

function rlocPositionOk(x, y, monster, env) {
    if (!goodpos(x, y, monster, GP_CHECKSCARY, env)) return false;
    return teleJumpOk(monster.mx, monster.my, x, y, env.state);
}

function requiredRelocationOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new UnsupportedPositionCheckError(
            `random relocation without ${name}`,
        );
    }
    return operation;
}

function finishRandomRelocation(monster, x, y, env) {
    const oldX = monster.mx;
    const oldY = monster.my;
    if (x === oldX && y === oldY && m_at(x, y, env.state) === monster)
        return true;

    // teleport.c rloc_to_core(), bounded ordinary-monster path. Redraw the
    // emptied square before track clearing, placement, and region-cache
    // updates; the destination redraw and apparent-position update come last.
    remove_monster(oldX, oldY, env.state);
    env.newsym(oldX, oldY, env);
    mon_track_clear(monster);
    place_monster(monster, x, y, env.state);
    update_monster_region(monster, env.state);
    env.newsym(x, y, env);
    env.setApparxy(monster, env);
    return true;
}

function preflightOrdinaryRloc(monster, rlocflags, rawEnv) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('rloc requires a monster');
    const env = teleportEnv(rawEnv);
    if (typeof env.random.rnd !== 'function')
        throw new TypeError('rloc random injection requires rnd');
    if (rlocflags)
        throw new UnsupportedPositionCheckError('random relocation flags');
    if (monster === env.state.u?.usteed) {
        throw new UnsupportedPositionCheckError(
            'steed random relocation',
        );
    }
    if (monster.iswiz) {
        throw new UnsupportedPositionCheckError(
            'Wizard random relocation',
        );
    }
    if (env.state.iflags?.mon_telecontrol) {
        throw new UnsupportedPositionCheckError(
            'controlled random relocation',
        );
    }
    if (!monster.mx)
        throw new UnsupportedPositionCheckError(
            'migrating-monster random relocation',
        );
    if (!monster.m_id)
        throw new UnsupportedPositionCheckError(
            'zero-id live-monster random relocation',
        );
    if (monster.isshk || monster.ispriest) {
        throw new UnsupportedPositionCheckError(
            'shopkeeper or priest random relocation',
        );
    }
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        // rloc_to_core() changes carried shop goods only when no_charge or
        // billing applies. Ordinary carried objects are source-inert here.
        if (obj.no_charge || obj.unpaid) {
            throw new UnsupportedPositionCheckError(
                'random relocation of carried shop goods',
            );
        }
    }
    if (monster.wormno
        || monster === env.state.u?.ustuck
        || monster.mtrapped
        || monster.mundetected
        || env.state.occupation
        || (monster.mstrategy & STRAT_APPEARMSG)) {
        throw new UnsupportedPositionCheckError(
            'extended rloc_to_core side effects',
        );
    }
    return {
        ...env,
        newsym: requiredRelocationOperation(env, 'newsym'),
        onscary: requiredRelocationOperation(env, 'onscary'),
        setApparxy: requiredRelocationOperation(env, 'setApparxy'),
    };
}

// C refs: teleport.c rloc() and the ordinary live-monster subset of
// rloc_to_core(). Random trials and exhaustive fallback shuffling retain their
// exact source PRNG bounds. Extended placement effects remain explicit seams.
export function rloc(monster, rlocflags = 0, rawEnv = {}) {
    const env = preflightOrdinaryRloc(monster, rlocflags, rawEnv);

    // Source makes fifty independent whole-map attempts before its fallback.
    for (let attempt = 0; attempt < 50; ++attempt) {
        const x = env.random.rnd(COLNO - 1);
        const y = env.random.rn2(ROWNO);
        if (rlocPositionOk(x, y, monster, env))
            return finishRandomRelocation(monster, x, y, env);
    }

    let flags = CC_INCL_CENTER | CC_UNSHUFFLED | CC_SKIP_MONS;
    if (!passes_walls(monster.data)) flags |= CC_SKIP_INACCS;
    const candidates = collect_coords(
        Math.trunc(COLNO / 2),
        Math.trunc(ROWNO / 2),
        0,
        flags,
        null,
        env,
    );
    let backup = null;
    for (let index = 0; index < candidates.length; ++index) {
        const offset = env.random.rn2(candidates.length - index);
        if (offset) {
            const other = index + offset;
            [candidates[index], candidates[other]] = [
                candidates[other],
                candidates[index],
            ];
        }
        const { x, y } = candidates[index];
        if (rlocPositionOk(x, y, monster, env))
            return finishRandomRelocation(monster, x, y, env);
        if (!backup && goodpos(x, y, monster, 0, env))
            backup = { x, y };
    }
    return backup
        ? finishRandomRelocation(monster, backup.x, backup.y, env)
        : false;
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

function blocksTeleporting(monster) {
    return is_dlord(monster.data) || is_dprince(monster.data);
}

// C ref: teleport.c m_blocks_teleporting() and noteleport_level(). Demon
// courts inspect only living, on-map monsters, as get_iter_mons() does.
export function noteleport_level(monster, state = game) {
    if (currentDungeonIsHellish(state)
        && !is_dlord(monster.data)
        && !is_dprince(monster.data)) {
        for (let current = state.level?.monlist ?? null;
            current;
            current = current.nmon) {
            if (current.mhp < 1
                || (current.mstate ?? MON_FLOOR) !== MON_FLOOR) {
                continue;
            }
            if (blocksTeleporting(current)) return true;
        }
    }
    if (state.level?.flags?.noteleport && !is_covetous(monster.data))
        return true;
    return Math.trunc(state.level?.flags?.stasis_until ?? 0)
        >= Math.trunc(state.moves ?? 0);
}

function monsterTeleportOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(
            `monster teleport requires a ${name} operation`,
        );
    }
    return operation;
}

function heroBlind(state) {
    const property = state.u?.uprops?.[BLINDED];
    return (Boolean(property?.intrinsic || property?.extrinsic)
        && !property?.blocked)
        || Boolean(state.u?.uroleplay?.blind);
}

function fixedRelocationSuffix(monster, oldX, oldY, state) {
    const distance = dist2(
        monster.mx,
        monster.my,
        state.u.ux,
        state.u.uy,
    );
    if (distance <= 2) return ' next to you';
    if (distance <= BOLT_LIM * BOLT_LIM) return ' close by';
    const oldDistance = dist2(oldX, oldY, state.u.ux, state.u.uy);
    if (oldDistance === distance) return '';
    return distance < oldDistance
        ? ' closer to you'
        : ' farther away';
}

function fixedArrivalSuffix(monster, state) {
    const distance = dist2(
        monster.mx,
        monster.my,
        state.u.ux,
        state.u.uy,
    );
    if (distance <= 2) return ' next to you';
    return distance <= BOLT_LIM * BOLT_LIM ? ' close by' : '';
}

// C ref: teleport.c rloc_to_core() with RLOC_MSG, bounded to the ordinary
// fixed-destination monster path reached by a current D:1 teleport trap.
async function relocateToFixedDestination(monster, x, y, env) {
    const { state } = env;
    const redraw = monsterTeleportOperation(env, 'newsym');
    const setApparxy = monsterTeleportOperation(env, 'setApparxy');
    const message = env.message ?? ttyPline;
    if (typeof message !== 'function')
        throw new TypeError('monster teleport requires a message operation');
    const oldX = monster.mx;
    const oldY = monster.my;
    const name = capitalizedMonsterName(monster, state);
    let appearMessage = Boolean(monster.mstrategy & STRAT_APPEARMSG);
    const oldSpotted = canSpotMonster(monster, state);
    const sensedAtOldSquare = sensesMonster(monster, state);
    let teleportMessage = false;

    if (oldSpotted) {
        if (couldsee(x, y, state) || sensedAtOldSquare) {
            teleportMessage = true;
        } else {
            await message(`${name} vanishes!`, state);
        }
        appearMessage = false;
    }

    relocate_monster(monster, x, y, state);
    redraw(oldX, oldY, env);
    redraw(monster.mx, monster.my, env);
    setApparxy(monster, env);

    const newSpotted = canSpotMonster(monster, state);
    const sensedAtNewSquare = sensesMonster(monster, state);
    if (newSpotted || appearMessage) {
        monster.mstrategy &= ~STRAT_APPEARMSG;
        if (teleportMessage
            && (couldsee(monster.mx, monster.my, state)
                || sensedAtNewSquare)) {
            await message(
                `${name} vanishes and reappears`
                + `${fixedRelocationSuffix(
                    monster,
                    oldX,
                    oldY,
                    state,
                )}.`,
                state,
            );
        } else {
            await message(
                `${appearMessage ? name.replace(/^The /u, 'A ') : name}`
                + `${appearMessage ? ' suddenly' : ''} `
                + `${heroBlind(state) ? 'arrives' : 'appears'}`
                + `${fixedArrivalSuffix(monster, state)}!`,
                state,
            );
        }
    }
}

// C ref: teleport.c mtele_trap(), bounded to ordinary fixed or random D:1
// destinations. Leashed pets and one-shot vault teleportation retain their
// explicit future owners.
export async function mtele_trap(
    monster,
    trap,
    inSight,
    rawEnv = {},
) {
    const env = teleportEnv(rawEnv);
    const { state } = env;
    if (noteleport_level(monster, state)) return;
    if (monster === state.u?.usteed) return;
    if (monster.mleashed) {
        throw new UnsupportedPositionCheckError(
            'leashed-pet teleportation',
        );
    }
    if (trap.once) {
        throw new UnsupportedPositionCheckError(
            'one-shot vault teleportation',
        );
    }
    const message = inSight ? (env.message ?? ttyPline) : null;
    if (inSight && typeof message !== 'function') {
        throw new TypeError(
            'monster teleport requires a message operation',
        );
    }
    const seeTrap = inSight
        ? monsterTeleportOperation(env, 'seeTrap')
        : null;

    const name = capitalizedMonsterName(monster, state);
    const destinationX = trap.teledest?.x;
    const destinationY = trap.teledest?.y;
    if (isok(destinationX, destinationY)) {
        if (!m_at(destinationX, destinationY, state)
            && (state.u.ux !== destinationX
                || state.u.uy !== destinationY)) {
            await relocateToFixedDestination(
                monster,
                destinationX,
                destinationY,
                env,
            );
        }
    } else {
        rloc(monster, 0, env);
    }

    if (inSight) {
        await message(
            canSeeMonster(monster, state)
                ? `${name} seems disoriented.`
                : `${name} suddenly disappears!`,
            state,
        );
        seeTrap(trap, env);
    }
}

// C ref: teleport.c mlevel_tele_trap(), bounded to an ordinary D:1 monster
// falling through a hole or trap door. Portal, level-teleport, leash, steed,
// stronghold, bottom-level, and forced-off-level branches are future work.
export async function mlevel_tele_trap(
    monster,
    trap,
    forceIt,
    inSight,
    rawEnv = {},
) {
    const env = teleportEnv(rawEnv);
    const { state } = env;
    const trapType = trap?.ttyp ?? NO_TRAP;
    if (monster === state.u?.ustuck) return 'finished';
    if (monster === state.u?.usteed) return 'finished';
    if (monster.mleashed) {
        throw new UnsupportedPositionCheckError(
            forceIt
                ? 'forced leashed-pet level teleportation'
                : 'leashed-pet level teleportation',
        );
    }
    if (trapType !== HOLE && trapType !== TRAPDOOR) {
        throw new UnsupportedPositionCheckError(
            'non-hole monster level teleportation',
        );
    }
    if (!trap.dst
        || !Number.isInteger(trap.dst.dnum)
        || !Number.isInteger(trap.dst.dlevel)) {
        throw new TypeError(
            'monster level teleport requires a destination level',
        );
    }
    const migrateToLevel = monsterTeleportOperation(
        env,
        'migrateToLevel',
    );
    const seeTrap = inSight
        ? monsterTeleportOperation(env, 'seeTrap')
        : null;
    const message = env.message ?? ttyPline;
    if (inSight && typeof message !== 'function') {
        throw new TypeError(
            'monster teleport requires a message operation',
        );
    }

    if (inSight) {
        await message(
            `Suddenly, ${monsterCommonName(monster, state)} `
            + `${trapType === HOLE
                ? 'falls into a hole'
                : 'falls through a trap door'}.`,
            state,
        );
        seeTrap(trap, env);
    }
    migrateToLevel(
        monster,
        ledger_no(trap.dst, state),
        MIGR_RANDOM,
        null,
        env,
    );
    return 'moved';
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

// ── Hero relocation (C ref: teleport.c teleds()) ──

// C ref: teleport.c teleds() (448-573). Puts the hero on <nux,nuy> and runs
// everything a changed hero square implies: ball and chain, vision, terrain,
// regions and spoteffects(). steed.c mount_steed() and dismount_steed() are
// its only ported callers and both pass TELEDS_ALLOW_DRAG.
//
// Four families of arm refuse rather than run, each named at its site: the
// punishing ball, an engulfed hero, a hero disguised as a mimic, and the vault
// guard. The `is_teleport` message at 545-547 refuses too, because no ported
// caller passes TELEDS_TELEPORT and its "You materialize in ..." line has
// never been recorded.
export async function teleds(nux, nuy, teleds_flags, state = game) {
    const u = state.u;
    let allow_drag = (teleds_flags & TELEDS_ALLOW_DRAG) !== 0;
    const is_teleport = (teleds_flags & TELEDS_TELEPORT) !== 0;
    const vault_guard = vault_occupied(u.urooms, state);

    if (vault_guard) {
        // findgd() and uleftvault() own the guard's shrill whistle.
        throw new UnsupportedHeroMoveBoundaryError(
            'teleds() out of an occupied vault',
        );
    }
    if (u.utraptype === TT_BURIEDBALL) {
        throw new UnsupportedHeroMoveBoundaryError(
            'teleds() unearthing a buried ball',
        );
    }
    const ball_active = Boolean(state.uball)
        && state.uball.where !== OBJ_FREE;
    if (ball_active) {
        // drag_ball(), move_bc(), unplacebc() and placebc() have no owner.
        throw new UnsupportedHeroMoveBoundaryError(
            'teleds() dragging a punishing ball',
        );
    }
    // With no active ball this is always FALSE, so every later use of it is
    // dead; it is written out because it is what decides whether the ball is
    // dragged or teleported, and that decision returns the moment a punishing
    // hero is admitted.
    if (!ball_active
        || near_capacity(state) > SLT_ENCUMBER
        || distmin(u.ux, u.uy, nux, nuy) > 1)
        allow_drag = false;

    // The destination admission seam domove() uses. teleds() has no seam of
    // its own, and spoteffects() below depends on the same guarantees.
    requireSimpleHeroDestination(nux, nuy, state);

    reset_utrap(false, state);
    const was_swallowed = u.uswallow; /* set_ustuck(null) clears uswallow */
    set_ustuck(null, state);
    u.ux0 = u.ux;
    u.uy0 = u.uy;

    if (state.youmonst?.data?.mlet === S_MIMIC) {
        // hideunder() and the M_AP_NOTHING reset belong to a hero polymorphed
        // into a mimic, which nothing in this port can do.
        throw new UnsupportedHeroMoveBoundaryError(
            'teleds() with the hero disguised as a mimic',
        );
    }
    if (was_swallowed) {
        throw new UnsupportedHeroMoveBoundaryError(
            'teleds() out of an engulfer',
        );
    }

    /* must set u.ux, u.uy after drag_ball() */
    u_on_newpos(nux, nuy, state);
    fill_pit(u.ux0, u.uy0, state);
    update_player_regions(state);
    /*
     *  Make sure the hero disappears from the old location, and force a full
     *  vision recalculation because the hero is now in a new location.
     */
    newsym(u.ux0, u.uy0);
    see_monsters(state);
    state.vision_full_recalc = 1;
    nomul(0, state);
    notice_mon_off(state);
    vision_recalc(0, { state }); /* vision before effects */

    if (is_teleport && state.flags?.verbose) {
        throw new UnsupportedHeroMoveBoundaryError(
            'teleds() announcing a teleport',
        );
    }
    /* if terrain type changes, levitation or flying might become blocked or
       unblocked; do this after map+vision has been updated */
    if (state.level.at(u.ux, u.uy).typ !== state.level.at(u.ux0, u.uy0).typ)
        switch_terrain(state);
    /* possible shop entry message comes after guard's shrill whistle */
    await spoteffects(true, state);
    invocation_message(state);
    notice_mon_on(state);
    await notice_all_mons(true, state);
}
