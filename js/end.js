// end.js -- the end of the game.
// C ref: src/end.c.
//
// Nothing in end.c is ported. done() is the funnel every death, quit, escape
// and ascension passes through, and behind it sit the wizard-mode "Die? [yn]"
// query (1112), disclosure, the tombstone, bones, the score file and the
// window teardown. The one caller this port reaches is hack.c losehp()'s death
// branch, one statement after urgent_pline("You die..."), so the refusal below
// ends the segment on the --More-- that message forces onto the line before
// it.

import { game } from './gstate.js';

export class UnsupportedEndOfGameError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedEndOfGameError';
    }
}

// C ref: end.c done() (1053-1414). It returns only when life-saving or the
// wizard-mode query cancels the death, so a caller may treat this as the end
// of its own control flow; every arm below the call in C is unreachable
// without an amulet of life saving.
//
// `how` is a game_end_types value and svk.killer, which the caller has already
// filled in, is what done() would name the death by.
export function done(how, state = game) {
    throw new UnsupportedEndOfGameError(
        `done(${how}) for killer "${state.killer?.name ?? ''}"`
        + ` in format ${state.killer?.format}`,
    );
}
