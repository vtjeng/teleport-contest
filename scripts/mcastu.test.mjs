import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ANTIMAGIC,
    BLINDED,
    COULD_SEE,
    IN_SIGHT,
    M_AP_OBJECT,
    M_ATTK_HIT,
    M_ATTK_MISS,
    M_SEEN_MAGR,
    MFAST,
    TELEPAT,
} from '../js/const.js';
import { buzzmu, castmu } from '../js/mcastu.js';
import { healmon } from '../js/mon.js';
import { AD_CLRC, AD_COLD, AD_FIRE, AD_MAGM, AD_SPEL, AT_MAGC } from '../js/monsters.js';
import { STRANGE_OBJECT } from '../js/objects.js';
import { has_aggravatables } from '../js/wizard.js';

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
// couldsee() reads viz_array[y][x] & COULD_SEE; cansee() reads IN_SIGHT.
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

// Every castmu() call needs an unsupported operation. A fixture that expects
// no refusal fails on the first one; a fixture that expects one records it.
function refuse(what) {
    assert.fail(`unexpected refusal: ${what}`);
}

// A random source that hands out `values` in order and records each draw as
// `rn2(bound)`; d() records too and answers `dice`.
function scriptedRandom(values, dice = 6) {
    const draws = [];
    let index = 0;
    return {
        draws,
        rn2: (bound) => {
            const value = index < values.length ? values[index] : 0;
            index++;
            draws.push(`rn2(${bound})`);
            return value;
        },
        d: (n, s) => {
            draws.push(`d(${n},${s})`);
            return dice;
        },
    };
}

const AD_CLRC_ATTACK = { aatyp: AT_MAGC, adtyp: AD_CLRC, damn: 0, damd: 0 };
const AD_SPEL_ATTACK = { aatyp: AT_MAGC, adtyp: AD_SPEL, damn: 0, damd: 0 };

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

// -- has_aggravatables -------------------------------------------------

// C ref: wizard.c has_aggravatables() (472-491). Outside the Wizard's Tower
// (no wiz levels in state, so In_W_tower() is false for every square) the
// scan answers TRUE for the first live monster that is waiting for the hero
// or helpless, and FALSE otherwise.

test('has_aggravatables: a sleeping monster on the level is aggravatable', () => {
    const state = makeState();
    // msleeping=1 makes helpless() true; mhp=5 keeps DEADMONSTER() false.
    state.level = {
        monlist: { mhp: 5, msleeping: 1, mcanmove: true, mx: 7, my: 7,
            mstrategy: 0, nmon: null },
    };
    assert.equal(has_aggravatables(makeCaster(), state), true);
});

test('has_aggravatables: STRAT_WAITFORU counts, a dead sleeper does not', () => {
    const state = makeState();
    // The first entry is dead (mhp=0) and skipped even though it sleeps; the
    // second is awake and mobile but carries STRAT_WAITFORU (0x20000000).
    state.level = {
        monlist: { mhp: 0, msleeping: 1, mcanmove: true, mx: 7, my: 7,
            mstrategy: 0,
            nmon: { mhp: 5, msleeping: 0, mcanmove: true, mx: 8, my: 8,
                mstrategy: 0x20000000, nmon: null } },
    };
    assert.equal(has_aggravatables(makeCaster(), state), true);
});

test('has_aggravatables: an awake, mobile level has nothing to wake', () => {
    const state = makeState();
    state.level = {
        monlist: { mhp: 5, msleeping: 0, mcanmove: true, mx: 7, my: 7,
            mstrategy: 0, nmon: null },
    };
    assert.equal(has_aggravatables(makeCaster(), state), false);
    // An empty level answers FALSE too.
    state.level = { monlist: null };
    assert.equal(has_aggravatables(makeCaster(), state), false);
});

// -- choose_monster_spell RNG sequence ---------------------------------

// C ref: mcastu.c:111-113. rn2(m_lev) picks spellval; when it exceeds the
// list's maxlev, rn2(maxlev) gates a second rn2(maxlev) reroll.

test('choose_monster_spell: rn2(m_lev) is the only draw for a directed pick',
    async () => {
        // m_lev=7 cleric: rn2(7)=4 -> spellval 4 <= maxlev 13, so no reroll.
        // Level 4 in the cleric list is MCAST_PARALYZE, a directed spell, so
        // castmu(FALSE, FALSE) returns M_ATTK_MISS after the one draw.
        const random = scriptedRandom([4]);
        const result = await castmu(
            makeCaster({ m_lev: 7 }), AD_CLRC_ATTACK, false, false,
            { state: makeState(), random, unsupported: refuse },
        );
        assert.equal(result, M_ATTK_MISS);
        assert.deepEqual(random.draws, ['rn2(7)']);
    });

test('choose_monster_spell: spellval above maxlev gates and rerolls', async () => {
    // m_lev=24 cleric, maxlev=13 (MCAST_GEYSER): rn2(24)=16 > 13, then the
    // rn2(13)=6 gate is nonzero, so rn2(13)=1 becomes spellval. Level 1 is
    // MCAST_CURE_SELF, useless at full health, so the loop falls to level 0
    // MCAST_OPEN_WOUNDS, which is directed: the undirected path misses.
    const random = scriptedRandom([16, 6, 1]);
    const result = await castmu(
        makeCaster({ m_lev: 24 }), AD_CLRC_ATTACK, false, false,
        { state: makeState(), random, unsupported: refuse },
    );
    assert.equal(result, M_ATTK_MISS);
    assert.deepEqual(random.draws, ['rn2(24)', 'rn2(13)', 'rn2(13)']);
});

test('castmu: a cancelled caster calls cursetxt and misses', async () => {
    // mcan=true fails the able-to-cast guard after one rn2(7)=2 pick
    // (MCAST_CONFUSE_YOU, level 2, directed and not useless). The visible
    // caster at (5,5) gets cursetxt's "points at you, then curses".
    const random = scriptedRandom([2]);
    const messages = [];
    const result = await castmu(
        makeCaster({ m_lev: 7, mcan: true }), AD_CLRC_ATTACK, true, true,
        {
            state: makeState(), random, unsupported: refuse,
            message: (m) => messages.push(m),
        },
    );
    assert.equal(result, M_ATTK_MISS);
    assert.deepEqual(random.draws, ['rn2(7)']);
    assert.deepEqual(messages, ['Kobold shaman points at you, then curses.']);
});

test('castmu: mspec_used on cooldown misses without casting', async () => {
    // mspec_used=5 fails the same guard; the one draw is the spell pick.
    const random = scriptedRandom([2]);
    const result = await castmu(
        makeCaster({ m_lev: 7, mspec_used: 5 }), AD_CLRC_ATTACK, true, true,
        { state: makeState(), random, unsupported: refuse, message: () => {} },
    );
    assert.equal(result, M_ATTK_MISS);
    assert.deepEqual(random.draws, ['rn2(7)']);
});

test('castmu: requires an unsupported operation', async () => {
    // AD_MAGM has no ported arm; without the hook castmu() must refuse up
    // front rather than return M_ATTK_HIT with nothing cast.
    const mattk = { aatyp: AT_MAGC, adtyp: AD_MAGM, damn: 0, damd: 0 };
    await assert.rejects(
        castmu(makeCaster(), mattk, true, true,
            { state: makeState(), random: scriptedRandom([50]) }),
        /castmu requires a unsupported operation/u,
    );
});

test('castmu: AD_MAGM refuses through unsupported', async () => {
    // rn2(70)=50 passes the fumble check for m_lev=7; the switch's default
    // arm then names the elemental type.
    const mattk = { aatyp: AT_MAGC, adtyp: AD_MAGM, damn: 0, damd: 0 };
    const refusals = [];
    await castmu(makeCaster(), mattk, true, true, {
        state: makeState(), random: scriptedRandom([50]),
        unsupported: (what) => refusals.push(what),
        message: () => {},
    });
    assert.deepEqual(refusals, ['castmu() elemental spell type']);
});

// -- spell_would_be_useless --------------------------------------------

test('spell_would_be_useless: MCAST_CURE_SELF at full health', async () => {
    // rn2(7)=1 would pick MCAST_CURE_SELF (level 1), but mhp=mhpmax rejects
    // it, so MCAST_OPEN_WOUNDS (level 0, directed) is chosen and the
    // undirected path misses.
    const result = await castmu(
        makeCaster({ m_lev: 7, mhp: 20, mhpmax: 20 }), AD_CLRC_ATTACK,
        false, false,
        { state: makeState(), random: scriptedRandom([1]), unsupported: refuse },
    );
    assert.equal(result, M_ATTK_MISS);
});

test('spell_would_be_useless: MCAST_HASTE_SELF when already fast', async () => {
    // Wizard list: rn2(7)=2 reaches MCAST_HASTE_SELF (level 2), rejected by
    // permspeed=MFAST; MCAST_CURE_SELF is rejected at full health, so
    // MCAST_PSI_BOLT (directed) remains and the undirected path misses.
    const result = await castmu(
        makeCaster({ m_lev: 7, permspeed: MFAST }), AD_SPEL_ATTACK,
        false, false,
        { state: makeState(), random: scriptedRandom([2]), unsupported: refuse },
    );
    assert.equal(result, M_ATTK_MISS);
});

// C ref: mcastu.c:952-953. `if (!has_aggravatables(mtmp)) return rn2(100)
// ? TRUE : FALSE;` -- the draw happens only when nothing needs waking.
// Wizard list maxlev is 20 (MCAST_DEATH_TOUCH), so rn2(15)=13 needs no
// reroll and MCAST_AGGRAVATION (level 13) is the first candidate.

test('spell_would_be_useless: MCAST_AGGRAVATION draws nothing when a monster sleeps',
    async () => {
        // Second value: rn2(ml*10)=rn2(150)=50 passes the fumble check.
        const random = scriptedRandom([13, 50]);
        const state = makeState();
        state.level = {
            monlist: { mhp: 5, msleeping: 1, mcanmove: true, mx: 7, my: 7,
                mstrategy: 0, nmon: null },
        };
        const refusals = [];
        const result = await castmu(
            makeCaster({ m_lev: 15 }), AD_SPEL_ATTACK, false, false,
            {
                state, random, message: () => {},
                unsupported: (what) => refusals.push(what),
            },
        );
        // The undirected aggravation spell is chosen and reaches
        // mcast_spell(), whose MCAST_AGGRAVATION (16) effect is unported.
        assert.equal(result, M_ATTK_HIT);
        assert.deepEqual(random.draws, ['rn2(15)', 'rn2(150)']);
        assert.deepEqual(refusals, ['mcast_spell effect 16']);
    });

test('spell_would_be_useless: MCAST_AGGRAVATION draws rn2(100) when nothing sleeps',
    async () => {
        // rn2(100)=1 is nonzero, so the spell is useless and the search
        // continues down the list: MCAST_CURSE_ITEMS (level 10) is directed,
        // so castmu(FALSE, FALSE) misses.
        const random = scriptedRandom([13, 1]);
        const state = makeState();
        state.level = {
            monlist: { mhp: 5, msleeping: 0, mcanmove: true, mx: 7, my: 7,
                mstrategy: 0, nmon: null },
        };
        const result = await castmu(
            makeCaster({ m_lev: 15 }), AD_SPEL_ATTACK, false, false,
            { state, random, unsupported: refuse },
        );
        assert.equal(result, M_ATTK_MISS);
        assert.deepEqual(random.draws, ['rn2(15)', 'rn2(100)']);
    });

// C ref: mcastu.c:978 and youprop.h:92. MCAST_BLIND_YOU is useless under
// `Blinded` (HBlinded && !BBlinded), not under the wider `Blind`. Cleric
// rn2(7)=6 reaches MCAST_BLIND_YOU (level 6, effect 8) first; when it is
// rejected, MCAST_PARALYZE (level 4, effect 7) is chosen instead. rn2(70)=50
// passes the fumble check and d()=6 gives a positive dmg so mcast_spell()
// reaches the (unported) effect and names it.

async function blindYouEffect(blinded) {
    const state = makeState();
    state.u.uprops[BLINDED] = blinded;
    const refusals = [];
    await castmu(makeCaster({ m_lev: 7 }), AD_CLRC_ATTACK, true, true, {
        state, random: scriptedRandom([6, 50]), message: () => {},
        unsupported: (what) => refusals.push(what),
    });
    return refusals;
}

test('spell_would_be_useless: a blindfold does not make MCAST_BLIND_YOU useless',
    async () => {
        // A worn blindfold sets only EBlinded (W_TOOL in extrinsic).
        assert.deepEqual(await blindYouEffect({ intrinsic: 0, extrinsic: 1 }),
            ['mcast_spell effect 8']);
    });

test('spell_would_be_useless: blocked blindness keeps MCAST_BLIND_YOU useful',
    async () => {
        // Artifact lenses set BBlinded, which defeats HBlinded.
        assert.deepEqual(
            await blindYouEffect({ intrinsic: 1, extrinsic: 0, blocked: 1 }),
            ['mcast_spell effect 8']);
    });

test('spell_would_be_useless: intrinsic blindness makes MCAST_BLIND_YOU useless',
    async () => {
        assert.deepEqual(await blindYouEffect({ intrinsic: 1, extrinsic: 0 }),
            ['mcast_spell effect 7']);
    });

// -- cursetxt ----------------------------------------------------------

// C ref: mcastu.c cursetxt() (62-85). A cancelled caster (mcan) reaches it
// after the rn2(7)=2 pick of directed MCAST_CONFUSE_YOU.

test('cursetxt: a hero mimicking a strange object gets the general-direction line',
    async () => {
        // monst.h:243 is_obj_mappear(): M_AP_OBJECT (2) and STRANGE_OBJECT
        // (0). The hero is where the caster thinks (mux,muy == ux,uy), so the
        // Invis clause is false and only this clause selects the line.
        const state = makeState({
            youmonst: {
                data: { mlet: 0 },
                m_ap_type: M_AP_OBJECT,
                mappearance: STRANGE_OBJECT,
            },
        });
        const messages = [];
        await castmu(makeCaster({ mcan: true }), AD_CLRC_ATTACK, true, true, {
            state, random: scriptedRandom([2]), unsupported: refuse,
            message: (m) => messages.push(m),
        });
        assert.deepEqual(messages,
            ['Kobold shaman points and curses in your general direction.']);
    });

// The unseen arm: with IN_SIGHT clear at (5,5) canseemon() is false, and
// moves=100 satisfies !(moves % 4) without an rn2(4) draw.
async function mumbledCurse(u) {
    const state = makeState({ u });
    state.viz_array[5][5] = COULD_SEE;
    const messages = [];
    const random = scriptedRandom([2]);
    await castmu(makeCaster({ mcan: true }), AD_CLRC_ATTACK, true, true, {
        state, random, unsupported: refuse,
        message: (m) => messages.push(m),
    });
    assert.deepEqual(random.draws, ['rn2(7)']);
    return messages;
}

test('cursetxt: an unseen caster is heard mumbling', async () => {
    assert.deepEqual(await mumbledCurse({ ux: 4, uy: 5, uprops: {} }),
        ['You hear a mumbled curse.']);
});

test('cursetxt: the deaf roleplay option silences the mumbled curse', async () => {
    // youprop.h:125 Deaf includes u.uroleplay.deaf; no DEAF property is set.
    assert.deepEqual(
        await mumbledCurse({ ux: 4, uy: 5, uprops: {}, uroleplay: { deaf: true } }),
        []);
});

// -- castmu fumble check -----------------------------------------------

// C ref: mcastu.c:208 rn2(ml * 10) < (mtmp->mconf ? 100 : 20).
// A monster with m_lev=2 always fumbles because rn2(20) returns 0-19,
// and 0-19 < 20 is always true. This matches the development case
// seed0042 where a gnomish wizard (adj_lev=2 on dungeon level 1) fumbles.

test('castmu fumble: m_lev=2 always fumbles (rn2(20) is always < 20)', async () => {
    // Return values matching seed0042: rn2(2)=0 (spellval), rn2(20)=0 (fumble).
    const random = scriptedRandom([0, 0]);
    const messages = [];

    const result = await castmu(
        makeCaster({ m_lev: 2 }), AD_SPEL_ATTACK, true, true,
        {
            state: makeState(), random, unsupported: refuse,
            message: (m) => messages.push(m),
        },
    );

    assert.equal(result, M_ATTK_MISS);
    assert.deepEqual(random.draws, ['rn2(2)', 'rn2(20)']);
    assert.deepEqual(messages, ['The air crackles around the kobold shaman.']);
});

test('castmu fumble: the deaf roleplay option silences the crackle', async () => {
    // Same fumble as above; youprop.h:125 Deaf includes u.uroleplay.deaf.
    const state = makeState({
        u: { ux: 4, uy: 5, uprops: {}, uroleplay: { deaf: true } },
    });
    const messages = [];
    const result = await castmu(
        makeCaster({ m_lev: 2 }), AD_SPEL_ATTACK, true, true,
        {
            state, random: scriptedRandom([0, 0]), unsupported: refuse,
            message: (m) => messages.push(m),
        },
    );
    assert.equal(result, M_ATTK_MISS);
    assert.deepEqual(messages, []);
});

test('castmu fumble: m_lev=7 passes when rn2(70) >= 20', async () => {
    // spellval=2 (MCAST_CONFUSE_YOU, effect 4, unported), fumble=50 passes.
    const random = scriptedRandom([2, 50]);
    const messages = [];
    const mtmp = makeCaster({ m_lev: 7 });

    await castmu(
        mtmp, AD_CLRC_ATTACK, true, true,
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

// -- the cast announcement ---------------------------------------------

// C ref: mcastu.c:217-226 names the caster through canspotmon(), which is
// canseemon() || sensemon(): a hero who cannot see the caster but senses it
// still reads its name.

test('castmu: a blind telepath reads the name of the caster it senses', async () => {
    // IN_SIGHT is cleared at (5,5) so canseemon() is false; intrinsic
    // blindness plus intrinsic telepathy make sensemon() true (display.h
    // tp_sensemon: Blind && telepathic). mflags1=0 keeps the caster mindful.
    const state = makeState({
        u: {
            ux: 4, uy: 5,
            uprops: {
                [BLINDED]: { intrinsic: 1 },
                [TELEPAT]: { intrinsic: 1 },
            },
        },
    });
    state.viz_array[5][5] = COULD_SEE;
    const messages = [];
    // rn2(7)=0 picks MCAST_PSI_BOLT; rn2(70)=50 passes the fumble check.
    await castmu(
        makeCaster({ m_lev: 7, data: { mflags1: 0, pmnames: [null, null, 'kobold shaman'] } }),
        AD_SPEL_ATTACK, true, true,
        {
            state, random: scriptedRandom([0, 50], 10), unsupported: refuse,
            message: (m) => messages.push(m),
            mdamageu: () => {},
            monsterName: () => 'The kobold shaman',
        },
    );
    assert.equal(messages[0], 'The kobold shaman casts a spell at you!');
});

test('castmu: an unsensed, unseen caster is "Something"', async () => {
    // Same fixture without telepathy: neither seen nor sensed.
    const state = makeState({
        u: { ux: 4, uy: 5, uprops: { [BLINDED]: { intrinsic: 1 } } },
    });
    state.viz_array[5][5] = COULD_SEE;
    const messages = [];
    await castmu(
        makeCaster({ m_lev: 7, data: { mflags1: 0, pmnames: [null, null, 'kobold shaman'] } }),
        AD_SPEL_ATTACK, true, true,
        {
            state, random: scriptedRandom([0, 50], 10), unsupported: refuse,
            message: (m) => messages.push(m),
            mdamageu: () => {},
            monsterName: () => 'The kobold shaman',
        },
    );
    assert.equal(messages[0], 'Something casts a spell at you!');
});

// -- psi_bolt via castmu -----------------------------------------------

// C ref: mcastu.c mcast_psi_bolt() (600-621).
// AD_SPEL wizard list: MCAST_PSI_BOLT is index 0 (level 0).
// The Antimagic arm calls monstseesu(M_SEEN_MAGR) and the other arm
// monstunseesu(M_SEEN_MAGR); both walk the level's monsters and touch every
// one that m_canseeu(): a second monster at (6,5) with COULD_SEE set there.

function watcherAt(state, x, y, seen_resistance) {
    state.viz_array[y][x] |= COULD_SEE;
    const watcher = {
        mhp: 10, mx: x, my: y, data: { mflags1: 0 }, seen_resistance,
        nmon: null,
    };
    state.level = { monlist: watcher };
    return watcher;
}

test('psi_bolt: headache message, mdamageu called, resistance forgotten', async () => {
    // spellval=0, fumble=50; d(4,6)=10 -> "brain is on fire" range.
    const random = scriptedRandom([0, 50], 10);
    const state = makeState();
    // Starts believing the hero resists magic; monstunseesu() clears it.
    const watcher = watcherAt(state, 6, 5, M_SEEN_MAGR);
    const messages = [];
    let damageAmount = 0;

    const result = await castmu(
        makeCaster({ m_lev: 7 }), AD_SPEL_ATTACK, true, true,
        {
            state, random, unsupported: refuse,
            message: (m) => messages.push(m),
            mdamageu: (mon, dmg) => { damageAmount = dmg; },
            monsterName: (m) => 'The kobold shaman',
        },
    );

    assert.equal(result, M_ATTK_HIT);
    assert.ok(messages.some(m => m.includes('brain is on fire')),
        `Expected "brain is on fire" for dmg=10; got: ${messages.join('; ')}`);
    assert.equal(damageAmount, 10, 'full damage without ANTIMAGIC');
    assert.equal(watcher.seen_resistance, 0, 'monstunseesu(M_SEEN_MAGR)');
});

test('psi_bolt: ANTIMAGIC halves damage and tracks resistance', async () => {
    // d(4,6)=8 -> (8+1)/2=4 after ANTIMAGIC -> "slight headache".
    const random = scriptedRandom([0, 50], 8);
    const state = makeState({
        u: {
            ux: 4, uy: 5,
            uprops: { [ANTIMAGIC]: { intrinsic: 1 } },
        },
    });
    const watcher = watcherAt(state, 6, 5, 0);
    const messages = [];
    let damageAmount = 0;

    await castmu(makeCaster({ m_lev: 7 }), AD_SPEL_ATTACK, true, true, {
        state, random, unsupported: refuse,
        message: (m) => messages.push(m),
        mdamageu: (mon, dmg) => { damageAmount = dmg; },
        monsterName: (m) => 'The kobold shaman',
    });

    assert.equal(damageAmount, 4, 'ANTIMAGIC halves damage: (8+1)/2=4');
    assert.ok(messages.some(m => m.includes('slight') && m.includes('ache')),
        `Expected slight headache for dmg=4; got: ${messages.join('; ')}`);
    assert.equal(watcher.seen_resistance, M_SEEN_MAGR,
        'monstseesu(M_SEEN_MAGR)');
});

// -- open_wounds via castmu --------------------------------------------

// C ref: mcastu.c mcast_open_wounds() (623-642).
// AD_CLRC cleric list: MCAST_OPEN_WOUNDS is index 0 (level 0).

test('open_wounds: wound message for dmg in 6-10 range', async () => {
    const random = scriptedRandom([0, 50], 8);
    const state = makeState();
    const watcher = watcherAt(state, 6, 5, M_SEEN_MAGR);
    const messages = [];
    let damageAmount = 0;

    await castmu(makeCaster({ m_lev: 7 }), AD_CLRC_ATTACK, true, true, {
        state, random, unsupported: refuse,
        message: (m) => messages.push(m),
        mdamageu: (mon, dmg) => { damageAmount = dmg; },
        monsterName: (m) => 'The kobold shaman',
    });

    assert.ok(messages.some(m => m === 'Wounds appear on your body!'),
        `Expected "Wounds appear on your body!"; got: ${messages.join('; ')}`);
    assert.equal(damageAmount, 8);
    assert.equal(watcher.seen_resistance, 0, 'monstunseesu(M_SEEN_MAGR)');
});

test('open_wounds: ANTIMAGIC halves damage and tracks resistance', async () => {
    // d(4,6)=8 -> (8+1)/2=4 -> "skin itches" range (<= 5).
    const random = scriptedRandom([0, 50], 8);
    const state = makeState({
        u: { ux: 4, uy: 5, uprops: { [ANTIMAGIC]: { intrinsic: 1 } } },
    });
    const watcher = watcherAt(state, 6, 5, 0);
    const messages = [];
    let damageAmount = 0;

    await castmu(makeCaster({ m_lev: 7 }), AD_CLRC_ATTACK, true, true, {
        state, random, unsupported: refuse,
        message: (m) => messages.push(m),
        mdamageu: (mon, dmg) => { damageAmount = dmg; },
        monsterName: (m) => 'The kobold shaman',
    });

    assert.equal(damageAmount, 4);
    assert.ok(messages.some(m => m === 'Your skin itches badly for a moment.'),
        `Expected the itch line for dmg=4; got: ${messages.join('; ')}`);
    assert.equal(watcher.seen_resistance, M_SEEN_MAGR);
});

// -- cure_self via castmu ----------------------------------------------

// C ref: mcastu.c m_cure_self() (307-318).
// Cleric with mhp < mhpmax: heals d(3,6), prints "looks better", dmg=0.

test('cure_self: heals monster and produces no hero damage', async () => {
    const dResults = [12, 9]; // d(4,6)=12 (castmu dmg), d(3,6)=9 (healmon)
    let di = 0;
    const random = {
        rn2: (n) => (n === 7 ? 1 : 50), // spellval=1 picks CURE_SELF; fumble=50
        d: () => { const v = di < dResults.length ? dResults[di] : 6; di++; return v; },
    };

    const mtmp = makeCaster({ m_lev: 7, mhp: 10, mhpmax: 20 });
    const messages = [];
    let damageCalled = false;

    await castmu(mtmp, AD_CLRC_ATTACK, true, true, {
        state: makeState(),
        random,
        unsupported: refuse,
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

test('cure_self: is not chosen when the monster is at full health', async () => {
    // rn2(7)=1 reaches MCAST_CURE_SELF, which spell_would_be_useless()
    // rejects at mhp=mhpmax; MCAST_OPEN_WOUNDS (level 0) is cast instead.
    const random = scriptedRandom([1, 50], 6);
    const mtmp = makeCaster({ m_lev: 7, mhp: 20, mhpmax: 20 });
    const messages = [];
    let damageAmount = 0;

    await castmu(mtmp, AD_CLRC_ATTACK, true, true, {
        state: makeState(),
        random,
        unsupported: refuse,
        message: (m) => messages.push(m),
        mdamageu: (mon, dmg) => { damageAmount = dmg; },
        monsterName: (m) => 'The kobold shaman',
    });

    assert.ok(!messages.some(m => m.includes('looks better')),
        'no "looks better" at full health');
    assert.equal(mtmp.mhp, 20, 'monster hp unchanged');
    assert.equal(damageAmount, 6, 'open_wounds delivers d(4,6)=6');
});

// -- buzzmu ---------------------------------------------------------------

// C ref: mcastu.c buzzmu() (988-1012). "monster uses spell (ranged)"
// Returns M_ATTK_MISS when the adtyp is not a valid buzz type, the monster
// is cancelled, or lined_up/rn2(3) fails. Returns M_ATTK_HIT when the
// spell fires.

// Build an attack mattk for buzzmu. adtyp must be in the BZ_VALID_ADTYP
// range (AD_MAGM=1 through AD_SPC2=10) for the spell to fire.
function makeBuzzAttack(adtyp, damn = 4) {
    return { aatyp: AT_MAGC, adtyp, damn, damd: 0 };
}

test('buzzmu returns M_ATTK_MISS for an invalid adtyp', async () => {
    // AD_PHYS(0) is below AD_MAGM(1), so BZ_VALID_ADTYP rejects it.
    const mtmp = makeCaster();
    const result = await buzzmu(mtmp, makeBuzzAttack(0), {
        state: makeState(),
        random: scriptedRandom([]),
    });
    assert.equal(result, M_ATTK_MISS,
        'adtyp 0 is outside the valid buzz range');
});

test('buzzmu returns M_ATTK_MISS for a cancelled monster', async () => {
    // A cancelled monster calls cursetxt() and returns MISS.
    const mtmp = makeCaster({ mcan: true });
    const messages = [];
    const result = await buzzmu(mtmp, makeBuzzAttack(AD_FIRE), {
        state: makeState(),
        random: scriptedRandom([]),
        message: (m) => messages.push(m),
    });
    assert.equal(result, M_ATTK_MISS,
        'cancelled monster returns MISS');
    // cursetxt() produces a message when the monster is visible.
    assert.ok(messages.length > 0,
        'cursetxt produces a message');
});

test('buzzmu returns M_ATTK_MISS for a monster with seen resistance', async () => {
    // m_seenres checks mtmp.seen_resistance against the adtyp mask.
    // cvt_adtyp_to_mseenres(AD_COLD=3) is M_SEEN_COLD=0x100 (bit 8).
    const M_SEEN_COLD = 0x100;
    const mtmp = makeCaster({ seen_resistance: M_SEEN_COLD });
    const messages = [];
    const result = await buzzmu(mtmp, makeBuzzAttack(AD_COLD), {
        state: makeState(),
        random: scriptedRandom([]),
        message: (m) => messages.push(m),
    });
    assert.equal(result, M_ATTK_MISS,
        'seen resistance returns MISS');
});

test('buzzmu returns M_ATTK_MISS when rn2(3) returns 0', async () => {
    // Even when lined_up succeeds, rn2(3)=0 prevents the spell from firing.
    // State: monster at (5,5), hero at (4,5), couldsee(5,5) true. linedup
    // returns true immediately (orthogonal, within BOLT_LIM, couldsee passes)
    // without consuming any rn2 calls. The only rn2 buzzmu itself calls is
    // rn2(3), whose 0 result makes the `&& rn2(3)` falsy.
    const state = makeState();
    state.u.upolyd = false;
    state.youmonst.m_ap_type = 0;
    state.youmonst.mappearance = 0;
    const mtmp = makeCaster({ mx: 5, my: 5, mux: 4, muy: 5 });
    // The only rn2 consumed is buzzmu's own rn2(3)=0.
    const random = scriptedRandom([0]);
    const result = await buzzmu(mtmp, makeBuzzAttack(AD_FIRE), {
        state,
        random,
    });
    assert.equal(result, M_ATTK_MISS,
        'rn2(3)=0 prevents the spell from firing');
});
