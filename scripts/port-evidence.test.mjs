import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync }
    from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { completedFunctionNames, validatePortEvidence } from './port-evidence.mjs';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'port-evidence-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const write = (path, text) => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
    };
    // The two C functions distinguish a pure helper from a state-changing
    // entry point; fixture bodies need no game-specific behavior.
    write('nethack-c/upstream/src/widget.c',
        'int\nhelper(void)\n{ return 0; }\nvoid\nmutate(void)\n{}\n');
    write('nethack-c/upstream/dat/Arc-loca.lua', 'des.level_init({});\n');
    write('js/widget.js',
        'export function helper() {}\nexport function mutate() {}\n');
    write('js/driver.js', 'export function run() { helper(); mutate(); }\n');
    write('scripts/widget.test.mjs', '// Source-pinned test fixture.\n');
    // Deliberately invalid JSON: validation must inspect only the file's
    // existence, never consume or interpret recording contents.
    write('recordings/widget/entry.session.json', 'contents must not be read');
    const goal = {
        kind: 'file-port', cFile: 'widget.c',
        functions: [{ name: 'helper', ported: true }, { name: 'mutate' }],
    };
    const evidence = { functions: [{
        name: 'helper', implementation: 'js/widget.js',
        sourceReview: 'Reviewed the complete C body and all branches; run calls helper.',
        callers: [{ path: 'js/driver.js', symbol: 'run', source: 'driver.c run' }],
        pure: true, tests: ['scripts/widget.test.mjs'], recordings: [],
    }] };
    return { root, write, goal, evidence };
}

test('completion requires evidence even when a matching function exists', (t) => {
    const { goal } = fixture(t);
    assert.deepEqual([...completedFunctionNames(goal)], []);
    goal.evidence = { functions: [{ name: 'helper', implementation: 'js/widget.js' }] };
    assert.deepEqual([...completedFunctionNames(goal)], []);
});

test('source and caller evidence is sanitized and supplies completion', (t) => {
    const { root, goal, evidence } = fixture(t);
    evidence.unrelated = 'Discard unrecognized fields.';
    evidence.functions[0].unrelated = 'Discard unrecognized fields.';
    const result = validatePortEvidence(goal, evidence, { root });
    assert.equal(result.functions[0].symbol, 'helper');
    assert.equal(result.unrelated, undefined);
    assert.equal(result.functions[0].unrelated, undefined);
    assert.equal(evidence.functions[0].symbol, undefined);
    goal.evidence = result;
    assert.deepEqual([...completedFunctionNames(goal)], ['helper']);
});

test('missing reviews, callers, and evidence cannot attest completion', (t) => {
    const { root, goal, evidence } = fixture(t);
    assert.throws(() => validatePortEvidence(goal, undefined, { root }), /functions array/u);
    for (const field of ['sourceReview', 'callers', 'pure']) {
        const incomplete = structuredClone(evidence);
        delete incomplete.functions[0][field];
        assert.throws(() => validatePortEvidence(goal, incomplete, { root }), new RegExp(field));
    }
    evidence.functions[0].callers = [];
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /caller|inactiveReason/u);
});

test('pure functions need source-pinned tests and impure functions need recordings', (t) => {
    const { root, goal, evidence } = fixture(t);
    evidence.functions[0].tests = [];
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /pure.*test/u);
    evidence.functions[0].pure = false;
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /impure.*recording/u);
    evidence.functions[0].recordings = ['recordings/widget/entry.session.json'];
    assert.doesNotThrow(() => validatePortEvidence(goal, evidence, { root }));
});

test('inactive source requires an explicit reason and a pure source-pinned test', (t) => {
    const { root, goal, evidence } = fixture(t);
    evidence.functions[0].callers = [];
    evidence.functions[0].inactiveReason = 'The reference build disables this feature.';
    assert.doesNotThrow(() => validatePortEvidence(goal, evidence, { root }));
    evidence.functions[0].pure = false;
    evidence.functions[0].recordings = ['recordings/widget/entry.session.json'];
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /inactive.*pure/u);
});

test('file references reject absolute, traversal, holdout, and wrong-directory paths', (t) => {
    const { root, goal, evidence } = fixture(t);
    // All cases must fail structurally, before attempting to read any file.
    const paths = [
        '/tmp/widget.js', 'js/../widget.js', 'js/./widget.js',
        'js//widget.js', 'js\\widget.js', 'js/holdout/widget.js',
        'sessions/holdout/anything.session.json', 'scripts/widget.js',
    ];
    for (const path of paths) {
        evidence.functions[0].implementation = path;
        assert.throws(() => validatePortEvidence(goal, evidence, { root }), /path|holdout/u);
    }
});

test('caller, test, recording, and entry-point references receive the same path checks', (t) => {
    const { root, goal, evidence } = fixture(t);
    const mutations = [
        (item) => { item.functions[0].callers[0].path = 'js/../driver.js'; },
        (item) => { item.functions[0].tests = ['scripts/../widget.test.mjs']; },
        (item) => { item.functions[0].recordings = ['recordings/holdout/game.session.json']; },
        (item) => { item.entryPoints = [{ name: 'entry', functions: ['helper'],
            recordings: ['recordings/../game.session.json'] }]; },
    ];
    for (const mutate of mutations) {
        const unsafe = structuredClone(evidence);
        mutate(unsafe);
        assert.throws(() => validatePortEvidence(goal, unsafe, { root }), /path|holdout/u);
    }
});

test('all path checks finish before looking up the upstream source', (t) => {
    const { root, goal, evidence } = fixture(t);
    // A source lookup would fail first if later recording paths had not yet
    // been screened. No prohibited directory is created or accessed.
    goal.cFile = 'missing.c';
    evidence.functions[0].recordings = ['recordings/holdout/game.session.json'];
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /holdout/u);
});

test('symlink files and parent directories cannot supply evidence', (t) => {
    const { root, goal, evidence } = fixture(t);
    // Targets stay within this disposable fixture; both link shapes must fail
    // even when they do not escape the project root.
    symlinkSync('widget.js', join(root, 'js/linked.js'));
    evidence.functions[0].implementation = 'js/linked.js';
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /symlink/u);
    symlinkSync('widget', join(root, 'recordings/linked'));
    evidence.functions[0].implementation = 'js/widget.js';
    evidence.functions[0].recordings = ['recordings/linked/entry.session.json'];
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /symlink/u);

    // Upstream source follows the same restriction as implementation evidence.
    evidence.functions[0].recordings = [];
    symlinkSync('widget.c', join(root, 'nethack-c/upstream/src/linked.c'));
    goal.cFile = 'linked.c';
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /symlink/u);
});

test('source functions and every evidence file must exist', (t) => {
    const { root, goal, evidence } = fixture(t);
    for (const missing of [
        (item) => { item.functions[0].implementation = 'js/missing.js'; },
        (item) => { item.functions[0].callers[0].path = 'js/missing.js'; },
        (item) => { item.functions[0].tests = ['scripts/missing.test.mjs']; },
        (item) => { item.functions[0].recordings = ['recordings/missing.session.json']; },
    ]) {
        const incomplete = structuredClone(evidence);
        missing(incomplete);
        assert.throws(() => validatePortEvidence(goal, incomplete, { root }), /regular file|missing/u);
    }
    const absentFunction = structuredClone(goal);
    absentFunction.functions[0].name = 'absent';
    evidence.functions[0].name = 'absent';
    assert.throws(() => validatePortEvidence(absentFunction, evidence, { root }), /source.*absent/u);
    goal.cFile = 'missing.c';
    assert.throws(() => validatePortEvidence(goal, { functions: [] }, { root }), /source.*missing/u);
});

test('comments and strings cannot supply implementation or caller declarations', (t) => {
    const { root, write, goal, evidence } = fixture(t);
    write('js/widget.js', '// function helper() {}\nconst text = "function helper() {}";\n');
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /symbol helper/u);
    write('js/widget.js', 'export function helper() {}\n');
    write('js/driver.js', '// function run() {}\nconst text = "function run() {}";\n');
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /symbol run/u);
});

test('unknown source units and duplicate function attestations fail', (t) => {
    const { root, goal, evidence } = fixture(t);
    evidence.functions.push(structuredClone(evidence.functions[0]));
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /duplicate/u);
    evidence.functions.pop();
    evidence.functions[0].name = 'unplanned';
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /goal.*unplanned|unplanned.*goal/u);
});

test('Lua programs require an explicit JavaScript function or data symbol', (t) => {
    const { root, write, evidence } = fixture(t);
    const goal = { kind: 'lua-port', luaFile: 'Arc-loca.lua',
        functions: [{ name: 'Arc-loca.lua' }] };
    evidence.functions[0].name = 'Arc-loca.lua';
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /symbol/u);
    evidence.functions[0].symbol = 'ARC_LOCA';
    write('js/widget.js', 'export const ARC_LOCA = [];\n');
    assert.doesNotThrow(() => validatePortEvidence(goal, evidence, { root }));
    evidence.functions[0].symbol = 'buildArcLoca';
    write('js/widget.js', 'export function buildArcLoca() {}\n');
    assert.doesNotThrow(() => validatePortEvidence(goal, evidence, { root }));
    goal.luaFile = 'missing.lua';
    goal.functions = [{ name: 'missing.lua' }];
    assert.throws(() => validatePortEvidence(goal, { functions: [] }, { root }), /source.*missing/u);
});

test('entry points may be planned before completion and must name goal source units', (t) => {
    const { root, goal, evidence } = fixture(t);
    evidence.entryPointReview = 'Reviewed commands and startup calls for this file.';
    evidence.entryPoints = [{ name: 'state-changing entry', functions: ['mutate'], recordings: [] }];
    let result = validatePortEvidence(goal, evidence, { root });
    assert.deepEqual(result.entryPoints, evidence.entryPoints);
    evidence.entryPoints[0].recordings = ['recordings/widget/entry.session.json'];
    result = validatePortEvidence(goal, evidence, { root });
    assert.deepEqual(result.entryPoints, evidence.entryPoints);
    evidence.entryPoints[0].functions = ['unknown'];
    assert.throws(() => validatePortEvidence(goal, evidence, { root }), /unknown/u);
});

test('a malformed stored attestation cannot be counted as completed', (t) => {
    const { goal, evidence } = fixture(t);
    goal.evidence = evidence;
    assert.deepEqual([...completedFunctionNames(goal)], ['helper']);
    evidence.functions[0].callers = [];
    assert.deepEqual([...completedFunctionNames(goal)], []);
});
