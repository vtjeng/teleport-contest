import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mutateRecipe, divergenceSignature, reductionAccepted, negativeCacheKey,
    validatePlan, runFamilies, reproducibility, runPipeline } from './run-structural-pipeline.mjs';

const recipe = moves => ({ version: 5, segments: [{ seed: 1, datetime: '20000110090000', nethackrc: '', moves }] });
function evidence(id = 'family-base', status = 'divergence', step = 6) {
    return { id, status, observations: [{ text: 'branch reached', steps: [1] }],
        result: { passed: status === 'parity', rngMismatch: status === 'divergence' ? {
            cEntry: 'rnd(2)=1', jsEntry: 'rn2(7)=0', cCaller: 'release(mon.c:10)', location: { stepIndex: step },
        } : null } };
}
const plan = () => ({ version: 1, maxRuns: 8, families: [{ id: 'family', signals: ['file.c:fn:async:release'],
    recipe: recipe('abcdef'), expectC: ['branch reached'],
    reductions: [{ id: 'remove-a', changes: [{ field: 'moves', from: 'a', to: '' }] },
        { id: 'remove-b', changes: [{ field: 'moves', from: 'b', to: '' }] }],
    controls: [{ id: 'nearby', fromMinimized: true, changes: [{ field: 'moves', set: '.' }], expectC: [] }] }] });

test('declared mutations preserve source recipe, reject missing replacements and cannot modify state', () => {
    const original = recipe('abcabc');
    assert.equal(mutateRecipe(original, [{ field: 'moves', from: 'ab', to: 'x', all: true }]).segments[0].moves, 'xcxc');
    assert.equal(original.segments[0].moves, 'abcabc');
    assert.throws(() => mutateRecipe(original, [{ field: 'moves', from: 'missing', to: '' }]), /missing/u);
    assert.throws(() => mutateRecipe(original, [{ field: 'state', set: '{}' }]), /field/u);
});

test('first-divergence grouping ignores offsets/draw values but separates source operations and families', () => {
    const original = evidence(), shortened = evidence('short', 'divergence', 4);
    shortened.result.rngMismatch.cEntry = 'rnd(2)=2';
    const signature = divergenceSignature('family', original);
    assert.equal(divergenceSignature('family', shortened), signature);
    assert.notEqual(divergenceSignature('other', shortened), signature);
    shortened.result.rngMismatch.cCaller = 'unrelated(mon.c:20)';
    assert.notEqual(divergenceSignature('family', shortened), signature);
});

test('reduction cannot replace target mismatch with parity, error, setup failure or a later target', () => {
    const signature = divergenceSignature('family', evidence());
    for (const status of ['parity', 'runner-error', 'setup-failed'])
        assert.equal(reductionAccepted('family', signature, evidence('changed', status)), false);
    const late = evidence(); late.observations[0].steps = [8];
    assert.equal(reductionAccepted('family', signature, late), false);
});

test('negative cache keys bind source/oracle identity, exact recipe, target and expected branch', () => {
    const key = negativeCacheKey('sha1', 'family', recipe('abc'), 'signature', ['branch']);
    assert.notEqual(key, negativeCacheKey('sha2', 'family', recipe('abc'), 'signature', ['branch']));
    assert.notEqual(key, negativeCacheKey('sha1', 'family', recipe('abcd'), 'signature', ['branch']));
    assert.notEqual(key, negativeCacheKey('sha1', 'family', recipe('abc'), 'different', ['branch']));
    assert.notEqual(key, negativeCacheKey('sha1', 'family', recipe('abc'), 'signature', ['other']));
});

test('plan enforces explicit bounded families, calls and observations', () => {
    assert.equal(validatePlan(plan()).maxRuns, 8);
    const bad = plan(); bad.maxRuns = 33;
    assert.throws(() => validatePlan(bad), /1\.\.32/u);
    bad.maxRuns = 8; bad.families[0].expectC = [];
    assert.throws(() => validatePlan(bad), /observations/u);
});

function mockEvaluator(calls, failureStatus = 'setup-failed') {
    return async (entry, output) => {
        calls.push(entry.id);
        const moves = entry.recipe.segments[0].moves;
        const status = moves === '.' ? 'parity' : moves === 'cdef' ? failureStatus : 'divergence';
        const result = evidence(entry.id, status, moves.length);
        for (const [suffix, value] of [['recipe.json', entry.recipe], ['session.json', { captured: moves }], ['result.json', result]])
            writeFileSync(join(output, `${entry.id}.${suffix}`), JSON.stringify(value));
        return result;
    };
}

test('end-to-end reduction retains cause, keeps rejected evidence, caches negatives and reproduces the witness', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-pipeline-'));
    try {
        const cold = join(root, 'cold'), warm = join(root, 'warm'), stale = join(root, 'stale');
        for (const dir of [cold, warm, stale]) mkdirSync(dir);
        const calls = [];
        const first = await runFamilies(plan(), { output: cold, identity: 'same', evaluate: mockEvaluator(calls), log() {} });
        assert.equal(first.runs, 4);
        assert.equal(first.families[0].minimized.keys, 5);
        assert.deepEqual(first.families[0].reductions.map(r => r.accepted), [true, false]);
        assert.equal(first.groups.length, 1);
        assert.equal(first.groups[0].hasPassingControl, true);
        const second = await runFamilies(plan(), { output: warm, identity: 'same', negativeCache: first.negativeCache,
            evaluate: mockEvaluator(calls), log() {} });
        assert.equal(second.runs, 3);
        assert.equal(second.cacheHits, 1);
        assert.deepEqual(readFileSync(join(cold, 'family-reduce-remove-b.session.json')),
            readFileSync(join(warm, 'family-reduce-remove-b.session.json')), 'warm bundle retains original negative oracle bytes');
        assert.equal(reproducibility({ ...first, identity: 'same' }, { ...second, identity: 'same' }).same, true);
        const third = await runFamilies(plan(), { output: stale, identity: 'changed-source', negativeCache: first.negativeCache,
            evaluate: mockEvaluator(calls), log() {} });
        assert.equal(third.runs, 4);
        assert.equal(third.cacheHits, 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('strict oracle budget never launches excess cases or calls untested controls passing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-budget-'));
    try {
        const limited = plan(); limited.maxRuns = 2;
        const calls = [];
        const result = await runFamilies(limited, { output: root, identity: 'same', evaluate: mockEvaluator(calls), log() {} });
        assert.equal(calls.length, 2);
        assert.equal(result.families[0].hasPassingControl, true);
        assert.equal(calls[1], 'family-control-nearby');
        assert.deepEqual(result.families[0].reductions, []);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('runner errors are retained but never reused as negative source evidence', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-retry-'));
    try {
        const result = await runFamilies(plan(), { output: root, identity: 'same', evaluate: mockEvaluator([], 'runner-error'), log() {} });
        assert.deepEqual(result.negativeCache.entries, {});
        assert(result.oracles.some(e => e.status === 'runner-error'));
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('stale signal selection stops before any oracle call', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-stale-'));
    try {
        const calls = [];
        await assert.rejects(runFamilies(plan(), { output: root, identity: 'same', availableSignals: new Set(),
            evaluate: mockEvaluator(calls), log() {} }), /stale\/missing/u);
        assert.equal(calls.length, 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('parity families never label matching null signatures as reproduced differences', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-parity-'));
    try {
        const input = plan(); input.families[0].recipe = recipe('.');
        input.families[0].variants = [{ id: 'same', changes: [] }];
        const result = await runFamilies(input, { output: root, identity: 'same', evaluate: mockEvaluator([]), log() {} });
        assert.equal(result.groups.length, 0);
        assert.equal(result.families[0].variants[0].sameSignature, false);
        assert.equal(result.families[0].minimized.confirmedDivergence, false);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('reduction signatures preserve cell location/styles, cursors, animation and relative timing', () => {
    const original = evidence();
    original.result.screenMismatch = { location: { stepIndex: 6 }, column: 1, row: 0, cCell: { ch: 'a', fg: 1 }, jsCell: { ch: 'b' } };
    original.result.cursorMismatch = { location: { stepIndex: 6 }, cCursor: [1, 0, 1], jsCursor: [2, 0, 1] };
    original.result.animMismatch = { location: { stepIndex: 7 }, kind: 'count', cCount: 0, jsCount: 1 };
    const key = divergenceSignature('family', original);
    const changes = [e => { e.result.screenMismatch.column = 70; }, e => { e.result.screenMismatch.cCell.fg = 9; },
        e => { e.result.cursorMismatch.cCursor = [2, 10, 1]; }, e => { e.result.animMismatch.jsCount = 2; },
        e => { e.result.animMismatch.location.stepIndex = 8; }];
    for (const change of changes) {
        const candidate = structuredClone(original); change(candidate);
        assert.equal(reductionAccepted('family', key, candidate), false);
    }
});

test('out-of-order or merely persistent target messages cannot confirm reductions', () => {
    const e = evidence();
    e.observations = [{ text: 'setup', steps: [4], onsets: [4] }, { text: 'effect', steps: [2, 3, 4], onsets: [2] }];
    assert.equal(divergenceSignature('family', e), null);
});

test('reproducibility detects parity-to-error, failed variants and changed reduction decisions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-reproduction-'));
    try {
        const baseline = { ...await runFamilies(plan(), { output: root, identity: 'same', evaluate: mockEvaluator([]), log() {} }), identity: 'same' };
        for (const change of [r => { r.oracles[0].status = 'runner-error'; },
            r => { r.families[0].variants = [{ id: 'changed', sameSignature: false }]; },
            r => { r.families[0].reductions[0].accepted = false; }]) {
            const modified = structuredClone(baseline); change(modified);
            assert.equal(reproducibility(baseline, modified).same, false);
        }
        await assert.rejects(runPipeline(plan(), join(root, 'other'), { root }), /alternate root/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('negative cache rejects missing receipts and detached evidence before restoring files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-cache-integrity-'));
    try {
        const cold = join(root, 'cold'); mkdirSync(cold);
        const result = await runFamilies(plan(), { output: cold, identity: 'same', evaluate: mockEvaluator([]), log() {} });
        for (const [i, corrupt] of [e => { e.files = []; }, e => { e.evidence.status = 'parity'; }].entries()) {
            const cache = structuredClone(result.negativeCache);
            corrupt(Object.values(cache.entries)[0]);
            const output = join(root, `bad-${i}`); mkdirSync(output);
            await assert.rejects(runFamilies(plan(), { output, identity: 'same', negativeCache: cache,
                evaluate: mockEvaluator([]), log() {} }), /negative cache/u);
        }
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('passing base promotes each unseen variant with its exact recipe and reachability contract', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-promote-'));
    try {
        const input = plan(); input.maxRuns = 10;
        input.families[0].recipe = recipe('.'); input.families[0].reductions = [];
        input.families[0].variants = [
            { id: 'first', recipe: recipe('abcdef'), expectC: ['variant branch'] },
            { id: 'second', recipe: recipe('uvwxyz'), expectC: ['other branch'] },
        ];
        const evaluator = async entry => {
            const result = evidence(entry.id, entry.recipe.segments[0].moves === '.' ? 'parity' : 'divergence');
            result.observations = entry.expectC.map(text => ({ text, steps: [1] }));
            if (entry.recipe.segments[0].moves === 'uvwxyz') result.result.rngMismatch.cCaller = 'other(mon.c:20)';
            return result;
        };
        const result = await runFamilies(input, { output: root, identity: 'same', evaluate: evaluator, log() {} });
        assert.equal(result.groups.length, 2);
        assert.equal(result.families[0].candidates.length, 2);
        assert.deepEqual(result.families[0].candidates.map(c => c.expectC), [['variant branch'], ['other branch']]);
        assert(result.families[0].candidates.every(c => c.hasPassingControl));
        assert.equal(JSON.parse(readFileSync(join(root, 'family-variant-first-witness.recipe.json'))).segments[0].moves, 'abcdef');
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('cross-family grouping retains per-witness controls and never certifies an untested member', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-groups-'));
    try {
        const input = plan(); input.maxRuns = 3;
        input.families[0].reductions = [];
        input.families.push({ ...structuredClone(input.families[0]), id: 'other' });
        const result = await runFamilies(input, { output: root, identity: 'same', evaluate: mockEvaluator([]), log() {} });
        assert.equal(result.groups.length, 1);
        assert.equal(result.groups[0].members.length, 2);
        assert.equal(result.groups[0].hasPassingControl, false);
        assert.equal(result.runs, 3);
        assert.equal(result.oracles[1].id, 'other-base', 'all probes precede follow-up');
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('promotion cap preserves unexplored differences as pending instead of dropping them', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-cap-'));
    try {
        const input = plan(); input.maxPromotions = 1; input.families[0].reductions = [];
        input.families[0].variants = [{ id: 'new', recipe: recipe('new') }];
        const result = await runFamilies(input, { output: root, identity: 'same', evaluate: async entry => {
            const e = evidence(entry.id);
            if (entry.recipe.segments[0].moves === 'new') e.result.rngMismatch.cCaller = 'another(mon.c:30)';
            return e;
        }, log() {} });
        assert.equal(result.promoted, 1);
        assert(result.pending.some(p => p.origin === 'variant-new' && p.reason === 'promotion-cap'));
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('variant cannot erase the nonempty target reachability contract', () => {
    const input = plan(); input.families[0].recipe = recipe('.');
    input.families[0].variants = [{ id: 'ungated', recipe: recipe('abcdef'), expectC: [] }];
    assert.throws(() => validatePlan(input), /nonempty/u);
    const ungated = evidence(); ungated.observations = [];
    assert.equal(divergenceSignature('family', ungated), null);
});

test('variant-inapplicable controls remain failures without aborting other evidence', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-control-'));
    try {
        const input = plan(); input.families[0].recipe = recipe('foo'); input.families[0].reductions = [];
        input.families[0].variants = [{ id: 'new', recipe: recipe('bar') }];
        input.families[0].controls = [{ id: 'replace', fromMinimized: true, changes: [{ field: 'moves', from: 'foo', to: '.' }] }];
        const result = await runFamilies(input, { output: root, identity: 'same', evaluate: async entry =>
            evidence(entry.id, entry.recipe.segments[0].moves === 'foo' ? 'parity' : 'divergence'), log() {} });
        assert.equal(result.families[0].candidates[0].controls[0].status, 'inapplicable');
        assert.equal(result.families[0].candidates[0].hasPassingControl, false);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('nested-prefix family IDs cannot leak observations into different signal groups', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-membership-'));
    try {
        const input = plan(); input.families[0].id = 'probe'; input.families[0].reductions = [];
        input.families.push({ ...structuredClone(input.families[0]), id: 'probe-child', signals: ['different-source-signal'] });
        const result = await runFamilies(input, { output: root, identity: 'same', evaluate: mockEvaluator([]), log() {} });
        assert.equal(result.groups.length, 2);
        const group = result.groups.find(g => g.members[0].family === 'probe');
        assert(!group.observations.some(id => id.startsWith('probe-child-')));
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unrun controls and reductions are explicitly partial under a hard budget', async () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-partial-'));
    try {
        const input = plan(); input.maxRuns = 1;
        const result = await runFamilies(input, { output: root, identity: 'same', evaluate: mockEvaluator([]), log() {} });
        assert.equal(result.families[0].candidates[0].evaluation, 'partial');
        assert(result.pending.some(p => p.kind === 'controls'));
        assert.equal(result.families[0].hasPassingControl, false);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
