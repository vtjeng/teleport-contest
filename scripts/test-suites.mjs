import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');

export const DEDICATED_TEST_SUITES = Object.freeze({});

export function buildTestSuites(discovered, dedicated, {
    exists = (path) => existsSync(resolve(PROJECT_ROOT, path)),
} = {}) {
    const suites = {};
    const dedicatedNames = Object.keys(dedicated).sort();
    const ownerByPath = new Map();
    for (const name of dedicatedNames) {
        const paths = dedicated[name];
        suites[name] = [...paths].sort();
        for (const path of suites[name]) {
            if (!exists(path))
                throw new Error(`registered test does not exist: ${path}`);
            const owner = ownerByPath.get(path);
            if (owner)
                throw new Error(
                    `${path} is registered in both ${owner} and ${name}`,
                );
            ownerByPath.set(path, name);
        }
    }

    suites.default = discovered
        .filter((path) => !ownerByPath.has(path))
        .sort();
    suites.all = [
        ...suites.default,
        ...dedicatedNames.flatMap((name) => suites[name]),
    ];
    return suites;
}

export function discoverDefaultTests() {
    return readdirSync(SCRIPT_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
        .map((entry) => join('scripts', entry.name))
        .sort();
}

// Directories the stray-test scan never enters: dependencies, git metadata
// and agent worktrees under dot-directories, the C reference tree, and the
// recorded sessions (which include the sealed holdout).
const STRAY_SCAN_SKIPS = new Set(['node_modules', 'nethack-c', 'sessions']);

// Every *.test.mjs file outside the discovered roots, relative to the
// project root. A test in any other directory runs under no suite, so it
// passes `npm test` by never running; this scan is what makes that a failure.
export function strayTestFiles(root = PROJECT_ROOT, discoveredRoots = ['scripts']) {
    const stray = [];
    const walk = (relative) => {
        const entries = readdirSync(resolve(root, relative), {
            withFileTypes: true,
        });
        for (const entry of entries) {
            const path = relative ? join(relative, entry.name) : entry.name;
            if (entry.isDirectory()) {
                if (entry.name.startsWith('.')
                    || STRAY_SCAN_SKIPS.has(entry.name)
                    || discoveredRoots.includes(path)) continue;
                walk(path);
            } else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
                stray.push(path);
            }
        }
    };
    walk('');
    return stray.sort();
}

export function testFilesForSuite(name) {
    const suites = buildTestSuites(
        discoverDefaultTests(),
        DEDICATED_TEST_SUITES,
    );
    const files = suites[name];
    if (!files) throw new Error(`unknown test suite '${name}'`);
    return files;
}
