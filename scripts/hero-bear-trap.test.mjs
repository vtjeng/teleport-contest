import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_DEX,
    BEAR_TRAP,
    BOTH_SIDES,
    FLYING,
    HALF_PHDAM,
    LEFT_SIDE,
    LEVITATION,
    PIT,
    RIGHT_SIDE,
    TIMEOUT,
    OBJ_INVENT,
    TOOKPLUNGE,
    TT_BEARTRAP,
    TT_NONE,
    WOUNDED_LEGS,
    W_ARMF,
    WT_WOUNDEDLEG_REDUCT,
} from '../js/const.js';
import { set_wounded_legs } from '../js/do.js';
import { game } from '../js/gstate.js';
import {
    UnsupportedHeroMoveBoundaryError,
    domove,
    weight_cap,
} from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import {
    ARMOR_CLASS,
    HIGH_BOOTS,
    IRON_SHOES,
} from '../js/objects.js';
import {
    UnsupportedHeroTimeoutBoundaryError,
    nh_timeout_elapsed_turn,
} from '../js/timeout.js';
import {
    PM_AIR_ELEMENTAL,
    PM_BLACK_PUDDING,
    PM_GHOST,
    PM_KITTEN,
    PM_OWLBEAR,
} from '../js/monsters.js';
import { float_vs_flight } from '../js/polyself.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    check_in_air,
    dotrap,
    preflight_dotrap,
    wearing_iron_shoes,
} from '../js/trap_effects.js';
import { loadHeroBearTrapRecipe } from './run-hero-bear-trap.mjs';

// The keys every segment is allowed to spend: eight compass directions for the
// walk-in and the escape attempts, and space for the More prompts that
// look_here() and the trap line raise.
const SEGMENT_KEYS = new Set(['h', 'j', 'k', 'l', 'y', 'u', 'b', 'n', ' ']);

// Start each unit case from a real generated game rather than a synthetic
// state: set_wounded_legs() reaches encumber_msg() and weight_cap(), which
// read carried weight, Strength and Constitution. The Healer segment is the
// one whose hero carries little enough that no wounded leg crosses an
// encumbrance threshold, so nothing here raises a More prompt with no keys
// left to dismiss it.
async function heroOnLevelOne() {
    const segment = loadHeroBearTrapRecipe().segments[1];
    return runSegment({ ...segment, moves: '' });
}

function woundedLegs() {
    return game.u.uprops[WOUNDED_LEGS];
}

test('hero-bear-trap matrix contains only source-selected inputs', () => {
    const recipe = loadHeroBearTrapRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 6);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // A pet on either square would hand the step to
        // domove_swap_with_pet(), whose trap handling is a separate boundary.
        assert.match(segment.nethackrc, /OPTIONS=pettype:none/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment walks, waits at a More prompt, or struggles',
        );
    }
    // Exactly one segment needs two consecutive spaces: only there does
    // encumber_msg() add a second message, which pairs with the trap line
    // into a More prompt. The rest dismiss look_here()'s window alone.
    assert.equal(
        recipe.segments.filter(({ moves }) => moves.includes('  ')).length,
        1,
    );
    // Both escape geometries are represented, because `(u.dx && u.dy) ||
    // !rn2(5)` spends a random number for one and not for the other.
    assert.ok(recipe.segments.some(({ moves }) => moves.endsWith('yyyyyyyy')));
    assert.ok(recipe.segments.some(({ moves }) => moves.endsWith('hhhhhhhhhh')));
});

test('every matrix segment springs its bear trap and replays to its last key',
    async () => {
        const { segments } = loadHeroBearTrapRecipe();
        let escaped = 0;
        let stillHeld = 0;
        for (const [index, segment] of segments.entries()) {
            await runSegment({ ...segment, moves: '' });
            const before = game.level.traps.filter(
                (trap) => trap.ttyp === BEAR_TRAP,
            );
            assert.ok(before.length, `segment ${index} generates a bear trap`);
            assert.ok(
                before.every((trap) => !trap.tseen),
                `segment ${index} starts with every bear trap unseen`,
            );
            assert.equal(game.u.utrap, 0, `segment ${index} starts free`);

            const replay = await runSegment(segment);
            // The port emits one screen per consumed key plus the opening
            // prompt, so a segment that stopped at a boundary emits fewer.
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `segment ${index} emits one screen per key plus the prompt`,
            );
            const sprung = game.level.traps.filter(
                (trap) => trap.ttyp === BEAR_TRAP && trap.tseen,
            );
            assert.equal(
                sprung.length, 1,
                `segment ${index} springs exactly one bear trap`,
            );
            if (game.u.utrap) {
                assert.equal(game.u.utraptype, TT_BEARTRAP);
                assert.deepEqual(
                    [game.u.ux, game.u.uy], [sprung[0].tx, sprung[0].ty],
                    `segment ${index} holds the hero in the trap`,
                );
                stillHeld++;
            } else {
                // trapmove()'s wriggle_free: label ran, and domove() answered
                // it with reset_utrap(), which clears the type as well.
                assert.equal(game.u.utraptype, TT_NONE);
                escaped++;
            }
            // set_wounded_legs() costs one point of temporary Dexterity, once
            // however many times it is called, and marks one leg.
            assert.equal(game.u.atemp[A_DEX], -1, `segment ${index} Dexterity`);
            assert.ok(
                [LEFT_SIDE, RIGHT_SIDE].includes(woundedLegs().extrinsic),
                `segment ${index} wounds exactly one leg`,
            );
            // rn1(10, 10) is 10..19 and the countdown has run for at most the
            // segment's turns, so a positive remainder is the whole invariant
            // heal_legs() would otherwise have to answer for.
            assert.ok(
                (woundedLegs().intrinsic & TIMEOUT) > 0,
                `segment ${index} still has wounded legs`,
            );
        }
        // Both ends of the escape are covered: a segment that struggles free
        // and one that is still held when its keys run out.
        assert.ok(escaped > 0);
        assert.ok(stillHeld > 0);
    });

test('the hero arm draws d(2,4), rn1(4,4), rn2(2), rn1(10,10) and rn2(2)',
    async () => {
        // Everything trapeffect_bear_trap()'s hero arm spends, in the order
        // trap.c:1490, :1506, :1520 and :1524 spend it. rn1(x, y) is logged as
        // its rn2(x), so rn1(4, 4) reads as rn2(4) and rn1(10, 10) as rn2(10).
        // The last rn2(2) is attrib.c:509's decrement inside exercise(A_DEX,
        // FALSE); exercising upward would draw rn2(19) instead.
        const [, walkIn] = loadHeroBearTrapRecipe().segments;
        const arrival = await runSegment({ ...walkIn, moves: 'j' });
        const spent = arrival.getRngLog().length;
        const sprung = await runSegment({ ...walkIn, moves: 'j ' });
        const draws = sprung.getRngLog().slice(spent).map(
            (entry) => entry.replace(/=.*$/u, ''),
        );

        assert.deepEqual(
            draws.slice(0, 5),
            ['d(2,4)', 'rn2(4)', 'rn2(2)', 'rn2(10)', 'rn2(2)'],
        );
        // exercise(A_DEX, FALSE) subtracts rn2(2), so the exercise counter can
        // only have moved down.
        assert.ok(game.u.aexe[A_DEX] <= 0);
    });

test('a diagonal escape attempt costs no draw and an orthogonal one costs '
    + 'rn2(5)', async () => {
    // The Healer segment walks one square south onto the trap and dismisses
    // look_here(); everything after that is trapmove().
    const [, walkIn] = loadHeroBearTrapRecipe().segments;
    const replay = await runSegment({ ...walkIn, moves: 'j ' });
    assert.equal(game.u.utraptype, TT_BEARTRAP);
    const held = game.u.utrap;
    assert.ok(held >= 4 && held <= 7, 'rn1(4, 4) holds for four to seven');

    const attempt = async (dx, dy) => {
        game.u.dx = dx;
        game.u.dy = dy;
        game.u.umoved = false;
        game.context.move = 1;
        game.domoveAttempting = 1;
        const before = replay.getRngLog().length;
        const trapped = game.u.utrap;
        await domove(game);
        return {
            draws: replay.getRngLog().length - before,
            released: trapped - game.u.utrap,
        };
    };

    // hack.c:1576 short-circuits on `u.dx && u.dy`, so a diagonal step always
    // frees one point and never reaches rn2(5).
    const diagonal = await attempt(-1, -1);
    assert.equal(diagonal.draws, 0);
    assert.equal(diagonal.released, 1);

    // An orthogonal step reaches rn2(5) and spends it whichever way it falls.
    const orthogonal = await attempt(-1, 0);
    assert.equal(orthogonal.draws, 1);
    assert.ok([0, 1].includes(orthogonal.released));
});

test('escaping a bear trap while levitating stops at float_up()', async () => {
    // hack.c:2833-2836 answers a hero who has just worked free with
    // reset_utrap(TRUE), and TRUE is what lets trap.c:1050-1053 resume a
    // suspended levitation. polyself.c float_vs_flight() suspends it while
    // u.utraptype is anything but TT_PIT, so a hero who gains Levitation
    // inside a bear trap is exactly the case that argument exists for.
    // float_up() is not ported, so the port stops there.
    const [, walkIn] = loadHeroBearTrapRecipe().segments;
    await runSegment({ ...walkIn, moves: 'j ' });
    assert.equal(game.u.utraptype, TT_BEARTRAP);
    // One point left is the state the next-to-last struggling step reaches;
    // writing it here spends no turns on the way, so the segment needs no
    // keys for the messages those turns would raise.
    game.u.utrap = 1;
    game.u.uprops[LEVITATION].intrinsic = 1;
    float_vs_flight(game);
    assert.ok(game.u.uprops[LEVITATION].blocked);

    game.u.dx = -1;
    game.u.dy = -1;
    game.u.umoved = false;
    game.context.move = 1;
    game.domoveAttempting = 1;
    clearTtyMessageWindow(game);
    await assert.rejects(
        domove(game),
        (error) => error instanceof UnsupportedHeroMoveBoundaryError
            && error.reason === 'reset_utrap() resuming levitation',
    );
});

test('a hero the bear trap cannot hold is told so and stays free', async () => {
    // trap.c:1495-1505's two harmless arms and the owlbear howl at :1515-1516.
    // None is reachable from a walk-in: js/u_init.js is the only writer of
    // u.umonnum and u.umonster and gives them the same value, so Upolyd() is
    // false for every hero the port builds. Each arm is therefore driven
    // through dotrap() directly, standing on an unseen trap, with only the
    // field that arm reads replaced.
    const [, walkIn] = loadHeroBearTrapRecipe().segments;
    const forms = [
        // amorphous(): a pudding flows through the jaws.
        { form: PM_BLACK_PUDDING, expected: /closes harmlessly through you/u },
        // is_whirly(): an air elemental has nothing solid to close on.
        { form: PM_AIR_ELEMENTAL, expected: /closes harmlessly through you/u },
        // unsolid() on its own. A ghost is neither amorphous nor whirly, so
        // it is the form that separates the third term from the other two.
        { form: PM_GHOST, expected: /closes harmlessly through you/u },
        // msize <= MZ_SMALL: a kitten is MZ_SMALL exactly, which is what makes
        // trap.c:1501's `<=` distinguishable from `<`.
        { form: PM_KITTEN, expected: /closes harmlessly over you/u },
        // An owlbear is caught like anyone else and howls about it. Its arm
        // runs to the end, where losehp() refuses the polymorphed hero this
        // form implies -- but only after the howl has been written.
        {
            form: PM_OWLBEAR,
            umonnum: PM_OWLBEAR,
            expected: /howl in anger/u,
            caught: true,
            rejects: /polymorphed hero/u,
        },
    ];

    for (const specimen of forms) {
        await runSegment({ ...walkIn, moves: '' });
        const trap = {
            tx: game.u.ux, ty: game.u.uy, ttyp: BEAR_TRAP,
            tseen: false, madeby_u: 0,
        };
        game.level.traps.push(trap);
        game.youmonst.data = game.mons[specimen.form];
        if (specimen.umonnum) game.u.umonnum = specimen.umonnum;
        // The welcome line is still pending, and it is long enough that any
        // addition would raise a More prompt this segment has no key for.
        clearTtyMessageWindow(game);
        game._ttyToplines = '';

        if (specimen.rejects) {
            await assert.rejects(dotrap(trap, 0, game), specimen.rejects);
        } else {
            await dotrap(trap, 0, game);
        }

        assert.match(game._ttyToplines, specimen.expected);
        assert.equal(Boolean(game.u.utrap), Boolean(specimen.caught));
        // feeltrap() runs before every one of these arms, so the hero knows
        // the trap however it ends.
        assert.equal(trap.tseen, true);
    }
});

test('set_wounded_legs charges Dexterity once and keeps the longer timeout',
    async () => {
        await heroOnLevelOne();
        const capacity = weight_cap(game);
        assert.equal(game.u.atemp[A_DEX], 0);
        game.disp.botl = false;

        // do.c:2429-2430. The first wound is what costs Dexterity, and
        // do.c:2428 flags the status line whether or not anything else does.
        await set_wounded_legs(RIGHT_SIDE, 17, game);
        assert.equal(game.disp.botl, true);
        assert.equal(game.u.atemp[A_DEX], -1);
        assert.equal(woundedLegs().intrinsic & TIMEOUT, 17);
        assert.equal(woundedLegs().extrinsic, RIGHT_SIDE);
        assert.equal(weight_cap(game), capacity - WT_WOUNDEDLEG_REDUCT);

        // do.c:2432-2433. A shorter timeout leaves the longer one standing,
        // but the side bit is still ORed in, and no second point is charged.
        await set_wounded_legs(LEFT_SIDE, 5, game);
        assert.equal(game.u.atemp[A_DEX], -1);
        assert.equal(woundedLegs().intrinsic & TIMEOUT, 17);
        assert.equal(woundedLegs().extrinsic, BOTH_SIDES);
        assert.equal(weight_cap(game), capacity - 2 * WT_WOUNDEDLEG_REDUCT);

        // A longer one replaces it.
        await set_wounded_legs(LEFT_SIDE, 40, game);
        assert.equal(woundedLegs().intrinsic & TIMEOUT, 40);
    });

test('an extrinsic-only wound is already Wounded_legs', async () => {
    // youprop.h:138 spells Wounded_legs as HWounded_legs || EWounded_legs, and
    // youprop.h:131-135 says the extrinsic side bits are meaningless while the
    // intrinsic is zero. That combination is what a saved game restored
    // mid-recovery can hold, and it is the only state in which the two
    // operands disagree, so it is where the OR is distinguishable from an AND.
    await heroOnLevelOne();
    woundedLegs().extrinsic = LEFT_SIDE;

    await set_wounded_legs(RIGHT_SIDE, 12, game);

    // Already wounded, so no second point of Dexterity is charged.
    assert.equal(game.u.atemp[A_DEX], 0);
    assert.equal(woundedLegs().intrinsic & TIMEOUT, 12);
    assert.equal(woundedLegs().extrinsic, BOTH_SIDES);
});

test('weight_cap subtracts per wounded leg and flying suppresses it',
    async () => {
        await heroOnLevelOne();
        const capacity = weight_cap(game);
        woundedLegs().extrinsic = BOTH_SIDES;
        assert.equal(weight_cap(game), capacity - 2 * WT_WOUNDEDLEG_REDUCT);
        woundedLegs().extrinsic = LEFT_SIDE;
        assert.equal(weight_cap(game), capacity - WT_WOUNDEDLEG_REDUCT);
        woundedLegs().extrinsic = RIGHT_SIDE;
        assert.equal(weight_cap(game), capacity - WT_WOUNDEDLEG_REDUCT);

        // hack.c:4331 guards the whole reduction on !Flying.
        woundedLegs().extrinsic = BOTH_SIDES;
        game.u.uprops[FLYING].intrinsic = 1;
        assert.equal(weight_cap(game), capacity);
        game.u.uprops[FLYING].intrinsic = 0;
        assert.equal(weight_cap(game), capacity - 2 * WT_WOUNDEDLEG_REDUCT);
    });

test('wearing_iron_shoes reads the boot material, not the slot', async () => {
    await heroOnLevelOne();
    const boots = (otyp) => ({
        o_id: 91, otyp, oclass: ARMOR_CLASS, quan: 1,
        owornmask: W_ARMF, where: OBJ_INVENT,
    });

    assert.equal(wearing_iron_shoes(game.youmonst, game), false);
    // objects.c gives IRON_SHOES oc_material IRON and HIGH_BOOTS LEATHER;
    // both occupy the same W_ARMF slot, so material is the whole test.
    game.uarmf = boots(HIGH_BOOTS);
    assert.equal(wearing_iron_shoes(game.youmonst, game), false);
    game.uarmf = boots(IRON_SHOES);
    assert.equal(wearing_iron_shoes(game.youmonst, game), true);
});

test('check_in_air answers the hero from Levitation and Flying', async () => {
    await heroOnLevelOne();
    assert.equal(check_in_air(game.youmonst, 0, game), false);

    game.u.uprops[FLYING].intrinsic = 1;
    assert.equal(check_in_air(game.youmonst, 0, game), true);
    // trap.c:1093 drops the Flying term for a hero who took the plunge on
    // purpose, so a flying hero who jumps in still triggers the trap.
    assert.equal(check_in_air(game.youmonst, TOOKPLUNGE, game), false);
    game.u.uprops[FLYING].intrinsic = 0;

    // trap.c:1092 reads Levitation with no `plunged` exception beside it.
    game.u.uprops[LEVITATION].intrinsic = 1;
    assert.equal(check_in_air(game.youmonst, 0, game), true);
    assert.equal(check_in_air(game.youmonst, TOOKPLUNGE, game), true);
    game.u.uprops[LEVITATION].intrinsic = 0;
    assert.equal(check_in_air(game.youmonst, 0, game), false);
});

test('the wounded-legs timeout counts down and stops where heal_legs begins',
    async () => {
        await heroOnLevelOne();
        woundedLegs().intrinsic = 3;
        woundedLegs().extrinsic = RIGHT_SIDE;

        nh_timeout_elapsed_turn(game);
        assert.equal(woundedLegs().intrinsic & TIMEOUT, 2);
        nh_timeout_elapsed_turn(game);
        assert.equal(woundedLegs().intrinsic & TIMEOUT, 1);

        // timeout.c:670-671 decrements first and runs the expiry switch on the
        // property that reaches zero. WOUNDED_LEGS' case there is heal_legs().
        assert.throws(
            () => nh_timeout_elapsed_turn(game),
            (error) => error instanceof UnsupportedHeroTimeoutBoundaryError
                && error.reason.includes('heal_legs()'),
        );
        // The refusal precedes the countdown, so the turn can be retried.
        assert.equal(woundedLegs().intrinsic & TIMEOUT, 1);
    });

test('preflight_dotrap refuses a mounted hero before the trap is entered',
    async () => {
        await heroOnLevelOne();
        const trap = { tx: game.u.ux, ty: game.u.uy, ttyp: BEAR_TRAP,
            tseen: false, madeby_u: 0 };
        assert.doesNotThrow(() => preflight_dotrap(trap, game));

        // trap.c:1507-1511 gives the wound to the steed and names it through
        // s_suffix(mon_nam()). hack.c domove() refuses a ride before this, so
        // no matrix segment can reach it.
        game.u.usteed = { mx: game.u.ux, my: game.u.uy };
        assert.throws(
            () => preflight_dotrap(trap, game),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason === 'a bear trap closing on a steed',
        );
        game.u.usteed = null;

        // Every other trap type keeps the blanket stop it had before the bear
        // trap was ported.
        assert.throws(
            () => preflight_dotrap({ ...trap, ttyp: PIT }, game),
            (error) => error.reason === 'trap activation',
        );
    });

test('Half_physical_damage halves the bear trap bite', async () => {
    // hack.h:1236 Maybe_Half_Phys() rounds up, so `(dmg + 1) / 2`. Nothing in
    // this port grants HALF_PHDAM, but the macro is on the damage line and
    // youprop.h:341 reads the intrinsic and the extrinsic separately, so the
    // property is set here directly. Both runs start from the same segment and
    // therefore roll the same d(2,4).
    const [, walkIn] = loadHeroBearTrapRecipe().segments;
    const bite = async (halved) => {
        await runSegment({ ...walkIn, moves: '' });
        const trap = {
            tx: game.u.ux, ty: game.u.uy, ttyp: BEAR_TRAP,
            tseen: false, madeby_u: 0,
        };
        game.level.traps.push(trap);
        if (halved) game.u.uprops[HALF_PHDAM].intrinsic = 1;
        clearTtyMessageWindow(game);
        const before = game.u.uhp;
        await dotrap(trap, 0, game);
        return before - game.u.uhp;
    };

    const full = await bite(false);
    assert.ok(full >= 2 && full <= 8, 'd(2, 4) bites for two to eight');
    assert.equal(await bite(true), Math.trunc((full + 1) / 2));
});
