// unported.js — Record calls to C functions not yet ported.
// C ref: no single upstream file; this records gaps in the port.
//
// A span that reaches an unported C function whose return value C discards
// calls note_unported() instead of throwing an Unsupported*Error. The game
// continues and the caller reads game.unported after the segment to see
// which functions were skipped.

import { game } from './gstate.js';
import { installedPlanningState } from './rng.js';

export function initUnported() {
    game.unported = new Set();
}

// A planning clone shares the live game's set (planningState() copies the
// reference), so a gap reached while planning is recorded in the same set
// without reaching `game`, which throws while planning (js/gstate.js).
export function note_unported(functionName) {
    const state = installedPlanningState() ?? game;
    if (!state.unported) state.unported = new Set();
    state.unported.add(functionName);
}
