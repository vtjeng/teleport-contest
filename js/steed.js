// steed.js -- Riding a saddled monster.
// C ref: steed.c -- rider_cant_reach(), can_saddle(), use_saddle(), put_saddle_on_mon(),
// can_ride(), mount_steed(), exercise_steed(), kick_steed(),
// landing_spot(), dismount_steed(), maybewakesteed(), stucksteed() and
// doride().

import {
    A_CHA,
    A_DEX,
    A_WIS,
    ARTICLE_A,
    ARTICLE_YOUR,
    BLINDED,
    BOTH_SIDES,
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
    KILLED_BY_AN,
    LEG,
    LEVITATION,
    MAXULEV,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    N_DIRS,
    NO_TRAP_FLAGS,
    NO_KILLER_PREFIX,
    P_RIDING,
    P_BASIC,
    P_EXPERT,
    P_ISRESTRICTED,
    P_SKILLED,
    P_UNSKILLED,
    SLT_ENCUMBER,
    STEALTH,
    STONE_RES,
    STUNNED,
    SUPPRESS_HALLUCINATION,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    SUPPRESS_SADDLE,
    TELEDS_ALLOW_DRAG,
    TELEPAT,
    TEST_MOVE,
    RLOC_ERR,
    RLOC_NOMSG,
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
} from './const.js';
import {
    is_pool,
    is_lava,
} from './dbridge.js';
import { isok } from './cmd_isok.js';
import { dirtocoord, getdir, xytodir, y_n } from './cmd.js';
import { newsym } from './display.js';
import { surface } from './dungeon.js';
import { m_unleash } from './apply.js';
import { heal_legs, legs_in_no_shape, set_wounded_legs } from './do.js';
import { finish_meating } from './dogmove.js';
import {
    Monnam,
    a_monnam,
    YMonnam,
    hliquid,
    monsterCommonName,
    mon_nam,
    monverbself,
    pmname,
    x_monnam,
    y_monnam,
} from './do_name.js';
import { canseemon } from './display.js';
import { game } from './gstate.js';
import {
    losehp,
    near_capacity,
    NODIAG,
    test_move,
    u_locomotion,
} from './hack.js';
import { dist2, upstart } from './hacklib.js';
import {
    bigmonst,
    gender,
    humanoid,
    mhe,
    is_flyer,
    is_floater,
    grounded,
    is_swimmer,
    amphibious,
    breathless,
    slithy,
    throws_rocks,
    likes_lava,
    touch_petrifies,
    poly_when_stoned,
    verysmall,
} from './mondata.js';
import { accessible } from './monmove.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import {
    AD_PHYS,
    PM_BAT,
    M1_AMORPHOUS,
    M1_HUMANOID,
    M1_UNSOLID,
    MZ_MEDIUM,
    PM_AIR_ELEMENTAL,
    PM_AMOROUS_DEMON,
    PM_KNIGHT,
    PM_LONG_WORM,
    PM_STONE_GOLEM,
    S_ANGEL,
    S_CENTAUR,
    S_DRAGON,
    S_GHOST,
    S_JABBERWOCK,
    S_QUADRUPED,
    S_UNICORN,
    S_VORTEX,
} from './monsters.js';
import { killed, monkilled } from './mon.js';
import { acurr, adjalign } from './attrib.js';
import { greatest_erosion, isMetallic, mksobj } from './obj.js';
import { BOULDER, SADDLE } from './objects.js';
import { an } from './objnam.js';
import { encumber_msg, u_handsy } from './pickup.js';
import { body_part, polymon, steed_vs_stealth } from './polyself.js';
import { d, rn1, rn2, rnd, rne, rnl, rnz } from './rng.js';
import { enexto, rloc, rloc_to, teleds } from './teleport.js';
import {
    float_down,
    instapetrify,
    sokoban_guilt,
    t_at,
    trapname,
} from './trap.js';
import { mintrap } from './trap_effects.js';
import { ttyPline } from './tty_message.js';
import { use_skill } from './weapon.js';
import {
    is_pole,
    update_mon_extrinsics,
    which_armor,
} from './worn.js';
import { freeinv, fully_identify_obj, sobj_at } from './invent.js';

import { mpickobj, remove_worn_item } from './steal.js';
import { objdescr_is } from './o_init.js';
import { P_SKILL } from './startup_skills.js';
import { exercise } from './attrib.js';
import { note_unported } from './unported.js';
import { canspotmon } from './display.js';

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

function saddleEnv(env = {}) {
    return {
        ...env,
        random: env.random ?? { d, rn1, rn2, rnd, rne, rnz },
        state: env.state ?? game,
    };
}

// C ref: steed.c rider_cant_reach() (17-20). Its caller has decided
// that the mounted hero cannot reach; naming retains the ordinary owner.
export async function rider_cant_reach(state = game, env = {}) {
    await (env.message ?? ttyPline)(
        `You aren't skilled enough to reach from ${y_monnam(state.u.usteed, state, env)}.`,
        state,
    );
}

const SADDLEABLE_CLASSES = new Set([
    S_QUADRUPED,
    S_UNICORN,
    S_ANGEL,
    S_CENTAUR,
    S_DRAGON,
    S_JABBERWOCK,
]);

// C ref: steed.c can_saddle() (18-34). dog.js re-exports this binding for
// its existing command and special-level callers.
export function can_saddle(monster) {
    const species = monster?.data;
    if (!species || !SADDLEABLE_CLASSES.has(species.mlet)) return false;
    const flags = species.mflags1 ?? 0;
    return species.msize >= MZ_MEDIUM
        && (!(flags & M1_HUMANOID) || species.mlet === S_CENTAUR)
        && !(flags & M1_AMORPHOUS)
        && species.mlet !== S_GHOST
        && species.mlet !== S_VORTEX
        && species.pmidx !== PM_AIR_ELEMENTAL
        && !(flags & M1_UNSOLID);
}

// C ref: steed.c put_saddle_on_mon() (141-165). dog.c:makedog() calls this
// before initedog(); special-level construction can supply a prebuilt saddle.
export function put_saddle_on_mon(saddle, monster, env = {}) {
    const normalized = saddleEnv(env);
    if (!can_saddle(monster)) {
        if (saddle && typeof normalized.hooks?.impossible === 'function') {
            normalized.hooks.impossible(
                'put_saddle_on_mon: saddle obj could get orphaned',
                normalized,
            );
        }
        return null;
    }
    for (let object = monster.minvent; object; object = object.nobj) {
        if (object.owornmask & W_SADDLE) {
            if (saddle && typeof normalized.hooks?.impossible === 'function') {
                normalized.hooks.impossible(
                    'put_saddle_on_mon: saddle obj could get orphaned',
                    normalized,
                );
            }
            return null;
        }
    }
    if (!saddle) {
        saddle = mksobj(SADDLE, true, false, normalized);
        if (!saddle) return null;
        fully_identify_obj(saddle, normalized.state);
    }
    if (mpickobj(monster, saddle, {
        ...normalized,
        // steal.c:mpickobj uses current canseemon even before initedog.
        // Special-level construction can supply its existing sight adapter.
        canSeeMonster: (subject) => typeof normalized.canseemon === 'function'
            ? Boolean(normalized.canseemon(subject, normalized))
            : canseemon(subject, normalized.state),
    }))
        throw new Error('put_saddle_on_mon: merged saddle');
    monster.misc_worn_check |= W_SADDLE;
    saddle.owornmask = W_SADDLE;
    saddle.leashmon = monster.m_id;
    // steed.c passes silently=FALSE although a saddle has no extrinsic.
    update_mon_extrinsics(monster, saddle, true, {
        ...normalized,
        state: normalized.state,
        silent: false,
    });
    return saddle;
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

// C ref: steed.c poly_steed() (852-877). newcham() calls this after the
// changed steed has completed mon_break_armor().
export async function poly_steed(steed, oldshape, state = game, rawEnv = {}) {
    const env = { ...rawEnv, state };
    if (!can_saddle(steed) || !can_ride(steed, state)) {
        await dismount_steed(DISMOUNT_FELL, state, env);
        return;
    }

    let name = x_monnam(
        steed, ARTICLE_YOUR, null, SUPPRESS_SADDLE, false, state, env,
    );
    if (oldshape !== steed.data)
        name = name.replace('your ', 'your new ');
    await (env.message ?? ttyPline)(
        `You adjust yourself in the saddle on ${name}.`, state,
    );
    steed_vs_stealth(state);
}

// C ref: steed.c use_saddle() (36-139). doapply() consumes ECMD_CANCEL,
// ECMD_OK or ECMD_TIME, so preserve the direction prompts, chance roll, and
// monster-inventory transfer in the order shown in that source function.
export async function use_saddle(otmp, state = game, env = {}) {
    if (!(await u_handsy(state)))
        return ECMD_OK;

    // Select an animal. These guards short-circuit before getdir() in C.
    if (state.u?.uswallow || state.u?.uinwater || !(await getdir(null, state))) {
        await ttyPline('Never mind.', state);
        return ECMD_CANCEL;
    }
    if (!state.u.dx && !state.u.dy) {
        await ttyPline('Saddle yourself?  Very funny...', state);
        return ECMD_OK;
    }

    const x = state.u.ux + state.u.dx;
    const y = state.u.uy + state.u.dy;
    const mtmp = isok(x, y) ? m_at(x, y, state) : null;
    if (!mtmp || !canspotmon(mtmp, state)) {
        await ttyPline('I see nobody there.', state);
        return ECMD_TIME;
    }

    if ((mtmp.misc_worn_check & W_SADDLE) || which_armor(mtmp, W_SADDLE, state)) {
        await ttyPline(`${Monnam(mtmp, state)} doesn't need another one.`, state);
        return ECMD_TIME;
    }

    const species = mtmp.data;
    if (touch_petrifies(species) && !state.uarmg
        && !propertyActive(state, STONE_RES)) {
        await ttyPline(`You touch ${mon_nam(mtmp, state)}.`, state);
        if (!(poly_when_stoned(state.youmonst.data, state)
            && await polymon(PM_STONE_GOLEM, state))) {
            const killer = `attempting to saddle ${an(pmname(mtmp.data, gender(mtmp)))}`;
            await instapetrify(killer, state, env);
        }
    }

    if (species?.pmidx === PM_AMOROUS_DEMON) {
        await ttyPline('Shame on you!', state);
        await exercise(A_WIS, false, state);
        return ECMD_TIME;
    }
    if (mtmp.isminion || mtmp.isshk || mtmp.ispriest || mtmp.isgd || mtmp.iswiz) {
        await ttyPline(`I think ${mon_nam(mtmp, state)} would mind.`, state);
        return ECMD_TIME;
    }
    if (!can_saddle(mtmp)) {
        await ttyPline("You can't saddle such a creature.", state);
        return ECMD_TIME;
    }

    let chance = acurr(state, A_DEX)
        + Math.trunc(acurr(state, A_CHA) / 2)
        + 2 * (mtmp.mtame ?? 0);
    chance += (state.u.ulevel ?? 0) * (mtmp.mtame ? 20 : 5);
    if (!mtmp.mtame)
        chance -= 10 * (mtmp.m_lev ?? 0);
    if (state.urole?.mnum === PM_KNIGHT)
        chance += 20;
    switch (P_SKILL(P_RIDING, state)) {
    case P_BASIC:
        break;
    case P_SKILLED:
        chance += 15;
        break;
    case P_EXPERT:
        chance += 30;
        break;
    case P_ISRESTRICTED:
    case P_UNSKILLED:
    default:
        chance -= 20;
        break;
    }
    if (propertyActive(state, CONFUSION)
        || propertyActive(state, FUMBLING)
        || propertyIntrinsic(state, GLIB)) {
        chance -= 20;
    } else if (state.uarmg && objdescr_is(state.uarmg, 'riding gloves', state)) {
        chance += 10;
    } else if (state.uarmf && objdescr_is(state.uarmf, 'riding boots', state)) {
        chance += 10;
    }
    if (otmp.cursed)
        chance -= 50;

    await maybewakesteed(mtmp, state);

    if (rn2(100) < chance) {
        await ttyPline(`You put the saddle on ${mon_nam(mtmp, state)}.`, state);
        if (otmp.owornmask)
            await remove_worn_item(otmp, false, state, env);
        freeinv(otmp, { ...env, state });
        put_saddle_on_mon(otmp, mtmp, { ...env, state });
    } else {
        await ttyPline(`${Monnam(mtmp, state)} resists!`, state);
    }
    return ECMD_TIME;
}

// C ref: steed.c mount_steed() (197-386). Eligibility, refusal, impairment
// and successful mounting follow source order, including debug force-healing.
export async function mount_steed(mtmp, force, state = game) {
    const u = state.u;

    /* Sanity checks */
    if (u.usteed) {
        await ttyPline(
            `You are already riding ${mon_nam(u.usteed, state)}.`,
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
        await legs_in_no_shape('riding', false, state);
        // C intentionally derives the prompt plural from HWounded_legs,
        // the intrinsic timeout, rather than the extrinsic side bits.
        const plural = ((u.uprops[WOUNDED_LEGS].intrinsic & BOTH_SIDES)
            === BOTH_SIDES) ? 's' : '';
        if (force && state.wizard
            && await y_n(`Heal your leg${plural}?`, state) === 'y'.charCodeAt(0)) {
            await heal_legs(state);
        } else {
            return false;
        }
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
        await ttyPline(
            `You couldn't ride ${a_monnam(mtmp, { state })}, let alone its tail.`,
            state,
        );
        return false;
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
    const otmp = which_armor(mtmp, W_SADDLE, state);
    if (!otmp) {
        await ttyPline(
            `${Monnam(mtmp, state)} is not saddled.`, state,
        );
        return false;
    }

    const ptr = mtmp.data;
    if (touch_petrifies(ptr) && !propertyActive(state, STONE_RES)) {
        await ttyPline(`You touch ${mon_nam(mtmp, state)}.`, state);
        // trap.c:instapetrify is a void callee; its death/poly effect is unported.
        note_unported('trap.c instapetrify');
    }
    if (!mtmp.mtame || mtmp.isminion) {
        await ttyPline(
            `I think ${mon_nam(mtmp, state)} would mind.`, state,
        );
        return false;
    }
    if (mtmp.mtrapped) {
        const trap = t_at(mtmp.mx, mtmp.my, state);
        await ttyPline(
            `You can't mount ${mon_nam(mtmp, state)} while `
                + `${mhe(mtmp, { state, canSpotMonster: canspotmon })}'s trapped in `
                + `${an(trapname(trap.ttyp, false, state))}.`,
            state,
        );
        return false;
    }

    if (!force && state.urole?.mnum !== PM_KNIGHT && !(--mtmp.mtame)) {
        /* no longer tame */
        newsym(mtmp.mx, mtmp.my, state);
        await ttyPline(
            `${Monnam(mtmp, state)} resists`
            + `${mtmp.mleashed ? ' and its leash comes off' : ''}!`,
            state,
        );
        if (mtmp.mleashed) m_unleash(mtmp, false, { state });
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
            `You cannot reach ${mon_nam(mtmp, state)}.`, state,
        );
        return false;
    }
    if (!force && state.uarm && isMetallic(state.uarm, state)
        && greatest_erosion(state.uarm)) {
        await ttyPline(
            `Your ${state.uarm.oeroded ? 'rusty' : 'corroded'} armor is too `
            + `stiff to be able to mount ${mon_nam(mtmp, state)}.`,
            state,
        );
        return false;
    }
    // The disjunction short-circuits, so the rnd(MAXULEV / 2 + 5) call is made
    // only when every impairment ahead of it is absent. Wounded_legs cannot
    // reach this line: the guard above returns for it whenever `force` is
    // FALSE. A forced debug mount bypasses this entire impairment disjunction.
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
                `${Monnam(mtmp, state)} slips away from you.`,
                state,
            );
            return false;
        }
        await ttyPline(
            `You slip while trying to get on ${mon_nam(mtmp, state)}`
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
    await maybewakesteed(mtmp, state);
    if (!force) {
        if (Levitation(state) && !is_floater(ptr) && !is_flyer(ptr)) {
            /* Must have Lev_at_will at this point: the guard above rejects
               every other levitating hero. */
            await ttyPline(
                `${Monnam(mtmp, state)} magically floats up!`,
                state,
            );
        }
        await ttyPline(`You mount ${mon_nam(mtmp, state)}.`, state);
        if (Flying(state)) {
            await ttyPline(
                `You and ${mon_nam(mtmp, state)} take flight `
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
// give_may_advance_msg() arm is 6000 mounted steps away, and needs a spare
// weapon slot as well.
export async function exercise_steed(state = game) {
    const u = state.u;

    if (!u.usteed)
        return;

    /* It takes many turns of riding to exercise skill */
    if (++u.urideturns >= 100) {
        u.urideturns = 0;
        await use_skill(P_RIDING, 1, state);
    }
}

// C ref: steed.c:kick_steed (402-450). Both the kick command and a
// downward bullwhip stroke reach this owner after printing their hit message.
export async function kick_steed(state = game) {
    const u = state.u;
    const steed = u.usteed;
    if (!steed) return;
    if (helpless(steed)) {
        const He = upstart(mhe(steed, { state, canSpotMonster: canspotmon }));
        if ((steed.mcanmove || steed.mfrozen) && !rn2(2)) {
            if (steed.mcanmove)
                steed.msleeping = 0;
            else if (steed.mfrozen > 2)
                steed.mfrozen -= 2;
            else {
                steed.mfrozen = 0;
                steed.mcanmove = 1;
            }
            await ttyPline(helpless(steed) ? `${He} stirs.`
                : `${monverbself(steed, He, 'rouse', null, state,
                    { canSpotMonster: canspotmon })}!`, state);
        } else {
            await ttyPline(`${He} does not respond.`, state);
        }
        return;
    }
    if (steed.mtame) --steed.mtame;
    if (!steed.mtame && steed.mleashed)
        await m_unleash(steed, true, { state });
    if (!steed.mtame || u.ulevel + steed.mtame < rnd(MAXULEV / 2 + 5)) {
        newsym(steed.mx, steed.my, state);
        await dismount_steed(DISMOUNT_THROWN, state);
        return;
    }
    await ttyPline(`${Monnam(steed, state)} gallops!`, state);
    u.ugallop += rn1(20, 30);
}

// C ref: steed.c landing_spot() (459-566). Chooses a square beside the hero
// for a dismount, and returns null when there is none. C fills a caller-owned
// coord and returns a boolean; a nullable coordinate says the same thing
// without letting a caller read a stale spot.
//
// `rn2(2)` orders the two secondary directions for DISMOUNT_KNOCKED;
// `rn2(viable)` breaks ties between equally distant candidates; and enexto()
// behind `forceit` searches farther away if the adjacent squares fail.
async function landing_spot(reason, forceit, state = game, random = { rn2 }) {
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
        best_j = j;
        tries[0] = { x: u.dx, y: u.dy };
        const i = random.rn2(2);
        clockwise_j = (j + 1) % N_DIRS;
        tries[1 + i] = dirtocoord(clockwise_j);
        counterclk_j = (j + N_DIRS - 1) % N_DIRS;
        tries[2 - i] = dirtocoord(counterclk_j);
    } else {
        best_j = clockwise_j = counterclk_j = -1;
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
                    || (distance === min_distance && !random.rn2(viable))) {
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
        const fallback = enexto(u.ux, u.uy, state.youmonst.data, {
            state,
            random,
        });
        if (fallback) {
            spot.x = fallback.x;
            spot.y = fallback.y;
            found = true;
        }
    }
    return found ? spot : null;
}

// C ref: steed.c dismount_steed() (575-826). All reasons share the release,
// placement, and landing sequence except for the explicit bones and engulfer
// branches.
export async function dismount_steed(reason, state = game, rawEnv = {}) {
    const u = state.u;
    const random = {
        d, rn1, rn2, rnd, rne, rnl, rnz,
        ...(rawEnv.random ?? {}),
    };
    const positionEnv = { ...rawEnv, state, random };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('dismount_steed random injection requires rn2');
    const save_utrap = u.utrap;
    let repair_leg_damage = propertyActive(state, WOUNDED_LEGS);
    // The initializers run before the `!u.usteed` sanity check, so
    // landing_spot() reads a hero who is still mounted.
    let have_spot = await landing_spot(reason, 0, state, random);

    const mtmp = u.usteed; /* make a copy of steed pointer */
    /* Sanity check */
    if (!mtmp) return; /* Just return silently */
    // C ref: steed.c:591-597. Clear the steed while querying the hero's own
    // flight, levitation, and fall verb; restore it before the reason switch.
    u.usteed = null;
    const ufly = Flying(state);
    const ulev = Levitation(state);
    let verb = u_locomotion('fall', state);
    u.usteed = mtmp;

    /* Check the reason for dismounting */
    const otmp = which_armor(mtmp, W_SADDLE);
    switch (reason) {
    case DISMOUNT_THROWN:
        verb = 'are thrown';
        // FALLTHROUGH: C steed.c:602-613 shares the fall landing and injury.
    case DISMOUNT_KNOCKED:
    case DISMOUNT_FELL:
        // uhitm.c:mhitm_knockback() supplies the preferred direction. The
        // source requests a farther landing square only when adjacent squares
        // have no usable candidate.
        await ttyPline(
            `You ${verb} off of ${mon_nam(mtmp, state)}!`, state,
        );
        if (!have_spot)
            have_spot = await landing_spot(reason, 1, state, random);
        if (!ulev && !ufly) {
            await losehp(
                Maybe_Half_Phys(rn1(10, 10), state),
                'riding accident', KILLED_BY_AN, state,
            );
            const wounded = state.u.uprops[WOUNDED_LEGS].intrinsic & TIMEOUT;
            await set_wounded_legs(
                BOTH_SIDES, wounded + rn1(5, 5), state,
            );
            repair_leg_damage = false;
        }
        break;
    case DISMOUNT_POLY:
        // C steed.c:618-621, reached after a polymorph changes the hero's
        // form and can_ride() rejects the current mount.
        await ttyPline(
            `You can no longer ride ${mon_nam(u.usteed, state)}.`, state,
        );
        if (!have_spot)
            have_spot = await landing_spot(reason, 1, state, random);
        break;
    case DISMOUNT_ENGULFED:
        // mhitu.c has placed the engulfer on the hero's square and printed
        // the plucking message. C releases the mount without a second line.
        break;
    case DISMOUNT_BONES:
        // bones.c calls after the hero dies; the common release path moves
        // the steed aside without returning the hero to the surface.
        break;
    case DISMOUNT_GENERIC:
        // dog.c, mon.c and trap.c use it to end the ride without a message,
        // each after the steed has left the level or died.
        break;
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
    // C steed.c:655 heals the steed before releasing u.usteed; mode 1
    // suppresses encumbrance feedback until the subsequent landing.
    if (repair_leg_damage)
        await heal_legs(state, { how: 1, message: ttyPline });

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
        // C steed.c:693-700. An engulfer occupies the former mounted square;
        // place the released steed nearby, trying its own species before the
        // bat and ghost fallbacks.
        const nearbySteed = enexto(u.ux, u.uy, mtmp.data, positionEnv)
            ?? enexto(u.ux, u.uy, state.mons[PM_BAT], positionEnv)
            ?? enexto(u.ux, u.uy, state.mons[PM_GHOST], positionEnv);
        if (nearbySteed) {
            steedcc.x = nearbySteed.x;
            steedcc.y = nearbySteed.y;
        }
    }

    if (!(mtmp.mhp < 1)) { /* !DEADMONSTER(mtmp) */
        // C spells this field with ++/-- here and with TRUE/FALSE below;
        // both produce 1 and 0 on its boolean field.
        state.in_steed_dismounting = (state.in_steed_dismounting ?? 0) + 1;
        place_monster(mtmp, steedcc.x, steedcc.y, state);
        state.in_steed_dismounting -= 1;

        // C steed.c:717-726 does not move the dead hero during bones handling;
        // it moves the steed aside to make room for the bones ghost.
        if (reason === DISMOUNT_BONES) {
            const nearbySteed = enexto(u.ux, u.uy, mtmp.data, positionEnv);
            if (nearbySteed)
                await rloc_to(mtmp, nearbySteed.x, nearbySteed.y, positionEnv);
            else
                await rloc(mtmp, RLOC_ERR | RLOC_NOMSG, positionEnv);
            return;
        }

        /* Set hero's and/or steed's positions. */
        if (!u.uswallow && !u.ustuck && have_spot) {
            const mdat = mtmp.data;

            /* The steed may drop into water/lava */
            if (grounded(mdat, state)) {
                if (is_pool(u.ux, u.uy, state)) {
                    if (!u.uinwater)
                        await ttyPline(
                            `${Monnam(mtmp, state)} falls into the `
                            + `${surface(u.ux, u.uy, state)}!`, state,
                        );
                    if (!(is_swimmer(mdat) || amphibious(mdat)
                        || breathless(mdat))) {
                        await killed(mtmp, state, positionEnv);
                        adjalign(-1, state);
                    }
                } else if (is_lava(u.ux, u.uy, state)) {
                    await ttyPline(
                        `${Monnam(mtmp, state)} is pulled into the `
                        + `${hliquid('lava', { state })}!`, state,
                    );
                    if (!likes_lava(mdat)) {
                        await killed(mtmp, state, positionEnv);
                        adjalign(-1, state);
                    }
                }
            }
            /* Keep steed here, move the player to the landing spot;
             * teleds() clears u.utrap.
             */
            // C steed.c checks DEADMONSTER again after the liquid can kill
            // the mount. A dead mount leaves the hero here for float_down().
            if (!(mtmp.mhp < 1)) {
                state.in_steed_dismounting = 1;
                await teleds(
                    have_spot.x, have_spot.y, TELEDS_ALLOW_DRAG, state,
                    { redraw: newsym },
                );
                if (sobj_at(BOULDER, have_spot.x, have_spot.y, state))
                    sokoban_guilt(state);
                state.in_steed_dismounting = 0;

                /* Put your steed in your trap */
                if (save_utrap)
                    await mintrap(mtmp, NO_TRAP_FLAGS, positionEnv);
            }
        } else {
            // C steed.c:777-793 leaves the hero in place and removes a steed
            // that has no adjacent destination after an engulfed dismount.
            const nearbySteed = enexto(u.ux, u.uy, mtmp.data, positionEnv);
            if (nearbySteed) {
                await rloc_to(mtmp, nearbySteed.x, nearbySteed.y, positionEnv);
            } else if (reason === DISMOUNT_BYCHOICE) {
                await killed(mtmp, state, positionEnv);
                adjalign(-1, state);
            } else {
                await monkilled(mtmp, '', -AD_PHYS, state, positionEnv);
            }
        }
    } /* !DEADMONSTER(mtmp) */

    /* usually return the hero to the surface */
    if (reason !== DISMOUNT_ENGULFED && reason !== DISMOUNT_BONES) {
        state.in_steed_dismounting = 1;
        await float_down(0, W_SADDLE, state);
        state.in_steed_dismounting = 0;
        state.disp ??= {};
        state.disp.botl = true;
        await encumber_msg(state);
        state.vision_full_recalc = 1;
    } else {
        state.disp ??= {};
        state.disp.botl = true;
    }
    /* polearms behave differently when not mounted */
    if (state.uwep && is_pole(state.uwep, state))
        state.unweapon = true;
}

// C ref: steed.c maybewakesteed() (825-848). Wakes a sleeping or frozen steed
// when the hero saddles or mounts it. The rn2(frozen) draw is the only random
// number the success path can make, and it fires only for a frozen steed.
async function maybewakesteed(steed, state = game) {
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
    if (wasimmobile && !helpless(steed))
        await ttyPline(`${Monnam(steed, state)} wakes up.`, state);
    /* regardless of waking, terminate any meal in progress */
    finish_meating(steed);
}

// C ref: steed.c stucksteed() (876-895). Answers whether the hero's steed can
// move at all. do.c dodown() and doup() pass checkfeeding TRUE, so a steed in
// the middle of a meal stops them too.
//
// The reports use the existing do_name.c YMonnam() port.
// The async wrapper sends C's pline() calls through ttyPline(); all callers
// await it.
export async function stucksteed(checkfeeding, state = game) {
    const steed = state.u?.usteed;

    if (steed) {
        if (helpless(steed)) {
            await ttyPline(`${YMonnam(steed, state)} won't move!`, state);
            return true;
        }
        if (checkfeeding && steed.meating) {
            await ttyPline(`${YMonnam(steed, state)} is still eating.`, state);
            return true;
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
// A normal hero reaches mount_steed() with forcemount FALSE; a debug hero's
// accepted response selects the force flag and is recorded for #repeat.
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
