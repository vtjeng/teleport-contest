// The installed node_modules must match package-lock.json. Hosted Checkpoint
// installs with `npm ci`, so this always holds there; locally a stale install
// went unnoticed for months (fast-check missing and older eslint and acorn
// than package.json required, found 2026-11-13), because the tests that
// needed the missing package failed with an import error that looked like a
// known flake. Fix a failure here with `npm ci` in the main checkout.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));

test('every direct dependency is installed at its locked version', () => {
    const root = lock.packages[''];
    const names = Object.keys({ ...root.dependencies, ...root.devDependencies });
    // An empty list would make the loop below vacuous.
    assert.ok(names.length > 0, 'package-lock.json lists no direct dependencies');
    const problems = [];
    for (const name of names) {
        const locked = lock.packages[`node_modules/${name}`]?.version;
        const manifest = path.join(ROOT, 'node_modules', name, 'package.json');
        if (!existsSync(manifest)) { problems.push(`${name}: not installed (locked ${locked})`); continue; }
        const installed = JSON.parse(readFileSync(manifest, 'utf8')).version;
        if (installed !== locked) problems.push(`${name}: installed ${installed}, locked ${locked}`);
    }
    assert.deepEqual(problems, [], `node_modules differs from package-lock.json; run npm ci:\n${problems.join('\n')}`);
});
