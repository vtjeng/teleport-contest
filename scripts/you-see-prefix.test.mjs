// pline.c You_see() picks its own prefix: "You dream that you see" while the
// hero is Unaware, "You sense" while Blind, and "You see" otherwise. js/pline.js
// youSee() is the one copy of that choice. A message literal in js/ that
// spells out "You see " itself would skip the Unaware and Blind prefixes, so
// this check fails on any such literal except the C sites that call You() or
// pline() with a "see" text of their own.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { assertExceptionCount } from './exception-count.mjs';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

// Literals that C prints through You() or pline() rather than You_see().
// Each entry is the file and a fragment unique to that line.
const NOT_YOU_SEE = [
    // zap.c:5492 You("%s of smoke.", !Blind ? "see a puff" : ...)
    ['zap.js', "'You see a puff'"],
    // vault.c:877 You("see %s approaching.", ...)
    ['vault.js', '`You see ${name} approaching.`'],
    // pray.c:2114 You(Hallucination ? "see crabgrass at your %s.  A funny
    // thing in a dungeon." : ...), reached only when not Blind
    ['pray.js', '`You see crabgrass at your ${feet}.'],
];

const PREFIX = /['"`]You (?:dream that you )?see /u;

// Every "You see " literal outside pline.js, as { site, excused }. `excused`
// is 'data' in a help or data table, 'listed' for a NOT_YOU_SEE entry, and
// null otherwise.
function prefixSites() {
    const sites = [];
    for (const name of readdirSync(JS_DIR).sort()) {
        if (!name.endsWith('.js') || name === 'pline.js') continue;
        // Help and data tables are text shown to the player, not messages.
        const data = name.startsWith('data_') || name === 'help_data.js';
        const lines = readFileSync(`${JS_DIR}${name}`, 'utf8').split('\n');
        lines.forEach((line, index) => {
            if (!PREFIX.test(line)) return;
            // Comments quote messages without printing them.
            if (/^\s*(?:\/\/|\/?\*)/u.test(line)) return;
            const listed = NOT_YOU_SEE.some(([file, fragment]) => file === name
                && line.includes(fragment));
            sites.push({ site: `${name}:${index + 1}: ${line.trim()}`,
                excused: data ? 'data' : listed ? 'listed' : null });
        });
    }
    return sites;
}

test('only pline.js youSee() writes the You_see() prefixes', () => {
    assert.deepEqual(prefixSites().filter(({ excused }) => !excused).map(({ site }) => site), []);
});

test('the exceptions hold the pinned number of entries and sites', () => {
    // On 9f7e42e6 (8 November 2026): 2 NOT_YOU_SEE entries covering 2
    // literals, and 1 literal in the data tables, a quotation in
    // js/data_base_data.js. The pray.c crabgrass message made it 3 and 3
    // on 13 November 2026, when the port first spelled it as one literal.
    const PINS = { entries: 3, listed: 3, data: 1 };
    const pin = (key) => `PINS.${key} in scripts/you-see-prefix.test.mjs`;
    const sites = prefixSites();
    const count = (kind) => sites.filter(({ excused }) => excused === kind).length;
    assertExceptionCount(NOT_YOU_SEE.length, PINS.entries,
        { what: 'NOT_YOU_SEE entries', pin: pin('entries') });
    assertExceptionCount(count('listed'), PINS.listed,
        { what: '"You see" literals that NOT_YOU_SEE excuses', pin: pin('listed') });
    assertExceptionCount(count('data'), PINS.data,
        { what: '"You see" literals in help and data tables', pin: pin('data') });
});
