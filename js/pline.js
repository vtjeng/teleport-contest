// pline.js -- the in-memory chronicle owned by pline.c.
//
// C refs: pline.c gamelog_add() (495-512) and livelog_printf() (515-528).
// The browser port has no external live-log sink, but the chronicle linked
// list is game state because insight.c #chronicle reads it.

import { game } from './gstate.js';
import { truncateByteString } from './hacklib.js';
import { BUFSZ, PLINE_VERBALIZE } from './const.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';

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
// external sink, then calls livelog_add(). The sink has no browser owner and
// its result is discarded, so record that gap without manufacturing output.
export function livelog_printf(ll_type, text, state = game) {
    // C's vsnprintf() uses a BUFSZ * 2 byte buffer, including its terminator.
    const gamelogText = truncateByteString(String(text), BUFSZ * 2 - 1);
    gamelog_add(ll_type, state.moves ?? 0, gamelogText, state);
    if (state === game)
        note_unported('pline.c livelog_add');
}
