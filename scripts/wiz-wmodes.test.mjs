import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as wiz from '../js/wizcmds.js';
import { COLNO, ROWNO, ECMD_OK, VWALL, DBWALL, SDOOR, SCORR, CORR, ROOM, DOOR, FOUNTAIN, POOL, STONE, WM_MASK, W_NONDIGGABLE } from '../js/const.js';
const source = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('wiz_show_wmodes(void)'), source.indexOf('/* wizard mode variant of #terrain'));
function fixture() {
    const cells = Array.from({ length: ROWNO }, () => Array.from({ length: COLNO }, () => ({ typ: STONE, wall_info: 0 })));
    return { u: { ux: COLNO - 1, uy: ROWNO - 1 }, level: { at: (x, y) => cells[y][x] }, cells }; // Hero at far edge tests final included cell.
}
async function rowsFor(state) {
    let rows;
    assert.equal(await wiz.wiz_show_wmodes(state, { window: async (s, lines) => { assert.equal(s, state); rows = lines.map(r => r.text); } }), ECMD_OK);
    return rows;
}
test('wall modes preserve source terrain precedence, all wall types and low-bit mask', async () => {
    assert.equal(typeof wiz.wiz_show_wmodes, 'function');
    assert.match(body, /IS_WALL\(lev->typ\) \|\| lev->typ == SDOOR/u);
    assert.match(body, /lev->wall_info & WM_MASK/u);
    const state = fixture();
    // All source wall types occupy the first visible row; unrelated wall flags must be masked.
    for (let typ = VWALL; typ <= DBWALL; typ++) state.cells[0][typ] = { typ, wall_info: typ | W_NONDIGGABLE };
    const expectedWalls = Array.from({ length: DBWALL }, (_, i) => String((i + VWALL) & WM_MASK)).join('');
    const kinds = [[SDOOR, '5'], [SCORR, 'x'], [CORR, '#'], [ROOM, '.'], [DOOR, '.'], [FOUNTAIN, '.'], [POOL, 'x'], [STONE, 'x']]; // Secret door uses mode5; furniture uses IS_ROOM; concealed corridor remains x.
    kinds.forEach(([typ], i) => { state.cells[0][DBWALL + i + 1] = { typ, wall_info: 5 | W_NONDIGGABLE }; });
    const before = JSON.stringify(state.cells), rows = await rowsFor(state);
    assert.equal(rows[1].slice(0, DBWALL + kinds.length), expectedWalls + kinds.map(k => k[1]).join(''));
    state.cells.at(-1)[COLNO - 1] = { typ: VWALL, wall_info: 7 }; // Hero must override a nonzero wall mode.
    assert.equal((await rowsFor(state)).at(-1).at(-1), '@');
    assert.equal(JSON.stringify(state.cells.slice(0, -1)), JSON.stringify(JSON.parse(before).slice(0, -1)), 'diagnostic does not mutate map cells');
});
test('TTY blank line, column zero exclusion and fixed width match the source window', async () => {
    assert.equal(typeof wiz.wiz_show_wmodes, 'function');
    assert.match(body, /if \(istty\)\s+putstr\(win, 0, ""\)/u);
    assert.match(body, /putstr\(win, 0, &row\[1\]\)/u);
    const state = fixture(); state.cells[0][0] = { typ: ROOM }; // Off-screen column zero must disappear.
    const rows = await rowsFor(state);
    assert.equal(rows[0], ''); // This port and recorder expose only the TTY interface.
    assert.equal(rows.length, ROWNO + 1);
    assert.ok(rows.slice(1).every(r => r.length === COLNO - 1), 'retain all 79 visible columns without trimming');
    assert.equal(rows[1], 'x'.repeat(COLNO - 1));
    // options.c's canonical interface is fixed to tty; alternative window ports are inactive.
    const options = readFileSync(new URL('../js/options.js', import.meta.url), 'utf8');
    assert.match(options, /const ACTIVE_WINDOWPROCS_NAME = 'tty'/u);
});
test('wall-mode command waits for dismissal and has its canonical dispatcher', async () => {
    assert.equal(typeof wiz.wiz_show_wmodes, 'function');
    let release; const gate = new Promise(resolve => { release = resolve; }); let done = false;
    const pending = wiz.wiz_show_wmodes(fixture(), { window: async () => gate }).then(v => { done = true; return v; });
    await Promise.resolve(); assert.equal(done, false); // C blocking NHW_TEXT display.
    release(); assert.equal(await pending, ECMD_OK);
    const c = readFileSync(new URL('../nethack-c/upstream/src/cmd.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(c, /"wmode", "show wall modes",\s+wiz_show_wmodes, IFBURIED \| AUTOCOMPLETE \| WIZMODECMD/u);
    assert.match(js, /case 'wiz_show_wmodes':\s+return await wiz_show_wmodes\(state\);/u);
});
