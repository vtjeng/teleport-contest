#!/usr/bin/env node

// Run one mutation-test wave in its own process group.  A mutant can hang a
// Node test worker; killing only the test-runner parent leaves that worker in
// teleport-mutate.scope, where enough orphans eventually exhaust the scope's
// memory ceiling.  This wrapper kills the complete group at the wave timeout.

import { spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';

function signalGroup(pid, signal) {
    try {
        process.kill(-pid, signal);
    } catch (error) {
        if (error.code !== 'ESRCH') throw error;
    }
}

function main(argv) {
    if (argv.length < 3)
        throw new Error('usage: run-bounded-tests <timeout-ms> <node> <args...>');
    const [timeoutText, nodePath, ...nodeArgs] = argv;
    const timeoutMs = Number(timeoutText);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1)
        throw new Error('timeout-ms must be a positive integer');

    const child = spawn(nodePath, nodeArgs, {
        detached: true,
        stdio: 'inherit',
    });
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        signalGroup(child.pid, 'SIGKILL');
    }, timeoutMs);

    child.once('error', (error) => {
        clearTimeout(timer);
        process.stderr.write(`run-bounded-tests: ${error.message}\n`);
        process.exitCode = 125;
    });
    child.once('exit', (code, signal) => {
        clearTimeout(timer);
        // A failing Node test runner can exit before every worker or helper it
        // started.  The detached test group is disposable after its runner
        // exits, so reap any descendant still holding that process-group id.
        signalGroup(child.pid, 'SIGKILL');
        if (timedOut) {
            process.exitCode = 124;
        } else if (code !== null) {
            process.exitCode = code;
        } else {
            process.exitCode = 128
                + (osConstants.signals[signal] ?? 1);
        }
    });
}

try {
    main(process.argv.slice(2));
} catch (error) {
    process.stderr.write(`run-bounded-tests: ${error.message}\n`);
    process.exitCode = 125;
}
