import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, runJsSession, formatReport } from '../../../../scripts/diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from '../../../../scripts/scoring-workspace.mjs';
const source = file => readFileSync(new URL('../../../../' + file, import.meta.url), 'utf8');
test('the three current production call sites each create a zero count output', () => {
    const cmd = source('js/cmd.js'), invent = source('js/invent.js');
    assert.equal((cmd.match(/await get_count\(/gu) || []).length, 1);
    assert.equal((invent.match(/await get_count\(/gu) || []).length, 2);
    assert.match(cmd, /const countOut = \{ value: 0 \};\s*key = await get_count\(\s*null, 0, LARGEST_INT, countOut,/u);
    assert.match(invent, /const countOut = \{ value: 0 \};\s*const counted = await get_count\(\s*null,\s*ilet\.charCodeAt\(0\),\s*LARGEST_INT,\s*countOut,/u);
    assert.match(invent, /const count = \{ value: 0 \};\s*const result = await get_count\(\s*null, first, 0, count,/u);
    assert.match(source('nethack-c/upstream/src/cmd.c'), /\*count = 0;\s*for \(;;\)/u);
});
test('ordinary count cancellation matches C through the following look command', async () => {
    const recording = JSON.parse(readFileSync(new URL('control.recording.json', import.meta.url)));
    assert.equal(recording.segments[0].moves, '12\x1b:');
    const root = createScoringWorkspace(process.cwd(), []);
    try {
        const result = compareSessionOutputs(recording, await runJsSession(recording, root));
        assert.equal(result.passed, true, formatReport(result));
    } finally { removeScoringWorkspace(root); }
});
