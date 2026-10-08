import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as wiz from '../js/wizcmds.js';
import { FIRST_OBJECT, NUM_OBJECTS, WEAPON_CLASS, ARMOR_CLASS } from '../js/objects.js';
import { ECMD_OK, BUFSZ } from '../js/const.js';
const source = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('wiz_objprobs(void)'), source.indexOf('/* #migratemons command */'));
function fixture() {
    return { objects: Array.from({ length: NUM_OBJECTS }, () => ({ oc_class: WEAPON_CLASS, oc_prob: 0, oc_name_idx: 0 })), obj_descr: [{ oc_name: null }] }; // Null descriptors model source placeholders without emitting rows.
}
function add(state, offset, probability, name, oclass = WEAPON_CLASS) {
    state.obj_descr.push({ oc_name: name });
    state.objects[FIRST_OBJECT + offset] = { oc_class: oclass, oc_prob: probability, oc_name_idx: state.obj_descr.length - 1 };
}
async function rowsFor(state) {
    let rows;
    assert.equal(await wiz.wiz_objprobs(state, { window: async (s, lines) => { assert.equal(s, state); rows = lines.map(r => r.text); } }), ECMD_OK);
    return rows;
}
test('source probability sums include placeholders before row filtering and preserve class changes', async () => {
    assert.equal(typeof wiz.wiz_objprobs, 'function');
    assert.match(body, /probsum\[\(int\) objects\[otyp\]\.oc_class\] \+= objects\[otyp\]\.oc_prob/u);
    const state = fixture();
    add(state, 0, 1, 'blade'); add(state, 1, 31, null); // Placeholder supplies denominator32 but emits no row.
    add(state, 2, 3, 'mail', ARMOR_CLASS); add(state, 3, 29, null, ARMOR_CLASS); // Second class also sums32; class change emits one blank.
    add(state, 4, 0, '', ARMOR_CLASS); // A nonnull empty source name remains a displayed row.
    const before = JSON.stringify(state), rows = await rowsFor(state);
    assert.deepEqual(rows, ['   1 /   32 (  3.12%): blade', '', '   3 /   32 (  9.38%): mail', '   0 /   32 (  0.00%): ']);
    assert.equal(JSON.stringify(state), before, 'C diagnostic only reads the live canonical tables');
});
test('C float32 percentage arithmetic and printf midpoint rounding are preserved', () => {
    assert.equal(typeof wiz.wiz_objprobs_percentage, 'function');
    assert.match(body, /\(float\) objects\[otyp\]\.oc_prob \* 100\.f \/\s+\(float\) probsum\[oclass\]/u);
    // These values were pinned by compiling the exact source float expression and %6.2f printf.
    for (const [p, sum, text] of [[1, 32, '  3.12'], [3, 32, '  9.38'], [31, 1002, '  3.09'], [999, 1000, ' 99.90'], [1, 3, ' 33.33'], [0, 0, '  -nan']])
        assert.equal(wiz.wiz_objprobs_percentage(p, sum), text); // First two pin ties-to-even in opposite directions; 1002 pins source live sums.
});
test('first displayed class uses FIRST_OBJECT class even when that object is unnamed', async () => {
    assert.equal(typeof wiz.wiz_objprobs, 'function');
    const state = fixture(); add(state, 1, 1, 'armor', ARMOR_CLASS); // First physical slot is unnamed weapon; next named row changes class.
    assert.equal((await rowsFor(state))[0], '');
    add(state, 2, 0, 'a'.repeat(BUFSZ), ARMOR_CLASS); // Source snprintf must leave one byte for its terminating NUL.
    const rows = await rowsFor(state);
    assert.equal(rows.at(-1).length, BUFSZ - 1);
});
test('object probabilities await paging and return through the canonical dispatcher', async () => {
    assert.equal(typeof wiz.wiz_objprobs, 'function');
    let release; const gate = new Promise(resolve => { release = resolve; }); let done = false;
    const pending = wiz.wiz_objprobs(fixture(), { window: async () => gate }).then(v => { done = true; return v; });
    await Promise.resolve(); assert.equal(done, false); // TTY text window pages despite C's FALSE display argument.
    release(); assert.equal(await pending, ECMD_OK);
    const c = readFileSync(new URL('../nethack-c/upstream/src/cmd.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(c, /"wizobjprobs", "list object generation probabilities",\s+wiz_objprobs/u);
    assert.match(js, /case 'wiz_objprobs':\s+return await wiz_objprobs\(state\);/u);
});
