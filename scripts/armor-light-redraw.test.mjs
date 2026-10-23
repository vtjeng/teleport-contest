import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GameMap } from '../js/game.js';
import { ROOM, OBJ_MINVENT } from '../js/const.js';
import { PM_HUMAN } from '../js/monsters.js';
import { GOLD_DRAGON_SCALE_MAIL } from '../js/objects.js';
import { newMonster, place_monster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { m_dowear } from '../js/worn.js';
import { planningState } from '../js/unported_monster_actions.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

async function darkRoom() {
    await runSegment({ seed: 8432170, datetime: '20261113120000',
        nethackrc: 'OPTIONS=name:LightOwner,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
    game.level = new GameMap();
    for (let x = 2; x <= 20; ++x)
        for (let y = 2; y <= 15; ++y) game.level.at(x, y).typ = ROOM;
    game.u.ux = 5; game.u.uy = 7;
    light_globals_init(game); init_vision_globals();
    vision_reset(game); vision_recalc(0);
    const monster = newMonster({ data: game.mons[PM_HUMAN], mnum: PM_HUMAN,
        m_id: 7010, mx: 7, my: 7, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true });
    place_monster(monster, 7, 7, game); game.level.monlist = monster;
    const armor = newObject({ otyp: GOLD_DRAGON_SCALE_MAIL,
        oclass: game.objects[GOLD_DRAGON_SCALE_MAIL].oc_class,
        quan: 1, where: OBJ_MINVENT, ocarry: monster });
    monster.minvent = armor;
}
for (const creation of [true, false]) {
    for (const planning of [false, true]) {
        for (const explicit of [false, true]) {
            test(`monster armor light redraw: creation=${creation}, planning=${planning}, explicit=${explicit}`, async () => {
                await darkRoom();
                const liveLocations = structuredClone(game.level.locations);
                const coreBefore = structuredClone(game.coreCtx);
                const state = planning ? planningState(game) : game;
                const monster = state.level.monlist;
                const target = state.level.at(9, 7);
                assert.notEqual(target.disp_ch, '.');
                const calls = [];
                const env = { state, planning, message: async () => {} };
                if (explicit) env.redraw = (x, y) => { calls.push([x, y]); };
                await m_dowear(monster, creation, env);
                assert.equal(monster.minvent.lamplit, true);
                assert.notEqual(target.seenv, 0, 'armor light reveals the floor');
                if (!planning && !explicit) {
                    assert.equal(target.disp_ch, '.', 'live default redraw records the floor glyph');
                } else {
                    assert.notEqual(target.disp_ch, '.', 'the supplied or non-global owner controls painting');
                }
                if (explicit) assert.ok(calls.some(([x, y]) => x === 9 && y === 7));
                if (planning) {
                    assert.deepEqual(game.level.locations, liveLocations);
                    assert.equal(game.gl.light_base, null);
                }
                assert.deepEqual(game.coreCtx, coreBefore);
            });
        }
    }
}
for (const name of ['light', 'monochrome', 'before-control']) {
    test('monster armor light ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/worn.c/armor-light-redraw-' + name + '.session.json', import.meta.url)));
            const r = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(r.passed, true, formatReport(r));
        } finally { removeScoringWorkspace(root); }
    });
}
