import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as wiz from '../js/wizcmds.js';
import { MONSTER_TEMPLATES, PM_CLERIC, PM_WIZARD, PM_DEMOGORGON, PM_NEWT } from '../js/monsters.js';
import { ECMD_OK, NEUTRAL, BUFSZ } from '../js/const.js';
const source = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('wiz_mon_diff(void)'), source.indexOf('/* the #wizobjprobs command */'));
const copy = index => structuredClone(MONSTER_TEMPLATES[index]);
async function rowsFor(mons) {
    let rows; const state = { mons }; const before = JSON.stringify(state);
    assert.equal(await wiz.wiz_mon_diff(state, { window: async (s, lines) => { assert.equal(s, state); rows = lines.map(r => r.text); } }), ECMD_OK);
    assert.equal(JSON.stringify(state), before, 'source diagnostic only reads the canonical monster table');
    return rows;
}
test('wizard difficulty report uses neutral names, source table order and signed discrepancies', async () => {
    assert.equal(typeof wiz.wiz_mon_diff, 'function');
    // monsters.h cleric/wizard have level10 and hardcoded12; mondata.c derives13.
    assert.deepEqual(await rowsFor([copy(PM_CLERIC), copy(PM_WIZARD), { mlet: 0 }]), [
        'Review of monster difficulty ratings [index:level]:',
        'cleric             [  0:10]: calculated: 13, hardcoded: 12 (-1)',
        'wizard             [  1:10]: calculated: 13, hardcoded: 12 (-1)',
    ]);
    assert.match(body, /ptr->pmnames\[NEUTRAL\], cnt, mlev/u);
});
test('displayed named-demon level caps at50 and positive discrepancies retain plus sign', async () => {
    assert.equal(typeof wiz.wiz_mon_diff, 'function');
    const demon = copy(PM_DEMOGORGON); demon.difficulty++; // Source level106 derives57; a one-point changed hardcoded field reaches otherwise dormant cap/sign arms.
    assert.deepEqual((await rowsFor([demon, { mlet: 0 }])).slice(1), [
        'Demogorgon         [  0:50]: calculated: 57, hardcoded: 58 (+1)',
    ]);
    assert.match(body, /if \(mlev > 50\)[\s\S]*?mlev = 50/u);
    assert.match(body, /\(%\+d\)/u);
});
test('mlet-zero sentinel stops traversal and a matching table emits the C no-discrepancy row', async () => {
    assert.equal(typeof wiz.wiz_mon_diff, 'function');
    // newt's source hardcoded/calculated values both1; cleric after the terminator must never be read.
    assert.deepEqual(await rowsFor([copy(PM_NEWT), { mlet: 0 }, copy(PM_CLERIC)]),
        ['No monster difficulty discrepancies were detected.']);
    const long = copy(PM_NEWT); long.difficulty++; long.pmnames[NEUTRAL] = 'a'.repeat(BUFSZ); // Source snprintf has byte capacity BUFSZ with one NUL byte.
    assert.equal((await rowsFor([long, { mlet: 0 }])).at(-1).length, BUFSZ - 1);
    assert.match(body, /for \(ptr = &mons\[0\]; ptr->mlet; ptr\+\+, cnt\+\+\)/u);
});
test('wizard difficulty command awaits dismissal through its canonical dispatcher', async () => {
    assert.equal(typeof wiz.wiz_mon_diff, 'function');
    let release; const gate = new Promise(resolve => { release = resolve; }); let returned = false;
    const pending = wiz.wiz_mon_diff({ mons: [{ mlet: 0 }] }, { window: async () => gate }).then(v => { returned = true; return v; });
    await Promise.resolve(); assert.equal(returned, false); // C display(FALSE) text windows still await acknowledgement.
    release(); assert.equal(await pending, ECMD_OK);
    const registry = readFileSync(new URL('../nethack-c/upstream/src/cmd.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(registry, /"wizmondiff", "validate the difficulty ratings of monsters",\s+wiz_mon_diff/u);
    assert.match(js, /case 'wiz_mon_diff':\s+return await wiz_mon_diff\(state\);/u);
});
