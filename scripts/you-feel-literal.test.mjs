// Enforces js/pline.js youFeel() as the only builder of C's You_feel()
// prefix. The first tests pin the repository: every "You feel" literal in
// js/ is either built by youFeel() or listed in
// scripts/you-feel-literal.mjs with the C call that writes it without
// You_feel(), and every listed entry still matches a literal. The rest pin
// what the scan finds in sources written for the test.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    ALLOWED_FILES,
    ALLOWED_LITERALS,
    PROJECT_ROOT,
    feelLiterals,
    scanFiles,
    staleEntries,
    unlistedLiterals,
} from './you-feel-literal.mjs';
import { assertExceptionCount } from './exception-count.mjs';

const lines = (source) => feelLiterals(source, 'js/x.js').map(({ line }) => line);

test('every hand-written "You feel" in js/ is a listed non-You_feel() site', () => {
    assert.deepEqual(unlistedLiterals().map(({ file, line }) => `${file}:${line}`), []);
});

test('every allow-list entry still matches a literal in js/', () => {
    assert.deepEqual(staleEntries(), []);
});

test('the allow-lists hold the pinned number of entries and literals', () => {
    // On 9f7e42e6 (8 November 2026): 34 ALLOWED_LITERALS entries, each
    // matching one literal, and one ALLOWED_FILES entry,
    // js/quest_text_data.js, holding 14 "You feel" literals.
    const PINS = { literalEntries: 34, literals: 34, fileEntries: 1, fileLiterals: 14 };
    const pin = (key) => `PINS.${key} in scripts/you-feel-literal.test.mjs`;
    assertExceptionCount(ALLOWED_LITERALS.length, PINS.literalEntries,
        { what: 'ALLOWED_LITERALS entries', pin: pin('literalEntries') });
    assertExceptionCount(scanFiles().filter((finding) => finding.allowed).length, PINS.literals,
        { what: 'allowed "You feel" literals', pin: pin('literals') });
    assertExceptionCount(ALLOWED_FILES.length, PINS.fileEntries,
        { what: 'ALLOWED_FILES entries', pin: pin('fileEntries') });
    const fileLiterals = ALLOWED_FILES.reduce((n, { file }) =>
        n + feelLiterals(readFileSync(join(PROJECT_ROOT, file), 'utf8'), file).length, 0);
    assertExceptionCount(fileLiterals, PINS.fileLiterals,
        { what: '"You feel" literals in ALLOWED_FILES', pin: pin('fileLiterals') });
});

test('every allow-list entry names its C call', () => {
    for (const entry of [...ALLOWED_LITERALS, ...ALLOWED_FILES])
        assert.match(entry.c, /\.(c|lua)\b/u, entry.text ?? entry.file);
});

test('the scan finds each way of writing the prefix by hand', () => {
    // Each numbered line holds one hand-written prefix.
    assert.deepEqual(lines([
        "await message('You feel sick.', state);", // 1: single quotes
        'await message("You feel sick.", state);', // 2: double quotes
        'await message(`You feel ${how} sick.`, state);', // 3: template
        "await message('You feel ' + how + ' sick.', state);", // 4: concatenation
        'const prefix = unaware ? "You dream that you feel" : "You feel";', // 5: two
        'await message(`${p ? `You feel` : "x"} sick.`, state);', // 6: nested
        'await message(`a`',
        '    + `You feel', // 8: a template that spans lines
        '    sick.`, state);',
    ].join('\n')), [1, 2, 3, 4, 5, 5, 6, 8]);
});

test('the scan ignores comments, regular expressions and youFeel() text', () => {
    assert.deepEqual(lines([
        '// C: You_feel("sick.") prints "You feel sick."',
        '/* "You feel sick." */',
        "await message(youFeel('sick.', state), state);",
        'const re = /You feel/u;',
        "const quoted = 'it\\'s fine';",
        'const ratio = a / b; const s = "You hear";',
    ].join('\n')), []);
});

test('a bypass and a stale entry each fail the check', () => {
    const root = mkdtempSync(join(tmpdir(), 'you-feel-literal-'));
    try {
        mkdirSync(join(root, 'js'));
        writeFileSync(join(root, 'js', 'bypass.js'),
            "export const line = 'You feel sick.';\n");
        // An unlisted literal in any js/ file is reported by file and line.
        assert.deepEqual(
            unlistedLiterals(root).map(({ file, line }) => `${file}:${line}`),
            ['js/bypass.js:1'],
        );
        // None of the listed js/ files exist here, so every entry is stale.
        assert.equal(staleEntries(root).length,
            ALLOWED_LITERALS.length + ALLOWED_FILES.length);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
