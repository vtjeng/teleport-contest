// pline.js -- message-prefix and chronicle functions owned by pline.c.
//
// C refs: pline.c gamelog_add() (495-512) and livelog_printf() (515-528).
// The browser port has no external live-log sink, but the chronicle linked
// list is game state because insight.c #chronicle reads it.

import { game } from './gstate.js';
import { livelog_add } from './files.js';
import { truncateByteString } from './hacklib.js';
import { BUFSZ, DEAF, PLINE_VERBALIZE } from './const.js';
import { is_fainted } from './eat.js';
import { unconscious } from './trap.js';
import { messageAt } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';

// C refs: pline.c You_hear() (436-451), youprop.h Deaf/Unaware, and
// trap.c unconscious(). C's Deaf macro includes timeout, worn and roleplay
// deafness; Unaware requires both negative multi and an insensible state.
export function heroDeaf(state = game) {
    const deaf = state.u?.uprops?.[DEAF];
    return Boolean(deaf?.intrinsic || deaf?.extrinsic
        || state.u?.uroleplay?.deaf);
}

export function heroUnaware(state = game) {
    return Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || is_fainted(state));
}

// C builds the prefix before vpline() formats the caller's variadic suffix.
// JS callers pass the already-formatted suffix and deliver the resulting line
// through their ordinary pline callback, preserving its wait/boundary order.
export function youHear(line, state = game) {
    if ((heroDeaf(state) && !heroUnaware(state)) || !state.flags?.acoustics)
        return null;
    if (state.u?.uinwater) return `You barely hear ${line}`;
    if (heroUnaware(state)) return `You dream that you hear ${line}`;
    return `You hear ${line}`;
}

// C ref: pline.c pline_mon() (138-152). The C helper sets the message
// position to the monster square, except for the hero monster at (0, 0), then
// delegates to vpline(). messageAt() carries that location into accessible
// output while the normal TTY path receives the unchanged formatted line.
export async function pline_mon(monster, line, state = game, env = {}) {
    const x = monster === state.youmonst ? 0 : monster.mx;
    const y = monster === state.youmonst ? 0 : monster.my;
    const message = env.message ?? ttyPline;
    await message(messageAt(line, x, y, state), state, env);
}

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
