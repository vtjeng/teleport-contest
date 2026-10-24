import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_MIND_FLAYER, NON_PM, AT_TENT } from '../js/monsters.js';
import { hitmsg } from '../js/mhitu.js';
import { planningState } from '../js/unported_monster_actions.js';
import { ROOM, HALLUC, HALLUC_RES, BLINDED, SEE_INVIS, DETECT_MONSTERS } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { canspotmon, canseemon } from '../js/display.js';
import { rn2_on_display_rng } from '../js/rng.js';

for (const hallu of [false, true]) for (const detected of [false, true]) {
    test(`tentacle prefetch Hallu=${hallu} Detect=${detected}`, async () => {
        for (const planning of [true, false]) {
            await runSegment({ seed: 8432211, datetime: '20270101120000',
                nethackrc: 'OPTIONS=name:TentacleName,role:Priest,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: ' ' });
            game.level = new GameMap(); game.head_engr = null;
            for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
                game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
            }
            game.u.ux = 5; game.u.uy = 7; game.context.mon_moving = true;
            for (const [property, active] of [[HALLUC, hallu], [HALLUC_RES, false], [BLINDED, false], [SEE_INVIS, false], [DETECT_MONSTERS, detected]]) {
                game.u.uprops[property].intrinsic = active ? 1000 : 0;
                game.u.uprops[property].extrinsic = 0;
            }
            const flayer = newMonster({ data: game.mons[PM_MIND_FLAYER], mnum: PM_MIND_FLAYER,
                m_id: 9921, cham: NON_PM, m_lev: game.mons[PM_MIND_FLAYER].mlevel,
                mhp: 60, mhpmax: 60, mcansee: true, mcanmove: true, minvis: true });
            game.level.monlist = flayer; place_monster(flayer, 6, 7, game);
            light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
            game.gh = { ...(game.gh ?? {}), hitmsg_mid: 0, hitmsg_prev: null };
            const state = planning ? planningState(game) : game;
            const attacker = state.level.monlist;
            assert.equal(canseemon(attacker, state), false);
            assert.equal(canspotmon(attacker, state), detected);
            const attacks = attacker.data.mattk.filter(a => a.aatyp === AT_TENT).slice(0, 2);
            assert.equal(attacks.length, 2);
            const lines = [], cosmetic = [], beforeGH = { ...game.gh };
            const core = structuredClone(game.coreCtx), live = structuredClone(game.displayCtx);
            for (const attack of attacks) await hitmsg(attacker, attack, state, {
                planning, canSpotMonster: monster => canspotmon(monster, state),
                canSeeMonster: monster => canseemon(monster, state),
                displayRandom: n => { cosmetic.push(n); rn2_on_display_rng(n, state); return 0; },
                message: async line => lines.push(line),
                unsupported: reason => { throw new Error(reason); },
            });
            const possessive = detected ? `The invisible ${hallu ? 'giant ant' : 'mind flayer'}'s` : 'Its';
            assert.deepEqual(lines, [`${possessive} tentacles suck your brain!`, `${possessive} tentacles suck your brain again!`]);
            assert.deepEqual(cosmetic, hallu && detected ? [430, 2, 430, 2] : []);
            assert.equal(state.gh.hitmsg_mid, 9921); assert.equal(state.gh.hitmsg_prev, attacks[1]);
            assert.equal(attacker.mhp, 60); assert.deepEqual(game.coreCtx, core);
            if (hallu && detected) assert.notDeepEqual(state.displayCtx, live);
            else assert.deepEqual(state.displayCtx, live);
            if (planning) { assert.deepEqual(game.displayCtx, live); assert.deepEqual(game.gh, beforeGH); }
        }
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('tentacle prefetch ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mhitu.c/tentacle-prefetch-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
