// files.js -- Data-file handling shared by configuration readers.
// C refs: files.c nh_basename(), read_sym_file().

import { SYMBOL_SET_DEFINITIONS } from './symbol_data.js';
import { game } from './gstate.js';
import { LFILE_EXISTS, LL_NONE } from './const.js';
import { decodeUtf8ByteString, encodeUtf8ByteString, mungspaces } from './hacklib.js';
import { rn2 } from './rng.js';
import { TRIBUTE_DATA } from './tribute_data.js';
import { note_unported } from './unported.js';

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

export function isDefaultSymsetName(name) {
    const text = String(name ?? '');
    if (text.toLowerCase() === 'default') return true;
    const folded = text.toLowerCase().replace(/[ _-]/gu, '');
    return folded === 'defaultsymbols';
}

// C ref: files.c read_sym_file().  The scorer installs the generated projection
// of dat/symbols, so opening or parsing that immutable file cannot fail here.
// This covers the function's selected-name/default-alias result; symbols.c owns
// the table and metadata mutations made while the matching block is parsed.
export function read_sym_file(name) {
    if (isDefaultSymsetName(name)) return true;
    const folded = String(name).toLowerCase();
    return SYMBOL_SET_DEFINITIONS.some(
        (definition) => definition.name.toLowerCase() === folded,
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

// C ref: files.c livelog_add() (3667-3719).  sys.c sys_early_init()
// initializes sysopt.livelog to LL_NONE, and the recorder's sysconf leaves
// the LIVELOG setting disabled.  The browser has no external sink, so an
// enabled sink remains an explicit discarded-call gap while the default
// configuration returns before attempting it.
export function livelog_add(llType, _text, state = game) {
    const liveLogMask = state.sysopt?.livelog ?? LL_NONE;
    if (!(llType & liveLogMask)) return;
    if (state === game) note_unported('files.c livelog_add');
}

const MAXPASSAGES = 20; // SIZE(svc.context.novel.pasg) in files.c.
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
export function choose_passage(passagecnt, oid, state = game, random = { rn2 }) {
    const count = Math.trunc(passagecnt);
    if (count < 1) return 0;
    if (typeof random.rn2 !== 'function')
        throw new TypeError('choose_passage random source requires rn2');

    state.svc ??= {};
    state.svc.context ??= {};
    const novel = state.svc.context.novel ??= {
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
                                ? choose_passage(passagecnt, oid, state, env.random ?? { rn2 })
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
            bufferText = decodeUtf8ByteString(
                encodeUtf8ByteString(line).slice(0, maxBytes),
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
        // putmsghistory() is a window-port-only chronicle side effect whose
        // current JavaScript owner is absent; its result is discarded in C.
        if (state === game) note_unported('pline.c putmsghistory');
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
