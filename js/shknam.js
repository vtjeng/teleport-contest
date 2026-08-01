// Shop stocking and shopkeeper creation.
// C ref: shknam.c veggy_item(), shkveg(), mkveggy_at(), nameshk(), shkinit(),
// mkshobj_at(), and stock_room(). The shop records come from
// js/shtypes_data.js, generated from shknam.c shtypes[].

import {
    CORR,
    DOOR,
    DUST,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    HEALTHY_TIN,
    IS_ROOM,
    MM_ESHK,
    PL_NSIZ,
    ROOM,
    ROOMOFFSET,
    SDOOR,
    ismnum,
} from './const.js';
import { depth, ledger_no } from './dungeon.js';
import { set_tin_variety, vegetarian } from './eat.js';
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
import { NON_PM, PM_LICHEN, PM_SHOPKEEPER, S_MIMIC } from './monsters.js';
import { objectGenerationEnv } from './object_generation.js';
import { mkobj_at, mksobj_at } from './obj.js';
import {
    CORPSE,
    EGG,
    FOOD_CLASS,
    MAXOCLASSES,
    NUM_OBJECTS,
    SCR_CHARGING,
    SPE_NOVEL,
    TIN,
    TOUCHSTONE,
    VEGGY,
} from './objects.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { newsym } from './display.js';
import {
    SHTYPES,
    shkgeneral,
    shkrings,
    shktools,
    shkwands,
} from './shtypes_data.js';

const SOURCE_RANDOM = Object.freeze({ d, rn1, rn2, rnd, rne, rnz });

// C ref: shknam.c:19. The pseudo-class the health food store's iprobs[] names
// where every other row names a real object class or a negated object type.
const VEGETARIAN_CLASS = MAXOCLASSES + 1;

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

// C ref: shknam.c veggy_item(). C answers for an actual object when `obj` is
// given and for a bare type otherwise, in which case it stands a lichen in for
// the corpse species so that a tin or a corpse of unknown contents counts as
// vegetarian. shkveg() is the only caller here and always takes the type form;
// the object form is translated with it because it is one C function.
export function veggy_item(obj, otyp, state = game) {
    let corpsenm;
    let oclass;

    if (obj) {
        otyp = obj.otyp;
        oclass = obj.oclass;
        corpsenm = obj.corpsenm;
    } else {
        oclass = state.objects[otyp].oc_class;
        corpsenm = PM_LICHEN;
    }

    if (oclass === FOOD_CLASS) {
        if (state.objects[otyp].oc_material === VEGGY || otyp === EGG)
            return true;
        // Only an actual object reaches this, because the type form's lichen
        // standin is never NON_PM. spe 0 is an empty tin and spe 1 spinach.
        if (otyp === TIN && corpsenm === NON_PM)
            return obj.spe === 1;
        if (otyp === TIN || otyp === CORPSE)
            return ismnum(corpsenm) && vegetarian(state.mons[corpsenm]);
    }
    return false;
}

// C ref: shknam.c shkveg(). Picks one food type from the vegetarian ones,
// weighted by objects[].oc_prob, with a single rnd(maxprob). C's ok[] is a
// NUM_OBJECTS array indexed by a separate counter; the array below holds the
// same entries in the same order.
//
// The `index < NUM_OBJECTS` bound never ends the scan, because objects.c puts
// POTION_CLASS straight after FOOD_CLASS and the class test above breaks
// first. It is C's guard against a catalog whose last class is food, and the
// generated-data check on js/objects.js is what keeps that from happening.
export function shkveg(normalized) {
    const { random, state } = normalized;
    const oclass = FOOD_CLASS;
    const ok = [];
    let maxprob = 0;

    for (let index = state.svb.bases[oclass]; index < NUM_OBJECTS; ++index) {
        if (state.objects[index].oc_class !== oclass) break;
        if (veggy_item(null, index, state)) {
            ok.push(index);
            maxprob += state.objects[index].oc_prob;
        }
    }
    if (maxprob < 1) throw new Error('shkveg no veggy objects');

    let prob = random.rnd(maxprob);
    let j = 0;
    let i = ok[0];
    while ((prob -= state.objects[i].oc_prob) > 0) {
        j++;
        i = ok[j];
    }
    return i;
}

// C ref: shknam.c mkveggy_at(). A tin the health food store stocks is forced
// to a variety a vegetarian may eat, which costs further draws inside
// set_tin_variety().
//
// C's `artif` argument is TRUE and no test can tell it from FALSE: mksobj()
// reads it only in mksobj_init()'s WEAPON_CLASS and ARMOR_CLASS arms, and
// shkveg() answers a food type. The negated-itype arm below is where an
// armor does reach that gate, and both of its booleans are pinned there.
function mkveggy_at(sx, sy, normalized) {
    const obj = mksobj_at(shkveg(normalized), sx, sy, true, true, normalized);
    if (obj && obj.otyp === TIN)
        set_tin_variety(obj, HEALTHY_TIN, normalized);
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
            // C's comment on the assignment below says the '_' prefix test
            // further down reverses it, and one entry does carry a prefix:
            // shktools[22] is "-Zlaw", so the test at the foot of this loop
            // sets female back to true for it. One hardware-store keeper in
            // forty is female, and this assignment is not the last word.
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
    // shop draws here differs: a hardware store and a wand shop draw nothing
    // and always get the scroll, a jewelers draws one rn2(2) after its
    // touchstone, a general store draws one rn2(5), and an armor, weapon,
    // liquor, food or health food shop draws nothing and gets neither item.
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

// C ref: shknam.c mkshobj_at(). C takes the shtypes[] row by pointer and
// recovers its index for get_shop_item(); the index is what this port passes
// throughout.
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

    // An iprobs[] itype is a real object class when it is non-negative, the
    // health food store's pseudo-class when it is VEGETARIAN_CLASS, and the
    // negation of one object type when it is negative.
    const atype = get_shop_item(shopIndex, random);
    if (atype === VEGETARIAN_CLASS) mkveggy_at(sx, sy, normalized);
    else if (atype < 0) mksobj_at(-atype, sx, sy, true, true, normalized);
    else mkobj_at(atype, sx, sy, true, normalized);
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
    const shop = SHTYPES[shopIndex];
    if (!shop) throw new RangeError(`shtypes[] has no row ${shopIndex}`);

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
