import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { finishElapsedTurn } from '../js/allmain.js';
import { planningState } from '../js/unported_monster_actions.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_FOG_CLOUD, PM_VAMPIRE_LEADER } from '../js/monsters.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, ROOM, DOOR, D_CLOSED } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const door of [true, false]) for (const hallucinating of [true, false]) {
    test(`vampire upkeep relocation door=${door} Hallu=${hallucinating}`, async () => {
        const outcomes = [];
        for (const planning of [true, false]) {
            await runSegment({ seed: 8432197, datetime: '20261211120000',
                nethackrc: 'OPTIONS=name:DoorShapeOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
            game.level = new GameMap(); game.head_engr = null;
            for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y)
                game.level.at(x, y).typ = ROOM;
            game.u.ux = 5; game.u.uy = 7;
            for (const [property, active] of [[BLINDED, true], [HALLUC, hallucinating], [DETECT_MONSTERS, true]])
                game.u.uprops[property].intrinsic = active ? 1000 : 0;
            const location = game.level.at(7, 7);
            if (door) { location.typ = DOOR; location.flags = D_CLOSED; location.doormask = D_CLOSED; }
            const monster = newMonster({ data: game.mons[PM_FOG_CLOUD], mnum: PM_FOG_CLOUD,
                cham: PM_VAMPIRE_LEADER, m_id: 9700, mhp: 1, mhpmax: 30, m_lev: 3,
                mcansee: true, mcanmove: true, mux: 5, muy: 7 });
            game.level.monlist = monster; place_monster(monster, 7, 7, game);
            light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
            if (!planning) for (let i = 0; i < 20; ++i) game.nhDisplay.pushKey(32);
            const state = planning ? planningState(game) : game;
            const liveDisplay = structuredClone(game.displayCtx), ownDisplay = structuredClone(state.displayCtx);
            const liveMap = structuredClone(game.level.locations), core = structuredClone(game.coreCtx);
            const context = structuredClone(game.context), draws = [];
            const random = {
                rn2: bound => { draws.push(['rn2', bound]); return bound === 4 ? 1 : bound - 1; },
                rn1: (bound, base) => { draws.push(['rn1', bound, base]); return base; },
                rnd: bound => { draws.push(['rnd', bound]); return 1; },
                d: (n, size) => { draws.push(['d', n, size]); return n; },
                rne: () => 1, rnl: bound => bound - 1, rnz: value => value,
            };
            await finishElapsedTurn(state, random, { planning, randomMonsterOnly: true });
            const subject = state.level.monlist;
            assert.strictEqual(subject.data, state.mons[PM_VAMPIRE_LEADER]);
            assert.equal(Math.max(Math.abs(subject.mx - 7), Math.abs(subject.my - 7)), door ? 1 : 0);
            assert.strictEqual(state.level.monsters[subject.mx][subject.my], subject);
            outcomes.push({ draws, xy: [subject.mx, subject.my], hp: subject.mhp, max: subject.mhpmax, speed: subject.movement });
            if (hallucinating) assert.notDeepEqual(state.displayCtx, ownDisplay);
            else assert.deepEqual(state.displayCtx, ownDisplay);
            assert.deepEqual(game.coreCtx, core);
            if (planning) {
                assert.deepEqual(game.displayCtx, liveDisplay, 'planned relocation cannot redraw the live detection map');
                assert.deepEqual(game.level.locations, liveMap);
                assert.deepEqual(game.context, context);
                assert.strictEqual(monster.data, game.mons[PM_FOG_CLOUD]);
                assert.deepEqual([monster.mx, monster.my, monster.mhp], [7, 7, 1]);
            }
        }
        assert.deepEqual(outcomes[0], outcomes[1], 'planning and live use the same complete gameplay path');
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('vampire door display ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mon.c/vampire-door-display-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
