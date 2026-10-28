import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { projectRun, validateProjection } from './discovery-project.mjs';
import { normalizeSource, mergeLeads, reviewTemplate } from './discovery-hub.mjs';
function fixture() {
    const provenance = { jsSha: 'a'.repeat(40), cGitlink: 'b'.repeat(40), runId: 'run',
        methodVersions: { sourceAudit: 'sha256:tool' }, methodConfigHashes: { sourceAudit: 'config' },
        sourceAuditSourceHash: 'source' };
    const leads = mergeLeads(['negative', 'unresolved', 'neighbor'].map(name => normalizeSource({
        id: `edge-c-only:src/demo.c:owner:${name}`, kind: 'edge-c-only', evidenceKey: `evidence-${name}`,
        sites: [{ file: 'nethack-c/upstream/src/demo.c', line: 4 }], owner: 'src/demo.c:owner', target: name,
    })), [], new Set(), 'now', provenance);
    leads.find(l => l.key.endsWith(':unresolved')).status = 'unresolved';
    return { runId: 'run', baseSha: provenance.jsSha, cGitlink: provenance.cGitlink,
        inputHashes: { plan: null }, exclusionsSha256: null,
        toolHashes: { sourceAudit: 'tool' }, methodConfigHashes: { sourceAudit: 'config' },
        methods: { sourceAudit: { sourceHash: 'source', status: 'complete' } },
        futureMetadata: { preserve: ['unknown', 42] }, leads };
}
function negative(run) {
    const key = run.leads.find(l => l.key.endsWith(':negative')).key;
    return { ...reviewTemplate(run, [key])[0], status: 'explained_negative', reason: 'unreachable',
        evidence: { explanation: 'Pinned inactive source', proof: 'proof.json', sourceRefs: ['nethack-c/upstream/src/demo.c:4'] } };
}
test('export preserves every metadata field, exact lead bytes, fingerprints and unresolved visibility', () => {
    const run = fixture(), prior = structuredClone(run), decision = negative(run);
    const keys = run.leads.filter(l => !l.key.endsWith(':neighbor')).map(l => l.key).reverse();
    const { projection, validation, template } = projectRun(run, keys, [decision]);
    assert.deepEqual(run, prior);
    assert.deepEqual(projection.futureMetadata, run.futureMetadata);
    assert.deepEqual(projection.leads, run.leads.filter(l => keys.includes(l.key)));
    assert.equal(template.length, 2);
    assert.deepEqual(validation.before, { active: 2, filtered: 0, excluded: 0 });
    assert.deepEqual(validation.after, { active: 1, filtered: 1, excluded: 0 });
    projection.futureMetadata.preserve.push('changed');
    assert.deepEqual(run, prior, 'output must not alias input');
});
test('missing metadata fails even when original fingerprint inputs otherwise survive', () => {
    for (const remove of [r => { delete r.methodConfigHashes; }, r => { delete r.methods; },
        r => { delete r.methods.sourceAudit.sourceHash; }, r => { delete r.toolHashes.sourceAudit; },
        r => { delete r.inputHashes; }, r => { delete r.exclusionsSha256; }]) {
        const run = fixture(); remove(run);
        assert.throws(() => validateProjection(run), /missing/);
    }
});
test('stale negative cannot pass merely because decision import succeeds', () => {
    const run = fixture(); run.leads.find(l => l.key.endsWith(':negative')).provenance.sourceAuditSourceHash = 'old-source';
    // A freshly generated fingerprint binds this stale row; activeLeadIndex
    // still correctly refuses to suppress it, which validation must detect.
    assert.throws(() => projectRun(run, run.leads.map(l => l.key), [negative(run)]), /expected filtered membership is absent/);
    const ordinary = projectRun(run, run.leads.map(l => l.key));
    assert.equal(ordinary.validation.after.active, 3, 'stale evidence may be retained visibly');
});
test('original comparison rejects dropped metadata, modified leads, unknown keys and stale decisions', () => {
    const original = fixture(), keys = original.leads.map(l => l.key);
    const { projection } = projectRun(original, keys);
    delete projection.futureMetadata;
    assert.throws(() => validateProjection(projection, { original }), /metadata/);
    const changed = structuredClone(original); changed.leads[0].title += 'changed';
    assert.throws(() => validateProjection(changed, { original }), /changed, reordered or invented/);
    assert.throws(() => projectRun(original, ['unknown']), /unknown lead/);
    assert.throws(() => projectRun(original, [keys[0], keys[0]]), /unique/);
    assert.throws(() => projectRun(original, keys, [{ ...negative(original), runId: 'old' }]), /stale/);
});
test('CLI exports only after validation and refuses overwrites; standalone validator reports its limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'discovery-project-'));
    const command = args => spawnSync(process.execPath, [resolve('scripts/discovery-project.mjs'), ...args], { encoding: 'utf8' });
    try {
        const run = fixture(), input = join(dir, 'run.json'), keys = join(dir, 'keys.json'), decisions = join(dir, 'decisions.json'), out = join(dir, 'out');
        writeFileSync(input, JSON.stringify(run)); writeFileSync(keys, JSON.stringify(run.leads.map(l => l.key))); writeFileSync(decisions, JSON.stringify([negative(run)]));
        const args = ['export', '--run', input, '--keys', keys, '--out', out, '--decisions', decisions];
        const result = command(args); assert.equal(result.status, 0, result.stderr);
        const manifest = JSON.parse(readFileSync(join(out, 'manifest.json')));
        assert.equal(manifest.originalRunSha256, createHash('sha256').update(readFileSync(input)).digest('hex'));
        assert.equal(manifest.projectionSha256, createHash('sha256').update(readFileSync(join(out, 'projection.json'))).digest('hex'));
        assert.equal(manifest.validation.after.filtered, 1);
        assert.notEqual(command(args).status, 0);
        const checked = command(['validate', '--projection', join(out, 'projection.json'), '--decisions', decisions]);
        assert.equal(checked.status, 0, checked.stderr);
        assert.equal(JSON.parse(checked.stdout).originalComparison, 'not-supplied');
        delete run.methodConfigHashes; writeFileSync(input, JSON.stringify(run));
        const failedOut = join(dir, 'failed');
        assert.notEqual(command(['export', '--run', input, '--keys', keys, '--out', failedOut]).status, 0);
        assert.equal(existsSync(failedOut), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
