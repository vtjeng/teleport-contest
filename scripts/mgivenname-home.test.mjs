// C keeps a monster's given name in one place, mtmp->mextra->mgivenname
// (mextra.h MGIVENNAME() and has_mgivenname()). The port once also read a
// top-level mtmp.mgivenname that no code sets, and cmd.js
// there_cmd_menu_next2u() read only that field, so it offered "Name" for a
// named pet where C offers "Rename". Every property access to mgivenname in
// game code must go through an mextra object; this test fails when one
// reads or writes it on anything else.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// A `.mgivenname` or `?.mgivenname` access whose receiver is not written
// `mextra`. Function names such as has_mgivenname() have no dot before them.
const STRAY_ACCESS = /(?<!\bmextra\??)\??\.mgivenname\b/gu;

// Matches of STRAY_ACCESS in source, as `file:line: text`.
export function strayGivenNameAccesses(source, file = '<source>') {
    const findings = [];
    for (const match of source.matchAll(STRAY_ACCESS)) {
        const line = source.slice(0, match.index).split('\n').length;
        findings.push(`${file}:${line}: ${source.split('\n')[line - 1].trim()}`);
    }
    return findings;
}

test('game code keeps a monster\'s given name only in mextra', () => {
    const findings = readdirSync(JS_DIR)
        .filter((name) => name.endsWith('.js'))
        .flatMap((name) => strayGivenNameAccesses(
            readFileSync(join(JS_DIR, name), 'utf8'), `js/${name}`));
    assert.deepEqual(findings, []);
});

test('the scan finds each form of a stray access and spares mextra', () => {
    assert.deepEqual(
        strayGivenNameAccesses([
            'if (mtmp.mgivenname) x();',
            'const n = mon?.mgivenname;',
            'extra.mgivenname = name;',
            'if (mtmp.mextra.mgivenname) y();',
            'const m = mtmp?.mextra?.mgivenname;',
            'if (has_mgivenname(mtmp)) z();',
        ].join('\n')),
        [
            '<source>:1: if (mtmp.mgivenname) x();',
            '<source>:2: const n = mon?.mgivenname;',
            '<source>:3: extra.mgivenname = name;',
        ],
    );
});
