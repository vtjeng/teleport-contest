import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildTestSuites,
    testFilesForSuite,
} from './test-suites.mjs';

test('the default suite admits ordinary tests and excludes registered suites',
    () => {
        // These three names represent one ordinary test, the fast mutator
        // contract, and the dedicated lifecycle suite respectively.
        const discovered = [
            'scripts/game.test.mjs',
            'scripts/mutate-sites.test.mjs',
            'scripts/mutate-sites.integration.mjs',
        ];
        const dedicated = {
            mutationRunner: ['scripts/mutate-sites.integration.mjs'],
        };
        const suites = buildTestSuites(discovered, dedicated, {
            exists: () => true,
        });

        assert.deepEqual(suites.default, discovered.slice(0, 2));
        assert.deepEqual(suites.mutationRunner,
            ['scripts/mutate-sites.integration.mjs']);
        assert.deepEqual(suites.all, [
            ...discovered.slice(0, 2),
            'scripts/mutate-sites.integration.mjs',
        ]);
    });

test('suite registration rejects missing and duplicate dedicated files', () => {
    // The first fixture supplies the same path to two suites; the second marks
    // the one registered path absent from disk.
    assert.throws(() => buildTestSuites([], {
        one: ['scripts/slow.integration.mjs'],
        two: ['scripts/slow.integration.mjs'],
    }, { exists: () => true }), /registered in both one and two/u);

    assert.throws(() => buildTestSuites([], {
        one: ['scripts/missing.integration.mjs'],
    }, { exists: () => false }), /registered test does not exist/u);
});

test('the repository registry selects each named command suite', () => {
    const ordinary = testFilesForSuite('default');
    const dedicated = testFilesForSuite('mutation-runner');
    const all = testFilesForSuite('all');

    assert.equal(ordinary.includes('scripts/mutate-sites.test.mjs'), true);
    assert.equal(
        ordinary.includes('scripts/mutate-sites.integration.mjs'), false);
    assert.deepEqual(dedicated, ['scripts/mutate-sites.integration.mjs']);
    assert.equal(all.length, ordinary.length + dedicated.length);
    assert.throws(() => testFilesForSuite('unknown'), /unknown test suite/u);
});
