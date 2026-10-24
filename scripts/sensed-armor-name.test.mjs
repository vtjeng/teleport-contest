import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { planningState } from '../js/unported_monster_actions.js';
import { rn2_on_display_rng } from '../js/rng.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_MASTER_LICH } from '../js/monsters.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, SEE_INVIS, ROOM } from '../js/const.js';
import { vision_recalc } from '../js/vision.js';
import { canspotmon, canseemon } from '../js/display.js';
import { m_dowear } from '../js/worn.js';

for (const planning of [true, false]) for (const hallucinating of [true, false])
    for (const seeInvisible of [true, false]) {
        test(`armor name snapshot planning=${planning} hallucinating=${hallucinating} seeInvisible=${seeInvisible}`, async () => {
            await runSegment({ seed: 8432195, datetime: '20261206120000',
                nethackrc: 'OPTIONS=name:ArmorNameProbe,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
            for (const column of game.level.monsters) column.fill(null);
            game.level.monlist = null;
            for (const [property, active] of [[BLINDED, true], [HALLUC, hallucinating], [DETECT_MONSTERS, true], [SEE_INVIS, seeInvisible]])
                game.u.uprops[property].intrinsic = active ? 1000 : 0;
            const x = game.u.ux + 1, y = game.u.uy;
            game.level.at(x, y).typ = ROOM;
            const monster = newMonster({ data: game.mons[PM_MASTER_LICH], mnum: PM_MASTER_LICH,
                m_id: 9500, m_lev: 17, mhp: 90, mhpmax: 100, mcanmove: true, minvis: true });
            game.level.monlist = monster; place_monster(monster, x, y, game);
            vision_recalc(0, { state: game });
            const state = planning ? planningState(game) : game;
            const subject = state.level.monlist;
            assert.equal(canseemon(subject, state), false);
            assert.equal(canspotmon(subject, state), true);
            const ownDisplay = structuredClone(state.displayCtx), liveDisplay = structuredClone(game.displayCtx);
            const core = structuredClone(game.coreCtx), context = structuredClone(game.context);
            const draws = [];
            await m_dowear(subject, false, {
                state, planning,
                canSeeMonster: m => canseemon(m, state),
                displayRandom: bound => {
                    draws.push(bound); rn2_on_display_rng(bound, state);
                    return 0; // giant ant, then male: no rejection-loop ambiguity
                },
            });
            // C worn.c:747-791 invokes eight eligible slots for a lich,
            // and :817 snapshots its sensed name even with no armor to select.
            assert.deepEqual(draws, hallucinating ? Array.from({ length: 8 }, () => [430, 2]).flat() : []);
            if (hallucinating) assert.notDeepEqual(state.displayCtx, ownDisplay);
            else assert.deepEqual(state.displayCtx, ownDisplay);
            assert.equal(subject.minvent, null);
            assert.equal(subject.mhp, 90);
            assert.equal(subject.misc_worn_check, 0);
            assert.deepEqual(game.coreCtx, core);
            assert.deepEqual(game.context, context);
            if (planning) assert.deepEqual(game.displayCtx, liveDisplay);
        });
    }

for (const name of ['normal', 'monochrome', 'no-hallucination-control']) {
    test('sensed armor name ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/worn.c/sensed-armor-name-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
