// C refs: botl.c stat_update_time() and wintty.c make_things_fit().
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
    'probe',
    'prefix-control',
    'no-gold-control',
    'no-blind-control',
    'capacity-padding-probe',
    'capacity-padding-control',
]) {
    test(`time-width C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/display.c/trial-time-width-${name}.session.json`,
            import.meta.url), 'utf8'));
        if (name === 'probe') {
            const screens = recording.segments[0].steps.map(
                ({ screen }) => screen ?? '',
            );
            for (const expected of [
                'T:9 Blind',
                'T:10 Blnd',
                'T:11 Blnd',
            ]) {
                assert.ok(screens.some((screen) => screen.includes(expected)),
                    expected);
            }
        }
        if (name === 'capacity-padding-probe') {
            const screens = recording.segments[0].steps.map(
                ({ screen }) => screen ?? '',
            );
            assert.ok(screens.some((screen) => screen.includes('T:11  Bl')),
                'C shrink_enc() retains a blank BL_CAP before conditions');
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
