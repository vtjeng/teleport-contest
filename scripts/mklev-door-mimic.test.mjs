import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {compareSessionOutputs,runJsSession} from './diff-fresh.mjs';
const folder = new URL('./test-fixtures/post77-door-mimic/',import.meta.url);
const provenance = JSON.parse(readFileSync(new URL('provenance.json',folder)));
for (const row of provenance.records) {
    test(`D:10 trapped-door mimic ${row.label} matches saved native C`, async () => {
        const raw = gunzipSync(readFileSync(new URL(`${row.label}.recorded.session.json.gz`,folder)));
        assert.equal(createHash('sha256').update(raw).digest('hex'),row.rawSha256);
        const recording = JSON.parse(raw);
        const output = await runJsSession(recording,new URL('..',import.meta.url).pathname);
        const comparison = compareSessionOutputs(recording,output);
        assert.equal(output.error,null);
        assert.equal(comparison.passed,true,JSON.stringify(comparison));
    });
}
test('C species-availability guard and source-order mimic disguise are retained', () => {
    const c = readFileSync('nethack-c/upstream/src/mklev.c','utf8');
    const js = readFileSync('js/mklev.js','utf8');
    for (const name of ['PM_SMALL_MIMIC','PM_LARGE_MIMIC','PM_GIANT_MIMIC'])
        assert.ok(c.includes(name) && js.includes(name));
    assert.match(c,/makemon\(mkclass\(S_MIMIC, 0\), x, y, NO_MM_FLAGS\);[\s\S]*?if \(mtmp\)\s*set_mimic_sym\(mtmp\);/u);
    assert.match(js,/every\(pm => game\.mvitals\[pm\]\.mvflags & G_GONE\)/u);
    assert.match(js,/makemon\(mkclass\(S_MIMIC, 0\), x, y, NO_MM_FLAGS\);\s*if \(mimic\) set_mimic_sym/u);
});
