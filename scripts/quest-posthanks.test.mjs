import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

for (const [name, path] of [
    ['repeat audience after returning the artifact',
        '../recordings/quest.c/leader-posthanks-repeat.session.json'],
    ['first audience and artifact return control',
        '../recordings/quest.c/finish-quest-chat-wizard-neferet-cfirst-20261011.session.json'],
]) {
    test(`quest leader ${name} matches the C recording`, async () => {
        const recording = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
        const output = await runJsSession(recording, new URL('..', import.meta.url).pathname);
        const comparison = compareSessionOutputs(recording, output);
        assert.equal(output.error, null);
        assert.equal(comparison.passed, true, JSON.stringify(comparison));
    });
}
