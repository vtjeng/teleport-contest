import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ANTIMAGIC,
    COULD_SEE,
    IN_SIGHT,
    M_ATTK_HIT,
    M_ATTK_MISS,
} from '../js/const.js';
import { castmu } from '../js/mcastu.js';
import { healmon } from '../js/mon.js';

// -- helpers -----------------------------------------------------------

// Build a mock monster with enough fields for castmu().
function makeCaster(overrides = {}) {
    return {
        m_lev: 7,
        mcan: false,
        mspec_used: 0,
        mconf: 0,
        mpeaceful: false,
        minvis: false,
        invis_blkd: false,
        permspeed: 0,
        mhp: 20,
        mhpmax: 20,
        mx: 5, my: 5,
        mux: 4, muy: 5,
        iswiz: false,
        seen_resistance: 0,
        data: { pmnames: [null, null, 'kobold shaman'] },
        ...overrides,
    };
}

// Minimal game state with viz_array that lets couldsee/cansee pass at (5, 5).
function makeState(overrides = {}) {
    const viz_array = [];
    for (let row = 0; row < 22; row++) {
        viz_array[row] = new Uint8Array(80);
    }
    viz_array[5][5] = COULD_SEE | IN_SIGHT;
    return {
        u: { ux: 4, uy: 5, uprops: {} },
        moves: 100,
        youmonst: { data: { mlet: 0 } },
        context: {},
        viz_array,
        ...overrides,
    };
}

// -- healmon -----------------------------------------------------------

// C ref: mon.c:4596-4614. Monster healing with optional overheal.
// Translates the C integer-arithmetic branches faithfully.

test('healmon: heals within mhpmax without changing mhpmax', () => {
    // amt=5 brings mhp from 10 to 15, which is <= mhpmax=20.
    const mtmp = { mhp: 10, mhpmax: 20 };
    const healed = healmon(mtmp, 5, 0);
    assert.equal(mtmp.mhp, 15, 'mhp should be 10+5=15');
    assert.equal(mtmp.mhpmax, 20, 'mhpmax unchanged');
    assert.equal(healed, 5, 'returned heal amount = 5');
});

test('healmon: clamps mhp to mhpmax when amt overshoots', () => {
    // amt=15, overheal=0: mhp+amt=25 > mhpmax+0=20, so mhp is clamped.
    const mtmp = { mhp: 10, mhpmax: 20 };
    const healed = healmon(mtmp, 15, 0);
    assert.equal(mtmp.mhp, 20,
        'mhp clamped to mhpmax when amt exceeds limit');
    assert.equal(mtmp.mhpmax, 20, 'mhpmax unchanged with overheal=0');
    assert.equal(healed, 10, 'returned heal = 20-10 = 10');
});

test('healmon: overheal raises mhpmax when mhp exceeds it', () => {
    // amt=15, overheal=5: 10+15=25 is not > 20+5=25, so the else branch runs.
    // mhp=25 > mhpmax=20, so mhpmax is raised to 25.
    const mtmp = { mhp: 10, mhpmax: 20 };
    const healed = healmon(mtmp, 15, 5);
    assert.equal(mtmp.mhp, 25);
    assert.equal(mtmp.mhpmax, 25);
    assert.equal(healed, 15);
});

test('healmon: overheal exceeded clamps mhp and raises mhpmax by overheal', () => {
    // amt=20, overheal=3: 10+20=30 > 20+3=23, so mhpmax=23, mhp=23.
    const mtmp = { mhp: 10, mhpmax: 20 };
    const healed = healmon(mtmp, 20, 3);
    assert.equal(mtmp.mhpmax, 23, 'mhpmax increased by overheal: 20+3=23');
    assert.equal(mtmp.mhp, 23, 'mhp clamped to new mhpmax=23');
    assert.equal(healed, 13, 'returned heal = 23-10 = 13');
});

// -- castmu fumble check -----------------------------------------------

// C ref: mcastu.c:208 rn2(ml * 10) < (mtmp->mconf ? 100 : 20).
// A monster with m_lev=2 always fumbles because rn2(20) returns 0-19,
// and 0-19 < 20 is always true. This matches the development case
// seed0042 where a gnomish wizard (adj_lev=2 on dungeon level 1) fumbles.

test('castmu fumble: m_lev=2 always fumbles (rn2(20) is always < 20)', async () => {
    const draws = [];
    // Return values matching seed0042: rn2(2)=0 (spellval), rn2(20)=0 (fumble).
    const vals = [0, 0];
    let ci = 0;
    const random = {
        rn2: (n) => { const v = ci < vals.length ? vals[ci] : 0; draws.push(`rn2(${n})`); ci++; return v; },
        d: (n, s) => n * 2,
    };

    const mtmp = makeCaster({ m_lev: 2 });
    const mattk = { aatyp: 255, adtyp: 241, damn: 0, damd: 0 }; // AD_SPEL
    const messages = [];

    const result = await castmu(
        mtmp, mattk, true, true,
        { state: makeState(), random, message: (m) => messages.push(m) },
    );

    assert.equal(result, M_ATTK_MISS);
    assert.ok(draws.some(d => d === 'rn2(20)'),
        `Expected rn2(20) for fumble check; got: ${draws.join(', ')}`);
    assert.ok(messages.some(m => m.includes('air crackles')),
        `Expected fumble message; got: ${messages.join('; ')}`);
});

test('castmu fumble: m_lev=7 passes when rn2(70) >= 20', async () => {
    const vals = [2, 50]; // spellval=2, fumble=50 (>=20, passes)
    let ci = 0;
    const random = {
        rn2: (n) => { const v = ci < vals.length ? vals[ci] : 0; ci++; return v; },
        d: (n, s) => n * 2,
    };

    const mtmp = makeCaster({ m_lev: 7 });
    const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 }; // AD_CLRC
    const messages = [];

    await castmu(
        mtmp, mattk, true, true,
        {
            state: makeState(), random,
            message: (m) => messages.push(m),
            unsupported: () => {},
        },
    );

    assert.equal(mtmp.mspec_used, 3, 'mspec_used = 10 - 7 = 3');
    assert.ok(!messages.some(m => m.includes('air crackles')),
        'should not produce fumble message');
});

// -- psi_bolt via castmu -----------------------------------------------

// C ref: mcastu.c mcast_psi_bolt() (600-621).
// AD_SPEL wizard list: MCAST_PSI_BOLT is index 0 (level 0).

test('psi_bolt: headache message and mdamageu called', async () => {
    let ci = 0;
    const random = {
        rn2: () => { ci++; return ci === 1 ? 0 : 50; }, // spellval=0, fumble=50
        d: () => 10, // d(4,6)=10 -> "brain is on fire" range
    };

    const mtmp = makeCaster({ m_lev: 7 });
    const mattk = { aatyp: 255, adtyp: 241, damn: 0, damd: 0 }; // AD_SPEL
    const messages = [];
    let damageAmount = 0;

    const result = await castmu(
        mtmp, mattk, true, true,
        {
            state: makeState(),
            random,
            message: (m) => messages.push(m),
            mdamageu: (mon, dmg) => { damageAmount = dmg; },
            monsterName: (m) => 'The kobold shaman',
        },
    );

    assert.equal(result, M_ATTK_HIT);
    assert.ok(messages.some(m => m.includes('brain is on fire')),
        `Expected "brain is on fire" for dmg=10; got: ${messages.join('; ')}`);
    assert.equal(damageAmount, 10, 'full damage without ANTIMAGIC');
});

test('psi_bolt: ANTIMAGIC halves damage and tracks resistance', async () => {
    let ci = 0;
    const random = {
        rn2: () => { ci++; return ci === 1 ? 0 : 50; },
        d: () => 8, // (8+1)/2=4 after ANTIMAGIC -> "slight headache"
    };

    const mtmp = makeCaster({ m_lev: 7 });
    const mattk = { aatyp: 255, adtyp: 241, damn: 0, damd: 0 };
    const state = makeState({
        u: {
            ux: 4, uy: 5,
            uprops: { [ANTIMAGIC]: { intrinsic: 1 } },
        },
    });
    // Add monlist so monstseesu can iterate
    const mon1 = { mhp: 10, nmon: null, seen_resistance: 0 };
    state.level = { monlist: mon1 };

    const messages = [];
    let damageAmount = 0;

    await castmu(mtmp, mattk, true, true, {
        state,
        random,
        message: (m) => messages.push(m),
        mdamageu: (mon, dmg) => { damageAmount = dmg; },
        monsterName: (m) => 'The kobold shaman',
    });

    // ANTIMAGIC halves psi_bolt damage: (8+1)/2 = 4
    assert.equal(damageAmount, 4, 'ANTIMAGIC halves damage: (8+1)/2=4');
    assert.ok(messages.some(m => m.includes('slight') && m.includes('ache')),
        `Expected slight headache for dmg=4; got: ${messages.join('; ')}`);
});

// -- open_wounds via castmu --------------------------------------------

// C ref: mcastu.c mcast_open_wounds() (623-642).
// AD_CLRC cleric list: MCAST_OPEN_WOUNDS is index 0 (level 0).

test('open_wounds: wound message for dmg in 6-10 range', async () => {
    let ci = 0;
    const random = {
        rn2: () => { ci++; return ci === 1 ? 0 : 50; },
        d: () => 8,
    };

    const mtmp = makeCaster({ m_lev: 7 });
    const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 }; // AD_CLRC
    const messages = [];
    let damageAmount = 0;

    await castmu(mtmp, mattk, true, true, {
        state: makeState(),
        random,
        message: (m) => messages.push(m),
        mdamageu: (mon, dmg) => { damageAmount = dmg; },
        monsterName: (m) => 'The kobold shaman',
    });

    assert.ok(messages.some(m => m === 'Wounds appear on your body!'),
        `Expected "Wounds appear on your body!"; got: ${messages.join('; ')}`);
    assert.equal(damageAmount, 8);
});

// -- cure_self via castmu ----------------------------------------------

// C ref: mcastu.c m_cure_self() (307-318).
// Cleric with mhp < mhpmax: heals d(3,6), prints "looks better", dmg=0.

test('cure_self: heals monster and produces no hero damage', async () => {
    let ci = 0;
    const dResults = [12, 9]; // d(4,6)=12 (castmu dmg), d(3,6)=9 (healmon)
    let di = 0;
    const random = {
        rn2: () => { ci++; return ci === 1 ? 1 : 50; }, // spellval=1 picks CURE_SELF
        d: () => { const v = di < dResults.length ? dResults[di] : 6; di++; return v; },
    };

    const mtmp = makeCaster({ m_lev: 7, mhp: 10, mhpmax: 20 });
    const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 }; // AD_CLRC
    const messages = [];
    let damageCalled = false;

    await castmu(mtmp, mattk, true, true, {
        state: makeState(),
        random,
        message: (m) => messages.push(m),
        mdamageu: () => { damageCalled = true; },
        monsterName: (m) => 'The kobold shaman',
    });

    // healmon(mtmp, 9, 0): mhp=10+9=19, mhpmax stays 20
    assert.equal(mtmp.mhp, 19, 'healmon adds d(3,6)=9: 10+9=19');
    assert.equal(mtmp.mhpmax, 20, 'mhpmax unchanged (19 < 20)');
    assert.ok(messages.some(m => m.includes('looks better')));
    assert.ok(!damageCalled, 'cure_self sets dmg=0, no mdamageu');
});
