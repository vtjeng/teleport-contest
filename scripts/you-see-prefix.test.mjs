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

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

// Literals that C prints through You() or pline() rather than You_see().
// Each entry is the file and a fragment unique to that line.
const NOT_YOU_SEE = [
    // zap.c:5492 You("%s of smoke.", !Blind ? "see a puff" : ...)
    ['zap.js', "'You see a puff'"],
    // vault.c:877 You("see %s approaching.", ...)
    ['vault.js', '`You see ${name} approaching.`'],
];

const PREFIX = /['"`]You (?:dream that you )?see /u;

test('only pline.js youSee() writes the You_see() prefixes', () => {
    const found = [];
    for (const name of readdirSync(JS_DIR).sort()) {
        if (!name.endsWith('.js') || name === 'pline.js') continue;
        // Help and data tables are text shown to the player, not messages.
        if (name.startsWith('data_') || name === 'help_data.js') continue;
        const lines = readFileSync(`${JS_DIR}${name}`, 'utf8').split('\n');
        lines.forEach((line, index) => {
            if (!PREFIX.test(line)) return;
            // Comments quote messages without printing them.
            if (/^\s*(?:\/\/|\/?\*)/u.test(line)) return;
            if (NOT_YOU_SEE.some(([file, fragment]) => file === name
                && line.includes(fragment))) return;
            found.push(`${name}:${index + 1}: ${line.trim()}`);
        });
    }
    assert.deepEqual(found, []);
});
