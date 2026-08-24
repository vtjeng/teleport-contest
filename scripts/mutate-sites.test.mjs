import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    automaticReportPath,
    mutationCgroupArgs,
    parseArgs,
    probeMutationHost,
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

test('the host probe reads reachability from stdout, not the exit status',
    () => {
        const root = mkdtempSync(join(tmpdir(), 'mutate-probe-'));
        const lockPath = join(root, 'owner.lock');
        try {
            // Exit status 1 with the state word "degraded" is what a reachable
            // user manager reports when any unit has failed; the probe must
            // accept it, because only an unreachable bus prints nothing.
            probeMutationHost({
                lockPath,
                execute: () => ({ status: 1, stdout: 'degraded\n', stderr: '' }),
            });
            // Empty stdout with this stderr is the verbatim response a command
            // sandbox produces when it blocks the user bus; the message must
            // quote it and name the remedy.
            assert.throws(() => probeMutationHost({
                lockPath,
                execute: () => ({
                    status: 1,
                    stdout: '',
                    stderr: 'Failed to connect to bus: Operation not '
                        + 'permitted\n',
                }),
            }), /user systemd is unreachable \(Failed to connect to bus: Operation not permitted\); a command sandbox is the likely cause, so rerun outside it/u);
            // A spawn-level error means systemctl never ran at all -- the
            // EPERM mirrors a sandbox denying the exec -- and must read as
            // unreachable too.
            assert.throws(() => probeMutationHost({
                lockPath,
                execute: () => ({ error: new Error('spawnSync systemctl '
                    + 'EPERM') }),
            }), /user systemd is unreachable \(spawnSync systemctl EPERM\)/u);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

test('the CLI refuses an unwritable lock directory before touching systemd',
    () => {
        const root = mkdtempSync(join(tmpdir(), 'mutate-probe-cli-'));
        const locked = join(root, 'locked');
        mkdirSync(locked);
        // 0o555 removes the directory write bit, giving the probe the same
        // refusal a sandbox's read-only /run/user mount gives. Assumes a
        // non-root run: root writes into a 0o555 directory anyway.
        chmodSync(locked, 0o555);
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
                    TELEPORT_MUTATION_LOCK: join(locked, 'owner.lock'),
                },
            });
            assert.equal(run.status, 2, `${run.stdout}${run.stderr}`);
            assert.match(run.stderr,
                /mutate-sites: mutation host probe: cannot create .*owner\.lock\.probe/u);
            // Failing before systemd-run is the point of the probe: no unit
            // line means no slice or scope was ever requested.
            assert.doesNotMatch(`${run.stdout}${run.stderr}`,
                /Running (?:scope )?as unit:/u);
        } finally {
            chmodSync(locked, 0o755);
            rmSync(root, { recursive: true, force: true });
        }
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
