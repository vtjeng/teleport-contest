import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ECMD_OK, G_EXTINCT, G_GENOD, G_GONE, NEUTRAL } from '../js/const.js';
import { G_NOCORPSE, monst_globals_init, NUMMONS, PM_KITTEN, PM_LICHEN, PM_NEWT, PM_PONY } from '../js/monsters.js';
import * as insight from '../js/insight.js';

const source = readFileSync(new URL('../nethack-c/upstream/src/insight.c', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('doborn(void)'), source.indexOf('RESTORE_WARNING_FORMAT_NONLITERAL', source.indexOf('doborn(void)')));
function fixture() {
    const state = { svm: { mvitals: Array.from({ length: NUMMONS }, () => ({ born: 0, died: 0, mvflags: 0 })) } };
    monst_globals_init(state);
    return state;
}
async function rowsFor(state) {
    assert.equal(typeof insight.doborn, 'function');
    let rows;
    assert.equal(await insight.doborn(state, { displayTextWindow: async (subject, lines) => {
        assert.equal(subject, state);
        rows = lines.map(line => line.text);
    } }), ECMD_OK); // C diagnostic never uses a turn.
    return rows;
}
test('doborn pins C declaration order, exact flags, neutral names and field widths', async () => {
    assert.match(body, /for \(i = LOW_PM; i < NUMMONS; i\+\+\)/u);
    assert.match(body, /"%4i %4i %c %-30s"/u);
    assert.match(body, /mons\[i\]\.pmnames\[NEUTRAL\]/u);
    const state = fixture();
    // Source catalog indexes are ordered kitten, pony, lichen, newt.
    const species = [PM_PONY, PM_KITTEN, PM_LICHEN, PM_NEWT].sort((a, b) => a - b);
    const flags = [0, G_EXTINCT, G_GENOD, G_GONE]; // Blank, E, G and both-flags X.
    for (let i = 0; i < species.length; i++) {
        // hack.h mvitals.died is uchar: its maximum pins %4i's count padding.
        state.svm.mvitals[species[i]] = { born: i + 1, died: i === 0 ? 255 : i + 2, mvflags: flags[i] | G_NOCORPSE };
        state.mons[species[i]].pmnames[NEUTRAL] = i === 0 ? 'neutral name beyond thirty characters' : `neutral ${i}`;
    }
    const before = JSON.stringify(state);
    const rows = await rowsFor(state);
    assert.deepEqual(rows, [
        'died born',
        ' 255    1   neutral name beyond thirty characters',
        '   3    2 E neutral 1                     ',
        '   4    3 G neutral 2                     ',
        '   5    4 X neutral 3                     ',
        '', // C emits this blank line, then formats totals without putstr.
    ]);
    assert.equal(JSON.stringify(state), before, 'diagnostic preserves all monster state');
});
test('doborn includes flag-only and death-only rows but excludes empty and sentinel entries', async () => {
    const state = fixture();
    state.svm.mvitals[PM_LICHEN].mvflags = G_EXTINCT; // Zero-count extinct species must be reported.
    state.svm.mvitals[PM_NEWT].died = 7; // Deaths alone pass the source inclusion test.
    state.svm.mvitals[PM_PONY].mvflags = G_NOCORPSE; // Other flags alone do not pass G_GONE.
    state.svm.mvitals[NUMMONS] = { born: 9, died: 9, mvflags: G_GONE }; // C stops before the sentinel.
    const rows = await rowsFor(state);
    assert.deepEqual(rows, ['died born',
        '   0    0 E ' + state.mons[PM_LICHEN].pmnames[NEUTRAL].padEnd(30),
        '   7    0   ' + state.mons[PM_NEWT].pmnames[NEUTRAL].padEnd(30), '']);
    assert.deepEqual(await rowsFor(fixture()), ['died born', '']);
    assert.match(body, /putstr\(datawin, 0, ""\);\s+Sprintf\(buf, fmt, ndied, nborn, ' ', ""\);\s+display_nhwindow\(datawin, FALSE\);/u);
});
test('doborn stays pending until the text-window owner completes dismissal', async () => {
    assert.equal(typeof insight.doborn, 'function');
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let settled = false;
    const pending = insight.doborn(fixture(), { displayTextWindow: () => gate })
        .then(result => { settled = true; return result; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false); // tty NHW_TEXT blocks even with display_nhwindow(FALSE).
    release();
    assert.equal(await pending, ECMD_OK);
});
test('the production wizard-only extcmd row dispatches the awaited canonical doborn owner', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/cmd.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(c, /"wizborn",[^\n]*\n\s+doborn, IFBURIED \| WIZMODECMD/u);
    assert.match(js, /case 'doborn':\s+return await doborn\(state\);/u);
});
