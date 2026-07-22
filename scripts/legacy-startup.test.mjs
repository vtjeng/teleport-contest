import assert from 'node:assert/strict';
import test from 'node:test';

import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import {
    legacyIntroductionLines,
    ttyLegacyIntroduction,
    ttyLegacyLayout,
} from '../js/legacy_startup.js';
import { parseNethackrc } from '../js/options.js';
import { initRng } from '../js/rng.js';
import { roles, str2role } from '../js/roles.js';
import { ATR_NONE, NO_COLOR } from '../js/terminal.js';

function legacyState({
    keys = '',
    role = 'Healer',
    alignment = 0,
    female = false,
    pauper = false,
    menuOverlay = true,
} = {}) {
    resetGame();
    initRng(0x1e6ac7);
    game.nhDisplay = new GameDisplay(null);
    game.flags = { legacy: true, female };
    game.iflags = { menu_overlay: menuOverlay };
    game.urole = { ...roles[str2role(role)] };
    game.u = {
        ulevel: 1,
        ualign: { type: alignment },
        ualignbase: [alignment, alignment],
        uroleplay: { pauper },
    };
    for (const ch of keys)
        game.nhDisplay.pushKey(ch.charCodeAt(0));
    return game;
}

function displayFrame(state) {
    return {
        grid: state.nhDisplay.grid.map(
            (row) => row.map((cell) => ({ ...cell })),
        ),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
    };
}

function rowText(state, row) {
    return state.nhDisplay.grid[row]
        .map((cell) => cell.ch).join('').trimEnd();
}

test('legacy substitutions use the original deity, title, and rank', () => {
    // Neutral Cavemen worship _Ishtar; the leading underscore encodes a
    // goddess and is not part of the displayed name.
    const state = legacyState({
        role: 'Caveman', alignment: 0, female: true,
    });
    const lines = legacyIntroductionLines(state);

    assert.equal(lines[0], 'It is written in the Book of Ishtar:');
    assert.equal(
        lines[9],
        'Your goddess Ishtar seeks to possess the Amulet, and with it',
    );
    assert.equal(
        lines[12],
        'You, a newly trained Troglodyte, have been heralded',
    );

    // questpgr.c uses A_ORIGINAL (slot 1), not a converted A_CURRENT.
    state.u.ualignbase = [1, 0];
    assert.equal(
        legacyIntroductionLines(state)[0],
        'It is written in the Book of Ishtar:',
    );
});

test('pauper legacy text uses the source untrained final paragraph', () => {
    const lines = legacyIntroductionLines(legacyState({ pauper: true }));
    assert.equal(
        lines[12],
        'You, an untrained Rhizotomist, have been unable to adequately',
    );
    assert.equal(
        lines[13],
        'prepare to be the instrument of Hermes.  Nevertheless, you',
    );
});

test('tty legacy page ignores invalid keys and restores its corner', async () => {
    const state = legacyState({ keys: 'x ' });
    // Distinct map and status cells prove that corner dismissal repairs the
    // whole obscured region instead of merely clearing the story text.
    state.nhDisplay.setCell(0, 4, '@', NO_COLOR, 0);
    state.nhDisplay.setCell(79, 23, 'Z', NO_COLOR, 0);
    state.nhDisplay.setCursor(17, 6);
    const before = displayFrame(state);
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push(displayFrame(state));

    assert.equal(await ttyLegacyIntroduction(state), true);

    assert.equal(boundaries.length, 2);
    assert.deepEqual(boundaries[1], boundaries[0]);
    assert.equal(rowText(state, 0).includes('Book of Hermes'), false);
    assert.deepEqual(displayFrame(state), before);

    const lines = legacyIntroductionLines(state);
    const layout = ttyLegacyLayout(state.nhDisplay, lines);
    assert.equal(
        boundaries[0].grid[0]
            .slice(layout.textColumn, layout.textColumn + lines[0].length)
            .map((cell) => cell.ch).join(''),
        lines[0],
    );
    assert.deepEqual(boundaries[0].cursor, [
        layout.promptColumn + '--More--'.length,
        layout.promptRow,
    ]);
});

test('legacy pager loads a fresh nhlib alignment shuffle before input', async () => {
    const state = legacyState({ keys: ' ' });
    const bounds = [];
    let boundsAtInput;
    state._preNhgetchHook = () => { boundsAtInput = [...bounds]; };

    assert.equal(
        await ttyLegacyIntroduction(state, (bound) => {
            bounds.push(bound);
            return bound - 1;
        }),
        true,
    );

    assert.deepEqual(bounds, [3, 2]);
    assert.deepEqual(boundsAtInput, [3, 2]);
});

test('recorder capture leaves standout dmore attributes unset', async () => {
    const state = legacyState({ keys: ' ' });
    state.flags.standout = parseNethackrc('OPTIONS=standout').flags.standout;
    const layout = ttyLegacyLayout(
        state.nhDisplay,
        legacyIntroductionLines(state),
    );
    let promptAttrs;
    state._preNhgetchHook = () => {
        promptAttrs = state.nhDisplay.grid[layout.promptRow]
            .slice(
                layout.promptColumn,
                layout.promptColumn + '--More--'.length,
            )
            .map((cell) => cell.attr);
    };

    assert.equal(await ttyLegacyIntroduction(state), true);
    // Recorder patch 006 copies dmore() glyphs into its NOMUX shadow without
    // propagating standoutbeg(), so the judged marker payload has no attr.
    assert.deepEqual(
        promptAttrs,
        Array('--More--'.length).fill(ATR_NONE),
    );
});

test('full-screen legacy dismissal redraws the prior map and status', async () => {
    const state = legacyState({ keys: '\n', menuOverlay: false });
    state.nhDisplay.setCell(12, 5, '@', NO_COLOR, 0);
    state.nhDisplay.setCell(30, 22, 'S', NO_COLOR, 0);
    state.nhDisplay.setCursor(12, 5);
    const before = displayFrame(state);
    let boundary;
    state._preNhgetchHook = () => { boundary = displayFrame(state); };

    assert.equal(await ttyLegacyIntroduction(state), true);

    assert.notEqual(boundary.grid[5][12].ch, '@');
    assert.equal(boundary.grid[22][30].ch, ' ');
    assert.equal(
        boundary.grid[0].slice(0, 16).map((cell) => cell.ch).join(''),
        'It is written in',
    );
    assert.deepEqual(displayFrame(state), before);
});

test('disabled legacy has no display or input boundary', async () => {
    const state = legacyState();
    state.flags.legacy = false;
    let boundaries = 0;
    state._preNhgetchHook = () => { ++boundaries; };

    assert.equal(await ttyLegacyIntroduction(state), false);
    assert.equal(boundaries, 0);
});
