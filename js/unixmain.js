// unixmain.js -- Unix account checks from sys/unix/unixmain.c.
// C ref: sys/unix/unixmain.c check_user_string().

import { game } from './gstate.js';

// The account name sys/unix/unixmain.c get_unix_pw() would answer for the
// recorder's process. jsmain.js RECORDER_ACCOUNT holds the same stand-in for
// options.c set_playmode(); a segment's loginName overrides it in tests.
function get_unix_pw_name(state) {
    return String(state.loginName ?? 'root');
}

// C ref: sys/unix/unixmain.c check_user_string() (696-730). The option string
// is a whitespace-separated list of account names, or '*' for every account.
// The name compared is the player's name when sysconf sets CHECK_PLNAME and
// the process's Unix account otherwise.
export function check_user_string(optstr, state = game) {
    if (optstr[0] === '*') return true; /* allow any user */
    const pwname = state.sysopt?.check_plname
        ? state.plname : get_unix_pw_name(state);
    if (!pwname) return false;
    const pwlen = pwname.length;
    let w = 0;
    while (w + pwlen <= optstr.length) {
        if (!optstr[w]) break;
        if (/\s/u.test(optstr[w])) {
            w++;
            continue;
        }
        if (optstr.startsWith(pwname, w)) {
            if (!optstr[w + pwlen] || /\s/u.test(optstr[w + pwlen]))
                return true;
        }
        while (optstr[w] && !/\s/u.test(optstr[w])) w++;
    }
    return false;
}
