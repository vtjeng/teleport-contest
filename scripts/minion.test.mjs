import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CHAOTIC,
    A_NONE,
    A_NEUTRAL,
    G_GONE,
    MM_EMIN,
    MM_NOMSG,
} from '../js/const.js';
import { ART_DEMONBANE } from '../js/artifacts.js';
import {
    dlord,
    dprince,
    lminion,
    llord,
    msummon,
    ndemon,
} from '../js/minion.js';
import * as M from '../js/monsters.js';
import { monst_globals_init, reset_mvitals } from '../js/monsters.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';

function selectorState() {
    return {
        u: { uz: { dnum: 0 }, ualign: { type: A_CHAOTIC } },
        astral_level: { dnum: 99 },
        mons: Array.from({ length: M.NUMMONS }, (_, pmidx) => ({
            pmidx,
            maligntyp: A_CHAOTIC,
        })),
        mvitals: Array.from({ length: M.NUMMONS }, () => ({ mvflags: 0 })),
    };
}

test('dprince and dlord preserve their source ranges and alignment filter',
    () => {
        const state = selectorState();
        const dprinceRolls = [];
        const dlordRolls = [];
        const dprinceRandom = {
            rn1: (range, base) => {
                dprinceRolls.push([range, base]);
                return M.PM_ORCUS;
            },
        };
        const dlordRandom = {
            rn1: (range, base) => {
                dlordRolls.push([range, base]);
                return M.PM_JUIBLEX;
            },
        };
        assert.equal(dprince(A_CHAOTIC, state, dprinceRandom), M.PM_ORCUS);
        assert.equal(dlord(A_CHAOTIC, state, dlordRandom), M.PM_JUIBLEX);
        assert.deepEqual(dprinceRolls, [
            [M.PM_DEMOGORGON + 1 - M.PM_ORCUS, M.PM_ORCUS],
        ]);
        assert.deepEqual(dlordRolls, [
            [M.PM_YEENOGHU + 1 - M.PM_JUIBLEX, M.PM_JUIBLEX],
        ]);

        state.mvitals[M.PM_ORCUS].mvflags = G_GONE;
        const fallback = dprince(A_NONE, state, {
            rn1: (_range, base) => base,
        });
        assert.equal(fallback, M.PM_JUIBLEX);
    });

test('llord prefers a live Archon before rolling an angel class', () => {
    const state = selectorState();
    assert.equal(llord(state, { rnd: () => 1 }), M.PM_ARCHON);
    state.mvitals[M.PM_ARCHON].mvflags = G_GONE;
});

test('lminion and ndemon retain their source class and alignment behavior', () => {
    const state = {
        ...rawMonsterGenerationState(),
        astral_level: { dnum: 0, dlevel: 5 },
        rogue_level: { dnum: 0, dlevel: 5 },
        sanctum_level: { dnum: 0, dlevel: 5 },
        level: { flags: { temperature: 0 } },
    };
    monst_globals_init(state);
    reset_mvitals(state);
    const random = { rn2: () => 0, rnd: () => 1 };

    const lawful = lminion(state, random);
    assert.notEqual(lawful, M.NON_PM);
    assert.equal(state.mons[lawful].mlet, M.S_ANGEL);
    const demon = ndemon(-1, state, random);
    assert.notEqual(demon, M.NON_PM);
    assert.equal(state.mons[demon].mlet, M.S_DEMON);
    assert.equal(Math.sign(state.mons[demon].maligntyp), -1);
});

test('msummon applies the Demonbane refusal before selector or census work',
    async () => {
        const state = selectorState();
        const demon = state.mons[M.PM_ORCUS];
        demon.mflags2 = M.M2_DEMON | M.M2_LORD;
        state.uwep = { oartifact: ART_DEMONBANE };
        const lines = [];
        const result = await msummon(
            { data: demon },
            {
                state,
                message: (line) => lines.push(line),
                canSeeMonster: () => false,
            },
        );
        assert.equal(result, 0);
        assert.deepEqual(lines, []);
    });

test('msummon uses the runtime creation contract and preserves census delta',
    async () => {
        const state = selectorState();
        state.u.ux = 4;
        state.u.uy = 5;
        state.level = { monlist: null };
        state.ualign = { type: A_NEUTRAL };
        state.mons[M.PM_ANGEL] = {
            pmidx: M.PM_ANGEL,
            mlet: M.S_ANGEL,
            maligntyp: A_NEUTRAL,
        };
        const summoner = {
            data: state.mons[M.PM_ANGEL],
            isminion: false,
        };
        const calls = [];
        const transientLights = [];
        const result = await msummon(summoner, {
            state,
            random: {
                rn2: (bound) => bound === 6 ? 1 : 1,
                rn1: () => 1,
                rnd: () => 1,
                d: () => 1,
                rne: () => 1,
                rnz: () => 1,
            },
            canSeeMonster: () => false,
            showTransientLight: async (x, y) => {
                transientLights.push([x, y]);
            },
            makemon_runtime: async (ptr, x, y, flags, env) => {
                calls.push({ ptr, x, y, flags, env });
                const created = {
                    data: ptr,
                    m_id: 1,
                    mx: x,
                    my: y,
                    mhp: 10,
                    mpeaceful: false,
                    mextra: { emin: {} },
                };
                state.level.monlist = created;
                return created;
            },
        });
        assert.equal(result, 1);
        assert.equal(calls.length, 1);
        assert.deepEqual(transientLights, [[4, 5]]);
        assert.equal(calls[0].x, 4);
        assert.equal(calls[0].y, 5);
        assert.equal(calls[0].flags, MM_EMIN | MM_NOMSG);
        assert.equal(calls[0].env._msummon, true);
    });
