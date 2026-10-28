import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { caseTemplate, validatePackage } from './evidence-package.mjs';
import { projectRun } from './discovery-project.mjs';
import { mergeLeads, normalizeSource, reviewTemplate } from './discovery-hub.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(t, status = 'candidate') {
    const root = mkdtempSync(join(tmpdir(), 'evidence-package-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const c = caseTemplate('test-case', 'commands');
    Object.assign(c, { status, readiness: 'review_ready', hypothesis: 'Named difference',
        expectedBehavior: 'C target output', observedBehavior: 'JS target output',
        provenance: { jsSha: 'a'.repeat(40), cGitlink: 'b'.repeat(40) },
        source_locations: [{ side: 'C', path: 'src/cmd.c', symbol: 'foo',
            start_line: 1, end_line: 2, commit_sha: 'b'.repeat(40) }],
        witness: { kind: 'production_api', scope: 'Only target/control fixtures', limitations: ['No shipped route established'] },
        exposure: { route: 'api', attribution: 'not_applicable', evidence: [], reason: 'Initialized API fixture' },
    });
    c.origin.reason = 'Manual finding, no scanner binding';
    const put = (path, value, role = 'evidence') => {
        const bytes = typeof value === 'string' ? value : JSON.stringify(value);
        mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes);
        const entry = { path, role, sha256: hash(bytes) };
        const index = c.artifacts.findIndex(item => item.path === path);
        if (index < 0) c.artifacts.push(entry); else c.artifacts[index] = entry;
        return bytes;
    };
    put('proof.mjs', '// fixture runner'); put('config.json', '{}'); put('output.txt', 'saved output');
    const add = (id, role, expectedExit, receipt = true) => {
        const command = { id, role, argv: ['node', '--test', 'proof.mjs'], cwd: '.', runner: 'proof.mjs',
            ci: 'manual', inputs: ['config.json'], expectedExit, receipt: receipt ? `${id}.receipt.json` : null };
        c.commands.push(command);
        if (receipt) put(command.receipt, { schemaVersion: 1, commandId: id, argv: command.argv,
            cwd: '.', jsSha: c.provenance.jsSha, cGitlink: c.provenance.cGitlink,
            recordedAt: '2026-10-28T20:00:00Z', exitCode: expectedExit, toolVersions: { node: process.version },
            runnerSha256: hash('// fixture runner'), inputHashes: { 'config.json': hash('{}') }, outputs: ['output.txt'] }, 'receipt');
    };
    add('witness', 'target', status === 'candidate' ? 1 : 0); add('control', 'control', 0);
    if (status === 'candidate') add('after-fix', 'post_fix', 0, false);
    return { root, c, put, validate: () => validatePackage(c, { root }) };
}

test('expected failing candidate target is ready independently of shipped exposure; post-fix remains planned', t => {
    const f = fixture(t), report = f.validate();
    assert.equal(report.validated, true); assert.deepEqual(report.pending, []);
    assert.equal(report.exposure.route, 'api'); assert.equal(report.semanticCorrectness, 'not-assessed');
    assert.equal(f.c.commands[0].expectedExit, 1);
});
test('unresolved packages remain visible, missing receipts cannot become ready, and legacy is explicit', t => {
    const f = fixture(t); f.c.status = 'unresolved'; f.c.readiness = 'incomplete';
    f.c.commands[0].receipt = null;
    assert.deepEqual(f.validate().pending, ['missing receipt: witness']);
    f.c.readiness = 'review_ready'; assert.throws(f.validate, /unresolved\/invalid/);
    f.c.status = 'candidate'; assert.throws(f.validate, /missing receipt/);
    assert.equal(validatePackage({ outcome: 'explained negative' }).validated, false);
    assert.throws(() => validatePackage({ schemaVersion: 2 }), /unsupported/);
});
test('detects missing artifacts, changed hashes, receipts and contradictory claims', t => {
    const f = fixture(t);
    writeFileSync(join(f.root, 'output.txt'), 'changed'); assert.throws(f.validate, /hash mismatch/);
    f.put('output.txt', 'saved output');
    f.c.commands[0].expectedExit = 0; assert.throws(f.validate, /unexpected exit/);
    f.c.commands[0].expectedExit = 1;
    f.c.commands[0].argv.push('--different'); assert.throws(f.validate, /receipt command mismatch/);
    f.c.commands[0].argv.pop();
    f.put('config.json', '{"changed":true}'); assert.throws(f.validate, /receipt inputs changed/);
    f.put('config.json', '{}');
    f.c.exposure.attribution = 'attributed'; assert.throws(f.validate, /attribution requires/);
    f.c.exposure.attribution = 'not_applicable';
    f.c.origin.keys.push('invented'); assert.throws(f.validate, /manual origin/);
    f.c.origin.keys = [];
    f.c.commands[0].ci = 'default'; assert.throws(f.validate, /default CI runner/);
    f.c.commands[0].ci = 'manual';
    f.c.dependencies.push({ path: 'missing.json', role: 'oracle', sha256: hash('missing') });
    assert.throws(f.validate, /ENOENT/);
});
test('references cannot escape the package root or silently omit runner dependencies', t => {
    const f = fixture(t); f.c.artifacts.push({ path: '../outside', sha256: hash(''), role: 'evidence' });
    assert.throws(f.validate, /invalid artifacts/); f.c.artifacts.pop();
    symlinkSync('/etc/hosts', join(f.root, 'outside'));
    f.c.artifacts.push({ path: 'outside', sha256: hash(''), role: 'evidence' });
    assert.throws(f.validate, /escapes package/); f.c.artifacts.pop();
    f.c.commands[0].inputs.push('unlisted.json'); assert.throws(f.validate, /unlisted reference/);
});

test('scanner negative uses unchanged discovery guards and preserves the unresolved neighbor', t => {
    const f = fixture(t, 'explained_negative');
    const provenance = { ...f.c.provenance, runId: 'run', methodVersions: { sourceAudit: 'sha256:tool' },
        methodConfigHashes: { sourceAudit: 'config' }, sourceAuditSourceHash: 'source' };
    const leads = mergeLeads(['negative', 'neighbor'].map(name => normalizeSource({
        id: `edge-c-only:src/demo.c:owner:${name}`, kind: 'edge-c-only', evidenceKey: `evidence-${name}`,
        sites: [{ file: 'nethack-c/upstream/src/demo.c', line: 4 }], owner: 'src/demo.c:owner', target: name,
    })), [], new Set(), 'now', provenance);
    leads[1].status = 'unresolved';
    const run = { runId: 'run', baseSha: provenance.jsSha, cGitlink: provenance.cGitlink,
        inputHashes: {}, exclusionsSha256: null, toolHashes: { sourceAudit: 'tool' },
        methodConfigHashes: { sourceAudit: 'config' }, methods: { sourceAudit: { sourceHash: 'source' } }, leads };
    const decisions = [{ ...reviewTemplate(run, [leads[0].key])[0], status: 'explained_negative',
        reason: 'unreachable', evidence: { explanation: 'Pinned scope', proof: 'source guard', sourceRefs: ['src/demo.c:4'] } }];
    const { projection } = projectRun(run, leads.map(l => l.key), decisions);
    const projectionBytes = f.put('projection.json', projection), decisionBytes = f.put('decisions.json', decisions);
    const manifest = { runId: run.runId, selectedKeys: leads.map(l => l.key), projectionSha256: hash(projectionBytes),
        decisionsSha256: hash(decisionBytes), originalRunSha256: hash(JSON.stringify(run)),
        exporterSha256: hash('exporter'), hubSha256: hash('hub') };
    f.put('manifest.json', manifest);
    f.c.origin = { kind: 'scanner', keys: [leads[0].key], projection: 'projection.json',
        manifest: 'manifest.json', decisions: 'decisions.json' };
    assert.deepEqual(f.validate().discovery.after, { active: 1, filtered: 1, excluded: 0 });
    projection.methodConfigHashes.sourceAudit = 'stale';
    manifest.projectionSha256 = hash(f.put('projection.json', projection)); f.put('manifest.json', manifest);
    assert.throws(f.validate, /expected filtered membership/);
    projection.methodConfigHashes.sourceAudit = 'config';
    manifest.projectionSha256 = hash(f.put('projection.json', projection)); f.put('manifest.json', manifest);
    f.c.status = 'unresolved'; f.c.readiness = 'incomplete'; assert.throws(f.validate, /status contradiction/);
});

test('CLI requires a clean committed layout and reports legacy separately without running commands', t => {
    const f = fixture(t);
    const git = (...args) => execFileSync('git', ['-C', f.root, '-c', 'core.hooksPath=/dev/null',
        '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
    git('init', '-q'); git('add', 'proof.mjs'); git('commit', '-qm', 'candidate');
    writeFileSync(join(f.root, 'case.json'), JSON.stringify(f.c));
    const script = fileURLToPath(new URL('./evidence-package.mjs', import.meta.url));
    const run = args => spawnSync(process.execPath, [script, ...args], { cwd: f.root, encoding: 'utf8' });
    const good = run(['validate', 'case.json']);
    assert.equal(good.status, 0, good.stderr);
    assert.equal(JSON.parse(good.stdout).layout.passed, true);
    writeFileSync(join(f.root, 'stray.test.mjs'), 'throw new Error("must never execute");');
    git('add', 'stray.test.mjs'); git('commit', '-qm', 'stray');
    const bad = run(['validate', 'case.json']); assert.equal(bad.status, 1);
    assert.match(bad.stderr, /committed test layout failed/);
    writeFileSync(join(f.root, 'legacy.json'), '{}');
    assert.equal(run(['validate', 'legacy.json']).status, 2);
    assert.equal(JSON.parse(run(['template', 'new-case', 'levels']).stdout).readiness, 'incomplete');
});
