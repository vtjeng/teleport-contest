import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DIR_ERR,
    PIT,
    SPIKED_PIT,
    BEAR_TRAP,
    TT_PIT,
} from '../js/const.js';
import { conjoined_pits, adj_nonconjoined_pit } from '../js/trap.js';
import {
    noit_Monnam, y_monnam, rndcolor,
} from '../js/do_name.js';

// ---------- conjoined_pits tests ----------

// C ref: trap.c conjoined_pits() (6552-6579). The function checks that both
// traps are pit-type, both positions are valid, and the conjoined bitmask
// pairs match in opposite directions.

test('conjoined_pits returns false when either trap is null', () => {
    // C: early return FALSE when !trap1 || !trap2.
    assert.equal(conjoined_pits(null, { tx: 1, ty: 1, ttyp: PIT, conjoined: 0 }, false), false);
    assert.equal(conjoined_pits({ tx: 1, ty: 1, ttyp: PIT, conjoined: 0 }, null, false), false);
});

test('conjoined_pits returns false when traps are not pits', () => {
    // C: !is_pit(trap2->ttyp) || !is_pit(trap1->ttyp) => FALSE.
    const t1 = { tx: 5, ty: 5, ttyp: BEAR_TRAP, conjoined: 0xFF };
    const t2 = { tx: 6, ty: 5, ttyp: PIT, conjoined: 0xFF };
    assert.equal(conjoined_pits(t2, t1, false), false);
});

test('conjoined_pits returns false when neither is conjoined', () => {
    // Two adjacent pits with no conjoined bits set.
    const t1 = { tx: 5, ty: 5, ttyp: PIT, conjoined: 0 };
    const t2 = { tx: 6, ty: 5, ttyp: PIT, conjoined: 0 };
    assert.equal(conjoined_pits(t2, t1, false), false);
});

test('conjoined_pits returns true when conjoined bits match', () => {
    // Direction east from t1 is index 6 (xdir[6]=1, ydir[6]=0 in C),
    // and its opposite is DIR_180(6) = (6+4)%8 = 2.
    // C compass: 0=W, 1=NW, 2=N, ..., 6=E, 7=SE — or whichever layout
    // xytodir() uses. Rather than guessing, build traps at (5,5) and (6,5)
    // whose conjoined masks include the appropriate pair.
    //
    // Setting all bits so the function only has to match direction:
    const t1 = { tx: 5, ty: 5, ttyp: SPIKED_PIT, conjoined: 0xFF };
    const t2 = { tx: 6, ty: 5, ttyp: PIT, conjoined: 0xFF };
    assert.equal(conjoined_pits(t2, t1, false), true);
});

test('conjoined_pits returns false when u_entering_trap2 and hero is not pit-trapped', () => {
    // u_entering_trap2 is true but the hero has no utrap.
    const state = { u: { utrap: 0, utraptype: 0 } };
    const t1 = { tx: 5, ty: 5, ttyp: PIT, conjoined: 0xFF };
    const t2 = { tx: 6, ty: 5, ttyp: PIT, conjoined: 0xFF };
    assert.equal(conjoined_pits(t2, t1, true, state), false);
});

test('conjoined_pits with u_entering_trap2 and hero pit-trapped returns true', () => {
    // Hero is in a pit and entering another conjoined pit.
    const state = { u: { utrap: 1, utraptype: TT_PIT } };
    const t1 = { tx: 5, ty: 5, ttyp: PIT, conjoined: 0xFF };
    const t2 = { tx: 6, ty: 5, ttyp: PIT, conjoined: 0xFF };
    assert.equal(conjoined_pits(t2, t1, true, state), true);
});

// ---------- adj_nonconjoined_pit tests ----------

// C ref: trap.c adj_nonconjoined_pit() (6604-6620). Checks whether the hero
// is moving from one pit to an adjacent, non-conjoined pit.

test('adj_nonconjoined_pit returns false when hero is not pit-trapped', () => {
    // utrap is 0, so the hero is not in a trap.
    const state = {
        u: { utrap: 0, utraptype: 0, ux0: 5, uy0: 5, dx: 1, dy: 0 },
        level: { traps: [{ tx: 5, ty: 5, ttyp: PIT, conjoined: 0 }] },
    };
    const adjtrap = { tx: 6, ty: 5, ttyp: PIT, conjoined: 0 };
    assert.equal(adj_nonconjoined_pit(adjtrap, state), false);
});

test('adj_nonconjoined_pit returns true when hero moves between non-conjoined pits', () => {
    // Hero is trapped in a PIT at (5,5), moving east to a PIT at (6,5).
    const trap_with_u = { tx: 5, ty: 5, ttyp: PIT, conjoined: 0 };
    const state = {
        u: { utrap: 1, utraptype: TT_PIT, ux0: 5, uy0: 5, dx: 1, dy: 0 },
        level: {
            traps: [trap_with_u],
            at: (x, y) => null,
        },
    };
    const adjtrap = { tx: 6, ty: 5, ttyp: PIT, conjoined: 0 };
    assert.equal(adj_nonconjoined_pit(adjtrap, state), true);
});

test('adj_nonconjoined_pit returns false when adjtrap is not a pit', () => {
    // adjtrap is a bear trap, not a pit.
    const trap_with_u = { tx: 5, ty: 5, ttyp: PIT, conjoined: 0 };
    const state = {
        u: { utrap: 1, utraptype: TT_PIT, ux0: 5, uy0: 5, dx: 1, dy: 0 },
        level: {
            traps: [trap_with_u],
            at: (x, y) => null,
        },
    };
    const adjtrap = { tx: 6, ty: 5, ttyp: BEAR_TRAP, conjoined: 0 };
    assert.equal(adj_nonconjoined_pit(adjtrap, state), false);
});

// ---------- naming function tests ----------

// C ref: do_name.c y_monnam() (1117-1129). "your <pet>" for tame monsters,
// "the <species>" for non-tame ones.

test('y_monnam returns "your" prefix for a tame monster', () => {
    // A tame, visible dog with the neutral species name "dog".
    const state = {
        u: { uprops: {}, usteed: null, uroleplay: {} },
        youmonst: {},
        program_state: {},
    };
    const mon = {
        data: { pmnames: [null, null, 'dog'] },
        mtame: 1,
        mhide_under: 0,
        minvis: 0,
        mgivenname: null,
        mextra: {},
    };
    const result = y_monnam(mon, state);
    // C: mtame ? ARTICLE_YOUR => "your dog".
    assert.equal(result, 'your dog');
});

test('y_monnam returns "it" for a non-tame monster not visible to the hero', () => {
    // C: y_monnam() passes ARTICLE_THE for non-tame. When the hero cannot
    // spot the monster, x_monnam returns "it" per the do_it arm.
    const state = {
        u: { uprops: {}, usteed: null, uroleplay: {} },
        youmonst: {},
        program_state: {},
    };
    const mon = {
        data: { pmnames: [null, null, 'orc'] },
        mtame: 0,
        mhide_under: 0,
        minvis: 0,
        mgivenname: null,
        mextra: {},
    };
    const result = y_monnam(mon, state);
    // Not visible in this minimal state, so "it".
    assert.equal(result, 'it');
});

// C ref: do_name.c noit_Monnam() (1083-1089). Capitalized noit_mon_nam().

test('noit_Monnam capitalizes the result of noit_mon_nam', () => {
    const state = {
        u: { uprops: {}, usteed: null, uroleplay: {} },
        youmonst: {},
        program_state: {},
    };
    const mon = {
        data: { pmnames: [null, null, 'pony'] },
        mtame: 1,
        mhide_under: 0,
        minvis: 0,
        mgivenname: null,
        mextra: {},
    };
    const result = noit_Monnam(mon, state);
    // C: capitalize(noit_mon_nam(mon)). noit_mon_nam uses ARTICLE_YOUR for
    // tame monsters, so the result should start with "Your".
    assert.ok(result.startsWith('Your'), `Expected "Your..." but got "${result}"`);
});
