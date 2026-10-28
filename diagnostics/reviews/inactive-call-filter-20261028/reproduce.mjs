// Re-evaluate existing warnings against pinned C; does not discover new leads.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cUnits } from '../../../scripts/structural-signals.mjs';
import { inactiveCallProof, inactiveLiteralBranchProofs, EXCLUDED_FILES, EXCLUDED_SYMBOLS } from '../../../scripts/source-audit.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const expected = JSON.parse(readFileSync(resolve(here, 'measurement.json')));
const input = JSON.parse(gunzipSync(readFileSync(resolve(here, 'input.json.gz'))));
assert.equal(input.fullInputSha256, expected.fullInputSha256);
const git = args => execFileSync('git', ['-C', resolve(root, 'nethack-c/upstream'), ...args], { encoding: 'utf8' });
const files = git(['ls-tree', '-r', '--name-only', expected.cGitlink, '--', 'src', 'win/tty']).trim().split('\n')
    .filter(path => path.endsWith('.c') && !EXCLUDED_FILES.includes(basename(path)));
const byName = new Map(), owners = new Map(), sources = new Map(), proofs = new Map();
for (const path of files) {
    const source = git(['show', `${expected.cGitlink}:${path}`]);
    sources.set(path, source);
    for (const unit of cUnits(source, path).filter(u => !EXCLUDED_SYMBOLS.includes(u.name))) {
        byName.set(unit.name, [...(byName.get(unit.name) ?? []), unit]);
        const key = `${path}:${unit.name}`;
        owners.set(key, [...(owners.get(key) ?? []), unit]);
    }
}
const filtered = input.entries.flatMap(item => {
    const selected = owners.get(item.owner) ?? [];
    if (!selected.length) return [];
    const path = selected[0].path, source = sources.get(path);
    if (!proofs.has(path)) proofs.set(path, inactiveLiteralBranchProofs(source));
    const proof = inactiveCallProof(item, selected, byName, source,
        `nethack-c/upstream/${path}`, proofs.get(path));
    return proof ? [{ id: item.id, rank: item.rank, proof }] : [];
});
assert.deepEqual(filtered, expected.entries);
assert.equal(filtered.length, expected.filtered);
console.log(JSON.stringify({ filtered: filtered.length, remaining: input.fullCount - filtered.length,
    deprioritized: 0, original: input.fullCount }));
