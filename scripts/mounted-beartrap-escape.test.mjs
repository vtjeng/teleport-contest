import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/mounted-beartrap-escape-52093322.session.json',
    import.meta.url,
), 'utf8'));

test('mounted pony trapped by a bear trap tries to escape on the next step', async () => {
    const steps = recording.segments[0].steps;
    assert.equal(steps[28].key, 'j');
    assert.match(steps[28].screen, /Your pony is caught in a bear trap\./u);
    assert.match(steps.at(-1).screen, /Your pony finally lurches free\./u);
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
