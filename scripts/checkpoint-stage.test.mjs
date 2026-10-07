import assert from 'node:assert/strict';
import test from 'node:test';
import { checkpointCommands, checkpointGroups } from './checkpoint-checks.mjs';
import { combineStages, trialGroups, TEST_SHARDS, runIdentity } from './checkpoint-stage.mjs';

// A fixed commit and workflow attempt let tests distinguish stale/mixed evidence.
const COMMIT = 'a'.repeat(40);
const RUN = { provider: 'github', repository: 'fixture/project', id: '123', attempt: '1' };

function stages() {
    return Object.entries(trialGroups()).map(([group, commands]) => ({
        version: 1, group, commit: COMMIT, run: { ...RUN },
        results: commands.map(({ label, informational = false }) => ({
            label, passed: true, informational, skipped: false, detail: '',
        })),
    }));
}

test('CI includes every local checkpoint check and scans before checking input boundaries', () => {
    const groups = checkpointGroups();
    assert.deepEqual(Object.keys(groups), ['tests', 'sources', 'score', 'recordings', 'scan']);
    // Summarizer closures are recreated on each call; compare command identity.
    const identities = commands => commands.map(({ summarize, ...command }) =>
        ({ ...command, summarize: Boolean(summarize) }));
    assert.deepEqual(identities(Object.values(groups).flat()), identities(checkpointCommands()));
    assert.deepEqual(groups.scan.map(({ label }) => label), ['session scan', 'end-of-input over-read']);
});

test('CI jobs may finish in any order without changing the combined checkpoint', () => {
    const combined = combineStages(stages().reverse(), COMMIT, RUN);
    assert.deepEqual(combined.map(({ label }) => label), checkpointCommands().map(({ label }) => label));
    assert.ok(combined.every(({ passed }) => passed));
});

test('missing jobs or results from another candidate cannot complete the checkpoint', () => {
    const mutations = [
        parts => parts.pop(), // Missing scan cannot authorize acceptance.
        parts => parts.push(parts[0]), // A duplicate cannot fill a missing group.
        parts => { parts[0].group = 'unknown'; },
        parts => { parts[0].commit = 'b'.repeat(40); }, // A different candidate.
        parts => { parts[0].run.attempt = '2'; }, // Results from a different retry.
        parts => { parts[0].version = 0; }, // Unsupported result schema.
    ];
    for (const mutate of mutations) {
        const parts = stages();
        mutate(parts);
        assert.throws(() => combineStages(parts, COMMIT, RUN));
    }
});

test('a job cannot omit a required check or relabel it as optional', () => {
    const mutations = [
        parts => parts[0].results.pop(),
        parts => parts[0].results.push(parts[0].results[0]),
        parts => { parts[0].results[0].label = 'different test'; },
        parts => { parts[0].results[0].informational = true; },
        parts => { parts[0].results[0].passed = 'true'; },
        parts => { parts[0].results[0].skipped = 'false'; },
        parts => { parts[0].results[0].skipped = true; }, // A required test shard cannot be skipped.
    ];
    for (const mutate of mutations) {
        const parts = stages();
        mutate(parts);
        assert.throws(() => combineStages(parts, COMMIT, RUN));
    }
});

test('the CI test jobs request each Node test shard exactly once', () => {
    const groups = trialGroups();
    assert.deepEqual(Object.keys(groups).filter(group => group.startsWith('tests-')),
        Array.from({ length: TEST_SHARDS }, (_, index) => `tests-${index + 1}`));
    for (let index = 1; index <= TEST_SHARDS; index++) {
        assert.deepEqual(groups[`tests-${index}`][0].args,
            ['scripts/run-test-suite.mjs', 'default', '--shard', `${index}/${TEST_SHARDS}`]);
    }
});

test('GitHub results identify their repository, workflow run, and attempt', () => {
    assert.deepEqual(runIdentity({}), { provider: 'local' });
    assert.deepEqual(runIdentity({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: RUN.repository,
        GITHUB_RUN_ID: RUN.id, GITHUB_RUN_ATTEMPT: RUN.attempt }), RUN);
    assert.throws(() => runIdentity({ GITHUB_ACTIONS: 'true' }), /run ID/u);
});

test('one failed test job keeps the combined checkpoint red', () => {
    const parts = stages();
    parts[0].results[0].passed = false;
    assert.equal(combineStages(parts, COMMIT, RUN)[0].passed, false);
});

test('one failed recordings batch keeps the complete corpus check red', () => {
    const parts = stages();
    parts.find(part => part.group === 'recordings-1').results[0].passed = false;
    const corpus = combineStages(parts, COMMIT, RUN).find(result => result.label === 'recordings corpus');
    assert.equal(corpus.passed, false);
});
