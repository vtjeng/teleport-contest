// ioctl.js -- the ^Z suspend command from sys/share/ioctl.c.
// C ref: sys/share/ioctl.c dosuspend().

import { game } from './gstate.js';
import { ttyNorep } from './tty_message.js';

// C ref: sys/share/ioctl.c dosuspend() (159-197), compiled with SUSPEND
// (unixconf.h:291) and SYSCF. The game suspends only when sysopt.shellers
// names the user. The recorder's sysconf leaves SHELLERS unset and sysconf is
// not a session input, so nothing in js/ sets sysopt.shellers and C always
// takes this arm, as js/unixunix.js dosh() does for '!'.
export async function dosuspend(state = game) {
    await ttyNorep('Suspend command not available.', state);
    return 0;
}
