// unixmain.js -- command-line options and Unix account checks from
// sys/unix/unixmain.c.
// C ref: sys/unix/unixmain.c process_options(), check_user_string().

import { PL_NSIZ } from './const.js';
import { game } from './gstate.js';
import { truncateByteString, utf8Text } from './hacklib.js';

// The player name the recorder passes to C as "-u <name>".
// scripts/record-session.mjs recordSegment() launches every segment as
// `nethack -u <name>`, where <name> is this parse of the segment's nethackrc
// text, or '' when it finds none; recorderPlayerName() there refuses a name
// that starts with '-'. The session input carries the nethackrc but not the
// argument, so the port repeats this parse; record-session.mjs imports it
// from here so the two cannot differ. Upstream's record-session.mjs
// (davidbau/teleport-contest, 6ee30e6f9) defines the same function, and its
// text is kept verbatim: it, not NetHack's option parser, decides the name.
// It reads the decoded (UTF-8) rc text, so trim() removes Unicode white
// space, a byte-order mark included.
export function parseNethackrcName(rc) {
    if (!rc) return null;
    for (const rawLine of rc.split('\n')) {
        const line = rawLine.trim();
        const upper = line.toUpperCase();
        if (!(upper.startsWith('OPTIONS=') || upper.startsWith('OPTIONS ='))) continue;
        const opts = line.slice(line.indexOf('=') + 1);
        for (const opt of opts.split(',')) {
            const t = opt.trim();
            if (t.toLowerCase().startsWith('name:')) {
                return t.slice('name:'.length).trim();
            }
        }
    }
    return null;
}

// The argument vector the recorder gives NetHack for a segment's nethackrc
// (scripts/record-session.mjs recordSegment(): `['-u', playerName]`).
export function recorderArguments(rc) {
    return ['-u', parseNethackrcName(rc) ?? ''];
}

// C ref: sys/unix/unixmain.c process_options() (328-486). nethack_main()
// calls it after initoptions() and whoami() (unixmain.c:150-170), so a name
// given with -u replaces the one the nethackrc set, and an empty one clears
// it, which leaves plnamesuffix() to ask "Who are you?". Its one caller
// passes recorderArguments(), always ["-u", name], so this covers only the
// 'u' arm's separate-argument branch (389-393). The argument is the UTF-8
// bytes of a decoded string; strncpy() stops at the first NUL and copies at
// most sizeof plname - 1 bytes, and it has no comma stop, unlike nmcpy().
export function process_options([, name], state = game) {
    const bytes = utf8Text(name);
    const nul = bytes.indexOf('\0');
    state.plname = truncateByteString(
        nul < 0 ? bytes : bytes.slice(0, nul), PL_NSIZ - 1);
    state.gp.plnamelen = 0; /* plname[] might have -role-race attached */
}

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
