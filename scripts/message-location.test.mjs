// Enforces the rule scripts/message-location.mjs describes: a JS message
// carries an accessiblemsg location exactly where C's pline variant records
// one. The first test scans the repository; the others pin what the scan
// finds on small hand-written sources.

import assert from 'node:assert/strict';
import test from 'node:test';

import { tokenizePreprocessed } from './c-message-coverage.mjs';
import {
    counts,
    extractCSites,
    pairSites,
    scan,
    substituteArguments,
} from './message-location.mjs';
import { findCompiler } from './recorder-headers.mjs';

test('every paired JS message makes its C site\'s location choice', async (t) => {
    if (!findCompiler()) {
        t.skip('no C compiler (clang, cc, or gcc) on PATH; the scan needs the C preprocessor');
        return;
    }
    const { results, findings } = await scan();
    const tally = counts(results);
    console.log(JSON.stringify(tally));
    assert.deepEqual(findings.map((f) => `${f.site.file}:${f.site.line} ${f.reason}`), []);
    // 4276 C sites paired when the scan was written. A large drop means the
    // pairing broke, for instance after a rename, and the scan would pass
    // without checking those sites; 4000 leaves room for ordinary edits.
    assert.ok(tally.paired >= 4000, `only ${tally.paired} C sites paired`);
});

// Hand-written preprocessor output for src/x.c. The line marker numbers the
// line after it 1, so each call's line is its position in this list.
const C_SOURCE = [
    '# 1 "src/x.c"',
    'void f(struct monst *m, int c) {', // 1
    '    pline_mon(m, "%s waves.", Monnam(m));', // 2: pline_mon() locates
    '    pline_mon(&gy.youmonst, "You wave back.");', // 3: the hero's (0, 0) does not
    '    set_msg_xy(m->mx, m->my);', // 4
    '    if (c) return;', // 5: a conditional return keeps the location pending
    '    if (c > 1) You("see %s.", x);', // 6: first call after set_msg_xy()
    '    else pline("%s hides.", y);', // 7: the other branch of the same if
    '    pline("The air stirs.");', // 8: a later statement; consumed already
    '    set_msg_xy(m->mx, m->my);', // 9
    '    set_msg_xy(0, 0);', // 10: cancels the location
    '    pline("Nothing happens.");', // 11: plain
    '    set_msg_xy(m->mx, m->my);', // 12
    '    { foo(); } break;', // 13: an unconditional jump ends the path
    '    pline("Far away.");', // 14: plain
    '    pline_xy(1, 2, "A door %s.", c ? "opens" : "closes");', // 15: pline_xy() locates
    '}',
].join('\n');

test('extractCSites marks the calls that record a location', () => {
    const sites = extractCSites(tokenizePreprocessed(C_SOURCE), 'src/x.c');
    assert.deepEqual(sites.map((s) => [s.line, s.callee, s.located]), [
        [2, 'pline_mon', true],
        [3, 'pline_mon', false],
        [6, 'You', true],
        [7, 'pline', true],
        [8, 'pline', false],
        [11, 'pline', false],
        [14, 'pline', false],
        [15, 'pline_xy', true],
    ]);
    // pline_xy()'s format is its third argument; its literal arguments give
    // one text for each branch of the conditional, after the format itself.
    assert.deepEqual(sites.at(-1).texts, ['A door %s.', 'A door opens.', 'A door closes.']);
});

test('substituteArguments fills %s from literal arguments and skips * widths', () => {
    // %*d consumes two arguments (width, value), so the %s after it reads
    // the third; a null argument is not a literal and keeps its %s.
    assert.deepEqual(substituteArguments('%*d %s %s', [null, null, ['big', 'small'], null]),
        ['%*d %s %s', '%*d big %s', '%*d small %s']);
    // %% is a literal percent sign and consumes no argument.
    assert.deepEqual(substituteArguments('100%% %s', [['done']]), ['100%% %s', '100%% done']);
});

// One C function, f(), whose four sites cover both choices: pline_mon()
// locates, plain pline() and You() do not.
const PAIR_C = [
    '# 1 "src/x.c"',
    'void f(struct monst *m) {',
    '    pline_mon(m, "%s gulps some air!", Monnam(m));',
    '    pline("%s briefly seems to be transparent.", Monnam(m));',
    '    You_feel("aggravated at %s.", mon_nam(m));',
    '    pline_mon(m, "%s recoils from the light!", Monnam(m));',
    '}',
].join('\n');

function findingsFor(jsSource) {
    const cSites = extractCSites(tokenizePreprocessed(PAIR_C), 'src/x.c');
    const pline = [
        'export function youFeel(line, state) { return `You feel ${line}`; }',
        'export function pline_mon(mon, line) { return message(messageAt(line, mon.mx, mon.my)); }',
    ].join('\n');
    const { results, findings } = pairSites(cSites, [
        { file: 'pline.js', source: pline },
        { file: 'x.js', source: jsSource },
    ]);
    assert.deepEqual(results.map((r) => r.status), ['paired', 'paired', 'paired', 'paired']);
    return findings.map((f) => `${f.site.line} ${f.reason}`);
}

test('pairSites accepts each way the port gives or withholds a location', () => {
    assert.deepEqual(findingsFor([
        "import { youFeel } from './pline.js';",
        'async function say(text, mon) { await message(messageAt(text, mon.mx, mon.my)); }',
        'export async function f(m, state) {',
        // A local variable passed to messageAt().
        '    const line = `${Monnam(m)} gulps some air!`;',
        '    await message(messageAt(line, m.mx, m.my, state));',
        // A plain message.
        '    await message(`${Monnam(m)} briefly seems to be transparent.`);',
        // youFeel() returns its argument; this caller prints it plain.
        '    await message(youFeel(`aggravated at ${mon_nam(m)}.`, state));',
        // A local helper that passes its parameter to messageAt().
        '    await say(`${Monnam(m)} recoils from the light!`, m);',
        '}',
    ].join('\n')), []);
});

test('pairSites reports a site that bypasses C\'s choice either way', () => {
    assert.deepEqual(findingsFor([
        "import { pline_mon, youFeel } from './pline.js';",
        'export async function f(m, state) {',
        // Plain where C's pline_mon() locates (line 2).
        '    await message(`${Monnam(m)} gulps some air!`);',
        // pline_mon() where C's pline() does not locate (line 3).
        '    await pline_mon(m, `${Monnam(m)} briefly seems to be transparent.`);',
        // A located youFeel() where C's You_feel() does not locate (line 4).
        '    await message(messageAt(youFeel(`aggravated at ${mon_nam(m)}.`, state), m.mx, m.my));',
        '    await pline_mon(m, `${Monnam(m)} recoils from the light!`);',
        '}',
    ].join('\n')), [
        '2 C records a location; JS does not',
        '3 JS records a location; C does not',
        '4 JS records a location; C does not',
    ]);
});
