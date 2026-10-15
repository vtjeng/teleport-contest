import assert from 'node:assert/strict';
import test from 'node:test';
import { groupCases, combineCases } from './synthetic-ci.mjs';

// Three cases per job force a group to cross a historical batch boundary.
const batches = [
    { batch: 'v10', cases: [{ id: 'a' }, { id: 'b' }] },
    { batch: 'v2', cases: [{ id: 'a' }, { id: 'b' }] },
];
test('synthetic jobs take consecutive cases in numeric batch order', () => {
    assert.deepEqual(groupCases(batches, 3), [
        { group: 1, cases: [{ batch: 'v2', id: 'a' }, { batch: 'v2', id: 'b' }, { batch: 'v10', id: 'a' }] },
        { group: 2, cases: [{ batch: 'v10', id: 'b' }] },
    ]);
});

test('default synthetic grouping takes 300 cases per job and preserves the final partial job', () => {
    // Two full 300-case jobs and one trailing case exercise the requested size
    // and ensure a remainder is neither omitted nor duplicated.
    const cases = Array.from({length: 601}, (_, index) => ({id: `case-${index}`}));
    const groups = groupCases([{batch: 'v1', cases}]);
    assert.deepEqual(groups.map(group => group.cases.length), [300, 300, 1]);
    assert.deepEqual(groups.flatMap(group => group.cases), cases.map(entry => ({batch: 'v1', ...entry})));
});

test('synthetic results keep repeated case IDs separate and reject missing or stale work', () => {
    const groups = groupCases(batches, 3);
    const identity = { sha: 'candidate' }; // Distinguishes this candidate from stale artifacts.
    const parts = groups.map(group => ({ group: group.group, identity,
        results: group.cases.map(({ batch, id }) => ({ batch, result: {
            id, passed: batch === 'v2', // The same IDs pass in one batch and mismatch in another.
            metrics: { screens: { matched: batch === 'v2' ? 2 : 1, total: 2 } },
            error: id === 'b' && batch === 'v10' ? 'measured failure' : null,
        } })) }));
    const combined = combineCases(groups, parts, identity);
    assert.equal(combined.size, 4); // Two cases from each of two batches.
    for (const { results } of parts)
        for (const { batch, result } of results)
            assert.deepEqual(combined.get(`${batch}/${result.id}`), result);
    assert.throws(() => combineCases(groups, parts.slice(1), identity), /missing/u);
    assert.throws(() => combineCases(groups, parts, { sha: 'stale' }), /stale/u);
    const omitted = structuredClone(parts);
    omitted[0].results.pop();
    assert.throws(() => combineCases(groups, omitted, identity), /omitted/u);
    const duplicate = structuredClone(parts);
    duplicate[0].results[1] = duplicate[0].results[0];
    assert.throws(() => combineCases(groups, duplicate, identity), /duplicated/u);
});
