// The eat.c corpse arms scripts/run-eat-corpse.mjs cannot record, and the
// draw-by-draw shape of the ones it can.
//
// maybe_cannibal()'s penalty at eat.c:779-785, cprefx()'s domestic-animal arm
// at :814-827 and eatcorpse()'s acidic arm at :1924-1927 all need the hero to
// eat a species dungeon level one never puts beside them: their own race, the
// pet they started with, or one of the two acidic species that leave a corpse.
// QUALITY.json entry eat-corpse-arms-without-a-fresh-case carries the same
// inputs.
//
// Every case starts from a real replay -- a matrix segment stopped one command
// before the meal -- and retypes the corpse in inventory, because the species
// is the one property of the object a level-one game cannot supply. Everything
// else about it, including its age, its timer and the inventory letter the
// pickup gave it, is what the C recording produced. A retyped corpse is not a
// differential: it shows which arm the port takes, not that C takes the same
// one. The differential for the arms a recording can reach is the eight-case
// matrix, which needs the C recorder and so runs outside `npm test`.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACID_RES,
    AGGRAVATE_MONSTER,
    FROMOUTSIDE,
    LUCKMIN,
    POISON_RES,
    STONE_RES,
} from '../js/const.js';
import { corpse_intrinsic, doeat, vegetarian } from '../js/eat.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    acidic,
    is_giant,
    poisonous,
    vegan,
    your_race,
} from '../js/mondata.js';
import {
    PM_ACID_BLOB,
    PM_BROWN_PUDDING,
    PM_COCKATRICE,
    PM_FIRE_GIANT,
    PM_FLOATING_EYE,
    PM_GIANT,
    PM_GOBLIN,
    PM_HUMAN,
    PM_KILLER_BEE,
    PM_LICHEN,
    PM_LITTLE_DOG,
    PM_MONK,
    PM_NEWT,
} from '../js/monsters.js';
import { weight } from '../js/obj.js';
import { CORPSE } from '../js/objects.js';
import { CORPSE_CASES, loadEatCorpseRecipe } from './run-eat-corpse.mjs';

// Two matrix cases, each replayed only as far as its pickup: the human
// Barbarian's goblin, and the orcish Rogue's, which is that hero's own race.
const BARBARIAN = 'goblin';
const ORC = 'orcGoblin';

// The keys up to and including the pickup, and then a rest command. The rest
// matters: it leaves the game waiting for the next command rather than
// mid-read, which is what lets a pushed key answer the #eat prompt below.
function segmentUpToPickup(label) {
    const spec = CORPSE_CASES.find((entry) => entry.label === label);
    assert.ok(spec, `the matrix still holds the ${label} case`);
    const segment = loadEatCorpseRecipe().segments.find(
        ({ seed }) => seed === spec.seed,
    );
    assert.ok(segment, `the recipe still holds seed ${spec.seed}`);
    const pickup = spec.moves.indexOf(',');
    assert.notEqual(pickup, -1, `${label} picks the corpse up`);
    // The orcish Rogue's pickup raises a --More-- of its own, so the cut
    // carries whatever the case typed between the comma and the #eat command.
    const eaten = spec.moves.indexOf(`e${spec.invlet}`, pickup);
    return { ...segment, moves: `${spec.moves.slice(0, eaten)}.` };
}

// Replay up to the pickup, let the caller change the corpse and the hero, and
// answer the #eat prompt with the corpse's letter. eatcorpse() and cprefx()
// print through ttyPline() as the rest of doeat() does, so the answer is the
// top line the next flush would paint. The draw count is the other half of the
// answer: it is what separates two arms that print the same line.
async function eatRetypedCorpse(label, prepare) {
    const replay = await runSegment(segmentUpToPickup(label));
    let corpse = null;
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === CORPSE) corpse = obj;
    }
    assert.ok(corpse, 'the pickup left a corpse in inventory');
    prepare(corpse);
    corpse.owt = weight(corpse, { state: game });
    const before = { uluck: game.u.uluck, uhp: game.u.uhp };
    const drawsBefore = replay.getRngLog().length;
    // The letter answers getobj(); the spaces dismiss any --More-- the meal's
    // own lines raise, because doeat() reads them through the same queue.
    for (const key of `${corpse.invlet}    `) {
        game.nhDisplay.pushKey(key.charCodeAt(0));
    }
    let stopped = null;
    try {
        await doeat(game);
    } catch (error) {
        stopped = error;
    }
    return {
        before,
        draws: replay.getRngLog().length - drawsBefore,
        stopped,
        topLine: game._pending_message ?? '',
    };
}

// Retype the corpse and nothing else.
const retype = (corpsenm) => (corpse) => { corpse.corpsenm = corpsenm; };

test('eating your own race costs luck and aggravates monsters', async () => {
    // eat.c:770-786. The hero is a human Barbarian, so CANNIBAL_ALLOWED() is
    // false, and mondata.h your_race() is true for mons[PM_HUMAN].
    const { before, topLine } = await eatRetypedCorpse(
        BARBARIAN, retype(PM_HUMAN),
    );
    assert.ok(your_race(game.mons[PM_HUMAN], game));
    // eatcorpse()'s palatability line runs first and cprefx()'s follows it.
    // Which of the five palatable_msgs[] wordings precedes it is an rn2(5)
    // away, and a long one pushes itself onto a --More-- page of its own, so
    // only the tail of the line is fixed.
    assert.ok(topLine.endsWith('You cannibal!  You will regret this!'),
        topLine);
    // The hero is not polymorphed, so the "bad feeling deep inside" line that
    // precedes it stays out.
    assert.ok(!topLine.includes('bad feeling'));
    assert.equal(
        game.u.uprops[AGGRAVATE_MONSTER].intrinsic & FROMOUTSIDE,
        FROMOUTSIDE,
    );
    // change_luck(-rn1(4, 2)) is -5..-2, and nothing else in this replay
    // touches luck, so the whole change is the penalty.
    assert.equal(before.uluck, 0);
    assert.ok(game.u.uluck >= -5 && game.u.uluck <= -2, `${game.u.uluck}`);
    assert.ok(game.u.uluck > LUCKMIN, 'the penalty is nowhere near the floor');
});

test('an orcish hero eats an orc without penalty', async () => {
    // eat.c:51 and :770. The goblin is this hero's own race, so
    // CANNIBAL_ALLOWED() is the only thing between the meal and the penalty
    // the case above pays.
    const { before, draws, topLine } = await eatRetypedCorpse(
        ORC, () => {},
    );
    assert.notEqual(game.urole.mnum, PM_MONK, 'no Monk guilt competes');
    assert.ok(your_race(game.mons[PM_GOBLIN], game), 'a goblin is an orc');
    assert.equal(topLine, 'This goblin corpse is tough.');
    assert.equal(draws, 4, 'rot, rottenfood, palatable and the message index');
    assert.equal(game.u.uluck, before.uluck);
    assert.equal(
        game.u.uprops[AGGRAVATE_MONSTER].intrinsic & FROMOUTSIDE, 0,
    );
});

test('eating a domestic animal is a bad idea but costs no luck', async () => {
    // eat.c:814-827, cprefx()'s first switch arm. It shares
    // HAggravate_monster with the cannibalism penalty above but spends no
    // luck, which is what separates the two writes.
    const { before, topLine } = await eatRetypedCorpse(
        BARBARIAN, retype(PM_LITTLE_DOG),
    );
    assert.ok(!your_race(game.mons[PM_LITTLE_DOG], game),
        'a little dog is not the hero own kind, so no penalty competes');
    assert.equal(
        topLine, 'You feel that eating the little dog was a bad idea.',
    );
    assert.ok(!topLine.includes('cannibal'));
    assert.equal(
        game.u.uprops[AGGRAVATE_MONSTER].intrinsic & FROMOUTSIDE,
        FROMOUTSIDE,
    );
    assert.equal(game.u.uluck, before.uluck);
});

test('a pudding is vegetarian without being vegan', async () => {
    // eat.c:1870 and :1877 ask two different questions, and mondata.h:239-241
    // is where the answers part: vegetarian() adds S_PUDDING, the black
    // pudding excepted, to vegan()'s set. That makes a brown pudding the only
    // meal that tells the two conducts apart -- and monsters.h:2093 gives it
    // G_NOCORPSE, so no recording can put one in the pack and only a retyped
    // corpse reaches it.
    let before = null;
    const { stopped } = await eatRetypedCorpse(BARBARIAN, (corpse) => {
        corpse.corpsenm = PM_BROWN_PUDDING;
        // monsters.h:2100 gives it M1_ACID, which would send the meal down
        // eatcorpse()'s acid arm and its losehp(); the resistance closes that
        // arm and leaves the conducts as the only thing this case moves.
        game.u.uprops[ACID_RES].intrinsic = 1;
        before = { ...game.u.uconduct };
    });
    assert.equal(stopped, null, `${stopped?.message}`);
    assert.equal(vegan(game.mons[PM_BROWN_PUDDING]), false);
    assert.equal(vegetarian(game.mons[PM_BROWN_PUDDING]), true);
    // eat.c:1871 counted the animal product; eat.c:1882's
    // violated_vegetarian(), which is what would have counted the other and
    // made a Monk feel guilty, never ran.
    assert.equal(game.u.uconduct.unvegan, before.unvegan + 1);
    assert.equal(game.u.uconduct.unvegetarian, before.unvegetarian);
});

test('an acidic corpse burns the hero and silences the taste line',
    async () => {
        // eat.c:1924-1927. losehp() is ported, so this arm runs rather than
        // stopping; it sets `tp`, which is what silences the palatability
        // message at :1978-2015.
        const { before, draws, topLine } = await eatRetypedCorpse(
            BARBARIAN,
            (corpse) => {
                corpse.corpsenm = PM_ACID_BLOB;
                // rnd(15) can outrun a Barbarian's starting hit points, and
                // the death branch of losehp() is a boundary of its own.
                game.u.uhp = 40;
                game.u.uhpmax = 40;
            },
        );
        // monst.c gives the acid blob M1_ACID and no M1_POIS, so the arm's own
        // species test rather than the order of the chain selects it.
        assert.ok(acidic(game.mons[PM_ACID_BLOB]));
        assert.ok(!poisonous(game.mons[PM_ACID_BLOB]));
        assert.equal(before.uhp, 40);
        assert.equal(topLine, 'You have a very bad case of stomach acid.');
        assert.ok(!topLine.includes('corpse tastes'));
        assert.ok(!topLine.includes('corpse is'));
        // The acid blob never rots, so the only draw is rnd(15).
        assert.equal(draws, 1);
        // rnd(15) is 1..15, so the loss lands strictly inside this band.
        assert.ok(game.u.uhp >= 25 && game.u.uhp <= 39, `${game.u.uhp}`);
    });

// Each row is the exact top line and the exact number of random-number calls
// one retyped corpse produces. The pair is what separates the arms of
// eatcorpse()'s chain from each other: two arms that print the same line draw
// different numbers, and two that draw the same number print different lines.
const RETYPED_CASES = Object.freeze([
    // The ordinary meat corpse: rn2(20) for the rot, rn2(7) for rottenfood(),
    // rn2(10) for `palatable` and rn2(5) for the message index.
    { label: 'goblin', draws: 4, top: 'This goblin corpse is fatty.',
        prepare: retype(PM_GOBLIN) },
    // nonrotting_corpse() drops the first two draws, and vegetarian() fixes
    // the message index at 0 instead of drawing the fourth.
    { label: 'lichen', draws: 1, top: 'This lichen corpse tastes okay.',
        prepare: retype(PM_LICHEN) },
    // eat.c:1976's floating-eye arm needs u.umonnum == PM_RAVEN as well as
    // the species, and this hero is a Barbarian.
    { label: 'floatingEye', draws: 4,
        top: 'This floating eye corpse is fatty.',
        prepare: retype(PM_FLOATING_EYE) },
    // eat.c:1972. Stone resistance is what keeps eatcorpse()'s `stoneable`
    // stop off this meal and what opens the chicken arm.
    { label: 'cockatriceWithStoneResistance', draws: 2,
        top: 'This tastes just like chicken!',
        prepare: (corpse) => {
            corpse.corpsenm = PM_COCKATRICE;
            game.u.uprops[STONE_RES].intrinsic = 1;
        } },
    // The same resistance over a species the arm does not name has to leave
    // the ordinary message alone.
    { label: 'goblinWithStoneResistance', draws: 4,
        top: 'This goblin corpse is fatty.',
        prepare: (corpse) => {
            corpse.corpsenm = PM_GOBLIN;
            game.u.uprops[STONE_RES].intrinsic = 1;
        } },
    // Acid resistance closes the acidic arm, so the corpse tastes of
    // something instead of burning.
    { label: 'acidBlobWithAcidResistance', draws: 1,
        top: 'This acid blob corpse tastes okay.',
        prepare: (corpse) => {
            corpse.corpsenm = PM_ACID_BLOB;
            game.u.uprops[ACID_RES].intrinsic = 1;
        } },
    // monst.c gives the monk role monster M1_HERBIVORE without M1_CARNIVORE,
    // so `palatable` is false before the rn2(10) and the corpse tastes
    // terrible. Three draws rather than four: the tenth is never made.
    { label: 'meatToAHerbivore', draws: 3,
        top: 'This goblin corpse tastes terrible!',
        prepare: () => { game.youmonst.data = game.mons[PM_MONK]; } },
    // The newt is special to cpostfx() and to nothing eatcorpse() does.
    { label: 'newt', draws: 4, top: 'This newt corpse is fatty.',
        prepare: retype(PM_NEWT) },
]);

for (const { label, draws, top, prepare } of RETYPED_CASES) {
    test(`eatcorpse names and draws for ${label}`, async () => {
        const result = await eatRetypedCorpse(BARBARIAN, prepare);
        assert.equal(result.stopped, null, `${result.stopped?.message}`);
        assert.equal(result.topLine, top);
        assert.equal(result.draws, draws);
        // None of these is the hero's own kind or a domestic animal, so
        // cprefx() has to add nothing to the line and nothing to luck.
        assert.ok(!result.topLine.includes('cannibal'), result.topLine);
        assert.equal(game.u.uluck, result.before.uluck);
    });
}

test('rottenfood prints and applies the three-arm cascade', async () => {
    // eat.c:1949's rn2(7) is skipped when the corpse is already known rotten.
    // rottenfood() then draws rn2(4) for confusion, possibly rn2(4) for
    // blindness, and possibly rn2(3) for fainting, plus any cascade helper
    // draws (d(2,4), d(2,10), or rnd(10)).  The exact count depends on which
    // arm fires; the key assertion is that rottenfood succeeds (no throw).
    const rotten = await eatRetypedCorpse(BARBARIAN, (corpse) => {
        corpse.orotten = true;
    });
    // rottenfood draws at least 1 (the first rn2(4)) and the meal continues,
    // so the total draw count exceeds the old stop's 1.
    assert.ok(rotten.draws >= 1, `expected draws >= 1, got ${rotten.draws}`);
    assert.equal(rotten.stopped, null,
        'rottenfood() no longer throws');
});

test('the tainted-corpse arm still stops', async () => {
    // eat.c:1887 divides the elapsed turns by 10 + rn2(20), so an age 400
    // turns back leaves `rotted` above 5 whatever that draw is.
    const tainted = await eatRetypedCorpse(BARBARIAN, (corpse) => {
        corpse.age = game.moves - 400;
    });
    assert.equal(tainted.draws, 1);
    assert.equal(tainted.stopped?.message,
        'eating requires make_sick() for a tainted corpse');
});

test('corpse_intrinsic draws once per candidate and once more for strength',
    async () => {
        // eat.c:1337-1372. The draw count is the only observable: the pick is
        // uniform over the candidates, so a species with none must draw none.
        const replay = await runSegment(segmentUpToPickup(BARBARIAN));
        const measure = (index) => {
            const before = replay.getRngLog().length;
            const prop = corpse_intrinsic(game.mons[index]);
            return { prop, draws: replay.getRngLog().length - before };
        };
        // monst.c gives the goblin no mconveys and none of the three flags
        // intrinsic_possible() reads outside it.
        assert.deepEqual(measure(PM_GOBLIN), { prop: 0, draws: 0 });
        // MR_POISON alone: one candidate, one draw, and POISON_RES chosen.
        assert.deepEqual(measure(PM_KILLER_BEE),
            { prop: POISON_RES, draws: 1 });
        // MR_ACID | MR_STONE: two candidates and two draws.
        assert.deepEqual(measure(PM_ACID_BLOB), { prop: ACID_RES, draws: 2 });
        // A giant that conveys nothing is the strength-only case, where the
        // 50% draw decides between -1 and 0.
        assert.ok(is_giant(game.mons[PM_GIANT]));
        assert.equal(game.mons[PM_GIANT].mconveys, 0);
        assert.equal(measure(PM_GIANT).draws, 1, 'the 50% strength draw');
        // A giant that also conveys something leaves count above 1, so the
        // strength draw is skipped and only the candidate draw is made.
        assert.ok(is_giant(game.mons[PM_FIRE_GIANT]));
        assert.equal(measure(PM_FIRE_GIANT).draws, 1);
    });
