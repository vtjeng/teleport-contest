import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { planningState, runDirectMonsterAction } from '../js/unported_monster_actions.js';
import { rn2_on_display_rng } from '../js/rng.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_ORC_SHAMAN } from '../js/monsters.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, ROOM } from '../js/const.js';
import { vision_recalc } from '../js/vision.js';
import { canspotmon } from '../js/display.js';

for (const planning of [true, false]) for (const hallucinating of [true, false]) {
    test(`directed caster naming planning=${planning} hallucinating=${hallucinating}`, async () => {
        await runSegment({ seed: 8432194, datetime: '20261205120000',
            nethackrc: 'OPTIONS=name:SpellNameOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null; game.level.regions = []; game.head_engr = null;
        for (const [property, active] of [[BLINDED, true], [HALLUC, hallucinating], [DETECT_MONSTERS, true]])
            game.u.uprops[property].intrinsic = active ? 1000 : 0;
        const x = game.u.ux + 1, y = game.u.uy;
        game.level.at(x, y).typ = ROOM;
        const monster = newMonster({ data: game.mons[PM_ORC_SHAMAN], mnum: PM_ORC_SHAMAN,
            m_id: 9400, m_lev: 3, mhp: 5, mhpmax: 20, mcansee: true, mcanmove: true,
            mspec_used: 0, mpeaceful: false, mux: game.u.ux, muy: game.u.uy });
        game.level.monlist = monster; place_monster(monster, x, y, game);
        vision_recalc(0, { state: game });
        if (!planning) for (let i = 0; i < 20; i++) game.nhDisplay.pushKey(32);
        const state = planning ? planningState(game) : game;
        assert.equal(canspotmon(state.level.monlist, state), true);
        const ownDisplay = structuredClone(state.displayCtx);
        const liveDisplay = structuredClone(game.displayCtx);
        const core = structuredClone(game.coreCtx), context = structuredClone(game.context);
        const draws = [];
        const random = {
            rn2: bound => { draws.push(['rn2', bound]); return bound === 3 ? 1 : bound - 1; },
            rn1: (bound, base) => { draws.push(['rn1', bound, base]); return base; },
            rnd: bound => { draws.push(['rnd', bound]); return 1; },
            d: (n, size) => { draws.push(['d', n, size]); return n; },
            rne: () => 1, rnl: bound => bound - 1, rnz: value => value,
        };
        await runDirectMonsterAction(state.level.monlist, {
            state, planning, random,
            displayRandom: bound => rn2_on_display_rng(bound, state),
        });
        assert.deepEqual(draws, [['rn2', 5], ['rn2', 3], ['rn2', 30], ['d', 2, 6], ['d', 3, 6]]);
        assert.equal(state.level.monlist.mspec_used, 7);
        assert.equal(state.level.monlist.mhp, 8, 'C level1 cure-self heals 3d6');
        if (hallucinating) assert.notDeepEqual(state.displayCtx, ownDisplay);
        else assert.deepEqual(state.displayCtx, ownDisplay);
        if (planning) {
            assert.deepEqual(game.displayCtx, liveDisplay);
            assert.equal(monster.mhp, 5); assert.equal(monster.mspec_used, 0);
            assert.deepEqual(game.context, context);
        }
        assert.deepEqual(game.coreCtx, core);
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('directed spell name ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mcastu.c/spell-name-display-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
