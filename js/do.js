// do.js -- Commands that drop, dig into, or descend through the floor, and
// the up command.
// C refs: do.c -- boulder_hits_pool(), dodrop(), flooreffects(), canletgo(), drop(), dosinkring(),
// teleport_sink(), dropx(), dropy(), dropz(), trycall(), u_stuck_cannot_go(), dodown(), doup(),
// goto_level(), u_collide_m(), temperature_change_msg() and
// legs_in_no_shape(), set_wounded_legs(), heal_legs(); dokick.c obj_delivery();
// questpgr.c deliver_splev_message().

import {
    ALL_FINISHED,
    ALL_TYPES,
    ALL_TYPES_SELECTED,
    BUCX_TYPES,
    CHOOSE_ALL,
    INCLUDE_VENOM,
    INVORDER_SORT,
    JUSTPICKED,
    MENU_TRADITIONAL,
    MENU_COMBINATION,
    MENU_FULL,
    PICK_ANY,
    SELL_DELIBERATE,
    SELL_NORMAL,
    UNPAID_TYPES,
    USE_INVLET,
    ACH_ASTR,
    ACH_BGRM,
    ACH_ENDG,
    ACH_HELL,
    ACH_MINE,
    ACH_SOKO,
    A_DEX,
    ALTAR,
    AM_NONE,
    Align2amask,
    BOTH_SIDES,
    BLINDED,
    COLNO,
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
    F_LOOTED,
    FOUNTAIN,
    FUMBLING,
    GETOBJ_ALLOWCNT,
    GETOBJ_PROMPT,
    GRAVE,
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
    LOW_PM,
    MAGIC_PORTAL,
    NON_PM,
    NC_SHOW_MSG,
    NO_NC_FLAGS,
    OBJ_INVENT,
    OBJ_MINVENT,
    OBJ_CONTAINED,
    OBJ_BURIED,
    CONTAINED_TOO,
    BURIED_TOO,
    PIT,
    TIMER_OBJECT,
    REVIVE_MON,
    ROT_CORPSE,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_DELETED,
    OBJ_LUAFREE,
    CXN_SINGULAR,
    ROOM,
    RLOC_NOMSG,
    PRIMARYSET,
    ROGUESET,
    ROWNO,
    SLT_ENCUMBER,
    STOMACH,
    STAIRS,
    TIMEOUT,
    THRONE,
    T_LOOTED,
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
    W_QUIVER,
    W_SWAPWEP,
    W_WEP,
    W_ART,
    W_ARTI,
    I_SPECIAL,
    SINK,
    HALLUC,
    HALLUC_RES,
    HOLE,
    is_pit,
    u_at,
    LL_ACHIEVE,
    LL_CONDUCT,
    LL_DEBUG,
    is_hole,
    plur,
    something,
    st_all,
} from './const.js';
import {
    is_pool,
    is_lava,
    is_pool_or_lava,
} from './dbridge.js';
import { reset_trapset } from './apply.js';
import { bones_include_name } from './bones.js';
import { obj_resists } from './bury.js';
import { bury_objs, use_pick_axe2 } from './dig.js';
import { ballrelease, drag_down, placebc, unplacebc } from './ball.js';
import { next_to_u } from './apply_next_to_u.js';
import {
    paranoid_ynq, reset_occupations, set_move_cmd, set_occupation, y_n,
} from './cmd.js';
import {
    check_gold_symbol,
    describe_level,
    docrt,
    flush_screen,
    map_background,
    map_object,
    newsym,
    reglyph_darkroom,
} from './display.js';
import {
    Adjmonnam, Amonnam, Monnam, docall, hcolor, hliquid, mon_nam, rndmonnam,
    y_monnam, obj_pmname,
} from './do_name.js';
import { setwornEnv } from './do_wear.js';
import { keepdogs, losedogs, update_mlstmv } from './dog.js';
import { can_reach_floor, engr_at } from './engrave.js';
import { make_grave } from './grave.js';
import { fruitname, makeplural } from './fruit.js';
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
import { dist2, s_suffix, upstart } from './hacklib.js';
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
    add_to_buried,
    delobj,
    freeinv,
    getobj,
    ggetobj,
    mergable,
    obfree,
    preflight_update_inventory,
    stackobj,
    useup,
    useupf,
} from './invent.js';
import { maybe_reset_pick } from './lock.js';
import { mklev } from './mklev.js';
import { makemon } from './makemon_create.js';
import { fumaroles, movebubbles } from './mkmaze.js';
import {
    healmon, kill_genocided_monsters, m_in_air, m_into_limbo, mnexto, mondied, newcham, pm_to_cham, set_ustuck,
    wake_nearto,
} from './mon.js';
import { m_at } from './monst.js';
import { gulp_blnd_check } from './mhitu.js';
import {
    dmgtype, is_whirly, olfaction, passes_walls, sticks, touch_petrifies,
    throws_rocks, is_reviver, is_rider, is_displacer, locomotion,
} from './mondata.js';
import { youHear } from './monmove.js';
import {
    AD_DGST,
    AT_ENGL,
    PM_DEATH,
    PM_FAMINE,
    PM_PESTILENCE,
    PM_CROESUS,
    PM_GREEN_SLIME,
    PM_NURSE,
    PM_ROGUE,
    PM_TOURIST,
    PM_WRAITH,
    AD_POLY,
    S_ZOMBIE,
} from './monsters.js';
import {
    is_pick, isCandle, obj_meld, obj_nexto_xy, objectType, place_object,
    pudding_merge_message, remove_object, set_bknown, splitobj, weight,
} from './obj.js';
import { oinit } from './o_init.js';
import {
    The, Tobjnam, Doname2, an, corpse_xname, donameFresh, is_plural, otense,
    yobjnam,
    the, vtense,
    xname, xnameFresh, yname,
} from './objnam.js';
import {
    COIN_CLASS,
    BOULDER,
    CORPSE,
    ENORMOUS_MEATBALL,
    GLOB_OF_GREEN_SLIME,
    LEASH,
    LOADSTONE,
    MEATBALL,
    MEAT_RING,
    MEAT_STICK,
    POT_OIL,
    POTION_CLASS,
    RIN_ADORNMENT,
    RIN_AGGRAVATE_MONSTER,
    RIN_COLD_RESISTANCE,
    RIN_CONFLICT,
    RIN_FREE_ACTION,
    RIN_GAIN_CONSTITUTION,
    RIN_GAIN_STRENGTH,
    RIN_HUNGER,
    RIN_INCREASE_ACCURACY,
    RIN_INCREASE_DAMAGE,
    RIN_INVISIBILITY,
    RIN_LEVITATION,
    RIN_POLYMORPH,
    RIN_POLYMORPH_CONTROL,
    RIN_POISON_RESISTANCE,
    RIN_PROTECTION,
    RIN_PROTECTION_FROM_SHAPE_CHAN,
    RIN_REGENERATION,
    RIN_SEARCHING,
    RIN_SEE_INVISIBLE,
    RIN_SHOCK_RESISTANCE,
    RIN_SLOW_DIGESTION,
    RIN_STEALTH,
    RIN_SUSTAIN_ABILITY,
    RIN_TELEPORTATION,
    RIN_TELEPORT_CONTROL,
    RING_CLASS,
    RIN_WARNING,
    RIN_FIRE_RESISTANCE,
} from './objects.js';
import { body_part, mbodypart } from './polyself.js';
import { incr_itimeout, make_blinded, set_itimeout } from './potion.js';
import {
    add_valid_menu_class, allow_all, allow_category, count_justpicked,
    find_justpicked, query_category, query_objlist,
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
import { cloneIsaacContext, createCoreRandom, d, rn1, rn2, rnd, rnz } from './rng.js';
import { check_special_room, move_update } from './rooms.js';
import { savelev } from './save.js';
import { costly_spot, sellobj_state } from './shk.js';
import { container_impact_dmg, ship_object } from './dokick.js';
import { set_levltyp } from './terrain.js';
import {
    stairway_at,
    stairway_find_from,
    stairway_free_all,
    u_on_dnstairs,
    u_on_upstairs,
    u_on_sstairs,
} from './stairs.js';
import { Punished, dismount_steed, stucksteed } from './steed.js';
import { enexto, rloc, safe_teleds } from './teleport.js';
import { burn_away_slime, obj_has_timer, preflight_end_burn, rider_revival_time, run_timers, start_timer } from './timeout.js';
import {
    climb_pit,
    fill_pit,
    maketrap,
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
import { block_point, cansee, recalc_block_point, vision_recalc, vision_reset } from './vision.js';
import { setuwep, welded, weldmsg } from './wield.js';
import { bimanual, bypass_objlist, nxt_unbypassed_obj, setnotworn, setuqwep, setuswapwep } from './worn.js';
import { resurrect } from './wizard.js';
import {
    assign_graphics, S_altar, S_fountain, S_grave, S_room, S_sink, S_throne,
} from './symbols.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { done } from './end.js';
import { tutorial } from './nhlua.js';
import { canseemon, canspotmon } from './display.js';

// A fail-closed boundary for goto_level() branches outside the ordinary
// staircase descent and positive-decimal level teleport ports.
export class UnsupportedLevelChangeError extends Error {
    constructor(reason) {
        super(`unsupported level change: ${reason}`);
        this.name = 'UnsupportedLevelChangeError';
        this.reason = reason;
    }
}

// C ref: do.c revive_corpse() (2111-2250). revive() deletes the corpse on
// success, so its location, carrier, container, and name are saved first.
export async function revive_corpse(corpse, state = game, rawEnv = {}) {
    const wornHooks = setwornEnv(state).hooks;
    const env = {
        ...rawEnv, state,
        hooks: {
            // zap.c:revive -> invent.c:useup/obfree removes a wielded corpse
            // through the existing worn.c owner before deallocating it.
            setNotWorn: (obj, hookEnv) => setnotworn(obj, {
                ...hookEnv,
                hooks: { ...wornHooks, ...hookEnv.hooks },
            }),
            ...rawEnv.hooks,
        },
    };
    const message = env.message ?? ttyPline;
    const where = corpse.where;
    const species = state.mons[corpse.corpsenm];
    const isZombie = species.mlet === S_ZOMBIE
        || (where === OBJ_BURIED && is_reviver(species));
    const wielded = corpse === state.uwep;
    const chewed = Boolean(corpse.oeaten);
    const cname = corpse_xname(
        corpse, chewed ? 'bite-covered' : null, CXN_SINGULAR, state,
    );
    let carrier = where === OBJ_MINVENT ? corpse.ocarry : null;
    const coordinate = get_obj_location(
        corpse, CONTAINED_TOO | BURIED_TOO, state,
    );
    let container = null;
    let containerWhere = 0;
    const { get_container_location, revive } = await import('./zap.js');
    if (where === OBJ_CONTAINED) {
        container = corpse.ocontainer;
        const location = get_container_location(container);
        containerWhere = location.loc;
        if (containerWhere === OBJ_MINVENT && location.carrier)
            carrier = location.carrier;
    }
    const monster = await revive(corpse, false, env);
    if (!monster) return false;

    switch (where) {
    case OBJ_INVENT:
        await message(wielded
            ? `The ${cname} writhes out of your grasp!`
            : 'You feel squirming in your backpack!', state, env);
        break;
    case OBJ_FLOOR:
        if (cansee(coordinate.x, coordinate.y, state)
            || canseemon(monster, state)) {
            let effect = '';
            if (monster.data === state.mons[PM_DEATH])
                effect = ' in a whirl of spectral skulls';
            else if (monster.data === state.mons[PM_PESTILENCE])
                effect = ' in a churning pillar of flies';
            else if (monster.data === state.mons[PM_FAMINE])
                effect = ' in a ring of withered crops';
            const name = canseemon(monster, state)
                ? (chewed ? Adjmonnam(monster, 'bite-covered', state)
                    : Monnam(monster, state))
                : The(cname, state);
            await message(`${name} ${canseemon(monster, state)
                ? 'rises from the dead' : 'disappears'}${effect}!`, state, env);
        }
        break;
    case OBJ_MINVENT:
        if (cansee(monster.mx, monster.my, state)) {
            if (carrier && canseemon(carrier, state)) {
                await message(`Startled, ${mon_nam(carrier, state)} drops ${
                    an(cname, state)} as it ${canspotmon(monster, state)
                    ? 'revives' : 'disappears'}!`, state, env);
            } else if (canspotmon(monster, state)) {
                await message(`${chewed
                    ? Adjmonnam(monster, 'bite-covered', state)
                    : Monnam(monster, state)} suddenly appears!`, state, env);
            }
        }
        break;
    case OBJ_CONTAINED: {
        const name = canspotmon(monster, state)
            ? Amonnam(monster, state) : 'Something';
        if (!container) {
            note_unported('pline.c impossible');
        } else if (carrier && canseemon(carrier, state)) {
            await message(`${name} writhes out of ${yname(container, state)}!`,
                state, env);
        } else if (containerWhere === OBJ_INVENT) {
            await message(`${name} ${locomotion(monster.data, 'writhes')}`
                + ` out of ${an(xname(container, state), state)} in your pack!`,
            state, env);
        } else if (containerWhere === OBJ_FLOOR
            && cansee(coordinate.x, coordinate.y, state)) {
            await message(`${name} escapes from ${
                an(xname(container, state), state)}!`, state, env);
        }
        break;
    }
    case OBJ_BURIED:
        if (isZombie) {
            await maketrap(monster.mx, monster.my, PIT, env);
            if (cansee(monster.mx, monster.my, state)) {
                const trap = t_at(monster.mx, monster.my, state);
                if (trap) trap.tseen = true;
                await message(`${canspotmon(monster, state)
                    ? Amonnam(monster, state) : 'Something'}`
                    + ' claws itself out of the ground!', state, env);
                (env.newsym ?? newsym)(monster.mx, monster.my, state);
            } else if (dist2(monster.mx, monster.my,
                state.u.ux, state.u.uy) < 25) {
                // Soundeffect() is a no-op in the recorder's nosound backend.
                const line = youHear('scratching noises.', state);
                if (line) await message(line, state, env);
            }
            fill_pit(monster.mx, monster.my, state);
            break;
        }
        // C falls through for an unexpectedly revived buried non-zombie.
        // falls through
    default:
        note_unported('pline.c impossible');
        break;
    }
    return true;
}

// C ref: do.c revive_mon() (2255-2292). TIMER_OBJECT callbacks receive the
// object itself (C's arg->a_obj), after run_timers() decrements obj.timed.
export async function revive_mon(body, _timeout, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    const random = env.random ?? { d, rn1, rn2, rnd, rnz };
    const message = env.message ?? ttyPline;
    const species = state.mons[body.corpsenm];
    if (is_displacer(species) && body.where === OBJ_FLOOR) {
        const coordinate = get_obj_location(body, 0, state);
        const obstacle = coordinate && m_at(coordinate.x, coordinate.y, state);
        if (obstacle && (state.level.flags.stasis_until ?? 0) < state.moves) {
            const noticed = canseemon(obstacle, state);
            const oldName = Monnam(obstacle, state);
            if (await rloc(obstacle, RLOC_NOMSG, env)) {
                if (noticed && !canseemon(obstacle, state))
                    await message(`${oldName} vanishes.`, state, env);
                else if (!noticed && canseemon(obstacle, state))
                    await message(`${Monnam(obstacle, state)} appears.`, state, env);
                else if (noticed && dist2(obstacle.mx, obstacle.my,
                    coordinate.x, coordinate.y) > 2)
                    await message(`${oldName} teleports.`, state, env);
            }
        }
    }
    if (!await revive_corpse(body, state, env)) {
        let when;
        let action;
        if (is_rider(species) && random.rn2(99)) {
            action = REVIVE_MON;
            when = rider_revival_time(body, true, env);
        } else {
            if (!obj_has_timer(body, ROT_CORPSE, state))
                await message(`You feel ${is_rider(species) ? 'much ' : ''}`
                    + 'less hassled.', state, env);
            action = ROT_CORPSE;
            when = Math.max(1, random.d(5, 50) - (state.moves - body.age));
        }
        if (!obj_has_timer(body, action, state))
            start_timer(when, TIMER_OBJECT, action, body, state);
    }
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
        if (!await gulp_blnd_check(state)) {
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
    const suppliedRandom = rawEnv.random ?? {};
    const random = {
        d: suppliedRandom.d ?? d,
        rn2: suppliedRandom.rn2 ?? rn2,
        rnd: suppliedRandom.rnd ?? rnd,
    };
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
            const mask = ((location.flags ?? 0) & ~DB_UNDER) | DB_FLOOR;
            location.flags = mask;
        } else {
            location.typ = ROOM;
            location.flags = 0;
            recalc_block_point(rx, ry, state);
        }
        const monster = m_at(rx, ry, state);
        if (monster && monster.mhp >= 1 && !m_in_air(monster, state)) {
            // C's mondied() result is discarded here.
            await mondied(monster, state, rawEnv);
        }
        if (trap) {
            const { delfloortrap } = await import('./trap.js');
            await delfloortrap(trap, state);
        }
        await bury_objs(rx, ry, state, rawEnv);
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
            await burn_away_slime(state, rawEnv);
            const damage = random.d(fireResistant ? 1 : 3, 6);
            await losehp(
                maybeHalfPhysical(damage, state),
                'molten lava',
                KILLED_BY,
                state,
            );
        } else if (!fillsUp && state.flags?.verbose !== false
            && (pushing ? !heroIsBlind(state) : cansee(rx, ry, state))) {
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
                    await reset_utrap(true, state);
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
                await delfloortrap(currentTrap, state);
            }
            await useupf(obj, 1, { ...rawEnv, state });
            await bury_objs(x, y, state, rawEnv);
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
            let globbyobj = obj;
            while (globbyobj) {
                const other = obj_nexto_xy(globbyobj, x, y, true, state);
                if (!other) break;
                await pudding_merge_message(globbyobj, other, state, rawEnv);
                // C discards obj_meld's survivor and tests its original
                // incoming pointer, which obj_absorb nulls when consumed.
                // The JS lifecycle marks deletion, including Lua retention.
                obj_meld(globbyobj, other, state, rawEnv);
                if (globbyobj.where === OBJ_DELETED
                    || globbyobj.where === OBJ_LUAFREE) globbyobj = null;
            }
            return !globbyobj;
        } else if (state.context?.mon_moving && IS_ALTAR(state.level?.at(x, y)?.typ)
            && cansee(x, y, state)) {
            await doaltarobj(obj, state);
        } else if (obj.oclass === POTION_CLASS
            && Math.trunc(state.level?.flags?.temperature ?? 0) > 0
            && (state.level?.at(x, y)?.typ === ROOM
                || state.level?.at(x, y)?.typ === CORR)) {
            if (cansee(x, y, state)) {
                await (rawEnv.message ?? ttyPline)(
                    `${Tobjnam(obj, 'heat', state)} up as `
                        + `${is_plural(obj, state) ? 'they hit' : 'it hits'} the hot ground.`,
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
                        `${is_plural(obj, state) ? 'They shatter' : 'It shatters'} from the heat!`,
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

// C ref: do.c teleport_sink() (459-493). It tries up to 200 room squares in
// source order, moving the current sink only after finding a square without a
// trap or engraving that is unseen or more than three squares away.
function teleport_sink(state = game, random = { rn2, rnd }) {
    let trycnt = 0;

    do {
        const cx = 1 + random.rnd(COLNO - 3);
        const cy = 1 + random.rn2(ROWNO - 2);
        if (state.level.at(cx, cy).typ === ROOM
            && !t_at(cx, cy, state)
            && !engr_at(cx, cy, state)
            && (!cansee(cx, cy, state)
                || dist2(cx, cy, state.u.ux, state.u.uy) > 3 * 3)) {
            const oldSink = state.level.at(state.u.ux, state.u.uy);
            const alreadylooted = oldSink.looted;

            set_levltyp(state.u.ux, state.u.uy, ROOM, { state });
            oldSink.looted = 0;
            newsym(state.u.ux, state.u.uy);

            set_levltyp(cx, cy, SINK, { state });
            state.level.at(cx, cy).looted = alreadylooted ? 1 : 0;
            newsym(cx, cy);
            return true;
        }
    } while (++trycnt < 200);

    return false;
}

function heroHallucinating(state) {
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(hallucination?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: do.c polymorph_sink() (404-456). Keep the saved sink loot bit
// separate from the cleared feature flags: fountain and throne preserve it,
// while the altar mask replaces those flags and the grave branch consumes
// make_grave()'s random-text continuation before its message and redraw.
export async function polymorph_sink(state = game, rawEnv = {}) {
    const random = rawEnv.random ?? { rn2 };
    const message = rawEnv.message ?? ttyPline;
    const { ux: x, uy: y } = state.u;
    const location = state.level.at(x, y);
    if (location.typ !== SINK) return;

    const sinklooted = location.flags !== 0;
    location.flags = 0;
    let symbol = S_sink;

    switch (random.rn2(4)) {
    case 0:
        symbol = S_fountain;
        set_levltyp(x, y, FOUNTAIN, { ...rawEnv, state });
        location.horizontal = 0; // rm.blessedftn
        if (sinklooted) location.flags |= F_LOOTED;
        break;
    case 1:
        symbol = S_throne;
        set_levltyp(x, y, THRONE, { ...rawEnv, state });
        if (sinklooted) location.flags = T_LOOTED;
        break;
    case 2: {
        symbol = S_altar;
        set_levltyp(x, y, ALTAR, { ...rawEnv, state });
        const alignment = random.rn2(3) - 1;
        // C altarmask aliases flags; keep the one JavaScript field there.
        location.flags = In_hell(state.u.uz, state) && random.rn2(3)
            ? AM_NONE : Align2amask(alignment);
        break;
    }
    case 3:
        symbol = S_room;
        set_levltyp(x, y, ROOM, { ...rawEnv, state });
        make_grave(x, y, null, { ...rawEnv, random, state });
        if (location.typ === GRAVE) symbol = S_grave;
        break;
    }

    if (location.typ !== ROOM) {
        await message(
            `The sink transforms into ${an(CMAP_EXPLANATIONS[symbol])}!`,
            state,
        );
    } else {
        await message('The sink vanishes.', state);
    }
    newsym(x, y);
}

// C ref: do.c dosinkring() (497-661). The object remains marked in_use through
// its sink effects so inventory removal cannot identify it early. Calls to
// Soundeffect() are intentionally omitted: the patched recorder uses the
// `nosound` backend, where the C macro is a no-op.
async function dosinkring(obj, state = game, rawEnv = {}) {
    const random = rawEnv.random ?? { rn2, rnd };
    let ideed = true;
    let nosink = false;

    await ttyPline(`You drop ${donameFresh(obj, state)} down the drain.`, state);
    obj.in_use = true;
    switch (obj.otyp) {
    case RIN_SEARCHING:
        await ttyPline(
            `You thought ${yname(obj, state)} got lost in the sink, but there it is!`,
            state,
        );
        await sinkRingGiveback(obj, state);
        return;
    case RIN_SLOW_DIGESTION:
        await ttyPline('The ring is regurgitated!', state);
        await sinkRingGiveback(obj, state);
        return;
    case RIN_LEVITATION:
        await ttyPline('The sink quivers upward for a moment.', state);
        break;
    case RIN_POISON_RESISTANCE:
        await ttyPline(
            `You smell rotten ${makeplural(fruitname(false, state))}.`,
            state,
        );
        break;
    case RIN_AGGRAVATE_MONSTER: {
        const insects = heroHallucinating(state)
            ? makeplural(rndmonnam({ state })) : 'flies';
        await ttyPline(
            `Several ${insects} buzz angrily around the sink.`, state,
        );
        break;
    }
    case RIN_SHOCK_RESISTANCE:
        await ttyPline('Static electricity surrounds the sink.', state);
        break;
    case RIN_CONFLICT:
        if (!heroIsDeaf(state))
            await ttyPline('You hear loud noises coming from the drain.', state);
        break;
    case RIN_SUSTAIN_ABILITY:
        await ttyPline(`The ${hliquid('water', { state })} flow seems fixed.`, state);
        break;
    case RIN_GAIN_STRENGTH: {
        const adjective = obj.spe < 0 ? 'weak' : 'strong';
        await ttyPline(
            `The ${hliquid('water', { state })} flow seems ${adjective}er now.`,
            state,
        );
        break;
    }
    case RIN_GAIN_CONSTITUTION: {
        const adjective = obj.spe < 0 ? 'less' : 'great';
        await ttyPline(
            `The ${hliquid('water', { state })} flow seems ${adjective}er now.`,
            state,
        );
        break;
    }
    case RIN_INCREASE_ACCURACY:
        await ttyPline(
            `The ${hliquid('water', { state })} flow ${obj.spe < 0 ? 'misses' : 'hits'} the drain.`,
            state,
        );
        break;
    case RIN_INCREASE_DAMAGE:
        await ttyPline(
            `The water's force seems ${obj.spe < 0 ? 'smaller' : 'greater'} now.`,
            state,
        );
        break;
    case RIN_HUNGER: {
        ideed = false;
        let otmp = state.level.objects[state.u.ux][state.u.uy];
        while (otmp) {
            const otmp2 = otmp.nexthere;
            if (otmp !== state.uball && otmp !== state.uchain
                && !obj_resists(otmp, 1, 99, { state, random })) {
                if (!heroIsBlind(state)) {
                    await ttyPline(
                        `Suddenly, ${donameFresh(otmp, state)} ${otense(otmp, 'vanish', state)} from the sink!`,
                        state,
                    );
                    ideed = true;
                }
                delobj(otmp, { ...rawEnv, state });
            }
            otmp = otmp2;
        }
        break;
    }
    case MEAT_RING:
        await ttyPline('Several flies buzz around the sink.', state);
        break;
    case RIN_TELEPORTATION:
        nosink = teleport_sink(state, random);
        await ttyPline(
            `The sink ${nosink ? '' : 'momentarily '}vanishes.`, state,
        );
        ideed = false;
        break;
    case RIN_POLYMORPH:
        await polymorph_sink(state, rawEnv);
        nosink = true;
        ideed = state.level.at(state.u.ux, state.u.uy).typ !== ROOM;
        break;
    default:
        ideed = false;
        break;
    }

    if (!heroIsBlind(state) && !ideed) {
        ideed = true;
        switch (obj.otyp) {
        case RIN_ADORNMENT:
            await ttyPline('The faucets flash brightly for a moment.', state);
            break;
        case RIN_REGENERATION:
            await ttyPline('The sink looks as good as new.', state);
            break;
        case RIN_INVISIBILITY:
            await ttyPline("You don't see anything happen to the sink.", state);
            break;
        case RIN_FREE_ACTION:
            await ttyPline('You see the ring slide right down the drain!', state);
            break;
        case RIN_SEE_INVISIBLE: {
            const sinkContents = heroHallucinating(state)
                ? 'oxygen molecules' : 'air';
            await ttyPline(`You see some ${sinkContents} in the sink.`, state);
            break;
        }
        case RIN_STEALTH:
            await ttyPline(
                'The sink seems to blend into the floor for a moment.', state,
            );
            break;
        case RIN_FIRE_RESISTANCE:
            await ttyPline(
                `The hot ${hliquid('water', { state })} faucet flashes brightly for a moment.`,
                state,
            );
            break;
        case RIN_COLD_RESISTANCE:
            await ttyPline(
                `The cold ${hliquid('water', { state })} faucet flashes brightly for a moment.`,
                state,
            );
            break;
        case RIN_PROTECTION_FROM_SHAPE_CHAN:
            await ttyPline('The sink looks nothing like a fountain.', state);
            break;
        case RIN_PROTECTION:
            await ttyPline(
                `The sink glows ${hcolor(obj.spe < 0 ? 'black' : 'silver', state)} for a moment.`,
                state,
            );
            break;
        case RIN_WARNING:
            await ttyPline(
                `The sink glows ${hcolor('white', state)} for a moment.`, state,
            );
            break;
        case RIN_TELEPORT_CONTROL:
            await ttyPline(
                'The sink looks like it is being beamed aboard somewhere.',
                state,
            );
            break;
        case RIN_POLYMORPH_CONTROL:
            await ttyPline(
                'The sink momentarily looks like a regularly erupting geyser.',
                state,
            );
            break;
        default:
            break;
        }
    }

    if (ideed) {
        await trycall(obj, state);
    } else if (!nosink && !heroIsDeaf(state)) {
        await ttyPline('You hear the ring bouncing down the drainpipe.', state);
    }

    // C evaluates rn2(20) before checking nosink, so even a successful sink
    // teleport still spends this draw before its condition fails.
    const backsUp = random.rn2(20) === 0;
    if (backsUp && !nosink) {
        await ttyPline(
            `The sink backs up, leaving ${donameFresh(obj, state)}.`, state,
        );
        obj.in_use = false;
        await dropx(obj, dropCommandEnv(state));
    } else if (random.rn2(5) === 0) {
        await freeinv(obj, { state });
        obj.in_use = false;
        obj.ox = state.u.ux;
        obj.oy = state.u.uy;
        add_to_buried(obj, { state });
    } else {
        await useup(obj, { state });
    }
}

async function sinkRingGiveback(obj, state) {
    obj.in_use = false;
    await dropx(obj, dropCommandEnv(state));
    await trycall(obj, state);
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
export function dropCommandEnv(state, env = {}) {
    const dropState = env.state ?? state;
    return {
        ...env,
        state: dropState,
        hooks: {
            ...setwornEnv(dropState).hooks,
            encumberMessage: encumber_msg,
            extractExternalObject: remove_object,
            newsym,
            ...env.hooks,
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

// C ref: do.c drop() (713-780), staticfn. The sink and unreachable-floor
// arms preserve their source order; unsupported conditions remain at their
// own C branches.
//
// C's altar arm suppresses the ordinary drop message, then delegates to
// dropx(), which calls doaltarobj() before placing the object.
async function drop(obj, state = game) {
    if (!obj)
        return ECMD_FAIL;
    if (!await canletgo(obj, 'drop', state))
        return ECMD_FAIL;
    if (obj.otyp === CORPSE && await better_not_try_to_drop_that(obj, state))
        return ECMD_FAIL;
    if (obj === state.uwep) {
        if (welded(state.uwep, state)) {
            // do.c:724 weldmsg() (wield.c:1061-1074), which names the weapon
            // with objnam.c Yobjnam2().
            //
            // Unreachable, in C too: canletgo() at :715 tests the identical
            // `obj == uwep && welded(uwep)` pair one branch earlier and
            // returns FALSE, so drop() has already answered ECMD_FAIL with the
            // Norep at do.c:677. The dead test is written out because the port
            // keeps C's structure; deleting it changes nothing.
            await weldmsg(obj, state);
            return ECMD_FAIL;
        }
        await setuwep(null, setwornEnv(state));
    }
    if (obj === state.uquiver) {
        setuqwep(null, setwornEnv(state));
    }
    if (obj === state.uswapwep) {
        setuswapwep(null, setwornEnv(state));
    }

    if (state.u.uswallow) {
        // do.c:736-751. A swallowed drop goes through the same hitfloor()
        // landing helper below, where dropz() either feeds the engulfer or
        // transfers the object to its inventory.
        if (state.flags?.verbose) {
            const holder = state.u.ustuck;
            let holderName = mon_nam(holder, state);
            if (holder.data?.mattk?.some((attack) =>
                attack.aatyp === AT_ENGL && attack.adtyp === AD_DGST)) {
                holderName = `${s_suffix(holderName)} `
                    + `${mbodypart(holder, STOMACH)}`;
            }
            const objectName = obj.unpaid
                ? yobjnam(obj, null, state) : donameFresh(obj, state);
            await ttyPline(`You drop ${objectName} into ${holderName}.`, state);
        }
    } else {
        const here = state.level.at(state.u.ux, state.u.uy);
        if ((obj.oclass === RING_CLASS || obj.otyp === MEAT_RING)
            && IS_SINK(here.typ)) {
            // do.c:755 dosinkring() (497-661), including the ring's sink
            // response and its ordered backup, burial, or consumption.
            await dosinkring(obj, state, dropCommandEnv(state));
            return ECMD_TIME;
        }
        if (!can_reach_floor(true, state)) {
            // do.c:758-773, the levitating or trapped hero: finesse_ahriman(),
            // hitfloor() and float_down() retain C's order around freeinv().
            const { finesse_ahriman } = await import('./artifacts.js');
            const levhack = finesse_ahriman(obj, state);
            if (levhack) {
                const levitation = state.u.uprops[LEVITATION];
                levitation.extrinsic = W_ART;
            }
            if (state.flags.verbose)
                await ttyPline(`You drop ${donameFresh(obj, state)}.`, state);
            await freeinv(obj, { state });
            const { hitfloor } = await import('./dothrow.js');
            await hitfloor(obj, true, state);
            if (levhack) {
                const { float_down } = await import('./trap.js');
                await float_down(
                    I_SPECIAL | TIMEOUT,
                    W_ARTI | W_ART,
                    state,
                );
            }
            return ECMD_TIME;
        }
        if (!IS_ALTAR(here.typ) && state.flags.verbose)
            await ttyPline(`You drop ${donameFresh(obj, state)}.`, state);
    }
    obj.how_lost = LOST_DROPPED;
    await dropx(obj, dropCommandEnv(state));
    return ECMD_TIME;
}

// C ref: do.c doddrop() (924-943), the D/#droptype dispatcher.
export async function doddrop(state = game) {
    if (!state.invent) {
        await ttyPline('You have nothing to drop.', state);
        return ECMD_OK;
    }
    add_valid_menu_class(0, state);
    if (state.u.ushops) sellobj_state(SELL_DELIBERATE, state);
    let result = ECMD_OK;
    if (state.flags.menu_style !== MENU_TRADITIONAL
        || (result = await ggetobj('drop', drop, 0, false, null, state)) < -1) {
        result = await menu_drop(result, state);
    }
    if (state.u.ushops) sellobj_state(SELL_NORMAL, state);
    if (result) reset_occupations(state);
    return result;
}

// C ref: do.c better_not_try_to_drop_that() (947-960). The safety predicate
// checks gloves and resistance before a dangerous corpse gets its prompt.
export async function better_not_try_to_drop_that(obj, state = game) {
    if (obj.otyp === CORPSE && !u_safe_from_fatal_corpse(obj, st_all, state)) {
        const prompt = `Drop the ${obj_pmname(obj, state)} corpse without ${body_part(HAND, state.youmonst)} protection on?`;
        return await paranoid_ynq(true, prompt, false, state) !== 'y'.charCodeAt(0);
    }
    return false;
}

// C ref: do.c menudrop_split() (964-977). C leaves cursed loadstones whole
// and stores the requested count in corpsenm for canletgo's refusal message.
export async function menudrop_split(obj, count, state = game) {
    if (count && count < obj.quan) {
        if (welded(obj, state)) {
            // The welded stack must remain intact.
        } else if (obj.otyp === LOADSTONE && obj.cursed) {
            obj.corpsenm = count;
        } else {
            obj = splitobj(obj, count, { state });
        }
    }
    return drop(obj, state);
}

// C ref: do.c menu_drop() (981-1107). All traversals read the current
// inventory head after each drop; object effects can destroy other entries.
export async function menu_drop(retry, state = game) {
    let dropped = 0;
    let allCategories = true;
    let dropEverything = false;
    let autopick = false;
    let justpicked = false;
    let count = 0;
    if (retry) {
        allCategories = retry === ALL_TYPES_SELECTED;
    } else if (state.flags.menu_style === MENU_FULL) {
        allCategories = false;
        const result = await query_category('Drop what type of items?', state.invent,
            UNPAID_TYPES | ALL_TYPES | CHOOSE_ALL | BUCX_TYPES | JUSTPICKED | INCLUDE_VENOM,
            state, PICK_ANY);
        if (!result.n) return ECMD_OK;
        for (const choice of result.pick_list) {
            if (choice.value === ALL_TYPES_SELECTED) allCategories = true;
            else if (choice.value === 'A') dropEverything = autopick = true;
            else if (choice.value === 'P') {
                count = Math.max(0, choice.count);
                justpicked = true;
                dropEverything = false;
                add_valid_menu_class(choice.value, state);
            } else {
                add_valid_menu_class(choice.value, state);
                dropEverything = false;
            }
        }
    } else if (state.flags.menu_style === MENU_COMBINATION) {
        allCategories = false;
        const flags = { value: 0 };
        const result = await ggetobj('drop', drop, 0, true, flags, state);
        if (result === -2) allCategories = true;
        if (flags.value & ALL_FINISHED) return result ? ECMD_TIME : ECMD_OK;
    }
    if (autopick) {
        bypass_objlist(state.invent, false, state);
        let obj;
        while ((obj = nxt_unbypassed_obj(state.invent, state))) {
            if (dropEverything || allCategories || allow_category(obj, state))
                dropped += ((await drop(obj, state)) & ECMD_TIME) ? 1 : 0;
        }
        bypass_objlist(state.invent, false, state);
    } else if (justpicked && count_justpicked(state.invent) === 1) {
        const obj = find_justpicked(state.invent);
        if (obj) dropped += ((await menudrop_split(obj, count, state)) & ECMD_TIME) ? 1 : 0;
    } else {
        const result = await query_objlist(state.invent,
            USE_INVLET | INVORDER_SORT | INCLUDE_VENOM,
            allCategories ? allow_all : allow_category, state,
            'What would you like to drop?', PICK_ANY);
        if (result.n > 0) {
            bypass_objlist(state.invent, true, state);
            for (const choice of result.pick_list) {
                const obj = choice.obj;
                let current = state.invent;
                while (current && current !== obj) current = current.nobj;
                if (!current || !current.bypass) continue;
                dropped += ((await menudrop_split(obj, choice.count, state)) & ECMD_TIME) ? 1 : 0;
            }
            bypass_objlist(state.invent, false, state);
        }
    }
    return dropped ? ECMD_TIME : ECMD_OK;
}

// The object exposes its selected arms for source-pinned tests without
// changing dispatch.
export const _dropInternals = Object.freeze({
    drop,
    dosinkring,
    engulfer_digests_food,
    engulfer_polyfood,
    heroHallucinating,
    teleport_sink,
});

// Guard the still-partial dropx/dropz tail before its unported floor effects.
// C callers reach this only at their source call site; in particular,
// invent.c:hold_another_object has already observed and added the object, and
// printed its drop message, before it calls dropx().
export function preflight_dropx(obj, env = {}) {
    const normalized = dropEnv(env);
    const { state } = normalized;
    const u = state.u;
    if (!obj || typeof obj !== 'object')
        throw new TypeError('preflight_dropx requires an object');
    if (obj.where !== OBJ_FREE && obj.where !== OBJ_INVENT)
        throw new UnsupportedDropError(`object ownership ${obj.where}`);
    // stackobj() preserves the newly dropped object and absorbs an older pile
    // member into it. The survivor keeps its light and timers across an
    // ordinary drop; light.c finds their new location through that same object.
    // Compatible lit candles use merged()'s canonical light/timer owners.
    // Globs coalesce in flooreffects before ordinary stacking; other timed
    // members retain their generic merge lifecycle boundary below.
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
    // and Hallucination both reach the ordinary place_object()/stackobj()/
    // newsym() tail. display.c owns Hallucination's glyph draws there.
    if (u.uinwater || on_level(u.uz, state.air_level)
        || on_level(u.uz, state.water_level)) {
        throw new UnsupportedDropError('underwater or special-level display');
    }
    if (!can_reach_floor(true, state))
        throw new UnsupportedDropError('an unreachable floor');
    // dig.c:341 drops uwep directly; do.c:810 clears it in dropz after
    // extraction, shipping and altar handling. Admit only that primary mask.
    const primaryWeapon = state.uwep === obj && obj.owornmask === W_WEP;
    const secondaryWeapon = state.uswapwep === obj
        && Boolean(obj.owornmask & W_SWAPWEP);
    // worn.c:91-94 allows W_SWAPWEP and W_QUIVER on one object; do.c:814-818
    // clears both equipment pointers when that object is dropped.
    const allowedWornMask = primaryWeapon ? W_WEP
        : secondaryWeapon ? W_SWAPWEP | W_QUIVER : 0;
    if ((obj.owornmask & ~allowedWornMask) || (state.uwep === obj && !primaryWeapon)
        || (state.uquiver === obj && !secondaryWeapon)
        || (state.uswapwep === obj && !secondaryWeapon)
        || state.uball === obj) {
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
    // do.c:flooreffects leaves a boulder intact on dry terrain without a
    // pit or hole. The trap and liquid guards above bound this floor path.
    // Doorways and stairways add no flooreffects() branch when shipping
    // leaves the object on this level.
    if (location.typ !== ROOM && location.typ !== CORR
        && location.typ !== DOOR && location.typ !== SINK
        && !IS_ALTAR(location.typ) && !stway) {
        throw new UnsupportedDropError('non-ordinary terrain');
    }
    // do.c:dropx/dropz/flooreffects adds no effect for an engraving on dry
    // floor. Keep its text intact and let the ordinary placement/redraw run.
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
    // 928. mergable() forces lamplit to match and returns early for a glob, but
    // rejects a timer mismatch only for EGG and a revivable CORPSE. mergable()
    // decides which members merged() can reach, so it is the gate here too.
    for (let member = state.level.objects[x][y] ?? null; member;
        member = member.nexthere) {
        if (!member.lamplit && !member.timed && !member.globby) continue;
        if (!mergable(obj, member, normalized)) continue;
        // A compatible floor glob consumes the incoming free glob in
        // flooreffects; invent.c:stackobj never reaches that timed member.
        if (obj.globby && member.globby) continue;
        if (isCandle(member) && member.lamplit && !member.globby) {
            // merged() extracts this older candle and end_burn() stops its
            // burn before obj_stop_timers is considered. Validate that owner
            // while the drop is still atomic; generic timed/glob paths below
            // retain their separate lifecycle boundary.
            preflight_end_burn(member, true, normalized);
            continue;
        }
        throw new UnsupportedDropError(
            'a lit, timed, or globby object in the floor pile',
        );
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

// C ref: do.c doaltarobj() (363-386). It is called after a failed ship attempt
// and before dropy(), so the altar message and BUC knowledge precede placement.
export async function doaltarobj(obj, state = game) {
    if (heroIsBlind(state)) return;

    if (obj.oclass !== COIN_CLASS) {
        if (!state.context?.mon_moving) {
            const priorGnostic = Math.trunc(state.u.uconduct?.gnostic ?? 0);
            state.u.uconduct ??= {};
            state.u.uconduct.gnostic = priorGnostic + 1;
            if (!priorGnostic) {
                livelog_printf(
                    LL_CONDUCT,
                    `eschewed atheism, by dropping ${donameFresh(obj, state)} on an altar`,
                    state,
                );
            }
        }
    } else {
        obj.blessed = 0;
        obj.cursed = 0;
    }

    if (obj.blessed || obj.cursed) {
        const color = hcolor(obj.blessed ? 'amber' : 'black', state);
        const name = donameFresh(obj, state);
        const verb = otense(obj, 'hit', state);
        await ttyPline(
            `There is ${an(color)} flash as ${name} ${verb} the altar.`,
            state,
        );
        if (!heroHallucinating(state)) obj.bknown = 1;
    } else {
        const name = Doname2(obj, state);
        const verb = otense(obj, 'land', state);
        await ttyPline(`${name} ${verb} on the altar.`, state);
        if (obj.oclass !== COIN_CLASS) obj.bknown = 1;
    }
}

// C ref: do.c dropx() (785-797). Shipping precedes the altar effect, which
// precedes the ordinary dropy() tail, as in the source.
export async function dropx(obj, env = {}, prepared = null) {
    const normalizedInput = dropEnv(env);
    if (normalizedInput.state.u?.uswallow) {
        await freeinv(obj, normalizedInput);
        await dropz(obj, false, normalizedInput);
        return;
    }
    const admission = prepared ?? preflight_dropx(obj, normalizedInput);
    const normalized = consumeDropAdmission(obj, normalizedInput, admission);
    await freeinv(obj, normalized);
    const { ux, uy } = normalized.state.u;
    if (await ship_object(obj, ux, uy, false, normalized)) return;
    if (!normalized.state.u.uswallow
        && IS_ALTAR(normalized.state.level.at(ux, uy).typ)) {
        await doaltarobj(obj, normalized.state);
    }
    // C dropx() reaches dropz() after shipping and altar handling. Clear the
    // same equipment slots here because this admitted JS tail enters the
    // floor-effects helper directly instead of calling dropz().
    await clearDropSlots(obj, normalized);
    await dropzAdmitted(obj, normalized);
}

async function clearDropSlots(obj, env) {
    const { state } = env;
    if (obj === state.uwep) await setuwep(null, env);
    if (obj === state.uquiver) setuqwep(null, env);
    if (obj === state.uswapwep) setuswapwep(null, env);
}

// C ref: do.c dropy() (799-804).
export async function dropy(obj, env = {}) {
    await dropz(obj, false, env);
}

async function dropzAdmitted(obj, normalized, withImpact = false) {
    if (obj.where !== OBJ_FREE)
        throw new Error('dropz requires a free object');
    if (await flooreffects(
        obj,
        normalized.state.u.ux,
        normalized.state.u.uy,
        'drop',
        {
            ...normalized,
            unsupported: (reason) => {
                throw new UnsupportedDropError(reason);
            },
        },
    )) {
        return;
    }
    place_object(
        obj,
        normalized.state.u.ux,
        normalized.state.u.uy,
        {
            ...normalized,
            hooks: {
                // mkobj.c:place_object blocks vision for the landed boulder.
                // Supply the source operation for every dropz caller.
                blockPoint: (x, y, env) => block_point(x, y, env.state),
                ...normalized.hooks,
            },
        },
    );
    if (withImpact) {
        // C do.c:dropz() calls container_impact_dmg() after placement and
        // before corpse disturbance, ball handling, shop sale, and stacking.
        await container_impact_dmg(obj, normalized.state.u.ux,
            normalized.state.u.uy, { state: normalized.state });

        // hack.c:impact_disturbs_zombies() is already implemented with the
        // dothrow landing helpers. C calls it after container impact and
        // before ball/shop handling and stackobj().
        const { impact_disturbs_zombies } = await import('./dothrow.js');
        impact_disturbs_zombies(obj, true, normalized.state);
        if (obj === normalized.state.uball) {
            // ball.c:drop_ball() owns punishment-chain relocation and trap
            // release; its result is void and this caller skips only that gap.
            note_unported('ball.c drop_ball');
        } else if (normalized.state.level?.flags?.has_shop) {
            // shk.c:sellobj() is void; shop billing is deliberately not
            // approximated here.
            note_unported('shk.c sellobj');
        }
    }
    stackobj(obj, normalized);
    if (withImpact && heroIsBlind(normalized.state)
        && Levitation(normalized.state)) {
        map_object(obj, 0, normalized.state);
    }
    requiredDropHook(normalized, 'newsym')(
        normalized.state.u.ux,
        normalized.state.u.uy,
        normalized.state,
    );
    await requiredDropHook(normalized, 'encumberMessage')(normalized.state);
}

// C ref: do.c dropz() (806-842). Ordinary drops retain the admitted source
// tail; hitfloor() uses with_impact and preserves its impact call order.
export async function dropz(obj, with_impact, env = {}) {
    const normalized = dropEnv(env);
    const { state } = normalized;
    if (obj.where !== OBJ_FREE)
        throw new Error('dropz requires a free object');
    await clearDropSlots(obj, normalized);
    if (state.u?.uswallow) {
        if (obj !== state.uball) {
            if (obj.unpaid) {
                const { stolen_value } = await import('./shk.js');
                await stolen_value(
                    obj, state.u.ux, state.u.uy, true, false, state,
                );
            }
            if (!await engulfer_digests_food(obj, state)) {
                const { mpickobj } = await import('./steal.js');
                mpickobj(state.u.ustuck, obj, { state });
            }
        }
        await encumber_msg(state);
        return;
    }
    if (with_impact) {
        // hitfloor() reaches dropz() after its caller detached the object. It
        // is not the inventory drop preflight: levitation, a visible pit edge
        // and other unreachable-floor states are exactly why hitfloor runs.
        const defaults = dropCommandEnv(state);
        const impactEnv = dropEnv({
            ...normalized,
            hooks: { ...defaults.hooks, ...normalized.hooks },
        });
        await dropzAdmitted(obj, impactEnv, true);
        return;
    }
    // Recheck the post-freeinv state without requiring inventory ownership.
    preflight_dropx(obj, normalized);
    await dropzAdmitted(obj, normalized);
}

// C ref: do.c engulfer_digests_food() (849-881). polyfood() is the obj.h
// predicate over corpse species: a shape changer or AD_POLY corpse can cause
// its swallowing monster to polymorph when digested.
function engulfer_polyfood(obj, state) {
    if (obj.otyp !== CORPSE || obj.corpsenm < LOW_PM)
        return false;
    const species = state.mons?.[obj.corpsenm];
    return pm_to_cham(obj.corpsenm, state) !== NON_PM
        || dmgtype(species, AD_POLY);
}

async function engulfer_digests_food(obj, state = game) {
    const swallower = state.u?.ustuck;
    const digests = swallower?.data?.mattk?.some((attack) =>
        attack.aatyp === AT_ENGL && attack.adtyp === AD_DGST);
    if (!digests
        || !(obj.otyp === CORPSE || obj.globby
            || obj.otyp === MEATBALL || obj.otyp === ENORMOUS_MEATBALL
            || obj.otyp === MEAT_RING || obj.otyp === MEAT_STICK)) {
        return false;
    }

    let couldPetrify = false;
    let couldPoly = false;
    let couldSlime = false;
    let couldGrow = false;
    let couldHeal = false;
    if (obj.otyp === CORPSE) {
        const species = state.mons?.[obj.corpsenm];
        couldPetrify = touch_petrifies(species);
        couldPoly = engulfer_polyfood(obj, state);
        couldGrow = obj.corpsenm === PM_WRAITH;
        couldHeal = obj.corpsenm === PM_NURSE;
    } else if (obj.otyp === GLOB_OF_GREEN_SLIME) {
        couldSlime = true;
    }

    await ttyPline(`${Tobjnam(obj, 'are', state)} instantly digested!`, state);
    if (couldPoly || couldSlime) {
        await newcham(
            swallower,
            couldSlime ? state.mons[PM_GREEN_SLIME] : null,
            { state, ncflags: couldSlime ? NC_SHOW_MSG : NO_NC_FLAGS },
        );
    } else if (couldPetrify) {
        note_unported('trap.c minstapetrify');
    } else if (couldGrow) {
        // C discards grow_up()'s pointer here, but the HP, level and form
        // changes still finish before the swallowed object is deleted.
        await grow_up(swallower, null, { state });
    } else if (couldHeal) {
        healmon(swallower, swallower.mhpmax, 0);
        // C's source call is mcureblindness(mon, FALSE); it is void and the
        // monster blindness helper is not yet ported.
        note_unported('mon.c mcureblindness');
    }
    delobj(obj, { state });
    return true;
}

// C ref: do.c u_stuck_cannot_go() (1109-1128). digests() is the
// mondata.h macro: one engulfing attack must carry AD_DGST.
async function u_stuck_cannot_go(updn, state = game) {
    const holder = state.u.ustuck;
    if (holder) {
        if (state.u.uswallow || !sticks(state.youmonst.data)) {
            const digestsHolder = holder.data?.mattk?.some((attack) =>
                attack.aatyp === AT_ENGL && attack.adtyp === AD_DGST);
            const condition = !state.u.uswallow
                ? 'being held'
                : digestsHolder ? 'swallowed' : 'engulfed';
            await ttyPline(
                `You are ${condition}, and cannot go ${updn}.`, state,
            );
            return true;
        }

        set_ustuck(null, state);
        await ttyPline(`You release ${mon_nam(holder, state)}.`, state);
    }
    return false;
}

// C ref: do.c dodown() (1129-1294), the '>' command.
//
// Five of its arms stop rather than run, each named at the throw. What remains
// is the ordinary answer for a hero standing where there is no way down:
// "You can't go down here." with no turn spent.
export async function dodown(state = game, env = {}) {
    const u = state.u;
    let trap = null;

    set_move_cmd(DIR_DOWN, 0, state);

    if (await u_rooted(state)) return ECMD_TIME;

    if (await stucksteed(true, state)) return ECMD_OK;

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

    if (await u_stuck_cannot_go('down', state)) return ECMD_TIME;

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
                // do.c:1233 returns dig.c use_pick_axe2()'s command result.
                return use_pick_axe2(state.uwep, state, env);
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
export async function doup(state = game) {
    const u = state.u;
    const stway = stairway_at(u.ux, u.uy, state);

    set_move_cmd(DIR_UP, 0, state);

    if (await u_rooted(state)) return ECMD_TIME;

    // do.c:1308-1311. "up" to get out of a pit.
    if (u.utrap && u.utraptype === TT_PIT) {
        await climb_pit(state);
        return ECMD_TIME;
    }

    if (!stway || (stway && !stway.up)) {
        await ttyPline('You can\'t go up here.', state);
        return ECMD_OK;
    }
    if (await stucksteed(true, state)) {
        return ECMD_OK;
    }

    if (await u_stuck_cannot_go('up', state)) return ECMD_TIME;

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
        // do.c:1331-1335. The debug fuzzer declines without prompting.
        if (state.iflags?.debug_fuzzer) return ECMD_OK;
        const answer = await y_n(
            'Beware, there will be no return!  Still climb?', state,
        );
        if (answer !== 'y'.charCodeAt(0)) return ECMD_OK;
    }
    if (!next_to_u(state)) {
        await ttyPline('You are held back by your pet!', state);
        return ECMD_OK;
    }
    state.ga ??= {};
    state.ga.at_ladder = state.level?.at(u.ux, u.uy)?.typ === LADDER;
    await prev_level(true, state, { gotoLevel: goto_level, done });
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
    // override. js/teleport.js reads both through tele_jump_ok().
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
    await kill_genocided_monsters(state);
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
        await movebubbles(state);
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
        await mnexto(mtmp, RLOC_NOMSG, { state });
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

// C ref: do.c heal_legs() (2448-2486). `how` is C's healing mode:
// 0 ordinary recovery, 1 dismounting, 2 limbs turning to stone.
// Both HWounded_legs and EWounded_legs clear together in every mode.
//
// C's two halves of the temporary-Dexterity ledger are guarded differently,
// and neither is unconditional. set_wounded_legs() spends a point only when no
// wound was already live (do.c:2427-2428, `if (!Wounded_legs) ATEMP(A_DEX)--`),
// so a second wound taken before the first expires costs nothing and merely
// extends the timeout. This function gives one back only while the temporary
// total is still negative (do.c:2453-2454), so a hero whose Dexterity was
// raised in between keeps the gain. Across one wound the two cancel exactly.
export async function heal_legs(state = game, { how = 0, message = ttyPline } = {}) {
    const u = state.u;
    const wounded = u.uprops[WOUNDED_LEGS];
    if (!wounded.intrinsic && !wounded.extrinsic) return;

    state.disp ??= {};
    state.disp.botl = true;
    if (u.atemp[A_DEX] < 0) ++u.atemp[A_DEX];

    // C ref: do.c:2461-2469. A mounted hero's wound belongs to the steed, so
    // nothing is said about the hero's own legs.
    if (!u.usteed && how !== 2) {
        let legs = body_part(LEG, state.youmonst);
        if ((wounded.extrinsic & BOTH_SIDES) === BOTH_SIDES)
            legs = makeplural(legs);
        await message(`Your ${legs} ${vtense(legs, 'feel')} better.`, state);
    }

    wounded.intrinsic = 0;
    wounded.extrinsic = 0;

    // C ref: do.c:2473-2484. Wounded legs cost carrying capacity, so healing
    // them can lift an encumbrance the hero has been carrying.
    if (how === 0) await encumber_msg(state, { message });
}
