import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
    assertGoalSelection, buildQueue, buildSyntheticQueue, buildWorkQueue,
    formatQueue, parseCaller, queueEntry,
} from './mismatch-queue.mjs';

// These synthetic sessions isolate queue policy from the changing game port.
// Ten recorded steps make the remaining-screen upper bounds easy to inspect.
const passing = {
    file: 'passing.session.json', screensEmitted: 10, recordedSteps: 10,
    divergence: null, boundary: null,
};
const owners = new Map([['test_move', 'hack.c'], ['load_special', 'sp_lev.c']]);
// An all-declared file must still compete for priority when gameplay stops.
const allDeclared = () => ({ functionsTotal: 2, functionsDeclared: 2 });
const names = new Set(['test_move', 'load_special']);
const stop = {
    ...passing, file: 'movement.session.json', screensEmitted: 2,
    boundary: 'unsupported hero movement: test_move() refuses this terrain',
};
// The later unattributed screen mismatch has less remaining exposure than stop.
const screen = {
    ...passing, file: 'screen.session.json',
    divergence: { screen: { index: 4 }, rng: null },
};
const build = (rows) => buildQueue({ rows }, owners, allDeclared, names);

test('parseCaller reads C callers and both patched Lua annotation forms', () => {
    // The arbitrary positive line numbers exercise parsing, not source location.
    assert.deepEqual(parseCaller('test_move(hack.c:12)'), {
        function: 'test_move', sourceFile: 'hack.c', cFile: 'hack.c',
        luaFile: null, line: 12,
    });
    assert.deepEqual(parseCaller('nh.rn2(themerms.lua:9)'), {
        function: 'nh.rn2', sourceFile: 'themerms.lua', cFile: null,
        luaFile: 'themerms.lua', line: 9,
    });
    // Patch 004 records a helper frame before the actual Lua parent owner.
    assert.deepEqual(parseCaller('random src=nhlib.lua:10 parent=lua(tower1.lua:65)'), {
        function: 'lua', sourceFile: 'tower1.lua', cFile: null,
        luaFile: 'tower1.lua', line: 65,
        helper: { function: 'random', luaFile: 'nhlib.lua', line: 10 },
    });
    assert.equal(parseCaller(null), null);
    assert.equal(parseCaller('rn2(5)=2'), null); // A draw is not a caller annotation.
});

test('the earliest positioned mismatch wins, including cursors and RNG ties', () => {
    const row = {
        ...screen,
        divergence: {
            screen: { index: 4 }, // First visible difference.
            cursor: { index: 3 }, // Cursor state already differed one step earlier.
            rng: { stepIndex: 5, cCaller: 'test_move(hack.c:12)' },
        },
    };
    assert.equal(queueEntry(row, owners).kind, 'cursor');
    // A draw at the same step precedes the screen or cursor it changes.
    row.divergence.rng.stepIndex = 3;
    const entry = queueEntry(row, owners, names);
    assert.equal(entry.kind, 'rng');
    assert.equal(entry.sourceFile, 'hack.c');
    assert.equal(entry.functionDeclared, true);
    assert.equal(Object.hasOwn(entry, 'functionPorted'), false);
    assert.equal(queueEntry(passing, owners), null);
});

test('all-declared C blockers stay in one ranked list with unknown owners', () => {
    const queue = build([passing, screen, stop]);
    assert.equal(queue.roadmapFallbackAllowed, false);
    assert.deepEqual(queue.candidates.map((entry) => entry.sourceFile),
        ['hack.c', null]);
    assert.equal(queue.candidates[0].functionsDeclared, 2);
    assert.equal(queue.candidates[0].remainingScreensUpperBound, 8);
    assert.equal(queue.candidates[1].kind, 'source-investigation');
    const output = formatQueue(queue);
    assert.match(output, /test_move\(\) in hack\.c \[same-name declaration exists\]/u);
    assert.match(output, /2 of 2 functions declared/u);
    assert.match(output, /upper bounds, not predicted gains/u);
    assert.match(output, /Roadmap fallback: blocked/u);
    assert.doesNotMatch(output, /file ports|divergence fixes|functions ported/u);
});

test('source groups sum exposure and break ties by earliest step', () => {
    // Two movement sessions expose 8 + 4 screens; Lua exposes 12 too but has
    // an earlier stop, so it wins the tie. Declarations do not affect rank.
    const laterMovement = {
        ...stop, file: 'later-movement.session.json', screensEmitted: 6,
    };
    const lua = {
        ...passing, file: 'lua.session.json', recordedSteps: 13, screensEmitted: 1,
        boundary: 'makelevel: load_special() has no loader for special level "Arc-loca"',
    };
    const queue = build([stop, laterMovement, lua]);
    assert.deepEqual(queue.candidates.map((entry) => entry.sourceFile),
        ['Arc-loca.lua', 'hack.c']);
    assert.equal(queue.candidates[1].remainingScreensUpperBound, 12);
    assert.deepEqual(queue.candidates[1].sessions, ['movement', 'later-movement']);
});

test('session priority uses remaining screens before mismatch step and session ID', () => {
    // The later failure still ranks first because ten screens remain. The
    // other fixtures all have eight remaining: known steps precede unknown
    // steps, and the two movement entries resolve their tie by session ID.
    const long = { ...screen, file: 'long.session.json', recordedSteps: 20,
        divergence: { screen: { index: 10 } } };
    const tie = { ...screen, file: 'tie.session.json', recordedSteps: 12 };
    const unknown = { ...screen, file: 'unknown.session.json', recordedSteps: 8,
        divergence: { rng: { index: 1, stepIndex: null } } }; // An unlocated RNG mismatch.
    const queue = build([unknown, tie, { ...stop, file: 'z-move.session.json' },
        long, { ...stop, file: 'a-move.session.json' }]);
    assert.deepEqual(queue.sessions.map(entry => entry.session),
        ['long', 'a-move', 'z-move', 'tie', 'unknown']);
});

test('missing Lua loaders belong to their Lua program, including makemaz refusals', () => {
    for (const boundary of [
        'makelevel: load_special() has no loader for special level "Arc-loca"',
        'makemaz: no loader for "Arc-loca"',
        'makemaz: no loader for "Arc-loca.lua"',
    ]) {
        const entry = queueEntry({ ...stop, boundary }, owners, names);
        assert.equal(entry.kind, 'stop');
        assert.equal(entry.sourceFile, 'Arc-loca.lua');
        assert.equal(entry.luaFile, 'Arc-loca.lua');
        assert.equal(entry.cFile, null);
        assert.equal(entry.functionDeclared, false);
    }
});

test('Lua RNG callers remain selectable without any C owner', () => {
    const queue = build([{
        ...passing, file: 'lua-rng.session.json',
        divergence: { rng: {
            stepIndex: 1, cCaller: 'random src=nhlib.lua:10 parent=lua(tower1.lua:65)',
        } },
    }]);
    assert.equal(queue.candidates[0].luaFile, 'tower1.lua');
    assert.doesNotThrow(() => assertGoalSelection(queue, { luaFile: 'tower1.lua' }));
    assert.throws(() => assertGoalSelection(queue, { cFile: 'sfbase.c' }), /mismatch/u);
});

test('screen-only and unresolved stops forbid roadmap fallback', () => {
    const unresolved = { ...stop, boundary: 'unimplemented command with no owner' };
    for (const row of [screen, unresolved]) {
        const queue = build([row]);
        assert.equal(queue.candidates[0].kind, 'source-investigation');
        assert.equal(queue.roadmapFallbackAllowed, false);
        assert.throws(() => assertGoalSelection(queue, { cFile: 'sfbase.c' }), /mismatch/u);
        assert.throws(() => assertGoalSelection(queue, {
            cFile: 'hack.c', session: queue.sessions[0].session,
        }), /selectionReason/u);
        assert.doesNotThrow(() => assertGoalSelection(queue, {
            cFile: 'hack.c', session: queue.sessions[0].session,
            selectionReason: 'Source tracing locates deterministic state drift in hack.c.',
        }));
    }
});

test('cursor-only and unlocated RNG-only differences cannot become an empty queue', () => {
    for (const divergence of [
        { cursor: { index: 7 } }, // Cursor difference after most screens matched.
        { cursor: {} }, // An older or incomplete scan lacks the screen index.
        { rng: { index: 30, stepIndex: null, cCaller: null } }, // Extra JS draws.
        { rng: { index: 30, cCaller: 'nh.rn2(themerms.lua:9)' } },
    ]) {
        const queue = build([{ ...passing, divergence }]);
        assert.equal(queue.sessions.length, 1);
        assert.equal(queue.roadmapFallbackAllowed, false);
        assert.doesNotMatch(formatQueue(queue), /every session matches/u);
        if (!Number.isInteger(divergence.cursor?.index)) {
            assert.equal(queue.sessions[0].step, null);
            // Without a step, the entire recording is only an upper bound.
            assert.equal(queue.sessions[0].remainingScreensUpperBound, 10);
            assert.match(formatQueue(queue), /step unknown/u);
        }
    }
});

test('incomplete output and unrecognized divergence stay unresolved', () => {
    for (const row of [
        { ...passing, screensEmitted: 9 }, // A missing screen without a named refusal.
        { ...passing, screensEmitted: 11 }, // Extra output must also block fallback.
        { ...passing, divergence: {} }, // Non-null divergence is not evidence of parity.
    ]) {
        assert.equal(build([row]).roadmapFallbackAllowed, false);
    }
});

test('selection defaults to the top candidate and records why it was bypassed', () => {
    const later = {
        ...screen, boundary: 'load_special() refused', screensEmitted: 7,
        divergence: null, // An attributed lower-priority stop in a different file.
    };
    const queue = build([stop, later]);
    assert.doesNotThrow(() => assertGoalSelection(queue, { cFile: 'hack.c' }));
    assert.throws(() => assertGoalSelection(queue, { cFile: 'sp_lev.c' }),
        /selectionReason/u);
    assert.doesNotThrow(() => assertGoalSelection(queue, {
        cFile: 'sp_lev.c', selectionReason: 'The movement fix requires this source-traced callee.',
    }));
    assert.throws(() => assertGoalSelection(queue, {
        cFile: 'sfbase.c', selectionReason: 'It has many undeclared functions.',
    }), /mismatch/u);
    assert.throws(() => assertGoalSelection(queue, {
        cFile: 'attrib.c', sessions: ['movement'],
    }), /selectionReason/u);
    assert.doesNotThrow(() => assertGoalSelection(queue, {
        cFile: 'attrib.c', sessions: ['movement'],
        selectionReason: 'Tracing movement finds the earlier ability-state write in attrib.c.',
    }));
});

test('roadmap work is allowed only for a completely matching scan', () => {
    const queue = build([passing]);
    assert.deepEqual(queue.candidates, []);
    assert.equal(queue.roadmapFallbackAllowed, true);
    assert.match(formatQueue(queue), /every session matches/u);
    assert.match(formatQueue(queue), /Roadmap fallback: allowed/u);
    assert.doesNotThrow(() => assertGoalSelection(queue, { cFile: 'sfbase.c' }));
});

test('CLI preserves unresolved mismatches in a saved scan and rejects a missing path', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'mismatch-queue-test-'));
    const script = fileURLToPath(new URL('./mismatch-queue.mjs', import.meta.url));
    try {
        const scanPath = join(scratch, 'development-scan.json');
        writeFileSync(scanPath, JSON.stringify({ rows: [screen] }));
        const run = spawnSync(process.execPath, [script, '--scan', scanPath, '--json'],
            { encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr); // Valid scans are successful commands.
        const queue = JSON.parse(run.stdout);
        assert.equal(queue.roadmapFallbackAllowed, false);
        assert.equal(queue.candidates[0].kind, 'source-investigation');
        const missing = spawnSync(process.execPath, [script, '--scan', '--json'],
            { encoding: 'utf8' });
        assert.notEqual(missing.status, 0); // A flag is not a scan filename.
        assert.match(missing.stderr, /--scan requires a path/u);
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
});

test('synthetic queue keeps exact screen debt and cursor/RNG losses visible', () => {
    const root = mkdtempSync(join(tmpdir(), 'synthetic-queue-test-'));
    try {
        mkdirSync(join(root, 'challenges/cases'), { recursive: true });
        const recording = {
            version: 5, segments: [{ seed: 1, datetime: '20260918090000',
                nethackrc: '', moves: '', steps: Array.from({ length: 5 }, () => ({})) }],
        };
        writeFileSync(join(root, 'challenges/cases/alpha.session.json'),
            JSON.stringify(recording));
        writeFileSync(join(root, 'challenges/cases/beta.session.json'),
            JSON.stringify(recording));
        const recordingSha256 = 'b'.repeat(64);
        const cases = [
            { id: 'alpha', recording: 'challenges/cases/alpha.session.json', recordingSha256 },
            { id: 'beta', recording: 'challenges/cases/beta.session.json', recordingSha256 },
        ];
        const evaluation = {
            status: 'complete', sha: 'c'.repeat(40), scorerSha256: 'd'.repeat(64),
            utc: '2026-09-18T09:00:00Z',
            cases: [
                { id: 'alpha', recordingSha256, passed: false,
                    metrics: { screens: { matched: 2, total: 5 }, rng: { matched: 5, total: 5 },
                        cursors: { matched: 5, total: 5 } } },
                { id: 'beta', recordingSha256, passed: false, firstMismatch: { step: 3, kind: 'rng' },
                    metrics: { screens: { matched: 5, total: 5 }, rng: { matched: 4, total: 5 },
                        cursors: { matched: 5, total: 5 } } },
            ],
        };
        const previous = structuredClone(evaluation);
        previous.sha = 'e'.repeat(40);
        previous.utc = '2026-09-17T09:00:00Z';
        previous.cases[0].metrics.screens.matched = 4;
        mkdirSync(join(root, '.cache/synthetic-scans/v1'), { recursive: true });
        writeFileSync(join(root, '.cache/synthetic-scans/v1/alpha.json'), JSON.stringify({
            inputIdentity: { corpus: 'synthetic', batch: 'v1', caseId: 'alpha',
                manifestPath: 'challenges/manifest.json', manifestSha256: 'a'.repeat(64),
                recordingPath: 'challenges/cases/alpha.session.json', recordingSha256,
                recipeSha256: null, replayInputSha256: null,
                diagnosticToolSha256: null },
            divergence: { screen: { index: 2, row: 4, column: 3 } },
        }));
        const batch = buildSyntheticQueue([{
            corpus: 'synthetic', batch: 'v1', manifestPath: 'challenges/manifest.json',
            manifestSha256: 'a'.repeat(64), cases, status: 'measured',
            evaluation, evaluationPath: 'challenges/evaluations/one.json',
            previous,
        }], { root });
        assert.deepEqual(batch.sessions.map(entry => [entry.session, entry.remainingScreens]), [
            ['synthetic/v1/alpha', 3], ['synthetic/v1/beta', 0],
        ]);
        assert.equal(batch.sessions[0].kind, 'screen');
        assert.equal(batch.sessions[0].firstMismatch.screen.index, 2);
        assert.equal(batch.sessions[1].kind, 'rng');
        assert.equal(batch.sessions[0].regression, true,
            'regression compares with the immediately preceding evaluation');
        assert.equal(batch.generationReady, false, 'screen debt blocks generation');
        assert.equal(batch.blockers.length, 0);

        const fixed = build([passing]);
        const work = buildWorkQueue(fixed, batch);
        assert.equal(work.mode, 'work');
        assert.equal(work.generationReady, false, 'fixed regressions also block generation');
        assert.equal(work.sessions[0].session, 'synthetic/v1/alpha');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('synthetic goal selection requires a current investigation', () => {
    const synthetic = {
        mode: 'synthetic', corpus: 'synthetic', blockers: [],
        sessions: [{ corpus: 'synthetic', session: 'synthetic/v1/alpha', batch: 'v1',
            caseId: 'alpha', remainingScreens: 2,
            investigation: { status: 'missing' } }],
    };
    const queue = buildWorkQueue(build([passing]), synthetic);
    assert.throws(() => assertGoalSelection(queue, {
        session: 'synthetic/v1/alpha', sessions: ['synthetic/v1/alpha'],
    }), /investigation is missing/u);
    synthetic.sessions[0].investigation = { status: 'complete' };
    assert.throws(() => assertGoalSelection(buildWorkQueue(build([passing]), synthetic), {
        session: 'synthetic/v1/alpha', sessions: ['synthetic/v1/alpha'],
    }), /selectionReason/u);
    assert.equal(assertGoalSelection(buildWorkQueue(build([passing]), synthetic), {
        session: 'synthetic/v1/alpha', sessions: ['synthetic/v1/alpha'],
        selectionReason: 'The selected synthetic trace identifies this source owner.',
    }).session, 'synthetic/v1/alpha');
});

test('combined work mode never enables roadmap fallback', () => {
    const fixed = build([passing]);
    const work = buildWorkQueue(build([passing]), {
        mode: 'synthetic', corpus: 'synthetic', blockers: [], sessions: [],
        generationReady: true,
    });
    assert.equal(work.roadmapFallbackAllowed, false);
    assert.throws(() => assertGoalSelection(work, { cFile: 'sfbase.c' }),
        /no fixed regression or synthetic candidate/u);
    assert.equal(fixed.roadmapFallbackAllowed, true);
});

test('synthetic diagnostics require replay/tool identity and recover source owners', () => {
    const root = mkdtempSync(join(tmpdir(), 'synthetic-diagnostic-identity-'));
    try {
        mkdirSync(join(root, 'challenges/cases'), { recursive: true });
        mkdirSync(join(root, '.cache/synthetic-scans/v1'), { recursive: true });
        const recording = { version: 5, segments: [{ seed: 2,
            datetime: '20260918100000', nethackrc: '', moves: '',
            steps: Array.from({ length: 4 }, () => ({})) }] };
        writeFileSync(join(root, 'challenges/cases/owner.session.json'),
            JSON.stringify(recording));
        const recordingSha256 = 'b'.repeat(64);
        writeFileSync(join(root, '.cache/synthetic-scans/v1/owner.json'), JSON.stringify({
            file: 'synthetic/v1/owner', screensEmitted: 2, recordedSteps: 4,
            divergence: { rng: { stepIndex: 1, cCaller: 'test_move(hack.c:12)' } },
            inputIdentity: { corpus: 'synthetic', batch: 'v1', caseId: 'owner',
                manifestPath: 'challenges/manifest.json', manifestSha256: 'a'.repeat(64),
                recordingPath: 'challenges/cases/owner.session.json', recordingSha256,
                recipeSha256: null, replayInputSha256: 'input-a',
                diagnosticToolSha256: null },
        }));
        const evaluation = { status: 'complete', sha: 'c'.repeat(40),
            scorerSha256: 'd'.repeat(64), utc: '2026-09-18T10:00:00Z', cases: [{
                id: 'owner', recordingSha256, passed: false,
                metrics: { screens: { matched: 2, total: 4 }, rng: { matched: 3, total: 4 },
                    cursors: { matched: 4, total: 4 } },
            }] };
        const batch = buildSyntheticQueue([{
            corpus: 'synthetic', batch: 'v1', manifestPath: 'challenges/manifest.json',
            manifestSha256: 'a'.repeat(64), replayInputSha256: 'input-a',
            cases: [{ id: 'owner', recording: 'challenges/cases/owner.session.json',
                recordingSha256 }], status: 'measured', evaluation,
            evaluationPath: 'challenges/evaluations/one.json', previous: null,
        }], { root, owners: new Map([['test_move', 'hack.c']]) });
        assert.equal(batch.sessions[0].sourceFile, 'hack.c');
        assert.equal(batch.sessions[0].function, 'test_move');
        assert.equal(batch.sessions[0].step, 1);
        assert.equal(batch.sessions[0].kind, 'rng');

        // A changed replay-input snapshot makes the cached row unavailable;
        // the queue keeps the loss visible but cannot invent an owner.
        const stale = buildSyntheticQueue([{
            corpus: 'synthetic', batch: 'v1', manifestPath: 'challenges/manifest.json',
            manifestSha256: 'a'.repeat(64), replayInputSha256: 'input-b',
            cases: [{ id: 'owner', recording: 'challenges/cases/owner.session.json',
                recordingSha256 }], status: 'measured', evaluation,
            evaluationPath: 'challenges/evaluations/one.json', previous: null,
        }], { root, owners: new Map([['test_move', 'hack.c']]) });
        assert.equal(stale.sessions[0].sourceFile, null);
        assert.equal(stale.sessions[0].step, null);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
