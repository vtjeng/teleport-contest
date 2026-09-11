// One conservative reuse class: every tracked input except these four
// bookkeeping files must match. This is not a per-test dependency cache.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { release } from 'node:os';
import { join } from 'node:path';

export const BOOKKEEPING_FILES = ['GOALS.json', 'SCORE.tsv',
    'QUALITY.json', 'QUALITY-evidence.json'];
export const REUSE_VERSION = 1;

export function digest(value) {
    return createHash('sha256').update(value).digest('hex');
}

export function executionTree(root, commit) {
    // Read only the root entries. Directory object IDs cover their contents
    // without enumerating or reading any individual sealed session.
    const tree = execFileSync('git', ['ls-tree', '-z', commit],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return digest(tree.split('\0').filter(entry => {
        const [header, name] = entry.split('\t');
        if (!BOOKKEEPING_FILES.includes(name)) return true;
        if (!header.startsWith('100644 blob '))
            throw new Error(`bookkeeping input must be a regular file: ${name}`);
        return false;
    }).join('\0'));
}

export function executionEnvironment(env = process.env) {
    // Invocation locations and shell counters vary between worktrees. Keep
    // every other environment value in a digest, never in the stored record.
    const locations = new Set(['PWD', 'OLDPWD', 'SHLVL', '_', 'INIT_CWD',
        'npm_config_local_prefix', 'npm_package_json']);
    const variables = Object.entries(env).filter(([key]) => !locations.has(key))
        .sort(([left], [right]) => left.localeCompare(right));
    return digest(JSON.stringify({ variables, node: digest(readFileSync(process.execPath)),
        versions: process.versions, platform: process.platform,
        arch: process.arch, release: release(),
        git: execFileSync('git', ['--version'], { encoding: 'utf8', env }).trim(),
        npm: execFileSync('npm', ['--version'], { encoding: 'utf8', env }).trim() }));
}

export function reuseKey(root, commit) {
    return digest(JSON.stringify({ version: REUSE_VERSION,
        tree: executionTree(root, commit), environment: executionEnvironment() }));
}

export function readReusableResult(directory, key) {
    try {
        const pointer = JSON.parse(readFileSync(join(directory, 'reusable', `${key}.json`), 'utf8'));
        const summary = JSON.parse(readFileSync(join(pointer.artifacts, 'summary.json'), 'utf8'));
        if (summary.reuseVersion !== REUSE_VERSION || summary.reuseKey !== key
            || summary.allPassed !== true || summary.executionCommit !== summary.commit
            || !Array.isArray(summary.results) || summary.tests?.passed !== true
            || summary.recordings?.passed !== true || !summary.score) return null;
        // Reuse requires the artifacts, not just the totals in the pointer.
        for (const name of ['development-standing.json', 'session-results.json']) {
            const contents = readFileSync(join(summary.artifacts, name));
            if (summary.artifactHashes?.[name] !== digest(contents)) return null;
            JSON.parse(contents);
        }
        return summary;
    } catch {
        return null;
    }
}
