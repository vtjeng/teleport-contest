import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COLNO, ROWNO, COULD_SEE, IN_SIGHT, TEMP_LIT, ECMD_OK } from '../js/const.js';
import * as wizcmds from '../js/wizcmds.js';
const C = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
const start = C.indexOf('wiz_show_vision(void)');
const body = C.slice(start, C.indexOf('/* #wmode command */', start));
function fixture() {
    return { u: { ux: COLNO - 1, uy: ROWNO - 1 },
        viz_array: Array.from({ length: ROWNO }, () => new Uint8Array(COLNO)) };
}
test('wiz_show_vision preserves C header, dimensions, hero and bit rows', async () => {
    assert.equal(typeof wizcmds.wiz_show_vision, 'function');
    assert.match(body, /for \(y = 0; y < ROWNO; y\+\+\)/u);
    assert.match(body, /for \(x = 1; x < COLNO; x\+\+\)/u);
    assert.match(body, /row\[x\] = \(v == 0\) \? ' ' : \('0' \+ v\)/u);
    assert.match(body, /putstr\(win, 0, &row\[1\]\)/u);
    const state = fixture();
    // Column zero is deliberately excluded by C, even when it has sight bits.
    state.viz_array[0][0] = IN_SIGHT;
    // First displayed column exercises leading spaces; bits retain their sum.
    state.viz_array[0][2] = COULD_SEE;
    state.viz_array[0][3] = COULD_SEE | IN_SIGHT | TEMP_LIT;
    state.viz_array[0][COLNO - 1] = TEMP_LIT;
    // Hero marker overrides zero at the last permitted row and column.
    const before = JSON.stringify(state);
    let lines;
    assert.equal(await wizcmds.wiz_show_vision(state, { window: async (s, rows) => {
        assert.equal(s, state); lines = rows.map(row => row.text);
    } }), ECMD_OK); // C always returns without a turn.
    assert.equal(lines.length, ROWNO + 2); // Header + blank + every source row.
    assert.equal(lines[0], 'Flags: 0x1 could see, 0x2 in sight, 0x4 temp lit');
    assert.equal(lines[1], '');
    assert.equal(lines[2], ' 17' + ' '.repeat(COLNO - 5) + '4');
    assert.equal(lines[3], ''); // A zero row trims to empty, but is retained.
    assert.equal(lines.at(-1), ' '.repeat(COLNO - 2) + '@');
    assert.equal(JSON.stringify(state), before, 'source command only reads game values');
});
test('wiz_show_vision awaits the blocking text window before ECMD_OK', async () => {
    assert.equal(typeof wizcmds.wiz_show_vision, 'function');
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    let complete = false;
    const pending = wizcmds.wiz_show_vision(fixture(), { window: async () => blocked })
        .then(result => { complete = true; return result; });
    await Promise.resolve();
    assert.equal(complete, false, 'C display_nhwindow(TRUE) waits for dismissal');
    release();
    assert.equal(await pending, ECMD_OK);
});
test('C vision dispatch and constants stay aligned with the source', () => {
    const cmd = readFileSync(new URL('../nethack-c/upstream/src/cmd.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(cmd, /"vision", "show vision array",\s+wiz_show_vision, IFBURIED \| AUTOCOMPLETE \| WIZMODECMD/u);
    assert.match(js, /case 'wiz_show_vision':\s+return await wiz_show_vision\(state\);/u);
    const header = readFileSync(new URL('../nethack-c/upstream/include/vision.h', import.meta.url), 'utf8');
    for (const [name, value] of [['COULD_SEE', COULD_SEE], ['IN_SIGHT', IN_SIGHT], ['TEMP_LIT', TEMP_LIT]]) {
        assert.ok(header.includes('#define ' + name + ' 0x' + value.toString(16)));
    }
});
