import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runJsSession, compareSessionOutputs } from './diff-fresh.mjs';

for (const [name, file] of [
    ['explicit prayer control', 'explicit-declined-prayer'],
    ['repeated declined prayer', 'repeat-declined-prayer'],
]) {
    test(`${name} matches C`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/cmd.c/${file}.session.json`, import.meta.url), 'utf8'));
        const output = await runJsSession(recording, new URL('../', import.meta.url).pathname);
        assert.equal(compareSessionOutputs(recording, output).passed, true);
    });
}
