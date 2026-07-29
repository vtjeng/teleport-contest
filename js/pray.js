// pray.js -- the hero's deity and the deities opposed to it.
// C ref: src/pray.c u_gname(), align_gname().

import { A_CHAOTIC, A_LAWFUL, A_NEUTRAL, A_NONE } from './const.js';
import { game } from './gstate.js';

// C ref: decl.c Moloch.
const Moloch = 'Moloch';

// C ref: pray.c align_gname(). role.c stores a name whose worship is
// grammatically awkward with a leading underscore, which C strips here.
export function align_gname(alignment, state = game) {
    let gnam;
    switch (alignment) {
    case A_NONE:
        gnam = Moloch;
        break;
    case A_LAWFUL:
        gnam = state.urole.lgod;
        break;
    case A_NEUTRAL:
        gnam = state.urole.ngod;
        break;
    case A_CHAOTIC:
        gnam = state.urole.cgod;
        break;
    default:
        // C reports impossible() and carries on with "someone".
        gnam = 'someone';
        break;
    }
    return gnam.startsWith('_') ? gnam.slice(1) : gnam;
}

// C ref: pray.c u_gname(). The name of the hero's own deity.
export function u_gname(state = game) {
    return align_gname(state.u.ualign.type, state);
}
