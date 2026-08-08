import assert from 'node:assert/strict';
import test from 'node:test';

import { P_BARE_HANDED_COMBAT, P_KNIFE, P_SPEAR, P_WHIP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { P_ADVANCE } from '../js/startup_skills.js';
import {
    loadBarehandedMeleeHitRecipe,
    loadWieldedMeleeHitRecipe,
    MELEE_DATETIME,
} from './run-hostile-melee-hit.mjs';

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
        assert.equal(segment.datetime, MELEE_DATETIME, label);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // No pet: a pet beside a hostile reaches dogmove.c's own attack, which
        // is refused, so the matrix would stop for an unrelated reason.
        assert.match(segment.nethackrc, /pettype:none/u);
        assert.ok(
            [...segment.moves].every((key) => Object.hasOwn(DIRECTIONS, key)),
            `${label} presses movement keys only`,
        );
    }
}

test('the melee hit matrix contains only source-selected inputs', () => {
    recipeHygiene(loadWieldedMeleeHitRecipe(), 10, 'wielded');
    recipeHygiene(loadBarehandedMeleeHitRecipe(), 5, 'bare-handed');
});

// One row per segment, in recipe order. Every figure was read off a replay and
// then confirmed against a fresh C recording by
// `node scripts/run-hostile-melee-hit.mjs`.
//
// `draws` is the whole of the first key's attempt, from hack.c overexertion()
// through uhitm.c passive(). The calls after it belong to the turn loop and are
// left to the fresh differential.
//
// `hp` is the target's hit points after the last key and `hpmax` its full
// total; the pair is what separates this matrix from the miss matrix beside it,
// where they are always equal.
//
// `skill` is [index, P_ADVANCE] after the segment. Every skill here starts the
// game at 20 practice, so 21 means weapon.c use_skill() ran and 20 means
// uhitm.c hmon_hitmon_dmg_recalc():1503 found train_weapon_skill FALSE -- which
// is `hmd.dmg > 1` measured before the bonuses, so it tracks the damage die
// alone.
const WIELDED = [
    // A lichen to the east. rnd(3)=2 damage, so uhitm.c:1829 sets
    // maybe_knockback and mhitm_knockback() spends rn2(3) and rn2(6).
    {
        draws: ['rn2(20)=13', 'rn2(19)=0', 'rnd(20)=10', 'rn2(19)=5',
                'rnd(3)=2', 'rn2(3)=0', 'rn2(6)=3', 'rn2(25)=10', 'rn2(3)=2'],
        turns: 1, hp: 1, hpmax: 3, name: 'lichen', weaphit: 1,
        skill: [P_KNIFE, 21], message: 'You hit the lichen.',
    },
    // The same swing with `verbose` off: uhitm.c:1648 rather than 1649-1657.
    // Its draws are identical, which is the point of the pair.
    {
        draws: ['rn2(20)=13', 'rn2(19)=0', 'rnd(20)=10', 'rn2(19)=5',
                'rnd(3)=2', 'rn2(3)=0', 'rn2(6)=3', 'rn2(25)=10', 'rn2(3)=2'],
        turns: 1, hp: 1, hpmax: 3, name: 'lichen', weaphit: 1,
        skill: [P_KNIFE, 21], message: 'You hit it.',
    },
    // rnd(3)=1, the minimal hit. No knockback pair and no skill practice.
    {
        draws: ['rn2(20)=0', 'rn2(19)=18', 'rnd(20)=11', 'rn2(19)=14',
                'rnd(3)=1', 'rn2(25)=22', 'rn2(3)=0'],
        turns: 1, hp: 2, hpmax: 3, name: 'goblin', weaphit: 1,
        skill: [P_KNIFE, 20], message: 'You hit the goblin.',
    },
    // The grid bug: MZ_TINY, so mhitm_knockback()'s size test at 5325 would
    // pass and its rn2(6) is the only thing that stops the knockback.
    {
        draws: ['rn2(20)=4', 'rn2(19)=6', 'rnd(20)=7', 'rn2(19)=9',
                'rnd(3)=2', 'rn2(3)=0', 'rn2(6)=4', 'rn2(25)=8', 'rn2(3)=2'],
        turns: 1, hp: 2, hpmax: 4, name: 'grid bug', weaphit: 1,
        skill: [P_KNIFE, 21], message: 'You hit the grid bug.',
    },
    // rnd(3)=3, the scalpel's maximum.
    {
        draws: ['rn2(20)=6', 'rn2(19)=12', 'rnd(20)=5', 'rn2(19)=8',
                'rnd(3)=3', 'rn2(3)=1', 'rn2(6)=1', 'rn2(25)=4', 'rn2(3)=2'],
        turns: 1, hp: 1, hpmax: 4, name: 'sewer rat', weaphit: 1,
        skill: [P_KNIFE, 21], message: 'You hit the sewer rat.',
    },
    {
        draws: ['rn2(20)=8', 'rn2(19)=10', 'rnd(20)=9', 'rn2(19)=13',
                'rnd(3)=1', 'rn2(25)=21', 'rn2(3)=1'],
        turns: 1, hp: 3, hpmax: 4, name: 'newt', weaphit: 1,
        skill: [P_KNIFE, 20], message: 'You hit the newt.',
    },
    // Two keys: the first lands, the second misses. `message` and `hp` describe
    // the end of the segment, `draws` the first attempt.
    {
        draws: ['rn2(20)=13', 'rn2(19)=0', 'rnd(20)=14', 'rn2(19)=13',
                'rnd(3)=1', 'rn2(25)=17', 'rn2(3)=0'],
        turns: 2, hp: 2, hpmax: 3, name: 'kobold', weaphit: 1,
        skill: [P_KNIFE, 20], message: 'You miss the kobold.',
    },
    {
        draws: ['rn2(20)=12', 'rn2(19)=4', 'rnd(20)=6', 'rn2(19)=2',
                'rnd(3)=1', 'rn2(25)=1', 'rn2(3)=2'],
        turns: 2, hp: 1, hpmax: 2, name: 'lichen', weaphit: 1,
        skill: [P_KNIFE, 20], message: 'You miss the lichen.',
    },
    // The bullwhip: oc_skill P_WHIP, so hmon_hitmon_msg_hit():1652-1653 says
    // "lash". rnd(2)=1 plus its +2 enchantment is three points, above the
    // minimal-hit bar, so the skill is practised.
    {
        draws: ['rn2(20)=18', 'rn2(19)=5', 'rnd(20)=7', 'rn2(19)=14',
                'rnd(2)=1', 'rn2(3)=2', 'rn2(6)=5', 'rn2(25)=11', 'rn2(3)=0'],
        turns: 1, hp: 1, hpmax: 4, name: 'goblin', weaphit: 1,
        skill: [P_WHIP, 21], message: 'You lash the goblin.',
    },
    // The Valkyrie's +1 spear: rnd(6) rather than rnd(3), and P_SPEAR rather
    // than P_KNIFE, so a different die and a different practice counter.
    {
        draws: ['rn2(20)=9', 'rn2(19)=0', 'rnd(20)=5', 'rn2(19)=7',
                'rnd(6)=1', 'rn2(3)=0', 'rn2(6)=4', 'rn2(25)=19', 'rn2(3)=2'],
        turns: 1, hp: 1, hpmax: 4, name: 'lichen', weaphit: 1,
        skill: [P_SPEAR, 21], message: 'You hit the lichen.',
    },
];

// The Tourist rows. Nothing wielded and no body armor or shield, so
// hmon_hitmon():1786 sets hmd.unarmed and the blow takes
// hmon_hitmon_stagger() instead of the knockback. u.uconduct.weaphit stays 0,
// because known_hitum():615-616 counts a weapon hit only.
const BAREHANDED = [
    // rnd(2)=2, so uhitm.c:1827's `hmd.dmg > 1` holds and the stagger's
    // rnd(100) is drawn. 72 is far above P_SKILL(P_BARE_HANDED_COMBAT), which
    // is 1 for an Unskilled Tourist, so the arm it guards does nothing.
    {
        draws: ['rn2(20)=13', 'rn2(19)=13', 'rnd(20)=6', 'rn2(19)=8',
                'rnd(2)=2', 'rnd(100)=72', 'rn2(25)=7', 'rn2(3)=0'],
        turns: 1, hp: 2, hpmax: 4, name: 'lichen', weaphit: 0,
        skill: [P_BARE_HANDED_COMBAT, 1], message: 'You hit the lichen.',
    },
    // rnd(2)=1, so no rnd(100) and no practice. The bare-handed twin of the
    // third wielded row above.
    {
        draws: ['rn2(20)=13', 'rn2(19)=12', 'rnd(20)=1', 'rn2(19)=17',
                'rnd(2)=1', 'rn2(25)=9', 'rn2(3)=2'],
        turns: 1, hp: 1, hpmax: 2, name: 'lichen', weaphit: 0,
        skill: [P_BARE_HANDED_COMBAT, 0], message: 'You hit the lichen.',
    },
    {
        draws: ['rn2(20)=16', 'rn2(19)=4', 'rnd(20)=2', 'rn2(19)=9',
                'rnd(2)=1', 'rn2(25)=10', 'rn2(3)=1'],
        turns: 1, hp: 3, hpmax: 4, name: 'newt', weaphit: 0,
        skill: [P_BARE_HANDED_COMBAT, 0], message: 'You hit the newt.',
    },
    {
        draws: ['rn2(20)=3', 'rn2(19)=10', 'rnd(20)=7', 'rn2(19)=10',
                'rnd(2)=1', 'rn2(25)=4', 'rn2(3)=1'],
        turns: 1, hp: 1, hpmax: 2, name: 'fox', weaphit: 0,
        skill: [P_BARE_HANDED_COMBAT, 0], message: 'You hit the fox.',
    },
    {
        draws: ['rn2(20)=13', 'rn2(19)=13', 'rnd(20)=6', 'rn2(19)=8',
                'rnd(2)=2', 'rnd(100)=72', 'rn2(25)=7', 'rn2(3)=0'],
        turns: 1, hp: 2, hpmax: 4, name: 'lichen', weaphit: 0,
        skill: [P_BARE_HANDED_COMBAT, 1], message: 'You hit it.',
    },
];

async function assertHitSegment(segment, expected, label) {
    const replay = await runSegment(segment);
    // The port emits one screen per consumed key plus the opening prompt. A
    // segment that stopped early would emit fewer, and stopping early is what
    // an unported branch inside hmon_hitmon() -- or a target that earned a
    // movement ration and retaliated -- would cause.
    assert.equal(
        replay.getScreens().length,
        segment.moves.length + 1,
        `${label} replays every key`,
    );
    // game.moves starts at 1, so the elapsed turns are one less. Every key
    // here costs a turn.
    assert.equal(game.moves - 1, expected.turns, label);

    const [dx, dy] = DIRECTIONS[segment.moves.at(-1)];
    const target = game.level.monsters[game.u.ux + dx][game.u.uy + dy];
    assert.ok(target, `${label} left the target where it stood`);
    assert.equal(target.data.pmnames.find(Boolean), expected.name, label);
    // uhitm.c:1847 subtracted the damage and the target lived: this is the one
    // assertion the miss matrix cannot make.
    assert.equal(target.mhp, expected.hp, `${label} wounded the target`);
    assert.equal(target.mhpmax, expected.hpmax, label);
    assert.ok(target.mhp >= 1, `${label} left the target alive`);
    // uhitm.c:1918 wakeup(mon, TRUE), reached because the target survived and
    // stayed on the map. setmangry() clears mstrategy at mon.c:4288.
    assert.equal(target.mstrategy, 0, label);
    assert.equal(target.msleeping, 0, label);
    assert.equal(Boolean(target.mcanmove), true, label);

    const [skill, advance] = expected.skill;
    assert.equal(P_ADVANCE(skill, game), advance, `${label} practice`);
    // known_hitum():615-616 counts the conduct once per weapon hit, and
    // hmon_hitmon():1837-1844 tests it as `<= 1`.
    assert.equal(game.u.uconduct.weaphit, expected.weaphit, label);

    // The slice belonging to the first key, which is the one that lands.
    const slices = replay.getRngSlices();
    const attempt = slices[slices.length - segment.moves.length];
    assert.deepEqual(
        attempt.slice(0, expected.draws.length), expected.draws, label,
    );
    assert.equal(game._pending_message, expected.message, label);
}

test('every wielded hit spends its calls in source order', async () => {
    const recipe = loadWieldedMeleeHitRecipe();
    for (const [index, segment] of recipe.segments.entries()) {
        await assertHitSegment(
            segment,
            WIELDED[index],
            `wielded segment ${index} (seed ${segment.seed})`,
        );
    }
});

test('every bare-handed hit takes the stagger arm, not the knockback',
    async () => {
        const recipe = loadBarehandedMeleeHitRecipe();
        for (const [index, segment] of recipe.segments.entries()) {
            await assertHitSegment(
                segment,
                BAREHANDED[index],
                `bare-handed segment ${index} (seed ${segment.seed})`,
            );
        }
    });

// The hero does not move on to the destination square: uhitm.c do_attack()
// returns TRUE, which ends hack.c domove_core() at 2799 before test_move().
test('a landed swing leaves the hero where it stood', async () => {
    const segment = loadWieldedMeleeHitRecipe().segments[0];
    await runSegment({ ...segment, moves: '' });
    const before = [game.u.ux, game.u.uy];

    await runSegment(segment);
    assert.deepEqual([game.u.ux, game.u.uy], before);
    assert.equal(game.u.umoved, false);
});
