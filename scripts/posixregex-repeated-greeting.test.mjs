// C refs: posixregex.c regex_compile()/regex_match(), options.c msgtype_type().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    compareSessionOutputs,
    formatReport,
    runJsSession,
} from './diff-fresh.mjs';
import {
    createScoringWorkspace,
    removeScoringWorkspace,
} from './scoring-workspace.mjs';

for (const name of [
    'repeated-greeting',
    'simple-greeting-control',
    'greeting-unfiltered-control',
]) {
    test(`POSIX greeting C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/posixregex.c/trial-${name}.session.json`,
            import.meta.url), 'utf8'));
        const segment = recording.segments[0];
        if (name === 'repeated-greeting') {
            assert.ok(segment.nethackrc.includes(
                String.raw`MSGTYPE=hide "^He((l)|x){1,2}\2o"`,
            ));
            assert.equal(segment.steps.length, 2);
        }

        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(
                recording,
                await runJsSession(recording, root),
            );
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
