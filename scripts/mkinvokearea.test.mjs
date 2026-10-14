import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { mkinvk_check_wall } from '../js/mklev.js';
import { GameMap } from '../js/game.js';
import { HWALL, IRONBARS, ROOM, STONE } from '../js/const.js';

const C_MKLEV = readFileSync(
    new URL('../nethack-c/upstream/src/mklev.c', import.meta.url), 'utf8',
);
const JS_MKLEV = readFileSync(new URL('../js/mklev.js', import.meta.url), 'utf8');
const C_SPELL = readFileSync(new URL('../nethack-c/upstream/src/spell.c', import.meta.url), 'utf8');
const JS_SPELL = readFileSync(new URL('../js/spell.js', import.meta.url), 'utf8');

test('mkinvk_check_wall matches the source predicate and bounds guard', () => {
    // C mklev.c:2603-2613 returns false out of bounds, then accepts IS_STWALL
    // or IRONBARS. This also pins the source order before indexing levl.
    assert.match(C_MKLEV,
        /mkinvk_check_wall\(coordxy x, coordxy y\)[\s\S]*?if \(!isok\(x, y\)\)[\s\S]*?ltyp = levl\[x\]\[y\]\.typ;[\s\S]*?IS_STWALL\(ltyp\) \|\| ltyp == IRONBARS/u);
    assert.match(JS_MKLEV,
        /export function mkinvk_check_wall\(x, y, state = game\)[\s\S]*?if \(!isok\(x, y\)\) return 0;[\s\S]*?IS_STWALL\(typ\) \|\| typ === IRONBARS/u);

    const state = { level: new GameMap() };
    const x = 10; // An interior map column, so the terrain predicate is reached.
    const y = 8; // An interior map row that keeps all cases away from map edges.
    const cases = [
        [STONE, 1, 'C IS_STWALL includes STONE'],
        [HWALL, 1, 'C IS_STWALL includes a horizontal stone wall'],
        [IRONBARS, 1, 'C accepts iron bars separately from IS_STWALL'],
        [ROOM, 0, 'C rejects ordinary room terrain'],
    ];
    for (const [typ, expected, reason] of cases) {
        state.level.at(x, y).typ = typ;
        assert.equal(mkinvk_check_wall(x, y, state), expected, reason);
    }

    // x=0 is the invalid left border under C isok(), so no location is read.
    assert.equal(mkinvk_check_wall(0, y, state), 0);
});

test('deadbook rolls d(2, 6) before awaiting the invocation-area transformation', () => {
    // The source order fixes both the RNG call shape and the stairwell update.
    assert.match(C_SPELL,
        /unsigned soon = \(unsigned\) d\(2, 6\)[\s\S]*?mkinvokearea\(\);[\s\S]*?u\.uevent\.invoked = 1;/u);
    assert.match(JS_SPELL,
        /const soon = random\.d\(2, 6\);[\s\S]*?await mkinvokearea\(state, \{ \.\.\.env, random \}\);[\s\S]*?state\.u\.uevent\.invoked = true;/u);
});
