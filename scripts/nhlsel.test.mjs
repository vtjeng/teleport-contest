import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { COLNO, ROWNO } from '../js/const.js';
import {
    l_selection_or, l_selection_setpoint, l_selection_sub,
} from '../js/nhlsel.js';
import {
    selection_area, selection_clear, selection_new, ThemeroomSelection,
} from '../js/themerooms.js';

const nhlsel = readFileSync('nethack-c/upstream/src/nhlsel.c', 'utf8');
const selvar = readFileSync('nethack-c/upstream/src/selvar.c', 'utf8');
const touLoca = readFileSync('nethack-c/upstream/dat/Tou-loca.lua', 'utf8');
const bigrm1 = readFileSync('nethack-c/upstream/dat/bigrm-1.lua', 'utf8');
const bigrm2 = readFileSync('nethack-c/upstream/dat/bigrm-2.lua', 'utf8');
const questLevels = readFileSync('js/quest_levels.js', 'utf8');
const bigrmJs = readFileSync('js/bigrm.js', 'utf8');

function sourceValue(selection, x, y) {
    return selection.points[y * COLNO + x] - 1;
}

test('selection numeric storage follows selvar.c signed-char encoding', () => {
    assert.match(selvar, /memset\(tmps->map, 1, \(COLNO \* ROWNO\)\)/u);
    assert.match(selvar, /return \(sel->map\[sel->wid \* y \+ x\] - 1\);/u);
    assert.match(selvar, /sel->map\[sel->wid \* y \+ x\] = \(char\) \(c \+ 1\);/u);

    const selection = new ThemeroomSelection();
    assert.equal(selection.get(4, 5), false);
    selection.set(4, 5, 0x2a);
    assert.equal(selection.points[5 * COLNO + 4], 0x2b);
    assert.equal(sourceValue(selection, 4, 5), 0x2a);
    assert.equal(selection.get(4, 5), true);
    selection.set(4, 5, 0);
    assert.equal(selection.points[5 * COLNO + 4], 1);
    assert.equal(selection.get(4, 5), false);

    selection.set(5, 5, 127);
    assert.equal(selection.points[5 * COLNO + 5], -128);
    assert.equal(sourceValue(selection, 5, 5), -129);

    selection_clear(selection, 3);
    assert.equal(selection.numpoints(), COLNO * ROWNO);
    assert.equal(sourceValue(selection, 0, 0), 3);
    selection_clear(selection, 0);
    assert.equal(selection.numpoints(), 0);
});

test('l_selection_or matches C bitwise values and wires every translated caller', () => {
    assert.match(nhlsel, /selection_getpoint\(x, y, sela\)\s*\|\s*selection_getpoint\(x, y, selb\)/u);
    assert.match(nhlsel, /\{ "__bor", l_selection_or \}/u);
    assert.match(nhlsel, /\{ "__add", l_selection_or \}/u);
    assert.match(touLoca, /selection\.area\(15,03,20,05\) \+ selection\.area\(62,03,71,04\)/u);
    assert.match(bigrm1, /selection\.line\(15,4, 15, 13\) \| selection\.line\(59,4, 59, 13\)/u);
    assert.match(bigrm2, /selection\.area\(01,07,22,09\)[\s\S]*?\| selection\.area\(24,01,50,05\)/u);
    assert.match(questLevels, /const shops = l_selection_or\(/u);
    assert.match(bigrmJs, /import \{ l_selection_or \} from '\.\/nhlsel\.js';/u);
    assert.match(bigrmJs, /function bigrm1\([\s\S]*?l_selection_or\(/u);
    assert.match(bigrmJs, /function bigrm2\([\s\S]*?l_selection_or\(/u);
    assert.doesNotMatch(bigrmJs, /selUnion/u);

    const a = new ThemeroomSelection();
    const b = new ThemeroomSelection();
    a.set(2, 3, 0b1010);
    a.set(5, 4, 0b0101);
    b.set(2, 3, 0b0110);
    b.set(4, 4, 0b0011);

    const result = l_selection_or(a, b);
    assert.deepEqual(result.bounds(), { lx: 2, ly: 3, hx: 5, hy: 4 });
    assert.equal(sourceValue(result, 2, 3), 0b1110);
    assert.equal(sourceValue(result, 4, 4), 0b0011);
    assert.equal(sourceValue(result, 5, 4), 0b0101);
    assert.equal(sourceValue(result, 3, 3), 0);

    const signed = new ThemeroomSelection(null, true);
    signed.set(8, 9, 127);
    const signedUnion = l_selection_or(signed, new ThemeroomSelection(null, true));
    assert.equal(sourceValue(signedUnion, 8, 9), -129);
    assert.equal(signedUnion.absolute, true);

    const empty = l_selection_or(new ThemeroomSelection(), new ThemeroomSelection());
    assert.equal(empty.numpoints(), 0);
    assert.deepEqual(empty.bounds(), { lx: 0, ly: 0, hx: COLNO - 1, hy: ROWNO - 1 });
});

test('l_selection_sub matches source exclusion, overlap, disjoint, and empty results', () => {
    assert.match(nhlsel, /int val = \(a_pt \^ b_pt\) & a_pt;/u);
    assert.match(nhlsel, /\{ "__sub", l_selection_sub \}/u);

    const a = new ThemeroomSelection(null, true);
    const b = new ThemeroomSelection(null, true);
    a.set(3, 4, 0b1101);
    a.set(10, 8, 0b0110);
    b.set(3, 4, 0b0101);
    b.set(11, 8, 0b0011);

    const result = l_selection_sub(a, b);
    assert.deepEqual(result.bounds(), { lx: 3, ly: 4, hx: 10, hy: 8 });
    assert.equal(sourceValue(result, 3, 4), 0b1000);
    assert.equal(sourceValue(result, 10, 8), 0b0110);
    assert.equal(sourceValue(result, 11, 8), 0);
    assert.equal(result.absolute, true);

    const allRemoved = l_selection_sub(a, new ThemeroomSelection(null, true));
    assert.equal(sourceValue(allRemoved, 3, 4), 0b1101);
    assert.equal(sourceValue(allRemoved, 10, 8), 0b0110);
    const empty = l_selection_sub(new ThemeroomSelection(), new ThemeroomSelection());
    assert.equal(empty.numpoints(), 0);
});

test('l_selection_setpoint follows C argument forms, frame conversion, and injected random draws', () => {
    assert.match(nhlsel, /staticfn int\s+l_selection_setpoint\(lua_State \*L\)[\s\S]*?if \(argc == 0\)[\s\S]*?else if \(argc == 1\)[\s\S]*?else if \(argc == 2\)[\s\S]*?selection_setpoint\(x, y, sel, val\)/u);
    assert.match(nhlsel, /get_location_coord\(&x, &y, ANY_LOC,[\s\S]*?gc\.coder \? gc\.coder->croom : NULL/u);

    const randomCalls = [];
    const env = {
        frame: { xstart: 1, ystart: 0, xsize: 79, ysize: 21 },
        coder: { croom: null },
        random: { rn2(limit) {
            randomCalls.push(limit);
            return limit === 79 ? 7 : 20;
        } },
    };
    const randomSelection = selection_new();
    assert.equal(l_selection_setpoint([randomSelection], env), randomSelection);
    assert.deepEqual(randomCalls, [79, 21]);
    assert.equal(sourceValue(randomSelection, 8, 20), 1);

    const relative = selection_area(0, 0, 0, 0);
    assert.equal(l_selection_setpoint([relative, 2, 3, 0x2a], {
        ...env, frame: { xstart: 3, ystart: 4, xsize: 79, ysize: 21 },
    }), relative);
    assert.equal(sourceValue(relative, 2, 3), 0x2a);

    const created = l_selection_setpoint([2, 3], {
        ...env, frame: { xstart: 3, ystart: 4, xsize: 79, ysize: 21 },
    });
    assert.ok(created instanceof ThemeroomSelection);
    assert.equal(created.absolute, true);
    assert.equal(sourceValue(created, 5, 7), 1);
    assert.throws(() => l_selection_setpoint([], env), /Selection setpoint error/u);
    assert.throws(() => l_selection_setpoint([{}], env), /Selection error/u);
});
