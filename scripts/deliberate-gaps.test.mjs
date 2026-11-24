// docs/testing.md, "Deliberate gaps", names every pin file under scripts/,
// every path it names exists, and it states the current counts.
// scripts/deliberate-gaps.mjs defines a pin file, classifies each one and
// builds the count statements.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    DOC_PATH, GAP_LISTS, NOT_GAP_LISTS, PROJECT_ROOT, callsAssertExceptionCount,
    classificationProblems, countPhrases, existsInRepository, findPinFiles, gapSection,
    sectionPaths, sectionProblems,
} from './deliberate-gaps.mjs';
import { assertExceptionCount } from './exception-count.mjs';

// Pin files classified on 24 November 2026: 9 gap lists and 24 lists that
// hold no gap, this check among them. A new pin file must be classified,
// which moves one of these counts.
const PINS = { gaps: 9, notGaps: 24 };

const pinFiles = findPinFiles();

test('every pin file is classified as a gap list or not', () => {
    assert.ok(pinFiles.length > 0, 'the rule found no pin file');
    assert.deepEqual(classificationProblems(pinFiles), []);
    assertExceptionCount(GAP_LISTS.size, PINS.gaps, {
        what: 'gap lists', pin: 'PINS.gaps in scripts/deliberate-gaps.test.mjs',
    });
    assertExceptionCount(NOT_GAP_LISTS.size, PINS.notGaps, {
        what: 'pin files that hold no gap', pin: 'PINS.notGaps in scripts/deliberate-gaps.test.mjs',
    });
});

test('the section names every pin file and states every count', () => {
    const section = gapSection(readFileSync(join(PROJECT_ROOT, DOC_PATH), 'utf8'));
    const problems = sectionProblems(section, {
        pinFiles, phrases: countPhrases(), exists: existsInRepository,
    });
    assert.deepEqual(problems, [],
        `update "Deliberate gaps" in ${DOC_PATH}; node scripts/deliberate-gaps.mjs prints the counts`);
});

// The rule on a stand-in scripts/ directory: a module that calls the helper
// and a non-fixture JSON file are pin files; a fixture, a module that names
// the helper only in a comment, and a module that does not name it are not.
test('findPinFiles() finds callers of assertExceptionCount() and non-fixture JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deliberate-gaps-'));
    try {
        writeFileSync(join(dir, 'a.test.mjs'), 'assertExceptionCount(1, 1, {});\n');
        writeFileSync(join(dir, 'b.test.mjs'), '// calls assertExceptionCount(1, 1)\n');
        writeFileSync(join(dir, 'c.mjs'), 'export const x = 1;\n');
        writeFileSync(join(dir, 'd-allowlist.json'), '{}\n');
        writeFileSync(join(dir, 'e.fixture.json'), '{}\n');
        assert.deepEqual(findPinFiles(dir), ['scripts/a.test.mjs', 'scripts/d-allowlist.json']);
    } finally {
        rmSync(dir, { recursive: true });
    }
    assert.equal(callsAssertExceptionCount("/* assertExceptionCount( */ f('assertExceptionCount(');"),
        false);
});

test('classificationProblems() flags new, stale and doubly classified files', () => {
    const gaps = new Map([['scripts/a.json', 'row'], ['scripts/both.json', 'row']]);
    const notGaps = new Map([['scripts/both.json', 'reason'], ['scripts/gone.json', 'reason']]);
    assert.deepEqual(classificationProblems(
        ['scripts/a.json', 'scripts/both.json', 'scripts/new.json'], gaps, notGaps), [
        'scripts/both.json: classified both as a gap list and as not one',
        'scripts/new.json: a new pin file; add it to GAP_LISTS or NOT_GAP_LISTS in '
            + 'scripts/deliberate-gaps.mjs and name it in the section',
        'scripts/gone.json: no longer a pin file; remove it from NOT_GAP_LISTS',
    ]);
});

// A two-section stand-in for docs/testing.md. The section names one of two
// pin files, one path that exists and one that does not, and one of two
// count statements; the path in the next section is not part of it.
test('sectionProblems() flags an unnamed pin file, a missing path and a missing count', () => {
    const doc = [
        '## Deliberate gaps', '',
        '| `scripts/a.json` | `js/real.js f()` | `js/gone.js` | 3 calls |', '',
        '## Next', '', '`scripts/b.json`',
    ].join('\n');
    const section = gapSection(doc);
    assert.deepEqual(sectionPaths(section), ['js/gone.js', 'js/real.js', 'scripts/a.json']);
    const existing = new Set(['js/real.js', 'scripts/a.json', 'scripts/b.json']);
    assert.deepEqual(sectionProblems(section, {
        pinFiles: ['scripts/a.json', 'scripts/b.json'],
        phrases: ['3 calls', '4 calls'],
        exists: (path) => existing.has(path),
    }), [
        'scripts/b.json: a pin file the section does not name',
        'js/gone.js: named in the section but missing',
        'the section must say: 4 calls',
    ]);
    assert.deepEqual(sectionProblems('## Deliberate gaps\n\nNo paths.', {
        pinFiles: [], phrases: [], exists: () => true,
    }), ['the section names no repository path']);
    assert.throws(() => gapSection('## Known failures\n'), /no "## Deliberate gaps" heading/u);
});
