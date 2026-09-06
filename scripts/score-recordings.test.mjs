import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    flatName, formatSummary, listRecordings, summarizeRecordings,
} from './score-recordings.mjs';

test('listRecordings walks recordings/<c-file>/ and flattens the names', () => {
    const root = mkdtempSync(join(tmpdir(), 'recordings-'));
    mkdirSync(join(root, 'attrib.c'));
    mkdirSync(join(root, 'eat.c'));
    writeFileSync(join(root, 'eat.c', 'poison.session.json'), '{}');
    writeFileSync(join(root, 'attrib.c', 'exercise.session.json'), '{}');
    writeFileSync(join(root, 'attrib.c', 'notes.md'), '');
    const found = listRecordings(root);
    assert.deepEqual(found, [
        join('attrib.c', 'exercise.session.json'),
        join('eat.c', 'poison.session.json'),
    ]);
    // Two recordings with the same base name under different C files must
    // not collide in the flat scoring workspace.
    assert.equal(flatName(found[0]), 'attrib.c__exercise.session.json');
    assert.deepEqual(listRecordings(join(root, 'missing')), []);
});

test('summarizeRecordings totals the runner bundle and names failures', () => {
    // Figures chosen so every total differs from every input: 30 + 12
    // screens, 400 + 90 RNG calls, one of two passing.
    const bundle = { results: [
        { session: 'attrib.c__exercise.session.json', passed: true,
            metrics: { screens: { matched: 30, total: 30 },
                rngCalls: { matched: 400, total: 400 } } },
        { session: 'eat.c__poison.session.json', passed: false,
            metrics: { screens: { matched: 12, total: 20 },
                rngCalls: { matched: 90, total: 150 } } },
    ] };
    const totals = summarizeRecordings(bundle);
    assert.deepEqual(totals, { recordings: 2, passing: 1, screens: 42,
        screensTotal: 50, rng: 490, rngTotal: 550,
        failing: ['eat.c__poison.session.json'] });
    assert.equal(formatSummary(totals),
        'recordings: 1/2 passing, screens 42/50, rng 490/550');
});
