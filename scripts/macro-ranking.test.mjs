import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audit, auditIdentity, functionMacroDefinitions, macroHelperRankingHint } from './source-audit.mjs';
import { normalizeSource, mergeLeads, activeLeadIndex } from './discovery-hub.mjs';

test('hint needs a real function macro and a call from the paired C owner', () => {
    const defs = functionMacroDefinitions('/* #define Bogus(x) x */\n#define Is_container(o) ((o)->otyp > 1)\n#define Object_like (1)\n', 'include/obj.h');
    assert.deepEqual(defs.map(x => x.name), ['Is_container']);
    assert.equal(macroHelperRankingHint('edge-js-helper', 'isContainer', [], defs), null);
    assert.equal(macroHelperRankingHint('edge-js-helper', 'other', [{ name: 'Is_container' }], defs), null);
    for (const kind of ['message', 'edge-stub', 'edge-c-only', 'constant'])
        assert.equal(macroHelperRankingHint(kind, 'isContainer', [{ name: 'Is_container' }], defs), null);
    assert.equal(macroHelperRankingHint('edge-js-helper', 'isContainer', [{ name: 'Is_container' }], defs).delta, -10);
});

test('real audit demotes macro-shaped helper but retains even a genuinely wrong implementation', () => {
    const root = mkdtempSync(join(tmpdir(), 'macro-rank-'));
    const put = (path, text) => { const parts = path.split('/'); parts.pop(); mkdirSync(join(root, ...parts), { recursive: true }); writeFileSync(join(root, path), text); };
    try {
        execFileSync('git', ['init', '-q', root]);
        execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
            'commit', '--allow-empty', '-qm', 'fixture'], { cwd: root });
        mkdirSync(join(root, 'nethack-c/upstream/win/tty'), { recursive: true });
        put('nethack-c/upstream/include/obj.h', '#define Is_container(o) ((o)->otyp >= 1 && (o)->otyp <= 7)\n');
        put('nethack-c/upstream/src/pickup.c', 'int\ntip_ok(struct obj *o) { return Is_container(o); }\n');
        // Deliberately wrong helper: correspondence must never be a suppression.
        put('js/pickup.js', 'export function isContainer(o) { return o.otyp === 999; }\nexport function tip_ok(o) { return isContainer(o); }\n');
        const { backlog, report } = audit({ root });
        const lead = backlog.entries.find(x => x.id === 'edge-js-helper:src/pickup.c:tip_ok:isContainer');
        assert.ok(lead);
        assert.equal(lead.rankingHint.delta, -10);
        assert.equal(lead.classification, 'needs-investigation');
        assert.equal(report.totals.rankingHints.filtered, 0);
        assert.equal(report.sourceHash, auditIdentity({ root }));
        const normalized = normalizeSource(lead);
        assert.deepEqual(normalized.rankingHint, lead.rankingHint);
        const leads = mergeLeads([normalized], [], new Set(), 'now', {
            jsSha: 'a'.repeat(40), cGitlink: 'b'.repeat(40) });
        assert.equal(leads[0].status, 'unreviewed');
        assert.deepEqual(activeLeadIndex({ leads }).active, [normalized.key]);
        const identity = auditIdentity({ root });
        assert.notEqual(identity, auditIdentity({ root, mappings: { renames: { X: 'Y' } } }));
        put('nethack-c/upstream/include/obj.h', '#define Other_macro(o) ((o)->otyp > 1)\n');
        assert.notEqual(identity, auditIdentity({ root }));
        const changed = audit({ root, previous: backlog }).backlog.entries.find(x => x.id === lead.id);
        assert.equal(changed.rankingHint, null);
        assert.equal(changed.rank, lead.rank + 10);
        assert.notEqual(changed.evidenceKey, lead.evidenceKey);
        assert.equal(changed.classification, 'needs-investigation');
    } finally { rmSync(root, { recursive: true, force: true }); }
});
