import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {docrt} from '../js/display.js';
import {normalizeSession} from '../frozen/session_loader.mjs';

const root = new URL('./test-fixtures/recovery-direction-redraw/',import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json',root)));
for (const row of manifest.cases) {
    test(`native C direction redraw: ${row.name}`,async () => {
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

// display.c redraw_map() reprints the cached glyph; it does not regenerate
// hallucinated glyphs or rewrite remembered map state. Corrupt only the
// renderer surface, leaving the supported initialized game/cache untouched.
test('refresh-only redraw repairs the terminal from cached glyphs without RNG',async () => {
    const control = JSON.parse(gunzipSync(readFileSync(new URL('redraw-control.json.gz',root))));
    await runSegment(normalizeSession(control).segments[0]);
    assert.deepEqual(game.u.uz0,game.u.uz,'live redraw level reached');
    const x=game.u.ux, y=game.u.uy, display=game.nhDisplay;
    const expected=structuredClone(display.grid[y][x-1]);
    const before={core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),
        memory:structuredClone(game.level.at(x,y).remembered_glyph)};
    display.setCell(x-1,y,'?',0,0);
    await docrt({refreshOnly:true});
    assert.deepEqual(display.grid[y][x-1],expected);
    assert.deepEqual(game.coreCtx,before.core);
    assert.deepEqual(game.displayCtx,before.display);
    assert.deepEqual(game.level.at(x,y).remembered_glyph,before.memory);
});
