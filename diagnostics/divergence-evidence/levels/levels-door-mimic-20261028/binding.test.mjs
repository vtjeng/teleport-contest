import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { reviewTemplate } from '../../../../scripts/discovery-hub.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url));
test('three original scanner bindings survive the portable projection',()=>{
 const bytes=read('bound-run.json'),run=JSON.parse(bytes),c=JSON.parse(read('case.json')),p=JSON.parse(read('projection.json'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),p.projectionSha256);
 assert.deepEqual(reviewTemplate(run,c.scannerBindings.map(b=>b.key)),c.scannerBindings);
});
