import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster, m_at } from '../js/monst.js';
import { PM_GOBLIN, AD_PHYS } from '../js/monsters.js';
import { monkilled } from '../js/mon.js';
import { planningState } from '../js/unported_monster_actions.js';
import { ROOM, HALLUC, DETECT_MONSTERS, BLINDED, SEE_INVIS } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals, cansee } from '../js/vision.js';
import { canseemon, canspotmon } from '../js/display.js';
import { rn2_on_display_rng } from '../js/rng.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const hallucinating of [false, true]) for (const deathMessage of [false, true]) {
    test(`monkilled name Hallu=${hallucinating} message=${deathMessage}`, async () => {
        for (const planning of [true, false]) {
            await runSegment({ seed: 8432204, datetime: '20261219120000',
                nethackrc: 'OPTIONS=name:KillOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: ' ' });
            game.level = new GameMap(); game.level.flags.deathdrops = true;
            game.head_engr = null;
            for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
                game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
            }
            game.u.ux = 5; game.u.uy = 7;
            for (const [property, active] of [[HALLUC, hallucinating], [DETECT_MONSTERS, true], [BLINDED, false], [SEE_INVIS, false]]) {
                game.u.uprops[property].intrinsic = active ? 1000 : 0;
                game.u.uprops[property].extrinsic = 0;
            }
            const goblin = newMonster({ data: game.mons[PM_GOBLIN], mnum: PM_GOBLIN,
                m_id: 9912, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true, minvis: true });
            game.level.monlist = goblin; place_monster(goblin, 8, 7, game);
            light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
            const state = planning ? planningState(game) : game;
            const victim = state.level.monlist;
            assert.equal(cansee(8, 7, state), true);
            assert.equal(canseemon(victim, state), false);
            assert.equal(canspotmon(victim, state), true);
            const live = structuredClone(game.displayCtx), own = structuredClone(state.displayCtx);
            const core = structuredClone(game.coreCtx), context = structuredClone(game.context);
            const lines = [], cosmetic = [], bounds = [];
            await monkilled(victim, deathMessage ? '' : null, AD_PHYS, state, {
                planning, state,
                random: { rn2: bound => { bounds.push(bound); return bound > 1 ? 1 : 0; } },
                canSeeMonster: subject => canseemon(subject, state),
                displayRandom: bound => { cosmetic.push(bound); rn2_on_display_rng(bound, state); return 0; },
                message: async line => lines.push(line),
                ...(planning ? { redraw: () => {} } : {}),
                unsupported: reason => { throw new Error(reason); },
            });
            assert.deepEqual(lines, deathMessage
                ? [`The invisible ${hallucinating ? 'giant ant' : 'goblin'} is killed!`] : []);
            assert.deepEqual(cosmetic, hallucinating && deathMessage ? [430, 2] : []);
            // Normal-level corpse eligibility is real; roll 1 declines the corpse.
            assert.deepEqual(bounds, [3]);
            assert.equal(victim.mhp, 0);
            assert.equal(m_at(8, 7, state), null);
            assert.deepEqual(game.coreCtx, core);
            assert.deepEqual(game.context, context);
            if (hallucinating && deathMessage) assert.notDeepEqual(state.displayCtx, own);
            else assert.deepEqual(state.displayCtx, own);
            if (planning) {
                assert.deepEqual(game.displayCtx, live);
                assert.equal(goblin.mhp, 20);
                assert.equal(m_at(8, 7, game), goblin);
            } else assert.equal(goblin.mhp, 0);
        }
    });
}
for (const name of ['normal', 'monochrome', 'before-control']) {
    test('monkilled name ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mon.c/monkilled-name-owner-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
