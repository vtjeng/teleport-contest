import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { runJsSession, compareSessionOutputs, formatReport } from './diff-fresh.mjs';

// trap.c:sink_into_lava() runs at allmain.c's elapsed hero-turn boundary. The
// pre-existing movement path is a control: u.umoved suppresses the extra
// rnd(4), while repeated stationary turns eventually reach done(DISSOLVED).
for (const [source, name] of [
    ['hack.c', 'lava-trap-movement-9701162'],
    ['trap.c', 'stationary-lava-sink-turns'],
    ['trap.c', 'stationary-lava-dissolution-rescue'],
]) {
    test(`${name} matches its complete public-input C recording`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/${source}/${name}.session.json`, import.meta.url,
            )));
            const result = compareSessionOutputs(
                recording, await runJsSession(recording, root),
            );
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
