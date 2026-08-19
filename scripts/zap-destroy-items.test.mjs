// zap.c destroyable(), destroy_strings[][3], maybe_destroy_item(),
// destroy_items() and burn_floor_objects().
//
// Several values on this path carry no operator a recording can separate:
// destroy_strings' 21 strings, DMG_DESTROY_SCALE, MAX_ITEMS_DESTROYED, the
// dindx selector at zap.c:5841 and the five-prefix `mult` chain at 5904-5908.
// Each test below states which pair of inputs it tells apart.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { failClosedCommandRefusals } from '../js/cmd.js';

import {
    BLINDED,
    FIRE_RES,
    FROMOUTSIDE,
    INVIS,
    ismnum,
    KILLED_BY,
    KILLED_BY_AN,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MINVENT,
} from '../js/const.js';
import { UnsupportedEndOfGameError } from '../js/end.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { AD_COLD, AD_ELEC, AD_FIRE, PM_NEWT } from '../js/monsters.js';
import {
    breathless, haseyes, monster_resists_element,
} from '../js/mondata.js';
import { discover_object } from '../js/o_init.js';
import {
    mksobj,
    weight,
} from '../js/obj.js';
import {
    GLOB_OF_GREEN_SLIME,
    POT_BOOZE,
    POT_INVISIBILITY,
    POT_LEVITATION,
    POT_OIL,
    POT_WATER,
    RIN_LEVITATION,
    RIN_SHOCK_RESISTANCE,
    SCR_BLANK_PAPER,
    SCR_FIRE,
    SCR_TELEPORTATION,
    SPE_BOOK_OF_THE_DEAD,
    SPE_FORCE_BOLT,
    SPE_BLANK_PAPER,
    SPE_FIREBALL,
    WAN_LIGHTNING,
    WAN_NOTHING,
} from '../js/objects.js';
import {
    UnsupportedItemDestructionError,
    burn_floor_objects,
    destroy_items,
    destroyable,
    destroy_strings,
} from '../js/zap_destroy_items.js';

async function initializedGame(seed, name) {
    await runSegment({
        seed,
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
}

async function initializedMonster(seed, name) {
    await initializedGame(seed, name);
    const monster = game.level.monlist;
    assert.ok(monster);
    monster.data = game.mons[PM_NEWT];
    monster.minvent = null;
    // Keep inventory-destruction messages out of these RNG-order tests.
    monster.minvis = true;
    return monster;
}

function freshObject(otyp, quantity) {
    const obj = mksobj(otyp, false, false, { state: game });
    obj.quan = quantity;
    obj.owt = weight(obj, { state: game });
    obj.nobj = null;
    return obj;
}

function carriedByMonster(monster, otyp, quantity) {
    const obj = freshObject(otyp, quantity);
    obj.where = OBJ_MINVENT;
    obj.ocarry = monster;
    return obj;
}

// The hero's own starting inventory holds potions, scrolls and spellbooks, so
// a test that left it in place would have destroy_items() walking stacks it
// did not put there. Emptying the chain leaves exactly the stack under test.
function emptyPack() {
    game.invent = null;
    clearTopline();
}

// Push a stack onto the head of the hero's pack. invent.c freeinv() walks that
// same chain, so useup() finds it there.
function carriedByHero(otyp, quantity) {
    const obj = freshObject(otyp, quantity);
    obj.where = OBJ_INVENT;
    obj.dknown = true;
    obj.nobj = game.invent;
    game.invent = obj;
    return obj;
}

function carriedStacks() {
    const stacks = [];
    for (let obj = game.invent; obj; obj = obj.nobj) stacks.push(obj);
    return stacks;
}

function chainOf(objects) {
    for (let i = 0; i < objects.length; ++i)
        objects[i].nobj = objects[i + 1] ?? null;
    return objects[0];
}

// gt.toplines, which pline.c writes whether or not the row has been repainted.
function toplines() {
    return game._ttyToplines ?? '';
}

// The segment that starts each test leaves its own last message on the top
// line. Clearing it keeps the message under test off a shared line, which
// would otherwise reach a --More-- these tests have no keystrokes for.
// hack.c losehp()'s death branch copies `knam` into svk.killer and then prints
// urgent_pline("You die..."), which win/tty/topl.c update_topl():265 refuses
// to let share the top line with the explosion message already on it. The
// pushed space answers the --More-- that raises, so end.c done() is reached
// and the killer can be read back off the state it was written to.
async function assertKilledBy(call, name, format, label = name) {
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    await assert.rejects(call, UnsupportedEndOfGameError, label);
    assert.equal(game.killer.name, name, label);
    assert.equal(game.killer.format, format, label);
}

function clearTopline() {
    game._pending_message = '';
    game._ttyToplines = '';
    game._ttyPreviousMessage = '';
    game._ttyMessageStopped = false;
}

// A random injection that reads its answers off `script`, one entry per draw,
// and records the bound each call asked for. Every unused generator fails, so
// an extra draw is a test failure rather than a silent undefined.
function scriptedRandom(script, drawn) {
    return {
        d: () => assert.fail('this path does not call d()'),
        rn1: () => assert.fail('this path does not call rn1()'),
        rne: () => assert.fail('this path does not call rne()'),
        rn2: (bound) => {
            const next = script.shift();
            assert.ok(next, `an unscripted rn2(${bound})`);
            const [expected, result] = next;
            assert.equal(bound, expected, `rn2 bound after ${drawn.length}`);
            drawn.push(['rn2', bound, result]);
            return result;
        },
        rnd: (bound) => {
            const next = script.shift();
            assert.ok(next, `an unscripted rnd(${bound})`);
            const [expected, result] = next;
            assert.equal(bound, expected, `rnd bound after ${drawn.length}`);
            drawn.push(['rnd', bound, result]);
            return result;
        },
    };
}

test('destroy_strings holds the seven rows zap.c declares', () => {
    // zap.c:5778-5787 is 21 strings no mutation and no recording can reach:
    // the witness prints two of them and every other row is dead weight until
    // its damage type is ported. Read the table out of the C source instead.
    const zapSource = readFileSync(
        new URL('../nethack-c/upstream/src/zap.c', import.meta.url), 'utf8',
    );
    const declaration = zapSource.slice(
        zapSource.indexOf('const char *const destroy_strings[][3] = {'),
    );
    const body = declaration.slice(
        declaration.indexOf('{', declaration.indexOf('\n')),
        declaration.indexOf('};'),
    );
    const rows = [...body.matchAll(/\{([^{}]*)\}/gu)].map(
        ([, row]) => [...row.matchAll(/"([^"]*)"/gu)].map(([, s]) => s),
    );
    assert.equal(rows.length, 7, 'zap.c still declares seven rows');
    for (const row of rows) assert.equal(row.length, 3);
    assert.deepEqual(
        destroy_strings.map((row) => [...row]),
        rows,
    );
});

test('destroyable answers each damage type from the object it is handed',
    async () => {
    await initializedGame(982430, 'Destroyable');
    // zap.c destroyable() (5612-5650). Each pair below differs in exactly one
    // term, so a mutant that dropped that term would answer the same for both.
    const obj = (otyp, oclass) => ({
        otyp, oclass, oartifact: false, in_use: false, quan: 1,
    });
    const potion = obj(POT_BOOZE, game.objects[POT_BOOZE].oc_class);
    const oil = obj(POT_OIL, game.objects[POT_OIL].oc_class);
    const scroll = obj(SCR_TELEPORTATION, game.objects[SCR_TELEPORTATION]
        .oc_class);
    const fireScroll = obj(SCR_FIRE, game.objects[SCR_FIRE].oc_class);
    const book = obj(SPE_BLANK_PAPER, game.objects[SPE_BLANK_PAPER].oc_class);
    const fireball = obj(SPE_FIREBALL, game.objects[SPE_FIREBALL].oc_class);
    const glob = obj(GLOB_OF_GREEN_SLIME,
        game.objects[GLOB_OF_GREEN_SLIME].oc_class);
    const ring = obj(RIN_LEVITATION, game.objects[RIN_LEVITATION].oc_class);
    const shockRing = obj(RIN_SHOCK_RESISTANCE,
        game.objects[RIN_SHOCK_RESISTANCE].oc_class);
    const wand = obj(WAN_NOTHING, game.objects[WAN_NOTHING].oc_class);
    const boltWand = obj(WAN_LIGHTNING, game.objects[WAN_LIGHTNING].oc_class);

    // AD_FIRE takes potions, scrolls, spellbooks and the slime glob, and
    // exempts the two fire-magic types by otyp: SCR_FIRE against
    // SCR_TELEPORTATION and SPE_FIREBALL against SPE_BLANK_PAPER.
    for (const eligible of [potion, oil, scroll, book, glob])
        assert.equal(destroyable(eligible, AD_FIRE), true, `${eligible.otyp}`);
    assert.equal(destroyable(fireScroll, AD_FIRE), false);
    assert.equal(destroyable(fireball, AD_FIRE), false);
    assert.equal(destroyable(ring, AD_FIRE), false);
    assert.equal(destroyable(wand, AD_FIRE), false);

    // AD_COLD takes potions and exempts oil: "non-water potions don't freeze
    // and shatter" is about POT_OIL alone, so POT_BOOZE and POT_OIL separate.
    assert.equal(destroyable(potion, AD_COLD), true);
    assert.equal(destroyable(oil, AD_COLD), false);
    assert.equal(destroyable(scroll, AD_COLD), false);
    assert.equal(destroyable(glob, AD_COLD), false);

    // AD_ELEC takes rings and wands and exempts the two electric-magic types,
    // so RIN_LEVITATION separates from RIN_SHOCK_RESISTANCE and WAN_NOTHING
    // from WAN_LIGHTNING.
    assert.equal(destroyable(ring, AD_ELEC), true);
    assert.equal(destroyable(wand, AD_ELEC), true);
    assert.equal(destroyable(shockRing, AD_ELEC), false);
    assert.equal(destroyable(boltWand, AD_ELEC), false);
    assert.equal(destroyable(potion, AD_ELEC), false);

    // The two head guards apply to every damage type. `in_use` bars a single
    // item and not a stack of two, which is the pair that separates the
    // `&& obj->quan == 1L` half from the `obj->in_use` half.
    assert.equal(destroyable({ ...potion, oartifact: true }, AD_FIRE), false);
    assert.equal(destroyable({ ...potion, in_use: true }, AD_FIRE), false);
    assert.equal(
        destroyable({ ...potion, in_use: true, quan: 2 }, AD_FIRE), true,
    );
    // A damage type destroy_items() never passes falls off the end.
    assert.equal(destroyable(potion, 0), false);
});

test('sub-five fire damage spends only its scaling draw', async () => {
    const monster = await initializedMonster(982431, 'LowFireDamage');
    const scroll = carriedByMonster(monster, SCR_TELEPORTATION, 2);
    monster.minvent = scroll;
    const drawn = [];
    // dmg_in 4 makes limit 0, and the 4 % 5 == 4 remainder loses to a draw of
    // 4, so limit stays below 1 and destroy_items() returns before the walk.
    // A draw of 3 would have made limit 1 and destroyed something.
    const script = [[5, 4]];

    const damage = await destroy_items(monster, AD_FIRE, 4, {
        random: scriptedRandom(script, drawn),
        state: game,
    });

    assert.equal(damage, 0);
    assert.equal(scroll.quan, 2);
    assert.deepEqual(drawn, [['rn2', 5, 4]]);
    assert.equal(script.length, 0);
});

test('a remainder that beats its draw buys one stack of destruction',
    async () => {
    const monster = await initializedMonster(982454, 'RemainderWins');
    const scroll = carriedByMonster(monster, SCR_TELEPORTATION, 1);
    monster.minvent = scroll;
    const drawn = [];
    // The same dmg_in as the case above, one lower on the draw: 4 % 5 == 4
    // beats a 3 and limit becomes 1, so the walk and the destruction happen.
    // Without zap.c:5996's `limit++` the function would return before either.
    const script = [[5, 3], [3, 0]];

    const damage = await destroy_items(monster, AD_FIRE, 4, {
        random: scriptedRandom(script, drawn),
        state: game,
    });

    assert.equal(damage, 1);
    assert.equal(monster.minvent, null);
    assert.deepEqual(drawn, [['rn2', 5, 3], ['rn2', 3, 0]]);
    assert.equal(script.length, 0);
});

test('an exact multiple of the scale still loses its remainder comparison',
    async () => {
    const monster = await initializedMonster(982434, 'ExactFireDamage');
    const scroll = carriedByMonster(monster, SCR_TELEPORTATION, 1);
    monster.minvent = scroll;
    const drawn = [];
    // dmg_in 5 makes limit 1 outright, and 5 % 5 == 0 loses to every draw --
    // including 0, which is what separates C's `>` from a `>=`. Under `>=`
    // limit would be 2 and the stack below would land at index 0 all the same,
    // so the separation is visible in the answer rather than the placement:
    // the scroll is destroyed either way, and the draw list is what differs.
    const script = [[5, 0], [3, 0]];

    const damage = await destroy_items(monster, AD_FIRE, 5, {
        random: scriptedRandom(script, drawn),
        state: game,
    });

    assert.equal(damage, 1);
    assert.equal(monster.minvent, null, 'the only stack left the pack');
    assert.deepEqual(drawn, [['rn2', 5, 0], ['rn2', 3, 0]]);
    assert.equal(script.length, 0);
});

test('the reservoir replaces a selected stack and clamps the destroy loop',
    async () => {
    const monster = await initializedMonster(982432, 'FireReservoir');
    // Seven eligible stacks against a limit of two. C fills
    // items_to_destroy[0] and [1] without drawing, then draws
    // rn2(elig_stacks) once per later stack; an index at or past the limit is
    // discarded. Moving the `elig_stacks < limit` test or the `i >= limit`
    // guard changes which bounds appear below, and dropping the
    // `elig_stacks > limit` clamp at 6076-6077 would run the destroy loop
    // seven times instead of twice.
    const stacks = [];
    for (let i = 0; i < 7; ++i)
        stacks.push(carriedByMonster(monster, SCR_TELEPORTATION, 1));
    monster.minvent = chainOf(stacks);
    const drawn = [];
    const script = [
        [5, 0], // 10 % 5 == 0 loses to every draw, so limit stays 2
        [2, 1], // stack 3 replaces the second selection
        [3, 2], // stack 4 draws an index at the limit and is discarded
        [4, 0], // stack 5 replaces the first selection
        [5, 4], // stack 6 is discarded
        [6, 5], // stack 7 is discarded
        [3, 0], // the first selection, stack 5, loses its scroll
        [3, 1], // the second selection, stack 3, keeps its scroll
    ];

    const damage = await destroy_items(monster, AD_FIRE, 10, {
        random: scriptedRandom(script, drawn),
        state: game,
    });

    // A scroll is worth 1 point of damage and only stack 5 was destroyed.
    assert.equal(damage, 1);
    // The destroyed stack held one scroll, so invent.c obj_extract_self()
    // took the whole object off the monster's chain.
    const left = [];
    for (let obj = monster.minvent; obj; obj = obj.nobj) left.push(obj);
    assert.equal(left.includes(stacks[4]), false, 'stack 5 left the pack');
    for (const index of [0, 1, 2, 3, 5, 6])
        assert.equal(left.includes(stacks[index]), true, `stack ${index + 1}`);
    assert.deepEqual(drawn.map(([, bound]) => bound), [5, 2, 3, 4, 5, 6, 3, 3]);
    assert.equal(script.length, 0);
});

test('twenty-one stacks meet MAX_ITEMS_DESTROYED rather than the damage limit',
    async () => {
    const monster = await initializedMonster(982435, 'FireOverflow');
    // dmg_in 105 makes limit 21, which the clamp cuts to 20. The 21st eligible
    // stack is therefore the first to draw, and it draws rn2(20). A clamp of
    // 21 would have filled items_to_destroy[20] with no draw at all, and a
    // clamp of 19 would have made the 20th stack draw rn2(19) first.
    const stacks = [];
    for (let i = 0; i < 21; ++i)
        stacks.push(carriedByMonster(monster, SCR_TELEPORTATION, 1));
    monster.minvent = chainOf(stacks);
    const drawn = [];
    const script = [
        [5, 0], // 105 % 5 == 0, so limit is 21 before the clamp
        [20, 20], // an index the clamped limit cannot hold; discarded
    ];
    for (let i = 0; i < 20; ++i) script.push([3, 1]); // nothing is destroyed

    const damage = await destroy_items(monster, AD_FIRE, 105, {
        random: scriptedRandom(script, drawn),
        state: game,
    });

    assert.equal(damage, 0);
    assert.deepEqual(drawn.slice(0, 2).map(([, bound]) => bound), [5, 20]);
    assert.equal(drawn.length, 22);
    assert.equal(script.length, 0);
});

test('a boiling potion names its row before its vapors reach the hero',
    async () => {
    await initializedGame(982436, 'HeroPotion');
    emptyPack();
    discover_object(POT_BOOZE, true, true, false, game);
    carriedByHero(POT_BOOZE, 1);
    game.u.uhp = 12;
    game.u.uhpmax = 12;
    const drawn = [];
    const script = [
        [5, 4], // 5 % 5 == 0 loses; limit is 1
        [6, 1], // rnd(6) at zap.c:5842, the potion's damage
        [3, 0], // the stack's single potion is destroyed
    ];

    // zap.c:5909-5917 prints before it breathes, and 5941-5949 pays the damage
    // after. POT_BOOZE's vapor arm is unported, so the stop lands between the
    // two and pins that order: the message is on the top line and the hit
    // points have not moved.
    await assert.rejects(
        () => destroy_items(game.youmonst, AD_FIRE, 5, {
            random: scriptedRandom(script, drawn),
            state: game,
        }),
        /the dizzying vapors/u,
    );
    assert.equal(toplines(), 'Your potion of booze boils and explodes!');
    assert.equal(game.u.uhp, 12);
    assert.equal(script.length, 0);
});

test('the hero pays the potion damage and exercises strength', async () => {
    await initializedGame(982442, 'HeroDamage');
    emptyPack();
    discover_object(POT_INVISIBILITY, true, true, false, game);
    // An already invisible hero fails potion.c:2034's guard, so
    // potionbreathe() prints nothing and the top line holds one message. The
    // message itself is pinned in scripts/potion.test.mjs.
    game.u.uprops[INVIS].intrinsic = FROMOUTSIDE;
    const potion = carriedByHero(POT_INVISIBILITY, 1);
    game.u.uhp = 12;
    game.u.uhpmax = 12;
    const drawn = [];
    const script = [
        [5, 4],
        [6, 1], // rnd(6): the damage the potion does when it explodes
        [3, 0],
        [2, 0], // exercise(A_STR, FALSE) at zap.c:5949
    ];

    const damage = await destroy_items(game.youmonst, AD_FIRE, 5, {
        random: scriptedRandom(script, drawn),
        state: game,
    });

    // dindx 1 is the boiling-potion row, and cnt == quan == 1 selects
    // Yname2() with an empty `mult` prefix.
    assert.equal(
        toplines(), 'Your potion of invisibility boils and explodes!',
    );
    assert.equal(game.u.uhp, 11);
    assert.equal(damage, 1);
    assert.equal(carriedStacks().includes(potion), false, 'the potion is gone');
    assert.deepEqual(
        drawn, [['rn2', 5, 4], ['rnd', 6, 1], ['rn2', 3, 0], ['rn2', 2, 0]],
    );
    assert.equal(script.length, 0);
    game.u.uprops[INVIS].intrinsic = 0;
});

test('a potion of oil takes the other dindx and calls nothing an unknown '
    + 'type would', async () => {
    await initializedGame(982437, 'HeroOil');
    emptyPack();
    discover_object(POT_OIL, true, true, false, game);
    carriedByHero(POT_OIL, 1);
    game.u.uhp = 12;
    game.u.uhpmax = 12;
    const drawn = [];
    const script = [
        [5, 4],
        [6, 1],
        [3, 0],
        [2, 1], // exercise(A_STR, FALSE) again
    ];

    await destroy_items(game.youmonst, AD_FIRE, 5, {
        random: scriptedRandom(script, drawn),
        state: game,
    });

    // zap.c:5841 `dindx = (obj->otyp != POT_OIL) ? 1 : 2`. The only input that
    // separates the two rows is the otyp, and this is its other value.
    // potionbreathe() falls out of its switch for POT_OIL and reaches
    // do.c trycall(), which is silent because the type is already identified.
    assert.equal(toplines(), 'Your potion of oil ignites and explodes!');
    assert.equal(game.u.uhp, 11);
    assert.equal(script.length, 0);
});

test('the mult chain names each of its five counts', async () => {
    // zap.c:5904-5908. The five prefixes differ only in cnt against quan, and
    // the witness exercises exactly one of them. Each case below moves one of
    // those two numbers and nothing else.
    const cases = [
        // [quan, per-item rn2(3) results, expected prefix]
        [1, [0], ''], // 1 of 1
        [3, [0, 1, 1], 'One of '], // 1 of N
        [3, [0, 0, 1], 'Some of '], // n of N
        [2, [0, 0], 'Both of '], // 2 of 2
        [3, [0, 0, 0], 'All of '], // N of N
    ];
    for (const [quan, rolls, prefix] of cases) {
        await initializedGame(982438, 'HeroMult');
        emptyPack();
        clearTopline();
        discover_object(SCR_BLANK_PAPER, true, true, false, game);
        const stack = carriedByHero(SCR_BLANK_PAPER, quan);
        game.u.uhp = 20;
        game.u.uhpmax = 20;
        const drawn = [];
        const script = [[5, 4], ...rolls.map((r) => [3, r]), [2, 1]];

        await destroy_items(game.youmonst, AD_FIRE, 5, {
            random: scriptedRandom(script, drawn),
            state: game,
        });

        const destroyed = rolls.filter((r) => r === 0).length;
        // dindx 3 is the burning-scroll row, whose plural column is a
        // different string: "catches fire and burns" against "catch fire and
        // burn". cnt > 1 is what picks it.
        const verb = destroyed > 1
            ? 'catch fire and burn' : 'catches fire and burns';
        // objnam.c cxname() is xname(), which pluralises by quantity but
        // prints no count; doname() is the one that would.
        const name = quan === 1 && destroyed === 1
            ? 'Your scroll of blank paper'
            : 'your scrolls of blank paper';
        assert.equal(
            toplines(), `${prefix}${name} ${verb}!`, `${quan}/${destroyed}`,
        );
        // zap.c:5935-5940 calls useup() once per destroyed item, so what is
        // left of the stack counts them.
        if (destroyed === quan) {
            assert.equal(
                carriedStacks().includes(stack), false, `${quan}/${destroyed}`,
            );
        } else {
            assert.equal(stack.quan, quan - destroyed, `${quan}/${destroyed}`);
        }
        assert.equal(script.length, 0, `${quan}/${destroyed}`);
    }
});

test('the AD_COLD and AD_ELEC cases stop by name', async () => {
    await initializedGame(982439, 'HeroColdElec');
    emptyPack();
    discover_object(POT_BOOZE, true, true, false, game);
    carriedByHero(POT_BOOZE, 1);
    // Only the AD_FIRE case is ported. destroyable() admits a non-oil potion
    // under AD_COLD, so the stack reaches maybe_destroy_item() and stops there
    // rather than freezing silently.
    await assert.rejects(
        () => destroy_items(game.youmonst, AD_COLD, 5, {
            random: scriptedRandom([[5, 4]], []),
            state: game,
        }),
        /the AD_COLD case/u,
    );
    await initializedGame(982440, 'HeroElec');
    emptyPack();
    carriedByHero(WAN_NOTHING, 1);
    await assert.rejects(
        () => destroy_items(game.youmonst, AD_ELEC, 5, {
            random: scriptedRandom([[5, 4]], []),
            state: game,
        }),
        /the AD_ELEC case/u,
    );
});

test('a wielded potion stops before the message rather than after it',
    async () => {
    await initializedGame(982441, 'HeroWielded');
    emptyPack();
    discover_object(POT_WATER, true, true, false, game);
    const potion = carriedByHero(POT_WATER, 1);
    potion.owornmask = 0x00000001; // W_WEP
    // zap.c:5921-5926 hands a worn or wielded object to setnotworn(); nothing
    // wires that here. The stop is lifted above the pline() so the segment
    // does not end one message past where the port can follow C.
    await assert.rejects(
        () => destroy_items(game.youmonst, AD_FIRE, 5, {
            random: scriptedRandom([[5, 4], [6, 1], [3, 0]], []),
            state: game,
        }),
        /setnotworn\(\) for a wielded object/u,
    );
    assert.equal(toplines(), '');
});

test('monster-caused floor fire destroys quantities before ignition',
    async () => {
        const monster = await initializedMonster(982433, 'FloorFire');
        const scroll = mksobj(
            SCR_TELEPORTATION,
            false,
            false,
            { state: game },
        );
        scroll.quan = 2;
        scroll.owt = weight(scroll, { state: game });
        scroll.where = OBJ_FLOOR;
        scroll.ox = monster.mx;
        scroll.oy = monster.my;
        scroll.nexthere =
            game.level.objects[monster.mx][monster.my] ?? null;
        scroll.nobj = game.level.objlist ?? null;
        game.level.objects[monster.mx][monster.my] = scroll;
        game.level.objlist = scroll;
        const script = [
            [100, 99], // the ordinary scroll does not resist fire
            [3, 0], // destroy one scroll
            [3, 1], // preserve the other scroll
        ];
        const ignited = [];

        const burned = await burn_floor_objects(
            monster.mx,
            monster.my,
            false,
            false,
            {
                igniteItems: (head) => {
                    ignited.push(head);
                },
                random: {
                    rn1: () => assert.fail('floor fire does not call rn1'),
                    rn2: (bound) => {
                        const [expectedBound, result] = script.shift();
                        assert.equal(bound, expectedBound);
                        return result;
                    },
                    rne: () => assert.fail('floor fire does not call rne'),
                    rnd: () => assert.fail('floor fire does not call rnd'),
                },
                state: game,
            },
        );

        assert.equal(burned, 1);
        assert.equal(scroll.quan, 1);
        assert.equal(scroll.where, OBJ_FLOOR);
        assert.deepEqual(ignited, [scroll]);
        assert.equal(script.length, 0);
    });

test('hero-caused floor fire fails before traversal', async () => {
    const state = {
        level: {
            objects: [[null]],
        },
    };

    await assert.rejects(
        burn_floor_objects(0, 0, false, true, {
            igniteItems: () => assert.fail('unsupported fire cannot ignite'),
            random: {
                rn2: () => assert.fail('unsupported fire cannot draw'),
            },
            state,
        }),
        /hero-caused object destruction/u,
    );
});

test('a visible monster has its own losses announced', async () => {
    const monster = await initializedMonster(982443, 'MonsterSeen');
    // The two naming arms C reaches through yname(): the capitalized 1-of-1
    // possessive and the lowercase one behind a `mult` prefix. `vis` is what
    // admits either, so a monster the hero cannot see prints nothing.
    monster.minvis = false;
    discover_object(SCR_TELEPORTATION, true, true, false, game);
    monster.minvent = carriedByMonster(monster, SCR_TELEPORTATION, 1);
    clearTopline();
    await destroy_items(monster, AD_FIRE, 5, {
        random: scriptedRandom([[5, 4], [3, 0]], []),
        state: game,
    });
    const single = toplines();
    assert.match(single, /scroll of teleportation catches fire and burns!$/u);
    assert.equal(single[0], single[0].toUpperCase());
    assert.equal(single.startsWith('One of '), false);

    monster.minvent = carriedByMonster(monster, SCR_TELEPORTATION, 3);
    clearTopline();
    await destroy_items(monster, AD_FIRE, 5, {
        random: scriptedRandom([[5, 4], [3, 0], [3, 1], [3, 1]], []),
        state: game,
    });
    const some = toplines();
    assert.ok(some.startsWith('One of '), some);
    assert.match(some, /scrolls of teleportation catches fire and burns!$/u);
    // C loops m_useup() once per destroyed item, so one of the three is gone.
    assert.equal(monster.minvent.quan, 2);
    // The possessive between the prefix and the name is the same one, without
    // its leading capital.
    const owner = single.slice(0, single.indexOf(' scroll'));
    assert.ok(
        some.includes(owner[0].toLowerCase() + owner.slice(1)),
        `${some} carries ${owner} uncapitalized`,
    );

    // An unseen monster reaches neither arm.
    monster.minvis = true;
    monster.minvent = carriedByMonster(monster, SCR_TELEPORTATION, 1);
    clearTopline();
    await destroy_items(monster, AD_FIRE, 5, {
        random: scriptedRandom([[5, 4], [3, 0]], []),
        state: game,
    });
    assert.equal(toplines(), '');
});

test('the vapors reach a hero who breathes or a hero who has eyes',
    async () => {
    // zap.c:5919-5920 `!breathless(youmonst.data) || haseyes(youmonst.data)`.
    // A human is both, so only a polymorphed form separates the two operands.
    // Nothing in this port polymorphs the hero; the species below are set
    // directly so that the disjunction is decided by one operand at a time.
    const breathlessWithEyes = game.mons.findIndex(
        (species) => species && breathless(species) && haseyes(species),
    );
    const breathlessNoEyes = game.mons.findIndex(
        (species) => species && breathless(species) && !haseyes(species),
    );
    for (const [pm, breathes] of [
        [breathlessWithEyes, true], [breathlessNoEyes, false],
    ]) {
        await initializedGame(982444, 'HeroBreath');
        emptyPack();
        assert.ok(pm > 0);
        discover_object(POT_BOOZE, true, true, false, game);
        carriedByHero(POT_BOOZE, 1);
        game.u.uhp = 12;
        game.u.uhpmax = 12;
        game.youmonst.data = game.mons[pm];
        const script = [[5, 4], [6, 1], [3, 0]];
        if (!breathes) script.push([2, 1]); // no vapors, so losehp runs
        const call = () => destroy_items(game.youmonst, AD_FIRE, 5, {
            random: scriptedRandom(script, []),
            state: game,
        });
        // POT_BOOZE's vapor arm is unported, so reaching potionbreathe() is
        // visible as that stop and skipping it is visible as a completed call.
        if (breathes) await assert.rejects(call, /the dizzying vapors/u);
        else await call();
        assert.equal(script.length, 0, `${pm}`);
    }
});

test('the killer names the destroy_strings row rather than the glob override',
    async () => {
    // zap.c:5941-5948. `how` reaches svk.killer only on losehp()'s death
    // branch, and nothing reads svk.killer back until end.c done(), so a hero
    // who dies of the explosion is the one input that separates the three
    // killers below.
    const cases = [
        // [otyp, quan, per-item rolls, killer, k_format]
        [POT_BOOZE, 1, [0], 'boiling potion', KILLED_BY_AN],
        [POT_BOOZE, 2, [0, 0], 'boiling potions', KILLED_BY],
        [POT_OIL, 1, [0], 'exploding potion', KILLED_BY_AN], // dindx 2's third
    ];
    for (const [otyp, quan, rolls, killer, format] of cases) {
        await initializedGame(982445, 'HeroKiller');
        emptyPack();
        discover_object(otyp, true, true, false, game);
        // POT_BOOZE's vapors stop this port, so the hero has to be beyond
        // their reach for the killer to be the thing that stops it: an eyeless,
        // breathless form skips potionbreathe() entirely.
        const eyeless = game.mons.findIndex(
            (species) => species && breathless(species) && !haseyes(species),
        );
        game.youmonst.data = game.mons[eyeless];
        carriedByHero(otyp, quan);
        game.u.uhp = 1;
        game.u.uhpmax = 12;
        clearTopline();
        await assertKilledBy(
            () => destroy_items(game.youmonst, AD_FIRE, 5, {
                random: scriptedRandom(
                    [[5, 4], [6, 4], ...rolls.map((r) => [3, r])], [],
                ),
                state: game,
            }),
            killer, format, `${otyp}/${quan}`,
        );
    }
});

test('a glob of green slime takes its own weight and its own killer',
    async () => {
    // zap.c:5854-5856: a glob is FOOD_CLASS, takes dindx 1 and draws no dice
    // at all -- its damage is (obj->owt + 19) / 20. Three weights fix that
    // expression: 190 separates the divisor from 19 and from 21, 20 separates
    // the addend from 20, and 21 separates it from 18.
    for (const [owt, damage] of [[190, 10], [20, 1], [21, 2]]) {
        await initializedGame(982446, 'HeroGlob');
        emptyPack();
        const glob = carriedByHero(GLOB_OF_GREEN_SLIME, 1);
        glob.owt = owt;
        game.u.uhp = 30;
        game.u.uhpmax = 30;
        clearTopline();
        await destroy_items(game.youmonst, AD_FIRE, 5, {
            random: scriptedRandom([[5, 4], [3, 0], [2, 1]], []),
            state: game,
        });
        // dindx 1 is the boiling row, which is what tells a glob apart from
        // the freezing and the igniting rows either side of it.
        assert.equal(
            toplines(), 'Your glob of green slime boils and explodes!',
            `${owt}`,
        );
        assert.equal(game.u.uhp, 30 - damage, `${owt}`);
    }

    // 5946-5947 replaces the boiling-potion killer with the glob's own, which
    // only a hero who dies of it can read back.
    await initializedGame(982449, 'HeroGlobKiller');
    emptyPack();
    const fatal = carriedByHero(GLOB_OF_GREEN_SLIME, 1);
    fatal.owt = 190;
    game.u.uhp = 2;
    game.u.uhpmax = 20;
    clearTopline();
    await assertKilledBy(
        () => destroy_items(game.youmonst, AD_FIRE, 5, {
            random: scriptedRandom([[5, 4], [3, 0]], []),
            state: game,
        }),
        'exploding glob of slime', KILLED_BY_AN,
    );
});

test('a burning spellbook takes its own row and one point of damage',
    async () => {
    await initializedGame(982450, 'HeroBook');
    emptyPack();
    discover_object(SPE_BLANK_PAPER, true, true, false, game);
    carriedByHero(SPE_BLANK_PAPER, 1);
    game.u.uhp = 12;
    game.u.uhpmax = 12;
    clearTopline();
    // zap.c:5847-5850: a spellbook is dindx 4 and a flat 1 point, where a
    // scroll is dindx 3 and the same 1 point. The two rows share their
    // singular column, so the message cannot separate them; the killer reason
    // can, and it is "burning book" against "burning scroll".
    await destroy_items(game.youmonst, AD_FIRE, 5, {
        random: scriptedRandom([[5, 4], [3, 0], [2, 1]], []),
        state: game,
    });
    assert.equal(
        toplines(), 'Your spellbook of blank paper catches fire and burns!',
    );
    assert.equal(game.u.uhp, 11);

    await initializedGame(982451, 'HeroBookKiller');
    emptyPack();
    discover_object(SPE_BLANK_PAPER, true, true, false, game);
    carriedByHero(SPE_BLANK_PAPER, 1);
    game.u.uhp = 1;
    game.u.uhpmax = 12;
    clearTopline();
    await assertKilledBy(
        () => destroy_items(game.youmonst, AD_FIRE, 5, {
            random: scriptedRandom([[5, 4], [3, 0]], []),
            state: game,
        }),
        'burning book', KILLED_BY_AN,
    );
});

test('a fire-resistant carrier loses the scroll but takes no damage',
    async () => {
    const monster = await initializedMonster(982452, 'FireProofMonster');
    // zap.c:5834-5836: xresist covers everything but a potion and a slime
    // glob, and zap.c:5942-5943 turns it into a zero return for a monster.
    const resistant = game.mons.findIndex(
        (species) => species
            && monster_resists_element({ data: species }, FIRE_RES, game),
    );
    assert.ok(resistant > 0);
    monster.data = game.mons[resistant];
    const scroll = carriedByMonster(monster, SCR_TELEPORTATION, 1);
    monster.minvent = scroll;

    const damage = await destroy_items(monster, AD_FIRE, 5, {
        random: scriptedRandom([[5, 4], [3, 0]], []),
        state: game,
    });

    assert.equal(damage, 0);
    assert.equal(monster.minvent, null, 'the scroll still burns');
});

test('a worn potion of levitation waits for the rest of the pack', async () => {
    await initializedGame(982447, 'HeroDeferWorn');
    emptyPack();
    discover_object(SCR_BLANK_PAPER, true, true, false, game);
    discover_object(POT_LEVITATION, true, true, false, game);
    carriedByHero(SCR_BLANK_PAPER, 1);
    const potion = carriedByHero(POT_LEVITATION, 1);
    potion.owornmask = 0x00000001; // W_WEP
    game.u.uhp = 12;
    game.u.uhpmax = 12;
    const drawn = [];
    // zap.c:6060-6072 defers a worn or wielded object whose oc_oprop is
    // LEVITATION or FLYING, and 6079-6092 runs the rest of the pack first.
    // The potion heads the chain, so without the deferral it would be the
    // first stack destroyed; the draw order below is what says it was not.
    const script = [
        [5, 4], // 10 % 5 == 0 loses; limit is 2 and neither stack draws
        [3, 0], // pass 0 destroys the scroll
        [2, 1], // exercise(A_STR, FALSE) for the scroll's damage
        [6, 1], // pass 1 reaches the potion and rolls its damage
        [3, 0],
    ];
    clearTopline();

    await assert.rejects(
        () => destroy_items(game.youmonst, AD_FIRE, 10, {
            random: scriptedRandom(script, drawn),
            state: game,
        }),
        /setnotworn\(\) for a wielded object/u,
    );
    assert.equal(
        toplines(), 'Your scroll of blank paper catches fire and burns!',
    );
    assert.equal(script.length, 0);
});

test('an unworn potion and a cursed potion of water are not deferred',
    async () => {
    // The same two stacks in the same order, with the one term that made the
    // potion wait removed. zap.c:6063 needs a worn mask as well as the
    // oc_oprop, and 6066-6068 needs a lycanthrope hero as well as the curse;
    // u.ulycn is NON_PM for every hero this port builds.
    for (const otyp of [POT_LEVITATION, POT_WATER]) {
        await initializedGame(982448, 'HeroDeferNot');
        emptyPack();
        discover_object(SCR_BLANK_PAPER, true, true, false, game);
        discover_object(otyp, true, true, false, game);
        carriedByHero(SCR_BLANK_PAPER, 1);
        const potion = carriedByHero(otyp, 1);
        potion.cursed = true;
        assert.equal(ismnum(game.u.ulycn), false);
        game.u.uhp = 12;
        game.u.uhpmax = 12;
        const script = [
            [5, 4],
            [6, 1], // pass 0 reaches the potion first, because it heads the chain
            [3, 1], // and destroys none of it
            [3, 0], // then the scroll
            [2, 1],
        ];
        clearTopline();

        await destroy_items(game.youmonst, AD_FIRE, 10, {
            random: scriptedRandom(script, []),
            state: game,
        });

        assert.equal(
            toplines(), 'Your scroll of blank paper catches fire and burns!',
            `${otyp}`,
        );
        assert.equal(script.length, 0, `${otyp}`);
    }
});

test('worn fire resistance protects a stack before anything is drawn for it',
    async () => {
    await initializedGame(982453, 'HeroProtected');
    emptyPack();
    discover_object(POT_BOOZE, true, true, false, game);
    const potion = carriedByHero(POT_BOOZE, 1);
    game.u.uhp = 12;
    game.u.uhpmax = 12;
    // zap.c:5815-5817 over u_adtyp_resistance_obj(): an extrinsic from armor
    // is 99% protection, and inventory_resistance_check() rolls rn2(100)
    // against it. maybe_destroy_item() then returns before its damage roll,
    // so the whole stack survives on one draw.
    game.u.uprops[FIRE_RES].extrinsic = 0x00000002; // W_ARMC
    clearTopline();

    const damage = await destroy_items(game.youmonst, AD_FIRE, 5, {
        random: scriptedRandom([[5, 4], [100, 98]], []),
        state: game,
    });

    assert.equal(damage, 0);
    assert.equal(toplines(), '');
    assert.equal(carriedStacks().includes(potion), true);
    // A roll of 99 loses to the 99% and the stack is destroyed as usual. Its
    // vapors then stop this port, which is one call past the message.
    clearTopline();
    await assert.rejects(
        () => destroy_items(game.youmonst, AD_FIRE, 5, {
            random: scriptedRandom([[5, 4], [100, 99], [6, 1], [3, 0]], []),
            state: game,
        }),
        /the dizzying vapors/u,
    );
    assert.equal(toplines(), 'Your potion of booze boils and explodes!');
    game.u.uprops[FIRE_RES].extrinsic = 0;
});

test('the destruction refusal is one the command seam converts', () => {
    // Raised under dozap() through zhitu(), so it has to be in the list js/cmd.js
    // failClosedCommandRefusals() returns; without it the segment loses every
    // screen the zap had already matched.
    assert.ok(
        failClosedCommandRefusals().includes(UnsupportedItemDestructionError),
    );
});

test('the Book of the Dead survives the fire and says so', async () => {
    // zap.c:5850-5861. The Book is the one destroyable() admits that
    // maybe_destroy_item() then refuses to destroy: it sets skip, prints its
    // own line and breaks with quan still 0, so the per-item rn2(3) loop below
    // runs zero times and nothing is drawn, used up or paid for. That makes
    // the whole arm invisible to a draw-order test; only the message and the
    // untouched stack show it ran.
    await initializedGame(982461, 'HeroBook');
    emptyPack();
    // mksobj() refuses the Book, whose makeArtifact() path is unported, so
    // the stack starts as an ordinary spellbook and is retyped. Only otyp is
    // read on this arm: destroyable()'s SPBOOK_CLASS test, the skip guard and
    // xnameFresh()'s name all take it from there.
    const book = carriedByHero(SPE_FORCE_BOLT, 1);
    book.otyp = SPE_BOOK_OF_THE_DEAD;
    game.u.uhp = 12;
    game.u.uhpmax = 12;
    const drawn = [];
    // Only destroy_items()' own scaling draw; the item loop draws nothing.
    const script = [[5, 0]];

    const damage = await destroy_items(game.youmonst, AD_FIRE, 5, {
        random: scriptedRandom(script, drawn),
        state: game,
    });

    // Undiscovered, so xname() answers the appearance. A discovered Book
    // takes objnam.c the()'s proper-noun branch, which js/objnam.js refuses;
    // the case below pins that half.
    assert.equal(
        toplines(),
        'The papyrus spellbook glows a strange dark red, but remains intact.',
    );
    assert.equal(damage, 0);
    assert.equal(book.quan, 1);
    assert.equal(game.u.uhp, 12);
    assert.deepEqual(drawn, [['rn2', 5, 0]]);
    assert.equal(script.length, 0);
});

test('a blind hero is told nothing when the Book survives', async () => {
    // The same arm's `u_carry ? !heroIsBlind(state) : vis` selector. C prints
    // through hcolor() only for a hero who can see it, and the skip stands
    // either way, so a blind hero loses the message and keeps the Book.
    await initializedGame(982462, 'BlindBook');
    emptyPack();
    const book = carriedByHero(SPE_FORCE_BOLT, 1);
    book.otyp = SPE_BOOK_OF_THE_DEAD;
    game.u.uprops[BLINDED] = { intrinsic: FROMOUTSIDE, extrinsic: 0 };
    const drawn = [];
    const script = [[5, 0]];

    const damage = await destroy_items(game.youmonst, AD_FIRE, 5, {
        random: scriptedRandom(script, drawn),
        state: game,
    });

    assert.equal(toplines(), '');
    assert.equal(damage, 0);
    assert.equal(book.quan, 1);
    game.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0 };
});

test('a discovered Book uses the article from its capitalized name',
    async () => {
    // objnam.c The() over xname() finds " of " before any naming clause and
    // names a discovered Book "The Book of the Dead".
    await initializedGame(982463, 'KnownBook');
    emptyPack();
    const book = carriedByHero(SPE_FORCE_BOLT, 1);
    book.otyp = SPE_BOOK_OF_THE_DEAD;
    discover_object(SPE_BOOK_OF_THE_DEAD, true, true, false, game);
    const drawn = [];

    const damage = await destroy_items(game.youmonst, AD_FIRE, 5, {
        random: scriptedRandom([[5, 0]], drawn),
        state: game,
    });
    assert.equal(
        toplines(),
        'The Book of the Dead glows a strange dark red, but remains intact.',
    );
    assert.equal(damage, 0);
    assert.equal(book.quan, 1);
    assert.deepEqual(drawn, [['rn2', 5, 0]]);
});
