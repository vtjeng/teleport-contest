import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { parseRunnerBundle, runScorer, runnerSpeed, sizeBalancedBatches } from './scoring-workspace.mjs';

test('size-balanced batches place the largest sessions first on the lightest batch', () => {
    // Sizes 8, 1, 5, 4, 2 over two batches: 8 opens batch 0, 5 opens batch 1,
    // 4 joins batch 1 (5 < 8), 2 joins batch 0 (8 < 9), and 1 joins batch 1
    // (9 < 10). Indices come back ascending within each batch.
    assert.deepEqual(sizeBalancedBatches([8, 1, 5, 4, 2], 2), [[0, 4], [1, 2, 3]]);
    // More batches than sessions leaves no empty batch; the larger session,
    // index 1, opens the first batch.
    assert.deepEqual(sizeBalancedBatches([3, 7], 9), [[1], [0]]);
    // Equal sizes keep file order, so the split is deterministic.
    assert.deepEqual(sizeBalancedBatches([1, 1, 1, 1], 2), [[0, 2], [1, 3]]);
});

test('runner speed fits startup plus a per-move cost like the frozen runner', () => {
    // Two exact points, 100 ms at 0 moves and 200 ms at 10 moves, give a
    // 100 ms startup and 10 ms per move with a perfect fit.
    assert.deepEqual(runnerSpeed([
        { time: { ms: 100, moves: 0 } },
        { time: { ms: 200, moves: 10 } },
        { passed: false }, // A session without a time does not enter the fit.
    ]), { startup_ms: 100, per_move_ms: 10, r2: 1, label: '100+10.00/turn', sessions: 2 });
    // One timed session is too few for a line, as in the runner.
    assert.equal(runnerSpeed([{ time: { ms: 5, moves: 1 } }]).label, '?');
});

test('runScorer() names a crash, a termination violation and a recorded live-game use the judge entry point reported', (t) => {
    // A stand-in workspace: its runner starts one worker per session, as
    // frozen/ps_test_runner.mjs does, and its runSegment() reports a crash for
    // crash.session.json only and a termination violation for
    // stray.session.json only, and a recorded live-game use (an opaque
    // stand-in for a js/youprop.js argument use) for
    // planned.session.json only, as js/jsmain.js runSegment() reports each to
    // a registered reporter. Four sessions show that only the crashed one
    // gains segmentErrors, only the stray one terminationViolations, and only
    // the planned one planningLiveGameUses.
    const root = mkdtempSync(join(tmpdir(), 'scoring-workspace-crash-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const files = {
        'js/jsmain.js': `let reporter = null;
let violationReporter = null;
let planningReporter = null;
export function setSegmentErrorReporter(next) { reporter = next; }
export function setTerminationViolationReporter(next) { violationReporter = next; }
export function setPlanningLiveGameReporter(next) { planningReporter = next; }
export function runSegment(file) {
    if (file.endsWith('planned.session.json'))
        planningReporter?.([{ kind: 'planningLiveGame', detail: 'read game.u in u_at', count: 3 }]);
    if (file.endsWith('crash.session.json'))
        reporter?.({ name: 'TypeError', message: 'stand-in crash', stack: '' });
    if (file.endsWith('stray.session.json'))
        violationReporter?.([{ kind: 'rng', detail: 'rn2(3)=0' }, { kind: 'nhgetch', detail: 'late read' }]);
}
`,
        'frozen/ps_test_runner.mjs': `import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const worker = process.argv.find(arg => arg.startsWith('--worker-session='));
if (worker) {
    const { runSegment } = await import('../js/jsmain.js');
    runSegment(worker.split('=')[1]);
} else {
    const dir = process.argv[2];
    const results = readdirSync(dir).sort().map(name => {
        spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker-session=' + join(dir, name)]);
        return { session: basename(name), passed: false, error: null };
    });
    console.log('__RESULTS_JSON__');
    console.log(JSON.stringify({ results }));
}
`,
        'sessions/crash.session.json': '{}',
        'sessions/clean.session.json': '{}',
        'sessions/stray.session.json': '{}',
        'sessions/planned.session.json': '{}',
    };
    for (const [path, body] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), body);
    }
    const child = runScorer(root);
    assert.equal(child.status, 0, child.stderr);
    const results = parseRunnerBundle(child.stdout).results;
    assert.deepEqual(results.map(r => [r.session, r.error, r.segmentErrors, r.terminationViolations,
        r.planningLiveGameUses]), [
        ['clean.session.json', null, undefined, undefined, undefined],
        ['crash.session.json', null, [{ name: 'TypeError', message: 'stand-in crash' }], undefined, undefined],
        ['planned.session.json', null, undefined, undefined,
            [{ kind: 'planningLiveGame', detail: 'read game.u in u_at', count: 3 }]],
        ['stray.session.json', null, undefined,
            [{ kind: 'rng', detail: 'rn2(3)=0' }, { kind: 'nhgetch', detail: 'late read' }], undefined],
    ]);
    assert.match(child.stderr, /^ {2}CRASH: crash\.session\.json \(TypeError: stand-in crash\)$/mu);
    assert.match(child.stderr,
        /^ {2}VIOLATION: stray\.session\.json \(rng: rn2\(3\)=0; nhgetch: late read\)$/mu);
    assert.match(child.stderr,
        /^ {2}PLANNING: planned\.session\.json \(read game\.u in u_at \(3x\)\)$/mu);
});
