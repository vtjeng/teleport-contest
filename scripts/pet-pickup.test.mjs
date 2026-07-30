import assert from 'node:assert/strict';
import test from 'node:test';

import { OBJ_MINVENT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { COIN_CLASS } from '../js/objects.js';
import { loadPetPickupRecipe } from './run-pet-pickup.mjs';

// The matrix drives the pet with repeats of the bound search command, which
// spends a turn and leaves the hero where he is.
const SEARCH_KEY = 's';

function tamePets() {
    const pets = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        if (monster.mtame) pets.push(monster);
    return pets;
}

test('pet-pickup matrix contains only source-selected inputs', () => {
    const recipe = loadPetPickupRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 13);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.match(segment.nethackrc, /pettype:(cat|dog)/u);
        assert.ok(
            [...segment.moves].every((key) => key === SEARCH_KEY),
            'every segment spends its turns on the search command',
        );
    }
    // Both pline() gates in dog_invent()'s carry arm need a segment:
    // flags.verbose decides whether the line prints at all, and accessiblemsg
    // decides whether pline_xy()'s coordinate prefix precedes it.
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('!verbose'),
        ).length,
        1,
    );
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('accessiblemsg'),
        ).length,
        1,
    );
});

test('every matrix segment ends on a pet holding one new object', async () => {
    const { segments } = loadPetPickupRecipe();
    let splits = 0;
    let wholeStacks = 0;
    for (const [index, segment] of segments.entries()) {
        const replay = await runSegment(segment);
        assert.equal(
            replay.getScreens().length,
            segment.moves.length + 1,
            `segment ${index} emits one screen per key plus the first prompt`,
        );
        const carriers = tamePets().filter((pet) => pet.minvent);
        assert.equal(
            carriers.length,
            1,
            `segment ${index} ends with exactly one carrying pet`,
        );
        const carried = carriers[0].minvent;
        assert.equal(carried.where, OBJ_MINVENT);
        assert.equal(carried.ocarry, carriers[0]);
        assert.equal(carried.nobj, null);
        // can_carry() caps a nohands pet at one item, so every stack of more
        // than one leaves the rest of itself behind on the floor.
        const remainder = game.level.objects[carried.ox]?.[carried.oy];
        if (remainder && remainder.otyp === carried.otyp) ++splits;
        else ++wholeStacks;
    }
    // Both arms of `carryamt != obj->quan` have to stay covered.
    assert.ok(splits > 0, 'the matrix splits at least one stack');
    assert.ok(wholeStacks > 0, 'the matrix takes at least one whole stack');
});

test('the matrix covers coins, other classes, and both pet species',
    async () => {
        const { segments } = loadPetPickupRecipe();
        const classes = new Set();
        const species = new Set();
        for (const segment of segments) {
            await runSegment(segment);
            const carrier = tamePets().find((pet) => pet.minvent);
            classes.add(carrier.minvent.oclass);
            species.add(carrier.data.pmidx);
        }
        // Coins are the stack doname() prints with a quantity prefix; the
        // other classes reach its article branch instead.
        assert.ok(classes.has(COIN_CLASS));
        assert.ok(classes.size >= 6, `only ${classes.size} object classes`);
        assert.equal(species.size, 2);
    });
