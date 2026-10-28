// Evidence-only candidate regression: intentionally red until queued pray is wired.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runSegment } from '../../../../js/jsmain.js';
import { runJsSession, compareSessionOutputs } from '../../../../scripts/diff-fresh.mjs';
const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
test('explicit declined prayer control matches recorded C', async () => {
    const recording = read('control.recording.json');
    const root = fileURLToPath(new URL('../../../../', import.meta.url));
    assert.equal(compareSessionOutputs(recording, await runJsSession(recording, root)).passed, true);
});
test('Ctrl-A repeats a declined prayer and asks again', async () => {
    const recording = read('witness.recording.json');
    assert.match(recording.segments[0].steps[8].screen, /^Are you sure you want to pray\?/u);
    const boundaries = [];
    const replay = await runSegment({ ...recording.segments[0], storage: {} }, {
        onBoundary: error => boundaries.push({ name: error.name, key: error.key }),
    });
    assert.deepEqual(boundaries, [], 'queued pray must reach dopray, not a fail-closed refusal');
    assert.equal(replay.getScreens().length, 10);
});
