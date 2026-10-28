import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runJsSession, compareSessionOutputs } from './diff-fresh.mjs';

// C cmd.c accepts the named command, its explicit V binding, and its M-t key.
// The identical-config named command is the nearby control for both key paths.
for (const [name, file] of [
    ['named control', 'turn-named-control'],
    ['direct V binding', 'turn-direct-bound'],
    ['altmeta binding', 'turn-altmeta'],
]) {
    test(`#turn ${name} matches C`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/cmd.c/${file}.session.json`, import.meta.url), 'utf8'));
        const output = await runJsSession(recording, new URL('../', import.meta.url).pathname);
        assert.equal(compareSessionOutputs(recording, output).passed, true);
    });
}
