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
    stringConstants,
    structConstants,
    substituteArguments,
} from './message-location.mjs';
import { requireCompiler } from './recorder-headers.mjs';

// Statuses counted as unpaired; 'not gameplay' (debug traces) is excluded on
// purpose. 297 = 167 no JS text + 71 too little text + 30 format not a
// literal + 29 no JS function, after report.c dobugreport() was ported
// (9 November 2026).
const UNPAIRED_STATUSES = ['no JS text', 'too little text', 'format not a literal', 'no JS function'];
const UNPAIRED_CEILING = 293;

test('every paired JS message makes its C site\'s location choice', async () => {
    requireCompiler('the scan needs the C preprocessor');
    const { results, findings } = await scan();
    const tally = counts(results);
    console.log(JSON.stringify(tally));
    assert.deepEqual(findings.map((f) => `${f.site.file}:${f.site.line} ${f.reason}`), []);
    // 4534 C sites paired by text and 121 by form when the scan was last
    // extended. A large drop means the pairing broke, for instance after a
    // rename, and the scan would pass without checking those sites; 4300
    // and 100 leave room for ordinary edits.
    assert.ok(tally.paired >= 4300, `only ${tally.paired} C sites paired by text`);
    assert.ok(tally['paired by form'] >= 100, `only ${tally['paired by form']} C sites paired by form`);
    // The C message sites the scan cannot pair are its blind spot: a JS site
    // there can choose the wrong pline variant unnoticed. The count may only
    // fall. A port that adds an unpairable site must pair it instead (give the
    // JS the C function's name or a `file.c function()` comment, and keep the
    // C text literal); a change that pairs more sites must lower the ceiling
    // to the new count in the same commit.
    const unpaired = UNPAIRED_STATUSES.reduce((n, s) => n + (tally[s] ?? 0), 0);
    assert.ok(unpaired <= UNPAIRED_CEILING,
        `${unpaired} C message sites are unpaired, above the ceiling of ${UNPAIRED_CEILING}; pair the new ones`);
    assert.ok(unpaired >= UNPAIRED_CEILING,
        `${unpaired} C message sites are unpaired; lower UNPAIRED_CEILING in this file from ${UNPAIRED_CEILING} to ${unpaired}`);
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

// Hand-written preprocessor output for src/y.c, whose message calls take
// their text from constants and local variables. Sprintf() and pline1()
// appear as the preprocessor expands them.
const CONSTANT_C = [
    '# 1 "src/y.c"',
    'struct strs { const char *const s_one, *const s_two[2], *const s_three; };', // 1
    'static const char *const A_gush = "A gush of water hits";', // 2
    'void g(struct monst *m, int c) {', // 3
    '    static const char use_it[] = "Use the command #%s to %s.";', // 4
    '    const char *fmt;', // 5
    '    char buf[256];', // 6
    '    pline("%s %s!", A_gush, mon_nam(m));', // 7: a file constant as %s
    '    pline(use_it, "pray", "live");', // 8: a function's constant as the format
    '    if (c) fmt = "%s waves."; else fmt = "%s hides.";', // 9
    '    pline_mon(m, fmt, Monnam(m));', // 10: each text assigned to fmt
    '    ( void ) sprintf ( buf, "%s is %s.", Monnam(m), "sad" );', // 11
    '    pline("%s", buf);', // 12: the format sprintf() wrote to buf
    '    pline("%s", c_common.s_three);', // 13: a const struct's member
    '}',
    'const struct strs c_common = { "Nothing happens.", { "a", "b" }, "Never mind." };',
].join('\n');

test('extractCSites reads text from constants and local variables', () => {
    const tokens = tokenizePreprocessed(CONSTANT_C);
    // The struct's members are named in declaration order; the nested
    // initializer of s_two is not text.
    const shared = structConstants(tokens);
    assert.deepEqual([...shared], [
        ['c_common.s_one', 'Nothing happens.'],
        ['c_common.s_three', 'Never mind.'],
    ]);
    const declared = stringConstants(tokens);
    assert.deepEqual([...declared.file], [['A_gush', 'A gush of water hits']]);
    // A static constant is not visible to other files.
    assert.deepEqual([...declared.shared], []);
    assert.deepEqual([...declared.local.values()].map((m) => [...m]),
        [[['use_it', 'Use the command #%s to %s.']]]);
    const sites = extractCSites(tokens, 'src/y.c', shared);
    assert.deepEqual(sites.map((s) => [s.line, s.formats, s.texts]), [
        [7, ['%s %s!'], ['%s %s!', 'A gush of water hits %s!']],
        [8, ['Use the command #%s to %s.'],
            ['Use the command #%s to %s.', 'Use the command #pray to live.']],
        [10, ['%s waves.', '%s hides.'], ['%s waves.', '%s hides.']],
        // sprintf()'s conversions stay conversions inside buf's text.
        [12, ['%s'], ['%s', '%s is %s.', '%s is sad.']],
        [13, ['%s'], ['%s', 'Never mind.']],
    ]);
});

// thrwmu()'s polearm message: a located format with too few letters to
// match by text, beside a plain one that a constant fills in.
const SHORT_C = [
    '# 1 "src/x.c"',
    'static const char *const A_gush = "A gush of water hits";',
    'void f(struct monst *m) {',
    '    pline_mon(m, "%s %s %s.", Monnam(m), verb, an(onm));', // 3: located
    '    pline("%s %s!", A_gush, mon_nam(m));', // 4: plain
    '}',
].join('\n');

function shortFindings(jsSource, extraFiles = []) {
    const cSites = extractCSites(tokenizePreprocessed(SHORT_C), 'src/x.c');
    const { results, findings } = pairSites(cSites, [
        { file: 'pline.js', source: 'export function pline_mon(mon, line) { return message(messageAt(line, mon.mx, mon.my)); }' },
        ...extraFiles,
        { file: 'x.js', source: jsSource },
    ]);
    return { statuses: results.map((r) => r.status), findings: findings.map((f) => `${f.site.line} ${f.reason}`) };
}

test('a short format pairs by form, and a constant fills in a %s', () => {
    const good = shortFindings([
        "import { pline_mon } from './pline.js';",
        "import { gush } from './const.js';",
        'export async function f(m, verb, name) {',
        // A format passed on to another function, which only the short
        // format's form matches; it prints nothing here, so it may be plain.
        "    await mon_reflects(m, 'Your gaze is reflected by %s %s.');",
        '    await pline_mon(m, `${Monnam(m)} ${verb} ${an(name)}.`);',
        // An imported constant inside a template literal.
        '    await message(`${gush} ${mon_nam(m)}!`);',
        '}',
    ].join('\n'), [{ file: 'const.js', source: "export const gush = 'A gush of water hits';" }]);
    assert.deepEqual(good, { statuses: ['paired by form', 'paired'], findings: [] });

    const bad = shortFindings([
        "import { gush } from './const.js';",
        'export async function f(m, verb, name) {',
        // Plain where C's pline_mon() locates.
        '    await message(`${Monnam(m)} ${verb} ${an(name)}.`);',
        // Located where C's pline() does not.
        '    await message(messageAt(`${gush} ${mon_nam(m)}!`, m.mx, m.my));',
        '}',
    ].join('\n'), [{ file: 'const.js', source: "export const gush = 'A gush of water hits';" }]);
    assert.deepEqual(bad.findings, [
        '3 C records a location; JS does not',
        '4 JS records a location; C does not',
    ]);
});

test('pairSites follows an imported constant and a format\'s .replace()', () => {
    const cSites = extractCSites(tokenizePreprocessed([
        '# 1 "src/x.c"',
        'void f(struct monst *m) {',
        '    pline("%s", nothing_happens_text);', // 2: plain, from decl.c
        '    pline_mon(m, "%s looks healthy.", Monnam(m));', // 3: located
        '}',
    ].join('\n')), 'src/x.c', new Map([['nothing_happens_text', 'Nothing happens.']]));
    const run = (body) => pairSites(cSites, [
        { file: 'const.js', source: "export const nothing_happens = 'Nothing happens.';" },
        { file: 'x.js', source: ["import { nothing_happens } from './const.js';", body].join('\n') },
    ]).findings.map((f) => `${f.site.line} ${f.reason}`);
    assert.deepEqual(run([
        'export async function f(m) {',
        '    await message(nothing_happens);',
        "    let msg = '%s looks healthy.';",
        "    await message(messageAt(msg.replace('%s', Monnam(m)), m.mx, m.my));",
        '}',
    ].join('\n')), []);
    assert.deepEqual(run([
        'export async function f(m) {',
        '    await message(messageAt(nothing_happens, m.mx, m.my));',
        "    let msg = '%s looks healthy.';",
        "    await message(msg.replace('%s', Monnam(m)));",
        '}',
    ].join('\n')), [
        '2 JS records a location; C does not',
        '3 C records a location; JS does not',
    ]);
});
