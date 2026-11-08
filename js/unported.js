// unported.js — Record calls to C functions not yet ported.
// C ref: no single upstream file; this records gaps in the port.
//
// A span that reaches an unported C function whose return value C discards
// calls note_unported() instead of throwing an Unsupported*Error. The game
// continues and the caller reads game.unported after the segment to see
// which functions were skipped.

import { game } from './gstate.js';

export function initUnported() {
    game.unported = new Set();
}

export function note_unported(functionName) {
    if (!game.unported) game.unported = new Set();
    game.unported.add(functionName);
}
