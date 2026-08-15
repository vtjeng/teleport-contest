import assert from 'node:assert/strict';
import test from 'node:test';

import { commandKeyCode } from '../js/command_bindings.js';
import { donull, rhack, set_occupation } from '../js/cmd.js';
import { dosearch } from '../js/detect.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadCountPrefixRecipe } from './run-count-prefix.mjs';

// cmd.c parse():5112-5119 sends the command byte straight to get_count() when
// num_pad is off, so a digit anywhere before the committing byte is what makes
// a segment a count case at all.
const DIGITS = /[0-9]/u;

test('count-prefix matrix contains only source-selected count inputs', () => {
    const recipe = loadCountPrefixRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 11);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.match(segment.moves, DIGITS);
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
        [' 123\b\x7f\x7fs', ' 90\b\bs', ' 12\x1bs', ' 1s0s', ' 9s'],
    );
    assert.deepEqual(
        moves.filter((keys) => keys.includes('.')),
        [' 1.', ' 3.'],
    );
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
