// Shop queries.
// C ref: shk.c inhishop().

import { SHOPBASE } from './const.js';
import { on_level } from './dungeon.js';
import { in_rooms } from './rooms.js';

// C ref: shk.c inhishop().
export function inhishop(shopkeeper, state) {
    const extension = shopkeeper?.mextra?.eshk;
    return Boolean(extension
        && on_level(extension.shoplevel, state.u?.uz)
        && in_rooms(
            shopkeeper.mx,
            shopkeeper.my,
            SHOPBASE,
            state,
        ).includes(extension.shoproom));
}
