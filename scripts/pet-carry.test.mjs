import assert from 'node:assert/strict';
import test from 'node:test';

import { droppables } from '../js/dogmove.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadPetCarryRecipe } from './run-pet-carry.mjs';

// dog.c initedog() sets edog->dropdist to 10000, and dogmove.c
// dog_invent():423 is the only line that lowers it, one statement after the
// relobj() call that empties the pack. A pet still showing 10000 has therefore
// never put anything down, whatever else has happened to it.
const NEVER_DROPPED = 10000;

// dog.c:60 sets edog->apport to ACURR(A_CHA). allmain.c newgame() calls
// makedog() at 813 and u_init_inventory_attrs() only at 815, so the attribute
// array is still zero and acurr() returns its floor. Every starting pet in
// every role begins here; scripts/run-pet-carry.mjs's header records the
// recording that confirmed it against C.
const STARTING_APPORT = 3;

function tamePet() {
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        if (monster.mtame && monster.mextra?.edog) return monster;
    }
    return null;
}

test('the pet-carry recipe contains only replay inputs', () => {
    const recipe = loadPetCarryRecipe();
    assert.equal(recipe.version, 5);
    // Fourteen is what the checked-in matrix holds; the floor guards against
    // a segment being deleted rather than pinning the exact count.
    assert.ok(recipe.segments.length >= 14);
    const seen = new Set();
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        // Only the search command, which spends a turn and moves nobody, so
        // the hero-to-pet distance each segment reaches is the pet's doing.
        assert.match(segment.moves, /^s+$/u);
        // Two searches is the shortest input that can end on two consecutive
        // command prompts.
        assert.ok(segment.moves.length >= 2);
        assert.ok(Number.isInteger(segment.seed));
        const key = `${segment.seed}:${segment.nethackrc}:${segment.moves}`;
        assert.equal(seen.has(key), false, `duplicate segment ${key}`);
        seen.add(key);
    }
});

test('each checked-in segment ends on two prompts with the pet carrying',
    async () => {
        // dogmove.c dog_invent():416 and dog_goal():502 both branch on
        // `droppables(mtmp)`, not on minvent, so that is the predicate this
        // asserts. The matrix is only evidence for the carrying arms if the
        // pet really is holding something at the two prompts it stops on.
        for (const segment of loadPetCarryRecipe().segments) {
            for (const moves of [segment.moves.slice(0, -1), segment.moves]) {
                let boundary = null;
                await runSegment(
                    { ...segment, moves },
                    { onBoundary: (error) => { boundary = error; } },
                );
                const label = `${segment.seed} after ${moves.length} searches`;
                assert.equal(
                    boundary,
                    null,
                    `${label} stopped at ${boundary?.message}`,
                );
                const pet = tamePet();
                assert.ok(pet, `${label} has no tame pet`);
                assert.ok(droppables(pet), `${label} carries nothing`);

                // dogmove.c:421-422 decrements apport only inside the guarded
                // drop, so a pet that has never dropped still holds the value
                // makedog() gave it. Both halves are checked because either
                // alone would pass on a pet that dropped and then picked the
                // same object back up.
                const edog = pet.mextra.edog;
                if (edog.dropdist === NEVER_DROPPED) {
                    assert.equal(
                        edog.apport,
                        STARTING_APPORT,
                        `${label} apport`,
                    );
                } else {
                    assert.ok(
                        edog.apport >= 1 && edog.apport < STARTING_APPORT,
                        `${label} apport ${edog.apport} after a drop`,
                    );
                }
            }
        }
    });
