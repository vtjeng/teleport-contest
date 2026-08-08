import assert from 'node:assert/strict';
import test from 'node:test';

import { P_TWO_WEAPON_COMBAT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_NEWT } from '../js/monsters.js';
import { CORPSE } from '../js/objects.js';
import { P_ADVANCE, weapon_type } from '../js/startup_skills.js';
import {
    TWOWEAPON_MELEE_DATETIME,
    loadSingleSwingControlRecipe,
    loadTwoWeaponMeleeRecipe,
    loadTwoWeaponSecondaryRecipe,
} from './run-twoweapon-melee.mjs';

// cmd.c's vi-key bindings, restricted to what these recipes press.
const DIRECTIONS = {
    h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
    y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};

function recipeHygiene(recipe, segments, label) {
    assert.equal(recipe.version, 5, label);
    assert.equal(recipe.segments.length, segments, label);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false, label);
        assert.equal(segment.datetime, TWOWEAPON_MELEE_DATETIME, label);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // No pet: a pet beside a hostile reaches dogmove.c's own attack, which
        // is refused, so the matrix would stop for an unrelated reason.
        assert.match(segment.nethackrc, /pettype:none/u);
        // Every segment is #twoweapon, possibly twice, and then one direction.
        assert.match(segment.moves, /^(?:#twoweapon\n){1,2}[hjklyubn]$/u);
    }
}

test('the two-weapon melee matrix contains only source-selected inputs', () => {
    recipeHygiene(loadTwoWeaponMeleeRecipe(), 7, 'second swing');
    recipeHygiene(loadTwoWeaponSecondaryRecipe(), 5, 'secondary weapons');
    recipeHygiene(loadSingleSwingControlRecipe(), 4, 'single swing control');
});

// One row per segment, in recipe order. Every figure was read off a replay and
// then confirmed against a fresh C recording by
// `node scripts/run-twoweapon-melee.mjs`, which passed with 16 segments, 47137
// PRNG calls, 252 screens and 252 cursors.
//
// `draws` covers the attack itself and stops before the monsters move. Its
// first two entries open every attempt -- eat.c gethungry() reached from
// hack.c overexertion(), then attrib.c exercise(A_STR, TRUE) at uhitm.c:543 --
// and what follows is the shape this matrix is here for:
//
//   rnd(20)   the first swing's to-hit roll at uhitm.c:780.
//   rn2(19)   exercise(A_DEX, TRUE) at uhitm.c:783. It follows the first roll
//             only, and only when that roll landed.
//   rnd(N)    the first swing's damage die, oc_wsdam of uwep against a small
//             target: 10 for the Samurai's katana, 6 for the Rogue's short
//             sword, 2 for the Archeologist's bullwhip.
//   rn2(25)   known_hitum():624's morale check, made for a landed blow that
//             left the target alive.
//   rn2(3)    uhitm.c:6013, the guard on passive()'s second switch.
//   rnd(20)   the second swing's to-hit roll at uhitm.c:804. No rn2(19)
//             follows it however it came out: 783 has no counterpart at 801.
//   rnd(N)    the second swing's damage die, oc_wsdam of uswapwep: 6 for the
//             short sword, 4 for the Rogue's daggers, 6 for the pick-axe.
//
// mhitm_knockback()'s rn2(3) and rn2(6) appear in no row. uhitm.c:1830 makes
// `!u.twoweap` one of maybe_knockback's conditions, so a two-weapon hit never
// sets it, and the control rows below miss the `dmg > 1` condition instead.
//
// `survivor` is the target's [mhp, mhpmax] when it lived, `null` when it died.
// `pile` is the square it stood on, outermost first.
//
// `advance` is [P_ADVANCE(P_TWO_WEAPON_COMBAT), P_ADVANCE(weapon_type(uwep))]
// after the turn, against [0, 20] before it for all three roles. weapon.c
// uwep_skill_type():1534 answers P_TWO_WEAPON_COMBAT while u.twoweap is set, so
// every blow that trained a skill here trained the two-weapon one; the control
// rows train the wielded weapon's own skill instead. A blow of one point trains
// nothing, because hmon_hitmon_weapon_melee():940 sets train_weapon_skill from
// `dmg > 1` before any bonus is applied.
//
// `weaphit` is u.uconduct.weaphit, which known_hitum():612-614 increments once
// per landed blow, so it counts how many of the two swings connected.
const SECOND_SWING = [
    // Both swings miss, which is the plainest statement that a second one
    // happens: one keystroke, two rnd(20) rolls, and nothing between them but
    // the first swing's passive().
    {
        draws: ['rn2(20)=3', 'rn2(19)=0', 'rnd(20)=20', 'rn2(3)=1',
                'rnd(20)=3'],
        message: 'You miss the sewer rat.  You miss the sewer rat.',
        survivor: [4, 4], pile: [], advance: [0, 20], weaphit: 0, uexp: 0,
    },
    // Miss then hit. The short sword's rnd(6) is the only damage die, so the
    // blow that landed was the off-hand one, and one point of damage leaves
    // train_weapon_skill FALSE.
    {
        draws: ['rn2(20)=16', 'rn2(19)=7', 'rnd(20)=6', 'rn2(3)=2',
                'rnd(20)=4', 'rnd(6)=1', 'rn2(25)=5', 'rn2(3)=1'],
        message: 'You miss the newt.  You hit the newt.',
        survivor: [2, 3], pile: [], advance: [0, 20], weaphit: 1, uexp: 0,
    },
    // Hit then miss, the mirror image: the katana's rnd(10) comes first and
    // the second roll is bare. uhitm.c:809 skips the second passive() when the
    // second swing missed, so no rn2(3) follows that roll.
    {
        draws: ['rn2(20)=19', 'rn2(19)=13', 'rnd(20)=7', 'rn2(19)=4',
                'rnd(10)=1', 'rn2(25)=12', 'rn2(3)=2', 'rnd(20)=19'],
        message: 'You hit the grid bug.  You miss the grid bug.',
        survivor: [3, 4], pile: [], advance: [0, 20], weaphit: 1, uexp: 0,
    },
    // Miss then kill, the shape seed0107 records. A grid bug is G_NOCORPSE, so
    // xkilled():3587's rn2(6)=0 opens the treasure drop and its second
    // conjunct closes it again, and make_corpse() returns nothing even though
    // corpse_chance()'s rn2(3)=0 said yes.
    {
        draws: ['rn2(20)=11', 'rn2(19)=7', 'rnd(20)=10', 'rn2(3)=1',
                'rnd(20)=1', 'rnd(6)=5', 'rn2(6)=0', 'rn2(3)=0'],
        message: 'You miss the grid bug.  You kill the grid bug!',
        survivor: null, pile: [], advance: [1, 20], weaphit: 1, uexp: 1,
    },
    // Miss then kill with corpse_chance() consulted and declining: a newt is
    // G_FREQ 5 and MZ_TINY, so the divisor is 3 and rn2(3)=1 leaves the floor
    // bare.
    {
        draws: ['rn2(20)=17', 'rn2(19)=1', 'rnd(20)=9', 'rn2(3)=1',
                'rnd(20)=3', 'rnd(6)=5', 'rn2(6)=5', 'rn2(3)=1'],
        message: 'You miss the newt.  You kill the newt!',
        survivor: null, pile: [], advance: [1, 20], weaphit: 1, uexp: 1,
    },
    // The first swing kills, so uhitm.c:799's `!malive` closes the gate and
    // the turn holds one rnd(20). rn2(4) is corpse_chance() for a sewer rat,
    // whose G_FREQ 1 and MZ_TINY make the divisor 4.
    {
        draws: ['rn2(20)=7', 'rn2(19)=3', 'rnd(20)=5', 'rn2(19)=14',
                'rnd(10)=10', 'rn2(6)=3', 'rn2(4)=3'],
        message: 'You kill the sewer rat!',
        survivor: null, pile: [], advance: [1, 20], weaphit: 1, uexp: 1,
    },
    // The same gate with a corpse left behind, so mkobj() and the corpse
    // timeout sit between the kill and the end of the turn.
    {
        draws: ['rn2(20)=12', 'rn2(19)=2', 'rnd(20)=3', 'rn2(19)=15',
                'rnd(10)=3', 'rn2(6)=2', 'rn2(3)=0'],
        message: 'You kill the newt!',
        survivor: null, pile: [[CORPSE, PM_NEWT, 1]], advance: [1, 20],
        weaphit: 1, uexp: 1,
    },
];

const SECONDARY = [
    // Both swings land and the target survives both: two damage dice, two
    // morale checks and two passive() guards in one turn. This is the only
    // combination the Samurai rows do not reach, and the only row where
    // u.uconduct.weaphit reaches 2 without a kill.
    {
        draws: ['rn2(20)=0', 'rn2(19)=10', 'rnd(20)=4', 'rn2(19)=0',
                'rnd(6)=1', 'rn2(25)=20', 'rn2(3)=2', 'rnd(20)=3',
                'rnd(4)=1', 'rn2(25)=4', 'rn2(3)=2'],
        message: 'You hit the jackal.  You hit the jackal.',
        survivor: [2, 4], pile: [], advance: [0, 20], weaphit: 2, uexp: 0,
    },
    // Hit then kill: the off-hand dagger finishes what the short sword
    // started, and both blows were above one point, so use_skill() ran twice
    // on the two-weapon skill.
    {
        draws: ['rn2(20)=4', 'rn2(19)=1', 'rnd(20)=4', 'rn2(19)=10',
                'rnd(6)=4', 'rn2(25)=15', 'rn2(3)=0', 'rnd(20)=7',
                'rnd(4)=3', 'rn2(6)=3', 'rn2(3)=1'],
        message: 'You hit the newt.  You kill the newt!',
        survivor: null, pile: [], advance: [2, 20], weaphit: 2, uexp: 1,
    },
    // Miss then hit with the dagger stack's rnd(4). uswapwep holds quan > 1
    // here, which no other loadout in the matrix offers.
    {
        draws: ['rn2(20)=13', 'rn2(19)=0', 'rnd(20)=16', 'rn2(3)=0',
                'rnd(20)=1', 'rnd(4)=4', 'rn2(25)=20', 'rn2(3)=2'],
        message: 'You miss the newt.  You hit the newt.',
        survivor: [1, 2], pile: [], advance: [1, 20], weaphit: 1, uexp: 0,
    },
    // A bullwhip lands: hmon_hitmon_msg_hit() prints "lash" for a P_WHIP
    // weapon. Both hands hold weapon-tools, so hmon_hitmon_do_hit():1391
    // reaches hmon_hitmon_weapon() through is_weptool() rather than
    // WEAPON_CLASS, for the pick-axe that kills as well as the whip.
    {
        draws: ['rn2(20)=0', 'rn2(19)=18', 'rnd(20)=3', 'rn2(19)=4',
                'rnd(2)=1', 'rn2(25)=1', 'rn2(3)=1', 'rnd(20)=6',
                'rnd(6)=2', 'rn2(6)=5', 'rn2(2)=1'],
        message: 'You lash the lichen.  You kill the lichen!',
        // A lichen's AT_TUCH sits above AT_BUTT in exper.c experience(), which
        // is worth 3 points on top of the 1 every first-level animal gives.
        survivor: null, pile: [], advance: [2, 20], weaphit: 2, uexp: 4,
    },
    // The same "lash" arm with the pick-axe missing behind it.
    {
        draws: ['rn2(20)=3', 'rn2(19)=1', 'rnd(20)=3', 'rn2(19)=15',
                'rnd(2)=1', 'rn2(25)=18', 'rn2(3)=0', 'rnd(20)=12'],
        message: 'You lash the goblin.  You miss the goblin.',
        survivor: [1, 2], pile: [], advance: [1, 20], weaphit: 1, uexp: 0,
    },
];

// The control rows. Each repeats a row above with two-weapon combat toggled
// back off, so the hero reaches the direction key holding the same weapons at
// the same place in the random-number stream.
//
// `shared` is how many draws the pair has in common, and the test also checks
// that the next draw differs, so the number states where two-weapon combat
// first shows. Three different places appear:
//
//   4 and 7  the pair agrees through the whole first swing and its passive(),
//            and then one hero swings again.
//   3        weapon.c weapon_hit_bonus():1553 reads P_TWO_WEAPON_COMBAT, which
//            starts P_UNSKILLED and pays -9 where the katana's own Basic long
//            sword skill pays 0, so rnd(20)=6 misses under two-weapon combat
//            and kills the newt without it.
//   5        the same roll and the same rnd(6)=1 damage die, but
//            hmon_hitmon_dmg_recalc():1465 takes 3/4 of the strength bonus and
//            weapon_dam_bonus():1684 answers -3, so the jackal survives a blow
//            that otherwise kills it.
const CONTROL = [
    {
        draws: ['rn2(20)=3', 'rn2(19)=0', 'rnd(20)=20', 'rn2(3)=1'],
        message: 'You miss the sewer rat.',
        survivor: [4, 4], pile: [], advance: [0, 20], weaphit: 0, uexp: 0,
        partner: SECOND_SWING[0], shared: 4,
    },
    {
        draws: ['rn2(20)=16', 'rn2(19)=7', 'rnd(20)=6', 'rn2(19)=6',
                'rnd(10)=4', 'rn2(6)=0'],
        message: 'You kill the newt!',
        // The only row in this file whose practice lands on the wielded
        // weapon's own skill.
        survivor: null, pile: [[CORPSE, PM_NEWT, 1]], advance: [0, 21],
        weaphit: 1, uexp: 1,
        partner: SECOND_SWING[1], shared: 3,
    },
    {
        draws: ['rn2(20)=19', 'rn2(19)=13', 'rnd(20)=7', 'rn2(19)=4',
                'rnd(10)=1', 'rn2(25)=12', 'rn2(3)=2'],
        message: 'You hit the grid bug.',
        survivor: [3, 4], pile: [], advance: [0, 20], weaphit: 1, uexp: 0,
        partner: SECOND_SWING[2], shared: 7,
    },
    {
        draws: ['rn2(20)=0', 'rn2(19)=10', 'rnd(20)=4', 'rn2(19)=0',
                'rnd(6)=1', 'rn2(6)=1', 'rn2(2)=1'],
        message: 'You kill the jackal!',
        survivor: null, pile: [], advance: [0, 20], weaphit: 1, uexp: 1,
        partner: SECONDARY[0], shared: 5,
    },
];

async function assertSwingSegment(segment, expected, label) {
    // The hero holds the same two weapons in both halves of a control pair, so
    // the skill the practice lands on is the only thing that can differ.
    await runSegment({ ...segment, moves: segment.moves.slice(0, -1) });
    const wtype = weapon_type(game.uwep, game);
    assert.deepEqual(
        [P_ADVANCE(P_TWO_WEAPON_COMBAT, game), P_ADVANCE(wtype, game)],
        [0, 20],
        `${label} starts untrained`,
    );

    const replay = await runSegment(segment);
    // The port emits one screen per consumed key plus the opening prompt. A
    // segment that stopped early would emit fewer, and stopping early is what
    // an unported arm inside the second swing would cause.
    assert.equal(
        replay.getScreens().length,
        segment.moves.length + 1,
        `${label} replays every key`,
    );

    const [dx, dy] = DIRECTIONS[segment.moves.at(-1)];
    const x = game.u.ux + dx;
    const y = game.u.uy + dy;
    const target = game.level.monsters[x][y];
    assert.deepEqual(
        target ? [target.mhp, target.mhpmax] : null,
        expected.survivor,
        `${label} target`,
    );

    const pile = [];
    for (let obj = game.level.objects[x][y]; obj; obj = obj.nexthere)
        pile.push([obj.otyp, obj.corpsenm, obj.quan]);
    assert.deepEqual(pile, expected.pile, `${label} pile`);

    assert.equal(game._pending_message, expected.message, label);
    assert.equal(game.u.uexp, expected.uexp, `${label} experience`);
    assert.deepEqual(
        [P_ADVANCE(P_TWO_WEAPON_COMBAT, game), P_ADVANCE(wtype, game)],
        expected.advance,
        `${label} skill practice`,
    );
    assert.equal(
        game.u.uconduct.weaphit, expected.weaphit, `${label} landed blows`,
    );

    const slices = replay.getRngSlices();
    const attempt = slices[slices.length - 1];
    assert.deepEqual(
        attempt.slice(0, expected.draws.length), expected.draws, label,
    );
    return attempt;
}

test('every two-weapon attempt swings twice unless the target has gone',
    async () => {
        const recipe = loadTwoWeaponMeleeRecipe();
        for (const [index, segment] of recipe.segments.entries()) {
            await assertSwingSegment(
                segment,
                SECOND_SWING[index],
                `second swing segment ${index} (seed ${segment.seed})`,
            );
        }
    });

test('the second swing uses the off hand whatever it holds', async () => {
    const recipe = loadTwoWeaponSecondaryRecipe();
    for (const [index, segment] of recipe.segments.entries()) {
        await assertSwingSegment(
            segment,
            SECONDARY[index],
            `secondary segment ${index} (seed ${segment.seed})`,
        );
    }
});

// The same seeds with the command toggled back off. Everything these segments
// share with their partners belongs to the first swing; everything after the
// shared prefix is what two-weapon combat added.
test('the same attempt without two-weapon combat swings once', async () => {
    const recipe = loadSingleSwingControlRecipe();
    for (const [index, segment] of recipe.segments.entries()) {
        const expected = CONTROL[index];
        const label = `control segment ${index} (seed ${segment.seed})`;
        const attempt = await assertSwingSegment(segment, expected, label);

        const partner = expected.partner.draws;
        assert.deepEqual(
            attempt.slice(0, expected.shared),
            partner.slice(0, expected.shared),
            `${label} shares its opening with its partner`,
        );
        assert.notEqual(
            attempt[expected.shared],
            partner[expected.shared],
            `${label} diverges at draw ${expected.shared}`,
        );
    }
});
