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

test('Earth boulder deaths use the source monster-kill paths', () => {
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
        /const\s+message\s*=\s*rawEnv\.message\s*\?\?\s*ttyPline/u,
    'monster-turn planning routes Earth messages through its silent owner');
    assert.match(jsFunction,
        /const\s+redraw\s*=\s*rawEnv\.redraw\s*\?\?\s*rawEnv\.newsym\s*\?\?\s*\(rawEnv\.planning\s*\?\s*\(\)\s*=>\s*\{\}\s*:\s*newsym\)/u,
    'planned boulder placement cannot repaint the live global map');
    assert.match(jsFunction,
        /else\s*\{\s*await message\([\s\S]*?await mondied\(monster, state, env\);/u,
    'non-player boulder deaths complete the C mondied lifecycle');
    assert.ok(jsFunction.indexOf('await mondied(monster, state, env)')
        < jsFunction.indexOf('await wake_nearto(x, y, 4 * 4'),
    'death cleanup remains before C’s nearby-monster wakeup');
});

test('Earth boulder planning keeps messages and redraws off the live display', () => {
    for (const name of ['drop_boulder_on_player', 'drop_boulder_on_monster']) {
        const cFunction = readSource.match(
            new RegExp(`(?:boolean|void)\\s+${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`, 'u'),
        )?.[1];
        const jsFunction = readJavascript.match(
            new RegExp(`export async function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`, 'u'),
        )?.[1];
        assert.ok(cFunction, `read.c ${name} source is present`);
        assert.ok(jsFunction, `js/read.js ${name} is present`);
        assert.match(jsFunction,
            /const\s+message\s*=\s*rawEnv\.message\s*\?\?\s*ttyPline/u,
        `${name} uses the caller's source-message owner`);
        assert.match(jsFunction,
            /const\s+redraw\s*=\s*rawEnv\.redraw\s*\?\?\s*rawEnv\.newsym\s*\?\?\s*\(rawEnv\.planning\s*\?\s*\(\)\s*=>\s*\{\}\s*:\s*newsym\)/u,
        `${name} suppresses live map redraw during clone planning`);
    }
});
