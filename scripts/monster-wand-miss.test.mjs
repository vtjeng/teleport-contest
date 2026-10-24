import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { planningState } from '../js/unported_monster_actions.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_HUMAN } from '../js/monsters.js';
import { BLINDED, HALLUC, DEAF, DETECT_MONSTERS, ROOM } from '../js/const.js';
import { WAN_STRIKING } from '../js/objects.js';
import { newObject } from '../js/obj.js';
import { mbhitm } from '../js/muse.js';
import { rn2_on_display_rng } from '../js/rng.js';
import { vision_recalc } from '../js/vision.js';
import { canspotmon } from '../js/display.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const planning of [true, false]) for (const hallucinating of [true, false])
    for (const deaf of [true, false]) {
        test(`monster wand miss planning=${planning} Hallu=${hallucinating} Deaf=${deaf}`, async () => {
            await runSegment({ seed: 8432198, datetime: '20261213120000',
                nethackrc: 'OPTIONS=name:MissOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
            for (const column of game.level.monsters) column.fill(null);
            game.level.monlist = null;
            for (const [property, active] of [[BLINDED, true], [HALLUC, hallucinating], [DEAF, deaf], [DETECT_MONSTERS, true]])
                game.u.uprops[property].intrinsic = active ? 1000 : 0;
            const x = game.u.ux + 1, y = game.u.uy;
            game.level.at(x, y).typ = ROOM;
            const monster = newMonster({ data: game.mons[PM_HUMAN], mnum: PM_HUMAN,
                m_id: 9800, m_lev: 1, mhp: 20, mhpmax: 20, mcanmove: true, minvis: true });
            game.level.monlist = monster; place_monster(monster, x, y, game);
            vision_recalc(0, { state: game });
            const state = planning ? planningState(game) : game;
            const subject = state.level.monlist;
            state.gb.bhitpos = { x, y };
            assert.equal(canspotmon(subject, state), true);
            const ownDisplay = structuredClone(state.displayCtx), liveDisplay = structuredClone(game.displayCtx);
            const core = structuredClone(game.coreCtx), context = structuredClone(game.context);
            const messages = [], draws = [], cosmetic = [];
            await mbhitm(subject, newObject({ otyp: WAN_STRIKING, oclass: state.objects[WAN_STRIKING].oc_class }), state, {
                planning,
                random: { rnd: bound => { draws.push(['rnd', bound]); assert.equal(bound, 20); return 20; } },
                message: async line => messages.push(line),
                displayRandom: bound => { cosmetic.push(bound); rn2_on_display_rng(bound, state); return 0; },
            });
            assert.deepEqual(draws, [['rnd', 20]], 'C striking miss rolls no damage or resistance');
            assert.deepEqual(messages, [`The wand misses the invisible ${hallucinating ? 'giant ant' : 'human'}.`]);
            assert.deepEqual(cosmetic, hallucinating ? [430, 2] : []);
            assert.equal(subject.mhp, 20);
            if (hallucinating) assert.notDeepEqual(state.displayCtx, ownDisplay);
            else assert.deepEqual(state.displayCtx, ownDisplay);
            assert.deepEqual(game.coreCtx, core);
            assert.deepEqual(game.context, context);
            if (planning) {
                assert.deepEqual(game.displayCtx, liveDisplay);
                assert.equal(monster.mhp, 20);
            }
        });
    }

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('monster striking miss ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/muse.c/striking-miss-owner-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
