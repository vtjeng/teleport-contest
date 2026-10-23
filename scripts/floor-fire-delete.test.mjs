import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GameMap } from '../js/game.js';
import { ROOM, OBJ_FLOOR } from '../js/const.js';
import { SCR_IDENTIFY, SCROLL_CLASS } from '../js/objects.js';
import { newObject } from '../js/obj.js';
import { planningState } from '../js/unported_monster_actions.js';
import { burn_floor_objects } from '../js/zap_destroy_items.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const planning of [false, true]) {
    for (const partial of [false, true]) {
        for (const uCaused of [false, true]) {
            test(`floor fire deletion: planning=${planning}, partial=${partial}, hero=${uCaused}`, async () => {
                await runSegment({ seed: 8432180, datetime: '20261115120000',
                    nethackrc: 'OPTIONS=name:FloorDelete,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
                game.level = new GameMap();
                const x = 5, y = 7;
                game.level.at(x, y).typ = ROOM;
                const original = newObject({ otyp: SCR_IDENTIFY, oclass: SCROLL_CLASS,
                    quan: partial ? 2 : 1, where: OBJ_FLOOR, ox: x, oy: y });
                game.level.objects[x][y] = original;
                game.level.objlist = original;
                const state = planning ? planningState(game) : game;
                const object = state.level.objects[x][y];
                const script = [[100, 99], [3, 0]];
                if (partial) script.push([3, 1]);
                // useupf deletes the used split even for a partial hero burn;
                // non-hero partial destruction only changes quantity/weight.
                const deletesObject = !partial || uCaused;
                // A hero-used partial stack is split first; next_ident advances
                // the owned ID context through its source rnd(2).
                if (partial && uCaused) script.push(['rnd', 2, 1]);
                if (deletesObject) script.push([100, 37]);
                const redraws = [], ignited = [];
                const core = structuredClone(game.coreCtx);
                const count = await burn_floor_objects(x, y, false, uCaused, {
                    state, planning,
                    random: {
                        rn2: bound => {
                            const expected = script.shift();
                            assert.ok(expected, 'unexpected RNG draw');
                            assert.equal(bound, expected[0]);
                            return expected[1];
                        },
                        rnd: bound => {
                            const expected = script.shift();
                            assert.ok(expected, 'unexpected rnd');
                            assert.deepEqual(expected.slice(0, 2), ['rnd', bound]);
                            return expected[2];
                        },
                        rn1: () => assert.fail('unexpected rn1'),
                        rne: () => assert.fail('unexpected rne'),
                    },
                    igniteItems: async head => { ignited.push(head); },
                    redraw: (a, b) => { redraws.push([a, b]); },
                    message: async () => assert.fail('feedback is disabled'),
                });
                assert.equal(count, 1);
                assert.equal(script.length, 0, 'deletion protection follows the source owner');
                if (partial) {
                    assert.equal(state.level.objects[x][y], object);
                    assert.equal(state.level.objlist, object);
                    assert.equal(object.quan, 1);
                } else {
                    assert.equal(state.level.objects[x][y], null);
                    assert.equal(state.level.objlist, null);
                }
                assert.deepEqual(redraws, deletesObject ? [[x, y]] : []);
                assert.deepEqual(ignited, [partial ? object : null]);
                assert.deepEqual(game.coreCtx, core);
                if (planning) {
                    assert.equal(game.level.objects[x][y], original);
                    assert.equal(original.quan, partial ? 2 : 1);
                }
            });
        }
    }
}
for (const name of ['burn', 'monochrome', 'before-control']) {
    test('floor fire deletion ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/zap.c/floor-fire-delete-' + name + '.session.json', import.meta.url)));
            const r = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(r.passed, true, formatReport(r));
        } finally { removeScoringWorkspace(root); }
    });
}
