import { readFileSync } from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { planningState } from '../js/unported_monster_actions.js';
import { newMonster, place_monster } from '../js/monst.js';
import { vamprises } from '../js/mon.js';
import { PM_VAMPIRE_BAT, PM_VAMPIRE_LEADER, NUMMONS } from '../js/monsters.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, ROOM, NON_PM } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { rn2_on_display_rng } from '../js/rng.js';

for (const hallu of [false, true]) for (const shifted of [false, true]) {
    test(`vampire revival redraw Hallu=${hallu} shifted=${shifted}`, async () => {
        const outcomes = [];
        for (const planning of [true, false]) {
            await runSegment({ seed: 8432212, datetime: '20270110120000',
                nethackrc: 'OPTIONS=name:VampRevival,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
            game.level = new GameMap(); game.head_engr = null;
            for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y)
                game.level.at(x, y).typ = ROOM;
            game.u.ux = 5; game.u.uy = 7; game.context.mon_moving = true;
            for (const [p, active] of [[BLINDED, true], [HALLUC, hallu], [DETECT_MONSTERS, true]]) {
                game.u.uprops[p].intrinsic = active ? 1000 : 0;
                game.u.uprops[p].extrinsic = 0;
            }
            const mnum = shifted ? PM_VAMPIRE_BAT : PM_VAMPIRE_LEADER;
            const mon = newMonster({ data: game.mons[mnum], mnum,
                cham: PM_VAMPIRE_LEADER, m_id: 9920, mhp: 1, mhpmax: 30,
                m_lev: 3, mcansee: true, mcanmove: true, mux: 5, muy: 7 });
            game.level.monlist = mon; place_monster(mon, 7, 7, game);
            light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
            mon.mhp = 0; // mondead's C entry condition, with the dying form still indexed.
            const state = planning ? planningState(game) : game, subject = state.level.monlist;
            const core = structuredClone(game.coreCtx), display = structuredClone(game.displayCtx);
            const ownDisplay = structuredClone(state.displayCtx), map = structuredClone(game.level.locations);
            const draws = [], cosmetic = [], lines = [];
            const random = { rn2: n => { draws.push(['rn2', n]); return n - 1; },
                rnd: n => { draws.push(['rnd', n]); return n; },
                rn1: (n, b) => { draws.push(['rn1', n, b]); return b; },
                d: (n, s) => { draws.push(['d', n, s]); return n * s; },
                rne: () => 1, rnl: n => n - 1, rnz: n => n };
            const result = await vamprises(subject, state, { state, planning, random,
                displayRandom: n => { cosmetic.push(n); rn2_on_display_rng(n, state); return 0; },
                message: async line => lines.push(line) });
            assert.equal(result, shifted);
            assert.deepEqual(game.coreCtx, core);
            if (planning) {
                assert.deepEqual(game.displayCtx, display, 'cloned revival cannot paint the live detection map');
                assert.deepEqual(game.level.locations, map);
                assert.equal(mon.mhp, 0);
                assert.equal(mon.data, game.mons[mnum]);
            }
            if (shifted) {
                assert.equal(subject.data, state.mons[PM_VAMPIRE_LEADER]);
                assert.equal(subject.cham, NON_PM);
                assert.equal(subject.mhp, subject.mhpmax);
                assert.ok(subject.mhp > 0);
                assert.equal(lines.length, 1);
                assert.equal(lines[0], hallu
                    ? 'The seemingly dead giant ant suddenly transforms and rises as a giant ant!'
                    : 'The seemingly dead vampire bat suddenly transforms and rises as a vampire lord!');
                assert.deepEqual(cosmetic, hallu ? [430, 2, 430, 2, 430, 2] : []);
                const expected = { displayCtx: ownDisplay };
                for (const n of cosmetic) rn2_on_display_rng(n, expected);
                if (!planning && hallu) for (let i = 0; i < 2; ++i) rn2_on_display_rng(NUMMONS, expected);
                assert.deepEqual(state.displayCtx, expected.displayCtx, 'live newcham and revival each redraw once');
            } else {
                assert.equal(subject.cham, PM_VAMPIRE_LEADER);
                assert.equal(subject.mhp, 0);
                assert.deepEqual(lines, []); assert.deepEqual(draws, []); assert.deepEqual(cosmetic, []);
                assert.deepEqual(state.displayCtx, ownDisplay);
            }
            assert.equal(state.level.monsters[7][7], subject);
            assert.deepEqual([subject.mx, subject.my], [7, 7]);
            assert.equal(state.svm.mvitals[PM_VAMPIRE_LEADER].died, 0);
            outcomes.push({ draws, cosmetic, lines, hp: subject.mhp, max: subject.mhpmax, cham: subject.cham });
        }
        assert.deepEqual(outcomes[0], outcomes[1], 'planning and live preserve the same revival gameplay and naming');
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test(`vampire revival redraw ${name} matches public C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(readFileSync(new URL(
                '../recordings/mon.c/vampire-revival-redraw-' + name + '.session.json', import.meta.url)));
            if (name !== 'before-control') assert.ok(c.segments[0].steps.some(step => step.screen.includes('rises as')));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
