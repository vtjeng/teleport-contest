// vault.js -- gold the hero is carrying out of sight.
// C ref: src/vault.c hidden_gold().

import { game } from './gstate.js';
import { hasContents } from './obj.js';
import { contained_gold } from './shk.js';

// C ref: vault.c hidden_gold(). `even_if_unknown` false counts only gold in
// containers whose contents the hero already knows.
export function hidden_gold(even_if_unknown, state = game) {
    let value = 0;
    for (let obj = state.invent; obj; obj = obj.nobj) {
        if (hasContents(obj) && (obj.cknown || even_if_unknown))
            value += contained_gold(obj, even_if_unknown);
    }
    return value;
}
