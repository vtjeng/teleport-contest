import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {decodeScreen} from '../frozen/screen-decode.mjs';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['blessed', 'uncursed', 'control']) {
    test(`detected blank glyph ${kind} matches canonical C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/display.c/detected-space-${kind}.session.json`, import.meta.url)));
            const styledSpaces = recording.segments[0].steps.flatMap(step =>
                decodeScreen(step.screen).slice(1, 22).flat()).filter(cell =>
                cell.ch === ' ' && cell.attr === 1).length;
            assert.equal(styledSpaces > 0, kind !== 'control',
                'C reaches inverse blank glyphs only with use_inverse enabled');
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
