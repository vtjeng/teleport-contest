// apply.js -- the `a` command: using a tool.
// C refs: src/apply.c apply_ok(), doapply(), use_stethoscope(), its_dead(),
// and reset_trapset().
//
// doapply()'s switch has thirty-odd arms. Two are live: STETHOSCOPE, and the
// LOCK_PICK/CREDIT_CARD/SKELETON_KEY arm that lock.c pick_lock() serves. Every
// other arm, and the wand, spellbook and coin shortcuts above the switch,
// stops at a refusal naming the C function it needs. use_stethoscope() covers
// its three guards, the free-action rule, the self-probe that confdir() leads
// to, and the adjacent square that holds nothing to report; the mounted,
// swallowed, vertical and cursed arms stop, as do the monster, secret-terrain
// and dead-thing arms of the adjacent square.

import {
    DEAF,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    HALLUC,
    HALLUC_RES,
    HAND,
    isok,
    SCORR,
    SDOOR,
} from './const.js';
import { confdir, getdir } from './cmd.js';
import { unmap_invisible } from './display.js';
import { can_reach_floor, freehand } from './engrave.js';
import { game } from './gstate.js';
import { check_capacity } from './hack.js';
import { ustatusline } from './insight.js';
import { getobj } from './invent.js';
import { pick_lock } from './lock.js';
import { nohands } from './mondata.js';
import { m_at } from './monst.js';
import { is_axe, is_graystone, is_pick, objectType, sobj_at } from './obj.js';
import {
    BANANA,
    BULLWHIP,
    COIN_CLASS,
    CORPSE,
    CREAM_PIE,
    CREDIT_CARD,
    EUCALYPTUS_LEAF,
    LOCK_PICK,
    LUMP_OF_ROYAL_JELLY,
    POT_OIL,
    POTION_CLASS,
    SKELETON_KEY,
    SPBOOK_CLASS,
    STATUE,
    STETHOSCOPE,
    TOOL_CLASS,
    TOUCHSTONE,
    WAND_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import { body_part } from './polyself.js';
import { ttyPline } from './tty_message.js';
import { is_pole } from './worn.js';

// Thrown where apply.c reaches a tool or a branch this port has not ported.
export class UnsupportedApplyError extends Error {
    constructor(branch) {
        super(`applying a tool requires ${branch}`);
        this.name = 'UnsupportedApplyError';
        this.branch = branch;
    }
}

// C ref: youprop.h:120 Hallucination, which is the intrinsic timeout alone
// minus resistance from either source.
function heroHallucinating(state) {
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    if (!hallucination || !resistance)
        throw new Error('Hallucination requires initialized u.uprops');
    return Boolean(hallucination.intrinsic
        && !(resistance.intrinsic || resistance.extrinsic));
}

// C ref: youprop.h:125 Deaf, which adds the permanent-deafness roleplay
// option to the intrinsic and the extrinsic.
function heroDeaf(state) {
    const deafness = state.u?.uprops?.[DEAF] ?? {};
    return Boolean(deafness.intrinsic || deafness.extrinsic
        || state.u?.uroleplay?.deaf);
}

// C ref: apply.c reset_trapset() (2812-2817), the third of the three clears
// cmd.c reset_occupations() makes.
//
// gt.trapinfo is the trap the hero is arming, carried across the set_trap()
// occupation that use_trap() starts. C's struct holds tx, ty and time_needed
// as well; only the two fields this function clears exist here, and this is
// the only function in the port that reads or writes either, because use_trap()
// and set_trap() are unported. The pair is therefore always already at its
// reset value; the function exists so that reset_occupations() clears
// everything C clears rather than two thirds of it.
export function reset_trapset(state = game) {
    state.gt ??= {};
    state.gt.trapinfo = { tobj: null, force_bungle: false };
}

// C ref: apply.c apply_ok() (4149-4210), the getobj() callback for the `a`
// command. It is longer than most because there are many appliable things.
export function apply_ok(obj, state = game) {
    if (!obj)
        return GETOBJ_EXCLUDE;

    /* all tools, all wands (breaking), all spellbooks (flipping through -
       including blank/novel/Book of the Dead) */
    if (obj.oclass === TOOL_CLASS || obj.oclass === WAND_CLASS
        || obj.oclass === SPBOOK_CLASS)
        return GETOBJ_SUGGEST;

    /* applying coins to flip them is a minor easter egg, so do not suggest
       coin application to the player */
    if (obj.oclass === COIN_CLASS)
        return GETOBJ_DOWNPLAY;

    /* certain weapons */
    if (obj.oclass === WEAPON_CLASS
        && (is_pick(obj, state) || is_axe(obj, state) || is_pole(obj, state)
            || obj.otyp === BULLWHIP))
        return GETOBJ_SUGGEST;

    if (obj.oclass === POTION_CLASS) {
        /* permit applying unknown potions, but don't suggest them */
        if (!obj.dknown || !objectType(obj, state).oc_name_known)
            return GETOBJ_DOWNPLAY;

        /* only applicable potion is oil, and it will only be suggested as a
           choice when already discovered */
        if (obj.otyp === POT_OIL)
            return GETOBJ_SUGGEST;
    }

    /* certain foods */
    if (obj.otyp === CREAM_PIE || obj.otyp === EUCALYPTUS_LEAF
        || obj.otyp === LUMP_OF_ROYAL_JELLY)
        return GETOBJ_SUGGEST;

    if (obj.otyp === BANANA && heroHallucinating(state))
        return GETOBJ_DOWNPLAY;

    if (is_graystone(obj)) {
        /* The only case where we don't suggest a gray stone is if we KNOW it
           isn't a touchstone. */
        if (!obj.dknown)
            return GETOBJ_SUGGEST;

        if (obj.otyp !== TOUCHSTONE
            && (objectType(TOUCHSTONE, state).oc_name_known
                || objectType(obj, state).oc_name_known))
            return GETOBJ_EXCLUDE_SELECTABLE;

        return GETOBJ_SUGGEST;
    }

    /* item can't be applied; if picked anyway,
       _EXCLUDE would yield "That is a silly thing to apply.",
       _EXCLUDE_SELECTABLE yields "Sorry, I don't know how to use that." */
    return GETOBJ_EXCLUDE_SELECTABLE;
}

// C ref: apply.c its_dead() (196-309), the floor-object half of a listen.
// C answers TRUE when it printed something and FALSE when the square holds
// neither a corpse nor a statue, which is when the caller falls through to
// "You hear nothing special."
//
// C takes `int *resp` so that its hallucination arm can charge the turn
// (apply.c:253); that is the only arm that writes through the pointer, and it
// refuses here, so the port answers a bare boolean instead.
//
// The message arms (226-307) all refuse, and 214-220 -- the uppermost-object
// tie-break and the more_corpses count -- feed nothing but those arms, so they
// are unported. What is ported is the frame: the two sobj_at() lookups, the
// out-of-reach block, and the fall-through.
function its_dead(rx, ry, state) {
    let corpse = sobj_at(CORPSE, rx, ry, state);
    const statue = sobj_at(STATUE, rx, ry, state);

    if (!can_reach_floor(true, state)) { /* levitation or unskilled riding */
        corpse = null;                   /* can't reach corpse on floor */
        // apply.c:210-211 then walks `statue` past the tiny statues an
        // out-of-reach hero cannot touch, through invent.c nxtobj(), so a
        // square holding none but tiny ones reaches the fall-through below.
        // The port refuses every statue here instead, which over-refuses
        // exactly that square: the walk needs nxtobj() and MZ_TINY, and
        // js/monsters.js exports neither, while every statue the walk would
        // leave standing refuses one test lower down anyway.
        if (statue)
            throw new UnsupportedApplyError('an out-of-reach statue');
    }
    if (corpse || statue) {
        // C's chain at 223-307 is `neither`, `Hallucination`, `corpse`,
        // `statue`, and that order is what these three keep. The corpse and
        // statue arms need glyph_at(), get_mtraits(), obj_pmname() and the
        // Healer REVIVE_MON walk; the hallucination arm sits above both and
        // would answer for either object, so it is named separately.
        if (heroHallucinating(state)) {
            throw new UnsupportedApplyError(
                'a hallucinated listen to the dead');
        }
        if (corpse) {
            throw new UnsupportedApplyError(
                'a corpse on the listened-to square');
        }
        throw new UnsupportedApplyError('a statue on the listened-to square');
    }
    return false; /* no corpse or statue */
}

// C ref: apply.c use_stethoscope() (317-470), with C's own comment above it at
// 313-316 explaining the free action: one use per turn costs nothing, so a
// second use in the same move is what makes a cursed stethoscope's wasted
// listen cost anything.
//
// Four arms between the direction prompt and confdir() stop rather than run.
// The u.usteed and the two u.uswallow arms need mstatusline(); u.dz needs
// cant_reach_floor() and the Soundeffect() interface; and the cursed arm draws
// an rn2(2) whose "You hear your heart beat." nothing has checked. Refusing
// the cursed arm on obj.cursed alone keeps that draw out of the random-number
// stream for the uncursed tools the ported path uses.
//
// Below confdir() the adjacent-square arm (384-470) runs as far as the empty
// square's answer. Its four other arms stop, each in C's own branch order, so
// a square carrying two of them stops where C would have branched.
async function use_stethoscope(obj, state = game) {
    const u = state.u;

    if (nohands(state.youmonst.data)) {
        await ttyPline('You have no hands!', state); /* not `body_part(HAND)' */
        return ECMD_OK;
    } else if (heroDeaf(state)) {
        await ttyPline("You can't hear anything!", state);
        return ECMD_OK;
    } else if (!freehand(state)) {
        await ttyPline(
            `You have no free ${body_part(HAND, state.youmonst)}.`,
            state,
        );
        return ECMD_OK;
    }
    if (!await getdir(null, state))
        return ECMD_CANCEL;

    const res = (state.hero_seq === state.context.stethoscope_seq)
        ? ECMD_TIME : ECMD_OK;
    state.context.stethoscope_seq = state.hero_seq;

    // gb.bhitpos and gn.notonhead are read only by mstatusline() for a long
    // worm, and every arm that reaches mstatusline() stops below, so the two
    // tentative assignments C makes here have no reader yet.
    if (u.usteed && u.dz > 0)
        throw new UnsupportedApplyError('mstatusline() for a steed');
    if (u.uswallow)
        throw new UnsupportedApplyError('mstatusline() for an engulfer');
    if (u.dz)
        throw new UnsupportedApplyError('listening to the floor or ceiling');
    if (obj.cursed)
        throw new UnsupportedApplyError('a cursed stethoscope');

    confdir(false, state);
    if (!u.dx && !u.dy) {
        await ustatusline(state);
        return res;
    }
    const rx = u.ux + u.dx;
    const ry = u.uy + u.dy;
    // apply.c:386-390 answers a square off the map with "You hear a faint
    // typing noise." and ECMD_OK, the one arm below here that discards `res`
    // rather than returning it. Its Soundeffect() interface is unported.
    if (!isok(rx, ry))
        throw new UnsupportedApplyError('listening off the edge of the map');
    // apply.c:391-446, the monster arm: x_monnam(), the gb.bhitpos and
    // gn.notonhead writes, the mundetected and mappearance branches,
    // mstatusline() and map_invisible().
    if (m_at(rx, ry, state))
        throw new UnsupportedApplyError('listening to an adjacent monster');
    if (unmap_invisible(rx, ry, state))
        await ttyPline('The invisible monster must have moved.', state);

    const lev = state.level.at(rx, ry);
    // apply.c:452-464. Both arms rewrite the terrain the listen exposed, and
    // no ported command creates either kind of square to listen at.
    if (lev.typ === SDOOR)
        throw new UnsupportedApplyError('listening to a secret door');
    if (lev.typ === SCORR)
        throw new UnsupportedApplyError('listening to a secret corridor');

    if (!its_dead(rx, ry, state))
        await ttyPline('You hear nothing special.', state); /* not You_hear() */
    return res;
}

// C ref: apply.c doapply() (4213-4430), the `a` command.
//
// retouch_object(&obj, FALSE) sits between getobj() and the switch, and only
// an artifact stops here, on the same derivation js/eat.js:1449-1458 records
// for doeat(). artifact.c retouch_object() (2507-2528) answers 1 with no side
// effect unless `ag` or `bane` is set; both need get_artifact() to answer
// something, except for `ag`'s other conjunct Hate_silver. That one is
// provably false in this port: youprop.h:401 spells it
// `u.ulycn >= LOW_PM || hates_silver(gy.youmonst.data)`, js/u_init.js:368
// writes NON_PM into u.ulycn and nothing writes it again, and
// js/u_init.js:275 builds state.youmonst once and nothing reassigns its
// `data`, because no polymorph is ported. The BELL_OF_OPENING shortcut at the
// top of retouch_object() answers 1 as well, so it changes nothing either.
// Porting the artifact arm needs touch_artifact()'s blast, bane_applies(),
// losehp() and remove_worn_item().
export async function doapply(state = game) {
    if (nohands(state.youmonst.data)) {
        await ttyPline(
            "You aren't able to use or apply tools in your current form.",
            state,
        );
        return ECMD_OK;
    }
    if (await check_capacity(null, state))
        return ECMD_OK;

    const obj = await getobj('use or apply', apply_ok, GETOBJ_NOFLAGS, state);
    if (!obj)
        return ECMD_CANCEL;

    if (obj.oartifact)
        throw new UnsupportedApplyError('retouch_object() for an artifact');

    if (obj.oclass === WAND_CLASS)
        throw new UnsupportedApplyError('do_break_wand()');
    if (obj.oclass === SPBOOK_CLASS)
        throw new UnsupportedApplyError('flip_through_book()');
    if (obj.oclass === COIN_CLASS)
        throw new UnsupportedApplyError('flip_coin()');

    switch (obj.otyp) {
    case STETHOSCOPE:
        return use_stethoscope(obj, state);
    case LOCK_PICK:
    case CREDIT_CARD:
    case SKELETON_KEY:
        // apply.c:4285-4289. Every pick_lock() answer except
        // PICKLOCK_DID_NOTHING spends the turn, which is what draws the next
        // turn's random numbers.
        return (await pick_lock(obj, 0, 0, null, state) !== 0)
            ? ECMD_TIME : ECMD_OK;
    default:
        // Every other arm of C's switch, and its `default` -- which redirects
        // a polearm to use_pole(), a pick or an axe to use_pick_axe(), and
        // anything else to "Sorry, I don't know how to use that." and
        // ECMD_FAIL. The refusal names the object type so a session that
        // reaches one says which tool it wanted.
        throw new UnsupportedApplyError(
            `doapply()'s arm for object type ${obj.otyp}`,
        );
    }
    // C's tail, `if (obj && obj->oartifact) res |= arti_speak(obj)`, has no
    // reachable input: the retouch_object() stop above refuses every artifact
    // before the switch, and no arm here can turn a non-artifact into one.
}
