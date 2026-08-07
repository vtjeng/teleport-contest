import assert from 'node:assert/strict';
import test from 'node:test';

import { DOOR, D_ISOPEN, D_NODOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    loadDoorlessPetDisplacementRecipe,
    loadPetDoorwayDisplacementRecipe,
} from './run-pet-doorway-displacement.mjs';

// cmd.c's vi-key bindings, restricted to what these recipes press. 's' is
// dosearch(), which the recipes use to give the pet a turn to walk onto the
// diagonal the hero is about to press.
const DIRECTIONS = {
    h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
    y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};
const SEARCH = 's';

function doorMask(location) {
    return location?.flags || location?.doormask || 0;
}

// Compare the final key's random-number slice with the calls do_attack() owes.
// A step that spends no time owes nothing else, so its slice is pinned whole; a
// step that does spend one goes on to the monster loop, whose calls belong to
// other subsystems and are left to the fresh differential.
function assertLeadingDraws(replay, draws, label) {
    const slice = replay.getRngSlices().at(-1);
    assert.deepEqual(slice.slice(0, draws.length), draws, label);
    if (draws.length === 1) assert.deepEqual(slice, draws, label);
}

// Every segment starts with exactly one tame monster and none of them creates
// a second, so this is the starting pet.
function tameMonster() {
    let found = null;
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        if (!monster.mtame) continue;
        assert.equal(found, null, 'exactly one tame monster');
        found = monster;
    }
    return found;
}

function recipeHygiene(recipe, segments, label) {
    assert.equal(recipe.version, 5, label);
    assert.equal(recipe.segments.length, segments, label);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false, label);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.match(segment.nethackrc, /pettype:(dog|cat)/u);
        assert.ok(
            [...segment.moves].every(
                (key) => Object.hasOwn(DIRECTIONS, key) || key === SEARCH,
            ),
            `${label} presses movement and search keys only`,
        );
        assert.ok(
            Object.hasOwn(DIRECTIONS, segment.moves.at(-1))
                && DIRECTIONS[segment.moves.at(-1)][0]
                && DIRECTIONS[segment.moves.at(-1)][1],
            `${label} ends on a diagonal`,
        );
    }
}

test('the pet doorway matrix contains only source-selected inputs', () => {
    recipeHygiene(loadPetDoorwayDisplacementRecipe(), 8, 'intact');
    recipeHygiene(loadDoorlessPetDisplacementRecipe(), 2, 'doorless');
    // hack.c:1208 reads both dx and dy, so a matrix that pressed one diagonal
    // would pin nothing about the other three.
    const diagonals = new Set();
    for (const recipe of [
        loadPetDoorwayDisplacementRecipe(),
        loadDoorlessPetDisplacementRecipe(),
    ]) {
        for (const segment of recipe.segments)
            diagonals.add(segment.moves.at(-1));
    }
    assert.deepEqual([...diagonals].sort(), ['b', 'n', 'u', 'y']);
});

// One row per segment, in recipe order. Each row records what the port must
// produce on the final diagonal; every figure was read off a replay and then
// confirmed against a fresh C recording by
// `node scripts/run-pet-doorway-displacement.mjs`.
//
// `turns` counts the turns the whole segment spends, which is one per key that
// costs time. A walk and a search each cost one; the refused diagonal costs
// nothing, and the diagonal the pet declines costs one. So a segment whose
// `turns` equals its key count is a `!rn2(7)` segment and one short of it is a
// declined-attack segment.
//
// `draws` opens the final key's random-number slice and is what separates the
// two outcomes: uhitm.c:474 always draws rn2(7), and only the zero outcome goes
// on to uhitm.c:497's rnd(6). A declined attack draws nothing else at all,
// because test_move() refuses without spending time, so its row is the entire
// slice; see assertLeadingDraws().
const EXIT_REFUSAL = "You can't move diagonally out of an intact doorway.";
const INTACT = [
    // 'hu': walk west onto the doorway, then northeast into the dog.
    { turns: 1, draws: ['rn2(7)=1'], message: EXIT_REFUSAL },
    // The same seed and keys with mention_walls off, so nothing is printed.
    { turns: 1, draws: ['rn2(7)=1'], message: '' },
    // 'ukb': two walks, then southwest.
    { turns: 2, draws: ['rn2(7)=1'], message: EXIT_REFUSAL },
    // 'yyhn': three walks, then southeast.
    { turns: 3, draws: ['rn2(7)=2'], message: EXIT_REFUSAL },
    // 'lsy': a walk, a search that lets the dog come around, then northwest.
    { turns: 2, draws: ['rn2(7)=5'], message: EXIT_REFUSAL },
    // 'lllsb': the `!rn2(7)` outcome. uhitm.c:497 flees the dog for rnd(6)
    // turns and :502 consumes the move, so all five keys cost time.
    {
        turns: 5,
        draws: ['rn2(7)=0', 'rnd(6)=2'],
        message: 'You stop.  Your little dog is in the way!',
    },
    // 'ulb': the Healer and cat on the second date.
    { turns: 2, draws: ['rn2(7)=3'], message: EXIT_REFUSAL },
    // 'hhhu': the `!rn2(7)` outcome on that second role and date.
    {
        turns: 4,
        draws: ['rn2(7)=0', 'rnd(6)=5'],
        message: 'You stop.  Your kitten is in the way!',
    },
];

test('every intact-doorway segment draws before the doorway rule decides',
    async () => {
        const recipe = loadPetDoorwayDisplacementRecipe();
        for (const [index, segment] of recipe.segments.entries()) {
            const expected = INTACT[index];
            const label = `segment ${index} (seed ${segment.seed})`;
            const replay = await runSegment(segment);
            // The port emits one screen per consumed key plus the opening
            // prompt, so a segment that stopped early would emit fewer.
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `${label} replays every key`,
            );
            // game.moves starts at 1, so the elapsed turns are one less.
            assert.equal(game.moves - 1, expected.turns, label);

            const [dx, dy] = DIRECTIONS[segment.moves.at(-1)];
            const here = game.level.at(game.u.ux, game.u.uy);
            assert.equal(here.typ, DOOR, `${label} ends on a doorway`);
            assert.equal(doorMask(here), D_ISOPEN, `${label} door is intact`);
            const pet = tameMonster();
            assert.ok(pet, `${label} still has its pet`);

            if (expected.draws.length === 1) {
                // do_attack() declined and test_move() refused, so no turn
                // elapsed: the pet is still on the square the key aimed at and
                // was never made to flee.
                assert.deepEqual(
                    [pet.mx, pet.my],
                    [game.u.ux + dx, game.u.uy + dy],
                    `${label} left the pet on the diagonal`,
                );
                assert.equal(pet.mflee, false, label);
            } else {
                // uhitm.c:497 is monflee(mtmp, rnd(6), FALSE, FALSE). The turn
                // then elapses, which decrements the timer once and lets the
                // pet walk off the diagonal, so the timer is what survives.
                const rolled = Number(expected.draws[1].split('=')[1]);
                assert.equal(pet.mflee, true, label);
                assert.equal(pet.mfleetim, rolled - 1, label);
            }

            assertLeadingDraws(replay, expected.draws, label);
            assert.equal(game._pending_message, expected.message, label);
        }
    });

// The negative half: the same displacement over a doorway with no door in it.
// Both segments walk one square onto the doorless doorway and then take the
// diagonal, so `turns` equals the key count and the pet ends where the hero
// started. The second draw is domove_swap_with_pet()'s.
const DOORLESS = [
    { turns: 2, draws: ['rn2(7)=2', 'rn2(5)=3'] },
    { turns: 2, draws: ['rn2(7)=4', 'rn2(5)=0'] },
];

test('a doorless doorway lets the same displacement complete', async () => {
    const recipe = loadDoorlessPetDisplacementRecipe();
    for (const [index, segment] of recipe.segments.entries()) {
        const expected = DOORLESS[index];
        const label = `segment ${index} (seed ${segment.seed})`;
        // Replay the segment without its last key to learn where both stood
        // before the diagonal, which is what shows they exchanged squares.
        await runSegment({ ...segment, moves: segment.moves.slice(0, -1) });
        const heroBefore = [game.u.ux, game.u.uy];
        const petBefore = [tameMonster().mx, tameMonster().my];

        const replay = await runSegment(segment);
        assert.equal(
            replay.getScreens().length,
            segment.moves.length + 1,
            `${label} replays every key`,
        );
        assert.equal(game.moves - 1, expected.turns, label);
        const left = game.level.at(...heroBefore);
        assert.equal(left.typ, DOOR, `${label} left a doorway`);
        assert.equal(doorMask(left), D_NODOOR, `${label} had no door in it`);
        // The hero crossed onto the pet's square, which is the whole
        // difference from the intact-doorway segments above. The pet's own
        // final square is not asserted: the swap spends the turn, and the pet
        // gets its move before the segment ends.
        assert.deepEqual([game.u.ux, game.u.uy], petBefore, label);
        assertLeadingDraws(replay, expected.draws, label);
        assert.equal(
            game._pending_message,
            'You swap places with your little dog.',
            label,
        );
    }
});
