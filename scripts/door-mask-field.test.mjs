// rm.h:213 defines doormask as a macro over struct rm's `flags`, so a door's
// state has one home. js/game.js makeLocation() mirrors that: the port keeps
// a door's state in `flags` and has no `doormask` field. A writer that set a
// separate `doormask` would leave `flags`, which every reader uses, stale.
// This test fails when game code names such a field again.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { makeLocation } from '../js/game.js';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// A property access, an object-literal key, a computed key or an `in` test.
const FIELD = /\.doormask\b|\bdoormask\s*:|\[\s*['"`]doormask['"`]\s*\]|['"`]doormask['"`]\s+in\b/u;

// Returns "file:line: text" for each code line that names the field. Line
// comments and block-comment lines are skipped, because comments quote C's
// `lev->doormask` and that is how the C source spells the field.
function doormaskFieldFindings(name, source) {
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
        if (FIELD.test(code)) findings.push(`${name}:${index + 1}: ${line.trim()}`);
    });
    return findings;
}

test('no game code names a doormask field apart from flags', () => {
    const findings = readdirSync(JS_DIR)
        .filter((name) => name.endsWith('.js'))
        .flatMap((name) => doormaskFieldFindings(
            name, readFileSync(join(JS_DIR, name), 'utf8'),
        ));
    assert.deepEqual(findings, []);
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
        doormaskFieldFindings('x.js', source).map((f) => Number(f.split(':')[1])),
        [1, 2, 3, 4],
    );
});

test('a fresh location keeps its door state only in flags', () => {
    const location = makeLocation();
    assert.equal(Object.hasOwn(location, 'doormask'), false);
    assert.equal(location.flags, 0);
});
