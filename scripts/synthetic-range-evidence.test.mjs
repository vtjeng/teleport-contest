import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { digest } from './challenge-results.mjs';
import { PROJECT_ROOT } from './scoring-workspace.mjs';
import { verifySyntheticRanges } from './synthetic-range-evidence.mjs';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'synthetic-range-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const original = JSON.parse(readFileSync(join(PROJECT_ROOT,
        'challenges/cases/scout.session.json'), 'utf8'));
    const segment = { ...original.segments[0], steps: original.segments[0].steps.slice(0, 4),
        moves: original.segments[0].steps.slice(1, 4).map(step => step.key).join('') };
    const recording = JSON.stringify({ version: 5, segments: [segment] });
    const recipe = JSON.stringify({ version: 5, segments: [{ ...segment, steps: undefined }] });
    const write = (path, contents) => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), contents);
    };
    write('challenges/cases/scout.session.json', recording);
    write('challenges/cases/scout.recipe.json', recipe);
    write('challenges/manifest.json', JSON.stringify({ version: 1, cases: [{
        id: 'scout', title: 'sample', recipe: 'challenges/cases/scout.recipe.json',
        recipeSha256: digest(recipe), recording: 'challenges/cases/scout.session.json',
        recordingSha256: digest(recording),
    }] }));
    const range = { batch: 'v1', caseId: 'scout', segment: 0,
        fromStep: 1, throughStep: 2, source: 'source.c action via command' };
    const evidence = { functions: [{ synthetic: [range] }], entryPoints: [] };
    const replaySegment = async ({ moves }) => {
        // Simulate a replay that matches through step 2 and stops before step 3.
        const steps = segment.steps.slice(0, Math.min(3, moves.length + 1));
        return { getRngLog: () => steps.flatMap(step => step.rng ?? []),
            getScreens: () => steps.map(step => step.screen),
            getCursors: () => steps.map(step => step.cursor) };
    };
    return { root, range, evidence, replaySegment };
}

test('a matching cited prefix is valid despite a later mismatch', async (t) => {
    const { root, evidence, replaySegment } = fixture(t);
    assert.deepEqual(await verifySyntheticRanges(evidence, { root, replaySegment }),
        [{ case: 'v1/scout', segment: 0, throughStep: 2 }]);
    evidence.functions[0].synthetic[0].throughStep = 3;
    await assert.rejects(verifySyntheticRanges(evidence, { root, replaySegment }), /diverges/u);
});

test('a citation cannot name an absent case or step', async (t) => {
    const { root, evidence, replaySegment } = fixture(t);
    evidence.functions[0].synthetic[0].throughStep = 4;
    await assert.rejects(verifySyntheticRanges(evidence, { root, replaySegment }), /outside/u);
    evidence.functions[0].synthetic[0].caseId = 'unknown';
    await assert.rejects(verifySyntheticRanges(evidence, { root, replaySegment }), /admitted case/u);
});
