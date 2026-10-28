// Re-evaluate frozen candidates and frozen source; does not run discovery.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { delegationModule, delegationRankingHint } from '../../../scripts/delegation-ranking.mjs';
import { jsUnits, resolveCall } from '../../../scripts/structural-signals.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const input = JSON.parse(gunzipSync(readFileSync(resolve(here, 'ranking-input.json.gz'))));
const expected = JSON.parse(readFileSync(resolve(here, 'measurement.json')));
assert.equal(input.fullBacklogSha256, expected.inputSha256);
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', expected.sourceBase, '--', 'js'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(p => p.endsWith('.js'));
const modules = new Map(), sources = new Map(), cache = new Map();
for (const file of files) {
    const path = resolve(root, file);
    const source = execFileSync('git', ['show', `${expected.sourceBase}:${file}`], { cwd: root, encoding: 'utf8' });
    sources.set(path, source); modules.set(path, jsUnits(source, path));
}
const changed = input.entries.flatMap(item => {
    const [file, name] = item.js.split(':'), path = resolve(root, file);
    if (!cache.has(path)) cache.set(path, delegationModule(sources.get(path)));
    const traces = cache.get(path)(name).filter(t => resolveCall(path, t.importLocal, modules)?.name === item.target);
    const hint = delegationRankingHint(item.kind, item.target, traces);
    return hint ? [{ key: `source-audit:${item.id}`, beforeRank: item.rank,
        afterRank: item.rank + hint.delta, classification: item.classification, hint }] : [];
});
assert.deepEqual(changed, expected.changed);
console.log(JSON.stringify({ filtered: 0, deprioritized: changed.length,
    retained: input.fullCount, frozenSourceBase: expected.sourceBase }));
