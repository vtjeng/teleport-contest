// pline.js -- the in-memory chronicle owned by pline.c.
//
// C refs: pline.c gamelog_add() (495-512) and livelog_printf() (515-528).
// The browser port has no external live-log sink, but the chronicle linked
// list is game state because insight.c #chronicle reads it.

import { game } from './gstate.js';
import { livelog_add } from './files.js';
import { truncateByteString } from './hacklib.js';
import { BUFSZ, PLINE_VERBALIZE } from './const.js';
import { ttyPline } from './tty_message.js';

// C ref: pline.c verbalize() (476-490). This helper is already used by
// random-text, prayer, and shop callers; keep it beside the other pline.c
// state/output owners while adding the chronicle functions below.
export async function verbalize(line, state = game, { message = ttyPline } = {}) {
    state.gp ??= {};
    state.gp.pline_flags = (state.gp.pline_flags ?? 0) | PLINE_VERBALIZE;
    try {
        await message(`"${line}"`, state);
    } finally {
        state.gp.pline_flags &= ~PLINE_VERBALIZE;
    }
}

// C appends to gg.gamelog and preserves insertion order. The C allocator
// stores the supplied turn separately from the message; retaining that shape
// keeps save/restore and planning clones source-visible.
export function gamelog_add(glflags, gltime, text, state = game) {
    state.gamelog ??= [];
    state.gamelog.push({
        turn: gltime,
        flags: glflags,
        text,
    });
}

// C formats the variadic line, appends it at svm.moves, replaces tabs for the
// external sink, then calls files.c livelog_add(). The sink guard belongs to
// that source owner, so the chronicle remains present when the default mask
// makes the external call return immediately.
export function livelog_printf(ll_type, text, state = game) {
    // C's vsnprintf() uses a BUFSZ * 2 byte buffer, including its terminator.
    const gamelogText = truncateByteString(String(text), BUFSZ * 2 - 1);
    gamelog_add(ll_type, state.moves ?? 0, gamelogText, state);
    // C's strNsubst() changes only the buffer passed to the external sink;
    // the in-memory chronicle retains the original tab bytes.
    livelog_add(ll_type, gamelogText.replaceAll('\t', '_'), state);
}
