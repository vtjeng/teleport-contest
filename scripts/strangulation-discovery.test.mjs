import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/polyself.c/strangulation-discovery-9701144.session.json',
    import.meta.url,
), 'utf8'));

test('strangulation resumed by polymorph identifies the worn amulet', async () => {
    const final = recording.segments[0].steps.at(-1);
    assert.match(final.screen,
        /an amulet of strangulation \(being worn\)/u);

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
