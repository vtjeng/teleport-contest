// cfgfiles.js -- Configuration-file error reporting.
// C refs: cfgfiles.c set_configfile_name(), get_configfile(),
// config_error_init(), config_error_nextline(), config_erradd() and
// config_error_done(); pline.c config_error_add().

import { game } from './gstate.js';

// C ref: cfgfiles.c default_configfile (126-139), the UNIX arm.
export const DEFAULT_CONFIGFILE = '.nethackrc';

// C ref: cfgfiles.c get_configfile().  set_configfile_name() stores the path
// fopen_config_file() opened, which on UNIX is "$HOME/.nethackrc".  A segment
// carries its configuration as text (js/jsmain.js runSegment()), never a path,
// so nothing here can learn $HOME and the port keeps the bare default name.
// state.configfile is the one place that path lives, and both of C's readers
// come through here: js/tutorial_startup.js ask_do_tutorial() prints
// nh_basename() of it and is unaffected by the missing $HOME, while
// config_error_done() below prints the whole path and cannot match a
// recording.
export function get_configfile(state = game) {
    return state?.configfile ?? DEFAULT_CONFIGFILE;
}

// C ref: cfgfiles.c struct _config_error_frame (1455-1464) and
// config_error_init().  Its other two arguments distinguish frames this port
// cannot open: `secure` is CONFIG_ERROR_SECURE, which rcfile() (1943) passes
// only for a configuration file named on the command line or in
// NETHACKOPTIONS, and `sourcename` names that file or "command line".  A
// segment supplies its configuration as text and nothing else
// (js/jsmain.js runSegment()), so every frame is the default ~/.nethackrc one,
// with a null source and secure clear.
//
// C prints each error the moment config_error_add() receives it.  pline() is
// raw_print() this early because iflags.window_inited is still false
// (pline.c:239), and no input boundary separates the first error from the
// wait_synch() that config_error_done() ends on, so the strings C hands
// pline() are queued here in order and js/jsmain.js emits them at that
// boundary instead.
export function config_error_init() {
    return {
        line_num: 0,
        num_errors: 0,
        origline_shown: false,
        origline: '',
        output: [],
    };
}

// C ref: cfgfiles.c config_error_nextline(), called from parse_conf_buf() once
// per physical line.  Its false answer, which abandons the rest of the file,
// belongs to a secure frame that has already reported an error; the null-frame
// answer beside it is for a caller reached outside a configuration read, and
// every caller here holds the frame parseNethackrc() built.
export function config_error_nextline(frame, line) {
    frame.line_num += 1;
    frame.origline_shown = false;
    frame.origline = line ?? '';
    return true;
}

// C ref: pline.c config_error_add(), whose vconfig_error_add() formats the
// message and hands it to cfgfiles.c config_erradd() (1543-1589).
// program_state.config_error_ready is true for the whole rc read, so the early
// pline()-and-return arm at 1557 belongs to the interactive 'O' command rather
// than to this path, and iflags.in_lua is false outside a Lua callback.
export function config_error_add(frame, str) {
    const buf = str || 'Unknown error';
    // config_erradd() adds a period unless the message already ends in one of
    // these three, and appends it to the message rather than to buf[].
    const punct = '.!?'.includes(buf[buf.length - 1]) ? '' : '.';

    frame.num_errors += 1;
    if (!frame.origline_shown) {
        frame.output.push(`\n${frame.origline}`);
        frame.origline_shown = true;
    }
    // The line number is absent until config_error_nextline() has accepted a
    // line, which "Line too long, skipping" on the first line beats.
    const lineno = frame.line_num > 0 ? `Line ${frame.line_num}: ` : '';
    frame.output.push(` * ${lineno}${buf}${punct}`);
}

// C ref: cfgfiles.c config_error_done().  Returns the error count; a caller
// that gets a nonzero one owes the wait_synch() that follows the summary in C,
// which js/jsmain.js supplies.  The "on" wording belongs to the command-line
// source the paragraph above rules out.  USER_SOUNDS is undefined for this
// build, but gn.no_sound_notified stays zero unless a SOUND or SOUNDDIR
// statement is read, and js/options.js dispatches neither.
export function config_error_done(frame, state = game) {
    const n = frame.num_errors;
    if (n) {
        // hacklib.h plur(x): "" for one, "s" otherwise.
        frame.output.push(
            `\n${n} error${n === 1 ? '' : 's'} in ${get_configfile(state)}.\n`,
        );
    }
    return n;
}
