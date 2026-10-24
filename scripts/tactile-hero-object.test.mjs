import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GameMap } from '../js/game.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, LEVITATION, ROOM } from '../js/const.js';
import { ROCK, CORPSE, FIRST_OBJECT, NUM_OBJECTS } from '../js/objects.js';
import { isaac64_init, isaac64_next_uint64 } from '../js/isaac64.js';
import { newObject, place_object } from '../js/obj.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals, cansee } from '../js/vision.js';
import { newsym, objnum_to_glyph } from '../js/display.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const hallucinating of [true, false]) for (const detection of [true, false])
    for (const levitating of [true, false]) {
        test(`tactile hero map Hallu=${hallucinating} Detect=${detection} Levitation=${levitating}`, async () => {
            await runSegment({ seed: 8432196, datetime: '20261207120000',
                nethackrc: 'OPTIONS=name:TactileOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
            game.level = new GameMap();
            for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y)
                game.level.at(x, y).typ = ROOM;
            game.u.ux = 5; game.u.uy = 7;
            for (const [property, active] of [[BLINDED, true], [HALLUC, hallucinating], [DETECT_MONSTERS, detection], [LEVITATION, levitating]])
                game.u.uprops[property].intrinsic = active ? 1000 : 0;
            light_globals_init(game); init_vision_globals();
            vision_reset(game); vision_recalc(0);
            assert.equal(cansee(5, 7), false);
            const rock = newObject({ otyp: ROCK, oclass: game.objects[ROCK].oc_class, quan: 1 });
            place_object(rock, 5, 7, { state: game });
            game.level.flags.hero_memory = true;
            game.level.at(5, 7).seenv = 0;
            game.displayCtx = isaac64_init(new Uint8Array([71, 13, 0, 0, 0, 0, 0, 0]));
            const expectedDisplay = structuredClone(game.displayCtx);
            const core = structuredClone(game.coreCtx);
            // C feel_location maps one floor object only when grounded;
            // random_obj_to_glyph draws once unless that random type is CORPSE.
            // display_self does not randomize the hero's own identity.
            let rememberedType = ROCK;
            if (hallucinating && !levitating) {
                rememberedType = FIRST_OBJECT + Number(isaac64_next_uint64(expectedDisplay)
                    % BigInt(NUM_OBJECTS - FIRST_OBJECT));
                assert.notEqual(rememberedType, CORPSE, 'fixture avoids the extra corpse-body draw');
            }
            newsym(5, 7);
            assert.deepEqual(game.displayCtx, expectedDisplay, 'one grounded object draw, no pre-mapping draw');
            assert.equal(game.level.at(5, 7).disp_ch, '@');
            assert.ok(game.level.at(5, 7).seenv, 'the tactile owner updates seen-vector memory');
            if (!levitating)
                assert.equal(game.level.at(5, 7).remembered_glyph.glyph, objnum_to_glyph(rememberedType, game));
            assert.deepEqual(game.coreCtx, core);
            assert.equal(game.level.objects[5][7], rock);
            assert.equal(rock.quan, 1);
        });
    }

for (const name of ['normal', 'monochrome', 'no-detection-control']) {
    test('tactile hero floor object ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/display.c/tactile-hero-object-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
