// topten.js -- high-score formatting.
// C ref: src/topten.c formatkiller() (90-162).

import {
    KILLED_BY,
    KILLED_BY_AN,
    NO_KILLER_PREFIX,
} from './const.js';
import { game } from './gstate.js';
import { an } from './objnam.js';

// C ref: topten.c:96-105 killed_by_prefix[].  Indexed by game_end_types
// (hack.h:483-498): DIED, CHOKING, POISONING, STARVING, DROWNING, BURNING,
// DISSOLVED, CRUSHING, STONING, TURNED_SLIME, GENOCIDED, PANICKED, TRICKED,
// QUIT, ESCAPED, ASCENDED.
const killed_by_prefix = Object.freeze([
    'killed by ', 'choked on ', 'poisoned by ', 'died of ',
    'drowned in ', 'burned by ', 'dissolved in ', 'crushed to death by ',
    'petrified by ', 'turned to slime by ', 'killed by ',
    '', '', '', '', '',
]);

// C ref: topten.c formatkiller() (90-162).  Builds the death description
// string for the tombstone, bones grave inscription, and score file.
//
// The C version writes into a fixed-size char buffer; the JS version returns
// a new string (no size limit).
export function formatkiller(how, incl_helpless, state = game) {
    const killer = state.killer;
    let kname = killer.name ?? '';

    const parts = [];
    switch (killer.format) {
    default:
        // C: impossible("bad killer format? (%d)", killer.format);
        // fall through
    case NO_KILLER_PREFIX:
        break;
    case KILLED_BY_AN:
        kname = an(kname);
        // fall through
    case KILLED_BY:
        parts.push(killed_by_prefix[how] ?? '');
        break;
    }

    // Copy kname, sanitizing characters that would confuse field splitting
    // when record/logfile/xlogfile is re-read.
    const sanitized = [];
    for (const ch of kname) {
        if (ch === ',') sanitized.push(';');
        else if (ch === '=') sanitized.push('_');
        else if (ch === '\t') sanitized.push(' ');
        else sanitized.push(ch);
    }
    parts.push(sanitized.join(''));

    // C ref: topten.c:152-161. Append helpless reason when the hero was
    // paralyzed (multi < 0) at time of death.
    if (incl_helpless && (state.multi ?? 0) < 0) {
        if (state.multi_reason) {
            parts.push(`, while ${state.multi_reason}`);
        } else {
            parts.push(', while helpless');
        }
    }

    return parts.join('');
}
