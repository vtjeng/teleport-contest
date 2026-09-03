import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { POTION_CLASS, POT_PARALYSIS, POT_SLEEPING } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';

// muse.c use_offensive()'s MUSE_POT_* case, recorded fresh against the C
// reference. Both seeds were found by replaying the port alone over
// 5000001-5000300 with these same keys and keeping the games whose created
// gnome king holds one of find_offensive()'s five potions -- makemon.c
// m_initweap():570 gives it one when `m_lev > rn2(75)` and muse.c
// rnd_offensive_item() then rolls a potion. Ten of the three hundred qualified;
// nothing here was copied from a recorded session.
//
// Each recipe creates the monster beside the hero with ^G, then rests with the
// 'm' prefix so that the monster acts. mhitu.c mattacku() reaches
// find_offensive() before any melee, so the gnome king hurls on its first move.
// The two trailing spaces answer the --More-- after the throw announcement and
// the one after the crash, which is what carries the replay through
// potion.c potionhit() and its potionbreathe() tail.
//
//   node scripts/diff-fresh.mjs recipes/monster-hurls-potion-sleeping.session.json
//   node scripts/diff-fresh.mjs recipes/monster-hurls-potion-paralysis.session.json
//
// are the differentials this test stands in for between recordings. They
// report strict parity over 4279 and 2402 random-number calls, 22 screens and
// 22 cursors apiece.
//
// The other three of find_offensive()'s five potions stop the port short of
// the same result; QUALITY.json carries a seed and the expected stop for each.
const CASES = [
    {
        label: 'sleeping',
        recipe: 'recipes/monster-hurls-potion-sleeping.session.json',
        otyp: POT_SLEEPING,
        // potion.c:2052-2064. The sleeping vapors name themselves, freeze the
        // hero and set the reason unmul() reports.
        toplines: 'The dark green potion evaporates.  You feel rather tired.',
        reason: 'sleeping off a magical draught',
    },
    {
        label: 'paralysis',
        recipe: 'recipes/monster-hurls-potion-paralysis.session.json',
        otyp: POT_PARALYSIS,
        // potion.c:2041-2051, the same shape with its own message and reason.
        toplines:
            'The dark green potion evaporates.  Something seems to be holding'
            + ' you.',
        reason: 'frozen by a potion',
    },
];

function loadRecipe(path) {
    return validateCleanRecipe(
        JSON.parse(readFileSync(path, 'utf8')),
        'hurled potion recipe',
    );
}

for (const testCase of CASES) {
    test(`a monster hurls a potion of ${testCase.label} at the hero`,
        async () => {
            const recipe = loadRecipe(testCase.recipe);
            assert.equal(recipe.segments.length, 1);
            // The two spaces that answer the throw and crash prompts are what
            // make the vapors part of the replayed result.
            assert.match(recipe.segments[0].moves, /m\.m\.m\. {2}$/u);

            let boundary;
            await runSegment(recipe.segments[0], {
                onBoundary: (error) => { boundary = error; },
            });
            assert.equal(boundary, undefined,
                'the port replays every key of the recipe');

            assert.equal(game._ttyToplines, testCase.toplines);
            // potionbreathe() sets kn for both arms, so its tail identifies
            // the type rather than offering the naming prompt.
            assert.equal(game.objects[testCase.otyp].oc_name_known, 1);
            // nomul(-rnd(5)) leaves the reason and the message unmul() prints.
            assert.equal(game.multi_reason, testCase.reason);
            assert.equal(game.nomovemsg, 'You can move again.');

            // potionhit() ends in obfree(), so the potion is gone from the
            // thrower's pack and never reached the floor.
            for (let monster = game.level.monlist;
                monster;
                monster = monster.nmon) {
                for (let obj = monster.minvent; obj; obj = obj.nobj) {
                    assert.notEqual(obj.oclass, POTION_CLASS,
                        'the hurled potion left the thrower');
                }
            }
            for (let obj = game.level.objlist; obj; obj = obj.nobj) {
                assert.notEqual(obj.otyp, testCase.otyp,
                    'a hurled potion is used up, not dropped');
            }
        });
}
