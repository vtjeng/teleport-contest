// cfgfiles.js -- Configuration-file error reporting.
// C refs: cfgfiles.c set_configfile_name(), get_configfile(),
// config_error_init(), config_error_nextline(), config_erradd() and
// config_error_done(); pline.c config_error_add().

import { game } from './gstate.js';
import {
    encodeUtf8ByteString,
    trimspaces,
    truncateByteString,
} from './hacklib.js';
import {
    BUFSZ,
    ECMD_OK,
    PREFIX_COUNT,
    WARNCOUNT,
} from './const.js';
import { add_menu_coloring } from './coloratt.js';
import { get_feature_notice_ver } from './version.js';
import { note_unported } from './unported.js';
import { rn2 } from './rng.js';

// C ref: cfgfiles.c default_configfile (126-139), the UNIX arm.
export const DEFAULT_CONFIGFILE = '.nethackrc';

// C ref: global.h set_in_sysconf (581).  The JavaScript parser receives the
// configuration text directly, so this value is used only when a source-shaped
// fopen_config_file() caller identifies the system configuration path.
export const SET_IN_SYSCONF = 0;

const FEATURE_NOTICE_3_7_0 = Number(get_feature_notice_ver('3.7.0'));
const OVERWRITE_PROMPT_FORMAT = 'Overwrite config file %.*s?';
// C's sizeof overwrite_prompt includes its terminating NUL, and the extra two
// bytes leave room for the formatted string's own terminating NUL and margin.
const OVERWRITE_FILENAME_LIMIT = BUFSZ
    - (OVERWRITE_PROMPT_FORMAT.length + 1) - 2;

// C ref: cfgfiles.c get_default_configfile() (149-152).  The recorder builds
// the UNIX configuration path, whose compiled-in basename is .nethackrc.
export function get_default_configfile() {
    return DEFAULT_CONFIGFILE;
}

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
    return state?.configfile ?? get_default_configfile();
}

// C ref: cfgfiles.c do_write_config_file() (169-212).  The browser and the
// scorer provide configuration as segment text, not as a host pathname.  This
// function preserves the messages, waits, overwrite decision, and return code;
// after the decision, the unavailable fopen()/fwrite() side is an explicit gap.
export async function do_write_config_file(state = game, env = {}) {
    const message = env.message ?? (async () => {});
    const wait = env.wait ?? (async () => {});
    const query = env.query ?? env.paranoidQuery;
    const configfile = state?.configfile ?? '';

    if (!configfile) {
        await message('Strange, could not figure out config file name.', state);
        return ECMD_OK;
    }

    if (Number(state.flags?.suppress_alert ?? 0)
        < FEATURE_NOTICE_3_7_0) {
        await message('Warning: saveoptions is highly experimental!', state);
        await wait(state);
        await message('Some settings are not saved!', state);
        await wait(state);
        await message(
            'All manual customization and comments are removed from the file!',
            state,
        );
        await wait(state);
    }

    const filename = truncateByteString(
        configfile, OVERWRITE_FILENAME_LIMIT,
    );
    const prompt = `Overwrite config file ${filename}?`;
    // cmd.c paranoid_query(TRUE, ...) is the source's input operation.  Keep
    // it injectable so tests can exercise both answers without making this
    // leaf import cmd.js (which would close options.js's import cycle).
    if (typeof query !== 'function') {
        note_unported('cmd.c paranoid_query');
        return ECMD_OK;
    }
    if (!await query(true, prompt, state)) return ECMD_OK;

    // C now opens configfile for writing and serializes all_options_strbuf().
    // JavaScript has no host filesystem in the contest runtime, so do not
    // invent a pathname or a second configuration store for this operation.
    note_unported('cfgfiles.c fopen');
    return ECMD_OK;
}

// C ref: cfgfiles.c set_configfile_name() (216-220).  configfile is a fixed
// BUFSZ-byte C buffer; truncate by UTF-8 bytes and leave one byte for NUL.
export function set_configfile_name(fname, state = game) {
    state.configfile = truncateByteString(String(fname ?? ''), BUFSZ - 1);
}

// C ref: cfgfiles.c fopen_config_file() (223-370).  parseNethackrc() already
// has the configuration text, so this source-shaped helper never reads a host
// file.  It still follows the UNIX name-selection order and leaves the selected
// name in state.configfile for diagnostics and option messages.
export function fopen_config_file(filename, src, state = game) {
    const supplied = filename != null && String(filename).length > 0;
    if (src === SET_IN_SYSCONF) {
        if (supplied) {
            // fqname() would add the compiled system prefix. That prefix is
            // not part of the text-backed segment input, so retain the name
            // the caller supplied while recording the skipped open.
            set_configfile_name(filename, state);
            note_unported('cfgfiles.c fopen');
        }
        return null;
    }

    if (supplied) {
        // The UNIX ~/ expansion depends on HOME, which the browser contract
        // does not expose. Keep the source spelling in the diagnostic state.
        set_configfile_name(filename, state);
        note_unported('cfgfiles.c fopen');
    }

    // UNIX falls through to $HOME/.nethackrc; without a host HOME value the
    // text-backed equivalent is the compiled-in basename. There is no FILE*
    // to return because the segment supplied the text independently.
    set_configfile_name(get_default_configfile(), state);
    note_unported('cfgfiles.c fopen');
    return null;
}

// C ref: cfgfiles.c adjust_prefix() (441-459), compiled under
// NOCWD_ASSUMPTIONS.  The contest runtime is the UNIX build, so the WIN32
// fqn_prefix_locked[] guard is not part of this path.  JavaScript strings are
// immutable; the C input buffer's trailing `;n` is therefore represented by
// the shortened value stored in gf.fqn_prefix rather than by an in-place edit.
export function adjust_prefix(bufp, prefixid, state = game) {
    if (bufp == null) return;

    const prefix = String(bufp).split(';', 1)[0];
    if (!prefix) return;

    state.gf ??= {};
    state.gf.fqn_prefix ??= Array(PREFIX_COUNT).fill(null);
    // C's UNIX append_slash() appends '/', unless the name already ends in
    // one.  It is a void system helper, so preserve its observable mutation
    // here rather than creating a second public helper for it.
    state.gf.fqn_prefix[prefixid] = prefix.endsWith('/')
        ? prefix : `${prefix}/`;
}

// C ref: cfgfiles.c choose_random_part() (464-504).  The source walks the
// mutable NUL-terminated buffer one separator at a time, so empty candidates
// at the beginning or end still consume a random choice and return NULL.  A
// JavaScript string cannot be NUL-terminated or modified in place; the
// selected substring is the value the C callers immediately duplicate.
export function choose_random_part(str, sep = ',', random = rn2) {
    if (str == null) return null;

    const value = String(str);
    let nsep = 1;
    for (const character of value) {
        if (character === sep) ++nsep;
    }

    const csep = random(nsep);
    let remaining = csep;
    let index = 0;
    while (remaining > 0 && index < value.length) {
        ++index;
        if (value[index] === sep) --remaining;
    }
    if (index < value.length) {
        if (value[index] === sep) ++index;
        const begin = index;
        while (index < value.length && value[index] !== sep) ++index;
        if (index > begin) return value.slice(begin, index);
    }
    return null;
}

// C ref: cfgfiles.c free_config_sections() (507-517).  The C free() calls
// release allocated strings; JavaScript strings are garbage-collected, so
// clearing both owning fields is the corresponding state mutation.
export function free_config_sections(state = game) {
    state.gc ??= {};
    state.gc.config_section_chosen = null;
    state.gc.config_section_current = null;
}

// C ref: cfgfiles.c is_config_section() (519-549).  The returned empty string
// is significant: C returns a non-NULL pointer for `[]`, and
// handle_config_section() treats that as the end-of-sections marker.
export function is_config_section(str) {
    if (str == null) return null;

    const trimmed = trimspaces(String(str));
    if (trimmed[0] !== '[') return null;

    const body = trimmed.slice(1);
    const close = body.indexOf(']');
    if (close < 0) return null;

    // cfgfiles.c skips only literal spaces after ']'; a tab there is not a
    // valid section suffix.  A comment may contain anything after '#'.
    let suffix = close + 1;
    while (body[suffix] === ' ') ++suffix;
    if (suffix < body.length && body[suffix] !== '#') return null;

    return trimspaces(body.slice(0, close));
}

function section_config_error(state, text) {
    state.configErrorFrame ??= config_error_init(state.startupEvents ?? []);
    config_error_add(state.configErrorFrame, text);
}

// C ref: cfgfiles.c handle_config_section() (552-581).  `state` is the
// parser result during parseNethackrc(), where its gc object is the JS home of
// C's instance_globals_c fields.  It is also accepted explicitly for focused
// tests and future cfgfiles.c callers.
export function handle_config_section(buf, state = game) {
    state.gc ??= {};
    const sect = is_config_section(buf);

    if (sect !== null) {
        state.gc.config_section_current = null;
        if (state.gc.config_section_chosen == null) {
            section_config_error(
                state, `Section "[${sect}]" without CHOOSE`,
            );
            return true;
        }
        if (sect) {
            // C uses dupstr() here; an immutable JS string already has the
            // required independent value semantics.
            state.gc.config_section_current = String(sect);
        } else {
            free_config_sections(state);
        }
        return true;
    }

    if (state.gc.config_section_current != null) {
        if (state.gc.config_section_chosen == null) return true;
        if (state.gc.config_section_current
            !== state.gc.config_section_chosen) return true;
    }
    return false;
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
// C prints each error the moment config_error_add() receives it. pline() is
// raw_print() this early because iflags.window_inited is still false
// (pline.c:239). startupEvents preserves that source order when another rc
// handler waits before config_error_done(); output remains the complete error
// report used by parser callers and focused tests.
export function config_error_init(startupEvents = []) {
    return {
        line_num: 0,
        num_errors: 0,
        origline_shown: false,
        origline: '',
        output: [],
        startupEvents,
    };
}

function appendConfigOutput(frame, text) {
    frame.output.push(text);
    frame.startupEvents?.push({ text });
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
        appendConfigOutput(frame, `\n${frame.origline}`);
        frame.origline_shown = true;
    }
    // The line number is absent until config_error_nextline() has accepted a
    // line, which "Line too long, skipping" on the first line beats.
    const lineno = frame.line_num > 0 ? `Line ${frame.line_num}: ` : '';
    appendConfigOutput(frame, ` * ${lineno}${buf}${punct}`);
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
        appendConfigOutput(
            frame,
            `\n${n} error${n === 1 ? '' : 's'} in ${get_configfile(state)}.\n`,
        );
    }
    return n;
}

// C ref: cfgfiles.c get_uchars(). The caller supplies a byte array because the
// source writes through an `uchar *`. Decimal accumulation uses unsigned-int
// arithmetic, then assignment narrows to one byte. In modification mode a
// literal zero leaves the slot unchanged; otherwise it is installed. The
// scanner returns after `size` values even when more text follows, and a bad
// byte returns without storing the number currently being accumulated.
export function get_uchars(
    bufp, list, modlist, size, name, syntaxError,
) {
    const bytes = encodeUtf8ByteString(String(bufp ?? ''));
    let num = 0;
    let count = 0;
    let havenum = false;
    let index = 0;

    while (true) {
        const byte = index < bytes.length ? bytes[index] : 0;
        // parse_config_line() has already run mungspaces(), so tabs became
        // spaces and a physical newline became this buffer's terminating NUL.
        if (byte === 0x00 || byte === 0x20
            || byte === 0x09 || byte === 0x0A) {
            if (havenum) {
                if (num !== 0 || !modlist) list[count] = num & 0xFF;
                ++count;
                num = 0;
                havenum = false;
            }
            if (count === size || byte === 0x00) return count;
            index++;
            continue;
        }
        if (byte >= 0x30 && byte <= 0x39) {
            havenum = true;
            num = (num * 10 + byte - 0x30) >>> 0;
            index++;
            continue;
        }
        syntaxError(`Syntax error in ${name}`);
        return count;
    }
}

// C ref: cfgfiles.c cnf_line_BOULDER(). This obsolete statement modifies
// only go.ov_primary_syms; OPTIONS=boulder writes the rogue override too.
export function cnf_line_BOULDER(result, bufp) {
    const parsed = [undefined];
    get_uchars(bufp, parsed, true, 1, 'BOULDER', (text) => {
        result.startupEvents.push({ text, wait: true });
    });
    if (parsed[0] !== undefined) {
        result.symbolOperations.push({
            kind: 'legacy-boulder',
            byte: parsed[0],
        });
    }
    return true;
}

// C ref: cfgfiles.c cnf_line_MENUCOLOR(). coloratt.c owns the parser and list;
// this configuration-file wrapper supplies the active error frame.
export function cnf_line_MENUCOLOR(result, bufp) {
    return add_menu_coloring(result, bufp, (text) => {
        config_error_add(result.configErrorFrame, text);
    });
}

// C ref: cfgfiles.c cnf_line_WARNINGS().
// The direct statement parses up to six unsigned decimal values and reports a
// malformed byte immediately, outside the accumulated configuration errors;
// its caller supplies options.c assign_warnings(), preserving that function's
// source-file ownership without an options.js <-> cfgfiles.js import cycle.
export function cnf_line_WARNINGS(result, bufp, assignWarnings) {
    // C leaves the MAXPCHARS automatic array uninitialized. Model the bytes
    // get_uchars() actually defines, not compiler stack garbage outside the C
    // language contract. Tests deliberately leave a short or malformed
    // input's unwritten gw tail unspecified.
    const parsed = Array(WARNCOUNT).fill(0);
    get_uchars(bufp, parsed, false, WARNCOUNT, 'WARNINGS', (text) => {
        result.startupEvents.push({ text, wait: true });
    });
    assignWarnings(result, parsed);
    return true;
}
