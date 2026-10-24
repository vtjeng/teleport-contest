import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GameMap } from '../js/game.js';
import { ROOM, LAVAPOOL } from '../js/const.js';
import { PM_BLACK_NAGA } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { planningState, runDirectMonsterAction } from '../js/unported_monster_actions.js';
import { MonsterDeathPlanningError } from '../js/mhitu.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

async function prepare({ fatal, planning }) {
    await runSegment({ seed: 8432190, datetime: '20261120120000',
        nethackrc: 'OPTIONS=name:SpitOwner,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
    game.level = new GameMap(); game.u.ux = 8; game.u.uy = 7;
    game.u.uhp = fatal ? 1 : 100; game.u.uhpmax = 100;
    // The naga cannot approach over lava, but its spit has a clear line.
    for (let x = 5; x <= 8; ++x) {
        const tile = game.level.at(x, 7);
        tile.typ = x === 5 || x === 8 ? ROOM : LAVAPOOL; tile.lit = true;
    }
    const monster = newMonster({ data: game.mons[PM_BLACK_NAGA], mnum: PM_BLACK_NAGA,
        m_id: 8010, mx: 5, my: 7, mux: 8, muy: 7, mhp: 50, mhpmax: 50,
        m_lev: 13, mcansee: true, mcanmove: true, movement: 12, mpeaceful: false });
    place_monster(monster, 5, 7, game); game.level.monlist = monster;
    init_vision_globals(); vision_reset(game); vision_recalc(0);
    if (!planning) for (let i = 0; i < 32; ++i) game.nhDisplay.pushKey(32);
    const state = planning ? planningState(game) : game;
    return { state, actor: state.level.monlist };
}
function hitRandom() {
    return { rn2: () => 0, rnd: n => n === 20 ? 1 : n,
        rn1: (_n, base) => base, rne: () => 1, rnl: () => 0,
        d: (n, sides) => n * sides };
}
for (const fatal of [false, true]) {
    for (const staleOuter of [false, true]) {
        test(`planned spit owns fatal callback: fatal=${fatal}, staleOuter=${staleOuter}`, async () => {
            const { state, actor } = await prepare({ fatal, planning: true });
            const before = { hp: game.u.uhp, ident: game.context.ident,
                core: structuredClone(game.coreCtx), locations: structuredClone(game.level.locations),
                program: structuredClone(game.program_state) };
            let outerCalls = 0;
            const env = { state, planning: true, random: hitRandom(), message: async () => {} };
            if (staleOuter) env.planningDeath = () => {
                ++outerCalls; return new Error('stale outer callback');
            };
            if (fatal) {
                await assert.rejects(runDirectMonsterAction(actor, env), error =>
                    error instanceof MonsterDeathPlanningError && error.monsterId === actor.m_id);
                assert.ok(state.u.uhp <= 0);
            } else {
                await runDirectMonsterAction(actor, env);
                assert.ok(state.u.uhp > 0 && state.u.uhp < 100);
            }
            assert.equal(outerCalls, 0);
            assert.equal(game.u.uhp, before.hp);
            assert.equal(game.context.ident, before.ident);
            assert.deepEqual(game.coreCtx, before.core);
            assert.deepEqual(game.level.locations, before.locations);
            assert.deepEqual(game.program_state, before.program);
        });
    }
}
test('live nonfatal spit still damages the hero without a planning marker', async () => {
    const { state, actor } = await prepare({ fatal: false, planning: false });
    const core = structuredClone(game.coreCtx);
    await runDirectMonsterAction(actor, { state, random: hitRandom(), message: async () => {} });
    assert.ok(game.u.uhp > 0 && game.u.uhp < 100);
    assert.deepEqual(game.coreCtx, core);
});
for (const name of ['fatal', 'monochrome', 'before-control']) {
    test('fatal spit owner ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mthrowu.c/fatal-spit-owner-' + name + '.session.json', import.meta.url)));
            const r = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(r.passed, true, formatReport(r));
        } finally { removeScoringWorkspace(root); }
    });
}
