// steed.js -- Riding a saddled monster.
// C ref: steed.c -- can_ride(), mount_steed(), exercise_steed(),
// landing_spot(), dismount_steed(), maybewakesteed(), stucksteed() and
// doride().

import {
    ARTICLE_A,
    BLINDED,
    CONFUSION,
    DIR_ERR,
    DISMOUNT_BONES,
    DISMOUNT_BYCHOICE,
    DISMOUNT_ENGULFED,
    DISMOUNT_FELL,
    DISMOUNT_GENERIC,
    DISMOUNT_KNOCKED,
    DISMOUNT_POLY,
    DISMOUNT_THROWN,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FLYING,
    FUMBLING,
    GLIB,
    HALF_PHDAM,
    HALLUC,
    HALLUC_RES,
    has_mgivenname,
    LEG,
    LEVITATION,
    MAXULEV,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    N_DIRS,
    NO_KILLER_PREFIX,
    P_RIDING,
    SLT_ENCUMBER,
    STEALTH,
    STONE_RES,
    STUNNED,
    SUPPRESS_HALLUCINATION,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    TELEDS_ALLOW_DRAG,
    TELEPAT,
    TEST_MOVE,
    TT_BEARTRAP,
    TT_PIT,
    TT_WEB,
    Upolyd,
    VIBRATING_SQUARE,
    WOUNDED_LEGS,
    W_ARTI,
    W_SADDLE,
    I_SPECIAL,
    TIMEOUT,
    helpless,
    isok,
} from './const.js';
import { dirtocoord, getdir, xytodir, y_n } from './cmd.js';
import { newsym } from './display.js';
import { finish_meating } from './dogmove.js';
import {
    capitalizedMonsterName,
    hliquid,
    monsterCommonName,
    pmname,
    x_monnam,
} from './do_name.js';
import { can_saddle } from './dog.js';
import { game } from './gstate.js';
import {
    losehp,
    near_capacity,
    NODIAG,
    test_move,
    u_locomotion,
} from './hack.js';
import { dist2 } from './hacklib.js';
import {
    bigmonst,
    gender,
    humanoid,
    is_flyer,
    is_floater,
    is_swimmer,
    slithy,
    throws_rocks,
    touch_petrifies,
    verysmall,
} from './mondata.js';
import { accessible } from './monmove.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import { PM_KNIGHT, PM_LONG_WORM } from './monsters.js';
import { greatest_erosion, isMetallic, sobj_at } from './obj.js';
import { BOULDER } from './objects.js';
import { an } from './objnam.js';
import { encumber_msg } from './pickup.js';
import { body_part, steed_vs_stealth } from './polyself.js';
import { rn1, rn2, rnd } from './rng.js';
import { teleds } from './teleport.js';
import { float_down, is_lava, is_pool, t_at } from './trap.js';
import { ttyPline } from './tty_message.js';
import { use_skill } from './weapon.js';
import { is_pole, which_armor } from './worn.js';

// A steed path this port has not reached yet.
export class UnsupportedSteedError extends Error {
    constructor(reason) {
        super(`unsupported steed action: ${reason}`);
        this.name = 'UnsupportedSteedError';
        this.reason = reason;
    }
}

// youprop.h property spellings this file needs. Each names the exact macro it
// stands for, because the terms differ from macro to macro.
function propertyActive(state, index) {
    const value = state.u?.uprops?.[index];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

// youprop.h:84 and :112 define Confusion and Glib as the bare intrinsic field.
function propertyIntrinsic(state, index) {
    return Boolean(state.u?.uprops?.[index]?.intrinsic);
}

// youprop.h:77. The punishing ball is the whole test.
export function Punished(state) {
    return Boolean(state.uball);
}

// youprop.h:120. Hallucination is a timeout, so it reads the intrinsic alone.
function Hallucination(state) {
    return Boolean(state.u?.uprops?.[HALLUC]?.intrinsic)
        && !propertyActive(state, HALLUC_RES);
}

// youprop.h:103. Blindness subtracts a blocking term the others do not have.
function Blind(state) {
    const value = state.u?.uprops?.[BLINDED];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

// youprop.h:210 Stealth. BStealth is written by polyself.c
// steed_vs_stealth(), which this file calls on both sides of a ride.
function Stealth(state) {
    const stealth = state.u.uprops[STEALTH];
    return Boolean((stealth.intrinsic || stealth.extrinsic)
                   && !stealth.blocked);
}

// youprop.h:253 Flying. The steed term is what makes a hero on a flying steed
// count as airborne; a pony is not a flyer, so it contributes nothing here.
function Flying(state) {
    const flying = state.u.uprops[FLYING];
    return Boolean((flying.intrinsic || flying.extrinsic
                    || (state.u.usteed && is_flyer(state.u.usteed.data)))
                   && !flying.blocked);
}

// youprop.h:240 and :242. Levitation subtracts a blocking term; Lev_at_will
// asks whether the levitation is one the hero can switch off at will, which is
// true only for an intrinsic flagged I_SPECIAL or an artifact extrinsic with
// nothing else contributing.
function Levitation(state) {
    const value = state.u?.uprops?.[LEVITATION];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

function Lev_at_will(state) {
    const intrinsic = state.u?.uprops?.[LEVITATION]?.intrinsic ?? 0;
    const extrinsic = state.u?.uprops?.[LEVITATION]?.extrinsic ?? 0;
    return ((intrinsic & I_SPECIAL) !== 0 || (extrinsic & W_ARTI) !== 0)
        && (intrinsic & ~(I_SPECIAL | TIMEOUT)) === 0
        && (extrinsic & ~W_ARTI) === 0;
}

// hack.h:1236 Maybe_Half_Phys(). youprop.h:341 defines Half_physical_damage
// as the intrinsic or the extrinsic, with no blocking term.
function Maybe_Half_Phys(dmg, state) {
    return propertyActive(state, HALF_PHDAM)
        ? Math.trunc((dmg + 1) / 2) : dmg;
}

// C ref: steed.c can_ride() (168-174).
export function can_ride(mtmp, state = game) {
    const you = state.youmonst?.data;
    return Boolean(mtmp.mtame) && humanoid(you)
        && !verysmall(you) && !bigmonst(you)
        && (!state.u.uinwater || is_swimmer(mtmp.data));
}

// C ref: steed.c mount_steed() (197-383). Every guard down to the impairment
// roll is ported, along with the roll, the slip a failed roll causes, and the
// success path from 358. Six arms stop instead of running, each named at its
// site.
//
// `force` is TRUE only for the debug-mode "Force the mount to succeed?"
// question, which doride() refuses before calling here, so every `!force` term
// below is live and no `force`-only arm can run.
export async function mount_steed(mtmp, force, state = game) {
    const u = state.u;

    /* Sanity checks */
    if (u.usteed) {
        await ttyPline(
            `You are already riding ${monsterCommonName(u.usteed, state)}.`,
            state,
        );
        return false;
    }

    /* Is the player in the right form? */
    if (Hallucination(state) && !force) {
        await ttyPline('Maybe you should find a designated driver.', state);
        return false;
    }
    if (propertyActive(state, WOUNDED_LEGS)) {
        // do.c legs_in_no_shape() (2408-2423) reads EWounded_legs' side bits
        // and makeplural(), and the `force && wizard` heal_legs() question
        // below it is debug-mode only. Neither is ported, which is the whole
        // basis for the stop: the property itself is live. do.c
        // set_wounded_legs() writes it, and trap.c trapeffect_bear_trap()'s
        // hero arm reaches that writer, so a hero who walks into a bear trap
        // and then rides arrives here.
        throw new UnsupportedSteedError('mount_steed() with wounded legs');
    }

    if (Upolyd(state.u)) {
        const you = state.youmonst?.data;
        if (!humanoid(you) || verysmall(you) || bigmonst(you) || slithy(you)) {
            await ttyPline("You won't fit on a saddle.", state);
            return false;
        }
    }
    if (!force && (near_capacity(state) > SLT_ENCUMBER)) {
        await ttyPline(
            "You can't do that while carrying so much stuff.", state,
        );
        return false;
    }

    /* Can the player reach and see the monster? */
    const appearance = (mtmp?.m_ap_type ?? 0) & M_AP_TYPMASK;
    if (!mtmp || (!force && ((Blind(state) && !propertyActive(state, TELEPAT))
                             || mtmp.mundetected
                             || appearance === M_AP_FURNITURE
                             || appearance === M_AP_OBJECT))) {
        await ttyPline('I see nobody there.', state);
        return false;
    }
    if (mtmp.data === state.mons?.[PM_LONG_WORM]
        && (u.ux + u.dx !== mtmp.mx || u.uy + u.dy !== mtmp.my)) {
        // "You couldn't ride %s, let alone its tail." needs a_monnam(), whose
        // suppress flags x_monnam() does not cover. A long worm cannot reach
        // dungeon level one: makemon.c rndmonst_adj() caps generation at
        // monmax_difficulty(1) == 1 for an experience level 1 hero and the
        // long worm's difficulty is 9.
        throw new UnsupportedSteedError('mount_steed() onto a long worm tail');
    }
    if (u.uswallow || u.ustuck || u.utrap || Punished(state)
        || !await test_move(u.ux, u.uy, mtmp.mx - u.ux, mtmp.my - u.uy,
                            TEST_MOVE, state)) {
        if (Punished(state) || !(u.uswallow || u.ustuck || u.utrap)) {
            await ttyPline(
                `You are unable to swing your ${body_part(LEG,
                    state.youmonst)} over.`,
                state,
            );
        } else {
            await ttyPline('You are stuck here for now.', state);
        }
        return false;
    }

    /* Is this a valid monster? */
    const otmp = which_armor(mtmp, W_SADDLE);
    if (!otmp) {
        await ttyPline(
            `${capitalizedMonsterName(mtmp, state)} is not saddled.`, state,
        );
        return false;
    }

    const ptr = mtmp.data;
    if (touch_petrifies(ptr) && !propertyActive(state, STONE_RES)) {
        // instapetrify() ends the game through done(STONING), which no part of
        // the port covers. The arm is unreachable as well: guard 9 above
        // has already established that the monster wears a saddle, and the only
        // routes to a worn saddle -- use_saddle(), makedog() and makemon()'s 1%
        // pony -- all run behind can_saddle(), which admits neither the
        // cockatrice nor the chickatrice that touch_petrifies() names.
        throw new UnsupportedSteedError('mount_steed() onto a petrifier');
    }
    if (!mtmp.mtame || mtmp.isminion) {
        await ttyPline(
            `I think ${monsterCommonName(mtmp, state)} would mind.`, state,
        );
        return false;
    }
    if (mtmp.mtrapped) {
        // "You can't mount %s while %s's trapped in %s." needs mhe()
        // (you.h:322, through pronoun_gender()) and trapname() (trap.c:7100),
        // neither of which is ported.
        throw new UnsupportedSteedError('mount_steed() onto a trapped steed');
    }

    if (!force && state.urole?.mnum !== PM_KNIGHT && !(--mtmp.mtame)) {
        /* no longer tame */
        newsym(mtmp.mx, mtmp.my);
        await ttyPline(
            `${capitalizedMonsterName(mtmp, state)} resists`
            + `${mtmp.mleashed ? ' and its leash comes off' : ''}!`,
            state,
        );
        if (mtmp.mleashed) {
            // m_unleash() is unported, and so is every writer of mleashed:
            // apply.c use_leash() is the only one, and #apply is not ported.
            throw new UnsupportedSteedError(
                'mount_steed() unleashing an untamed steed',
            );
        }
        return false;
    }
    if (!force && state.u.uinwater && !is_swimmer(ptr)) {
        await ttyPline(
            `You can't ride that creature while under `
            + `${hliquid('water', { state })}.`,
            state,
        );
        return false;
    }
    if (!can_saddle(mtmp) || !can_ride(mtmp, state)) {
        await ttyPline("You can't ride such a creature.", state);
        return false;
    }

    /* Is the player impaired? */
    if (!force && !is_floater(ptr) && !is_flyer(ptr) && Levitation(state)
        && !Lev_at_will(state)) {
        await ttyPline(
            `You cannot reach ${monsterCommonName(mtmp, state)}.`, state,
        );
        return false;
    }
    if (!force && state.uarm && isMetallic(state.uarm, state)
        && greatest_erosion(state.uarm)) {
        await ttyPline(
            `Your ${state.uarm.oeroded ? 'rusty' : 'corroded'} armor is too `
            + `stiff to be able to mount ${monsterCommonName(mtmp, state)}.`,
            state,
        );
        return false;
    }
    // The disjunction short-circuits, so the rnd(MAXULEV / 2 + 5) call is made
    // only when every impairment ahead of it is absent. Wounded_legs cannot
    // reach this line: the guard above returns for it whenever `force` is
    // FALSE, which it always is outside debug mode.
    if (!force
        && (propertyIntrinsic(state, CONFUSION)
            || propertyActive(state, FUMBLING)
            || propertyIntrinsic(state, GLIB)
            || propertyActive(state, WOUNDED_LEGS)
            || otmp.cursed
            || otmp.greased
            || (u.ulevel + mtmp.mtame < rnd(MAXULEV / 2 + 5)))) {
        if (Levitation(state)) {
            await ttyPline(
                `${capitalizedMonsterName(mtmp, state)} slips away from you.`,
                state,
            );
            return false;
        }
        await ttyPline(
            `You slip while trying to get on ${monsterCommonName(mtmp, state)}`
            + '.',
            state,
        );

        /* "a saddled mumak" or "a saddled pony called Dobbin" */
        const buf = `slipped while mounting ${x_monnam(mtmp, ARTICLE_A, null,
            SUPPRESS_IT | SUPPRESS_INVISIBLE | SUPPRESS_HALLUCINATION,
            true, state)}`;
        await losehp(Maybe_Half_Phys(rn1(5, 10), state), buf,
                     NO_KILLER_PREFIX, state);
        return false;
    }

    /* Success */
    maybewakesteed(mtmp);
    if (!force) {
        if (Levitation(state) && !is_floater(ptr) && !is_flyer(ptr)) {
            /* Must have Lev_at_will at this point: the guard above returns
               for every other levitating hero. Nothing in this port grants
               Lev_at_will, so this line is unreachable today. */
            await ttyPline(
                `${capitalizedMonsterName(mtmp, state)} magically floats up!`,
                state,
            );
        }
        await ttyPline(`You mount ${monsterCommonName(mtmp, state)}.`, state);
        if (Flying(state)) {
            await ttyPline(
                `You and ${monsterCommonName(mtmp, state)} take flight `
                + 'together.',
                state,
            );
        }
    }
    /* setuwep handles polearms differently when you're mounted */
    if (state.uwep && is_pole(state.uwep, state))
        state.unweapon = false;
    u.usteed = mtmp;
    {
        const was_stealthy = Stealth(state);

        steed_vs_stealth(state);
        if (was_stealthy && !Stealth(state))
            await ttyPline("You aren't stealthy anymore.", state);
    }
    remove_monster(mtmp.mx, mtmp.my, state);
    await teleds(mtmp.mx, mtmp.my, TELEDS_ALLOW_DRAG, state);
    state.disp ??= {};
    state.disp.botl = true;
    return true;
}

// C ref: steed.c exercise_steed(). hack.c domove_core() is its only caller,
// which is why the `!u.usteed` guard is redundant there and kept anyway.
//
// u.urideturns counts the steps the hero has taken while mounted. This
// function and js/u_init.js are its only writers, as they are in C -- nothing
// clears it on dismount, so the count carries across mounts and a hero who
// rides in short stretches still reaches the hundredth step.
//
// Below that hundredth step the counter is the whole observable effect. On it,
// weapon.c use_skill() adds one to P_ADVANCE(P_RIDING), which nothing shows
// until the hero types #enhance. weapon.c skill_init() starts a Knight's
// riding at P_BASIC with 20 practice, and skills.h
// practice_needed_to_advance(P_BASIC) is 80, so use_skill()'s
// give_may_advance_msg() arm -- the one js/weapon.js refuses -- is 6000
// mounted steps away, and needs a spare weapon slot as well.
export function exercise_steed(state = game) {
    const u = state.u;

    if (!u.usteed)
        return;

    /* It takes many turns of riding to exercise skill */
    if (++u.urideturns >= 100) {
        u.urideturns = 0;
        use_skill(P_RIDING, 1, state);
    }
}

// C ref: steed.c landing_spot() (459-566). Chooses a square beside the hero
// for a dismount, and returns null when there is none. C fills a caller-owned
// coord and returns a boolean; a nullable coordinate says the same thing
// without letting a caller read a stale spot.
//
// Three RNG draws live here. `rn2(2)` picks between the two next-best
// directions and belongs to DISMOUNT_KNOCKED alone; `rn2(viable)` breaks a tie
// between equally distant candidates and fires on every reason; and
// enexto() behind `forceit` draws through goodpos(). Only the second is
// reachable from doride().
async function landing_spot(reason, forceit, state = game) {
    const u = state.u;
    const spot = { x: 0, y: 0 };
    const tries = [];
    let best_j;
    let clockwise_j;
    let counterclk_j;
    let min_distance = -1;

    let j = xytodir(u.dx, u.dy);
    if (reason === DISMOUNT_KNOCKED && j !== DIR_ERR) {
        // The preferred direction and its two neighbours, which only a
        // knockback dismount supplies. uhitm.c is its only caller.
        throw new UnsupportedSteedError(
            'landing_spot() for a knockback dismount',
        );
    } else {
        best_j = -1;
        clockwise_j = -1;
        counterclk_j = -1;
    }
    for (j = 0; j < N_DIRS; ++j) {
        /* fortunately NODIAG() handling isn't needed for DISMOUNT_KNOCKED
           because hero can only ride when humanoid */
        if (j === best_j || j === clockwise_j || j === counterclk_j) continue;
        // steed.c:501 tests `(j % 1) != 0`, which is zero for every j. The
        // intent was `j % 2`, excluding the odd diagonal directions for a
        // grid bug. Preserved as written: the arm never skips a direction.
        if (reason === DISMOUNT_POLY && NODIAG(u.umonnum) && (j % 1) !== 0)
            continue;
        tries.push(dirtocoord(j));
    }
    const n = tries.length;

    /*
     * Up to three passes;
     * i==0: voluntary dismount without impairment avoids known traps and
     *       boulders;
     * i==1: voluntary dismount with impairment or knocked out of saddle
     *       avoids boulders but allows known traps;
     * i==2: other, allow traps and boulders.
     */
    const impaird = propertyIntrinsic(state, STUNNED)
        || propertyIntrinsic(state, CONFUSION)
        || propertyActive(state, FUMBLING);
    let viable = 0;
    let found = false;
    let i = (reason === DISMOUNT_BYCHOICE && !impaird) ? 0
        : ((reason === DISMOUNT_BYCHOICE && impaird)
           || reason === DISMOUNT_KNOCKED) ? 1
            : 2;
    for (; i <= 2 && !found; ++i) {
        for (j = 0; j < n; ++j) {
            const x = u.ux + tries[j].x;
            const y = u.uy + tries[j].y;
            if (!isok(x, y) || (x === u.ux && y === u.uy)) continue;

            if (accessible(x, y, state) && !m_at(x, y, state)
                && await test_move(u.ux, u.uy, x - u.ux, y - u.uy,
                                   TEST_MOVE, state)) {
                ++viable;
                const distance = dist2(x, y, u.ux, u.uy);
                if (min_distance < 0 /* no viable candidate yet */
                    /* or better than pending candidate (orthogonal spots are
                       distance 1 and diagonal ones distance 2) */
                    || ((best_j === -1) ? (distance < min_distance) : (j < 3))
                    /* or equally good, maybe substitute this one */
                    || (distance === min_distance && !rn2(viable))) {
                    /* traps avoided on pass 0; boulders avoided on 0 and 1 */
                    const trap = i === 0 ? t_at(x, y, state) : null;
                    const kn_trap = i === 0 && Boolean(trap) && trap.tseen
                        && trap.ttyp !== VIBRATING_SQUARE;
                    const boulder = i <= 1
                        && Boolean(sobj_at(BOULDER, x, y, state))
                        && !throws_rocks(state.youmonst.data);
                    if (!kn_trap && !boulder) {
                        spot.x = x;
                        spot.y = y;
                        min_distance = distance;
                        found = true;
                        if (best_j !== -1 && j < 3) break;
                    }
                }
            }
        }
    }

    if (forceit && !found) {
        // enexto() is the last resort for a dismount the hero did not choose.
        throw new UnsupportedSteedError('landing_spot() forced through enexto');
    }
    return found ? spot : null;
}

// C ref: steed.c dismount_steed() (575-822). doride() supplies
// DISMOUNT_BYCHOICE and nothing else in this port reaches here, so the other
// seven reasons refuse at the switch below, each naming the C callers that
// would produce it.
export async function dismount_steed(reason, state = game) {
    const u = state.u;
    const save_utrap = u.utrap;
    const repair_leg_damage = propertyActive(state, WOUNDED_LEGS);
    // The initializers run before the `!u.usteed` sanity check, so
    // landing_spot() reads a hero who is still mounted.
    let have_spot = await landing_spot(reason, 0, state);

    const mtmp = u.usteed; /* make a copy of steed pointer */
    /* Sanity check */
    if (!mtmp) return; /* Just return silently */
    // C ref: steed.c:591-597. C clears u.usteed here so that its Flying and
    // Levitation tests, and u_locomotion("fall"), answer for the hero alone,
    // then restores it. All three values are read only by the _FELL, _THROWN
    // and _KNOCKED arms, which refuse below, so that window has no observable
    // effect and is not reproduced. u_locomotion() is imported all the same,
    // because it is the arm's only other prerequisite.
    void u_locomotion;

    /* Check the reason for dismounting */
    const otmp = which_armor(mtmp, W_SADDLE);
    switch (reason) {
    case DISMOUNT_THROWN:
    case DISMOUNT_KNOCKED:
    case DISMOUNT_FELL:
        // "You %s off of %s!", then losehp(rn1(10, 10)) and
        // set_wounded_legs(). steed.c kick_steed(), uhitm.c's knockback,
        // trap.c, worn.c, timeout.c, do.c, eat.c and dogmove.c produce these.
        throw new UnsupportedSteedError(
            `dismount_steed() reason ${reason}, a fall from the saddle`,
        );
    case DISMOUNT_POLY:
        // "You can no longer ride %s." from polyself.c, uhitm.c, dogmove.c
        // and trap.c, when either party changes shape.
        throw new UnsupportedSteedError(
            'dismount_steed(DISMOUNT_POLY)',
        );
    case DISMOUNT_ENGULFED:
        // mhitu.c prints its own message; the tail below then skips
        // float_down() and leaves the hero inside the engulfer.
        throw new UnsupportedSteedError(
            'dismount_steed(DISMOUNT_ENGULFED)',
        );
    case DISMOUNT_BONES:
        // bones.c, after the hero has died.
        throw new UnsupportedSteedError('dismount_steed(DISMOUNT_BONES)');
    case DISMOUNT_GENERIC:
        // dog.c, mon.c and trap.c use it to end the ride without a message,
        // each after the steed has left the level or died.
        throw new UnsupportedSteedError('dismount_steed(DISMOUNT_GENERIC)');
    case DISMOUNT_BYCHOICE:
    default:
        if (otmp && otmp.cursed) {
            await ttyPline(
                `You can't.  The saddle ${otmp.bknown ? 'is' : 'seems to be'}`
                + ' cursed.',
                state,
            );
            otmp.bknown = 1; /* ok to skip set_bknown() here */
            return;
        }
        if (!have_spot) {
            await ttyPline(
                "You can't.  There isn't anywhere for you to stand.", state,
            );
            return;
        }
        if (!has_mgivenname(mtmp)) {
            await ttyPline(
                'You\'ve been through the dungeon on '
                + `${an(pmname(mtmp.data, gender(mtmp)))} with no name.`,
                state,
            );
            if (Hallucination(state)) {
                await ttyPline(
                    'It felt good to get out of the rain.', state,
                );
            }
        } else {
            await ttyPline(
                `You dismount ${monsterCommonName(mtmp, state)}.`, state,
            );
        }
        break;
    }
    /* While riding, Wounded_legs refers to the steed's legs;
       after dismounting, it reverts to the hero's legs. */
    if (repair_leg_damage) {
        // C calls heal_legs(1) here. js/do.js ports that function's how == 0
        // arm alone. What how decides is narrower than it looks: do.c:2461's
        // message test is `!u.usteed && how != 2`, so only the petrification
        // value suppresses the line, and the dismount is silent through the
        // first conjunct instead -- steed.c clears u.usteed at :658, after the
        // heal_legs(1) call at :655. do.c:2483's `if (how == 0)` is the one
        // test how alone decides, and it suppresses the encumbrance feedback
        // for 1 and 2 both. So a how == 1 caller needs this function's ported
        // body with encumber_msg() suppressed, which means restoring the
        // argument rather than re-deriving the branch, and that is the basis
        // for this stop.
        // The property is live -- do.c set_wounded_legs(), reached from trap.c
        // trapeffect_bear_trap()'s hero arm, writes it -- but mount_steed()
        // refuses a hero who already carries the wound, so arriving here needs
        // one taken while riding, and no C writer that can inflict one on a
        // rider is ported: trap.c:2581-2582's land mine, uhitm.c:4475, and the
        // ball.c, dig.c, dokick.c and apply.c calls. steed.c:614's own wound,
        // from the fall this function is handling, clears the flag at 615.
        throw new UnsupportedSteedError('dismount_steed() healing legs');
    }

    /* Release the steed */
    u.usteed = null;
    u.ugallop = 0;
    {
        const was_stealthy = Stealth(state);

        steed_vs_stealth(state);
        if (Stealth(state) && !was_stealthy)
            await ttyPline('You seem less noisy now.', state);
    }

    if (u.utraptype === TT_BEARTRAP
        || u.utraptype === TT_PIT
        || u.utraptype === TT_WEB) {
        mtmp.mtrapped = 1;
    }

    /*
     * place_monster() expects mtmp to be alive and not be u.usteed, which is
     * why gi.in_steed_dismounting brackets the call.
     */
    const steedcc = { x: u.ux, y: u.uy };
    if (m_at(u.ux, u.uy, state)) {
        // The hero's square is occupied only when an engulfer plucked the
        // hero from the saddle, which DISMOUNT_ENGULFED already refuses.
        throw new UnsupportedSteedError(
            'dismount_steed() onto an occupied hero square',
        );
    }

    if (!(mtmp.mhp < 1)) { /* !DEADMONSTER(mtmp) */
        // C spells this field with ++/-- here and with TRUE/FALSE below;
        // both produce 1 and 0 on its boolean field.
        state.in_steed_dismounting = (state.in_steed_dismounting ?? 0) + 1;
        place_monster(mtmp, steedcc.x, steedcc.y, state);
        state.in_steed_dismounting -= 1;

        /* Set hero's and/or steed's positions. */
        if (!u.uswallow && !u.ustuck && have_spot) {
            const mdat = mtmp.data;

            /* The steed may drop into water/lava */
            void mdat;
            // C gates this on grounded(mdat), so a flying or floating steed
            // survives the same square. mondata.h:23's grounded() is not
            // ported and the refusal is deliberately the wider one: no steed
            // this port can reach flies.
            if (is_pool(u.ux, u.uy, state)
                || is_lava(u.ux, u.uy, state)) {
                // killed()/adjalign() and the two "falls into the %s!"
                // messages belong to the combat and alignment work.
                throw new UnsupportedSteedError(
                    'dismount_steed() dropping the steed into liquid',
                );
            }
            /* Keep steed here, move the player to the landing spot;
             * teleds() clears u.utrap.
             */
            state.in_steed_dismounting = 1;
            await teleds(have_spot.x, have_spot.y, TELEDS_ALLOW_DRAG, state);
            if (sobj_at(BOULDER, have_spot.x, have_spot.y, state)) {
                // sokoban.c sokoban_guilt() is only reachable on a Sokoban
                // level, and requireSimpleHeroDestination() refuses a
                // boulder square before teleds() moves the hero anyway.
                throw new UnsupportedSteedError(
                    'dismount_steed() onto a boulder',
                );
            }
            state.in_steed_dismounting = 0;

            /* Put your steed in your trap */
            if (save_utrap) {
                throw new UnsupportedSteedError(
                    'dismount_steed() trapping the steed the hero left',
                );
            }
        } else {
            // The enexto() fallback that keeps the hero put has no owner, and
            // the killed()/monkilled() arm below it is reached only through
            // that fallback's failure; both need a hero who is held,
            // engulfed, or has nowhere to stand, and the BYCHOICE arm above
            // has already returned for the last of those.
            throw new UnsupportedSteedError(
                'dismount_steed() with no landing spot for the hero',
            );
        }
    } /* !DEADMONSTER(mtmp) */

    /* usually return the hero to the surface */
    state.in_steed_dismounting = 1;
    await float_down(0, W_SADDLE, state);
    state.in_steed_dismounting = 0;
    state.disp ??= {};
    state.disp.botl = true;
    await encumber_msg(state);
    state.vision_full_recalc = 1;
    /* polearms behave differently when not mounted */
    if (state.uwep && is_pole(state.uwep, state))
        state.unweapon = true;
}

// C ref: steed.c maybewakesteed() (825-848). Wakes a sleeping or frozen steed
// when the hero saddles or mounts it. The rn2(frozen) draw is the only random
// number the success path can make, and it fires only for a frozen steed.
function maybewakesteed(steed) {
    let frozen = steed.mfrozen;
    const wasimmobile = helpless(steed);

    steed.msleeping = 0;
    if (frozen) {
        frozen = Math.trunc((frozen + 1) / 2); /* half */
        /* might break out of timed sleep or paralysis */
        if (!rn2(frozen)) {
            steed.mfrozen = 0;
            steed.mcanmove = 1;
        } else {
            /* didn't awake, but remaining duration is halved */
            steed.mfrozen = frozen;
        }
    }
    if (wasimmobile && !helpless(steed)) {
        // pline("%s wakes up.", Monnam(steed)) is deferred with the rest of
        // the sleeping-pet work: nothing this port admits leaves a starting
        // pet asleep or frozen, so no recorded case can check the line.
        throw new UnsupportedSteedError('maybewakesteed() waking the steed');
    }
    /* regardless of waking, terminate any meal in progress */
    finish_meating(steed);
}

// C ref: steed.c stucksteed() (876-895). Answers whether the hero's steed can
// move at all. do.c dodown() and doup() pass checkfeeding TRUE, so a steed in
// the middle of a meal stops them too.
//
// Both messages need do_name.c YMonnam(), which is unported, so each stops
// instead of printing. Neither is reachable behind the commands that admit a
// mounted hero today: steed.c maybewakesteed() clears msleeping and stops on
// any steed that was immobile when mounted, and js/const.js helpless() reads
// only msleeping and mcanmove, whose remaining writers are monster creation
// and mon.c. meating has two writers, js/dog.js and js/dogmove.js, and both
// clear it.
export function stucksteed(checkfeeding, state = game) {
    const steed = state.u?.usteed;

    if (steed) {
        if (helpless(steed)) {
            throw new UnsupportedSteedError(
                "stucksteed() reporting a steed that won't move",
            );
        }
        if (checkfeeding && steed.meating) {
            throw new UnsupportedSteedError(
                'stucksteed() reporting a steed that is still eating',
            );
        }
    }
    return false;
}

// C ref: steed.c doride() (177-192), the #ride command.
//
// The `u.usteed` arm dismounts through dismount_steed(DISMOUNT_BYCHOICE) and
// then falls out of the if/else to `return ECMD_TIME`, so a dismount always
// costs the hero a turn even when the saddle is cursed or there is nowhere to
// stand and dismount_steed() returned without releasing the steed.
//
// The `wizard && y_n(...)` question sits between getdir() and mount_steed().
// A hero who is not in debug mode skips it and reaches mount_steed() with
// forcemount FALSE. A debug-mode hero stops inside y_n() instead, because the
// port's tty_yn_function() covers only the arm that accepts any single
// keystroke.
export async function doride(state = game) {
    const u = state.u;
    let forcemount = false;

    if (u.usteed) {
        await dismount_steed(DISMOUNT_BYCHOICE, state);
    } else if (await getdir(null, state)
               && isok(u.ux + u.dx, u.uy + u.dy)) {
        // yn_function() answers the raw keystroke byte, as C's char return
        // does, so the comparison is against 'y'.charCodeAt(0) rather than a
        // one-character string.
        if (state.wizard
            && await y_n('Force the mount to succeed?', state)
                === 'y'.charCodeAt(0))
            forcemount = true;
        return await mount_steed(
            m_at(u.ux + u.dx, u.uy + u.dy, state), forcemount, state,
        ) ? ECMD_TIME : ECMD_OK;
    } else {
        return ECMD_CANCEL;
    }
    return ECMD_TIME;
}

// landing_spot() and maybewakesteed() are staticfn in steed.c and have no
// caller outside dismount_steed() and mount_steed(). They are exported here
// for the tests that pin their branch structure, which the two live callers
// reach only through one reason and one steed state each.
export const _steedInternals = Object.freeze({
    landing_spot,
    maybewakesteed,
});
