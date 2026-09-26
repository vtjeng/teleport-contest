// C ref: src/drawing.c, the compiled-in symbol tables and the lookups that
// walk them.
//
// drawing.c's def_oc_syms[] has three columns, and each one already lives
// beside its own readers rather than in a single record: the symbol bytes are
// js/symbol_data.js DEFAULT_PRIMARY_SYMBOLS at SYM_OFF_O, the plural class
// names are js/weapon.js def_oc_syms_names, and the do_look() explanations are
// js/symbol_data.js OBJCLASS_EXPLANATIONS. All three are projections of the
// same include/defsym.h OBJCLASS entries, which is what keeps them in step.

import { MAXOCLASSES } from './objects.js';
import {
    CMAP_EXPLANATIONS,
    DEFAULT_PRIMARY_SYMBOLS,
    SYM_OFF_M,
    SYM_OFF_O,
    SYM_OFF_W,
} from './symbol_data.js';

// C ref: drawing.c def_oc_syms[].name. object_detect() uses these plural
// labels for its feedback; they are separate from the singular explanations
// used by do_look().
export const DEF_OC_SYMS_NAMES = Object.freeze([
    '', 'illegal objects', 'weapons', 'armor', 'rings', 'amulets', 'tools',
    'food', 'potions', 'scrolls', 'spellbooks', 'wands', 'coins', 'rocks',
    'large stones', 'iron balls', 'chains', 'venoms',
]);

// C ref: drawing.c def_char_is_furniture(). The returned value is an index
// into defsyms, whose furniture entries begin at the first "stair" cmap
// description and end at "fountain". Like the object and monster lookups
// above, this uses compiled-in ASCII symbols, not the active graphics set.
export function def_char_is_furniture(ch) {
    const byte = typeof ch === 'number'
        ? ch & 0xFF : String(ch).charCodeAt(0);
    let furniture = false;
    for (let i = 0; i < CMAP_EXPLANATIONS.length; ++i) {
        const explanation = CMAP_EXPLANATIONS[i];
        if (!furniture && explanation.startsWith('stair'))
            furniture = true;
        if (furniture) {
            if (DEFAULT_PRIMARY_SYMBOLS[i] === byte) return i;
            if (explanation === 'fountain') break;
        }
    }
    return -1;
}

const MAXMCLASSES = SYM_OFF_W - SYM_OFF_M;

// C ref: drawing.c def_char_to_objclass(), which reads the compiled-in
// def_oc_syms[] rather than the symbol set in force, so a session running
// DECgraphics still names its object classes with the ASCII defaults. Index 0
// is the "random class" placeholder and carries no symbol, so the scan starts
// at 1; returning MAXOCLASSES is C's "no class owns this character".
export function def_char_to_objclass(ch) {
    let i;
    for (i = 1; i < MAXOCLASSES; i++)
        if (ch === String.fromCharCode(DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + i]))
            break;
    return i;
}

// C ref: drawing.c def_char_to_monclass().  Like the object-class lookup,
// this walks the compiled-in table rather than the active symbol set and
// returns the first match.  Index 0 is the NUL dummy and is deliberately
// skipped.
export function def_char_to_monclass(ch) {
    const byte = typeof ch === 'number'
        ? ch & 0xFF : String(ch).charCodeAt(0);
    let i;
    for (i = 1; i < MAXMCLASSES; i++) {
        if (byte === DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_M + i]) break;
    }
    return i;
}
