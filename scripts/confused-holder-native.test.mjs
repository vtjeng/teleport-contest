import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {runJsSession,compareSessionOutputs} from './diff-fresh.mjs';
test('ordinary confused owlbear release matches the saved native C recording',async () => {
    const folder = new URL('./test-fixtures/post77-confused-holder/',import.meta.url);
    const provenance = JSON.parse(readFileSync(new URL('provenance.json',folder)));
    const raw = gunzipSync(readFileSync(new URL('native.json.gz',folder)));
    assert.equal(createHash('sha256').update(raw).digest('hex'),provenance.rawSha256);
    const recording = JSON.parse(raw);
    const output = await runJsSession(recording,new URL('..',import.meta.url).pathname);
    const result = compareSessionOutputs(recording,output);
    assert.equal(output.error,null);
    assert.equal(result.passed,true,JSON.stringify(result));
});
