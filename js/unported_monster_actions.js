// The fail-closed boundary for monster actions. This file holds no port; the
// ports of monmove.c and dogmove.c live in js/monmove.js and js/dogmove.js.
//
// runSimpleMonsterAction() executes one monster action for the movemon()
// adapter in js/allmain.js.
//
// Delete this file once ported coverage makes the boundary unnecessary.

import {
    BURN,
    CORR,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    D_TRAPPED,
    FIRE_RES,
    HEADSTONE,
    IRONBARS,
    IS_DOOR,
    IS_OBSTRUCTED,
    IS_ROOM,
    IS_STWALL,
    IS_TREE,
    SLEEP_RES,
    SDOOR,
    SCORR,
    SLP_GAS_TRAP,
    FIRE_TRAP,
    ANTI_MAGIC,
} from './const.js';
import {
    is_pool,
    is_ice,
    is_lava,
} from './dbridge.js';
import { exercise, poisoned } from './attrib.js';
// js/allmain.js imports this file's action runners, so this edge closes an
// import cycle. `stop_occupation` is a hoisted function declaration, which an
// ES module cycle initializes before either module body runs; nothing here
// reads it at module scope.
import { stop_occupation } from './allmain.js';
import { done } from './end.js';
import { bot, map_invisible, newsym, obj_to_glyph, tmp_at } from './display.js';
import { mdig_tunnel } from './dig.js';
import { flooreffects } from './do.js';
import { should_mulch_missile } from './dothrow.js';
import {
    best_target,
    dog_eat,
    dog_move,
    finish_meating,
    pet_ranged_attk,
} from './dogmove.js';
import { migrate_to_level } from './dog.js';
import { capitalizedMonsterName, mon_nam } from './do_name.js';
import { on_level } from './dungeon.js';
import { PM_ANGEL } from './monsters.js';
import { engr_at, wipe_engr_at } from './engrave.js';
import { game } from './gstate.js';
import {
    losehp,
    may_dig,
    may_passwall,
    nh_delay_output,
    nomul,
} from './hack.js';
import { obj_extract_self, stackobj } from './invent.js';
import { mattackm, mdisplacem } from './mhitm.js';
import {
    mattacku,
    mdamageu,
    mswings_verb,
} from './mhitu.js';
import { buzzmu, castmu } from './mcastu.js';
import { m_throw, thitu, thrwmu } from './mthrowu.js';
import { quest_stat_check, quest_talk } from './quest.js';
import { whimper } from './sounds.js';
import {
    m_in_air,
    wake_msg,
} from './mon.js';
import {
    defended,
    amorphous,
    is_giant,
    is_swimmer,
    likes_lava,
    monsndx,
    Resists_Elem,
    nohands,
    passes_walls,
    perceives,
    resists_magm,
    verysmall,
} from './mondata.js';
import {
    AD_CLRC,
    AD_FIRE,
    AD_MAGM,
    AD_SLEE,
    AD_SPEL,
    AT_MAGC,
    PM_FLOATING_EYE,
    S_EEL,
} from './monsters.js';
import {
    INERT_DOOR_MASKS,
    can_fog,
    dochug,
    dochugw,
    m_avoid_kicked_loc,
    m_avoid_soko_push_loc,
    m_digweapon_check,
    m_move,
    monflee,
    monfleeMessage,
    onscary,
    set_apparxy,
} from './monmove.js';
import { m_at } from './monst.js';
import {
    find_defensive,
    find_misc,
    mon_reflects,
    use_defensive,
    use_misc,
    use_offensive,
} from './muse.js';
import {
    clear_dknown,
    place_object,
    remove_object,
} from './obj.js';
import { observe_object } from './o_init.js';
import { encumber_msg } from './pickup.js';
import { potionhit } from './potion.js';
import {
    create_gas_cloud,
    inside_region,
    m_in_out_region,
    mon_in_region,
} from './region.js';
import { coreRandom } from './rng.js';


import { ttyPline } from './tty_message.js';
import { passive_obj } from './uhitm.js';
import {
    block_point,
    cansee,
    couldsee,
    recalc_block_point,
    unblock_point,
} from './vision.js';
import {
    dmgval,
    mon_wield_item,
    setmnotwielded,
} from './weapon.js';
import { canseemon, canspotmon } from './display.js';
import { Invis } from './youprop.js';

export class UnsupportedSimpleMonsterActionError extends Error {
    constructor(reason) {
        super(`simple monster action requires ${reason}`);
        this.name = 'UnsupportedSimpleMonsterActionError';
        this.reason = reason;
    }
}

function unsupported(reason) {
    throw new UnsupportedSimpleMonsterActionError(reason);
}

function assertSimpleActionState(monster) {
    if (!monster.mcanmove) return;
    // STRAT_ARRIVE needs no guard: dog.c mon_arrive() is the only writer, and
    // monmove.c dochug() answers it at 704-708 by calling m_arrival(), which
    // clears the bit and returns -1 so that dochug() carries straight on.
    // js/monmove.js dochug() carries that clear.
    //
    // STRAT_CLOSE needs no guard either: it always implies STRAT_WAITMASK, so
    // dochug() returns 0 from its early arm after at most a quest_talk(), and
    // js/quest.js refuses every conversation branch it does not carry.
    if (monster.mfrozen)
        unsupported('inconsistent frozen monster state');
    // trap.c mintrap() owns every held-trap escape, including pits,
    // metallivore effects, and clearing a stale mtrapped bit on no trap.
    if (monster.mtame && !monster.isminion) {
        // C monmove.c:m_move() sends every tame non-minion with an edog
        // extension through dogmove.c:dog_move(); that path is not limited to
        // the three species selected as a new game starting pet.
        if (!monster.mextra?.edog)
            unsupported('a tame pet without dog state');
        // C dochug() calls disturb() before m_move() reaches dog_move().
        return;
    }

    // C m_move() sends the tame Astral guardian through dog_move(), whose
    // null-edog path follows the hero without ordinary pet hunger/fetching.
    // Its Conflict loss branch remains owned by dog_move() as well.
    const guardian = monster.mtame
        && monster.isminion
        && monster.data?.pmidx === PM_ANGEL;
    if (monster.mtame && !guardian)
        unsupported('tame minion movement');
    // isgd is admitted: m_move() dispatches to gd_move() which handles the
    // peaceful escort path and throws on unported branches.
    // isshk and ispriest are admitted: m_move() dispatches to shk_move()
    // and pri_move() respectively, which handle the stationary and milling
    // paths and refuse the rest.
    //
    // mon.c m_respond() is now wired through dochug(); its remaining
    // unported callees record their own gaps without stopping the turn.
    // Awake and sleeping leprechauns now reach canonical dochug(), including
    // its gold movement term, leppie_avoidance(), and AD_SGLD dispatch.
    // C dochug() owns sleeping-bee wakeup through disturb(), then checks
    // the bee's square for royal jelly before ordinary movement and attacks.
}

function actionRandom(rawEnv) {
    return rawEnv.random ?? coreRandom;
}

function ordinaryMonsterCanSeeHero(monster, state) {
    return (!Invis(state.u) || perceives(monster.data))
        && !state.u.uinwater
        && couldsee(monster.mx, monster.my, state);
}

// C ref: trap.c m_harmless_trap() (1133-1175). Only these three traps ask
// for resistance; the surrounding trap cases are decided by
// monmove.js m_harmless_trap() without a callback.
function resistsTrapEffect(monster, trapType, env) {
    const state = env.state ?? game;
    if (trapType === SLP_GAS_TRAP) {
        return Resists_Elem(monster, SLEEP_RES, state)
            || defended(monster, AD_SLEE, state);
    }
    if (trapType === FIRE_TRAP) {
        return Resists_Elem(monster, FIRE_RES, state)
            || defended(monster, AD_FIRE, state);
    }
    if (trapType === ANTI_MAGIC) {
        return resists_magm(monster, state)
            || defended(monster, AD_MAGM, state);
    }
    return false;
}

// C ref: monmove.c postmov()'s `here->doormask == D_CLOSED && can_open` arm
// (1576-1592), plus the block's own entry test at 1520-1522. mfndpos() admits
// a trapped closed door when OPENDOOR is set; postmov() checks the trap before
// its whole-mask D_CLOSED arm, so retain the D_TRAPPED bit here and let that
// source-owned boundary run. can_open repeats mon.c mon_allowflags():2067; a
// wall-walker or a monster whose m_move() can_tunnel is still set skips the
// block instead, and digsDestination() admits the door mdig_tunnel() breaks.
// can_tunnel is m_move()'s own copy: a hostile dwarf close to the hero has
// lost it at monmove.c:1910-1914 and opens the door with its hands.
function opensClosedDoor(monster, location, doorMask, canTunnel) {
    const species = monster.data;
    return location?.typ === DOOR
        && (doorMask & D_CLOSED)
        && !(doorMask & D_LOCKED)
        && !(nohands(species) || verysmall(species))
        && !passes_walls(species)
        && !canTunnel;
}

// C ref: mon.c mfndpos()'s ALLOW_DIG arm (2196-2215) hands a tunneling monster
// an obstructed square, and monmove.c postmov()'s `can_tunnel && may_dig()`
// arm (1643-1645) then digs it with dig.c mdig_tunnel(). m_move() passes its
// own can_tunnel here, which mon_allowflags() computed identically, so this
// admits exactly the squares postmov() will dig.
//
// Admit ordinary doors as well as walls and trees: postmov() skips opening
// a door when can_tunnel is true, then mdig_tunnel() breaks it.
// mdig_tunnel first converts a secret door, then uses that same door arm.
// Its secret-corridor arm also changes terrain and rebuilds vision.
function digsDestination(location, x, y, env) {
    if (!env.canTunnel || !location) return false;
    if (location.typ !== DOOR && location.typ !== SDOOR && location.typ !== SCORR
        && !IS_STWALL(location.typ) && !IS_TREE(location.typ, env.state))
        return false;
    return may_dig(x, y, env.state);
}

function transitionCallbackUnset(callback) {
    return callback == null || callback === -1;
}

async function admitSimpleDestinationAndRegion(monster, x, y, env) {
    const { state } = env;
    const location = state.level.at(x, y);
    const doorMask = location?.flags ?? 0;
    // Every IS_ROOM type is ordinary terrain for a monster that is not
    // covetous: mon.c mfndpos() admits typ >= ROOM directly, so this includes
    // all furniture plus ICE, DRAWBRIDGE_DOWN, AIR and CLOUD. No terrain arm
    // in monmove.c postmov() changes those destinations.
    // monmove.c:274 onscary()'s vampire-fears-altar arm is ported in
    // js/monmove.js; monmove.c:1233 holds_up_web() is ported in
    // js/monmove.js and reached from maybe_spin_web(); and
    // mon.c:973 minliquid_core()'s `infountain` feeds the gremlin split at
    // :987, which unportedMinliquidReason() refuses on the square the monster
    // ends up standing on rather than here, because C decides it there and
    // makemon() can put a gremlin on a fountain with no move at all.
    //
    // No ordinary movement path changes a monster's level; every
    // migrate_to_level() caller is item use (muse.c), digging (dig.c),
    // teleportation (teleport.c), a shopkeeper (shk.c), or a wizard command.
    // dogmove.c reads stairs only through dog_goal()'s On_stairs(u.ux, u.uy),
    // which asks where the hero stands, not where the pet steps, and names no
    // other furniture at all.
    // A doorway a monster can stand in without acting on it, or a closed one
    // it opens. INERT_DOOR_MASKS names the first set; js/monmove.js owns it
    // beside the block that skips them.
    const inertDoorway = location?.typ === DOOR
        && INERT_DOOR_MASKS.has(doorMask);
    const opensDoor = opensClosedDoor(
        monster, location, doorMask, env.canTunnel,
    );
    // C mon.c mfndpos admits UNLOCKDOOR. m_move supplies the same captured
    // can_unlock that its existing postmov door-opening branch consumes.
    const unlocksDoor = location?.typ === DOOR
        && (doorMask & D_LOCKED) && env.canUnlock;
    // C mon.c mon_allowflags() gives giants BUSTDOOR, so mfndpos()
    // selects locked doors for monmove.c postmov() to smash.
    const breaksDoor = location?.typ === DOOR
        && is_giant(monster.data) && (doorMask & D_LOCKED);
    // C mon.c mfndpos() admits amorphous passage or a vampire that can_fog,
    // unless engulfing the hero. That selection check already ran; postmov()
    // changes the vampire's form before flowing under the intact door.
    const flowsUnderDoor = location?.typ === DOOR
        && (amorphous(monster.data) || can_fog(monster, state))
        && (doorMask & (D_CLOSED | D_LOCKED));
    // mon.c:mfndpos() sets `thrudoor` when ALLOW_WALL is present, so a
    // wall-walker may follow its target through a closed doorway. postmov()
    // skips the ordinary door-opening block for that monster.
    const passWallDoorway = IS_DOOR(location?.typ)
        && passes_walls(monster.data);
    // mfndpos() admits an open or closed trapped door when it is otherwise
    // passable; postmov() checks btrapped before its door-state arm.
    const trappedDoor = location?.typ === DOOR
        && (doorMask & D_TRAPPED)
        && !(doorMask & D_LOCKED);
    // C ref: mon.c mfndpos() :2166-2170. poolok and lavaok decide whether the
    // monster can step onto pool and lava tiles. m_in_air() covers flyers,
    // floaters, and ceiling-clinging clingers; is_swimmer() covers swimmers;
    // likes_lava() covers fire elementals and salamanders. PM_FLOATING_EYE
    // overrides lavaok to FALSE at :2169-2170. The pool test below is the
    // source's `(poolok || is_pool(nx,ny) == wantpool)` predicate, including
    // its second scan for an eel that starts on land.
    const wantsPool = monster.data?.mlet === S_EEL;
    const poolOkay = (!on_level(state.u?.uz, state.water_level)
            && m_in_air(monster, state))
        || (is_swimmer(monster.data) && !wantsPool);
    // mfndpos() already selected this square. A stranded eel still prefers
    // water; C retries land only when its first scan found no candidates.
    // Land destinations are admitted below as ordinary terrain.
    const lavaOkay = (m_in_air(monster, state) || likes_lava(monster.data))
        && monsndx(monster.data) !== PM_FLOATING_EYE;
    const passwallDestination = IS_OBSTRUCTED(location?.typ)
        && passes_walls(monster.data)
        && may_passwall(x, y, state);
    const destinationPool = is_pool(x, y, state);
    const destinationLava = is_lava(x, y, state);
    const liquidDestination = (destinationPool || destinationLava)
        && (poolOkay || destinationPool === wantsPool)
        && (lavaOkay || !destinationLava);
    const digsWall = digsDestination(location, x, y, env);
    const ordinaryDestination = location
        && (IS_ROOM(location.typ)
            || location.typ === CORR
            // C mon.c:mfndpos() already filtered IRONBARS through ALLOW_BARS
            // and its diggability checks before m_move() offers this square.
            // Keep that selected destination eligible so monmove.c:postmov()
            // can run its source-owned passage or bar-dissolution branch.
            || location.typ === IRONBARS
            || inertDoorway
            || opensDoor
            || unlocksDoor
            || breaksDoor
            || flowsUnderDoor
            || passWallDoorway
            || trappedDoor
            || passwallDestination
            || digsWall
            || liquidDestination);
    if (!ordinaryDestination)
        unsupported('mfndpos() door or special terrain movement');
    // A trap on the destination is no longer refused here. C has no such gate:
    // monmove.c postmov() calls mintrap() after the move, and only there. That
    // is where an unported trap type now stops the scan, which also covers a
    // monster standing still on one -- a case this destination check never
    // saw.
    for (const region of state.level.regions) {
        if (region.attach_2_m === monster.m_id) continue;
        const currentlyInside = mon_in_region(region, monster);
        const destinationInside = inside_region(region, x, y);
        if (currentlyInside === destinationInside) continue;

        // C region.c m_in_out_region() only invokes these four transition
        // callbacks. The region's inside_f (including a damaging gas-cloud
        // callback) belongs to run_regions(), not monster movement, so any
        // region with no transition callbacks only needs its membership list
        // updated by the already-ported m_in_out_region().
        const callbackFreeTransition = transitionCallbackUnset(region.can_enter_f)
            && transitionCallbackUnset(region.enter_f)
            && transitionCallbackUnset(region.can_leave_f)
            && transitionCallbackUnset(region.leave_f);
        if (!callbackFreeTransition)
            unsupported('a region transition');
    }
    return m_in_out_region(monster, x, y, env);
}

function wipeSimpleEngraving(x, y, _count, _magical, env) {
    const engraving = engr_at(x, y, env.state);
    if (!engraving || engraving.engr_type === HEADSTONE
        || engraving.nowipeout
        || (engraving.engr_type === BURN && !is_ice(x, y, env.state))) {
        return;
    }
    return wipe_engr_at(x, y, _count, _magical, env);
}

// trap.c trapeffect_level_telep() reaches dog.c migrate_to_level() after a
// monster falls through a hole or trap door, which redraws the vacated square
// through the ordinary display owner.
function monsterMigrationOperation(env) {
    return (monster, destinationLedger, destinationCode, coordinate,
        migrationEnv = {}) => migrate_to_level(
        monster,
        destinationLedger,
        destinationCode,
        coordinate,
        {
            ...migrationEnv,
            newsym: migrationEnv.newsym ?? newsym,
        },
    );
}

// The fleeing path in monmove.c consumes canSeeMonster() to decide whether
// its source-owned message can be seen. mon_wield_item() now owns its own
// weapon.c canseemon() presentation checks.
function monsterWieldOperations(env) {
    return {
        canSeeMonster: (subject) => canseemon(subject, env.state),
    };
}

// Ordinary movement adapter used by the live monster turn and by
// uhitm.c:do_attack()'s consumed-return m_move() leprechaun check.
export async function moveSimpleOrdinary(monster, env) {
    return m_move(monster, {
        ...env,
        // monmove.c:2023 -> m_move_aggress:2097/2111 reaches hitmm/missmm
        // and pre_mm_attack through canonical mattackm.
        message: env.message ?? ttyPline,
        redraw: env.redraw ?? newsym,
        markInvisible: env.markInvisible ?? map_invisible,
        ...monsterWieldOperations(env),
        migrateToLevel: monsterMigrationOperation(env),
        setApparxy: (subject, operationEnv) =>
            set_apparxy(subject, operationEnv),
        mdigTunnel: mdig_tunnel,
        mayCrossRegion: admitSimpleDestinationAndRegion,
        finishEating: env.finishEating ?? finish_meating,
        movePet: env.movePet ?? moveSimplePet,
        // monmove.c m_move():1953 rejects the square the hero most recently
        // kicked before it filters occupants and tracking. The ordinary
        // adapter must provide the same predicate that the pet adapter uses.
        avoidKicked: (subject, x, y) =>
            m_avoid_kicked_loc(subject, x, y, env.state),
        resistsTrapEffect,
        // mon.c can_touch_safely() asks artifact.c touch_artifact() about
        // every item a monster considers. m_search_items(), postmov(), and
        // their object consumers now use artifactTouchable()'s canonical
        // synchronous monster owner; its monster arm is only a pickup gate
        // and never applies the hero's blast or damage.
        unsupported,
    });
}

async function moveSimplePet(monster, after, env) {
    return dog_move(monster, after, {
        ...env,
        migrateToLevel: monsterMigrationOperation(env),
        setApparxy: (subject, operationEnv) =>
            set_apparxy(subject, operationEnv),
        // dogmove.c:1280-1287 hands an ALLOW_U landing directly to
        // mattacku().  Starting pets are constrained by assertSimpleActionState
        // above; mattacku() itself keeps every attack family outside this
        // ordinary visible physical boundary fail-closed.
        attackHero: attackHeroWithMattacku,
        avoidKicked: (subject, x, y) =>
            m_avoid_kicked_loc(subject, x, y, env.state),
        avoidSokobanPush: (subject, x, y) =>
            m_avoid_soko_push_loc(subject, x, y, env.state),
        bestTarget: best_target,
        canSeeMonster: (subject) => canseemon(subject, env.state),
        // C ref: dogmove.c dog_move():1291-1292 calls the same
        // m_digweapon_check() m_move() does, so the pet gets the real function
        // rather than a constant answer.
        digWeaponCheck: (subject, x, y, moveEnv) => m_digweapon_check(
            subject,
            x,
            y,
            { ...moveEnv, ...monsterWieldOperations(env) },
        ),
        displaceMonster: (subject, target, moveEnv) =>
            mdisplacem(subject, target, false, moveEnv),
        eatObject: dog_eat,
        mayCrossRegion: admitSimpleDestinationAndRegion,
        // Three printing sites share the `message` seam: dog_invent()'s carry
        // arm through dogmove.c pline_xy(), its drop arm through steal.c
        // mdrop_obj(), and dog_move()'s cursed-step line through pline.c
        // pline_mon(). Two of those three also repaint through the `redraw`
        // seam -- the carry arm at js/dogmove.js dog_invent()'s
        // obj_extract_self(), and the drop arm through js/steal.js relobj()'s
        // tail. The cursed-step line repaints nothing, matching C, where
        // dogmove.c:1296-1312 calls no newsym().
        message: ttyPline,
        waitMap: undefined,
        // js/mhitm.js pre_mm_attack() marks a combatant the hero cannot spot
        // through display.c map_invisible(), which writes map memory and then
        // paints through show_glyph_cell().
        markInvisible: map_invisible,
        // C ref: dogmove.c:1133. The reflection predicate consumes the pet's
        // own worn equipment, just as the monster attack callers do.
        monsterReflects: (subject, moveEnv) => mon_reflects(
            subject,
            null,
            moveEnv.state,
            moveEnv,
        ),
        petRangedAttack: runPetRangedAttack,
        redraw: newsym,
        whimper,
        // steal.c relobj() and mdrop_obj() and do.c flooreffects() reach the
        // drop arm as ported functions with unported branches, so they refuse
        // through the caller's boundary class the way m_move() does.
        unsupported,
        // C dogmove.c dog_invent() equips weapon-using pets through
        // weapon.c mon_wield_item().
        wieldPickedItem: (subject, actionEnv) =>
            mon_wield_item(subject, actionEnv),
    });
}

// The operations mthrowu.c m_throw() and its callers need but js/mthrowu.js
// cannot import. Both live callers -- thrwmu()'s ordinary thrown weapon and
// muse.c use_offensive()'s hurled potion -- bind the same set, so the flight
// itself behaves identically whichever announcement preceded it.
function monsterMissileEnv(monster, env) {
    return {
        canSeeMonster: (subject) => canseemon(subject, env.state),
        canSeeSquare: (x, y) => cansee(x, y, env.state),
        clearObjectKnowledge: (obj) => clear_dknown(obj, env.state),
        damageValue: (obj, target, actionEnv) => dmgval(
            obj,
            target,
            actionEnv.state,
            { random: actionEnv.random, unsupported },
        ),
        delayOutput: nh_delay_output,
        endMulti: (value, state) => nomul(value, state),
        extractObject: (obj, actionEnv) => obj_extract_self(obj, actionEnv),
        floorEffects: (obj, x, y, verb, actionEnv) => flooreffects(
            obj,
            x,
            y,
            verb,
            actionEnv,
        ),
        hitHero: (hitv, damage, obj, actionEnv) => {
            return thitu(hitv, damage, obj, null, actionEnv.state, {
                ...actionEnv,
                exercise: (index, increase, state) => exercise(
                    index,
                    increase,
                    state,
                    actionEnv.random,
                    { encumberMessage: encumber_msg },
                ),
                losehp,
                fromMonster: true,
            });
        },
        poisoned: (reason, typ, pkiller, fatal, thrownWeapon, actionEnv) =>
            poisoned(
                reason,
                typ,
                pkiller,
                fatal,
                thrownWeapon,
                actionEnv.state,
                {
                    ...actionEnv,
                    message: actionEnv.message ?? ttyPline,
                    // attrib.c poisoned() reaches hack.c losehp() for its
                    // ordinary HP-loss arm.
                    losehp: async (n, knam, kFormat) => losehp(
                        n, knam, kFormat, actionEnv.state,
                        { message: actionEnv.message },
                    ),
                    done: (how) => done(how, actionEnv.state),
                    encumberMessage: encumber_msg,
                },
            ),
        message: ttyPline,
        monsterAt: (x, y, state) => m_at(x, y, state),
        monsterName: (subject) => capitalizedMonsterName(
            subject,
            env.state,
            { displayRandom: env.displayRandom },
        ),
        newsym,
        unblockPoint: (x, y, state) => {
            unblock_point(x, y, state);
        },
        objectToGlyph: (obj, state) =>
            obj_to_glyph(obj, state, env.displayRandom),
        observeObject: (obj, state) => observe_object(obj, state),
        passiveObject: (target, obj, attack, actionEnv) => passive_obj(
            target,
            obj,
            attack,
            actionEnv.state,
            actionEnv,
        ),
        placeObject: (obj, x, y, actionEnv) => place_object(
            obj,
            x,
            y,
            actionEnv,
        ),
        setMonsterNotWielded: (subject, obj, actionEnv) =>
            setmnotwielded(subject, obj, actionEnv),
        shouldMulch: (obj, actionEnv) => should_mulch_missile(
            obj,
            actionEnv.state,
            actionEnv,
        ),
        stackObject: (obj, actionEnv) => stackobj(obj, {
            ...actionEnv,
            hooks: {
                ...(actionEnv.hooks ?? {}),
                extractExternalObject: remove_object,
            },
        }),
        stopOccupation: (state) => stop_occupation(state, {
            message: ttyPline,
            statusRefresh: () => bot(),
            random: env.random,
        }),
        temporaryDisplay: tmp_at,
        swingVerb: (obj, bash, actionEnv) => mswings_verb(obj, bash, actionEnv),
        throwMissile: m_throw,
        unsupported,
    };
}

// C ref: muse.c use_offensive(), reached from mhitu.c mattacku():758-762. The
// potion it hurls flies through the same m_throw() a thrown weapon does, so the
// missile operations are shared; potionhit() is the one this caller adds.
async function useOffensiveItem(monster, env) {
    return use_offensive(monster, {
        ...env,
        ...monsterMissileEnv(monster, env),
        potionHit: (target, obj, how, actionEnv) => potionhit(
            target,
            obj,
            how,
            {
                ...actionEnv,
                encumberMessage: encumber_msg,
            },
        ),
        unsupported,
    });
}

// C ref: mhitu.c mattacku()'s range2 AT_WEAP arm calls mthrowu.c:thrwmu().
// The caller supplies the same missile and message operations as the other
// m_throw() entries; mon_wield_item() owns the initial wield check, and
// thrwmu() performs its source-ordered second select_rwep() for the throw.
async function throwRangedWeapon(monster, env) {
    return thrwmu(monster, {
        ...env,
        ...monsterMissileEnv(monster, env),
    });
}

// Shared mattacku adapter for dochug, pet attacks and the special movers.
// Supply the canonical combat operations used by its nested source owners;
// their existing unsupported branches remain named at those owners.
function attackHeroWithMattacku(monster, env) {
    const missileEnv = monsterMissileEnv(monster, env);
    return mattacku(monster, {
        ...env,
        // mhitu.c's AT_BREA/AT_SPIT arms call breamu()/spitmu() directly.
        // Those mthrowu.c paths enter m_throw(), so they need the same owner
        // operations as the AT_WEAP and muse.c callers below. Without this
        // shared adapter, a live spit reaches m_throw() with no monsterAt
        // operation and escapes runSegment() as a bare TypeError.
        ...missileEnv,
        throwRangedWeapon,
        wieldMonsterItemAgainstMonster,
        useOffensiveItem,
        unsupported,
        // C ref: mhitu.c:930 castmu(mtmp, mattk, TRUE, foundyou).
        castMonsterSpell: (subject, mattk, thinkFound, actualFound, spellEnv) => {
            const state = spellEnv.state ?? env.state;
            const spellMessage = spellEnv.message
                ?? (async (text, owner) => {
                    await ttyPline(text, owner);
                });
            const loseSpellHp = spellEnv.losehp ?? (async (n, knam, format) =>
                losehp(n, knam, format, state, {
                    ...spellEnv,
                    fromMonster: true,
                    message: spellMessage,
                }));
            return castmu(subject, mattk, thinkFound, actualFound, {
                ...spellEnv,
                losehp: loseSpellHp,
                encumberMessage: spellEnv.encumberMessage ?? encumber_msg,
                monsterName: (mtmp) => capitalizedMonsterName(
                    mtmp, env.state, { displayRandom: spellEnv.displayRandom },
                ),
                monnam: (mtmp) => mon_nam(mtmp, state, spellEnv),
                message: spellMessage,
                mdamageu: (mtmp2, dmg) =>
                    mdamageu(mtmp2, dmg, spellEnv.state ?? env.state, spellEnv),
            });
        },
        // C ref: mhitu.c AT_MAGC range2 arm -> buzzmu() (mcastu.c:988-1012).
        castRangedSpell: (subject, mattk, spellEnv) =>
            buzzmu(subject, mattk, {
                ...spellEnv,
                monsterName: (mtmp) => capitalizedMonsterName(mtmp, env.state),
                message: async (text, s) => {
                    await ttyPline(text, s);
                },
            }),
    });
}

// C ref: dogmove.c pet_ranged_attk(), called by dog_move and the mounted
// cmd.c domonability branch. Both use the same canonical attack operations.
export async function runPetRangedAttack(monster, forced, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    return pet_ranged_attk(monster, forced, {
        ...env,
        state,
        random: actionRandom(env),
        attackHero: attackHeroWithMattacku,
        // C path: dogmove.c pet_ranged_attk() -> mhitm.c mattackm()
        // -> mthrowu.c thrwmm() -> monshoot(). Keep the same missile
        // operations and display RNG on this monster-target caller.
        mattackm: (attacker, target, attackEnv) => mattackm(
            attacker,
            target,
            {
                ...attackEnv,
                ...monsterMissileEnv(attacker, attackEnv),
                wieldMonsterItemAgainstMonster,
                unsupported,
            },
        ),
        unsupported,
        message: rawEnv.message ?? ttyPline,
        markInvisible: map_invisible,
    });
}

export async function wieldMonsterItemAgainstMonster(
    weaponUser,
    weaponEnv,
) {
    return mon_wield_item(weaponUser, weaponEnv);
}

function simpleMonsterActionEnvironment(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = actionRandom(rawEnv);
    const env = {
        ...rawEnv,
        state,
        random,
        hooks: {
            // C mthrowu.c drop_throw() and mon.c mpickstuff() place and
            // remove boulders through mkobj.c.
            blockPoint: (x, y, objectEnv) => {
                block_point(x, y, objectEnv.state);
            },
            recalcBlockPoint: (x, y, objectEnv) => {
                recalc_block_point(x, y, objectEnv.state);
            },
            ...(rawEnv.hooks ?? {}),
        },
        migrateToLevel: rawEnv.migrateToLevel
            ?? monsterMigrationOperation({ ...rawEnv, state, random }),
        setApparxy: rawEnv.setApparxy
            ?? ((subject, operationEnv) => set_apparxy(subject, operationEnv)),
        onscary: rawEnv.onscary
            ?? ((x, y, subject, operationEnv) =>
                onscary(x, y, subject, operationEnv.state)),
    };
    return { env, state };
}

// Build the operation bundle once for both C call sites: movemon's wrapped
// action and shk.c u_entered_shop's direct extra action.
function simpleMonsterActionOperations(env, state) {
    return {
        // One dochug() now serves both, as in C. m_move() picks the mover.
        // These are the same source-backed providers used by dochugw today.
        // Canonical mattacku operations are shared by both dochug
        // attacks, both pet calls, shk_move, pri_move and wormhitu.
        attackHero: attackHeroWithMattacku,
                // C ref: monmove.c:895-907. Iterate AT_MAGC attack slots
                // with AD_SPEL or AD_CLRC and call castmu(FALSE, FALSE).
                // Most of the time, choose_monster_spell picks a directed
                // spell and castmu returns M_ATTK_MISS immediately.
        castUndirectedSpell: async (subject, spellEnv) => {
                    const mdat = subject.data;
                    if (!mdat?.mattk) return false;
                    const castEnv = {
                        ...spellEnv,
                        monsterName: (mtmp) =>
                            capitalizedMonsterName(mtmp, state),
                        monnam: (mtmp) => mon_nam(mtmp, state, spellEnv),
                        message: async (text, s) => { await ttyPline(text, s); },
                        mdamageu: (mtmp2, dmg) =>
                            mdamageu(
                                mtmp2, dmg,
                                spellEnv.state ?? state,
                                spellEnv,
                            ),
                    };
                    for (const a of mdat.mattk) {
                        if (a.aatyp === AT_MAGC
                            && (a.adtyp === AD_SPEL
                                || a.adtyp === AD_CLRC)) {
                            const result = await castmu(
                                subject, a, false, false, castEnv,
                            );
                            if (result & 0x1) return true; /* M_ATTK_HIT */
                        }
                    }
                    return false;
                },
                // monmove.c:distfleeck564 and dochug's fear calls share the
                // canonical flight owner.
        monFlee: (subject, time, first, showMessage, fleeEnv) =>
                    monflee(subject, time, first, showMessage, {
                        ...fleeEnv,
                        canSeeMonster: (mtmp) => canseemon(mtmp, fleeEnv.state),
                        fleeMessage: monfleeMessage,
                        message: fleeEnv.message ?? ttyPline,
                        createGasCloud: createMonsterGasCloud,
                    }),
        questStatCheck: quest_stat_check,
                // C ref: monmove.c:722 quest_talk(). The one place a monster's
                // turn reads the keyboard: quest.c is_pure()'s wizard-mode
                // `adjust?` prompt.
        questTalk: (subject, talkEnv) => quest_talk(subject, {
                    ...talkEnv,
                    unsupported,
                    output: undefined,
                    message: ttyPline,
                    yn: undefined,
                }),
        monsterCanSeeHero: ordinaryMonsterCanSeeHero,
        moveMonster: moveSimpleOrdinary,
                // muse.c find_offensive(), which dochug()'s post-move
                // disjunction calls, refuses through this rather than
                // answering TRUE.
        unsupported,
        // C ref: monmove.c dochug():794-799 runs muse.c use_defensive() or
        // use_misc() as soon as find_defensive() or find_misc() selects an
        // item. Both change the monster or the level -- a potion or wand of
        // speed monster sets mspeed through worn.c mon_adjust_speed(), which
        // the next allocation's mcalcmove() reads; other items heal,
        // teleport, dig, or use up the object -- and both write straight to
        // the terminal.
        usePreMoveItems: async (itemUser, itemEnv) => {
                    const defensive = find_defensive(
                        itemUser,
                        false,
                        itemEnv,
                    );
                    if (defensive) {
                        const result = await use_defensive(
                            itemUser,
                            defensive,
                            itemEnv.state,
                            itemEnv,
                        );
                        return result !== 0;
                    }
                    const misc = find_misc(
                        itemUser,
                        itemEnv,
                    );
                    if (misc) {
                        const result = await use_misc(
                            itemUser,
                            misc,
                            itemEnv.state,
                            itemEnv,
                        );
                        return result !== 0;
                    }
                    return false;
                },
        wieldMonsterItem: (weaponUser, weaponEnv) =>
                    mon_wield_item(weaponUser, weaponEnv),
        wieldMonsterItemAgainstMonster,
        wakeMessage: wake_msg,
        wipeEngraving: wipeSimpleEngraving,
        finishEating: finish_meating,
        movePet: moveSimplePet,
        preflight: assertSimpleActionState,
    };
}

// Execute one direct monster action. C calls dochug()
// directly from shk.c u_entered_shop(), without dochugw()'s interruption step.
export async function runDirectMonsterAction(monster, rawEnv = {}) {
    const { env, state } = simpleMonsterActionEnvironment(rawEnv);
    return dochug(monster, {
        ...env,
        ...simpleMonsterActionOperations(env, state),
    });
}

// Execute one monster action for the movemon() adapter in js/allmain.js.
export async function runSimpleMonsterAction(monster, rawEnv = {}) {
    const { env, state } = simpleMonsterActionEnvironment(rawEnv);
    assertSimpleActionState(monster, state);
    return dochugw(monster, true, {
        ...env,
        canSpotMonster: (subject) => canspotmon(subject, state),
        dochug: runDirectMonsterAction,
        // C ref: monmove.c dochugw():223-235. Its radius is nine squares, so
        // this fires several turns before moveloop_core()'s own
        // monster_nearby() test, which scans the eight adjacent squares alone.
        // A meal finished here draws from env.random (js/eat.js eatfood()).
        stopOccupation: () => stop_occupation(state, {
            message: ttyPline,
            statusRefresh: () => bot(),
            random: env.random,
        }),
    });
}

function createMonsterGasCloud(x, y, size, damage, effectEnv) {
    const { state } = effectEnv;
    return create_gas_cloud(x, y, size, damage, {
        ...effectEnv,
        blockPoint: (cloudX, cloudY) =>
            block_point(cloudX, cloudY, state),
        canSee: (cloudX, cloudY) => cansee(cloudX, cloudY, state),
        newsym: (cloudX, cloudY) => newsym(cloudX, cloudY),
        message: effectEnv.message ?? ((text, target) => ttyPline(text, target)),
    });
}
