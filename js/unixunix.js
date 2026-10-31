// unixunix.js -- the '!' shell escape from sys/unix/unixunix.c.
// C ref: sys/unix/unixunix.c dosh().

import { game } from './gstate.js';
import { ttyNorep } from './tty_message.js';
import { note_unported } from './unported.js';
import { check_user_string } from './unixmain.js';

// C ref: sys/unix/unixunix.c dosh() (344-365), compiled with SYSCF. The
// recorder's sysconf leaves SHELLERS unset, so sysopt.shellers is null and the
// command reports itself unavailable. The child() fork and exec that follow
// an authorized check have no browser equivalent, so that branch records the
// discarded call and returns 0 as C does after the shell exits.
export async function dosh(state = game) {
    const shellers = state.sysopt?.shellers;
    if (!shellers || !shellers[0] || !check_user_string(shellers, state)) {
        /* FIXME: should no longer assume a particular command keystroke */
        await ttyNorep("Unavailable command '!'.", state);
        return 0;
    }
    note_unported('sys/unix/unixunix.c child');
    return 0;
}
