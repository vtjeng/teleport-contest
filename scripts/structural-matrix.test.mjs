import assert from 'node:assert/strict';
import test from 'node:test';
import { expandFamily, expandMatrix, GENERATORS } from './structural-matrix.mjs';
const generated = { version: 5, segments: [{ seed: 1, datetime: '20000110090000', nethackrc: 'OPTIONS=!legacy\n', moves: '.x' }] };
const config = () => ({ id: 'sample', generator: 'attributes', rows: [0], signals: ['audit:item'], expectC: ['target'],
    axes: { seed: [1, 2], options: [{ id: 'base', append: '' }, { id: 'bones', append: 'OPTIONS=!bones\n' }],
        commands: [{ id: 'base', changes: [] }, { id: 'wait', changes: [{ field: 'moves', append: '.' }] }] } });
test('matrix expands seed/options/commands in declared order with exact generator provenance', () => {
    const a = expandFamily(config(), generated, { sha256: 'generator-bytes' });
    assert.equal(a.variants.length, 7);
    assert.equal(a.recipe.segments[0].seed, 1);
    assert.equal(a.variants.at(-1).recipe.segments[0].seed, 2);
    assert.equal(a.variants.at(-1).recipe.segments[0].moves, '.x.');
    assert.equal(a.scenario.generator.sha256, 'generator-bytes');
    assert.deepEqual(a, expandFamily(config(), generated, { sha256: 'generator-bytes' }));
    assert.equal(generated.segments[0].moves, '.x');
});
test('matrix rejects duplicate recipes, unsupported state injection, overflow and absent rows', () => {
    const duplicate = config(); duplicate.axes.seed = [1, 1];
    assert.throws(() => expandFamily(duplicate, generated, {}), /duplicate/u);
    const overflow = config(); overflow.axes.seed.push(3);
    assert.throws(() => expandFamily(overflow, generated, {}), /9 probes/u);
    const state = config(); state.axes.state = [{}];
    assert.throws(() => expandFamily(state, generated, {}), /unsupported/u);
    const missing = config(); missing.rows = [10];
    assert.throws(() => expandFamily(missing, generated, {}), /absent/u);
});
test('matrix reserves follow-up runs and allows only named existing generators', async () => {
    const spec = { version: 1, maxRuns: 10, families: [config()] };
    await assert.rejects(expandMatrix(spec, { load: () => generated }), /follow-up/u);
    spec.maxRuns = 16;
    const plan = await expandMatrix(spec, { load: () => generated });
    assert.equal(plan.matrix.probes, 8);
    spec.families[0].generator = 'arbitrary-code';
    await assert.rejects(expandMatrix(spec), /allowlisted/u);
});
test('allowlisted generator exports exist and return clean multi-segment recipes', async () => {
    for (const generator of Object.values(GENERATORS)) {
        const module = await import(`../${generator.module}`);
        assert.equal(typeof module[generator.loader], 'function');
        assert.equal(module[generator.loader]().version, 5);
    }
});

test('matrix rejects negative, fractional and nonnumeric follow-up budgets before loading', async () => {
    for (const reserve of [-1, 1.5, '4', 33]) {
        await assert.rejects(expandMatrix({ version: 1, maxRuns: 32, reserveFollowupRuns: reserve, families: [config()] },
            { load: () => { throw new Error('must not load'); } }), /integer maxRuns/u);
    }
});
