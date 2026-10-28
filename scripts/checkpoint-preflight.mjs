// Cheap committed-tree guard; no checkout, test execution or CI dispatch.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try {
        const args = process.argv.slice(2);
        if (args.length && (args.length !== 2 || args[0] !== '--commit'))
            throw new Error('usage: node scripts/checkpoint-preflight.mjs [--commit REVISION]');
        const result = checkTestLayout(process.cwd(), args[1]);
        console.log(JSON.stringify(result, null, 2));
        if (!result.passed) process.exitCode = 1;
    } catch (error) {
        console.error(`checkpoint preflight: ${error.message}`);
        process.exitCode = 1;
    }
}
