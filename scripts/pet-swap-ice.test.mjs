import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/pet-swap-ice-52093325.session.json',
    import.meta.url,
), 'utf8'));

test('a Knight displaces its pony from wished ice', async () => {
    const steps = recording.segments[0].steps;
    assert.match(steps[7].screen, /Solid ice\./u);
    assert.equal(steps.at(-1).key, 'l');
    assert.match(steps.at(-1).screen,
        /You swap places with your saddled pony\./u);
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
