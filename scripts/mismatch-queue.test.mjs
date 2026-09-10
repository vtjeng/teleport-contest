import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
    assertGoalSelection, buildQueue, formatQueue, parseCaller, queueEntry,
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
