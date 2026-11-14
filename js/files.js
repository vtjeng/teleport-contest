// files.js -- Data-file handling shared by configuration readers.
// C refs: files.c nh_basename(), set_savefile_name(), read_sym_file().

import { SYMBOL_SET_DEFINITIONS } from './symbol_data.js';
import { game } from './gstate.js';
import {
    BUFSZ, LFILE_EXISTS, MIGR_NOBREAK, MIGR_NOSCATTER, MIGR_WITH_HERO,
} from './const.js';
import { COIN_CLASS } from './objects.js';
import {
    bytesText, textBytes, mungspaces, lcase, truncateByteString,
} from './hacklib.js';
import { coreRandom } from './rng.js';
import { DAT_LUA_FILES } from './dat_files.js';
import { note_unported } from './unported.js';
import { TRIBUTE_DATA } from './tribute_data.js';
import { RECORDER_UID, regularize } from './unixunix.js';

// C ref: files.c nh_basename() (198-229), the non-VMS arm.  The backslash cut
// at 207-210 is compiled only for WIN32 and MSDOS, so a UNIX build keeps a
// backslash as an ordinary name byte.  `keepSuffix` false truncates at the
// last '.' only when the result fits C's 80-byte static buffer, which is why
// the length is spelled out rather than assumed.
export function nh_basename(fname, keepSuffix) {
    let name = String(fname);
    const slash = name.lastIndexOf('/');
    if (slash >= 0) name = name.slice(slash + 1);
    const dot = name.lastIndexOf('.');
    if (dot >= 0 && !keepSuffix && dot < 80) name = name.slice(0, dot);
    return name;
}

// C ref: files.c set_savefile_name(TRUE) (1020-1123), the UNIX arm:
// "save/<uid><plname>" with regularize() applied after "save/". The recorder
// build defines no SAVE_EXTENSION and no save-file indicator. C stores the
// result in gs.SAVEF; the port returns it, the storage name of the game's
// save file. Every caller reads the current svp.plname, as C does when
// restore_saved_game() and dosave0() name the file.
export function set_savefile_name(state = game) {
    return `save/${regularize(`${RECORDER_UID}${state.plname ?? ''}`)}`;
}

export function isDefaultSymsetName(name) {
    const text = String(name ?? '');
    if (lcase(text) === 'default') return true;
    const folded = lcase(text).replace(/[ _-]/gu, '');
    return folded === 'defaultsymbols';
}

// C ref: files.c read_sym_file().  The scorer installs the generated projection
// of dat/symbols, so opening or parsing that immutable file cannot fail here.
// This covers the function's selected-name/default-alias result; symbols.c owns
// the table and metadata mutations made while the matching block is parsed.
export function read_sym_file(name) {
    if (isDefaultSymsetName(name)) return true;
    const folded = lcase(String(name));
    return SYMBOL_SET_DEFINITIONS.some(
        (definition) => lcase(definition.name) === folded,
    );
}

// C ref: files.c delete_levelfile() (719-730). Level files are in-memory
// snapshots in this port; clearing LFILE_EXISTS is the corresponding unlink.
// Level 0 is always considered present by the C owner, even when its row was
// created by port-specific startup code.
export function delete_levelfile(ledger, state = game) {
    const level = Math.trunc(ledger);
    state.svl ??= {};
    state.svl.level_info ??= [];
    const info = state.svl.level_info[level] ??= { flags: 0 };
    if (level === 0 || (info.flags & LFILE_EXISTS)) {
        info.flags &= ~LFILE_EXISTS;
        // The in-memory snapshot is this port's level-file equivalent.  Keep
        // its lifetime under the same C unlink gate as LFILE_EXISTS.
        delete state._savedLevels?.[level];
    }
}

// C ref: files.c livelog_add() (3667-3719).  C writes the LIVELOG file only
// when sysopt.livelog selects the event type.  sys.c sys_early_init() sets
// LL_NONE and the recorder's sysconf leaves LIVELOG disabled; sysconf is not
// a session input, and jsmain.js set_playmode() is the only writer of
// sysopt.livelog, so C always returns at that first test.
export function livelog_add(_llType, _text, _state = game) {}

const MAXPASSAGES = 30; // SIZE(svc.context.novel.pasg) in context.h.
const SECTION = 1;
const TITLE = 2;
const PASSAGE = 3;

function asciiFold(text) {
    return String(text).replace(/[A-Z]/gu, (character) => (
        String.fromCharCode(character.charCodeAt(0) + 32)
    ));
}

function atoi(text) {
    const match = /^[\t\n\v\f\r ]*([+-]?\d+)/u.exec(text);
    return match ? Number.parseInt(match[1], 10) : 0;
}

function prefixCommand(line, command) {
    return asciiFold(line.slice(1, 1 + command.length))
        === asciiFold(command);
}

// C ref: files.c choose_passage() (3431-3468). It stores a shuffled
// without-replacement sample in svc.context.novel.pasg and selects a passage
// by swapping the last available index into the chosen slot.
export function choose_passage(passagecnt, oid, state = game, random = coreRandom) {
    const count = Math.trunc(passagecnt);
    if (count < 1) return 0;
    if (typeof random.rn2 !== 'function')
        throw new TypeError('choose_passage random source requires rn2');

    // svc.context.novel is this port's state.context.novel, which the save
    // file carries with the rest of svc.context. C zeroes it at startup;
    // the first reading creates the zeroed record here.
    state.context ??= {};
    const novel = state.context.novel ??= {
        id: 0,
        count: 0,
        pasg: Array(MAXPASSAGES).fill(0),
    };
    novel.pasg ??= Array(MAXPASSAGES).fill(0);
    if (oid !== novel.id || novel.count === 0) {
        let range = count;
        let limit = MAXPASSAGES;
        novel.id = oid;
        if (range <= limit) {
            novel.count = count;
            for (let index = 0; index < MAXPASSAGES; index++)
                novel.pasg[index] = index < count ? index + 1 : 0;
        } else {
            novel.count = MAXPASSAGES;
            let idx = 0;
            for (let index = 0; index < count; ++index, --range) {
                if (range > 0 && random.rn2(range) < limit) {
                    novel.pasg[idx++] = index + 1;
                    --limit;
                }
            }
        }
    }

    const index = random.rn2(novel.count);
    const result = novel.pasg[index];
    --novel.count;
    novel.pasg[index] = novel.pasg[novel.count];
    return result;
}

// C ref: files.c read_tribute() (3474-3642). `nowin_buf` is represented by
// `{ value }`, the JavaScript equivalent of the caller-owned C output buffer;
// without it, C builds and displays an NHW_MENU text window.
export async function read_tribute(
    tribsection,
    tribtitle,
    tribpassage,
    nowin_buf,
    bufsz,
    oid,
    state = game,
    env = {},
) {
    if (nowin_buf) nowin_buf.value = '';
    const badTranslation = 'an incomprehensible foreign translation';
    if (!tribsection || !tribtitle) {
        if (!nowin_buf) {
            const message = env.message
                ?? (await import('./tty_message.js')).ttyPline;
            await message(`It's ${badTranslation} of "${tribtitle}"!`, state);
        }
        return false;
    }

    const lines = String(TRIBUTE_DATA).split('\n').map((line) => (
        line.endsWith('\r') ? line.slice(0, -1) : line
    ));
    let scope = 0;
    let passagecnt = 0;
    let targetpassage = 0;
    let matchedsection = false;
    let matchedtitle = false;
    let foundpassage = false;
    let lastline = '';
    const passageLines = [];
    let bufferText = '';

    for (const originalLine of lines) {
        const line = originalLine;
        if (line.startsWith('%')) {
            if (prefixCommand(line, 'section ')) {
                scope = SECTION;
                matchedsection = asciiFold(line.slice(9))
                    === asciiFold(tribsection);
            } else if (prefixCommand(line, 'title ')) {
                const title = line.slice(7);
                const open = title.indexOf('(');
                if (open >= 0) {
                    const normalizedTitle = mungspaces(title.slice(0, open));
                    const close = title.indexOf(')', open + 1);
                    if (close >= 0) {
                        passagecnt = atoi(title.slice(open + 1, close));
                        scope = TITLE;
                        if (matchedsection
                            && asciiFold(normalizedTitle)
                                === asciiFold(tribtitle)) {
                            matchedtitle = true;
                            targetpassage = !tribpassage
                                ? choose_passage(passagecnt, oid, state, env.random ?? coreRandom)
                                : tribpassage <= passagecnt
                                    ? tribpassage : 0;
                        } else {
                            matchedtitle = false;
                        }
                    }
                }
            } else if (prefixCommand(line, 'passage ')) {
                const passagenum = atoi(mungspaces(line.slice(9)));
                if (passagenum > 0 && passagenum <= passagecnt) {
                    scope = PASSAGE;
                    if (matchedtitle && passagenum === targetpassage)
                        foundpassage = true;
                }
            } else if (prefixCommand(line, 'e ')) {
                if (foundpassage) break;
                if (scope === TITLE) matchedtitle = false;
                if (scope === SECTION) matchedsection = false;
                if (scope) --scope;
            }
            continue;
        }
        if (line.startsWith('#') || !foundpassage) continue;
        if (nowin_buf) {
            const maxBytes = Math.max(0, Math.trunc(bufsz) - 1);
            bufferText = bytesText(
                textBytes(line).slice(0, maxBytes),
            );
            nowin_buf.value = bufferText;
            break;
        }
        passageLines.push(line);
        if (line) lastline = line;
    }

    if (nowin_buf) return Boolean(bufferText);
    if (lastline) {
        const displayTextWindow = env.displayTextWindow
            ?? (await import('./tty_menu.js')).displayTtyMenuTextWindow;
        await displayTextWindow(state, passageLines);
        const { tty_putmsghistory } = await import('./topl.js');
        // C files.c read_tribute() puts a numbered attribution in history,
        // even when the passage itself already has an attribution line.
        let attribution = lastline.includes('[')
            ? mungspaces(lastline)
            : `[${tribtitle}, by Terry Pratchett]`;
        const closing = attribution.lastIndexOf(']');
        if (closing >= 0)
            attribution = `${attribution.slice(0, closing)}; passage #${targetpassage}]`;
        tty_putmsghistory(attribution, false, state);
        return true;
    }
    const message = env.message
        ?? (await import('./tty_message.js')).ttyPline;
    await message(`It seems to be ${badTranslation} of "${tribtitle}"!`, state);
    return false;
}

// C ref: files.c Death_quote() (3648-3653), including its fixed non-novel
// identifier used by choose_passage().
export async function Death_quote(buffer, bufsz, state = game, env = {}) {
    return await read_tribute(
        'Death', 'Death Quotes', 0, buffer, bufsz, 1, state, env,
    );
}

// The playground's files other than dat/'s Lua files (sys/unix/Makefile.top
// DAT and VARDIR installs, plus the programs the recorder installs there), and
// its save directory.
const PLAYGROUND_NON_LUA_FILES = new Set([
    'bogusmon', 'cmdhelp', 'data', 'engrave', 'epitaph', 'help', 'hh',
    'history', 'keyhelp', 'license', 'livelog', 'logfile', 'nethack',
    'opthelp', 'options', 'optmenu', 'oracles', 'perm', 'record', 'recover',
    'rumors', 'save', 'symbols', 'sysconf', 'tribute', 'usagehlp', 'wizhelp',
    'xlogfile',
]);

// errno values that path resolution fails with; <errno.h> gives both the
// same numbers on macOS, the judge's host, and on Linux.
const ENOENT = 2;
const ENOTDIR = 20;

// What fopen(name, "r") reaches with C's working directory in the playground,
// following POSIX path resolution: { kind: 'lua', file } for one of dat/'s
// Lua files; 'file' for another playground file; 'directory' for the
// playground or its save directory; 'unknown' for a name the game itself may
// have written ("<lock>.<n>", "bonD0.<n>", anything in save/);
// { kind: 'absent', errno } when resolution fails inside the playground, with
// ENOENT for no such entry and ENOTDIR for a file used as a directory; and
// 'outside' for an absolute name or one that climbs above the playground,
// which reaches a host directory the port cannot read.
export function resolvePlaygroundPath(name) {
    const text = String(name);
    if (text.startsWith('/')) return { kind: 'outside' };
    let dir = 'playground';
    let file = null;
    const parts = text.split('/');
    for (const part of parts) {
        // A file followed by any component, even "." or a trailing slash,
        // fails with ENOTDIR.
        if (file !== null) return { kind: 'absent', errno: ENOTDIR };
        if (part === '' || part === '.') continue;
        if (part === '..') {
            if (dir === 'playground') return { kind: 'outside' };
            dir = 'playground';
        } else if (dir === 'save') {
            return { kind: 'unknown' };
        } else if (part === 'save') {
            dir = 'save';
        } else if (DAT_LUA_FILES.has(part) || PLAYGROUND_NON_LUA_FILES.has(part)) {
            file = part;
        } else if (/\.\d+$/u.test(part)) {
            return { kind: 'unknown' };
        } else {
            return { kind: 'absent', errno: ENOENT };
        }
    }
    if (file === null) return { kind: 'directory' };
    return { kind: DAT_LUA_FILES.has(file) ? 'lua' : 'file', file };
}

// What fopen_wizkit_file()'s fopen("$HOME/<name>", "r") reaches. The
// recorder's HOME holds only the config file it writes before each launch
// (docs/recording-environment.md), so the result is 'file' for that file,
// 'directory' for HOME itself, 'outside' for a name that climbs above HOME,
// and { kind: 'absent', errno } as resolvePlaygroundPath() gives it. C joins
// HOME and the name with "/", so even an absolute name resolves inside HOME.
export function resolveRecorderHomePath(name, configfile) {
    let file = false;
    for (const part of String(name).split('/')) {
        if (file) return { kind: 'absent', errno: ENOTDIR };
        if (part === '' || part === '.') continue;
        if (part === '..') return { kind: 'outside' };
        if (part !== configfile) return { kind: 'absent', errno: ENOENT };
        file = true;
    }
    return { kind: file ? 'file' : 'directory' };
}

// C ref: pline.c raw_printf() followed by tty_wait_synch(). raw_printf() and
// vraw_printf() each count the message until moveloop_preamble() sets
// beyond_savefile_load.
async function wizkit_raw_printf(state, message) {
    const { tty_raw_print, tty_wait_synch } = await import('./tty_rawprint.js');
    tty_raw_print(state, message);
    if (!state.program_state?.beyond_savefile_load) {
        state.ge ??= { early_raw_messages: 0 };
        state.ge.early_raw_messages += 2;
    }
    await tty_wait_synch(state);
}

// C ref: files.c fopen_wizkit_file() (2465-2530), UNIX arm. The WIZKIT
// environment variable is not part of a session's input, and the recorder
// does not set it. access() resolves the name in the playground, C's working
// directory; when it fails, C reports its errno and tries $HOME/<name>, and
// reports any failure there other than ENOENT. The message names the
// judge's HOME, which recorder patch 010 shows in place of the local
// recorder's temporary one.
//
// Answers the text C's stream reads, or null where C returns NULL. A
// directory opens for reading and its first fgets() fails, so it reads as
// empty text. $HOME holds only the config file the recorder writes, whose
// text the segment supplies. The port has no copy of any other playground
// file's bytes, and cannot see a host directory outside the playground or
// HOME, so those names stay a gap.
async function fopen_wizkit_file(state) {
    const name = state.wizkit ?? '';
    if (!name) return null;
    const target = resolvePlaygroundPath(name);
    if (target.kind === 'directory') return '';
    if (target.kind !== 'absent') {
        note_unported('files.c fopen_wizkit_file');
        return null;
    }
    await wizkit_raw_printf(state, `Access to ${name} denied (${target.errno}).`);
    const { DEFAULT_CONFIGFILE, RECORDER_HOME } = await import('./cfgfiles.js');
    const home = resolveRecorderHomePath(name, DEFAULT_CONFIGFILE);
    if (home.kind === 'file') return state.homeConfigText ?? '';
    if (home.kind === 'directory') return '';
    if (home.kind !== 'absent') {
        note_unported('files.c fopen_wizkit_file');
        return null;
    }
    if (home.errno !== ENOENT) {
        await wizkit_raw_printf(state, "Couldn't open default gw.wizkit file "
            + `${RECORDER_HOME}/${name} (${home.errno}).`);
    }
    return null;
}

// C ref: files.c wizkit_addinv() (2533-2556). Adds a wished-for object to
// the hero's inventory, or, when every letter is taken and it would not
// merge, schedules it to arrive with the hero on level 1 of the main
// dungeon, which newgame()'s obj_delivery() then does.
async function wizkit_addinv(obj, state) {
    const { hands_obj, INVLET_BASIC, merge_choice, addinv_runtime }
        = await import('./invent.js');
    if (!obj || obj === hands_obj) return;

    /* subset of starting inventory pre-ID */
    const { observe_object } = await import('./o_init.js');
    observe_object(obj, state);
    const { PM_CLERIC } = await import('./monsters.js');
    if (state.urole?.mnum === PM_CLERIC)
        obj.bknown = 1; /* ok to bypass set_bknown() */
    /* same criteria as lift_object()'s check for available inventory slot */
    const { inv_cnt } = await import('./hack.js');
    if (obj.oclass !== COIN_CLASS && inv_cnt(false, state) >= INVLET_BASIC
        && !merge_choice(state.invent, obj, state)) {
        /* inventory overflow; can't just place & stack object since
           hero isn't in position yet, so schedule for arrival later */
        const { add_to_migration_async } = await import('./obj.js');
        await add_to_migration_async(obj, state);
        obj.ox = 0; /* index of main dungeon */
        obj.oy = 1; /* starting level number */
        obj.owornmask = MIGR_WITH_HERO | MIGR_NOBREAK | MIGR_NOSCATTER;
    } else {
        await addinv_runtime(obj, { state });
    }
}

// C ref: files.c proc_wizkit_line() (2558-2581). C's readobjnam() edits buf
// in place: mungspaces() first, then cuts such as " named " write a NUL into
// it. wish_history_add() therefore records the munged line up to the first
// cut. readobjnam() here takes an immutable string, so the history gets the
// whole munged line; only the m-prefixed wish menu shows the difference.
export async function proc_wizkit_line(buf, state = game) {
    let line = buf;
    if (textBytes(line).length >= BUFSZ)
        line = truncateByteString(line, BUFSZ - 1);
    const { readobjnam } = await import('./objnam_readobjnam.js');
    const { objectGenerationEnv } = await import('./object_generation.js');
    const { y_n } = await import('./cmd.js');
    const otmp = await readobjnam(
        line, null, objectGenerationEnv({ state, askYesNo: y_n }),
    );

    if (otmp) {
        const { hands_obj } = await import('./invent.js');
        if (otmp !== hands_obj) {
            const { wish_history_add } = await import('./zap.js');
            wish_history_add(mungspaces(line), state);
            await wizkit_addinv(otmp, state);
        }
    } else {
        /* .60 limits output line width to 79 chars */
        const { config_error_add } = await import('./cfgfiles.js');
        config_error_add(state.configErrorFrame,
            `Bad wizkit item: "${truncateByteString(line, 60)}"`);
        return false;
    }
    return true;
}

// C ref: files.c read_wizkit() (2584-2601). program_state.wizkit_wishing
// makes pline.c vpline() discard every message until it is cleared, so the
// error frame's report is never shown; config_error_done()'s wait_synch()
// still runs when a line failed. config_error_init() pushes the frame that
// state.configErrorFrame names and config_error_done() pops it.
export async function read_wizkit(state = game) {
    if (!state.wizard) return;
    const text = await fopen_wizkit_file(state);
    if (text === null) return;

    state.program_state ??= {};
    state.program_state.wizkit_wishing = 1;
    const {
        config_error_done, config_error_init, parse_conf_file,
    } = await import('./cfgfiles.js');
    const outerFrame = state.configErrorFrame;
    state.configErrorFrame = config_error_init(null, 'WIZKIT');

    state.gc ??= {};
    for (const { line } of parse_conf_file(text, state))
        await proc_wizkit_line(line, state);

    const errors = config_error_done(state.configErrorFrame, state);
    if (errors) {
        const { tty_wait_synch } = await import('./tty_rawprint.js');
        await tty_wait_synch(state);
    }
    state.configErrorFrame = outerFrame;
    state.program_state.wizkit_wishing = 0;
}
