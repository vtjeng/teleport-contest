// Shop admission and entry/departure transitions, generated-shop pricing,
// live price-quote writes, and remembered-price queries.
// C refs: shk.c inhishop(), inside_shop(), shop_keeper(), u_entered_shop(),
// u_left_shop(), getprice(), get_cost(), get_cost_of_shop_item(),
// append_price_quote(), contained_gold(), costly_spot(), shop_object(),
// shk_owns(), mon_owns(), and shk_your().

import {
    A_CHA,
    ACH_SHOP,
    BUFSZ,
    DEAF,
    HUNGRY,
    INVIS,
    MS_ANIMAL,
    OBJ_FLOOR,
    OBJ_MINVENT,
    PL_NSIZ,
    ROOMOFFSET,
    SHOPBASE,
} from './const.js';
import { effective_attribute } from './attrib.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { s_suffix } from './hacklib.js';
import { record_achievement } from './insight.js';
import { get_obj_location } from './light.js';
import { set_malign } from './makemon.js';
import {
    carried, hasContents, isCandle, isContainer, objectType,
} from './obj.js';
import {
    ARMOR_CLASS,
    COIN_CLASS,
    CORPSE,
    DUNCE_CAP,
    EGG,
    FOOD_CLASS,
    GEM_CLASS,
    GLASS,
    POTION_CLASS,
    POT_WATER,
    TIN,
    TOOL_CLASS,
    WAND_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import { PM_TOURIST } from './monsters.js';
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

// The generated-shop subset of shk.c:u_entered_shop(). The source performs
// its boundary handling after achievement and greeting effects because it can
// continue into block_door(). This port cannot continue there, so callers use
// this admission check before changing the hero's position or shop state.
export function assert_shop_entry_supported(x, y, roomno, state = game) {
    if (inside_shop(x, y, state) !== roomno) {
        throw new UnsupportedShopError(
            'u_entered_shop() arriving outside the shop interior',
        );
    }
    const shopkeeper = shop_keeper(roomno, state);
    if (!shopkeeper) {
        throw new UnsupportedShopError('u_entered_shop() in an untended shop');
    }
    if (!inhishop(shopkeeper, state)) {
        throw new UnsupportedShopError('u_entered_shop() in an untended shop');
    }
    const extension = shopkeeper.mextra.eshk;
    const unsupportedGreeting = [
        !shopkeeper.mcanmove,
        shopkeeper.msleeping,
        extension.following,
        !shopkeeper.mpeaceful,
        extension.surcharge,
        extension.robbed,
        heroIsInvisible(state),
    ].some(Boolean);
    if (unsupportedGreeting) {
        throw new UnsupportedShopError(
            'u_entered_shop() outside the peaceful visible greeting',
        );
    }
    const room = state.level.rooms[roomno - ROOMOFFSET];
    if (!SHTYPES[room.rtype - SHOPBASE]?.name)
        throw new UnsupportedShopError('u_entered_shop() shop type');
    return { extension, room, shopkeeper };
}

export function preflight_shop_arrival(x, y, state = game) {
    const roomno = in_rooms(x, y, SHOPBASE, state)[0] ?? 0;
    if (roomno) assert_shop_entry_supported(x, y, roomno, state);
}

// Admission seam for the parts of shk.c:u_left_shop() and u_entered_shop()
// which movement can reach. Settled departures and absent/displaced keepers
// have no effect. Debt handling and boundary-entry blocking remain named
// refusals, raised before hack.c:domove_core() changes u.ux/u.uy.
export function preflight_shop_transition(
    fromX,
    fromY,
    toX,
    toY,
    state = game,
) {
    const oldShops = in_rooms(fromX, fromY, SHOPBASE, state);
    const newShops = in_rooms(toX, toY, SHOPBASE, state);
    const entered = newShops.find((roomno) => !oldShops.includes(roomno));
    if (entered)
        assert_shop_entry_supported(toX, toY, entered, state);

    const left = oldShops.filter((roomno) => !newShops.includes(roomno));
    const from = state.level?.at(fromX, fromY);
    const to = state.level?.at(toX, toY);
    if (!left.length) {
        if (!to?.edge) return;
        if (from?.edge) return;
    }

    const roomno = left[0] ?? oldShops[0] ?? 0;
    const shopkeeper = shop_keeper(roomno, state);
    if (!shopkeeper) return;
    if (!inhishop(shopkeeper, state)) return;
    const extension = shopkeeper.mextra.eshk;
    if (!extension.billct) {
        if (!extension.debit) return;
    }
    throw new UnsupportedShopError(
        left.length
            ? 'u_left_shop() leaving a shop with debt'
            : 'u_left_shop() reaching a shop boundary with debt',
    );
}

// C ref: shk.c u_left_shop(). Only its three no-effect returns are ported;
// preflight_shop_transition() prevents the remaining branches from reaching
// this post-move check in ordinary movement.
export function u_left_shop(leavestring, _newlev, state = game) {
    const left = Array.from(leavestring ?? []).filter(Boolean);
    const from = state.level?.at(state.u?.ux0, state.u?.uy0);
    const to = state.level?.at(state.u?.ux, state.u?.uy);
    if (!left.length) {
        if (!to?.edge) return;
        if (from?.edge) return;
    }

    const roomno = left[0] ?? Math.trunc(state.u?.ushops0?.[0] ?? 0);
    const shopkeeper = shop_keeper(roomno, state);
    if (!shopkeeper) return;
    if (!inhishop(shopkeeper, state)) return;
    const extension = shopkeeper.mextra.eshk;
    if (!extension.billct) {
        if (!extension.debit) return;
    }
    throw new UnsupportedShopError(
        left.length
            ? 'u_left_shop() leaving a shop with debt'
            : 'u_left_shop() reaching a shop boundary with debt',
    );
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
// record_price_quote() is the only writer of the four seen-price fields;
// doname_with_price() records the buy half while formatting a live shop-pile
// row, before its caller displays that completed row. This formatter is the
// remembered-price consumer used by
// discoveries lines, although that caller remains outside the ported path.
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

// C ref: shk.c record_price_quote(). The object catalog owns the four quote
// extrema; callers pass the per-unit price before displaying the formatted
// row to the player.
export function record_price_quote(
    otyp,
    price,
    buyprice,
    state = game,
) {
    const type = state.objects[otyp];
    const quoted = Math.trunc(price);
    if (buyprice) {
        if (quoted > type.oc_buy_maxseen) type.oc_buy_maxseen = quoted;
        if (quoted < type.oc_buy_minseen) type.oc_buy_minseen = quoted;
    } else {
        if (quoted > type.oc_sell_maxseen) type.oc_sell_maxseen = quoted;
        if (quoted < type.oc_sell_minseen) type.oc_sell_minseen = quoted;
    }
}

// C ref: shk.c get_pricing_units(). This slice admits ordinary stacks; globs
// remain at the pricing preflight because their units depend on weight().
export function get_pricing_units(obj) {
    if (obj.globby)
        throw new UnsupportedShopError('globby pricing units');
    return Math.trunc(obj.quan);
}

// C ref: shk.c oid_price_adjustment(). The port has no discount result, just
// the source's zero-or-one arbitrary surcharge for an unidentified object.
export function oid_price_adjustment(obj, oid, state = game) {
    const type = objectType(obj, state);
    if (!(obj.dknown && type.oc_name_known)
        && (obj.oclass !== GEM_CLASS || type.oc_material !== GLASS)) {
        return Math.trunc(oid) % 4 === 0 ? 1 : 0;
    }
    return 0;
}

// C ref: shk.c getprice(), reached selling-to-hero branches. The live floor-
// merchandise caller, get_cost_of_shop_item(), excludes artifact and
// corpse-family adjustments before it reaches this common pricing subset.
export function getprice(obj, shk_buying, state = game) {
    const type = objectType(obj, state);
    let price = Math.trunc(type.oc_cost);
    switch (obj.oclass) {
    case FOOD_CLASS:
        if (state.u.uhs >= HUNGRY && !shk_buying)
            price *= Math.trunc(state.u.uhs);
        if (obj.oeaten) price = 0;
        break;
    case WAND_CLASS:
        if (obj.spe === -1) price = 0;
        break;
    case POTION_CLASS:
        if (obj.otyp === POT_WATER && !obj.blessed && !obj.cursed)
            price = 0;
        break;
    case ARMOR_CLASS:
    case WEAPON_CLASS:
        if (obj.spe > 0) price += 10 * Math.trunc(obj.spe);
        break;
    case TOOL_CLASS:
        if (isCandle(obj) && obj.age < 20 * Math.trunc(type.oc_cost))
            price = Math.trunc(price / 2);
        break;
    default:
        break;
    }
    return price;
}

// C ref: shk.c get_cost(). This function returns the per-unit price. The
// caller multiplies it by get_pricing_units() after ownership is established.
export function get_cost(obj, shopkeeper, state = game) {
    let price = getprice(obj, false, state);
    let multiplier = 1;
    let divisor = 1;

    if (!price) price = 5;
    const type = objectType(obj, state);
    if (!obj.dknown || !type.oc_name_known) {
        if (obj.oclass === GEM_CLASS && type.oc_material === GLASS) {
            throw new UnsupportedShopError('unidentified glass-gem pricing');
        }
        if (oid_price_adjustment(obj, obj.o_id, state) > 0) {
            multiplier *= 4;
            divisor *= 3;
        }
    }
    if (state.uarmh?.otyp === DUNCE_CAP)
        throw new UnsupportedShopError('Dunce cap pricing adjustment');
    if ((state.urole?.mnum === PM_TOURIST && state.u.ulevel < 15)
        || (state.uarmu && !state.uarm && !state.uarmc)) {
        throw new UnsupportedShopError('tourist pricing adjustment');
    }

    const charisma = effective_attribute(state, A_CHA);
    if (charisma > 18) divisor *= 2;
    else if (charisma === 18) {
        multiplier *= 2;
        divisor *= 3;
    } else if (charisma >= 16) {
        multiplier *= 3;
        divisor *= 4;
    } else if (charisma <= 5) multiplier *= 2;
    else if (charisma <= 7) {
        multiplier *= 3;
        divisor *= 2;
    } else if (charisma <= 10) {
        multiplier *= 4;
        divisor *= 3;
    }

    price *= multiplier;
    if (divisor > 1) {
        price *= 10;
        price = Math.trunc(price / divisor);
        price += 5;
        price = Math.trunc(price / 10);
    }
    if (obj.oartifact)
        throw new UnsupportedShopError('artifact pricing');
    if (shopkeeper?.mextra?.eshk?.surcharge)
        throw new UnsupportedShopError('shopkeeper surcharge');
    return price;
}

function firstRoom(buffer) {
    return Math.trunc(buffer?.[0] ?? 0);
}

// C ref: shk.c get_cost_of_shop_item(), for the selected common generated-
// shop floor branch. Every refused condition is checked before naming or
// movement mutates the object, quote catalog, hero, or display state.
export function get_cost_of_shop_item(
    obj,
    state = game,
    options = {},
) {
    const observed = Boolean(options.observed);
    if (state.iflags?.suppress_price || state.program_state?.restoring)
        throw new UnsupportedShopError('suppressed or restoring price');
    if (!obj || obj.where !== OBJ_FLOOR)
        throw new UnsupportedShopError('non-floor shop object');
    if (obj.oclass === COIN_CLASS)
        throw new UnsupportedShopError('coin pricing');
    if (obj === state.uball || obj === state.uchain)
        throw new UnsupportedShopError('punishment-object pricing');
    if (obj.unpaid || obj.no_charge)
        throw new UnsupportedShopError('unpaid or no-charge floor object');
    if (obj.globby)
        throw new UnsupportedShopError('globby pricing units');
    if (isContainer(obj) || hasContents(obj))
        throw new UnsupportedShopError('container pricing');
    if (obj.oartifact)
        throw new UnsupportedShopError('artifact pricing');
    if (obj.otyp === CORPSE || obj.otyp === TIN || obj.otyp === EGG)
        throw new UnsupportedShopError('corpse, tin, or egg pricing adjustment');

    const position = get_obj_location(obj, 0, state);
    if (!position)
        throw new UnsupportedShopError('shop object without a location');
    const rooms = in_rooms(position.x, position.y, SHOPBASE, state);
    const currentShop = firstRoom(state.u?.ushops);
    if (rooms.length !== 1 || rooms[0] !== currentShop)
        throw new UnsupportedShopError('other or shared shop ownership');
    const roomno = inside_shop(position.x, position.y, state);
    if (roomno !== currentShop)
        throw new UnsupportedShopError('shop boundary ownership');
    const shopkeeper = shop_keeper(roomno, state);
    if (!shopkeeper || !inhishop(shopkeeper, state))
        throw new UnsupportedShopError('absent or displaced shopkeeper');
    if (!shopkeeper.mpeaceful)
        throw new UnsupportedShopError('angry shopkeeper pricing');
    if (shopkeeper.mextra.eshk.surcharge)
        throw new UnsupportedShopError('shopkeeper surcharge');
    const keeperSquare = shopkeeper.mextra.eshk.shk;
    if (position.x === keeperSquare.x && position.y === keeperSquare.y)
        throw new UnsupportedShopError('shopkeeper freespot pricing');

    const type = objectType(obj, state);
    if (!type.oc_name_known && obj.oclass === GEM_CLASS
        && type.oc_material === GLASS) {
        throw new UnsupportedShopError('unidentified glass-gem pricing');
    }
    const units = get_pricing_units(obj);
    if (!Number.isInteger(units) || units < 1)
        throw new UnsupportedShopError('invalid pricing quantity');
    // xname() observes a nearby object before doname_base() appends its price.
    // Movement admission cannot mutate discovery state, so project that one
    // source-ordered write for its arithmetic preflight.
    const pricedObject = observed && !obj.dknown
        ? { ...obj, dknown: true }
        : obj;
    const pricingUnitCost = get_cost(pricedObject, shopkeeper, state);
    return {
        cost: units * pricingUnitCost,
        pricingUnitCost,
        shopkeeper,
    };
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

// C ref: shk.c NOTANGRY() (54). Peacefulness is the whole test; shk.c also
// assigns through this macro, which is why it is written as a field read.
function NOTANGRY(monster) {
    return Boolean(monster.mpeaceful);
}

// C ref: shk.c muteshk() (58). MS_ANIMAL is the last animal noise of
// monflag.h's `enum ms_sounds`, so `<=` covers every species that grunts
// rather than talks. monst.h:251 helpless() is inlined, as js/mhitm.js and
// js/steed.js inline it.
function muteshk(shopkeeper) {
    return Boolean(shopkeeper.msleeping) || !shopkeeper.mcanmove
        || shopkeeper.data.msound <= MS_ANIMAL;
}

// C ref: shk.c shop_object() (5386-5402). sounds.c dochat() calls it to decide
// whether standing on shop goods turns #chat into a price quote, so it answers
// an object only when the square is charged and the resident shopkeeper is
// present, peaceful, awake and able to speak.
//
// The loop leaves otmp holding the first object of the pile that is not gold,
// or null when the pile is empty or holds nothing but gold.
export function shop_object(x, y, state = game) {
    const roomno = in_rooms(x, y, SHOPBASE, state)[0] ?? 0;
    const shopkeeper = shop_keeper(roomno, state);
    if (!shopkeeper || !inhishop(shopkeeper, state)) return null;

    let otmp = state.level?.objects?.[x]?.[y] ?? null;
    for (; otmp; otmp = otmp.nexthere)
        if (otmp.oclass !== COIN_CLASS) break;
    /* note: otmp might have ->no_charge set, but that's ok */
    return (otmp && costly_spot(x, y, state) && NOTANGRY(shopkeeper)
            && !muteshk(shopkeeper))
        ? otmp
        : null;
}

// C ref: decl.c c_common_strings.c_the_your (39-52), indexed by carried().
const the_your = ['the', 'your'];

// C ref: shk.c shk_owns() (5884-5898). C answers the shopkeeper's possessive,
// or "the" where the shop has no resident, for an unpaid object and for one
// lying on a charged shop square. shkname() is unported and no ported caller
// names an object a shopkeeper owns, so the whole owning branch stops and
// only its NULL answer is written out.
function shk_owns(obj, state) {
    const spot = get_obj_location(obj, 0, state);
    if (spot && (obj.unpaid
        || (obj.where === OBJ_FLOOR && !obj.no_charge
            && costly_spot(spot.x, spot.y, state)))) {
        throw new UnsupportedShopError('shk_owns() naming a shop owner');
    }
    return null;
}

// C ref: shk.c mon_owns() (5899-5905). Its one branch needs y_monnam(), which
// is unported, so an object in a monster's pack stops instead of being named.
function mon_owns(obj) {
    if (obj.where === OBJ_MINVENT)
        throw new UnsupportedShopError('mon_owns() naming a carrier');
    return null;
}

// C ref: shk.c shk_your() (5860-5873). Writes the ownership prefix, with its
// trailing space, that objnam.c yname() and ysimple_name() put in front of an
// object's name: "your " for what the hero carries and "the " for what she
// does not.
//
// Its two corpse arms are absent. Both test ismnum(obj->corpsenm), and
// objnam.c cxname() -- which yname() calls before this -- already stops on a
// corpse because corpse_xname() is unported.
//
// Both owner probes answer NULL for every object this port names, so C's
// `!shk_owns(...) && !mon_owns(...)` guard is always true here. Each probe is
// still called, because each stops where C would write an owner's possessive.
export function shk_your(obj, state = game) {
    shk_owns(obj, state);
    mon_owns(obj);
    return `${the_your[carried(obj) ? 1 : 0]} `;
}

function heroIsInvisible(state) {
    const value = state.u?.uprops?.[INVIS];
    return Boolean((value?.intrinsic || value?.extrinsic) && !value?.blocked);
}

// C ref: youprop.h Deaf. Unlike ordinary properties it has a roleplay-option
// source and no blocked term.
function heroIsDeaf(state) {
    const value = state.u?.uprops?.[DEAF];
    return Boolean(
        value?.intrinsic || value?.extrinsic || state.u?.uroleplay?.deaf,
    );
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
    const { extension, room, shopkeeper } = assert_shop_entry_supported(
        state.u.ux,
        state.u.uy,
        roomno,
        state,
    );

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
    const owner = s_suffix(extension.shknam);
    if (!heroIsDeaf(state)) {
        await message(
            `"${Hello(state.urole, { shopkeeper: true })}, ${playerName}!  `
            + `Welcome${again} to ${owner} ${shopName}!"`,
            state,
        );
    } else {
        await message(`You enter ${owner} ${shopName}${again}!`, state);
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
