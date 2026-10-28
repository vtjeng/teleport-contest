import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runJsSession, compareSessionOutputs } from './diff-fresh.mjs';

for (const [name, file] of [
    ['More control', 'vrock-gas-more-control'],
    ['Call prompt', 'vrock-gas-call-prompt'],
]) {
    test(`Vrock gas ${name} matches C`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/getline.c/${file}.session.json`, import.meta.url), 'utf8'));
        const output = await runJsSession(recording, new URL('../', import.meta.url).pathname);
        assert.equal(compareSessionOutputs(recording, output).passed, true);
    });
}
