import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/web-trap-escape-9701146.session.json',
    import.meta.url,
), 'utf8'));
const stingRecording = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/web-trap-sting-9701147.session.json',
    import.meta.url,
), 'utf8'));

test('walking repeatedly escapes a web trap in C source order', async () => {
    const steps = recording.segments[0].steps;
    assert.match(steps[10].screen, /You stumble into a spider web!/u);
    assert.match(steps[15].screen, /You disentangle yourself\./u);

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('wielded Sting cuts the hero free without a walking escape', async () => {
    assert.match(stingRecording.segments[0].steps.at(-1).screen,
        /Sting cuts through the web!/u);
    const js = await runJsSession(stingRecording, process.cwd());
    const result = compareSessionOutputs(stingRecording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
