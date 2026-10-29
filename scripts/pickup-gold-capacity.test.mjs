import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// PR #110 public-input C recordings; binary/source provenance is retained by
// the published evidence. An independent recorder build attestation is absent.
const manifest = JSON.parse(readFileSync(new URL('./fixtures/capacity-public/manifest.json', import.meta.url)));
for (const name of ['gold-all-target', 'gold-partial-target', 'gold-room-control']) {
    test(`public capacity replay: ${name}`, async () => {
        const file = `${name}.session.json.gz`;
        const bytes = gunzipSync(readFileSync(new URL(`./fixtures/capacity-public/${file}`, import.meta.url)));
        assert.equal(createHash('sha256').update(bytes).digest('hex'),
            manifest.fixtures.find(entry => entry.file === file).sha256);
        const recorded = JSON.parse(bytes);
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const report = compareSessionOutputs(recorded, await runJsSession(recorded, root));
            assert.equal(report.passed, true, JSON.stringify(report));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
