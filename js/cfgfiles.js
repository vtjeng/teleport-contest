// cfgfiles.js -- Configuration-file error reporting.
// C refs: cfgfiles.c set_configfile_name(), get_configfile(),
// config_error_init(), config_error_nextline(), config_erradd() and
// config_error_done(); pline.c config_error_add().

import { game } from './gstate.js';
import {
    bytesText,
    encodeUtf8Text,
    lcase,
    mungspaces,
    textBytes,
    trimspaces,
    truncateByteString,
} from './hacklib.js';
import {
    BUFSZ,
    ECMD_OK,
    PREFIX_COUNT,
    WARNCOUNT,
    WIZKIT_MAX,
} from './const.js';
import { add_menu_coloring } from './coloratt.js';
import { get_feature_notice_ver } from './version.js';
import { rn2 } from './rng.js';

// C ref: cfgfiles.c default_configfile (126-139), the UNIX arm.
export const DEFAULT_CONFIGFILE = '.nethackrc';

// The recorder's documented HOME (docs/recording-environment.md) is the
// process environment used by the C harness.  cfgfiles.c fopen_config_file()
// stores HOME/.nethackrc in its configfile buffer; keep this one global
// environment value in the source-owned cfgfiles module so startup and every
// diagnostic reader use the same path.
export const RECORDER_HOME =
    '/Users/davidbau/git/mazesofmenace/teleport/maud/test/comparison/c-harness/results';
export const RECORDER_CONFIGFILE = `${RECORDER_HOME}/${DEFAULT_CONFIGFILE}`;

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
// fopen_config_file() opened, which on the recorder UNIX build is
// RECORDER_HOME/.nethackrc.  state.configfile is the one place that path
// lives, and both of C's readers come through here: tutorial startup takes
// its basename while config errors and option help print the whole path.
export function get_configfile(state = game) {
    return state?.configfile ?? get_default_configfile();
}

// C ref: cfgfiles.c do_write_config_file() (169-212).  The browser and the
// scorer provide configuration as segment text, not as a host pathname.  This
// function preserves the messages, waits, overwrite decision, and return code;
// after the decision, the unavailable fopen()/fwrite() side is an explicit gap.
// C calls pline(), wait_synch() and cmd.c paranoid_query() directly; `env`
// overrides them only in tests.  They are imported at call time because
// tty_message.js and cmd.js import options.js, which imports this module.
export async function do_write_config_file(state = game, env = {}) {
    const message = env.message
        ?? (await import('./tty_message.js')).ttyPline;
    const wait = env.wait
        ?? (await import('./tty_rawprint.js')).tty_wait_synch;
    const query = env.query ?? (await import('./cmd.js')).paranoid_query;
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
    if (!await query(true, prompt, state)) return ECMD_OK;

    // cfgfiles.c:194-208 writes all_options_strbuf() to configfile. Nothing
    // reads that file again: C reads it only at startup (cfgfiles.c:1944,
    // options.c:7327 rcfile()), and the recorder rewrites HOME/.nethackrc from
    // the session before each segment starts (scripts/record-session.mjs:547).
    // The partial-write message needs a failing host write.
    return ECMD_OK;
}

// C ref: cfgfiles.c set_configfile_name() (216-220).  configfile is a fixed
// BUFSZ-byte C buffer; truncate by UTF-8 bytes and leave one byte for NUL.
export function set_configfile_name(fname, state = game) {
    state.configfile = truncateByteString(String(fname ?? ''), BUFSZ - 1);
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
// config_error_init().  `secure` is CONFIG_ERROR_SECURE, which rcfile()
// (1943) passes only for a configuration file named on the command line or
// in NETHACKOPTIONS; a segment supplies its configuration as text and nothing
// else (js/jsmain.js runSegment()), so secure is always clear.  `sourcename`
// is empty for the default ~/.nethackrc frame and "WIZKIT" for
// files.c read_wizkit()'s; C copies at most BUFSZ - 1 bytes of it.
//
// C prints each error the moment config_error_add() receives it. pline() is
// raw_print() this early because iflags.window_inited is still false
// (pline.c:239). startupEvents preserves that source order when another rc
// handler waits before config_error_done(); output remains the complete error
// report used by parser callers and focused tests.
export function config_error_init(startupEvents = [], sourcename = '') {
    return {
        source: truncateByteString(sourcename ?? '', BUFSZ - 1),
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
// which js/jsmain.js and files.js read_wizkit() supply.  The "on" wording
// belongs to the command-line source config_error_init() rules out.  USER_SOUNDS is undefined for this
// build, but gn.no_sound_notified stays zero unless a SOUND or SOUNDDIR
// statement is read, and js/options.js dispatches neither.
export function config_error_done(frame, state = game) {
    const n = frame.num_errors;
    if (n) {
        // hacklib.h plur(x): "" for one, "s" otherwise.
        appendConfigOutput(
            frame,
            `\n${n} error${n === 1 ? '' : 's'} in ${
                frame.source || get_configfile(state)}.\n`,
        );
    }
    return n;
}

const CONFIG_BUFFER_BYTE_CAPACITY = 4 * 256; // cfgfiles.c: 4 * BUFSZ

// C ref: cfgfiles.c find_optparam() (587-598): the first '=' or, when it
// comes earlier, the first ':'.  Answers its index, or -1 for C's NULL.
export function find_optparam(line) {
    const colon = line.indexOf(':');
    const equals = line.indexOf('=');
    if (colon >= 0 && equals >= 0) return Math.min(colon, equals);
    return Math.max(colon, equals);
}

// C ref: cfgfiles.c match_varname(), options.c match_optname() with
// is_alias TRUE, applied to a lower-cased statement name.
export function matchesConfigName(name, canonical, minLength) {
    return name.length >= minLength && canonical.startsWith(name);
}

// C ref: cfgfiles.c:parse_conf_buf().  A physical line ending in a literal
// backslash continues onto the next non-comment text with one separating
// space.  Ignored lines without their own continuation terminate a pending
// logical line, matching the parser's p->buf lifetime.
//
// This yields rather than returns a list, because parse_conf_file() alternates
// between reading a line and handing a completed statement to its proc.  An
// error the proc reports is stamped with the line and text the frame is
// holding at that moment, and both move on the next physical line.
function* logicalConfigLines(rc, frame) {
    const input = encodeUtf8Text(rc);
    let buffered = null;
    let cursor = 0;
    let skip = false;

    while (cursor < input.length) {
        const chunk = [];
        while (cursor < input.length
               && chunk.length < CONFIG_BUFFER_BYTE_CAPACITY - 1) {
            const byte = input[cursor++];
            chunk.push(byte);
            if (byte === 0x0A) break;
        }

        let cLength = chunk.length;
        let newline = -1;
        for (let index = 0; index < chunk.length; ++index) {
            if (chunk[index] === 0) {
                cLength = index;
                break;
            }
            if (chunk[index] === 0x0A) {
                newline = index;
                break;
            }
        }

        if (skip) {
            if (newline >= 0) skip = false;
            continue;
        }

        if (newline < 0
            && cLength >= CONFIG_BUFFER_BYTE_CAPACITY - 2) {
            // parse_conf_buf() reports this non-fatally, then discards input
            // through the next visible newline.  The error lands on whichever
            // line config_error_nextline() last accepted, because this one
            // never reaches it.
            config_error_add(frame, 'Line too long, skipping');
            skip = true;
            continue;
        }

        let line = chunk.slice(0, newline >= 0 ? newline : cLength);
        const continued = line.at(-1) === 0x5C;
        if (continued) {
            // parse_conf_buf() leaves its end pointer on the new NUL, so
            // spaces before a continuation backslash remain in the buffer.
            line.pop();
        } else {
            while ([0x20, 0x09, 0x0D].includes(line.at(-1))) line.pop();
        }
        // parse_conf_buf() reports the line to the error frame here, before
        // the leading whitespace is stepped over, so a reported line keeps its
        // indent.  A false answer abandons the rest of the file.
        if (!config_error_nextline(frame, bytesText(line))) return;
        const lineNumber = frame.line_num;
        while (line[0] === 0x20 || line[0] === 0x09) line.shift();

        const ignored = line.length === 0 || line[0] === 0x23;
        const hadBuffered = buffered !== null;

        if (!ignored) {
            buffered = hadBuffered
                ? [...buffered, 0x20, ...line]
                : line;
            if (buffered.length >= CONFIG_BUFFER_BYTE_CAPACITY)
                buffered.length = CONFIG_BUFFER_BYTE_CAPACITY - 1;
        }
        if (continued || (ignored && !hadBuffered)) continue;

        yield {
            line: bytesText(buffered),
            lineNumber,
        };
        buffered = null;
    }
}

// C ref: cfgfiles.c parse_conf_file() (1844-1861) and the statement half of
// parse_conf_buf() (1767-1806).  C calls proc for each statement that is not
// a section header, a line of a section CHOOSE did not pick, or a CHOOSE
// line; this generator yields each such statement to the caller's loop
// instead, so that read_config_file()'s parse_config_line(), which never
// waits, and files.c read_wizkit()'s proc_wizkit_line(), which does, share
// it.  `state.gc` holds C's gc.config_section_* and `state.configErrorFrame`
// the frame config_error_init() pushed.  Each yielded value is the statement
// text and the physical line number it ended on.  free_config_sections() runs
// before the first line and after the last, as in C.
export function* parse_conf_file(rc, state = game, random = rn2) {
    const frame = state.configErrorFrame;
    free_config_sections(state);
    try {
        for (const configLine of logicalConfigLines(rc, frame)) {
            // handle_config_section() receives p->buf; is_config_section()
            // applies trimspaces() before checking for '['.
            if (handle_config_section(configLine.line, state)) continue;

            const paddingTrimmedLine = trimspaces(configLine.line);
            const mungedLine = mungspaces(paddingTrimmedLine);
            const delimiter = find_optparam(mungedLine);
            const statementNameText = delimiter >= 0
                ? mungedLine.slice(0, delimiter) : mungedLine;
            const statementName = lcase(mungspaces(statementNameText));
            if (matchesConfigName(statementName, 'choose', 6)) {
                // cfgfiles.c parse_conf_buf():1775-1798.  Both error arms
                // leave gc.config_section_chosen null, which is what makes
                // every later section header the "without CHOOSE" case.
                if (delimiter < 0) {
                    config_error_add(
                        frame, 'Format is CHOOSE=section1,section2,...',
                    );
                    continue;
                }
                state.gc.config_section_chosen = null;
                const rawDelimiter = find_optparam(paddingTrimmedLine);
                state.gc.config_section_chosen = choose_random_part(
                    paddingTrimmedLine.slice(rawDelimiter + 1), ',', random,
                );
                if (state.gc.config_section_chosen == null)
                    config_error_add(frame, 'No config section to choose');
                continue;
            }
            yield configLine;
        }
    } finally {
        free_config_sections(state);
    }
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
    const bytes = textBytes(String(bufp ?? ''));
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
        result.startupEvents.push({ text, raw_printf: true, wait: true });
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
        result.startupEvents.push({ text, raw_printf: true, wait: true });
    });
    assignWarnings(result, parsed);
    return true;
}

// C ref: cfgfiles.c cnf_line_WIZKIT(): strncpy(gw.wizkit, bufp,
// WIZKIT_MAX - 1), so the name keeps at most 127 bytes.
export function cnf_line_WIZKIT(result, bufp) {
    result.wizkit = truncateByteString(bufp, WIZKIT_MAX - 1);
}
