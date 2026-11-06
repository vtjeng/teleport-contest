// js/jsmain.js runSegment() is the judge's entry point: it ends a crashed
// segment and returns what it captured, so a caller that only checks that a
// replay finishes would pass on a crash. Every local test and tool imports
// runSegmentStrict() instead, which rethrows. This check fails when a tracked
// file outside frozen/ takes the judge's runSegment from js/jsmain.js, except
// for the files in JUDGE_CALLERS, which deliberately behave as the judge does.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);

const JUDGE_CALLERS = new Map([
    ['scripts/run-segment-errors.test.mjs', 'tests the judge-facing behaviour itself'],
    ['scripts/segment-termination.test.mjs', 'tests how the judge-facing entry point reports termination violations'],
    ['tools/session-viewer/viz.mjs', 'shows what the judge scores, and reports game.segmentError'],
    ['scripts/run-segment-imports.test.mjs', "holds the detector's sample imports"],
    ['scripts/replay-coverage.test.mjs', 'writes a stand-in frozen/ps_test_runner.mjs, which imports what the judge does'],
    ['scripts/scoring-workspace.test.mjs', 'writes a stand-in frozen/ps_test_runner.mjs, which imports what the judge does'],
]);

// frozen/ is the judge's own code. The tracked .cache/ directories are
// archived snapshots of past test drafts and patches; their relative imports
// name a .cache/js/ directory that does not exist, so none of them runs.
const SKIPPED_PREFIXES = ['frozen/', '.cache/'];

// Each pattern finds one way to take the export named runSegment (and not
// runSegmentStrict): a static import specifier, with or without `as`; a key
// destructured from a dynamic import, with or without a rename; and a
// property read, as from a module namespace.
const STATIC_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*)['"]/gu;
const DYNAMIC_IMPORT = /\{([^{}]*)\}\s*=\s*await\s+import\s*\(/gu;
const PROPERTY = /\.runSegment\b(?!Strict)/gu;

export function plainRunSegmentUses(source) {
    const uses = [];
    for (const [, names, from] of source.matchAll(STATIC_IMPORT)) {
        if (!/(^|\/)jsmain(\.js)?$/u.test(from)) continue;
        for (const name of names.split(','))
            if (/^runSegment(\s+as\s+\w+)?$/u.test(name.trim())) uses.push(`import { ${name.trim()} }`);
    }
    for (const [, names] of source.matchAll(DYNAMIC_IMPORT)) {
        for (const name of names.split(','))
            if (/^runSegment(\s*:\s*\w+)?$/u.test(name.trim())) uses.push(`{ ${name.trim()} } = await import()`);
    }
    for (const [match] of source.matchAll(PROPERTY)) uses.push(match);
    return uses;
}

function repositoryScripts() {
    return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.js', '*.mjs', '*.cjs', '*.html'],
        { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
        .split('\0')
        .filter((path) => path && !SKIPPED_PREFIXES.some((prefix) => path.startsWith(prefix)));
}

test('the detector finds every form of taking the plain runSegment', () => {
    // One line per form the check must catch; the last three must pass.
    const samples = [
        ["import { runSegment } from '../js/jsmain.js';", 1],
        ["import {game} from '../js/gstate.js';import {NethackGame, runSegment as run} from '../js/jsmain.js';", 1],
        ["const { runSegment } = await import('../js/jsmain.js');", 1],
        ['const {runSegment: replay} = await import(runnerUrl);', 1],
        ["if (worker) {\n    const { runSegment } = await import('../js/jsmain.js');", 1],
        ['runSegment = mod.runSegment;', 1],
        ["import { runSegmentStrict as runSegment } from '../js/jsmain.js';", 0],
        ['const { runSegmentStrict: runSegment } = await import(runnerUrl);', 0],
        ["import { runSegment } from './fixture-runner.mjs';", 0],
    ];
    for (const [source, count] of samples)
        assert.equal(plainRunSegmentUses(source).length, count, source);
});

test('only the judge callers take the plain runSegment from js/jsmain.js', () => {
    const files = repositoryScripts();
    // The repository has hundreds of runSegmentStrict() callers; a short list
    // would mean the listing, not the code, changed.
    assert.ok(files.length > 1000, `only ${files.length} tracked scripts listed`);
    const offenders = [];
    const seenJudgeCallers = new Set();
    for (const path of files) {
        const uses = plainRunSegmentUses(readFileSync(new URL(path, root), 'utf8'));
        if (!uses.length) continue;
        if (JUDGE_CALLERS.has(path)) seenJudgeCallers.add(path);
        else offenders.push(`${path}: ${uses.join('; ')}`);
    }
    assert.deepEqual(offenders, [],
        'import runSegmentStrict from js/jsmain.js (import { runSegmentStrict as runSegment }) '
        + 'so that a crash fails the caller');
    // An entry whose file no longer takes runSegment would let a later file
    // of that name do so unchecked.
    assert.deepEqual([...seenJudgeCallers].sort(), [...JUDGE_CALLERS.keys()].sort());
});
