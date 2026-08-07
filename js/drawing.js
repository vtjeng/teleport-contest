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
import { DEFAULT_PRIMARY_SYMBOLS, SYM_OFF_O } from './symbol_data.js';

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
