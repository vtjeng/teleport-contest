import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

async function assertSessionMatches(path) {
    const recording = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
}

for (const [name, path] of [
    [
        'selected v10 normal outcome',
        '../challenges/cases/v10/flip-coin-normal-outcome.session.json',
    ],
    [
        'independent normal outcome',
        '../recordings/apply.c/flip-coin-normal-independent-c36.session.json',
    ],
    [
        'independent GLIB split and drop',
        '../recordings/apply.c/flip-coin-glib-drop-independent-c36.session.json',
    ],
    [
        'independent blinded Hallucination outcome',
        '../recordings/apply.c/flip-coin-hallucination-blinded-independent-c36.session.json',
    ],
]) {
    test(`apply.c flip_coin matches ${name}`, async () => {
        await assertSessionMatches(path);
    });
}
