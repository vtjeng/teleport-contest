// js/pager.js runs without refusals for inputs its callers never pass: every
// help file a caller names is in HELP_TEXT_FILES, every help-menu value has
// an arm in dohelp(), do_look() is entered in modes 0 and 1 without a click,
// and lookat() hands lookatOrdinaryTerrain() only cmap glyphs. Each test fails
// when one of those stops holding; the last pins the one refusal pager.js
// keeps and fails if a removed one returns.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { HELP_TEXT_FILES } from '../js/help_data.js';
import { contactLines, helpMenuItems } from '../js/pager.js';

const JS_DIR = new URL('../js/', import.meta.url);

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

const PAGER = stripComments(readFileSync(new URL('pager.js', JS_DIR), 'utf8'));

test('every display_file() caller names a generated help file', () => {
    const names = [...PAGER.matchAll(/(?<!function )display_file\(([^,]+),/gu)]
        .map((match) => match[1].trim());
    // help, hh, opthelp, optmenu, license, wizhelp, usagehlp, history.
    assert.equal(names.length, 8);
    for (const name of names) {
        const literal = name.match(/^'(\w+)'$/u);
        assert.ok(literal, `display_file() argument ${name} is not a literal`);
        assert.ok(Object.hasOwn(HELP_TEXT_FILES, literal[1]), literal[1]);
    }
});

test('dohelp() has an arm for every help-menu value', () => {
    // Wizard mode adds row 16 and hideusage removes row 13 (pager.c
    // dohelp()'s filters); the widest menu offers 1 through 16.
    const values = helpMenuItems({ wizard: true, sysopt: {} })
        .map((item) => item.value);
    assert.deepEqual(values, Array.from({ length: 16 }, (_, i) => i + 1));
    const body = PAGER.slice(PAGER.indexOf('export async function dohelp('));
    const arms = [...body.slice(0, body.indexOf('\n}\n'))
        .matchAll(/if \(choice === (\d+)\)/gu)].map((match) => Number(match[1]));
    // 1-15 test their value; 16 is the unconditional last arm.
    assert.deepEqual(arms, values.slice(0, 15));
    assert.match(body.slice(0, body.indexOf('\n}\n')),
        /await dispfile_debughelp\(state\);\s*return ECMD_OK;\s*$/u);
});

test('do_look() is entered in modes 0 and 1 without a click', () => {
    const calls = [];
    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js'))) {
        const source = stripComments(readFileSync(new URL(file, JS_DIR), 'utf8'));
        for (const match of source.matchAll(/(?<!function )\bdo_look\(([^)]*)\)/gu))
            calls.push(`${file}: ${match[1]}`);
    }
    assert.deepEqual(calls, [
        'pager.js: 0, null, state',
        'pager.js: 1, null, state',
    ]);
});

test('lookat() hands lookatOrdinaryTerrain() only cmap glyphs', () => {
    const calls = [...PAGER.matchAll(
        /(?<!function )lookatOrdinaryTerrain\(/gu,
    )];
    assert.equal(calls.length, 1);
    assert.match(PAGER,
        /\} else if \(glyph_is_cmap\(glyph\)\) \{\s*buf = lookatOrdinaryTerrain\(x, y, glyph, state\);/u);
});

test('docontact() prints a configured SUPPORT line as C does', () => {
    // pager.c docontact() 2726-2730; the recorder's sysconf sets no SUPPORT,
    // so only this test reaches the arm.
    assert.deepEqual(
        contactLines({ sysopt: { support: 'ask the operator' } }).slice(0, 2),
        ['To contact local support, ask the operator', ''],
    );
    assert.equal(
        contactLines({ sysopt: {} })[0],
        'To contact the NetHack development team directly,',
    );
});
