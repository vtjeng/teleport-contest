import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

for (const [name, file] of [
    ['sleeping owlbear releases the hero before the next action',
        '../recordings/potion.c/sleeping-holder-potion-release.session.json'],
    ['sleeping potion without a holder does not draw a release cooldown',
        '../recordings/potion.c/sleeping-potion-no-holder-control.session.json'],
]) {
    test(`potion.c potionhit(): ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
        const output = await runJsSession(recording, new URL('..', import.meta.url).pathname);
        const comparison = compareSessionOutputs(recording, output);
        assert.equal(output.error, null);
        assert.equal(comparison.passed, true, JSON.stringify(comparison));
    });
}
