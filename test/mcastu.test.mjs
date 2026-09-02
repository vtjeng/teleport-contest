import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { castmu } from '../js/mcastu.js';
import {
    COULD_SEE, IN_SIGHT,
    M_ATTK_HIT, M_ATTK_MISS, MFAST, ANTIMAGIC,
} from '../js/const.js';

// Helper: build a mock monster with enough fields for castmu().
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

// Helper: build a minimal game state with a viz_array that lets
// couldsee() and cansee() pass at position (5, 5).
// couldsee checks state.viz_array[y][x] & COULD_SEE (0x1).
// cansee   checks state.viz_array[y][x] & IN_SIGHT  (0x2).
function makeState(overrides = {}) {
    // viz_array is a 2D array indexed [row][col].
    const viz_array = [];
    for (let row = 0; row < 22; row++) {
        viz_array[row] = new Uint8Array(80);
    }
    // Set the monster's position (5, 5) visible for both couldsee and cansee.
    viz_array[5][5] = COULD_SEE | IN_SIGHT;
    return {
        u: { ux: 4, uy: 5, uprops: {} },
        moves: 100,
        youmonst: {},
        context: {},
        viz_array,
        ...overrides,
    };
}

describe('choose_monster_spell RNG sequence', () => {
    // C ref: mcastu.c:111 rn2(mtmp->m_lev) = spellval.
    // A cleric (AD_CLRC) with m_lev=7 produces rn2(7).
    // The maxlev of mon_cleric_spells is 13 (MCAST_GEYSER).
    // If spellval <= maxlev, no cap-reroll happens.
    test('undirected-spell path returns M_ATTK_MISS for a directed spell', async () => {
        // Most spells are directed, so castmu(FALSE, FALSE) returns early.
        // The only RNG call is rn2(m_lev) from choose_monster_spell().
        const draws = [];
        const random = {
            rn2: (n) => {
                draws.push(`rn2(${n})`);
                // Return 4 for the first call (spellval), which is < 13 (maxlev)
                return 4;
            },
            d: (n, s) => { draws.push(`d(${n},${s})`); return n * 2; },
        };

        const mtmp = makeCaster({ m_lev: 7 });
        // AD_CLRC = 240 (clerical attack)
        const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 };
        const state = makeState();

        const result = await castmu(
            mtmp, mattk, false, false,
            { state, random, unsupported: () => {} },
        );

        // Spell selected is MCAST_PARALYZE (level 4, MCF_HOSTILE|MCF_SIGHT),
        // which is directed (no MCF_INDIRECT), so castmu returns miss.
        assert.equal(result, M_ATTK_MISS);
        // rn2(7) for spellval in choose_monster_spell
        assert.ok(draws.includes('rn2(7)'),
            `Expected rn2(7) for m_lev=7; got: ${draws.join(', ')}`);
    });

    test('rn2(m_lev) is the first draw for a high-level caster', async () => {
        // m_lev=24 caster, AD_CLRC: rn2(24) then potentially cap-rerolls.
        const draws = [];
        let callIdx = 0;
        const results = [16, 6, 1]; // rn2(24)=16, rn2(13)=6, rn2(13)=1
        const random = {
            rn2: (n) => {
                const val = callIdx < results.length ? results[callIdx] : 0;
                draws.push(`rn2(${n})=${val}`);
                callIdx++;
                return val;
            },
            d: (n, s) => n * 2,
        };

        const mtmp = makeCaster({ m_lev: 24 });
        const mattk = { aatyp: 255, adtyp: 240, damn: 2, damd: 8 };
        const state = makeState();

        const result = await castmu(
            mtmp, mattk, false, false,
            { state, random, unsupported: () => {} },
        );

        assert.equal(result, M_ATTK_MISS);
        // rn2(24) for spellval, rn2(13) for maxlev check, rn2(13) for cap
        assert.equal(draws[0], 'rn2(24)=16');
        assert.equal(draws[1], 'rn2(13)=6');
        assert.equal(draws[2], 'rn2(13)=1');
    });

    test('castmu with cancelled monster calls cursetxt and returns miss', async () => {
        // mcan=true means the monster cannot cast.
        // With thinks_it_foundyou=TRUE, the do-while loop picks a spell,
        // then the mcan guard rejects the cast and calls cursetxt().
        const draws = [];
        const random = {
            rn2: (n) => {
                draws.push(`rn2(${n})`);
                // Return 2 for spellval -- picks MCAST_CONFUSE_YOU (level 2)
                // which is directed and not useless (hostile, couldsee passes)
                return 2;
            },
            d: (n, s) => n * 2,
        };

        const mtmp = makeCaster({ m_lev: 7, mcan: true });
        const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 };
        const state = makeState();

        const result = await castmu(
            mtmp, mattk, true, true,
            { state, random, unsupported: () => {} },
        );

        assert.equal(result, M_ATTK_MISS);
        // Only one rn2(7) call -- choose_monster_spell picks a non-useless
        // spell on the first try, so the do-while exits with cnt=39.
        assert.equal(draws.length, 1);
        assert.equal(draws[0], 'rn2(7)');
    });

    test('castmu with mspec_used returns miss without casting', async () => {
        // mspec_used > 0 means the monster's special ability is on cooldown.
        // The mcan/mspec_used guard calls cursetxt() and returns miss.
        const draws = [];
        const random = {
            rn2: (n) => { draws.push(`rn2(${n})`); return 2; },
            d: (n, s) => n * 2,
        };

        const mtmp = makeCaster({ m_lev: 7, mspec_used: 5 });
        const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 };
        const state = makeState();

        const result = await castmu(
            mtmp, mattk, true, true,
            { state, random, unsupported: () => {} },
        );

        assert.equal(result, M_ATTK_MISS);
        // One rn2 call from choose_monster_spell, then mspec_used guard fires.
        assert.equal(draws.length, 1);
    });

    test('castmu sets mspec_used after passing the able-to-cast guard', async () => {
        // A monster that passes the mcan/mspec_used guard gets mspec_used set.
        // With m_lev < 8, mspec_used = 10 - m_lev.
        const draws = [];
        const random = {
            rn2: (n) => {
                draws.push(`rn2(${n})`);
                // For choose_monster_spell: spellval=2
                // For castmu fumble check rn2(ml*10): return 50 (> 20)
                if (draws.length === 1) return 2; // spellval
                if (n === 70) return 50; // fumble check (ml=7, 7*10=70)
                return 0;
            },
            d: (n, s) => n * 2,
        };

        const mtmp = makeCaster({ m_lev: 7 });
        const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 };
        const state = makeState();

        const result = await castmu(
            mtmp, mattk, true, true,
            {
                state,
                random,
                unsupported: () => {},
                message: () => {},
            },
        );

        // mspec_used should be set to 10 - 7 = 3 for m_lev=7
        assert.equal(mtmp.mspec_used, 3);
    });
});

describe('spell_would_be_useless', () => {
    test('MCAST_CURE_SELF is useless when monster is at full health', async () => {
        // A cleric at full health: choose_monster_spell with spellval=1
        // would pick MCAST_CURE_SELF (level 1), but spell_would_be_useless()
        // rejects it because mhp=mhpmax. The fallback MCAST_OPEN_WOUNDS
        // (level 0, MCF_HOSTILE|MCF_SIGHT, directed) is selected instead.
        const random = {
            rn2: (n) => 1,
            d: (n, s) => n * 2,
        };

        const mtmp = makeCaster({ m_lev: 7, mhp: 20, mhpmax: 20 });
        const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 };
        const state = makeState();

        // In the undirected path (thinks_it_foundyou=false),
        // MCAST_OPEN_WOUNDS is directed, so castmu returns miss.
        const result = await castmu(
            mtmp, mattk, false, false,
            { state, random, unsupported: () => {} },
        );

        assert.equal(result, M_ATTK_MISS);
    });

    test('MCAST_HASTE_SELF is useless when monster is already fast', async () => {
        // AD_SPEL wizard list: MCAST_HASTE_SELF at index 2 (level 2).
        // With permspeed=MFAST, spell_would_be_useless() rejects it.
        const random = {
            rn2: (n) => 2, // spellval=2
            d: (n, s) => n * 2,
        };

        const mtmp = makeCaster({ m_lev: 7, permspeed: MFAST });
        const mattk = { aatyp: 255, adtyp: 241, damn: 0, damd: 0 }; // AD_SPEL
        const state = makeState();

        const result = await castmu(
            mtmp, mattk, false, false,
            { state, random, unsupported: () => {} },
        );

        assert.equal(result, M_ATTK_MISS);
    });
});
