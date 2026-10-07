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

test('synthetic results keep repeated case IDs separate and reject missing or stale work', () => {
    const groups = groupCases(batches, 3);
    const identity = { sha: 'candidate' }; // Distinguishes this candidate from stale artifacts.
    const parts = groups.map(group => ({ group: group.group, identity,
        results: group.cases.map(({ batch, id }) => ({ batch, result: { id } })) }));
    assert.equal(combineCases(groups, parts, identity).size, 4);
    assert.throws(() => combineCases(groups, parts.slice(1), identity), /missing/u);
    assert.throws(() => combineCases(groups, parts, { sha: 'stale' }), /stale/u);
    const omitted = structuredClone(parts);
    omitted[0].results.pop();
    assert.throws(() => combineCases(groups, omitted, identity), /omitted/u);
    const duplicate = structuredClone(parts);
    duplicate[0].results[1] = duplicate[0].results[0];
    assert.throws(() => combineCases(groups, duplicate, identity), /duplicated/u);
});
