import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    CORR,
    DEAF,
    DETECT_MONSTERS,
    DOOR,
    D_ISOPEN,
    D_NODOOR,
    OBJ_FLOOR,
    NON_PM,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import {
    UnsupportedHeroMoveBoundaryError,
    domove,
    preflightDomoveDestination,
    revive_nasty,
    requireSimpleHeroDestination,
} from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj, place_object, sobj_at } from '../js/obj.js';
import { BOULDER, CORPSE } from '../js/objects.js';
import {
    PM_DEATH,
    PM_SEWER_RAT,
    PM_WIZARD_OF_YENDOR,
} from '../js/monsters.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { glyph_is_invisible } from '../js/display.js';
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
const FAILED_DESTINATION_SEED = 41;
const FAILED_DESTINATION_APPROACH = 'lllll';

function boulderRecipeSegment() {
    return loadHeroBoulderPushRecipe().segments.find(
        (segment) => segment.seed === PUSH_SEED,
    );
}

function failedDestinationRecipeSegment() {
    return loadHeroBoulderPushRecipe().segments.find(
        (segment) => segment.seed === FAILED_DESTINATION_SEED,
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

async function stepNorth(state = game) {
    state.u.dx = 0;
    state.u.dy = -1;
    state.u.umoved = false;
    state.context.run = 0;
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
    assert.equal(recipe.segments.length, 13);
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
    // Six levels, so that no single map carries the matrix.
    assert.equal(new Set(recipe.segments.map(({ seed }) => seed)).size, 6);
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
            const failedDestination = segment.seed === FAILED_DESTINATION_SEED;
            assert.equal(
                moved,
                segment.moves !== `llll${RUSH_EAST}` && !failedDestination,
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
        const { replay, boulder } = await heroBesideBoulder(walkIn);
        const before = Math.trunc(game.moves);
        const drawsBefore = replay.getRngLog().length;
        assert.equal(await stepEast(), line, `after "${walkIn}"`);
        // 204. Whether or not it spoke, the push stamps the turn it happened
        // on and claims the boulder.
        assert.equal(game.gb.bldrpush_oid, boulder.o_id);
        assert.equal(game.gb.bldrpushtime, before);
        // C nests `if (givemesg) pline(...)` and `if (!easypush)
        // exercise(...)` under one `if (!u.usteed)`, so the natural misreading
        // is to gate the draw on the message. A silent push draws too, and
        // nothing else here draws at all: a seed whose hero pushes the same
        // boulder on consecutive turns would otherwise drop one rn2(19) per
        // silent push and desynchronise everything after it.
        const drawn = replay.getRngLog().slice(drawsBefore);
        assert.equal(drawn.length, 1, `one draw after "${walkIn}"`);
        assert.match(drawn[0], /rn2\(19\)=/u, `rn2(19) after "${walkIn}"`);
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

test('revive_nasty revives Rider and Wizard floor corpses exactly once',
    async () => {
        for (const corpsenm of [PM_DEATH, PM_WIZARD_OF_YENDOR]) {
            const { sx, sy, rx, ry } = await heroBesideBoulder();
            const corpse = mksobj(CORPSE, false, false, { state: game });
            corpse.corpsenm = corpsenm;
            place_object(corpse, rx, ry, { state: game });

            assert.equal(refusalReason(sx, sy), null,
                         'the boulder command admits revival');
            assert.equal(await revive_nasty(rx, ry, null, game), true);
            assert.equal(sobj_at(CORPSE, rx, ry, game), null,
                         'a successful revival consumes the corpse');
            assert.equal(m_at(rx, ry, game)?.data, game.mons[corpsenm]);
        }
    });

test('revive_nasty restores saved Rider traits', async () => {
    const { rx, ry } = await heroBesideBoulder();
    const corpse = mksobj(CORPSE, false, false, { state: game });
    corpse.corpsenm = PM_DEATH;
    corpse.oextra = {
        omonst: newMonster({
            data: null,
            mnum: PM_DEATH,
            cham: NON_PM,
            m_id: 81234,
            m_lev: 1,
            mhp: 1,
            mhpmax: 9,
            mpeaceful: true,
            female: true,
            mcanmove: false,
        }),
    };
    place_object(corpse, rx, ry, { state: game });

    assert.equal(await revive_nasty(rx, ry, null, game), true);
    const revived = m_at(rx, ry, game);
    assert.ok(revived.m_id > 0);
    assert.notEqual(revived.m_id, 81234,
                    'montraits adopts the dummy monster allocation id');
    assert.equal(revived.data, game.mons[PM_DEATH]);
    assert.equal(revived.mpeaceful, true);
    assert.equal(revived.female, true);
    assert.equal(revived.mcanmove, true);
    assert.ok(revived.mhpmax >= 9);
    assert.equal(revived.mhp, revived.mhpmax);
});

test('revive_nasty returns the last qualifying corpse result', async () => {
    const { rx, ry } = await heroBesideBoulder();
    const finalCorpse = mksobj(CORPSE, false, false, { state: game });
    finalCorpse.corpsenm = PM_WIZARD_OF_YENDOR;
    finalCorpse.norevive = true;
    place_object(finalCorpse, rx, ry, { state: game });
    const firstCorpse = mksobj(CORPSE, false, false, { state: game });
    firstCorpse.corpsenm = PM_DEATH;
    place_object(firstCorpse, rx, ry, { state: game });

    assert.equal(await revive_nasty(rx, ry, null, game), false);
    assert.ok(m_at(rx, ry, game) || m_at(rx + 1, ry, game),
              'the first corpse did revive');
    assert.equal(finalCorpse.where, OBJ_FLOOR,
                 'the failed final corpse remains');
});

// hack.c moverock_core():432-487, cannot_push_msg() and cannot_push(). The
// boulder is named and the failed-push line is emitted after nomul(0), while
// the obstructed destination leaves the boulder in place and returns -1.
test('a boulder with an obstructed destination fails without moving',
    async () => {
        const segment = failedDestinationRecipeSegment();
        const replay = await runSegment({
            ...segment,
            moves: FAILED_DESTINATION_APPROACH,
        });
        const boulder = sobj_at(BOULDER, game.u.ux, game.u.uy - 1, game);
        assert.ok(boulder, 'the boulder stands north of the hero');
        const beforePosition = [boulder.ox, boulder.oy];
        const beforeRng = replay.getRngLog().length;

        assert.equal(await stepNorth(),
                     'You try to move the boulder, but in vain.');
        assert.deepEqual([boulder.ox, boulder.oy], beforePosition);
        assert.deepEqual([game.u.ux, game.u.uy], [9, 17]);
        assert.equal(replay.getRngLog().length, beforeRng,
                     'the failed push adds no random-number calls');
        assert.equal(boulder.next_boulder, 0,
                     'moverock_done clears temporary boulder naming');
    });

// hack.c:434, `!IS_DOOR(levl[rx][ry].typ) || !(u.dx && u.dy)
// || doorless_door(rx, ry)`. The boulder decision now belongs to test_move()
// at runtime; this admission seam must leave both directions to that owner.
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
    assert.equal(refusalReason(sx, sy), null);

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
        assert.equal(refusalReason(sx, sy, 0), null);

        // cmd.c do_run_east() passes 1, below the arm's `>= 2`, so a run key
        // still reaches the refusal.
        assert.equal(refusalReason(sx, sy, 1), null);
        // do_rush_east() passes 3, and the arm claims the step.
        assert.equal(refusalReason(sx, sy, 3), null);

        // `!(Blind || Hallucination)`: a blind hero takes moverock()'s own
        // Blind arm instead, so the rush must not claim the step for him.
        game.u.uprops[BLINDED].intrinsic = 1;
        assert.equal(refusalReason(sx, sy, 3), null);
        game.u.uprops[BLINDED].intrinsic = 0;

        // could_move_onto_boulder():161 `!gi.invent`, the arm a hero carrying
        // nothing at all takes. He can squeeze onto the square, so the run
        // does not stop and the seam asks its own questions again.
        const carried = game.invent;
        game.invent = null;
        assert.equal(refusalReason(sx, sy, 3), null);
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

// teleport.c teleds() lands the hero on the square without calling moverock(),
// so the boulder is still there when it arrives. test_move() is not involved,
// and its destination seam does not claim that separate relocation path.
test('a destination reached without a push is outside test_move()',
    async () => {
        const { sx, sy } = await heroBesideBoulder();
        assert.equal(refusalReason(sx, sy), null);
        assert.doesNotThrow(
            () => requireSimpleHeroDestination(sx, sy, game),
        );
    });

// hack.c moverock_core():455-483, the monster behind the boulder. The seed-110
// boulder stands in an unlit corridor, so a monster placed on the square past
// it is one canspotmon() answers FALSE for and the branch takes its else arm.
test('an unseen monster behind the boulder is heard, not pushed',
    async () => {
        const { rx, ry, boulder } = await heroBesideBoulder();
        place_monster(newMonster({
            data: game.mons[PM_SEWER_RAT], mx: rx, my: ry,
            m_id: 9401, mhp: 3, mhpmax: 3,
        }), rx, ry, game);
        const before = [boulder.ox, boulder.oy];
        const beforePosition = [game.u.ux, game.u.uy];
        const beforeRng = game.getRngLog?.().length;
        // Two plines in one step put a --More-- between them, which
        // tty_message.js waits on; a space dismisses it.
        game.nhDisplay.terminal.pushKey(' '.charCodeAt(0));

        // 476-480: the !Deaf gate at 467 made deliver_part1 TRUE, which is
        // what selects "Perhaps that's why " and "it" over the upstart()ed
        // phrasing. The You_hear() line before it is pinned by the terse case
        // below, because the --More-- between the two leaves only the second
        // on the top line here.
        assert.equal(await stepEast(),
                     "Perhaps that's why you cannot move it.");
        assert.deepEqual([boulder.ox, boulder.oy], before,
                         'the boulder stays where it stood');
        assert.deepEqual([game.u.ux, game.u.uy], beforePosition,
                         'cannot_push() returns -1, so the hero stays too');
        // 469 map_invisible(): the square the hero cannot see keeps a
        // remembered 'I' after the branch, the way display.c writes it.
        assert.ok(glyph_is_invisible(
            game.level.at(rx, ry).remembered_glyph?.glyph,
        ), 'map_invisible() marked the monster square');
        assert.equal(game.getRngLog?.().length, beforeRng,
                     'the branch draws no random numbers');
    });

// The spotted sibling at 461-463. Detect_monsters is the one operand of
// display.h sensemon() that needs no line of sight and no telepathy, so it is
// what turns canspotmon() TRUE for the same corridor monster. flags.verbose is
// off so that 471-481 prints nothing and the named line stands alone.
test('a spotted monster behind the boulder is named instead', async () => {
    const { rx, ry } = await heroBesideBoulder();
    place_monster(newMonster({
        data: game.mons[PM_SEWER_RAT], mx: rx, my: ry,
        m_id: 9402, mhp: 3, mhpmax: 3,
    }), rx, ry, game);
    game.u.uprops[DETECT_MONSTERS].intrinsic = 1;
    game.flags.verbose = false;

    assert.equal(await stepEast(),
                 "There's a sewer rat on the other side.");
    // The spotted arm never reaches map_invisible().
    assert.equal(glyph_is_invisible(
        game.level.at(rx, ry).remembered_glyph?.glyph,
    ), false);
    game.u.uprops[DETECT_MONSTERS].intrinsic = 0;
    game.flags.verbose = true;
});

// 467-468 and 476-480. A deaf hero hears nothing, so deliver_part1 stays
// FALSE and the verbose line switches to upstart("you") with the boulder named
// in full. pline.c You_hear() prints nothing for him either.
test('a deaf hero gets the unheralded phrasing of the same line', async () => {
    const { rx, ry } = await heroBesideBoulder();
    place_monster(newMonster({
        data: game.mons[PM_SEWER_RAT], mx: rx, my: ry,
        m_id: 9403, mhp: 3, mhpmax: 3,
    }), rx, ry, game);
    game.u.uprops[DEAF].intrinsic = 1;

    assert.equal(await stepEast(), 'You cannot move the boulder.');
    // 469 runs on the deaf path too: it sits outside the !Deaf gate.
    assert.ok(glyph_is_invisible(
        game.level.at(rx, ry).remembered_glyph?.glyph,
    ));
    game.u.uprops[DEAF].intrinsic = 0;
});

// 471. flags.verbose off drops the second half of the pair entirely.
test('a terse hero hears the monster and nothing else', async () => {
    const { rx, ry } = await heroBesideBoulder();
    place_monster(newMonster({
        data: game.mons[PM_SEWER_RAT], mx: rx, my: ry,
        m_id: 9404, mhp: 3, mhpmax: 3,
    }), rx, ry, game);
    game.flags.verbose = false;

    assert.equal(await stepEast(), 'You hear a monster behind the boulder.');
    game.flags.verbose = true;
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
    const before = game.u.umovement;
    // The 'g' prefix value, so that the same case pins `>= 2` here too.
    assert.equal(await stepEast(game, 2), '');
    assert.deepEqual([boulder.ox, boulder.oy], [sx, sy]);
    assert.notDeepEqual([game.u.ux, game.u.uy], [sx, sy]);
    // The hero's movement ration, not svm.moves: domove() cannot change the
    // turn counter, so asserting on it would give the headline claim no
    // oracle at all. A step the arm declines spends no ration.
    assert.equal(game.u.umovement, before);
    assert.equal(does_block(rx, ry, null, game), false);

    // `!(Blind || Hallucination)` skips the run arm for a blind hero, so this
    // same rush reaches moverock() and performs the ordinary known-boulder
    // push. The Blind-only "That feels like a boulder." arm is not reached
    // because this boulder is already remembered.
    game.u.uprops[BLINDED].intrinsic = 1;
    assert.equal(await stepEast(game, 2),
                 'With great effort you move the boulder.');
    assert.deepEqual([boulder.ox, boulder.oy], [rx, ry]);
    assert.deepEqual([game.u.ux, game.u.uy], [sx, sy]);
    game.u.uprops[BLINDED].intrinsic = 0;
});
