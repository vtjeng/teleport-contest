#!/usr/bin/env node

// Run one mutation-test wave in its own process group.  A mutant can hang a
// Node test worker; killing only the test-runner parent leaves that worker in
// the wave scope, where enough orphans eventually exhaust its memory ceiling.
// This wrapper kills the original process group at the wave timeout. Its
// caller stops the complete uniquely owned scope after every result, which
// also collects a helper that created another process group.

import { spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';

function signalGroup(pid, signal) {
    // spawn can report an error before assigning a pid. An interrupt during
    // that interval has no process group to clean up.
    if (!Number.isInteger(pid) || pid < 1) return;
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
    let interrupted = false;
    const timer = setTimeout(() => {
        timedOut = true;
        signalGroup(child.pid, 'SIGKILL');
    }, timeoutMs);
    const interrupts = ['SIGINT', 'SIGTERM'];
    const onInterrupt = (signal) => {
        if (interrupted) return;
        interrupted = true;
        clearTimeout(timer);
        signalGroup(child.pid, 'SIGKILL');
        // Re-raise the caller's signal after cleanup. Removing both handlers
        // prevents this handler from intercepting the re-raised signal.
        for (const interrupt of interrupts)
            process.removeListener(interrupt, onInterrupt);
        process.kill(process.pid, signal);
    };
    for (const signal of interrupts) process.on(signal, onInterrupt);

    child.once('error', (error) => {
        clearTimeout(timer);
        for (const signal of interrupts)
            process.removeListener(signal, onInterrupt);
        process.stderr.write(`run-bounded-tests: ${error.message}\n`);
        process.exitCode = 125;
    });
    child.once('exit', (code, signal) => {
        clearTimeout(timer);
        for (const interrupt of interrupts)
            process.removeListener(interrupt, onInterrupt);
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
