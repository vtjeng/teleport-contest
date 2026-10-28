import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { reviewTemplate } from '../../../../scripts/discovery-hub.mjs';
const bytes = readFileSync(new URL('bound-run.json', import.meta.url));
const run = JSON.parse(bytes);
const manifest = JSON.parse(readFileSync(new URL('projection.json', import.meta.url)));
const bindings = ['case.json','../levels-cave-light-rng-20261028/case.json']
    .flatMap(p => JSON.parse(readFileSync(new URL(p, import.meta.url))).scannerBindings);
test('portable hash and five original review bindings', () => {
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.projectionSha256);
    assert.deepEqual(reviewTemplate(run, bindings.map(b => b.key)), bindings);
    assert.equal(run.leads.length, 5);
});
