import assert from 'node:assert/strict';
import test from 'node:test';

import { interrupt_multi } from '../js/allmain.js';
import { commandKeyCode } from '../js/command_bindings.js';
import {
    donull,
    rhack,
    set_occupation,
    UnsupportedHeroCommandBoundaryError,
} from '../js/cmd.js';
import { dosearch } from '../js/detect.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ttyNorep } from '../js/tty_message.js';
import { loadCountPrefixRecipe } from './run-count-prefix.mjs';

// cmd.c parse():5110-5120 sends the command byte straight to get_count() when
// num_pad is off, so a digit anywhere before the committing byte is what makes
// such a segment a count case at all. With num_pad on the digits are movement
// keys and the count key is what opens get_count(), so a num_pad segment is a
// count case by its count key instead.
const COUNT_OPENERS = /[0-9]/u;
const NUMBER_PAD_COUNT_OPENERS = /n/u;

test('count-prefix matrix contains only source-selected count inputs', () => {
    const recipe = loadCountPrefixRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 13);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.match(
            segment.moves,
            /number_pad/u.test(segment.nethackrc)
                ? NUMBER_PAD_COUNT_OPENERS
                : COUNT_OPENERS,
        );
    }
    // Distinct hero names keep each segment's recorder lock and save file
    // separate, so one segment stopped at a prompt cannot restore into another.
    const names = recipe.segments.map(
        (segment) => /name:([^,]+)/u.exec(segment.nethackrc)[1],
    );
    assert.equal(new Set(names).size, recipe.segments.length);
});

test('count-prefix matrix covers every get_count arm it claims', () => {
    const moves = loadCountPrefixRecipe().segments.map(
        (segment) => segment.moves,
    );
    const covering = (key) => moves.filter((keys) => keys.includes(key)).length;
    // get_count():5054 accepts two erase characters, '\b' and the source's
    // STANDBY_erase_char, and 5058 accepts Escape. Each needs its own segment,
    // because each takes a different arm out of the collecting loop.
    assert.ok(covering('\b') > 0, 'backspace edits a count');
    assert.ok(covering('\x7f') > 0, 'delete edits a count');
    assert.ok(covering('\x1b') > 0, 'escape cancels a count');
    // The two extcmdlist[] rows carrying occupation text, cmd.c:1846-1847 and
    // :1930-1931, are the rows rhack():3728 spends a count on. Each takes a
    // count that leaves gm.multi at 0 and one that leaves it above 0, so the
    // install boundary is covered from both sides on both rows.
    assert.deepEqual(
        moves.filter((keys) => keys.includes('s')),
        [' 123\b\x7f\x7fs', ' 90\b\bs', ' 12\x1bs', ' 1s0s', ' 9s',
            ' ns', ' n3s'],
    );
    assert.deepEqual(
        moves.filter((keys) => keys.includes('.')),
        [' 1.', ' 3.'],
    );
});

test('count-prefix matrix covers both count outcomes on the num_pad arm', () => {
    // cmd.c parse():5110 is a disjunction: with num_pad off every command byte
    // reaches get_count(), and with it on only the count key does. The second
    // arm needs its own recordings, because a supplied count and an empty one
    // are collected by the same get_count() but arrive at rhack() through a
    // different read.
    const numberPad = loadCountPrefixRecipe().segments.filter(
        (segment) => /number_pad/u.test(segment.nethackrc),
    );
    assert.deepEqual(numberPad.map((segment) => segment.moves),
        [' ns', ' n3s']);
});

// The segments the matrix above recorded against the C reference, reused here
// so that a unit assertion and its differential describe the same game.
const COUNT_PREFIX_SEGMENTS = loadCountPrefixRecipe().segments;

function segmentTyping(moves) {
    const segment = COUNT_PREFIX_SEGMENTS.find(
        (entry) => entry.moves === moves,
    );
    if (!segment) throw new Error(`no count-prefix segment types ${moves}`);
    return segment;
}

// The same game stopped at its first command prompt: the leading space of
// every segment above dismisses the startup message and nothing else.
function segmentBeforeCount(moves) {
    return { ...segmentTyping(moves), moves: ' ' };
}

test('rhack installs the counted row own occupation function and text',
    async () => {
    // cmd.c rhack():3727-3729, `func = tlist->ef_funct; if (tlist->f_text &&
    // !go.occupation && gm.multi) set_occupation(func, tlist->f_text,
    // gm.multi);`. Both values come from the row the key is bound to, so the
    // two rows carrying occupation text have to install different functions
    // and different text.
    for (const [typed, occtxt, funct, multi] of [
        // parse():5142-5144 assigns the count and then decrements it, so '9s'
        // arrives at rhack() with eight repeats owed and '3.' with two.
        ['9s', 'searching', dosearch, 8],
        ['3.', 'waiting', donull, 2],
    ]) {
        await runSegment(segmentBeforeCount(' 9s'));
        for (const ch of typed) game.nhDisplay.pushKey(commandKeyCode(ch));

        await rhack(0, game);

        assert.equal(game.go.occtxt, occtxt, typed);
        assert.equal(game.go.occtime, 0, typed);
        assert.equal(game.timedOccFn, funct, typed);
        // The command itself ran here, through rhack()'s ordinary dispatch,
        // and rhack() spends none of the count doing so: every repeat is still
        // owed to the occupation.
        assert.equal(game.multi, multi, typed);
        assert.equal(game.context.move, 1, typed);
    }
});

test('a count installs the countdown cmd.c timed_occupation() performs',
    async () => {
    // cmd.c set_occupation() (205-217). A nonzero xtime makes
    // timed_occupation() the occupation and files the command's own function
    // in cmd.c's timed_occ_fn, where only timed_occupation() reads it.
    const state = { go: {}, multi: 3 };
    const seen = [];
    const counted = () => { seen.push(state.multi); };
    set_occupation(counted, 'searching', state.multi, state);
    assert.notEqual(state.go.occupation, counted);
    assert.equal(state.timedOccFn, counted);
    assert.equal(state.go.occtxt, 'searching');
    assert.equal(state.go.occtime, 0);

    // cmd.c timed_occupation() (171-178) is `(*timed_occ_fn)(); if (gm.multi
    // > 0) gm.multi--; return gm.multi > 0;`. Three turns spend the three
    // repeats a count of four owed.
    const answers = [];
    for (let turn = 0; turn < 3; ++turn)
        answers.push(await state.go.occupation(state));

    // The command runs before the decrement, so it sees the count it is
    // spending rather than the one left after it.
    assert.deepEqual(seen, [3, 2, 1]);
    // The turn that empties the count answers 0, which is the value
    // allmain.c moveloop_core():502 compares against to clear the occupation;
    // a `>=` there would keep it installed for ever.
    assert.deepEqual(answers, [1, 1, 0]);
    assert.equal(state.multi, 0);
});

test('an occupation that spends the count itself leaves gm.multi at zero',
    async () => {
    // detect.c dosearch0():2048 calls nomul(0) when a search finds a secret
    // door, so the callback can return with the count already spent. C's
    // `if (gm.multi > 0)` guard is what stops the decrement from taking it
    // below zero, where allmain.c moveloop_core():485 would read the hero as
    // helpless and stop running the turn loop's command arm at all.
    const state = { go: {}, multi: 5 };
    set_occupation(() => { state.multi = 0; }, 'searching', state.multi, state);

    assert.equal(await state.go.occupation(state), 0);
    assert.equal(state.multi, 0);
});

test('a counted occupation runs its turns from a single input boundary',
    async () => {
    // The count and the turns it buys, measured against the same command
    // typed bare. cmd.c parse() spends one repeat on the dispatched command
    // and allmain.c moveloop_core():485-509 spends the rest, so a count of N
    // is N turns and one input boundary, not N boundaries and not N + 1 turns.
    for (const [bare, counted, turns] of [
        [' s', ' 9s', 9],
        [' 1.', ' 3.', 3],
    ]) {
        await runSegment(segmentBeforeCount(counted));
        // The startup message dismissal is the game's first turn; every turn
        // after it belongs to the command under test.
        const started = game.moves;

        await runSegment({ ...segmentTyping(counted), moves: bare });
        const bareMoves = game.moves;
        const bareDispatches = game._commandDispatchCount;

        const replay = await runSegment(segmentTyping(counted));

        assert.equal(bareMoves, started + 1, bare);
        assert.equal(game.moves, started + turns, counted);
        // The occupation is over: nothing is owed and nothing is installed.
        assert.equal(game.multi, 0, counted);
        assert.equal(game.go.occupation, null, counted);
        // One dispatch for the dismissal and one for the counted command,
        // exactly as the bare command needs, because the repeats reach
        // moveloop_core()'s occupation arm instead of rhack().
        assert.equal(game._commandDispatchCount, bareDispatches, counted);
        // One screen per key read plus the prompt the segment ends on. A
        // repeat that read a key would add one screen per turn.
        assert.equal(
            replay.getScreens().length,
            segmentTyping(counted).moves.length + 1,
            counted,
        );
    }
});

test('an empty number-pad count leaves the command identical to a bare one',
    async () => {
    // cmd.c get_count():5063-5067 commits whatever cnt has reached when a
    // non-digit arrives, which for a command byte typed straight after the
    // count key is 0; parse():5142 then leaves gm.multi at 0. So `ns` is the
    // bare search command. A count key treated as an unbound byte would reach
    // rhack()'s bad-command path instead and spend no turn, and one defaulted
    // to 1 would leave gl.last_command_count at 1.
    const runs = [];
    for (const typed of [' ', ' s', ' ns']) {
        const replay = await runSegment({
            ...segmentTyping(' ns'),
            moves: typed,
        });
        runs.push({
            typed,
            rng: replay.getRngLog(),
            // The last capture is the prompt the command returned to, so it
            // carries everything the command drew.
            screen: replay.getScreens().at(-1),
            cursor: replay.getCursors().at(-1),
            moves: game.moves,
            multi: game.multi,
            commandCount: game.commandCount,
            lastCommandCount: game.lastCommandCount,
            dispatches: game._commandDispatchCount,
        });
    }
    const [dismissal, bare, emptyCount] = runs;
    // The search really ran: one more turn than the segment that only
    // dismissed the startup line.
    assert.equal(bare.moves, dismissal.moves + 1);
    assert.equal(emptyCount.moves, bare.moves, 'ns spends the search turn');
    // The count key opened get_count() rather than becoming a command of its
    // own. Treated as an unbound byte it would reach rhack()'s bad-command
    // path, which costs a dispatch and no turn, so the turn count alone
    // cannot tell the two apart.
    assert.equal(emptyCount.dispatches, bare.dispatches, 'ns dispatch count');
    assert.deepEqual(emptyCount.rng, bare.rng, 'ns randomness');
    assert.deepEqual(emptyCount.screen, bare.screen, 'ns screen');
    assert.deepEqual(emptyCount.cursor, bare.cursor, 'ns cursor');
    assert.equal(emptyCount.commandCount, 0);
    assert.equal(emptyCount.lastCommandCount, 0);
    assert.equal(emptyCount.multi, 0);
});

test('a counted row refuses while another occupation is already running',
    async () => {
    // cmd.c rhack():3728 installs only when `tlist->f_text && !go.occupation
    // && gm.multi` all hold. A row that carries occupation text and arrives
    // while one is running fails the middle term and falls to
    // moveloop_core():515-531's repeat arm, which is not ported, so this port
    // refuses it -- and the boundary has to name the term the branch actually
    // tests, since the searching row does carry occupation text.
    await runSegment(segmentBeforeCount(' 9s'));
    // Any installed occupation fails rhack()'s `!go.occupation` term; this
    // one answers "not finished" so nothing about it can end the count.
    game.go.occupation = () => 1;
    for (const ch of '9s') game.nhDisplay.pushKey(commandKeyCode(ch));

    await assert.rejects(
        rhack(0, game),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === commandKeyCode('s')
            && /a row this port will not repeat/u.test(error.message),
    );
});

test('a counted occupation leaves the state interrupt_multi() acts on',
    async () => {
    // allmain.c interrupt_multi() (975-983) acts on `gm.multi > 0 &&
    // !svc.context.travel && !svc.context.run`, and regen_hp():678 and
    // regen_pw():617 reach it whenever the hero tops up the last hit point or
    // power point. The counted occupation is the first thing this port
    // installs that satisfies that guard, so the four assertions below are the
    // reachability claim itself: they fail the day a counted command stops
    // leaving gm.multi above 0, or starts setting one of the two exemptions.
    await runSegment(segmentBeforeCount(' 9s'));
    for (const ch of '9s') game.nhDisplay.pushKey(commandKeyCode(ch));
    await rhack(0, game);
    assert.ok(game.multi > 0, 'the count leaves repeats owed');
    assert.ok(!game.context.run, 'a counted command is not a run');
    assert.ok(!game.context.travel, 'a counted command is not a travel');
    assert.equal(game.flags.verbose, true, 'verbose is on by default');

    // hack.c nomul(0) writes gm.multi and leaves go.occupation alone, so the
    // interruption spends the count without uninstalling the activity:
    // allmain.c moveloop_core():485 finds the occupation still there on the
    // following turn, runs it once more, and clears it when cmd.c
    // timed_occupation() finds no repeat left to spend. That last search is
    // part of what the fresh matrix in scripts/run-full-health-interrupt.mjs
    // compares against C.
    const occupation = game.go.occupation;
    await interrupt_multi('You are in full health.', game, {
        norepMessage: ttyNorep,
    });
    assert.equal(game.multi, 0);
    assert.strictEqual(game.go.occupation, occupation);

    // The line reaches the top line on a turn no key bounds. cmd.c parse()
    // cleared the physical row when it read the count's committing byte, so
    // this message occupies it alone: it neither shares the row with an
    // earlier line nor spends a key on a --More-- prompt, and the input queue
    // the segment still owns is untouched.
    assert.equal(game._pending_message, 'You are in full health.');
    assert.equal(game._ttyToplines, 'You are in full health.');
    assert.equal(game.nhDisplay.topMessage, 'You are in full health.');
    assert.equal(game.nhDisplay.terminal._inputQueue.length, 0);
});
