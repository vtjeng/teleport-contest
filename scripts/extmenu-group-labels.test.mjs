import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runJsSession, compareSessionOutputs, formatReport } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// C cmd.c:extcmd_via_menu drops descriptions when a selector groups names.
// The identical setup without extmenu is the nearby non-menu control.
for (const [name, file] of [
    ['grouped labels', 'extmenu-group-witness'],
    ['non-menu control', 'extmenu-group-control'],
    ['narrow prefix descriptions', 'extmenu-group-prefix'],
    ['wizard long groups', 'extmenu-group-wizard'],
    ['root cancellation', 'extmenu-group-escape'],
]) {
    test(`${name} matches C`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/cmd.c/${file}.session.json`, import.meta.url), 'utf8'));
        const screens = recording.segments[0].steps.map(({screen}) => screen ?? '');
        if (file !== 'extmenu-group-control')
            assert.ok(screens.some(screen => screen.includes('Extended Command:')), 'C setup did not reach extmenu');
        if (file === 'extmenu-group-prefix')
            assert.ok(screens.some(screen => screen.includes('Extended Command: a')), 'C prefix was not reached');
        if (file === 'extmenu-group-wizard')
            assert.ok(screens.some(screen => screen.includes('or wiz')), 'C wrapped wizard group was not reached');
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
