// apply.js -- the `a` command: using a tool.
// C refs: src/apply.c apply_ok(), doapply(), and use_stethoscope().
//
// doapply()'s switch has thirty-odd arms. Only STETHOSCOPE is live; every
// other arm, and the wand, spellbook and coin shortcuts above the switch,
// stops at a refusal naming the C function it needs. use_stethoscope() covers
// its three guards, the free-action rule, and the self-probe that confdir()
// leads to; the mounted, swallowed, vertical and cursed arms stop.

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
} from './const.js';
import { confdir, getdir } from './cmd.js';
import { freehand } from './engrave.js';
import { game } from './gstate.js';
import { check_capacity } from './hack.js';
import { ustatusline } from './insight.js';
import { getobj } from './invent.js';
import { nohands } from './mondata.js';
import { is_axe, is_graystone, is_pick, objectType } from './obj.js';
import {
    BANANA,
    BULLWHIP,
    COIN_CLASS,
    CREAM_PIE,
    EUCALYPTUS_LEAF,
    LUMP_OF_ROYAL_JELLY,
    POT_OIL,
    POTION_CLASS,
    SPBOOK_CLASS,
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

// C ref: apply.c use_stethoscope() (313-424), as far as the hero listening to
// her own chest. C's comment explains the free action: one use per turn costs
// nothing, so a second use in the same move is what makes a cursed
// stethoscope's wasted listen cost anything.
//
// Four arms between the direction prompt and confdir() stop rather than run.
// The u.usteed and the two u.uswallow arms need mstatusline(); u.dz needs
// its_dead(), cant_reach_floor() and the Soundeffect() interface; and the
// cursed arm draws an rn2(2) whose "You hear your heart beat." nothing has
// checked. Refusing the cursed arm on obj.cursed alone keeps that draw out of
// the random-number stream for the uncursed tools the ported path uses.
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
    throw new UnsupportedApplyError('listening to an adjacent square');
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
