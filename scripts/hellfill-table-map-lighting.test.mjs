import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runJsSession, compareSessionOutputs } from './diff-fresh.mjs';

// C sp_lev.c:lspo_map forwards the table's lit flag to painted cells.
// The adjacent-seed Gehennom load is the nearby matching control.
for (const [name, file] of [
    ['lit map target', 'table-map-lit-target'],
    ['adjacent-seed control', 'table-map-lit-control'],
]) {
    test(`hellfill ${name} matches C`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/hellfill.lua/${file}.session.json`, import.meta.url), 'utf8'));
        const output = await runJsSession(recording, new URL('../', import.meta.url).pathname);
        assert.equal(compareSessionOutputs(recording, output).passed, true);
    });
}
