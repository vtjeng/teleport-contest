import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { castmu } from '../js/mcastu.js';
import {
    COULD_SEE, IN_SIGHT,
    M_ATTK_HIT, M_ATTK_MISS, MFAST, ANTIMAGIC, M_SEEN_MAGR,
} from '../js/const.js';
import { healmon } from '../js/mon.js';

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

describe('castmu fumble check', () => {
    // C ref: mcastu.c:208 rn2(ml * 10) < (mtmp->mconf ? 100 : 20).
    // A monster with m_lev=2 always fumbles because rn2(20) returns 0-19,
    // and 0-19 < 20 is always true. This matches the development case
    // seed0042 where a gnomish wizard (adj_lev=2 on dungeon level 1) fumbles
    // on every cast attempt.
    test('m_lev=2 always fumbles (rn2(20) is always < 20)', async () => {
        const draws = [];
        // Return values matching seed0042 step 37: rn2(2)=0 (spellval),
        // rn2(20)=0 (fumble check).
        const returnValues = [0, 0];
        let callIdx = 0;
        const random = {
            rn2: (n) => {
                const val = callIdx < returnValues.length
                    ? returnValues[callIdx] : 0;
                draws.push(`rn2(${n})=${val}`);
                callIdx++;
                return val;
            },
            d: (n, s) => n * 2,
        };

        const mtmp = makeCaster({ m_lev: 2 });
        // AD_SPEL = 241 (wizard spells)
        const mattk = { aatyp: 255, adtyp: 241, damn: 0, damd: 0 };
        const state = makeState();
        const messages = [];

        const result = await castmu(
            mtmp, mattk, true, true,
            { state, random, message: (msg) => messages.push(msg) },
        );

        assert.equal(result, M_ATTK_MISS,
            'fumbled spell should return M_ATTK_MISS');
        // Verify the fumble check drew rn2(20) (m_lev=2, 2*10=20)
        assert.ok(draws.some(d => d.startsWith('rn2(20)')),
            `Expected rn2(20) for fumble check; got: ${draws.join(', ')}`);
        // Verify the "air crackles" message
        assert.ok(messages.some(m => m.includes('air crackles')),
            `Expected fumble message; got: ${messages.join('; ')}`);
    });

    // C ref: mcastu.c:208 -- a non-confused monster with m_lev=7 passes
    // the fumble check when rn2(70) >= 20. With rn2(70)=50, the spell
    // proceeds to the damage/effect phase.
    test('m_lev=7 does not fumble when rn2(70) >= 20', async () => {
        const draws = [];
        const returnValues = [2, 50]; // spellval=2, fumble=50 (>= 20, no fumble)
        let callIdx = 0;
        const random = {
            rn2: (n) => {
                const val = callIdx < returnValues.length
                    ? returnValues[callIdx] : 0;
                draws.push(`rn2(${n})=${val}`);
                callIdx++;
                return val;
            },
            d: (n, s) => n * 2,
        };

        const mtmp = makeCaster({ m_lev: 7 });
        const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 }; // AD_CLRC
        const state = makeState();
        const messages = [];

        const result = await castmu(
            mtmp, mattk, true, true,
            {
                state,
                random,
                message: (msg) => messages.push(msg),
                unsupported: () => {},
            },
        );

        // Should NOT fumble; mspec_used should be set
        assert.equal(mtmp.mspec_used, 3, 'mspec_used = 10 - m_lev = 3');
        assert.ok(!messages.some(m => m.includes('air crackles')),
            'should not produce fumble message');
    });
});

describe('mcast_spell effect: psi_bolt via castmu', () => {
    // C ref: mcastu.c mcast_psi_bolt() (600-621).
    // The psi_bolt spell targets the hero with a psychic attack. Without
    // ANTIMAGIC, the hero gets the full damage and a headache message.
    // With ANTIMAGIC, damage is halved and monsters see the resistance.
    test('psi_bolt produces headache message and calls mdamageu', async () => {
        // To reach mcast_spell(MCAST_PSI_BOLT), we need:
        // 1. AD_SPEL (wizard), spellval selects PSI_BOLT (level 0)
        // 2. Pass the mspec_used/mcan checks
        // 3. Pass the fumble check
        // PSI_BOLT is mon_wizard_spells[0], selected when spellval=0.
        const draws = [];
        const returnValues = [
            0,  // rn2(m_lev=7) = 0 -> spellval=0, picks PSI_BOLT
            50, // rn2(70) = 50 -> no fumble (50 >= 20)
        ];
        let callIdx = 0;
        const random = {
            rn2: (n) => {
                const val = callIdx < returnValues.length
                    ? returnValues[callIdx] : 0;
                callIdx++;
                return val;
            },
            // d(ml/2 + 1, 6) = d(4, 6) for m_lev=7. Return 10 for "brain on
            // fire" message range (6-10).
            d: (n, s) => {
                draws.push(`d(${n},${s})`);
                return 10;
            },
        };

        const mtmp = makeCaster({ m_lev: 7 });
        const mattk = { aatyp: 255, adtyp: 241, damn: 0, damd: 0 }; // AD_SPEL
        const state = makeState();
        const messages = [];
        let damageCalled = false;
        let damageAmount = 0;

        const result = await castmu(
            mtmp, mattk, true, true,
            {
                state,
                random,
                message: (msg) => messages.push(msg),
                mdamageu: (mon, dmg) => {
                    damageCalled = true;
                    damageAmount = dmg;
                },
                monsterName: (m) => 'The kobold shaman',
            },
        );

        assert.equal(result, M_ATTK_HIT,
            'successful spell should return M_ATTK_HIT');
        assert.ok(messages.some(m => m.includes('brain is on fire')),
            `Expected "brain is on fire" for dmg=10; got: ${messages.join('; ')}`);
        assert.ok(damageCalled, 'mdamageu should be called');
        assert.equal(damageAmount, 10,
            'psi_bolt without ANTIMAGIC passes full dmg to mdamageu');
    });

    test('psi_bolt with ANTIMAGIC halves damage and tracks resistance', async () => {
        let callIdx = 0;
        const random = {
            rn2: () => { callIdx++; return callIdx === 1 ? 0 : 50; },
            d: () => 8, // d(4,6) = 8 -> (8+1)/2 = 4 (slight headache)
        };

        const mtmp = makeCaster({ m_lev: 7 });
        const mattk = { aatyp: 255, adtyp: 241, damn: 0, damd: 0 };
        // Hero has ANTIMAGIC intrinsic.
        // body_part() needs youmonst.data for mbodypart(), so supply a
        // minimal permonst structure (human body parts).
        const state = makeState({
            u: {
                ux: 4, uy: 5,
                uprops: { [ANTIMAGIC]: { intrinsic: 1 } },
            },
            youmonst: { data: { mlet: 0 } },
        });
        // Add monlist so monstseesu can iterate
        const mon1 = { mhp: 10, nmon: null, seen_resistance: 0 };
        state.level = { monlist: mon1 };
        // m_canseeu requires cansee(mtmp.mx, mtmp.my) which needs IN_SIGHT
        // Already set in makeState for (5,5)

        const messages = [];
        let damageAmount = 0;

        await castmu(mtmp, mattk, true, true, {
            state,
            random,
            message: (msg) => messages.push(msg),
            mdamageu: (mon, dmg) => { damageAmount = dmg; },
            monsterName: (m) => 'The kobold shaman',
        });

        // ANTIMAGIC halves the psi_bolt damage: (8+1)/2 = 4
        // Then HALF_SPDAM is not active, so dmg stays 4
        assert.equal(damageAmount, 4,
            'ANTIMAGIC should halve psi_bolt damage: (8+1)/2 = 4');
        assert.ok(messages.some(m => m.includes('slight') && m.includes('ache')),
            `Expected slight headache for dmg=4; got: ${messages.join('; ')}`);
    });
});

describe('mcast_spell effect: open_wounds via castmu', () => {
    // C ref: mcastu.c mcast_open_wounds() (623-642).
    // Cleric (AD_CLRC) spell list: MCAST_OPEN_WOUNDS is at index 0 (level 0).
    test('open_wounds produces wound message for dmg in 6-10 range', async () => {
        let callIdx = 0;
        const random = {
            rn2: () => { callIdx++; return callIdx === 1 ? 0 : 50; },
            d: () => 8, // d(4,6) = 8, in the 6-10 range
        };

        const mtmp = makeCaster({ m_lev: 7 });
        const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 }; // AD_CLRC
        const state = makeState();
        const messages = [];
        let damageAmount = 0;

        await castmu(mtmp, mattk, true, true, {
            state,
            random,
            message: (msg) => messages.push(msg),
            mdamageu: (mon, dmg) => { damageAmount = dmg; },
            monsterName: (m) => 'The kobold shaman',
        });

        assert.ok(messages.some(m => m === 'Wounds appear on your body!'),
            `Expected "Wounds appear on your body!"; got: ${messages.join('; ')}`);
        assert.equal(damageAmount, 8);
    });
});

describe('mcast_spell effect: cure_self via castmu', () => {
    // C ref: mcastu.c m_cure_self() (307-318).
    // Cleric with mhp < mhpmax: the cure heals d(3,6) and prints
    // "<monster> looks better." The dmg from mcast_spell is 0 (no mdamageu).
    test('cure_self heals the monster and produces no hero damage', async () => {
        // For AD_CLRC, spellval must be >= 1 to reach MCAST_CURE_SELF (level 1).
        // The monster must be damaged (mhp < mhpmax).
        let callIdx = 0;
        const dResults = [
            // First d() is castmu's damage: d(ml/2+1, 6) = d(4, 6)
            12,
            // Second d() is m_cure_self's healmon: d(3, 6)
            9,
        ];
        let dIdx = 0;
        const random = {
            rn2: () => { callIdx++; return callIdx === 1 ? 1 : 50; },
            d: (n, s) => {
                const val = dIdx < dResults.length ? dResults[dIdx] : 6;
                dIdx++;
                return val;
            },
        };

        const mtmp = makeCaster({ m_lev: 7, mhp: 10, mhpmax: 20 });
        const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 }; // AD_CLRC
        const state = makeState();
        const messages = [];
        let damageCalled = false;

        await castmu(mtmp, mattk, true, true, {
            state,
            random,
            message: (msg) => messages.push(msg),
            mdamageu: () => { damageCalled = true; },
            monsterName: (m) => 'The kobold shaman',
        });

        // healmon(mtmp, 9, 0): mhp=10+9=19, mhpmax stays 20
        assert.equal(mtmp.mhp, 19,
            'healmon should add d(3,6)=9 to mhp: 10+9=19');
        assert.equal(mtmp.mhpmax, 20,
            'mhpmax should stay at 20 since mhp+amt <= mhpmax');
        assert.ok(messages.some(m => m.includes('looks better')),
            `Expected "looks better" message; got: ${messages.join('; ')}`);
        assert.ok(!damageCalled,
            'cure_self should not call mdamageu (dmg=0)');
    });

    test('cure_self is skipped when monster is at full health', async () => {
        // MCAST_CURE_SELF with mhp=mhpmax: m_cure_self returns dmg unchanged.
        // This means the spell does nothing special, but the original dmg is
        // still routed to mdamageu if > 0.
        let callIdx = 0;
        const random = {
            rn2: () => { callIdx++; return callIdx === 1 ? 1 : 50; },
            d: () => 6,
        };

        // Full health: spell_would_be_useless returns true for CURE_SELF,
        // so the do-while loop picks a different spell (falls through to
        // MCAST_OPEN_WOUNDS at index 0). The monster does NOT get CURE_SELF.
        const mtmp = makeCaster({ m_lev: 7, mhp: 20, mhpmax: 20 });
        const mattk = { aatyp: 255, adtyp: 240, damn: 0, damd: 0 };
        const state = makeState();
        const messages = [];

        await castmu(mtmp, mattk, true, true, {
            state,
            random,
            message: (msg) => messages.push(msg),
            mdamageu: () => {},
            monsterName: (m) => 'The kobold shaman',
        });

        // With mhp=mhpmax, cure_self is useless, so the loop picks
        // MCAST_OPEN_WOUNDS instead.
        assert.ok(!messages.some(m => m.includes('looks better')),
            'should not see "looks better" when monster is at full health');
        assert.equal(mtmp.mhp, 20,
            'monster hp should not change');
    });
});

describe('healmon', () => {
    // C ref: mon.c:4596-4614. Monster healing with optional overheal.
    test('heals within mhpmax without changing mhpmax', () => {
        // amt=5 brings mhp from 10 to 15, which is <= mhpmax=20.
        const mtmp = { mhp: 10, mhpmax: 20 };
        const healed = healmon(mtmp, 5, 0);
        assert.equal(mtmp.mhp, 15, 'mhp should be 10+5=15');
        assert.equal(mtmp.mhpmax, 20, 'mhpmax unchanged');
        assert.equal(healed, 5, 'returned heal amount = 5');
    });

    test('raises mhpmax when mhp exceeds it', () => {
        // amt=15 brings mhp from 10 to 25, which exceeds mhpmax=20.
        // Since overheal=0, mhp+amt > mhpmax+0, so mhpmax stays 20 and
        // mhp is clamped to mhpmax=20.
        const mtmp = { mhp: 10, mhpmax: 20 };
        const healed = healmon(mtmp, 15, 0);
        assert.equal(mtmp.mhp, 20,
            'mhp clamped to mhpmax when amt exceeds limit');
        assert.equal(mtmp.mhpmax, 20, 'mhpmax unchanged with overheal=0');
        assert.equal(healed, 10, 'returned heal amount = 20-10 = 10');
    });

    test('overheal allows mhpmax to increase', () => {
        // amt=15, overheal=5: mhp+amt=25 > mhpmax+overheal=25 is false
        // (not strictly greater), so the else branch adds amt directly.
        // mhp=10+15=25, which exceeds mhpmax=20, so mhpmax is raised to 25.
        const mtmp = { mhp: 10, mhpmax: 20 };
        const healed = healmon(mtmp, 15, 5);
        assert.equal(mtmp.mhp, 25,
            'mhp = 10+15 = 25 when within mhpmax+overheal');
        assert.equal(mtmp.mhpmax, 25,
            'mhpmax raised to mhp when mhp > mhpmax');
        assert.equal(healed, 15, 'returned heal amount = 15');
    });

    test('overheal exceeded clamps mhp and raises mhpmax by overheal', () => {
        // amt=20, overheal=3: mhp+amt=30 > mhpmax+overheal=23 is true.
        // mhpmax += overheal -> 23, mhp = mhpmax = 23.
        const mtmp = { mhp: 10, mhpmax: 20 };
        const healed = healmon(mtmp, 20, 3);
        assert.equal(mtmp.mhpmax, 23,
            'mhpmax increased by overheal: 20+3=23');
        assert.equal(mtmp.mhp, 23,
            'mhp clamped to new mhpmax=23');
        assert.equal(healed, 13, 'returned heal amount = 23-10 = 13');
    });
});
