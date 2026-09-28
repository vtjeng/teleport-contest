import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    ART_ORB_OF_DETECTION,
    artifact_exists,
} from '../js/artifacts.js';
import { doapply } from '../js/apply.js';
import { ECMD_TIME } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { CRYSTAL_BALL } from '../js/objects.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const selectedRecording = JSON.parse(readFileSync(new URL(
    '../challenges/cases/v10/apply-neutral-grimtooth-touches-artifact.session.json',
    import.meta.url,
), 'utf8'));
const independentRecording = JSON.parse(readFileSync(new URL(
    '../recordings/apply.c/doapply-retouch-accepted-object.session.json',
    import.meta.url,
), 'utf8'));

test('apply.c:doapply retouches a selected artifact before dispatch', async () => {
    // apply.c:4224-4235 reaches retouch_object() between getobj() and class
    // dispatch. This admitted independent Grimtooth recording exercises that
    // production path, including touch_artifact()'s alignment check.
    const js = await runJsSession(selectedRecording, process.cwd());
    const result = compareSessionOutputs(selectedRecording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('doapply continues after retouch_object accepts an object',
    async () => {
        // The independent C inventory screen assigns the wished-for dagger
        // to `n`, and the final "Sorry, I don't know how to use that." screen
        // shows that doapply passed retouch_object() into its default arm.
        // The selected v10 recording separately reaches the artifact refusal.
        const js = await runJsSession(independentRecording, process.cwd());
        const result = compareSessionOutputs(independentRecording, js);
        assert.equal(result.passed, true, JSON.stringify(result));
    });

test('doapply spends the turn when touch_artifact rejects a self-willed artifact',
    async () => {
        const setup = {
            seed: 39174628,
            datetime: '20411010130000',
            nethackrc: 'OPTIONS=name:OrbRetouch,role:Wizard,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,showexp,time,pettype:none\n',
            moves: ' \u0017crystal ball\n',
        };
        await runSegment(setup);

        let orb = null;
        for (let object = game.invent; object; object = object.nobj) {
            if (object.otyp === CRYSTAL_BALL) {
                orb = object;
                break;
            }
        }
        assert.ok(orb, 'wizard wish creates the ordinary crystal ball');

        // artilist.h:219-223 makes the Orb of Detection self-willed, lawful,
        // and Archeologist-only. A neutral Wizard fails both restrictions;
        // artifact.c:960-975 blasts and returns false, which doapply converts
        // to ECMD_TIME before its crystal-ball dispatch. Set the artifact id
        // on the wished object to exercise this doapply branch directly; C's
        // own artifact-creation preflight refuses this incompatible hero.
        artifact_exists(orb, 'The Orb of Detection', true, undefined, game);
        assert.equal(orb.oartifact, ART_ORB_OF_DETECTION);
        game.u.uhp = 200;
        game.u.uhpmax = 200;
        const hp = game.u.uhp;
        game.nhDisplay.pushKey(' '.charCodeAt(0));
        game.nhDisplay.pushKey(orb.invlet.charCodeAt(0));
        for (let i = 0; i < 8; ++i)
            game.nhDisplay.pushKey(' '.charCodeAt(0));
        assert.equal(await doapply(game), ECMD_TIME);
        assert.ok(game.u.uhp < hp, 'the refused touch applies the source blast');
    });
