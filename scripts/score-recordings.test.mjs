import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    flatName, formatSummary, listRecordings, rngStepProblem, summarizeRecordings, parseArgs, selectRecordings,
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

test('recordings batches cover every file once and spread large recordings across jobs', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'recordings-batches-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    // Unequal sizes exercise balancing; two batches should each receive 9 bytes.
    const files = [8, 6, 3, 1].map((size, index) => {
        const name = `${index}.session.json`;
        writeFileSync(join(root, name), ' '.repeat(size));
        return name;
    });
    const first = selectRecordings(files, { index: 1, count: 2 }, root);
    const second = selectRecordings(files, { index: 2, count: 2 }, root);
    assert.deepEqual(first, [files[0], files[3]]);
    assert.deepEqual(second, [files[1], files[2]]);
    assert.deepEqual([...first, ...second].sort(), files);
    assert.deepEqual(parseArgs(['--shard', '1/2']).shard, { index: 1, count: 2 });
    for (const invalid of ['0/2', '3/2', '1/0', 'x/2'])
        assert.throws(() => parseArgs(['--shard', invalid]), /Usage/u);
});

// A per-step RNG comparison that ran and found nothing, as runScorer()
// attaches it: one segment of three compared steps.
const IN_STEP = [{ segment: 0, steps: 3, differing: 0, first: null }];

test('summarizeRecordings totals the runner bundle and names failures', () => {
    // Figures chosen so every total differs from every input: 30 + 12
    // screens, 400 + 90 RNG calls, one of two passing.
    const bundle = { results: [
        { session: 'attrib.c__exercise.session.json', passed: true, rngSteps: IN_STEP,
            metrics: { screens: { matched: 30, total: 30 },
                rngCalls: { matched: 400, total: 400 } } },
        { session: 'eat.c__poison.session.json', passed: false, rngSteps: IN_STEP,
            metrics: { screens: { matched: 12, total: 20 },
                rngCalls: { matched: 90, total: 150 } } },
    ] };
    const totals = summarizeRecordings(bundle);
    assert.deepEqual(totals, { recordings: 2, passing: 1, screens: 42,
        screensTotal: 50, rng: 490, rngTotal: 550,
        failing: ['eat.c__poison.session.json'], outOfStep: [] });
    assert.equal(formatSummary(totals),
        'recordings: 1/2 passing, screens 42/50, rng 490/550');
});

test('summarizeRecordings fails a matching recording that reports a termination violation', () => {
    // The judge's comparison passed (every screen and RNG call matched), but
    // something ran after the game ended, which scoring-workspace.mjs
    // runScorer() attaches as terminationViolations; the stand-in is an
    // nhgetch() call after nh_terminate().
    const bundle = { results: [
        { session: 'end.c__quit.session.json', passed: true, rngSteps: IN_STEP,
            terminationViolations: [{ kind: 'nhgetch', detail: 'after termination' }],
            metrics: { screens: { matched: 7, total: 7 },
                rngCalls: { matched: 40, total: 40 } } },
    ] };
    const totals = summarizeRecordings(bundle);
    assert.deepEqual(totals, { recordings: 1, passing: 0, screens: 7,
        screensTotal: 7, rng: 40, rngTotal: 40,
        failing: ['end.c__quit.session.json'], outOfStep: [] });
});

test('summarizeRecordings fails a matching recording with a recorded argument misuse', () => {
    // The judge's runSegment() records a js/youprop.js macro given the wrong
    // argument instead of throwing (js/gstate.js), so the replay matches;
    // runScorer() attaches the use as argumentMisuses. The stand-in's
    // kind and detail are opaque to the summary.
    const bundle = { results: [
        { session: 'mon.c__misusing.session.json', passed: true, rngSteps: IN_STEP,
            argumentMisuses: [{ kind: 'youpropArgument', detail: 'read game.u in u_at', count: 1 }],
            metrics: { screens: { matched: 7, total: 7 },
                rngCalls: { matched: 40, total: 40 } } },
    ] };
    assert.deepEqual(summarizeRecordings(bundle), { recordings: 1, passing: 0, screens: 7,
        screensTotal: 7, rng: 40, rngTotal: 40,
        failing: ['mon.c__misusing.session.json'], outOfStep: [] });
});

test('summarizeRecordings fails a matching recording that drew while a line was queued', () => {
    // js/rng.js checkQueuedOutput() found one draw while a line waited in
    // the notice queue; runScorer() attaches it as queuedOutput. The judge's
    // comparison still passes, since the draw itself matches.
    const bundle = { results: [
        { session: 'display.c__queued.session.json', passed: true, rngSteps: IN_STEP,
            queuedOutput: [{ count: 1, kept: [{ kind: 'rng', detail: 'rn2(4)=2 with 1 queued' }] }],
            metrics: { screens: { matched: 7, total: 7 },
                rngCalls: { matched: 40, total: 40 } } },
    ] };
    assert.deepEqual(summarizeRecordings(bundle), { recordings: 1, passing: 0, screens: 7,
        screensTotal: 7, rng: 40, rngTotal: 40,
        failing: ['display.c__queued.session.json'], outOfStep: [] });
});

test('summarizeRecordings fails a recording whose RNG calls fall in another step than C\'s, unless pinned', () => {
    // Both recordings match as the judge counts them. The second segment of
    // each draws 2 calls in step 5 where C drew none, the shape a line
    // printed after its --More-- instead of before gives.
    const lagging = [{ segment: 0, steps: 3, differing: 0, first: null },
        { segment: 1, steps: 9, differing: 2, first: { step: 5, recorded: 0, port: 2 } }];
    const result = name => ({ session: name, passed: true, rngSteps: lagging,
        metrics: { screens: { matched: 12, total: 12 }, rngCalls: { matched: 40, total: 40 } } });
    const bundle = { results: [result('mon.c__pinned.session.json'), result('mon.c__new.session.json')] };
    const totals = summarizeRecordings(bundle, new Set(['mon.c__pinned.session.json']));
    assert.equal(totals.passing, 1);
    assert.deepEqual(totals.failing, ['mon.c__new.session.json']);
    assert.deepEqual(totals.outOfStep, [{ session: 'mon.c__new.session.json',
        problem: '2 of 12 steps draw other RNG calls than C, first at segment 1 step 5 (recorded 0, port 2)' }]);
});

test('rngStepProblem fails a stale pin and a comparison that did not run', () => {
    const pinned = new Set(['mon.c__pinned.session.json']);
    // A pinned recording that is in step must leave the list.
    assert.match(rngStepProblem({ session: 'mon.c__pinned.session.json', rngSteps: IN_STEP }, pinned),
        /^in step now: remove it from LAGGING_RECORDINGS/u);
    assert.equal(rngStepProblem({ session: 'mon.c__other.session.json', rngSteps: IN_STEP }, pinned), null);
    // No comparison attached, one that compared no step, and one that
    // failed all fail: the check does not pass by not running.
    assert.equal(rngStepProblem({ session: 'a' }, pinned), 'per-step RNG comparison did not run');
    assert.equal(rngStepProblem({ session: 'a',
        rngSteps: [{ segment: 0, steps: 0, differing: 0, first: null }] }, pinned),
    'per-step RNG comparison did not run');
    assert.equal(rngStepProblem({ session: 'a', rngSteps: [{ segment: 0, error: 'no such file' }] }, pinned),
        'per-step RNG comparison failed: no such file');
});
