import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    automaticReportPath,
    mutationCgroupArgs,
    parseArgs,
    reportFromResult,
    siteFilterFromReport,
} from './mutate-sites.mjs';

const SCRIPT_PATH = fileURLToPath(
    new URL('./mutate-sites.mjs', import.meta.url));

test('fast argument coverage pins the default jobs and target', () => {
    const parsed = parseArgs(['--worktree']);
    assert.equal(parsed.worktree, true);
    // Two lanes are the fastest stable setting in the fixed benchmark recorded
    // in mutate-sites.mjs's header.
    assert.equal(parsed.jobs, 2);
});

test('fast resource coverage pins the aggregate scope placement', () => {
    const args = mutationCgroupArgs('/usr/bin/node', '/repo/mutate-sites.mjs', [
        '--worktree',
    ], {
        scopeName: 'teleport_mutate_123_run',
        sliceName: 'teleport_mutate_123',
    });
    assert.deepEqual(args.slice(0, 5), [
        '--user',
        '--scope',
        '--collect',
        '--unit=teleport_mutate_123_run',
        '--slice=teleport_mutate_123.slice',
    ]);
});

test('fast report coverage round-trips one survivor identity', () => {
    // The identity names one relational replacement at a stable fixture
    // position; the filter must accept that replacement and reject its sibling.
    const survivor = {
        path: 'js/lock.js',
        line: 10,
        column: 4,
        kind: 'relational',
        original: '<',
        replacement: '<=',
    };
    const report = reportFromResult({
        survivors: [survivor],
        timeoutRecords: [],
        resourceLimitRecords: [],
    }, ['relational']);
    const filter = siteFilterFromReport(report);

    assert.deepEqual(filter.paths, ['js/lock.js']);
    assert.equal(filter.matches('js/lock.js', survivor), true);
    assert.equal(filter.matches('js/lock.js', {
        ...survivor,
        replacement: '>',
    }), false);
});

test('every mutation run resolves an explicit or automatic report path', () => {
    assert.equal(automaticReportPath('/tmp/chosen.json'), '/tmp/chosen.json');
    // The injected directory is the unique root mkdtempSync would create; the
    // fixed value makes the expected report location deterministic.
    assert.equal(automaticReportPath(null, {
        makeTemporaryRoot: () => '/tmp/teleport-mutation-report-fixed',
    }), '/tmp/teleport-mutation-report-fixed/report.json');
});

test('the default suite retains one real bounded invocation smoke', () => {
    const root = mkdtempSync(join(tmpdir(), 'mutate-default-smoke-'));
    const lockPath = join(root, 'owner.lock');
    try {
        const run = spawnSync(process.execPath, [
            SCRIPT_PATH,
            '--file',
            'js/lock.js',
            '--enumerate-only',
        ], {
            encoding: 'utf8',
            env: {
                ...process.env,
                TELEPORT_MUTATION_LOCK: lockPath,
            },
        });
        const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
        assert.equal(run.status, 0, output);
        assert.match(output, /Running (?:scope )?as unit:/u);
        assert.match(output, /^js\/lock\.js: \d+ line\(s\) in scope/mu);
        assert.equal(existsSync(lockPath), false);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
