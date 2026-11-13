// Enforces where the port keeps C's hero object pointers. decl.h declares
// uarm, uwep, uskin and the rest as globals beside `u`, not as members of
// struct you; the port keeps each on the game state object (state.uarm), and
// state.u has no such field. A read through `u.uarmh` or `state.u?.uskin` is
// therefore always undefined: js/pray.js pleased() then uncursed a worn helm
// of opposite alignment, js/dig.js dig() never halved the damage of a hero
// in a bear trap who wore boots, and js/do_wear.js armor_or_accessory_off()
// let her take off dragon scales merged into her skin.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// The pointer names, read from the C declarations so that the list cannot
// drift from them. Reading decl.h fails when nethack-c/upstream is not
// checked out, so the check never passes without running.
export function heroObjectPointers(declText) {
    const names = new Set();
    for (const match of declText.matchAll(/extern\s+NEARDATA\s+struct\s+obj\s+([^;]*);/gu)) {
        const list = match[1].replace(/\/\*[\s\S]*?\*\//gu, '');
        for (const item of list.split(','))
            names.add(item.replace(/[\s*]/gu, ''));
    }
    return [...names].sort();
}

export function findings(source, names) {
    const pattern = new RegExp(`\\bu\\??\\.(?:${names.join('|')})\\b`, 'gu');
    const found = [];
    source.split('\n').forEach((line, index) => {
        if (line.trimStart().startsWith('//')) return;
        for (const match of line.matchAll(pattern))
            found.push({ line: index + 1, text: match[0] });
    });
    return found;
}

function jsFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...jsFiles(path));
        else if (entry.name.endsWith('.js')) files.push(path);
    }
    return files;
}

const NAMES = heroObjectPointers(
    readFileSync(join(ROOT, 'nethack-c', 'upstream', 'include', 'decl.h'), 'utf8'));

test('decl.h yields every hero object pointer', () => {
    // decl.h:95-98: the fifteen worn and wielded slots plus uchain and uball.
    assert.deepEqual(NAMES, [
        'uamul', 'uarm', 'uarmc', 'uarmf', 'uarmg', 'uarmh', 'uarms', 'uarmu',
        'uball', 'ublindf', 'uchain', 'uleft', 'uquiver', 'uright', 'uskin',
        'uswapwep', 'uwep',
    ]);
});

test('no game code reads a hero object pointer from u', () => {
    const found = [];
    for (const file of jsFiles(join(ROOT, 'js'))) {
        for (const f of findings(readFileSync(file, 'utf8'), NAMES))
            found.push(`${file.slice(ROOT.length)}:${f.line} ${f.text}`);
    }
    assert.deepEqual(found, []);
});

test('the scan finds plain, optional and state-qualified reads', () => {
    // Lines 1-3 are the three forms the fixed sites used; line 4 is the
    // correct form and line 5 a comment, neither of which may be reported.
    const source = [
        'if (obj === u.uarmh) x();',
        'if (obj === state.u?.uskin) x();',
        'else if (state.u.uarmf) y();',
        'if (obj === state.uarmh || state.uskin) z();',
        '// u.uwep in a comment',
    ].join('\n');
    assert.deepEqual(findings(source, NAMES).map(({ line, text }) => `${line} ${text}`), [
        '1 u.uarmh',
        '2 u?.uskin',
        '3 u.uarmf',
    ]);
});
