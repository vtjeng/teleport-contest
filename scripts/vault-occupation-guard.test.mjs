import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runJsSession, compareSessionOutputs } from './diff-fresh.mjs';

for (const [name, file] of [
    ['unoccupied control', 'guard-unoccupied-control'],
    ['search interruption', 'guard-interrupts-search'],
]) {
    test(`vault guard ${name} matches C`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/vault.c/${file}.session.json`, import.meta.url), 'utf8'));
        const output = await runJsSession(recording, new URL('../', import.meta.url).pathname);
        assert.equal(compareSessionOutputs(recording, output).passed, true);
    });
}
