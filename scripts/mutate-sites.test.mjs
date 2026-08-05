// Cover scripts/mutate-sites.mjs. The end-to-end tests run against the fixture
// under scripts/fixtures/mutate-sites/, whose module documents, line by line,
// which of its sites its own test pins and which it leaves loose. The fixture,
// not js/, therefore carries the surviving mutants, so the expected report can
// be asserted exactly without a real gap in the game's tests.

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
    applyMutation,
    acquireMutationLock,
    changedJsLines,
    collectTargets,
    countSites,
    coveringTests,
    createWorkspace,
    describeSite,
    enumerateSites,
    formatReport,
    formatSiteCounts,
    isVerifiedMutationWorker,
    killingTestFiles,
    killRateInterval,
    mutationOwnerIsAlive,
    mutationCgroupArgs,
    mutationRunNames,
    parseAddedLines,
    parseArgs,
    partitionTestFiles,
    parseRange,
    removeWorkspace,
    releaseMutationLock,
    reportedTestCount,
    runSystemctl,
    runTests,
    runInMutationCgroup,
    runMutants,
    sampleItems,
    SITE_KINDS,
    startMutationSlice,
    formatTrailer,
    reportFromResult,
    siteFilterFromReport,
    stopWaveScope,
    survivingRangeLines,
    testCommandArgs,
    testRunnerCommand,
    tokenize,
    uncommittedJsLines,
} from './mutate-sites.mjs';

const SCRIPT_PATH = fileURLToPath(
    new URL('./mutate-sites.mjs', import.meta.url));
const BOUNDED_RUNNER_PATH = fileURLToPath(
    new URL('./run-bounded-tests.mjs', import.meta.url));
const FIXTURE_ROOT = fileURLToPath(
    new URL('./fixtures/mutate-sites', import.meta.url));
const FIXTURE_MODULE = `${FIXTURE_ROOT}/js/bounds.js`;
function fixtureSource() {
    return readFileSync(FIXTURE_MODULE, 'utf8');
}

function runDirectMain(args) {
    const source = [
        `const { main } = await import(${JSON.stringify(SCRIPT_PATH)});`,
        'try { await main(JSON.parse(process.argv[1])); }',
        'catch (error) {',
        '  console.error(`mutate-sites: ${error.message}`);',
        '  process.exitCode = 2;',
        '}',
    ].join('\n');
    return spawnSync(process.execPath, [
        '--input-type=module', '-e', source, JSON.stringify(args),
    ], { encoding: 'utf8' });
}

/** One `runMutants` target over the fixture module. */
function fixtureTarget({ lines = null, tests = ['bounds.test.mjs'] } = {}) {
    const source = fixtureSource();
    return {
        path: 'js/bounds.js',
        source,
        lineCount: lines ? lines.size : source.split('\n').length,
        sites: enumerateSites(source, lines),
        tests,
    };
}

// The fixture's whole suite for verdict purposes. red-baseline.test.mjs fails
// against the unmutated module by design, so only the test that exercises the
// abort path names it.
const FIXTURE_SUITE = ['bounds.test.mjs', 'wrapper.test.mjs'];

function withWorkspace(body) {
    const workspace = createWorkspace(FIXTURE_ROOT);
    try {
        return body(workspace);
    } finally {
        removeWorkspace(workspace);
    }
}

async function waitForFile(path) {
    // Two seconds leaves ample process-startup headroom without hiding a
    // runner that failed before publishing its child pid. Ten milliseconds
    // keeps the successful path responsive without a busy loop.
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
        if (existsSync(path)) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`timed out waiting for ${path}`);
}

async function waitForProcessExit(pid) {
    // Signal delivery and orphan reaping can finish just after the process
    // that initiated cleanup exits. The same two-second startup allowance is
    // enough for that kernel bookkeeping, with the same 10 ms poll interval.
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
        try {
            process.kill(pid, 0);
        } catch (error) {
            if (error.code === 'ESRCH') return;
            throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`process ${pid} survived cleanup`);
}

const shorthand = (site) =>
    `${site.line}:${site.kind} ${site.original}->${site.replacement}`;

/**
 * The newest commit that changed a file under js/.
 *
 * Ranges built from it hold js/ lines whatever the branch has committed since,
 * so a test over a real range cannot quietly reduce to an empty one.
 */
function newestJsCommit() {
    const sha = execFileSync('git', ['log', '-1', '--format=%H', '--', 'js/'],
        { encoding: 'utf8' }).trim();
    assert.match(sha, /^[0-9a-f]{40}$/u);
    return sha;
}

// ---------------------------------------------------------------------------
// Resource bounds
// ---------------------------------------------------------------------------

test('the mutation CLI enters one bounded cgroup', () => {
    // The stable four-worker sample peaked at 408 MiB with 41 tasks active;
    // the failed eight-worker probe peaked at 690 MiB. These bounds leave
    // measured headroom while containing the runaway process that previously
    // consumed the complete 23 GiB host and its 8 GiB swap.
    assert.deepEqual(
        mutationCgroupArgs('/usr/bin/node', '/repo/scripts/mutate-sites.mjs', [
            '--worktree',
        ], {
            scopeName: 'teleport_mutate_123_run',
            sliceName: 'teleport_mutate_123',
        }),
        [
            '--user',
            '--scope',
            '--collect',
            '--unit=teleport_mutate_123_run',
            '--slice=teleport_mutate_123.slice',
            '/usr/bin/node',
            '/repo/scripts/mutate-sites.mjs',
            '--worktree',
        ],
    );
});

test('the exclusivity lock refuses a contender without releasing its owner',
    () => {
        const root = mkdtempSync(join(tmpdir(), 'mutate-lock-test-'));
        const lockPath = join(root, 'owner.lock');
        const owner = acquireMutationLock(
            lockPath,
            mutationRunNames(process.pid, 'owner'),
        );
        try {
            assert.throws(
                () => acquireMutationLock(
                    lockPath,
                    mutationRunNames(process.pid, 'contender'),
                ),
                /another mutation run owns/u,
            );
            assert.equal(existsSync(owner.ownerPath), true);
        } finally {
            releaseMutationLock(owner);
            rmSync(root, { recursive: true, force: true });
        }
    });

test('an unpublished or partial fresh owner record cannot be reclaimed', () => {
    const root = mkdtempSync(join(tmpdir(), 'mutate-lock-publish-test-'));
    const lockPath = join(root, 'owner.lock');
    try {
        for (const partialOwner of [null, '{"pid":']) {
            mkdirSync(lockPath);
            if (partialOwner !== null)
                writeFileSync(join(lockPath, 'owner.json'), partialOwner);
            assert.throws(
                () => acquireMutationLock(
                    lockPath,
                    mutationRunNames(process.pid, 'contender'),
                ),
                /another mutation run is initializing/u,
            );
            rmSync(lockPath, { recursive: true, force: true });
        }
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('the original lock owner survives contenders during publication', () => {
    const root = mkdtempSync(join(tmpdir(), 'mutate-lock-race-test-'));
    const lockPath = join(root, 'owner.lock');
    let owner = null;
    const contend = () => assert.throws(
        () => acquireMutationLock(
            lockPath,
            mutationRunNames(process.pid, 'contender'),
            { now: () => Number.MAX_SAFE_INTEGER },
        ),
        /another mutation run is publishing or reclaiming/u,
    );
    try {
        owner = acquireMutationLock(
            lockPath,
            mutationRunNames(process.pid, 'owner'),
            {
                afterLockDirectoryCreated: contend,
                afterPendingOwnerWritten: contend,
            },
        );
        assert.equal(existsSync(owner.ownerPath), true);
        assert.throws(
            () => acquireMutationLock(
                lockPath,
                mutationRunNames(process.pid, 'late_contender'),
            ),
            /another mutation run owns/u,
        );
    } finally {
        if (owner) releaseMutationLock(owner);
        rmSync(root, { recursive: true, force: true });
    }
});

test('lock liveness distinguishes process birth and zombie state', () => {
    const owner = { pid: process.pid, processStartTime: 'expected' };
    assert.equal(mutationOwnerIsAlive(owner, () => ({
        state: 'S', startTime: 'expected',
    })), true);
    assert.equal(mutationOwnerIsAlive(owner, () => ({
        state: 'S', startTime: 'reused',
    })), false);
    assert.equal(mutationOwnerIsAlive(owner, () => ({
        state: 'Z', startTime: 'expected',
    })), false);
});

test('a reused live PID does not preserve a stale lock', () => {
    const root = mkdtempSync(join(tmpdir(), 'mutate-lock-reuse-test-'));
    const lockPath = join(root, 'owner.lock');
    const stale = mutationRunNames(process.pid, 'reused');
    let replacement = null;
    mkdirSync(lockPath);
    writeFileSync(join(lockPath, 'owner.json'), `${JSON.stringify({
        pid: process.pid,
        processStartTime: '0',
        ...stale,
    })}\n`);
    try {
        replacement = acquireMutationLock(
            lockPath,
            mutationRunNames(process.pid, 'replacement'),
        );
        assert.equal(existsSync(replacement.ownerPath), true);
    } finally {
        if (replacement) releaseMutationLock(replacement);
        rmSync(root, { recursive: true, force: true });
    }
});

test('the reclaim claim serializes stale replacement publication', () => {
    const root = mkdtempSync(join(tmpdir(), 'mutate-lock-reclaim-race-'));
    const lockPath = join(root, 'owner.lock');
    const deadPid = spawnSync(process.execPath, ['-e', '']).pid;
    const stale = mutationRunNames(deadPid, 'stale_race');
    let replacement = null;
    mkdirSync(lockPath);
    writeFileSync(join(lockPath, 'owner.json'), `${JSON.stringify({
        pid: deadPid,
        ...stale,
    })}\n`);
    try {
        replacement = acquireMutationLock(
            lockPath,
            mutationRunNames(process.pid, 'paused_reclaimer'),
            {
                stopStaleSlice: () => {},
                afterStaleOwnerRead: () => assert.throws(
                    () => acquireMutationLock(
                        lockPath,
                        mutationRunNames(process.pid, 'contender'),
                        { stopStaleSlice: () => {} },
                    ),
                    /another mutation run is publishing or reclaiming/u,
                ),
            },
        );
        assert.ok(replacement);
        assert.equal(existsSync(replacement.ownerPath), true);
        assert.equal(
            JSON.parse(readFileSync(replacement.ownerPath, 'utf8')).sliceName,
            replacement.owner.sliceName,
        );
    } finally {
        if (replacement) releaseMutationLock(replacement);
        rmSync(root, { recursive: true, force: true });
    }
});

test('a dead reclaim claimant fails closed without deleting its record', () => {
    const root = mkdtempSync(join(tmpdir(), 'mutate-stale-claim-'));
    const lockPath = join(root, 'owner.lock');
    const claimPath = `${lockPath}.reclaim`;
    const deadPid = spawnSync(process.execPath, ['-e', '']).pid;
    const claimant = {
        pid: deadPid,
        ...mutationRunNames(deadPid, 'dead_claimant'),
    };
    writeFileSync(claimPath, `${JSON.stringify(claimant)}\n`);
    try {
        assert.throws(
            () => acquireMutationLock(
                lockPath,
                mutationRunNames(process.pid, 'contender'),
            ),
            /stale mutation lock claim blocks/u,
        );
        assert.deepEqual(
            JSON.parse(readFileSync(claimPath, 'utf8')),
            claimant,
        );
        assert.equal(existsSync(lockPath), false);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('worker mode requires both the named slice and run scope', () => {
    const environment = {
        TELEPORT_MUTATION_CGROUP: '1',
        TELEPORT_MUTATION_SLICE: 'teleport_mutate_123_token',
    };
    const valid = '0::/user.slice/teleport_mutate_123_token.slice/'
        + 'teleport_mutate_123_token_run.scope\n';
    assert.equal(isVerifiedMutationWorker(environment, valid), true);
    assert.equal(isVerifiedMutationWorker(environment,
        '0::/user.slice/not-the-owner.scope\n'), false);
    assert.equal(isVerifiedMutationWorker({
        ...environment,
        TELEPORT_MUTATION_SLICE: '../forged',
    }, valid), false);
});

test('outer signal ownership spans acquisition through cleanup', async () => {
    const acquisitionSignals = new EventEmitter();
    const acquisitionEvents = [];
    await runInMutationCgroup('/repo/mutate-sites.mjs', [], {
        names: mutationRunNames(process.pid, 'acquire_signal'),
        signalTarget: acquisitionSignals,
        acquireLock: () => {
            acquisitionEvents.push('acquire');
            acquisitionSignals.emit('SIGINT');
            return { name: 'lock' };
        },
        startSlice: () => acquisitionEvents.push('start'),
        releaseLock: () => acquisitionEvents.push('release'),
        reraise: (signal) => acquisitionEvents.push(`signal:${signal}`),
    });
    assert.deepEqual(acquisitionEvents, [
        'acquire', 'release', 'signal:SIGINT',
    ]);

    const cleanupSignals = new EventEmitter();
    const cleanupEvents = [];
    await runInMutationCgroup('/repo/mutate-sites.mjs', [], {
        names: mutationRunNames(process.pid, 'cleanup_signal'),
        signalTarget: cleanupSignals,
        acquireLock: () => {
            cleanupEvents.push('acquire');
            return { name: 'lock' };
        },
        startSlice: () => cleanupEvents.push('start'),
        spawnChild: () => {
            const child = new EventEmitter();
            child.kill = () => cleanupEvents.push('kill');
            queueMicrotask(() => child.emit('exit', 0, null));
            return child;
        },
        stopSlice: () => {
            cleanupEvents.push('stop');
            cleanupSignals.emit('SIGTERM');
        },
        releaseLock: () => cleanupEvents.push('release'),
        reraise: (signal) => cleanupEvents.push(`signal:${signal}`),
    });
    assert.deepEqual(cleanupEvents, [
        'acquire', 'start', 'stop', 'release', 'signal:SIGTERM',
    ]);
});

test('aggregate cleanup failure retains its recovery owner', async () => {
    for (const startFailure of [false, true]) {
        const root = mkdtempSync(join(tmpdir(), 'mutate-cleanup-owner-'));
        const lockPath = join(root, 'owner.lock');
        let owner = null;
        try {
            await assert.rejects(
                () => runInMutationCgroup('/repo/mutate-sites.mjs', [], {
                    names: mutationRunNames(
                        process.pid,
                        startFailure ? 'partial_start' : 'cleanup_failure',
                    ),
                    acquireLock: (_unused, names) => {
                        owner = acquireMutationLock(lockPath, names);
                        return owner;
                    },
                    startSlice: () => {
                        if (startFailure) throw new Error('partial start');
                    },
                    spawnChild: () => {
                        const child = new EventEmitter();
                        child.kill = () => {};
                        queueMicrotask(() => child.emit('exit', 0, null));
                        return child;
                    },
                    stopSlice: () => { throw new Error('stop failed'); },
                }),
                /stop failed/u,
            );
            assert.ok(owner);
            assert.equal(existsSync(owner.ownerPath), true);
            const retained = JSON.parse(
                readFileSync(owner.ownerPath, 'utf8'),
            );
            // Model the failed outer process exiting. The next invocation
            // must use the retained unit name before publishing replacement
            // ownership.
            retained.processStartTime = 'exited-owner';
            writeFileSync(owner.ownerPath, `${JSON.stringify(retained)}\n`);
            const recovered = [];
            const replacement = acquireMutationLock(
                lockPath,
                mutationRunNames(process.pid, `recovered_${startFailure}`),
                {
                    stopStaleSlice: (sliceName) =>
                        recovered.push(`stop:${sliceName}`),
                },
            );
            assert.deepEqual(recovered, [`stop:${owner.owner.sliceName}`]);
            releaseMutationLock(replacement);
            owner = null;
        } finally {
            if (owner && existsSync(owner.ownerPath))
                releaseMutationLock(owner);
            rmSync(root, { recursive: true, force: true });
        }
    }
});

test('partial aggregate startup has one outer cleanup owner', async () => {
    const controlCalls = [];
    assert.throws(
        () => startMutationSlice('teleport_mutate_123_partial',
            (args) => {
                controlCalls.push(args[0]);
                if (args[0] === 'set-property')
                    throw new Error('failed to set limits');
            }),
        /failed to set limits/u,
    );
    assert.deepEqual(controlCalls, ['start', 'set-property']);

    const events = [];
    await assert.rejects(
        () => runInMutationCgroup('/repo/mutate-sites.mjs', [], {
            names: mutationRunNames(process.pid, 'partial_cleanup_owner'),
            acquireLock: () => {
                events.push('acquire');
                return { name: 'lock' };
            },
            startSlice: () => {
                events.push('start');
                throw new Error('failed to set limits');
            },
            stopSlice: () => events.push('stop'),
            releaseLock: () => events.push('release'),
        }),
        /failed to set limits/u,
    );
    assert.deepEqual(events, ['acquire', 'start', 'stop', 'release']);
});

test('aggregate cleanup accepts only the exact unloaded-unit result', () => {
    const unit = 'teleport_mutate_123_absent.slice';
    const action = `failed to stop mutation slice ${unit}`;
    let observedOptions = null;
    const unloaded = `Failed to stop ${unit}: Unit ${unit} not loaded.\n`;
    const result = (status, stderr, stdout = '') => ({
        status,
        stdout,
        stderr,
        signal: null,
        error: null,
    });
    const execute = (_command, _args, options) => {
        observedOptions = options;
        return result(5, unloaded);
    };
    assert.doesNotThrow(() => runSystemctl(
        ['stop', unit], action, { acceptMissingUnit: unit, execute },
    ));
    assert.equal(observedOptions.env.LC_ALL, 'C');

    for (const nearMiss of [
        result(4, unloaded),
        result(5, 'Failed to stop other.slice: Unit other.slice not loaded.\n'),
        result(5, `warning\n${unloaded}`),
        result(5, `${unloaded}warning\n`),
        result(5, `${unloaded}\n`),
        result(5, `${unloaded}  `),
        result(5, '', unloaded),
        result(5, unloaded, unloaded),
        result(5, unloaded.slice(10), unloaded.slice(0, 10)),
        result(5, 'Failed to connect to bus: Permission denied\n'),
    ]) {
        // Preserve each near miss exactly; only the precise status-5 result
        // for this unit proves that the owned cgroup is absent.
        assert.throws(
            () => runSystemctl(
                ['stop', unit], action,
                { acceptMissingUnit: unit, execute: () => nearMiss },
            ),
        );
    }
});

test('teardown signals take precedence over an earlier body error',
    async () => {
        for (const signal of ['SIGINT', 'SIGTERM']) {
            const signals = new EventEmitter();
            const events = [];
            await runInMutationCgroup('/repo/mutate-sites.mjs', [], {
                names: mutationRunNames(process.pid, `body_error_${signal}`),
                signalTarget: signals,
                acquireLock: () => ({ name: 'lock' }),
                startSlice: () => {},
                spawnChild: () => {
                    const child = new EventEmitter();
                    child.kill = () => {};
                    queueMicrotask(() => child.emit(
                        'error', new Error('child failed')));
                    return child;
                },
                stopSlice: () => {
                    events.push('stop');
                    signals.emit(signal);
                },
                releaseLock: () => events.push('release'),
                reraise: (received) => events.push(`signal:${received}`),
            });
            assert.deepEqual(events, [
                'stop', 'release', `signal:${signal}`,
            ]);
        }
    });

test('teardown signals take precedence over aggregate cleanup failure',
    async () => {
        for (const signal of ['SIGINT', 'SIGTERM']) {
            const signals = new EventEmitter();
            const events = [];
            await runInMutationCgroup('/repo/mutate-sites.mjs', [], {
                names: mutationRunNames(process.pid, `cleanup_error_${signal}`),
                signalTarget: signals,
                acquireLock: () => ({ name: 'lock' }),
                startSlice: () => {},
                spawnChild: () => {
                    const child = new EventEmitter();
                    child.kill = () => {};
                    queueMicrotask(() => child.emit('exit', 0, null));
                    return child;
                },
                stopSlice: () => {
                    events.push('stop');
                    signals.emit(signal);
                    throw new Error('cleanup failed');
                },
                releaseLock: () => events.push('release'),
                reraise: (received) => events.push(`signal:${received}`),
            });
            assert.deepEqual(events, ['stop', `signal:${signal}`]);
        }
    });

test('OS signals received during synchronous teardown are re-raised',
    async () => {
        for (const signal of ['SIGINT', 'SIGTERM']) {
            for (const childFails of [false, true]) {
                const source = [
                    `import { spawnSync } from 'node:child_process';`,
                    `import { EventEmitter } from 'node:events';`,
                    `import { writeFileSync } from 'node:fs';`,
                    `const { runInMutationCgroup } = await import(${JSON.stringify(
                        SCRIPT_PATH)});`,
                    `const child = new EventEmitter();`,
                    `child.kill = () => {};`,
                    childFails
                        ? `queueMicrotask(() => child.emit('error', new Error('child failed')));`
                        : `queueMicrotask(() => child.emit('exit', 0, null));`,
                    `await runInMutationCgroup('/repo/mutate-sites.mjs', [], {`,
                    `  acquireLock: () => ({ name: 'lock' }),`,
                    `  startSlice: () => {},`,
                    `  spawnChild: () => child,`,
                    `  stopSlice: () => {`,
                    `    writeFileSync(1, 'TEARDOWN\\n');`,
                    `    spawnSync(process.execPath, ['-e',`,
                    `      'setTimeout(() => {}, 750)']);`,
                    `  },`,
                    `  releaseLock: () => writeFileSync(1, 'RELEASE\\n'),`,
                    `});`,
                ].join('\n');
                const subprocess = spawn(process.execPath, [
                    '--input-type=module', '-e', source,
                ], { stdio: ['ignore', 'pipe', 'pipe'] });
                let output = '';
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(
                        () => reject(new Error(
                            `teardown did not start: ${output}`)),
                        5_000,
                    );
                    const accept = (chunk) => {
                        output += chunk;
                        if (!output.includes('TEARDOWN')) return;
                        clearTimeout(timer);
                        resolve();
                    };
                    subprocess.stdout.on('data', accept);
                    subprocess.stderr.on('data', accept);
                    subprocess.once('error', reject);
                    subprocess.once('exit', (code, exitSignal) => reject(
                        new Error(`subprocess exited before teardown: ${
                            code}/${exitSignal}\n${output}`),
                    ));
                });
                const exit = new Promise((resolve, reject) => {
                    subprocess.once('error', reject);
                    subprocess.once('exit', (code, exitSignal) =>
                        resolve({ code, signal: exitSignal }));
                });
                subprocess.kill(signal);
                assert.deepEqual(await exit, { code: null, signal });
                assert.match(output, /RELEASE/u);
            }
        }
    });

test('OS signals delivered at the settlement boundary are re-raised',
    async () => {
        for (const signal of ['SIGINT', 'SIGTERM']) {
            const source = [
                `import { EventEmitter } from 'node:events';`,
                `const { runInMutationCgroup } = await import(${JSON.stringify(
                    SCRIPT_PATH)});`,
                `const child = new EventEmitter();`,
                `child.kill = () => {};`,
                `queueMicrotask(() => child.emit('exit', 0, null));`,
                `await runInMutationCgroup('/repo/mutate-sites.mjs', [], {`,
                `  acquireLock: () => ({ name: 'lock' }),`,
                `  startSlice: () => {},`,
                `  spawnChild: () => child,`,
                `  stopSlice: () => {},`,
                `  releaseLock: () => {},`,
                `  settleSignals: () => {`,
                `    process.kill(process.pid, ${JSON.stringify(signal)});`,
                `    return Promise.resolve();`,
                `  },`,
                `});`,
                `process.stdout.write('RETURNED\\n');`,
            ].join('\n');
            const result = spawnSync(process.execPath, [
                '--input-type=module', '-e', source,
            ], { encoding: 'utf8' });
            assert.deepEqual(
                { status: result.status, signal: result.signal },
                { status: null, signal },
            );
            assert.doesNotMatch(result.stdout, /RETURNED/u);
        }
    });

test('a stale lock stops its recorded aggregate slice before replacement',
    () => {
        const root = mkdtempSync(join(tmpdir(), 'mutate-stale-lock-test-'));
        const lockPath = join(root, 'owner.lock');
        const deadPid = spawnSync(process.execPath, ['-e', '']).pid;
        // The short child has been collected by spawnSync, so its pid is a
        // proven dead owner rather than an assumed unused number.
        const stale = mutationRunNames(deadPid, 'stale');
        const unit = `${stale.sliceName}.slice`;
        let replacement = null;
        execFileSync('systemctl', ['--user', 'start', unit]);
        mkdirSync(lockPath);
        writeFileSync(join(lockPath, 'owner.json'), `${JSON.stringify({
            pid: deadPid,
            ...stale,
        })}\n`);
        try {
            replacement = acquireMutationLock(
                lockPath,
                mutationRunNames(process.pid, 'replacement'),
            );
            const active = spawnSync(
                'systemctl', ['--user', 'is-active', unit]);
            assert.notEqual(active.status, 0);
        } finally {
            if (replacement) releaseMutationLock(replacement);
            spawnSync('systemctl', ['--user', 'stop', unit]);
            spawnSync('systemctl', ['--user', 'revert', unit]);
            rmSync(root, { recursive: true, force: true });
        }
    });

test('a stale lock recovers when its recorded slice is already absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'mutate-stale-absent-slice-'));
    const lockPath = join(root, 'owner.lock');
    const deadPid = spawnSync(process.execPath, ['-e', '']).pid;
    const stale = mutationRunNames(deadPid, 'already_absent');
    let replacement = null;
    mkdirSync(lockPath);
    writeFileSync(join(lockPath, 'owner.json'), `${JSON.stringify({
        pid: deadPid,
        ...stale,
    })}\n`);
    try {
        replacement = acquireMutationLock(
            lockPath,
            mutationRunNames(process.pid, 'absent_replacement'),
        );
        assert.equal(existsSync(replacement.ownerPath), true);
        assert.equal(
            JSON.parse(readFileSync(replacement.ownerPath, 'utf8')).sliceName,
            replacement.owner.sliceName,
        );
    } finally {
        if (replacement) releaseMutationLock(replacement);
        rmSync(root, { recursive: true, force: true });
    }
});

test('the default lock remains exclusive across different TMPDIR values',
    async () => {
        const root = mkdtempSync(join(tmpdir(), 'mutate-tmpdir-lock-test-'));
        const firstTmp = join(root, 'first');
        const secondTmp = join(root, 'second');
        mkdirSync(firstTmp);
        mkdirSync(secondTmp);
        const source = [
            `const M = await import(${JSON.stringify(SCRIPT_PATH)});`,
            'const lock = M.acquireMutationLock();',
            "process.stdout.write('READY\\n');",
            "process.stdin.once('data', () => {",
            '  M.releaseMutationLock(lock);',
            '});',
        ].join('\n');
        const environment = (directory) => {
            const value = { ...process.env, TMPDIR: directory };
            delete value.TELEPORT_MUTATION_LOCK;
            return value;
        };
        const holder = spawn(process.execPath,
            ['--input-type=module', '-e', source], {
                env: environment(firstTmp),
                stdio: ['pipe', 'pipe', 'pipe'],
            });
        try {
            await new Promise((resolve, reject) => {
                let output = '';
                const timer = setTimeout(() => reject(new Error(
                    `default lock holder did not start: ${output}`)), 5_000);
                const accept = (chunk) => {
                    output += chunk;
                    if (!output.includes('READY')) return;
                    clearTimeout(timer);
                    resolve();
                };
                holder.stdout.on('data', accept);
                holder.stderr.on('data', accept);
                holder.once('error', reject);
                holder.once('exit', (code, signal) => reject(new Error(
                    `default lock holder exited: ${code}/${signal}: ${output}`)));
            });
            const contender = spawnSync(process.execPath, [
                '--input-type=module', '-e', [
                    `const M = await import(${JSON.stringify(SCRIPT_PATH)});`,
                    'try {',
                    '  const lock = M.acquireMutationLock();',
                    '  M.releaseMutationLock(lock);',
                    "  process.stdout.write('ACQUIRED\\n');",
                    '} catch (error) {',
                    '  process.stderr.write(`${error.message}\\n`);',
                    '  process.exitCode = 2;',
                    '}',
                ].join('\n'),
            ], { env: environment(secondTmp), encoding: 'utf8' });
            assert.equal(contender.status, 2);
            assert.match(contender.stderr, /another mutation run owns/u);
            assert.doesNotMatch(contender.stdout, /ACQUIRED/u);
        } finally {
            if (holder.exitCode === null && holder.signalCode === null) {
                const exit = new Promise((resolve) =>
                    holder.once('exit', resolve));
                holder.stdin.end('\n');
                await exit;
            }
            rmSync(root, { recursive: true, force: true });
        }
    });

test('mutation test waves run at four-file concurrency', () => {
    // Four workers ran the current 39-file baseline in 10.66 seconds across
    // two runs. Eight was faster when invoked directly, but the mutator's
    // spawnSync path left one worker hung in two separate bounded runs.
    // Two files prove that each relative name remains an explicit test input.
    assert.deepEqual(testCommandArgs(['a.test.mjs', 'b.test.mjs']), [
        '--test',
        '--test-concurrency=4',
        'scripts/a.test.mjs',
        'scripts/b.test.mjs',
    ]);
});

test('timed mutation waves kill the complete Node test process group', () => {
    assert.deepEqual(
        testRunnerCommand('/usr/bin/node', ['--test', 'scripts/a.test.mjs'],
            61_001, '/repo/scripts/run-bounded-tests.mjs',
            'teleport-mutate-wave-test', 'teleport_mutate_123',
            '/tmp/teleport-mutate-wave-test.started'),
        {
            command: 'systemd-run',
            unitName: 'teleport-mutate-wave-test',
            startedPath: '/tmp/teleport-mutate-wave-test.started',
            args: [
                '--user',
                '--scope',
                '--collect',
                '--quiet',
                '--unit=teleport-mutate-wave-test',
                '--slice=teleport_mutate_123.slice',
                '--property=MemoryAccounting=yes',
                '--property=MemoryMax=1G',
                '--property=MemorySwapMax=0',
                '--property=TasksMax=64',
                '/usr/bin/node',
                '/repo/scripts/run-bounded-tests.mjs',
                '61001',
                '/tmp/teleport-mutate-wave-test.started',
                '/usr/bin/node',
                '--test',
                'scripts/a.test.mjs',
            ],
            outerTimeoutMs: 66_001,
        },
    );
});

test('a timed mutation wave leaves no hanging test descendant', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mutate-timeout-test-'));
    const scripts = join(workspace, 'scripts');
    const pidPath = join(workspace, 'child.pid');
    let childPid = null;
    mkdirSync(scripts);
    writeFileSync(join(scripts, 'hang.test.mjs'), [
        "import { spawn } from 'node:child_process';",
        "import { writeFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "import test from 'node:test';",
        "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);",
        "writeFileSync(join(process.cwd(), 'child.pid'), String(child.pid));",
        "test('hang', async () => new Promise(() => {}));",
        '',
    ].join('\n'));
    try {
        const result = runTests(workspace, ['hang.test.mjs'], 1_000);
        assert.equal(result.passed, false);
        assert.equal(result.timedOut, true);
        childPid = Number(readFileSync(pidPath, 'utf8'));
        assert.throws(() => process.kill(childPid, 0), { code: 'ESRCH' });
    } finally {
        if (childPid !== null) {
            try {
                process.kill(childPid, 'SIGKILL');
            } catch (error) {
                if (error.code !== 'ESRCH') throw error;
            }
        }
        rmSync(workspace, { recursive: true, force: true });
    }
});

test('a completed mutation wave reaps a detached test descendant', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mutate-exit-test-'));
    const scripts = join(workspace, 'scripts');
    const pidPath = join(workspace, 'child.pid');
    let childPid = null;
    mkdirSync(scripts);
    writeFileSync(join(scripts, 'exit.test.mjs'), [
        "import { spawn } from 'node:child_process';",
        "import { writeFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "import test from 'node:test';",
        "test('leave helper', () => {",
        "  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });",
        "  child.unref();",
        "  writeFileSync(join(process.cwd(), 'child.pid'), String(child.pid));",
        "});",
        '',
    ].join('\n'));
    try {
        const result = runTests(workspace, ['exit.test.mjs'], 5_000);
        assert.equal(result.passed, true);
        assert.equal(result.timedOut, false);
        childPid = Number(readFileSync(pidPath, 'utf8'));
        assert.throws(() => process.kill(childPid, 0), { code: 'ESRCH' });
    } finally {
        if (childPid !== null) {
            try {
                process.kill(childPid, 'SIGKILL');
            } catch (error) {
                if (error.code !== 'ESRCH') throw error;
            }
        }
        rmSync(workspace, { recursive: true, force: true });
    }
});

test('a failing mutation wave reaps a detached test descendant', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mutate-fail-exit-test-'));
    const scripts = join(workspace, 'scripts');
    const pidPath = join(workspace, 'child.pid');
    let childPid = null;
    mkdirSync(scripts);
    writeFileSync(join(scripts, 'fail.test.mjs'), [
        "import { spawn } from 'node:child_process';",
        "import { writeFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "import test from 'node:test';",
        "test('leave helper and fail', () => {",
        "  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });",
        '  child.unref();',
        "  writeFileSync(join(process.cwd(), 'child.pid'), String(child.pid));",
        "  throw new Error('deliberate wave failure');",
        '});',
        '',
    ].join('\n'));
    try {
        const result = runTests(workspace, ['fail.test.mjs'], 5_000);
        assert.equal(result.passed, false);
        assert.equal(result.timedOut, false);
        assert.match(result.output, /deliberate wave failure/u);
        childPid = Number(readFileSync(pidPath, 'utf8'));
        assert.throws(() => process.kill(childPid, 0), { code: 'ESRCH' });
    } finally {
        if (childPid !== null) {
            try {
                process.kill(childPid, 'SIGKILL');
            } catch (error) {
                if (error.code !== 'ESRCH') throw error;
            }
        }
        rmSync(workspace, { recursive: true, force: true });
    }
});

test('the bounded wrapper preserves ordinary, error, timeout, and signal results', () => {
    const run = (timeoutMs, args) => {
        const root = mkdtempSync(join(tmpdir(), 'bounded-result-test-'));
        try {
            return spawnSync(process.execPath,
                [BOUNDED_RUNNER_PATH, String(timeoutMs),
                    join(root, 'started'), ...args], {
                    encoding: 'utf8',
                });
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    };

    // Five seconds is a ceiling for commands that terminate immediately. The
    // chosen nonzero status distinguishes propagation from a generic failure.
    assert.equal(run(5_000,
        [process.execPath, '-e', 'process.exit(0)']).status, 0);
    assert.equal(run(5_000,
        [process.execPath, '-e', 'process.exit(17)']).status, 17);
    // A missing executable exercises spawn's error event, whose reserved
    // wrapper status is 125.
    assert.equal(run(5_000,
        ['/no/such/mutation-test-node']).status, 125);
    // Fifty milliseconds bounds a child that never exits and preserves the
    // wrapper's documented inner-timeout status, 124.
    assert.equal(run(50,
        [process.execPath, '-e', 'setInterval(() => {}, 1000)']).status, 124);
    // A child-side SIGTERM remains the conventional 128 + 15 status. It is
    // distinct from signalling the wrapper itself, which the next test covers.
    assert.equal(run(5_000, [process.execPath, '-e',
        "process.kill(process.pid, 'SIGTERM')"]).status, 143);
});

test('signalling the bounded wrapper kills its detached test group', async () => {
    for (const signal of ['SIGINT', 'SIGTERM']) {
        const workspace = mkdtempSync(join(tmpdir(), 'bounded-signal-test-'));
        const pidPath = join(workspace, 'pids.json');
        let wrapper = null;
        let pids = null;
        try {
            const childSource = [
                "import { spawn } from 'node:child_process';",
                "import { writeFileSync } from 'node:fs';",
                "const helper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);",
                `writeFileSync(${JSON.stringify(pidPath)}, JSON.stringify({ self: process.pid, helper: helper.pid }));`,
                'setInterval(() => {}, 1000);',
            ].join('\n');
            // Thirty seconds leaves the wrapper running until this test sends
            // the selected signal; a shorter accidental deadline could turn
            // the result into timeout status 124.
            wrapper = spawn(process.execPath, [BOUNDED_RUNNER_PATH, '30000',
                join(workspace, 'started'), process.execPath,
                '--input-type=module', '-e', childSource], {
                stdio: 'ignore',
            });
            await waitForFile(pidPath);
            pids = JSON.parse(readFileSync(pidPath, 'utf8'));
            const exit = new Promise((resolve, reject) => {
                wrapper.once('error', reject);
                wrapper.once('exit', (code, exitSignal) =>
                    resolve({ code, signal: exitSignal }));
            });

            wrapper.kill(signal);

            assert.deepEqual(await exit, { code: null, signal });
            await waitForProcessExit(pids.self);
            await waitForProcessExit(pids.helper);
        } finally {
            if (wrapper?.exitCode === null && wrapper?.signalCode === null)
                wrapper.kill('SIGKILL');
            for (const pid of pids ? [pids.self, pids.helper] : []) {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch (error) {
                    if (error.code !== 'ESRCH') throw error;
                }
            }
            rmSync(workspace, { recursive: true, force: true });
        }
    }
});

test('an outer deadline synchronously stops only its named wave scope', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mutate-outer-timeout-'));
    const bin = join(workspace, 'bin');
    const pidPath = join(workspace, 'helper.pid');
    const unitPath = join(workspace, 'unit.txt');
    const stopPath = join(workspace, 'stops.jsonl');
    const oldPath = process.env.PATH;
    let helperPid = null;
    mkdirSync(bin);
    writeFileSync(join(bin, 'systemd-run'), [
        '#!/usr/bin/env node',
        "import { spawn } from 'node:child_process';",
        "import { writeFileSync } from 'node:fs';",
        "const unit = process.argv.slice(2).find((arg) => arg.startsWith('--unit=')).slice(7);",
        "const runner = process.argv.findIndex((arg) => arg.endsWith('/run-bounded-tests.mjs'));",
        "writeFileSync(process.argv[runner + 2], 'started\\n');",
        'writeFileSync(process.env.TEST_WAVE_UNIT_PATH, unit);',
        "const helper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });",
        'helper.unref();',
        'writeFileSync(process.env.TEST_WAVE_PID_PATH, String(helper.pid));',
        'setInterval(() => {}, 1000);',
        '',
    ].join('\n'));
    writeFileSync(join(bin, 'systemctl'), [
        '#!/usr/bin/env node',
        "import { appendFileSync, readFileSync } from 'node:fs';",
        "appendFileSync(process.env.TEST_WAVE_STOP_PATH, `${JSON.stringify(process.argv.slice(2))}\\n`);",
        "const pid = Number(readFileSync(process.env.TEST_WAVE_PID_PATH, 'utf8'));",
        "try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }",
        // Status 5 models systemctl finding that collection won the race. The
        // caller still has to return its timeout result after cleanup.
        "process.stderr.write(`Failed to stop ${process.argv.at(-1)}: Unit ${process.argv.at(-1)} not loaded.\\n`);",
        'process.exitCode = 5;',
        '',
    ].join('\n'));
    chmodSync(join(bin, 'systemd-run'), 0o755);
    chmodSync(join(bin, 'systemctl'), 0o755);

    try {
        process.env.PATH = `${bin}:${oldPath}`;
        process.env.TEST_WAVE_PID_PATH = pidPath;
        process.env.TEST_WAVE_UNIT_PATH = unitPath;
        process.env.TEST_WAVE_STOP_PATH = stopPath;

        // One millisecond makes spawnSync's outer ceiling 5,001 ms. The fake
        // systemd-run deliberately ignores both the inner runner and that
        // ceiling, reproducing the outer-timeout path at its minimum cost.
        const result = runTests(workspace, ['unused.test.mjs'], 1);
        assert.equal(result.timedOut, true);
        await waitForFile(pidPath);
        helperPid = Number(readFileSync(pidPath, 'utf8'));

        assert.equal(existsSync(stopPath), true);
        const stops = readFileSync(stopPath, 'utf8').trim().split('\n')
            .map((line) => JSON.parse(line));
        const unit = readFileSync(unitPath, 'utf8');
        assert.match(unit, /^teleport-mutate-wave-\d+-\d+$/u);
        assert.deepEqual(stops, [['--user', 'stop', `${unit}.scope`]]);
        await waitForProcessExit(helperPid);
    } finally {
        process.env.PATH = oldPath;
        delete process.env.TEST_WAVE_PID_PATH;
        delete process.env.TEST_WAVE_UNIT_PATH;
        delete process.env.TEST_WAVE_STOP_PATH;
        if (helperPid !== null) {
            try {
                process.kill(helperPid, 'SIGKILL');
            } catch (error) {
                if (error.code !== 'ESRCH') throw error;
            }
        }
        rmSync(workspace, { recursive: true, force: true });
    }
});

test('a wave launcher failure is not a failing-test verdict', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mutate-wave-launch-fail-'));
    const bin = join(workspace, 'bin');
    const oldPath = process.env.PATH;
    mkdirSync(bin);
    writeFileSync(join(bin, 'systemd-run'), [
        '#!/usr/bin/env node',
        "process.stderr.write('transient user-manager failure\\n');",
        'process.exitCode = 17;',
        '',
    ].join('\n'));
    writeFileSync(join(bin, 'systemctl'), [
        '#!/usr/bin/env node',
        "const unit = process.argv.at(-1);",
        "process.stderr.write(`Failed to stop ${unit}: Unit ${unit} not loaded.\\n`);",
        'process.exitCode = 5;',
        '',
    ].join('\n'));
    chmodSync(join(bin, 'systemd-run'), 0o755);
    chmodSync(join(bin, 'systemctl'), 0o755);
    try {
        process.env.PATH = `${bin}:${oldPath}`;
        assert.throws(
            () => runTests(workspace, ['unused.test.mjs'], 5_000),
            /never started.*transient user-manager failure/u,
        );
    } finally {
        process.env.PATH = oldPath;
        rmSync(workspace, { recursive: true, force: true });
    }
});

test('scope cleanup accepts only the exact collected-unit result', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mutate-scope-stop-'));
    const bin = join(workspace, 'bin');
    const systemctl = join(bin, 'systemctl');
    const oldPath = process.env.PATH;
    mkdirSync(bin);
    // This name cannot collide with a production wave because production names
    // include both the mutator pid and its wave sequence.
    const unitName = 'teleport-mutate-wave-contract-test';
    try {
        process.env.PATH = bin;
        // A missing systemctl executable is a cleanup failure. Returning the
        // mutation timeout would falsely claim that the scope was emptied.
        assert.throws(() => stopWaveScope(unitName), /failed to stop/u);

        writeFileSync(systemctl, [
            `#!${process.execPath}`,
            "const mode = process.env.TEST_SYSTEMCTL_MODE;",
            "const unit = process.argv.at(-1);",
            "const unloaded = `Failed to stop ${unit}: Unit ${unit} not loaded.\\n`;",
            "if (mode === 'success') {",
            '  process.exitCode = 0;',
            "} else if (mode === 'collected') {",
            '  process.stderr.write(unloaded);',
            '  process.exitCode = 5;',
            "} else if (mode === 'locale') {",
            "  if (process.env.LC_ALL === 'C') {",
            '    process.stderr.write(unloaded);',
            '    process.exitCode = 5;',
            '  } else {',
            "    process.stderr.write('wrong locale\\n');",
            '    process.exitCode = 1;',
            '  }',
            "} else if (mode === 'wrong-status') {",
            '  process.stderr.write(unloaded);',
            '  process.exitCode = 4;',
            "} else if (mode === 'wrong-unit') {",
            "  process.stderr.write('Failed to stop other.scope: Unit other.scope not loaded.\\n');",
            '  process.exitCode = 5;',
            "} else if (mode === 'prefixed') {",
            "  process.stderr.write(`warning\\n${unloaded}`);",
            '  process.exitCode = 5;',
            "} else if (mode === 'suffixed') {",
            "  process.stderr.write(`${unloaded}warning\\n`);",
            '  process.exitCode = 5;',
            "} else if (mode === 'whitespace') {",
            "  process.stderr.write(`${unloaded}  `);",
            '  process.exitCode = 5;',
            "} else if (mode === 'stdout') {",
            '  process.stdout.write(unloaded);',
            '  process.exitCode = 5;',
            "} else if (mode === 'split') {",
            '  process.stdout.write(unloaded.slice(0, 10));',
            '  process.stderr.write(unloaded.slice(10));',
            '  process.exitCode = 5;',
            "} else if (mode === 'same-status-other-error') {",
            "  process.stderr.write('Failed to connect to bus.\\n');",
            '  process.exitCode = 5;',
            '} else {',
            "  process.stderr.write('Access denied.\\n');",
            '  process.exitCode = 1;',
            '}',
            '',
        ].join('\n'));
        chmodSync(systemctl, 0o755);

        // Status 0 is the ordinary result when systemctl stopped a live scope.
        process.env.TEST_SYSTEMCTL_MODE = 'success';
        assert.doesNotThrow(() => stopWaveScope(unitName));
        // systemd 255 returns 5 and names the exact unloaded unit after
        // collection. This is the sole nonzero result that means no process
        // remains to clean up.
        process.env.TEST_SYSTEMCTL_MODE = 'collected';
        assert.doesNotThrow(() => stopWaveScope(unitName));
        process.env.TEST_SYSTEMCTL_MODE = 'locale';
        assert.doesNotThrow(() => stopWaveScope(unitName));
        for (const mode of [
            'wrong-status',
            'wrong-unit',
            'prefixed',
            'suffixed',
            'whitespace',
            'stdout',
            'split',
        ]) {
            process.env.TEST_SYSTEMCTL_MODE = mode;
            assert.throws(() => stopWaveScope(unitName), undefined, mode);
        }
        // Status 5 alone is insufficient: bus failure uses the same status on
        // this platform and leaves cleanup unproved.
        process.env.TEST_SYSTEMCTL_MODE = 'same-status-other-error';
        assert.throws(() => stopWaveScope(unitName), /Failed to connect/u);
        // Any other nonzero result must also replace the timeout result with a
        // cleanup error.
        process.env.TEST_SYSTEMCTL_MODE = 'permission';
        assert.throws(() => stopWaveScope(unitName), /Access denied/u);
    } finally {
        process.env.PATH = oldPath;
        delete process.env.TEST_SYSTEMCTL_MODE;
        rmSync(workspace, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------------------
// The changed lines
// ---------------------------------------------------------------------------

test('a range must name a base and a head', () => {
    assert.deepEqual(parseRange('abc123..def456'),
        { base: 'abc123', head: 'def456' });
    // Every other shape is rejected: a one-sided range would silently mutate
    // either nothing or the whole file.
    for (const bad of ['HEAD', 'HEAD..', '..HEAD', 'a..b..c', undefined])
        assert.throws(() => parseRange(bad), /range must be spelled/u);
});

test('added line numbers come from the hunk headers', () => {
    // A `--unified=0` diff over three files: one hunk with an explicit count,
    // one single-line hunk with no count, one hunk that only deletes, and a
    // deleted file.
    const diff = [
        'diff --git a/js/one.js b/js/one.js',
        '--- a/js/one.js',
        '+++ b/js/one.js',
        '@@ -10,0 +11,3 @@',
        '+a',
        '+b',
        '+c',
        '@@ -40,2 +44,0 @@',
        '-gone',
        '-gone',
        'diff --git a/js/two.js b/js/two.js',
        '--- a/js/two.js',
        '+++ b/js/two.js',
        '@@ -1 +1 @@',
        '-old',
        '+new',
        'diff --git a/js/three.js b/js/three.js',
        '--- a/js/three.js',
        '+++ /dev/null',
        '@@ -1,2 +0,0 @@',
        '-gone',
        '-gone',
        'diff --git a/js/four.js b/js/four.js',
        '--- a/js/four.js',
        '+++ b/js/four.js',
        '@@ -5,2 +7,0 @@',
        '-gone',
        '-gone',
    ].join('\n');

    const added = parseAddedLines(diff);

    // js/three.js was deleted and js/four.js only lost lines, so neither has a
    // line to mutate and neither may appear at all: an empty entry would be
    // reported as a file with no sites.
    assert.deepEqual([...added.keys()], ['js/one.js', 'js/two.js']);
    // 11,3 covers 11 through 13; the `+44,0` hunk adds nothing.
    assert.deepEqual([...added.get('js/one.js')], [11, 12, 13]);
    // `+1` with no count is one line.
    assert.deepEqual([...added.get('js/two.js')], [1]);
});

// ---------------------------------------------------------------------------
// The site enumerator
// ---------------------------------------------------------------------------

test('the fixture module yields exactly the documented mutants', () => {
    const sites = enumerateSites(fixtureSource());

    // js/bounds.js names each of these lines and what its own test does to it.
    // The two lines the enumerator must skip, `flags & 8` and `ROW[0]`, are
    // absent, and every relational mutant shifts its boundary by one place.
    assert.deepEqual(sites.map(shorthand), [
        '10:integer 4->5',
        '10:integer 4->3',
        '15:relational <=-><',
        '21:relational <-><=',
        '21:integer 10->11',
        '21:integer 10->9',
        '27:logical &&->||',
        '34:integer 1->2',
        '34:integer 1->0',
        '45:integer 3->4',
        '45:integer 3->2',
        '54:boolean true->false',
        '63:relational >=->>',
    ]);
    // Nine distinct tokens: the three integer tokens each yield two mutants.
    assert.equal(countSites(sites), 9);
});

test('sites outside the changed lines are left alone', () => {
    // Line 21 is nearEdge()'s `return n < 10;` in the fixture module.
    const sites = enumerateSites(fixtureSource(), new Set([21]));

    assert.deepEqual(sites.map(shorthand), [
        '21:relational <-><=',
        '21:integer 10->11',
        '21:integer 10->9',
    ]);
});

test('an integer is a bound only outside a subscript, a bit mask, and a key',
    () => {
        const source = [
            'const bound = size <= 3;',       // 1: both are sites
            'const mask = flags & 8;',        // 2: bitwise operand
            'const shifted = 1 << 4;',        // 3: both bitwise operands
            'const complement = ~1;',         // 4: bitwise operand
            'const hex = 0x10;',              // 5: not decimal
            'const cell = grid[2];',          // 6: subscript
            'const offset = grid[i + 1];',    // 7: subscript
            'const nested = grid[clamp(5)];', // 8: argument, not an index
            'const named = { 6: x };',        // 9: object-literal key
            'const chosen = { a: f ? 7 : 8 };', // 10: ternary, not a key
            'const label = switchCase;',      // 11: no site
            'const real = 1.5;',              // 12: not an integer
            'const grouped = 1_000;',         // 13: a site
            'const listed = [9];',            // 14: array literal, not a index
        ].join('\n');

        const sites = enumerateSites(source);

        assert.deepEqual(sites.map(shorthand), [
            '1:relational <=-><',
            '1:integer 3->4',
            '1:integer 3->2',
            '8:integer 5->6',
            '8:integer 5->4',
            '10:integer 7->8',
            '10:integer 7->6',
            '10:integer 8->9',
            '10:integer 8->7',
            // The separator is dropped from the replacement, which stays a
            // valid literal.
            '13:integer 1_000->1001',
            '13:integer 1_000->999',
            '14:integer 9->10',
            '14:integer 9->8',
        ]);
    });

test('a case label is a bound and an object key is not', () => {
    // Both spellings put an integer before a colon. The switch body is a block,
    // so `case 3:` is mutable; the object literal's `3:` is a name.
    const source = [
        'switch (n) { case 3: break; }',
        'const table = { 3: value };',
    ].join('\n');

    assert.deepEqual(enumerateSites(source).map(shorthand),
        ['1:integer 3->4', '1:integer 3->2']);
});

test('a site inside a comment, a string, or a regular expression is invisible',
    () => {
        const source = [
            '// size <= 3 && true',
            'const quoted = "size <= 3 && true";',
            'const pattern = /size <= 3/u;',
            'const text = `size <= 3 ${live >= 4} tail`;',
        ].join('\n');

        // Only the code inside the template substitution is code.
        assert.deepEqual(enumerateSites(source).map(shorthand), [
            '4:relational >=->>',
            '4:integer 4->5',
            '4:integer 4->3',
        ]);
    });

test('a substitution replaces the token and nothing else', () => {
    const source = 'return a <= b;';
    const [site] = enumerateSites(source);

    assert.equal(applyMutation(source, site), 'return a < b;');
    // The site addresses the raw source, so a longer or shorter replacement
    // leaves the rest of the line intact.
    assert.equal(applyMutation('const n = 9;', enumerateSites('const n = 9;')[0]),
        'const n = 10;');
});

test('a blanked string becomes one token and keeps its offsets', () => {
    // blankCommentsAndStrings() leaves the quotes and spaces out the body, so
    // the tokenizer has to emit one token whose span covers the quotes and the
    // blanks between them.
    const tokens = tokenize('a = \'    \' + 1;');

    assert.deepEqual(tokens.map((token) => `${token.kind}:${token.text}`),
        ['identifier:a', 'punctuator:=', 'string:\'', 'punctuator:+',
            'number:1', 'punctuator:;']);
    // The string token spans both quotes and the four blanked characters
    // between them, so it starts at the opening quote's offset, 4, and ends
    // after the closing quote at offset 9.
    assert.equal(tokens[2].start, 4);
    assert.equal(tokens[2].end, 10);
});

test('a run that executes no test file is not a run of survivors', () => {
    // `node --test` exports NODE_TEST_CONTEXT to its children, and an inner
    // `--test` run that inherits it skips every file it was given and still
    // exits 0. This test file is itself a child of the runner, so the variable
    // is set here, and the count below is what catches the empty run.
    assert.equal(reportedTestCount('# tests 12\n# pass 12\n'), 12);
    assert.equal(reportedTestCount('ℹ tests 12'), 12);
    assert.equal(reportedTestCount('Warning: skipping running files.'), 0);

    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget({ lines: new Set([10]) })],
        allTests: FIXTURE_SUITE,
        wholeSuite: true,
    }));

    // bounds.test.mjs holds five tests and wrapper.test.mjs holds one.
    assert.equal(result.baselineTests, 6);
});

// ---------------------------------------------------------------------------
// Which tests cover a module
// ---------------------------------------------------------------------------

test('the verdict suite is the test files a js/ mutation can affect', () => {
    const { suite, unaffected } = partitionTestFiles();

    for (const name of [...suite, ...unaffected])
        assert.match(name, /\.test\.mjs$/u);
    // scripts/hack.test.mjs imports js/hack.js, so a mutation can fail it.
    assert.equal(suite.includes('hack.test.mjs'), true);
    // This file imports no js/ module. It reads js/ files as text and compares
    // them with git, so running it against a mutated module would fail it for a
    // reason that has nothing to do with game behavior.
    assert.equal(unaffected.includes('mutate-sites.test.mjs'), true);
    // scripts/quality-status.test.mjs reads QUALITY.json and imports no js/
    // module, so no mutation can reach it.
    assert.equal(unaffected.includes('quality-status.test.mjs'), true);
    // A helper module under scripts/ holds no test and appears in neither list.
    assert.equal([...suite, ...unaffected]
        .includes('monster-test-state.mjs'), false);
});

test('the walk stops at the first js/ module it reaches', () => {
    const covering = coveringTests(FIXTURE_ROOT);

    // bounds.test.mjs and red-baseline.test.mjs import js/bounds.js directly,
    // in file-name order. wrapper.test.mjs reaches it only through
    // js/wrapper.js, so it covers the wrapper and not the bound: following
    // js/-to-js/ imports would put most of a real suite behind every module.
    // Keys arrive in the order the walk reaches them, so bounds.test.mjs, the
    // first test file by name, registers js/bounds.js first.
    assert.deepEqual([...covering], [
        ['js/bounds.js', ['bounds.test.mjs', 'red-baseline.test.mjs']],
        ['js/wrapper.js', ['wrapper.test.mjs']],
    ]);
});

test('the repository maps its own modules to test files', () => {
    // A real module, to show that the walk resolves the repository's own
    // specifiers: scripts/mondata-pure.test.mjs imports js/mondata.js.
    const covering = coveringTests();

    assert.equal(covering.get('js/mondata.js').includes('mondata-pure.test.mjs'),
        true);
});

// ---------------------------------------------------------------------------
// Applying the mutants
// ---------------------------------------------------------------------------

test('the fixture run reports exactly the mutants its test leaves alive',
    () => {
        const result = withWorkspace((workspace) => runMutants({
            workspace,
            targets: [fixtureTarget()],
            allTests: FIXTURE_SUITE,
            wholeSuite: true,
        }));

        // js/bounds.js documents why these five survive: nearEdge() is tested
        // far from its boundary, and nothing calls padded().
        assert.deepEqual(result.survivors.map(shorthand), [
            '21:relational <-><=',
            '21:integer 10->11',
            '21:integer 10->9',
            '34:integer 1->2',
            '34:integer 1->0',
        ]);
        // Of the module's thirteen mutants, seven change a value
        // scripts/bounds.test.mjs asserts and forwarded()'s mutant is killed by
        // scripts/wrapper.test.mjs in the second wave.
        assert.equal(result.killed, 8);
        assert.equal(result.firstWaveKilled, 7);
        assert.equal(result.wholeSuiteKilled, 1);
        assert.equal(result.ran, 13);
        assert.equal(result.timeouts, 0);
        assert.deepEqual(result.baselineFiles, FIXTURE_SUITE);

        const report = formatReport(result);
        assert.equal(report[0], 'verdict: the whole suite, 2 test file(s)');
        assert.equal(report[1], 'survived js/bounds.js:21:14: relational '
            + '`<` -> `<=` (the whole suite passed; first wave was 1 file(s): '
            + 'bounds.test.mjs)');
        assert.match(report.at(-1),
            /^13 mutant\(s\): 8 killed, 5 survived, 0 timed out;/u);
    });

test('a mutant the first wave passes and a wider file kills counts as killed',
    () => {
        // Line 63 of js/bounds.js is forwarded(), which only js/wrapper.js
        // reaches. scripts/bounds.test.mjs is the entire first wave for
        // js/bounds.js and passes this mutation; scripts/wrapper.test.mjs fails
        // on it. This is the shape of js/hack.js:544 in the repository, where
        // scripts/closed-door-autoopen.test.mjs kills a mutant that all seven
        // test files importing js/hack.js directly pass.
        const result = withWorkspace((workspace) => runMutants({
            workspace,
            targets: [fixtureTarget({ lines: new Set([63]) })],
            allTests: ['bounds.test.mjs', 'wrapper.test.mjs'],
            wholeSuite: true,
        }));

        assert.equal(result.ran, 1);
        assert.deepEqual(result.survivors, []);
        // The first wave passed it and the rest of the suite killed it, so the
        // verdict cannot come from the first wave alone.
        assert.equal(result.firstWaveKilled, 0);
        assert.equal(result.wholeSuiteKilled, 1);
    });

test('without --whole-suite the first wave is the verdict and the report says so',
    () => {
        const result = withWorkspace((workspace) => runMutants({
            workspace,
            targets: [fixtureTarget({ lines: new Set([63]) })],
            allTests: FIXTURE_SUITE,
        }));

        // The same mutant the previous test sees killed. Without the second
        // wave, scripts/wrapper.test.mjs never runs and the mutant survives, so
        // the report has to say the verdict came from the first wave alone.
        assert.equal(result.ran, 1);
        assert.equal(result.survivors.length, 1);
        assert.equal(result.wholeSuiteRuns, 0);
        // Only the first wave ran, so the baseline is the first wave too, and
        // scripts/wrapper.test.mjs is left out of both.
        assert.deepEqual(result.baselineFiles, ['bounds.test.mjs']);

        const report = formatReport(result);
        assert.match(report[0], /^verdict: the first wave only,/u);
        assert.match(report[0], /pass --whole-suite/u);
        assert.equal(report.some((line) => line.startsWith('full suite:')),
            false);
    });

test('without --whole-suite a module with no first wave is unmeasured',
    () => {
        const result = withWorkspace((workspace) => runMutants({
            workspace,
            targets: [fixtureTarget({ tests: [], lines: new Set([10]) })],
            allTests: FIXTURE_SUITE,
        }));

        // Nothing ran, so nothing is known. Reporting the two mutants of line 10
        // as survivors would claim a gap that was never tested for.
        assert.equal(result.ran, 0);
        assert.deepEqual(result.survivors, []);
        assert.equal(formatReport(result).some((line) => line.startsWith(
            'unmeasured js/bounds.js: 2 site(s)')), true);
    });

test('the module is restored after the last mutant', () => {
    const before = fixtureSource();
    withWorkspace((workspace) => {
        runMutants({ workspace, targets: [fixtureTarget({ lines: new Set([10]) })],
            allTests: FIXTURE_SUITE, wholeSuite: true });
        // The workspace copy, not the repository file, is what a mutation
        // rewrites; it has to be put back so the next file's baseline holds.
        assert.equal(readFileSync(`${workspace}/js/bounds.js`, 'utf8'), before);
    });
    assert.equal(fixtureSource(), before);
});

test('a red baseline stops the run before the first mutant',
    () => {
        // scripts/red-baseline.test.mjs asserts LIMIT === 5 against a module
        // that sets it to 4. Every mutant would look killed against it.
        assert.throws(
            () => withWorkspace((workspace) => runMutants({
                workspace,
                targets: [fixtureTarget()],
                allTests: ['red-baseline.test.mjs'],
                wholeSuite: true,
            })),
            /the unmutated tests do not pass/u,
        );
    });

test('a module with an empty first wave is still judged by the suite', () => {
    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget({ tests: [], lines: new Set([10]) })],
        allTests: FIXTURE_SUITE,
        wholeSuite: true,
    }));

    // Line 10 is `export const LIMIT = 4;`, which scripts/bounds.test.mjs
    // asserts. With no first wave, both of its mutants go straight to the
    // suite, which kills them. The covering-set rule this replaced called such
    // a module unmeasurable and ran nothing.
    assert.equal(result.ran, 2);
    assert.equal(result.firstWaveRuns, 0);
    assert.equal(result.wholeSuiteRuns, 2);
    assert.equal(result.killed, 2);
    assert.deepEqual(result.survivors, []);
});

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

test('a seeded draw repeats exactly and picks each item once', () => {
    const items = Array.from({ length: 100 }, (_, index) => index);

    // A sample is worth reporting only if someone else can rerun it, so the
    // seed has to fix the draw.
    assert.deepEqual(sampleItems(items, 10, 7), sampleItems(items, 10, 7));
    assert.notDeepEqual(sampleItems(items, 10, 7), sampleItems(items, 10, 8));

    const drawn = sampleItems(items, 10, 7);
    assert.equal(drawn.length, 10);
    // Without replacement, and every item from the population.
    assert.equal(new Set(drawn).size, 10);
    for (const item of drawn) assert.equal(items.includes(item), true);
    // Asking for the whole population, or more, returns all of it.
    assert.deepEqual(sampleItems(items, 100, 7), items);
    assert.deepEqual(sampleItems(items, 500, 7), items);
});

test('a draw spreads over the population', () => {
    const items = Array.from({ length: 1000 }, (_, index) => index);
    const drawn = sampleItems(items, 200, 4);

    // A biased draw is the failure this guards against. Taking the first n in
    // order, which is what the dropped `--limit` did, would measure one corner
    // of the codebase. An even draw puts about 100 of the 200 in the lower
    // half; taking them in order puts either 200 or 0 there.
    const lower = drawn.filter((item) => item < 500).length;
    assert.equal(lower > 60 && lower < 140, true);
});

test('the kill rate carries a Wilson interval', () => {
    // 12 of 30 worked by hand: p = 0.4, z = 1.96, giving 24.6% to 57.7%.
    const twelveOfThirty = killRateInterval(12, 30);
    assert.equal(twelveOfThirty.rate.toFixed(1), '40.0');
    assert.equal(twelveOfThirty.low.toFixed(1), '24.6');
    assert.equal(twelveOfThirty.high.toFixed(1), '57.7');

    // Wilson stays inside 0 and 100 at the ends, where the textbook normal
    // interval runs past them.
    const all = killRateInterval(20, 20);
    assert.equal(all.rate, 100);
    assert.equal(all.high <= 100, true);
    assert.equal(all.low > 80, true);
    const none = killRateInterval(0, 20);
    assert.equal(none.low >= 0, true);
    assert.equal(none.high < 20, true);
    // Nothing ran, so there is nothing to estimate.
    assert.deepEqual(killRateInterval(0, 0), { rate: 0, low: 0, high: 0 });
});

test('a kind list narrows the target set to those kinds', () => {
    const paths = ['js/regen.js'];
    const whole = collectTargets({ paths });
    const narrowed = collectTargets({ paths,
        kinds: ['relational', 'logical', 'boolean'] });
    const kindsIn = (targets) =>
        [...new Set(targets.flatMap((target) =>
            target.sites.map((site) => site.kind)))].sort();

    // A pass runs the three kinds that mark a branch. Integer bounds are the
    // largest group and the weakest signal, so leaving them out is most of the
    // saving.
    assert.deepEqual(kindsIn(whole), SITE_KINDS);
    assert.deepEqual(kindsIn(narrowed), ['boolean', 'logical', 'relational']);
    const mutants = (targets) =>
        targets.reduce((n, target) => n + target.sites.length, 0);
    assert.equal(mutants(narrowed) < mutants(whole), true);
    // Whatever survives the filter is a site the unfiltered run also held.
    const offsets = new Set(whole.flatMap((target) =>
        target.sites.map((site) => `${target.path}:${site.offset}`)));
    for (const target of narrowed) {
        for (const site of target.sites)
            assert.equal(offsets.has(`${target.path}:${site.offset}`), true);
    }
});

test('a file left with no site of the named kinds drops out', () => {
    // js/dungeon_data.js is generated table data whose only mutable sites are
    // integers, so a run for the three branch kinds has nothing to mutate
    // there. It has to leave the target set rather than sit in it with an empty
    // site list, which the report would print as a file measuring nothing.
    const paths = ['js/dungeon_data.js', 'js/regen.js'];
    const unfiltered = collectTargets({ paths });
    const targets = collectTargets({ paths,
        kinds: ['relational', 'logical', 'boolean'] });

    assert.equal(unfiltered.length, 2);
    assert.deepEqual(targets.map((target) => target.path), ['js/regen.js']);
    for (const target of targets) assert.equal(target.sites.length > 0, true);
});

test('a sample cuts the target set down and repeats with its seed', () => {
    const mutants = (targets) =>
        targets.flatMap((target) => target.sites.map((site) =>
            `${target.path}:${site.offset}:${site.replacement}`));
    const paths = ['js/lock.js', 'js/regen.js'];
    const drawn = collectTargets({ paths, sample: 6, seed: 5 });
    const again = collectTargets({ paths, sample: 6, seed: 5 });
    const whole = collectTargets({ paths });

    assert.equal(mutants(drawn).length, 6);
    assert.deepEqual(mutants(drawn), mutants(again));
    // Every drawn mutant belongs to the population it was drawn from.
    for (const mutant of mutants(drawn))
        assert.equal(mutants(whole).includes(mutant), true);
    assert.equal(mutants(whole).length > 6, true);
});

test('the report breaks the kill rate down by mutation kind', () => {
    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget()],
        allTests: FIXTURE_SUITE,
        wholeSuite: true,
    }));
    const report = formatReport(result, 13);

    // js/bounds.js holds one logical site, which scripts/bounds.test.mjs kills,
    // and three relational sites, of which scripts/bounds.test.mjs kills one and
    // scripts/wrapper.test.mjs kills another.
    assert.deepEqual(result.byKind.get('logical'), { ran: 1, killed: 1 });
    assert.deepEqual(result.byKind.get('relational'), { ran: 3, killed: 2 });
    assert.equal(report.some((line) => line.startsWith(
        'kind relational: 2 of 3 killed, 66.7%')), true);
    // The population equals what ran, so no sample line is printed.
    assert.equal(report.some((line) => line.startsWith('kill rate:')), false);
});

test('a sampled run states the interval for the population it sampled', () => {
    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget({ lines: new Set([10]) })],
        allTests: FIXTURE_SUITE,
        wholeSuite: true,
    }));

    // Line 10 is `export const LIMIT = 4;`: two mutants, both killed, drawn from
    // a population of thirteen.
    assert.equal(result.ran, 2);
    assert.equal(result.killed, 2);
    assert.equal(formatReport(result, 13).some((line) => line.startsWith(
        'kill rate: 100.0% of the 2 mutant(s) run, a 95% interval of ')), true);
});

// ---------------------------------------------------------------------------
// The command line and the census
// ---------------------------------------------------------------------------

test('every target is named by --range, --file, or --worktree', () => {
    assert.deepEqual(parseArgs(['--range', 'a..b']),
        { range: 'a..b', paths: [], worktree: false, kinds: null,
            enumerateOnly: false, emitTrailer: false, wholeSuite: false,
            sample: null, seed: 1, report: null, fromReport: null });
    assert.deepEqual(parseArgs(['--file', 'js/a.js', '--file', 'js/b.js']),
        { range: null, paths: ['js/a.js', 'js/b.js'], worktree: false,
            kinds: null, enumerateOnly: false, emitTrailer: false,
            wholeSuite: false, sample: null, seed: 1, report: null,
            fromReport: null });
    // `--name=value` and `--name value` are the same option.
    assert.deepEqual(parseArgs(['--range=a..b', '--enumerate-only',
        '--whole-suite', '--sample=40', '--seed=7']),
    { range: 'a..b', paths: [], worktree: false, kinds: null,
        enumerateOnly: true, emitTrailer: false, wholeSuite: true,
        sample: 40, seed: 7, report: null, fromReport: null });
    assert.deepEqual(parseArgs(['--range', 'a..b',
        '--kind', 'logical,relational,logical']).kinds,
    ['logical', 'relational']);
    assert.throws(() => parseArgs(['--kind', 'statement']),
        /--kind takes boolean, integer, logical, relational, not 'statement'/u);
    assert.throws(() => parseArgs(['--sample', '0']), /positive integer/u);
    assert.throws(() => parseArgs(['--seed', 'x']), /positive integer/u);

    assert.throws(() => parseArgs(['--range', 'a..b', '--all']),
        /unknown option/u);
    assert.throws(() => parseArgs(['--range', 'a..b', '--range', 'c..d']),
        /pass one --range/u);
    // A range already decides which lines of which files are in scope, so a
    // file alongside it would have no meaning.
    assert.throws(() => parseArgs(['--range', 'a..b', '--file', 'js/a.js']),
        /pass one of --range and --file, not both/u);
    // --worktree scopes the uncommitted diff, which no range and no file names.
    assert.deepEqual(parseArgs(['--worktree']).worktree, true);
    assert.throws(() => parseArgs(['--worktree', '--range', 'a..b']),
        /pass one of --range and --worktree, not both/u);
    assert.throws(() => parseArgs(['--worktree', '--file', 'js/a.js']),
        /pass one of --file and --worktree, not both/u);
    assert.throws(() => parseArgs(['--worktree=yes']),
        /--worktree takes no value/u);
    // --limit was dropped: it truncated in path order, so every use of it
    // measured whichever files sorted first. --sample answers the same need
    // without picking the population for you. The header-versus-parser case
    // below is what keeps the usage block from documenting it again.
    assert.throws(() => parseArgs(['--range', 'a..b', '--limit', '5']),
        /unknown option '--limit'/u);
    assert.throws(() => parseArgs(['--range', 'HEAD']),
        /range must be spelled/u);
    assert.throws(() => parseArgs([]), /pass --range/u);
    // A value the shell dropped, or an argument with no option name, is a
    // mistake to report, and no kind of target to guess at.
    assert.throws(() => parseArgs(['--range']), /--range takes a value/u);
    assert.throws(() => parseArgs(['--file']), /--file takes a value/u);
    assert.throws(() => parseArgs(['js/a.js']), /unexpected argument/u);
    assert.throws(() => parseArgs(['a..b']), /unexpected argument/u);
    assert.throws(() => parseArgs(['--enumerate-only=yes']),
        /takes no value/u);
    assert.throws(() => parseArgs(['--whole-suite=yes']),
        /--whole-suite takes no value/u);
});

// AGENTS.md sends every agent to this module's header comment before
// mutation-testing, and that header is the tool's only usage documentation.
// ab22231 removed --limit and left the sentence documenting it, and nothing
// compared the header with the parser, so the contradiction sat there with the
// suite green. This case compares them.
test('every option the header documents is an option parseArgs accepts', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf8');
    const header = [];
    for (const line of source.split('\n').slice(1)) {
        // The usage block runs from below the shebang to the first line that
        // is not a comment, which is the first import.
        if (line !== '' && !line.startsWith('//')) break;
        header.push(line);
    }
    // The lookbehind drops `node --test`, which the header names as the
    // runner's own flag rather than one of this tool's.
    const documented = [...new Set(
        header.join('\n').match(/(?<!node )--[a-z][a-z-]*/gu) ?? [],
    )].sort();
    // The header describes the whole option surface. An empty or tiny match
    // would mean the extraction broke rather than that the tool takes no
    // options, and the loop below would then assert nothing.
    assert.ok(
        documented.length >= 6,
        `extracted ${documented.length} options: ${documented.join(' ')}`,
    );

    for (const option of documented) {
        let refusal = '';
        try {
            parseArgs([option]);
        } catch (error) {
            refusal = error.message;
        }
        // A value-taking option refuses a bare form with "takes a value", and
        // an option that names no target refuses with "pass --range"; only an
        // option the parser does not know reports "unknown option".
        assert.doesNotMatch(
            refusal,
            /unknown option/u,
            `${option} is documented in the header but not accepted`,
        );
    }
});

test('a path outside js/ is refused', () => {
    // The mutator only rewrites the workspace's js/ copy, and a test file it
    // rewrote instead would report every mutant as killed.
    assert.throws(() => collectTargets({ paths: ['scripts/lock.test.mjs'] }),
        /is not a file under js\//u);
    assert.throws(() => collectTargets({ paths: ['js/no-such-module.js'] }),
        /is not a file under js\//u);
});

test('the counts separate sites from mutants and state the density', () => {
    const target = fixtureTarget();
    // 40 lines is an arbitrary round population; the density it produces,
    // 8 / 40, is exact.
    const counts = formatSiteCounts([{ ...target, lineCount: 40 }], 40);

    assert.equal(counts.at(-2), '1 file(s), 40 line(s) in scope, 9 site(s), '
        + '13 mutant(s); 0.225 sites per line in scope');
    assert.equal(counts.at(-1), 'mutants by kind: boolean 1, integer 8, '
        + 'logical 1, relational 3; an integer site yields one mutant each way');
});

test('a real range resolves to files, lines, and covering tests', () => {
    const targets = collectTargets({ range: `${newestJsCommit()}~1..HEAD` });

    // The base is the parent of the newest commit that touched js/, so the
    // range holds at least that commit's changed lines. A range with no js/
    // file would let the loop below assert nothing and still pass, which is the
    // failure this script exists to report.
    assert.equal(targets.length > 0, true);
    for (const target of targets) {
        assert.match(target.path, /^js\//u);
        assert.equal(target.lineCount > 0, true);
        assert.equal(typeof target.source, 'string');
        for (const site of target.sites) {
            // Every site sits on a line the range touched, and its description
            // is what the report prints.
            assert.equal(site.line > 0, true);
            assert.match(describeSite({ ...site, path: target.path }),
                /^js\/[\w.]+:\d+:\d+: \w+ `.*` -> `.*`$/u);
        }
    }
});

/** The text of each line a range added, keyed by path. */
function addedTextIn(range) {
    const diff = execFileSync('git',
        ['diff', '--unified=0', '--no-color', range, '--', 'js/'],
        { encoding: 'utf8', maxBuffer: 1e8 });
    const added = new Map();
    let path = null;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++ ')) {
            path = line.slice(4).trim().replace(/^b\//u, '');
            continue;
        }
        if (!path || !line.startsWith('+')) continue;
        if (!added.has(path)) added.set(path, new Set());
        added.get(path).add(line.slice(1));
    }
    return added;
}

test('the uncommitted diff is scoped by its working-tree line numbers', () => {
    withTempRepo(({ root, git }) => {
        const write = (name, text) =>
            writeFileSync(join(root, 'js', name), text);
        write('one.js', 'const a = 1;\n');
        git('add', '-A');
        git('commit', '--quiet', '-m', 'first');

        // A clean tree has nothing uncommitted, so nothing is in scope.
        assert.deepEqual([...uncommittedJsLines(root)], []);

        // Two lines added at the top push the committed line to line 3. The
        // numbers `git diff HEAD` reports already address the working tree, so
        // they need no blame step, and survivingRangeLines() cannot supply them
        // at all: an uncommitted line blames to the all-zero commit.
        write('one.js', 'const added = n < 10;\nconst also = m > 2;\n'
            + 'const a = 1;\n');
        const scope = uncommittedJsLines(root);

        assert.deepEqual([...scope.keys()], ['js/one.js']);
        assert.deepEqual([...scope.get('js/one.js')], [1, 2]);

        // And the flag has to reach it: `--worktree` puts exactly those two
        // lines in scope, which is four mutants, the relational operator and
        // the integer on each.
        const targets = collectTargets({ worktree: true }, root);
        assert.deepEqual(targets.map((target) => target.path), ['js/one.js']);
        assert.equal(targets[0].lineCount, 2);
        assert.deepEqual(targets[0].sites.map((site) => site.line).sort(),
            [1, 1, 1, 2, 2, 2]);
    });
});

test('the killing test file is read from a run that genuinely fails', () => {
    // The reporter's format is not an API, so this pins it against real output
    // instead of a handwritten string. Two files, one failing, one passing: only
    // the failing file may be named.
    const root = mkdtempSync(join(tmpdir(), 'mutate-sites-report-'));
    try {
        mkdirSync(join(root, 'scripts'));
        writeFileSync(join(root, 'scripts', 'red.test.mjs'),
            "import assert from 'node:assert/strict';\n"
            + "import test from 'node:test';\n"
            + "test('a passes', () => { assert.equal(1, 1); });\n"
            + "test('b fails', () => { assert.equal(1, 2); });\n");
        writeFileSync(join(root, 'scripts', 'green.test.mjs'),
            "import assert from 'node:assert/strict';\n"
            + "import test from 'node:test';\n"
            + "test('c passes', () => { assert.equal(1, 1); });\n");
        // Both reporters are named explicitly because `node --test` picks
        // between them by Node version, and `package.json` supports the whole
        // range: Node 22 defaults to TAP when stdout is not a terminal, where
        // Node 24 defaults to spec. Leaving the choice to the default pins
        // only whichever reporter the developer happens to run, which is how
        // the TAP half went unread until CI, pinned to 22, reported it.
        for (const reporter of ['spec', 'tap']) {
            const run = spawnSync(process.execPath,
                ['--test', `--test-reporter=${reporter}`,
                    'scripts/red.test.mjs', 'scripts/green.test.mjs'], {
                    cwd: root,
                    encoding: 'utf8',
                    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
                });

            assert.equal(run.status, 1, reporter);
            assert.deepEqual(
                killingTestFiles(`${run.stdout}${run.stderr}`),
                ['red.test.mjs'],
                reporter,
            );
        }
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
    // A run that fails without naming a test, such as a module that throws at
    // import, attributes nothing. Reporting no killer beats inventing one.
    assert.deepEqual(killingTestFiles('SyntaxError: Unexpected token'), []);
});

test('each killed mutant records the test file that killed it', () => {
    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget()],
        allTests: FIXTURE_SUITE,
        wholeSuite: true,
    }));
    const killedAt = (line) =>
        result.kills.filter((kill) => kill.line === line);

    // Line 10 is `export const LIMIT = 4;`, which scripts/bounds.test.mjs
    // asserts, so its first wave kills both mutants.
    assert.equal(killedAt(10).length, 2);
    for (const kill of killedAt(10)) {
        assert.equal(kill.wave, 'first');
        assert.deepEqual(kill.killedBy, ['bounds.test.mjs']);
    }
    // Line 63 is forwarded(), which only js/wrapper.js reaches, so the first
    // wave passes it and the second wave's scripts/wrapper.test.mjs kills it.
    // That names both the wave and a file outside the first wave.
    assert.deepEqual(killedAt(63).map((kill) => kill.wave), ['suite']);
    assert.deepEqual(killedAt(63)[0].killedBy, ['wrapper.test.mjs']);

    // Every killed mutant is on the record, and the report prints each one.
    assert.equal(result.kills.length, result.killed);
    const report = formatReport(result, result.ran);
    assert.equal(report.some((line) => line.startsWith(
        'killed js/bounds.js:63:14: relational `>=` -> `>` (suite wave: '
        + 'wrapper.test.mjs)')), true);
});

test('each timed-out mutant records its identity and wave', () => {
    let calls = 0;
    const runTestWave = () => {
        calls += 1;
        if (calls === 1) {
            return {
                passed: true,
                timedOut: false,
                seconds: 0,
                output: '# tests 1\n',
            };
        }
        return {
            passed: false,
            timedOut: true,
            seconds: 0,
            output: '',
        };
    };
    const result = withWorkspace((workspace) => runMutants({
        workspace,
        // Line 10 holds one integer site and therefore two mutant identities.
        targets: [fixtureTarget({ lines: new Set([10]) })],
        allTests: FIXTURE_SUITE,
        runTestWave,
    }));

    assert.equal(result.timeouts, 2);
    assert.deepEqual(result.timeoutRecords.map((timeout) => ({
        path: timeout.path,
        line: timeout.line,
        column: timeout.column,
        replacement: timeout.replacement,
        wave: timeout.wave,
    })), [
        { path: 'js/bounds.js', line: 10, column: 22,
            replacement: '5', wave: 'first' },
        { path: 'js/bounds.js', line: 10, column: 22,
            replacement: '3', wave: 'first' },
    ]);
    const lines = formatReport(result);
    assert.equal(lines.some((line) => line.startsWith(
        'timed out js/bounds.js:10:22: integer `4` -> `5` '
        + '(first wave)')), true);
});

test('suite-wave timeouts retain their identity in both reports', () => {
    let calls = 0;
    const runTestWave = () => {
        calls += 1;
        const suiteTimeout = calls >= 3 && calls % 2 === 1;
        return {
            passed: !suiteTimeout,
            timedOut: suiteTimeout,
            seconds: 0,
            output: suiteTimeout ? '' : '# tests 1\n',
        };
    };
    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget({ lines: new Set([10]) })],
        allTests: FIXTURE_SUITE,
        wholeSuite: true,
        runTestWave,
    }));

    assert.equal(result.timeouts, 2);
    assert.deepEqual(
        result.timeoutRecords.map(({ replacement, wave }) => ({
            replacement, wave,
        })),
        [
            { replacement: '5', wave: 'suite' },
            { replacement: '3', wave: 'suite' },
        ],
    );
    assert.equal(formatReport(result).filter((line) =>
        line.includes('(suite wave)')).length, 2);
    assert.deepEqual(
        reportFromResult(result).timeouts.map(({ wave }) => wave),
        ['suite', 'suite'],
    );
});

test('a workspace is removed when a run is killed', async () => {
    // removeWorkspace() runs from a `finally` arm, which a terminating signal
    // skips, so an interrupted run used to leave 6.7 MB of copied js/ and
    // scripts/ behind. The handler has to remove it and re-raise.
    const child = spawn(process.execPath, ['--input-type=module', '-e',
        `const M = await import(${JSON.stringify(SCRIPT_PATH)});`
        + 'console.log(M.createWorkspace());'
        + 'setTimeout(() => {}, 60000);'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const workspace = await new Promise((resolve, reject) => {
        let out = '';
        child.stdout.on('data', (chunk) => {
            out += chunk;
            if (out.includes('\n')) resolve(out.trim());
        });
        child.on('error', reject);
        child.on('exit', () => reject(new Error(`child exited: ${out}`)));
    });

    assert.match(workspace, /teleport-mutate-/u);
    assert.equal(existsSync(workspace), true);

    const exit = new Promise((resolve) => {
        child.on('exit', (code, signal) => resolve(signal));
    });
    child.kill('SIGTERM');

    // The handler re-raises, so the caller sees the signal it sent rather than
    // an exit code the handler invented.
    assert.equal(await exit, 'SIGTERM');
    assert.equal(existsSync(workspace), false);
});

test('a blamed line holds text that the range added', () => {
    // The two numbering schemes are not comparable: survivingRangeLines()
    // reports positions in the working tree and changedJsLines() reports
    // positions as of the head commit, so a commit that grows a file above a
    // reviewed line moves it in one scheme and not the other. What must hold is
    // that the text found at each blamed position is text the range wrote.
    //
    // The newest js/ commit and the fifth newest cover both cases: a range
    // whose lines have had no chance to move, and one whose lines have had
    // four commits' worth.
    const heads = execFileSync('git',
        ['log', '--format=%H', '-5', '--', 'js/'], { encoding: 'utf8' })
        .trim().split('\n');

    for (const head of [heads[0], heads.at(-1)]) {
        const range = `${head}~1..${head}`;
        const addedText = addedTextIn(range);
        const fromDiff = changedJsLines(range);
        const fromBlame = survivingRangeLines(range);

        assert.equal(fromBlame.size > 0, true);
        for (const [path, lines] of fromBlame) {
            assert.equal(lines.size > 0, true);
            // A later commit can take a line away from the range and cannot
            // give it one, so blame never names more lines than the diff did.
            assert.equal(lines.size <= fromDiff.get(path).size, true);
            const current = readFileSync(path, 'utf8').split('\n');
            for (const line of lines)
                assert.equal(addedText.get(path).has(current[line - 1]), true);
        }
    }
});

/**
 * Build a throwaway repository and hand `body` its root and a git runner.
 *
 * The repository under test cannot supply the cases below: proving that blame
 * reads the working tree needs an uncommitted edit, and proving that a deleted
 * file is skipped needs a commit that deletes one. Neither may happen in js/.
 */
function withTempRepo(body) {
    const root = mkdtempSync(join(tmpdir(), 'mutate-sites-repo-'));
    const git = (...args) =>
        execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    try {
        git('init', '--quiet');
        git('config', 'user.email', 'test@example.invalid');
        git('config', 'user.name', 'Mutate Range Test');
        mkdirSync(join(root, 'js'));
        // collectTargets() reads the covering test files from here. Git ignores
        // an empty directory, so it stays out of every commit below.
        mkdirSync(join(root, 'scripts'));
        return body({ root, git });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

test('blame reads the working tree, and skips a file deleted since', () => {
    withTempRepo(({ root, git }) => {
        const write = (name, text) =>
            writeFileSync(join(root, 'js', name), text);
        const commit = (message) => {
            git('add', '-A');
            git('commit', '--quiet', '-m', message);
            return git('rev-parse', 'HEAD');
        };

        write('one.js', 'const a = 1;\n');
        write('two.js', 'const b = 2;\n');
        const base = commit('first');
        // The range under test changes both files.
        write('one.js', 'const a = 1;\nconst added = n < 10;\n');
        write('two.js', 'const b = 2;\nconst alsoAdded = m < 20;\n');
        const head = commit('second');

        // With the head committed and the tree clean, the two numbering schemes
        // agree, so blame must reproduce the diff exactly. Only a controlled
        // repository can assert that: in a working repository a later commit or
        // an uncommitted edit shifts the working-tree positions.
        assert.deepEqual(
            [...survivingRangeLines(`${base}..${head}`, root)]
                .map(([path, lines]) => [path, [...lines]]),
            [...changedJsLines(`${base}..${head}`, root)]
                .map(([path, lines]) => [path, [...lines]]),
        );

        // A later commit deletes one of them, so the range names a file the
        // working tree does not hold.
        rmSync(join(root, 'js', 'two.js'));
        commit('third');
        // An uncommitted edit pushes js/one.js's line 2 down to line 3.
        write('one.js', '// inserted, never committed\nconst a = 1;\n'
            + 'const added = n < 10;\n');

        const surviving = survivingRangeLines(`${base}..${head}`, root);

        // js/two.js is absent because it no longer exists to mutate.
        assert.deepEqual([...surviving.keys()], ['js/one.js']);
        // Line 3, not line 2: blaming the working tree numbers lines by the
        // file the mutator reads. Line 1 is uncommitted, so it belongs to no
        // commit and to no range.
        assert.deepEqual([...surviving.get('js/one.js')], [3]);
    });
});

test('a path puts every line of that file in scope', () => {
    const [target] = collectTargets({ paths: ['js/lock.js'] });
    const source = readFileSync('js/lock.js', 'utf8');

    assert.equal(target.path, 'js/lock.js');
    assert.equal(target.lineCount, source.split('\n').length);
    // No line filter, so the file's every site is a target, and the covering
    // test set is the same one a range over this file would use.
    assert.equal(target.sites.length, enumerateSites(source).length);
    assert.deepEqual(target.tests, coveringTests().get('js/lock.js'));
});

test('a successful outer run authenticates its child and cleans ownership',
    () => {
        const root = mkdtempSync(join(tmpdir(), 'mutate-outer-success-'));
        const lockPath = join(root, 'owner.lock');
        const environment = {
            ...process.env,
            TELEPORT_MUTATION_LOCK: lockPath,
            // A forged worker marker must not bypass the outer owner.
            TELEPORT_MUTATION_CGROUP: '1',
            TELEPORT_MUTATION_SLICE: 'teleport_mutate_1_forged',
        };
        try {
            const run = spawnSync(process.execPath,
                [SCRIPT_PATH, '--file', 'js/lock.js', '--enumerate-only'], {
                    encoding: 'utf8',
                    env: environment,
                });
            const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;

            assert.equal(run.status, 0, output);
            const announcements = [...output.matchAll(
                /Running (?:scope )?as unit: (teleport_mutate_\d+_[a-z0-9]+)_run\.scope/gu,
            )];
            assert.equal(announcements.length, 1, output);
            assert.match(output, /^js\/lock\.js: \d+ line\(s\) in scope/mu);
            const slice = `${announcements[0][1]}.slice`;
            const active = spawnSync('systemctl', [
                '--user', 'is-active', slice,
            ], { encoding: 'utf8' });
            assert.notEqual(active.status, 0, active.stdout);
            const dropIns = execFileSync('systemctl', [
                '--user', 'show', slice,
                '--property=DropInPaths', '--value',
            ], { encoding: 'utf8' }).trim();
            assert.equal(dropIns, '');
            assert.equal(existsSync(lockPath), false);

            const next = spawnSync(process.execPath,
                [SCRIPT_PATH, '--file', 'js/lock.js', '--enumerate-only'], {
                    encoding: 'utf8',
                    env: environment,
                });
            assert.equal(next.status, 0, `${next.stdout}${next.stderr}`);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
});

test('SIGINT and SIGTERM clean only their aggregate run and release the lock',
    async () => {
        for (const interruptSignal of ['SIGINT', 'SIGTERM']) {
            const root = mkdtempSync(join(tmpdir(), 'mutate-outer-signal-'));
            const lockPath = join(root, 'owner.lock');
            const environment = {
                ...process.env,
                TELEPORT_MUTATION_LOCK: lockPath,
            };
            delete environment.TELEPORT_MUTATION_CGROUP;
            delete environment.TELEPORT_MUTATION_SLICE;
            let first = null;
            try {
                first = spawn(process.execPath, [SCRIPT_PATH, '--file',
                    'js/lock.js', '--kind', 'boolean'], {
                    env: environment,
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
                let output = '';
                const baseline = new Promise((resolve, reject) => {
                    // Ten seconds bounds slice startup and the two-file
                    // baseline; the ordinary run reaches it in under two
                    // seconds locally.
                    const timer = setTimeout(
                        () => reject(new Error(
                            `baseline did not start: ${output}`)),
                        10_000,
                    );
                    const accept = (chunk) => {
                        output += chunk;
                        if (!output.includes('baseline:')) return;
                        clearTimeout(timer);
                        resolve();
                    };
                    first.stdout.on('data', accept);
                    first.stderr.on('data', accept);
                    first.once('error', reject);
                    first.once('exit', (code, signal) => reject(new Error(
                        `owner exited before baseline: ${code}/${signal}\n${
                            output}`)));
                });
                await baseline;
                const scope = /Running (?:scope )?as unit: (teleport_mutate_\d+_[a-z0-9]+)_run\.scope/u.exec(output);
                assert.ok(scope, output);
                const sliceGroup = execFileSync('systemctl', [
                    '--user', 'show', `${scope[1]}.slice`,
                    '--property=ControlGroup', '--value',
                ], { encoding: 'utf8' }).trim();
                const outerGroup = execFileSync('systemctl', [
                    '--user', 'show', `${scope[1]}_run.scope`,
                    '--property=ControlGroup', '--value',
                ], { encoding: 'utf8' }).trim();
                assert.equal(outerGroup.startsWith(`${sliceGroup}/`), true);
                const property = (name) => execFileSync('systemctl', [
                    '--user', 'show', `${scope[1]}.slice`,
                    `--property=${name}`, '--value',
                ], { encoding: 'utf8' }).trim();
                assert.equal(property('MemoryAccounting'), 'yes');
                assert.equal(property('MemoryMax'), '2147483648');
                assert.equal(property('MemorySwapMax'), '0');
                assert.equal(property('TasksMax'), '64');

                const contender = spawnSync(process.execPath,
                    [SCRIPT_PATH, '--file', 'js/lock.js',
                        '--enumerate-only'], {
                        env: environment,
                        encoding: 'utf8',
                    });
                assert.equal(contender.status, 2);
                assert.match(contender.stderr,
                    /another mutation run owns/u);
                assert.equal(first.exitCode, null);

                const ownerExit = new Promise((resolve, reject) => {
                    first.once('error', reject);
                    first.once('exit', (code, signal) =>
                        resolve({ code, signal }));
                });
                first.kill(interruptSignal);
                assert.deepEqual(await ownerExit, {
                    code: null,
                    signal: interruptSignal,
                });

                const active = spawnSync('systemctl', [
                    '--user', 'is-active', `${scope[1]}.slice`,
                ], { encoding: 'utf8' });
                assert.notEqual(active.status, 0, active.stdout);

                const next = spawnSync(process.execPath,
                    [SCRIPT_PATH, '--file', 'js/lock.js',
                        '--enumerate-only'], {
                        env: environment,
                        encoding: 'utf8',
                    });
                assert.equal(next.status, 0, `${next.stdout}${next.stderr}`);
            } finally {
                if (first?.exitCode === null && first?.signalCode === null) {
                    const stopped = new Promise((resolve) =>
                        first.once('exit', resolve));
                    first.kill('SIGTERM');
                    // Two seconds exceeds normal aggregate stop and keeps a
                    // broken cleanup path from hanging the test suite itself.
                    await Promise.race([
                        stopped,
                        new Promise((resolve) => setTimeout(resolve, 2_000)),
                    ]);
                    if (first.exitCode === null && first.signalCode === null)
                        first.kill('SIGKILL');
                }
                rmSync(root, { recursive: true, force: true });
            }
        }
    });

test('the command prints a census and rejects a bad argument', () => {
    const census = runDirectMain([
        '--range', `${newestJsCommit()}~1..HEAD`, '--enumerate-only',
    ]);

    assert.equal(census.status, 0);
    assert.match(census.stdout, /\d+ file\(s\), \d+ line\(s\) in scope/u);
    assert.match(census.stdout, /sites per line in scope/u);

    const byPath = runDirectMain([
        '--file', 'js/lock.js', '--enumerate-only',
    ]);

    assert.equal(byPath.status, 0);
    assert.match(byPath.stdout, /^js\/lock\.js: \d+ line\(s\) in scope/mu);

    // An unusable invocation exits 2 and names the problem. A survivor is a
    // finding to review, so a completed run exits 0 whatever it found; only an
    // error reaches this arm.
    const rejected = runDirectMain(['HEAD']);

    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /unexpected argument 'HEAD'/u);
});

test('the emitted trailer carries ran, killed, and the kind filter', () => {
    // 36 mutants ran, 36 killed: the values the standard slice invocation
    // prints; kinds arrive sorted from parseArgs.
    assert.equal(
        formatTrailer({ ran: 36, killed: 36 },
            ['boolean', 'logical', 'relational']),
        'Mutants: 36/36 kind=boolean,logical,relational');
    // A run without --kind mutates every kind.
    assert.equal(formatTrailer({ ran: 5, killed: 4 }, null),
        'Mutants: 5/4 kind=all');
});

test('a survivor report round-trips into a targeted re-run filter', () => {
    // One survivor at bounds.js:21:16 `<` -> `<=`: the identity a filter must
    // match on is path, line, column, and replacement together, because two
    // mutants can share a line (the two integer directions at 21:10 do).
    const result = {
        survivors: [{ path: 'js/bounds.js', line: 21, column: 16,
            kind: 'relational', original: '<', replacement: '<=' }],
        timeoutRecords: [{ path: 'js/bounds.js', line: 10, column: 27,
            kind: 'integer', original: '4', replacement: '5', wave: 'first' }],
    };
    const report = reportFromResult(result, ['relational']);
    assert.equal(report.version, 2);
    assert.equal(report.kind, 'mutate-sites-report');
    assert.deepEqual(report.timeouts, result.timeoutRecords);
    const filter = siteFilterFromReport(report);
    assert.deepEqual(filter.paths, ['js/bounds.js']);
    assert.equal(filter.matches('js/bounds.js',
        { line: 21, column: 16, replacement: '<=' }), true);
    // The sibling mutant on the same line but another column stays excluded.
    assert.equal(filter.matches('js/bounds.js',
        { line: 21, column: 10, replacement: '11' }), false);
    // A future schema bump must refuse rather than misread.
    assert.throws(
        () => siteFilterFromReport({ ...report, version: 3 }),
        /version 2/u,
    );
    assert.throws(() => siteFilterFromReport({ survivors: [] }), /version 2/u);
});
