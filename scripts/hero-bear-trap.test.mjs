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
    TT_BURIEDBALL,
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
    preflightDomoveDestination,
    weight_cap,
} from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import {
    ARMOR_CLASS,
    BOULDER,
    HIGH_BOOTS,
    IRON_SHOES,
} from '../js/objects.js';
import {
    UnsupportedHeroTimeoutBoundaryError,
    nh_timeout_elapsed_turn,
} from '../js/timeout.js';
import {
    PM_BLACK_PUDDING,
    PM_DUST_VORTEX,
    PM_GHOST,
    PM_KITTEN,
    PM_KOBOLD,
    PM_OWLBEAR,
} from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { float_vs_flight } from '../js/polyself.js';
import { t_at } from '../js/trap.js';
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
    assert.equal(recipe.segments.length, 7);
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
            // rn1(10, 10)'s base is pinned against its own draw by the test
            // below; what this asserts is the matrix invariant that keeps the
            // expiry out of reach, since heal_legs() would refuse the turn a
            // count reached zero.
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
        const entries = sprung.getRngLog().slice(spent, spent + 5);
        const draws = entries.map((entry) => entry.replace(/=.*$/u, ''));
        const values = entries.map((entry) => Number(entry.replace(/^.*=/u, '')));

        assert.deepEqual(
            draws,
            ['d(2,4)', 'rn2(4)', 'rn2(2)', 'rn2(10)', 'rn2(2)'],
        );
        // trap.c:1520 maps a 1 to RIGHT_SIDE and a 0 to LEFT_SIDE. Deriving
        // the side from the draw rather than naming a constant is what pins
        // that polarity: nothing else in the port can tell the two apart,
        // because hack.c weight_cap() subtracts WT_WOUNDEDLEG_REDUCT for
        // either alike and do.c heal_legs(), whose line names the leg, is
        // unported. This seed draws 0, so the RIGHT_SIDE arm stays unexercised
        // -- every matrix segment draws 0 -- but a swapped pair still fails.
        assert.equal(
            woundedLegs().extrinsic,
            values[2] ? RIGHT_SIDE : LEFT_SIDE,
        );
        // trap.c:1520's recovery time is rn1(10, 10), which is 10 plus the
        // logged rn2(10). One point is already gone, because the trap springs
        // inside the turn whose own nh_timeout() then counts it down. Written
        // against the draw, this pins rn1()'s `from` argument in both
        // directions; the matrix's remaining-turns bound cannot.
        assert.equal(woundedLegs().intrinsic & TIMEOUT, 10 + values[3] - 1);
        // exercise(A_DEX, FALSE) subtracts rn2(2), so the exercise counter can
        // only have moved down.
        assert.ok(game.u.aexe[A_DEX] <= 0);
    });

test('the trap, the struggle and the load each print their own line',
    async () => {
        // Every line this slice writes, at the turn that writes it. The matrix
        // asserts screen counts and state fields and never reads a screen's
        // contents, so without this each of these four survives deletion.
        const [knight, walkIn] = loadHeroBearTrapRecipe().segments;

        // trap.c:1513-1514, A_Your[0] with body_part(FOOT).
        await runSegment({ ...walkIn, moves: 'j ' });
        assert.equal(game._ttyToplines, 'A bear trap closes on your foot!');

        // do.c:2445 set_wounded_legs() -> encumber_msg(). The Knight is the
        // one matrix hero whose load crosses a threshold when a wounded leg
        // takes WT_WOUNDEDLEG_REDUCT off weight_cap(), which is why that
        // segment needs a second space: this line and the trap line pair into
        // a More prompt. Asserted here rather than inferred from the key
        // count. The direct call comes first because allmain.c:208 opens the
        // next turn with an encumber_msg() of its own, which prints the same
        // line and so hides do.c's when the segment runs to its end.
        const load = 'Your movements are slowed slightly because of your load.';
        await runSegment({ ...knight, moves: '' });
        clearTtyMessageWindow(game);
        game._ttyToplines = '';
        await set_wounded_legs(RIGHT_SIDE, 12, game); // any nonzero timeout
        assert.equal(game._ttyToplines, load);

        await runSegment({ ...knight, moves: 'hh  ' });
        assert.equal(game._ttyToplines, load);

        // hack.c:1572 and 1676, the two lines trapmove() writes. One point of
        // u.utrap left is the state the next-to-last struggling step reaches;
        // writing it here spends no turns and so raises no message the segment
        // has no key to dismiss. Both land on the same turn, because Norep()
        // suppresses the first only when the previous message was already it.
        await runSegment({ ...walkIn, moves: 'j ' });
        game.u.utrap = 1;
        game.u.dx = -1;
        game.u.dy = -1;
        game.u.umoved = false;
        game.context.move = 1;
        game.domoveAttempting = 1;
        clearTtyMessageWindow(game);
        game._ttyToplines = '';
        await domove(game);
        assert.equal(
            game._ttyToplines,
            'You are caught in a bear trap.  You finally wriggle free.',
        );

        // trap.c:78's A_Your[1]. No recorded session can reach it: madeby_u is
        // written only by the unported trap-setting code, so a direct dotrap()
        // on a trap the hero is standing on is the only way to index it.
        await runSegment({ ...walkIn, moves: '' });
        const trap = {
            tx: game.u.ux, ty: game.u.uy, ttyp: BEAR_TRAP,
            tseen: false, madeby_u: 1,
        };
        game.level.traps.push(trap);
        clearTtyMessageWindow(game);
        game._ttyToplines = '';
        await dotrap(trap, 0, game);
        assert.equal(game._ttyToplines, 'Your bear trap closes on your foot!');
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

test('a held hero struggles toward a square the seam screens when free',
    async () => {
        // hack.c domove_core():2830-2841 hands a held hero's step to
        // trapmove() and returns at 2840, above test_move() at 2843, so C
        // reads nothing about the square the hero pushes against. The
        // admission seam runs ahead of domove() and used to read it anyway,
        // which ended the segment on the first escape key aimed at anything
        // but bare floor.
        const { segments } = loadHeroBearTrapRecipe();
        const cases = [
            // The matrix levels' own neighbours. Seed 69 (segment 3) puts a
            // closed door northeast of its bear trap; seed 395 (segment 1) an
            // unported trap type. A free hero walks through the door, because
            // autoopen pulls it open, so that case pins only the order of the
            // held arm against the closed-door arm below it.
            { index: 3, walkIn: 'n ', dx: 1, dy: -1, freeReason: null },
            {
                index: 1, walkIn: 'j ', dx: 1, dy: -1,
                freeReason: 'trap activation',
            },
            // A boulder, written onto the bare floor northwest of seed 395's
            // trap: no generated level puts one beside any of these six traps,
            // and it is the neighbour a room is likeliest to hold.
            {
                index: 1, walkIn: 'j ', dx: -1, dy: -1,
                freeReason: 'boulder movement',
                place: (x, y) => {
                    game.level.objects[x][y] = {
                        o_id: 7101, otyp: BOULDER, nexthere: null,
                    };
                },
            },
        ];

        for (const { index, walkIn, dx, dy, freeReason, place } of cases) {
            await runSegment({ ...segments[index], moves: walkIn });
            assert.equal(game.u.utraptype, TT_BEARTRAP, `segment ${index}`);
            const x = game.u.ux + dx;
            const y = game.u.uy + dy;
            if (place) place(x, y);

            // The seam still screens the square for a hero the trap has let
            // go, which is what it is for; only the held hero skips it.
            if (freeReason) {
                const held = game.u.utrap;
                game.u.utrap = 0;
                game.u.utraptype = TT_NONE;
                assert.throws(
                    () => preflightDomoveDestination(x, y, game, 0),
                    (error) => error instanceof UnsupportedHeroMoveBoundaryError
                        && error.reason === freeReason,
                    `${freeReason} while free`,
                );
                game.u.utrap = held;
                game.u.utraptype = TT_BEARTRAP;
            }

            const held = game.u.utrap;
            const [ux, uy] = [game.u.ux, game.u.uy];
            assert.doesNotThrow(
                () => preflightDomoveDestination(x, y, game, 0),
                `struggle toward <${x},${y}> admitted while held`,
            );

            game.u.dx = dx;
            game.u.dy = dy;
            game.u.umoved = false;
            game.context.move = 1;
            game.domoveAttempting = 1;
            clearTtyMessageWindow(game);
            game._ttyToplines = '';
            await domove(game);

            // trapmove() spent the step: the hero is where it was, one point
            // of u.utrap is gone -- every case above steps diagonally, which
            // hack.c:1575 short-circuits past rn2(5) -- and the line printed
            // is the struggle, not anything about the square ahead.
            assert.deepEqual([game.u.ux, game.u.uy], [ux, uy]);
            assert.equal(game.u.utrap, held - 1);
            assert.match(game._ttyToplines, /^You are caught in a bear trap\.$/u);
        }

        // The arm turns on the trap type, not on u.utrap alone. hack.c
        // trapmove()'s TT_PIT arm can return TRUE at 1583 and TT_BURIEDBALL's
        // at 1648, and both then reach test_move(), so a hero held by one of
        // those still needs the destination screened. js/bury.js
        // setBuriedBallTrap() is the port's other writer of u.utraptype, which
        // is the field replaced here; u.utrap keeps the count the trap set.
        await runSegment({ ...segments[1], moves: 'j ' });
        const bx = game.u.ux - 1;
        const by = game.u.uy - 1;
        game.level.objects[bx][by] = {
            o_id: 7102, otyp: BOULDER, nexthere: null,
        };
        game.u.utraptype = TT_BURIEDBALL;
        assert.throws(
            () => preflightDomoveDestination(bx, by, game, 0),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason === 'boulder movement',
        );
    });

test('a held hero stops where C would ask to confirm the step', async () => {
    // hack.c domove_core():2822-2825 runs avoid_trap_andor_region() above the
    // u.utrap block at 2830, so these two destinations are the exception to
    // the arm above: C reads them even though the step can never commit, and
    // each one raises a paranoid_query() the port cannot answer.
    const { segments } = loadHeroBearTrapRecipe();
    await runSegment({ ...segments[1], moves: 'j ' });
    assert.equal(game.u.utraptype, TT_BEARTRAP);
    const x = game.u.ux + 1;
    const y = game.u.uy - 1;

    // Seed 395's own neighbouring trap. Unseen it is admitted -- that is the
    // 'trap activation' case in the test above -- and hack.c:2556 turns on
    // exactly the tseen bit changed here.
    const neighbour = t_at(x, y, game);
    assert.ok(neighbour, 'seed 395 puts a trap northeast of its bear trap');
    assert.equal(neighbour.tseen, false, 'and the hero has not seen it');
    assert.doesNotThrow(() => preflightDomoveDestination(x, y, game, 0));
    neighbour.tseen = true;
    assert.throws(
        () => preflightDomoveDestination(x, y, game, 0),
        (error) => error instanceof UnsupportedHeroMoveBoundaryError
            && error.reason === 'paranoid trap confirmation',
    );
    neighbour.tseen = false;

    // hack.c:2531's arm. The shape is what js/region.js inside_region() reads:
    // a bounding box and the rectangles inside it, both set to the square the
    // hero is pushing against, on a region that is visible and not expiring.
    const there = { lx: x, hx: x, ly: y, hy: y };
    game.level.regions = [
        { visible: true, ttl: -1, bounding_box: there, rects: [there] },
    ];
    assert.throws(
        () => preflightDomoveDestination(x, y, game, 0),
        (error) => error instanceof UnsupportedHeroMoveBoundaryError
            && error.reason === 'paranoid region confirmation',
    );
    game.level.regions = [];
    assert.doesNotThrow(() => preflightDomoveDestination(x, y, game, 0));
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
        // is_whirly(): a dust vortex has nothing solid to close on. It is the
        // form that isolates the middle term, because monst.c gives it neither
        // M1_AMORPHOUS nor M1_UNSOLID -- an air elemental carries M1_UNSOLID
        // and so proves nothing about is_whirly() -- and its MZ_HUGE msize
        // carries it past the size arm to set_utrap() when the term is gone.
        { form: PM_DUST_VORTEX, expected: /closes harmlessly through you/u },
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

test('dotrap teaches the sprung trap to the monsters that watch it',
    async () => {
        // trap.c:3048 hands the trap to mondata.c mons_see_trap(), which sets
        // the type's bit on every monster close enough, awake, sighted, and
        // with a line to the square that m_cansee() admits. Those bits pick
        // the monsters' later mintrap() branches and so their draws, and
        // nothing else on the hero's trap path writes them.
        const [, walkIn] = loadHeroBearTrapRecipe().segments;
        const KNOWS_BEAR_TRAP = 1 << (BEAR_TRAP - 1);

        // The Healer starts at <38,4> in a lit room, so maxdist is 7 * 7.
        const watcher = async (x, y) => {
            await runSegment({ ...walkIn, moves: '' });
            const trap = {
                tx: game.u.ux, ty: game.u.uy, ttyp: BEAR_TRAP,
                tseen: false, madeby_u: 0,
            };
            game.level.traps.push(trap);
            // A kobold passes every gate mons_see_trap() puts on the monster
            // itself: monst.c gives it neither M1_ANIMAL nor M1_MINDLESS nor
            // M1_NOEYES, and mcansee is set here as makemon() leaves it.
            const kobold = place_monster(
                newMonster({ data: game.mons[PM_KOBOLD], mhp: 4, mcansee: 1 }),
                x, y, game,
            );
            kobold.nmon = game.level.monlist;
            game.level.monlist = kobold;
            clearTtyMessageWindow(game);
            game._ttyToplines = '';
            await dotrap(trap, 0, game);
            return (kobold.mtrapseen ?? 0) & KNOWS_BEAR_TRAP;
        };

        // Two squares west, same room: dist2 4 against maxdist 49, clear line.
        assert.equal(await watcher(36, 4), KNOWS_BEAR_TRAP);
        // The room's west wall, dist2 37 -- still inside maxdist, so only
        // m_cansee() can refuse it, which is what makes this the case that
        // pins the clear_path() argument dotrap() passes in rather than just
        // the call. No passable square on any matrix level is both inside
        // maxdist and out of the trap's line: each of these traps sits in a
        // lit room, where the two conditions coincide. mons_see_trap() reads
        // only mx and my, which place_monster() sets here as it always does.
        assert.equal(await watcher(32, 5), 0);
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
