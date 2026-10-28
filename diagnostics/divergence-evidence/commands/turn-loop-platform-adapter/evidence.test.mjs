import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
const read = p => readFileSync(p, 'utf8');
test('C cursor wrapper is exactly the JS status-branch operation', () => {
    const c = read('nethack-c/upstream/src/display.c');
    assert.match(c, /curs_on_u\(void\)\s*\{\s*flush_screen\(1\);\s*\/\*[^]*?\*\/\s*\}/u);
    assert.match(read('nethack-c/upstream/src/allmain.c'), /if \(disp.botl \|\| disp.botlx\) \{\s*bot\(\);\s*curs_on_u\(\);\s*\} else if \(disp.time_botl\) \{\s*timebot\(\);\s*curs_on_u\(\);/u);
    assert.match(read('js/allmain.js'), /if \(g.disp\?\.botl \|\| g.disp\?\.botlx\) \{\s*await bot\(\);\s*await flush_screen\(1\);\s*\} else if \(g.disp\?\.time_botl\) \{\s*await timebot\(\);\s*await flush_screen\(1\);/u);
});
test('saved configured preprocessing excludes only the platform poll arm', () => {
    const p = JSON.parse(read(new URL('preprocessor-proof.json', import.meta.url)));
    assert.deepEqual(p.absent, ['MICRO', 'WIN32CON', 'WIN32']);
    assert.doesNotMatch(p.occupationExcerpt, /pgetchar|mvl_abort_lev/u);
    assert.match(p.occupationExcerpt, /\(\*go.occupation\)\(\)/u);
    assert.match(p.occupationExcerpt, /monster_nearby\(\)/u);
});
test('ordinary counted-search, Escape and status control', async () => {
    const c = JSON.parse(gunzipSync(readFileSync(new URL('control.recording.json.gz', import.meta.url))));
    const root = createScoringWorkspace(process.cwd(), []);
    try {const result = compareSessionOutputs(c, await runJsSession(c, root)); assert.equal(result.passed, true, formatReport(result));}
    finally {removeScoringWorkspace(root);}
});
