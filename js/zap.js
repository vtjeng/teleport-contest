// zap.js -- the wish prompt.
// C ref: src/zap.c makewish(), so far the only row of that file.
// wizcmds.c wiz_wish() calls it; potion.c, sit.c and zap.c's own wand code
// reach it too, and none of those callers is ported.
//
// zap.c's elemental destruction of monster inventory lives in
// js/zap_destroy_items.js, which the C file separates as its own group of
// functions.

import { tty_getlin } from './getline.js';
import { game } from './gstate.js';
import { mungspaces } from './hacklib.js';
import { ttyPline } from './tty_message.js';

// A wish this port cannot grant yet.
export class UnsupportedWishError extends Error {
    constructor(reason, buf) {
        super(`unsupported wish: ${reason}`);
        this.name = 'UnsupportedWishError';
        this.reason = reason;
        // The line mungspaces() left, which readobjnam() reads once the rest
        // of makewish() lands.
        this.buf = buf;
    }
}

// C ref: zap.c makewish() (6313-6422), through the getlin() call at 6337, the
// iflags.term_gone return at 6339 and the mungspaces() at 6345. The Escape
// test at 6346 and everything after it -- the "help" arm, readobjnam(), the
// object it creates and the u.ublesscnt tail -- belong to the next slice, so
// the whole typed line is echoed and this throws where that test stands.
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

    throw new UnsupportedWishError(
        'readobjnam() resolving the wished-for object',
        mungspaces(answer),
    );
}
