import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { defaultImportDelegations, delegationRankingHint } from './delegation-ranking.mjs';
const factory = `import { rn2 } from './rng.js';
function environment(raw = {}) {
 return { ...raw, randomCore: raw.randomCore ?? raw.random?.rn2 ?? rn2 };
}
`;
const source = body => factory + `export function get_location(raw = {}) {\n${body}\n}`;
test('follows default named import through const environment and destructured alias', () => {
    for (const body of [
        'const env = environment(raw);\nreturn env.randomCore(5);',
        'const env = environment(raw);\nconst { randomCore: roll } = env;\nreturn roll(5);',
        'const { randomCore } = environment(raw);\nreturn randomCore(5);',
    ]) {
        const traces = defaultImportDelegations(source(body), 'get_location');
        assert.equal(traces.length, 1);
        assert.equal(traces[0].imported, 'rn2');
        assert.equal(delegationRankingHint('edge-c-only', 'rn2', traces).delta, -10);
        assert.equal(delegationRankingHint('edge-stub', 'rn2', traces), null);
        assert.equal(delegationRankingHint('edge-c-only', 'rnd', traces), null);
    }
});
test('unknown, reassigned, shadowed and spread-overridden bindings get no hint', () => {
    for (const text of [
        source('const env = unknown(raw);\nreturn env.randomCore(5);'),
        source('let env = environment(raw);\nreturn env.randomCore(5);'),
        source('const env = environment(raw);\nenv.randomCore = other;\nreturn env.randomCore(5);'),
        source('const environment = unknown;\nconst env = environment(raw);\nreturn env.randomCore(5);'),
        source('function environment() { return other; }\nconst env = environment(raw);\nreturn env.randomCore(5);'),
        source('const env = environment(raw);\nreturn env["randomCore"](5);'),
        source('const env = environment(raw);\nreturn env.randomCore(5);').replace('raw.randomCore ?? raw.random?.rn2 ?? rn2', 'unknown'),
        source('const env = environment(raw);\nreturn env.randomCore(5);').replace('?? rn2 }', '?? rn2, ...raw }'),
    ]) assert.deepEqual(defaultImportDelegations(text, 'get_location'), []);
});
test('wrong bounds and reversed draw order still produce visible warnings, not equivalence', () => {
    const traces = defaultImportDelegations(source('const env = environment(raw);\nconst y = env.randomCore(99);\nconst x = env.randomCore(1);\nreturn {x,y};'), 'get_location');
    const hint = delegationRankingHint('edge-c-only', 'rn2', traces);
    assert.equal(hint.delta, -10);
    assert.equal(traces.length, 2);
    assert.equal(hint.status, undefined);
    assert.match(hint.limitation, /arguments.*RNG order remain unproved/);
});
test('pinned room coordinate aliases are traced without treating fallback coverage as proved', () => {
    const src = readFileSync('js/room_coordinates.js', 'utf8');
    for (const owner of ['get_location', 'get_room_loc']) {
        const traces = defaultImportDelegations(src, owner);
        assert.ok(traces.filter(t => t.imported === 'rn2').length >= 2);
        assert.equal(delegationRankingHint('edge-c-only', 'somexy', traces), null);
    }
});

test('real audit keeps the delegated RNG warning active despite wrong bounds and order', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const { audit, auditIdentity } = await import('./source-audit.mjs');
    const { normalizeSource, mergeLeads, activeLeadIndex } = await import('./discovery-hub.mjs');
    const root = mkdtempSync(join(tmpdir(), 'delegate-rank-'));
    const put = (path, text) => { const dirs = path.split('/'); dirs.pop(); mkdirSync(join(root, ...dirs), { recursive: true }); writeFileSync(join(root, path), text); };
    try {
        execFileSync('git', ['init', '-q', root]);
        execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: root });
        mkdirSync(join(root, 'nethack-c/upstream/win/tty'), { recursive: true });
        put('nethack-c/upstream/src/rng.c', 'int\nrn2(int n) { return n; }\n');
        put('nethack-c/upstream/src/coords.c', 'int\nget_location(void) { int x=rn2(5); int y=rn2(3); return x+y; }\n');
        put('js/rng.js', 'export function rn2(n) { return n; }\n');
        const text = source('const env = environment(raw);\nconst y = env.randomCore(99);\nconst x = env.randomCore(1);\nreturn {x,y};');
        put('js/coords.js', text);
        const { report, backlog } = audit({ root });
        const lead = backlog.entries.find(l => l.id === 'edge-c-only:src/coords.c:get_location:rn2');
        assert.ok(lead);
        assert.equal(lead.rankingHint.delta, -10);
        assert.equal(report.totals.delegationRankingHints.deprioritized, 1);
        assert.equal(report.totals.rankingHints.deprioritized, 0);
        assert.equal(report.sourceHash, auditIdentity({ root }));
        assert.equal(lead.classification, 'needs-investigation');
        const normalized = normalizeSource(lead);
        const leads = mergeLeads([normalized], [], new Set(), 'now', { jsSha: 'a'.repeat(40), cGitlink: 'b'.repeat(40) });
        assert.equal(leads[0].status, 'unreviewed');
        assert.deepEqual(activeLeadIndex({ leads }).active, [normalized.key]);
        put('js/coords.js', text.replace('?? rn2', '?? unknown'));
        const changed = audit({ root, previous: backlog }).backlog.entries.find(l => l.id === lead.id);
        assert.equal(changed.rankingHint, null);
        assert.equal(changed.rank, lead.rank + 10);
        assert.notEqual(changed.evidenceKey, lead.evidenceKey);
        put('js/coords.js', "import { rn2 } from './rng.js'; export function get_location(random = rn2) { const y = random(99); return random(1) + y; }");
        const direct = audit({ root }).backlog.entries.find(l => l.id === lead.id);
        assert.equal(direct.rankingHint.delta, -10);
        assert.equal(direct.classification, 'needs-investigation');
        assert.equal(direct.rank, lead.rank);
        const directLeads = mergeLeads([normalizeSource(direct)], [], new Set(), 'now', {});
        assert.equal(directLeads[0].status, 'unreviewed');
        assert.deepEqual(activeLeadIndex({ leads: directLeads }).active, [normalizeSource(direct).key]);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('PR21 supplied projection imports exact decisions without weakening identity', async () => {
    const { createHash } = await import('node:crypto');
    const { applyDecisions, activeLeadIndex } = await import('./discovery-hub.mjs');
    const root = 'diagnostics/reviews/delegation-ranking-20261028/';
    const bytes = readFileSync(root + 'pr21-bound-run.json');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), '070935772f1fbc7dda8264392a236e5228ca727e2030882c0c7b0e9448aec396');
    const run = JSON.parse(bytes), decisions = JSON.parse(readFileSync(root + 'pr21-decisions.json'));
    assert.equal(activeLeadIndex(run).active.length, 2);
    assert.equal(activeLeadIndex(applyDecisions(run, decisions)).filtered.length, 2);
    assert.throws(() => applyDecisions({ ...run, runId: 'changed' }, decisions), /stale/);
});

test('direct named-import parameter defaults are hints, not call equivalence', () => {
    const prefix = "import { rn2 as roll } from './rng.js';\n";
    const text = prefix + 'export function choose(random = roll) { const y = random(99); return random(1) + y; }';
    const traces = defaultImportDelegations(text, 'choose');
    assert.equal(traces.length, 2);
    assert.equal(traces[0].kind, 'parameter-default');
    assert.equal(traces[0].imported, 'rn2');
    const hint = delegationRankingHint('edge-c-only', 'rn2', traces);
    assert.equal(hint.delta, -10);
    assert.equal(hint.status, undefined);
    assert.match(hint.limitation, /overrides.*arguments.*RNG order remain unproved/);
    for (const body of [
        'export function choose(random = unknown) { return random(5); }',
        'export function choose(roll, random = roll) { return random(5); }',
        'export function choose(random = roll) { random = other; return random(5); }',
        'export function choose(random = roll) { [random] = values; return random(5); }',
        'export function choose(random = roll) { for (random of values) {} return random(5); }',
        'export function choose(random = roll, x = (random = other)) { return random(5); }',
        'export function choose(random = roll) { { const random = other; return random(5); } }',
        'export function choose(random = roll) { try {} catch (random) { return random(5); } }',
        'export function choose(random = roll) { const { random: other } = raw; return random(5); }',
        'export function choose(random = roll) { { function random() {} return random(5); } }',
        'export function choose({random = roll}) { return random(5); }',
        'export function choose(random = roll) { return 5; }',
    ]) assert.deepEqual(defaultImportDelegations(prefix + body, 'choose'), []);
});

test('direct default argument and order defects retain raw and active candidates', async () => {
    const { normalizeSource, mergeLeads, activeLeadIndex } = await import('./discovery-hub.mjs');
    const text = "import { rn2 } from './rng.js'; export function choose(random = rn2) { random(99); return random(1); }";
    const hint = delegationRankingHint('edge-c-only', 'rn2', defaultImportDelegations(text, 'choose'));
    const item = { id: 'edge-c-only:src/rect.c:choose:rn2', kind: 'edge-c-only',
        classification: 'needs-investigation', rankingHint: hint, rank: 40, sites: [], details: {} };
    const normalized = normalizeSource(item);
    const leads = mergeLeads([normalized], [], new Set(), 'now', { jsSha: 'a'.repeat(40), cGitlink: 'b'.repeat(40) });
    assert.equal(leads.length, 1);
    assert.equal(leads[0].status, 'unreviewed');
    assert.deepEqual(activeLeadIndex({ leads }).active, [normalized.key]);
    assert.equal(activeLeadIndex({ leads }).filtered.length, 0);
});
