// pline.js -- message-prefix and chronicle functions owned by pline.c.
//
// C refs: pline.c gamelog_add() (495-512) and livelog_printf() (515-528).
// The browser port has no external live-log sink, but the chronicle linked
// list is game state because insight.c #chronicle reads it.

import { game } from './gstate.js';
import { panic } from './end.js';
import { livelog_add } from './files.js';
import { truncateByteString } from './hacklib.js';
import { BUFSZ, DEVTEAM_EMAIL, PLINE_VERBALIZE } from './const.js';
import { messageAt } from './startup_a11y.js';
import { ttyPline, ttyUrgentPline } from './tty_message.js';
import { isok } from './cmd_isok.js';
import { Blind, Deaf, Unaware } from './youprop.js';



// C builds the prefix before vpline() formats the caller's variadic suffix.
// JS callers pass the already-formatted suffix and deliver the resulting line
// through their ordinary pline callback, preserving its wait/boundary order.
export function youHear(line, state = game) {
    if ((Deaf(state.u) && !Unaware(state)) || !state.flags?.acoustics)
        return null;
    if (state.u?.uinwater) return `You barely hear ${line}`;
    if (Unaware(state)) return `You dream that you hear ${line}`;
    return `You hear ${line}`;
}

// C ref: pline.c You_feel() (388-401). Use the awareness state before
// the sensation's caller changes timeouts or schedules its wakeup message.
// Every port of a You_feel() call builds its line here;
// scripts/you-feel-literal.mjs fails on a hand-written "You feel" in js/
// unless it lists the C call that writes the text without You_feel().
export function youFeel(line, state = game) {
    return `${Unaware(state) ? 'You dream that you feel' : 'You feel'} ${line}`;
}

// C ref: pline.c You_see() (453-470). C's own comment says a caller should
// have caught the Blind case; most callers reach it only behind cansee(),
// which is false while the hero is blind.
export function youSee(line, state = game) {
    if (Unaware(state)) return `You dream that you see ${line}`;
    if (Blind(state.u)) return `You sense ${line}`;
    return `You see ${line}`;
}

// C ref: pline.c pline_mon() (138-152). The C helper sets the message
// position to the monster square, except for the hero monster at (0, 0), then
// delegates to vpline(). messageAt() carries that location into accessible
// output while the normal TTY path receives the unchanged formatted line.
// A port of a C message gives it a location through this function,
// consume_msg_xy() or messageAt() exactly where C's call records one;
// scripts/message-location.mjs fails on a message that differs.
export async function pline_mon(monster, line, state = game, env = {}) {
    const x = monster === state.youmonst ? 0 : monster.mx;
    const y = monster === state.youmonst ? 0 : monster.my;
    const message = env.message ?? ttyPline;
    await message(messageAt(line, x, y, state), state, env);
}

// C ref: pline.c set_msg_xy() (93-97) stores the coordinate for the next
// vpline() call. This port keeps the location in the same a11y state and
// consumes it at the call site that emits the associated message.
export function set_msg_xy(x, y, state = game) {
    state.a11y ??= {};
    state.a11y.msg_loc = { x, y };
}

// C ref: pline.c vpline() (162-176) resets msg_loc before handling each
// message and prefixes a valid location only when accessiblemsg is enabled.
export function consume_msg_xy(line, state = game) {
    const a11y = state.a11y;
    const location = a11y?.msg_loc;
    if (a11y) a11y.msg_loc = { x: 0, y: 0 };
    if (!location || !a11y?.accessiblemsg
        || !isok(location.x, location.y)) return line;
    return messageAt(line, location.x, location.y, state);
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

// C ref: pline.c impossible() (584-633). The caller has already formatted
// the diagnostic. paniclog() only appends to the paniclog file, which the
// port does not write; iflags.debug_fuzzer is never set. The recorder's
// sysconf sets neither SUPPORT nor CRASHREPORTURL, so sysopt.support is read
// as unset and the CRASHREPORT "Report now?" query is never reached.
export async function impossible(text, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const urgentMessage = env.urgentMessage ?? ttyUrgentPline;
    const programState = state.program_state ??= {};
    if (programState.in_impossible)
        await panic('impossible called impossible', state);
    programState.in_impossible = 1;
    try {
        // pbuf[BUFSZ - 1] = '\0'
        await urgentMessage(truncateByteString(text, BUFSZ - 1), state, env);
        if (programState.in_sanity_check) return;
        let disorder = 'Program in disorder!';
        if (programState.something_worth_saving)
            disorder += '  (Saving and reloading may fix this problem.)';
        await message(disorder, state, env);
        await message(`Please report these messages to ${DEVTEAM_EMAIL}.`,
            state, env);
        if (state.sysopt?.support) {
            await message(
                `Alternatively, contact local support: ${state.sysopt.support}`,
                state,
                env,
            );
        }
    } finally {
        programState.in_impossible = 0;
    }
}

// finish_steps()'s onImpossible (js/source_steps.js) for a caller that can
// wait: each impossible() prints where C calls it, and the rest of the body
// runs after it.
export function impossible_printer(state = game, env = {}) {
    return (text) => impossible(text, state, env);
}

// C appends to gg.gamelog and preserves insertion order. The C allocator
// stores the supplied turn separately from the message; retaining that shape
// keeps save/restore source-visible.
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
