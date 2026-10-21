import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const solid = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/underwater-force-fight-solid-9701170.session.json',
    import.meta.url,
), 'utf8'));
const floor = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/underwater-force-fight-floor-9701170.session.json',
    import.meta.url,
), 'utf8'));

test('underwater force-fight names nothing beyond a solid square', async () => {
    assert.match(solid.segments[0].steps.at(-1).screen,
        /You harmlessly attack nothing\./u);
    const js = await runJsSession(solid, process.cwd());
    const result = compareSessionOutputs(solid, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('underwater force-fight at ordinary floor has no harmlessly adverb', async () => {
    assert.match(floor.segments[0].steps.at(-1).screen,
        /You attack nothing\./u);
    const js = await runJsSession(floor, process.cwd());
    const result = compareSessionOutputs(floor, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
