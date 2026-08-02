import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    appendPhase,
    COLUMNS,
    readPhases,
    summarizePhases,
} from './phase-log.mjs';

const dir = mkdtempSync(join(tmpdir(), 'phase-log-'));

test('phase rows append with five fields and validated values', () => {
    const path = join(dir, 'phases.tsv');
    writeFileSync(path, `${COLUMNS.join('\t')}\n`);
    const row = appendPhase(
        { event: 'start', phase: 'implement', goal: 'object-pile-window' },
        path);
    // The writer fills utc; an ISO timestamp contains a 'T'.
    assert.match(row.utc, /T/u);
    assert.equal(readPhases(path).length, 1);
    assert.throws(() => appendPhase({ event: 'begin', phase: 'select' }, path),
        /event must be/u);
    assert.throws(() => appendPhase({ event: 'start', phase: 'ship' }, path),
        /phase must be/u);
});

test('the summary pairs ends with starts and reports the stragglers', () => {
    // Two implement spans of 60s and 120s, one select span still open, and
    // one review end with no start. The seconds are chosen so a pairing bug
    // that reuses the first start (180s + 120s) cannot equal the true total.
    const rows = [
        { utc: '2026-08-01T10:00:00Z', event: 'start', phase: 'implement' },
        { utc: '2026-08-01T10:01:00Z', event: 'end', phase: 'implement' },
        { utc: '2026-08-01T10:05:00Z', event: 'start', phase: 'implement' },
        { utc: '2026-08-01T10:07:00Z', event: 'end', phase: 'implement' },
        { utc: '2026-08-01T10:08:00Z', event: 'start', phase: 'select',
            goal: 'g' },
        { utc: '2026-08-01T10:09:00Z', event: 'end', phase: 'review' },
    ];
    const { totals, open, orphanedEnds } = summarizePhases(rows);
    assert.deepEqual(totals.get('implement'), { seconds: 180, spans: 2 });
    assert.deepEqual(open.map(({ phase }) => phase), ['select']);
    assert.deepEqual(orphanedEnds.map(({ phase }) => phase), ['review']);
});
