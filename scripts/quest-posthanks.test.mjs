import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

for (const [name, path] of [
    ['repeat audience after returning the artifact',
        '../recordings/quest.c/leader-posthanks-repeat.session.json'],
    ['first audience and artifact return control',
        '../recordings/quest.c/finish-quest-chat-wizard-neferet-cfirst-20261011.session.json'],
    ['repeat audience before quest assignment',
        '../recordings/quest.c/leader-next-repeat.session.json'],
    ['first audience before quest assignment control',
        '../recordings/quest.c/leader-next-first-audience-control.session.json'],
    ['encouragement after quest assignment',
        '../recordings/quest.c/leader-encourage-repeat.session.json'],
    ['first assignment before encouragement control',
        '../recordings/quest.c/leader-encourage-first-assignment-control.session.json'],
]) {
    test(`quest leader ${name} matches the C recording`, async () => {
        const recording = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
        const output = await runJsSession(recording, new URL('..', import.meta.url).pathname);
        const comparison = compareSessionOutputs(recording, output);
        assert.equal(output.error, null);
        assert.equal(comparison.passed, true, JSON.stringify(comparison));
    });
}
