// Shop creation used by the Twin businesses themed room.
// C ref: shknam.c nameshk(), shkinit(), mkshobj_at(), and stock_room().
// This slice deliberately supports only the armor and weapon shop records
// selected by that initial-generation callback; other shop types fail closed.

import {
    ARMORSHOP,
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
    SHOPBASE,
    WEAPONSHOP,
} from './const.js';
import { depth, ledger_no } from './dungeon.js';
import { make_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { distmin } from './hacklib.js';
import {
    makemon,
    mkmonmoney,
} from './makemon_create.js';
import { mkclass, set_malign } from './makemon.js';
import { m_at } from './monst.js';
import { PM_SHOPKEEPER, S_MIMIC } from './monsters.js';
import { objectGenerationEnv } from './object_generation.js';
import { mkobj_at } from './obj.js';
import { ARMOR_CLASS, WEAPON_CLASS } from './objects.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { newsym } from './display.js';

const SOURCE_RANDOM = Object.freeze({ d, rn1, rn2, rnd, rne, rnz });

const ARMOR_NAMES = Object.freeze([
    'Demirci', 'Kalecik', 'Boyabai', 'Yildizeli', 'Gaziantep',
    'Siirt', 'Akhalataki', 'Tirebolu', 'Aksaray', 'Ermenak',
    'Iskenderun', 'Kadirli', 'Siverek', 'Pervari', 'Malasgirt',
    'Bayburt', 'Ayancik', 'Zonguldak', 'Balya', 'Tefenni',
    'Artvin', 'Kars', 'Makharadze', 'Malazgirt', 'Midyat',
    'Birecik', 'Kirikkale', 'Alaca', 'Polatli', 'Nallihan',
]);

const WEAPON_NAMES = Object.freeze([
    'Voulgezac', 'Rouffiac', 'Lerignac', 'Touverac', 'Guizengeard',
    'Melac', 'Neuvicq', 'Vanzac', 'Picq', 'Urignac',
    'Corignac', 'Fleac', 'Lonzac', 'Vergt', 'Queyssac',
    'Liorac', 'Echourgnac', 'Cazelon', 'Eypau', 'Carignan',
    'Monbazillac', 'Jonzac', 'Pons', 'Jumilhac', 'Fenouilledes',
    'Laguiolet', 'Saujon', 'Eymoutiers', 'Eygurande', 'Eauze',
    'Labouheyre',
]);

const GENERAL_NAMES = Object.freeze([
    'Hebiwerie', 'Possogroenoe', 'Asidonhopo', 'Manlobbi',
    'Adjama', 'Pakka Pakka', 'Kabalebo', 'Wonotobo',
    'Akalapi', 'Sipaliwini', 'Annootok', 'Upernavik',
    'Angmagssalik', 'Aklavik', 'Inuvik', 'Tuktoyaktuk',
    'Chicoutimi', 'Ouiatchouane', 'Chibougamau', 'Matagami',
    'Kipawa', 'Kinojevis', 'Abitibi', 'Maganasipi',
    'Akureyri', 'Kopasker', 'Budereyri', 'Akranes',
    'Bordeyri', 'Holmavik',
]);

// Indexes are rtype - SHOPBASE, matching shtypes[] in shknam.c.
const TWIN_SHOPS = new Map([
    [ARMORSHOP - SHOPBASE, Object.freeze({
        name: 'used armor dealership',
        iprobs: Object.freeze([
            Object.freeze({ probability: 90, type: ARMOR_CLASS }),
            Object.freeze({ probability: 10, type: WEAPON_CLASS }),
        ]),
        names: ARMOR_NAMES,
    })],
    [WEAPONSHOP - SHOPBASE, Object.freeze({
        name: 'antique weapons outlet',
        iprobs: Object.freeze([
            Object.freeze({ probability: 90, type: WEAPON_CLASS }),
            Object.freeze({ probability: 10, type: ARMOR_CLASS }),
        ]),
        names: WEAPON_NAMES,
    })],
]);

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

function get_shop_item(shop, random) {
    let roll = random.rnd(100);
    for (const item of shop.iprobs) {
        roll -= item.probability;
        if (roll <= 0) return item.type;
    }
    throw new Error(`invalid stock probabilities for ${shop.name}`);
}

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
        if (nameWanted < namesAvailable) {
            shopName = names[nameWanted];
        } else {
            const choice = random.rn2(namesAvailable);
            if (choice) {
                shopName = names[choice - 1];
            } else if (names !== GENERAL_NAMES) {
                names = GENERAL_NAMES;
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

function shkinit(shop, sroom, normalized) {
    const { state } = normalized;
    const placement = good_shopdoor(sroom, state);
    if (!placement) return null;
    if (m_at(placement.sx, placement.sy, state)) {
        throw new Error(
            'Twin businesses shopkeeper square unexpectedly occupied',
        );
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
    nameshk(shk, shop.names, normalized);
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

function mkshobj_at(shop, sx, sy, _special, normalized) {
    const { random, state } = normalized;
    if (random.rn2(100) < depth(state.u.uz, state)
        && !m_at(sx, sy, state)) {
        const mimic = mkclass(S_MIMIC, 0, normalized);
        if (mimic && makemon(mimic, sx, sy, 0, normalized)) return;
    }
    mkobj_at(get_shop_item(shop, random), sx, sy, true, normalized);
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
    const shop = TWIN_SHOPS.get(shopIndex);
    if (!shop)
        throw new RangeError(`unsupported shop type index ${shopIndex}`);

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
            mkshobj_at(shop, x, y, stockCount === specialSpot, normalized);
        }
    }

    state.level.flags.has_shop = true;
    return true;
}
