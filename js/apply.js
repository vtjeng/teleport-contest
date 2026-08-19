// apply.js -- the `a` command: using a tool.
// C refs: src/apply.c apply_ok(), doapply(), use_stethoscope(), its_dead(),
// and reset_trapset().
//
// doapply()'s switch has thirty-odd arms. Two are live: STETHOSCOPE, and the
// LOCK_PICK/CREDIT_CARD/SKELETON_KEY arm that lock.c pick_lock() serves. Every
// other arm, and the wand, spellbook and coin shortcuts above the switch,
// stops at a refusal naming the C function it needs. use_stethoscope() covers
// its three guards, the free-action rule, the self-probe that confdir() leads
// to, the monster on the adjacent square, both secret-terrain arms, and the
// adjacent square that holds nothing to report, and the ordinary sighted
// corpse result. The mounted, swallowed, vertical, cursed, off-map, and
// exceptional dead-thing arms still stop.

import {
    ARTICLE_A,
    CORR,
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
    has_mcorpsenm,
    isok,
    MCORPSENM,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    M_AP_TYPE,
    REVIVE_MON,
    SCORR,
    SDOOR,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    u_at,
} from './const.js';
import { confdir, getdir } from './cmd.js';
import { cvt_sdoor_to_door } from './detect.js';
import {
    feel_newsym,
    map_invisible,
    newsym,
    unmap_invisible,
} from './display.js';
import { pmname, x_monnam } from './do_name.js';
import { can_reach_floor, freehand } from './engrave.js';
import { game } from './gstate.js';
import { check_capacity } from './hack.js';
import { mstatusline, ustatusline } from './insight.js';
import { getobj, nxtobj } from './invent.js';
import { pick_lock } from './lock.js';
import { seemimic } from './mon.js';
import { gender, nohands } from './mondata.js';
import { youHear } from './monmove.js';
import { m_at } from './monst.js';
import {
    init_dummyobj,
    is_axe,
    is_boots,
    is_gloves,
    is_graystone,
    is_pick,
    newObject,
    objectType,
    sobj_at,
} from './obj.js';
import { simple_typename, simpleonames } from './objnam.js';
import {
    BANANA,
    BULLWHIP,
    COIN_CLASS,
    CORPSE,
    CREAM_PIE,
    CREDIT_CARD,
    EUCALYPTUS_LEAF,
    LENSES,
    LOCK_PICK,
    LUMP_OF_ROYAL_JELLY,
    POT_OIL,
    POTION_CLASS,
    SKELETON_KEY,
    SLIME_MOLD,
    SPBOOK_CLASS,
    STATUE,
    STETHOSCOPE,
    TOOL_CLASS,
    TOUCHSTONE,
    WAND_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import { body_part } from './polyself.js';
import { canSpotMonster, heroIsBlind } from './startup_a11y.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { obj_has_timer } from './timeout.js';
import { ttyPline } from './tty_message.js';
import { recalc_block_point, unblock_point } from './vision.js';
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
// (apply.c:253); that arm still refuses here, so the port answers a bare
// boolean. The admitted corpse branch is sighted, reachable, has no statue in
// its pile, and has no REVIVE_MON timer. Its blind glyph update, Healer timer
// result, hallucination message, and statue sibling remain named refusals.
function unportedItsDeadBranch(rx, ry, state) {
    let corpse = sobj_at(CORPSE, rx, ry, state);
    const statue = sobj_at(STATUE, rx, ry, state);

    if (!can_reach_floor(true, state)) { /* levitation or unskilled riding */
        corpse = null;                   /* can't reach corpse on floor */
        // apply.c:210-211 then walks `statue` past the tiny statues an
        // out-of-reach hero cannot touch, through invent.c nxtobj(), so a
        // square holding none but tiny ones reaches the fall-through below.
        // The port refuses every statue here instead, which over-refuses
        // exactly that square. nxtobj() and MZ_TINY are now available, but
        // this slice excludes every statue path; the later statue slice must
        // port this walk with the message arm it selects.
        if (statue) return 'an out-of-reach statue';
    }
    if (!corpse && !statue) return null;

    // apply.c:223-260 tests Hallucination before either selected object's
    // message arm. Keep that precedence even for a mixed pile.
    if (heroHallucinating(state))
        return 'a hallucinated listen to the dead';

    // The source chooses the uppermost corpse or statue at :214-219. This
    // slice excludes both mixed outcomes, because admitting either would also
    // admit the statue naming arm when pile order changes.
    if (corpse && statue) return 'a mixed corpse and statue pile';
    if (statue) return 'a statue on the listened-to square';

    // glyph_at(), obj_to_glyph(), and map_object() precede the Healer timer
    // walk at :264-274. Their blind path therefore wins when both exclusions
    // apply, and refusing it here keeps its display effects out of a retry.
    if (heroIsBlind(state)) return 'a blind listen to a corpse';

    for (let current = corpse; current;
        current = nxtobj(current, CORPSE, true)) {
        if (obj_has_timer(current, REVIVE_MON, state))
            return 'a corpse with a REVIVE_MON timer';
    }
    return null;
}

async function its_dead(rx, ry, state) {
    let corpse = sobj_at(CORPSE, rx, ry, state);
    if (!can_reach_floor(true, state)) corpse = null;
    if (!corpse) return false; /* no reachable corpse or admitted statue */

    const more_corpses = Boolean(nxtobj(corpse, CORPSE, true));
    const one = (corpse.quan === 1 && !more_corpses);
    const here = u_at(rx, ry, state);
    await ttyPline(
        `You determine that ${one ? (here ? 'this' : 'that')
            : (here ? 'these' : 'those')} unfortunate being${one ? '' : 's'} `
        + `${one ? 'is' : 'are'} dead.`,
        state,
    );
    return true;
}

// Fail-closed commands are retryable. Inspect only the adjacent paths that
// still refuse before apply.c:340 starts changing the listen sequence and
// observation globals. The checks follow use_stethoscope()'s C branch order:
// an off-map square first; a monster or secret terrain returns before
// its_dead(); then the dead-thing family. Admitted paths run the source body
// below, where unmap_invisible(), messages, terrain, vision, and display still
// happen in C order.
function preflightAdjacentStethoscope(obj, state) {
    const u = state.u;
    // These source arms precede confdir() and the adjacent-square body. Their
    // existing refusals therefore win over anything at the pointed square.
    if (u.uswallow) return;
    if (u.dz) return;
    if (obj.cursed) return;
    if (!u.dx && !u.dy) return;

    const rx = u.ux + u.dx;
    const ry = u.uy + u.dy;
    if (!isok(rx, ry)) {
        throw new UnsupportedApplyError('listening off the edge of the map');
    }
    if (m_at(rx, ry, state)) return;

    const lev = state.level.at(rx, ry);
    if (lev.typ === SDOOR || lev.typ === SCORR) return;

    const branch = unportedItsDeadBranch(rx, ry, state);
    if (branch) throw new UnsupportedApplyError(branch);
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
// Below confdir() the adjacent-square arm (384-470) runs through the monster
// branch, both secret-terrain arms, and the empty square's answer. The
// remaining off-map and dead-thing arms stop before the shared listen effects,
// so retrying their command cannot retain half of the unported path.
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

    preflightAdjacentStethoscope(obj, state);

    const res = (state.hero_seq === state.context.stethoscope_seq)
        ? ECMD_TIME : ECMD_OK;
    state.context.stethoscope_seq = state.hero_seq;

    // apply.c:340-341. C calls these tentative because the monster arm below
    // overwrites both; mstatusline() reads gb.bhitpos for its long-worm and
    // region terms, and gn.notonhead for nothing this port reaches yet.
    // js/dog.js setMonsterObservationPosition() makes the same coupled write
    // from mon.c see_monster_closeup(); this pair is not that one, because
    // gn.notonhead here is u.uswallow rather than a comparison with the
    // monster's own square.
    state.gb ??= {};
    state.gb.bhitpos ??= {};
    state.gb.bhitpos.x = u.ux;
    state.gb.bhitpos.y = u.uy;
    state.gn ??= {};
    state.gn.notonhead = Boolean(u.uswallow);

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
    const mtmp = m_at(rx, ry, state);
    if (mtmp) {
        // Named before seemimic() runs, so a mimic is still wearing its
        // disguise here; x_monnam() ignores that for M_AP_OBJECT and answers
        // the true species either way. insight.c:3392 names it a second time
        // afterwards, with a different article and no disguise left.
        const mnm = x_monnam(mtmp, ARTICLE_A, null,
                             SUPPRESS_IT | SUPPRESS_INVISIBLE, false, state);

        /* gb.bhitpos needed by mstatusline() iff mtmp is a long worm */
        state.gb.bhitpos.x = rx;
        state.gb.bhitpos.y = ry;
        state.gn.notonhead = (mtmp.mx !== rx || mtmp.my !== ry);

        if (mtmp.mundetected) {
            if (!canSpotMonster(mtmp, state))
                await ttyPline(`There is ${mnm} hidden there.`, state);
            mtmp.mundetected = 0;
            newsym(mtmp.mx, mtmp.my);
        } else if (mtmp.mappearance) {
            let what = 'thing';
            let use_plural = false;

            switch (M_AP_TYPE(mtmp)) {
            case M_AP_OBJECT: {
                /* FIXME?
                 *  we should probably be using object_from_map() here
                 */
                const odummy = init_dummyobj(newObject(), mtmp.mappearance,
                                             1, state);
                /* simple_typename() yields "fruit" for any named fruit;
                   we want the same thing '//' or ';' shows: "slime mold"
                   or "grape" or "slice of pizza" */
                if (odummy.otyp === SLIME_MOLD && has_mcorpsenm(mtmp)) {
                    odummy.spe = MCORPSENM(mtmp);
                    what = simpleonames(odummy, state);
                } else {
                    what = simple_typename(odummy.otyp, state);
                }
                use_plural = (is_boots(odummy, state)
                    || is_gloves(odummy, state)
                    || odummy.otyp === LENSES);
                break;
            }
            case M_AP_MONSTER: /* ignore Hallucination here */
                what = pmname(state.mons[mtmp.mappearance], gender(mtmp));
                break;
            case M_AP_FURNITURE:
                what = CMAP_EXPLANATIONS[mtmp.mappearance];
                break;
            }
            seemimic(mtmp, state);
            await ttyPline(
                `${use_plural ? 'Those' : 'That'} ${what} `
                + `${use_plural ? 'are' : 'is'} really ${mnm}.`,
                state,
            );
        } else if (state.flags.verbose && !canSpotMonster(mtmp, state)) {
            await ttyPline(`There is ${mnm} there.`, state);
        }

        await mstatusline(mtmp, state);
        if (!canSpotMonster(mtmp, state))
            map_invisible(rx, ry, state);
        return res;
    }
    if (unmap_invisible(rx, ry, state))
        await ttyPline('The invisible monster must have moved.', state);

    const lev = state.level.at(rx, ry);
    // apply.c:452-464. Soundeffect() is a no-op in the tty build; You_hear()
    // still owns the acoustics gate and its alternate underwater prefix.
    if (lev.typ === SDOOR) {
        const heard = youHear(
            'a hollow sound.  This must be a secret door!', state,
        );
        if (heard) await ttyPline(heard, state);
        cvt_sdoor_to_door(lev, state); /* ->typ = DOOR */
        recalc_block_point(rx, ry, state);
        feel_newsym(rx, ry, state);
        return res;
    }
    if (lev.typ === SCORR) {
        const heard = youHear(
            'a hollow sound.  This must be a secret passage!', state,
        );
        if (heard) await ttyPline(heard, state);
        lev.typ = CORR;
        lev.flags = 0;
        lev.doormask = 0;
        unblock_point(rx, ry, state);
        feel_newsym(rx, ry, state);
        return res;
    }

    if (!await its_dead(rx, ry, state))
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
