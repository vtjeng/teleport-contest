// do.js -- Commands that drop, dig into, or descend through the floor, and
// the up command.
// C refs: do.c -- dodrop(), flooreffects(), canletgo(), drop(), dropx(),
// dropy(), dropz(), trycall(), u_stuck_cannot_go(), dodown(), doup(),
// goto_level(), u_collide_m(), temperature_change_msg() and
// legs_in_no_shape(), set_wounded_legs(); dokick.c obj_delivery(); mon.c
// kill_genocided_monsters(); questpgr.c deliver_splev_message().

import {
    ACH_ASTR,
    ACH_BGRM,
    ACH_ENDG,
    ACH_HELL,
    ACH_MINE,
    ACH_SOKO,
    A_DEX,
    BOTH_SIDES,
    BLINDED,
    DEAF,
    CORR,
    DIR_DOWN,
    DIR_UP,
    DISMOUNT_FELL,
    DOOR,
    DRAWBRIDGE_UP,
    DB_FLOOR,
    DB_UNDER,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    ER_DESTROYED,
    ESCAPED,
    FACE,
    FUMBLING,
    GETOBJ_ALLOWCNT,
    GETOBJ_PROMPT,
    G_GENOD,
    HAND,
    HALF_PHDAM,
    IS_ALTAR,
    IS_WATERWALL,
    IS_SINK,
    In_endgame,
    In_mines,
    In_quest,
    In_sokoban,
    In_tutorial,
    Is_knox_level,
    KILLED_BY,
    LADDER,
    LEG,
    LEFT_SIDE,
    LEVITATION,
    LFILE_EXISTS,
    LOST_DROPPED,
    MAGIC_PORTAL,
    OBJ_INVENT,
    OBJ_FLOOR,
    OBJ_FREE,
    CXN_SINGULAR,
    ROOM,
    RLOC_NOMSG,
    PRIMARYSET,
    ROGUESET,
    SLT_ENCUMBER,
    STAIRS,
    TIMEOUT,
    TT_BURIEDBALL,
    TELEDS_NO_FLAGS,
    TT_PIT,
    TRAPDOOR,
    UNENCUMBERED,
    UTOTYPE_NONE,
    UTOTYPE_ATSTAIRS,
    UTOTYPE_DEFERRED,
    UTOTYPE_FALLING,
    UTOTYPE_PORTAL,
    UTOTYPE_RMPORTAL,
    Upolyd,
    VIBRATING_SQUARE,
    VISITED,
    RIGHT_SIDE,
    WOUNDED_LEGS,
    W_ACCESSORY,
    W_ARMOR,
    W_SADDLE,
    HALLUC,
    HALLUC_RES,
    HOLE,
    is_pit,
    u_at,
    LL_ACHIEVE,
    LL_DEBUG,
    is_hole,
    plur,
    something,
    st_all,
} from './const.js';
import { reset_trapset } from './apply.js';
import { bones_include_name } from './bones.js';
import { obj_resists } from './bury.js';
import { ballrelease, drag_down, placebc, unplacebc } from './ball.js';
import { next_to_u } from './apply_next_to_u.js';
import { reset_occupations, set_move_cmd, set_occupation } from './cmd.js';
import {
    check_gold_symbol,
    describe_level,
    docrt,
    flush_screen,
    map_background,
    newsym,
    reglyph_darkroom,
} from './display.js';
import { Adjmonnam, Monnam, docall, hliquid, y_monnam } from './do_name.js';
import { setwornEnv } from './do_wear.js';
import { keepdogs, losedogs, update_mlstmv } from './dog.js';
import { can_reach_floor, engr_at } from './engrave.js';
import { makeplural } from './fruit.js';
import {
    Can_fall_thru,
    In_hell,
    In_W_tower,
    On_W_tower_level,
    assign_level,
    assign_rnd_level,
    at_dgn_entrance,
    builds_up,
    depth,
    dunlev,
    dunlev_reached,
    dunlevs_in_dungeon,
    ledger_to_dnum,
    ledger_no,
    level_difficulty,
    level_info,
    maxledgerno,
    next_level,
    on_level,
    print_level_annotation,
    recbranch_mapseen,
    prev_level,
    recalc_mapseen,
    remdun_mapseen,
    set_dunlev_reached,
    u_on_newpos,
    u_on_rndspot,
} from './dungeon.js';
import { more_experienced, newexplevel } from './exper.js';
import { record_achievement } from './insight.js';
import { game } from './gstate.js';
import { livelog_printf } from './pline.js';
import { dist2, upstart } from './hacklib.js';
import { get_obj_location } from './light.js';
import {
    losehp,
    near_capacity,
    notice_all_mons,
    notice_mon_off,
    notice_mon_on,
    set_uinwater,
    switch_terrain,
    u_locomotion,
    u_rooted,
} from './hack.js';
import {
    any_obj_ok,
    freeinv,
    getobj,
    mergable,
    obfree,
    preflight_update_inventory,
    stackobj,
    useupf,
} from './invent.js';
import { maybe_reset_pick } from './lock.js';
import { mklev } from './mklev.js';
import { makemon } from './makemon_create.js';
import { fumaroles, movebubbles } from './mkmaze.js';
import { m_into_limbo, mondied, set_ustuck } from './mon.js';
import { m_at } from './monst.js';
import { gulp_blnd_check } from './mhitu.js';
import {
    is_whirly, olfaction, passes_walls, throws_rocks,
} from './mondata.js';
import { m_in_air, youHear } from './monmove.js';
import {
    PM_DEATH,
    PM_FAMINE,
    PM_PESTILENCE,
    PM_CROESUS,
    PM_ROGUE,
    PM_TOURIST,
} from './monsters.js';
import {
    is_pick, obj_meld, obj_nexto_xy, objectType, place_object,
    pudding_merge_message, remove_object, set_bknown, weight,
} from './obj.js';
import { oinit } from './o_init.js';
import {
    The, Tobjnam, corpse_xname, donameFresh, is_plural, the, vtense, xnameFresh,
} from './objnam.js';
import {
    BOULDER,
    CORPSE,
    LEASH,
    LOADSTONE,
    MEAT_RING,
    POT_OIL,
    POTION_CLASS,
    RING_CLASS,
} from './objects.js';
import { body_part } from './polyself.js';
import { incr_itimeout, make_blinded, set_itimeout } from './potion.js';
import {
    encumber_msg,
    pickup,
    preflight_projected_random_arrival_pickup,
    u_safe_from_fatal_corpse,
} from './pickup.js';
import { ok_to_quest, onquest } from './quest.js';
import { com_pager } from './questpgr.js';
import { in_out_region, visible_region_at } from './region.js';
import { getlev } from './restore.js';
import { delete_levelfile } from './files.js';
import { cloneIsaacContext, createCoreRandom, d, rn2, rnd } from './rng.js';
import { check_special_room, move_update } from './rooms.js';
import { savelev } from './save.js';
import { costly_spot } from './shk.js';
import { ship_object } from './dokick.js';
import {
    stairway_at,
    stairway_find_from,
    stairway_free_all,
    u_on_dnstairs,
    u_on_upstairs,
    u_on_sstairs,
} from './stairs.js';
import { Punished, dismount_steed, stucksteed } from './steed.js';
import { enexto, mnexto, safe_teleds } from './teleport.js';
import { run_timers } from './timeout.js';
import {
    fill_pit,
    is_lava,
    is_pool,
    is_pool_or_lava,
    Flying,
    Levitation,
    reset_utrap,
    t_at,
    uescaped_shaft,
    uteetering_at_seen_pit,
} from './trap.js';
import { seetrap } from './trap_effects.js';
import { ttyNorep, ttyPline } from './tty_message.js';
import { heroIsBlind } from './startup_a11y.js';
import { note_unported } from './unported.js';
import {
    cansee,
    canseemon,
    recalc_block_point,
    vision_recalc,
    vision_reset,
} from './vision.js';
import { welded } from './wield.js';
import { bimanual, setuqwep, setuswapwep, setuwep } from './worn.js';
import { resurrect } from './wizard.js';
import { assign_graphics } from './symbols.js';
import { done } from './end.js';
import { tutorial } from './nhlua.js';

// A fail-closed boundary for goto_level() branches outside the ordinary
// staircase descent and positive-decimal level teleport ports.
export class UnsupportedLevelChangeError extends Error {
    constructor(reason) {
        super(`unsupported level change: ${reason}`);
        this.name = 'UnsupportedLevelChangeError';
        this.reason = reason;
    }
}

// C ref: do.c revive_corpse() (2111-2250), floor arm used by hack.c
// revive_nasty(). revive() owns creation and corpse deletion; this wrapper
// snapshots the corpse description and reports the source-specific result.
export async function revive_corpse(corpse, state = game) {
    if (corpse?.where !== OBJ_FLOOR) {
        throw new UnsupportedLevelChangeError(
            'revive_corpse() outside its floor arm',
        );
    }
    const chewed = Boolean(corpse.oeaten);
    const cname = corpse_xname(
        corpse,
        chewed ? 'bite-covered' : null,
        CXN_SINGULAR,
        state,
    );
    const coordinate = get_obj_location(corpse, 0, state);
    const { revive } = await import('./zap.js');
    const monster = await revive(corpse, false, { state });
    if (!monster) return false;

    if (cansee(coordinate.x, coordinate.y, state)
        || canseemon(monster, state)) {
        let effect = '';
        if (monster.data === state.mons[PM_DEATH])
            effect = ' in a whirl of spectral skulls';
        else if (monster.data === state.mons[PM_PESTILENCE])
            effect = ' in a churning pillar of flies';
        else if (monster.data === state.mons[PM_FAMINE])
            effect = ' in a ring of withered crops';

        if (canseemon(monster, state)) {
            const name = chewed
                ? Adjmonnam(monster, 'bite-covered', state)
                : Monnam(monster, state);
            await ttyPline(`${name} rises from the dead${effect}!`, state);
        } else {
            await ttyPline(`${The(cname, state)} disappears${effect}!`, state);
        }
    }
    return true;
}

// C ref: do.c wipeoff() (2361-2385). The occupation callback independently
// clamps and decrements the cream and temporary-blindness timeouts. It may
// finish with either sight restored, a clean face that remains blind, or a
// continuation while cream remains.
export async function wipeoff(state = game) {
    const hero = state.u;
    const blinded = hero.uprops[BLINDED];
    let creamDelta = hero.ucreamed;
    let blindDelta = blinded.intrinsic & TIMEOUT;

    if (creamDelta > 4) creamDelta = 4;
    hero.ucreamed -= creamDelta;
    if (blindDelta > 4) blindDelta = 4;
    incr_itimeout(blinded, -blindDelta);

    if (!blinded.intrinsic) {
        await ttyPline("You've got the glop off.", state);
        hero.ucreamed = 0;
        if (!gulp_blnd_check(state)) {
            set_itimeout(blinded, 1);
            await make_blinded(0, true, state);
        }
        return 0;
    } else if (!hero.ucreamed) {
        await ttyPline(
            `Your ${body_part(FACE, state.youmonst)} feels clean now.`,
            state,
        );
        return 0;
    }
    return 1;
}

// C ref: do.c dowipe() (2388-2407). A dirty face installs wipeoff() as an
// untimed occupation; a clean face reports that state and still spends a turn.
export async function dowipe(state = game) {
    if (state.u.ucreamed) {
        set_occupation(
            wipeoff,
            `wiping off your ${body_part(FACE, state.youmonst)}`,
            0,
            state,
        );
    } else {
        await ttyPline(
            `Your ${body_part(FACE, state.youmonst)} is already clean.`,
            state,
        );
    }
    return ECMD_TIME;
}

// do.c goto_level() receives earth_sense()'s synchronous pline before
// u_on_rndspot() reaches switch_terrain().  The display port is asynchronous,
// so keep those two effects together at their source-ordered await boundary.
export async function finish_random_arrival_effects(
    earthSenseMessages,
    state = game,
    { message = ttyPline, switchTerrain = switch_terrain } = {},
) {
    for (const line of earthSenseMessages) await message(line, state);
    await switchTerrain(state);
}

// Async integration seam for do.c goto_level()'s random-arrival arm. The
// placement helper and switchTerrain both complete before the next arrival
// effect, preserving C's earth_sense() then switch_terrain() order.
export async function place_random_arrival(
    upflag,
    state = game,
    {
        message = ttyPline,
        switchTerrain = switch_terrain,
        place = u_on_rndspot,
        // The default placement operation is called first in planning mode
        // and then live. It must honor planPositionOnly without live effects;
        // inject a distinct planPlace when an alternate place operation cannot.
        planPlace = place,
    } = {},
) {
    const earthSenseMessages = [];
    const preflightArrival = (x, y, liveState) => {
        // This is a write-set clone, not a general deep clone. move_update()
        // writes u and its room buffers, and projected pickup writes gw.wc;
        // the pickup admission helper currently only reads context, gp, and
        // iflags. The shared level, inventory, and object graph stays
        // read-only. Extend this list before an operation on the projection
        // gains another nested write owner.
        const projected = {
            ...liveState,
            context: { ...(liveState.context ?? {}) },
            gp: { ...(liveState.gp ?? {}) },
            gw: { ...(liveState.gw ?? {}) },
            iflags: { ...(liveState.iflags ?? {}) },
            u: { ...liveState.u, ux: x, uy: y },
        };
        for (const field of [
            'urooms',
            'urooms0',
            'uentered',
            'ushops',
            'ushops0',
            'ushops_entered',
            'ushops_left',
        ]) projected.u[field] = [...(liveState.u[field] ?? [])];
        move_update(false, projected);
        // Pickup admission refreshes the weight cache, so its API accepts only
        // this projected state and cannot default to the live game.
        preflight_projected_random_arrival_pickup(projected);
    };
    // Atomic arrival admission is a lockstep dry-run/replay protocol. The dry
    // pass must follow exactly the candidate-selection control flow of the
    // live pass, using only the cloned core RNG and mutation-free preflight.
    // Its callbacks must not change any live selection input. Only after that
    // pass succeeds may the identical traversal consume the live RNG and
    // commit its selected coordinate.
    if (planPlace) {
        const plannedRandom = createCoreRandom(
            cloneIsaacContext(state.coreCtx ?? game.coreCtx),
            state,
        );
        await planPlace(upflag, state, {
            planPositionOnly: true,
            randomOneBased: plannedRandom.rn1,
            preflightPosition: preflightArrival,
        });
    }
    await place(upflag, state, {
        earthSenseMessage: (line) => earthSenseMessages.push(line),
        deferSwitchTerrain: true,
        preflightPosition: preflightArrival,
    });
    await finish_random_arrival_effects(earthSenseMessages, state, {
        message,
        switchTerrain,
    });
}

// C ref: do.c maybe_lvltport_feedback() (2031-2040). goto_level() calls this
// after repainting the destination but before any special-level arrival text,
// so the level-teleport message becomes the top line of the arrival screen.
export async function maybe_lvltport_feedback(state = game) {
    const postMessage = state.gd?.dfr_post_msg;
    if (postMessage
        && postMessage.slice(0, 15).toLowerCase() === 'you materialize') {
        await ttyPline(postMessage, state);
        state.gd.dfr_post_msg = null;
    }
}

// C ref: do.c schedule_goto() (2056-2070). The deferred bit is deliberately
// present even for UTOTYPE_NONE: allmain.c keys off the nonzero field after
// the command stack has unwound.
export function schedule_goto(
    tolev,
    utotype_flags,
    pre_msg,
    post_msg,
    state = game,
) {
    state.u.utotype = utotype_flags | UTOTYPE_DEFERRED;
    assign_level(state.u.utolev, tolev);
    state.gd ??= {};
    if (pre_msg) state.gd.dfr_pre_msg = String(pre_msg);
    if (post_msg) state.gd.dfr_post_msg = String(post_msg);
}

// C ref: do.c deferred_goto() (2074-2102). This is async only because the
// port's messages and goto_level() are async; their order is C's order.
export async function deferred_goto(state = game) {
    const u = state.u;
    state.gd ??= {};
    if (!on_level(u.uz, u.utolev)) {
        const dest = { ...u.utolev };
        const oldlev = { ...u.uz };
        const typmask = u.utotype;

        if (state.gd.dfr_pre_msg)
            await ttyPline(state.gd.dfr_pre_msg, state);
        await goto_level(
            dest,
            Boolean(typmask & UTOTYPE_ATSTAIRS),
            Boolean(typmask & UTOTYPE_FALLING),
            Boolean(typmask & UTOTYPE_PORTAL),
            state,
        );
        if (typmask & UTOTYPE_RMPORTAL) {
            // trap.c deltrap() is not ported. No level-teleport transition
            // carries this flag; portal ejection owns the first live use.
            throw new UnsupportedLevelChangeError(
                'deferred_goto() removing a destination portal',
            );
        }
        if (state.gd.dfr_post_msg) {
            if (!on_level(u.uz, oldlev))
                await ttyPline(state.gd.dfr_post_msg, state);
        }
    }
    u.utotype = UTOTYPE_NONE;
    state.gd.dfr_pre_msg = null;
    state.gd.dfr_post_msg = null;
}

// Renders youprop.h's `(HProperty || EProperty)` shape only. That is not what
// every property macro says, so a caller must read the macro it wants before
// reusing this: Flying (youprop.h:253-255) is
// `((HFlying || EFlying || (u.usteed && is_flyer(u.usteed->data))) && !BFlying)`,
// with a steed term and a blocker this helper models neither.
// js/worn.js setworn() is the port's only writer of an extrinsic property.
function heroPropertyActive(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: do.c familiar_level_msg() (1448-1476). Displays a random "deja vu"
// message when the hero enters a bones level that came from a previous game
// played under the same name. Consumes one rn2(4) call.
async function familiar_level_msg(state) {
    const fam_msgs = [
        'You have a sense of deja vu.',
        'You feel like you\'ve been here before.',
        'This place %s familiar...',
        null, // no message
    ];
    const halu_fam_msgs = [
        'Whoa!  Everything %s different.',
        'You are surrounded by twisty little passages, all alike.',
        'Gee, this %s like uncle Conan\'s place...',
        null, // no message
    ];
    const which = rn2(4);
    const halluc = heroPropertyActive(state.u, HALLUC)
        && !heroPropertyActive(state.u, HALLUC_RES);
    let mesg = halluc ? halu_fam_msgs[which] : fam_msgs[which];
    if (mesg && mesg.includes('%s')) {
        const blind = Boolean(state.u.uprops?.[BLINDED]?.intrinsic
            || state.u.uprops?.[BLINDED]?.extrinsic);
        mesg = mesg.replace('%s', !blind ? 'looks' : 'seems');
    }
    if (mesg)
        await ttyPline(mesg, state);
}

// C ref: you.h next2u(), which is `distu(px, py) <= 2`.
function next2u(x, y, state) {
    return dist2(x, y, state.u.ux, state.u.uy) <= 2;
}

// C's Deaf macro has the role conduct and the active property as separate
// sources. Keeping this local avoids making a display-only dependency part of
// the floor mutation owner.
function heroIsDeaf(state) {
    const deaf = state.u?.uprops?.[DEAF];
    return Boolean(deaf?.intrinsic || deaf?.extrinsic
        || state.u?.uroleplay?.deaf);
}

// hack.h Maybe_Half_Phys() rounds up, preserving the source damage contract
// for a boulder-created lava splash.
function maybeHalfPhysical(damage, state) {
    const property = state.u?.uprops?.[HALF_PHDAM];
    return property?.intrinsic || property?.extrinsic
        ? Math.trunc((damage + 1) / 2) : damage;
}

// C ref: do.c boulder_hits_pool() (50-145). A boulder consumes itself when it
// reaches a pool, moat, water wall, or lava, with one source rn2(10) deciding
// whether the square fills. The helper is async because a dead monster on a
// filled square runs the existing mondead owner; its boolean remains the
// direct source return used by flooreffects().
export async function boulder_hits_pool(otmp, rx, ry, pushing = false, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (!otmp || otmp.otyp !== BOULDER)
        return false;
    if (!is_pool_or_lava(rx, ry, state)) return false;
    const random = rawEnv.random ?? { rn2 };
    const location = state.level?.at(rx, ry);
    const lava = is_lava(rx, ry, state);
    const what = (await import('./pager.js')).waterbody_name(
        rx,
        ry,
        state,
        { displayRandom: rawEnv.displayRandom },
    );
    const chance = random.rn2(10);
    const onWaterLevel = Boolean(state.u?.uz && state.water_level
        && state.u.uz.dnum === state.water_level.dnum
        && state.u.uz.dlevel === state.water_level.dlevel);
    const fillsUp = onWaterLevel ? false
        : IS_WATERWALL(location?.typ) ? chance < 5
            : lava ? chance === 0 : chance !== 0;
    const message = rawEnv.message ?? ttyPline;
    const redraw = rawEnv.newsym ?? newsym;

    if (fillsUp) {
        const trap = t_at(rx, ry, state);
        if (location?.typ === DRAWBRIDGE_UP) {
            const mask = ((location.flags ?? location.drawbridgemask ?? 0)
                & ~DB_UNDER) | DB_FLOOR;
            location.flags = mask;
            location.drawbridgemask = mask;
        } else {
            location.typ = ROOM;
            location.flags = 0;
            recalc_block_point(rx, ry, state);
        }
        const monster = m_at(rx, ry, state);
        if (monster && monster.mhp >= 1 && !m_in_air(monster, state)) {
            // mondead() is an existing owner; C discards its return here.
            await mondied(monster, state, rawEnv);
        }
        const currentTrap = t_at(rx, ry, state);
        if (currentTrap) {
            const { delfloortrap } = await import('./trap.js');
            delfloortrap(currentTrap, state);
        }
        // C discards bury_objs()'s result; no JS owner exists yet.
        note_unported('dig.c bury_objs');
        redraw(rx, ry, state);
        if (pushing) {
            const who = state.u?.usteed
                ? y_monnam(state.u.usteed, state)
                : 'you';
            const subject = upstart(who);
            await message(
                `${subject} ${vtense(who, 'push')} `
                    + `${the(xnameFresh(otmp, state), state)} into the ${what}.`,
                state,
            );
            if (state.flags?.verbose !== false && !heroIsBlind(state)) {
                await message('Now you can cross it!', state);
            }
        }
    }
    if (!fillsUp || !pushing) {
        if (!state.u?.uinwater) {
            const visible = pushing ? !heroIsBlind(state) : cansee(rx, ry, state);
            if (visible) {
                await message(
                    `There is a large splash as ${the(xnameFresh(otmp, state), state)} `
                        + `${fillsUp ? 'fills' : 'falls into'} the ${what}.`,
                    state,
                );
            } else if (!heroIsDeaf(state)) {
                await message(`You hear a${lava ? ' sizzling' : ''} splash.`, state);
            }
            await (rawEnv.wakeNear ?? wake_nearto)(rx, ry, 40, {
                ...rawEnv,
                state,
            });
        }
        if (fillsUp && state.u?.uinwater
            && dist2(rx, ry, state.u.ux, state.u.uy) === 0) {
            await set_uinwater(0, state);
            if (typeof rawEnv.docrt === 'function') await rawEnv.docrt(state);
            else await docrt();
            state.vision_full_recalc = 1;
            await message('You find yourself on dry land again!', state);
        } else if (lava && next2u(rx, ry, state)) {
            const fireResistant = Boolean(state.u?.uprops?.[FIRE_RES]?.intrinsic
                || state.u?.uprops?.[FIRE_RES]?.extrinsic);
            await message(
                `You are hit by molten ${hliquid('lava', {
                    state,
                    displayRandom: rawEnv.displayRandom,
                })}${fireResistant ? '.' : '!'}`,
                state,
            );
            note_unported('trap.c burn_away_slime');
            const damage = random.d
                ? random.d(fireResistant ? 1 : 3, 6)
                : Array.from({ length: fireResistant ? 1 : 3 },
                    () => random.rnd(6)).reduce((sum, n) => sum + n, 0);
            await losehp(
                maybeHalfPhysical(damage, state),
                'molten lava',
                KILLED_BY,
                state,
            );
        } else if (!fillsUp && state.flags?.verbose !== false
            && cansee(rx, ry, state)) {
            await message('It sinks without a trace!', state);
        }
    }
    if (pushing) {
        await useupf(otmp, otmp.quan, { ...rawEnv, state, random });
    } else {
        obfree(otmp, null, { ...rawEnv, state });
    }
    return true;
}

// C ref: do.c flooreffects() (161-357). The object arrives detached, then
// each source landing arm runs in order. The saved bhitpos is restored even
// when an asynchronous water/fire or break operation fails, matching C's
// caller-visible state boundary.
export async function flooreffects(obj, x, y, verb, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (!obj || obj.where !== OBJ_FREE)
        throw new Error('flooreffects: obj not free');
    const previous = state.gb?.bhitpos
        ? { ...state.gb.bhitpos } : null;
    state.gb ??= {};
    state.gb.bhitpos = { x, y };
    obj.nobj = null;
    obj.nexthere = null;
    let result = false;
    try {
        if (obj.otyp === BOULDER
            && await boulder_hits_pool(obj, x, y, false, rawEnv)) {
            return true;
        }
        const trap = t_at(x, y, state);
        if (obj.otyp === BOULDER && trap
            && (is_pit(trap.ttyp) || is_hole(trap.ttyp))) {
            const trappedMonster = m_at(x, y, state);
            const trappedHero = u_at(x, y, state)
                && (state.u?.utrap ?? 0);
            if ((trappedMonster?.mtrapped || trappedHero)
                && verb
                && (cansee(x, y, state) || dist2(x, y, state.u.ux, state.u.uy) === 0)) {
                const subject = cansee(x, y, state) ? 'The' : 'A';
                await (rawEnv.message ?? ttyPline)(
                    `${subject} boulder ${verb} into the pit`
                        + `${trappedMonster ? '' : ' with you'}.`,
                    state,
                );
            }
            if (trappedMonster && trappedMonster.mtrapped) {
                if (!passes_walls(trappedMonster.data)
                    && !throws_rocks(trappedMonster.data)) {
                    if (state.context?.mon_moving) {
                        const { dmgval } = await import('./weapon.js');
                        trappedMonster.mhp -= dmgval(obj, trappedMonster, state, rawEnv);
                        if (trappedMonster.mhp < 1)
                            await mondied(trappedMonster, state, rawEnv);
                    } else {
                        const { hmon } = await import('./uhitm.js');
                        await hmon(trappedMonster, obj, 1, 1, state, rawEnv);
                    }
                }
                if (trappedMonster.mhp >= 1 && !is_whirly(trappedMonster.data))
                    result = false;
                trappedMonster.mtrapped = 0;
            } else if (trappedHero) {
                if (!passes_walls(state.youmonst?.data)
                    && !throws_rocks(state.youmonst?.data)) {
                    const random = rawEnv.random ?? { rnd };
                    await losehp(
                        maybeHalfPhysical(random.rnd(15), state),
                        'squished under a boulder',
                        NO_KILLER_PREFIX,
                        state,
                    );
                } else {
                    reset_utrap(true, state);
                }
            }
            if (verb) {
                const message = rawEnv.message ?? ttyPline;
                const blind = heroIsBlind(state);
                if (blind && u_at(x, y, state)) {
                    if (!heroIsDeaf(state))
                        await message(
                            `You hear ${the(xnameFresh(obj, state), state)} `
                                + 'tumble downwards.',
                            state,
                        );
                } else if (!blind && cansee(x, y, state)) {
                    const trigger = trap.ttyp === TRAPDOOR && !trap.tseen
                        ? 'The boulder triggers and ' : 'The boulder ';
                    const action = trap.ttyp === TRAPDOOR
                        ? 'plugs a trap door'
                        : trap.ttyp === HOLE ? 'plugs a hole' : 'fills a pit';
                    await message(`${trigger}${action}.`, state);
                } else if (!heroIsDeaf(state)) {
                    await message(`You hear a boulder ${verb}.`, state);
                }
            }
            const currentTrap = t_at(x, y, state);
            if (currentTrap) {
                const { delfloortrap } = await import('./trap.js');
                delfloortrap(currentTrap, state);
            }
            await useupf(obj, 1, { ...rawEnv, state });
            note_unported('dig.c bury_objs');
            (rawEnv.newsym ?? newsym)(x, y, state);
            return true;
        }
        if (is_lava(x, y, state)) {
            const { lava_damage } = await import('./trap_water_damage.js');
            result = await lava_damage(obj, x, y, {
                ...rawEnv,
                state,
                random: rawEnv.random ?? { rn2, rnd },
            });
            return result;
        }
        if (is_pool(x, y, state)) {
            const blind = heroIsBlind(state);
            const floating = Levitation(state) || Flying(state);
            if ((blind || floating) && !heroIsDeaf(state)
                && u_at(x, y, state)) {
                if (!state.u?.uinwater) {
                    if (weight(obj, { state }) > WT_SPLASH_THRESHOLD) {
                        await (rawEnv.message ?? ttyPline)('Splash!', state);
                    } else if (floating) {
                        await (rawEnv.message ?? ttyPline)('Plop!', state);
                    }
                }
                map_background(x, y, 0, state);
                (rawEnv.newsym ?? newsym)(x, y, state);
            }
            const { water_damage } = await import('./trap_water_damage.js');
            result = (await water_damage(obj, null, false, {
                ...rawEnv,
                state,
                random: rawEnv.random ?? { rn2, rnd },
            })) === ER_DESTROYED;
            return result;
        }
        if (u_at(x, y, state) && trap
            && (uteetering_at_seen_pit(trap, state)
                || uescaped_shaft(trap, state))) {
            if (is_pit(trap.ttyp) && verb) {
                await (rawEnv.message ?? ttyPline)(
                    `${Tobjnam(obj, 'tumble', state)} into a pit.`, state,
                );
            } else if (await ship_object(obj, x, y, false, {
                ...rawEnv,
                state,
            })) {
                return true;
            }
        } else if (obj.globby) {
            let survivor = obj;
            while (survivor) {
                const other = obj_nexto_xy(survivor, x, y, true, state);
                if (!other) break;
                await pudding_merge_message(survivor, other, state, rawEnv);
                survivor = obj_meld(survivor, other, state, rawEnv);
            }
            return !survivor;
        } else if (state.context?.mon_moving && IS_ALTAR(state.level?.at(x, y)?.typ)
            && cansee(x, y, state)) {
            // doaltarobj() is a void pray.c dependency, so preserve its gap.
            note_unported('pray.c doaltarobj');
        } else if (obj.oclass === POTION_CLASS
            && Math.trunc(state.level?.flags?.temperature ?? 0) > 0
            && (state.level?.at(x, y)?.typ === ROOM
                || state.level?.at(x, y)?.typ === CORR)) {
            if (cansee(x, y, state)) {
                await (rawEnv.message ?? ttyPline)(
                    `${Tobjnam(obj, 'heat', state)} up as `
                        + `${is_plural(obj) ? 'they hit' : 'it hits'} the hot ground.`,
                    state,
                );
            }
            let survivalChance = obj.blessed ? 70 : 50;
            if (obj.invlet) survivalChance += Math.trunc(state.u?.luck ?? 0) * 2;
            if (obj.otyp === POT_OIL) survivalChance = 100;
            const random = rawEnv.random ?? { rn2, rnd };
            if (!obj_resists(obj, survivalChance, 100, {
                ...rawEnv,
                state,
                random,
            })) {
                if (cansee(x, y, state)) {
                    await (rawEnv.message ?? ttyPline)(
                        `${is_plural(obj) ? 'They shatter' : 'It shatters'} from the heat!`,
                        state,
                    );
                } else if (!heroIsDeaf(state)) {
                    await (rawEnv.message ?? ttyPline)(
                        'You hear a shattering noise.', state,
                    );
                }
                const { breakobj } = await import('./dothrow.js');
                await breakobj(obj, x, y, false, false, {
                    ...rawEnv,
                    state,
                    random,
                });
                return true;
            }
        }
        return result;
    } finally {
        if (previous) state.gb.bhitpos = previous;
        else delete state.gb.bhitpos;
    }
}

// C ref: do.c trycall() (393-400), translated whole. "If obj is neither
// formally identified nor informally called something already, prompt the
// player to call its object type."
//
// Both terms read the shared objects[] row rather than the object: a hero who
// has identified one potion of oil is never asked to name another. That is why
// potion.c potionbreathe()'s tail is silent for a starting inventory, whose
// types u_init.c ini_inv_use_obj() discovered as it handed them over.
export async function trycall(obj, state = game) {
    const type = objectType(obj, state);
    if (!type.oc_name_known && !type.oc_uname)
        await docall(obj, state);
}

// Every branch of the drop chain -- dodrop(), drop() and the
// dropx()/dropy()/dropz() tail -- that this port has not translated raises
// this. js/cmd.js failClosedCommandRefusals() lists it, so the segment keeps
// every frame the command already matched instead of failing hard. Callers
// other than the `d` command reach the tail with their own messages, billing,
// equipment, migration and impact behavior still unported.
export class UnsupportedDropError extends Error {
    constructor(reason) {
        super(`unsupported drop: ${reason}`);
        this.name = 'UnsupportedDropError';
        this.reason = reason;
    }
}

function dropEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        hooks: env.hooks ?? {},
    };
}

function requiredDropHook(env, name) {
    const hook = env.hooks[name];
    if (typeof hook !== 'function')
        throw new UnsupportedDropError(`missing ${name} operation`);
    return hook;
}

// The three operations the dropz() tail needs. C calls newsym() and
// encumber_msg() from inside dropz() itself, at do.c:840 and :842, and reaches
// remove_object() through stackobj() -> merged() -> obj_extract_self() when
// the landing object absorbs a pile member. All three are injected because
// display.c, pickup.c and mkobj.c own them.
function dropCommandEnv(state) {
    return {
        state,
        hooks: {
            encumberMessage: encumber_msg,
            extractExternalObject: remove_object,
            newsym,
        },
    };
}

// C ref: do.c dodrop() (28-42), the 'd' command.
export async function dodrop(state = game) {
    let result;

    // C's `*u.ushops` is the first entry of the room list naming the shops the
    // hero stands in; hack.c move_update() maintains it and js/rooms.js stores
    // it as a fixed five-entry array, so an empty list reads as a zero here
    // exactly as an empty string does there.
    if (state.u?.ushops?.[0]) {
        // shk.c sellobj_state() switches the shopkeeper's billing mode either
        // side of the drop, which is what makes a deliberate drop an offer to
        // sell. Both calls stop together, because the drop between them is
        // what they bracket.
        throw new UnsupportedDropError('sellobj_state() inside a shop');
    }
    result = await drop(
        await getobj(
            'drop', any_obj_ok, GETOBJ_PROMPT | GETOBJ_ALLOWCNT, state,
        ),
        state,
    );
    // do.c:37-38's second `if (*u.ushops)` reads the same value, which the
    // drop cannot change; the arm above has already stopped every hero it
    // would be true for.
    if (result)
        reset_occupations(state);

    return result;
}

// C ref: do.c canletgo() (664-711). Answers whether the hero can let go of an
// object and says why when she cannot. `word` is the verb the message uses;
// C's callers pass "" to ask the question without a message, and every test on
// it is written out here even though the one ported caller passes "drop".
export async function canletgo(obj, word, state = game) {
    if (obj.owornmask & (W_ARMOR | W_ACCESSORY)) {
        if (word) {
            await ttyNorep(
                `You cannot ${word} ${something} you are wearing.`, state,
            );
        }
        return false;
    }
    if (obj === state.uwep && welded(state.uwep, state)) {
        /* no weldmsg(), so uwep->bknown might become set silently
           if word is "" */
        if (word) {
            let hand = body_part(HAND, state.youmonst);

            if (bimanual(state.uwep, state))
                hand = makeplural(hand);
            await ttyNorep(
                `You cannot ${word} ${something} welded to your ${hand}.`,
                state,
            );
        }
        return false;
    }
    if (obj.otyp === LOADSTONE && obj.cursed) {
        /* getobj() kludge sets corpsenm to user's specified count
           when refusing to split a stack of cursed loadstones */
        if (word) {
            /* getobj() ignores a count for throwing since that is
               implicitly forced to be 1; replicate its kludge... */
            if (word === 'throw' && obj.quan > 1)
                obj.corpsenm = 1;
            await ttyPline(
                `For some reason, you cannot ${word}`
                + `${obj.corpsenm ? ' any of' : ''}`
                + ` the stone${plur(obj.quan)}!`,
                state,
            );
        }
        obj.corpsenm = 0; /* reset */
        set_bknown(obj, 1, { state });
        return false;
    }
    if (obj.otyp === LEASH && obj.leashmon !== 0) {
        if (word) {
            await ttyPline(
                `The leash is tied around your ${body_part(HAND, state.youmonst)}.`,
                state,
            );
        }
        return false;
    }
    if (obj.owornmask & W_SADDLE) {
        if (word) {
            await ttyPline(
                `You cannot ${word} ${something} you are sitting on.`, state,
            );
        }
        return false;
    }
    return true;
}

// C ref: do.c drop() (713-780), staticfn. Five of its arms stop rather than
// run, each named at the throw. Four of them can be reached; the weldmsg() one
// is dead in C as well and says so where it stands. What remains is the hero
// who is standing on reachable ordinary floor and lets one object go.
//
// C's altar arm is not a stop of its own. do.c:774 only suppresses the message
// there and falls through to dropx(), whose doaltarobj() is unported, so
// preflight_dropx() below refuses the square and this function reproduces the
// suppressed message either way.
async function drop(obj, state = game) {
    if (!obj)
        return ECMD_FAIL;
    if (!await canletgo(obj, 'drop', state))
        return ECMD_FAIL;
    if (obj.otyp === CORPSE
        && !u_safe_from_fatal_corpse(obj, st_all, state)) {
        // do.c:720-721 better_not_try_to_drop_that() (946-962), which asks
        // paranoid_ynq() to confirm before a bare-handed hero drops a corpse
        // that could petrify her.  u_safe_from_fatal_corpse() owns the source
        // predicate; harmless or safely handled corpses return true and follow
        // the ordinary drop path, while an unsafe corpse reaches the unported
        // prompt and still stops here.
        throw new UnsupportedDropError('better_not_try_to_drop_that()');
    }
    if (obj === state.uwep) {
        if (welded(state.uwep, state)) {
            // do.c:724 weldmsg() (wield.c:1061-1074), which names the weapon
            // with objnam.c Yobjnam2(); yname() under it is not ported.
            //
            // Unreachable, in C too: canletgo() at :715 tests the identical
            // `obj == uwep && welded(uwep)` pair one branch earlier and
            // returns FALSE, so drop() has already answered ECMD_FAIL with the
            // Norep at do.c:677. The dead test is written out because the port
            // keeps C's structure; deleting it changes nothing.
            throw new UnsupportedDropError('weldmsg()');
        }
        setuwep(null, setwornEnv(state));
    }
    if (obj === state.uquiver) {
        setuqwep(null, setwornEnv(state));
    }
    if (obj === state.uswapwep) {
        setuswapwep(null, setwornEnv(state));
    }

    if (state.u.uswallow) {
        // do.c:736-751, the engulfer's barrier: the message needs
        // do_name.c mon_nam() and mondata.c digests(), and dropz() then puts
        // the object into the engulfer's inventory through mpickobj().
        throw new UnsupportedDropError('a swallowed hero');
    } else {
        const here = state.level.at(state.u.ux, state.u.uy);
        if ((obj.oclass === RING_CLASS || obj.otyp === MEAT_RING)
            && IS_SINK(here.typ)) {
            // do.c:755 dosinkring() (do.c:534-661), which identifies the ring
            // by what the sink does and then buries, drops or uses it up.
            throw new UnsupportedDropError('dosinkring()');
        }
        if (!can_reach_floor(true, state)) {
            // do.c:758-773, the levitating or trapped hero: finesse_ahriman(),
            // hitfloor() and float_down() are all unported.
            throw new UnsupportedDropError(
                'hitfloor() from an unreachable floor',
            );
        }
        if (!IS_ALTAR(here.typ) && state.flags.verbose)
            await ttyPline(`You drop ${donameFresh(obj, state)}.`, state);
    }
    obj.how_lost = LOST_DROPPED;
    await dropx(obj, dropCommandEnv(state));
    return ECMD_TIME;
}

// drop() is staticfn in do.c and its two terrain arms -- the sink at :753-757
// and the unreachable floor at :758-773 -- refuse rather than run. Neither is
// reachable from a recorded case: no ported input walks the hero onto a sink,
// and none leaves her standing on a seen pit or shaft, because js/hack.js
// ports dotrap()'s bear-trap arm alone and nothing else writes u.utrap. It is
// exported so a test can hand it those two squares directly.
export const _dropInternals = Object.freeze({ drop });

// Complete admission check for the source-inert ground subset below: what
// dropx()'s ship_object() and doaltarobj(), and dropz()'s flooreffects(),
// container impact, zombie disturbance, ball, shop and blind-levitation arms
// would each need. drop() above reaches it with the message already printed,
// which is where C's own dropx() call sits; the wish path calls it earlier,
// while the object is still OBJ_FREE and before observe_object(), its failure
// message, or addinv() can change visible state. The returned one-shot
// admission lets that caller execute the approved tail after addinv() without
// repeating checks against state changed by the admitted transaction.
export function preflight_dropx(obj, env = {}) {
    const normalized = dropEnv(env);
    const { state } = normalized;
    const u = state.u;
    if (!obj || typeof obj !== 'object')
        throw new TypeError('preflight_dropx requires an object');
    if (obj.where !== OBJ_FREE && obj.where !== OBJ_INVENT)
        throw new UnsupportedDropError(`object ownership ${obj.where}`);
    // stackobj() preserves the newly dropped object and absorbs an older pile
    // member into it.  A light or glob on the survivor has merge effects that
    // are not ported.  A timer does not: it remains attached to the survivor,
    // exactly as a corpse timer follows an ordinary drop.  The pile walk below
    // still refuses a timed member that merged() would absorb and free.
    if (obj.lamplit || obj.globby)
        throw new UnsupportedDropError('a lit or globby object');
    // obfree()'s remaining operations are reached by an object the drop chain
    // already stops: canletgo() refuses a leash tied to a pet, the unpaid test
    // below refuses a billed object and the shop-level test refuses an unpaid
    // merge target. Only the box whose lock the hero is picking is left.
    if (state.xlock?.box === obj)
        throw new UnsupportedDropError('the box whose lock is being picked');
    if (!u || u.uswallow)
        throw new UnsupportedDropError('a swallowed hero');
    // do.c dropz():836 maps an object specially only for Blind && Levitation.
    // can_reach_floor(TRUE) below already refuses that pair; grounded blindness
    // reaches the ordinary place_object()/stackobj()/newsym() tail unchanged.
    // Hallucination still changes newsym()'s display draws and remains outside
    // this admission.
    const hallucinating = heroPropertyActive(u, HALLUC)
        && !heroPropertyActive(u, HALLUC_RES);
    if (hallucinating)
        throw new UnsupportedDropError('hallucinated display');
    if (u.uinwater || on_level(u.uz, state.air_level)
        || on_level(u.uz, state.water_level)) {
        throw new UnsupportedDropError('underwater or special-level display');
    }
    if (!can_reach_floor(true, state))
        throw new UnsupportedDropError('an unreachable floor');
    if (obj.owornmask || state.uwep === obj || state.uquiver === obj
        || state.uswapwep === obj || state.uball === obj) {
        throw new UnsupportedDropError('a worn or attached object');
    }
    if (obj.unpaid)
        throw new UnsupportedDropError('an unpaid object');

    const { ux: x, uy: y } = u;
    const location = state.level?.at(x, y);
    if (!location)
        throw new UnsupportedDropError('non-ordinary terrain');
    // A down gate is handled by dropx() before the ordinary floor tail.
    const stway = stairway_at(x, y, state);
    if (IS_ALTAR(location.typ))
        throw new UnsupportedDropError('an altar');
    // sellobj() handles billing when an object lands on a shop square. Its
    // early returns (shk.c:3938-3944) skip the billing body when the hero is
    // not in *u.ushops, the shopkeeper is absent, or the square is not a
    // costly_spot. When costly_spot() is false the call is a no-op, so the
    // drop can proceed through the ordinary place_object/stackobj/newsym tail.
    if (costly_spot(x, y, state))
        throw new UnsupportedDropError('a costly shop spot');
    // The remaining square effects are reached from dropz()'s flooreffects().
    if (t_at(x, y, state))
        throw new UnsupportedDropError('shipping or floor effects at a trap');
    if (is_lava(x, y, state) || is_pool(x, y, state))
        throw new UnsupportedDropError('liquid terrain');
    // flooreffects()'s first arm reads the object rather than the square, and
    // it sits past freeinv() in dropx(): without it here, a caller that has
    // admitted the drop prints its message and empties the inventory slot
    // before discovering the stop. A wished boulder is how that is reached.
    // The one other object-reading arm, the potion on hot ground at :399-403,
    // needs level.flags.temperature above 0, which only a Lua level
    // description sets and js/mklev.js:271 leaves at 0, so it stays where
    // flooreffects() has it.
    if (obj.otyp === BOULDER)
        throw new UnsupportedDropError('a boulder landing on the floor');
    // Doorways and stairways add no flooreffects() branch when shipping
    // leaves the object on this level.
    if (location.typ !== ROOM && location.typ !== CORR
        && location.typ !== DOOR && !stway) {
        throw new UnsupportedDropError('non-ordinary terrain');
    }
    if (engr_at(x, y, state))
        throw new UnsupportedDropError('an engraving under the drop');
    if (visible_region_at(x, y, state))
        throw new UnsupportedDropError('a visible region over the drop');
    for (let buried = state.level.buriedobjlist; buried; buried = buried.nobj) {
        // hack.c impact_disturbs_zombies() only changes a timed corpse within
        // one square. A matching timer still needs peek_timer(), so
        // conservatively refuse every nearby timed corpse; unrelated buried
        // objects make the loop inert.
        if (buried.otyp === CORPSE && buried.timed
            && buried.ox >= x - 1 && buried.ox <= x + 1
            && buried.oy >= y - 1 && buried.oy <= y + 1) {
            throw new UnsupportedDropError(
                'impact disturbing a nearby buried corpse',
            );
        }
    }
    if (!Array.isArray(state.level.objects?.[x]))
        throw new UnsupportedDropError('a missing floor-object grid');
    // invent.c stackobj() (4366-4375) hands this object to merged() (814-948)
    // as the survivor and each pile member in turn as the object absorbed, and
    // merged() reads lamplit and timed on that member at 851-854 and globby at
    // 928. The test above answers for the wrong side of the merge on its own:
    // mergable() forces lamplit to match and returns early for a glob, but
    // rejects a timer mismatch only for EGG and a revivable CORPSE. mergable()
    // decides which members merged() can reach, so it is the gate here too.
    for (let member = state.level.objects[x][y] ?? null; member;
        member = member.nexthere) {
        if (!member.lamplit && !member.timed && !member.globby) continue;
        if (mergable(obj, member, normalized)) {
            throw new UnsupportedDropError(
                'a lit, timed, or globby object in the floor pile',
            );
        }
    }

    preflight_update_inventory(normalized);
    requiredDropHook(normalized, 'newsym');
    requiredDropHook(normalized, 'encumberMessage');
    // stackobj() reaches obj_extract_self() for the pile member it absorbs,
    // and that member is on the floor. Required unconditionally rather than
    // only for a non-empty pile, so that admitting the drop does not depend on
    // what another object happens to be lying there.
    requiredDropHook(normalized, 'extractExternalObject');
    return {
        consumed: false,
        initialWhere: obj.where,
        normalized,
        object: obj,
        state,
    };
}

function consumeDropAdmission(obj, env, admission) {
    const normalized = dropEnv(env);
    if (admission.object !== obj)
        throw new Error('drop admission belongs to another object');
    if (admission.state !== normalized.state)
        throw new Error('drop admission belongs to another state');
    if (admission.consumed)
        throw new Error('drop admission was already consumed');
    if (admission.normalized.hooks !== normalized.hooks)
        throw new Error('drop admission belongs to another hook set');
    if (obj.where !== OBJ_INVENT
        || (admission.initialWhere !== OBJ_FREE
            && admission.initialWhere !== OBJ_INVENT)) {
        throw new Error('drop admission is stale');
    }
    admission.consumed = true;
    return admission.normalized;
}

// C ref: do.c dropx() (785-797). The altar arm remains owned by the admission
// boundary; shipping now precedes the ordinary drop tail as it does in C.
export async function dropx(obj, env = {}, prepared = null) {
    const admission = prepared ?? preflight_dropx(obj, env);
    const normalized = consumeDropAdmission(obj, env, admission);
    freeinv(obj, normalized);
    const { ux, uy } = normalized.state.u;
    if (await ship_object(obj, ux, uy, false, normalized)) return;
    await dropzAdmitted(obj, normalized);
}

// C ref: do.c dropy() (799-804).
export async function dropy(obj, env = {}) {
    await dropz(obj, false, env);
}

async function dropzAdmitted(obj, normalized) {
    if (obj.where !== OBJ_FREE)
        throw new Error('dropz requires a free object');
    if (await flooreffects(obj, normalized.state.u.ux, normalized.state.u.uy,
                     'drop', {
                         state: normalized.state,
                         unsupported: (reason) => {
                             throw new UnsupportedDropError(reason);
                         },
                     })) {
        return;
    }
    place_object(
        obj,
        normalized.state.u.ux,
        normalized.state.u.uy,
        normalized,
    );
    stackobj(obj, normalized);
    requiredDropHook(normalized, 'newsym')(
        normalized.state.u.ux,
        normalized.state.u.uy,
        normalized.state,
    );
    await requiredDropHook(normalized, 'encumberMessage')(normalized.state);
}

// C ref: do.c dropz() (806-842), source-inert shopless ground and with_impact
// FALSE. Its three equipment clears at 809-814 are inert here: preflight_dropx()
// refuses an object still in any of those slots, and do.c drop() has run the
// same three calls before reaching this point. So are drop_ball(), sellobj()
// and the blind-levitation map_object(), each refused by the admission above.
// stackobj() can merge, which is why the admission checks what a merge would
// ask for. ROOM, CORR, a doorway, and an up stairway therefore share the
// source calls from place_object() through newsym().
export async function dropz(obj, with_impact, env = {}) {
    const normalized = dropEnv(env);
    const { state } = normalized;
    if (with_impact)
        throw new UnsupportedDropError('container impact');
    if (obj.where !== OBJ_FREE)
        throw new Error('dropz requires a free object');
    // Recheck the post-freeinv state without requiring inventory ownership.
    preflight_dropx(obj, normalized);
    await dropzAdmitted(obj, normalized);
}

// C ref: do.c u_stuck_cannot_go() (1109-1128). Its release arm calls
// mon.c set_ustuck() and do_name.c mon_nam(); its holding arm needs
// mondata.c digests(). Neither is written out, because js/mon.js set_ustuck()
// has one caller in the port, js/teleport.js, and it passes null, so u.ustuck
// is null on every admitted path and this function always answers FALSE.
function u_stuck_cannot_go(updn, state = game) {
    if (state.u?.ustuck) {
        throw new UnsupportedLevelChangeError(
            `u_stuck_cannot_go("${updn}") with a hero who is held`,
        );
    }
    return false;
}

// C ref: do.c dodown() (1129-1294), the '>' command.
//
// Five of its arms stop rather than run, each named at the throw. What remains
// is the ordinary answer for a hero standing where there is no way down:
// "You can't go down here." with no turn spent.
export async function dodown(state = game) {
    const u = state.u;
    let trap = null;

    set_move_cmd(DIR_DOWN, 0, state);

    if (await u_rooted(state)) return ECMD_TIME;

    if (stucksteed(true, state)) return ECMD_OK;

    let stairs_down = false;
    let ladder_down = false;
    const stway = stairway_at(u.ux, u.uy, state);
    if (stway && !stway.up) {
        stairs_down = !stway.isladder;
        ladder_down = !stairs_down;
    }

    // do.c:1154-1201. The whole levitation arm, which ends controlled
    // levitation through float_down() and rnz(), and otherwise reports what
    // the hero is floating above through surface() and floating_above().
    // Nothing is ported. js/worn.js setworn() is the port's only writer of an
    // extrinsic property and no starting inventory grants LEVITATION, and
    // js/u_init_inventory_attrs.js grants only JUMPING intrinsically, so
    // neither field can be nonzero here.
    const levitation = u.uprops?.[LEVITATION];
    if (levitation?.intrinsic || levitation?.extrinsic) {
        throw new UnsupportedLevelChangeError(
            'dodown() with a levitating hero',
        );
    }

    // do.c:1204-1218, the arm that drops a hiding polymorphed hero out of the
    // ceiling. It needs mondata.c ceiling_hider(), and its piercer branch
    // reaches pooleffects(), pickup() and dotrap(). The guard is wider than
    // C's three-term test on purpose: js/u_init.js is the port's only writer
    // of u.umonnum and it sets u.umonnum === u.umonster, so Upolyd() is false
    // for every hero the port can build and the extra terms would only make
    // the stop harder to reach.
    if (Upolyd(u)) {
        throw new UnsupportedLevelChangeError(
            'dodown() with a polymorphed hero',
        );
    }

    if (u_stuck_cannot_go('down', state)) return ECMD_TIME;

    if (!stairs_down && !ladder_down) {
        trap = t_at(u.ux, u.uy, state);
        if (trap && (uteetering_at_seen_pit(trap, state)
                     || uescaped_shaft(trap, state))) {
            // do.c:1227. dotrap(trap, TOOKPLUNGE) drops the hero down a pit
            // she is teetering on or through a hole she is standing over;
            // both end in a level change or a trap effect this slice excludes.
            throw new UnsupportedLevelChangeError(
                'dodown() plunging into a pit, hole or trap door',
            );
        } else if (!trap || !is_hole(trap.ttyp)
                   || !Can_fall_thru(u.uz, state) || !trap.tseen) {
            if (state.flags?.autodig && !state.context?.nopick
                && state.uwep && is_pick(state.uwep, state)) {
                // do.c:1233. dig.c use_pick_axe2() digs down through the
                // floor, which digging owns.
                throw new UnsupportedLevelChangeError(
                    'dodown() digging down with a wielded pick-axe',
                );
            }
            await ttyPline(
                'You can\'t go down here'
                + (trap && trap.ttyp === VIBRATING_SQUARE ? ' yet' : '')
                + '.',
                state,
            );
            return ECMD_OK;
        }
    }

    // do.c:1242-1249. The Valley is the gate to Gehennom and asks for
    // confirmation through y_n(); no level this port generates is the Valley.
    if (state.valley_level && on_level(state.valley_level, u.uz)
        && !u.uevent?.gehennom_entered) {
        throw new UnsupportedLevelChangeError(
            'dodown() at the gate to Gehennom',
        );
    }

    if (!next_to_u(state)) {
        await ttyPline('You are held back by your pet!', state);
        return ECMD_OK;
    }

    if (trap) {
        // do.c:1256-1280. A hole or trap door prints "You jump through the
        // trap door." through u_locomotion(), and asks a huge hero to squeeze
        // through with y_n(), rn2(3) and losehp(). None of that is ported, and
        // do.c:1281-1287's goto_hell() and clamp_hole_destination() arms sit
        // behind the same trap.
        throw new UnsupportedLevelChangeError(
            'dodown() through a hole or trap door',
        );
    }

    // do.c:1288-1291. `trap` is null on every admitted path above, so this is
    // the arm that runs and next_level() is called with at_stairs TRUE.
    state.ga ??= {};
    state.ga.at_ladder = state.level?.at(u.ux, u.uy)?.typ === LADDER;
    await next_level(!trap, state, { gotoLevel: goto_level });
    state.ga.at_ladder = false;
    return ECMD_TIME;
}

// C ref: do.c doup() (1298-1344). The '<' command's staircase ascent.
// Precondition checks mirror dodown(). The pit arm calls climb_pit(), which
// is not ported; the witness hero is not in a pit.
export async function doup(state = game) {
    const u = state.u;
    const stway = stairway_at(u.ux, u.uy, state);

    set_move_cmd(DIR_UP, 0, state);

    if (await u_rooted(state)) return ECMD_TIME;

    // do.c:1308-1311. "up" to get out of a pit.
    if (u.utrap && u.utraptype === TT_PIT) {
        // climb_pit() is not ported. Defer.
        throw new UnsupportedLevelChangeError(
            'doup() climbing out of a pit',
        );
    }

    if (!stway || (stway && !stway.up)) {
        await ttyPline('You can\'t go up here.', state);
        return ECMD_OK;
    }
    if (stucksteed(true, state)) {
        return ECMD_OK;
    }

    if (u_stuck_cannot_go('up', state)) return ECMD_TIME;

    if (near_capacity(state) > SLT_ENCUMBER) {
        /* No levitation check; inv_weight() already allows for it */
        await ttyPline(
            `Your load is too heavy to climb the ${
                state.level?.at(u.ux, u.uy)?.typ === STAIRS
                    ? 'stairs' : 'ladder'
            }.`,
            state,
        );
        return ECMD_TIME;
    }
    if (ledger_no(u.uz, state) === 1) {
        // do.c:1331-1335. Leaving the dungeon. y_n("Beware, there will be
        // no return! Still climb?"). The debug fuzzer returns ECMD_OK; the
        // y_n answer is unported.
        throw new UnsupportedLevelChangeError(
            'doup() at ledger 1 (leaving the dungeon)',
        );
    }
    if (!next_to_u(state)) {
        await ttyPline('You are held back by your pet!', state);
        return ECMD_OK;
    }
    state.ga ??= {};
    state.ga.at_ladder = state.level?.at(u.ux, u.uy)?.typ === LADDER;
    await prev_level(true, state, { gotoLevel: goto_level });
    state.ga.at_ladder = false;
    return ECMD_TIME;
}

// C ref: do.c goto_level() (1679-1684). Both the ordinary level transition
// and the startup tutorial assign u.uz before this block. Keep the update in
// the do.c owner so dungeon.c show_overview()/print_mapseen() sees one
// source-ordered reached-depth value regardless of which caller performed the
// assignment.
export function updateDunlevReached(level, state = game) {
    if (!builds_up(level, state)) {
        if (dunlev(level) > dunlev_reached(level, state))
            set_dunlev_reached(level, dunlev(level), state);
    } else if (dunlev_reached(level, state) === 0
               || dunlev(level) < dunlev_reached(level, state)) {
        set_dunlev_reached(level, dunlev(level), state);
    }
}

// C ref: do.c goto_level()'s cant_go_back cleanup (1652-1664). Endgame and
// tutorial levels are terminal in the dungeon graph, so delete the in-memory
// level snapshots/files that C discards and mark their map-overview branches
// as unreachable. The file and overview operations stay with their C owners:
// files.c delete_levelfile() and dungeon.c remdun_mapseen(). The migration
// list has no JS owner yet; its discarded call remains an explicit source gap.
function discard_unreachable_levels(state, leavingTutorial) {
    const tutorialDnum = state.tutorial_dnum;

    // do.c:1656-1659, files.c delete_levelfile(). C counts down from the
    // maximum ledger and preserves level 0; tutorial departure deletes only
    // the tutorial dungeon's level files.
    for (let ledger = maxledgerno(state); ledger > 0; --ledger) {
        const dnum = ledger_to_dnum(ledger, state);
        if (!leavingTutorial || dnum === tutorialDnum) {
            delete_levelfile(ledger, state);
        }
    }

    // do.c:1660-1662, dungeon.c remdun_mapseen(). Keep the nodes so endgame
    // disclosure can still inspect their history; only overview reachability
    // changes.
    for (let dnum = 0; dnum < (state.dungeons?.length ?? 0); ++dnum) {
        if (!leavingTutorial || dnum === tutorialDnum)
            remdun_mapseen(dnum, state);
    }

    note_unported('dog.c discard_migrations');
}

// C ref: do.c goto_level() (1478-1998), for first-time arrival on an ordinary
// main-dungeon level through stairs or positive-decimal level teleport.
//
// Covered: the destination clamp and dungeon-change guards at 1501-1519, the
// mysterious force at 1541-1573, the quest guard at 1578-1581, the
// same-level return at 1583, the tether at 1594, the context discard at
// 1601-1622, keepdogs() at 1624, vision_recalc(2) at 1631, the level teardown
// at 1634-1664, the level-identity update at 1665-1690, mklev() at 1699, the
// hero placement and transit message at 1766-1800, including the on-foot fall
// damage and self-touch at 1780-1797, the deliveries at
// 1812-1825, the repaint at 1835-1839, the arrival messages at 1843-1965 and
// the arrival tail at 1967-1993.
//
// Remaining gaps are limited to discarded calls whose source owners are not
// yet available (impact_drop, selftouch, fix_shop_damage, and the migration
// sweeps). The selected goto_level branches themselves are source-ordered,
// including endgame/tutorial transitions, portal fallback, flight, falling,
// and the unreachable-level cleanup. Gehennom, Knox, Mines, Sokoban and the
// Rogue-level arms are implemented below.
//
// One caution about `state`: In_endgame() and In_tutorial() are js/const.js's
// renderings of the dungeon.h macros and read the module-level game. They
// ignore the state passed here, as every other caller of those two does. On
// the live path the two are the same object.
export async function goto_level(
    newlevel,
    at_stairs,
    falling,
    portal,
    state = game,
) {
    const u = state.u;
    let up = depth(newlevel, state) < depth(u.uz, state);
    const newdungeon = u.uz.dnum !== newlevel.dnum;
    // C computes this before clamping the destination or applying the
    // mysterious-force reassignment; the falling damage tail uses that value.
    const dist = depth(newlevel, state) - depth(u.uz, state);
    let leaving_tutorial = false;
    let do_fall_dmg = false;
    let new_ledger;
    // C captures this before anything runs, so it reads the level being left.
    const prev_temperature = state.level.flags.temperature;
    const was_in_W_tower = In_W_tower(u.ux, u.uy, u.uz, state);

    if (dunlev(newlevel) > dunlevs_in_dungeon(newlevel, state))
        newlevel.dlevel = dunlevs_in_dungeon(newlevel, state);
    if (newdungeon) {
        // do.c:1504-1515. Endgame entry requires the Amulet. Wizard mode may
        // bypass the Earth plane, while ordinary entry is redirected there.
        if (In_endgame(newlevel)) {
            if (!u.uhave?.amulet) return;
            if (!state.wizard && state.earth_level)
                assign_level(newlevel, state.earth_level);
        } else if (In_tutorial(newlevel)) {
            // nhlua.c tutorial() calls the optional Lua transition callback;
            // the callback result is discarded by C.
            tutorial(true, state);
        } else if (In_tutorial(u.uz)) {
            tutorial(false, state);
            up = false;
            leaving_tutorial = true;
        }
    }
    new_ledger = ledger_no(newlevel, state);
    if (new_ledger <= 0) {
        // do.c:1518-1519. done(ESCAPED) owns the terminal disclosure and
        // returns only in this JavaScript port after marking gameover.
        await done(ESCAPED, state);
        return;
    }

    // do.c:1541-1573, the "mysterious force" that drags an Amulet-carrying
    // hero back down through Gehennom. Keep the exact draw order, including
    // assign_rnd_level()'s one-based draw and the post-message cooldown draw.
    if (In_hell(u.uz, state) && up && u.uhave?.amulet && !newdungeon && !portal
        && dunlev(u.uz) < dunlevs_in_dungeon(u.uz, state) - 3) {
        state.context ??= {};
        state.context.mysteryforce ??= 0;
        if (!rn2(4 + state.context.mysteryforce)) {
            const odds = 3 + (u.ualign?.type ?? 0);
            let forceDistance = odds <= 1 ? 0 : rn2(odds);
            if (forceDistance) {
                assign_rnd_level(newlevel, u.uz, forceDistance, state);
                // assign_rnd_level() may clamp to a smaller actual descent.
                forceDistance = newlevel.dlevel - u.uz.dlevel;
                if (was_in_W_tower
                    && !On_W_tower_level(newlevel, state)) {
                    forceDistance = 0;
                }
            }
            if (forceDistance === 0) assign_level(newlevel, u.uz);
            await ttyPline(
                'A mysterious force momentarily surrounds you...', state,
            );
            state.context.mysteryforce += rn2(forceDistance + 2);
            if (on_level(newlevel, u.uz)) {
                await safe_teleds(TELEDS_NO_FLAGS, state);
                next_to_u(state);
                return;
            }
            new_ledger = ledger_no(newlevel, state);
            at_stairs = false;
            state.ga ??= {};
            state.ga.at_ladder = false;
        }
    }

    // do.c:1578-1581. Prevent the player from going past the first quest
    // level unless the leader has given the go-ahead.
    if (state.qstart_level && on_level(u.uz, state.qstart_level)
        && !newdungeon && !(await ok_to_quest(state))) {
        await ttyPline(
            'A mysterious force prevents you from descending.',
            state,
        );
        return;
    }

    if (on_level(newlevel, u.uz)) return; /* this can happen */

    // do.c:1586-1591 runs the NHCB_LVL_LEAVE Lua callback. No file under
    // nethack-c/upstream/dat/ registers one, so nhcb_counts[] is zero for
    // every level this port loads and the block is dead.

    // do.c:1593-1595, tethered movement. The call's result is discarded;
    // dig.c remains outside this source span, so record its unavailable
    // transition and continue with the level save.
    if (u.utrap && u.utraptype === TT_BURIEDBALL) {
        note_unported('dig.c buried_ball_to_punishment');
    }

    // do.c:1597-1599 calls currentlevel_rewrite(), whose two operations have
    // no port counterpart: mark_synch() is tty_mark_synch(), an fflush() of
    // stdout that changes no cell, and create_levelfile() opens the level file
    // this port does not write, because its levels stay in memory.
    //
    // The WRITING | FREEING savelev() arm sets LFILE_EXISTS on this level's
    // ledger, which is the flag goto_level() reads at 1692 to choose getlev()
    // over mklev(); the FREEING arm used for terminal dungeon transitions
    // deliberately leaves no restorable level file or snapshot.

    // The context discard, do.c:1601-1622. It drops what belongs to the level
    // being left and keeps what travels with the hero.
    maybe_reset_pick(null, state);
    reset_trapset(state);
    // do.c:1607 clears iflags.travelcc, the travel command's destination
    // cache. Preserve the object because the C fields are part of the live
    // iflags struct, and initialize the containing fields for direct callers
    // that construct a state without running the normal startup path.
    state.iflags ??= {};
    state.iflags.travelcc ??= { x: 0, y: 0 };
    state.iflags.travelcc.x = 0;
    state.iflags.travelcc.y = 0;
    if (state.context) {
        state.context.polearm ??= {};
        state.context.polearm.hitmon = null;
    }
    // do.c:1609-1610 is a comment, not code: the digging context is level
    // aware and is deliberately left intact.

    if (falling) {
        // do.c:1612-1613. impact_drop() is a discarded void call; its owner
        // is not ported, so preserve the source boundary without rejecting
        // the rest of the fall transition.
        note_unported('dokick.c impact_drop');
    }

    await check_special_room(true, state);
    // do.c:1616-1617, Punished -> ball.c unplacebc() before the departing
    // level is saved. The pointers remain on the hero while both objects are
    // free, so getlev()/mklev() can restore them at the destination.
    if (Punished(state)) unplacebc(state);
    reset_utrap(false, state);
    fill_pit(u.ux, u.uy, state);
    set_ustuck(null, state);
    await set_uinwater(false, state);
    u.uundetected = false;
    if (!state.iflags?.nofollowers) {
        keepdogs(false, {
            state,
            inWizardTower: (x, y, level, callbackState) =>
                In_W_tower(x, y, level, callbackState),
        });
    }

    // do.c:1625 refreshes the departing level's overview before savelev()
    // stores the level itself.
    recalc_mapseen(state);

    vision_recalc(2, { state });

    // do.c:1652-1664. Endgame and tutorial levels cannot be reached again;
    // savelev still performs the timer/light teardown, then the in-memory
    // snapshots and map-overview rows for discarded levels are removed.
    const cant_go_back = (newdungeon && In_endgame(newlevel))
        || leaving_tutorial;
    if (!cant_go_back) {
        update_mlstmv(state);
    } else {
        note_unported('mklev.c free_luathemes');
    }
    savelev(ledger_no(u.uz, state), state,
        { mode: cant_go_back ? 'FREEING' : 'WRITING|FREEING' });
    if (cant_go_back) discard_unreachable_levels(state, leaving_tutorial);

    // do.c:1666-1668. Graphics are selected before u.uz changes, so the
    // destination test and the departing-level test use the source values.
    const enteringRogue = on_level(newlevel, state.rogue_level);
    const leavingRogue = on_level(u.uz, state.rogue_level);
    if (enteringRogue || leavingRogue) {
        assign_graphics(
            enteringRogue ? ROGUESET : PRIMARYSET,
            state,
        );
    }
    check_gold_symbol(state);

    // do.c:1669-1673. Record a genuine forward dungeon branch before
    // assign_level() changes u.uz; level teleport does not pass any of these
    // arrival flags and therefore cannot mark a branch as seen.
    if ((at_stairs || falling || portal)
        && u.uz.dnum !== newlevel.dnum) {
        recbranch_mapseen(u.uz, newlevel, state);
    }

    // dungeon.c assign_level() copies the two fields into the destination
    // struct rather than replacing it, so anything holding a reference to
    // u.uz, u.uz0 or u.utolev keeps seeing the live value.
    assign_level(u.uz0, u.uz);
    assign_level(u.uz, newlevel);
    assign_level(u.utolev, newlevel);
    u.utotype = UTOTYPE_NONE;
    updateDunlevReached(u.uz, state);

    stairway_free_all(state);
    // do.c:1688-1690 clears the default arrival areas a special level may
    // override. js/teleport.js reads both through teleJumpOk().
    state.updest = {};
    state.dndest = {};

    let isNew = false;
    // C ref: do.c:1493. Set to true when bones from the same player are found
    // on a newly created level (do.c:1701); triggers familiar_level_msg().
    let familiar = false;
    if (!(level_info(new_ledger, state).flags & LFILE_EXISTS)) {
        if (level_info(new_ledger, state).flags & VISITED) {
            // C's impossible() clears the flag and carries on; a level marked
            // visited with no file behind it means the port lost a level.
            note_unported('pline.c impossible');
            level_info(new_ledger, state).flags &= ~VISITED;
        }
        await mklev();
        isNew = true;
        // C ref: do.c:1701. After mklev() (which may load bones), check
        // whether the bones cemetery list contains the current player's name.
        familiar = bones_include_name(state.plname, state);
    } else {
        // do.c:1704-1711, the reload: open_levelfile(), two reseed_random()
        // calls, getlev() and oinit().
        //
        // The two reseed_random() calls are no-ops in the patched C build
        // (has_strong_rngseed is false), so they produce no RNG draws.
        // getlev() restores the level from the in-memory snapshot that
        // savelev() saved. oinit() reassigns gem probabilities for the new
        // depth.
        await getlev(new_ledger, state);
        oinit(state);
    }

    // do.c:1713. Refresh remembered corridor and room glyphs after the
    // destination level is generated, before the arrival redraw begins. The
    // closing symbol assignment also keeps customized dark-room rendering in
    // sync with the room symbol.
    reglyph_darkroom(state);
    await set_uinwater(false, state);
    vision_reset(state);
    state.vision_full_recalc = 0;
    await flush_screen(-1); /* ensure all map flushes are postponed */

    // do.c:1721-1745. A portal arrival lands the hero on the destination
    // level's own magic portal, which mklev() places when the branch is laid
    // out. Endgame portals use the random-arrival arm below, as in C.
    if (portal && !In_endgame(u.uz)) {
        const ttrap = (state.level?.traps ?? []).find(
            (trap) => trap.ttyp === MAGIC_PORTAL,
        );
        if (!ttrap) {
            // C's two no-portal arms differ only in the impossible() warning;
            // both then place the hero at random.
            if (u.uevent?.qexpelled
                && (on_level(u.uz0, state.qstart_level)
                    || on_level(u.uz, state.qstart_level))) {
                await u_on_rndspot(0, state);
            } else {
                note_unported('pline.c impossible');
                await u_on_rndspot(0, state);
            }
        } else {
            seetrap(ttrap, { redraw: (x, y) => newsym(x, y, state) });
            u_on_newpos(ttrap.tx, ttrap.ty, state);
        }
    // do.c:1802-1810 places the hero at a random spot after a fall or a
    // level teleport.
    } else if (at_stairs && !In_endgame(u.uz) && up) {
        // do.c:1747-1764. Ascending at stairs: place the hero on the
        // downstair of the destination level (the stairway that connects
        // back to the level she came from).
        const stway = stairway_find_from(u.uz0, state.ga?.at_ladder, state);
        if (stway) {
            u_on_newpos(stway.sx, stway.sy, state);
            stway.u_traversed = true;
        } else if (newdungeon) {
            // u_on_sstairs(1) places the hero on a branch staircase whose
            // direction is "up" (ascending implies the branch connects
            // upward).
            await u_on_sstairs(1, state);
        } else {
            await u_on_dnstairs(state);
        }
        // do.c:1758-1764. A punished, non-levitating hero announces the
        // extra effort even when verbose mode is off.
        const greatEffort = Punished(state) && !Levitation(state);
        if (state.flags?.verbose || greatEffort) {
            await ttyPline(
                `${greatEffort ? 'With great effort, you' : 'You'} `
                    + `${u_locomotion('climb', state)} up${
                    Flying(state) && state.ga?.at_ladder
                        ? ' along' : ''} the ${
                    state.ga?.at_ladder ? 'ladder' : 'stairs'
                }.`,
                state,
            );
        }
    } else if (at_stairs && !In_endgame(u.uz)) {
        // do.c:1765-1800. Descending at stairs.
        const stway = stairway_find_from(u.uz0, state.ga?.at_ladder, state);
        if (stway) {
            u_on_newpos(stway.sx, stway.sy, state);
            stway.u_traversed = true;
        } else if (newdungeon) {
            // u_on_sstairs(0) places the hero on a branch staircase. A
            // same-dungeon descent always makes an up staircase instead.
            await u_on_sstairs(0, state);
        } else {
            await u_on_upstairs(state);
        }
        if (!u.dz) {
            /* stayed on same level? (no transit effects) */
        } else if (Flying(state)) {
            // do.c:1776. Flying descends without the falling branch; the
            // ladder wording includes the source's "along" preposition.
            if (state.flags?.verbose) {
                await ttyPline(
                    `You fly down ${state.ga?.at_ladder
                        ? 'along the ladder' : 'the stairs'}.`,
                    state,
                );
            }
        } else if (near_capacity(state) > UNENCUMBERED
                   || Punished(state) || heroPropertyActive(u, FUMBLING)) {
            // do.c:1783-1797. Punishment drags the ball and chain before the
            // ordinary fall damage or steed dismount.
            await ttyPline(
                `You fall down the ${state.ga?.at_ladder ? 'ladder' : 'stairs'}.`,
                state,
            );
            if (Punished(state)) {
                await drag_down(state);
                if (state.program_state?.gameover) return;
                if (!welded(state.uball, state))
                    await ballrelease(false, state);
            }
            if (u.usteed) {
                await dismount_steed(DISMOUNT_FELL, state);
                if (state.program_state?.gameover) return;
            } else {
                const damage = heroPropertyActive(u, HALF_PHDAM)
                    ? Math.trunc((rnd(3) + 1) / 2)
                    : rnd(3);
                await losehp(
                    damage,
                    state.ga?.at_ladder
                        ? 'falling off a ladder'
                        : 'tumbling down a flight of stairs',
                    KILLED_BY,
                    state,
                );
                if (state.program_state?.gameover) return;
            }
            // trap.c selftouch() returns no value and remains outside this
            // span; preserving the discarded-result call keeps the arrival
            // tail source-ordered without inventing petrification behavior.
            note_unported('trap.c selftouch');
        } else if (state.flags?.verbose) { /* ordinary descent */
            await ttyPline(
                state.ga?.at_ladder
                    ? 'You climb down the ladder.'
                    : 'You descend the stairs.',
                state,
            );
        }
    // do.c:1802-1810. Trap-door, hole, level-teleport, and endgame arrivals
    // all use the random-spot arm. A fall defers its shaft damage until after
    // the shop repair catch-up below.
    } else {
        await place_random_arrival(
            (up ? 1 : 0) | (was_in_W_tower ? 2 : 0),
            state,
        );
        if (falling) {
            if (Punished(state) && !welded(state.uball, state))
                note_unported('ball.c ballfall');
            note_unported('trap.c selftouch');
            do_fall_dmg = true;
        }
    }

    // do.c:1812 placebc() puts a punished hero's ball and chain down after
    // arrival and before migrating objects are delivered.
    if (Punished(state)) await placebc(state);
    obj_delivery(false, state);
    await losedogs({ state });
    kill_genocided_monsters(state);
    // "Expire all timers that have gone off while away. Must be after
    // migrating monsters and objects are delivered."
    // The arrival is never a dry run, so a rotting floor corpse draws through
    // the live newsym().
    await run_timers(state, {
        newsym,
        message: ttyPline,
        site: "goto_level()'s run_timers()",
    });

    const arrivalOccupant = m_at(u.ux, u.uy, state);
    if (arrivalOccupant) await u_collide_m(arrivalOccupant, state);

    // do.c:1829-1832. The Elemental Planes move their bubbles/clouds
    // immediately after arrival, before vision_reset() and the first map
    // redraw; Fire instead creates fumaroles from its level flag.
    if (on_level(u.uz, state.water_level)
        || on_level(u.uz, state.air_level))
        movebubbles(state);
    else if (state.level.flags.fumaroles) await fumaroles(state);

    /* Reset the screen. */
    vision_reset(state);
    // do.c:1836 reset_glyphmap(gm_levelchange) recomputes the glyph-to-symbol
    // table and its per-level Rogue flag. The port maps each glyph as it draws
    // it rather than keeping the table, and Is_rogue_level is false either
    // side of this descent, so the table it would rebuild is unchanged.
    notice_mon_off(state);
    // display.c docrt() brackets its repaint with vision_recalc(2) and
    // vision_recalc(0); js/display.js docrt() leaves both to its callers, as
    // allmain.c newgame() and moveloop() already do here. This is the pair
    // that gives the hero a map of a level she has never seen.
    vision_recalc(2, { state });
    await docrt(); /* does a full vision recalc */
    // docrt() has painted the destination's remembered glyphs and overlaid
    // monsters. Recalculate afterward so visible Air cells are redrawn from
    // their live AIR/CLOUD terrain, matching display.c docrt_flags(), which
    // calls vision_recalc(0) between those two phases.
    vision_recalc(0, { state });
    await flush_screen(-1);

    if (state.gd?.dfr_post_msg)
        await maybe_lvltport_feedback(state);
    await deliver_splev_message(state);

    // C ref: do.c:1860-1876, entering Gehennom.
    if (!In_hell(u.uz0, state) && In_hell(u.uz, state)) {
        if (state.valley_level && on_level(u.uz, state.valley_level)) {
            await ttyPline('You arrive at the Valley of the Dead...', state);
            await ttyPline(
                'The odor of burnt flesh and decay pervades the air.',
                state,
            );
            // Soundeffect(se_groans_and_moans, 25) is a no-op in the tty build.
            const hearMsg = youHear('groans and moans everywhere.', state);
            if (hearMsg) await ttyPline(hearMsg, state);
        }
        record_achievement(ACH_HELL, state);
    }
    // C ref: do.c:1874-1876. Level teleport can bypass the Valley's gate.
    if (In_hell(u.uz, state)
        && !(state.valley_level && on_level(u.uz, state.valley_level))) {
        u.uevent ??= {};
        u.uevent.gehennom_entered = 1;
    }

    // C ref: do.c:1878-1879. When bones from the same player were found,
    // display a random "deja vu" message.
    if (familiar)
        await familiar_level_msg(state);

    // C ref: do.c:1882-1932. Arrival arms keyed on the destination dungeon.
    // The if/else-if chain is mutually exclusive: exactly one arm fires. Keep
    // the branch tests ahead of the ordinary main-dungeon messages because
    // the arrival achievement is part of the level-change output order.
    if (In_endgame(u.uz)) {
        // C ref: do.c:1884-1890. A first arrival in an endgame dungeon
        // records Endgame, then Astral on a newly created Astral level. The
        // guardian-angel setup is a discarded return from a still-unported
        // source helper; retain its call boundary before the achievement.
        if (newdungeon) record_achievement(ACH_ENDG, state);
        if (isNew && on_level(u.uz, state.astral_level)) {
            note_unported('do.c final_level');
            record_achievement(ACH_ASTR, state);
        } else if (newdungeon && u.uhave?.amulet) {
            // C resurrect() returns no value and is already the canonical
            // caller for this arm.
            await resurrect(state, { makemon, redraw: newsym });
        }
    } else if (In_quest(u.uz)) {
        // C ref: do.c:1891-1892.
        await onquest(state);
    } else if (Is_knox_level(u.uz)) {
        // C ref: do.c:1893-1904. Croesus stops the alarm after his death;
        // on a fresh level the alarm always sounds. The C Soundeffect call is
        // silent in the tty recorder, while every living monster is woken.
        const croesusVital = (state.svm?.mvitals ?? state.mvitals)
            ?.[PM_CROESUS];
        if (isNew || !croesusVital?.died) {
            await ttyPline('You have penetrated a high security area!', state);
            await ttyPline('An alarm sounds!', state);
            for (let mtmp = state.level?.monlist; mtmp; mtmp = mtmp.nmon) {
                if ((mtmp.mhp ?? 0) < 1) continue;
                mtmp.msleeping = false;
            }
        }
    } else if (In_mines(u.uz)) {
        // C ref: do.c:1905-1907. Only a cross-dungeon arrival counts; moving
        // between Mines levels does not record the achievement again.
        if (newdungeon) record_achievement(ACH_MINE, state);
    } else if (In_sokoban(u.uz)) {
        // C ref: do.c:1908-1910.
        if (newdungeon) record_achievement(ACH_SOKO, state);
    } else {
        // do.c:1912-1914. The Rogue level has its own arrival line before
        // the big-room achievement check.
        if (isNew && on_level(u.uz, state.rogue_level)) {
            await ttyPline(
                'You enter what seems to be an older, more primitive world.',
                state,
            );
        } else if (isNew && state.bigroom_level
            && on_level(u.uz, state.bigroom_level)) {
            // C ref: do.c:1907. dat/dungeon.lua puts the big room between
            // depths 10 and 12.
            record_achievement(ACH_BGRM, state);
        }
        // C ref: do.c:1918-1931.  Main-dungeon quest portal message.
        if (!In_quest(u.uz0)
            && at_dgn_entrance('The Quest', state)
            && !(u.uevent?.qcompleted || u.uevent?.qexpelled
                 || state.svq?.quest_status?.leader_is_dead)) {
            u.uevent ??= {};
            if (!u.uevent.qcalled) {
                u.uevent.qcalled = 1;
                await com_pager('quest_portal', state);
            } else {
                await com_pager(
                    state.urole?.mnum === PM_ROGUE
                        ? 'quest_portal_demand'
                        : 'quest_portal_again',
                    state,
                );
            }
        }
    }

    await temperature_change_msg(prev_temperature, state);

    if (isNew) {
        // do.c:1944-1953. describe_level() supplies the branch-aware level
        // string before the source's Tourist-only experience arm. livelog is
        // also kept in the in-memory Chronicle by pline.c's canonical owner.
        const levelIsEndgame = Boolean(state.astral_level
            && u.uz?.dnum === state.astral_level.dnum);
        const isAstral = Boolean(levelIsEndgame
            && u.uz?.dlevel === state.astral_level.dlevel);
        const levelIsQuest = Boolean(state.quest_dnum !== undefined
            && u.uz?.dnum === state.quest_dnum);
        const major = (levelIsEndgame && !isAstral) || levelIsQuest;
        const dloc = describe_level(2, state);
        livelog_printf(major ? LL_ACHIEVE : LL_DEBUG, `entered ${dloc}`, state);
        if (state.urole?.mnum === PM_TOURIST) {
            // do.c:1961-1964. A Tourist alone is paid for sightseeing. Both
            // calls run after docrt() and flush_screen(-1) above, so neither
            // draws: more_experienced() only asks for a status redraw, which
            // the next flush_screen() or the command loop's own bot() serves.
            more_experienced(level_difficulty(state), 0, state);
            await newexplevel(state, { message: ttyPline });
        }
    }

    assign_level(u.uz0, u.uz); /* reset u.uz0 */
    notice_mon_on(state);
    await notice_all_mons(true, state);

    // do.c:1974 print_level_annotation() prints the hero's own #annotate note.
    await print_level_annotation(state);
    await check_special_room(false, state); /* give room entrance message */
    obj_delivery(true, state); /* deliver objects traveling with player */

    /* assume this will always return TRUE when changing level */
    await in_out_region(u.ux, u.uy, { state });

    // do.c:1984-1987 fix_shop_damage() catches a shopkeeper up on repairs;
    // it runs only when `new` is false, and this arm always generated.
    // do.c:1989-1992 charges fall damage, which needs `falling`.
    if (!isNew)
        // fix_shop_damage() has no source owner in the current shopkeeper
        // port; C discards its result after catching up the repair bill.
        note_unported('shk.c fix_shop_damage');

    // do.c:1989-1992. Shaft damage is deliberately charged after the shop
    // repair catch-up and before pickup, preserving C's RNG and message order.
    if (do_fall_dmg) {
        const damage = maybeHalfPhysical(d(Math.max(dist, 1), 6), state);
        await losehp(damage, 'falling down a mine shaft', KILLED_BY, state);
        if (state.program_state?.gameover) return;
    }

    await pickup(1, state);
}

// C ref: dokick.c obj_delivery(), which do.c goto_level() calls twice: once
// for the objects that were sent ahead and once for the ones that travel with
// the hero.
//
// gm.migrating_objs is empty on every path the port reaches. Its writers are
// dokick.c's ship_object(), the shopkeeper's stolen-goods handling and the
// object half of a level change, none of which is ported, and js/dog.js
// migrate_to_level() moves monsters rather than objects.
function obj_delivery(near_hero, state = game) {
    if (state.gm?.migrating_objs) {
        note_unported('dokick.c obj_delivery');
    }
}

// C ref: mon.c kill_genocided_monsters(), which goto_level() calls so that a
// monster of a genocided species that was migrating dies as it arrives.
//
// Nothing genocides a species in this port: svm.mvitals[].mvflags gains
// G_GENOD only in read.c do_genocide(), which no ported command reaches. The
// kill_eggs() sweep at the end of C's function selects on the same flag.
function kill_genocided_monsters(state = game) {
    for (let index = 0; index < (state.mvitals?.length ?? 0); ++index) {
        if (state.mvitals[index].mvflags & G_GENOD) {
            note_unported('mon.c kill_genocided_monsters');
            return;
        }
    }
}

// C ref: do.c u_collide_m() (1410-1445). The hero has arrived on a square a
// monster already holds -- one that came down with her, or one mklev() put on
// the up staircase -- and one of the two has to move.
async function u_collide_m(mtmp, state = game) {
    if (!mtmp || mtmp === state.u.usteed
        || mtmp !== m_at(state.u.ux, state.u.uy, state)) {
        // C's impossible() returns without moving anybody.
        throw new Error('level arrival collision: monster not co-located');
    }

    const cc = !rn2(2)
        ? enexto(state.u.ux, state.u.uy, state.youmonst?.data, { state })
        : null;
    if (cc && next2u(cc.x, cc.y, state)) {
        u_on_newpos(cc.x, cc.y, state);
    } else {
        mnexto(mtmp, RLOC_NOMSG, { state });
    }

    if (m_at(state.u.ux, state.u.uy, state)) {
        // C tries rloc() and then m_into_limbo(), which sends the monster off
        // the level to return later. The wizard-mode message is not ported.
        await m_into_limbo(m_at(state.u.ux, state.u.uy, state), state);
    }
}

// C ref: questpgr.c deliver_splev_message() and deliver_by_pline(). A special
// level's Lua des.message() calls are joined with newlines, then delivered as
// separate ordinary plines during arrival. Keeping the split here preserves
// the source's message-history and top-line handling for each line.
async function deliver_splev_message(state = game) {
    const message = state.gl?.lev_message;
    if (!message) return;
    for (const line of message.split('\n'))
        await ttyPline(line, state);
    state.gl.lev_message = null;
}

// C ref: do.c hellish_smoke_mesg() and temperature_change_msg(). The Fire
// level is the first loaded level in this port whose Lua temperature flag is
// nonzero, so keep the message boundary source-shaped as well.
async function temperature_change_msg(prev_temperature, state = game) {
    const temperature = state.level.flags.temperature;
    if (prev_temperature === temperature) return;
    if (temperature) {
        await ttyPline(
            `It is ${temperature > 0 ? 'hot' : 'cold'} here.`,
            state,
        );
        if (In_hell(state.u.uz, state)
            && temperature > 0) {
            await ttyPline(
                `You ${olfaction(state.youmonst?.data) ? 'smell' : 'sense'} smoke...`,
                state,
            );
        }
    } else if (prev_temperature > 0) {
        await ttyPline(
            `The heat ${In_hell(state.u.uz0, state) ? 'and smoke are' : 'is'} gone.`,
            state,
        );
    } else if (prev_temperature < 0) {
        await ttyPline('You are out of the cold.', state);
    }
}

// C ref: do.c legs_in_no_shape() (2408-2423). This is shared feedback for
// jumping, kicking and riding. The mounted branch names the steed; the hero
// branch masks EWounded_legs to the two side bits before selecting the body
// part, plural form and matching verb.
export async function legs_in_no_shape(
    forWhat,
    bySteed,
    state = game,
) {
    if (bySteed && state.u.usteed) {
        await ttyPline(
            `${Monnam(state.u.usteed, state)} is in no shape for ${forWhat}.`,
            state,
        );
        return;
    }

    const wounded = state.u.uprops[WOUNDED_LEGS];
    const wl = (wounded.extrinsic ?? 0) & BOTH_SIDES;
    let bp = body_part(LEG, state.youmonst);
    if (wl === BOTH_SIDES) bp = makeplural(bp);
    const side = wl === LEFT_SIDE
        ? 'left ' : wl === RIGHT_SIDE ? 'right ' : '';
    const verb = wl === BOTH_SIDES ? 'are' : 'is';
    await ttyPline(
        `Your ${side}${bp} ${verb} in no shape for ${forWhat}.`,
        state,
    );
}

// C ref: do.c set_wounded_legs() (2425-2446). youprop.h:136-138 splits the
// condition across one property: HWounded_legs, the intrinsic field, holds the
// recovery timeout, and EWounded_legs, the extrinsic field, holds worn-ring
// side bits saying which leg. Wounded_legs is their plain OR, with no blocked
// term, so `already` below is that macro.
//
// Three consequences follow the write and belong to other owners, which is why
// this function looks smaller than its effect: hack.c weight_cap() subtracts
// WT_WOUNDEDLEG_REDUCT per side bit, attrib.c exerchk() exercises Dexterity
// down while the condition lasts, and timeout.c nh_timeout() counts the
// intrinsic down and calls heal_legs() below at zero.
//
// C's comment notes that a mounted hero's steed takes the wound instead and
// that the caller adjusts its own messages; the hit-point loss is likewise the
// caller's, not this function's.
export async function set_wounded_legs(side, timex, state = game, env = {}) {
    const u = state.u;
    const wounded = u.uprops[WOUNDED_LEGS];
    const already = Boolean(wounded.intrinsic || wounded.extrinsic);

    state.disp ??= {};
    state.disp.botl = true;
    if (!already) --u.atemp[A_DEX];

    if (!already || (wounded.intrinsic & TIMEOUT) < timex) {
        // prop.h set_itimeout(): overwrite the timeout field and keep the
        // source bits above it.
        wounded.intrinsic = (wounded.intrinsic & ~TIMEOUT) | timex;
    }
    // C ref: do.c:2442-2445. Bitwise-OR rather than assignment, so a second
    // wound to the other leg does not heal the first.
    wounded.extrinsic |= side;
    // uhitm.c passes through the attack message sink when a leg wound changes
    // burden.  Keep the optional seam here so planning attacks cannot write to
    // the live terminal; older callers retain ttyPline by default.
    await encumber_msg(state, { message: env.message ?? ttyPline });
}

// C ref: do.c heal_legs() (2448-2486), the how == 0 arm. C's argument picks
// between an ordinary recovery (0), a dismount (1) and the petrification
// countdown (2), and it is read at C 2461 and 2483 to suppress the message and
// the encumbrance feedback. Only timeout.c nh_timeout()'s WOUNDED_LEGS case is
// ported and it passes 0, so both tests are resolved here in the direction 0
// takes; steed.c dismount_steed()'s heal_legs(1) stays refused at js/steed.js.
//
// The caller has already counted HWounded_legs down to zero, so youprop.h:138
// Wounded_legs is true here only through the side bits EWounded_legs holds.
// Both fields are cleared together because 5.0 heals both legs at once.
//
// C's two halves of the temporary-Dexterity ledger are guarded differently,
// and neither is unconditional. set_wounded_legs() spends a point only when no
// wound was already live (do.c:2427-2428, `if (!Wounded_legs) ATEMP(A_DEX)--`),
// so a second wound taken before the first expires costs nothing and merely
// extends the timeout. This function gives one back only while the temporary
// total is still negative (do.c:2453-2454), so a hero whose Dexterity was
// raised in between keeps the gain. Across one wound the two cancel exactly.
export async function heal_legs(state = game, { message = ttyPline } = {}) {
    const u = state.u;
    const wounded = u.uprops[WOUNDED_LEGS];
    if (!wounded.intrinsic && !wounded.extrinsic) return;

    state.disp ??= {};
    state.disp.botl = true;
    if (u.atemp[A_DEX] < 0) ++u.atemp[A_DEX];

    // C ref: do.c:2461-2469. A mounted hero's wound belongs to the steed, so
    // nothing is said about the hero's own legs.
    if (!u.usteed) {
        let legs = body_part(LEG, state.youmonst);
        if ((wounded.extrinsic & BOTH_SIDES) === BOTH_SIDES)
            legs = makeplural(legs);
        await message(`Your ${legs} ${vtense(legs, 'feel')} better.`, state);
    }

    wounded.intrinsic = 0;
    wounded.extrinsic = 0;

    // C ref: do.c:2473-2484. Wounded legs cost carrying capacity, so healing
    // them can lift an encumbrance the hero has been carrying.
    await encumber_msg(state, { message });
}
