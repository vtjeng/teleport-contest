// rm.h:213-220 defines doormask, wall_info and looted (and altarmask,
// ladder, drawbridgemask, icedpool and emptygrave) as macros over struct
// rm's `flags`, so each of those values has one home per square; a secret
// door's lock and trap bits share it with its wall mode. js/game.js
// makeLocation() mirrors that: the port keeps them in `flags` and has no
// separate field for any of them. A writer that set a separate field would
// leave `flags`, which every reader uses, stale; a watchman's D_WARNED, for
// instance, must land on the door's D_TRAPPED bit. This test fails when game
// code names such a field again.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertExceptionCount } from './exception-count.mjs';
import { makeLocation } from '../js/game.js';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// A property access, an object-literal key, a computed key or an `in` test.
function fieldPattern(field) {
    return new RegExp(
        `\\.${field}\\b|\\b${field}\\s*:|\\[\\s*['"\`]${field}['"\`]\\s*\\]`
        + `|['"\`]${field}['"\`]\\s+in\\b`,
        'u',
    );
}

// Code that names one of these words for something other than a map square.
// objnam.c's struct _readobjnam_data has its own `looted` member (the
// "looted" wish prefix), which js/objnam_readobjnam.js keeps as `d.looted`
// and initializes in the descriptor literal.
const ALLOWED = {
    looted: [
        { file: 'objnam_readobjnam.js', line: /\bd\.looted\b/u },
        { file: 'objnam_readobjnam.js', line: /^\s*looted: 0, \/\* wizard mode/u },
    ],
};

const FIELDS = ['doormask', 'looted', 'wall_info'];

// Returns { line, text, allowed } for each code line that names the field,
// `allowed` when an ALLOWED entry covers it. Line comments and block-comment
// lines are skipped, because comments quote C's `lev->doormask` and that is
// how the C source spells the field.
function fieldSites(field, name, source) {
    const pattern = fieldPattern(field);
    const allowed = (ALLOWED[field] ?? []).filter((entry) => entry.file === name);
    const findings = [];
    let inBlock = false;
    source.split('\n').forEach((line, index) => {
        let code = line;
        if (inBlock) {
            const end = code.indexOf('*/');
            if (end < 0) return;
            code = code.slice(end + 2);
            inBlock = false;
        }
        code = code.replace(/\/\*.*?\*\//gu, '');
        const open = code.indexOf('/*');
        if (open >= 0) {
            code = code.slice(0, open);
            inBlock = true;
        }
        const comment = code.indexOf('//');
        if (comment >= 0) code = code.slice(0, comment);
        if (!pattern.test(code)) return;
        findings.push({ line: index + 1, text: line.trim(),
            allowed: allowed.some((entry) => entry.line.test(line)) });
    });
    return findings;
}

// Returns "file:line: text" for each site that no ALLOWED entry covers.
function fieldFindings(field, name, source) {
    return fieldSites(field, name, source).filter((site) => !site.allowed)
        .map((site) => `${name}:${site.line}: ${site.text}`);
}

for (const field of FIELDS) {
    test(`no game code names a ${field} field apart from flags`, () => {
        const findings = readdirSync(JS_DIR)
            .filter((name) => name.endsWith('.js'))
            .flatMap((name) => fieldFindings(
                field, name, readFileSync(join(JS_DIR, name), 'utf8'),
            ));
        assert.deepEqual(findings, []);
    });
}

test('ALLOWED holds the pinned number of entries and sites', () => {
    // 2 entries covering 7 lines of js/objnam_readobjnam.js on 9f7e42e6
    // (8 November 2026): its descriptor's `looted` key and six `d.looted`
    // reads and writes.
    const PINS = { entries: 2, sites: 7 };
    assertExceptionCount(Object.values(ALLOWED).flat().length, PINS.entries, {
        what: 'ALLOWED entries',
        pin: 'PINS.entries in scripts/rm-flags-overlay.test.mjs',
    });
    const sites = readdirSync(JS_DIR).filter((name) => name.endsWith('.js'))
        .flatMap((name) => {
            const source = readFileSync(join(JS_DIR, name), 'utf8');
            return FIELDS.flatMap((field) => fieldSites(field, name, source));
        })
        .filter((site) => site.allowed).length;
    assertExceptionCount(sites, PINS.sites, {
        what: 'field sites that ALLOWED excuses',
        pin: 'PINS.sites in scripts/rm-flags-overlay.test.mjs',
    });
});

test('the scan finds each way of naming the field and skips comments', () => {
    // Lines 1-4 each name the field; lines 5-10 only mention it in comments.
    const source = [
        'loc.doormask = D_CLOSED;',
        'const cell = { typ: DOOR, doormask: 0 };',
        "if (loc['doormask'] & D_LOCKED) return;",
        "if ('doormask' in loc) loc.flags = 0;",
        '// C: lev->doormask = D_BROKEN;',
        'loc.flags = D_BROKEN; // lev->doormask = D_BROKEN',
        '/* doormask */ loc.flags = 0;',
        '/*',
        ' * levl[x][y].doormask',
        ' */',
    ].join('\n');
    assert.deepEqual(
        fieldFindings('doormask', 'x.js', source)
            .map((f) => Number(f.split(':')[1])),
        [1, 2, 3, 4],
    );
});

test('the looted scan allows only the wish descriptor', () => {
    // Line 1 is the watchman's old separate field; lines 2-3 are
    // objnam.c's _readobjnam_data member, allowed in its own file only.
    const source = [
        'here.looted = (here.looted ?? 0) | D_WARNED;',
        'lev.flags = d.looted ? F_LOOTED : 0;',
        '        looted: 0, /* wizard mode fountain/sink/throne/tree and grave */',
    ].join('\n');
    assert.deepEqual(
        fieldFindings('looted', 'objnam_readobjnam.js', source)
            .map((f) => Number(f.split(':')[1])),
        [1],
    );
    assert.deepEqual(
        fieldFindings('looted', 'monmove.js', source)
            .map((f) => Number(f.split(':')[1])),
        [1, 2, 3],
    );
});

test('a fresh location keeps its door, wall and looted state only in flags', () => {
    const location = makeLocation();
    for (const field of FIELDS)
        assert.equal(Object.hasOwn(location, field), false, field);
    assert.equal(location.flags, 0);
});
