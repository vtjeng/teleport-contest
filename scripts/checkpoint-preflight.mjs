// Cheap committed-tree guard; no checkout, test execution or CI dispatch.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTrialMonitor } from './trial-monitor.mjs';
import { strayTestPaths } from './test-suites.mjs';

export function checkTestLayout(root, revision = 'HEAD') {
    const git = args => execFileSync('git', ['-C', root, ...args],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const commit = git(['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`]).trim();
    const paths = git(['ls-tree', '-rz', '--full-tree', commit]).split('\0')
        .filter(entry => /^100(?:644|755) blob /u.test(entry))
        .map(entry => entry.slice(entry.indexOf('\t') + 1));
    const stray = strayTestPaths(paths);
    return { commit, passed: stray.length === 0, stray };
}

// Inspect committed inputs only. Recommended tests must run in that candidate's
// checkout; this function never executes candidate code or dispatches CI.
export function checkCheckpointInputs(root, revision = 'HEAD', baseRevision) {
    const result = checkTestLayout(root, revision);
    const git = args => execFileSync('git', ['-C', root, ...args],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (!baseRevision && git(['rev-list', '--parents', '-n', '1', result.commit]).trim().split(/\s+/u).length > 2)
        throw new Error('merge candidate requires --base ACCEPTED_REVISION');
    const base = baseRevision ? git(['rev-parse', '--verify', '--end-of-options',
        `${baseRevision}^{commit}`]).trim() : null;
    const changed = git(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z',
        ...(base ? [base, result.commit] : [`${result.commit}^!`])]).split('\0').filter(Boolean);
    const registerPaths = ['trial-monitor/repairs.json', 'trial-monitor/manifest.json'];
    const register = { checked: registerPaths.some(path => changed.includes(path)), errors: [] };
    if (register.checked) {
        try {
            const read = path => JSON.parse(git(['show', `${result.commit}:${path}`]));
            createTrialMonitor({ register: read(registerPaths[0]), manifest: read(registerPaths[1]) });
        } catch (error) { register.errors.push(error.message); }
    }
    const dashboardChanged = changed.some(path => registerPaths.includes(path)
        || /^scripts\/(?:dashboard[^/]*|build-dashboard\.mjs|trial-monitor(?:\.test)?\.mjs|single-worker-activity(?:\.test)?\.mjs)$/u.test(path));
    return { ...result, base, changed, register,
        focusedTests: dashboardChanged ? ['scripts/dashboard-data.test.mjs', 'scripts/trial-monitor.test.mjs'] : [],
        passed: result.passed && register.errors.length === 0 };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try {
        const args = process.argv.slice(2);
        if (args.length % 2 || args.some((arg, i) => i % 2 === 0 && !['--commit', '--base'].includes(arg)))
            throw new Error('usage: node scripts/checkpoint-preflight.mjs [--commit REVISION] [--base ACCEPTED_REVISION]');
        const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
        const result = checkCheckpointInputs(process.cwd(), options['--commit'], options['--base']);
        console.log(JSON.stringify(result, null, 2));
        if (!result.passed) process.exitCode = 1;
    } catch (error) {
        console.error(`checkpoint preflight: ${error.message}`);
        process.exitCode = 1;
    }
}
