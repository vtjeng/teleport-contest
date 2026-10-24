import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_HUMAN, PM_ACID_BLOB } from '../js/monsters.js';
import { mattackm } from '../js/mhitm.js';
import { planningState, wieldMonsterItemAgainstMonster } from '../js/unported_monster_actions.js';
import { ROOM, HALLUC, DETECT_MONSTERS, BLINDED, SEE_INVIS } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { canseemon } from '../js/display.js';
import { rn2_on_display_rng } from '../js/rng.js';

for (const hallu of [false, true]) for (const detected of [false, true]) {
    test(`passive acid feedback Hallu=${hallu} Detect=${detected}`, async () => {
        await runSegment({ seed: 8432205, datetime: '20261220120000',
            nethackrc: 'OPTIONS=name:AcidFeedback,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: ' ' });
        game.level = new GameMap(); game.head_engr = null;
        for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
            game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
        }
        game.u.ux = 5; game.u.uy = 7;
        for (const [property, active] of [[HALLUC, hallu], [DETECT_MONSTERS, detected], [BLINDED, false], [SEE_INVIS, false]]) {
            game.u.uprops[property].intrinsic = active ? 1000 : 0;
            game.u.uprops[property].extrinsic = 0;
        }
        const attacker = newMonster({ data: game.mons[PM_HUMAN], mnum: PM_HUMAN,
            m_id: 9913, m_lev: 1, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true });
        const defender = newMonster({ data: game.mons[PM_ACID_BLOB], mnum: PM_ACID_BLOB,
            m_id: 9914, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true, minvis: true });
        attacker.nmon = defender; game.level.monlist = attacker;
        place_monster(attacker, 6, 7, game); place_monster(defender, 7, 7, game);
        game.gb.bhitpos = { x: 7, y: 7 };
        light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
        const observations = [];
        for (const planning of [true, false]) {
            const state = planning ? planningState(game) : game;
            const agr = state.level.monlist, def = agr.nmon;
            const draws = [], lines = [], cosmetic = [];
            const core = structuredClone(game.coreCtx), live = structuredClone(game.displayCtx);
            const context = structuredClone(game.context);
            const result = await mattackm(agr, def, {
                state, planning,
                random: {
                    rnd: n => { draws.push(['rnd', n]); return 1; },
                    d: (n, sides) => { draws.push(['d', n, sides]); return n; },
                    rn2: n => { draws.push(['rn2', n]); return n === 2 ? 0 : 1; },
                },
                // Conflict planning supplies its clone owner; live Conflict uses
                // the canonical display fallback, with no displayRandom field.
                ...(planning ? { displayRandom: n => { cosmetic.push(n); return rn2_on_display_rng(n, state); } } : {}),
                canSeeMonster: monster => canseemon(monster, state),
                message: async line => lines.push(line),
                wieldMonsterItemAgainstMonster,
                unsupported: reason => { throw new Error(reason); },
            });
            assert.equal(result, 1);
            assert.deepEqual(draws, [['rnd', 20], ['d', 1, 6], ['rn2', 3], ['rn2', 6],
                ['d', 1, 8], ['rn2', 2], ['rn2', 30], ['rn2', 6]]);
            assert.equal(agr.mhp, 19); assert.equal(def.mhp, 19);
            assert.deepEqual(game.coreCtx, core); assert.deepEqual(game.context, context);
            if (!hallu) assert.equal(lines[1], detected
                ? "The human is splashed by the invisible acid blob's acid!"
                : 'The human is splashed by its acid!');
            assert.match(lines[1], /is splashed by /);
            if (planning) {
                assert.equal(attacker.mhp, 20); assert.equal(defender.mhp, 20);
                assert.deepEqual(game.displayCtx, live);
                assert.deepEqual(cosmetic, hallu
                    ? (detected ? [430, 2, 430, 430, 2, 430, 2, 430, 2, 41] : [430, 2, 430, 2, 41]) : []);
            }
            if (hallu) assert.notDeepEqual(state.displayCtx, live);
            else assert.deepEqual(state.displayCtx, live);
            observations.push({ lines, display: structuredClone(state.displayCtx) });
        }
        assert.deepEqual(observations[0], observations[1]);
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('passive acid feedback ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mhitm.c/passive-acid-feedback-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
