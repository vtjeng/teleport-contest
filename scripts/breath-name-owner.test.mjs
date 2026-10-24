import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { planningState } from '../js/unported_monster_actions.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_RED_DRAGON, AD_FIRE } from '../js/monsters.js';
import { HALLUC, DEAF, ROOM, M_ATTK_MISS } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { canseemon } from '../js/display.js';
import { breamm } from '../js/mthrowu.js';
import { rn2_on_display_rng } from '../js/rng.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const hallucinating of [true, false]) for (const deaf of [false, true]) {
    test(`cancelled breath naming Hallu=${hallucinating} Deaf=${deaf}`, async () => {
        for (const planning of [true, false]) {
            await runSegment({ seed: 8432200, datetime: '20261215120000',
                nethackrc: 'OPTIONS=name:BreathNameOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
            game.level = new GameMap(); game.head_engr = null;
            for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
                game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
            }
            game.u.ux = 5; game.u.uy = 7;
            for (const [property, active] of [[HALLUC, hallucinating], [DEAF, deaf]]) {
                game.u.uprops[property].intrinsic = active ? 1000 : 0;
                game.u.uprops[property].extrinsic = 0;
            }
            const dragon = newMonster({ data: game.mons[PM_RED_DRAGON], mnum: PM_RED_DRAGON,
                m_id: 9910, m_lev: 15, mhp: 100, mhpmax: 100, mcanmove: true,
                mcansee: true, mcan: true, mux: 5, muy: 7 });
            game.level.monlist = dragon; place_monster(dragon, 9, 7, game);
            light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
            const state = planning ? planningState(game) : game;
            const subject = state.level.monlist;
            assert.equal(canseemon(subject, state), true);
            const ownDisplay = structuredClone(state.displayCtx), liveDisplay = structuredClone(game.displayCtx);
            const core = structuredClone(game.coreCtx), context = structuredClone(game.context);
            const cosmetic = [], draws = [], messages = [];
            const result = await breamm(subject, { adtyp: AD_FIRE, damn: 4 }, state.youmonst, {
                state, planning,
                random: { rn2: bound => { draws.push(bound); return 0; } },
                displayRandom: bound => { cosmetic.push(bound); rn2_on_display_rng(bound, state); return 0; },
                message: async line => messages.push(line),
            });
            assert.equal(result, M_ATTK_MISS);
            assert.deepEqual(messages, deaf ? [] : [`The ${hallucinating ? 'giant ant' : 'red dragon'} coughs.`]);
            assert.deepEqual(cosmetic, hallucinating && !deaf ? [430, 2] : []);
            assert.deepEqual(draws, []);
            assert.deepEqual(game.coreCtx, core);
            assert.deepEqual(game.context, context);
            assert.equal(dragon.mhp, 100);
            if (hallucinating && !deaf) assert.notDeepEqual(state.displayCtx, ownDisplay);
            else assert.deepEqual(state.displayCtx, ownDisplay);
            if (planning) assert.deepEqual(game.displayCtx, liveDisplay);
        }
    });
}
for (const name of ['normal', 'monochrome', 'before-control']) {
    test('breath naming ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mthrowu.c/breath-name-owner-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
