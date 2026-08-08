import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    loadBarehandedMeleeKillRecipe,
    loadWieldedMeleeKillRecipe,
    KILL_DATETIME,
} from './run-hostile-melee-kill.mjs';

// cmd.c's vi-key bindings, restricted to what these recipes press.
const DIRECTIONS = {
    h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
    y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};

const CORPSE = 265; // objects.js CORPSE, the otyp make_corpse() produces.

function recipeHygiene(recipe, segments, label) {
    assert.equal(recipe.version, 5, label);
    assert.equal(recipe.segments.length, segments, label);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false, label);
        assert.equal(segment.datetime, KILL_DATETIME, label);
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

test('the melee kill matrix contains only source-selected inputs', () => {
    recipeHygiene(loadWieldedMeleeKillRecipe(), 13, 'wielded');
    recipeHygiene(loadBarehandedMeleeKillRecipe(), 6, 'bare-handed');
});

// One row per segment, in recipe order. Every figure was read off a replay and
// then confirmed against a fresh C recording by
// `node scripts/run-hostile-melee-kill.mjs`, which passed with 19 segments,
// 56460 PRNG calls, 38 screens and 38 cursors.
//
// `draws` is the whole of the key's attempt, from hack.c overexertion() through
// the end of the turn. Two of its entries belong to xkilled() itself and appear
// in every row in this order:
//
//   rn2(6)    3587, the treasure drop. A zero opens mkobj()'s own rolls.
//   rn2(tmp)  corpse_chance():3248, where tmp is 2, 3 or 4 by species.
//
// `pile` is the square the target stood on, read outermost first, which is the
// order place_object() leaves. `[]` means the kill left bare floor.
//
// `record` is u.ualign.record after adjalign(mtmp->malign) at 3735. A Valkyrie
// starts at 0 and a Rogue at 10; the increments here are what makemon.c
// set_malign() gave each target, which is 5 for an always-hostile kobold, 3 for
// a goblin and 0 for the neutral animals.
//
// `uexp` is exper.c experience() through more_experienced(): 1 for a
// first-level animal with no special attack, 4 for a lichen (AT_TUCH is above
// AT_BUTT, so 3 extra) and 6 for a weapon-carrying kobold or goblin (AT_WEAP
// adds 5).
const WIELDED = [
    // A lichen: G_FREQ 4 clears `< 2` and MZ_SMALL is not verysmall, so the
    // divisor is 2. rn2(6)=1 declines the drop and rn2(2)=0 leaves the corpse,
    // whose mksobj() and start_corpse_timeout() spend everything after it.
    {
        draws: ['rn2(20)=13', 'rn2(19)=13', 'rnd(20)=12', 'rn2(19)=16',
                'rnd(6)=1', 'rn2(6)=1', 'rn2(2)=0'],
        message: 'You kill the lichen!', uexp: 4, record: 0,
        pile: [[CORPSE, 158, 1]],
    },
    // A sewer rat, the only divisor-4 species here: G_FREQ 1 passes `< 2` and
    // MZ_TINY passes verysmall(). rn2(4)=1 leaves bare floor, which is the
    // outcome seed0006's recorded rat has.
    {
        draws: ['rn2(20)=4', 'rn2(19)=17', 'rnd(20)=9', 'rn2(19)=4',
                'rnd(6)=4', 'rn2(6)=1', 'rn2(4)=1'],
        message: 'You kill the sewer rat!', uexp: 1, record: 0, pile: [],
    },
    // rn2(6)=0 opens the drop, and the glass gem it makes is neither food nor
    // oversized, so 3623-3625 place and stack it. rn2(4)=2 then declines the
    // corpse, leaving the drop alone on the square.
    {
        draws: ['rn2(20)=1', 'rn2(19)=17', 'rnd(20)=9', 'rn2(19)=0',
                'rnd(6)=1', 'rn2(6)=0', 'rnd(100)=52', 'rnd(1000)=817',
                'rnd(2)=1', 'rn2(6)=5', 'rn2(4)=2'],
        message: 'You kill the sewer rat!', uexp: 1, record: 0,
        pile: [[469, 0, 1]], // WORTHLESS_VIOLET_GLASS
    },
    // rn2(6)=0 again, but this drop is deleted rather than placed: the rn2(100)
    // is zap.c obj_resists() inside invent.c delobj(), which only the delete
    // arms reach. rn2(2)=1 declines the corpse, so the square ends up empty.
    {
        draws: ['rn2(20)=19', 'rn2(19)=5', 'rnd(20)=8', 'rn2(19)=1',
                'rnd(6)=6', 'rn2(6)=0', 'rnd(100)=32', 'rnd(1000)=83',
                'rnd(2)=1', 'rn2(6)=1', 'rn2(100)=38', 'rn2(2)=1'],
        message: 'You kill the jackal!', uexp: 1, record: 0, pile: [],
    },
    // A grid bug with rn2(6)=0. Nothing follows it, because 3587's second
    // conjunct rejects a G_NOCORPSE species; make_corpse() returns 0 at 849 for
    // the same flag even though corpse_chance()'s rn2(3)=0 said yes.
    {
        draws: ['rn2(20)=6', 'rn2(19)=4', 'rnd(20)=1', 'rn2(19)=15',
                'rnd(6)=6', 'rn2(6)=0', 'rn2(3)=0'],
        message: 'You kill the grid bug!', uexp: 1, record: 0, pile: [],
    },
    // A goblin carrying two daggers it is not wielding, so m_detach():2779
    // relobj() drops both, and rn2(6)=0 adds a third object which stacks with
    // one of them. rn2(2)=1 declines the corpse.
    {
        draws: ['rn2(20)=14', 'rn2(19)=3', 'rnd(20)=10', 'rn2(19)=0',
                'rnd(6)=3', 'rn2(6)=0', 'rnd(100)=4', 'rnd(1002)=426',
                'rnd(2)=1', 'rn2(11)=1', 'rn2(10)=8', 'rn2(10)=5',
                'rn2(20)=16', 'rn2(2)=1'],
        message: 'You kill the goblin!', uexp: 6, record: 3,
        pile: [[35, -1, 1], [36, -1, 1]], // ELVEN_DAGGER, ORCISH_DAGGER
    },
    // The goblin that leaves a corpse, which is seed0200's recorded outcome:
    // divisor 2 by way of G_FREQ 2 failing `< 2`, not by the lichen's route.
    {
        draws: ['rn2(20)=12', 'rn2(19)=12', 'rnd(20)=5', 'rn2(19)=1',
                'rnd(6)=4', 'rn2(6)=1', 'rn2(2)=0'],
        message: 'You kill the goblin!', uexp: 6, record: 3,
        pile: [[CORPSE, 70, 1]],
    },
    // Both halves at once: rn2(6)=0 places a potion and rn2(3)=0 leaves a fox
    // corpse, so the square carries two objects from two different arms.
    {
        draws: ['rn2(20)=17', 'rn2(19)=16', 'rnd(20)=11', 'rn2(19)=8',
                'rnd(6)=1', 'rn2(6)=0', 'rnd(100)=71', 'rnd(1000)=505',
                'rnd(2)=2', 'rn2(4)=1', 'rn2(3)=0'],
        message: 'You kill the fox!', uexp: 4, record: 0,
        pile: [[CORPSE, 13, 1], [308, 0, 1]], // POT_EXTRA_HEALING under it
    },
    // A kobold: always_hostile and not co-aligned with a neutral hero, so
    // set_malign() gave it max(5, 2) and adjalign() adds 5.
    {
        draws: ['rn2(20)=6', 'rn2(19)=6', 'rnd(20)=1', 'rn2(19)=5',
                'rnd(6)=5', 'rn2(6)=2', 'rn2(3)=1'],
        message: 'You kill the kobold!', uexp: 6, record: 5, pile: [],
    },
    // The same species with the corpse taken instead of declined.
    {
        draws: ['rn2(20)=13', 'rn2(19)=9', 'rnd(20)=14', 'rn2(19)=10',
                'rnd(6)=1', 'rn2(6)=3', 'rn2(3)=0'],
        message: 'You kill the kobold!', uexp: 6, record: 5,
        pile: [[CORPSE, 59, 1]],
    },
    // A chaotic hero against the same species: sgn(-2) now matches
    // sgn(u.ualign.type), so set_malign()'s always-hostile arm gives 0 and the
    // record stays at the Rogue's starting 10 while the kill still counts.
    {
        draws: ['rn2(20)=11', 'rn2(19)=6', 'rnd(20)=10', 'rn2(19)=15',
                'rnd(6)=5', 'rn2(6)=5', 'rn2(3)=0'],
        message: 'You kill the kobold!', uexp: 6, record: 10,
        pile: [[CORPSE, 59, 1], [24, -1, 9]], // its stack of darts beneath
    },
    // A kobold zombie: mondata.h nonliving() is true, so 3507 prints "destroy"
    // rather than "kill". rn2(3)=1 declines the corpse, which is what keeps
    // make_corpse()'s undead arm out of reach.
    {
        draws: ['rn2(20)=5', 'rn2(19)=8', 'rnd(20)=14', 'rn2(19)=13',
                'rnd(6)=4', 'rn2(6)=1', 'rn2(3)=1'],
        message: 'You destroy the kobold zombie!', uexp: 1, record: 10,
        pile: [],
    },
    // A newt whose drop lands, under the chaotic hero.
    {
        draws: ['rn2(20)=16', 'rn2(19)=7', 'rnd(20)=8', 'rn2(19)=15',
                'rnd(6)=5', 'rn2(6)=0', 'rnd(100)=45', 'rnd(1000)=861',
                'rnd(2)=1', 'rn2(3)=1'],
        message: 'You kill the newt!', uexp: 1, record: 10,
        pile: [[245, -1, 1]], // TIN_WHISTLE
    },
];

// The bare-handed rows. rnd(2) or rnd(4) is the damage die and the rnd(100)
// after it is hmon_hitmon_stagger():1571, which every blow above one point
// spends; from killed() onwards nothing differs from the wielded half.
const BAREHANDED = [
    {
        draws: ['rn2(20)=18', 'rn2(19)=2', 'rnd(20)=8', 'rn2(19)=8',
                'rnd(2)=2', 'rnd(100)=44', 'rn2(6)=1', 'rn2(2)=0'],
        message: 'You kill the lichen!', uexp: 4, record: 0,
        pile: [[CORPSE, 158, 1]],
    },
    {
        draws: ['rn2(20)=7', 'rn2(19)=0', 'rnd(20)=4', 'rn2(19)=15',
                'rnd(2)=2', 'rnd(100)=98', 'rn2(6)=2', 'rn2(2)=1'],
        message: 'You kill the goblin!', uexp: 6, record: 3,
        pile: [[36, -1, 1]], // the goblin's orcish dagger, dropped by relobj()
    },
    // A Monk, whose martial-arts die is rnd(4). rn2(6)=0 opens the drop and
    // delobj()'s rn2(100) removes what mkobj() made.
    {
        draws: ['rn2(20)=6', 'rn2(19)=4', 'rnd(20)=5', 'rn2(19)=14',
                'rnd(4)=1', 'rnd(100)=7', 'rn2(6)=0', 'rnd(100)=32',
                'rnd(1000)=289', 'rnd(2)=1', 'rn2(6)=4', 'rn2(100)=53',
                'rn2(2)=1'],
        message: 'You kill the lichen!', uexp: 4, record: 10, pile: [],
    },
    // A Monk whose drop lands: mkobj() made five gold pieces, so this is the
    // one row where the drop is a multi-quantity object.
    {
        draws: ['rn2(20)=14', 'rn2(19)=1', 'rnd(20)=10', 'rn2(19)=0',
                'rnd(4)=3', 'rnd(100)=63', 'rn2(6)=0', 'rnd(100)=24',
                'rnd(1000)=172', 'rnd(2)=1', 'rn2(3)=2', 'rn2(6)=4',
                'rn2(100)=53', 'rn2(3)=1'],
        message: 'You kill the newt!', uexp: 1, record: 10,
        pile: [[438, -1, 5]], // GOLD_PIECE
    },
    {
        draws: ['rn2(20)=14', 'rn2(19)=6', 'rnd(20)=15', 'rn2(19)=14',
                'rnd(4)=4', 'rnd(100)=95', 'rn2(6)=3', 'rn2(2)=0'],
        message: 'You kill the goblin!', uexp: 6, record: 10,
        pile: [[CORPSE, 70, 1]],
    },
    // The same kill with `verbose` off. killed() consults no such setting, so
    // this row must match the one above it exactly.
    {
        draws: ['rn2(20)=14', 'rn2(19)=6', 'rnd(20)=15', 'rn2(19)=14',
                'rnd(4)=4', 'rnd(100)=95', 'rn2(6)=3', 'rn2(2)=0'],
        message: 'You kill the goblin!', uexp: 6, record: 10,
        pile: [[CORPSE, 70, 1]],
    },
];

async function assertKillSegment(segment, expected, label) {
    const replay = await runSegment(segment);
    // The port emits one screen per consumed key plus the opening prompt. A
    // segment that stopped early would emit fewer, and stopping early is what
    // an unported arm inside xkilled() would cause.
    assert.equal(
        replay.getScreens().length,
        segment.moves.length + 1,
        `${label} replays every key`,
    );
    // game.moves starts at 1, so one key costs one turn.
    assert.equal(game.moves - 1, segment.moves.length, label);

    const [dx, dy] = DIRECTIONS[segment.moves.at(-1)];
    const x = game.u.ux + dx;
    const y = game.u.uy + dy;
    // m_detach() -> mon_leaving_level() took it off the map, and dmonsfree()
    // unlinked it at the end of the turn, so iflags.purge_monsters is back to
    // zero and nothing stands where the target did.
    assert.equal(game.level.monsters[x][y], null, `${label} removed target`);
    assert.equal(game.iflags.purge_monsters, 0, `${label} freed the node`);
    for (let mon = game.level.monlist; mon; mon = mon.nmon)
        assert.ok(mon.mhp >= 1, `${label} left no dead monster on the chain`);

    const pile = [];
    for (let obj = game.level.objects[x][y]; obj; obj = obj.nexthere)
        pile.push([obj.otyp, obj.corpsenm, obj.quan]);
    assert.deepEqual(pile, expected.pile, `${label} pile`);

    assert.equal(game._pending_message, expected.message, label);
    // exper.c more_experienced(): the score half takes four times the points.
    assert.equal(game.u.uexp, expected.uexp, `${label} experience`);
    assert.equal(game.u.urexp, 4 * expected.uexp, `${label} score`);
    assert.equal(game.u.ulevel, 1, `${label} stayed at level one`);
    assert.equal(game.u.ualign.record, expected.record, `${label} alignment`);
    // xkilled():3502's conduct counter, and the luck 3665 would have cost for
    // a peaceful or tame target.
    assert.equal(game.u.uconduct.killer, 1, `${label} conduct`);
    assert.equal(game.u.uluck, 0, `${label} luck`);

    const slices = replay.getRngSlices();
    const attempt = slices[slices.length - segment.moves.length];
    assert.deepEqual(
        attempt.slice(0, expected.draws.length), expected.draws, label,
    );
}

test('every wielded kill spends its calls in source order', async () => {
    const recipe = loadWieldedMeleeKillRecipe();
    for (const [index, segment] of recipe.segments.entries()) {
        await assertKillSegment(
            segment,
            WIELDED[index],
            `wielded segment ${index} (seed ${segment.seed})`,
        );
    }
});

test('every bare-handed kill reaches the same mon.c arms', async () => {
    const recipe = loadBarehandedMeleeKillRecipe();
    for (const [index, segment] of recipe.segments.entries()) {
        await assertKillSegment(
            segment,
            BAREHANDED[index],
            `bare-handed segment ${index} (seed ${segment.seed})`,
        );
    }
});

// The hero does not step onto the square it just cleared: uhitm.c do_attack()
// returns TRUE, which ends hack.c domove_core() before test_move().
test('a fatal blow leaves the hero where it stood', async () => {
    const segment = loadWieldedMeleeKillRecipe().segments[0];
    await runSegment({ ...segment, moves: '' });
    const before = [game.u.ux, game.u.uy];

    await runSegment(segment);
    assert.deepEqual([game.u.ux, game.u.uy], before);
    assert.equal(game.u.umoved, false);
});
