// Focused tests for the meal that takes one turn: eat.c doeat()'s FOOD_CLASS
// path, start_eating(), done_eating(), and the nutrition and weight helpers
// they share. scripts/run-eat-one-turn.mjs holds the end-to-end differential.
//
// Thirty relational, logical and boolean mutants over this slice's diff
// survived the whole suite when the slice was measured at 9a7aef5. That figure
// has not been re-measured since, and the assertions added afterwards kill at
// least five of it: doeat()'s `meal.usedtime = 0` mutated either way and
// start_eating()'s `meal.eating = 1` and `meal.fullwarn = 0`, all four now read
// by the cram-ration boundary's whole-struct comparison, and fpostfx()'s
// eucalyptus `||`, which a test now enters from both sides. The survivors
// divide into three groups.
//
// Seven are equivalent, so no test can kill them: eaten_stat()'s `scaled < 1`
// answers 1 at scaled 1 either way; consume_oeaten()'s `amt > 0` and
// `oeaten > -amt` both reach the same clamp at their boundary values;
// start_eating()'s `++usedtime >= reqtime` compares 1 with the 0 that
// consume_oeaten() has just left, and its done_eating() argument is false in
// every spelling; and rounddiv()'s two sign tests negate both the value and
// the sign, which leaves +0 at zero and throws before reaching zero for the
// divisor.
//
// One is a write on the reachable path that is equivalent all the same:
// done_eating()'s `piece.in_use = true`, whose only reader is the useup() two
// statements later, because neither the newuhs() call nor the nomovemsg test
// between them can throw for a one-turn meal. It becomes observable in slice 3,
// where a meal can be interrupted between the two.
//
// The rest guard branches no reachable state can enter, each named where it
// sits: a pack already holding all fifty-two letters, a bite taken above 2000
// nutrition, a multi-turn meal's positive nmod, a zero-nutrition comestible,
// lycanthropy, a slime mold, a K-ration or C-ration, a cream pie or candy bar
// or lump of royal jelly, a corpse in the pack, and a meal that ends below 150
// nutrition. Two of those, the K-ration wording and the unvegan conduct chain,
// survive for a second reason worth knowing: JavaScript binds `&&` tighter than
// `||`, so rewriting one `||` inside a chain of them leaves an earlier true
// term deciding the answer.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ECMD_TIME,
    FAINTED,
    HALLUC,
    HUNGER,
    HUNGRY,
    NOT_HUNGRY,
    OBJ_DELETED,
    OBJ_INVENT,
    SATIATED,
    SICK,
    VOMITING,
    WEAK,
    W_TOOL,
} from '../js/const.js';
import {
    UnsupportedEatError,
    UnsupportedHungerTransitionError,
    adj_victual_nutrition,
    consume_oeaten,
    doeat,
    eaten_stat,
    food_disappears,
    lesshungry,
    newuhs,
    nonrotting_food,
    obj_nutrition,
    zero_victual,
} from '../js/eat.js';
import { inv_cnt, rounddiv } from '../js/hack.js';
import { useup } from '../js/invent.js';
import {
    APPLE,
    CORPSE,
    CRAM_RATION,
    EUCALYPTUS_LEAF,
    FLESH,
    FOOD_CLASS,
    FOOD_RATION,
    FORTUNE_COOKIE,
    GENERIC_FOOD,
    LEMBAS_WAFER,
    METAL,
    PEAR,
    SPRIG_OF_WOLFSBANE,
    TIN,
    VEGGY,
    objects_globals_init,
} from '../js/objects.js';
import {
    PM_DWARF,
    PM_ELF,
    PM_HEALER,
    PM_HUMAN,
    PM_LICHEN,
    PM_ORC,
    PM_VALKYRIE,
    PM_WIZARD,
    monst_globals_init,
} from '../js/monsters.js';
import { isMetallic, newObject, weight } from '../js/obj.js';
import { init_objects } from '../js/o_init.js';
import { singular, xnameFresh } from '../js/objnam.js';
import { getRngLog } from '../js/rng.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    loadEatOneTurnOptionsRecipe,
    loadEatOneTurnRecipe,
} from './run-eat-one-turn.mjs';

function state() {
    const result = {};
    monst_globals_init(result);
    objects_globals_init(result);
    // Zero choices deterministically initialize every randomized description,
    // which xnameFresh() reads through the discovery list.
    init_objects(result, () => 0);
    result.context = { ident: 2, current_fruit: 1 };
    result.flags = { implicit_uncursed: true, initalign: 0 };
    result.iflags = { override_ID: false, pricequotes: false };
    result.program_state = { gameover: false, in_moveloop: false };
    result.u = {
        atemp: [0, 0, 0, 0, 0, 0],
        uhunger: 900,
        uhp: 13,
        uhs: NOT_HUNGRY,
        uprops: [],
    };
    result.urole = { mnum: PM_HEALER, name: { m: 'Healer' } };
    result.urace = { mnum: PM_HUMAN };
    result.youmonst = { data: result.mons[PM_HUMAN] };
    return result;
}

function food(current, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: FOOD_CLASS,
        quan: 1,
        owt: current.objects[otyp].oc_weight,
        where: OBJ_INVENT,
        ...overrides,
    });
}

// C ref: hack.c rounddiv() (4549-4573). x/y with a remainder of exactly half
// rounded away from zero. doeat() calls it as
// rounddiv(reqtime * oeaten, basenutrit).
test('rounddiv rounds a half remainder away from zero', () => {
    // 5/2 leaves m=1 and 2*1 >= 2, so C's `r++` fires: 3, not 2.
    assert.equal(rounddiv(5, 2), 3);
    // 3/2 is the same half case at the smallest quotient.
    assert.equal(rounddiv(3, 2), 2);
    // 1/7 leaves 2*1 < 7, so no rounding: the answer stays 0. This is the
    // shape doeat() produces for a nearly finished food.
    assert.equal(rounddiv(1, 7), 0);
    // 4/2 divides exactly; m is 0 and 2*0 >= 2 is false.
    assert.equal(rounddiv(4, 2), 2);
    // The whole apple case doeat() actually takes: reqtime 1, oeaten 50,
    // basenutrit 50.
    assert.equal(rounddiv(1 * 50, 50), 1);
    // Both signs are carried through divsgn rather than by truncation.
    assert.equal(rounddiv(-5, 2), -3);
    assert.equal(rounddiv(5, -2), -3);
    assert.equal(rounddiv(-5, -2), 3);
    // Zero divides to zero. Note that widening C's `if (x < 0)` to `<= 0`
    // cannot be caught here: negating both x and the sign leaves +0 either
    // way, so that mutation is equivalent rather than untested.
    assert.equal(rounddiv(0, 2), 0);
    assert.throws(() => rounddiv(1, 0), RangeError);
});

// C ref: hack.c inv_cnt() (4494-4507). touchfood() compares its answer with
// invlet_basic to decide whether the bite fits back in the pack.
test('inv_cnt selects the gold slot by its inventory letter', () => {
    const current = state();
    // Two ordinary slots and one gold slot, which C skips by invlet.
    const gold = { invlet: '$', nobj: null };
    const second = { invlet: 'b', nobj: gold };
    current.invent = { invlet: 'a', nobj: second };
    assert.equal(inv_cnt(false, current), 2);
    assert.equal(inv_cnt(true, current), 3);
});

// C ref: objnam.c singular() (2087-2105). fprefx() names one item of a stack
// through it, and the stack's quantity has to survive the call.
test('singular names one item and restores the stack quantity', () => {
    const current = state();
    const apples = food(current, APPLE, { quan: 6, dknown: 1, known: 1 });
    assert.equal(singular(apples, xnameFresh, current), 'apple');
    assert.equal(apples.quan, 6);
    // C swaps xname() for cxname() on a corpse, which keeps the monster type
    // xname() would drop, and the swapped namer still sees quan == 1.
    const corpse = food(current, CORPSE, { corpsenm: PM_LICHEN, quan: 3 });
    assert.equal(singular(corpse, xnameFresh, current), 'lichen corpse');
    assert.equal(corpse.quan, 3);
});

// C ref: eat.c obj_nutrition() (322-334).
test('obj_nutrition reads the class table, the corpse and the glob', () => {
    const current = state();
    // objects.h gives the apple 50 and the food ration 800.
    assert.equal(obj_nutrition(food(current, APPLE), current), 50);
    assert.equal(obj_nutrition(food(current, FOOD_RATION), current), 800);
    // A corpse answers the monster's cnutrit instead of the class table's 0.
    const corpse = food(current, CORPSE, { corpsenm: PM_LICHEN });
    assert.equal(
        obj_nutrition(corpse, current),
        current.mons[PM_LICHEN].cnutrit,
    );
    // A glob answers its own weight.
    const glob = food(current, APPLE, { globby: 1, owt: 17 });
    assert.equal(obj_nutrition(glob, current), 17);
});

// C ref: eat.c eaten_stat() (3786-3805).
test('eaten_stat scales by the fraction left and never answers zero', () => {
    const current = state();
    const env = { state: current };
    // Half of an apple's 50 nutrition left scales a weight of 2 to 1.
    assert.equal(eaten_stat(2, food(current, APPLE, { oeaten: 25 }), env), 1);
    // Nine tenths of a food ration's 800 scales a weight of 20 to 18.
    assert.equal(
        eaten_stat(20, food(current, FOOD_RATION, { oeaten: 720 }), env),
        18,
    );
    // The floor: one bite left of an apple would scale 2 to 0, and C answers
    // 1. This is the value done_eating() sees for every one-turn meal.
    assert.equal(eaten_stat(2, food(current, APPLE, { oeaten: 1 }), env), 1);
    // An untouched apple is not the impossible() case: C compares with `>`.
    assert.equal(eaten_stat(2, food(current, APPLE, { oeaten: 50 }), env), 2);
    // oeaten above the full amount is C's impossible() case.
    assert.throws(
        () => eaten_stat(2, food(current, APPLE, { oeaten: 51 }), env),
        /more nutritious than untouched food/u,
    );
});

// C ref: eat.c consume_oeaten() (3806-3872).
test('consume_oeaten subtracts, shifts, and stops short of zero', () => {
    const current = state();
    // A negative amount is a subtraction: 50 - 20.
    const partial = food(current, FOOD_RATION, { oeaten: 50 });
    consume_oeaten(partial, -20, current);
    assert.equal(partial.oeaten, 30);
    // A positive amount is a right shift, which rottenfood() uses as a halving.
    const halved = food(current, FOOD_RATION, { oeaten: 50 });
    consume_oeaten(halved, 1, current);
    assert.equal(halved.oeaten, 25);
    // Taking the whole remainder leaves 1, not 0, and shortens the meal to the
    // number of turns already spent. This is exactly what one bite of an apple
    // does: nmod is -50 and oeaten is 50, with usedtime still 0.
    const apple = food(current, APPLE, { oeaten: 50 });
    current.context.victual = {
        ...zero_victual(), piece: apple, reqtime: 1, usedtime: 0,
    };
    consume_oeaten(apple, -50, current);
    assert.equal(apple.oeaten, 1);
    assert.equal(current.context.victual.reqtime, 0);
    // A food with no nutrition at all is C's second impossible().
    const empty = food(current, CORPSE, { corpsenm: PM_LICHEN, oeaten: 1 });
    current.mons[PM_LICHEN] = { ...current.mons[PM_LICHEN], cnutrit: 0 };
    assert.throws(
        () => consume_oeaten(empty, -1, current),
        /attempting to set 0 nutrition food/u,
    );
});

// C ref: eat.c adj_victual_nutrition() (336-357).
test('adj_victual_nutrition adjusts lembas and cram by race', () => {
    const cases = [
        // An apple: no type arm applies, so the bite is the whole -nmod.
        [APPLE, PM_HUMAN, 50, 50],
        // objects.h gives the lembas wafer 800; an elf gains a quarter of it
        // and an orc loses a quarter, which C's comments give as 1000 and 600.
        [LEMBAS_WAFER, PM_ELF, 800, 1000],
        [LEMBAS_WAFER, PM_ORC, 800, 600],
        [LEMBAS_WAFER, PM_HUMAN, 800, 800],
        // The cram ration's 600 becomes 700 for a dwarf.
        [CRAM_RATION, PM_DWARF, 600, 700],
        [CRAM_RATION, PM_HUMAN, 600, 600],
    ];
    for (const [otyp, race, nmod, expected] of cases) {
        const current = state();
        current.urace = { mnum: race };
        current.context.victual = {
            ...zero_victual(), piece: food(current, otyp), nmod: -nmod,
        };
        assert.equal(adj_victual_nutrition(current), expected,
            `otyp ${otyp} race ${race}`);
    }
    // C asserts nut > 0; only a negative nmod reaches this function.
    const current = state();
    current.context.victual = {
        ...zero_victual(), piece: food(current, APPLE), nmod: 0,
    };
    assert.throws(() => adj_victual_nutrition(current), /negative nmod/u);
});

function newuhsEnv(messages = []) {
    return {
        message: async (text) => { messages.push(text); },
        endRunning: () => {},
        statusRefresh: async () => {},
    };
}

// C ref: eat.c newuhs() (3361-3510), its `static save_hs` / `saved_hs` pair.
test('newuhs hides mid-meal statuses and restores the one it started with',
    async () => {
        const current = state();
        const messages = [];
        // A hero part-way through a meal: bite() raises force_save_hs, and the
        // status it computes must not be announced.
        current.u.uhunger = 40;
        current.u.uhs = WEAK;
        current.force_save_hs = true;
        current.u.uhunger = 200;
        await newuhs(false, current, newuhsEnv(messages));
        assert.equal(current.u.uhs, NOT_HUNGRY);
        assert.equal(current.save_hs, WEAK);
        assert.deepEqual(messages, []);

        // done_eating()'s call, with force_save_hs down again: the saved WEAK
        // is restored first, so the whole meal is judged at once and the
        // strength loss is repaired.
        current.force_save_hs = false;
        current.u.atemp[0] = -1;
        await newuhs(false, current, newuhsEnv(messages));
        assert.equal(current.u.uhs, NOT_HUNGRY);
        assert.equal(current.saved_hs, false);
        assert.equal(current.u.atemp[0], 0);
        assert.equal(current.disp.botl, true);
        // NOT_HUNGRY has no arm in C's switch, so nothing is printed.
        assert.deepEqual(messages, []);
    });

// C ref: eat.c newuhs()'s switch (3468-3496) and its two ATEMP writes.
test('newuhs announces the hunger status it settles on', async () => {
    const cases = [
        // incr is false in every one of these, because eating is the caller
        // that lowers the status; gethungry() supplies the incr side.
        // 200 is above the 150 threshold, so the whole meal ends NOT_HUNGRY,
        // which has no arm in C's switch and prints nothing.
        [200, WEAK, NOT_HUNGRY, []],
        [100, WEAK, HUNGRY, ['You only feel hungry now.']],
        [20, SATIATED, WEAK, ['You are still weak.']],
    ];
    for (const [uhunger, from, to, expected] of cases) {
        const current = state();
        const messages = [];
        current.u.uhunger = uhunger;
        current.u.uhs = from;
        await newuhs(false, current, newuhsEnv(messages));
        assert.equal(current.u.uhs, to, `${uhunger} from ${from}`);
        assert.deepEqual(messages, expected, `${uhunger} from ${from}`);
    }
    // Crossing into WEAK takes the temporary strength loss; crossing back out
    // repairs it.
    const down = state();
    down.u.uhunger = 20;
    down.u.uhs = HUNGRY;
    await newuhs(false, down, newuhsEnv());
    assert.equal(down.u.atemp[0], -1);

    // Neither ATEMP arm fires on a change that stays above WEAK, so a
    // sentinel value survives becoming satiated untouched.
    const fed = state();
    fed.u.atemp[0] = 7;
    fed.u.uhunger = 1200;
    await newuhs(false, fed, newuhsEnv());
    assert.equal(fed.u.uhs, SATIATED);
    assert.equal(fed.u.atemp[0], 7);

    // Nor does the repair arm fire when the new status is WEAK itself: C
    // tests `newhs < WEAK`, not `<=`. FAINTED is the only status above WEAK
    // that a rising nutrition can leave behind.
    const revived = state();
    revived.u.atemp[0] = 7;
    revived.u.uhunger = 20;
    revived.u.uhs = FAINTED;
    await newuhs(false, revived, newuhsEnv());
    assert.equal(revived.u.uhs, WEAK);
    assert.equal(revived.u.atemp[0], 7);

    // 145 and 45 are the two wordings' thresholds, and C tests `<`.
    for (const [uhunger, uhs, expected] of [
        [145, NOT_HUNGRY, 'You are beginning to feel hungry.'],
        [144, NOT_HUNGRY, 'You feel hungry.'],
        [45, HUNGRY, 'You are beginning to feel weak.'],
        [44, HUNGRY, 'You feel weak.'],
    ]) {
        const current = state();
        const messages = [];
        current.u.uhunger = uhunger;
        current.u.uhs = uhs;
        await newuhs(true, current, newuhsEnv(messages));
        assert.deepEqual(messages, [expected], `${uhunger} from ${uhs}`);
    }

    // Nutrition at or below zero is the fainting and starvation arm.
    const faint = state();
    faint.u.uhunger = 0;
    await assert.rejects(
        () => newuhs(false, faint, newuhsEnv()),
        UnsupportedHungerTransitionError,
    );
    // A hero already dead of exhaustion stops rather than calling done().
    const dying = state();
    dying.u.uhunger = 1200;
    dying.u.uhp = 0;
    await assert.rejects(
        () => newuhs(false, dying, newuhsEnv()),
        UnsupportedHungerTransitionError,
    );
    assert.equal(dying.u.uhs, SATIATED);
    // One hit point is alive: C tests `< 1`.
    const barely = state();
    barely.u.uhunger = 1200;
    barely.u.uhp = 1;
    await newuhs(false, barely, newuhsEnv());
    assert.equal(barely.u.uhs, SATIATED);
});

// C ref: eat.c newuhs()'s WEAK arm, whose wording depends on the role and the
// race. gethungry() is the caller that passes incr true.
test('newuhs gives the wizard, valkyrie and elf their own weak message',
    async () => {
        for (const [role, race, expected] of [
            [PM_WIZARD, PM_HUMAN, 'Wizard needs food, badly!'],
            [PM_VALKYRIE, PM_HUMAN, 'Valkyrie needs food, badly!'],
            [PM_HEALER, PM_ELF, 'Elf needs food, badly!'],
            [PM_HEALER, PM_HUMAN, 'You feel weak.'],
        ]) {
            const current = state();
            const messages = [];
            current.urole = {
                mnum: role,
                name: {
                    m: role === PM_WIZARD ? 'Wizard'
                        : role === PM_VALKYRIE ? 'Valkyrie' : 'Healer',
                },
            };
            current.urace = { mnum: race };
            current.u.uhunger = 44;
            current.u.uhs = HUNGRY;
            await newuhs(true, current, newuhsEnv(messages));
            assert.deepEqual(messages, [expected], `${role}/${race}`);
        }
        // Above 45 the plain wording changes but the role wording does not.
        const current = state();
        const messages = [];
        current.u.uhunger = 50;
        current.u.uhs = HUNGRY;
        await newuhs(true, current, newuhsEnv(messages));
        assert.deepEqual(messages, ['You are beginning to feel weak.']);
    });

// C ref: invent.c useup() (1319-1333). done_eating() ends a carried meal here.
test('useup decrements a stack and removes the last item', () => {
    const current = state();
    const stack = food(current, APPLE, { quan: 3, owt: 6, in_use: true });
    stack.nobj = null;
    current.invent = stack;
    useup(stack, { state: current });
    assert.equal(stack.quan, 2);
    // C clears in_use on the surviving stack and reweighs it: 2 apples at 2.
    assert.equal(stack.in_use, false);
    assert.equal(stack.owt, 4);
    assert.equal(current.invent, stack);

    const last = food(current, APPLE, { quan: 1, oeaten: 1 });
    last.nobj = null;
    current.invent = last;
    useup(last, {
        state: current,
        hooks: { eatenStat: (base, obj) => eaten_stat(base, obj, { state: current }) },
    });
    assert.equal(current.invent, null);
    // obfree() ends at dealloc_obj(), which marks the object deleted.
    assert.equal(last.where, OBJ_DELETED);
});

// C ref: eat.c food_disappears() (394-402), which shk.c obfree() calls.
test('food_disappears clears the whole meal only for the piece being eaten',
    () => {
        const current = state();
        const apple = food(current, APPLE);
        const other = food(current, APPLE);
        current.context.victual = {
            ...zero_victual(),
            piece: apple,
            o_id: 7,
            reqtime: 1,
            usedtime: 1,
            nmod: -50,
            eating: 1,
        };
        food_disappears(other, current);
        assert.equal(current.context.victual.piece, apple);
        food_disappears(apple, current);
        assert.deepEqual(current.context.victual, zero_victual());

        // Before the first meal there is no victual struct at all, and reading
        // one must not create it.
        const fresh = state();
        food_disappears(apple, fresh);
        assert.equal(fresh.context.victual, undefined);
    });

// C ref: eat.c nonrotting_food() (64-66). doeat()'s rot test skips these two
// entirely; every other comestible ages.
test('nonrotting_food names the two rations that never go bad', () => {
    assert.equal(nonrotting_food(LEMBAS_WAFER), true);
    assert.equal(nonrotting_food(CRAM_RATION), true);
    assert.equal(nonrotting_food(FOOD_RATION), false);
    assert.equal(nonrotting_food(APPLE), false);
});

// C ref: eat.c lesshungry() (3287-3334). bite() pays out a mouthful here.
test('lesshungry adds nutrition and stops at the two overfull thresholds',
    async () => {
        // An ordinary mouthful: 900 plus an apple's 50, no message.
        const current = state();
        const messages = [];
        current.force_save_hs = true;
        await lesshungry(50, current, newuhsEnv(messages));
        assert.equal(current.u.uhunger, 950);
        assert.deepEqual(messages, []);

        // 1500 is where C warns that the meal is hard to get down. Outside a
        // meal it also sets gm.multi = -2, which has no port.
        const full = state();
        full.u.uhunger = 1499;
        await assert.rejects(
            () => lesshungry(1, full, newuhsEnv()),
            UnsupportedEatError,
        );
        // A ring of hunger suppresses that warning entirely, so the same
        // nutrition goes through with nothing said.
        const hungry = state();
        hungry.u.uhunger = 1499;
        hungry.u.uprops[HUNGER] = { intrinsic: 1, extrinsic: 0 };
        const hungrySaid = [];
        await lesshungry(1, hungry, newuhsEnv(hungrySaid));
        assert.equal(hungry.u.uhunger, 1500);
        assert.deepEqual(hungrySaid, []);
        // So does a meal that has already given the warning once. A meal that
        // has not is warned again, which is what C's `fullwarn` selects.
        const warned = state();
        warned.u.uhunger = 1499;
        warned.context.victual = {
            ...zero_victual(), eating: 1, fullwarn: 1,
        };
        const warnedSaid = [];
        await lesshungry(1, warned, newuhsEnv(warnedSaid));
        assert.equal(warned.u.uhunger, 1500);
        assert.deepEqual(warnedSaid, []);
        assert.equal(warned.nomovemsg, undefined);
        const unwarned = state();
        unwarned.u.uhunger = 1499;
        unwarned.context.victual = {
            ...zero_victual(), eating: 1, fullwarn: 0,
        };
        const unwarnedSaid = [];
        await lesshungry(1, unwarned, newuhsEnv(unwarnedSaid));
        assert.deepEqual(unwarnedSaid,
            ["You're having a hard time getting all of it down."]);
        // done_eating() prints gn.nomovemsg in place of "You finish eating",
        // and fullwarn is what stops the next bite repeating the warning.
        assert.equal(unwarned.nomovemsg, "You're finally finished.");
        assert.equal(unwarned.context.victual.fullwarn, 1);
        // canchoke plus more than one bite left reaches paranoid_query(),
        // which has no port. Two bites left is the smallest amount that does:
        // C tests `(reqtime - usedtime) > 1`.
        const risky = state();
        risky.u.uhunger = 1499;
        risky.context.victual = {
            ...zero_victual(),
            eating: 1, fullwarn: 0, canchoke: 1, reqtime: 5, usedtime: 3,
        };
        await assert.rejects(
            () => lesshungry(1, risky, newuhsEnv()),
            UnsupportedEatError,
        );
        // One bite left takes the same warning silently past that query.
        const lastBite = state();
        lastBite.u.uhunger = 1499;
        lastBite.context.victual = {
            ...zero_victual(),
            eating: 1, fullwarn: 0, canchoke: 1, reqtime: 5, usedtime: 4,
        };
        await lesshungry(1, lastBite, newuhsEnv());
        assert.equal(lastBite.context.victual.fullwarn, 1);

        // The status this settles on describes the whole meal, so C passes
        // incr false: a hero eating out of weakness "only feels hungry now"
        // rather than "feels hungry".
        const recovering = state();
        const said = [];
        recovering.u.uhunger = 40;
        recovering.u.uhs = WEAK;
        await lesshungry(20, recovering, newuhsEnv(said));
        assert.deepEqual(said, ['You only feel hungry now.']);

        // 2000 is choking. A hero who was not satiated when the meal began
        // survives it, because C only chokes when canchoke is set.
        const choking = state();
        choking.u.uhunger = 1999;
        choking.force_save_hs = true;
        choking.context.victual = { ...zero_victual(), canchoke: 1 };
        await assert.rejects(
            () => lesshungry(1, choking, newuhsEnv()),
            UnsupportedEatError,
        );
        const spared = state();
        spared.u.uhunger = 1999;
        spared.force_save_hs = true;
        spared.context.victual = { ...zero_victual(), canchoke: 0 };
        await lesshungry(1, spared, newuhsEnv());
        assert.equal(spared.u.uhunger, 2000);
        // Nothing outside a meal is spared: gf.force_save_hs is what makes
        // C's `iseating` true here.
        const drinking = state();
        drinking.u.uhunger = 1999;
        drinking.context.victual = { ...zero_victual(), canchoke: 0 };
        await assert.rejects(
            () => lesshungry(1, drinking, newuhsEnv()),
            UnsupportedEatError,
        );
    });

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// The inventory slot holding this object type, or null when none does.
function slotFor(otyp) {
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.otyp === otyp) return obj;
    return null;
}

// The lower of the two status rows, which carries every field bot() rewrites.
function statusRow() {
    return game.nhDisplay.grid[23].map(({ ch }) => ch).join('').trimEnd();
}

// Locate a segment by the keys it types, so reordering the matrix cannot
// silently point a test at a different case.
function segmentFor(moves, recipe = loadEatOneTurnRecipe()) {
    const found = recipe.segments.find(
        (segment) => segment.moves === `.${moves}.`,
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
    return found;
}

// Replay a matrix segment's character and options with different keys, and
// report the fail-closed boundary it reached, or null when it reached none.
async function boundaryFor(segment, moves) {
    let boundary = null;
    await runSegment({ ...segment, moves }, {
        onBoundary: (error) => { boundary = error; },
    });
    return boundary;
}

test('a one-turn meal ends the same turn it starts', async () => {
    const segment = segmentFor('ek');
    // The turn before the meal, so the meal's own cost is the difference.
    await runSegment({ ...segment, moves: '.' });
    const beforeMoves = game.moves;
    const beforeHunger = game.u.uhunger;

    await runSegment(segment);
    // The closing wait clears the meal's message from the top line.
    assert.equal(topLine(), '');
    // The meal spent exactly one turn, and the closing wait spent one more.
    assert.equal(game.moves, beforeMoves + 2);
    // The apple's 50 oc_nutrition, less gethungry()'s one point on the meal
    // turn and one more on the closing wait. The payout is pinned by an
    // equality because nothing else can pin it: hu_stat[] prints nothing
    // between 150 and 1000 nutrition, so u.uhunger is off the status line here
    // and the fresh C differential cannot see a bite that pays the wrong
    // amount.
    assert.equal(game.u.uhunger, beforeHunger + 48);
    // done_eating() returns every field of the meal to zero.
    assert.deepEqual(game.context.victual, zero_victual());
    // newuhs()'s saved status is put back before the meal is judged.
    assert.equal(game.saved_hs, false);
    assert.equal(game.save_hs, NOT_HUNGRY);
    // The first eaten food raises the food conduct exactly once per meal.
    assert.equal(game.u.uconduct.food, 1);
});

test('the meal message is the one fprefx chose', async () => {
    // Stopping on the eat itself leaves the message on the top line, before
    // the following wait clears it.
    const apples = segmentFor('ek');
    await runSegment({ ...apples, moves: '.' });
    const stackBefore = slotFor(APPLE);
    // u_init.c asks for five apples and this seed's Healer carries six.
    assert.equal(stackBefore.quan, 6);
    const slotsBefore = inv_cnt(false, game);

    await runSegment({ ...apples, moves: '.ek' });
    assert.equal(topLine(), 'Delicious!  Must be a Macintosh!');
    // touchfood() split one apple off the stack and addinv_nomerge() put the
    // bite back under its own letter; useup() then took that letter away, so
    // the slot count is where it started and the stack is one shorter.
    assert.equal(slotFor(APPLE).quan, 5);
    assert.equal(inv_cnt(false, game), slotsBefore);

    // A sprig of wolfsbane is a stack of one, so touchfood() never splits and
    // the whole path draws no random number at all. Eating it empties the slot.
    const wolfsbane = segmentFor('ef');
    await runSegment({ ...wolfsbane, moves: '.' });
    const wolfsbaneSlots = inv_cnt(false, game);
    assert.equal(slotFor(SPRIG_OF_WOLFSBANE).quan, 1);
    await runSegment({ ...wolfsbane, moves: '.ef' });
    assert.equal(topLine(), 'This sprig of wolfsbane is delicious!');
    assert.equal(slotFor(SPRIG_OF_WOLFSBANE), null);
    assert.equal(inv_cnt(false, game), wolfsbaneSlots - 1);
});

// Eat what one inventory slot holds, without the closing wait that would clear
// fprefx()'s message off the top line. doeat() reads the letter from the same
// key queue the replay uses. The message buffer is emptied first so that a
// message left by the replay cannot satisfy an assertion below on its own.
async function eatSlot(obj) {
    game.nhDisplay.toplines = '';
    game.nhDisplay.pushKey(obj.invlet.charCodeAt(0));
    return doeat(game);
}

// The message the meal wrote. pline() fills gt.toplines at once but tty topl.c
// paints row 0 at the following key wait, which these constructed cases never
// reach because they call doeat() directly instead of replaying keys. Reading
// the buffer therefore checks the same string a replay would paint, one step
// earlier. Assertions on the painted row read topLine() instead.
function mealMessage() {
    return game.nhDisplay.toplines;
}

// How many random numbers a call drew.
async function drawsFor(run) {
    const before = (getRngLog() ?? []).length;
    await run();
    return (getRngLog() ?? []).length - before;
}

// Retype the Healer's apple stack in place. The two FOOD() rows at
// objects.h:1080 and :1082-1083 differ only in oc_prob and oc_color, so the
// pear carries the apple's oc_delay 1, oc_weight 2, oc_nutrition 50 and VEGGY
// material and the meal keeps its shape; the arm fprefx() takes is the only
// thing that moves. No u_init.c row holds a pear and no ported command picks
// one up, so this is how a pear reaches fprefx() at all.
function retypeApplesToPears() {
    const pears = slotFor(APPLE);
    pears.otyp = PEAR;
    pears.owt = weight(pears, { state: game });
    return pears;
}

// C ref: eat.c fprefx()'s default arm (2170-2213). Both platform arms are
// compiled into the build that recorded the reference sessions, and C writes
// the Mac test first, so an apple never reaches the Unix arm and a pear always
// does. config.h:18 defines UNIX and the only #undef of it, config1.h:64-67,
// needs MACOS9 or __BEOS__; config1.h:43-45 defines MACOS from __APPLE__ and
// __MACH__, which the clang that build-recorder.sh:42-46 insists on supplies
// on the Darwin host its :31-35 branch configures. C's own comment at
// 2180-2182 states the consequence: the apple takes the Mac message and "the
// '#if UNIX' code will still kick in for pear".
test('fprefx sends an apple to the Mac arm and a pear to the Unix arm',
    async () => {
        const apples = segmentFor('ek');
        await runSegment({ ...apples, moves: '.ek' });
        // eat.c:2184, with the two spaces C writes after "Delicious!".
        assert.equal(topLine(), 'Delicious!  Must be a Macintosh!');

        await runSegment({ ...apples, moves: '.' });
        await eatSlot(retypeApplesToPears());
        // eat.c:2190, the sober half of the Unix arm.
        assert.equal(mealMessage(), 'Core dumped.');
    });

// C ref: eat.c fprefx()'s two platform arms again (2179-2202), read for the
// Hallucination tests they do and do not carry. The Mac arm has none, so a
// hallucinating hero eating an apple gets the same string and the same draws
// as a sober one. The Unix arm's hallucinating half (2191-2201) holds the
// rnd(100) at 2193, the only draw anywhere in fprefx()'s default arm, so it is
// the only path this port still refuses.
test('hallucination reaches the draw through the pear alone', async () => {
    const apples = segmentFor('ek');
    // youprop.h:115-116 makes HHallucination the timeout by itself, so any
    // nonzero count is as hallucinating as any other, and youprop.h:119-120
    // subtracts a Halluc_resistance the Healer has no source of.
    const hallucinate = () => { game.u.uprops[HALLUC].intrinsic = 1; };

    await runSegment({ ...apples, moves: '.' });
    const soberDraws = await drawsFor(() => eatSlot(slotFor(APPLE)));
    assert.equal(mealMessage(), 'Delicious!  Must be a Macintosh!');
    // touchfood() splits one apple off a stack of six, and mkobj.c
    // next_ident()'s rnd(2) is the whole meal's only draw.
    assert.equal(soberDraws, 1);

    await runSegment({ ...apples, moves: '.' });
    hallucinate();
    const hallucinatingDraws = await drawsFor(() => eatSlot(slotFor(APPLE)));
    // The Mac arm has no Hallucination test at all: same string, same draw.
    assert.equal(mealMessage(), 'Delicious!  Must be a Macintosh!');
    assert.equal(hallucinatingDraws, soberDraws);

    await runSegment({ ...apples, moves: '.' });
    hallucinate();
    const pears = retypeApplesToPears();
    let refusal = null;
    // Measure the refusal the way the two meals above are measured, catching
    // it inside the callback so the count is still read. C draws twice here:
    // touchfood()'s next_ident() rnd(2) and then eat.c:2193's rnd(100). The
    // port must stop between them, so it spends exactly what a sober apple
    // spends and nothing more -- a refusal that fired late would show up as
    // an extra draw rather than as a wrong string.
    const pearDraws = await drawsFor(async () => {
        try {
            await eatSlot(pears);
        } catch (error) {
            refusal = error;
        }
    });
    assert.match(String(refusal?.message), /hallucinating pear/u);
    assert.equal(pearDraws, soberDraws);
});

// C ref: eat.c fprefx()'s give_feedback pline (2205-2212). Once the Mac arm
// answers the apple, this pline carries the only wordings left in the default
// arm that Hallucination changes, and neither of them draws.
test('give_feedback swaps in its hallucinating wording', async () => {
    // The Priest's sprig of wolfsbane is a stack of one, so touchfood() never
    // splits it and the whole meal draws nothing at all.
    const priest = segmentFor('ef');
    const eatSprig = async (hallucinating) => {
        await runSegment({ ...priest, moves: '.' });
        if (hallucinating) game.u.uprops[HALLUC].intrinsic = 1;
        const draws = await drawsFor(
            () => eatSlot(slotFor(SPRIG_OF_WOLFSBANE)),
        );
        assert.equal(draws, 0, 'give_feedback draws nothing either way');
        return mealMessage();
    };

    // eat.c:2212's two operands, the uncursed half of the ternary.
    assert.equal(await eatSprig(false),
        'This sprig of wolfsbane is delicious!');
    assert.equal(await eatSprig(true), 'This sprig of wolfsbane is gnarly!');

    // eat.c:2207's two operands, the cursed half. One food reaches them: the
    // otyp test at doeat() (3027-3031) exempts a fortune cookie from the
    // diversion that sends every other cursed food to rottenfood() before
    // fprefx() runs, so the cookie is the only object that carries
    // otmp->cursed into this pline. fpostfx() then stops on outrumor(), which
    // this port does not carry, but the pline has already written the string.
    const eatCursedCookie = async (hallucinating) => {
        await runSegment({ ...priest, moves: '.' });
        if (hallucinating) game.u.uprops[HALLUC].intrinsic = 1;
        const cookie = slotFor(SPRIG_OF_WOLFSBANE);
        cookie.otyp = FORTUNE_COOKIE;
        cookie.cursed = 1;
        cookie.owt = weight(cookie, { state: game });
        try {
            await eatSlot(cookie);
        } catch (error) {
            assert.match(String(error.message), /outrumor/u);
        }
        return mealMessage();
    };

    assert.equal(await eatCursedCookie(false),
        'This fortune cookie is terrible!');
    assert.equal(await eatCursedCookie(true),
        'This fortune cookie is grody!');
});

test('a meal that crosses 1000 nutrition writes Satiated to the status line',
    async () => {
        const segment = segmentFor('eg.eg.eg');
        // Two apples leave the hero below the threshold and the status line
        // bare; the third crosses it.
        await runSegment({ ...segment, moves: '.eg.eg' });
        assert.equal(game.u.uhs, NOT_HUNGRY);
        assert.ok(!statusRow().includes('Satiated'));

        await runSegment({ ...segment, moves: '.eg.eg.eg' });
        assert.equal(game.u.uhs, SATIATED);
        assert.ok(statusRow().includes('Satiated'), statusRow());
        // SATIATED is above WEAK in hack.h's order, so neither of newuhs()'s
        // two ATEMP writes fires.
        assert.equal(game.u.atemp[0], 0);
    });

test('the hunger clock spends the satiating meal back below 1000',
    async () => {
        // The reverse of the crossing above, and the one gethungry() owns:
        // eat.c newuhs()'s switch has a case for HUNGRY and one for WEAK and
        // no other, so leaving SATIATED rewrites the status line and prints
        // nothing. Before this was admitted the segment stopped here instead.
        const segment = segmentFor(`eg.eg.eg${'.'.repeat(47)}`);
        const meal = '.eg.eg.eg';
        // The third apple leaves the hero at 1044 nutrition, and each wait
        // here costs one point, so the forty-fourth wait after the meal is the
        // turn that lands on 1000 and hungerStatus()'s `> 1000` stops holding.
        await runSegment({ ...segment, moves: meal + '.'.repeat(43) });
        assert.equal(game.u.uhunger, 1001);
        assert.equal(game.u.uhs, SATIATED);
        assert.ok(statusRow().includes('Satiated'), statusRow());

        // The crossing turn itself. Stopping the replay here is what makes the
        // silence checkable: any later wait clears the top line, so a message
        // printed at the crossing would be gone by the end of the segment.
        await runSegment({ ...segment, moves: meal + '.'.repeat(44) });
        assert.equal(game.u.uhunger, 1000);
        assert.equal(game.u.uhs, NOT_HUNGRY);
        assert.ok(!statusRow().includes('Satiated'), statusRow());
        assert.equal(topLine(), '');
        // Both statuses sit below WEAK, so neither ATEMP arm fired. Nothing on
        // this Knight's path writes atemp[0] at all, so this pins the pair of
        // ATEMP arms staying shut rather than either one running.
        assert.equal(game.u.atemp[0], 0);

        // The remaining four waits reach the end of the recorded segment
        // without a fail-closed stop.
        assert.equal(await boundaryFor(segment, segment.moves), null);
        assert.equal(game.u.uhs, NOT_HUNGRY);
    });

test('the rot test is reached only past thirty turns of age', async () => {
    // mkobj.c gives the apple age = svm.moves = 1, and doeat() tests
    // `(svm.moves - otmp->age) > 30`. Waiting exactly thirty turns leaves the
    // test false and draws nothing; thirty-one reaches rn2(7). Counting the
    // draw with that exact bound isolates it from the turn's own randomness,
    // and the baseline without the meal fixes what the waits alone cost.
    const rotCount = async (segment, moves) => {
        const replay = await runSegment({ ...segment, moves });
        return replay.getRngLog()
            .filter((entry) => entry.startsWith('rn2(7)=')).length;
    };
    const atThreshold = segmentFor(`${'.'.repeat(29)}ek`);
    const pastThreshold = segmentFor(`${'.'.repeat(30)}ek`);
    // Each replay below repeats the matrix segment's own leading wait, so the
    // totals are the thirty and thirty-one the threshold is written in.
    assert.equal(
        await rotCount(atThreshold, '.'.repeat(30) + 'ek'),
        await rotCount(atThreshold, '.'.repeat(30)),
    );
    assert.equal(
        await rotCount(pastThreshold, '.'.repeat(31) + 'ek'),
        await rotCount(pastThreshold, '.'.repeat(31)) + 1,
    );
});

test('a comestible with an unported effect stops after doeat has committed',
    async () => {
        const knight = segmentFor('eg.eg.eg');
        // u_init.c gives the Knight ten carrots beside the apples. fpostfx()
        // clears cream from the hero's face with make_blinded(), which has no
        // port.
        const carrot = await boundaryFor(knight, '.eh');
        assert.match(carrot.message, /make_blinded\(\) for a carrot/u);

        // A Monk's fortune cookie reaches fprefx()'s give_feedback label and
        // then fpostfx()'s outrumor(). doeat() has already raised the unvegan
        // conduct for it by then, which no other one-turn food here does.
        const monk = {
            seed: 4510041,
            datetime: '20310203040506',
            nethackrc: [
                'OPTIONS=name:EatOne,role:Monk,race:human,gender:male,'
                + 'align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,!autopickup',
                '',
            ].join('\n'),
        };
        const cookie = await boundaryFor(monk, '.eh');
        assert.match(cookie.message, /outrumor\(\)/u);
        assert.equal(game.u.uconduct.unvegan, 1);
        assert.equal(game.u.uconduct.food, 1);
    });

test('the FOOD rows carry three materials, one of them metallic', () => {
    // doeat()'s two skipped arms are justified by what objects.h's FOOD rows
    // are made of, so the claim is pinned to the table rather than to memory.
    // retouch_object() (artifact.c:2510-2528) is a no-op for anything that is
    // neither an artifact nor SILVER, and no FOOD row is SILVER. The
    // rust-monster arm keys on is_metallic(), and one FOOD row -- the tin,
    // objects.h:1117 -- is METAL, which objclass.h:194 puts inside
    // is_metallic()'s IRON..MITHRIL range, so material is not what keeps that
    // arm out; the polymorphed hero is_edible() refuses is.
    const current = state();
    const materials = new Set(
        current.objects
            // objects.h:92's GENERIC("food") holds slot [7] for display and is
            // not an object, so it carries no material and is left out.
            .filter((type, otyp) => type.oc_class === FOOD_CLASS
                && otyp !== GENERIC_FOOD)
            .map((type) => type.oc_material),
    );
    assert.deepEqual(
        [...materials].sort((a, b) => a - b),
        [VEGGY, FLESH, METAL],
    );
    assert.equal(current.objects[TIN].oc_material, METAL);
    assert.equal(isMetallic({ otyp: TIN }, current), true);
});

test('fpostfx reads Sick and Vomiting as the bare intrinsic', async () => {
    // youprop.h:108 and :111 define Sick and Vomiting as
    // u.uprops[...].intrinsic with no extrinsic term, so an extrinsic-only
    // malady must leave fpostfx()'s eucalyptus arm alone. Nothing in C writes
    // uprops[SICK].extrinsic, so no recorded case can tell the two reads
    // apart and this is the only check on which field the arm reads.
    //
    // No role starts with a eucalyptus leaf and no ported command picks one
    // up, so the leaf goes into the pack by hand. The Priest's sprig of
    // wolfsbane is the one starting comestible that is a stack of one, which
    // keeps touchfood() from splitting it, and objects.h gives both rows VEGGY
    // with oc_delay 1, so the meal still takes exactly one turn.
    const priest = segmentFor('ef');
    const eatLeaf = async (index, configure) => {
        await runSegment({ ...priest, moves: '.' });
        const leaf = slotFor(SPRIG_OF_WOLFSBANE);
        leaf.otyp = EUCALYPTUS_LEAF;
        leaf.owt = weight(leaf, { state: game });
        configure(game.u.uprops[index]);
        game.nhDisplay.pushKey('f'.charCodeAt(0));
        return doeat(game);
    };

    // Both operands of the arm's `||` are driven, each with the other left
    // clear, so each one decides the answer on its own row. Running only SICK
    // would leave the VOMITING read unpinned: the intrinsic case makes the
    // left operand true, so the right one never decides anything.
    for (const [name, index] of [['Sick', SICK], ['Vomiting', VOMITING]]) {
        // W_TOOL stands for a worn source, the shape an extrinsic takes
        // elsewhere.
        assert.equal(
            await eatLeaf(index, (malady) => { malady.extrinsic = W_TOOL; }),
            ECMD_TIME,
            `an extrinsic-only ${name} must leave the arm alone`,
        );
        // The intrinsic is the term the macro does have, so it still stops.
        await assert.rejects(
            eatLeaf(index, (malady) => { malady.intrinsic = 1; }),
            /make_sick\(\) and make_vomiting\(\)/u,
            `an intrinsic ${name} must stop`,
        );
    }
});

test('the option variations reach the same meal', async () => {
    // The matrix's second recipe repeats the meal with a pet, a visible clock
    // and a different symbol set; the letters differ because a pet shifts the
    // Healer's inventory by one slot.
    const [withPet, decorated] = loadEatOneTurnOptionsRecipe().segments;
    await runSegment({ ...withPet, moves: '.el' });
    assert.equal(topLine(), 'Delicious!  Must be a Macintosh!');
    await runSegment({ ...decorated, moves: '.ek' });
    assert.equal(topLine(), 'Delicious!  Must be a Macintosh!');
});

test('the one-turn matrix covers the branches this slice ports', () => {
    const moves = [
        ...loadEatOneTurnRecipe().segments,
        ...loadEatOneTurnOptionsRecipe().segments,
    ].map((segment) => segment.moves);
    // Each entry names one arm of the one-turn path and the keys that reach
    // it. A segment deleted from the matrix takes its evidence with it, so the
    // list is asserted rather than described in a comment.
    for (const [arm, typed] of [
        ["a stack split, and fprefx()'s apple arm", '.ek.'],
        ['a stack of one, which splits nothing', '.ef.'],
        ['a meal that reaches SATIATED, with a pet', '.eg.eg.eg.'],
        ['the hunger clock spending that meal back below 1000',
            `.eg.eg.eg${'.'.repeat(48)}`],
        ['the rot test one turn short of its threshold',
            `.${'.'.repeat(29)}ek.`],
        ['the rot test at its first drawing turn', `.${'.'.repeat(30)}ek.`],
        ['two meals with a pet and a visible clock', '.el.el.'],
        ['two meals under a different symbol set', '.ek.ek.'],
    ]) {
        assert.ok(moves.includes(typed), arm);
    }
});
