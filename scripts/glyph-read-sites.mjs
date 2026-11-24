// Finds every function that touches one of a map square's two glyphs, in the
// C source and in the port, for scripts/glyph-read-sites.test.mjs.
//
// C keeps levl[x][y].glyph, what the hero remembers, apart from
// gg.gbuf[y][x].glyphinfo.glyph, what display.c last drew, which glyph_at()
// returns. The port keeps them as a level location's `remembered_glyph` and the
// `glyphinfo` of js/display.js glyph_buffer_at()'s entry. A site is one
// function and one of the two kinds:
//
//   remembered  C: levl[x][y].glyph, lev->glyph, door->glyph
//               JS: remembered_glyph
//   drawn       C: glyph_at(), _glyph_at(), a gbuf entry's glyphinfo.glyph
//               JS: glyph_at, .glyphinfo
//
// Reads and writes both count: either one names which of the two values the
// function means. A reference to glyph_at without a call counts as well, so
// that a function which takes the reader from an injected environment and
// falls back to glyph_at is found.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const blankKeepingLines = (text) => text.replace(/[^\n]/g, '');

function stripCComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, blankKeepingLines);
}

// Block comments, line comments, and import or export lists, which name
// glyph_at without using it. A `//` inside a string or a regular expression
// would be cut short; js/ has none on a line this scan counts, and the
// pinned counts in the test would show one.
function stripJsNoise(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, blankKeepingLines)
        .replace(/\/\/[^\n]*/g, '')
        .replace(/^(?:import|export)\s*\{[^}]*\}(?:\s*from\s*'[^']*')?;?/gm,
            blankKeepingLines);
}

const C_KINDS = {
    remembered: /levl\[[^\]]*\]\[[^\]]*\]\.glyph\b|\b(?:lev|door)->glyph\b/g,
    drawn: /\b_?glyph_at\(|\bgbuf\[[^\]]*\]\[[^\]]*\]\.glyphinfo\.glyph\b|\bgptr->glyphinfo\.glyph\b/g,
};

const JS_KINDS = {
    remembered: /\bremembered_glyph\b/g,
    drawn: /\bglyph_at\b|\.glyphinfo\b/g,
};

// A C function starts with its name in column 0, the return type on the line
// above, and ends at the next `}` in column 0. A `#define` belongs to the
// function it sits in, or to `<top>`.
const C_FUNCTION = /^([A-Za-z_]\w*)\(/;
// A JS function, generator or class declared in column 0. Closures and
// methods inside it count toward it.
const JS_FUNCTION
    = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s*\*?|class)\s*([A-Za-z_$][\w$]*)/;

function scan(source, functionPattern, kinds) {
    const counts = new Map();
    let current = '<top>';
    for (const line of source.split('\n')) {
        const start = functionPattern.exec(line);
        if (start) current = start[1];
        for (const [kind, pattern] of Object.entries(kinds)) {
            const found = line.match(pattern)?.length ?? 0;
            if (!found) continue;
            const key = `${current} ${kind}`;
            counts.set(key, (counts.get(key) ?? 0) + found);
        }
        if (line.startsWith('}')) current = '<top>';
    }
    return counts;
}

function scanDirectory(directory, extension, strip, functionPattern, kinds) {
    const sites = new Map();
    for (const name of readdirSync(directory).sort()) {
        if (!name.endsWith(extension)) continue;
        const source = strip(readFileSync(join(directory, name), 'utf8'));
        for (const [key, count] of scan(source, functionPattern, kinds))
            sites.set(`${name} ${key}`, count);
    }
    return sites;
}

/** Map of `file.c function kind` to the number of matches. */
export function cGlyphSites(directory) {
    return scanDirectory(directory, '.c', stripCComments, C_FUNCTION, C_KINDS);
}

/** Map of `file.js function kind` to the number of matches. */
export function jsGlyphSites(directory) {
    return scanDirectory(directory, '.js', stripJsNoise, JS_FUNCTION, JS_KINDS);
}
