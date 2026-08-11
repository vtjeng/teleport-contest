// zap.js -- the `z` command and the wish prompt.
// C refs: src/zap.c zappable(), zap_ok(), dozap() and makewish().
//
// dozap() is ported whole. Three of its five arms stop: backfire(),
// zapyourself() and weffects(), which together are the wand effects
// themselves. What runs is the command around them -- the two guards, the
// object prompt, the shop usage fee, the charge, the direction prompt, the
// wand that glows and fades when no direction is given, and the worn-out wand
// that crumbles.
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
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    GETOBJ_EXCLUDE,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    ICE,
    IRONBARS,
    Is_airlevel,
    Is_waterlevel,
    nothing_happens,
    ONAME_KNOW_ARTI,
    ONAME_WISH,
    WAND_BACKFIRE_CHANCE,
    WAND_WREST_CHANCE,
} from './const.js';
import { getdir } from './cmd.js';
import { newsym } from './display.js';
import { dropx, preflight_dropx } from './do.js';
import { tty_getlin } from './getline.js';
import { game } from './gstate.js';
import { check_capacity } from './hack.js';
import { lcase, mungspaces } from './hacklib.js';
import {
    getobj,
    hold_another_object,
    prepareHeavyBallDropAdmission,
    update_inventory,
    useupall,
} from './invent.js';
import { nohands } from './mondata.js';
import { objectType, remove_object } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { NODIR, WAND_CLASS } from './objects.js';
import { The, Tobjnam, aobjnam, donameFresh, xnameFresh } from './objnam.js';
import { UnsupportedWishError, readobjnam } from './objnam_readobjnam.js';
import { encumber_msg } from './pickup.js';
import { rn1, rn2 } from './rng.js';
import { check_unpaid } from './shk.js';
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
// Three of the five effect arms stop, and each one stops after everything C
// does ahead of it has run, so the charge, the prompts and the draws that
// select the arm all happen first:
//
// - backfire() throws the cursed wand up in the hero's face. The rn2 that
//   picks it is inside the condition, so a cursed wand that does not backfire
//   spends the draw and carries on exactly as C does.
// - zapyourself() is one refusal rather than one per wand: C's own switch ends
//   in `default: impossible()`, so a single arm naming the object type covers
//   both the wand effects that are unported and the types C rejects.
// - weffects() is the whole of the aimed-zap machinery below it.
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
        throw new UnsupportedZapError(
            `zapyourself() for object type ${obj.otyp}`,
        );
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
