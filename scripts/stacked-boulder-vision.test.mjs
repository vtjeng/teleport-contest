import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { place_object, newObject } from '../js/obj.js';
import { BOULDER, ROCK } from '../js/objects.js';
import { ROOM, OBJ_FREE, OBJ_FLOOR } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { block_point, vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const pileType of [null, ROCK, BOULDER]) {
    test('boulder floor vision guard over ' + pileType, async () => {
        await runSegment({ seed: 8432201, datetime: '20261217120000',
            nethackrc: 'OPTIONS=name:BoulderGuard,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
        game.level = new GameMap(); game.head_engr = null;
        for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
            game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
        }
        game.u.ux = 5; game.u.uy = 7;
        light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
        const make = type => newObject({ otyp: type, oclass: game.objects[type].oc_class,
            material: game.objects[type].oc_material, quan: 1, where: OBJ_FREE });
        const env = { state: game, hooks: { blockPoint: (x, y, owner) => block_point(x, y, owner.state) } };
        const old = pileType === null ? null : make(pileType);
        if (old) place_object(old, 8, 7, env);
        vision_recalc(0);
        const core = structuredClone(game.coreCtx), display = structuredClone(game.displayCtx);
        const next = make(BOULDER), calls = [];
        place_object(next, 8, 7, { state: game, hooks: {
            blockPoint: (x, y, owner) => { calls.push([x, y]); block_point(x, y, owner.state); },
        } });
        assert.deepEqual(calls, pileType === BOULDER ? [] : [[8, 7]]);
        assert.equal(game.vision_full_recalc, pileType === BOULDER ? 0 : 1);
        assert.equal(game.level.objects[8][7], next);
        assert.equal(game.level.objlist, next);
        assert.equal(next.nexthere, old);
        assert.equal(next.nobj, old);
        assert.equal(next.where, OBJ_FLOOR);
        assert.equal(next.ox, 8); assert.equal(next.oy, 7);
        assert.deepEqual(game.coreCtx, core);
        assert.deepEqual(game.displayCtx, display);
        if (pileType === BOULDER) {
            const third = make(BOULDER);
            // C skips block_point entirely for this arm; no hook is required.
            place_object(third, 8, 7, { state: game });
            assert.equal(game.level.objects[8][7], third);
            assert.equal(third.nexthere, next);
            assert.equal(third.nobj, next);
            assert.equal(game.vision_full_recalc, 0);
        }
    });
}
for (const name of ['normal', 'monochrome', 'before-control']) {
    test('stacked boulder vision ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mkobj.c/stacked-boulder-vision-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
