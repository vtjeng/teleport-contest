// Shop queries and remembered price quotes.
// C ref: shk.c inhishop() and append_price_quote().

import { BUFSZ, SHOPBASE } from './const.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { hasContents } from './obj.js';
import { COIN_CLASS } from './objects.js';
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

// C ref: shk.c append_price_quote(). C writes into the caller's buffer and
// advances its end-of-string pointer; JavaScript returns the suffix instead,
// so the caller concatenates. `buf` is still needed because C drops the whole
// suffix when appending it would overrun BUFSZ.
//
// record_price_quote() is the only writer of the four seen-price fields and no
// ported path calls it, so every type still holds the init_objects() sentinel
// and this returns '' today. It is called anyway because C calls it for every
// discoveries line, and skipping it would hide the day a shop lands.
export function append_price_quote(buf, otyp, state = game) {
    const type = state.objects[otyp];

    if (type.oc_sell_minseen > type.oc_sell_maxseen
        && type.oc_buy_minseen > type.oc_buy_maxseen)
        return '';

    let buf2 = ' {';
    let sep = '';

    if (type.oc_buy_minseen < type.oc_buy_maxseen) {
        buf2 += `buy ${type.oc_buy_minseen}-${type.oc_buy_maxseen}`;
        sep = ' ';
    } else if (type.oc_buy_minseen === type.oc_buy_maxseen) {
        buf2 += `buy ${type.oc_buy_minseen}`;
        sep = ' ';
    }

    if (type.oc_sell_minseen < type.oc_sell_maxseen)
        buf2 += `${sep}sell ${type.oc_sell_minseen}-${type.oc_sell_maxseen}`;
    else if (type.oc_sell_minseen === type.oc_sell_maxseen)
        buf2 += `${sep}sell ${type.oc_sell_minseen}`;

    buf2 += '}';
    return buf2.length < BUFSZ - buf.length - 1 ? buf2 : '';
}

// C ref: shk.c contained_gold(). `even_if_unknown` false limits the tally to
// containers whose contents the hero has seen.
export function contained_gold(obj, even_if_unknown) {
    let value = 0;
    for (let otmp = obj.cobj; otmp; otmp = otmp.nobj) {
        if (otmp.oclass === COIN_CLASS) value += otmp.quan;
        else if (hasContents(otmp) && (otmp.cknown || even_if_unknown))
            value += contained_gold(otmp, even_if_unknown);
    }
    return value;
}

// C ref: shk.c costly_spot(). A level with no shop answers FALSE before any
// shopkeeper lookup, which is every level this port generates; the rest of
// the test needs the shopkeeper subsystem.
export function costly_spot(x, y, state = game) {
    if (!state.level?.flags?.has_shop) return false;
    throw new UnsupportedShopError('costly_spot() inside a shop level');
}

// Thrown where shk.c reaches shop bookkeeping this port has not ported.
export class UnsupportedShopError extends Error {
    constructor(branch) {
        super(`shop handling requires ${branch}`);
        this.name = 'UnsupportedShopError';
        this.branch = branch;
    }
}
