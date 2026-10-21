import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MAGIC_PORTAL } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/teleport.c/hero-magic-portal-73903221.session.json',
    import.meta.url,
), 'utf8'));
const southRecording = JSON.parse(readFileSync(new URL(
    '../recordings/teleport.c/hero-magic-portal-south-73903279.session.json',
    import.meta.url,
), 'utf8'));

test('a real quest portal is west of the hero before entry', async () => {
    const segment = recording.segments[0];
    await runSegment({ ...segment, moves: segment.moves.slice(0, -3) });
    const portal = game.level.traps.find(trap =>
        trap.ttyp === MAGIC_PORTAL && trap.tx === game.u.ux - 1
        && trap.ty === game.u.uy);
    assert.ok(portal);
    assert.equal(portal.dst.dnum, 3);
});

test('entering a quest portal follows C through the destination arrival', async () => {
    const segment = recording.segments[0];
    assert.equal(segment.steps.at(-3).key, 'h');
    assert.match(segment.steps.at(-3).screen, /You activated a magic portal!/u);
    assert.match(segment.steps.at(-1).screen, /Wizard the Evoker/u);
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('southward quest-portal entry matches an independent C recording', async () => {
    const segment = southRecording.segments[0];
    assert.equal(segment.steps.at(-3).key, 'j');
    assert.match(segment.steps.at(-3).screen, /You activated a magic portal!/u);
    const js = await runJsSession(southRecording, process.cwd());
    const result = compareSessionOutputs(southRecording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
