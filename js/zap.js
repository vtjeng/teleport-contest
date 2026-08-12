// zap.js -- the `z` command and the wish prompt.
// C refs: src/zap.c learnwand(), zappable(), zap_ok(), dozap(), zapyourself()
// and makewish().
//
// dozap() is ported whole, and so is the command around its effect arms: the
// two guards, the object prompt, the charge, the direction prompt, the wand
// that glows and fades when no direction is given, and the worn-out wand that
// crumbles. Two of its five effect arms still stop: backfire(), and weffects()
// with the whole aimed-zap machinery below it.
//
// The shop usage fee stops the command earlier than any of them. check_unpaid()
// runs between the object prompt and the charge, and js/shk.js raises
// UnsupportedShopError there for merchandise the hero has not paid for, so a
// zap in a shop ends the segment before an effect arm is chosen at all.
//
// The self-zap arm runs, through zapyourself(), for a wand or spell of sleep
// alone. Every other object type zapyourself() can be handed stops in the one
// refusal that stands where C puts `default: impossible()`.
//
// wizcmds.c wiz_wish() calls makewish(); potion.c, sit.c and zap.c's own
// wand code reach it too, and none of those callers is ported.
//
// zap.c's elemental destruction of monster inventory lives in
// js/zap_destroy_items.js, which the C file separates as its own group of
// functions.

import { artifact_origin } from './artifacts.js';
import {
    BLINDED,
    DISP_END,
    DISP_FLASH,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    GETOBJ_EXCLUDE,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    ICE,
    IRONBARS,
    IS_SINK,
    IS_WATERWALL,
    Is_airlevel,
    Is_waterlevel,
    LAVAWALL,
    M_SEEN_SLEEP,
    nothing_happens,
    ONAME_KNOW_ARTI,
    ONAME_WISH,
    SLEEP_RES,
    THROWN_WEAPON,
    WAND_BACKFIRE_CHANCE,
    WAND_WREST_CHANCE,
    WEB,
    ZAP_POS,
    isok,
} from './const.js';
import { getdir } from './cmd.js';
import {
    bot,
    glyph_is_invisible,
    newsym,
    obj_to_glyph,
    tmp_at,
    unmap_object,
} from './display.js';
import { dropx, preflight_dropx } from './do.js';
import { tty_getlin } from './getline.js';
import { game } from './gstate.js';
import { check_capacity, nh_delay_output } from './hack.js';
import { lcase, mungspaces } from './hacklib.js';
import {
    getobj,
    hold_another_object,
    prepareHeavyBallDropAdmission,
    update_inventory,
    useupall,
} from './invent.js';
import { monstunseesu, nohands } from './mondata.js';
import { discover_object, observe_object } from './o_init.js';
import { is_pick, objectType, remove_object } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    HEAVY_IRON_BALL,
    NODIR,
    ROCK,
    SPBOOK_CLASS,
    SPE_SLEEP,
    WAND_CLASS,
    WAN_SLEEP,
} from './objects.js';
import {
    The,
    Tobjnam,
    Yname2,
    aobjnam,
    donameFresh,
    xnameFresh,
} from './objnam.js';
import { UnsupportedWishError, readobjnam } from './objnam_readobjnam.js';
import { encumber_msg } from './pickup.js';
import { rn1, rn2, rnd } from './rng.js';
import { m_at } from './monst.js';
import { check_unpaid, inside_shop } from './shk.js';
import { closed_door } from './monmove.js';
import { is_pool, t_at } from './trap.js';
import { cansee } from './vision.js';
import { fall_asleep } from './timeout.js';
import { ttyPline } from './tty_message.js';

// The wish parser raises every other refusal, so the class lives with it.
export { UnsupportedWishError };

// Thrown where zap.c reaches a wand effect this port has not ported.
export class UnsupportedZapError extends Error {
    constructor(branch) {
        super(`zapping a wand requires ${branch}`);
        this.name = 'UnsupportedZapError';
        this.branch = branch;
    }
}

// C ref: youprop.h:103 Blind, which is either source of blindness minus the
// artifact block that cancels both.
function heroIsBlind(state) {
    const blinded = state.u?.uprops?.[BLINDED];
    return Boolean((blinded?.intrinsic || blinded?.extrinsic)
        && !blinded?.blocked);
}

// C ref: zap.c learnwand() (122-151), translated whole. Called once a zap's
// effect has been observed, to turn "a wand" into "a wand of sleep" in the
// discoveries and in the pack.
//
// The SPBOOK_CLASS guard is for a cast spell, which reaches zapyourself()
// through a fake spellbook object; skipping it there keeps casting a spell
// from rediscovering a spellbook the hero has forgotten.
//
// makeknown() is hack.h:1530's `discover_object((x), TRUE, TRUE, TRUE)`, whose
// fourth argument is what credits the hero with the discovery through
// exercise(A_WIS, TRUE). Only the arm below reaches it: a wand whose type is
// already discovered takes observe_object() alone, which is the arm the Healer
// takes, because u_init.c ini_inv_use_obj() discovered her wand of sleep as it
// handed the wand over.
export function learnwand(obj, state = game) {
    if (obj.oclass !== SPBOOK_CLASS) {
        /* if type already discovered, treat this item has having been seen
           even if hero is currently blinded (skips redundant makeknown) */
        if (objectType(obj, state).oc_name_known) {
            observe_object(obj, state); /* will usually be dknown already */

        /* otherwise discover it if item itself has been or can be seen */
        } else {
            /* in case it was picked up while blind and then zapped without
               examining inventory after regaining sight (bypassing xname) */
            if (!heroIsBlind(state))
                observe_object(obj, state);
            /* make the discovery iff we know what we're manipulating */
            if (obj.dknown)
                discover_object(obj.otyp, true, true, true, state);
        }
        update_inventory({ state });
    }
}

// C ref: zap.c zappable() (2508-2522), translated whole. Answers whether the
// wand still has a charge to spend and spends it, and its comment records
// that spending is the point: "returns 1 if zap is available, 0 otherwise. it
// removes a charge from the wand if zappable."
//
// The wrest arm is the only one that draws. A wand at zero charges is worth
// one more zap with probability 1 in WAND_WREST_CHANCE, and that last zap
// takes spe to -1, which is what makes dozap()'s tail crumble the wand.
export async function zappable(wand, state = game) {
    if (wand.spe < 0 || (wand.spe === 0 && rn2(WAND_WREST_CHANCE)))
        return 0;
    if (wand.spe === 0)
        await ttyPline(
            'You wrest one last charge from the worn-out wand.', state,
        );
    wand.spe--;
    return 1;
}

// C ref: zap.c zap_ok() (2616-2623), the getobj() callback for the `z`
// command. Every wand is a likely candidate and nothing else is one, so a
// starting hero who carries a single wand sees it alone in the prompt.
export function zap_ok(obj) {
    if (obj && obj.oclass === WAND_CLASS)
        return GETOBJ_SUGGEST;
    return GETOBJ_EXCLUDE;
}

// C ref: zap.c dozap() (2625-2683), the `z` command, translated whole.
//
// Two of the five effect arms stop, and each one stops after everything C does
// ahead of it has run, so the charge, the prompts and the draws that select
// the arm all happen first:
//
// - backfire() throws the cursed wand up in the hero's face. The rn2 that
//   picks it is inside the condition, so a cursed wand that does not backfire
//   spends the draw and carries on exactly as C does.
// - weffects() is the whole of the aimed-zap machinery below it.
//
// The self-zap arm runs and returns ECMD_TIME for a wand or spell of sleep,
// which is the arm the recorded Healer takes. It stops only inside
// zapyourself(), which owns one refusal for every other object type in place
// of C's `default: impossible()` and a second for a sleep-resistant hero.
// dozap()'s own losehp() throw below that call cannot fire while zapyourself()
// returns 0 damage.
//
// check_unpaid() stops the command earlier than any effect arm; the file
// header says what that costs.
export async function dozap(state = game) {
    if (nohands(state.youmonst.data)) {
        await ttyPline(
            "You aren't able to zap anything in your current form.", state,
        );
        return ECMD_OK;
    }
    if (await check_capacity(null, state))
        return ECMD_OK;
    const obj = await getobj('zap', zap_ok, GETOBJ_NOFLAGS, state);
    if (!obj)
        return ECMD_CANCEL;

    check_unpaid(obj, state);

    const need_dir = objectType(obj, state).oc_dir !== NODIR;
    if (!await zappable(obj, state)) {
        await ttyPline(nothing_happens, state);
    } else if (obj.cursed && !rn2(WAND_BACKFIRE_CHANCE)) {
        /* the wand blows up in your face! */
        // backfire() names the wand, rolls d(spe + 2, 6) damage through
        // losehp() and useupall()s the wreckage; exercise(A_STR, FALSE) and
        // the early `return ECMD_TIME` that skips update_inventory() follow
        // it.
        throw new UnsupportedZapError('backfire() for a cursed wand');
    } else if (need_dir && !await getdir(null, state)) {
        if (!heroIsBlind(state))
            await ttyPline(
                `${The(xnameFresh(obj, state))} glows and fades.`, state,
            );
        /* make him pay for knowing !NODIR */
    } else if (need_dir && !state.u.dx && !state.u.dy && !state.u.dz) {
        const damage = await zapyourself(obj, true, state);
        if (damage !== 0) {
            // C names the killer with killer_xname() and halves the damage for
            // a hero with physical-damage resistance through
            // Maybe_Half_Phys(). Neither is ported, and the sleep arm is the
            // only one zapyourself() runs, so `damage` is 0 on every path that
            // reaches here.
            throw new UnsupportedZapError(
                'losehp() for a self-zap that wounds',
            );
        }
    } else {
        /*      Are we having fun yet?
         * weffects -> buzz(obj->otyp) -> zhitm (temple priest) ->
         * attack -> hitum -> known_hitum -> ghod_hitsu ->
         * buzz(AD_ELEC) -> destroy_items(AD_ELEC) ->
         * useup -> obfree -> dealloc_obj -> free(obj)
         */
        // That chain is why C reloads `obj` from gc.current_wand afterwards
        // and tests it for NULL below: weffects() can free the wand. This port
        // never enters the arm, so the wand below is always the one getobj()
        // answered and C's `obj &&` term has no reachable false case.
        throw new UnsupportedZapError(
            `weffects() for object type ${obj.otyp}`,
        );
    }
    if (obj.spe < 0) {
        await ttyPline(`${Tobjnam(obj, 'turn', state)} to dust.`, state);
        useupall(obj, { state }); /* calls freeinv() -> update_inventory() */
    } else {
        update_inventory({ state }); /* maybe used a charge */
    }
    return ECMD_TIME;
}

// C ref: youprop.h:36 Sleep_resistance, which is the plain "either source"
// spelling: unlike Blind it has no blocking term.
function heroResistsSleep(state) {
    const resistance = state.u?.uprops?.[SLEEP_RES];
    return Boolean(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: zap.c zapyourself() (2704-3013), the effect of a wand or spell the
// hero aimed at their own square. The frame is here whole; of its thirty-odd
// object arms only WAN_SLEEP and SPE_SLEEP are ported, and everything else
// falls into the single refusal below.
//
// C's own `default:` is `impossible("zapyourself: object %d used?")`, so one
// arm naming the object type is the shape C already uses for a type that has
// no business here. It covers the unported wand effects at the same time.
//
// `ordinary` is TRUE for a zap the hero aimed and FALSE for a wand that broke;
// only dozap() reaches this port, so it is always TRUE today.
//
// `damage` is the hit points dozap() then takes off the hero. The sleep arm
// leaves it 0, which is what makes dozap()'s losehp() unreachable.
export async function zapyourself(obj, ordinary, state = game) {
    let learn_it = false;
    const damage = 0;

    switch (obj.otyp) {
    case WAN_SLEEP:
    case SPE_SLEEP:
        learn_it = true;
        if (heroResistsSleep(state)) {
            // shieldeff() is a tmp_at() animation and monstseesu() is the
            // "monsters notice what you shrugged off" ledger; neither is
            // ported, and the port has no hero who resists sleep yet.
            throw new UnsupportedZapError(
                'shieldeff() and monstseesu() for a sleep-resistant hero',
            );
        } else {
            if (ordinary)
                await ttyPline('The sleep ray hits you!', state);
            else
                await ttyPline('You fall asleep!', state);
            monstunseesu(M_SEEN_SLEEP, state);
            await fall_asleep(-rnd(50), true, state, {
                message: ttyPline,
                statusRefresh: () => bot(),
            });
        }
        break;

    default:
        throw new UnsupportedZapError(
            `zapyourself() for object type ${obj.otyp}`,
        );
    }
    /* if effect was observable then discover the wand type provided
       that the wand itself has been seen */
    if (learn_it)
        learnwand(obj, state);
    return damage;
}

// C ref: zap.c exclam() (3546-3553). The punctuation that ends a hit message,
// chosen by how hard the blow landed. uhitm.c hmon_hitmon_msg_hit() is the
// caller here. C's comment records that the "?" arm is for a force below zero,
// which a zap can produce and a melee blow cannot.
export function exclam(force) {
    /* force == 0 occurs e.g. with sleep ray */
    /* note that large force is usual with wands so that !! would
            require information about hand/weapon/wand */
    return (force < 0) ? '?' : (force <= 4) ? '.' : '!';
}

// C ref: zap.c makewish() (6313-6422). The "help" arm at 6348-6352, the
// MAXWISHTRY retry loop at 6360-6368 and the hands_obj and artifact arms all
// stop instead; the wishes this port grants take the plain readobjnam() and
// hold_another_object() path between them, the Escape at 6346-6347 included.
//
// `tries` is 0 on every pass this port reaches, because the MAXWISHTRY loop
// that raises it starts past the throw. That settles two of the head's tests:
// the `iflags.cmdassist && tries > 0` suffix at 6330 cannot be appended, and
// the third operand of the 6334 test below holds.
export async function makewish(state = game) {
    state.context ??= {};
    // svc.context.resume_wish. allmain.c:200 is its only reader, restarting a
    // wish that a saved game left standing at this prompt; that call site is
    // not ported, so nothing reads the value back yet. It lives here because
    // makewish() is the only writer of it.
    state.context.resume_wish = 0;
    if (state.flags?.verbose)
        await ttyPline('You may wish for an object.', state);

    // `retry:`, the label the MAXWISHTRY loop jumps back to.
    const promptbuf = 'For what do you wish?';

    // 6334's `iflags.menu_requested && wish_history[0] && (tries == 0)` picks
    // the history menu over getlin(). wish_history[] is written only by
    // wish_history_add(), which sits inside `#ifdef DEBUG` at zap.c:6229;
    // include/config.h defines only DEBUG_MIGRATING_MONS and no patch under
    // nethack-c/patches/ defines DEBUG, so wish_history[0] is permanently
    // NULL. The `m` prefix therefore reaches getlin() like every other wish.
    const answer = await tty_getlin(promptbuf, state);

    if (state.iflags?.term_gone) {
        // The terminal is gone, so C abandons the wish and marks it for a
        // restore to resume. win/tty/getline.c:87 raises the flag for the one
        // byte that reads back as EOF, which js/getline.js already models.
        // C guards the assignment with `!iflags.debug_fuzzer`, and that flag
        // is never set here.
        state.context.resume_wish = 1;
        return;
    }

    let buf = mungspaces(answer);
    if (buf[0] === '\x1b') {
        // zap.c:6346-6347 empties the buffer rather than declining the wish,
        // so readobjnam("") falls through readobjnam_preparse()'s empty return
        // to `any:` and is granted wrpsym[rn2(13)].
        buf = '';
    } else if (lcase(buf) === 'help') {
        // 6348-6352 opens wishcmdassist()'s window and asks again.
        throw new UnsupportedWishError('the wish prompt help text', buf);
    }
    /*
     *  Note: if they wished for and got a non-object successfully,
     *  otmp == &hands_obj.  That includes an artifact which has been
     *  denied.  Wishing for "nothing" requires a separate value to remain
     *  distinct.
     */
    // C's bufcpy holds the typed line for wish_history_add() and the three
    // livelog strings, none of which this port writes.
    // C's `struct obj nothing` is a stack object whose address alone matters.
    const nothing = Object.freeze({});
    // readobjnam()'s typfnd: tail calls mksobj(), which reaches the same
    // generation machinery mklev.c and makemon() do -- mkbox_cnts() for a
    // container is the arm a wish reaches today. The hooks obj.js requires for
    // those arms are the ones every other mksobj() caller assembles, so this
    // wish path assembles them the same way rather than a subset of its own.
    const otmp = readobjnam(buf, nothing, objectGenerationEnv({ state }));
    // readobjnam() answering null -- the MAXWISHTRY retry loop at 6360-6368 --
    // and &hands_obj -- wizterrainwish() at 6374-6377 -- are both refused
    // inside it, so only the two arms below are reachable.
    if (otmp === nothing) {
        /* explicitly wished for "nothing", presumably attempting
           to retain wishless conduct */
        // livelog_printf(LL_WISH, "declined to make a wish") writes the
        // livelog file, which is not a screen.
        return;
    }
    // wish_history_add() sits inside `#ifdef DEBUG` at zap.c:6229, and no
    // patch under nethack-c/patches/ defines DEBUG.
    if (otmp.oartifact) {
        /* update artifact bookkeeping; doesn't produce a livelog event */
        artifact_origin(otmp, ONAME_WISH | ONAME_KNOW_ARTI, state);
    }
    // 6387-6388 saves u.uconduct.wisharti from before the wish only to pick
    // one of three livelog strings with it, so nothing outside the livelog
    // file reads it.

    const holdEnv = {
        state,
        hooks: {
            encumberMessage: encumber_msg,
            // do.c dropz() -> stackobj() -> invent.c merged() reaches
            // mkobj.c obj_extract_self() for the pile member the landing
            // object absorbs, and that member is on the floor.
            extractExternalObject: remove_object,
            // invent.c merged():933-942.  A wished-for object that merges
            // into a stack the hero already carries settles any known,
            // rknown or bknown the two disagreed on, and says so.  Only a
            // random wish reaches this: a named one is spelled the same way
            // twice, so the second copy agrees with the first.
            inventoryComparisonDiscovered: () => ttyPline(
                'You learn more about your items by comparing them.',
                state,
            ),
            newsym,
            preflightDropObject: preflight_dropx,
            dropObject: dropx,
        },
    };
    // The supported heavy-ball drop tail must be admitted before doname()
    // records discovery and before wish conduct changes. The returned token
    // is consumed after addinv() reaches the source drop_it branch.
    const heavyDropAdmission = prepareHeavyBallDropAdmission(otmp, holdEnv);

    // 6398 builds the livelog string.  Its three arms differ only in the text
    // they write to the livelog file, but doname() runs for all of them and
    // its xname() marks the object seen, so the call stays.
    donameFresh(otmp, state);
    /* KMH, conduct */
    state.u.uconduct.wishes++;

    // 6405-6420.  readobjnam() refuses a corpse, so otmp->wishedfor is 0 and
    // both tests that read it take their other branch.
    const verb = (Is_airlevel(state.u.uz) || state.u.uinwater)
        ? 'slip' : 'drop';
    const here = state.level.at(state.u.ux, state.u.uy).typ;
    const oops_msg = state.u.uswallow
        ? 'Oops!  %s out of your reach!'
        : (Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz)
           || here < IRONBARS || here >= ICE)
            ? 'Oops!  %s away from you!'
            : 'Oops!  %s to the floor!';

    /* The(aobjnam()) is safe since otmp is unidentified -dlc */
    await hold_another_object(
        otmp, oops_msg, The(aobjnam(otmp, verb, state)), null,
        holdEnv,
        heavyDropAdmission,
    );
    state.u.ublesscnt += rn1(100, 50); /* the gods take notice */
}

// ── bhit ──
//
// C ref: zap.c bhit() (3827-4139) and skiprange() (3578-3590). The distance
// effect shared by a thrown weapon, a kicked object, an immediate wand, a
// flashed light and an applied mirror: it walks the ray one square at a time,
// draws the transient glyph, and stops at the first monster, wall or closed
// door. gb.bhitpos, which C leaves at the final square, is the port's
// `state.bhitpos`; every caller reads it after the call rather than the return
// value, which is the monster hit.
//
// Only THROWN_WEAPON is ported, because dothrow.c throwit() is bhit()'s only
// ported caller. Everything the other five call types reach -- zap_map(),
// bhitpile(), flash_hits_mon(), hits_bars(), doorlock() -- belongs to the
// commands that use them.
//
// Nine branches inside the thrown-weapon walk stop, each at its own condition
// and before it changes anything: a shopkeeper catching a pick-axe, a lit
// object lighting the squares it passes, iron bars, a rock skipping over
// water, a monster in the path, and a heavy iron ball's four range limits.
// thitmonst() is the largest of them and is what makes the monster arm stop:
// it is dothrow.c's own 380-line function over find_mac(), omon_adj(),
// gem_accept() and hmon(), and none of that is ported.
export class UnsupportedBhitError extends Error {
    constructor(branch) {
        super(`zap.c bhit() reached ${branch}`);
        this.name = 'UnsupportedBhitError';
        this.branch = branch;
    }
}

// C ref: zap.c skiprange() (3578-3590). Picks the range window over which a
// thrown rock may skip. Its rnd() draws are part of the stream whether or not
// any water lies ahead, so the caller runs it for every thrown rock.
export function skiprange(range, random = { rnd }) {
    const tr = Math.trunc(range / 4);
    const tmp = range - (tr > 0 ? random.rnd(tr) : 0);
    let skipend = tmp - Math.trunc(tmp / 4) * random.rnd(3);
    if (skipend >= tmp) skipend = tmp - 1;
    return { skipstart: tmp, skipend };
}

export async function bhit(
    ddx,
    ddy,
    range,
    weapon,
    fhitm,
    fhito,
    pobj,
    state = game,
    random = { rn2, rnd },
) {
    const obj = pobj.obj;
    let allow_skip = false;
    let skiprange_start = 0;
    let skiprange_end = 0;

    if (weapon !== THROWN_WEAPON) {
        throw new UnsupportedBhitError(`call type ${weapon}`);
    }
    if (fhitm || fhito) {
        // Only ZAPPED_WAND supplies either callback; C passes null for a
        // thrown weapon at dothrow.c:1665-1666.
        throw new UnsupportedBhitError('an object or monster callback');
    }
    state.bhitpos = { x: state.u.ux, y: state.u.uy };

    if (obj && obj.otyp === ROCK) {
        ({ skipstart: skiprange_start, skipend: skiprange_end } =
            skiprange(range, random));
        allow_skip = random.rn2(3) === 0;
    }

    await tmp_at(DISP_FLASH, obj_to_glyph(obj, state), state);

    while (range-- > 0) {
        state.bhitpos.x += ddx;
        state.bhitpos.y += ddy;
        const x = state.bhitpos.x;
        const y = state.bhitpos.y;

        if (!isok(x, y)) {
            state.bhitpos.x -= ddx;
            state.bhitpos.y -= ddy;
            break;
        }

        if (is_pick(obj, state) && inside_shop(x, y, state)) {
            // shkcatch() belongs to js/shk.js's unported half.
            throw new UnsupportedBhitError('shkcatch()');
        }

        const typ = state.level.at(x, y).typ;

        /* WATER aka "wall of water" stops items */
        if (IS_WATERWALL(typ) || typ === LAVAWALL) break;

        if (obj.lamplit) {
            throw new UnsupportedBhitError('show_transient_light()');
        }
        if (typ === IRONBARS) {
            throw new UnsupportedBhitError('hits_bars()');
        }

        const mtmp = m_at(x, y, state);
        const ttmp = t_at(x, y, state);
        if (!mtmp && ttmp && ttmp.ttyp === WEB && random.rn2(3) !== 0) {
            if (cansee(x, y, state)) {
                await ttyPline(
                    `${Yname2(obj, state)} gets stuck in a web!`,
                    state,
                );
                ttmp.tseen = true;
                newsym(x, y);
            }
            // iflags.returning_missile: no ported object returns to the hand,
            // so `was_returning` is always null and its two arms are inert.
            break;
        }

        /*
         * skipping rocks
         *
         * skiprange_start is only set if this is a thrown rock
         */
        if (skiprange_start && range === skiprange_start && allow_skip) {
            if (is_pool(x, y, state) && !mtmp) {
                throw new UnsupportedBhitError('a rock skipping over water');
            } else if (skiprange_start > skiprange_end + 1) {
                --skiprange_start;
            }
        }
        // C's `if (in_skip)` block below this cannot run: in_skip is set only
        // by the arm that stops just above, so its branches -- another bounce
        // and a monster the rock passes over -- are unreachable.

        if (mtmp) {
            // shade_miss(), the mimic-as-object test and glyph_at() can all
            // clear mtmp and let the missile continue, so this stops ahead of
            // them rather than inside the arm they guard.
            throw new UnsupportedBhitError('thitmonst()');
        }

        if (!ZAP_POS(typ) || closed_door(x, y, state)) {
            state.bhitpos.x -= ddx;
            state.bhitpos.y -= ddy;
            break;
        }
        /* 'I' present but no monster: erase; do this before tmp_at() */
        if (glyph_is_invisible(state.level.at(x, y)) && cansee(x, y, state)) {
            unmap_object(x, y, state);
            newsym(x, y);
        }
        await tmp_at(x, y, state);
        await nh_delay_output(state);
        if (IS_SINK(typ))
            break; /* physical objects fall onto sink */

        /* limit range of ball so hero won't make an invalid move */
        if (range > 0 && obj.otyp === HEAVY_IRON_BALL) {
            throw new UnsupportedBhitError('a heavy iron ball in flight');
        }

        // C clears point_blank here, "affects passing through iron bars". Its
        // only reader is the hits_bars() call that stops above, so the port
        // keeps neither the variable nor this assignment.
    }

    await tmp_at(DISP_END, 0, state);
    // pay_for_damage("destroy"): only a zapped wand can break a shop door.
    // transient_light_cleanup(): only a lit object registers a transient
    // light, and the arm that would have shown one stops above.
    //
    // The return value is the monster the missile hit. It is always null here,
    // because the arm that would name one stops.
    return null;
}
