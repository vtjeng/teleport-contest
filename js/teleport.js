// Monster destination selection and short-range relocation, plus the hero's
// own level teleport and within-level teleport.
// C ref: teleport.c goodpos(), enexto(), enexto_core(), collect_coords(),
// teleok(), scrolltele(), tele(), level_tele(), random_teleport_level();
// mon.c mnexto().

import {
    ACCESSIBLE,
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
    CONFUSION,
    DIED,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    D_CLOSED,
    D_LOCKED,
    DOOR,
    KILLED_BY,
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
    MAGIC_PORTAL,
    LAVAPOOL,
    LR_MONGEN,
    MIGR_RANDOM,
    MIGR_PORTAL,
    MM_IGNORELAVA,
    MM_IGNOREWATER,
    MON_FLOOR,
    MOAT,
    NO_TRAP,
    NO_KILLER_PREFIX,
    OBJ_FREE,
    POOL,
    PASSES_WALLS,
    RLOC_MSG,
    RLOC_NOMSG,
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
    VAULT,
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
    capitalizedMonsterName,
    mon_nam,
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
import { addinv, prinv } from './invent.js';
import { objectGenerationEnv } from './object_generation.js';
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
    is_rider,
    is_silent,
    passes_walls,
} from './mondata.js';
import { is_home_elemental } from './makemon.js';
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
    S_ELEMENTAL,
    S_EEL,
    S_EYE,
    S_HUMAN,
    S_LIGHT,
    S_MIMIC,
    S_VAMPIRE,
} from './monsters.js';
import {
    deal_with_overcrowding,
    maybe_unhide_at,
    set_ustuck,
} from './mon.js';
import { carried, mksobj, sobj_at } from './obj.js';
import {
    AMULET_OF_YENDOR,
    BOULDER,
    SCR_SCARE_MONSTER,
} from './objects.js';
import { within_bounded_area } from './rect.js';
import { update_monster_region, update_player_regions } from './region.js';
import { rn2, rnd, rnl } from './rng.js';
import {
    canSeeMonster,
    canSpotMonster,
    messageAt,
    sensesMonster,
} from './startup_a11y.js';
import { getpos } from './getpos.js';
import { in_out_region } from './region.js';
import { make_blinded } from './potion.js';
import { mon_has_amulet } from './wizard.js';
import { verbalize } from './pline.js';
import { set_voice, yelp } from './sounds.js';
import { u_left_shop } from './shk.js';
import { note_unported } from './unported.js';
import { deltrap, fill_pit, Flying, reset_utrap, t_at, unconscious }
    from './trap.js';
import { somexyspace } from './mklev.js';
import { search_special } from './mkroom.js';
import { settrack } from './track.js';
import { ttyPline } from './tty_message.js';
import { vault_occupied } from './vault.js';
import { canseemon, couldsee, vision_recalc } from './vision.js';

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

// C ref: teleport.c rloc_to_core() relocation without messaging. Redraws the
// emptied square before track clearing, placement, and region-cache updates;
// the destination redraw and apparent-position update come last.
function relocateMonsterCore(monster, x, y, oldX, oldY, env) {
    remove_monster(oldX, oldY, env.state);
    env.newsym(oldX, oldY, env);
    mon_track_clear(monster);
    place_monster(monster, x, y, env.state);
    update_monster_region(monster, env.state);
    maybe_unhide_at(x, y, env.state);
    env.newsym(x, y, env);
    env.setApparxy(monster, env);
}

// C ref: teleport.c rloc_to_core() lines 1652-1732, messaging block.
// Computes vanishmsg/appearmsg/domsg from rlocflags and mstrategy, emits
// vanish/appear messages around the relocation. Returns a Promise<boolean>.
async function relocateWithMessages(monster, x, y, oldX, oldY, appearmsgInit,
    env) {
    const { state } = env;
    const message = env.message ?? ttyPline;
    let appearmsg = appearmsgInit;
    let telemsg = false;

    // C ref: teleport.c:1662-1672 -- pre-move message
    if (canSpotMonster(monster, state)) {
        if (couldsee(x, y, state) || sensesMonster(monster, state)) {
            telemsg = true;
        } else {
            await message(
                `${capitalizedMonsterName(monster, state)} vanishes!`,
                state,
            );
        }
        // "avoid 'It suddenly appears!' for a STRAT_APPEARMSG monster
        //  that has just teleported away if we won't see it after this
        //  vanishing (the regular appears message will be given if we
        //  do see it)"
        appearmsg = false;
    }

    relocateMonsterCore(monster, x, y, oldX, oldY, env);

    // C ref: teleport.c:1703-1726 -- post-placement messaging.
    // The u.ustuck condition and its "You and <monster> teleport together."
    // branch are omitted: preflightOrdinaryRloc() refuses ustuck monsters.
    if (canSpotMonster(monster, state) || appearmsg) {
        const du = dist2(x, y, state.u.ux, state.u.uy);
        const next = du <= 2 ? ' next to you' : null;
        const nearu = du <= BOLT_LIM * BOLT_LIM ? ' close by' : null;

        monster.mstrategy &= ~STRAT_APPEARMSG;
        if (telemsg
            && (couldsee(x, y, state) || sensesMonster(monster, state))) {
            const olddu = dist2(oldX, oldY, state.u.ux, state.u.uy);
            await message(
                `${capitalizedMonsterName(monster, state)}`
                + ' vanishes and reappears'
                + `${next ?? nearu
                    ?? (olddu === du ? ''
                        : du < olddu ? ' closer to you'
                        : ' farther away')}.`,
                state,
            );
        } else {
            const name = appearmsg
                ? Amonnam(monster, { state })
                : capitalizedMonsterName(monster, state);
            await message(
                `${name} `
                + `${appearmsg ? 'suddenly ' : ''}`
                + `${heroBlind(state) ? 'arrives' : 'appears'}`
                + `${next ?? nearu ?? ''}!`,
                state,
            );
        }
        // C ref: teleport.c:1730-1731 -- wand discovery. Deferred: the
        // witness path reaches rloc via seduction steal, not wand zap, so
        // gc.current_wand is null here.
    }

    return true;
}

// C ref: teleport.c rloc_to_core(), bounded ordinary-monster relocation path.
// Returns true synchronously when no messaging is needed (rlocflags=0 and no
// STRAT_APPEARMSG). Returns a Promise<true> when messaging fires.
function finishRandomRelocation(monster, x, y, env) {
    const { state } = env;
    const oldX = monster.mx;
    const oldY = monster.my;
    if (x === oldX && y === oldY && m_at(x, y, state) === monster)
        return true;

    // C ref: teleport.c rloc_to_core() lines 1652-1656, messaging flags.
    const rlocflags = env.rlocflags ?? 0;
    const preventmsg = (rlocflags & RLOC_NOMSG) !== 0;
    const vanishmsg = (rlocflags & RLOC_MSG) !== 0;
    const appearmsg = Boolean(monster.mstrategy & STRAT_APPEARMSG);
    const domsg = !state.in_mklev && (vanishmsg || appearmsg) && !preventmsg;

    if (!domsg) {
        relocateMonsterCore(monster, x, y, oldX, oldY, env);
        return true;
    }

    return relocateWithMessages(monster, x, y, oldX, oldY, appearmsg, env);
}

function preflightOrdinaryRloc(monster, rlocflags, rawEnv) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('rloc requires a monster');
    const env = teleportEnv(rawEnv);
    if (typeof env.random.rnd !== 'function')
        throw new TypeError('rloc random injection requires rnd');
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
        || env.state.go?.occupation) {
        throw new UnsupportedPositionCheckError(
            'extended rloc_to_core side effects',
        );
    }
    return {
        ...env,
        rlocflags,
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
            await relocateToFixedDestination(
                monster,
                destinationX,
                destinationY,
                env,
            );
        }
    } else {
        await rloc(monster, 0, env);
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

// C ref: teleport.c rloc_to(), which is rloc_to_core() with RLOC_NOMSG.
// Besides an arriving monster with mx == 0, hack.c revive_nasty() moves an
// ordinary on-map occupant away from a reviving corpse. Worm tails and the
// extended shop, trap, occupation, and hero-attachment tails remain bounded.
//
// Every message in rloc_to_core() is suppressed by RLOC_NOMSG, and the
// shopkeeper, shop-goods, occupation and trap tails below the placement each
// refuse rather than run.
function rloc_to_core(monster, x, y, rawEnv = {}) {
    const env = teleportEnv(rawEnv);
    const { state } = env;
    const redraw = env.newsym ?? newsym;
    const oldx = monster.mx;
    const oldy = monster.my;
    if (x === oldx && y === oldy && m_at(x, y, state) === monster)
        return monster;
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

    if (oldx) {
        remove_monster(oldx, oldy, state);
        redraw(oldx, oldy, state);
    }
    mon_track_clear(monster);
    place_monster(monster, x, y, state);
    update_monster_region(monster, state);
    // maybe_unhide_at(x, y) calls hideunder() for a monster whose mundetected
    // is set; an arriving follower's is clear, because dog.c relmon() cleared
    // it as the monster left the level it came from.
    maybe_unhide_at(x, y, state);
    redraw(x, y, state);
    // C ends rloc_to_core() with set_apparxy(). Dog-arrival callers already
    // have the hero square in mux/muy, but wizard.c tactics can relocate an
    // ordinary monster with stale apparent coordinates; use the caller's
    // canonical operation whenever it is supplied. The fallback preserves
    // the two existing arrival-only callers that intentionally pass a bare
    // state rather than an operation environment.
    if (typeof env.setApparxy === 'function')
        env.setApparxy(monster, { ...env, state });
    else {
        monster.mux = state.u.ux;
        monster.muy = state.u.uy;
    }
    return monster;
}

// C ref: teleport.c rloc_to_flag().  mnearto() uses this flagged entry point
// so RLOC_MSG remains distinct from the explicitly unflagged rloc_to() used
// by restoration/arrival callers.  The placement itself is shared with
// rloc_to_core(); only the source's optional vanish/arrival messages depend
// on the flag.
export function rloc_to_flag(monster, x, y, rlocflags = RLOC_NOMSG,
    rawEnv = {}) {
    const env = teleportEnv(rawEnv);
    const { state } = env;
    const preventmsg = (rlocflags & RLOC_NOMSG) !== 0;
    const vanishmsg = (rlocflags & RLOC_MSG) !== 0;
    let appearmsg = Boolean(monster.mstrategy & STRAT_APPEARMSG);
    const domsg = !state.in_mklev
        && (vanishmsg || appearmsg) && !preventmsg;
    if (!domsg) return rloc_to_core(monster, x, y, env);

    const message = env.message ?? ttyPline;
    const oldx = monster.mx;
    const oldy = monster.my;
    if (x === oldx && y === oldy && m_at(x, y, state) === monster)
        return monster;
    let telemsg = false;
    const oldSpotted = Boolean(oldx) && canSpotMonster(monster, state);
    if (oldSpotted) appearmsg = false;
    const before = oldSpotted
        ? (couldsee(x, y, state) || sensesMonster(monster, state)
            ? (telemsg = true, null)
            : message(
                `${capitalizedMonsterName(monster, state, env)} vanishes!`,
                state,
                env,
            ))
        : null;
    const finish = () => {
        rloc_to_core(monster, x, y, env);
        if (canSpotMonster(monster, state) || appearmsg) {
            const distance = dist2(x, y, state.u.ux, state.u.uy);
            const next = distance <= 2 ? ' next to you' : null;
            const near = distance <= BOLT_LIM * BOLT_LIM
                ? ' close by' : null;
            monster.mstrategy &= ~STRAT_APPEARMSG;
            if (telemsg
                && (couldsee(x, y, state) || sensesMonster(monster, state))) {
                const oldDistance = dist2(oldx, oldy, state.u.ux, state.u.uy);
                return message(
                    `${capitalizedMonsterName(monster, state, env)}`
                    + ' vanishes and reappears'
                    + `${next ?? near
                        ?? (oldDistance === distance ? ''
                            : distance < oldDistance ? ' closer to you'
                            : ' farther away')}.`,
                    state,
                    env,
                );
            }
            const name = appearmsg
                ? Amonnam(monster, { ...env, state })
                : capitalizedMonsterName(monster, state, env);
            return message(
                `${name} ${appearmsg ? 'suddenly ' : ''}`
                + `${heroBlind(state) ? 'arrives' : 'appears'}`
                + `${next ?? near ?? ''}!`,
                state,
                env,
            );
        }
        return undefined;
    };
    if (before && typeof before.then === 'function')
        return before.then(finish);
    return finish();
}

// C ref: teleport.c rloc_to(), which is rloc_to_core() with RLOC_NOMSG.
export function rloc_to(monster, x, y, rawEnv = {}) {
    return rloc_to_core(monster, x, y, rawEnv);
}

// C ref: mon.c mnexto(). Wizard destination control remains an explicit
// environment seam; overcrowding now follows mon.c's helper by default.
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
        else
            deal_with_overcrowding(monster, state, normalized);
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
    return rloc_to_flag(monster, coordinate.x, coordinate.y, _rlocflags,
        normalized);
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

// C ref: teleport.c safe_teleds() (717-770). After forty random safe squares,
// C searches a shuffled map-wide ring list, preferring non-trap squares and
// retaining the first acceptable trap square as a last resort.
export async function safe_teleds(teleds_flags, state = game) {
    for (let tcnt = 0; tcnt < 40; ++tcnt) {
        const nux = rnd(COLNO - 1);
        const nuy = rn2(ROWNO);
        if (await teleok(nux, nuy, false, state)) {
            await teleds(nux, nuy, teleds_flags, state);
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
        { state },
    );
    let backupspot = null;
    for (const { x, y } of candidates) {
        if (await teleok(x, y, false, state)) {
            await teleds(x, y, teleds_flags, state);
            return true;
        }
        if (!backupspot && t_at(x, y, state)
            && await teleok(x, y, true, state)) {
            backupspot = { x, y };
        }
    }
    if (backupspot) {
        await teleds(backupspot.x, backupspot.y, teleds_flags, state);
        return true;
    }
    return false;
}

// C ref: teleport.c vault_tele() (771-784). The one-shot teleport trap that
// mklev.c makevtele() hides in a niche sends the hero into the level's vault.
// C's `croom && somexyspace(...) && teleok(...)` short-circuits, so a level
// with no vault spends no randomness before falling through to tele().
export async function vault_tele(state = game) {
    const croom = search_special(VAULT, state);
    const c = { x: 0, y: 0 };

    if (croom && somexyspace(croom, c, { state })
        && await teleok(c.x, c.y, false, state)) {
        await teleds(c.x, c.y, TELEDS_TELEPORT, state);
        return;
    }
    await tele(state);
}

// C ref: teleport.c scrolltele() (849-915). The calm uncontrolled scroll
// branch reaches safe_teleds(); controlled, level-restricted, and direct
// teleport-command branches remain bounded to their existing callers.
export async function scrolltele(scroll, state = game) {
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

    if (scroll) learnscroll(scroll, state);
    await safe_teleds(TELEDS_TELEPORT, state);
}

// C ref: teleport.c tele() (841-845). tele_trap()'s fallback arm is its first
// caller in the running game, which is why scrolltele() now admits a null
// scroll instead of refusing one.
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
    u_on_newpos(nux, nuy, state);
    fill_pit(u.ux0, u.uy0, state);
    if (ball_active && state.uchain?.where === OBJ_FREE)
        await placebc(state);
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
        await switch_terrain(state);
    /* possible shop entry message comes after guard's shrill whistle */
    await spoteffects(true, state);
    invocation_message(state);
    notice_mon_on(state);
    await notice_all_mons(true, state);
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
                // shieldeff() animates a shield over the hero's square with
                // tmp_at(); nothing of tmp_at() is ported.
                // trapeffect_telep_trap()'s preflight refuses a magic-
                // resistant hero before the move commits, so this is proof
                // rather than a live branch.
                throw new UnsupportedHeroMoveBoundaryError(
                    'shieldeff() for a magic-resistant hero on a teleport trap',
                );
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
                    rloc_to(mtmp, cc.x, cc.y, { state });
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
    if (!force_dest && !next_to_u(state)) {
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
