import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { domove } from '../js/hack.js';
import { newObject, place_object } from '../js/obj.js';
import { ROCK, CORPSE, FIRST_OBJECT, NUM_OBJECTS } from '../js/objects.js';
import { ROOM, BLINDED, HALLUC, OBJ_FREE, OBJ_FLOOR, DOMOVE_WALK } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { isaac64_next_uint64 } from '../js/isaac64.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const floorObject of [false, true]) for (const hallucinating of [false, true]) {
    test(`blind arrival redraw floor=${floorObject} Hallu=${hallucinating}`, async () => {
        // Complete startup before invoking the real movement entry point.
        await runSegment({ seed: 8432202, datetime: '20261218120000',
            nethackrc: 'OPTIONS=name:ArrivalNative,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips,!autopickup\n', moves: ' ' });
        game.level = new GameMap(); game.head_engr = null;
        for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
            game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
        }
        game.u.ux = 5; game.u.uy = 7;
        for (const [property, active] of [[BLINDED, true], [HALLUC, hallucinating]]) {
            game.u.uprops[property].intrinsic = active ? 1000 : 0;
            game.u.uprops[property].extrinsic = 0;
        }
        const rock = floorObject ? newObject({ otyp: ROCK,
            oclass: game.objects[ROCK].oc_class, material: game.objects[ROCK].oc_material,
            quan: 1, where: OBJ_FREE }) : null;
        if (rock) place_object(rock, 6, 7, { state: game });
        light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
        game.flags.pickup = false; game.context.nopick = true;
        game.context.run = 0; game.context.mv = 0; game.context.move = 1;
        game.domoveAttempting = DOMOVE_WALK; game.u.dx = 1; game.u.dy = 0;
        clearTtyMessageWindow(game); game._ttyToplines = '';
        const expectedDisplay = structuredClone(game.displayCtx);
        const core = structuredClone(game.coreCtx), hp = game.u.uhp;
        if (hallucinating && floorObject) {
            // C vision_recalc's blind tail redraws the new hero square once.
            // The fixed seed does not choose a corpse's second glyph draw.
            const type = FIRST_OBJECT + Number(isaac64_next_uint64(expectedDisplay)
                % BigInt(NUM_OBJECTS - FIRST_OBJECT));
            assert.notEqual(type, CORPSE);
        }
        await domove(game);
        assert.equal(game.u.umoved, true);
        assert.deepEqual([game.u.ux0, game.u.uy0, game.u.ux, game.u.uy], [5, 7, 6, 7]);
        assert.deepEqual(game.displayCtx, expectedDisplay);
        assert.deepEqual(game.coreCtx, core);
        assert.equal(game.u.uhp, hp);
        assert.equal(game.level.objects[6][7], rock);
        if (rock) assert.equal(rock.where, OBJ_FLOOR);
        assert.equal(game._ttyToplines, '');
    });
}
for (const name of ['normal', 'monochrome', 'before-control']) {
    test('arrival floor redraw ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/hack.c/arrival-floor-redraw-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
