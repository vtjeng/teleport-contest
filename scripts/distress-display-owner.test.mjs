import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { finishElapsedTurn } from '../js/allmain.js';
import { planningState } from '../js/unported_monster_actions.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_CHAMELEON } from '../js/monsters.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, ROOM } from '../js/const.js';
import { vision_recalc } from '../js/vision.js';

for (const [planning, hallucinating, detected] of [
    [true, true, true], [true, false, true], [true, true, false], [false, true, true],
]) {
    test(`elapsed shape naming planning=${planning} hallucinating=${hallucinating} detected=${detected}`, async () => {
        await runSegment({ seed: 8432193, datetime: '20261203120000',
            nethackrc: 'OPTIONS=name:DistressOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null; game.level.regions = []; game.head_engr = null;
        for (const [property, active] of [[BLINDED, true], [HALLUC, hallucinating], [DETECT_MONSTERS, detected]])
            game.u.uprops[property].intrinsic = active ? 1000 : 0;
        const x = game.u.ux + 1, y = game.u.uy;
        game.level.at(x, y).typ = ROOM;
        const monster = newMonster({ data: game.mons[PM_CHAMELEON], mnum: PM_CHAMELEON,
            cham: PM_CHAMELEON, m_id: 9300, mhp: 20, mhpmax: 20, m_lev: 6,
            mcansee: true, mcanmove: true, mspec_used: 0 });
        game.level.monlist = monster; place_monster(monster, x, y, game);
        vision_recalc(0, { state: game });
        if (!planning) for (let i = 0; i < 20; i++) game.nhDisplay.pushKey(32);
        const state = planning ? planningState(game) : game;
        const liveDisplay = structuredClone(game.displayCtx);
        const ownDisplay = structuredClone(state.displayCtx);
        const core = structuredClone(game.coreCtx);
        const context = structuredClone(game.context);
        const draws = [];
        // Force C decide_to_shapeshift's 1/6 gate and select the first legal
        // fallback species; avoid random births so this tests the upkeep owner.
        const random = {
            rn2: bound => { draws.push(['rn2', bound]); return bound === 6 || bound === 10 ? 0 : bound - 1; },
            rn1: (bound, base) => { draws.push(['rn1', bound, base]); return base; },
            rnd: bound => { draws.push(['rnd', bound]); return 1; },
            d: (n, size) => { draws.push(['d', n, size]); return n; },
            rne: () => 1, rnl: bound => bound - 1, rnz: value => value,
        };
        await finishElapsedTurn(state, random, { planning, randomMonsterOnly: true });
        assert.deepEqual(draws, [
            ['rn2', 6], ['rn2', 10], ['rn2', 3], ['rn1', 330, 0],
            ['rn2', 10], ['d', 1, 8],
            ...(hallucinating ? [['rn2', 4], ['rn2', 4]] : []),
            ['rn2', 12], ['rn2', 70],
        ]);
        assert.notStrictEqual(state.level.monlist.data, state.mons[PM_CHAMELEON]);
        assert.equal(state.level.monlist.mspec_used, 3);
        if (hallucinating && detected)
            assert.notDeepEqual(state.displayCtx, ownDisplay, 'source names consume their own cosmetic stream');
        else
            assert.deepEqual(state.displayCtx, ownDisplay, 'unseen or non-hallucinated names draw no cosmetic RNG');
        if (planning) {
            assert.deepEqual(game.displayCtx, liveDisplay);
            assert.strictEqual(monster.data, game.mons[PM_CHAMELEON]);
            assert.equal(monster.mspec_used, 0);
            assert.deepEqual(game.context, context);
        }
        assert.deepEqual(game.coreCtx, core);
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('elapsed distress display ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/allmain.c/distress-display-owner-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
