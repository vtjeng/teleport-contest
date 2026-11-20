// unixunix.js -- the '!' shell escape, the panic-save question and file-name
// cleanup from sys/unix/unixunix.c, and the uid the recorder's process runs
// under.
// C ref: sys/unix/unixunix.c dosh(), ask_about_panic_save(), regularize().

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

// C ref: sys/unix/unixunix.c ask_about_panic_save() (262-292), compiled
// under CHECK_PANIC_SAVE (include/unixconf.h:134). unixmain.c calls it before
// newgame() when there is no save file to restore and check_panic_save()
// finds the ".e" file an earlier segment's panic() wrote. The windows are up
// by then (init_sound_disp_gamewindows() precedes attempt_restore), so the
// raw_printf() and getchar() arm for !iflags.window_inited is not reached.
// Any answer but 'y' ends the program; delete_levelfile(0) and
// unlock_file(HLOCK) remove only the lock files, which the port does not
// keep. The panic save file stays, so a later game under the name asks again.
export async function ask_about_panic_save(state = game) {
    // Loaded on use, as in dosh().
    const { ttyPline } = await import('./tty_message.js');
    const { yn_function } = await import('./cmd.js');
    const { tty_exit_nhwindows } = await import('./wintty.js');
    const { nh_terminate } = await import('./end.js');
    await ttyPline('There is no regular save file but there is a panic one.', state);
    await ttyPline('It might be recoverable with demi-divine intervention.', state);
    const c = await yn_function('Start a new game instead?', 'yn\x1bq', 'n', false,
        state, { sharedResp: false });
    if (c !== 'y') {
        if (state.iflags?.window_inited) tty_exit_nhwindows(null, state);
        await nh_terminate(state);
    }
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
