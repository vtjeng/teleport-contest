// files.js -- Data-file handling shared by configuration readers.
// C refs: files.c nh_basename(), read_sym_file().

import { SYMBOL_SET_DEFINITIONS } from './symbol_data.js';
import { game } from './gstate.js';
import { LFILE_EXISTS, LL_NONE } from './const.js';
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
