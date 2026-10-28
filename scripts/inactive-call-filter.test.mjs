import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cUnits } from './structural-signals.mjs';
import { inactiveCallProof, audit } from './source-audit.mjs';
function proof(body, other = '') {
    const source = `void\ntarget(void) {}\nvoid\nowner(void) {\n${body}\n}\n`;
    const units = cUnits(source, 'src/a.c'), owners = units.filter(u => u.name === 'owner');
    const all = [...units, ...cUnits(other, 'src/b.c')], byName = new Map();
    for (const unit of all) byName.set(unit.name, [...(byName.get(unit.name) ?? []), unit]);
    const item = { kind: 'edge-c-only', target: 'target', sites: owners.flatMap(o => o.calls.filter(c => c.name === 'target').map(c => ({ file: 'src/a.c', line: c.line }))) };
    return inactiveCallProof(item, owners, byName, source, 'src/a.c');
}
test('all represented calls must be proven inactive, not just the first site', () => {
    assert.equal(proof('#if 0\ntarget();\ntarget();\n#endif').occurrences.length, 2);
    for (const body of [
        '#if 0\ntarget();\n#endif\ntarget();',
        'target();\n#if 0\ntarget();\n#endif',
        '#if 0\ntarget();\n#else\ntarget();\n#endif',
        '#if FEATURE\ntarget();\n#endif',
        '#if 0\ntarget();',
        '#if 0\ntarget();\n#else\n#elif 0\ntarget();\n#endif',
    ]) assert.equal(proof(body), null, body);
});
test('complete literal alternatives and inactive outer frames work; adjacent active code does not join proof', () => {
    assert.equal(proof('#if 1\nother();\n#else\ntarget();\n#endif').occurrences.length, 1);
    assert.equal(proof('#if UNKNOWN\nother();\n#elif 0\ntarget();\n#endif').occurrences.length, 1);
    assert.equal(proof('#if 0\n#if UNKNOWN\ntarget();\n#endif\n#endif').occurrences.length, 1);
});
test('same-name callee resolution stays owner-local and ambiguity prevents filtering', () => {
    assert.ok(proof('#if 0\ntarget();\n#endif', 'static void\ntarget(void) {}\n'));
    const source = 'void\nowner(void) {\n#if 0\ntarget();\n#endif\n}\n';
    const owners = cUnits(source, 'src/a.c');
    const targets = [...cUnits('void\ntarget(void) {}\n', 'src/b.c'), ...cUnits('void\ntarget(void) {}\n', 'src/c.c')];
    const item = { kind: 'edge-c-only', target: 'target', sites: [{ file: 'src/a.c', line: 4 }] };
    assert.equal(inactiveCallProof(item, owners, new Map([['target', targets]]), source, 'src/a.c'), null);
    assert.equal(inactiveCallProof({ ...item, sites: [{ file: 'src/other.c', line: 4 }] },
        owners, new Map([['target', [targets[0]]]]), source, 'src/a.c'), null);
});
test('real audit retains proof/raw sites, mixed live warning, and restores a lead when enabled', () => {
    const root = mkdtempSync(join(tmpdir(), 'inactive-call-'));
    const put = (path, text) => { const dirs = path.split('/'); dirs.pop(); mkdirSync(join(root, ...dirs), { recursive: true }); writeFileSync(join(root, path), text); };
    try {
        execFileSync('git', ['init', '-q', root]);
        execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: root });
        mkdirSync(join(root, 'nethack-c/upstream/win/tty'), { recursive: true });
        const source = 'void\ntarget(void) {}\nvoid\ndead(void) {\n#if 0\ntarget();\ntarget();\n#endif\n}\nvoid\nlive(void) {\n#if 0\ntarget();\n#endif\ntarget();\n}\n';
        put('nethack-c/upstream/src/demo.c', source);
        put('js/demo.js', 'export function target() {}\nexport function dead() {}\nexport function live() {}\n');
        const first = audit({ root });
        assert.equal(first.report.totals.callFilters.filtered, 1);
        assert.equal(first.report.filteredCallEdges[0].sites.length, 2);
        assert.equal(first.report.filteredCallEdges[0].sourceFilter.occurrences.length, 2);
        assert.ok(first.report.filteredCallEdges[0].provenance.sourceHash);
        assert.ok(first.backlog.entries.some(x => x.id === 'edge-c-only:src/demo.c:live:target'));
        assert.ok(!first.backlog.entries.some(x => x.id === 'edge-c-only:src/demo.c:dead:target'));
        put('nethack-c/upstream/src/demo.c', source.replace('#if 0', '#if 1'));
        const enabled = audit({ root, previous: first.backlog });
        assert.notEqual(first.report.sourceHash, enabled.report.sourceHash);
        assert.ok(enabled.backlog.entries.some(x => x.id === 'edge-c-only:src/demo.c:dead:target' && x.observed));
        assert.equal(enabled.report.totals.callFilters.filtered, 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
