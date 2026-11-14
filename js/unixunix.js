// unixunix.js -- the '!' shell escape and file-name cleanup from
// sys/unix/unixunix.c, and the uid the recorder's process runs under.
// C ref: sys/unix/unixunix.c dosh(), regularize().

import { game } from './gstate.js';

// C ref: sys/unix/unixunix.c dosh() (344-365), compiled with SYSCF. C runs
// a shell only when sysopt.shellers names the user. The recorder's sysconf
// leaves SHELLERS unset and sysconf is not a session input, so nothing in
// js/ sets sysopt.shellers and C always takes this arm.
export async function dosh(state = game) {
    // Loaded on use: js/files.js imports this module for regularize(), and
    // a static import of the tty layer would close an import cycle.
    const { ttyNorep } = await import('./tty_message.js');
    /* FIXME: should no longer assume a particular command keystroke */
    await ttyNorep("Unavailable command '!'.", state);
    return 0;
}

// The value getuid() answers for the recorder's process. files.c puts it in
// every save file name and topten.c records it in each score entry; the port
// has no process, so every game shares this one value.
export const RECORDER_UID = 501;

// C ref: sys/unix/unixunix.c regularize() (296-325). Turns each '.', '/' and
// ' ' into '_'. The SYSV 14-character cut that follows is compiled out on
// LINUX, the recorder's build.
export function regularize(s) {
    return String(s).replace(/[./ ]/gu, '_');
}
