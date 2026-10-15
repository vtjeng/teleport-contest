#!/usr/bin/env node

// Run committed checks in a private checkout. Results belong to that commit,
// not to whatever HEAD happens to name when the caller next reads them.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localTmpdir } from './local-tmpdir.mjs';
import { checkpointResultsDirectory } from './checkpoint-results.mjs';
import { digest, readReusableResult, reuseKey } from './checkpoint-reuse.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const C_PATH = 'nethack-c/upstream';
// Per-command settings must not change the other worktrees' configuration.
const GIT_SETTINGS = ['-c', 'core.sparseCheckout=true',
    '-c', 'core.sparseCheckoutCone=false', '-c', 'core.hooksPath=/dev/null'];

function git(root, args) {
    const result = spawnSync('git', [...GIT_SETTINGS, ...args], {
        cwd: root, encoding: 'utf8', env: { ...process.env, GIT_ALLOW_PROTOCOL: 'file' },
    });
    if (result.error || result.status !== 0)
        throw new Error(`git ${args.join(' ')}: ${result.error?.message || result.stderr?.trim()}`);
    return result.stdout.trim();
}

export function parseCheckpointOptions(args) {
    let revision = 'HEAD';
    let verbose = false;
    let force = false;
    let selected = false;
    for (let index = 0; index < args.length; index++) {
        if (args[index] === '--verbose') verbose = true;
        else if (args[index] === '--force') force = true;
        else if (args[index] === '--commit' && !selected
            && args[index + 1] && !args[index + 1].startsWith('-')) {
            revision = args[++index];
            selected = true;
        } else throw new Error('usage: npm run checkpoint -- [--commit <revision>] [--verbose] [--force]');
    }
    return { revision, verbose, force };
}

export function createCheckpointWorkspace(root, commit) {
    const common = resolve(root, git(root, ['rev-parse', '--git-common-dir']));
    const localC = join(common, 'modules', C_PATH);
    const gitlink = git(root, ['ls-tree', commit, '--', C_PATH]);
    const cCommit = /^160000 commit ([a-f0-9]+)\t/u.exec(gitlink)?.[1];
    if (!cCommit || !existsSync(localC))
        throw new Error('checkpoint needs the local nethack-c/upstream repository initialized first');
    // Fail before creating anything if the required C commit is unavailable.
    git(root, ['--git-dir', localC, 'cat-file', '-e', `${cCommit}^{commit}`]);
    const parent = mkdtempSync(join(localTmpdir(), 'teleport-checkpoint-worktree-'));
    const workspace = join(parent, 'repo');
    const remove = () => {
        git(root, ['worktree', 'remove', '--force', workspace]);
        rmSync(parent, { recursive: true, force: true });
    };
    let registered = false;
    try {
        git(root, ['worktree', 'add', '--quiet', '--detach', '--no-checkout', workspace, commit]);
        registered = true;
        const sparse = git(workspace, ['rev-parse', '--git-path', 'info/sparse-checkout']);
        mkdirSync(dirname(sparse), { recursive: true });
        // The fixed workload includes direct development sessions and the
        // opened local-holdout directory. Other nested session directories
        // remain excluded from checkpoint scoring.
        writeFileSync(sparse, '/*\n!/sessions/*/\n/sessions/holdout/\n/sessions/holdout/*\n');
        git(workspace, ['read-tree', '-mu', commit]);
        git(workspace, ['-c', `submodule.${C_PATH}.url=${localC}`,
            '-c', 'protocol.file.allow=always', 'submodule', 'update',
            '--init', '--checkout', '--no-fetch', '--', C_PATH]);
        return { workspace, remove };
    } catch (error) {
        if (registered) remove();
        else rmSync(parent, { recursive: true, force: true });
        throw error;
    }
}

function runChecks(workspace, verbose, reuse) {
    return new Promise((resolveRun, reject) => {
        // One process group lets an interruption stop npm and its descendants
        // before their checkout is removed. No polling is needed.
        const grouped = process.platform !== 'win32';
        const child = spawn(process.execPath,
            ['scripts/checkpoint-checks.mjs', ...(verbose ? ['--verbose'] : []),
                ...(reuse ? ['--reuse', '.cache/checkpoint-reuse.json'] : [])],
            { cwd: workspace, stdio: 'inherit', detached: grouped });
        let interrupted;
        const stop = (signal) => {
            interrupted = signal;
            try {
                if (grouped) process.kill(-child.pid, signal);
                else child.kill(signal);
            } catch (error) {
                if (error.code !== 'ESRCH') throw error;
            }
        };
        const onInt = () => stop('SIGINT');
        const onTerm = () => stop('SIGTERM');
        process.once('SIGINT', onInt);
        process.once('SIGTERM', onTerm);
        const detach = () => {
            process.removeListener('SIGINT', onInt);
            process.removeListener('SIGTERM', onTerm);
        };
        child.once('error', (error) => { detach(); reject(error); });
        child.once('close', (code, signal) => {
            detach();
            const stopped = interrupted || signal;
            resolveRun(stopped ? 128 + constants.signals[stopped] : code);
        });
    });
}

function atomicWrite(path, contents) {
    // Each writer owns its temporary path; rename publishes a complete file.
    const tempDirectory = mkdtempSync(join(dirname(path), '.checkpoint-write-'));
    try {
        const temp = join(tempDirectory, 'result');
        writeFileSync(temp, contents);
        renameSync(temp, path);
    } finally {
        rmSync(tempDirectory, { recursive: true, force: true });
    }
}

export async function runCheckpoint({ root = PROJECT_ROOT, revision = 'HEAD', verbose = false, force = false } = {}) {
    const commit = git(root, ['rev-parse', '--verify', `${revision}^{commit}`]);
    console.log(`Checkpoint for ${commit}; uncommitted changes are excluded.`);
    const resultsDirectory = checkpointResultsDirectory(root);
    const key = reuseKey(root, commit);
    const reuse = force ? null : readReusableResult(resultsDirectory, key);
    const { workspace, remove } = createCheckpointWorkspace(root, commit);
    let archived = false;
    try {
        if (reuse) {
            mkdirSync(join(workspace, '.cache'), { recursive: true });
            for (const name of ['development-standing.json', 'session-results.json'])
                writeFileSync(join(workspace, '.cache', name), readFileSync(join(reuse.artifacts, name)));
            writeFileSync(join(workspace, '.cache/checkpoint-reuse.json'), JSON.stringify(reuse));
            console.log(`Execution evidence from ${reuse.executionCommit}; checking bookkeeping at ${commit}.`);
        }
        const exitCode = await runChecks(workspace, verbose, reuse);
        let summary;
        try {
            summary = JSON.parse(readFileSync(join(workspace, '.cache/checkpoint-summary.json'), 'utf8'));
            if (summary.commit !== commit) throw new Error('summary names a different commit');
        } catch (error) {
            summary = { commit, allPassed: false, error: `checkpoint summary unavailable: ${error.message}` };
        }
        summary.allPassed = summary.allPassed === true && exitCode === 0;
        summary.reuseKey = key;
        summary.timestamp = new Date().toISOString();
        const commitDirectory = join(resultsDirectory, commit);
        mkdirSync(commitDirectory, { recursive: true });
        const pending = mkdtempSync(join(commitDirectory, '.pending-'));
        const artifacts = pending.replace(/\.pending-([^/]+)$/u, 'run-$1');
        summary.artifacts = artifacts;
        summary.artifactHashes = {};
        summary.exitCode = exitCode || (summary.allPassed ? 0 : 1);
        // Preserve only known development artifacts, never the whole cache.
        for (const name of ['development-standing.json', 'session-results.json']) {
            const source = join(workspace, '.cache', name);
            if (!existsSync(source)) continue;
            const contents = readFileSync(source);
            writeFileSync(join(pending, name), contents);
            summary.artifactHashes[name] = digest(contents);
        }
        const contents = JSON.stringify(summary, null, 2) + '\n';
        writeFileSync(join(pending, 'summary.json'), contents);
        renameSync(pending, artifacts);
        archived = true;
        console.log(`Results: ${join(artifacts, 'summary.json')}`);
        atomicWrite(join(commitDirectory, 'latest.json'), contents);
        atomicWrite(join(resultsDirectory, 'latest.json'), contents);
        if (!reuse || (!summary.reusedFrom && summary.executionCommit === commit)) {
            // A failed forced run replaces the reuse pointer too. Do not
            // resurrect an older pass after a new full execution failed.
            const index = join(resultsDirectory, 'reusable');
            mkdirSync(index, { recursive: true });
            atomicWrite(join(index, `${key}.json`), JSON.stringify({ artifacts }));
        }
        // Local caches are conveniences. Failure to refresh one must not
        // invalidate or delete evidence already stored in the shared archive.
        try {
            mkdirSync(join(root, '.cache'), { recursive: true });
            const standing = join(artifacts, 'development-standing.json');
            // This cache carries its measured SHA and verifies equivalence.
            if (existsSync(standing))
                atomicWrite(join(root, '.cache/development-standing.json'), readFileSync(standing));
            atomicWrite(join(root, '.cache/checkpoint-summary.json'), contents);
        } catch (error) {
            console.warn(`Results are saved, but local cache refresh failed: ${error.message}`);
        }
        console.log(`${summary.allPassed ? 'PASS' : 'FAIL'} checkpoint for ${commit}`);
        // The caller may have kept working. That changes freshness, not verdict.
        try {
            const head = git(root, ['rev-parse', 'HEAD']);
            if (head !== commit) console.log(`Current HEAD is ${head}; this result remains for ${commit}.`);
        } catch {
            console.warn('Current HEAD is unavailable; the recorded result is unchanged.');
        }
        return summary.exitCode;
    } finally {
        if (!archived) {
            console.warn(`Results were not archived; checkout retained at ${workspace}`);
        } else {
            try { remove(); }
            catch (error) { console.warn(`Checkpoint cleanup failed; checkout retained at ${workspace}: ${error.message}`); }
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        process.exitCode = await runCheckpoint(parseCheckpointOptions(process.argv.slice(2)));
    } catch (error) {
        console.error(`checkpoint: ${error.message}`);
        process.exitCode = 1;
    }
}
