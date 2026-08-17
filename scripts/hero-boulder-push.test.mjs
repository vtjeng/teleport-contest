import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    CORR,
    DOOR,
    D_CLOSED,
    D_ISOPEN,
    D_NODOOR,
    IRONBARS,
    LEVITATION,
    PASSES_WALLS,
    PIT,
    POOL,
    STONE,
    WT_SQUEEZABLE_INV,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import {
    UnsupportedHeroMoveBoundaryError,
    domove,
    preflightDomoveDestination,
    requireSimpleHeroDestination,
    weight_cap,
} from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj, sobj_at } from '../js/obj.js';
import { BOULDER, CORPSE, ROCK } from '../js/objects.js';
import {
    PM_DEATH,
    PM_NEWT,
    PM_ROCK_MOLE,
    PM_SEWER_RAT,
    PM_STONE_GIANT,
    PM_WIZARD_OF_YENDOR,
} from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { GLYPH_INVISIBLE } from '../js/display.js';
import { clear_path, does_block } from '../js/vision.js';
import {
    RUSH_EAST,
    loadHeroBoulderPushRecipe,
} from './run-hero-boulder-push.mjs';

// The keys every segment is allowed to spend: the eight compass directions for
// the walk-in and the pushes, 'L' and ctrl-L for the two run values above a
// plain walk, and 's' to let a turn pass without moving anything.
const SEGMENT_KEYS = new Set([
    'h', 'j', 'k', 'l', 'y', 'u', 'b', 'n', 'L', RUSH_EAST, 's',
]);

// Seed 110 is the matrix's throttle level: the hero starts at <27,3> and the
// only boulder near it sits at <33,3>, six squares due east along one corridor
// row with clear corridor behind it. Every unit case below builds on that one
// geometry, so these four constants are read back from the replayed game
// rather than assumed.
const PUSH_SEED = 110;
const APPROACH = 'lllll'; /* leaves the hero adjacent, having pushed nothing */

function boulderRecipeSegment() {
    return loadHeroBoulderPushRecipe().segments.find(
        (segment) => segment.seed === PUSH_SEED,
    );
}

// A game standing where `APPROACH` leaves it, with the boulder still in place.
async function heroBesideBoulder(moves = APPROACH) {
    const replay = await runSegment({ ...boulderRecipeSegment(), moves });
    const sx = game.u.ux + 1;
    const sy = game.u.uy;
    const boulder = sobj_at(BOULDER, sx, sy, game);
    assert.ok(boulder, `a boulder stands at <${sx},${sy}>`);
    return { replay, sx, sy, rx: sx + 1, ry: sy, boulder };
}

// Drive one eastward step through domove(), the way hack.c rhack() reaches it,
// and return whatever it printed. hero-bear-trap.test.mjs sets up a step the
// same way.
async function stepEast(state = game, run = 0) {
    state.u.dx = 1;
    state.u.dy = 0;
    state.u.umoved = false;
    state.context.run = run;
    state.context.move = 1;
    state.domoveAttempting = 1;
    clearTtyMessageWindow(state);
    state._ttyToplines = '';
    await domove(state);
    return state._ttyToplines;
}

function refusalReason(x, y, run = 0) {
    try {
        preflightDomoveDestination(x, y, game, run);
    } catch (error) {
        if (error instanceof UnsupportedHeroMoveBoundaryError)
            return error.reason;
        throw error;
    }
    return null;
}

test('hero-boulder-push matrix contains only source-selected inputs', () => {
    const recipe = loadHeroBoulderPushRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 12);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // A pet on either square hands the step to domove_swap_with_pet(), and
        // one wandering into the corridor puts moverock_core()'s
        // monster-behind-the-boulder arm in the way of the push.
        assert.match(segment.nethackrc, /OPTIONS=pettype:none/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment walks, runs, or lets a turn pass',
        );
    }
    // Five levels, so that no single map carries the matrix.
    assert.equal(new Set(recipe.segments.map(({ seed }) => seed)).size, 5);
    // One diagonal push: hack.c:432-435 lets a boulder roll diagonally
    // everywhere but Sokoban, and 'n' is the only diagonal key that pushes.
    assert.equal(
        recipe.segments.filter(({ moves }) => moves.endsWith('nnn')).length,
        1,
    );
    // Both run values above a plain walk. Only ctrl-L reaches
    // test_move():1217-1223, because do_run_east() passes 1 and the arm needs
    // svc.context.run >= 2.
    assert.equal(
        recipe.segments.filter(({ moves }) => moves.includes(RUSH_EAST)).length,
        2,
    );
    assert.equal(
        recipe.segments.filter(({ moves }) => moves.includes('L')).length,
        1,
    );
});

test('every matrix segment replays to its last key and moves its boulder',
    async () => {
        for (const [index, segment] of
            loadHeroBoulderPushRecipe().segments.entries()) {
            await runSegment({ ...segment, moves: '' });
            const before = [];
            for (let x = 0; x < 80; ++x) {
                for (let y = 0; y < 21; ++y) {
                    if (sobj_at(BOULDER, x, y, game))
                        before.push(`${x},${y}`);
                }
            }
            assert.ok(before.length, `segment ${index} generates a boulder`);

            await runSegment(segment);
            const after = [];
            for (let x = 0; x < 80; ++x) {
                for (let y = 0; y < 21; ++y) {
                    if (sobj_at(BOULDER, x, y, game))
                        after.push(`${x},${y}`);
                }
            }
            assert.equal(after.length, before.length,
                         `segment ${index} keeps every boulder on the level`);
            // The ctrl-L segment that refuses where it stands is the one
            // segment that ends with nothing moved; every other one pushes.
            const moved = after.some((spot) => !before.includes(spot));
            assert.equal(moved, segment.moves !== `llll${RUSH_EAST}`,
                         `segment ${index} push outcome`);
        }
    });

// hack.c dopush():178-189. The four cases are the four seed-110 message
// segments of the matrix, each replayed to its last key and then stepped by
// hand so that the line that key prints can be read on its own.
test('dopush throttles its line on gb.bldrpushtime, not on Norep', async () => {
    const cases = [
        // A boulder the hero has not pushed before: gb.bldrpush_oid is still
        // decl.c:224's zero, so 186 restamps the timer and the line prints.
        { walkIn: APPROACH, line: 'With great effort you move the boulder.' },
        // The very next turn. svm.moves is gb.bldrpushtime + 1.
        { walkIn: `${APPROACH}l`, line: '' },
        // One turn in between, so svm.moves is gb.bldrpushtime + 2, which
        // hack.c:188's strict `>` still rejects.
        { walkIn: `${APPROACH}ls`, line: '' },
        // Two turns in between: gb.bldrpushtime + 3 clears the test.
        {
            walkIn: `${APPROACH}lss`,
            line: 'With great effort you move the boulder.',
        },
    ];
    for (const { walkIn, line } of cases) {
        const { boulder } = await heroBesideBoulder(walkIn);
        const before = Math.trunc(game.moves);
        assert.equal(await stepEast(), line, `after "${walkIn}"`);
        // 204. Whether or not it spoke, the push stamps the turn it happened
        // on and claims the boulder.
        assert.equal(game.gb.bldrpush_oid, boulder.o_id);
        assert.equal(game.gb.bldrpushtime, before);
    }
});

test('a push exercises Strength and advances the hero one square', async () => {
    const { replay, sx, sy, rx, ry, boulder } = await heroBesideBoulder();
    // The PRNG log belongs to the object runSegment() returns, not to `game`.
    const drawsBefore = replay.getRngLog().length;
    await stepEast();
    // hack.c:432-435 and movobj(): the boulder moves one square in the same
    // direction and the hero takes the square it left.
    assert.equal(boulder.ox, rx);
    assert.equal(boulder.oy, ry);
    assert.deepEqual([game.u.ux, game.u.uy], [sx, sy]);
    // dopush():196 exercise(A_STR, TRUE), which attrib.c:509 spends rn2(19)
    // on. It is the step's first draw, and the only one this slice adds.
    const drawn = replay.getRngLog().slice(drawsBefore);
    assert.equal(drawn.length, 1, 'the push spends exactly one draw');
    assert.match(drawn[0], /rn2\(19\)=/u);
});

// mkobj.c place_object():2331-2334 blocks the destination square's line of
// sight, and remove_object():2516-2517 recalculates the square the boulder
// left. Without the first of the two a pushed boulder would stay transparent,
// and mthrowu.c linedup() would answer that a monster behind it is in view.
test('pushing a boulder moves what blocks the line of sight', async () => {
    const { sx, sy, rx, ry } = await heroBesideBoulder();
    // does_block() walks the live pile, so it moves with the boulder whether
    // or not anything told the vision index. clear_path() reads the index
    // vision_reset() builds, which is the half a missing block_point() loses.
    assert.equal(does_block(sx, sy, null, game), true);
    assert.equal(does_block(rx, ry, null, game), false);
    assert.equal(clear_path(sx, sy, rx + 2, ry), 1);

    await stepEast();
    assert.equal(does_block(sx, sy, null, game), false);
    assert.equal(does_block(rx, ry, null, game), true);
    assert.equal(clear_path(sx, sy, rx + 2, ry), 0);
});

// hack.c moverock_core(), every arm of it but the push, asked at the command
// admission seam. The reason strings are what js/cmd.js ends the segment on,
// so each case names the C branch it stands for.
test('preflight_moverock refuses each arm moverock_core does not push on',
    async () => {
        const { sx, sy, rx, ry } = await heroBesideBoulder();
        const destination = game.level.at(rx, ry);
        assert.equal(refusalReason(sx, sy), null, 'the plain push is admitted');

        const cases = [
            // 355-363, which needs display.c glyph_at().
            {
                reason: 'a boulder felt in the dark',
                install: () => { game.u.uprops[BLINDED].intrinsic = 1; },
                remove: () => { game.u.uprops[BLINDED].intrinsic = 0; },
            },
            // The while loop at 353 and the reorder at 375-376. A rock under
            // the boulder would still be on the square after the push, which
            // is what the seam's later questions may not read.
            {
                reason: 'a boulder sharing its square',
                install: () => {
                    const rock = mksobj(ROCK, false, false, { state: game });
                    rock.nexthere = null;
                    sobj_at(BOULDER, sx, sy, game).nexthere = rock;
                },
                remove: () => {
                    sobj_at(BOULDER, sx, sy, game).nexthere = null;
                },
            },
            // 384-410, the 'm' prefix, which steps onto or squeezes past the
            // boulder through could_move_onto_boulder() and sokoban_guilt().
            {
                reason: 'a boulder step without a push',
                install: () => { game.iflags.menu_requested = true; },
                remove: () => { game.iflags.menu_requested = false; },
            },
            // 412-421.
            {
                reason: 'a boulder push without leverage',
                install: () => { game.u.uprops[LEVITATION].intrinsic = 1; },
                remove: () => { game.u.uprops[LEVITATION].intrinsic = 0; },
            },
            // 422-427. A newt is MZ_TINY, which verysmall() answers TRUE for.
            {
                reason: 'a boulder push by a tiny hero',
                install: () => { game.youmonst.data = game.mons[PM_NEWT]; },
                remove: () => { game.youmonst.data = game.mons[game.umonnum]; },
            },
            // dopush():198-202 and cannot_push():388-391, both of which
            // describe the steed rather than the hero.
            {
                reason: 'a mounted boulder push',
                install: () => { game.u.usteed = { mx: sx, my: sy }; },
                remove: () => { game.u.usteed = null; },
            },
            // test_move():1225-1229. A rock mole tunnels and needs no pick, so
            // still_chewing() claims the square before moverock() is called.
            {
                reason: 'a boulder chewed rather than pushed',
                install: () => {
                    game.youmonst.data = game.mons[PM_ROCK_MOLE];
                },
                remove: () => { game.youmonst.data = game.mons[game.umonnum]; },
            },
            // 432, isok(rx, ry) and !IS_OBSTRUCTED(levl[rx][ry].typ).
            {
                reason: 'a boulder that will not move',
                install: () => { destination.typ = STONE; },
                remove: () => { destination.typ = CORR; },
            },
            // 433, the separate IRONBARS test, which IS_OBSTRUCTED() does not
            // cover because rm.h puts IRONBARS above POOL.
            {
                reason: 'a boulder that will not move',
                install: () => { destination.typ = IRONBARS; },
                remove: () => { destination.typ = CORR; },
            },
            // 435, a second boulder already on the destination.
            {
                reason: 'a boulder that will not move',
                install: () => {
                    const second = mksobj(BOULDER, false, false,
                                          { state: game });
                    second.nexthere = null;
                    game.level.objects[rx][ry] = second;
                },
                remove: () => { game.level.objects[rx][ry] = null; },
            },
            // 437-443, KMH's diagonal rule, widened to the whole level
            // because sokoban_guilt() is unported.
            {
                reason: 'a boulder push in Sokoban',
                install: () => { game.u.uz.dnum = game.sokoban_dnum; },
                remove: () => { game.u.uz.dnum = 0; },
            },
            // 445-447, revive_nasty()'s pile scan. Death is a Rider.
            {
                reason: 'a Rider or Wizard corpse behind a boulder',
                install: () => {
                    const corpse = mksobj(CORPSE, false, false,
                                          { state: game });
                    corpse.corpsenm = PM_DEATH;
                    corpse.nexthere = null;
                    game.level.objects[rx][ry] = corpse;
                },
                remove: () => { game.level.objects[rx][ry] = null; },
            },
            // The other half of revive_nasty()'s disjunction, which is a
            // single species rather than is_rider()'s three.
            {
                reason: 'a Rider or Wizard corpse behind a boulder',
                install: () => {
                    const corpse = mksobj(CORPSE, false, false,
                                          { state: game });
                    corpse.corpsenm = PM_WIZARD_OF_YENDOR;
                    corpse.nexthere = null;
                    game.level.objects[rx][ry] = corpse;
                },
                remove: () => { game.level.objects[rx][ry] = null; },
            },
            // 450-476. C pushes past a ghost and past a pit-trapped monster;
            // this refuses every monster, which is wider on purpose.
            {
                reason: 'a monster behind the boulder',
                install: () => {
                    place_monster(newMonster({
                        data: game.mons[PM_SEWER_RAT], mx: rx, my: ry,
                        m_id: 9301, mhp: 3, mhpmax: 3,
                    }), rx, ry, game);
                },
                remove: () => { game.level.monsters[rx][ry] = null; },
            },
            // 478-481, cannot_push_msg() for a boulder against a closed door.
            // The conjunction's own door term at 434 excludes only a diagonal
            // push, so an orthogonal one reaches this arm instead.
            {
                reason: 'a closed door behind the boulder',
                install: () => {
                    destination.typ = DOOR;
                    destination.flags = D_CLOSED;
                },
                remove: () => {
                    destination.typ = CORR;
                    destination.flags = 0;
                },
            },
            // 490-616, the trap switch.
            {
                reason: 'a boulder pushed onto a trap',
                install: () => {
                    game.level.traps.push({ tx: rx, ty: ry, ttyp: PIT });
                },
                remove: () => { game.level.traps.pop(); },
            },
            // 618-619, do.c boulder_hits_pool()'s is_pool_or_lava() test.
            {
                reason: 'a boulder pushed into water or lava',
                install: () => { destination.typ = POOL; },
                remove: () => { destination.typ = CORR; },
            },
            // dopush():217-240. An unpaid boulder is the cheapest of the three
            // shop terms to build; the other two need a generated shop.
            {
                reason: 'a boulder pushed across a shop boundary',
                install: () => {
                    sobj_at(BOULDER, sx, sy, game).unpaid = 1;
                },
                remove: () => {
                    sobj_at(BOULDER, sx, sy, game).unpaid = 0;
                },
            },
            // dopush():206-207, the unmap_object() that forgets a remembered
            // invisible monster where the boulder is about to land.
            {
                reason: 'a remembered invisible monster behind the boulder',
                install: () => {
                    destination.remembered_glyph = { glyph: GLYPH_INVISIBLE };
                },
                remove: () => { destination.remembered_glyph = null; },
            },
        ];

        for (const { reason, install, remove } of cases) {
            install();
            assert.equal(refusalReason(sx, sy), reason);
            remove();
            assert.equal(refusalReason(sx, sy), null,
                         `the level is restored after "${reason}"`);
        }
    });

// hack.c:434, `!IS_DOOR(levl[rx][ry].typ) || !(u.dx && u.dy)
// || doorless_door(rx, ry)`. It is the one term of the conjunction that reads
// the push direction, so it needs both a diagonal push and an orthogonal one
// over the same doorway.
test('a doorway behind the boulder refuses a diagonal push alone', async () => {
    const { sx, sy, rx, ry } = await heroBesideBoulder();
    const destination = game.level.at(rx, ry);
    destination.typ = DOOR;

    // An open door in the doorway, so doorless_door() answers FALSE and the
    // whole term rests on the direction. Orthogonal first: `u.dx && u.dy` is
    // zero, so the term passes whatever the doorway holds. D_ISOPEN rather
    // than D_CLOSED because closed_door() below would claim it either way.
    destination.flags = D_ISOPEN;
    assert.equal(refusalReason(sx, sy), null);

    // The same question on a diagonal. Standing the hero one square north of
    // where he is leaves the boulder south-east of him, which puts the push
    // destination at <rx,ry+1> rather than <rx,ry>.
    const diagonal = game.level.at(rx, ry + 1);
    game.level.at(game.u.ux, game.u.uy - 1).typ = CORR;
    diagonal.typ = DOOR;
    diagonal.flags = D_ISOPEN;
    game.u.uy -= 1;
    assert.equal(refusalReason(sx, sy), 'a boulder that will not move');

    // Take the door out of the doorway and doorless_door() rescues the same
    // diagonal push.
    diagonal.flags = D_NODOOR;
    assert.equal(refusalReason(sx, sy), null);
});

// test_move():1217-1223. The run arm answers before moverock() is reached, so
// the seam has to admit the command rather than refuse it.
test('a run stops in front of a boulder instead of ending the segment',
    async () => {
        const { sx, sy, rx, ry } = await heroBesideBoulder();
        // A second boulder on the destination, so that a walk into this square
        // is refused and a run that skips the rest of the seam is not.
        const second = mksobj(BOULDER, false, false, { state: game });
        second.nexthere = null;
        game.level.objects[rx][ry] = second;
        assert.equal(refusalReason(sx, sy, 0), 'a boulder that will not move');

        // cmd.c do_run_east() passes 1, below the arm's `>= 2`, so a run key
        // still reaches the refusal.
        assert.equal(refusalReason(sx, sy, 1), 'a boulder that will not move');
        // do_rush_east() passes 3, and the arm claims the step.
        assert.equal(refusalReason(sx, sy, 3), null);

        // `!(Blind || Hallucination)`: a blind hero takes moverock()'s own
        // Blind arm instead, so the rush must not claim the step for him.
        game.u.uprops[BLINDED].intrinsic = 1;
        assert.equal(refusalReason(sx, sy, 3), 'a boulder felt in the dark');
        game.u.uprops[BLINDED].intrinsic = 0;

        // could_move_onto_boulder():161 `!gi.invent`, the arm a hero carrying
        // nothing at all takes. He can squeeze onto the square, so the run
        // does not stop and the seam asks its own questions again.
        const carried = game.invent;
        game.invent = null;
        assert.equal(refusalReason(sx, sy, 3), 'a boulder that will not move');
        game.invent = carried;
        assert.equal(refusalReason(sx, sy, 3), null);
    });

// cmd.c do_rush() (1590-1601) sets svc.context.run to 2 for the 'g' prefix.
// js/cmd.js ADMITTED_RUN_MODES (945) omits it, so no keystroke this port
// accepts produces it, but the arm's threshold is `>= 2` rather than `> 2` and
// the seam takes the value as an argument.
test('the run arm claims the g prefix value as well as the rush value',
    async () => {
        const { sx, sy, rx, ry } = await heroBesideBoulder();
        const second = mksobj(BOULDER, false, false, { state: game });
        second.nexthere = null;
        game.level.objects[rx][ry] = second;
        assert.equal(refusalReason(sx, sy, 2), null);
    });

// hack.c could_move_onto_boulder() (144-162). Nothing in this port polymorphs
// the hero or mounts him, so every arm below the invent test is dormant C
// reached only from a state written here. Each case answers TRUE, which is
// what makes the run arm stand aside; the boulder on the destination then
// gives the seam something to refuse, so a wrong answer is visible either way.
test('could_move_onto_boulder answers for each of its five arms', async () => {
    const { sx, sy, rx, ry } = await heroBesideBoulder();
    const blocked = 'a boulder that will not move';
    const second = mksobj(BOULDER, false, false, { state: game });
    second.nexthere = null;
    game.level.objects[rx][ry] = second;
    // The Healer as generated: carrying more than WT_SQUEEZABLE_INV under
    // capacity, so he cannot squeeze and the run stops.
    assert.equal(refusalReason(sx, sy, 3), null);

    // 150-151, riding, the one arm that answers FALSE. A FALSE answer is what
    // stops the run, so the seam admits the step here and refuses it for every
    // arm below, which all answer TRUE.
    game.u.usteed = { mx: sx, my: sy };
    assert.equal(refusalReason(sx, sy, 3), null);
    game.u.usteed = null;

    // 154-157, the giant. An orthogonal push short-circuits on `!u.dx` or
    // `!u.dy` and always steps onto the boulder.
    game.youmonst.data = game.mons[PM_STONE_GIANT];
    assert.equal(refusalReason(sx, sy, 3), blocked);
    // The diagonal half needs both corner squares obstructed to answer FALSE.
    // <ux,sy> and <sx,uy> are the corners of the north-east step to <sx,sy-1>,
    // which is the square carved here.
    const corner = game.level.at(sx, sy - 1);
    corner.typ = CORR;
    game.level.objects[sx][sy - 1] = mksobj(BOULDER, false, false,
                                            { state: game });
    game.level.objects[sx][sy - 1].nexthere = null;
    game.level.at(sx, sy - 2).typ = CORR;
    game.level.objects[sx][sy - 2] = mksobj(BOULDER, false, false,
                                            { state: game });
    game.level.objects[sx][sy - 2].nexthere = null;
    // <game.u.ux, sy-1> is rock and <sx, game.u.uy> is the corridor row, so
    // one corner is clear and the giant steps onto the boulder square.
    assert.equal(game.level.at(sx, game.u.uy).typ, CORR);
    assert.equal(refusalReason(sx, sy - 1, 3), blocked);
    // Obstruct that corner too and the giant can no longer get there.
    game.level.at(sx, game.u.uy).typ = STONE;
    assert.equal(refusalReason(sx, sy - 1, 3), null);
    game.level.at(sx, game.u.uy).typ = CORR;
    game.level.objects[sx][sy - 1] = null;
    game.level.objects[sx][sy - 2] = null;

    // 159-160, verysmall.
    game.youmonst.data = game.mons[PM_NEWT];
    assert.equal(refusalReason(sx, sy, 3), 'a boulder push by a tiny hero');
    game.youmonst.data = game.mons[game.umonnum];

    // 139-140 squeezeablylightinvent(), whose `<=` makes exactly
    // -WT_SQUEEZABLE_INV light enough. weight_cap() is read here rather than
    // assumed because it depends on this hero's Strength and Constitution.
    const carried = game.invent;
    const pack = mksobj(ROCK, false, false, { state: game });
    pack.nobj = null;
    pack.owt = weight_cap(game) - WT_SQUEEZABLE_INV;
    game.invent = pack;
    assert.equal(refusalReason(sx, sy, 3), blocked);
    pack.owt += 1; /* one weight unit heavier: inv_weight() is -849 */
    assert.equal(refusalReason(sx, sy, 3), null);
    game.invent = carried;

    // 147-148, Passes_walls. test_move()'s own `Sokoban || !Passes_walls`
    // guard makes this arm reachable only inside Sokoban, so both have to be
    // set, and the seam refuses the Sokoban level below the run arm. The
    // second boulder comes off the destination first: moverock_core() asks its
    // conjunction at 432-435 before the Sokoban rule at 437.
    game.level.objects[rx][ry] = null;
    game.u.uprops[PASSES_WALLS].intrinsic = 1;
    game.u.uz.dnum = game.sokoban_dnum;
    assert.equal(refusalReason(sx, sy, 3), 'a boulder push in Sokoban');
    game.u.uprops[PASSES_WALLS].intrinsic = 0;
    game.u.uz.dnum = 0;
});

// teleport.c teleds() lands the hero on the square without calling moverock(),
// so the boulder is still there when it arrives. Its seam call leaves
// `pushesBoulder` at its default, which is what keeps the old blanket refusal
// for that arrival.
test('a destination reached without a push keeps its boulder refusal',
    async () => {
        const { sx, sy } = await heroBesideBoulder();
        assert.equal(refusalReason(sx, sy), null);
        assert.throws(
            () => requireSimpleHeroDestination(sx, sy, game),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason === 'boulder movement',
        );
    });

// hack.c:189 `svm.moves < gb.bldrpushtime`, the disjunct that covers a push
// made before the turn dopush() stamped. Only a hasted hero reaches it in
// ordinary play, by pushing twice inside one turn; the two globals are written
// here instead, which is the same state that hero would arrive in.
test('a second push inside one turn stays silent', async () => {
    const { boulder } = await heroBesideBoulder();
    game.gb = {
        ...game.gb,
        bldrpush_oid: boulder.o_id,
        bldrpushtime: Math.trunc(game.moves),
    };
    assert.equal(await stepEast(), '');
});

// test_move():1217-1223 again, driven through domove() rather than through the
// seam, because svc.context.run is what the arm reads there.
test('a rush into a boulder spends no time and says nothing', async () => {
    const { sx, sy, rx, ry, boulder } = await heroBesideBoulder();
    const before = Math.trunc(game.moves);
    // The 'g' prefix value, so that the same case pins `>= 2` here too.
    assert.equal(await stepEast(game, 2), '');
    assert.deepEqual([boulder.ox, boulder.oy], [sx, sy]);
    assert.notDeepEqual([game.u.ux, game.u.uy], [sx, sy]);
    assert.equal(Math.trunc(game.moves), before);
    assert.equal(does_block(rx, ry, null, game), false);

    // `!(Blind || Hallucination)`: a blind hero skips the arm, so the same
    // step pushes instead. C sends him to moverock()'s Blind arm, which
    // preflight_moverock() refuses ahead of any step the game itself makes.
    game.u.uprops[BLINDED].intrinsic = 1;
    await stepEast(game, 2);
    assert.deepEqual([boulder.ox, boulder.oy], [rx, ry]);
    game.u.uprops[BLINDED].intrinsic = 0;
});
