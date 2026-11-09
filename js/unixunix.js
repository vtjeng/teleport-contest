// unixunix.js -- the '!' shell escape from sys/unix/unixunix.c.
// C ref: sys/unix/unixunix.c dosh().

import { game } from './gstate.js';
import { ttyNorep } from './tty_message.js';

// C ref: sys/unix/unixunix.c dosh() (344-365), compiled with SYSCF. C runs
// a shell only when sysopt.shellers names the user. The recorder's sysconf
// leaves SHELLERS unset and sysconf is not a session input, so nothing in
// js/ sets sysopt.shellers and C always takes this arm.
export async function dosh(state = game) {
    /* FIXME: should no longer assume a particular command keystroke */
    await ttyNorep("Unavailable command '!'.", state);
    return 0;
}
