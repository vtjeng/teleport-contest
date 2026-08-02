// Focused tests for the meal that takes more than one turn: cmd.c
// set_occupation(), allmain.c moveloop_core()'s occupation block, eat.c
// eatfood(), and the two messages a long meal adds to done_eating().
// scripts/run-eat-occupation.mjs holds the end-to-end differential.
//
// One ported branch has no recorded case, and is named here so it is not
// mistaken for covered: eat.c fprefx()'s food ration arm prints "This food
// really hits the spot!" at 200 nutrition or below, and a hero starts at 900
// and spends about one point a turn, so reaching it needs some seven hundred
// quiet turns. Ten seeds were tried at that length on 31 July 2026 and every
// one stopped first, six on a monster attacking and four on a monster arriving
// beside the meal. The wording is pinned below by driving doeat() against a
// hand-lowered u.uhunger, which is the strongest evidence available without a
// recording.
//
// Several tests below call doeat() directly after replaying one wait, because
// runSegment() cannot stop in the middle of a meal: moveloop_core() reads no
// key while an occupation is set, so a truncated input sequence still runs the
// meal to its end. doeat() returns as soon as start_eating() has installed the
// occupation, which leaves the game exactly one bite in.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    ECMD_TIME,
    HALLUC,
    HUNGRY,
    NOT_HUNGRY,
    SATIATED,
} from '../js/const.js';
import { CRAM_RATION, FOOD_RATION } from '../js/objects.js';
import {
    UnsupportedEatError,
    doeat,
    eatfood,
    lesshungry,
    newuhs,
    zero_victual,
} from '../js/eat.js';
import { UnsupportedTurnBoundaryError, moveloop_core } from '../js/allmain.js';
import { set_occupation } from '../js/cmd.js';
import { monsterNearby } from '../js/hack.js';
import { youHear } from '../js/monmove.js';
import { the } from '../js/objnam.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    loadEatOccupationOptionsRecipe,
    loadEatOccupationRecipe,
} from './run-eat-occupation.mjs';

// Locate a segment by its seed and the keys it types, so reordering the matrix
// cannot silently point a test at a different case. The keys alone do not
// identify one: the plain five-turn meal and the same meal watched by a pet
// both type "ed ". Both halves of the key are asserted, so a segment that
// changes either one fails here rather than in the test that uses it.
function segmentFor(seed, moves, recipe = loadEatOccupationRecipe()) {
    const found = recipe.segments.filter(
        (segment) => segment.seed === seed && segment.moves === `.${moves}.`,
    );
    assert.equal(found.length, 1,
        `the matrix contains one segment with seed ${seed} typing ${moves}`);
    return found[0];
}

// Replay a matrix segment with different keys and report the fail-closed
// boundary it reached, or null when it reached none.
async function boundaryFor(segment, moves) {
    let boundary = null;
    await runSegment({ ...segment, moves }, {
        onBoundary: (error) => { boundary = error; },
    });
    return boundary;
}

// The inventory slot holding this object type, or null when none does.
function slotFor(otyp) {
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.otyp === otyp) return obj;
    return null;
}

// Replay one wait, then start a meal and stop where the occupation begins.
async function startMeal(segment, letter) {
    await runSegment({ ...segment, moves: '.' });
    // The letter answers floorfood()'s getobj() prompt.
    game.nhDisplay.terminal.pushKey(letter.charCodeAt(0));
    const result = await doeat(game, { statusRefresh: async () => {} });
    assert.equal(result, ECMD_TIME);
}

// A silent env for calling eat.c's own helpers a second time by hand.
function recordingEnv(said = []) {
    return {
        said,
        message: async (text) => { said.push(text); },
        endRunning: () => {},
        statusRefresh: async () => {},
    };
}

test('a five-turn meal spends six turns in all', async () => {
    const segment = segmentFor(5820011, 'ed ');
    // The turn before the meal, so the meal's own cost is the difference.
    await runSegment({ ...segment, moves: '.' });
    const beforeMoves = game.moves;
    const beforeHunger = game.u.uhunger;
    const beforeRations = slotFor(FOOD_RATION).quan;

    await runSegment(segment);
    // objects.h gives the food ration oc_delay 5. start_eating() takes the
    // first bite on the command's own turn and eatfood() takes one on each of
    // the next four; the sixth eatfood() call finds usedtime past reqtime and
    // runs done_eating(), which costs a turn of its own. The closing wait is
    // the seventh turn after the opening one.
    assert.equal(game.moves, beforeMoves + 7);
    // Five bites of 800/5 nutrition each, less gethungry()'s one point on
    // each of the seven turns.
    assert.equal(game.u.uhunger, beforeHunger + 5 * 160 - 7);
    // touchfood() split one ration off the stack and done_eating() used that
    // one up.
    assert.equal(slotFor(FOOD_RATION)?.quan ?? 0, beforeRations - 1);
    // done_eating() cleared the occupation before its own newuhs() call; the
    // clear moveloop_core() makes when eatfood() answers 0 is the second of
    // the two and is covered separately below.
    assert.equal(game.go.occupation, null);
    // done_eating() returns every field of the victual to zero.
    assert.deepEqual(game.context.victual, zero_victual());
    // The fourth bite crossed 1500, so lesshungry() printed its nearly-full
    // warning and left gn.nomovemsg behind; done_eating() prints that instead
    // of "You finish eating the food ration." The warning left the top line
    // through the --More-- that this segment's trailing space answers.
    assert.equal(game._ttyToplines, "You're finally finished.");
});

test('moveloop_core clears an occupation that answers 0', async () => {
    // allmain.c moveloop_core():502 `if ((*go.occupation)() == 0)
    // go.occupation = 0;`. eat.c done_eating() clears it first, so the meal
    // above cannot observe this line; a callback that answers 0 without
    // touching go.occupation can.
    await runSegment({ ...segmentFor(5820011, 'ed '), moves: '.' });
    let calls = 0;
    set_occupation(() => { calls++; return 0; }, 'testing', 0, game);
    // Skip the elapsed-turn block, so the turn is the occupation call alone.
    game.context.move = 0;
    await moveloop_core();
    assert.equal(calls, 1);
    assert.equal(game.go.occupation, null);
});

test('the occupation carries the rest of the meal', async () => {
    await startMeal(segmentFor(5820011, 'ed '), 'd');

    // set_occupation() installed eatfood and the text stop_occupation() would
    // print. Comparing against the export proves the installed callback is
    // that function and not a wrapper of it.
    assert.equal(game.go.occupation, eatfood);
    assert.equal(game.go.occtxt, 'eating the food ration');
    assert.equal(game.go.occtime, 0);

    // One bite in is the only place svc.context.victual can be read
    // populated: done_eating() zeroes every field. Each value is derived from
    // C, and the whole struct is compared so a field written by accident
    // fails too.
    const meal = game.context.victual;
    assert.equal(meal.piece.otyp, FOOD_RATION);
    // doeat() writes `meal.o_id = otmp->o_id` beside the piece itself.
    assert.equal(meal.o_id, meal.piece.o_id);
    assert.deepEqual({ ...meal, piece: null, o_id: 0 }, {
        piece: null,
        o_id: 0,
        // start_eating()'s `++usedtime` for the first bite.
        usedtime: 1,
        // objects.h gives the food ration oc_delay 5, and doeat() recomputes
        // reqtime as rounddiv(5 * oeaten, basenutrit), which is 5 again for a
        // whole one.
        reqtime: 5,
        // oeaten 800 is at least reqtime 5, so nmod is -(800 / 5).
        nmod: -160,
        // doeat() sets canchoke from `u.uhs == SATIATED`, and the Valkyrie
        // starts NOT_HUNGRY.
        canchoke: 0,
        // 900 plus one 160-point bite is still short of 1500.
        fullwarn: 0,
        eating: 1,
        // Only reset_eat() sets doreset, and nothing ported calls it.
        doreset: 0,
    });
    // newuhs() saved the status the meal started with and moved u.uhs
    // silently, so the meal's closing message describes the whole meal.
    assert.equal(game.u.uhs, SATIATED);
    assert.equal(game.save_hs, NOT_HUNGRY);
    assert.equal(game.saved_hs, true);

    // One more turn of the occupation pays out one more bite and answers
    // "still busy".
    assert.equal(await eatfood(game, { statusRefresh: async () => {} }), 1);
    assert.equal(game.context.victual.usedtime, 2);
});

test('a meal that stays under the choking threshold says it finished',
    async () => {
        const segment = segmentFor(5820023, 'ef');
        await runSegment({ ...segment, moves: '.' });
        const beforeRations = slotFor(CRAM_RATION).quan;
        await runSegment(segment);
        // done_eating()'s "You finish %s %s." with food_xname(piece, TRUE),
        // after fprefx()'s give_feedback label. Two messages that fit one top
        // line share it, which is why no --More-- appears here.
        assert.equal(
            game._ttyToplines,
            'This cram ration is bland.  You finish eating the cram ration.',
        );
        assert.equal(slotFor(CRAM_RATION).quan, beforeRations - 1);
    });

test('newuhs holds back the comment on a boundary the meal crosses',
    async () => {
        // C's newuhs() opens with `if (go.occupation == eatfood ||
        // gf.force_save_hs)`. The first term is what silences the
        // once-per-turn gethungry() call during a meal; without it a meal that
        // crossed a hunger boundary would comment in the middle rather than at
        // the end. gethungry() passes incr TRUE, which selects the wording the
        // assertion below would otherwise see.
        await startMeal(segmentFor(5820011, 'ed '), 'd');
        const env = recordingEnv();
        game.u.uhunger = 120;
        game.force_save_hs = false;
        await newuhs(true, game, env);
        assert.deepEqual(env.said, []);
        // The status still moves; only the comment is held back.
        assert.equal(game.u.uhs, HUNGRY);

        // Clearing the occupation, as done_eating() does before its own
        // newuhs() call, lets the comment out.
        game.go.occupation = null;
        await newuhs(false, game, env);
        assert.deepEqual(env.said, ['You only feel hungry now.']);
    });

test('done_eating leaves gn.nomovemsg in a shape its reader accepts',
    async () => {
        // C's `gn.nomovemsg = 0` assigns NULL to a `const char *`, and its
        // readers test it rather than calling a string method on it. This
        // port's other reader, js/monmove.js heroUnaware(), resolves the field
        // with `??` and then calls String.prototype.startsWith, which the
        // number 0 does not answer.
        await runSegment(segmentFor(5820011, 'ed '));
        assert.equal(game.nomovemsg, null);

        // pline.c You_hear() consults heroUnaware() only while the hero is
        // helpless; hack.c nomul() is the only writer of a negative gm.multi.
        game.multi = -1;
        game.flags.acoustics = true;
        assert.equal(youHear('a door open.', game), 'You hear a door open.');
    });

test('done_eating clears the occupation before its own newuhs call',
    async () => {
        // C ref: eat.c done_eating():549 `go.occupation = 0; /* do this early,
        // so newuhs() knows we're done */`. With the occupation still set,
        // newuhs() takes its silent arm and returns, so the saved status stays
        // held and the restore, the disp.botl write and any hunger comment all
        // slide to the following turn.
        await startMeal(segmentFor(5820011, 'ed '), 'd');
        assert.equal(game.saved_hs, true);

        // Drive the occupation by hand to the turn done_eating() runs on;
        // runSegment() cannot stop there, and the closing wait would repaint.
        // done_eating()'s closing message reaches a top line that still holds
        // lesshungry()'s nearly-full warning, so it forces the same --More--
        // the matrix segment answers with its trailing space.
        game.nhDisplay.terminal.pushKey(' '.charCodeAt(0));
        let refreshes = 0;
        const env = { statusRefresh: async () => { refreshes++; } };
        let turns = 1;
        while (await eatfood(game, env)) {
            turns++;
            assert.ok(turns <= 5, 'the meal ends by its sixth eatfood() turn');
            // Every earlier turn's newuhs() took the silent arm and returned
            // before reaching bot().
            assert.equal(refreshes, 0, `turn ${turns}`);
        }
        assert.equal(turns, 5);

        // newuhs() ran with the occupation already cleared, so it took its
        // second arm on the meal's own turn: the held status was released and
        // the status line repainted here rather than on the turn after.
        assert.equal(game.saved_hs, false);
        assert.equal(refreshes, 1);
        // 900 nutrition and five 160-point bites, with no elapsed turns in
        // between because eatfood() was called directly.
        assert.equal(game.u.uhs, SATIATED);
    });

test('lesshungry treats a running occupation as eating', async () => {
    // C's `iseating = (go.occupation == eatfood) || gf.force_save_hs`. Only
    // the first term is true on an eatfood turn outside bite()'s window, and
    // it is what spares a hero who was not satiated when the meal began.
    await startMeal(segmentFor(5820011, 'ed '), 'd');
    const env = recordingEnv();
    game.u.uhunger = 1999;
    game.force_save_hs = false;
    game.context.victual.canchoke = 0;
    await lesshungry(1, game, env);
    assert.equal(game.u.uhunger, 2000);

    // With canchoke set, the same call chokes instead.
    game.u.uhunger = 1999;
    game.context.victual.canchoke = 1;
    await assert.rejects(
        () => lesshungry(1, game, env),
        UnsupportedEatError,
    );
});

test('eatfood stops on each state a meal can be missing', async () => {
    await startMeal(segmentFor(5820011, 'ed '), 'd');
    const piece = game.context.victual.piece;

    // `if (!svc.context.victual.eating) return 0;` -- do_reset_eat() lowers
    // that flag and has no port.
    game.context.victual.eating = 0;
    await assert.rejects(() => eatfood(game), UnsupportedEatError);
    game.context.victual.eating = 1;

    // `if (food && !carried(food) && !obj_here(...)) food = 0;`
    const where = piece.where;
    piece.where = 0 /* OBJ_FREE */;
    await assert.rejects(() => eatfood(game), UnsupportedEatError);
    piece.where = where;

    // `if (!food) { do_reset_eat(); return 0; }` -- food_disappears() is what
    // empties the piece under a running occupation.
    game.context.victual.piece = null;
    await assert.rejects(() => eatfood(game), UnsupportedEatError);
});

test('a refusal raised inside the occupation becomes a turn boundary',
    async () => {
        // The occupation callback runs outside cmd.c failClosedCommand(), so
        // a refusal it raises would otherwise escape runSegment() as a hard
        // failure and cost the whole segment its matching prefix instead of
        // ending it at the last matching screen.
        const segment = segmentFor(5820011, 'ed ');
        await runSegment({ ...segment, moves: '.' });
        // doeat() sets victual.canchoke from `u.uhs == SATIATED`, so a hero
        // already satiated when the meal begins reaches lesshungry()'s
        // paranoid_query() refusal on the bite that carries u.uhunger past
        // 1500 with more than one bite still to come. 1250 plus the first
        // bite's 160 stays under 1500; the second crosses it.
        game.u.uhunger = 1250;
        game.u.uhs = SATIATED;
        game.nhDisplay.terminal.pushKey('d'.charCodeAt(0));
        await doeat(game, { statusRefresh: async () => {} });
        assert.equal(game.context.victual.canchoke, 1);
        assert.equal(game.u.uhunger, 1410);

        // Skip the elapsed-turn block, so the turn is the occupation alone.
        game.context.move = 0;
        await assert.rejects(() => moveloop_core(), (error) => {
            assert.ok(error instanceof UnsupportedTurnBoundaryError,
                `${error.constructor.name} is not a turn boundary`);
            assert.match(error.message,
                /^an occupation reached .*paranoid_query/u);
            return true;
        });
    });

test('a meal that ends beside a monster plays its last turn through',
    async () => {
        // allmain.c:502-508 clears go.occupation when the callback answers 0
        // and only then tests monster_nearby(). With go.occupation already 0,
        // stop_occupation() (684-696) skips its whole printing arm --
        // maybe_finished_meal(), You("stop %s.", go.occtxt) -- and takes
        // `else if (gm.multi >= 0) nomul(0);`, while reset_eat() is inert
        // because done_eating() has already zeroed victual.eating. C therefore
        // emits nothing and keeps playing, so the port must not stop here.
        const ranger = segmentFor(5820041, 'ef.ef');
        await boundaryFor({ ...ranger, seed: 5820043 }, ranger.moves);
        // That replay stopped with a hostile monster adjacent, which is the
        // position C reaches when the monster arrives on the meal's own last
        // turn rather than a turn earlier.
        assert.equal(monsterNearby(game), true);
        // Stand in for the finishing turn: a callback that answers 0, and a
        // victual done_eating() has zeroed.
        game.go.occupation = () => 0;
        game.context.victual = zero_victual();
        game.context.move = 0;
        await moveloop_core();
        assert.equal(game.go.occupation, null);
        // stop_occupation()'s else arm is nomul(0), whose only effect visible
        // here is the status flag it raises after moveloop_core()'s own bot()
        // has cleared it.
        assert.equal(game.disp.botl, true);
    });

test('a monster arriving beside the meal stops the occupation', async () => {
    // allmain.c:505-508 runs `stop_occupation(); reset_eat();` when
    // monster_nearby() answers true after a bite. Neither is ported, so the
    // port has to stop rather than eat on through the interruption. This seed
    // was chosen because a monster generated during the second cram ration
    // reaches the hero mid-meal; the matrix deliberately holds no such case,
    // because C keeps playing there.
    const ranger = segmentFor(5820041, 'ef.ef');
    const interrupted = await boundaryFor({ ...ranger, seed: 5820043 },
        ranger.moves);
    assert.match(interrupted.message, /interrupted by a nearby monster/u);

    // A pet standing beside its owner for a whole meal must not do that:
    // monster_nearby() skips a peaceful monster. That case is in the matrix,
    // and it reaches no boundary at all.
    const withPet = loadEatOccupationRecipe().segments.find(
        (segment) => segment.nethackrc.includes('pettype:dog'),
    );
    assert.ok(withPet, 'the matrix contains a segment with a pet');
    assert.equal(await boundaryFor(withPet, withPet.moves), null);
});

test('a monster nine squares away stops the meal before it is adjacent',
    async () => {
        // monmove.c dochugw() (213, 223-235) stops the occupation for a
        // hostile, spottable monster inside (BOLT_LIM + 1) * (BOLT_LIM + 1)
        // that either could not be seen before or was further away. That is a
        // radius of nine, so it fires turns before hack.c monster_nearby()
        // (4106-4127), whose scan covers the eight adjacent squares only.
        //
        // Recorded fresh with the C program on 2 August 2026, seed 5900020,
        // datetime 20310203040506, the matrix's plain Valkyrie options and the
        // keys below. C answers the food letter with
        // "You stop eating the food ration." at T:3, one turn into a five-turn
        // meal, and the two waits after it pass quietly at T:4 and T:5, so no
        // monster is ever adjacent. On the map C draws, a lichen crosses from
        // <4,7> to <4,8> while the hero stands at <13,8>: distu goes from
        // 82 to 81, over the bound and then exactly on it, which is the "or
        // it was too far away" clause.
        //
        // Until js/monmove.js dochugw() read go.occupation from the field
        // js/cmd.js set_occupation() writes, the port emitted all six screens
        // and finished the meal instead, ending on lesshungry()'s
        // "You're having a hard time getting all of it down." at T:6.
        const valkyrie = segmentFor(5820011, 'ed ');
        const interrupted = await boundaryFor(
            { ...valkyrie, seed: 5900020 },
            '.ed..',
        );
        assert.ok(interrupted, 'the meal reaches a fail-closed boundary');
        assert.match(interrupted.message, /occupation interruption/u);
        // Not the adjacency arm: allmain.c moveloop_core()'s own
        // monster_nearby() test raises a different boundary, and reaching that
        // one would mean dochugw() never fired.
        assert.doesNotMatch(interrupted.message, /nearby monster/u);
    });

test('set_occupation stores the callback and refuses a timeout', () => {
    const state = { go: {} };
    const callback = () => 0;
    set_occupation(callback, 'digging', 0, state);
    assert.equal(state.go.occupation, callback);
    assert.equal(state.go.occtxt, 'digging');
    assert.equal(state.go.occtime, 0);
    // A nonzero xtime installs cmd.c timed_occupation() instead, which counts
    // gm.multi down; no ported command supplies one.
    assert.throws(
        () => set_occupation(callback, 'digging', 3, state),
        /timeout is unreachable/u,
    );
});

test('the() prefixes an article only where C does', () => {
    // objnam.c the(): a lower-case name needs the article, an existing "the "
    // prefix is folded to lower case rather than doubled, and a capitalized
    // name reaches the proper-noun analysis this port stops at.
    assert.equal(the('food ration'), 'the food ration');
    assert.equal(the('The Amulet of Yendor'), 'the Amulet of Yendor');
    assert.throws(() => the('Excalibur'), /proper noun/u);
    assert.throws(() => the(''), /empty name/u);
    // C's test is `*str < 'A' || *str > 'Z'`, so both ends of the range are
    // capitals and neither is an article's business.
    assert.throws(() => the('Amulet of Yendor'), /proper noun/u);
    assert.throws(() => the('Zorkmid'), /proper noun/u);
    // The characters either side of the range are not.
    assert.equal(the('@ symbol'), 'the @ symbol'); /* '@' is 'A' - 1 */
    assert.equal(the('[ symbol'), 'the [ symbol'); /* '[' is 'Z' + 1 */
});

test('fprefx names the spot a food ration hits when the hero is hungry',
    async () => {
        // The 200-nutrition boundary between fprefx()'s two food ration
        // messages, and the 700 above which it says nothing. No recording can
        // reach the lower arm; see this file's header.
        //
        // C reads Hallucination only inside the `u.uhunger <= 200` arm, as the
        // ternary that swaps one wording for another, so the hallucinating
        // rows below differ from the plain ones at 200 and nowhere else. A
        // null expectation is the refusal the unported wording raises.
        const segment = segmentFor(5820011, 'ed ');
        for (const [uhunger, hallucinating, expected] of [
            [200, false, 'This food really hits the spot!'],
            [201, false, 'This satiates your stomach!'],
            [699, false, 'This satiates your stomach!'],
            [700, false, ''],
            [200, true, null] /* "Oh wow, like, superior, man" */,
            [201, true, 'This satiates your stomach!'],
            [699, true, 'This satiates your stomach!'],
            [700, true, ''],
        ]) {
            await runSegment({ ...segment, moves: '.' });
            game.u.uhunger = uhunger;
            game.u.uprops[HALLUC] = { intrinsic: hallucinating ? 1 : 0 };
            game.nhDisplay.terminal.pushKey('d'.charCodeAt(0));
            const eat = () => doeat(game, { statusRefresh: async () => {} });
            const label = `u.uhunger ${uhunger}`
                + (hallucinating ? ' hallucinating' : '');
            if (expected === null) {
                await assert.rejects(eat, UnsupportedEatError, label);
                continue;
            }
            await eat();
            // getobj() clears the top line once the letter answers it, so
            // whatever is pending now is fprefx()'s own message.
            assert.equal(game._pending_message, expected, label);
        }
    });

test('every occupation reader in js/ names the one field that holds it',
    () => {
        // C keeps the running occupation in one global, go.occupation, and
        // js/cmd.js set_occupation() gives it one home: state.go.occupation.
        // Four readers -- js/monmove.js dochugw() twice, js/teleport.js
        // rloc_to_core() and rloc_to() -- once named a bare state.occupation
        // instead, which nothing in js/ ever assigns, so monmove.c dochugw()'s
        // stop_occupation() could not run and a meal ran on where C abandons
        // it.
        //
        // The scan covers comments as well as code. A comment naming a field
        // that does not exist sends the next reader to the wrong owner, which
        // is how this defect survived a correctness pass.
        const jsDir = join(
            dirname(fileURLToPath(import.meta.url)),
            '..',
            'js',
        );
        const offenders = [];
        for (const name of readdirSync(jsDir)) {
            if (!name.endsWith('.js')) continue;
            const lines = readFileSync(join(jsDir, name), 'utf8').split('\n');
            lines.forEach((line, index) => {
                for (const m of line.matchAll(/([\w$?]*)\.occupation\b/gu)) {
                    if (m[1] === 'go' || m[1] === 'go?') continue;
                    offenders.push(`js/${name}:${index + 1}: ${line.trim()}`);
                }
            });
        }
        assert.deepEqual(offenders, []);
    });

test('the multi-turn matrix covers the branches this slice ports', () => {
    const moves = loadEatOccupationRecipe().segments.map((s) => s.moves);
    // A five-turn meal, a three-turn meal, two meals in a row, a meal watched
    // by a pet, and a meal begun below 700 nutrition.
    assert.equal(moves.length, 5);
    // The option variations replay the five-turn meal under a different
    // symbol set and message window.
    assert.equal(loadEatOccupationOptionsRecipe().segments.length, 1);
});
