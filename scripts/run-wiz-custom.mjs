#!/usr/bin/env node
// Independent C-first default, byte-symbol, Unicode/RGB and ordinary routes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { glyphid_cache_status } from '../js/glyphs.js';
import { sourceGlyphNumber } from '../js/glyph_ids.js';
import { NH_BASIC_COLOR } from '../js/const.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const cases = ['default', 'ibm', 'unicode', 'ordinary', 'classes'];
function recipe(name) {
    const url = new URL('../recipes/wizcmds.c/wizard-custom-glyphs-' + name + '.session.json', import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(n => recipe(n).segments[0].seed === segment.seed);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = replay.getScreens();
    if (name === 'ordinary') {
        assert.ok(screens.some(s => s.includes('#wizcustom: unknown extended command.')),
            'source command registry rejects wizard command in ordinary play');
    } else {
        assert.ok(screens.some(s => s.includes('#wizcustom: colorcount=256')),
            'production dispatcher enters the source PICK_NONE diagnostic menu');
        assert.ok(screens.some(s => s.includes('glyph  glyph identifier')), 'source heading is displayed');
        assert.ok(!screens.at(-1).includes('glyph  glyph identifier'), 'Escape restores map command input');
        if (name === 'default') assert.ok(screens.some(s => s.includes('colorcount=256 default')));
        if (name === 'ibm' || name === 'classes') {
            assert.ok(screens.some(s => s.includes('IBMgraphics, active, handler=IBM')));
            assert.ok(screens.some(s => s.includes('G_male_giant_ant')));
            assert.equal(game.gg.glyph_customizations[sourceGlyphNumber('G_male_giant_ant')].nhcolor, NH_BASIC_COLOR,
                'source black color retains its nonzero tag');
            if (name === 'classes') {
                const colored = game.gg.glyph_customizations.filter(row => row?.nhcolor === NH_BASIC_COLOR);
                assert.ok(colored.length > 1, 'S_ant fans out through all corresponding monster families');
                assert.ok(colored.every(row => !row.displayCh), 'IBM handling does not apply requested Unicode');
            }
        }
        if (name === 'unicode') {
            assert.ok(screens.some(s => s.includes('Enhanced1, active, handler=UTF8')));
            assert.ok(screens.some(s => s.includes('G_male_giant_ant') && s.includes('00000010203')),
                'first configured row exposes raw RGB rather than renderer color');
            assert.ok(screens.some(s => s.includes('G_vwall_main')), 'symbol-set Unicode rows are included before branch colors');
            assert.equal(game.gg.glyph_customizations[sourceGlyphNumber('G_male_giant_ant')].displayCh, '☃');
        }
    }
    assert.equal(glyphid_cache_status(game), false, 'source wizard command releases ID cache after dismissal');
    assert.equal(game.context.move, 0, 'diagnostic command takes no turn');
}
export async function runWizCustomMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'WIZARD CUSTOM GLYPHS', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runWizCustomMatrix, 'wizcmds.c custom glyphs');
