import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

const root = new URL('./test-fixtures/recovery-queued-prompts/',import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json',root)));
for (const row of manifest.cases) {
    test(`native C queued prompt: ${row.name}`,async () => {
        const bytes = gunzipSync(readFileSync(new URL(`${row.name}.json.gz`,root)));
        assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
        const recording = JSON.parse(bytes);
        const workspace = createScoringWorkspace(process.cwd(),[]);
        try {
            const result = compareSessionOutputs(recording,await runJsSession(recording,workspace));
            assert.equal(result.passed,true,formatReport(result));
        } finally { removeScoringWorkspace(workspace); }
    });
}
