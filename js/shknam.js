// Shop stocking and shopkeeper creation.
// C ref: shknam.c nameshk(), shkinit(), mkshobj_at(), and stock_room().
// The shop records come from js/shtypes_data.js, generated from shknam.c
// shtypes[]. SUPPORTED_SHOPS below names the rows this port can stock; the
// rest fail closed.

import {
    CORR,
    DOOR,
    DUST,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    IS_ROOM,
    MM_ESHK,
    PL_NSIZ,
    ROOM,
    ROOMOFFSET,
    SDOOR,
} from './const.js';
import { depth, ledger_no } from './dungeon.js';
import { make_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { distmin } from './hacklib.js';
import {
    makemon,
    mkmonmoney,
    mongets,
} from './makemon_create.js';
import { mkclass, set_malign } from './makemon.js';
import { m_at } from './monst.js';
import { PM_SHOPKEEPER, S_MIMIC } from './monsters.js';
import { objectGenerationEnv } from './object_generation.js';
import { mkobj_at, mksobj_at } from './obj.js';
import { SCR_CHARGING, SPE_NOVEL, TOUCHSTONE } from './objects.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { newsym } from './display.js';
import { UnsupportedSpecialRoomError } from './mkroom.js';
import {
    SHTYPES,
    shkgeneral,
    shkrings,
    shktools,
    shkwands,
} from './shtypes_data.js';

const SOURCE_RANDOM = Object.freeze({ d, rn1, rn2, rnd, rne, rnz });

// The SHTYPES rows this port stocks, by index, which is the room's
// rtype - SHOPBASE. Together they take 90% of mkshop()'s roll: 42% general
// store, 14% used armor dealership, 10% second-hand bookstore, 10% liquor
// emporium, 5% antique weapons outlet, 3% jewelers, 3% hardware store, 3%
// rare books. Every other row needs stock this port cannot make yet, so
// shopType() refuses it and the segment ends there rather than drawing the
// wrong objects:
//
//   delicatessen, wand shop, lighting   iprobs[] entries with a negative
//     store                             itype, which need mksobj_at()
//   health food store                   VEGETARIAN_CLASS, so shkveg(),
//                                       veggy_item() and mkveggy_at()
const SUPPORTED_SHOPS = new Set([0, 1, 2, 3, 4, 6, 8, 9]);

function shopType(shopIndex) {
    const shop = SHTYPES[shopIndex];
    if (!shop)
        throw new RangeError(`shtypes[] has no row ${shopIndex}`);
    if (!SUPPORTED_SHOPS.has(shopIndex)) {
        throw new UnsupportedSpecialRoomError(
            `stock_room() stocking a ${shop.name}`,
        );
    }
    return shop;
}

function shopEnv(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? SOURCE_RANDOM;
    const required = ['d', 'rn1', 'rn2', 'rnd', 'rne'];
    if (!required.every((name) => typeof random[name] === 'function')) {
        throw new TypeError(
            `shop stocking random injection requires ${required.join(', ')}`,
        );
    }
    return objectGenerationEnv({ ...rawEnv, state, random });
}

// C ref: shknam.c get_shop_item(). One rnd(100) walks the shop's iprobs[],
// whose shares total 100, so the walk always stops on a pair. `type` is the
// index into shtypes[], which is the room's rtype less SHOPBASE; C's callers
// pass `shp - shtypes` and `rt - SHOPBASE` for the same quantity.
export function get_shop_item(type, random) {
    const shop = SHTYPES[type];
    if (!shop) throw new RangeError(`shtypes[] has no row ${type}`);
    let roll = random.rnd(100);
    for (const item of shop.iprobs) {
        roll -= item.iprob;
        if (roll <= 0) return item.itype;
    }
    throw new Error(`invalid stock probabilities for ${shop.name}`);
}

// C ref: shknam.c nameshk(). `initialNames` is C's `nlp`, and the branches
// below compare it by identity exactly as C compares the pointer.
//
// The minetown shklight arm above C's else is unreachable here: the lighting
// store has probability 0, so only the special-level loader ever asks for one.
//
// Every list but shktools reaches its name without drawing, so a wrong name
// shows up only on the screen. The hardware store is the exception: its arm
// draws rn2(names_avail) on every pass of the loop.
function nameshk(shk, initialNames, normalized) {
    const { random, state } = normalized;
    const eshk = shk.mextra?.eshk;
    if (!eshk) throw new Error('nameshk requires shopkeeper extension data');

    const nseed = Math.trunc(Math.trunc(state.ubirthday ?? 0) / 257);
    let nameWanted = shk.m_id
        + ledger_no(state.u.uz, state)
        + (nseed % 13)
        - (nseed % 5);
    if (nameWanted < 0) nameWanted += 18;
    shk.female = Boolean(nameWanted & 1);

    let names = initialNames;
    let namesAvailable = names.length;
    nameWanted %= namesAvailable;
    let shopName = names[nameWanted];

    for (let tryCount = 0; tryCount < 50; ++tryCount) {
        if (names === shktools) {
            // C draws here rather than indexing by name_wanted, so a hardware
            // store is the one shop whose keeper's name costs a random number.
            // C's comment on the assignment below says the '_' and '-' prefix
            // test further down reverses it; no shktools entry carries either
            // prefix, so it stands.
            shopName = shktools[random.rn2(namesAvailable)];
            shk.female = false;
        } else if (nameWanted < namesAvailable) {
            shopName = names[nameWanted];
        } else {
            const choice = random.rn2(namesAvailable);
            if (choice) {
                shopName = names[choice - 1];
            } else if (names !== shkgeneral) {
                names = shkgeneral;
                namesAvailable = names.length;
                continue;
            } else {
                shopName = shk.female ? '-Lucrezia' : '+Dirk';
            }
        }

        if (shopName.startsWith('_') || shopName.startsWith('-'))
            shk.female = true;
        else if (shopName.startsWith('|') || shopName.startsWith('+'))
            shk.female = false;

        let duplicate = false;
        for (let current = state.level.monlist;
            current;
            current = current.nmon) {
            if (current.mhp < 1 || current === shk || !current.isshk)
                continue;
            const currentName = current.mextra?.eshk?.shknam;
            if (currentName == null)
                throw new Error('shopkeeper lacks extension data');
            if (currentName !== shopName) continue;
            nameWanted = namesAvailable;
            duplicate = true;
            break;
        }
        if (!duplicate) break;
    }

    eshk.shknam = shopName.slice(0, PL_NSIZ - 1);
}

function good_shopdoor(sroom, state) {
    const roomNumber = (sroom.roomnoidx ?? -1) + ROOMOFFSET;
    for (let offset = 0; offset < sroom.doorct; ++offset) {
        const index = sroom.fdoor + offset;
        const door = state.level.doors[index];
        if (!door) continue;
        let sx = door.x;
        let sy = door.y;

        if (sroom.irregular) {
            const candidates = [
                [sx - 1, sy], [sx + 1, sy],
                [sx, sy - 1], [sx, sy + 1],
            ];
            const inside = candidates.find(([x, y]) => {
                const loc = state.level.at(x, y);
                return loc && !loc.edge && loc.roomno === roomNumber;
            });
            if (!inside) continue;
            [sx, sy] = inside;
        } else if (sx === sroom.lx - 1) {
            ++sx;
        } else if (sx === sroom.hx + 1) {
            --sx;
        } else if (sy === sroom.ly - 1) {
            ++sy;
        } else if (sy === sroom.hy + 1) {
            --sy;
        } else {
            continue;
        }
        return { index, sx, sy };
    }
    return null;
}

// C ref: shknam.c shkinit(). Returns the svd.doors index the shopkeeper was
// placed beside, or null for C's -1.
function shkinit(shop, sroom, normalized) {
    const { state } = normalized;
    const placement = good_shopdoor(sroom, state);
    if (!placement) return null;
    if (m_at(placement.sx, placement.sy, state)) {
        // C rloc()s the occupant out of the way. Nothing has placed a monster
        // by the time makelevel() stocks a fresh shop, so this stays a stop.
        throw new Error('shopkeeper square unexpectedly occupied');
    }

    const shk = makemon(
        state.mons[PM_SHOPKEEPER],
        placement.sx,
        placement.sy,
        MM_ESHK,
        normalized,
    );
    if (!shk) return null;
    const eshk = shk.mextra.eshk;
    shk.isshk = true;
    shk.mpeaceful = true;
    set_malign(shk, state);
    shk.msleeping = false;
    shk.mtrapseen = -1;

    eshk.shoproom = (sroom.roomnoidx ?? -1) + ROOMOFFSET;
    sroom.resident = shk;
    eshk.shoptype = sroom.rtype;
    eshk.shoplevel = { ...state.u.uz };
    eshk.shd = { ...state.level.doors[placement.index] };
    eshk.shk = { x: placement.sx, y: placement.sy };
    eshk.robbed = 0;
    eshk.credit = 0;
    eshk.debit = 0;
    eshk.loan = 0;
    eshk.following = false;
    eshk.surcharge = false;
    eshk.dismiss_kops = false;
    eshk.billct = 0;
    eshk.visitct = 0;
    eshk.bill_p = null;
    eshk.customer = '';

    mkmonmoney(shk, 1000 + 30 * normalized.random.rnd(100), normalized);
    // C's starting stock for the keeper, tested on the shop's name list rather
    // than on the shop. The `||` chain short-circuits, so what each stocking
    // shop draws here differs: a hardware store draws nothing and always gets
    // the scroll, a jewelers draws one rn2(2) after its touchstone, a general
    // store draws one rn2(5), and an armor, weapon or liquor shop draws
    // nothing and gets neither item. The shkwands clause belongs to a shop
    // type shopType() still refuses.
    if (shop.shknms === shkrings) mongets(shk, TOUCHSTONE, normalized);
    if (shop.shknms === shktools || shop.shknms === shkwands
        || (shop.shknms === shkrings && normalized.random.rn2(2))
        || (shop.shknms === shkgeneral && normalized.random.rn2(5))) {
        mongets(shk, SCR_CHARGING, normalized);
    }
    nameshk(shk, shop.shknms, normalized);
    return placement.index;
}

function stock_room_goodpos(sroom, roomNumber, doorIndex, sx, sy, state) {
    const door = state.level.doors[doorIndex];
    if (sroom.irregular) {
        const loc = state.level.at(sx, sy);
        if (loc.edge || loc.roomno !== roomNumber
            || distmin(sx, sy, door.x, door.y) <= 1) {
            return false;
        }
    } else if ((sx === sroom.lx && door.x === sx - 1)
        || (sx === sroom.hx && door.x === sx + 1)
        || (sy === sroom.ly && door.y === sy - 1)
        || (sy === sroom.hy && door.y === sy + 1)) {
        return false;
    }
    return IS_ROOM(state.level.at(sx, sy).typ);
}

// C ref: shknam.c mkshobj_at(). get_shop_item() answers a non-negative object
// class for every shop type this port stocks, so neither the VEGETARIAN_CLASS
// nor the negative-otyp mksobj_at() arm is reachable here.
//
// C takes the shtypes[] row by pointer and recovers its index for
// get_shop_item(); the index is what this port passes throughout.
function mkshobj_at(shopIndex, sx, sy, mkspecl, normalized) {
    const { random, state } = normalized;
    const shop = SHTYPES[shopIndex];

    // The 3.6 tribute. C tests shp->name against the two bookstores by string,
    // so the square stock_room() singled out holds a novel rather than the
    // shop's own stock, and no other shop type can reach this. The novel is
    // made with init false: mksobj() still runs its SPE_NOVEL finalization,
    // which is where noveltitle() draws the title, but skips the
    // blessorcurse(17) the SPBOOK_CLASS arm of mksobj_init() would spend.
    // C's `artif` argument is FALSE too, and no test can tell it from TRUE:
    // mksobj() reads it only inside mksobj_init(), which init false skips, and
    // the novel is not oc_unique, so the mk_artifact() tail is unreachable.
    if (mkspecl && (shop.name === 'rare books'
                    || shop.name === 'second-hand bookstore')) {
        const novel = mksobj_at(SPE_NOVEL, sx, sy, false, false, normalized);
        if (novel) state.context.tribute.bookstock = true;
        return;
    }

    if (random.rn2(100) < depth(state.u.uz, state)
        && !m_at(sx, sy, state)) {
        const mimic = mkclass(S_MIMIC, 0, normalized);
        if (mimic && makemon(mimic, sx, sy, 0, normalized)) return;
    }
    mkobj_at(get_shop_item(shopIndex, random), sx, sy, true, normalized);
}

function insideShop(sroom, x, y) {
    return x >= sroom.lx && x <= sroom.hx
        && y >= sroom.ly && y <= sroom.hy;
}

function redrawDoor(x, y, normalized) {
    if (typeof normalized.hooks?.newsym === 'function') {
        normalized.hooks.newsym(x, y, normalized);
    } else if (normalized.state === game) {
        newsym(x, y);
    }
}

// C ref: shknam.c stock_room().
export function stock_room(shopIndex, sroom, rawEnv = {}) {
    const normalized = shopEnv(rawEnv);
    const { random, state } = normalized;
    const shop = shopType(shopIndex);

    const shopDoor = shkinit(shop, sroom, normalized);
    if (shopDoor == null) return false;

    const firstDoor = state.level.doors[sroom.fdoor];
    const doorLoc = state.level.at(firstDoor.x, firstDoor.y);
    if (doorLoc.doormask === D_NODOOR) {
        doorLoc.doormask = D_ISOPEN;
        doorLoc.flags = D_ISOPEN;
        redrawDoor(firstDoor.x, firstDoor.y, normalized);
    }
    if (doorLoc.typ === SDOOR) {
        doorLoc.typ = DOOR;
        redrawDoor(firstDoor.x, firstDoor.y, normalized);
    }
    if (doorLoc.doormask & D_TRAPPED) {
        doorLoc.doormask = D_LOCKED;
        doorLoc.flags = D_LOCKED;
    }

    if (doorLoc.doormask === D_LOCKED) {
        let x = firstDoor.x;
        let y = firstDoor.y;
        if (insideShop(sroom, x + 1, y)) --x;
        else if (insideShop(sroom, x - 1, y)) ++x;
        if (insideShop(sroom, x, y + 1)) --y;
        else if (insideShop(sroom, x, y - 1)) ++y;
        make_engr_at(
            x, y, 'Closed for inventory', null, 0, DUST, normalized,
        );
        const outside = state.level.at(x, y);
        if (outside.typ !== CORR && outside.typ !== ROOM)
            outside.typ = ROOM;
    }

    const roomNumber = (sroom.roomnoidx ?? -1) + ROOMOFFSET;
    let stockCount = 0;
    let specialSpot = 0;
    if (state.context?.tribute?.enabled
        && !state.context.tribute.bookstock) {
        for (let x = sroom.lx; x <= sroom.hx; ++x) {
            for (let y = sroom.ly; y <= sroom.hy; ++y) {
                if (stock_room_goodpos(
                    sroom, roomNumber, shopDoor, x, y, state,
                )) ++stockCount;
            }
        }
        specialSpot = random.rnd(stockCount);
        stockCount = 0;
    }

    for (let x = sroom.lx; x <= sroom.hx; ++x) {
        for (let y = sroom.ly; y <= sroom.hy; ++y) {
            if (!stock_room_goodpos(
                sroom, roomNumber, shopDoor, x, y, state,
            )) continue;
            ++stockCount;
            mkshobj_at(
                shopIndex, x, y, stockCount === specialSpot, normalized,
            );
        }
    }

    state.level.flags.has_shop = true;
    return true;
}
