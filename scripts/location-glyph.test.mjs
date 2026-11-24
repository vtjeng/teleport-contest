// Enforces the map-memory spelling in js/game.js makeLocation(): C's
// levl[x][y].glyph is `remembered_glyph?.glyph` on a port location, and a
// location has no `glyph` property. A read of `.glyph` off a location is
// always undefined, so it silently answers "nothing remembered"; batch 18
// found three such reads (do.c dodown() 1182, mon.c 3358, uhitm.c 6295) and
// one stray write (bones.c 569). The first test scans js/ for the mistake;
// the second pins what the scan finds.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Names the port conventionally gives a location even when the binding is
// out of the scan's sight, such as a parameter.
const LOCATION_NAMES = ['loc', 'location', 'lev', 'levl'];

// A balanced `.at(...)` call, allowing one level of nested parentheses.
const AT_CALL = String.raw`\.at\((?:[^()]|\([^()]*\))*\)`;
// A location indexed straight out of the grid: locations[x][y], with any
// optional chaining.
const GRID_INDEX = String.raw`\blocations\??\.?\[[^\]]*\]\??\.?\[[^\]]*\]`;
const GLYPH = String.raw`\s*\??\.glyph\b`;

// Returns the 1-based line number of every `.glyph` access on a location in
// one source file.
export function locationGlyphFindings(source) {
    const names = new Set(LOCATION_NAMES);
    // A name bound to the result of an at() call or a grid index, the call
    // ending the expression (`?? null` and `|| null` included).
    const binding = new RegExp(
        String.raw`\b(?:const|let|var)\s+(\w+)\s*=\s*[\w$.?\[\]]*(?:${AT_CALL}|${GRID_INDEX})\s*(?:;|\?\?|\|\||$)`,
        'gmu',
    );
    for (const match of source.matchAll(binding)) names.add(match[1]);
    const access = new RegExp(
        String.raw`(?:${AT_CALL}|${GRID_INDEX}|\b(?:${[...names].join('|')}))${GLYPH}`,
        'gu',
    );
    const lines = new Set();
    for (const match of source.matchAll(access))
        lines.add(source.slice(0, match.index).split('\n').length);
    return [...lines].sort((a, b) => a - b);
}

function scanRepository() {
    const dir = join(PROJECT_ROOT, 'js');
    const findings = [];
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.js')).sort()) {
        const source = readFileSync(join(dir, name), 'utf8');
        const lines = source.split('\n');
        for (const line of locationGlyphFindings(source))
            findings.push(`js/${name}:${line}: ${lines[line - 1].trim()}`);
    }
    return findings;
}

test('no game code reads or writes .glyph on a location', () => {
    assert.deepEqual(scanRepository(), []);
});

test('the scan finds direct, grid, bound and conventionally named accesses', () => {
    // Each line whose comment gives a number holds one mistake; line 1 is
    // the first array element.
    const source = [
        'const g = state.level?.at(u.ux, u.uy)?.glyph;', // 1: do.c dodown()
        'if (glyph_is_invisible(state.level.at(x, y).glyph)) f();', // 2: mon.c
        'if (x(state.level?.at(mtmp.mx, mtmp.my)?.glyph)) f();', // 3: uhitm.c
        'const h = level.at(dx(x + 1), y).glyph;', // 4: nested call in the coordinates
        'const k = state.level.locations[x][y].glyph;', // 5: grid index
        'const crm = state.level.at(x, y);',
        'if (crm.glyph === 7) f();', // 7: name bound to at()
        'loc.glyph = GLYPH_UNEXPLORED_OFF;', // 8: conventional name, bones.c
        'const spot = state.level.at(x, y) ?? null;',
        'return spot?.glyph;', // 10: binding with a null fallback
    ].join('\n');
    assert.deepEqual(locationGlyphFindings(source), [1, 2, 3, 4, 5, 7, 8, 10]);
});

test('the scan accepts map memory, glyph records and other properties', () => {
    assert.deepEqual(locationGlyphFindings([
        'const g = state.level.at(x, y)?.remembered_glyph?.glyph;',
        'const d = glyph_buffer_at(x, y, state).glyphinfo?.glyph;',
        'const s = state.level.at(x, y).seenv;',
        // A property read off the location is not a location.
        'const typ = state.level.at(x, y)?.typ;',
        'if (typ.glyph) f();',
        // A glyph record carries .glyph legitimately.
        'const gi = map_glyphinfo(glyph, state);',
        'return gi.glyph;',
    ].join('\n')), []);
});
