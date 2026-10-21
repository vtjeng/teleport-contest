import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/trap.c/hero-iron-shoes-bear-73904571.session.json',
    import.meta.url,
), 'utf8'));

test('worn iron shoes protect the hero at a real bear trap entry', async () => {
    const steps = recording.segments[0].steps;
    assert.equal(steps.at(-2).key, 'j');
    assert.match(steps.at(-2).screen, /bear trap closes on your foot!/u);
    assert.match(steps.at(-1).screen, /pair of hard shoes protects your leg/u);

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
