import assert from 'node:assert/strict';
import test from 'node:test';

import { UnsupportedHeroCommandBoundaryError } from '../js/cmd.js';
import { TIP_GETPOS } from '../js/const.js';
import { GETPOS_TIP_LINES, handle_tip } from '../js/hack.js';
import { UnsupportedGetposError } from '../js/getpos.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { self_lookat, whatisMenuItems } from '../js/pager.js';
import {
    NEXT_COMMAND,
    ESCAPE_KEY,
    MORE_KEYS,
    TRADITIONAL_PICK,
    WHATIS_COMMAND,
    WHATIS_MAP_CHOICE,
    WHATIS_MOVES,
    WHATIS_SETUP,
    loadWhatisMapHeroRecipe,
} from './run-whatis-map-getpos-hero.mjs';

test('the default whatis menu preserves pager.c order and accelerators', () => {
    const state = {
        // pager.c do_look() shows all 11 rows only for the ordinary sighted,
        // non-hallucinating, unswallowed default-lootabc branch.
        flags: { lootabc: false },
        u: { uswallow: false },
    };
    assert.deepEqual(
        whatisMenuItems(state).map(({ value, selector, label }) => ({
            value, selector, label,
        })),
        [
            { value: '/', selector: '/', label: 'something on the map' },
            { value: 'i', selector: 'i', label: "something you're carrying" },
            { value: '?', selector: '?', label: 'something else (by symbol or name)' },
            { value: 'm', selector: 'm', label: 'nearby monsters' },
            { value: 'M', selector: 'M', label: 'all monsters shown on map' },
            { value: 'o', selector: 'o', label: 'nearby objects' },
            { value: 'O', selector: 'O', label: 'all objects shown on map' },
            { value: 't', selector: 't', label: 'nearby traps' },
            { value: 'T', selector: 'T', label: 'all seen or remembered traps' },
            { value: 'e', selector: 'e', label: 'nearby engravings' },
            { value: 'E', selector: 'E', label: 'all seen or remembered engravings' },
        ],
    );
});

test('self_lookat names the ordinary human Wizard from C state', () => {
    const state = {
        // These values select self_lookat()'s unpolymorphed, unmounted,
        // untrapped branch for the male human Wizard named in the assertion.
        flags: { female: false },
        plname: 'merlin',
        // Equal current and base forms make Upolyd false.
        u: { umonnum: 343, umonster: 343 },
        urace: { adj: 'human' },
        mons: {
            // monsters.h PM_WIZARD has male, female, and neutral names.
            343: { pmnames: ['wizard', 'wizard', 'wizard'] },
        },
    };
    assert.equal(self_lookat(state), 'human wizard called merlin');
});

test('the getpos tip is shown once and records TIP_GETPOS', async () => {
    const state = {
        flags: { tips: true },
        context: { tips: 0 },
    };
    const shown = [];
    const first = await handle_tip(TIP_GETPOS, state, {
        textWindow: async (lines) => shown.push(lines.map(({ text }) => text)),
    });
    const second = await handle_tip(TIP_GETPOS, state, {
        textWindow: async () => assert.fail('a recorded tip must not repeat'),
    });

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(state.context.tips, 1 << TIP_GETPOS);
    assert.deepEqual(shown, [GETPOS_TIP_LINES.map((text) => text)]);
});

test('ordinary hero farlook returns to command mode without taking time',
    async () => {
        const segment = loadWhatisMapHeroRecipe().segments[0];
        await runSegment({
            ...segment,
            // The baseline clears the welcome message and spends only the
            // same final wait used to cross the post-whatis boundary.
            moves: WHATIS_SETUP + NEXT_COMMAND,
        });
        const baselineMoves = game.moves;

        const replay = await runSegment(segment);
        assert.equal(game.moves, baselineMoves);
        assert.equal(game.context.tips, 1 << TIP_GETPOS);
        assert.equal(game.flags.verbose, true);
        assert.equal(game.context.pendingCommand, undefined);
        assert.deepEqual(
            { x: game.gg.getposx, y: game.gg.getposy },
            { x: 0, y: 0 },
        );
        assert.equal(replay.getRngLog().length > 0, true);
    });

test('ordinary hero farlook renders the source-derived description',
    async () => {
    const segment = loadWhatisMapHeroRecipe().segments[0];
    await runSegment({
        ...segment,
        moves: WHATIS_SETUP + WHATIS_COMMAND + WHATIS_MAP_CHOICE
            + MORE_KEYS + TRADITIONAL_PICK,
    });
    assert.equal(
        game._ttyToplines,
        '@        a human or elf (human wizard called Farley)',
    );
});

test('excluded cursor movement ends the replay on its supported prefix',
    async () => {
        const segment = loadWhatisMapHeroRecipe().segments[0];
        let boundary;
        const replay = await runSegment({
            ...segment,
            // Replace the repeated-picker Escape and following wait with the
            // first excluded cursor-movement key. The scorer must retain all
            // output this slice produced before that key.
            moves: WHATIS_MOVES.replace(`${ESCAPE_KEY}${NEXT_COMMAND}`, 'h'),
        }, { onBoundary: (error) => { boundary = error; } });

        assert.equal(boundary instanceof UnsupportedGetposError, true);
        // The fresh C case for seed 42044 reaches this first unsupported `h`
        // after ten complete screen/cursor snapshots. Its 2,630 draws are the
        // startup prefix; pager.c/getpos.c consume no randomness.
        assert.equal(replay.getScreens().length, 10);
        assert.equal(replay.getCursors().length, 10);
        assert.equal(replay.getRngLog().length, 2630);
    });

test('unsupported whatis menu choices retain the drawn command prefix',
    async () => {
        const segment = loadWhatisMapHeroRecipe().segments[0];
        let boundary;
        const replay = await runSegment({
            ...segment,
            // `i` is the first deferred do_look() menu arm. The ordinary
            // welcome dismissal and `/` command reach it without spending a
            // turn or consuming randomness.
            moves: `${WHATIS_SETUP}/i`,
        }, { onBoundary: (error) => { boundary = error; } });

        assert.equal(
            boundary instanceof UnsupportedHeroCommandBoundaryError,
            true,
        );
        assert.equal(replay.getScreens().length > 1, true);
    });
