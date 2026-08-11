// The wish prompt: wizcmds.c wiz_wish(), zap.c makewish()'s head, and the
// cmd.c can_do_extcmd() call rhack() makes for the key a command is bound to.
//
// scripts/run-wizard-wish.mjs holds the strict differential evidence: eight
// segments recorded against the C reference, covering both dispatch routes,
// both refusals an ordinary hero meets, and four shapes of typed line. The
// assertions here pin what those recordings cannot show -- the refusal class
// the command seam has to convert, the branches of makewish() no ported caller
// reaches, and the state a screen never carries.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    UnsupportedHeroCommandBoundaryError, failClosedCommandRefusals, rhack,
} from '../js/cmd.js';
import { init_artifacts } from '../js/artifacts.js';
import { A_CON, A_STR, MOD_ENCUMBER } from '../js/const.js';
import { UnsupportedDropError } from '../js/do.js';
import { UnsupportedObjectOperationError } from '../js/obj.js';
import { WIZMODECMD, extcmdlist } from '../js/extcmdlist_data.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { roles } from '../js/roles.js';
import { monst_globals_init } from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import {
    DAGGER, GEM_CLASS, HEAVY_IRON_BALL, SACK, objects_globals_init,
} from '../js/objects.js';
import { readobjnam } from '../js/objnam_readobjnam.js';
import { UnsupportedWishError, makewish } from '../js/zap.js';
import {
    CASES as CONTAINER_CASES, loadWishedContainerRecipe,
} from './run-wished-container.mjs';
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

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
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
function wishState(keys, { verbose = false } = {}) {
    const state = resetGame();
    // initalign is role_init()'s index into aligns[]; 0 is the lawful row.
    // hack_artifacts() reads it, and the role, to fix up the quest artifacts.
    state.flags = { verbose, initalign: 0 };
    state.iflags = {};
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

test('the wish refusal converts at the command seam', () => {
    // js/cmd.js runWishCommand() wraps wiz_wish() in failClosedCommand(), and
    // js/jsmain.js breaks a segment only for the three boundary classes, so a
    // class makewish() can raise that the wrapper does not list escapes as a
    // hard failure and discards the segment's matching prefix instead of
    // stopping on it. Every admitted wish reaches this one, on both dispatch
    // routes, after getlin() has already echoed the whole typed line: dropping
    // it from the list turns every one of those screens into a session error.
    assert.ok(failClosedCommandRefusals().includes(UnsupportedWishError));
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

test('makewish() hands readobjnam() the line mungspaces() collapsed',
    async () => {
    // zap.c:6345 runs mungspaces(buf) before the Escape test at 6346, so the
    // buffer readobjnam() parses is already collapsed: hacklib.c mungspaces()
    // folds tabs into spaces, squeezes each run to one, and drops the leading
    // and trailing ones.  "blessed" and "+2" are qualifiers the parser now
    // applies, so the refusal comes from "cry" matching no object name; either
    // way the error carries the collapsed line, which is what this pins.
    const { state } = wishState('  blessed   +2  cry\n');
    state.context = { resume_wish: 7 }; /* a value zap.c:6323 has to clear */
    await assert.rejects(
        () => makewish(state),
        (error) => error instanceof UnsupportedWishError
            && error.buf === 'blessed +2 cry',
    );
    // zap.c:6323, the first statement of the function: a wish that reaches the
    // prompt is not one a restore has to resume.
    assert.equal(state.context.resume_wish, 0);
});

test('makewish() announces the wish when flags.verbose is set', async () => {
    // zap.c:6326-6327. No ported caller reaches this arm, because wiz_wish()
    // is the only one and it clears the flag first; potion.c:2809, sit.c:110,
    // sit.c:251 and zap.c:2583 leave it as the player set it. The line needs a
    // --More-- of its own, so the announcement costs a keystroke that the
    // silent path spends on the wish itself.
    const loud = wishState(' a\n', { verbose: true });
    await assert.rejects(() => makewish(loud.state), UnsupportedWishError);
    assert.deepEqual(loud.reads, [
        'You may wish for an object.--More--',
        'For what do you wish?',
        'For what do you wish? a',
    ]);

    // With the flag clear the same three keys would overrun the prompt, so the
    // quiet run gets only the two the wish needs.
    const quiet = wishState('a\n');
    await assert.rejects(() => makewish(quiet.state), UnsupportedWishError);
    assert.deepEqual(quiet.reads, [
        'For what do you wish?',
        'For what do you wish? a',
    ]);
});

test('a terminal that goes away at the prompt suspends the wish', async () => {
    // zap.c:6339-6342. win/tty/getline.c:87 raises iflags.term_gone for the
    // byte that reads back as EOF, and makewish() then returns instead of
    // reading the buffer. allmain.c:200 is the only reader of resume_wish and
    // is not ported, so the flag is written and nothing takes it back up yet.
    //
    // No fresh recording can reach this arm: scripts/record-session.mjs sends
    // each replay key as Buffer.from(k, 'utf8'), which turns 0xFF into the two
    // bytes 0xC3 0xBF, so the reference program never sees the byte that reads
    // back as EOF.
    const { state } = wishState(`lam${EOF_BYTE}`);
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
    assert.equal(game.context.resume_wish, 1);
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

// invent.c hold_another_object() is reachable from the wish path, and raises
// UnsupportedObjectOperationError from its drop arm whenever near_capacity()
// passes flags.pickup_burden. A boulder does that on any hero. The class has to
// convert at the command seam like every other one makewish() can reach: left
// out, the throw escapes runSegment() and the scorer discards every screen the
// wish prompt already matched instead of stopping on the last of them.
test('a wish the hero cannot carry stops the segment rather than escaping',
    async () => {
        assert.ok(
            failClosedCommandRefusals()
                .includes(UnsupportedObjectOperationError),
        );

        // End to end: readobjnam() grants a boulder without refusing it, so
        // the drop arm is the first thing that stops this wish. The matrix has
        // no boulder segment, because no fresh recording can pass through a
        // refusal, so this borrows a recorded segment's configuration and
        // types a different wish.
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
        // so the boundary names the drop arm rather than any earlier stop.
        assert.ok(boundaries[0] instanceof UnsupportedHeroCommandBoundaryError);
        // js/objects.js gives BOULDER otyp 475, so the message names the
        // object the wish created and not some earlier one.
        assert.match(
            boundaries[0].message,
            /held object dropped is not available for otyp 475/,
        );
    });

test('an excluded heavy-ball drop refuses before wish state changes',
    async () => {
        const recorded = loadWizardWishRecipe().segments[0];
        const replay = await runSegment({ ...recorded, moves: '.' });
        // Strength and Constitution 3 make the 480-weight ball exceed the
        // default MOD_ENCUMBER pickup limit on this otherwise live hero.
        game.u.acurr.a[A_STR] = 3;
        game.u.acurr.a[A_CON] = 3;
        game.level.flags.has_shop = true;
        const { ux, uy } = game.u;
        const before = {
            blesscnt: game.u.ublesscnt,
            conduct: game.u.uconduct.wishes,
            discovery: [...game.svd.disco],
            encountered: game.objects[HEAVY_IRON_BALL].oc_encountered,
            floor: game.level.objects[ux][uy],
            gw: structuredClone(game.gw),
            inventory: game.invent,
            rng: replay.getRngLog().length,
        };
        for (const ch of 'heavy iron ball\n')
            game.nhDisplay.pushKey(ch.charCodeAt(0));

        await assert.rejects(
            () => rhack(WIZWISH_KEY.charCodeAt(0), game),
            (error) => error instanceof UnsupportedHeroCommandBoundaryError
                && /shop level/u.test(error.message),
        );

        assert.equal(game.u.uconduct.wishes, before.conduct);
        assert.deepEqual(game.svd.disco, before.discovery);
        assert.equal(
            game.objects[HEAVY_IRON_BALL].oc_encountered,
            before.encountered,
        );
        assert.equal(game.invent, before.inventory);
        assert.equal(game.level.objects[ux][uy], before.floor);
        assert.equal(game.u.ublesscnt, before.blesscnt);
        assert.deepEqual(game.gw, before.gw);
        // mksobj() spends rnd(2) while creating the ball. Admission precedes
        // the later rn1(100, 50) blessing timeout draw.
        assert.deepEqual(
            replay.getRngLog().slice(before.rng).map(
                (entry) => entry.replace(/=.*/u, ''),
            ),
            ['rnd(2)'],
        );
        assert.doesNotMatch(topLine(), /Oops!/u);
    });

// invent.c:1261-1264 raises the hold limit to flags.pickup_burden, exactly as
// pickup.c:1757-1758 does for a lift. parseNethackrc() has no arm for that
// option and keeps an unported option's raw text in the field its parsed value
// would occupy, so `prev_encumbr < flags.pickup_burden` compares a number with
// a string, answers false, and silently deletes the max(). The hero would then
// hold an object C makes her drop. Both readers refuse instead: the projection
// prepareHeavyBallDropAdmission() runs first, and hold_another_object()'s own
// read second.
test('an unparsed pickup_burden stops a wished-for object being held',
    async () => {
        const recorded = loadWizardWishRecipe().segments[0];
        // "stressed" is what a real config file writes. js/options.js has no
        // parse arm for the option, so parseNethackrc() leaves that word in
        // flags.pickup_burden -- the field the parsed MOD_ENCUMBER would
        // occupy -- which is the whole reason the guard exists.
        const unparsed = recorded.nethackrc.replace(
            'OPTIONS=', 'OPTIONS=pickup_burden:stressed\nOPTIONS=',
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

        // A dagger is far too light for the burden arithmetic to stop, so
        // only the guard can. prepareHeavyBallDropAdmission() returns early
        // for everything but a single heavy iron ball, so this reaches
        // hold_another_object()'s own read, after zap.c:6402 has already
        // counted the wish.
        let boundaries = await wish(unparsed, 'dagger');
        assert.equal(boundaries.length, 1);
        assert.ok(boundaries[0] instanceof UnsupportedHeroCommandBoundaryError);
        assert.match(boundaries[0].message, /unparsed pickup_burden/u);
        assert.equal(game.u.uconduct.wishes, 1);
        assert.equal(heldTypes().includes(DAGGER), false);

        // A heavy iron ball reaches the projection instead. It runs before
        // doname() records discovery and before the conduct counter moves, so
        // the stop is one step earlier and the counter proves which read
        // raised it.
        boundaries = await wish(unparsed, 'heavy iron ball');
        assert.equal(boundaries.length, 1);
        assert.match(boundaries[0].message, /unparsed pickup_burden/u);
        assert.equal(game.u.uconduct.wishes, 0);
        assert.equal(heldTypes().includes(HEAVY_IRON_BALL), false);

        // The control: the same dagger wish without the option in the config
        // file is held, so the guard and not the wish path is what stopped it.
        boundaries = await wish(recorded.nethackrc, 'dagger');
        assert.deepEqual(boundaries, []);
        // options.c initoptions_init() starts the option at MOD_ENCUMBER,
        // which is what an rc file that never names it leaves behind.
        assert.equal(game.flags.pickup_burden, MOD_ENCUMBER);
        assert.equal(heldTypes().includes(DAGGER), true);
    });

test('ordinary wish-drop refusals convert at the command seam', () => {
    assert.ok(failClosedCommandRefusals().includes(UnsupportedDropError));
});

// zap.c makewish() calls readobjnam(), whose typfnd: tail calls mksobj(). Five
// of the seven container types reach mkobj.c mkbox_cnts() from there, and
// nothing else on the wish path needs an obj.js hook, so before this slice the
// call site passed only the game state. Both halves are asserted: that a wish
// through the running game fills its container, and that the same wish without
// the hooks stops, which is what makes the first half an assertion about the
// call site rather than about mkbox_cnts().
test('makewish() gives readobjnam() the object-generation hooks', async () => {
    // mkobj.c mkbox_cnts():338 spends rn2(n + 1); a stub answering 1 puts one
    // object in the sack, which is the roll that needs populateContainer().
    // The state starts a turn past mkbox_cnts():324's svm.moves <= 1 arm,
    // which would otherwise leave the sack empty and the hook unreached.
    const { state } = wishState('');
    state.moves = 2;
    // requireSimpleWishedObject() refuses every wish an ordinary hero makes;
    // wizcmds.c wiz_wish() is the only caller, so this is what it always sees.
    state.wizard = true;
    // mkobj.c next_ident() reads svc.context.ident, which u_init.c seeds at 1
    // and the game raises per object; 2 is where a started game has it.
    state.context = { ident: 2 };
    const oneItem = {
        rn2: (x) => (x === 2 ? 1 : 0), rnd: () => 1, rn1: (_x, y) => y,
        rne: () => 1,
    };
    assert.throws(
        () => readobjnam('sack', Object.freeze({}), { state, random: oneItem }),
        (error) => error instanceof UnsupportedObjectOperationError
            && /populateContainer/u.test(error.message),
    );

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
