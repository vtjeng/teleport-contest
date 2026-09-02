import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    buildTestSuites,
    strayTestFiles,
    testFilesForSuite,
} from './test-suites.mjs';

test('the default suite admits ordinary tests and excludes registered suites',
    () => {
        // Two ordinary tests and one dedicated suite entry exercise the
        // partition: discovered files stay in default unless a dedicated
        // suite claims them.
        const discovered = [
            'scripts/color.test.mjs',
            'scripts/game.test.mjs',
            'scripts/slow.integration.mjs',
        ];
        const dedicated = {
            lifecycle: ['scripts/slow.integration.mjs'],
        };
        const suites = buildTestSuites(discovered, dedicated, {
            exists: () => true,
        });

        assert.deepEqual(suites.default, discovered.slice(0, 2));
        assert.deepEqual(suites.lifecycle,
            ['scripts/slow.integration.mjs']);
        assert.deepEqual(suites.all, [
            ...discovered.slice(0, 2),
            'scripts/slow.integration.mjs',
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

test('the repository registry lists all discovered tests with no dedicated suites',
    () => {
        // With DEDICATED_TEST_SUITES empty, every discovered test file
        // lands in the default suite and `all` matches it.
        const ordinary = testFilesForSuite('default');
        const all = testFilesForSuite('all');

        assert.equal(all.length, ordinary.length);
        assert.throws(() => testFilesForSuite('unknown'), /unknown test suite/u);
    });

test('the stray-test scan reports test files outside the discovered roots',
    () => {
        // A tree with one discovered root, one stray directory, one skipped
        // directory, and one dot-directory: only the stray file is reported.
        const root = mkdtempSync(join(tmpdir(), 'stray-tests-'));
        try {
            for (const dir of ['scripts', 'test', 'node_modules/dep', '.git']) {
                mkdirSync(join(root, dir), { recursive: true });
                writeFileSync(join(root, dir, 'a.test.mjs'), '');
            }
            writeFileSync(join(root, 'test', 'not-a-test.mjs'), '');
            assert.deepEqual(strayTestFiles(root), ['test/a.test.mjs']);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

test('the repository has no test file outside the discovered roots', () => {
    // A test that lives outside scripts/ belongs to no suite and never runs.
    assert.deepEqual(strayTestFiles(), []);
});
