// vault.js -- gold the hero is carrying out of sight, and vault occupancy.
// C ref: src/vault.c hidden_gold(), vault_occupied().

import { ROOMOFFSET, VAULT } from './const.js';
import { game } from './gstate.js';
import { hasContents } from './obj.js';
import { contained_gold } from './shk.js';

// C ref: vault.c vault_occupied() (244-253). `array` is one of the hero's room
// strings, which js/rooms.js models as a zero-terminated array of room
// numbers. C returns the room number or '\0'; this returns 0 for "none",
// which is the same value.
export function vault_occupied(array, state = game) {
    for (const room of array ?? []) {
        if (!room) break;
        if (state.level?.rooms?.[room - ROOMOFFSET]?.rtype === VAULT)
            return room;
    }
    return 0;
}

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
