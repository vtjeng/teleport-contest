// files.js -- Data-file handling shared by configuration readers.
// C refs: files.c nh_basename(), read_sym_file().

import { SYMBOL_SET_DEFINITIONS } from './symbol_data.js';

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

function isDefaultSymset(name) {
    const folded = String(name ?? '').toLowerCase().replace(/[ _-]/gu, '');
    return folded === 'default' || folded === 'defaultsymbols';
}

// C ref: files.c read_sym_file().  The scorer installs the generated projection
// of dat/symbols, so opening or parsing that immutable file cannot fail here.
// This covers the function's selected-name/default-alias result; symbols.c owns
// the table and metadata mutations made while the matching block is parsed.
export function read_sym_file(name) {
    if (isDefaultSymset(name)) return true;
    const folded = String(name).toLowerCase();
    return SYMBOL_SET_DEFINITIONS.some(
        (definition) => definition.name.toLowerCase() === folded,
    );
}
