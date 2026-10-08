import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as wiz from '../js/wizcmds.js';
import * as glyphs from '../js/glyphs.js';
import { glyph_to_cmap as publishedDecoder } from '../js/display.js';
import * as offsets from '../js/glyph_offsets.js';
import * as symbols from '../js/symbols.js';
import { NUMMONS } from '../js/monsters.js';
import { MAXTCHARS, MAXEXPCHARS, ECMD_OK } from '../js/const.js';
const c = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
const body = c.slice(c.indexOf('wiz_display_macros(void)'), c.indexOf('/* the #wizshownhuuid command */'));
test('pure glyph_to_cmap covers every source range and returns the source fencepost elsewhere', () => {
    assert.equal(typeof glyphs.glyph_to_cmap, 'function');
    const expected = Array(offsets.MAX_GLYPH).fill(symbols.MAXPCHARS); // glyphs.c199-231 final default is the defsyms fencepost.
    const fill = (off, count, index) => { for (let n = 0; n < count; n++) expected[off + n] = index(n); };
    expected[offsets.GLYPH_CMAP_STONE_OFF] = symbols.S_stone;
    for (const off of [offsets.GLYPH_CMAP_MAIN_OFF, offsets.GLYPH_CMAP_MINES_OFF, offsets.GLYPH_CMAP_GEH_OFF, offsets.GLYPH_CMAP_KNOX_OFF, offsets.GLYPH_CMAP_SOKO_OFF])
        fill(off, symbols.S_trwall - symbols.S_vwall + 1, n => symbols.S_vwall + n); // Five branch wall ranges share cmap indices.
    fill(offsets.GLYPH_CMAP_A_OFF, symbols.S_brdnladder - symbols.S_ndoor + 1, n => symbols.S_ndoor + n);
    fill(offsets.GLYPH_ALTAR_OFF, 5, () => symbols.S_altar); // display.h699: five altar glyphs collapse to one cmap.
    fill(offsets.GLYPH_CMAP_B_OFF, symbols.S_arrow_trap + MAXTCHARS - symbols.S_grave, n => symbols.S_grave + n);
    fill(offsets.GLYPH_CMAP_C_OFF, symbols.S_goodpos - symbols.S_digbeam + 1, n => symbols.S_digbeam + n);
    fill(offsets.GLYPH_ZAP_OFF, offsets.NUM_ZAP << 2, n => symbols.S_vbeam + n % 4); // Source zap direction modulo4.
    fill(offsets.GLYPH_SWALLOW_OFF, NUMMONS << 3, n => symbols.S_sw_tl + (n & 7)); // Source eight swallow positions per species.
    fill(offsets.GLYPH_EXPLODE_OFF, offsets.GLYPH_EXPLODE_FROSTY_OFF + MAXEXPCHARS - offsets.GLYPH_EXPLODE_OFF,
        n => symbols.S_expl_tl + n % (symbols.S_expl_br - symbols.S_expl_tl + 1));
    for (let glyph = 0; glyph < offsets.MAX_GLYPH; glyph++)
        assert.equal(glyphs.glyph_to_cmap(glyph), expected[glyph], 'source glyph ' + glyph);
    assert.equal(glyphs.glyph_to_cmap(-1), symbols.MAXPCHARS); // One below valid glyph space.
    assert.equal(glyphs.glyph_to_cmap(offsets.MAX_GLYPH), symbols.MAXPCHARS); // One past the final source glyph.
    assert.equal(publishedDecoder, glyphs.glyph_to_cmap, 'existing display callers share the source-owned decoder');
    const source = readFileSync(new URL('../nethack-c/upstream/src/glyphs.c', import.meta.url), 'utf8');
    assert.match(source, /glyph_is_swallow\(glyph\)\)\s+return glyph_to_swallow\(glyph\) \+ S_sw_tl/u);
    assert.match(source, /glyph_is_explosion\(glyph\)\)\s+return glyph_to_explosion\(glyph\) \+ S_expl_tl/u);
});
test('whole diagnostic reads every canonical range and emits the C success row without game changes', async () => {
    assert.equal(typeof wiz.wiz_display_macros, 'function');
    const state = { marker: 'unchanged' }; let rows;
    assert.equal(await wiz.wiz_display_macros(state, { window: async (s, lines) => { assert.equal(s, state); rows = lines; } }), ECMD_OK);
    assert.deepEqual(rows, [{ text: 'No display macro issues detected.' }]);
    assert.deepEqual(state, { marker: 'unchanged' }); // C diagnostic allocates only its temporary text window.
    assert.match(body, /glyph = 0; glyph < MAX_GLYPH; \+\+glyph/u);
    assert.match(body, /if \(test < 0 \|\| test >= NUMMONS\)/u); // Monster bound excludes NUMMONS.
    assert.match(body, /if \(test < 0 \|\| test > NUM_OBJECTS\)/u); // Object bound includes the legal fencepost.
    assert.match(body, /if \(!IndexOk\(test, defsyms\)\)/u); // defsyms includes MAXPCHARS fencepost, not NO_GLYPH.
    assert.match(body, /if \(!trouble\+\+\)\s+putstr\(win, 0, display_issues\)/u); // First failure alone emits a header.
});
test('diagnostic awaits its text window and uses the active development command dispatcher', async () => {
    assert.equal(typeof wiz.wiz_display_macros, 'function');
    let release; const gate = new Promise(resolve => { release = resolve; }); let returned = false;
    const pending = wiz.wiz_display_macros({}, { window: async () => gate }).then(v => { returned = true; return v; });
    await Promise.resolve(); assert.equal(returned, false); // Source display(FALSE) still waits for text dismissal.
    release(); assert.equal(await pending, ECMD_OK);
    const registry = readFileSync(new URL('../nethack-c/upstream/src/cmd.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(registry, /"wizdispmacros", "validate the display macro ranges",\s+wiz_display_macros/u);
    assert.match(js, /case 'wiz_display_macros':\s+return await wiz_display_macros\(state\);/u);
});
