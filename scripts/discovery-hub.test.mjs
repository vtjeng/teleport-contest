import assert from 'node:assert/strict';
import test from 'node:test';
import { activeLeadIndex, applyDecisions, CSV_COLUMNS, leadIndexCsv, mergeLeads, normalizeConstant, normalizeLua, normalizeMismatch,
    normalizeSource, replaySelectionStatus, reviewTemplate, runCommand,
    validateDecision, validateLeadShape } from './discovery-hub.mjs';

const JS_SHA = 'a'.repeat(40);
const C_SHA = 'b'.repeat(40);

test('active view filters only fresh evidenced negatives and retains an audit trail', () => {
    const provenance = { jsSha: JS_SHA, cGitlink: C_SHA,
        methodVersions: { sourceAudit: 'sha256:tool' },
        methodConfigHashes: { sourceAudit: 'config' },
        sourceAuditSourceHash: 'source' };
    const [lead] = mergeLeads([normalizeSource(source)], [], new Set(),
        'now', provenance);
    const reviewed = { ...lead, status: 'explained_negative',
        reviewFreshness: 'current',
        resolution: { reason: 'C and JS use the same moved helper' } };
    const run = { runId: 'run-1', baseSha: JS_SHA, cGitlink: C_SHA,
        toolHashes: { sourceAudit: 'tool' },
        methodConfigHashes: { sourceAudit: 'config' },
        methods: { sourceAudit: { sourceHash: 'source' } },
        leads: [reviewed] };
    const view = activeLeadIndex(run);
    assert.deepEqual(view.active, []);
    assert.equal(view.filtered[0].explanation,
        'C and JS use the same moved helper');
    assert.equal(view.filtered[0].key, lead.key);
    assert.equal(view.filtered[0].evidenceKey, lead.evidenceKey);
    for (const changed of [
        { ...run, baseSha: 'c'.repeat(40) },
        { ...run, cGitlink: 'd'.repeat(40) },
        { ...run, toolHashes: { sourceAudit: 'new-tool' } },
        { ...run, methodConfigHashes: { sourceAudit: 'new-config' } },
        { ...run, methodConfigHashes: undefined,
            leads: [{ ...reviewed, provenance: {
                ...reviewed.provenance, methodConfigHashes: undefined } }] },
        { ...run, methods: { sourceAudit: { sourceHash: 'new-source' } } },
        { ...run, methods: { sourceAudit: { sourceHash: null } },
            leads: [{ ...reviewed, provenance: {
                ...reviewed.provenance, sourceAuditSourceHash: null } }] },
        { ...run, leads: [{ ...reviewed, reviewFreshness: 'needs-review' }] },
        { ...run, leads: [{ ...reviewed, resolution: null }] },
        { ...run, leads: [{ ...reviewed, status: 'unresolved' }] },
    ]) {
        assert.deepEqual(activeLeadIndex(changed).active, [lead.key]);
        assert.deepEqual(activeLeadIndex(changed).filtered, []);
    }
    const excluded = activeLeadIndex({ ...run, leads: [
        { ...reviewed, status: 'excluded' }] });
    assert.equal(excluded.filtered.length, 0);
    assert.equal(excluded.excluded[0].key, lead.key);
});

const source = {
    id: 'message:src/demo.c:demo:abc', evidenceKey: 'evidence-a',
    kind: 'message', sites: [{ file: 'nethack-c/upstream/src/demo.c', line: 42 }],
    details: { fragment: 'The door rattles.' }, rank: 70,
};

test('source and constant leads have stable source identities and provenance', () => {
    const a = normalizeSource(source);
    assert.equal(a.key, 'source-audit:message:src/demo.c:demo:abc');
    assert.equal(a.evidenceKey, 'evidence-a');
    assert.deepEqual(a.sourceRefs, ['nethack-c/upstream/src/demo.c:42']);
    const b = normalizeConstant({ fingerprint: { key: 'include/demo.h|FOO|js/const.js|FOO' },
        evidenceSha256: 'evidence-b', kind: 'header-macro-mismatch',
        cPath: 'include/demo.h', jsPath: 'js/const.js', cSymbol: 'FOO',
        cValue: 2, jsValue: 1 });
    assert.equal(b.sourceKey, 'include/demo.h|FOO|js/const.js|FOO');
    assert.equal(b.summary, 'FOO: C=2, JS=1');
    const c = normalizeMismatch({ session: 'sessions/demo.json',
        replayInputSha256: 'input', firstMismatch: { step: 4 },
        sourceFile: 'src/demo.c', kind: 'screen', step: 4 });
    assert.equal(c.key, 'replay:sessions/demo.json');
});

test('Lua ledger preserves repeat outcome without promoting stream parity to a verdict', () => {
    const item = { id: 'adapter-id',
        source_locations: ['nethack-c/upstream/dat/bigrm-12.lua'],
        evidence_summary: '2 attempts; matching=2',
        details_path: '/saved/run/summary.json' };
    const sourceCase = { id: item.id, program: 'bigrm-12.lua',
        recipeSha256: 'recipe-hash', outcome: {
            status: 'matching', counts: { matching: 2 } } };
    const raw = normalizeLua(item, sourceCase);
    assert.equal(raw.key, 'lua:bigrm-12.lua:recipe-hash');
    assert.equal(raw.rawOutcome, 'matching');
    const provenance = { jsSha: JS_SHA, cGitlink: C_SHA, runId: 'first',
        methodVersions: { luaDiscovery: 'sha256:adapter' },
        methodConfigHashes: { luaDiscovery: 'config' } };
    const [lead] = mergeLeads([raw], [], new Set(), 'now', provenance);
    assert.equal(lead.status, 'unreviewed');
    assert.equal(lead.methods[0].kind, 'lua-level-generation');
    assert.equal(lead.rawOutcomeCounts.matching, 2);
    assert.doesNotThrow(() => validateLeadShape(lead));
    const changed = mergeLeads([raw], [{ ...lead,
        status: 'explained_negative', resolution: { explanation: 'reviewed' } }],
    new Set(), 'later', { ...provenance, runId: 'second',
        methodConfigHashes: { luaDiscovery: 'new-config' } })[0];
    assert.equal(changed.status, 'unreviewed');
    assert.equal(changed.reviewFreshness, 'needs-review');
    assert.throws(() => normalizeLua(item, { ...sourceCase, id: 'other' }),
        /identity disagree/u);
    assert.throws(() => normalizeLua(item, { ...sourceCase, outcome: {
        status: 'invalid' } }), /aggregate outcome/u);
});

test('dedup retains one lead, observed times, and earlier review history', () => {
    const lead = normalizeSource(source);
    const previous = [{ ...lead, status: 'unresolved', firstSeen: 'first',
        history: [{ status: 'unresolved', nextExperiment: 'vary seed' }],
        methods: ['sourceAudit'], attempts: [], nextStep: { experiment: 'vary seed' } }];
    const result = mergeLeads([lead, lead], previous, new Set(), 'later',
        { cGitlink: 'c-sha', jsSha: 'js-sha', runId: 'run-1',
            methodVersions: { sourceAudit: 'sha256:tool' } });
    assert.equal(result.length, 1);
    assert.equal(result[0].status, 'unresolved');
    assert.equal(result[0].firstSeen, 'first');
    assert.equal(result[0].lastChecked, 'later');
    assert.deepEqual(result[0].methods, [
        { kind: 'missing_message', version: 'legacy', run_id: 'legacy' },
        { kind: 'missing_message', version: 'sha256:tool', run_id: 'run-1' },
    ]);
    assert.equal(result[0].provenance.cGitlink, 'c-sha');
});

test('changed evidence reopens a negative but keeps its history', () => {
    const lead = normalizeSource({ ...source, evidenceKey: 'new' });
    const old = { ...normalizeSource(source), status: 'explained_negative',
        resolution: { explanation: 'old source proof' }, history: [{ status: 'explained_negative' }] };
    const [result] = mergeLeads([lead], [old]);
    assert.equal(result.status, 'unreviewed');
    assert.equal(result.resolution, null);
    assert.equal(result.history.length, 1);
});

test('same warning on changed code or adapter does not silently retain a verdict', () => {
    const lead = normalizeSource(source);
    const oldProvenance = { cGitlink: 'c1', jsSha: 'j1', runId: 'one',
        methodVersions: { sourceAudit: 'sha256:old' } };
    const [old] = mergeLeads([lead], [], new Set(), 'first', oldProvenance);
    old.status = 'explained_negative';
    old.resolution = { explanation: 'proved at j1' };
    old.history = [{ status: 'explained_negative' }];
    for (const changed of [
        { ...oldProvenance, jsSha: 'j2' },
        { ...oldProvenance, cGitlink: 'c2' },
        { ...oldProvenance, methodVersions: { sourceAudit: 'sha256:new' } },
    ]) {
        const [next] = mergeLeads([lead], [old], new Set(), 'later', changed);
        assert.equal(next.status, 'unreviewed');
        assert.equal(next.reviewFreshness, 'needs-review');
        assert.equal(next.resolution, null);
        assert.equal(next.history.length, 1);
    }
    old.status = 'unresolved';
    const [unresolved] = mergeLeads([lead], [old], new Set(), 'later',
        { ...oldProvenance, jsSha: 'j2' });
    assert.equal(unresolved.status, 'unresolved');
    assert.equal(unresolved.reviewFreshness, 'needs-review');
    old.status = 'excluded';
    const [excluded] = mergeLeads([lead], [old], new Set(), 'later',
        { ...oldProvenance, jsSha: 'j2' });
    assert.equal(excluded.status, 'excluded');
});

test('source auditor reviews are retained as context without status promotion', () => {
    const lead = normalizeSource({ ...source, classification: 'alternate-implementation',
        reviews: [{ rationale: 'helper elsewhere', sourceRefs: ['src/demo.c:42'] }] });
    const [merged] = mergeLeads([lead]);
    assert.equal(merged.status, 'unreviewed');
    assert.equal(merged.sourceAuditClassification, 'alternate-implementation');
    assert.equal(merged.sourceAuditReviews.length, 1);
    const [rescan] = mergeLeads([normalizeSource(source)], [merged]);
    assert.equal(rescan.sourceAuditReviews.length, 1,
        'a scan without source-previous cannot erase a prior review');
});

test('an unobserved unresolved lead stays available for a later revisit', () => {
    const old = { ...normalizeSource(source), status: 'unresolved',
        methods: ['sourceAudit'], history: [], attempts: [{ setup: 'valid fixture' }] };
    const [result] = mergeLeads([], [old]);
    assert.equal(result.status, 'unresolved');
    assert.equal(result.observed, false);
    assert.equal(result.attempts.length, 1);
});

test('decisions distinguish a failed setup from a supported negative', () => {
    const lead = mergeLeads([normalizeSource(source)], [], new Set(), 'now',
        { jsSha: JS_SHA, cGitlink: C_SHA, runId: 'run-1',
            methodVersions: { sourceAudit: 'sha256:tool' } });
    const run = { runId: 'run-1', baseSha: JS_SHA, cGitlink: C_SHA,
        toolHashes: { sourceAudit: 'tool' }, inputHashes: {}, leads: lead };
    assert.throws(() => validateDecision({ key: lead[0].key,
        evidenceKey: lead[0].evidenceKey, status: 'explained_negative',
        reason: 'unreachable', evidence: { explanation: 'could not reproduce',
            sourceRefs: ['nethack-c/upstream/src/demo.c'] } }), /supported source explanation/u);
    const unresolved = { ...reviewTemplate(run, [lead[0].key])[0],
        status: 'unresolved', plausibleDifference: 'missing door feedback',
        attempts: [{ setup: 'valid door fixture', outcome: 'attack not reached' }],
        nextExperiment: 'place the attacker one square nearer' };
    const updated = applyDecisions(run, [unresolved], '2026-10-27T17:00:00Z');
    assert.equal(updated.leads[0].status, 'unresolved');
    assert.equal(updated.leads[0].attempts[0].baseSha, JS_SHA);
    assert.equal(updated.leads[0].nextStep.experiment,
        'place the attacker one square nearer');
    assert.throws(() => applyDecisions(updated, [{ ...unresolved,
        evidenceKey: 'stale' }]), /absent or stale/u);
});

test('a decision bound to an earlier run cannot be applied on changed provenance', () => {
    const [lead] = mergeLeads([normalizeSource(source)], [], new Set(), 'now',
        { jsSha: JS_SHA, cGitlink: C_SHA, runId: 'first',
            methodVersions: { sourceAudit: 'sha256:old' },
            methodConfigHashes: { sourceAudit: 'config-old' } });
    const run = { runId: 'first', baseSha: JS_SHA, cGitlink: C_SHA,
        toolHashes: { sourceAudit: 'old' }, inputHashes: { mapping: 'old' },
        leads: [lead] };
    const decision = { ...reviewTemplate(run, [lead.key])[0],
        status: 'unresolved', plausibleDifference: 'plausible gap',
        attempts: [{ setup: 'valid', outcome: 'no branch reached' }],
        nextExperiment: 'try controlled branch' };
    assert.doesNotThrow(() => applyDecisions(run, [decision]));
    for (const changed of [
        { ...run, runId: 'second' },
        { ...run, baseSha: 'c'.repeat(40) },
        { ...run, cGitlink: 'd'.repeat(40) },
        { ...run, toolHashes: { sourceAudit: 'new' } },
        { ...run, inputHashes: { mapping: 'new' } },
        { ...run, leads: [{ ...lead, provenance: { ...lead.provenance,
            methodConfigHashes: { sourceAudit: 'config-new' } } }] },
    ]) assert.throws(() => applyDecisions(changed, [decision]),
        /stale review provenance/u);
});

test('canonical record types reject invalid status, SHA, path, line and method', () => {
    const [lead] = mergeLeads([normalizeSource(source)], [], new Set(), 'now',
        { jsSha: JS_SHA, cGitlink: C_SHA, runId: 'run',
            methodVersions: { sourceAudit: 'sha256:tool' } });
    assert.doesNotThrow(() => validateLeadShape(lead));
    for (const bad of [
        { ...lead, status: 'maybe' },
        { ...lead, provenance: { ...lead.provenance, jsSha: 'short' } },
        { ...lead, source_locations: [{ ...lead.source_locations[0], path: '../escape' }] },
        { ...lead, source_locations: [{ ...lead.source_locations[0], start_line: 0 }] },
        { ...lead, methods: [{ ...lead.methods[0], kind: 'unimplemented' }] },
    ]) assert.throws(() => validateLeadShape(bad), /invalid canonical lead/u);
});

test('confirmation needs a reachable witness and control, fixed needs receipt', () => {
    const identity = { key: 'source-audit:x', evidenceKey: 'h' };
    assert.throws(() => validateDecision({ ...identity, status: 'confirmed',
        witness: { setup: 'game' } }), /reachable failing witness/u);
    assert.doesNotThrow(() => validateDecision({ ...identity, status: 'confirmed',
        witness: { setup: 'initialized game, actor adjacent',
            failingCommand: 'node --test target.test.mjs', observed: 'no line',
            expected: 'C prints a line', control: { command: 'control test',
                result: 'passes' }, evidenceBasis: 'C-source',
            sourceRefs: ['nethack-c/upstream/src/demo.c:42'] } }));
    assert.throws(() => validateDecision({ ...identity, status: 'fixed',
        resolution: { explanation: 'fixed', evidence: 'test' } }), /receipt/u);
});

test('failed and missing adapters are failures, not empty successful findings', () => {
    const missing = runCommand('teleport-command-that-does-not-exist', [], process.cwd());
    assert.equal(missing.status, 'failed');
    assert.match(missing.error, /ENOENT/u);
    const failing = runCommand(process.execPath, ['-e', 'process.exit(7)'], process.cwd());
    assert.equal(failing.status, 'failed');
    assert.equal(failing.exitCode, 7);
    assert.equal(replaySelectionStatus({ sessions: [], candidates: [] }, 'complete'),
        'empty-input');
    assert.equal(replaySelectionStatus({ sessions: [{}], candidates: [] }, 'complete'),
        'selected-inputs');
    assert.equal(replaySelectionStatus(null, 'failed'), 'failed');
});

test('twelve-column CSV is only a view into the evidence-bearing JSON', () => {
    const [lead] = mergeLeads([normalizeSource(source)], [], new Set(), 'now',
        { jsSha: 'accepted-main' });
    const run = { baseSha: 'accepted-main', leads: [lead] };
    const header = CSV_COLUMNS.map(value => `"${value}"`).join(',');
    let csv = leadIndexCsv(run);
    assert.equal(CSV_COLUMNS.length, 12);
    assert.equal(csv.split('\n')[0], header);
    assert.match(csv, /"unreviewed","","","","Raw observation only:/u);
    assert.match(csv, /"accepted-main","run.json#\/leads\/0"/u);
    lead.status = 'unresolved';
    lead.attempts = [{ setup: 'supported', outcome: 'setup did not reach branch' }];
    lead.nextStep = { experiment: 'change valid input' };
    csv = leadIndexCsv(run);
    assert.match(csv, /"Unresolved: setup did not reach branch"/u);
    assert.match(csv, /"change valid input"/u);
});
