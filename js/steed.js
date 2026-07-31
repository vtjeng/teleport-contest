// steed.js -- Riding a saddled monster.
// C ref: steed.c.

import {
    ARTICLE_A,
    BLINDED,
    CONFUSION,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FUMBLING,
    GLIB,
    HALF_PHDAM,
    HALLUC,
    HALLUC_RES,
    LEG,
    LEVITATION,
    MAXULEV,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    NO_KILLER_PREFIX,
    SLT_ENCUMBER,
    STONE_RES,
    SUPPRESS_HALLUCINATION,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    TELEPAT,
    TEST_MOVE,
    WOUNDED_LEGS,
    W_ARTI,
    W_SADDLE,
    I_SPECIAL,
    TIMEOUT,
    isok,
} from './const.js';
import { getdir, y_n } from './cmd.js';
import { newsym } from './display.js';
import {
    capitalizedMonsterName,
    hliquid,
    monsterCommonName,
    x_monnam,
} from './do_name.js';
import { can_saddle } from './dog.js';
import { game } from './gstate.js';
import { losehp, near_capacity, test_move } from './hack.js';
import {
    bigmonst,
    humanoid,
    is_flyer,
    is_floater,
    is_swimmer,
    slithy,
    touch_petrifies,
    verysmall,
} from './mondata.js';
import { m_at } from './monst.js';
import { PM_KNIGHT, PM_LONG_WORM } from './monsters.js';
import { greatest_erosion, isMetallic } from './obj.js';
import { body_part } from './polyself.js';
import { rn1, rnd } from './rng.js';
import { ttyPline } from './tty_message.js';
import { which_armor } from './weapon.js';

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

// you.h:307 Upolyd().
function Upolyd(state) {
    return state.u.umonnum !== state.u.umonster;
}

// youprop.h:77. The punishing ball is the whole test.
function Punished(state) {
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

// C ref: steed.c mount_steed() (193-383). Every guard down to the impairment
// roll is ported, along with the roll and the slip that a failed roll causes.
// Six arms stop instead of running, each named at its site; the success path
// from 358 belongs to the next slice.
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
        // below it is debug-mode only. Nothing in this port sets
        // uprops[WOUNDED_LEGS]: trap.c and uhitm.c own every set_wounded_legs()
        // call and neither is ported.
        throw new UnsupportedSteedError('mount_steed() with wounded legs');
    }

    if (Upolyd(state)) {
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
        // this milestone covers. The arm is unreachable as well: guard 9 above
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
    throw new UnsupportedSteedError('the successful mount at steed.c:358');
}

// C ref: steed.c doride() (176-192), the #ride command. The direction prompt
// and the isok() test are ported; the two things that can follow them are not.
//
// The `u.usteed` arm dismounts through dismount_steed(DISMOUNT_BYCHOICE) and
// then falls out of the if/else to `return ECMD_TIME`. No line of this port
// writes u.usteed, so a hero cannot be mounted and that arm is unreachable
// rather than merely refused.
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
        throw new UnsupportedSteedError('dismount_steed(DISMOUNT_BYCHOICE)');
    }
    if (await getdir(null, state) && isok(u.ux + u.dx, u.uy + u.dy)) {
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
    }
    return ECMD_CANCEL;
}
