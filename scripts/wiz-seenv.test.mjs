import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COLNO, ROWNO, ECMD_OK } from '../js/const.js';
import * as wizcmds from '../js/wizcmds.js';
const source = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
const start = source.indexOf('wiz_show_seenv(void)');
const body = source.slice(start, source.indexOf('/* #vision command */', start));
function fixture(ux, uy = ROWNO - 1) {
    const cells = Array.from({ length: ROWNO }, () =>
        Array.from({ length: COLNO }, () => ({ seenv: 0 })));
    return { u: { ux, uy }, level: { at: (x, y) => cells[y][x] }, cells };
}
async function rowsFor(state) {
    let rows;
    assert.equal(await wizcmds.wiz_show_seenv(state, { window: async (s, lines) => {
        assert.equal(s, state); rows = lines.map(line => line.text);
    } }), ECMD_OK); // C always returns without consuming a turn.
    return rows;
}
test('wiz_show_seenv matches the full-span and edge cropping from C', async () => {
    assert.equal(typeof wizcmds.wiz_show_seenv, 'function');
    assert.match(body, /startx = max\(1, u\.ux - \(COLNO \/ 4\)\)/u);
    assert.match(body, /stopx = min\(startx \+ \(COLNO \/ 2\), COLNO\)/u);
    assert.match(body, /if \(stopx - startx == COLNO \/ 2\)\s+startx\+\+/u);
    // These positions exercise C's left clamp, full centered span and right clip.
    for (const [ux, first, stop] of [[1, 2, 41], [40, 21, 60], [79, 59, 80]]) {
        const state = fixture(ux);
        for (let x = 0; x < COLNO; x++) state.cells[0][x].seenv = x;
        const rows = await rowsFor(state);
        assert.equal(rows.length, ROWNO); // Every source row, including empty rows.
        assert.equal(rows[0], Array.from({ length: stop - first }, (_, i) =>
            (first + i).toString(16).padStart(2, '0')).join(''));
        assert.ok(rows[0].length < COLNO, 'C excludes an exact 80-byte line');
        assert.equal(rows.at(-1).includes('@@'), ux >= first && ux < stop,
            'the hero is marked only when included in the source crop');
    }
});
test('wiz_show_seenv preserves masked lowercase hex, spaces and hero override', async () => {
    assert.equal(typeof wizcmds.wiz_show_seenv, 'function');
    assert.match(body, /v = levl\[x\]\[y\]\.seenv & 0xff/u);
    assert.match(body, /Sprintf\(&row\[curx\], "%02x", v\)/u);
    assert.match(body, /row\[curx\] = row\[curx \+ 1\] = '@'/u);
    // ux40 crops columns21..59; leave21 empty to pin leading spaces.
    const state = fixture(40);
    state.cells[0][22].seenv = 0x10a; // Low byte0a requires a leading hex zero.
    state.cells[0][23].seenv = 0xff; // Source byte includes all eight directions.
    state.cells[0][24].seenv = 0x100; // Masking must happen before the zero branch.
    state.cells[0][25].seenv = -1; // C &0xff always yields an unsigned byte.
    state.cells[0][59].seenv = 1; // Last included cell prevents trailing trim.
    state.cells[ROWNO - 1][40].seenv = 0xff; // Hero overrides even a nonzero byte.
    const before = JSON.stringify(state.cells);
    const rows = await rowsFor(state);
    assert.equal(rows[0], '  0aff  ff' + ' '.repeat((59 - 26) * 2) + '01');
    assert.equal(rows[1], ''); // Empty rows are retained, trailing blanks removed.
    assert.equal(rows.at(-1), ' '.repeat((40 - 21) * 2) + '@@');
    assert.equal(JSON.stringify(state.cells), before, 'command only reads canonical cells');
});
test('wiz_show_seenv awaits blocking dismissal before returning ECMD_OK', async () => {
    assert.equal(typeof wizcmds.wiz_show_seenv, 'function');
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let done = false;
    const pending = wizcmds.wiz_show_seenv(fixture(COLNO - 1), {
        window: async () => gate,
    }).then(result => { done = true; return result; });
    await Promise.resolve();
    assert.equal(done, false); // C display_nhwindow(TRUE) waits for input.
    release();
    assert.equal(await pending, ECMD_OK);
});
test('C and JS extended-command dispatch reach wiz_show_seenv', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/cmd.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(c, /"wizseenv", "show map locations' seen vectors",\s+wiz_show_seenv, IFBURIED \| AUTOCOMPLETE \| WIZMODECMD/u);
    assert.match(js, /case 'wiz_show_seenv':\s+return await wiz_show_seenv\(state\);/u);
});
