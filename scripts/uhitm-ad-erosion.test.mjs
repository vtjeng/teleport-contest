import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    ERODE_CORRODE,
    ERODE_ROT,
    ERODE_RUST,
    M_ATTK_MISS,
    STRAT_WAITFORU,
} from '../js/const.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    AD_CORR,
    AD_DCAY,
    AD_RUST,
    AT_TUCH,
    PM_GRID_BUG,
} from '../js/monsters.js';
import { mhitm_adtyping } from '../js/uhitm.js';

const C_UHITM = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const CASES = [
    { adtyp: AD_RUST, erosion: ERODE_RUST, name: 'rust' },
    { adtyp: AD_CORR, erosion: ERODE_CORRODE, name: 'corrosion' },
    { adtyp: AD_DCAY, erosion: ERODE_ROT, name: 'decay' },
];
// This fixed clock keeps startup deterministic; these handler fixtures use no calendar branch.
const DATETIME = '20310405060708';
const RC = [
    'OPTIONS=name:Erosion,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

function cFunction(source, name) {
    const start = source.indexOf(`${name}(`);
    assert.notEqual(start, -1, `missing C definition ${name}`);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < source.length; index++) {
        if (source[index] === '{') depth++;
        if (source[index] === '}' && --depth === 0)
            return source.slice(open, index + 1);
    }
    assert.fail(`unterminated C definition ${name}`);
}

async function freshState() {
    // This fixed debug-game setup gives the handler fixtures a real initialized C-like state.
    await runSegment({ seed: 7711083, datetime: DATETIME, nethackrc: RC, moves: '' });
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.unported = new Set();
    return game;
}

function fixtureMonster(state, id, dx, dy = 0) {
    const data = state.mons[PM_GRID_BUG];
    const monster = newMonster({
        data,
        mnum: PM_GRID_BUG,
        m_id: id,
        mx: state.u.ux + dx,
        my: state.u.uy + dy,
        mux: state.u.ux,
        muy: state.u.uy,
        m_lev: data.mlevel,
        mcan: 0,
        mcansee: true,
        mcanmove: true,
        mhp: 20, // Direct handler fixtures survive any incidental message-side inspection.
        mhpmax: 20, // Match current HP so no unrelated growth or death path is involved.
    });
    place_monster(monster, monster.mx, monster.my, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    return monster;
}

function attack(adtyp) {
    // The handlers receive an already-built mhm; zero dice prevent this fixture from implying a hit roll.
    return { aatyp: AT_TUCH, adtyp, damn: 0, damd: 0 };
}

function attackEnv(events) {
    return {
        unsupported: (reason) => assert.fail(reason),
        message: async (line) => { events.push(`message:${line}`); },
        // C's erode_armor result is void; this seam pins its target and erosion class.
        erodeArmor: async (target, hurt) => { events.push({ target, hurt }); },
    };
}

test('the three C erosion handlers retain their full source branches', () => {
    const rust = cFunction(C_UHITM, 'mhitm_ad_rust');
    assert.match(rust, /magr == &gy\.youmonst[\s\S]*?completelyrusts\(pd\)[\s\S]*?xkilled\(mdef, XKILL_NOMSG\)[\s\S]*?erode_armor\(mdef, ERODE_RUST\)/u);
    assert.match(rust, /mdef == &gy\.youmonst[\s\S]*?hitmsg\(magr, mattk\)[\s\S]*?if\s*\(magr->mcan\)[\s\S]*?rehumanize\(\)/u);
    assert.match(rust, /monkilled\(mdef, \(char \*\) 0, AD_RUST\)[\s\S]*?grow_up\(magr, mdef\)[\s\S]*?STRAT_WAITFORU/u);

    const corr = cFunction(C_UHITM, 'mhitm_ad_corr');
    assert.match(corr, /magr == &gy\.youmonst[\s\S]*?erode_armor\(mdef, ERODE_CORRODE\)[\s\S]*?mhm->damage = 0/u);
    assert.match(corr, /mdef == &gy\.youmonst[\s\S]*?hitmsg\(magr, mattk\)[\s\S]*?if\s*\(magr->mcan\)/u);
    assert.match(corr, /magr->mcan[\s\S]*?erode_armor\(mdef, ERODE_CORRODE\)[\s\S]*?STRAT_WAITFORU/u);

    const decay = cFunction(C_UHITM, 'mhitm_ad_dcay');
    assert.match(decay, /completelyrots\(pd\)[\s\S]*?xkilled\(mdef, XKILL_NOMSG\)[\s\S]*?erode_armor\(mdef, ERODE_ROT\)/u);
    assert.match(decay, /mdef == &gy\.youmonst[\s\S]*?hitmsg\(magr, mattk\)[\s\S]*?if\s*\(magr->mcan\)[\s\S]*?rehumanize\(\)/u);
    assert.match(decay, /monkilled\(mdef, \(char \*\) 0, AD_DCAY\)[\s\S]*?grow_up\(magr, mdef\)[\s\S]*?STRAT_WAITFORU/u);

    // These assertions pin only the three selected C dispatcher arms, not the whole dispatcher.
    assert.match(C_UHITM, /case AD_RUST:\s*mhitm_ad_rust\(magr, mattk, mdef, mhm\); break;/u);
    assert.match(C_UHITM, /case AD_CORR:\s*mhitm_ad_corr\(magr, mattk, mdef, mhm\); break;/u);
    assert.match(C_UHITM, /case AD_DCAY:\s*mhitm_ad_dcay\(magr, mattk, mdef, mhm\); break;/u);
});

test('H-to-M erosion dispatch selects each source erosion and clears damage', async () => {
    const state = await freshState();
    for (let index = 0; index < CASES.length; index++) {
        const { adtyp, erosion } = CASES[index];
        // Each fixture occupies a different adjacent square for the corresponding attack.
        // These unique local IDs and neighboring squares isolate each direct H→M handler call.
        const target = fixtureMonster(state, 2001 + index, index % 2 ? -1 : 1, index === 2 ? 1 : 0);
        const events = [];
        const mhm = { damage: 9, hitflags: M_ATTK_MISS, done: false }; // Nonzero sentinel proves the H→M zeroing.
        await mhitm_adtyping(
            state.youmonst,
            attack(adtyp),
            target,
            mhm,
            state,
            attackEnv(events),
        );
        assert.deepEqual(events, [{ target, hurt: erosion }]);
        assert.equal(mhm.damage, 0);
    }
    assert.equal(state.unported.size, 0);
});

test('cancelled monster attacks print hitmsg before skipping every erosion', async () => {
    const state = await freshState();
    for (let index = 0; index < CASES.length; index++) {
        const { adtyp } = CASES[index];
        const attacker = fixtureMonster(state, 2101 + index, -1, index - 1);
        attacker.mcan = 1; // C's cancelled-attacker guard precedes each erode_armor call.
        const events = [];
        const mhm = { damage: 7, hitflags: M_ATTK_MISS, done: false }; // Sentinel remains on the canceled return.
        await mhitm_adtyping(
            attacker,
            attack(adtyp),
            state.youmonst,
            mhm,
            state,
            attackEnv(events),
        );
        assert.equal(events.filter((event) => typeof event === 'object').length, 0);
        assert.equal(events.filter((event) => String(event).startsWith('message:')).length, 1); // hitmsg precedes cancellation.
        assert.equal(mhm.damage, 7);
    }
});

test('uncancelled monster pairs erode the defender and clear wait-for-hero damage', async () => {
    const state = await freshState();
    for (let index = 0; index < CASES.length; index++) {
        const { adtyp, erosion } = CASES[index];
        // Direct helper fixtures need not be adjacent; the saved C route proves fightm selects real neighbors.
        const attacker = fixtureMonster(state, 2201 + index, -1, index - 1);
        const target = fixtureMonster(state, 2301 + index, 1, index - 1);
        // C's AD_CORR/AD_RUST/AD_DCAY monster arm clears this exact strategy bit.
        target.mstrategy = STRAT_WAITFORU;
        const events = [];
        const mhm = { damage: 11, hitflags: M_ATTK_MISS, done: false }; // Nonzero sentinel proves the M→M reset.
        await mhitm_adtyping(
            attacker,
            attack(adtyp),
            target,
            mhm,
            state,
            attackEnv(events),
        );
        assert.deepEqual(events, [{ target, hurt: erosion }]);
        assert.equal(target.mstrategy & STRAT_WAITFORU, 0);
        assert.equal(mhm.damage, 0);
    }
});

test('cancelled monster pairs leave damage and defender strategy unchanged', async () => {
    const state = await freshState();
    for (let index = 0; index < CASES.length; index++) {
        const { adtyp } = CASES[index];
        const attacker = fixtureMonster(state, 2401 + index, -1, index - 1);
        const target = fixtureMonster(state, 2501 + index, 1, index - 1);
        attacker.mcan = 1; // The C M→M cancellation return is before erosion and state writes.
        target.mstrategy = STRAT_WAITFORU;
        const events = [];
        const mhm = { damage: 13, hitflags: M_ATTK_MISS, done: false }; // C preserves damage when the attacker is canceled.
        await mhitm_adtyping(
            attacker,
            attack(adtyp),
            target,
            mhm,
            state,
            attackEnv(events),
        );
        assert.deepEqual(events, []);
        assert.equal(target.mstrategy & STRAT_WAITFORU, STRAT_WAITFORU);
        assert.equal(mhm.damage, 13);
    }
});
