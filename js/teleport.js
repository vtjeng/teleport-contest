// Monster destination selection and short-range relocation, plus the hero's
// own level teleport and within-level teleport.
// C ref: teleport.c goodpos(), m_blocks_teleporting(), tele_jump_ok(),
// enexto(), enexto_core(), collect_coords(),
// teleok(), scrolltele(), tele(), level_tele(), random_teleport_level(),
// rloc_pos_ok(), stairway_find_forwiz(), rloc_to_core(), rloc_to_flag(),
// rloc_to(), rloc(), control_mon_tele() and u_teleport_mon().

import {
    ALTAR,
    ANTIMAGIC,
    BLINDED,
    BOLT_LIM,
    CC_INCL_CENTER,
    CC_NO_FLAGS,
    CC_RING_PAIRS,
    CC_SKIP_INACCS,
    CC_SKIP_MONS,
    CC_UNSHUFFLED,
    COLNO,
    SHOPBASE,
    CONFUSION,
    DIED,
    KILLED_BY,
    GP_ALLOW_U,
    GP_ALLOW_XY,
    GP_AVOID_MONPOS,
    GP_CHECKSCARY,
    HOLE,
    IS_STWALL,
    MAGIC_PORTAL,
    LR_MONGEN,
    MIGR_RANDOM,
    MIGR_PORTAL,
    MM_IGNORELAVA,
    MM_IGNOREWATER,
    NO_MM_FLAGS,
    NO_TRAP,
    NO_TRAP_FLAGS,
    NO_KILLER_PREFIX,
    OBJ_FREE,
    PASSES_WALLS,
    RLOC_MSG,
    RLOC_NOMSG,
    RLOC_ERR,
    ROWNO,
    TEMPLE,
    SLT_ENCUMBER,
    STRAT_APPEARMSG,
    FLYING,
    LEVITATION,
    STUNNED,
    SWIMMING,
    MAGICAL_BREATHING,
    TELEDS_ALLOW_DRAG,
    TELEDS_TELEPORT,
    TELEPORT_CONTROL,
    TRAPDOOR,
    TT_BURIEDBALL,
    UTOTYPE_NONE,
    VAULT,
    VIBRATING_SQUARE,
    WATER,
    WWALKING,
    FIRE_RES,
    W_NONPASSWALL,
    ZAP_POS,
    In_quest,
    Is_botlevel,
    is_pit,
    is_hole,
    engulfing_u,
    Upolyd,
    u_at,
} from './const.js';
import { isok } from './cmd_isok.js';
import {
    In_hell,
    In_W_tower,
    assign_level,
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
    surface,
    u_on_newpos,
} from './dungeon.js';
import {
    Amonnam,
    Monnam,
    capitalizedMonsterName,
    mon_nam,
    monsterCommonName,
    noit_mon_nam,
} from './do_name.js';
import { docrt, newsym, see_monsters, shieldeff } from './display.js';
import {
    schedule_goto,
    UnsupportedLevelChangeError,
} from './do.js';
import { next_to_u } from './apply_next_to_u.js';
import { sengr_at } from './engrave.js';
import { is_lava, is_pool, is_waterwall } from './dbridge.js';
import { is_exclusion_zone } from './mkmaze.js';
import {
    accessible,
    closed_door,
    dochugw,
    onscary,
    set_apparxy,
} from './monmove.js';
import { getlin } from './windows.js';
import { game } from './gstate.js';
import { addinv, prinv, obj_extract_self, sobj_at } from './invent.js';
import { objectGenerationEnv } from './object_generation.js';
import { discover_object } from './o_init.js';
import { stop_occupation } from './allmain.js';
import { check_special_room, in_rooms } from './rooms.js';
import { learnscroll } from './read.js';
import { drag_ball, move_bc, placebc, unplacebc } from './ball.js';
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
    control_teleport,
    is_covetous,
    is_dlord,
    is_dprince,
    amphibious,
    is_flyer,
    is_rider,
    is_silent,
    is_swimmer,
    likes_lava,
    passes_walls,
} from './mondata.js';
import { is_home_elemental } from './makemon.js';
import {
    m_at,
    mon_track_clear,
    place_monster,
    remove_monster,
} from './monst.js';
import { place_worm_tail_randomly, remove_worm } from './worm.js';
import {
    G_UNIQ,
    M1_AMORPHOUS,
    M1_SWIM,
    PM_FIRE_ELEMENTAL,
    PM_FLOATING_EYE,
    PM_MINOTAUR,
    PM_SALAMANDER,
    S_ANGEL,
    S_ELEMENTAL,
    S_EEL,
    S_HUMAN,
    S_MIMIC,
    S_VAMPIRE,
} from './monsters.js';
import {
    get_iter_mons,
    m_in_air,
    maybe_unhide_at,
    mon_offmap,
    set_ustuck,
    unstuck,
    m_into_limbo,
} from './mon.js';
import { carried, mksobj, place_object } from './obj.js';
import {
    AMULET_OF_YENDOR,
    BOULDER,
    CORPSE,
    SCR_SCARE_MONSTER,
    WAN_TELEPORTATION,
} from './objects.js';
import { within_bounded_area } from './rect.js';
import { update_monster_region, update_player_regions } from './region.js';
import { rn1, rn2, rnd, rnl } from './rng.js';
import { messageAt } from './startup_a11y.js';
import { getpos } from './getpos.js';
import { in_out_region } from './region.js';
import { make_blinded } from './potion.js';
import { mon_has_amulet } from './wizard.js';
import { verbalize } from './pline.js';
import { y_n } from './cmd.js';
import { inhistemple } from './priest.js';
import { set_voice, yelp } from './sounds.js';
import {
    addtobill,
    costly_adjacent,
    costly_spot,
    find_objowner,
    inhishop,
    stolen_value,
    subfrombill,
    u_left_shop,
} from './shk.js';
import { note_unported } from './unported.js';
import { deltrap, fill_pit, Flying, reset_utrap, t_at, unconscious }
    from './trap.js';
import { mintrap } from './trap_effects.js';
import { somexyspace } from './mklev.js';
import { search_special } from './mkroom.js';
import { settrack } from './track.js';
import { ttyPline } from './tty_message.js';
import { vault_occupied } from './vault.js';
import { couldsee, vision_recalc } from './vision.js';
import { canseemon, canspotmon, sensemon } from './display.js';

// These generated-monster masks are source data which monsters.js does not
// currently export. Keep their names and values traceable to monflag.h.
const M1_WALLWALK = 0x00000008;
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

function teleportInput(env, operation, fallback) {
    if (typeof env[operation] === 'function') return env[operation];
    if (env.planning) {
        if (typeof env.requestPlanningInput !== 'function') {
            throw new TypeError(
                `planned teleport requires a ${operation} boundary`,
            );
        }
        return (...args) => env.requestPlanningInput(operation, ...args);
    }
    return fallback;
}

function tele_jump_ok(x1, y1, x2, y2, state) {
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

// C ref: teleport.c rloc_pos_ok(). Candidate terrain/scary checks happen
// before migration-boundary and resident-room checks. A migrating monster's
// old y coordinate carries the up/down and Wizard-tower bits from migrate_to.
export function rloc_pos_ok(x, y, monster, rawEnv = {}) {
    const env = teleportEnv(rawEnv);
    const { state } = env;
    if (!goodpos(x, y, monster, GP_CHECKSCARY, env)) return false;

    const oldx = monster.mx;
    const oldy = monster.my;
    if (!oldx) {
        const dndest = state.dndest ?? {};
        const updest = state.updest ?? {};
        if (dndest.nlx && On_W_tower_level(state.u.uz, state)) {
            const inside = within_bounded_area(
                x, y, dndest.nlx, dndest.nly, dndest.nhx, dndest.nhy,
            );
            return Boolean(oldy & 2) !== !inside;
        }
        if (updest.lx && (oldy & 1)) {
            return within_bounded_area(
                x, y, updest.lx, updest.ly, updest.hx, updest.hy,
            ) && (!updest.nlx || !within_bounded_area(
                x, y, updest.nlx, updest.nly, updest.nhx, updest.nhy,
            ));
        }
        if (dndest.lx && !(oldy & 1)) {
            return within_bounded_area(
                x, y, dndest.lx, dndest.ly, dndest.hx, dndest.hy,
            ) && (!dndest.nlx || !within_bounded_area(
                x, y, dndest.nlx, dndest.nly, dndest.nhx, dndest.nhy,
            ));
        }
    } else {
        // A resident keeper/priest may be moved within its room, but the
        // caller can still use goodpos() as a fallback if no such square exists.
        const location = state.level?.at?.(x, y);
        if (monster.isshk && inhishop(monster, state)) {
            if (location?.roomno !== monster.mextra?.eshk?.shoproom)
                return false;
        } else if (monster.ispriest && inhistemple(monster, state)) {
            if (location?.roomno !== monster.mextra?.epri?.shroom)
                return false;
        }
        if (!tele_jump_ok(oldx, oldy, x, y, state)) return false;
    }
    return true;
}

// C ref: teleport.c stairway_find_forwiz().
export function stairway_find_forwiz(isladder, up, state = game) {
    for (let stairway = state.stairs; stairway; stairway = stairway.next) {
        if (stairway.isladder === isladder
            && stairway.up === up
            && stairway.tolev?.dnum === state.u?.uz?.dnum)
            return stairway;
    }
    return null;
}

function thenResult(value, continuation) {
    return value && typeof value.then === 'function'
        ? value.then(continuation)
        : continuation(value);
}

// C ref: teleport.c control_mon_tele(). This helper has two callers: rloc()
// validates with rloc_pos_ok(), while mon.c mnexto() validates with goodpos().
export async function control_mon_tele(
    monster,
    coordinate,
    rlocflags,
    viaRloc,
    rawEnv = {},
) {
    const env = teleportEnv(rawEnv);
    const { state } = env;
    if (!isok(coordinate.x, coordinate.y)) {
        coordinate.x = monster.mx;
        coordinate.y = monster.my;
        if (!isok(coordinate.x, coordinate.y)) {
            coordinate.x = state.u.ux;
            coordinate.y = state.u.uy;
        }
    }
    if (!state.wizard || !state.iflags?.mon_telecontrol) return false;

    const promptName = noit_mon_nam(monster, state, env);
    const message = env.message ?? ttyPline;
    await message(
        `Teleport ${promptName} @ <${monster.mx},${monster.my}> where?`,
        state,
        env,
    );
    const goalName = noit_mon_nam(monster, state, env);
    const goal = `where to teleport ${goalName}`;
    const selectPosition = teleportInput(env, 'getpos', getpos);
    const askYesNo = teleportInput(env, 'y_n', y_n);
    const found = await selectPosition(coordinate, false, goal, state);
    if (found >= 0 && !u_at(coordinate.x, coordinate.y, state)) {
        const viable = viaRloc
            ? rloc_pos_ok(coordinate.x, coordinate.y, monster, env)
            : goodpos(
                coordinate.x, coordinate.y, monster, rlocflags, env,
            );
        if (viable) return true;
        if (!state.iflags?.debug_fuzzer) {
            const query = `<${monster.mx},${monster.my}> is not considered viable; force anyway?`;
            if (await askYesNo(query, state) === 'y') return true;
        }
    }
    await message(
        `${viaRloc ? 'Picking random' : 'Using derived'} destination.`,
        state,
        env,
    );
    return false;
}

// C ref: teleport.c rloc(). Preserve the fast Boolean return for ordinary
// no-message paths; source callees that prompt or emit output return a Promise.
export function rloc(monster, rlocflags = 0, rawEnv = {}) {
    const env = teleportEnv(rawEnv);
    const { state, random } = env;
    if (!monster || typeof monster !== 'object')
        throw new TypeError('rloc requires a monster');
    if (typeof random.rnd !== 'function' || typeof random.rn2 !== 'function')
        throw new TypeError('rloc random injection requires rnd and rn2');

    const place = (x, y) => thenResult(
        rloc_to_core(monster, x, y, { ...env, rlocflags }),
        () => true,
    );
    const randomPlace = () => {
        let x;
        let y;
        for (let attempt = 0; attempt < 50; ++attempt) {
            x = random.rnd(COLNO - 1);
            y = random.rn2(ROWNO);
            if (rloc_pos_ok(x, y, monster, env)) return place(x, y);
        }

        let ccFlags = CC_INCL_CENTER | CC_UNSHUFFLED | CC_SKIP_MONS;
        if (!passes_walls(monster.data)) ccFlags |= CC_SKIP_INACCS;
        const candidates = collect_coords(
            Math.trunc(COLNO / 2), Math.trunc(ROWNO / 2), 0,
            ccFlags, null, env,
        );
        let backup = null;
        for (let index = 0; index < candidates.length; ++index) {
            const offset = random.rn2(candidates.length - index);
            if (offset) {
                const other = index + offset;
                [candidates[index], candidates[other]] = [
                    candidates[other], candidates[index],
                ];
            }
            ({ x, y } = candidates[index]);
            if (rloc_pos_ok(x, y, monster, env)) return place(x, y);
            if (!backup && goodpos(x, y, monster, NO_MM_FLAGS, env))
                backup = { x, y };
        }
        if (!backup) {
            if (rlocflags & RLOC_ERR) note_unported('pline.c impossible');
            return false;
        }
        return place(backup.x, backup.y);
    };

    if (monster === state.u?.usteed)
        return tele(state, env).then(() => true);

    if (monster.iswiz && monster.mx) {
        let stairway;
        if (!In_W_tower(state.u.ux, state.u.uy, state.u.uz, state)) {
            stairway = stairway_find_forwiz(false, true, state);
        } else if (!stairway_find_forwiz(true, false, state)) {
            stairway = stairway_find_forwiz(true, true, state);
        } else {
            stairway = stairway_find_forwiz(true, false, state);
        }
        const x = stairway?.sx ?? 0;
        const y = stairway?.sy ?? 0;
        if (goodpos(x, y, monster, NO_MM_FLAGS, env)) return place(x, y);
    }

    if (state.iflags?.mon_telecontrol && monster.mx) {
        const coordinate = { x: monster.mx, y: monster.my };
        return control_mon_tele(
            monster, coordinate, rlocflags, true, env,
        ).then((accepted) => accepted
            ? place(coordinate.x, coordinate.y)
            : randomPlace());
    }
    return randomPlace();
}

// C ref: teleport.c u_teleport_mon(). Its Boolean return is consumed by
// zap.c:bhitm to decide whether an invisible target's square should be
// revealed. Keep level restrictions, engulfing escape, controlled placement,
// and ordinary random relocation in the C branch order.
export async function u_teleport_mon(monster, giveFeedback, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2, rnd };
    const message = rawEnv.message ?? ttyPline;
    const now = Math.trunc(state.moves ?? 0);
    if (Math.trunc(state.level?.flags?.stasis_until ?? 0) >= now) {
        if (giveFeedback)
            await message(
                `A mysterious force prevents you teleporting ${mon_nam(monster, state, rawEnv)}!`,
                state,
                rawEnv,
            );
        return false;
    }
    if (monster.ispriest
        && in_rooms(monster.mx, monster.my, TEMPLE, state).length) {
        if (giveFeedback)
            await message(
                `${Monnam(monster, state, rawEnv)} resists your magic!`,
                state,
                rawEnv,
            );
        return false;
    }
    if (engulfing_u(monster, state) && noteleport_level(monster, state)) {
        if (giveFeedback)
            await message(
                `You are no longer inside ${mon_nam(monster, state, rawEnv)}!`,
                state,
                rawEnv,
            );
        await unstuck(monster, state, { ...rawEnv, random });
        if (!await rloc(monster, RLOC_MSG, { ...rawEnv, state, random }))
            await m_into_limbo(monster, state, { ...rawEnv, random });
        return true;
    }
    if ((is_rider(monster.data) || control_teleport(monster.data))
        && random.rn2(13)) {
        const destination = enexto(
            state.u.ux,
            state.u.uy,
            monster.data,
            { ...rawEnv, state, random },
        );
        if (destination) {
            await rloc_to(
                monster,
                destination.x,
                destination.y,
                { ...rawEnv, state, random },
            );
            return true;
        }
    }
    if (!await rloc(monster, RLOC_MSG, { ...rawEnv, state, random }))
        return false;
    return true;
}

function currentDungeonIsHellish(state) {
    const dnum = state.u?.uz?.dnum;
    return Number.isInteger(dnum)
        && Boolean(state.dungeons?.[dnum]?.flags?.hellish);
}

function m_blocks_teleporting(monster) {
    return is_dlord(monster.data) || is_dprince(monster.data);
}

// C ref: teleport.c noteleport_level(). The callback is teleport.c's static
// m_blocks_teleporting(); mon.c:get_iter_mons owns the living/on-map scan.
export function noteleport_level(monster, state = game) {
    if (currentDungeonIsHellish(state)
        && !is_dlord(monster.data)
        && !is_dprince(monster.data)) {
        if (get_iter_mons(m_blocks_teleporting, state)) return true;
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

// C ref: teleport.c tele_restrict() (1950-1960). Returns true when the
// level forbids teleportation, printing a message if the hero can see the
// monster.
export async function tele_restrict(mon, state = game, rawEnv = {}) {
    const message = rawEnv.message ?? ttyPline;
    if (noteleport_level(mon, state)) {
        if (canseemon(mon, state)) {
            await message(
                'A mysterious force prevents '
                    + monsterCommonName(mon, state, 0, rawEnv)
                    + ' from teleporting!',
                state,
            );
        }
        return true;
    }
    return false;
}

// C ref: teleport.c teleport_pet() (786-810). The Boolean controls whether
// its caller continues the monster teleport. Releasing the leash itself is
// still the void apply.c:m_unleash() operation, so keep that exact gap while
// preserving teleport_pet's source return value.
export async function teleport_pet(monster, forceIt, rawEnv = {}) {
    const env = teleportEnv(rawEnv);
    const { random, state } = env;
    if (monster === state.u?.usteed) return false;
    if (!monster.mleashed) return true;

    const { get_mleash } = await import('./apply.js');
    const leash = get_mleash(monster, state);
    if (!leash) {
        // C emits an impossible() diagnostic without changing game output.
        note_unported('pline.c impossible');
    } else if (leash.cursed && !forceIt) {
        await yelp(monster, state, random);
        return false;
    } else {
        await (env.message ?? ttyPline)('Your leash goes slack.', state, env);
    }

    note_unported('apply.c m_unleash');
    return true;
}

// C ref: teleport.c mtele_trap(), bounded to ordinary fixed or random D:1
// destinations. teleport_pet() owns its leash decision; the void m_unleash()
// call remains an explicit source gap, as does one-shot vault teleportation.
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
    if (!await teleport_pet(monster, false, env)) return;
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
            await rloc_to_flag(
                monster,
                destinationX,
                destinationY,
                RLOC_MSG,
                env,
            );
        }
    } else {
        await rloc(monster, 0, env);
    }

    if (inSight) {
        await message(
            canseemon(monster, state)
                ? `${name} seems disoriented.`
                : `${name} suddenly disappears!`,
            state,
        );
        seeTrap(trap, env);
    }
}

// C ref: teleport.c mlevel_tele_trap() (2006-2086). The ordinary monster
// hole/trapdoor and magic-portal paths are complete; leash handling, the level
// teleporter, and forced-off-level callers remain explicit boundaries because
// their source owners are not yet wired into monster movement.
export async function mlevel_tele_trap(
    monster,
    trap,
    forceIt,
    inSight,
    rawEnv = {},
) {
    const env = teleportEnv(rawEnv);
    const { random, state } = env;
    const trapType = trap?.ttyp ?? NO_TRAP;
    const portal = trapType === MAGIC_PORTAL;
    if (monster === state.u?.ustuck) return 'finished';
    if (monster === state.u?.usteed) return 'finished';
    if (!await teleport_pet(monster, forceIt, env)) return 'finished';
    if (!portal && trapType !== HOLE && trapType !== TRAPDOOR) {
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
        ? (env.seeTrap ?? ((candidate, operationEnv) => {
            candidate.tseen = true;
            if (typeof operationEnv.newsym === 'function') {
                operationEnv.newsym(candidate.tx, candidate.ty, operationEnv);
            }
        }))
        : null;
    const message = env.message ?? ttyPline;
    if (inSight && typeof message !== 'function') {
        throw new TypeError(
            'monster teleport requires a message operation',
        );
    }

    // trap.c passes the clamped destination by value to migrate_to_level();
    // never rewrite trap->dst because the trap remains in the source level's
    // data until that level is saved.
    const destination = { ...trap.dst };
    let migrationType = MIGR_RANDOM;
    if (portal) {
        // teleport.c:2034-2044. A monster carrying the Amulet, a home
        // elemental, or one which wins rn2(7) cannot leave the endgame via a
        // portal. The random draw is after the two inventory/species tests,
        // matching C's short-circuit order.
        if (inEndgame(state) && (mon_has_amulet(monster)
            || is_home_elemental(monster.data, state)
            || random.rn2(7))) {
            if (inSight && monster.data?.mlet !== S_ELEMENTAL) {
                await message(messageAt(
                    `${capitalizedMonsterName(monster, state)} `
                        + 'seems to shimmer for a moment.',
                    monster.mx,
                    monster.my,
                    state,
                ), state);
                seeTrap(trap, env);
            }
            return 'finished';
        }
        migrationType = MIGR_PORTAL;
    } else if (state.stronghold_level
        && on_level(state.u?.uz, state.stronghold_level)) {
        destination.dnum = state.valley_level?.dnum;
        destination.dlevel = state.valley_level?.dlevel;
    } else {
        const dungeon = state.dungeons?.[state.u?.uz?.dnum];
        if (state.u?.uz && dungeon
            && state.u.uz.dlevel === dungeon.num_dunlevs) {
            if (inSight && trap.tseen) {
                await message(messageAt(
                    `${capitalizedMonsterName(monster, state)} avoids the `
                        + `${trapType === HOLE ? 'hole' : 'trap'}.`,
                    monster.mx,
                    monster.my,
                    state,
                ), state);
            }
            return 'finished';
        }
        const bottom = dungeon?.num_dunlevs;
        if (Number.isInteger(bottom))
            destination.dlevel = Math.min(destination.dlevel, bottom);
    }
    if (!Number.isInteger(destination.dnum)
        || !Number.isInteger(destination.dlevel)) {
        throw new TypeError(
            'monster level teleport requires a destination level',
        );
    }
    if (inSight) {
        await message(messageAt(
            portal
                ? `Suddenly, ${mon_nam(monster, state)} disappears out of sight.`
                : `Suddenly, ${monsterCommonName(monster, state)} `
                    + `${trapType === HOLE
                        ? 'falls into a hole'
                        : 'falls through a trap door'}.`,
            monster.mx,
            monster.my,
            state,
        ), state);
        seeTrap(trap, env);
    }
    if (portal && !control_teleport(monster.data)) monster.mconf = 1;
    migrateToLevel(
        monster,
        ledger_no(destination, state),
        migrationType,
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

function mayPasswall(location) {
    return !(IS_STWALL(location.typ)
        && (location.wall_info & W_NONPASSWALL));
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
    return Boolean(sengr_at('Elbereth', x, y, true, state));
}

function propertyPresent(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function propertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

// These are teleport.c goodpos()'s direct hero macro expressions. Keep them
// here so every goodpos caller gets the same C checks without injected hooks.
function heroCanOccupyPool(x, y, state) {
    const steed = state.u?.usteed;
    const flying = state.u?.uprops?.[FLYING] ?? {};
    return propertyPresent(state, SWIMMING)
        || Boolean(steed && is_swimmer(steed.data))
        || propertyPresent(state, MAGICAL_BREATHING)
        || amphibious(state.youmonst?.data)
        || (!inWaterLevel(state)
            && !is_waterwall(x, y, state)
            && (propertyActive(state, LEVITATION)
                || Boolean((flying.intrinsic || flying.extrinsic
                    || (steed && is_flyer(steed.data))) && !flying.blocked)
                || propertyPresent(state, WWALKING)));
}

function heroCanOccupyLava(state) {
    // C teleport.c reads global `uarmf` (worn.c's W_ARMF slot), which is
    // stored at the game-state root alongside uarmh/uarms.
    const boots = state.uarmf;
    const waterWalking = propertyPresent(state, WWALKING)
        && !inWaterLevel(state);
    const flying = state.u?.uprops?.[FLYING] ?? {};
    const steed = state.u?.usteed;
    return Boolean(propertyActive(state, LEVITATION)
        || Boolean((flying.intrinsic || flying.extrinsic
            || (steed && is_flyer(steed.data))) && !flying.blocked)
        || (propertyPresent(state, FIRE_RES) && waterWalking
            && boots && boots.oerodeproof)
        || (Upolyd(state.u) && likes_lava(state.youmonst?.data)));
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
        if (is_pool(x, y, state) && !ignoreWater) {
            if (monster === state.youmonst) {
                return heroCanOccupyPool(x, y, state);
            }
            return Boolean((species.mflags1 & M1_SWIM)
                || (!inWaterLevel(state) && location.typ !== WATER
                    && m_in_air(monster, state)));
        } else if (species.mlet === S_EEL && random.rn2(13) && !ignoreWater) {
            return false;
        } else if (is_lava(x, y, state) && !ignoreLava) {
            if (species.pmidx === PM_FLOATING_EYE) return false;
            if (monster === state.youmonst) {
                return heroCanOccupyLava(state);
            }
            return m_in_air(monster, state)
                || species.pmidx === PM_FIRE_ELEMENTAL
                || species.pmidx === PM_SALAMANDER;
        }
        if ((species.mflags1 & M1_WALLWALK) && mayPasswall(location))
            return true;
        if ((species.mflags1 & M1_AMORPHOUS)
            && closed_door(x, y, state))
            return true;
        if (gpflags & GP_CHECKSCARY) {
            const scary = monster.m_id
                ? onscary(x, y, monster, state)
                : goodpos_onscary(x, y, species, normalized);
            if (scary) return false;
        }
    }

    const location = state.level?.at?.(x, y);
    if (!location) return false;
    const canEnter = accessible(x, y, state);
    if (!canEnter) {
        if (!(is_pool(x, y, state) && (gpflags & MM_IGNOREWATER))
            && !(is_lava(x, y, state) && (gpflags & MM_IGNORELAVA))) {
            return false;
        }
    }
    if (sobj_at(BOULDER, x, y, state)
        && (!species || !(species.mflags2 & M2_ROCKTHROW))) {
        return false;
    }
    if ((gpflags & GP_AVOID_MONPOS)
        && is_exclusion_zone(LR_MONGEN, x, y, state)) {
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

// C ref: teleport.c rloc_to(), which is rloc_to_core() with RLOC_NOMSG.
// Besides an arriving monster with mx == 0, hack.c revive_nasty() moves an
// ordinary on-map occupant away from a reviving corpse. Worm tails, resident
// shop accounting, occupation, and the trapped-monster tail follow placement.
// RLOC_NOMSG suppresses placement messages.
function rloc_to_core(monster, x, y, rawEnv = {}) {
    const env = teleportEnv(rawEnv);
    const { state } = env;
    const redraw = env.newsym ?? env.redraw ?? newsym;
    const oldx = monster.mx;
    const oldy = monster.my;
    const residentShk = monster.isshk && inhishop(monster, state);
    const rlocflags = env.rlocflags ?? RLOC_NOMSG;
    const preventmsg = Boolean(rlocflags & RLOC_NOMSG);
    const vanishmsg = Boolean(rlocflags & RLOC_MSG);
    let appearmsg = Boolean(monster.mstrategy & STRAT_APPEARMSG);
    const domsg = !state.in_mklev && (vanishmsg || appearmsg)
        && !preventmsg;
    const message = env.message ?? ttyPline;
    let telemsg = false;

    if (x === oldx && y === oldy && m_at(x, y, state) === monster)
        return;

    // Source's departure message is evaluated while the monster still has
    // its old coordinates. Relocation waits for its output before removing it.
    let departure = null;
    if (oldx && domsg && canspotmon(monster, state)) {
        if (couldsee(x, y, state) || sensemon(monster, state)) {
            telemsg = true;
        } else {
            departure = message(
                `${Monnam(monster, state, env)} vanishes!`, state, env,
            );
        }
        // A monster that vanishes out of sight does not get an arrival line.
        appearmsg = false;
    }

    const placeAndFinish = () => {
        if (oldx) {
            if (monster.wormno) {
                remove_worm(monster, { ...env, newsym: redraw });
            } else {
                remove_monster(oldx, oldy, state);
                redraw(oldx, oldy, state);
            }
        }

        mon_track_clear(monster);
        place_monster(monster, x, y, state);
        update_monster_region(monster, state);
        if (monster.wormno)
            place_worm_tail_randomly(monster, x, y, {
                ...env,
                newsym: redraw,
            });

        if (state.u?.ustuck === monster) {
            if (state.u.uswallow) {
                u_on_newpos(monster.mx, monster.my, state);
                const roomCheck = check_special_room(false, state, {
                    message,
                    random: env.random.rn2,
                });
                return thenResult(roomCheck, () => thenResult(
                    state === game
                        ? docrt()
                        : note_unported('display.c docrt'),
                    finishPlacement,
                ));
            }
            if (dist2(monster.mx, monster.my, state.u.ux, state.u.uy) > 2) {
                const release = unstuck(monster, state, env);
                return thenResult(release, finishPlacement);
            }
        }

        return finishPlacement();
    };

    const finishPlacement = () => {
        // C's maybe_unhide_at() runs after any swallowed/unstuck transition.
        maybe_unhide_at(x, y, state);
        redraw(x, y, state);
        const setApparxy = env.setApparxy ?? set_apparxy;
        setApparxy(monster, { ...env, state });

        if (domsg
            && (canspotmon(monster, state) || appearmsg
                || monster === state.u?.ustuck)) {
            const distance = dist2(x, y, state.u.ux, state.u.uy);
            const next = distance <= 2 ? ' next to you' : null;
            const close = distance <= BOLT_LIM * BOLT_LIM
                ? ' close by' : null;
            const oldDistance = dist2(oldx, oldy, state.u.ux, state.u.uy);
            monster.mstrategy &= ~STRAT_APPEARMSG;
            let text;
            if (monster === state.u?.ustuck && !u_at(state.u.ux0, state.u.uy0, state)) {
                text = `You and ${mon_nam(monster, state, env)} teleport together.`;
            } else if (telemsg
                && (couldsee(x, y, state) || sensemon(monster, state))) {
                text = `${Monnam(monster, state, env)} vanishes and reappears`
                    + `${next ?? close
                        ?? (oldDistance === distance ? ''
                            : distance < oldDistance ? ' closer to you'
                            : ' farther away')}.`;
            } else {
                const name = appearmsg
                    ? Amonnam(monster, { ...env, state })
                    : Monnam(monster, state, env);
                text = `${name} ${appearmsg ? 'suddenly ' : ''}`
                    + `${heroBlind(state) ? 'arrives' : 'appears'}`
                    + `${next ?? close ?? ''}!`;
            }
            const result = message(messageAt(text, x, y, state), state, env);
            return thenResult(result, () => thenResult(
                state.current_wand?.otyp === WAN_TELEPORTATION
                    ? discover_object(
                        WAN_TELEPORTATION, true, true, true, state, env,
                    )
                    : undefined,
                finishTail,
            ));
        }
        return finishTail();
    };

    const finishTail = () => {
        if (residentShk && !inhishop(monster, state))
            note_unported('shk.c make_angry_shk');

        return runShopItems();
    };

    const runShopItems = () => {
        if (!monster.minvent || costly_spot(x, y, state))
            return afterShopItems();
        const owner = find_objowner(monster.minvent, oldx, oldy, state);
        const peaceful = !owner || owner.mpeaceful;
        const process = (object) => {
            while (object) {
                const next = object.nobj;
                if (object.no_charge) {
                    object.no_charge = 0;
                    object = next;
                } else if (owner && onshopbill(object, owner, true)) {
                    return thenResult(stolen_value(
                        object, oldx, oldy, peaceful, false, state,
                    ), () => process(next));
                } else {
                    object = next;
                }
            }
            return afterShopItems();
        };
        return process(monster.minvent);
    };

    const afterShopItems = () => {
        if (state.go?.occupation) {
            return thenResult(dochugw(monster, false, {
                ...env,
                state,
                canSpotMonster: (subject) => canspotmon(subject, state),
                couldSee: (targetX, targetY) => couldsee(targetX, targetY, state),
                stopOccupation: () => stop_occupation(state, env),
            }), afterOccupation);
        }
        return afterOccupation();
    };
    const afterOccupation = () => {
        if (monster.mtrapped && !monster.wormno)
            return thenResult(
                mintrap(monster, NO_TRAP_FLAGS, { ...env, state }),
                () => undefined,
            );
        return;
    };

    const result = departure && typeof departure.then === 'function'
        ? departure.then(placeAndFinish)
        : placeAndFinish();
    return thenResult(result, () => undefined);
}

// C ref: teleport.c rloc_to_flag().
export function rloc_to_flag(monster, x, y, rlocflags = RLOC_NOMSG,
    rawEnv = {}) {
    return rloc_to_core(monster, x, y, { ...rawEnv, rlocflags });
}

// C ref: teleport.c rloc_to(), which passes RLOC_NOMSG.
export function rloc_to(monster, x, y, rawEnv = {}) {
    return rloc_to_core(monster, x, y, {
        ...rawEnv,
        rlocflags: RLOC_NOMSG,
    });
}

// C ref: teleport.c tele_to_rnd_pet() (814-838). Select a living, tame,
// on-map monster by reservoir sampling, then move the hero to one random
// adjacent square only when the pet is outside m_next2u()'s squared-distance
// radius. The pet list is mon.c's live fmon chain (`level.monlist`).
export async function tele_to_rnd_pet(state = game, env = {}) {
    const random = { rn2, ...(env.random ?? {}) };
    if (noteleport_level(state.youmonst, state)) {
        note_unported('pline.c impossible');
        return;
    }

    let pet = null;
    let count = 0;
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.mhp < 1 || !monster.mtame || mon_offmap(monster))
            continue;
        count++;
        if (!random.rn2(count)) pet = monster;
    }
    if (pet && dist2(pet.mx, pet.my, state.u.ux, state.u.uy) > 2) {
        const tx = pet.mx + random.rn2(3) - 1;
        const ty = pet.my + random.rn2(3) - 1;
        if (isok(tx, ty) && await teleok(tx, ty, false, state))
            await teleds(tx, ty, TELEDS_TELEPORT, state);
    }
}

// ── Hero within-level teleport (C ref: teleport.c teleok/scrolltele/tele) ──

// C ref: teleport.c teleok() (420-445).
export async function teleok(x, y, trapok, state = game, rawEnv = {}) {
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
    if (!goodpos(x, y, state.youmonst, 0, { ...rawEnv, state }))
        return false;
    if (!tele_jump_ok(state.u.ux, state.u.uy, x, y, state))
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

// C ref: teleport.c safe_teleds() (717-770). After forty random safe squares,
// C searches a shuffled map-wide ring list, preferring non-trap squares and
// retaining the first acceptable trap square as a last resort.
export async function safe_teleds(teleds_flags, state = game, rawEnv = {}) {
    const env = teleportEnv({ ...rawEnv, state });
    const random = env.random;
    if (typeof random.rnd !== 'function')
        throw new TypeError('safe_teleds random injection requires rnd');
    for (let tcnt = 0; tcnt < 40; ++tcnt) {
        const nux = random.rnd(COLNO - 1);
        const nuy = random.rn2(ROWNO);
        if (await teleok(nux, nuy, false, state, env)) {
            await teleds(nux, nuy, teleds_flags, state, env);
            return true;
        }
    }

    let ccFlags = CC_RING_PAIRS | CC_SKIP_MONS;
    const passesWalls = state.u?.uprops?.[PASSES_WALLS];
    if (!(passesWalls?.intrinsic || passesWalls?.extrinsic))
        ccFlags |= CC_SKIP_INACCS;
    const candidates = collect_coords(
        state.u.ux,
        state.u.uy,
        0,
        ccFlags,
        null,
        env,
    );
    let backupspot = null;
    for (const { x, y } of candidates) {
        if (await teleok(x, y, false, state, env)) {
            await teleds(x, y, teleds_flags, state, env);
            return true;
        }
        if (!backupspot && t_at(x, y, state)
            && await teleok(x, y, true, state, env)) {
            backupspot = { x, y };
        }
    }
    if (backupspot) {
        await teleds(backupspot.x, backupspot.y, teleds_flags, state, env);
        return true;
    }
    return false;
}

// C ref: teleport.c vault_tele() (771-784). The one-shot teleport trap that
// mklev.c makevtele() hides in a niche sends the hero into the level's vault.
// C's `croom && somexyspace(...) && teleok(...)` short-circuits, so a level
// with no vault spends no randomness before falling through to tele().
export async function vault_tele(state = game, rawEnv = {}) {
    const env = teleportEnv({ ...rawEnv, state });
    const croom = search_special(VAULT, state);
    const c = { x: 0, y: 0 };

    if (croom && somexyspace(croom, c, { state })
        && await teleok(c.x, c.y, false, state, env)) {
        await teleds(c.x, c.y, TELEDS_TELEPORT, state, env);
        return;
    }
    await tele(state, env);
}

// C ref: teleport.c scrolltele() (849-915). Read.c passes the scroll object;
// teleport.c:tele() passes null. Keep discovery and the wizard override at
// their source positions around the controlled destination query.
export async function scrolltele(scroll, state = game, rawEnv = {}) {
    const env = teleportEnv({ ...rawEnv, state });
    const { random } = env;
    const message = env.message ?? ttyPline;

    if (noteleport_level(state.youmonst, state) && !state.wizard) {
        await message("A mysterious force prevents you from teleporting!", state);
        if (scroll) learnscroll(scroll, state);
        return;
    }

    if (!heroBlind(state))
        await make_blinded(0, false, state);

    if ((state.u?.uhave?.amulet || On_W_tower_level(state.u.uz, state))
        && !random.rn2(3)) {
        await message("You feel disoriented for a moment.", state);
        if (!state.wizard)
            return;
        const askYesNo = teleportInput(env, 'y_n', y_n);
        if (await askYesNo('Override?', state) !== 'y'.charCodeAt(0))
            return;
    }

    if (((Teleport_control_prop(state) || Boolean(scroll?.blessed))
        && !Stunned_prop(state)) || state.wizard) {
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
            if (scroll) learnscroll(scroll, state);
            const cc = { x: state.u.ux, y: state.u.uy };
            const tcc = state.iflags?.travelcc;
            if (tcc && isok(tcc.x, tcc.y)) {
                cc.x = tcc.x;
                cc.y = tcc.y;
            }
            const selectPosition = teleportInput(env, 'getpos', getpos);
            if (await selectPosition(
                cc, true, 'the desired position', state,
            ) < 0)
                return;
            if (await teleok(cc.x, cc.y, false, state, env)) {
                await teleds(cc.x, cc.y, TELEDS_TELEPORT, state, env);
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

    if (scroll) learnscroll(scroll, state);
    await safe_teleds(TELEDS_TELEPORT, state, env);
}

// C ref: teleport.c tele() (841-845). tele_trap()'s fallback arm is its first
// caller in the running game, which is why scrolltele() now admits a null
// scroll instead of refusing one.
export async function tele(state = game, rawEnv = {}) {
    await scrolltele(null, state, rawEnv);
}

// ── Hero relocation (C ref: teleport.c teleds()) ──

// C ref: teleport.c teleds() (448-573). Puts the hero on <nux,nuy> and runs
// everything a changed hero square implies: ball and chain, vision, terrain,
// regions and spoteffects(). scrolltele() (controlled teleport) is the newest
// caller; steed.c mount_steed() and dismount_steed() also call it with
// TELEDS_ALLOW_DRAG.
export async function teleds(nux, nuy, teleds_flags, state = game, rawEnv = {}) {
    const env = teleportEnv({ ...rawEnv, state });
    if (state !== game && typeof env.redraw !== 'function') {
        throw new TypeError('teleds on a non-live state requires a redraw callback');
    }
    const redraw = env.redraw ?? newsym;
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
        // dig.c buried_ball_to_punishment() is still outside this span. Keep
        // its existing boundary before reading the live punishment objects.
        throw new UnsupportedHeroMoveBoundaryError(
            'teleds() unearthing a buried ball',
        );
    }
    let ball_active = Boolean(state.uball)
        && state.uball.where !== OBJ_FREE;
    let ball_still_in_range = false;
    if (!ball_active
        || near_capacity(state) > SLT_ENCUMBER
        || distmin(u.ux, u.uy, nux, nuy) > 1)
        allow_drag = false;

    // C teleds() keeps an active punishment ball on the floor when the
    // destination remains within its two-square reach. Otherwise a teleport
    // removes the ball and chain before the hero moves. drag_ball() receives
    // mutable pointer cells because it may choose a different chain position.
    if (ball_active) {
        if (!carried(state.uball)
            && distmin(nux, nuy, state.uball.ox, state.uball.oy) <= 2) {
            ball_still_in_range = true;
        } else if (!allow_drag) {
            unplacebc(state);
        }
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
        // C sets ball_active and redraws the map here when Punished. The
        // swallowed relocation path still depends on that unported redraw and
        // downstream effects, so retain its existing boundary as a whole.
        throw new UnsupportedHeroMoveBoundaryError(
            'teleds() out of an engulfer',
        );
    }

    if (ball_active && (ball_still_in_range || allow_drag)) {
        const bc_control = { value: 0 };
        const ballx = { value: state.uball?.ox ?? 0 };
        const bally = { value: state.uball?.oy ?? 0 };
        const chainx = { value: state.uchain?.ox ?? 0 };
        const chainy = { value: state.uchain?.oy ?? 0 };
        const cause_delay = { value: false };

        if (await drag_ball(
            nux,
            nuy,
            bc_control,
            ballx,
            bally,
            chainx,
            chainy,
            cause_delay,
            allow_drag,
            state,
        )) {
            move_bc(
                0,
                bc_control.value,
                ballx.value,
                bally.value,
                chainx.value,
                chainy.value,
                state,
            );
        } else {
            // drag_ball() can trigger a magic trap that removes punishment.
            // Refresh the predicate before deciding whether placebc() below
            // must restore the objects to the destination square.
            ball_active = Boolean(state.uball)
                && state.uball.where !== OBJ_FREE;
            if (ball_active) unplacebc(state);
        }
    }

    /* must set u.ux, u.uy after drag_ball() */
    u_on_newpos(nux, nuy, state, {
        seeNearbyObjectsOptions: env.planning
            ? {
                redraw: () => note_unported(
                    'display.c newsym_force planning',
                ),
            }
            : { redraw },
    });
    fill_pit(u.ux0, u.uy0, state);
    if (ball_active && state.uchain?.where === OBJ_FREE)
        await placebc(state);
    update_player_regions(state);
    /*
     *  Make sure the hero disappears from the old location, and force a full
     *  vision recalculation because the hero is now in a new location.
     */
    redraw(u.ux0, u.uy0, state);
    await see_monsters(state, { ...env, redraw });
    state.vision_full_recalc = 1;
    nomul(0, state);
    notice_mon_off(state);
    vision_recalc(0, { state, redraw }); /* vision before effects */

    // C ref: teleport.c:545-547.
    if (is_teleport && state.flags?.verbose) {
        const same = (nux === u.ux0 && nuy === u.uy0);
        await (env.message ?? ttyPline)(
            `You materialize in ${same ? 'the same' : 'a different'} location!`,
            state,
        );
    }
    /* if terrain type changes, levitation or flying might become blocked or
       unblocked; do this after map+vision has been updated */
    if (state.level.at(u.ux, u.uy).typ !== state.level.at(u.ux0, u.uy0).typ)
        await switch_terrain(state, env);
    /* possible shop entry message comes after guard's shrill whistle */
    // C teleds() does not exclude an occupied destination; spoteffects() owns
    // the resident monster's surprise after the hero has arrived.
    await spoteffects(true, state, env);
    invocation_message(state);
    notice_mon_on(state);
    await notice_all_mons(true, state, env);
}

// youprop.h:57 defines Antimagic as the intrinsic or the extrinsic, with no
// blocking term.
function Antimagic_prop(state) {
    const p = state.u?.uprops?.[ANTIMAGIC];
    return Boolean(p?.intrinsic || p?.extrinsic);
}

// C's `static boolean in_tele_trap` inside tele_trap(), teleport.c:1494. A
// fixed-destination trap can drop the hero onto a second teleport trap, and
// the guard stops the recursive call spoteffects() would make there. The
// try/finally below restores it on a refusal too, so a bounded stop cannot
// leave the flag set for the next segment.
let in_tele_trap = false;

// C ref: teleport.c tele_trap() (1491-1535). trap.c trapeffect_telep_trap()
// is its only caller in the running game.
export async function tele_trap(trap, state = game) {
    if (in_tele_trap) return;

    in_tele_trap = true;
    try {
        if (inEndgame(state) || Antimagic_prop(state)
            || noteleport_level(state.youmonst, state)) {
            if (Antimagic_prop(state)) {
                await shieldeff(state.u.ux, state.u.uy, state);
            }
            await ttyPline('You feel a wrenching sensation.', state);
        } else if (!next_to_u(state)) {
            await ttyPline('You shudder for a moment.', state);
        } else if (trap.once) {
            deltrap(trap, state);
            newsym(state.u.ux, state.u.uy); /* get rid of trap symbol */
            await vault_tele(state);
        } else if (isok(trap.teledest.x, trap.teledest.y)) {
            let mtmp = m_at(trap.teledest.x, trap.teledest.y, state);

            settrack(state);
            if (mtmp) {
                const cc = enexto(mtmp.mx, mtmp.my, mtmp.data, { state });
                if (!cc) {
                    /* could not find some other place to put mtmp; the level
                       must be nearly or completely full */
                    await ttyPline('You shudder for a moment.', state);
                } else {
                    await rloc_to(mtmp, cc.x, cc.y, { state });
                    mtmp = null; /* no longer a monster at dest */
                }
            }
            if (!mtmp) {
                await teleds(
                    trap.teledest.x,
                    trap.teledest.y,
                    TELEDS_TELEPORT,
                    state,
                );
            }
        } else {
            await tele(state);
        }
    } finally {
        in_tele_trap = false;
    }
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

// C ref: teleport.c level_tele() (1164-1424). Keep the source order because
// controlled, involuntary, menu, heaven, and Gehennom destinations all share
// the same deferred-arrival tail.
function levelInEndgame(level, state) {
    return Boolean(level && state.astral_level
        && level.dnum === state.astral_level.dnum);
}

function levelInQuest(level, state) {
    return Boolean(level && Number.isInteger(state.quest_dnum)
        && level.dnum === state.quest_dnum);
}

function levelInMines(level, state) {
    return Boolean(level && Number.isInteger(state.mines_dnum)
        && level.dnum === state.mines_dnum);
}

function levelInSokoban(level, state) {
    return Boolean(level && Number.isInteger(state.sokoban_dnum)
        && level.dnum === state.sokoban_dnum);
}

// C ref: dungeon.c find_hell() (1949-1953). This helper has no independent
// return value; it assigns the Valley of the Dead entrance to its argument.
function findHell(level, state) {
    if (!state.valley_level || !Number.isInteger(state.valley_level.dnum)) {
        throw new UnsupportedLevelChangeError(
            'level_tele() find_hell() without valley_level',
        );
    }
    level.dnum = state.valley_level.dnum;
    level.dlevel = 1;
}

function killerForLevelTele(state) {
    state.killer ??= { name: '', format: KILLED_BY };
    state.killer.name ??= '';
    state.killer.format ??= KILLED_BY;
    return state.killer;
}

async function levelTeleMenu(state) {
    const dest = await print_dungeon(state);
    if (!dest) return null;
    const newlevel = { dnum: dest.dnum, dlevel: dest.dlevel };

    // teleport.c:1234-1246. Wizard menu travel to any endgame level gets the
    // Amulet before schedule_goto() runs when the hero does not have it.
    if (levelInEndgame(newlevel, state)
        && !levelInEndgame(state.u.uz, state)
        && !state.u.uhave?.amulet) {
        let amu = mksobj(
            AMULET_OF_YENDOR,
            true,
            false,
            objectGenerationEnv({ state }),
        );
        if (amu) {
            amu = addinv(amu, {
                state,
                hooks: {
                    updateInventory: () => {},
                },
            });
            await prinv('Endgame prerequisite:', amu, 0, { state });
        }
    }
    return { newlevel, newlev: dest.playerlev };
}

export async function level_tele(state = game) {
    const u = state.u;
    const iflags = state.iflags ?? (state.iflags = {});
    const flags = state.flags ?? (state.flags = {});
    const killer = killerForLevelTele(state);
    let newlev;
    let newlevel = { dnum: 0, dlevel: 0 };
    let escape_by_flying = null;
    let force_dest = false;

    // teleport.c:1174-1183. The fuzzer selects an attached, non-Astral
    // dungeon and schedules its first random level.
    if (iflags.debug_fuzzer) {
        const nDungeons = state.n_dgns ?? state.dungeons.length;
        do {
            newlevel.dnum = rn2(nDungeons);
        } while (newlevel.dnum === state.astral_level?.dnum
            || state.dungeons[newlevel.dnum]?.flags?.unconnected
            || !state.dungeons[newlevel.dnum]?.num_dunlevs);
        newlevel.dlevel = 1 + rn2(
            dunlevs_in_dungeon(newlevel, state),
        );
        assign_level(u.ucamefrom, u.uz);
        schedule_goto(newlevel, UTOTYPE_NONE, null, null, state);
        return;
    }

    // teleport.c:1185-1188. These restrictions apply before controlled
    // teleport input is considered.
    if ((u.uhave?.amulet || levelInEndgame(u.uz, state)
        || levelInSokoban(u.uz, state)) && !state.wizard) {
        await ttyPline('You feel very disoriented for a moment.', state);
        return;
    }

    const controlled = (Teleport_control_prop(state) && !Stunned_prop(state))
        || Boolean(state.wizard);
    if (!controlled) {
        // teleport.c:1292-1298. Involuntary level teleport skips getlin().
        newlev = random_teleport_level(state);
        if (newlev === depth(u.uz, state)) {
            await ttyPline('You shudder for a moment.', state);
            return;
        }
    } else {
        let trycnt = 0;
        let random_levtport = false;
        let buf = '';
        let qbuf = 'To what level do you want to teleport?';

        // teleport.c:1195-1247. A requested wizard menu jumps to its label;
        // controlled non-wizard input clears the flag and still prompts.
        if (iflags.menu_requested) {
            iflags.menu_requested = false;
            if (state.wizard) {
                const menu = await levelTeleMenu(state);
                if (!menu) return;
                newlevel = menu.newlevel;
                newlev = menu.newlev;
                force_dest = true;
            }
        }

        if (!force_dest) {
            do {
                if (++trycnt === 2) {
                    qbuf += state.wizard
                        ? ' [type a number, name, or ? for a menu]'
                        : ' [type a number or name]';
                }
                // EDIT_GETLIN is disabled in the reference build, so C's
                // buffer clear has no observable counterpart.
                buf = await getlin(qbuf, state);
                if (buf === '*') {
                    random_levtport = true;
                    break;
                }
                // C evaluates this before Escape, so confused Escape still
                // consumes rnl(5) and can become a random teleport.
                if (Confusion(state) && rnl(5)) {
                    await ttyPline('Oops...', state);
                    random_levtport = true;
                    break;
                }
                if (buf === '\x1B') return;
                if (state.wizard && buf === '?') {
                    const menu = await levelTeleMenu(state);
                    if (!menu) return;
                    newlevel = menu.newlevel;
                    newlev = menu.newlev;
                    force_dest = true;
                    break;
                }
                newlev = lev_by_name(buf, state);
                if (!newlev) newlev = cAtoi(buf);
            } while (!newlev
                && !/^[0-9]/u.test(buf)
                && (buf[0] !== '-' || !/^[0-9]/u.test(buf[1] ?? ''))
                && trycnt < 10);
        }

        if (random_levtport || (!force_dest && trycnt >= 10 && !newlev)) {
            newlev = random_teleport_level(state);
            if (newlev === depth(u.uz, state)) {
                await ttyPline('You shudder for a moment.', state);
                return;
            }
        } else if (!force_dest && newlev === 0) {
            // teleport.c:1253-1272. The C confirmation and death call are
            // retained; end.c owns the final death decision.
            const { ynq } = await import('./lock.js');
            if (await ynq('Go to Nowhere.  Are you sure?', state) !== 'y')
                return;
            const silent = is_silent(state.youmonst?.data);
            await ttyPline(
                `${silent ? 'You writhe' : 'You scream'} in agony as your body begins to warp...`,
                state,
            );
            note_unported('window.c display_nhwindow');
            await ttyPline('You cease to exist.', state);
            if (state.gi?.invent || state.invent) {
                await ttyPline(
                    `Your possessions land on the ${surface(u.ux, u.uy, state)} with a thud.`,
                    state,
                );
            }
            killer.format = NO_KILLER_PREFIX;
            killer.name = 'committed suicide';
            const { done } = await import('./end.js');
            await done(DIED, state);
            await ttyPline('An energized cloud of dust begins to coalesce.', state);
            await ttyPline(
                `Your body rematerializes${state.gi?.invent || state.invent
                    ? ', and you gather up all your possessions' : ''}.`,
                state,
            );
            return;
        }

        if (!force_dest && newlev > 0 && single_level_branch(u.uz, state)) {
            await ttyPline('You shudder for a moment.', state);
            return;
        }
        if (!force_dest && levelInQuest(u.uz, state) && newlev > 0) {
            newlev += state.dungeons[u.uz.dnum].depth_start - 1;
        }
    }

    // Common tail (teleport.c:1301-1428). buried_ball_to_punishment() owns
    // object extraction and punishment state, and remains an explicit gap.
    if (u.utrap && u.utraptype === TT_BURIEDBALL) {
        note_unported('dig.c buried_ball_to_punishment');
        throw new UnsupportedLevelChangeError(
            'level_tele() with the hero tethered to a buried ball',
        );
    }
    // teleport.c:1304 evaluates next_to_u() before checking force_dest, so the
    // companion scan still runs for controlled wizard destinations.
    if (!next_to_u(state) && !force_dest) {
        await ttyPline('You shudder for a moment.', state);
        return;
    }
    if (levelInEndgame(u.uz, state)) {
        // teleport.c:1308-1318. Endgame level numbers are negative offsets
        // from the bottom of the endgame dungeon.
        const llimit = dunlevs_in_dungeon(u.uz, state);
        if (newlev >= 0 || newlev <= -llimit) {
            await ttyPline("You can't get there from here.", state);
            return;
        }
        newlevel = { dnum: u.uz.dnum, dlevel: llimit + newlev };
        schedule_goto(newlevel, UTOTYPE_NONE, null, null, state);
        return;
    }

    killer.name = '';

    if (iflags.debug_fuzzer && newlev < 0) {
        newlev = random_teleport_level(state);
        if (newlev === depth(u.uz, state)) {
            await ttyPline('You shudder for a moment.', state);
            return;
        }
    }

    // teleport.c:1325-1361. Negative destinations leave through heaven or
    // the clouds. Shop debt is settled before departure.
    if (newlev < 0 && !force_dest) {
        if (u.ushops0?.[0]) {
            state.in_mklev = true;
            try {
                await u_left_shop(u.ushops0, true, state);
            } finally {
                // teleport.c:1331-1335 writes FALSE after settling the bill;
                // retain that assignment even when the JS callee reports a
                // boundary while unwinding.
                state.in_mklev = false;
            }
            u.ushops0[0] = 0;
            if (u.ushops?.length) u.ushops[0] = 0;
        }
        if (newlev <= -10) {
            await ttyPline('You arrive in heaven.', state);
            set_voice(null, 0, 80, 0, state);
            await verbalize('Thou art early, but we\'ll admit thee.', state);
            killer.format = NO_KILLER_PREFIX;
            killer.name = 'went to heaven prematurely';
        } else if (newlev === -9) {
            await ttyPline('You feel deliriously happy.', state);
            await ttyPline('(In fact, you\'re on Cloud 9!)', state);
            note_unported('window.c display_nhwindow');
        } else {
            await ttyPline('You are now high above the clouds...', state);
        }
        if (killer.name) {
            // The heaven destination is already fatal and remains pending.
        } else if (Levitation_prop(state)) {
            escape_by_flying = 'float gently down to earth';
        } else if (Flying(state)) {
            escape_by_flying = 'fly down to the ground';
        } else {
            await ttyPline('Unfortunately, you don\'t know how to fly.', state);
            await ttyPline('You plummet a few thousand feet to your death.', state);
            killer.name = `teleported out of the dungeon and fell to ${flags.female ? 'her' : 'his'} death`;
            killer.format = NO_KILLER_PREFIX;
        }
    }

    if (killer.name) {
        const savedLevel = { ...u.uz };
        u.uz.dnum = 0;
        u.uz.dlevel = newlev <= -10 ? -10 : 0;
        const { done } = await import('./end.js');
        await done(DIED, state);
        assign_level(u.uz, savedLevel);
        escape_by_flying = 'find yourself back on the surface';
    }

    if (escape_by_flying) {
        await ttyPline(`${escape_by_flying}.`, state);
        newlevel = { dnum: 0, dlevel: 0 };
    } else if (!force_dest
        && u.uz.dnum === state.medusa_level?.dnum
        && newlev >= state.dungeons[u.uz.dnum].depth_start
            + dunlevs_in_dungeon(u.uz, state)) {
        // teleport.c:1388-1391 calls find_hell(), whose source body assigns
        // the Valley of the Dead entrance at depth 1.
        findHell(newlevel, state);
    } else if (!force_dest) {
        const qbranch = levelInQuest(u.uz, state)
            ? state.qstart_level
            : levelInMines(u.uz, state)
                ? state.mineend_level
                : state.sanctum_level;
        const qbranchLevel = qbranch ?? u.uz;
        const deepest = state.dungeons[qbranchLevel.dnum].depth_start
            + dunlevs_in_dungeon(qbranchLevel, state) - 1;
        if (!state.wizard && In_hell(u.uz, state)
            && !u.uevent?.invoked && newlev >= deepest) {
            newlev = deepest - 1;
            await ttyPline('Sorry...', state);
        }
        if (levelInQuest(u.uz, state) && newlev < depth(state.qstart_level, state))
            newlev = depth(state.qstart_level, state);
        get_level(newlevel, newlev, state);
        if (on_level(newlevel, u.uz) && newlev !== depth(u.uz, state)) {
            await ttyPline(
                `You can't get there from ${newlev > deepest ? 'anywhere' : 'here'}.`,
                state,
            );
            return;
        }
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

// C ref: teleport.c rloco() (2102-2186). This floor-object relocation keeps
// the source's bounded random search, floor-effects Boolean, and shop billing
// sequence. Its independent C callers outside the zap path remain unported.
export async function rloco(obj, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn1, rn2 };
    const env = objectGenerationEnv({ ...rawEnv, state, random });
    const redraw = rawEnv.redraw ?? ((x, y) => newsym(x, y, state));

    if (obj.otyp === CORPSE && is_rider(state.mons?.[obj.corpsenm])) {
        const { revive_corpse } = await import('./do.js');
        if (await revive_corpse(obj, state, env)) return false;
    }

    obj_extract_self(obj, env);
    const otx = obj.ox;
    const oty = obj.oy;
    const restrictedFall = otx === 0 && Boolean(state.dndest?.lx);
    let tx;
    let ty;
    let tryLimit = 4000;
    for (;;) {
        tx = random.rn1(COLNO - 3, 2);
        ty = random.rn2(ROWNO);
        // C breaks immediately on the last attempt, before testing that
        // candidate; flooreffects() still receives its coordinates.
        if (!--tryLimit) break;
        if (!goodpos(tx, ty, null, 0, env)) continue;
        const inDownArea = !restrictedFall || within_bounded_area(
            tx, ty,
            state.dndest.lx, state.dndest.ly,
            state.dndest.hx, state.dndest.hy,
        );
        const inDownNoFall = !restrictedFall || !state.dndest.nlx
            || !within_bounded_area(
                tx, ty,
                state.dndest.nlx, state.dndest.nly,
                state.dndest.nhx, state.dndest.nhy,
            );
        const sameTowerSide = !state.dndest?.nlx
            || !On_W_tower_level(state.u?.uz, state)
            || (within_bounded_area(
                tx, ty,
                state.dndest.nlx, state.dndest.nly,
                state.dndest.nhx, state.dndest.nhy,
            ) === within_bounded_area(
                otx, oty,
                state.dndest.nlx, state.dndest.nly,
                state.dndest.nhx, state.dndest.nhy,
            ));
        if (inDownArea && inDownNoFall && sameTowerSide)
            break;
    }

    const { flooreffects } = await import('./do.js');
    if (await flooreffects(obj, tx, ty, 'fall', env)) {
        if (!(otx === 0 && oty === 0)) redraw(otx, oty);
        return false;
    }
    if (otx === 0 && oty === 0) {
        // Fell through a trap door; there is no old square to redraw.
    } else {
        const shopkeeper = find_objowner(obj, otx, oty, state);
        const objectInShop = Boolean(shopkeeper)
            && costly_spot(otx, oty, state);
        const onBoundary = Boolean(shopkeeper)
            && costly_adjacent(shopkeeper, otx, oty, state);
        if (objectInShop || (obj.unpaid && onBoundary)) {
            const heroShop = in_rooms(state.u.ux, state.u.uy, SHOPBASE, state)[0];
            const oldShop = in_rooms(otx, oty, 0, state)[0];
            const keeperRooms = in_rooms(shopkeeper.mx, shopkeeper.my, 0, state);
            const heroInShop = Boolean(heroShop)
                && keeperRooms.includes(heroShop);
            const destinationRooms = in_rooms(tx, ty, 0, state);
            if (heroInShop && costly_spot(tx, ty, state)
                && oldShop && destinationRooms.includes(oldShop)) {
                if (obj.unpaid)
                    subfrombill(obj, shopkeeper, state, rawEnv);
            } else if (heroInShop
                && costly_adjacent(shopkeeper, tx, ty, state)
                && oldShop && destinationRooms.includes(oldShop)) {
                if (!obj.unpaid)
                    await addtobill(obj, false, false, false, state, rawEnv);
            } else {
                // C discards stolen_value()'s amount but needs its billing and
                // shopkeeper effects before the old square is redrawn.
                await stolen_value(obj, otx, oty, false, false, state);
            }
        }
        redraw(otx, oty);
    }
    place_object(obj, tx, ty, env);
    redraw(tx, ty);
    return true;
}
