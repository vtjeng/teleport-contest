// Formatted game messages from pline.c.

import { PLINE_VERBALIZE } from './const.js';
import { game } from './gstate.js';
import { ttyPline } from './tty_message.js';

// C ref: pline.c verbalize() (476-490). Callers format arguments in source
// order before this helper quotes the line and marks it as speech.
export async function verbalize(line, state = game, { message = ttyPline } = {}) {
    state.gp ??= {};
    state.gp.pline_flags = (state.gp.pline_flags ?? 0) | PLINE_VERBALIZE;
    try {
        await message(`"${line}"`, state);
    } finally {
        state.gp.pline_flags &= ~PLINE_VERBALIZE;
    }
}
