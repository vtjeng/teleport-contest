import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateCase, observations, validateSpec, orderedObservations } from './structural-cases.mjs';
import { diagnosticEnvironment, executionContext } from './structural-context.mjs';

const recipe = () => ({ version: 5, segments: [{ seed: 1, datetime: '20000110090000', nethackrc: '', moves: ' ' }] });
const entry = () => ({ id: 'probe', recipe: recipe(), expectC: ['target reached'] });
const recording = () => ({ version: 5, segments: [{ ...recipe().segments[0], steps: [
    { key: null, screen: 'startup', rng: [], cursor: [0, 0, 1] },
    { key: ' ', screen: '\x1b[31mtarget reached', rng: [], cursor: [14, 0, 1] },
] }] });

test('setup evidence uses decoded actual C screens and zero-based indices', () => {
    assert.deepEqual(observations(recording(), ['target reached', 'absent']), [
        { text: 'target reached', steps: [1], onsets: [1] }, { text: 'absent', steps: [], onsets: [] },
    ]);
});

test('observation gates use ordered fresh onsets, not persistent historical text', () => {
    const trace = recording(); trace.segments[0].steps.push({ screen: 'target reached then setup', rng: [] });
    const seen = observations(trace, ['setup', 'target reached']);
    assert.deepEqual(seen[1].steps, [1, 2]);
    assert.deepEqual(seen[1].onsets, [1]);
    assert.equal(orderedObservations(seen), false);
    assert.equal(orderedObservations([...seen].reverse(), 2), true);
    assert.equal(orderedObservations([...seen].reverse(), 1), false);
});

test('effective environment excludes inherited C, loader and Node configuration', () => {
    const canonical = diagnosticEnvironment({});
    const dirty = diagnosticEnvironment({ NETHACKOPTIONS: '@foreign.rc', HACKOPTIONS: 'color', WIZKIT: '/tmp/kit',
        NODE_OPTIONS: '--require foreign.js', LD_PRELOAD: '/tmp/hook.so', TZ: 'Pacific/Honolulu', SECRET: 'private' });
    assert.deepEqual(dirty, canonical);
    assert.equal(diagnosticEnvironment({ SESSION_REPLAY_TIMEOUT_MS: '1000' }).SESSION_REPLAY_TIMEOUT_MS, '1000');
    assert.throws(() => diagnosticEnvironment({ SESSION_REPLAY_TIMEOUT_MS: '-1' }), /positive/u);
    assert.throws(() => executionContext('/tmp/not-the-executor-root'), /alternate root/u);
});

test('evaluator forwards only the canonical environment to the shared comparator', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'structural-env-'));
    try {
        await evaluateCase(entry(), dir, async (_recipe, environment, options) => {
            assert.deepEqual(environment, diagnosticEnvironment());
            assert.equal(environment.NETHACKOPTIONS, undefined);
            options.transformRecording(recording()); return { passed: true };
        });
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bounded specs reject answers, duplicate ids and unbounded input', () => {
    assert.equal(validateSpec({ version: 1, cases: [entry()] }).cases.length, 1);
    assert.throws(() => validateSpec({ version: 1, cases: [entry(), entry()] }), /duplicate/u);
    const long = entry(); long.recipe.segments[0].moves = '.'.repeat(2001);
    assert.throws(() => validateSpec({ version: 1, cases: [long] }), /2000/u);
    const answers = entry(); answers.recipe.segments[0].steps = recording().segments[0].steps;
    assert.throws(() => validateSpec({ version: 1, cases: [answers] }), /steps/u);
});

test('parity without reaching the required setup is not a passing target', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'structural-eval-'));
    try {
        const e = entry(); e.expectC = ['absent'];
        const actual = recording();
        const result = await evaluateCase(e, dir, async (_r, _env, options) => {
            assert.equal(options.transformRecording(actual), actual, 'must not alter the C oracle');
            return { passed: true };
        });
        assert.equal(result.status, 'setup-failed');
        assert.equal(result.error, null);
        assert.deepEqual(JSON.parse(readFileSync(join(dir, 'probe.session.json'))), actual);
        await assert.rejects(evaluateCase(e, dir), /EEXIST/u);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('runner failures remain separate from observed divergences and retain C evidence', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'structural-error-'));
    try {
        const result = await evaluateCase(entry(), dir, async (_r, _env, options) => {
            options.transformRecording(recording());
            throw new Error('worker failed');
        });
        assert.equal(result.status, 'runner-error');
        assert.equal(result.result, null);
        assert.equal(result.error, 'worker failed');
        assert.equal(result.recordingSha256.length, 64);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('observed mismatches preserve the original comparator result', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'structural-divergence-'));
    try {
        const mismatch = { passed: false, screenMismatch: { index: 1, row: 0, column: 5 } };
        const result = await evaluateCase(entry(), dir, async (_r, _env, options) => {
            options.transformRecording(recording()); return mismatch;
        });
        assert.equal(result.status, 'divergence');
        assert.deepEqual(result.result, mismatch);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('caught JS exceptions returned by the comparator remain runner errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'structural-returned-error-'));
    try {
        const failure = { passed: false, error: 'input queue exhausted', screenMismatch: { index: 1 } };
        const result = await evaluateCase(entry(), dir, async (_r, _env, options) => {
            options.transformRecording(recording()); return failure;
        });
        assert.equal(result.status, 'runner-error');
        assert.equal(result.error, failure.error);
        assert.deepEqual(result.result, failure);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
