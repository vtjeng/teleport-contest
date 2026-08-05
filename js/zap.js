// zap.js -- the wish prompt.
// C ref: src/zap.c makewish(), so far the only row of that file.
// wizcmds.c wiz_wish() calls it; potion.c, sit.c and zap.c's own wand code
// reach it too, and none of those callers is ported.
//
// zap.c's elemental destruction of monster inventory lives in
// js/zap_destroy_items.js, which the C file separates as its own group of
// functions.

import {
    ICE, IRONBARS, Is_airlevel, Is_waterlevel,
} from './const.js';
import { newsym } from './display.js';
import { dropx, preflight_dropx } from './do.js';
import { tty_getlin } from './getline.js';
import { game } from './gstate.js';
import { lcase, mungspaces } from './hacklib.js';
import { hold_another_object } from './invent.js';
import { The, aobjnam, donameFresh } from './objnam.js';
import { UnsupportedWishError, readobjnam } from './objnam_readobjnam.js';
import { encumber_msg } from './pickup.js';
import { rn1 } from './rng.js';
import { ttyPline } from './tty_message.js';

// The wish parser raises every other refusal, so the class lives with it.
export { UnsupportedWishError };

// C ref: zap.c makewish() (6313-6422). The Escape arm at 6346-6347, the
// "help" arm at 6348-6352, the MAXWISHTRY retry loop at 6360-6368 and the
// hands_obj and artifact arms all stop instead; the wishes this port grants
// take the plain readobjnam() and hold_another_object() path between them.
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

    const buf = mungspaces(answer);
    if (buf[0] === '\x1b') {
        // zap.c:6346-6347 empties the buffer rather than declining, so
        // readobjnam("") falls through readobjnam_preparse()'s empty return
        // to `any:` and grants wrpsym[rn2(13)].  That is easy to implement
        // backwards, so it stops here and is deferred instead.
        throw new UnsupportedWishError('an Escape at the wish prompt', buf);
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
    const bufcpy = buf;
    // C's `struct obj nothing` is a stack object whose address alone matters.
    const nothing = Object.freeze({});
    const otmp = readobjnam(buf, nothing, { state });
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
        // 6381-6383's artifact_origin() bookkeeping.
        throw new UnsupportedWishError('a wished-for artifact', bufcpy);
    }

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
        {
            state,
            hooks: {
                encumberMessage: encumber_msg,
                newsym,
                preflightDropObject: preflight_dropx,
                dropObject: dropx,
            },
        },
    );
    state.u.ublesscnt += rn1(100, 50); /* the gods take notice */
}
