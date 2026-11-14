// C ref: report.c, the CRASHREPORT functions that the game reaches.
// submit_web_report() and dobugreport() are ported. The rest of report.c
// (crashreport_init(), crashreport_bidshow(), the panictrace helpers) serves
// panic and crash handling, which the port does not reach.
import { DEVTEAM_URL, ECMD_OK } from './const.js';
import { game } from './gstate.js';
import { ttyPline } from './tty_message.js';

// C ref: report.c submit_web_report() (289-428). The function returns FALSE
// at once unless sysopt.crashreporturl is set. Only cfgfiles.c
// cnf_line_CRASHREPORTURL(), the SYSCF reader of the CRASHREPORTURL line,
// sets it. The recorder defines SYSCF (include/config.h), but its sysconf
// leaves the CRASHREPORTURL line commented out, so sysopt.crashreporturl
// keeps sys.c sys_early_init()'s NULL. The port has no other writer of
// sysopt.crashreporturl, so the remainder, which builds a URL and runs a
// browser helper program, is unreachable.
export function submit_web_report(cos, msg, why, state = game) {
    if (!state.sysopt?.crashreporturl) return false;
    throw new Error('report.c submit_web_report: sysopt.crashreporturl is '
        + 'never set in this port');
}

// C ref: report.c dobugreport() (460-471), the #bugreport command.
export async function dobugreport(state = game) {
    if (!submit_web_report(2, null, '#bugreport command', state)) {
        const url = state.sysopt?.crashreporturl;
        await ttyPline(
            `Unable to send bug report.  Please visit ${url ? url : DEVTEAM_URL} instead.`,
            state,
        );
    }
    return ECMD_OK;
}
