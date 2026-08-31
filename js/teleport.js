// Monster destination selection and short-range relocation, plus the hero's
// own level teleport and within-level teleport.
// C ref: teleport.c goodpos(), enexto(), enexto_core(), collect_coords(),
// teleok(), scrolltele(), tele(), level_tele(), random_teleport_level();
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
    CONFUSION,
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
    FLYING,
    LEVITATION,
    STUNNED,
    TELEDS_ALLOW_DRAG,
    TELEDS_TELEPORT,
    TELEPORT_CONTROL,
    TRAPDOOR,
    TT_BURIEDBALL,
    UTOTYPE_NONE,
    VIBRATING_SQUARE,
    WATER,
    W_NONPASSWALL,
    ZAP_POS,
    In_quest,
    Is_botlevel,
    is_pit,
    is_hole,
    isok,
} from './const.js';
import {
    In_hell,
    Is_special,
    On_W_tower_level,
    depth,
    dunlev_reached,
    dunlevs_in_dungeon,
    get_level,
    ledger_no,
    lev_by_name,
    on_level,
    print_dungeon,
    single_level_branch,
    u_on_newpos,
} from './dungeon.js';
import {
    capitalizedMonsterName,
    monsterCommonName,
} from './do_name.js';
import { newsym, see_monsters } from './display.js';
import {
    schedule_goto,
    UnsupportedLevelChangeError,
} from './do.js';
import { next_to_u } from './apply_next_to_u.js';
import { engr_at } from './engrave.js';
import { getlin } from './windows.js';
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
import { rn2, rnd, rnl } from './rng.js';
import {
    canSeeMonster,
    canSpotMonster,
    sensesMonster,
} from './startup_a11y.js';
import { getpos } from './getpos.js';
import { in_out_region } from './region.js';
import { make_blinded } from './potion.js';
import { fill_pit, reset_utrap, t_at, unconscious } from './trap.js';
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
    // teleport.c:1761-1762 ends rloc_to_core() with `if (go.occupation)
    // (void) dochugw(mtmp, FALSE);`, whose stop_occupation() has no port.
    // cmd.c set_occupation() writes that value to state.go.occupation, so this
    // names that field rather than a bare one nothing assigns.
    if (monster.wormno
        || monster === env.state.u?.ustuck
        || monster.mtrapped
        || monster.mundetected
        || env.state.go?.occupation
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
    // C ref: teleport.c rloc_to_core() calls Monnam(mtmp) three times, at 1666
    // before the move and at 1714 and 1722 after it, rather than once into a
    // buffer. That matters now that do_name.c x_monnam()'s do_it arm is
    // ported: the name depends on canspotmon(), and the whole point of this
    // function is that the monster changes square between the two reads. A
    // monster the hero cannot spot where it stands but can spot where it
    // lands is named "It" before the move and by its species after it.
    let appearMessage = Boolean(monster.mstrategy & STRAT_APPEARMSG);
    const oldSpotted = canSpotMonster(monster, state);
    const sensedAtOldSquare = sensesMonster(monster, state);
    let teleportMessage = false;

    if (oldSpotted) {
        if (couldsee(x, y, state) || sensedAtOldSquare) {
            teleportMessage = true;
        } else {
            await message(
                `${capitalizedMonsterName(monster, state)} vanishes!`,
                state,
            );
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
                `${capitalizedMonsterName(monster, state)}`
                + ' vanishes and reappears'
                + `${fixedRelocationSuffix(
                    monster,
                    oldX,
                    oldY,
                    state,
                )}.`,
                state,
            );
        } else {
            // do_name.c Amonnam() is x_monnam() with ARTICLE_A, and its do_it
            // term tests only `article != ARTICLE_YOUR`, so an unspottable
            // monster is "It" under either article and the article swap below
            // finds no leading "The " to replace.
            const arrivalName = capitalizedMonsterName(monster, state);
            await message(
                `${appearMessage
                    ? arrivalName.replace(/^The /u, 'A ') : arrivalName}`
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

// C ref: teleport.c rloc_to(), which is rloc_to_core() with RLOC_NOMSG,
// bounded to a monster arriving on a level it is not yet placed on. dog.c
// mon_arrive() is its only ported caller and reaches it with `mtmp->mx == 0`,
// which is what lets the whole "pick up the monster" block at the top of
// rloc_to_core() be skipped rather than ported: there is no old square to
// clear, redraw or unhide.
//
// Every message in rloc_to_core() is suppressed by RLOC_NOMSG, and the
// shopkeeper, shop-goods, occupation and trap tails below the placement each
// refuse rather than run.
export function rloc_to(monster, x, y, rawEnv = {}) {
    const env = teleportEnv(rawEnv);
    const { state } = env;
    if (monster.mx) {
        throw new UnsupportedPositionCheckError(
            'rloc_to() for a monster already on the map',
        );
    }
    // The occupation term names state.go.occupation, cmd.c set_occupation()'s
    // home for C's go.occupation, so the tail at teleport.c:1761-1762 refuses
    // instead of being skipped by a field nothing assigns.
    if (monster.isshk || monster.wormno || monster === state.u?.ustuck
        || monster.mtrapped || state.go?.occupation) {
        throw new UnsupportedPositionCheckError(
            'extended rloc_to_core side effects',
        );
    }
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.no_charge || obj.unpaid) {
            throw new UnsupportedPositionCheckError(
                'rloc_to() of carried shop goods',
            );
        }
    }

    mon_track_clear(monster);
    place_monster(monster, x, y, state);
    update_monster_region(monster, state);
    // maybe_unhide_at(x, y) calls hideunder() for a monster whose mundetected
    // is set; an arriving follower's is clear, because dog.c relmon() cleared
    // it as the monster left the level it came from.
    newsym(x, y);
    // set_apparxy() takes monmove.c:2211's first branch whatever the monster
    // is: dog.c mon_arrive() has just written the hero's own square into
    // mux/muy, so its `u_at(mx, my)` clause holds and it returns before
    // reaching a displacement roll. That assignment is what dog.c:450 calls
    // keeping mnexto(rloc_to(set_apparxy())) off stale data.
    monster.mux = state.u.ux;
    monster.muy = state.u.uy;
    return monster;
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
    // C's rloc_to() ends in set_apparxy(). Three ported callers reach this
    // function, and each takes one of set_apparxy()'s two early returns and
    // draws nothing, so the pair of assignments below writes what the source
    // would have written:
    //
    // - js/dog.js mon_arrive() has already written the hero's own square into
    //   mux/muy, so monmove.c:2211's `u_at(mx, my)` clause holds whatever the
    //   monster is.
    // - js/allmain.js newgame() moves the monster mklev() left on the arrival
    //   staircase. That one still carries js/monst.js's `mux: 0`, because
    //   makemon() skips set_apparxy() while in_mklev is set, so :2211 fails.
    //   It reaches :2233 instead: makemon() gave it mcansee, the hero is
    //   neither invisible nor displaced nor underwater, so displ is 0.
    // - js/do.js u_collide_m() moves a monster off the square the hero landed
    //   on. One that came down with her passed through mon_arrive() and takes
    //   :2211; one mklev() left on the staircase takes :2233, exactly as the
    //   caller above.
    //
    // Nothing here enforces that. A caller whose monster is blind, or one
    // reached while the hero is invisible, displaced or underwater, would take
    // set_apparxy()'s displacement path and spend an rn2 this stand-in does
    // not.
    relocated.mux = state.u.ux;
    relocated.muy = state.u.uy;
    return relocated;
}

// ── Hero within-level teleport (C ref: teleport.c teleok/scrolltele/tele) ──

// C ref: teleport.c teleok() (420-445).
export async function teleok(x, y, trapok, state = game) {
    if (!trapok) {
        const trap = t_at(x, y, state);
        if (!trap)
            trapok = true;
        else if (trap.ttyp === VIBRATING_SQUARE)
            trapok = true;
        else if ((is_pit(trap.ttyp) || is_hole(trap.ttyp))
            && (Levitation_prop(state) || Flying_prop(state)))
            trapok = true;
        if (!trapok)
            return false;
    }
    if (!goodpos(x, y, state.youmonst, 0, { state }))
        return false;
    if (!teleJumpOk(state.u.ux, state.u.uy, x, y, state))
        return false;
    if (!await in_out_region(x, y, { state }))
        return false;
    return true;
}

function Levitation_prop(state) {
    const p = state.u?.uprops?.[LEVITATION];
    return Boolean((p?.intrinsic || p?.extrinsic) && !p?.blocked);
}

function Flying_prop(state) {
    const p = state.u?.uprops?.[FLYING];
    return Boolean((p?.intrinsic || p?.extrinsic) && !p?.blocked);
}

function Teleport_control_prop(state) {
    const p = state.u?.uprops?.[TELEPORT_CONTROL];
    return Boolean((p?.intrinsic || p?.extrinsic) && !p?.blocked);
}

function Stunned_prop(state) {
    return Boolean(state.u?.uprops?.[STUNNED]?.intrinsic);
}

// C ref: teleport.c scrolltele() (849-915). Controlled teleport path only;
// the uncontrolled fallback (safe_teleds) is left for a future slice.
async function scrolltele(scroll, state = game) {
    const message = ttyPline;

    if (noteleport_level(state.youmonst, state) && !state.wizard) {
        await message("A mysterious force prevents you from teleporting!", state);
        return;
    }

    if (!heroBlind(state))
        await make_blinded(0, false, state);

    if ((state.u?.uhave?.amulet || On_W_tower_level(state.u.uz, state))
        && !rn2(3)) {
        await message("You feel disoriented for a moment.", state);
        return;
    }

    if ((Teleport_control_prop(state) && !Stunned_prop(state))
        || state.wizard) {
        if (unconscious(state)) {
            await message(
                "Being unconscious, you cannot control your teleport.",
                state,
            );
        } else {
            const whobuf = state.u?.usteed
                ? `you and ${monsterCommonName(state.u.usteed, state)}`
                : 'you';
            await message(
                `Where do ${whobuf} want to be teleported?`,
                state,
            );
            const cc = { x: state.u.ux, y: state.u.uy };
            const tcc = state.iflags?.travelcc;
            if (tcc && isok(tcc.x, tcc.y)) {
                cc.x = tcc.x;
                cc.y = tcc.y;
            }
            if (await getpos(cc, true, 'the desired position', state) < 0)
                return;
            if (await teleok(cc.x, cc.y, false, state)) {
                await teleds(cc.x, cc.y, TELEDS_TELEPORT, state);
                if (state.iflags?.travelcc
                    && state.u.ux === state.iflags.travelcc.x
                    && state.u.uy === state.iflags.travelcc.y) {
                    state.iflags.travelcc.x = 0;
                    state.iflags.travelcc.y = 0;
                }
                return;
            }
            await message('Sorry...', state);
        }
    }

    throw new UnsupportedHeroMoveBoundaryError(
        'scrolltele: uncontrolled teleport (safe_teleds) unported',
    );
}

// C ref: teleport.c tele() (842-845).
export async function tele(state = game) {
    await scrolltele(null, state);
}

// ── Hero relocation (C ref: teleport.c teleds()) ──

// C ref: teleport.c teleds() (448-573). Puts the hero on <nux,nuy> and runs
// everything a changed hero square implies: ball and chain, vision, terrain,
// regions and spoteffects(). scrolltele() (controlled teleport) is the newest
// caller; steed.c mount_steed() and dismount_steed() also call it with
// TELEDS_ALLOW_DRAG.
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

    // teleds() itself tests nothing about who is standing on <nux,nuy>: it
    // moves the hero there at 525 and leaves the consequence to
    // spoteffects(TRUE) at 568. The arm that answers is hack.c:3417-3455,
    // `if ((mtmp = m_at(u.ux, u.uy)) != 0 && !u.uswallow)`, which drops a
    // piercer on the hero or has the resident monster attack by surprise and
    // then calls mnexto() to move it aside. None of that is ported, and unlike
    // the hack.js callers of the seam below -- which never arrive on an
    // occupied square, because uhitm.c do_attack() claims one first -- a
    // teleport destination can hold a monster, so the test belongs here.
    if (m_at(nux, nuy, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'teleds() onto an occupied square',
        );
    }

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

    // C ref: teleport.c:545-547.
    if (is_teleport && state.flags?.verbose) {
        const same = (nux === u.ux0 && nuy === u.uy0);
        await ttyPline(
            `You materialize in ${same ? 'the same' : 'a different'} location!`,
            state,
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

// youprop.h:83-84 defines Confusion as the bare intrinsic field, with neither
// an extrinsic nor a blocked term.
function Confusion(state) {
    return Boolean(state.u?.uprops?.[CONFUSION]?.intrinsic);
}

// The comparison recorder's atoi() reaches strtol() and then stores the
// result in a signed int. Match that concrete LP64 ABI: ASCII whitespace,
// optional sign, a decimal prefix, long saturation, then low-32-bit narrowing.
// level_tele() deliberately accepts the prefix, so "2foo" still means level 2.
const LONG_MAX = (1n << 63n) - 1n;
const LONG_MIN = -(1n << 63n);

export function cAtoi(text) {
    const match = /^[ \t\n\v\f\r]*([+-]?[0-9]+)/.exec(String(text));
    if (!match) return 0;
    let wide = BigInt(match[1]);
    if (wide > LONG_MAX) wide = LONG_MAX;
    else if (wide < LONG_MIN) wide = LONG_MIN;
    return Number(BigInt.asIntN(32, wide));
}

// C ref: teleport.c random_teleport_level() (2191-2257). Selects a random
// destination depth relative to the current dungeon. The 1-in-5 early return,
// the single-level-branch early return, and the endgame early return all hand
// back cur_depth, which makes the caller's same-level shudder check fire
// whenever no other level is reachable.
export function random_teleport_level(state = game) {
    const cur_depth = depth(state.u.uz, state);

    /* [the endgame case can only occur in wizard mode] */
    if (!rn2(5) || single_level_branch(state.u.uz, state)
        || inEndgame(state)) {
        return cur_depth;
    }

    let min_depth, max_depth;
    if (In_quest(state.u.uz)) {
        let bottom = dunlevs_in_dungeon(state.u.uz, state);
        const qlocate_depth = state.qlocate_level?.dlevel ?? 0;

        /* if hero hasn't reached the middle locate level yet,
           no one can randomly teleport past it */
        if (dunlev_reached(state.u.uz, state) < qlocate_depth)
            bottom = qlocate_depth;
        min_depth = state.dungeons[state.u.uz.dnum].depth_start;
        max_depth = bottom + (state.dungeons[state.u.uz.dnum].depth_start - 1);
    } else {
        min_depth = 1;
        max_depth = dunlevs_in_dungeon(state.u.uz, state)
            + (state.dungeons[state.u.uz.dnum].depth_start - 1);
        /* can't reach Sanctum if the invocation hasn't been performed */
        if (In_hell(state.u.uz, state) && !state.u?.uevent?.invoked)
            max_depth -= 1;
    }

    /* Get a random value relative to the current dungeon */
    /* Range is 1 to current+3, current not counting */
    let nlev = rn2(cur_depth + 3 - min_depth) + min_depth;
    if (nlev >= cur_depth) nlev++;

    if (nlev > max_depth) {
        nlev = max_depth;
        /* teleport up if already on bottom */
        if (Is_botlevel(state.u.uz))
            nlev -= rnd(3);
    }
    if (nlev < min_depth) {
        nlev = min_depth;
        if (nlev === cur_depth) {
            nlev += rnd(3);
            if (nlev > max_depth)
                nlev = max_depth;
        }
    }
    return nlev;
}

// C ref: teleport.c level_tele() (1164-1424). Covered here: the prompt and
// literal-answer classification, recorder-ABI decimal conversion, topology
// resolution for an ordinary positive main-dungeon destination, its guards,
// schedule_goto(), and the confused random_levtport path through
// random_teleport_level(). Named, non-positive, special-level and other
// explicitly unsupported destinations stop at their source branch.
//
// teleport.c:1174-1184's iflags.debug_fuzzer arm is omitted rather than
// refused, for the reason cmd.c can_do_extcmd()'s fuzzer arm is: nothing in
// this port writes that flag.
export async function level_tele(state = game) {
    // Two guards need `!wizard` and so cannot fire for the port's only
    // caller, wizcmds.c wiz_level_tele(): 1185-1189's "You feel very
    // disoriented for a moment." and 1190's `(Teleport_control && !Stunned)
    // || wizard`, whose else arm is the random_levtport label. Neither of
    // their operands has a side effect, so collapsing both to this one
    // refusal changes no random-number call and no output. teleport.c
    // level_tele_trap() is the caller that reaches them, and it is unported.
    if (!state.wizard) {
        throw new UnsupportedLevelChangeError(
            'level_tele() for a hero who is not in wizard mode',
        );
    }

    let newlev;
    let randomPath = false;

    const qbuf = 'To what level do you want to teleport?';
    // C counts prompts in `trycnt` and appends
    // " [type a number, name, or ? for a menu]" when `++trycnt == 2`. Only
    // the do/while at 1250 starts that second pass, and its condition reads
    // the `newlev` that lev_by_name() and atoi() produce, so the refusal at
    // the end of this function precedes it and the suffix is unreachable.
    if (state.iflags?.menu_requested) {
        state.iflags.menu_requested = false;
        // 1196-1202: wizard mode's `m ^V` skips the prompt entirely and
        // jumps to the levTport_menu label, which is print_dungeon().
        throw new UnsupportedLevelChangeError(
            "level_tele() reaching print_dungeon() for the 'm' prefix",
        );
    }
    // C's `*buf = '\0'` before getlin() matters only under EDIT_GETLIN, which
    // include/config.h:655 leaves undefined, so tty_getlin() ignores whatever
    // the buffer held and this port has nothing to clear.
    const buf = await getlin(qbuf, state);
    if (buf === '*') {
        throw new UnsupportedLevelChangeError(
            'level_tele() random_levtport for "*"',
        );
    }
    // rnl() is drawn only for a confused hero, so an unconfused one costs no
    // randomness. The draw comes before the Escape test below, which is why a
    // confused hero can be sent elsewhere by a keystroke meant to cancel.
    if (Confusion(state) && rnl(5)) {
        await ttyPline('Oops...', state);
        randomPath = true;
    }

    if (randomPath) {
        // C label: random_levtport (teleport.c:1293-1298). Picks a random
        // level and returns early if it matches the current depth.
        newlev = random_teleport_level(state);
        if (newlev === depth(state.u.uz, state)) {
            await ttyPline('You shudder for a moment.', state);
            return;
        }
    } else {
        // Prompt-path validation (inside C's `if ((Teleport_control &&
        // !Stunned) || wizard)` block, lines 1218-1291).
        if (buf === '\x1B') return; /* cancelled */
        // 1221: `wizard && !strcmp(buf, "?")`, whose first operand this
        // function has already established.
        if (buf === '?') {
            // C: levTport_menu label (1225-1247). print_dungeon(TRUE) shows
            // a selectable dungeon overview; force_dest = TRUE skips all the
            // numeric-answer validation below and goes straight to
            // schedule_goto.
            const dest = await print_dungeon(state);
            if (!dest) return;  // C: `if (!newlev) return;`

            const newlevel = { dnum: dest.dnum, dlevel: dest.dlevel };
            // C:1234-1246 endgame-amulet branch: when the selected level is
            // in the endgame and the hero is not, wizard mode conjures the
            // Amulet of Yendor. No witness session exercises this path.
            const inEndgame = newlevel.dnum === state.astral_level?.dnum;
            const heroInEndgame =
                state.u.uz.dnum === state.astral_level?.dnum;
            if (inEndgame && !heroInEndgame) {
                throw new UnsupportedLevelChangeError(
                    'level_tele() endgame-amulet branch '
                    + 'via print_dungeon menu',
                );
            }
            // C:1301-1302 buried_ball_to_punishment() runs unconditionally,
            // outside any !force_dest guard.
            if (state.u.utrap && state.u.utraptype === TT_BURIEDBALL) {
                throw new UnsupportedLevelChangeError(
                    'level_tele() with the hero tethered to a buried ball',
                );
            }
            // force_dest = TRUE: skip single_level_branch, In_quest,
            // next_to_u, In_endgame, negative-level heaven, find_hell, and
            // get_level.
            schedule_goto(
                newlevel,
                UTOTYPE_NONE,
                null,
                state.flags?.verbose
                    ? 'You materialize on a different level!'
                    : null,
                state,
            );
            return;
        }
        const namedLevel = lev_by_name(buf, state);
        newlev = namedLevel || cAtoi(buf);

        // The prompt path begins with a positive decimal answer. Retain the
        // previous fail-closed boundary for invalid retries, named/special
        // levels, Nowhere, and the negative-level heaven and escape paths.
        if (namedLevel || newlev <= 0) {
            throw new UnsupportedLevelChangeError(
                'level_tele() resolving a non-positive or named destination',
            );
        }

        if (single_level_branch(state.u.uz, state)) {
            await ttyPline('You shudder for a moment.', state);
            return;
        }
        // C ref: teleport.c:1282-1291. In the Quest the status line shows
        // "Home 1", "Home 2", etc., relative depths, so a controlled-teleport
        // answer is relative too. Convert it to the absolute depth the common
        // tail expects by adding depth_start - 1.
        if (Number.isInteger(state.quest_dnum)
            && state.u.uz.dnum === state.quest_dnum
            && newlev > 0) {
            newlev = newlev
                + state.dungeons[state.u.uz.dnum].depth_start - 1;
        }
    }

    // Common tail (teleport.c:1301-1428): both the prompt path and the
    // random_levtport path reach here.  force_dest is FALSE for both.
    if (state.u.utrap && state.u.utraptype === TT_BURIEDBALL) {
        throw new UnsupportedLevelChangeError(
            'level_tele() with the hero tethered to a buried ball',
        );
    }
    if (!next_to_u(state)) {
        await ttyPline('You shudder for a moment.', state);
        return;
    }
    if (state.astral_level
        && state.u.uz.dnum === state.astral_level.dnum) {
        throw new UnsupportedLevelChangeError(
            'level_tele() from the endgame',
        );
    }

    const newlevel = { dnum: 0, dlevel: 0 };
    if (state.medusa_level
        && state.u.uz.dnum === state.medusa_level.dnum
        && newlev >= state.dungeons[state.u.uz.dnum].depth_start
                     + state.dungeons[state.u.uz.dnum].num_dunlevs) {
        throw new UnsupportedLevelChangeError(
            'level_tele() finding the entrance to Gehennom',
        );
    }

    // For an ordinary level of the main dungeon, qbranch is the Sanctum and
    // `deepest` is used only by the same-level error wording below. The
    // invocation clamp is guarded by !wizard and cannot fire here.
    const qbranch = state.sanctum_level;
    const deepest = state.dungeons[qbranch.dnum].depth_start
        + state.dungeons[qbranch.dnum].num_dunlevs - 1;
    get_level(newlevel, newlev, state);

    if (on_level(newlevel, state.u.uz) && newlev !== depth(state.u.uz, state)) {
        await ttyPline(
            `You can't get there from ${newlev > deepest ? 'anywhere' : 'here'}.`,
            state,
        );
        return;
    }

    // A numeric depth can be occupied by a special level even though
    // lev_by_name() returned zero. C has no guard here; it proceeds to
    // schedule_goto() unconditionally. This JS guard refuses only special
    // levels whose loaders are not yet ported: quest special levels now
    // have loaders, and the random_levtport path skips this guard because
    // C applies no Is_special() check after random_teleport_level().
    if (!randomPath && Is_special(newlevel, state)
        && !In_quest(newlevel)) {
        throw new UnsupportedLevelChangeError(
            'level_tele() resolving a numeric special-level destination',
        );
    }

    schedule_goto(
        newlevel,
        UTOTYPE_NONE,
        null,
        state.flags?.verbose
            ? 'You materialize on a different level!'
            : null,
        state,
    );
}
