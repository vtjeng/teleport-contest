// Enforces js/youprop.js as the only reader of the routed hero property
// slots. The first tests pin the repository; the rest pin what the scan
// finds in sources written for the test.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALLOWED_READS,
    ROUTED_PROPERTIES,
    findings,
    routedNames,
    staleEntries,
    unlistedFindings,
} from './youprop-reads.mjs';

const NAMES = routedNames();
const lines = (source) => findings(source, 'js/x.js', NAMES).map(({ line, kind }) => `${line} ${kind}`);

test('js/ reads routed hero properties only through youprop.js', () => {
    assert.deepEqual(unlistedFindings().map(({ file, line, kind }) => `${file}:${line}: ${kind}`), []);
});

test('every allow-list entry still matches a finding', () => {
    assert.deepEqual(staleEntries(), []);
});

test('every allow-list entry names the C code it mirrors', () => {
    for (const entry of ALLOWED_READS) assert.match(entry.reason, /\.c\b/u, entry.text);
});

test('the routed names follow the routed slots', () => {
    // Blind reads only BLINDED, which is routed; Deaf only DEAF; Hallucination
    // reaches HALLUC and HALLUC_RES through other routed macros.
    for (const name of ['Blind', 'HBlinded', 'Deaf', 'Hallucination', 'Invisible', 'Unaware'])
        assert.ok(NAMES.has(name), name);
    // FAST and LEVITATION are not routed yet, so their macros are not listed.
    assert.equal(ROUTED_PROPERTIES.includes('FAST'), false);
    for (const name of ['Fast', 'HFast', 'Levitation', 'Lev_at_will'])
        assert.equal(NAMES.has(name), false, name);
});

test('the scan finds each way of reading a routed slot', () => {
    assert.deepEqual(lines([
        'const b = state.u.uprops[BLINDED].intrinsic;', // 1: field read
        'if (u?.uprops?.[DEAF]?.extrinsic) x();', // 2: optional chain
        'const p = hero.uprops[INVIS];', // 3: slot held in a variable
        'function propertyActive(state, i) { return Boolean(state.u.uprops[i]?.intrinsic); }', // 4
        'if (propertyActive(state, HALLUC)) y();', // 5: through a computed reader
        'const all = state.u.uprops;', // 6: the array held in a variable
        'if (all[SEE_INVIS]?.intrinsic) z();', // 7: through that variable
        'function Blind(state) { return false; }', // 8: a private copy
        'const Deaf = Boolean(q);', // 9: a constant that shadows the import
        'const n = (state.u.uprops[BLINDED].intrinsic & TIMEOUT) + 1;', // 10: read inside arithmetic
        'state.u.uprops[HALLUC].intrinsic = (state.u.uprops[HALLUC].intrinsic & ~TIMEOUT) | 3;', // 11: RHS read
    ].join('\n')), [
        '1 reads BLINDED', '2 reads DEAF', '3 reads INVIS', '10 reads BLINDED',
        '11 reads HALLUC', '7 reads SEE_INVIS through all', '5 reads HALLUC through propertyActive()',
        '8 copy of Blind', '9 shadows Deaf',
    ]);
});

test('the scan ignores writes, unrouted slots, comments and keys', () => {
    assert.deepEqual(lines([
        'state.u.uprops[BLINDED].intrinsic |= FROMOUTSIDE;', // field write
        'u.uprops[DEAF].extrinsic &= ~W_ARMH;',
        'u.uprops[INVIS].blocked = 0;',
        'state.u.uprops[HALLUC] = { intrinsic: 0, extrinsic: 0, blocked: 0 };', // slot write
        'incr_itimeout(state.u.uprops[BLINDED], 5);', // C's &HBlinded
        'set_itimeout(u.uprops[DEAF], 0);',
        'const fast = state.u.uprops[FAST].intrinsic;', // FAST is not routed
        'function propertyActive(state, i) { return Boolean(state.u.uprops[i]?.intrinsic); }',
        'if (propertyActive(state, FAST)) y();', // computed reader, unrouted slot
        '// state.u.uprops[BLINDED].intrinsic in a comment',
        "const s = 'u.uprops[DEAF]';",
        'const copy = { ...u, uprops: u.uprops.map((p) => ({ ...p })) };',
        'const blind = Blind(state.u);', // the shared macro
    ].join('\n')), []);
});

test('the scan follows a function that hands a computed index on', () => {
    assert.deepEqual(lines([
        'const prop = (index) => u.uprops?.[index] ?? {};', // 1: a computed reader
        'const H = (index) => Number(prop(index).intrinsic ?? 0);', // 2: wraps it
        'const timed = (p) => { const v = H(p); return v & TIMEOUT; };', // 3: wraps the wrapper
        'if (H(BLINDED)) a();', // 4
        'if (timed(DEAF)) b();', // 5
        'function form(u, index) { prop(index).intrinsic |= FROMFORM; }', // 6: writes, reads nothing
        'form(u, INVIS);', // 7: so this is a write
        'if (H(FAST)) c();', // 8: FAST is not routed
    ].join('\n')), ['4 reads BLINDED through H()', '5 reads DEAF through timed()']);
});
