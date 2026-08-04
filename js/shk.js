// Shop queries and remembered price quotes.
// C refs: shk.c inhishop(), is_fshk(), append_price_quote(), contained_gold()
// and costly_spot().

import {
    ACH_SHOP,
    BUFSZ,
    DEAF,
    INVIS,
    PL_NSIZ,
    ROOMOFFSET,
    SHOPBASE,
} from './const.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { s_suffix } from './hacklib.js';
import { record_achievement } from './insight.js';
import { set_malign } from './makemon.js';
import { hasContents } from './obj.js';
import { COIN_CLASS } from './objects.js';
import { Hello } from './role_init.js';
import { in_rooms } from './rooms.js';
import { SHTYPES } from './shtypes_data.js';
import { ttyPline } from './tty_message.js';

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

// C ref: shk.c inside_shop(). A wall, boundary square, or non-shop room is
// not strictly inside even when in_rooms() associates it with a shop.
export function inside_shop(x, y, state = game) {
    const location = state.level?.at(x, y);
    const roomno = location?.roomno ?? 0;
    const room = roomno >= ROOMOFFSET
        ? state.level.rooms?.[roomno - ROOMOFFSET]
        : null;
    return room && !location.edge && room.rtype >= SHOPBASE ? roomno : 0;
}

// C ref: shk.c shop_keeper(). Generated shops keep their resident on the room
// record and its ESHK extension records the same room number.
export function shop_keeper(roomno, state = game) {
    if (roomno < ROOMOFFSET) return null;
    const resident = state.level?.rooms?.[roomno - ROOMOFFSET]?.resident;
    return resident?.isshk
        && resident.mextra?.eshk?.shoproom === roomno ? resident : null;
}

// C ref: shk.c is_fshk() (5010-5015), which exists for mondata.c
// levl_follower(). `following` is set when a shopkeeper chases a debtor off
// the level; js/shknam.js never sets it, so this answers FALSE for every
// shopkeeper the port creates.
export function is_fshk(monster) {
    return Boolean(monster.isshk && monster.mextra?.eshk?.following);
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

// C ref: shk.c costly_spot().
export function costly_spot(x, y, state = game) {
    if (!state.level?.flags?.has_shop) return false;
    const roomno = in_rooms(x, y, SHOPBASE, state)[0] ?? 0;
    const shopkeeper = shop_keeper(roomno, state);
    if (!shopkeeper || !inhishop(shopkeeper, state)) return false;
    const extension = shopkeeper.mextra.eshk;
    return inside_shop(x, y, state) === roomno
        && !(x === extension.shk.x && y === extension.shk.y);
}

function heroPropertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean((value?.intrinsic || value?.extrinsic) && !value?.blocked);
}

// C ref: shk.c u_entered_shop(), through the generated, present, peaceful
// shopkeeper branch reached by random level-teleport arrival.
export async function u_entered_shop(
    enterstring,
    state = game,
    { message = ttyPline } = {},
) {
    const roomno = Math.trunc(enterstring?.[0] ?? 0);
    if (!roomno) return false;
    const shopkeeper = shop_keeper(roomno, state);
    if (!shopkeeper || !inhishop(shopkeeper, state)) {
        throw new UnsupportedShopError('u_entered_shop() in an untended shop');
    }
    const extension = shopkeeper.mextra.eshk;
    const room = state.level.rooms[roomno - ROOMOFFSET];
    if (!shopkeeper.mcanmove || shopkeeper.msleeping
        || extension.following || !shopkeeper.mpeaceful
        || extension.surcharge || extension.robbed
        || heroPropertyActive(state, INVIS)) {
        throw new UnsupportedShopError(
            'u_entered_shop() outside the peaceful visible greeting',
        );
    }

    record_achievement(ACH_SHOP, state);
    extension.bill_p = extension.bill;
    const playerName = String(state.plname ?? '').slice(0, PL_NSIZ - 1);
    if ((!extension.visitct || extension.customer)
        && extension.customer.toLowerCase() !== playerName.toLowerCase()) {
        extension.visitct = 0;
        extension.following = false;
        extension.customer = playerName;
        shopkeeper.mpeaceful = true;
        extension.surcharge = false;
        set_malign(shopkeeper, state);
    }

    const again = extension.visitct++ ? ' again' : '';
    const shopName = SHTYPES[room.rtype - SHOPBASE]?.name;
    if (!shopName)
        throw new UnsupportedShopError('u_entered_shop() shop type');
    const owner = s_suffix(extension.shknam);
    if (!heroPropertyActive(state, DEAF)) {
        await message(
            `"${Hello(state.urole, { shopkeeper: true })}, ${playerName}!  `
            + `Welcome${again} to ${owner} ${shopName}!"`,
            state,
        );
    } else {
        await message(`You enter ${owner} ${shopName}${again}!`, state);
    }
    if (!inside_shop(state.u.ux, state.u.uy, state)) {
        throw new UnsupportedShopError(
            'u_entered_shop() arriving outside the shop interior',
        );
    }
    return true;
}

// Thrown where shk.c reaches shop bookkeeping this port has not ported.
export class UnsupportedShopError extends Error {
    constructor(branch) {
        super(`shop handling requires ${branch}`);
        this.name = 'UnsupportedShopError';
        this.branch = branch;
    }
}
