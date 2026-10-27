import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { classify, digest, inspectWitness, ledgerRow, makeRecipe, percentSites, summarizeAttempts, summarizeGateOutcomes } from './lua-discovery.mjs';

const program = 'bigrm-12.lua';
const source = 'if percent(20) then\n   if percent(50) then\n';
const recipe = makeRecipe(program, 19711001);
const result = { passed: true, lengths: { screens: { c: 3, js: 3 } } };
const fixtureStep = recipe.segments[0].moves.indexOf(`${program}\n`) + `${program}\n`.length;
const recording = { segments: [{ steps: [...Array.from({length: fixtureStep}, () => ({rng: []})), { rng: [
    'rn2(100)=15 @ percent src=nhlib.lua:15 parent=lua(bigrm-12.lua:1)',
    'rn2(100)=71 @ percent src=nhlib.lua:15 parent=lua(bigrm-12.lua:2)',
] }] }] };

test('literal gate inventory preserves nested line and threshold', () => {
    assert.deepEqual(percentSites(source), [{ line: 1, threshold: 20 }, { line: 2, threshold: 50 }]);
});
test('runtime witnesses report taken and untaken gates with ordered prefix evidence', () => {
    const witness = inspectWitness(program, source, recipe, recording, result);
    assert.deepEqual(witness.witnesses.map(w => w.taken), [true, false]);
    assert.equal(witness.route, 'wizard-des');
    assert.equal(classify(result, witness), 'matching');
    assert.equal(witness.uncoveredPercentSites.length, 0);
});
test('prior divergence prevents JS branch attribution; mismatch remains in raw result', () => {
    const failed = { ...result, passed: false, rngMismatch: { index: 0 } };
    assert.equal(classify(failed, inspectWitness(program, source, recipe, recording, failed)), 'unresolved');
});
test('another program is unreachable, missing attribution unresolved, empty output never passes', () => {
    const witness = inspectWitness('bigrm-11.lua', source, recipe, recording, result);
    assert.equal(classify(result, { ...witness, otherProgramObserved: true }), 'unreachable');
    assert.equal(classify(result, { ...witness, otherProgramObserved: false }), 'unresolved');
    assert.equal(classify({ ...result, lengths: {} }, witness), 'unresolved');
    assert.equal(classify({ error: 'timeout' }, witness), 'infrastructure-failed');
});
test('input identity is stable and seed-sensitive', () => {
    assert.equal(digest(recipe), digest(makeRecipe(program, 19711001)));
    assert.notEqual(digest(recipe), digest(makeRecipe(program, 19711002)));
    assert.throws(() => makeRecipe(program, -1));
});

test('bigrm-12 recognizer is scoped to the submit boundary and pins source', () => {
    const lua = readFileSync('nethack-c/upstream/dat/bigrm-12.lua', 'utf8');
    const submit = recipe.segments[0].moves.indexOf(`${program}\n`) + `${program}\n`.length;
    const steps = Array.from({ length: submit + 1 }, () => ({ rng: [] }));
    const entry = n => `rn2(100)=${n} @ random src=nhlib.lua:10 parent=percent(nhlib.lua:44)`;
    steps[0].rng = [entry(3)]; // Startup must not be mistaken for the gate.
    steps[submit].rng = [45, 55, 12, 91, 36].map(entry);
    const c = { segments: [{ steps }] };
    const w = inspectWitness(program, lua, recipe, c, result);
    assert.deepEqual(w.witnesses.map(g => [g.line, g.taken]), [[33, false], [43, false], [49, true], [51, false], [57, false]]);
    assert.equal(w.witnesses[0].index, 1);
    assert.equal(classify(result, w), 'matching');
    assert.equal(classify(result, inspectWitness(program, lua + '\n', recipe, c, result)), 'unresolved');
    steps[submit].rng.pop();
    assert.equal(classify(result, inspectWitness(program, lua, recipe, c, result)), 'unresolved');
});

function exportAttempts(attempts) {
    return ledgerRow({ id: 'case', program, attempts, reproducibleMismatch: false }, 'commit', '/run');
}

test('ledger retains pass-then-mismatch disagreement instead of first-pass credit', () => {
    const attempts = [{ status: 'matching', result }, { status: 'mismatch', result: { passed: false } }];
    const row = exportAttempts(attempts);
    assert.equal(row.status, 'unresolved');
    assert.match(row.observed_difference, /repeat disagreement; matching=1, mismatch=1/u);
    assert.deepEqual(summarizeAttempts(attempts), {
        status: 'unresolved', counts: { matching: 1, mismatch: 1 }, disagreement: true,
    });
    assert.equal(exportAttempts(attempts.toReversed()).status, row.status);
});

test('ledger preserves a failed repeat distinctly from behavioral disagreement', () => {
    const attempts = [{ status: 'matching', result }, { status: 'infrastructure-failed', error: 'timeout' }];
    const row = exportAttempts(attempts);
    assert.equal(row.status, 'infrastructure-failed');
    assert.match(row.observed_difference, /repeat disagreement; matching=1, infrastructure-failed=1/u);
    assert.equal(exportAttempts(attempts.toReversed()).status, row.status);
    assert.equal(exportAttempts([{ status: 'matching', result }, { status: 'uncovered' }]).status, 'unresolved');
    assert.equal(exportAttempts([]).status, 'uncovered');
    assert.equal(exportAttempts([{ status: 'matching', result }, { status: 'matching', result }]).status, 'matching');
});

test('prior RNG divergence retains reached C gates without comparable coverage credit', () => {
    const failed = { ...result, passed: false, rngMismatch: { index: 0 } };
    const witness = inspectWitness(program, source, recipe, recording, failed);
    const coverage = summarizeGateOutcomes([{ program, attempts: [{ status: 'unresolved', result: failed, witness }] }]);
    assert.deepEqual(coverage.gateOutcomes, {});
    assert.deepEqual(coverage.cGateOutcomes, { 'bigrm-12.lua:1': [true], 'bigrm-12.lua:2': [false] });
    assert.deepEqual(coverage.cOnlyGateOutcomes, coverage.cGateOutcomes);
    assert.equal(witness.uncoveredPercentSites.length, 2);
    assert.equal(witness.cUncoveredPercentSites.length, 0);
});

test('only agreeing prefix gates get comparable credit; C-only outcomes remain separate', () => {
    const failed = { ...result, passed: false, rngMismatch: { index: 1 } };
    const witness = inspectWitness(program, source, recipe, recording, failed);
    const coverage = summarizeGateOutcomes([{ program, attempts: [{ status: 'mismatch', result: failed, witness }] }]);
    assert.deepEqual(coverage.gateOutcomes, { 'bigrm-12.lua:1': [true] });
    assert.deepEqual(coverage.cOnlyGateOutcomes, { 'bigrm-12.lua:2': [false] });
    assert.deepEqual(summarizeGateOutcomes([{ program, attempts: [{ status: 'infrastructure-failed', error: 'timeout', witness }] }]).gateOutcomes, {});
});
