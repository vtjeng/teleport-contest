import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

for (const [name, file] of [
    ['visible monster disappears behind the rising bridge',
        '../recordings/dbridge.c/portcullis-visible-monster.session.json'],
    ['empty bridge closes without a monster message',
        '../recordings/dbridge.c/portcullis-empty-control.session.json'],
]) {
    test(`dbridge.c do_entity(): ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
        const output = await runJsSession(recording, new URL('..', import.meta.url).pathname);
        const comparison = compareSessionOutputs(recording, output);
        assert.equal(output.error, null);
        assert.equal(comparison.passed, true, JSON.stringify(comparison));
    });
}
