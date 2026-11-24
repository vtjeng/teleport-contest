// C keeps the hero's map, levl[][] (rm.h struct rm), apart from the glyph
// buffer gg.gbuf and the physical screen. The port keeps all three on each
// location record: struct rm's fields beside js/display.js
// SCREEN_BUFFER_RECORDS. Code that moves or copies a whole record the way C
// moves a struct rm therefore also moves the screen, which C never does:
// sp_lev.c flip_level() swapped records and showed the old map mirrored at a
// --More-- after #wizloaddes. These checks keep every record move in
// js/display.js swap_levl_entries(), and keep the two field lists covering
// every field a new location starts with.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';

import { CORR, ROOM } from '../js/const.js';
import { SCREEN_BUFFER_RECORDS, swap_levl_entries } from '../js/display.js';
import { GameMap, makeLocation } from '../js/game.js';
import { assertExceptionCount } from './exception-count.mjs';

// rm.h struct rm, by the name each field has on a JS location record:
// `glyph` is `remembered_glyph`, and the rest keep their C names.
const STRUCT_RM_FIELDS = Object.freeze([
    'remembered_glyph', 'typ', 'seenv', 'flags', 'horizontal', 'lit',
    'waslit', 'roomno', 'edge', 'candig',
]);

// makeLocation() fields in neither list. 1 = glyph_symidx, which nothing in
// js/ reads or writes after makeLocation() sets it to -1.
const OTHER_FIELDS_PIN = 1;

// Spreads of a location record, each of which copies its screen fields too.
// 3 = js/bones.js cloneBonesLocation(), which then deletes
// SCREEN_BUFFER_RECORDS; js/detect.js's detected-glyph lookup, which restores
// the record onto the same square (detect.c 2272-2277 save_spot); and
// js/pager.js's read-only one-square view for waterbody_name().
const LOCATION_SPREAD_PIN = 3;

const ASSIGNMENT = /\.locations\s*\[[^\]]+\](?:\s*\[[^\]]+\])?\s*=(?!=)/u;
const SPREAD = /\{\s*\.\.\.(?:location|loc)\b/u;

function jsSources() {
    const dir = new URL('../js/', import.meta.url);
    return readdirSync(dir)
        .filter((name) => name.endsWith('.js'))
        .map((name) => ({
            name,
            source: readFileSync(new URL(name, dir), 'utf8'),
        }));
}

function functionRange(source, header) {
    const start = source.indexOf(header);
    assert.ok(start >= 0, `js/display.js defines ${header}`);
    return [start, source.indexOf('\n}\n', start)];
}

function matchingLines(pattern, skip = () => [-1, -1]) {
    const found = [];
    for (const { name, source } of jsSources()) {
        const [start, end] = skip(name, source);
        let offset = 0;
        for (const [index, line] of source.split('\n').entries()) {
            const inside = offset >= start && offset <= end;
            if (!/^\s*\/\//u.test(line) && pattern.test(line) && !inside)
                found.push(`js/${name}:${index + 1}`);
            offset += line.length + 1;
        }
    }
    return found;
}

test('only swap_levl_entries() assigns a location record', () => {
    const offenders = matchingLines(ASSIGNMENT, (name, source) => (
        name === 'display.js'
            ? functionRange(source, 'export function swap_levl_entries(')
            : [-1, -1]));
    assert.deepEqual(offenders, []);
});

test('whole-record spreads of a location stay at the pinned count', () => {
    assertExceptionCount(matchingLines(SPREAD).length, LOCATION_SPREAD_PIN, {
        what: 'location record spreads',
        pin: 'LOCATION_SPREAD_PIN in scripts/levl-entry-swap.test.mjs',
    });
});

test('every new location field is struct rm or screen state', () => {
    const known = new Set([...STRUCT_RM_FIELDS, ...SCREEN_BUFFER_RECORDS]);
    const other = Object.keys(makeLocation()).filter((key) => !known.has(key));
    assertExceptionCount(other.length, OTHER_FIELDS_PIN, {
        what: 'makeLocation() fields outside both lists',
        pin: 'OTHER_FIELDS_PIN in scripts/levl-entry-swap.test.mjs',
    });
});

test('swap_levl_entries() moves struct rm and leaves the screen', () => {
    const level = new GameMap();
    // Two squares of one column, as flip_level()'s vertical pass swaps them;
    // the coordinates are arbitrary interior squares.
    const top = level.at(10, 3);
    const bottom = level.at(10, 17);
    // Any two distinct terrain types would do. The remembered glyph numbers
    // are arbitrary and only need to differ.
    top.typ = ROOM;
    top.remembered_glyph = { glyph: 2401 };
    bottom.typ = CORR;
    bottom.remembered_glyph = { glyph: 2402 };
    // The screen shows '.' at the top square and '#' at the bottom one; only
    // the top square has been flushed, so only it has a shadow-cell ch.
    top._tty.ch = '.';
    top._nomux.ch = '.';
    bottom._tty.ch = '#';

    swap_levl_entries(level, 10, 3, 10, 17);

    assert.equal(level.at(10, 3).typ, CORR);
    assert.deepEqual(level.at(10, 3).remembered_glyph, { glyph: 2402 });
    assert.equal(level.at(10, 17).typ, ROOM);
    assert.deepEqual(level.at(10, 17).remembered_glyph, { glyph: 2401 });
    assert.equal(level.at(10, 3)._tty.ch, '.');
    assert.equal(level.at(10, 3)._nomux.ch, '.');
    assert.equal(level.at(10, 17)._tty.ch, '#');
    assert.equal(Object.hasOwn(level.at(10, 17)._nomux, 'ch'), false);

    // flip_level() with both bits set can swap a square back; the second
    // swap must restore the original records exactly.
    swap_levl_entries(level, 10, 3, 10, 17);
    assert.equal(level.at(10, 3), top);
    assert.equal(level.at(10, 17), bottom);
    assert.equal(top._tty.ch, '.');
    assert.equal(bottom._tty.ch, '#');
});
