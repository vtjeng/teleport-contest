import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadPetMeleeKillRecipe } from './run-pet-melee-kill.mjs';

// cmd.c's vi-key bindings, restricted to what this recipe presses.
const DIRECTIONS = {
    h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
    y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};

test('the pet kill matrix contains only source-selected inputs', () => {
    const recipe = loadPetMeleeKillRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 4);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.equal(segment.datetime, '20270411104500');
        // A pet is the whole point of the matrix, so no row may switch it off.
        assert.match(segment.nethackrc, /pettype:(cat|dog)/u);
        // Force-fight, one direction, then a space for the --More--.
        assert.match(segment.moves, /^F[hjklyubn] $/u);
    }
});

// One row per recipe segment, in recipe order. Every figure was read off a
// replay and then confirmed against a fresh C recording by
// `node scripts/run-pet-melee-kill.mjs`, which passed with 4 segments, 11158
// PRNG calls, 16 screens and 16 cursors.
//
// `kill` is the top line after the force-fight key, and `after` the top line
// after the space that dismisses its --More--. mon.c xkilled():3703-3712 puts
// the You_hear() line on the second one, and the acoustics row shows the first
// line standing alone: pline.c You_hear():441 returns before printing, so
// nothing follows the kill and the space is left over as an unknown command.
//
// `record` is u.ualign.record after both adjalign() calls at 3704 and 3735.
// A Valkyrie starts at 0, the tame arm subtracts 15, and mtmp->malign adds
// another -9: makemon.c set_malign():2358-2362 gives a co-aligned peaceful
// monster -3 * max(3, abs(maligntyp)), and every pet here is maligntyp 0
// beside a neutral hero. All four rows therefore land on -24.
//
// `luck` is what 3665 costs. Its first disjunct is
// `mtmp->mpeaceful && !rn2(2)`, and a tame monster is peaceful too, so the
// rn2(2) is drawn before the mtame disjunct can settle it; change_luck(-1)
// runs either way.
const ROWS = [
    // The base row. rn2(9) is dog.c abuse_dog():1381, which only a tame
    // target reaches, and rn2(6)=0 opens the ordinary treasure drop.
    {
        kill: 'The kitten yowls!  You kill the poor kitten!--More--',
        after: 'You hear the rumble of distant thunder...',
        record: -24, luck: -1, uexp: 5,
        draws: ['rn2(20)=18', 'rn2(19)=16', 'rnd(20)=7', 'rn2(19)=8',
                'rnd(6)=4', 'rn2(9)=4', 'rn2(6)=0'],
    },
    // A kitten whose yelp verb comes out "hisses" instead.
    {
        kill: 'The kitten hisses!  You kill the poor kitten!--More--',
        after: 'You hear the rumble of distant thunder...',
        record: -24, luck: -1, uexp: 5,
        draws: ['rn2(20)=1', 'rn2(19)=5', 'rnd(20)=2', 'rn2(19)=15',
                'rnd(6)=6', 'rn2(9)=0', 'rn2(6)=4'],
    },
    // The base row with acoustics off. Same draws, no thunder, and no
    // --More-- on the kill line because nothing follows it.
    {
        kill: 'The kitten yowls!  You kill the poor kitten!',
        after: "Unknown command ' '.",
        record: -24, luck: -1, uexp: 5,
        draws: ['rn2(20)=18', 'rn2(19)=16', 'rnd(20)=7', 'rn2(19)=8',
                'rnd(6)=4', 'rn2(9)=4', 'rn2(6)=0'],
    },
    // A little dog, whose species name reaches the message through the same
    // x_monnam() call.
    {
        kill: 'The little dog yelps!  You kill the poor little dog!--More--',
        after: 'You hear the rumble of distant thunder...',
        record: -24, luck: -1, uexp: 5,
        draws: ['rn2(20)=0', 'rn2(19)=15', 'rnd(20)=1', 'rn2(19)=9',
                'rnd(6)=5', 'rn2(9)=8', 'rn2(6)=2'],
    },
];

function topLine(state) {
    return state.nhDisplay.grid[0].map((cell) => cell.ch).join('').trimEnd();
}

test('every pet kill reaches the mtame arms of xkilled()', async () => {
    const recipe = loadPetMeleeKillRecipe();
    for (const [index, segment] of recipe.segments.entries()) {
        const label = `segment ${index} (seed ${segment.seed})`;
        // The force-fight key alone, so the kill message can be read before
        // the space dismisses it.
        const untilKill = await runSegment({
            ...segment, moves: segment.moves.slice(0, 2),
        });
        assert.equal(topLine(game), ROWS[index].kill, `${label} kill line`);
        // The port emits one screen per consumed key plus the opening prompt.
        // A segment that stopped early would emit fewer, and stopping early is
        // what an unported arm inside xkilled() would cause.
        assert.equal(untilKill.getScreens().length, 3, `${label} screens`);

        const replay = await runSegment(segment);
        assert.equal(topLine(game), ROWS[index].after, `${label} after line`);
        assert.equal(replay.getScreens().length, 4, `${label} screens`);

        const [dx, dy] = DIRECTIONS[segment.moves[1]];
        assert.equal(
            game.level.monsters[game.u.ux + dx][game.u.uy + dy],
            null,
            `${label} removed the pet`,
        );
        for (let mon = game.level.monlist; mon; mon = mon.nmon)
            assert.ok(mon.mhp >= 1, `${label} left no dead monster`);

        assert.equal(game.u.ualign.record, ROWS[index].record,
                     `${label} alignment`);
        assert.equal(game.u.uluck, ROWS[index].luck, `${label} luck`);
        assert.equal(game.u.uexp, ROWS[index].uexp, `${label} experience`);
        assert.equal(game.u.uconduct.killer, 1, `${label} conduct`);

        const slices = replay.getRngSlices();
        // The force-fight key is the second-to-last of the two consumed.
        const attempt = slices[slices.length - 2];
        assert.deepEqual(
            attempt.slice(0, ROWS[index].draws.length), ROWS[index].draws,
            `${label} draws`,
        );
    }
});
