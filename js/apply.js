// apply.js -- the `a` command: using a tool.
// C refs: src/apply.c apply_ok(), doapply(), use_stethoscope(), its_dead(),
// and reset_trapset().
//
// doapply()'s switch has thirty-odd named arms. Three are live: STETHOSCOPE, the
// LOCK_PICK/CREDIT_CARD/SKELETON_KEY arm that lock.c pick_lock() serves, and
// MAGIC_MARKER which delegates to write.c dowrite() in js/write.js. Ordinary
// armor reaches the switch's default unknown-use message. Every other named
// arm, the default's weapon redirects, and the wand, spellbook and coin
// shortcuts above the switch stop at a refusal naming the C function they need.
// use_stethoscope() covers
// the no-hands, Deaf and free-hand guards, the free-action rule, self and
// off-map probes, the adjacent monster arm, both secret-terrain arms, an empty
// adjacent square, ordinary sighted and blind corpses and statues, and a
// Healer's statue-trap report. Mounted, swallowed, vertical, and cursed uses
// still stop.

import {
    ARTICLE_A,
    CQ_CANNED,
    CORR,
    DEAF,
    ECMD_CANCEL,
    ECMD_FAIL,
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
    nothing_happens,
    PRONOUN_NO_IT,
    REVIVE_MON,
    SCORR,
    SDOOR,
    STATUE_TRAP,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    u_at,
} from './const.js';
import {
    cmdq_add_ec,
    cmdq_add_key,
    confdir,
    extcmdRow,
    getdir,
} from './cmd.js';
import { cvt_sdoor_to_door } from './detect.js';
import {
    feel_newsym,
    glyph_at,
    map_object,
    map_invisible,
    newsym,
    obj_to_glyph,
    unmap_invisible,
} from './display.js';
import { obj_pmname, pmname, x_monnam } from './do_name.js';
import { can_reach_floor, freehand } from './engrave.js';
import { game } from './gstate.js';
import { check_capacity } from './hack.js';
import { highc } from './hacklib.js';
import { mstatusline, ustatusline } from './insight.js';
import { getobj, nxtobj, update_inventory } from './invent.js';
import { pick_lock } from './lock.js';
import { seemimic } from './mon.js';
import {
    gender,
    humanoid,
    is_female,
    is_male,
    nohands,
    pronoun_gender,
    type_is_pname,
} from './mondata.js';
import { youHear } from './monmove.js';
import { m_at } from './monst.js';
import { get_mtraits } from './corpstat.js';
import { discover_object } from './o_init.js';
import {
    init_dummyobj,
    is_axe,
    is_boots,
    is_gloves,
    is_graystone,
    is_pick,
    hasContents,
    newObject,
    objectType,
    sobj_at,
} from './obj.js';
import { simple_typename, simpleonames, The } from './objnam.js';
import {
    ARMOR_CLASS,
    BANANA,
    BRASS_LANTERN,
    BULLWHIP,
    COIN_CLASS,
    CORPSE,
    CREAM_PIE,
    CREDIT_CARD,
    EUCALYPTUS_LEAF,
    FOOD_CLASS,
    GEM_CLASS,
    LENSES,
    LOCK_PICK,
    LUMP_OF_ROYAL_JELLY,
    MAGIC_MARKER,
    MAGIC_LAMP,
    OIL_LAMP,
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
import { MZ_TINY, PM_HEALER } from './monsters.js';
import { body_part } from './polyself.js';
import { djinni_from_bottle } from './potion.js';
import { canSpotMonster, heroIsBlind } from './startup_a11y.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { obj_has_timer } from './timeout.js';
import { t_at } from './trap.js';
import { ttyPline } from './tty_message.js';
import { recalc_block_point, unblock_point } from './vision.js';
import { is_pole } from './worn.js';
import { dowrite } from './write.js';
import { genders } from './roles.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { check_unpaid_usage } from './shk.js';
import { begin_burn } from './timeout.js';
import { wield_tool } from './wield.js';

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

// C ref: apply.c rub_ok() (1770-1781), the getobj() callback for #rub.
// Hands are excluded along with every carried object except the three lamps,
// the four gray stones, and royal jelly.
export function rub_ok(obj) {
    if (!obj)
        return GETOBJ_EXCLUDE;

    if (obj.otyp === OIL_LAMP || obj.otyp === MAGIC_LAMP
        || obj.otyp === BRASS_LANTERN || is_graystone(obj)
        || obj.otyp === LUMP_OF_ROYAL_JELLY)
        return GETOBJ_SUGGEST;

    return GETOBJ_EXCLUDE;
}

// C ref: apply.c dorub() (1785-1838), through the sighted, charged magic
// lamp outcomes at 1817-1835. Gray stones, royal jelly, empty lamps, blind
// smoke, and every other already-wielded lamp remain outside this port.
export async function dorub(state = game, env = {}) {
    if (nohands(state.youmonst.data)) {
        await ttyPline(
            "You aren't able to rub anything without hands.",
            state,
        );
        return ECMD_OK;
    }
    const obj = await getobj('rub', rub_ok, GETOBJ_NOFLAGS, state);
    if (!obj)
        return ECMD_CANCEL;

    if (obj.oclass === GEM_CLASS || obj.oclass === FOOD_CLASS) {
        throw new UnsupportedApplyError(
            'dorub() with a gray stone or royal jelly',
        );
    }
    if (obj !== state.uwep) {
        if (await wield_tool(obj, 'rub', state)) {
            cmdq_add_ec(CQ_CANNED, extcmdRow('rub'), state);
            cmdq_add_key(CQ_CANNED, obj.invlet, state);
            return ECMD_TIME;
        }
        return ECMD_OK;
    }

    if (state.uwep.otyp === MAGIC_LAMP && state.uwep.spe > 0) {
        const random = env.random ?? { d, rn1, rn2, rnd, rne, rnz };
        if (!random.rn2(3)) {
            check_unpaid_usage(state.uwep, true, state);
            state.uwep.otyp = OIL_LAMP;
            state.uwep.spe = 0;
            state.uwep.age = random.rn1(500, 1000);
            if (state.uwep.lamplit)
                begin_burn(state.uwep, true, { ...env, state });
            await (env.djinniFromBottle ?? djinni_from_bottle)(
                state.uwep,
                state,
                { ...env, random },
            );
            discover_object(
                MAGIC_LAMP,
                true,
                true,
                true,
                state,
                { ...env, random },
            );
            update_inventory({ ...env, state });
            return ECMD_TIME;
        }
        if (random.rn2(2)) {
            if (heroIsBlind(state)) {
                throw new UnsupportedApplyError(
                    'dorub() blind magic-lamp smoke',
                );
            }
            await ttyPline('You see a puff of smoke.', state);
        } else {
            await ttyPline(nothing_happens, state);
        }
        return ECMD_TIME;
    }

    throw new UnsupportedApplyError(
        'dorub() with an empty or non-magic already-wielded lamp',
    );
}

// C ref: apply.c its_dead() (196-309), the floor-object half of a listen.
// C answers TRUE when it printed something and FALSE when the square holds
// neither a corpse nor a statue, which is when the caller falls through to
// "You hear nothing special."
//
// C takes `int *resp` so that its hallucination arm can charge the turn. The
// exported source-named helper retains its boolean result and optionally
// accepts the caller-owned response holder for that write.
function selectedDeadObject(rx, ry, state) {
    let corpse = sobj_at(CORPSE, rx, ry, state);
    let statue = sobj_at(STATUE, rx, ry, state);
    const canReachFloor = can_reach_floor(true, state);

    if (!canReachFloor) {               /* levitation or unskilled riding */
        corpse = null;                   /* can't reach corpse on floor */
        // apply.c:208-211. An out-of-reach hero cannot touch tiny statues;
        // walk this square's pile until the first statue whose species is not
        // tiny. When none remains, its_dead() reaches its FALSE fall-through.
        while (statue
            && state.mons[statue.corpsenm].msize === MZ_TINY) {
            statue = nxtobj(statue, STATUE, true);
        }
    }
    // apply.c:213-219. sobj_at() found the first object of each kind. If the
    // first corpse follows the first statue in the square's nexthere chain,
    // the statue is uppermost; otherwise the corpse is. An unrelated object
    // between them does not affect the comparison.
    if (corpse && statue) {
        if (nxtobj(statue, CORPSE, true) === corpse) corpse = null;
        else statue = null;
    }
    return { corpse, statue };
}

// C ref: apply.c its_dead(). The optional response holder models C's `int
// *resp`; direct callers that need only the source boolean result may omit it.
export async function its_dead(rx, ry, state = game, response = null) {
    const { corpse, statue } = selectedDeadObject(rx, ry, state);
    if ((corpse || statue) && heroHallucinating(state)) {
        let answer;
        if (!corpse) {
            answer = "You're both stoned";
        } else {
            const more_corpses = Boolean(nxtobj(corpse, CORPSE, true));
            if (corpse.quan === 1 && !more_corpses) {
                let gndr = 2;
                const saved = get_mtraits(corpse, false, state);
                if (saved) {
                    gndr = pronoun_gender(saved, PRONOUN_NO_IT, { state });
                } else {
                    const species = state.mons[corpse.corpsenm];
                    if (is_female(species)) gndr = 1;
                    else if (is_male(species)) gndr = 0;
                }
                const pronoun = genders[gndr].he;
                answer = `${highc(pronoun[0])}${pronoun.slice(1)}'s dead`;
            } else {
                answer = "They're dead";
            }
        }
        const heard = youHear(`a voice say, "${answer}, Jim."`, state);
        if (heard) await ttyPline(heard, state);
        if (response) response.value = ECMD_TIME;
        return true;
    }
    if (corpse) {
        const more_corpses = Boolean(nxtobj(corpse, CORPSE, true));
        const one = (corpse.quan === 1 && !more_corpses);
        const here = u_at(rx, ry, state);
        const visglyph = glyph_at(rx, ry, state);
        const corpseglyph = obj_to_glyph(corpse, state);
        let reviver = false;
        if (heroIsBlind(state) && visglyph !== corpseglyph.glyph)
            map_object(corpse, true, state);
        if (state.urole?.mnum === PM_HEALER) {
            // apply.c:265-274. This only detects a pending revival; it neither
            // runs nor changes the timer. Walk the square's nexthere chain,
            // stopping at the first corpse with REVIVE_MON.
            let current = corpse;
            do {
                if (obj_has_timer(current, REVIVE_MON, state))
                    reviver = true;
                else
                    current = nxtobj(current, CORPSE, true);
            } while (current && !reviver);
        }
        await ttyPline(
            `You determine that ${one ? (here ? 'this' : 'that')
                : (here ? 'these' : 'those')} unfortunate being${
                one ? '' : 's'} ${one ? 'is' : 'are'}${
                reviver ? ' mostly' : ''} dead.`,
            state,
        );
        return true;
    }
    if (statue) {
        const species = state.mons[statue.corpsenm];
        let what;
        let how = 'fine';
        if (heroIsBlind(state)) {
            what = `${u_at(rx, ry, state) ? 'This' : 'That'} ${
                humanoid(species) ? 'person' : 'creature'}`;
        } else {
            what = obj_pmname(statue, state);
            if (!type_is_pname(species)) what = The(what, state);
        }
        if (state.urole?.mnum === PM_HEALER) {
            if (t_at(rx, ry, state)?.ttyp === STATUE_TRAP)
                how = 'extraordinary';
            else if (hasContents(statue))
                how = 'remarkable';
        }
        await ttyPline(`${what} is in ${how} health for a statue.`, state);
        return true;
    }
    return false;
}

// Fail-closed commands are retryable. Inspect the earlier adjacent paths that
// still refuse before apply.c:340 changes the listen sequence and observation
// globals. The complete its_dead() family no longer needs preflight.
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
    if (!isok(rx, ry)) return;
    if (m_at(rx, ry, state)) return;

    const lev = state.level.at(rx, ry);
    if (lev.typ === SDOOR || lev.typ === SCORR) return;
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
// Below confdir() the adjacent-square arm (384-470) runs through the off-map
// answer, monster branch, both secret-terrain arms, and the complete
// dead-object family.
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
    // rather than returning it. Soundeffect(se_typing_noise, 100) expands to
    // nothing in the tty build; You_hear() still applies the acoustics gate.
    if (!isok(rx, ry)) {
        const heard = youHear('a faint typing noise.', state);
        if (heard) await ttyPline(heard, state);
        return ECMD_OK;
    }
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

    const response = { value: res };
    if (!await its_dead(rx, ry, state, response))
        await ttyPline('You hear nothing special.', state); /* not You_hear() */
    return response.value;
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
    case MAGIC_MARKER:
        // apply.c:4361-4362. dowrite() handles the full magic marker flow.
        return dowrite(obj, state);
    default:
        // apply.c:4407-4417. No named switch arm has ARMOR_CLASS, and armor
        // cannot be a polearm, pick, or axe because those macros admit only
        // WEAPON_CLASS and TOOL_CLASS. It therefore reaches C's exact
        // unknown-use result without spending a turn or changing the object.
        if (obj.oclass === ARMOR_CLASS) {
            await ttyPline("Sorry, I don't know how to use that.", state);
            return ECMD_FAIL;
        }
        // Every named arm this port has not implemented, plus the default's
        // unported use_pole() and use_pick_axe() redirects, stays fail-closed.
        // The refusal names the object type so a session says which path it
        // wanted without accidentally executing a partial implementation.
        throw new UnsupportedApplyError(
            `doapply()'s arm for object type ${obj.otyp}`,
        );
    }
    // C's tail, `if (obj && obj->oartifact) res |= arti_speak(obj)`, has no
    // reachable input: the retouch_object() stop above refuses every artifact
    // before the switch, and no arm here can turn a non-artifact into one.
}
