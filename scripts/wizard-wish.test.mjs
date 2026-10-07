// The wish prompt: wizcmds.c wiz_wish(), zap.c makewish(), and the
// cmd.c can_do_extcmd() call rhack() makes for the key a command is bound to.
//
// scripts/run-wizard-wish.mjs holds the strict differential evidence: eight
// segments recorded against the C reference, covering both dispatch routes,
// both refusals an ordinary hero meets, and four shapes of typed line. The
// assertions here pin what those recordings cannot show -- retry state,
// caller branches no current recipe reaches, and values a screen never carries.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    UnsupportedHeroCommandBoundaryError, failClosedCommandRefusals, rhack,
} from '../js/cmd.js';
import { init_artifacts } from '../js/artifacts.js';
import {
    A_CON, A_STR, FIG_TRANSFORM, MOD_ENCUMBER, UNENCUMBERED,
} from '../js/const.js';
import { UnsupportedDropError } from '../js/do.js';
import { WIZMODECMD, extcmdlist } from '../js/extcmdlist_data.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { roles } from '../js/roles.js';
import { monst_globals_init } from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import {
    BOULDER, DAGGER, FIGURINE, GEM_CLASS, HEAVY_IRON_BALL, SACK, SCR_BLANK_PAPER,
    objects_globals_init,
} from '../js/objects.js';
import { makewish } from '../js/zap.js';
import { peek_timer } from '../js/timeout.js';
import {
    CASES as CONTAINER_CASES, loadWishedContainerRecipe,
} from './run-wished-container.mjs';
import {
    CASES as RANDOM_WISH_CASES, loadRandomWishRecipe,
} from './run-random-wish.mjs';
import {
    ESCAPE_KEY,
    EXTCMD_KEY,
    WAIT_KEY,
    WIZWISH_KEY,
    loadWizardWishRecipe,
} from './run-wizard-wish.mjs';

// win/tty/getline.c:85 tests `c == EOF`, and cmd.c:452's `return (char) ch`
// makes 0xFF the only byte that reads back as -1. It is the one input that
// raises iflags.term_gone.
const EOF_BYTE = '\xFF';
const C_INVENT = readFileSync(
    new URL('../nethack-c/upstream/src/invent.c', import.meta.url), 'utf8',
);

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

function inventoryHas(otyp) {
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.otyp === otyp) return true;
    return false;
}

// Locate a segment by the keys it types, so reordering the matrix cannot
// silently point a test at a different case.
function segmentFor(moves) {
    const found = loadWizardWishRecipe().segments.find(
        (segment) => segment.moves === `.${moves}`,
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
    return found;
}

// A game one step short of makewish(): a display holding the keys the prompt
// will read, and the two state bags makewish() and getlin() write through.
// The hero has no position, so vpline()'s `if (u.ux) flush_screen()` is
// skipped and the top line is the only thing that paints. `reads` collects the
// top line as each keystroke is about to be read.
function wishState(keys, { verbose = false, cmdassist = false } = {}) {
    const state = resetGame();
    // initalign is role_init()'s index into aligns[]; 0 is the lawful row.
    // hack_artifacts() reads it, and the role, to fix up the quest artifacts.
    state.flags = { verbose, initalign: 0 };
    // The --More-- the verbose announcement needs is dismissed with a space,
    // which xwaitforspace() accepts only once setftty() raised iflags.cbreak
    // inside tty_init_nhwindows(); every wish happens well after that.
    state.iflags = { cbreak: true, cmdassist };
    state.urole = { ...roles[0] };
    // readobjnam() reads the shuffled objects[] from its first block onward,
    // so even a line it refuses needs the catalog in place.  Zero choices
    // initialize every randomized description deterministically.
    objects_globals_init(state);
    init_objects(state, () => 0);
    // readobjnam_postparse1() hands every name longer than two characters to
    // name_to_monplus(), which reads mons[].
    monst_globals_init(state);
    // readobjnam_postparse3() offers every unmatched name to artifact_name(),
    // which reads artilist[].
    init_artifacts(state);
    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('the wish prompt asked for a key the test withheld');
    };
    for (const ch of keys) state.nhDisplay.pushKey(ch.charCodeAt(0));
    const reads = [];
    state._preNhgetchHook = () => reads.push(topLine());
    return { state, reads };
}

test('the wish matrix contains only source-selected inputs', () => {
    const recipe = loadWizardWishRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 31);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // Every segment opens with a wait, so the prompt paints over a screen
        // an ordinary turn produced rather than over the arrival screen.
        assert.equal(segment.moves.at(0), '.');
        // A segment that submits a wish has to close with a wait, so the
        // screen the letter line paints over is one the reply settled. The
        // '#' route spends one Return closing the command name before the
        // prompt opens, so the test starts counting after that.
        const opened = segment.moves.includes(WIZWISH_KEY)
            ? segment.moves.slice(segment.moves.indexOf(WIZWISH_KEY) + 1)
            : segment.moves.slice(segment.moves.indexOf('\n') + 1);
        if (opened.includes('\n'))
            assert.equal(segment.moves.at(-1), WAIT_KEY);
    }
    // Twenty-nine segments reach the command and two are refused, so exactly
    // twenty-nine set debug mode. cmd.c:2000's "wizwish" row carries
    // WIZMODECMD, which can_do_extcmd() and extcmds_match() both read.
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('playmode:debug'),
        ).length,
        29,
    );
    assert.equal(
        extcmdlist.find(({ ef_txt }) => ef_txt === 'wizwish').flags
        & WIZMODECMD,
        WIZMODECMD,
    );
});

test('C(w) paints the wish prompt and no verbose line', async () => {
    const segment = segmentFor(`${WIZWISH_KEY}mud boo`);

    // zap.c:6329-6332 builds the prompt as "For what do you wish" plus "?",
    // with no cmdassist suffix because tries is 0; custompline() writes it
    // followed by a space, leaving the cursor one column past the text.
    await runSegment({ ...segment, moves: `.${WIZWISH_KEY}` });
    assert.equal(topLine(), 'For what do you wish?');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [22, 0],
    );

    // wizcmds.c:36 clears flags.verbose around makewish(), which is why
    // zap.c:6327's "You may wish for an object." never precedes the prompt.
    // The line would need a --More-- of its own, so its absence is what lets
    // the next keystroke reach getlin() rather than dismiss a message.
    await runSegment({ ...segment, moves: `.${WIZWISH_KEY}mud` });
    assert.equal(topLine(), 'For what do you wish? mud');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [25, 0],
    );
});

test('#wizwish reaches the same prompt as C(w)', async () => {
    const typed = segmentFor(`${EXTCMD_KEY}wizwish\nblessed sc`);
    await runSegment({ ...typed, moves: `.${EXTCMD_KEY}wizwish\nblessed` });
    assert.equal(topLine(), 'For what do you wish? blessed');
});

test('an ordinary hero pressing C(w) is told the command is unavailable',
    async () => {
    // cmd.c:479-481. rhack() runs can_do_extcmd() before dispatch, so an
    // ordinary game answers the key rather than the wish prompt. wizcmds.c:42
    // would print the same string from wiz_wish()'s else arm, which is why no
    // recorded screen can tell the two owners apart.
    const segment = segmentFor(`${WIZWISH_KEY}.`);
    assert.equal(segment.nethackrc.includes('playmode:debug'), false);

    await runSegment({ ...segment, moves: `.${WIZWISH_KEY}` });
    assert.equal(topLine(), "Unavailable command 'wizwish'.");
    // can_do_extcmd()'s refusal spends no turn: rhack() leaves res at ECMD_OK
    // and reset_cmd_vars() puts context.move back to 0.
    assert.equal(game.context.move, 0);
});

test('rhack() runs can_do_extcmd() for the key a command is bound to',
    async () => {
    // cmd.c:3689. No screen can show that rhack() rather than the handler made
    // the WIZMODECMD refusal, because wizcmds.c:42 prints the same string from
    // wiz_wish()'s else arm; can_do_extcmd()'s other arm has no such double,
    // so it is the one that pins the call site.
    //
    // u.uburied is a state no ported path sets -- bury.c bury_you() is the
    // only writer -- so this drives rhack() directly with the key rather than
    // through a segment. 'e' is bound to the "eat" row, which carries
    // CMD_M_PREFIX alone (cmd.c:1743) and so fails the IFBURIED test; without
    // the call at 3689 the key would reach doeat() instead.
    const { state } = wishState('');
    state.u = { uburied: true };

    await rhack('e'.charCodeAt(0), state);

    // pline() queues the line and the next flush paints it, so outside a
    // running segment the display's record of the top line is where it shows.
    assert.equal(
        state.nhDisplay.topMessage,
        "You can't do that while you are buried!",
    );
    assert.equal(state.context.move, 0);
});

test('makewish() retries a munged no-match line and appends cmdassist help',
    async () => {
    // zap.c:6345 runs mungspaces() before readobjnam(). The first line is an
    // invalid wish after the recognized qualifiers are removed; C prints its
    // no-match line and retries with the cmdassist suffix because tries > 0.
    const { state, reads } = wishState(
        '  blessed   +2  cry\n nothing\n', { cmdassist: true },
    );
    state.u = { uconduct: {} };
    state.context = { resume_wish: 7 }; /* a value zap.c:6323 has to clear */
    await makewish(state);
    assert.ok(reads.includes('For what do you wish?'));
    assert.ok(reads.includes(
        "For what do you wish (enter 'help' for assistance)?",
    ));
    // The retry suffix is source-controlled by tries, and reaching the second
    // line only after the unmatched input proves makewish() printed and
    // retried rather than swallowing the first entry.
    assert.equal(state.u.uconduct.wishes ?? 0, 0);
    // zap.c:6323, the first statement of the function: a wish that reaches the
    // prompt is not one a restore has to resume.
    assert.equal(state.context.resume_wish, 0);
});

test('makewish() retries help without counting it, then accepts a wish',
    async () => {
    const segment = segmentFor(`${WIZWISH_KEY}mud boo`);
    const moves = `.${WIZWISH_KEY}help\nmagic lamp\n.`;
    await runSegment({ ...segment, moves });

    // The production command reached help, retried, then completed a real
    // object wish. The helper's unported void result did not count as a failed
    // wish or consume the next line.
    assert.equal(game.u.uconduct.wishes, 1);
    assert.ok(game.unported.has('zap.c wishcmdassist'));
});

test('makewish() turns an unlabeled scroll wish into blank paper', async () => {
    const segment = loadWizardWishRecipe().segments[0];
    const moves = `.${WIZWISH_KEY}unlabeled scroll\n.`;
    await runSegment({ ...segment, moves });

    assert.equal(game.u.uconduct.wishes, 1);
    let newest = null;
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (!newest || obj.o_id > newest.o_id) newest = obj;
    assert.ok(newest);
    assert.equal(newest.otyp, SCR_BLANK_PAPER);
});

test('makewish() announces the wish when flags.verbose is set', async () => {
    // zap.c:6326-6327. No ported caller reaches this arm, because wiz_wish()
    // is the only one and it clears the flag first; potion.c:2809, sit.c:110,
    // sit.c:251 and zap.c:2583 leave it as the player set it. The line needs a
    // --More-- of its own, so the announcement costs a keystroke that the
    // silent path spends on the wish itself.
    const loud = wishState(' a\n nothing\n', { verbose: true });
    loud.state.u = { uconduct: {} };
    await makewish(loud.state);
    assert.deepEqual(loud.reads.slice(0, 3), [
        'You may wish for an object.--More--',
        'For what do you wish?',
        'For what do you wish? a',
    ]);
    assert.ok(loud.reads.includes('For what do you wish?'));

    // With the flag clear, retry leaves the same prompt without a suffix.
    const quiet = wishState('a\n nothing\n');
    quiet.state.u = { uconduct: {} };
    await makewish(quiet.state);
    assert.deepEqual(quiet.reads.slice(0, 2), [
        'For what do you wish?',
        'For what do you wish? a',
    ]);
    assert.ok(quiet.reads.includes('For what do you wish?'));
});

test('a terminal that goes away at the prompt suspends the wish', async () => {
    // zap.c:6339-6342. win/tty/getline.c:87 raises iflags.term_gone for the
    // byte that reads back as EOF, and makewish() then returns instead of
    // reading the buffer. allmain.c:200 resumes this wish before elapsed turns.
    //
    // No fresh recording can reach this arm: scripts/record-session.mjs sends
    // each replay key as Buffer.from(k, 'utf8'), which turns 0xFF into the two
    // bytes 0xC3 0xBF, so the reference program never sees the byte that reads
    // back as EOF.
    const { state } = wishState(`lam${EOF_BYTE}`);
    state.u = { uconduct: {} };
    state.context = { resume_wish: 7 }; /* a value zap.c:6323 has to clear */

    await makewish(state);

    assert.equal(state.iflags.term_gone, 1);
    assert.equal(state.context.resume_wish, 1);
});

test('the wish command restores flags.verbose after makewish() returns',
    async () => {
    // wizcmds.c:39. The restore is unobservable on the throwing path, because
    // makewish() never returns there; the terminal-gone arm above is the one
    // route by which a running game reaches wizcmds.c:39 today, so it is the
    // one that can show the flag going back. It runs here through the whole
    // command, so encumber_msg() at wizcmds.c:40 runs too.
    const segment = segmentFor(`${WIZWISH_KEY}mud boo`);
    await runSegment({ ...segment, moves: `.${WIZWISH_KEY}lam${EOF_BYTE}` });

    assert.equal(game.iflags.term_gone, 1);
    // The next moveloop_core iteration calls makewish, clearing the saved flag
    // before its resumed prompt exhausts this input stream (allmain.c:200-201).
    assert.equal(game.context.resume_wish, 0);
    // js/options.js:297 defaults flags.verbose to true and this segment's
    // nethackrc does not clear it, so a missing restore would leave it false.
    assert.equal(game.flags.verbose, true);
});

test('Escape over a typed wish restarts the prompt instead of ending it',
    async () => {
    // win/tty/getline.c:88. An Escape with text behind it empties the buffer,
    // repaints the prompt and keeps reading; only an Escape over an empty line
    // returns "\033", which zap.c:6347 turns into a wish for a random object.
    const segment = segmentFor(`${WIZWISH_KEY}scroll${ESCAPE_KEY}ri`);
    await runSegment({
        ...segment,
        moves: `.${WIZWISH_KEY}scroll${ESCAPE_KEY}ri`,
    });
    assert.equal(topLine(), 'For what do you wish? ri');
});

test('makewish supplies invent.c the dead-species predicate for a cursed figurine',
    async () => {
        // C invent.c:carry_obj_effects() attaches the timer only after
        // dead_species(obj->corpsenm, TRUE) says the species is viable.
        assert.match(C_INVENT,
            /if \(obj->otyp == FIGURINE\) \{\s*if \(obj->cursed && obj->corpsenm != NON_PM\s*&& !dead_species\(obj->corpsenm, TRUE\)\) \{\s*attach_fig_transform_timeout\(obj\);/u);

        const recipe = JSON.parse(readFileSync(new URL(
            '../recipes/apply.c/figurine-timeout-wizard-wish-a61-independent.session.json',
            import.meta.url,
        ), 'utf8'));
        const segment = recipe.segments[0];
        // The source setup's seed yields rnd(9000)=3558; timeout.c adds 200,
        // so attach_fig_transform_timeout schedules 3,758 turns from the
        // current move. Its 10,000-turn invulnerability makes nh_timeout()
        // return before run_timers(), so the preserved C recipe reaches only
        // attachment. The later callback is recorded separately in
        // figurine-timeout-wizard-wish-a61-timer-callback.session.json and
        // figurine-timeout-wizard-wish-a61-timer-callback-seed-variation.session.json.
        const moves = segment.moves.slice(0, segment.moves.lastIndexOf('4000.'));
        assert.ok(moves.length < segment.moves.length,
            'the preserved attachment recipe ends with a 4,000-turn wait');
        const boundaries = [];
        await runSegment({ ...segment, moves }, {
            onBoundary(error) { boundaries.push(error); },
        });
        assert.deepEqual(boundaries, []);

        let figurine = game.invent;
        while (figurine && figurine.otyp !== FIGURINE)
            figurine = figurine.nobj;
        assert.ok(figurine, 'the wished-for figurine remains in inventory');
        assert.equal(figurine.cursed, true);
        assert.equal(figurine.timed, 1);
        assert.equal(
            peek_timer(FIG_TRANSFORM, figurine, game) - game.moves,
            3758,
        );
    });

// zap.c:makewish writes wish conduct before invent.c:hold_another_object adds
// an over-limit object and calls do.c:dropx. The partial dropz port then
// refuses a boulder floor effect at the command seam, after those source-order
// writes; the wish path must retain that boundary instead of escaping.
test('an unsupported heavy-wish floor effect stops after hold source writes',
    async () => {
        assert.ok(failClosedCommandRefusals().includes(UnsupportedDropError));

        // readobjnam() grants the boulder, then makewish writes wish conduct
        // and hold_another_object adds it before dropx reaches its supported
        // floor-effect boundary. This borrows a recording's configuration
        // and supplies a distinct wish input.
        //
        // runSegment()'s onBoundary is what makes this an assertion rather
        // than a smoke test: without it the call passes just as happily when
        // no wish is typed at all, or when the wish stops somewhere earlier.
        const recorded = loadWizardWishRecipe().segments[0];
        const boundaries = [];
        await runSegment(
            { ...recorded, moves: `.${WIZWISH_KEY}boulder\n.` },
            { onBoundary: (error) => boundaries.push(error) },
        );
        assert.equal(boundaries.length, 1);
        // failClosedCommand() wraps the original class and keeps its message,
        // so the boundary names the arm that stopped rather than any earlier
        // one.
        assert.ok(boundaries[0] instanceof UnsupportedHeroCommandBoundaryError);
        assert.match(
            boundaries[0].message,
            /unsupported drop: a boulder landing on the floor/u,
        );
        // The unsupported floor effect is later than both source writes.
        assert.equal(game.u.uconduct.wishes, 1);
        assert.equal(inventoryHas(BOULDER), true);
        for (let obj = game.level.objects[game.u.ux][game.u.uy]; obj;
            obj = obj.nexthere) {
            assert.notEqual(obj.otyp, BOULDER);
        }
    });

test('a trap stops a heavy wish only after hold and wish state changes',
    async () => {
        const recorded = loadWizardWishRecipe().segments[0];
        await runSegment({ ...recorded, moves: '.' });
        // Strength and Constitution 3 make the 480-weight ball exceed the
        // default MOD_ENCUMBER pickup limit on this otherwise live hero.
        game.u.acurr.a[A_STR] = 3;
        game.u.acurr.a[A_CON] = 3;
        // Place a trap at the hero's position to trigger the drop guard.
        // Previously has_shop sufficed, but the guard now checks costly_spot()
        // and a non-shop square on a shop level no longer refuses the drop.
        const { ux, uy } = game.u;
        game.level.traps = (game.level.traps ?? []).concat({ tx: ux, ty: uy });
        const before = {
            blesscnt: game.u.ublesscnt,
            conduct: game.u.uconduct.wishes,
            floor: game.level.objects[ux][uy],
        };
        for (const ch of 'heavy iron ball\n')
            game.nhDisplay.pushKey(ch.charCodeAt(0));

        await assert.rejects(
            () => rhack(WIZWISH_KEY.charCodeAt(0), game),
            (error) => error instanceof UnsupportedHeroCommandBoundaryError
                && /trap/u.test(error.message),
        );

        assert.equal(game.u.uconduct.wishes, before.conduct + 1);
        assert.equal(inventoryHas(HEAVY_IRON_BALL), true);
        assert.equal(game.level.objects[ux][uy], before.floor);
        assert.equal(game.u.ublesscnt, before.blesscnt);
        // makewish's final rn1(100, 50) blessing timeout is after hold/drop;
        // it is therefore not reached when dropx refuses this trapped square.
    });

// invent.c:1261-1264 raises the hold limit to flags.pickup_burden, exactly as
// pickup.c:1757-1758 does for a lift, and options.c optfn_pickup_burden() is
// what a configuration file writes there. A wish is the shortest input that
// reaches the limit, because it can create an object heavy enough to cross it
// on any hero.
test('a configured pickup_burden decides whether a wish is held',
    async () => {
        const recorded = loadWizardWishRecipe().segments[0];
        // 'u' is the switch's Unencumbered arm, the strictest setting. It
        // lowers prev_encumbr to near_capacity() alone, so any object that
        // moves the hero off unencumbered at all takes drop_it.
        const strict = recorded.nethackrc.replace(
            'OPTIONS=', 'OPTIONS=pickup_burden:u\nOPTIONS=',
        );
        const wish = async (nethackrc, typed) => {
            const boundaries = [];
            await runSegment(
                { ...recorded, nethackrc, moves: `.${WIZWISH_KEY}${typed}\n.` },
                { onBoundary: (error) => boundaries.push(error) },
            );
            return boundaries;
        };
        const heldTypes = () => {
            const held = [];
            for (let obj = game.invent; obj; obj = obj.nobj) held.push(obj.otyp);
            return held;
        };

        // The default limit is MOD_ENCUMBER, which a 480-weight ball stays
        // under on this hero, so hold_another_object() keeps it.
        let boundaries = await wish(recorded.nethackrc, 'heavy iron ball');
        assert.equal(game.flags.pickup_burden, MOD_ENCUMBER);
        assert.deepEqual(boundaries, []);
        assert.equal(heldTypes().includes(HEAVY_IRON_BALL), true);
        // zap.c:6402 counts the wish once it is granted, which is what shows
        // the wish ran to completion rather than stopping earlier.
        assert.equal(game.u.uconduct.wishes, 1);

        // The same wish under the same seed with the statement added: the
        // limit is UNENCUMBERED, the ball's weight passes it, and drop_it
        // puts the ball on the floor instead.
        boundaries = await wish(strict, 'heavy iron ball');
        assert.equal(game.flags.pickup_burden, UNENCUMBERED);
        assert.deepEqual(boundaries, []);
        assert.equal(heldTypes().includes(HEAVY_IRON_BALL), false);
        assert.equal(
            game.level.objects[game.u.ux][game.u.uy]?.otyp, HEAVY_IRON_BALL,
        );

        // A dagger leaves the hero unencumbered, so even the strictest limit
        // holds it: the ball's weight and not the statement alone is what
        // moved the outcome.
        boundaries = await wish(strict, 'dagger');
        assert.deepEqual(boundaries, []);
        assert.equal(heldTypes().includes(DAGGER), true);
    });

test('ordinary wish-drop refusals convert at the command seam', () => {
    assert.ok(failClosedCommandRefusals().includes(UnsupportedDropError));
});

// zap.c:6346-6347. An Escape over an empty wish line empties the buffer rather
// than declining the wish, so readobjnam("") falls past
// readobjnam_preparse()'s empty return to `any:` and is granted
// wrpsym[rn2(13)]. Every case of the random-wish matrix but one presses that
// key, and that matrix needs the C recorder, so nothing in `npm test` reaches
// the line: restoring the refusal it replaced, or routing the empty line to
// the "nothing" sentinel instead, would ship green.
test('an Escape at the wish prompt grants a random object', async () => {
    // CASES[0] carries no `wish` text, which is what makes moves() press
    // Escape; the assertion below fails rather than passing vacuously if the
    // matrix is ever reordered.
    const escaped = loadRandomWishRecipe().segments[0];
    assert.equal(escaped.moves, `.${WIZWISH_KEY}${ESCAPE_KEY}.`);
    const boundaries = [];
    await runSegment(escaped, { onBoundary: (error) => boundaries.push(error) });
    assert.deepEqual(boundaries, []);
    // zap.c:6390 spends the wish whatever readobjnam() answered.
    assert.equal(game.u.uconduct.wishes, 1);
    // next_ident() hands out rising ids, so the wished object is the newest.
    let granted = null;
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (!granted || obj.o_id > granted.o_id) granted = obj;
    assert.equal(granted.oclass, RANDOM_WISH_CASES[0].oclass);
    assert.equal(granted.otyp, RANDOM_WISH_CASES[0].otyp);
});

// invent.c merged():938-941 prints "You learn more about your items by
// comparing them." when a merge settles a known, rknown or bknown the two
// stacks disagreed on, and 944 frees the incoming object only afterwards; the
// prinv() its caller runs is later still. makewish() supplies that pline as a
// hook, and no recorded segment merges a wish into a carried stack, so without
// this the text could be changed to anything and the suite would stay green.
test('a wish that merges into a carried stack announces the comparison',
    async () => {
        // The Rogue starts with a stack of uncursed +0 daggers and the wished
        // one arrives unidentified, so `known` is what the merge settles.
        // Naming "uncursed +0" keeps mksobj()'s own BUC and enchantment rolls
        // out of it, which would otherwise make the merge seed-dependent.
        const recorded = loadWizardWishRecipe().segments[0];
        const rogue = {
            ...recorded,
            nethackrc: `${recorded.nethackrc}OPTIONS=role:Rogue\n`,
        };
        const daggerStack = () => {
            let found = null;
            for (let obj = game.invent; obj; obj = obj.nobj)
                if (obj.otyp === DAGGER) found = obj;
            return found;
        };
        // The same game without the wish, so the count below is derived from
        // u_init.c rather than written down.
        await runSegment({ ...rogue, moves: WAIT_KEY });
        const started = daggerStack().quan;

        const boundaries = [];
        await runSegment({
            ...rogue,
            moves: `.${WIZWISH_KEY}uncursed +0 dagger\n${WAIT_KEY}`,
        }, { onBoundary: (error) => boundaries.push(error) });
        assert.deepEqual(boundaries, []);
        // The message is still on the top line, holding a --More--, which is
        // where C leaves it: prinv()'s letter line has not painted over it,
        // and obfree() has not run either.
        assert.equal(
            topLine(),
            'You learn more about your items by comparing them.--More--',
        );
        // The wished dagger joined the carried stack, which gains one dagger
        // and the `known` the merge discovered.
        assert.equal(daggerStack().quan, started + 1);
        assert.equal(daggerStack().known, true);
    });

// zap.c makewish() calls readobjnam(), whose typfnd: tail calls mksobj(). Five
// of the seven container types reach mkobj.c mkbox_cnts() from there, and
// nothing else on the wish path needs an obj.js hook, so before this slice the
// call site passed only the game state. Both halves are asserted: that a wish
// mkbox_cnts() is inlined in obj.js and no longer uses a populateContainer
// hook; the end-to-end segment replay verifies that a wished container gets
// properly populated through the running game.
test('makewish() populates wished containers through mkbox_cnts()', async () => {
    // End to end, on the case scripts/run-wished-container.mjs records against
    // C at this seed: mkbox_cnts() draws one object and boxiprobs[] lands on
    // the gem band. Nothing on the screen shows it, because a fresh container
    // has cknown 0 and objnam.c doname_base():1373 needs that set, so the
    // contents have to be read out of the game.
    const gemCase = CONTAINER_CASES.find(
        ({ contents }) => contents.length === 1 && contents[0] === GEM_CLASS,
    );
    assert.ok(gemCase, 'the container matrix records a gem-filled container');
    await runSegment(
        loadWishedContainerRecipe().segments[CONTAINER_CASES.indexOf(gemCase)],
    );
    const held = [];
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.otyp === SACK) held.push(obj);
    assert.equal(held.length, 1);
    const inside = [];
    for (let obj = held[0].cobj; obj; obj = obj.nobj) inside.push(obj.oclass);
    assert.deepEqual(inside, [GEM_CLASS]);
});

// zap.c:6339-6342 guards resume_wish with !iflags.debug_fuzzer. An EOF byte
// cannot be sent through the UTF-8 C recorder; use the source-pinned fixture.
test('makewish does not schedule a terminal-gone wish during debug fuzzing', async () => {
    const { state } = wishState(EOF_BYTE);
    state.u = { uconduct: {} };
    state.iflags.debug_fuzzer = true;
    await makewish(state);
    assert.equal(state.context.resume_wish, 0); // Entry reset survives the fuzzer arm.
});
