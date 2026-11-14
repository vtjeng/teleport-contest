// botl.c compare_blstats() compares BL_TERRAIN as a string. Its "cheat"
// (1828-1831) would compare the terrain_typ number, but it tests
// bl1->fld == BL_TERRAIN, and init_blstats() (1774) fills blstats[][j] from
// initblstats[j], whose last four entries are not in enum statusfields
// order. blstats[][BL_TERRAIN] is therefore the "armor" entry, the cheat
// never fires, and terrain types that share a description, such as the
// thirteen that read "Wall", are no change: no 'changed' highlight and no
// redraw. js/display.js compares the terrain field by its text, and its
// table must equal terrain_descr[] for that to hold.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { TERRAIN_DESCRIPTIONS } from '../js/display.js';

const C_ROOT = new URL('../nethack-c/upstream/', import.meta.url);
const botlC = readFileSync(new URL('src/botl.c', C_ROOT), 'utf8');
const botlH = readFileSync(new URL('include/botl.h', C_ROOT), 'utf8');

// enum statusfields from BL_TITLE = 0 through MAXBLSTATS.
function statusFieldEnum() {
    const body = botlH.slice(botlH.indexOf('enum statusfields {'));
    const names = [...body.slice(body.indexOf('BL_TITLE = 0'), body.indexOf('MAXBLSTATS'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/\b(BL_[A-Z]+)\b/g)].map((match) => match[1]);
    return new Map(names.map((name, index) => [name, index]));
}

// initblstats[] entries in array order: their name, any type and fld.
function initblstatsEntries() {
    const start = botlC.indexOf('static struct istat_s initblstats[MAXBLSTATS] = {');
    const body = botlC.slice(start, botlC.indexOf('\n};', start))
        .replace(/\/\*[\s\S]*?\*\//g, '');
    // One entry per line; a format such as "(%s)" holds a parenthesis.
    return [...body.matchAll(/INIT_BLSTATP?\("([^"]+)", "[^"]*", (ANY_[A-Z0-9]+),.*\b(BL_[A-Z]+)\),$/gm)]
        .map(([, name, anytype, fld]) => ({ name, anytype, fld }));
}

test('blstats[][BL_TERRAIN] holds an initblstats entry whose fld is not BL_TERRAIN', () => {
    const fields = statusFieldEnum();
    const entries = initblstatsEntries();
    // 27 entries: BL_TITLE (0) through BL_VERS (26), MAXBLSTATS being 27.
    assert.equal(entries.length, fields.size);
    assert.equal(fields.get('BL_TERRAIN'), 25);
    // init_blstats() copies by array position.
    assert.match(botlC, /gb\.blstats\[i\]\[j\] = initblstats\[j\];/);
    const copied = entries[fields.get('BL_TERRAIN')];
    // Position 25 is the "armor" entry, so compare_blstats() sees BL_ARMOR.
    assert.deepEqual(copied, { name: 'armor', anytype: 'ANY_STR', fld: 'BL_ARMOR' });
    // The first 23 entries, BL_TITLE through BL_CONDITION, are in order.
    entries.slice(0, 23).forEach((entry, index) => {
        assert.equal(fields.get(entry.fld), index, entry.name);
    });
});

test('compare_blstats() compares a field without the terrain cheat by strcmp()', () => {
    const start = botlC.indexOf('compare_blstats(struct istat_s *bl1, struct istat_s *bl2)');
    const body = botlC.slice(start, botlC.indexOf('\n}\n', start));
    assert.match(body, /anytype = bl1->anytype;/);
    assert.match(body, /if \(bl1->fld == BL_TERRAIN\)\s+anytype = ANY_INT;/);
    assert.match(body, /case ANY_STR:\s+result = sgn\(strcmp\(bl1->val, bl2->val\)\);/);
});

test('the port\'s terrain descriptions equal terrain_descr[]', () => {
    const start = botlC.indexOf('const char *terrain_descr[] = {');
    const body = botlC.slice(start, botlC.indexOf('};', start))
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const source = [...body.matchAll(/(c_Wall|"[^"]*")\s*,/g)]
        .map(([, text]) => (text === 'c_Wall' ? 'Wall' : text.slice(1, -1)));
    assert.match(botlC, /static const char c_Wall\[\] = "Wall";/);
    assert.deepEqual([...TERRAIN_DESCRIPTIONS], source);
    // The wall types VWALL (1) through TRWALL (11), SDOOR (14) and
    // MATCH_WALL (38) share "Wall"; STONE (0) and SCORR (15) share "Stone".
    const indicesOf = (text) => source.flatMap((t, i) => (t === text ? [i] : []));
    assert.deepEqual(indicesOf('Wall'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 38]);
    assert.deepEqual(indicesOf('Stone'), [0, 15]);
});
