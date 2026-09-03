// Shop admission and entry/departure transitions, generated-shop pricing,
// live price-quote writes, remembered-price queries, and shopkeeper movement.
// C refs: shk.c inhishop(), inside_shop(), shop_keeper(), u_entered_shop(),
// u_left_shop(), getprice(), get_cost(), get_cost_of_shop_item(),
// append_price_quote(), contained_gold(), check_unpaid(), costly_spot(),
// shop_object(), shk_owns(), mon_owns(), shk_your(), shk_move(),
// shk_fixes_damage(), and the end-of-game cleanup chain next_shkp(),
// rile_shk(), onbill(), clear_unpaid(), clear_no_charge(), setpaid(),
// inherits() and paybill().

import {
    A_CHA,
    ACH_SHOP,
    BUFSZ,
    CONFLICT,
    DEAF,
    FAST,
    helpless,
    HUNGRY,
    INVIS,
    isok,
    LOW_PM,
    MS_ANIMAL,
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OBJ_MINVENT,
    PL_NSIZ,
    ROOMOFFSET,
    SHOPBASE,
} from './const.js';
import { effective_attribute } from './attrib.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { dist2, online2, s_suffix } from './hacklib.js';
import { carrying } from './invent.js';
import { record_achievement } from './insight.js';
import { get_obj_location } from './light.js';
import { set_malign } from './makemon.js';
import { mongone } from './makemon_create.js';
import { wake_nearto } from './mon.js';
import {
    carried, hasContents, isCandle, isContainer, objectType, sobj_at,
} from './obj.js';
import {
    ARMOR_CLASS,
    COIN_CLASS,
    CORPSE,
    DUNCE_CAP,
    DWARVISH_MATTOCK,
    EGG,
    FOOD_CLASS,
    GEM_CLASS,
    GLASS,
    POTION_CLASS,
    POT_WATER,
    PICK_AXE,
    TIN,
    TOOL_CLASS,
    WAND_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import { PM_TOURIST } from './monsters.js';
import { resist_conflict } from './mondata.js';
import { Hello } from './role_init.js';
import { in_rooms } from './rooms.js';
import { move_special } from './priest.js';
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

// C ref: shk.c tended_shop() (1117-1123).
export function tended_shop(sroom, state) {
    const mtmp = sroom?.resident;
    return mtmp ? inhishop(mtmp, state) : false;
}

// C ref: shk.c noisy_shop() (1125-1133).
export async function noisy_shop(sroom, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const mtmp = sroom?.resident;
    if (mtmp && inhishop(mtmp, state)) {
        await wake_nearto(mtmp.mx, mtmp.my, 11 * 11, rawEnv);
    }
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

// C ref: shk.c after_shk_move(). A sentinel is installed only when a hero
// enters a shop whose keeper is temporarily not on the level; an ordinary
// shopkeeper move has no visible or random side effect here.
export function after_shk_move(shopkeeper, state = game) {
    const extension = shopkeeper?.mextra?.eshk;
    if (!extension || extension.bill_p !== -1000
        || !inhishop(shopkeeper, state)) return;

    extension.bill_p = extension.bill ?? [];
    // check_special_room(FALSE) is already the caller's movement boundary in
    // this port. The sentinel reset is the only state change in this helper's
    // supported path.
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

// C ref: shk.c check_unpaid() (5737-5742), the "used in the normal manner"
// entry point, over check_unpaid_usage() (5687-5733). C's wrapper is one call
// with `altusage` FALSE; the guard below is check_unpaid_usage()'s own opening
// test (5695-5697).
//
// C returns silently twice more past that guard: when shop_keeper() finds no
// keeper for the room or inhishop() finds it away (5698-5700), and when
// cost_per_charge() prices the use at zero (5701-5702). Neither is ported, so
// this refusal is deliberately wider than the set C bills for, and a hero in a
// shop whose keeper is absent or dead stops here where C charges nothing.
//
// What it refuses is the tail, for the arms `altusage` FALSE can reach:
// cost_per_charge(), then a line whose lead-ins are drawn for -- two rn2(3)
// draws choosing `Hey!  ` and `Ahem.  ` in the default arm (5719-5724), one
// rn2(2) choosing the library scolding for a spellbook (5705-5709), and no
// draw at all for a potion of oil (5710-5711) -- then verbalize() and
// exercise(A_WIS, TRUE) behind `!Deaf && !muteshk(shkp)` (5727-5731), then an
// unconditional `ESHK(shkp)->debit += tmp` (5732). The `Whoa!  ` and
// `Watch it!  ` lead-ins belong to the emptying arm at 5712-5718, which only
// an `altusage` TRUE caller reaches. None of this is ported, so the tail stops
// as a whole.
//
// The `*u.ushops` term is the first entry of hack.c move_update()'s room list;
// js/rooms.js stores it as a fixed five-entry array, so an empty list reads as
// a zero here exactly as an empty string does in C.
export function check_unpaid_usage(otmp, altusage, state = game) {
    if (!otmp.unpaid || !state.u?.ushops?.[0]
        || (otmp.spe <= 0 && objectType(otmp, state).oc_charged))
        return;
    throw new UnsupportedShopError(
        `check_unpaid_usage() billing a${altusage ? 'n unusual' : ''} use fee`,
    );
}

export function check_unpaid(otmp, state = game) {
    check_unpaid_usage(otmp, false, state);
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
// rather than talks.
function muteshk(shopkeeper) {
    return helpless(shopkeeper) || shopkeeper.data.msound <= MS_ANIMAL;
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

// C ref: shk.c sellobj_state() (3913-3924). Switches the shopkeeper's billing
// mode. SELL_NORMAL resets auto-credit and sell_response; other values prime
// sell_response to 'a' so the next accidental drop is auto-sold.
// use_container() calls sellobj_state(SELL_NORMAL) at containerdone to restore
// the default state after in_container() may have changed it.
export function sellobj_state(deliberate, state = game) {
    state.gs ??= {};
    state.gs.sell_response = (deliberate !== 0) ? '\0' : 'a';
    state.gs.sell_how = deliberate;
    state.ga ??= {};
    state.ga.auto_credit = false;
}

// C ref: shk.c shk_fixes_damage() (4556-4577).  The shopkeeper walks
// level.damagelist looking for repairable damage.  On a fresh shop with no
// damage the list is absent, so find_damage() returns null and the function
// returns immediately.  Every other path (whisper, repair, discard) is
// unported; refuse if damage exists.
function shk_fixes_damage(shkp, state) {
    // C: `struct damage *dam = find_damage(shkp);`
    // find_damage walks svl.level.damagelist.  No damage means no work.
    if (!state.level?.damagelist) return;
    throw new UnsupportedShopError(
        'shk_fixes_damage with existing shop damage',
    );
}

// C ref: shk.c shk_move() (4880-4993). Covers the ordinary peaceful path and
// hands candidate selection to priest.c move_special(), which is shared by
// both special movers. Combat, following speech, and repair still stop at
// their source branches.
//
// Return values match C: 1 = moved, 0 = didn't, -1 = let m_move do it,
// -2 = died.
export function shk_move(shkp, state, rawEnv = {}) {
    const env = { ...rawEnv, state };
    const eshkp = shkp.mextra?.eshk;
    if (!eshkp) {
        throw new UnsupportedShopError('shk_move without eshk extension');
    }
    const omx = shkp.mx;
    const omy = shkp.my;

    if (inhishop(shkp, state)) shk_fixes_damage(shkp, state);

    const hero = state.u;
    const udist = dist2(omx, omy, hero?.ux ?? 0, hero?.uy ?? 0);
    if (udist < 3) {
        const conflict = state.u?.uprops?.[CONFLICT];
        const conflictActive = Boolean(
            conflict?.intrinsic || conflict?.extrinsic,
        );
        const random = env.random ?? { rnd: () => 0 };
        if (!shkp.mpeaceful
            || (conflictActive
                && !resist_conflict(shkp, state, random))) {
            if (typeof env.attackHero !== 'function')
                throw new UnsupportedShopError('shk_move close combat');
            env.attackHero(shkp, env);
            return 0;
        }
        if (eshkp.following)
            throw new UnsupportedShopError('shk_move following speech');
    }

    let appr = 1;
    let gtx = eshkp.shk?.x ?? omx;
    let gty = eshkp.shk?.y ?? omy;
    const satdoor = gtx === omx && gty === omy;
    const holeTime = typeof env.holeTime === 'function'
        ? env.holeTime(shkp, state) : -1;

    if (eshkp.following || (holeTime >= 0 && holeTime * holeTime <= udist)) {
        if (udist > 4 && eshkp.following && !eshkp.billct)
            return -1;
        gtx = hero.ux;
        gty = hero.uy;
    } else if (!shkp.mpeaceful) {
        if (shkp.mcansee && (env.canSeeHero?.(shkp) ?? true)) {
            gtx = hero.ux;
            gty = hero.uy;
        }
    } else {
        const invis = hero.uprops?.[INVIS];
        const invisible = Boolean((invis?.intrinsic || invis?.extrinsic)
            && !invis.blocked);
        if (invisible || hero.usteed) {
            appr = 0;
        } else {
            const door = eshkp.shd ?? {};
            const uondoor = hero.ux === door.x && hero.uy === door.y;
            let badinv = Boolean(
                carrying(PICK_AXE, state)
                || carrying(DWARVISH_MATTOCK, state),
            );
            const fast = hero.uprops?.[FAST];
            if (fast?.intrinsic || fast?.extrinsic) {
                badinv = badinv || Boolean(
                    sobj_at(PICK_AXE, hero.ux, hero.uy, state)
                    || sobj_at(DWARVISH_MATTOCK, hero.ux, hero.uy, state),
                );
            }
            if (satdoor && badinv) return 0;
            env._shopAvoid = uondoor
                ? !badinv
                : Boolean((hero.ushops ?? []).some(Boolean)
                    && dist2(gtx, gty, hero.ux, hero.uy) > 64);
            const gdist = dist2(omx, omy, gtx, gty);
            if (((!eshkp.robbed && !eshkp.billct && !eshkp.debit)
                || env._shopAvoid) && gdist < 3) {
                if (!badinv && !online2(omx, omy, hero.ux, hero.uy))
                    return 0;
                if (satdoor) {
                    appr = 0;
                    gtx = 0;
                    gty = 0;
                }
            }
        }
    }

    const result = move_special(
        shkp,
        inhishop(shkp, state),
        appr,
        hero.ux === (eshkp.shd?.x ?? -1)
            && hero.uy === (eshkp.shd?.y ?? -1),
        Boolean(env._shopAvoid),
        omx,
        omy,
        gtx,
        gty,
        env,
    );
    if (result > 0) after_shk_move(shkp, state);
    return result;
}

// C ref: shk.c IS_SHOP() (56). `x` is a room index, not a room number.
function IS_SHOP(x, state) {
    return (state.level?.rooms?.[x]?.rtype ?? -1) >= SHOPBASE;
}

// C ref: shk.c rile_shk() (196-211). Only the surcharge half runs here: every
// caller reaches it through ANGRY(shkp), so mpeaceful is already clear.
// js/shknam.js leaves eshk.bill_p null and eshk.billct zero for every
// shopkeeper the port creates, so the price walk has nothing to raise; a
// non-empty bill stops instead of being silently skipped.
function rile_shk(shopkeeper) {
    shopkeeper.mpeaceful = false; /* NOTANGRY(shkp) = FALSE */
    const eshkp = shopkeeper.mextra.eshk;
    if (!eshkp.surcharge) {
        eshkp.surcharge = true;
        if (eshkp.billct) {
            throw new UnsupportedShopError(
                "rile_shk() surcharging an angry shopkeeper's bill",
            );
        }
    }
}

// C ref: shk.c next_shkp() (214-231). Walks the monster chain from `shopkeeper`
// to the next live shopkeeper, riling one that is already angry on the way past.
function next_shkp(shopkeeper, withbill, state) {
    let shkp = shopkeeper;
    for (; shkp; shkp = shkp.nmon) {
        if (shkp.mhp < 1) continue; /* DEADMONSTER() */
        if (shkp.isshk && (shkp.mextra?.eshk?.billct || !withbill)) break;
    }
    if (shkp && !NOTANGRY(shkp)) {
        if (!shkp.mextra.eshk.surcharge) rile_shk(shkp);
    }
    return shkp;
}

// C ref: shk.c onbill() (1135-1155). C returns the bill entry; this returns it
// or null, which is the same test for every ported caller. eshk.bill_p is
// never filled, so the search finds nothing. C's two impossible() calls are
// diagnostics: the "paid obj on bill" one cannot be reached while the bill is
// empty, and the "unpaid obj" one is suppressed by every ported caller's
// silent=true.
function onbill(obj, shopkeeper, silent) {
    const eshkp = shopkeeper?.mextra?.eshk;
    if (eshkp) {
        for (let ct = 0; ct < eshkp.billct; ++ct) {
            const bp = eshkp.bill_p[ct];
            if (bp.bo_id === obj.o_id) return bp;
        }
    }
    if (obj.unpaid && !silent) {
        throw new UnsupportedShopError('onbill() reporting a stray unpaid item');
    }
    return null;
}

// C ref: shk.c clear_unpaid_obj() (307-315) and clear_unpaid() (317-323).
function clear_unpaid_obj(shopkeeper, otmp) {
    if (hasContents(otmp)) clear_unpaid(shopkeeper, otmp.cobj);
    if (onbill(otmp, shopkeeper, true)) otmp.unpaid = 0;
}

function clear_unpaid(shopkeeper, list) {
    for (let obj = list; obj; obj = obj.nobj) clear_unpaid_obj(shopkeeper, obj);
}

// C ref: shk.c clear_no_charge_obj() (325-372) and clear_no_charge() (374-383).
// The source's long disjunction clears the bit unless the object sits on the
// floor of, or in a container in, some *other* shopkeeper's shop.
function clear_no_charge_obj(shopkeeper, otmp, state) {
    if (hasContents(otmp)) clear_no_charge(shopkeeper, otmp.cobj, state);
    if (!otmp.no_charge) return;

    let keep = false;
    if (shopkeeper
        && (otmp.where === OBJ_FLOOR || otmp.where === OBJ_CONTAINED
            || otmp.where === OBJ_BURIED)) {
        // shk.c passes `OBJ_CONTAINED | OBJ_BURIED` (2 | 6 == 6), but
        // get_obj_location() reads its locflags as obj.h's CONTAINED_TOO
        // (0x1) and BURIED_TOO (0x2). Six therefore asks for buried objects
        // and not for contained ones, so a no_charge object inside a
        // container never resolves a location and always loses the bit.
        // Preserved verbatim: it is behavior, however accidental.
        const spot = get_obj_location(
            otmp,
            OBJ_CONTAINED | OBJ_BURIED,
            state,
        );
        if (spot && isok(spot.x, spot.y)) {
            const rno = state.level?.at(spot.x, spot.y)?.roomno ?? 0;
            if (rno >= ROOMOFFSET && IS_SHOP(rno - ROOMOFFSET, state)) {
                const rmShkp = state.level.rooms[rno - ROOMOFFSET].resident;
                keep = Boolean(rmShkp) && rmShkp !== shopkeeper;
            }
        }
    }
    if (!keep) otmp.no_charge = false;
}

function clear_no_charge(shopkeeper, list, state) {
    for (let obj = list; obj; obj = obj.nobj) {
        clear_no_charge_obj(shopkeeper, obj, state);
    }
}

// C ref: shk.c setpaid() (397-433). Clears one shopkeeper's claim on every
// object list the game holds, then discards the bill itself.
//
// gb.billobjs holds objects the hero used up while unpaid. Nothing in the port
// bills the hero, so that chain is never created and the drain loop at 423-427
// has nothing to free; it is therefore not modelled here.
export function setpaid(shopkeeper, state = game) {
    clear_unpaid(shopkeeper, state.invent);
    clear_unpaid(shopkeeper, state.level?.objlist ?? null);
    if (state.level?.buriedobjlist)
        clear_unpaid(shopkeeper, state.level.buriedobjlist);
    if (state.gt?.thrownobj) clear_unpaid_obj(shopkeeper, state.gt.thrownobj);
    if (state.gk?.kickedobj) clear_unpaid_obj(shopkeeper, state.gk.kickedobj);
    for (let mtmp = state.level?.monlist ?? null; mtmp; mtmp = mtmp.nmon)
        if (mtmp.minvent) clear_unpaid(shopkeeper, mtmp.minvent);
    for (let mtmp = state.gm?.migrating_mons ?? null; mtmp; mtmp = mtmp.nmon)
        if (mtmp.minvent) clear_unpaid(shopkeeper, mtmp.minvent);

    /* clear obj->no_charge for all obj in shkp's shop */
    clear_no_charge(shopkeeper, state.level?.objlist ?? null, state);
    clear_no_charge(shopkeeper, state.level?.buriedobjlist ?? null, state);

    if (shopkeeper) {
        const eshkp = shopkeeper.mextra.eshk;
        eshkp.billct = 0;
        eshkp.credit = 0;
        eshkp.debit = 0;
        eshkp.loan = 0;
    }
}

// C ref: shk.c inherits() (2570-2676). Covers the arms that leave the hero's
// possessions alone and fall through to the `clear` label: a lone shopkeeper
// who is owed nothing, is not following and is not angry. Every arm that takes
// something -- a second shopkeeper looking at the corpse, the in-shop
// "gratefully inherits", and the bill/debit/robbed and following/angry
// handling -- needs addupbill(), money2mon(), pacify_shk(), rouse_shk(),
// home_shk() and set_repo_loc(), none of which are ported, so each stops here.
function inherits(shopkeeper, numsk, _croaked, _silently, state) {
    const eshkp = shopkeeper.mextra.eshk;
    const uinshop = (state.u.ushops ?? []).includes(eshkp.shoproom);

    /* not strictly consistent; affects messages and prevents next player
       (if bones are saved) from blundering into or being ambushed by an
       invisible shopkeeper */
    shopkeeper.minvis = 0;
    shopkeeper.perminvis = 0;

    if (numsk > 1) {
        throw new UnsupportedShopError(
            'inherits() for a second shopkeeper at the hero\'s death',
        );
    }
    if (uinshop && inhishop(shopkeeper, state) && !eshkp.billct
        && !eshkp.robbed && !eshkp.debit && NOTANGRY(shopkeeper)
        && !eshkp.following && state.u.ugrave_arise < LOW_PM) {
        throw new UnsupportedShopError(
            'inherits() bequeathing the hero\'s possessions to the shopkeeper',
        );
    }
    if (eshkp.billct || eshkp.debit || eshkp.robbed) {
        throw new UnsupportedShopError(
            'inherits() settling an unpaid bill after death',
        );
    }
    if (eshkp.following || !NOTANGRY(shopkeeper)) {
        throw new UnsupportedShopError(
            'inherits() for a hostile or pursuing shopkeeper',
        );
    }

    /* clear: */
    setpaid(shopkeeper, state); /* clear this shk's bill */
    /* taken is FALSE here, so set_repo_loc() is not called */
    return false;
}

// C ref: shk.c paybill() (2483-2566). Called from end.c really_done() after
// the hero dies, quits, or escapes. Returns whether a shopkeeper took the
// hero's inventory, which decides whether finish_paybill() later moves it.
export function paybill(croaked, silently, state = game) {
    /* if we escaped from the dungeon, shopkeepers can't reach us */
    if (croaked < 0) return false;

    /* this is where inventory will end up if any shk takes it */
    state.gr ??= {};
    state.gr.repo = { location: { x: 0, y: 0 }, shopkeeper: null };

    /*
     * Scan all shopkeepers on the level, to prioritize them:
     * 1) keeper of shop hero is inside and who is owed money,
     * 2) keeper of shop hero is inside who isn't owed any money,
     * 3) other shk who is owed money, 4) other shk who is angry,
     * 5) any shk local to this level, and if none is found,
     * 6) first shk on monster list.
     */
    let resident = null;
    let creditor = null;
    let hostile = null;
    let localshk = null;
    let taken = false;
    let numsk = 0;
    let mtmp2 = null;

    for (let mtmp = next_shkp(state.level?.monlist ?? null, false, state);
        mtmp;
        mtmp = next_shkp(mtmp2, false, state)) {
        mtmp2 = mtmp.nmon;
        const eshkp = mtmp.mextra.eshk;
        const local = on_level(eshkp.shoplevel, state.u.uz);
        if (local && (state.u.ushops ?? []).includes(eshkp.shoproom)) {
            if (!resident || eshkp.billct || eshkp.debit || eshkp.robbed)
                resident = mtmp;
        } else if (eshkp.billct || eshkp.debit || eshkp.robbed) {
            if (!creditor) creditor = mtmp;
        } else if (eshkp.following || !NOTANGRY(mtmp)) {
            if (!hostile) hostile = mtmp;
        } else if (local) {
            if (!localshk) localshk = mtmp;
        }
    }

    /* give highest priority shopkeeper first crack */
    const firstshk = resident ?? creditor ?? hostile ?? localshk;
    if (firstshk) {
        numsk++;
        taken = inherits(firstshk, numsk, croaked, silently, state);
    }

    /* now handle the rest */
    mtmp2 = null;
    for (let mtmp = next_shkp(state.level?.monlist ?? null, false, state);
        mtmp;
        mtmp = next_shkp(mtmp2, false, state)) {
        mtmp2 = mtmp.nmon;
        const eshkp = mtmp.mextra.eshk;
        const local = on_level(eshkp.shoplevel, state.u.uz);
        if (mtmp !== firstshk) {
            numsk++;
            taken = inherits(mtmp, numsk, croaked, silently, state) || taken;
        }
        /* for bones: we don't want a shopless shk around */
        if (!local) mongone(mtmp, { state });
    }
    return taken;
}

// Thrown where shk.c reaches shop bookkeeping this port has not ported.
export class UnsupportedShopError extends Error {
    constructor(branch) {
        super(`shop handling requires ${branch}`);
        this.name = 'UnsupportedShopError';
        this.branch = branch;
    }
}
