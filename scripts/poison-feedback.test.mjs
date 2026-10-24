import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_WATER_MOCCASIN, PM_GREEN_DRAGON, PM_RAVEN } from '../js/monsters.js';
import { mhitm_really_poison } from '../js/uhitm.js';
import { planningState } from '../js/unported_monster_actions.js';
import { ROOM, HALLUC, DETECT_MONSTERS, BLINDED, SEE_INVIS } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { canseemon, canspotmon } from '../js/display.js';
import { rn2_on_display_rng } from '../js/rng.js';
for (const hallu of [false, true]) for (const visible of [false, true]) for (const resistant of [false, true]) {
    test(`poison feedback Hallu=${hallu} visible=${visible} resistant=${resistant}`, async () => {
        await runSegment({ seed: 8432206, datetime: '20261221120000',
            nethackrc: 'OPTIONS=name:PoisonFeedback,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: ' ' });
        game.level = new GameMap(); game.head_engr = null;
        for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
            game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
        }
        game.u.ux = 5; game.u.uy = 7;
        for (const [property, active] of [[HALLUC, hallu], [DETECT_MONSTERS, true], [BLINDED, false], [SEE_INVIS, false]]) {
            game.u.uprops[property].intrinsic = active ? 1000 : 0;
            game.u.uprops[property].extrinsic = 0;
        }
        const type = resistant ? PM_GREEN_DRAGON : PM_RAVEN;
        const attacker = newMonster({ data: game.mons[PM_WATER_MOCCASIN], mnum: PM_WATER_MOCCASIN,
            m_id: 9915, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true });
        const defender = newMonster({ data: game.mons[type], mnum: type,
            m_id: 9916, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true, minvis: true });
        attacker.nmon = defender; game.level.monlist = attacker;
        place_monster(attacker, 6, 7, game); place_monster(defender, 7, 7, game);
        light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
        game.gv.vis = visible;
        const observations = [];
        for (const planning of [true, false]) {
            const state = planning ? planningState(game) : game;
            const agr = state.level.monlist, def = agr.nmon;
            assert.equal(canseemon(def, state), false); assert.equal(canspotmon(def, state), true);
            const lines = [], draws = [], cosmetic = [], mhm = { damage: 2 };
            const core = structuredClone(game.coreCtx), live = structuredClone(game.displayCtx);
            const context = structuredClone(game.context);
            await mhitm_really_poison(agr, agr.data.mattk.find(a => a.adtyp === 7), def, mhm, state, {
                planning,
                random: { rn1: (n, base) => { draws.push([n, base]); return base; } },
                ...(planning ? { displayRandom: n => { cosmetic.push(n); return rn2_on_display_rng(n, state); } } : {}),
                canSeeMonster: monster => canseemon(monster, state),
                message: async line => lines.push(line),
            });
            assert.equal(mhm.damage, resistant ? 2 : 8);
            assert.deepEqual(draws, resistant ? [] : [[10, 6]]);
            assert.equal(lines.length, visible ? (resistant ? 2 : 1) : 0);
            if (visible && resistant) {
                assert.doesNotMatch(lines[1], /affect it\./);
                if (!hallu) assert.equal(lines[1], "The poison doesn't seem to affect the invisible green dragon.");
            }
            assert.deepEqual(game.coreCtx, core); assert.deepEqual(game.context, context);
            assert.equal(agr.mhp, 20); assert.equal(def.mhp, 20);
            if (planning) assert.deepEqual(game.displayCtx, live);
            if (hallu && visible) assert.notDeepEqual(state.displayCtx, live);
            else assert.deepEqual(state.displayCtx, live);
            observations.push({ lines, display: structuredClone(state.displayCtx) });
        }
        assert.deepEqual(observations[0], observations[1]);
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('poison feedback ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/uhitm.c/poison-feedback-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
