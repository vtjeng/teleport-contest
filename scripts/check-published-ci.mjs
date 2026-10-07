#!/usr/bin/env node
// One-shot post-publication tracking. Never dispatch, retry or wait for CI.
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync,
    unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// These are the workflows triggered by a publication to main, not the separate
// pre-acceptance Checkpoint workflow. Missing runs must remain pending discovery.
export const PUBLICATION_WORKFLOWS = ['score.yml', 'coverage.yml', 'lint.yml', 'dashboard.yml']
    .map(name => `.github/workflows/${name}`);
const SHA = /^[a-f0-9]{40}$/;
const succeeded = run => run.status === 'completed' && run.conclusion === 'success';
const USAGE = `Usage: node scripts/check-published-ci.mjs [--commit <full-sha>] [--task <label>] [--file <pending-json>]

Register a just-published commit (optional), then check all pending commits once.
Defaults to .cache/loop-ci-pending.json. Run from the repository checkout.
Uses gh authentication; performs read-only GitHub requests and updates only the
local pending cache. Keeps missing, queued, failed and cancelled runs pending.
Exit 0: no known failures (pending may remain); 1: failed/cancelled run;
2: invalid input or API/cache error; repeat the same invocation after recovery
because failed checks do not register new commits. Does not watch or rerun jobs.
On interruption, inspect and remove the cache's .lock file only after confirming
the original checker has exited.`;

export function publicationStatus(commit, runs, repository) {
    const latest = new Map();
    for (const run of runs) {
        if (run.head_sha !== commit || run.repository?.full_name !== repository
            || run.head_repository?.full_name !== repository)
            throw new Error(`run ${run.id} does not identify ${repository}@${commit}`);
        if (run.event !== 'push' || run.head_branch !== 'main') continue;
        const workflow = run.path?.split('@')[0];
        if (!PUBLICATION_WORKFLOWS.includes(workflow)) continue;
        if (!Number.isSafeInteger(run.id) || run.id <= 0) throw new Error('invalid run ID');
        if (!latest.has(workflow) || latest.get(workflow).id < run.id) latest.set(workflow, run);
    }
    const workflows = PUBLICATION_WORKFLOWS.map(workflow => {
        const run = latest.get(workflow);
        return { workflow, id: run?.id ?? null, status: run?.status ?? 'missing',
            conclusion: run?.conclusion ?? null, url: run?.html_url ?? null };
    });
    return { commit, passed: workflows.every(succeeded),
        failed: workflows.some(run => run.status === 'completed' && run.conclusion !== 'success'), workflows };
}

export function checkPublishedCI({ file, commit, task }, { gh = args =>
    execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }) } = {}) {
    if (commit !== undefined && !SHA.test(commit)) throw new Error('Expected a full published commit SHA');
    if (task && !commit) throw new Error('--task requires --commit');
    file = resolve(file ?? '.cache/loop-ci-pending.json');
    mkdirSync(dirname(file), { recursive: true });
    const lock = `${file}.lock`, temporary = `${file}.tmp`;
    const fd = openSync(lock, 'wx');
    try {
        const original = existsSync(file) ? readFileSync(file, 'utf8') : null;
        const state = original === null ? { commits: [] } : JSON.parse(original);
        if (!Array.isArray(state.commits) || state.commits.some(entry => !SHA.test(entry.commit))
            || new Set(state.commits.map(entry => entry.commit)).size !== state.commits.length)
            throw new Error('Invalid pending commit list');
        if (commit && !state.commits.some(entry => entry.commit === commit))
            state.commits.push({ commit, ...(task ? { task } : {}), runs: [] });
        const repository = state.commits.length
            ? gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim() : null;
        const reports = [];
        for (const entry of state.commits) {
            const pages = JSON.parse(gh(['api', '--paginate', '--slurp',
                `repos/${repository}/actions/runs?head_sha=${entry.commit}&branch=main&event=push&per_page=100`]));
            if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page.workflow_runs)))
                throw new Error('Invalid workflow run response');
            reports.push({ ...publicationStatus(entry.commit, pages.flatMap(page => page.workflow_runs), repository),
                ...(entry.task ? { task: entry.task } : {}) });
        }
        // Preserve the old file in full on any API failure, and reject concurrent
        // manual edits rather than overwrite them. Cooperative invocations lock.
        if ((existsSync(file) ? readFileSync(file, 'utf8') : null) !== original)
            throw new Error('Pending cache changed during the check');
        const remaining = state.commits.flatMap((entry, index) => reports[index].passed ? []
            : [{ ...entry, runs: reports[index].workflows.filter(run => run.id !== null && !succeeded(run)).map(run => run.id) }]);
        writeFileSync(temporary, JSON.stringify({ ...state, commits: remaining }, null, 2) + '\n');
        renameSync(temporary, file);
        return { checked: reports.length, completed: reports.filter(row => row.passed).map(row => row.commit),
            pending: reports.filter(row => !row.passed).map(row => ({ ...row,
                workflows: row.workflows.filter(run => !succeeded(run)) })),
            failed: reports.some(row => row.failed) };
    } finally {
        closeSync(fd);
        if (existsSync(temporary)) unlinkSync(temporary);
        unlinkSync(lock);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const args = process.argv.slice(2);
        if (args.length === 1 && args[0] === '--help') console.log(USAGE);
        else {
            const options = {};
            for (let index = 0; index < args.length; index += 2) {
                const key = args[index]?.slice(2);
                if (!['commit', 'task', 'file'].includes(key) || args[index] !== `--${key}`
                    || !args[index + 1] || options[key] !== undefined) throw new Error(USAGE);
                options[key] = args[index + 1];
            }
            const report = checkPublishedCI(options);
            console.log(JSON.stringify(report, null, 2));
            process.exitCode = report.failed ? 1 : 0;
        }
    } catch (error) { console.error(error.message); process.exitCode = 2; }
}
