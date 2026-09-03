// end.c really_done()'s shopkeeper, guard and priest cleanup: shk.c paybill()
// and its inherits()/setpaid() helpers, vault.c paygd(), and priest.c
// clearpriests().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateCleanRecipe } from './diff-fresh.mjs';
import {
    COLNO, OBJ_CONTAINED, OBJ_FLOOR, ROOM, ROOMOFFSET, ROWNO, SHOPBASE,
} from '../js/const.js';
import { COIN_CLASS } from '../js/objects.js';
import { clearpriests } from '../js/priest.js';
import { paybill, UnsupportedShopError } from '../js/shk.js';
import { findgd, paygd, UnsupportedVaultGuardError } from '../js/vault.js';

// The hero's level. Room 0 is the shop, room 1 an ordinary room, so a
// no_charge object can be placed inside or outside the shopkeeper's claim.
// Every square carries the shop's room number except column 60 and beyond,
// which belongs to room 1.
function makeState({ ux = 5, uy = 5, ushops = [0, 0, 0, 0, 0] } = {}) {
    const locations = Array.from({ length: COLNO }, (unused, x) =>
        Array.from({ length: ROWNO }, () => ({
            edge: false,
            roomno: x < 60 ? ROOMOFFSET : ROOMOFFSET + 1,
            typ: ROOM,
        })));
    return {
        u: {
            ux,
            uy,
            ushops,
            uz: { dnum: 0, dlevel: 2 },
            // NON_PM: really_done() only reaches paybill() with no grave-arise
            // monster, and inherits() reads it for the in-shop bequest test.
            ugrave_arise: -1,
        },
        invent: null,
        gm: { migrating_mons: null },
        level: {
            buriedobjlist: null,
            locations,
            monlist: null,
            objlist: null,
            rooms: [
                { resident: null, rtype: SHOPBASE },
                { resident: null, rtype: ROOM },
            ],
            at(x, y) { return locations[x]?.[y] ?? null; },
        },
    };
}

// A live shopkeeper standing in its own shop on the hero's level, owed
// nothing, peaceful and not following: the state paybill()'s `localshk` arm
// and inherits()'s fall-through to the `clear` label expect.
function makeShopkeeper(state, overrides = {}) {
    const shkp = {
        isshk: true,
        mhp: 20,
        mhpmax: 20,
        minvis: 1,
        perminvis: 1,
        mpeaceful: true,
        minvent: null,
        mx: 3,
        my: 3,
        nmon: null,
        mextra: {
            eshk: {
                billct: 0,
                bill_p: null,
                credit: 40,
                debit: 0,
                following: false,
                loan: 25,
                robbed: 0,
                shk: { x: 3, y: 3 },
                shoplevel: { dnum: 0, dlevel: 2 },
                shoproom: ROOMOFFSET,
                surcharge: false,
            },
        },
        ...overrides,
    };
    state.level.monlist = shkp;
    state.level.rooms[0].resident = shkp;
    return shkp;
}

function floorObject(state, { x, y, no_charge }) {
    const obj = {
        cobj: null, no_charge, nobj: null, ox: x, oy: y, unpaid: 0,
        where: OBJ_FLOOR,
    };
    obj.nobj = state.level.objlist;
    state.level.objlist = obj;
    return obj;
}

test('paybill leaves the dungeon-escape case alone', () => {
    // C ref: shk.c:2497-2499. croaked < 0 returns before gr.repo is even
    // initialized, so a hero who escaped keeps whatever the record held.
    const state = makeState();
    makeShopkeeper(state);
    state.gr = { repo: 'untouched' };

    assert.equal(paybill(-1, true, state), false);
    assert.equal(state.gr.repo, 'untouched');
});

test('paybill clears a lone unowed shopkeeper without taking anything', () => {
    // C ref: shk.c:2555-2565 through inherits():2670-2675. The hero dies
    // outside the shop (u.ushops empty), so the keeper lands in `localshk`,
    // inherits() falls through every taking arm to the `clear` label, and
    // setpaid() wipes the bill fields. taken stays FALSE.
    const state = makeState();
    const shkp = makeShopkeeper(state);
    // Two floor objects marked no_charge: one on the keeper's own shop floor
    // (room 0), one in the neighbouring room (room 1, columns >= 60), which
    // has no resident. C clears both -- the bit is kept only for a *rival*
    // shopkeeper's shop.
    const inShop = floorObject(state, { x: 4, y: 4, no_charge: true });
    const elsewhere = floorObject(state, { x: 70, y: 4, no_charge: true });

    assert.equal(paybill(1, true, state), false);

    assert.deepEqual(state.gr.repo, {
        location: { x: 0, y: 0 }, shopkeeper: null,
    });
    // inherits():2589-2590 clears both invisibility fields for every keeper.
    assert.equal(shkp.minvis, 0);
    assert.equal(shkp.perminvis, 0);
    // setpaid():2428-2431 zeroes all four money fields, including the credit
    // and loan this fixture starts with.
    assert.deepEqual(
        [shkp.mextra.eshk.billct, shkp.mextra.eshk.credit,
            shkp.mextra.eshk.debit, shkp.mextra.eshk.loan],
        [0, 0, 0, 0],
    );
    assert.equal(inShop.no_charge, false);
    assert.equal(elsewhere.no_charge, false);
});

test('setpaid keeps no_charge on a rival shopkeeper\'s floor', () => {
    // C ref: shk.c clear_no_charge_obj():367-370. The final disjunct spares
    // an object whose room has a resident other than the shopkeeper being
    // settled, so a second shop's goods survive the first keeper's cleanup.
    const state = makeState();
    makeShopkeeper(state);
    state.level.rooms[1].rtype = SHOPBASE;
    state.level.rooms[1].resident = { isshk: true };
    const rival = floorObject(state, { x: 70, y: 4, no_charge: true });

    assert.equal(paybill(1, true, state), false);
    assert.equal(rival.no_charge, true);
});

test('setpaid always clears no_charge inside a container', () => {
    // C ref: shk.c:361. shk.c asks get_obj_location() for OBJ_CONTAINED |
    // OBJ_BURIED (6), which that function reads as CONTAINED_TOO (0x1) and
    // BURIED_TOO (0x2); six omits 0x1, so a contained object never resolves
    // a location and falls into the clearing arm even in its owner's shop.
    const state = makeState();
    makeShopkeeper(state);
    const box = floorObject(state, { x: 4, y: 4, no_charge: false });
    box.cobj = {
        cobj: null, no_charge: true, nobj: null, ocontainer: box, unpaid: 0,
        where: OBJ_CONTAINED,
    };

    assert.equal(paybill(1, true, state), false);
    assert.equal(box.cobj.no_charge, false);
});

test('paybill riles an angry shopkeeper before refusing it', () => {
    // C ref: shk.c next_shkp():224-228 calls rile_shk() on an angry keeper
    // that has no surcharge yet, before paybill() has classified anyone. The
    // hostile arm of inherits() is unported, so the refusal follows -- but the
    // surcharge flag the scan set is already visible.
    const state = makeState();
    const shkp = makeShopkeeper(state, { mpeaceful: false });

    assert.throws(
        () => paybill(1, true, state),
        (err) => err instanceof UnsupportedShopError
            && err.message.includes('hostile or pursuing'),
    );
    assert.equal(shkp.mextra.eshk.surcharge, true);
});

test('paybill refuses a shopkeeper the hero still owes', () => {
    // C ref: shk.c inherits():2620-2626. A debit reaches addupbill() and
    // money2mon(), neither of which is ported.
    const state = makeState();
    makeShopkeeper(state).mextra.eshk.debit = 60;

    assert.throws(
        () => paybill(1, true, state),
        (err) => err instanceof UnsupportedShopError
            && err.message.includes('unpaid bill'),
    );
});

test('paybill refuses a hero who dies inside the shop', () => {
    // C ref: shk.c inherits():2607-2614. Dying in a peaceful keeper's shop
    // hands it the whole pack ("gratefully inherits"), which needs
    // set_repo_loc() and finish_paybill().
    const state = makeState({ ushops: [ROOMOFFSET, 0, 0, 0, 0] });
    makeShopkeeper(state);

    assert.throws(
        () => paybill(1, true, state),
        (err) => err instanceof UnsupportedShopError
            && err.message.includes('bequeathing'),
    );
});

test('paygd returns when no vault guard is on the level', () => {
    // C ref: vault.c paygd():1215-1216. findgd() answers null, so the
    // function returns before touching the hero's gold.
    const state = makeState();
    makeShopkeeper(state);
    state.invent = { oclass: COIN_CLASS, quan: 300, nobj: null };

    assert.equal(findgd(state), null);
    assert.equal(paygd(true, state), undefined);
});

test('paygd refuses a guard while the hero carries gold', () => {
    // C ref: vault.c paygd():1218-1246. Every remaining arm moves coins into
    // the vault or a grave and then mongone()s the guard.
    const state = makeState();
    const guard = {
        isgd: true, mhp: 12, mhpmax: 12, mx: 8, my: 8, nmon: null,
        mextra: { egd: { gddone: 0, gdlevel: { dnum: 0, dlevel: 2 } } },
    };
    state.level.monlist = guard;
    state.invent = { oclass: COIN_CLASS, quan: 300, nobj: null };

    assert.equal(findgd(state), guard);
    assert.throws(
        () => paygd(true, state),
        (err) => err instanceof UnsupportedVaultGuardError,
    );
});

test('clearpriests keeps a priest whose shrine is on this level', () => {
    // C ref: priest.c clearpriests():922-928. on_level() matches, so the
    // priest is not discarded and mongone() never runs.
    const state = makeState();
    const priest = {
        ispriest: true, mhp: 30, mhpmax: 30, mx: 9, my: 9, nmon: null,
        mextra: { epri: { shrlevel: { dnum: 0, dlevel: 2 } } },
    };
    state.level.monlist = priest;

    clearpriests(state);
    assert.equal(priest.mhp, 30);
    assert.equal(state.level.monlist, priest);
});

// The fresh C differential for really_done()'s cleanup calls. The recipe holds
// replay inputs only; scripts/diff-fresh.mjs records the reference run.
//
//   node scripts/diff-fresh.mjs \
//       recipes/paybill-silent-shopkeeper-death.session.json
//
// A Tourist teleports to Dlvl 2, which seed 20260904 builds with a shop, then
// creates a soldier ant with ^G and rests until it kills him. He dies in an
// ordinary room, owing the shopkeeper nothing, which is paybill()'s `localshk`
// arm: inherits() clears the bill, returns FALSE, and disclosure proceeds.
// Seed 20260904 was the second of six consecutive candidates (20260902-07)
// whose levels 2-9 were recorded and searched for a mkshop() draw; it is the
// only one with a shop as shallow as Dlvl 2, which keeps the case short.
test('the end-cleanup recipe carries replay inputs only', () => {
    const recipe = validateCleanRecipe(JSON.parse(readFileSync(
        new URL('../recipes/paybill-silent-shopkeeper-death.session.json',
            import.meta.url),
        'utf8',
    )));
    assert.equal(recipe.version, 5);
    // One segment: the recorder clears its install directory only before a
    // chunk's first segment, so a second playmode:debug segment would restore
    // the first game's save instead of starting a new one.
    assert.equal(recipe.segments.length, 1);
    const [segment] = recipe.segments;
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.match(segment.nethackrc, /playmode:debug/u);
    // ^V picks the level, ^G the killer; "msms" forces two searches past the
    // "you already found a monster" refusal so the ant gets its two turns.
    // The trailing "y" accepts debug mode's "Die?" query and the four "n"s
    // decline each disclosure question in turn.
    assert.equal(segment.moves, '  n\x162\n\x07soldier ant\nmsms  ynnnn');
});
