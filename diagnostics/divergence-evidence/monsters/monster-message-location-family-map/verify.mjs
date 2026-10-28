import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const record = JSON.parse(readFileSync(new URL('./inventory.json', import.meta.url)));
for (const [path, expected] of Object.entries(record.sourceSha256)) {
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, path);
}
for (const site of record.sites) {
    for (const location of [site.c, site.js]) {
        assert.equal(readFileSync(location.path, 'utf8').split('\n')[location.line - 1], location.text, site.id);
    }
    assert.match(site.c.text, /pline_mon/);
}
assert.equal(record.sites.length, 12);
assert.equal(record.sites.filter(site => site.status === 'unresolved-source-only').length, 11);
console.log('Source identity verified: 12 sites, including existing PR65; no runtime parity assertion.');
