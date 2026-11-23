// C keeps two glyphs for a map square: levl[x][y].glyph, what the hero
// remembers, and glyph_at(x, y), what display.c last drew there. They differ
// whenever the drawn map is not the remembered one: under_water() blanks the
// squares around a submerged hero, and a sensed monster is drawn over a
// remembered 'I'. Most C tests for a remembered unseen monster read
// levl[x][y].glyph. Five ported ones read glyph_at() instead, so a blind
// submerged hero who force-fought the same unseen monster twice drew a second
// 'I' that C leaves out.
//
// This check lists every place in js/ that passes glyph_at() straight to
// glyph_is_invisible(), with the C line that reads the drawn glyph there. It
// does not see a drawn glyph held in a variable first; compare such a site
// with its C line by hand.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const JS_DIR = join(ROOT, 'js');
const C_DIR = join(ROOT, 'nethack-c', 'upstream', 'src');

// Each entry is a JS function that tests the drawn glyph, and the C text that
// does the same. The count is pinned: add an entry only with its C line.
const DRAWN_GLYPH_SITES = [
    {
        // cmd.c:4612, in the test that ends a run next to a displayed 'I'.
        file: 'cmd.js',
        cFile: 'cmd.c',
        cText: '|| glyph_is_invisible(glyph_at(x, y))) {',
    },
    {
        // hack.c:2233 reads `glyph = glyph_at(x, y)` and 2244 tests it.
        file: 'hack.js',
        cFile: 'hack.c',
        cText: 'int glyph = !off_edge ? glyph_at(x, y) : GLYPH_UNEXPLORED;',
    },
];

function drawnGlyphTests() {
    const found = [];
    for (const name of readdirSync(JS_DIR).sort()) {
        if (!name.endsWith('.js')) continue;
        const source = readFileSync(join(JS_DIR, name), 'utf8');
        for (const _match of source.matchAll(
            /glyph_is_invisible\(\s*glyph_at\(/g,
        ))
            found.push(name);
    }
    return found;
}

test('only the listed sites test the drawn glyph for an unseen monster', () => {
    assert.deepEqual(
        drawnGlyphTests(),
        DRAWN_GLYPH_SITES.map(({ file }) => file),
    );
});

test('each listed site has the C line that reads the drawn glyph', () => {
    for (const { cFile, cText } of DRAWN_GLYPH_SITES) {
        const source = readFileSync(join(C_DIR, cFile), 'utf8');
        assert.ok(source.includes(cText), `${cFile}: ${cText}`);
    }
});

test('C tests the remembered glyph at the five corrected sites', () => {
    // The C lines the port now follows; each is the whole condition's
    // glyph_is_invisible() operand, copied from the source.
    const remembered = [
        // uhitm.c:578, do_attack()'s atk_done test.
        ['uhitm.c', '!glyph_is_invisible(levl[u.ux + u.dx][u.uy + u.dy].glyph)'],
        // apply.c:823, use_leash_core().
        ['apply.c', '!glyph_is_invisible(levl[cc->x][cc->y].glyph)'],
        // apply.c:3138, use_whip()'s whipattack arm.
        ['apply.c', '!glyph_is_invisible(levl[rx][ry].glyph)'],
        // hack.c:206, dopush().
        ['hack.c', 'glyph_is_invisible(levl[rx][ry].glyph)'],
        // zap.c:4040, bhit()'s wand of probing arm.
        ['zap.c', '&& glyph_is_invisible(levl[x][y].glyph)) {'],
    ];
    for (const [cFile, cText] of remembered) {
        const source = readFileSync(join(C_DIR, cFile), 'utf8');
        assert.ok(source.includes(cText), `${cFile}: ${cText}`);
    }
});
