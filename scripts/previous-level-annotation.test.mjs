import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const cases = [
    ['trial-previous-level-annotation', 'What do you want to call level 1?'],
    ['trial-current-level-annotation-control', null],
    ['trial-first-level-annotation-control', null],
];

for (const [name, prompt] of cases) {
    test(`selected-level annotation matches C: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/dungeon.c/${name}.session.json`, import.meta.url),
            'utf8',
        ));
        const replay = await runJsSession(recording, process.cwd());
        const result = compareSessionOutputs(recording, replay);
        assert.equal(result.passed, true, JSON.stringify(
            result.firstDifference ?? result.issues?.[0] ?? result,
        ));
        if (prompt) assert.ok(replay.screens.some(screen => screen.includes(prompt)));
    });
}
