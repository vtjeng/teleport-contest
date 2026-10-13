import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { avoid_ceiling } from '../js/dungeon.js';

const dungeonSource = readFileSync(
    new URL('../nethack-c/upstream/src/dungeon.c', import.meta.url),
    'utf8',
);
const readSource = readFileSync(
    new URL('../nethack-c/upstream/src/read.c', import.meta.url),
    'utf8',
);
const readJavascript = readFileSync(
    new URL('../js/read.js', import.meta.url),
    'utf8',
);

test('avoid_ceiling follows dungeon.c quest and ceiling predicates', () => {
    const sourceFunction = dungeonSource.match(
        /avoid_ceiling\(d_level \*lev\)[^{]*\{([\s\S]*?)\n\}/u,
    )?.[1];
    assert.ok(sourceFunction, 'dungeon.c avoid_ceiling source is present');
    assert.match(sourceFunction,
        /if\s*\(In_quest\(lev\)\s*\|\|\s*!has_ceiling\(lev\)\)/u);

    const state = {
        quest_dnum: 2,
        astral_level: { dnum: 9, dlevel: 1 },
        earth_level: { dnum: 9, dlevel: 5 },
    };
    assert.equal(avoid_ceiling({ dnum: 1, dlevel: 3 }, state), false);
    assert.equal(avoid_ceiling({ dnum: 2, dlevel: 3 }, state), true);
    assert.equal(avoid_ceiling({ dnum: 9, dlevel: 2 }, state), true);
    assert.equal(avoid_ceiling({ dnum: 9, dlevel: 5 }, state), false);
});

test('a by-you earth boulder uses the source monster-kill path', () => {
    // This selected branch is the lethal by-you boulder in read.c's
    // drop_boulder_on_monster; the admitted v54 recording reaches it when its
    // boulder kills the lichen. C calls killed() before wake_nearto().
    const cFunction = readSource.match(
        /boolean\s+drop_boulder_on_monster\([^)]*\)\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    const jsFunction = readJavascript.match(
        /export async function drop_boulder_on_monster\([^)]*\)\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    assert.ok(cFunction, 'read.c drop_boulder_on_monster source is present');
    assert.ok(jsFunction, 'js/read.js drop_boulder_on_monster is present');
    assert.match(cFunction,
        /mtmp->mhp\s*-=?\s*mdmg;[\s\S]*?if\s*\(DEADMONSTER\(mtmp\)\)\s*\{\s*if\s*\(byu\)\s*\{\s*killed\(mtmp\);/u);
    assert.match(jsFunction,
        /monster\.mhp\s*-=?\s*damage;[\s\S]*?if\s*\(monster\.mhp\s*<\s*1\)\s*\{\s*if\s*\(byu\)\s*\{\s*await killed\(monster, state, env\);/u);
    assert.ok(jsFunction.indexOf('await killed(monster, state, env)')
        < jsFunction.indexOf('await wake_nearto(x, y, 4 * 4'),
    'kill cleanup remains before the source-ordered nearby-monster wakeup');
    assert.match(jsFunction,
        /else\s*\{\s*await ttyPline\([\s\S]*?note_unported\('mon\.c mondied'\);/u,
    'the separate non-player mondied gap remains visible');
});
