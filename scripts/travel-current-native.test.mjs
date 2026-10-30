import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {runJsSession,compareSessionOutputs} from './diff-fresh.mjs';
const folder = new URL('./test-fixtures/post77-travel-current/',import.meta.url);
const provenance = JSON.parse(readFileSync(new URL('provenance.json',folder)));
for (const row of provenance.records) test(`current-square travel ${row.label} matches native C`,async () => {
    const raw = gunzipSync(readFileSync(new URL(`${row.label}.json.gz`,folder)));
    assert.equal(createHash('sha256').update(raw).digest('hex'),row.rawSha256);
    const recording = JSON.parse(raw);
    const output = await runJsSession(recording,new URL('..',import.meta.url).pathname);
    assert.equal(output.error,null);
    const result = compareSessionOutputs(recording,output);
    assert.equal(result.passed,true,JSON.stringify(result));
});
