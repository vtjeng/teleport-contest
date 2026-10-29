import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runJsSession, compareSessionOutputs, formatReport } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// C cmd.c accepts the named command, its explicit V binding, and its M-t key.
// The identical-config named command is the nearby control for both key paths.
for (const [name, file] of [
    ['named control', 'turn-named-control'],
    ['direct V binding', 'turn-direct-bound'],
    ['altmeta binding', 'turn-altmeta'],
    ['Priest binding', 'turn-priest-bound'],
    ['Priest named control', 'turn-priest-control'],
]) {
    test(`#turn ${name} matches C`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/cmd.c/${file}.session.json`, import.meta.url), 'utf8'));
        const screens = recording.segments[0].steps.map(({screen}) => screen ?? '').join('\n');
        assert.ok(screens.includes(file.includes('priest')
            ? 'you chant an arcane formula.' : "You don't know how to turn undead!"), 'C handler was not reached');
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const output = await runJsSession(recording, root);
            const result = compareSessionOutputs(recording, output);
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
