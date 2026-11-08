import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { mhurtle } from '../js/dothrow.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_ORC } from '../js/monsters.js';
import { ROOM } from '../js/const.js';
import { vision_recalc } from '../js/vision.js';

for (const range of [0, 1, 2]) {
    test(`monster knockback presentation range=${range}`, async () => {
        await runSegment({ seed: 8432192, datetime: '20261126120000',
            nethackrc: 'OPTIONS=name:KnockOwner,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.level.regions = []; game.level.traps = [];
        game.u.ux = 8; game.u.uy = 8;
        for (let x = 4; x <= 10; x++) for (let y = 7; y <= 9; y++) {
            const tile = game.level.at(x, y); tile.typ = ROOM; tile.lit = 1;
        }
        vision_recalc(0, { state: game });
        const monster = newMonster({ data: game.mons[PM_ORC], mnum: PM_ORC,
            m_id: 9200, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true,
            mpeaceful: false, movement: 12 });
        game.level.monlist = monster;
        place_monster(monster, 5, 8, game);
        let frames = 0;
        game._animationFrameHook = async () => { frames++; };
        const state = game;
        const moving = state.level.monlist;
        const core = structuredClone(game.coreCtx);
        await mhurtle(moving, 1, 0, range, { state, message: async () => {} });
        assert.deepEqual([moving.mx, moving.my], [5 + range, 8]);
        assert.equal(moving.movement, 0); assert.equal(moving.mstun, 1);
        assert.strictEqual(state.level.monsters[5 + range][8], moving);
        assert.equal(frames, range,
            'C emits one delay frame per actual successful movement cell');
        assert.deepEqual(game.coreCtx, core);
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('knockback animation ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/dothrow.c/knockback-animation-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
