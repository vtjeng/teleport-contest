import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { finishElapsedTurn } from '../js/allmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_FOG_CLOUD, PM_VAMPIRE_LEADER } from '../js/monsters.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, ROOM, DOOR, D_CLOSED } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const door of [true, false]) for (const hallucinating of [true, false]) {
    test(`vampire upkeep relocation door=${door} Hallu=${hallucinating}`, async () => {
        await runSegment({ seed: 8432197, datetime: '20261211120000',
            nethackrc: 'OPTIONS=name:DoorShapeOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
        game.level = new GameMap(); game.head_engr = null;
        for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y)
            game.level.at(x, y).typ = ROOM;
        game.u.ux = 5; game.u.uy = 7;
        for (const [property, active] of [[BLINDED, true], [HALLUC, hallucinating], [DETECT_MONSTERS, true]])
            game.u.uprops[property].intrinsic = active ? 1000 : 0;
        const location = game.level.at(7, 7);
        if (door) { location.typ = DOOR; location.flags = D_CLOSED; }
        const monster = newMonster({ data: game.mons[PM_FOG_CLOUD], mnum: PM_FOG_CLOUD,
            cham: PM_VAMPIRE_LEADER, m_id: 9700, mhp: 1, mhpmax: 30, m_lev: 3,
            mcansee: true, mcanmove: true, mux: 5, muy: 7 });
        game.level.monlist = monster; place_monster(monster, 7, 7, game);
        light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
        for (let i = 0; i < 20; ++i) game.nhDisplay.pushKey(32);
        const state = game;
        const ownDisplay = structuredClone(state.displayCtx);
        const core = structuredClone(game.coreCtx);
        const draws = [];
        const random = {
            rn2: bound => { draws.push(['rn2', bound]); return bound === 4 ? 1 : bound - 1; },
            rn1: (bound, base) => { draws.push(['rn1', bound, base]); return base; },
            rnd: bound => { draws.push(['rnd', bound]); return 1; },
            d: (n, size) => { draws.push(['d', n, size]); return n; },
            rne: () => 1, rnl: bound => bound - 1, rnz: value => value,
        };
        await finishElapsedTurn(state, random);
        const subject = state.level.monlist;
        assert.strictEqual(subject.data, state.mons[PM_VAMPIRE_LEADER]);
        assert.equal(Math.max(Math.abs(subject.mx - 7), Math.abs(subject.my - 7)), door ? 1 : 0);
        assert.strictEqual(state.level.monsters[subject.mx][subject.my], subject);
        if (hallucinating) assert.notDeepEqual(state.displayCtx, ownDisplay);
        else assert.deepEqual(state.displayCtx, ownDisplay);
        assert.deepEqual(game.coreCtx, core);
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
