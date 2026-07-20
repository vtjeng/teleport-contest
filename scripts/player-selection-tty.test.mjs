import assert from 'node:assert/strict';
import test from 'node:test';

import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import {
    answer_initial_player_selection,
    continue_player_selection,
    prepare_player_selection,
    RS_GENDER,
    RS_RACE,
    RS_ROLE,
} from '../js/player_selection.js';
import {
    buildPlayerSelectionMenuSpec,
    ttyPlayerSelection,
} from '../js/player_selection_tty.js';
import {
    ROLE_NONE,
    str2align,
    str2gend,
    str2race,
    str2role,
} from '../js/roles.js';
import { ATR_NONE, NO_COLOR } from '../js/terminal.js';
import { renderTtyMenu } from '../js/tty_menu.js';
import { renderTtyStartupBanner } from '../js/tty_startup.js';

function selectionState(keys = '') {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    game.plname = 'Pick';
    game.flags = {
        initrole: ROLE_NONE,
        initrace: ROLE_NONE,
        initgend: ROLE_NONE,
        initalign: ROLE_NONE,
        randomall: false,
    };
    game.iflags = { menu_overlay: true };
    game.program_state = {};
    renderTtyStartupBanner(game);
    for (const key of keys) game.nhDisplay.pushKey(key.charCodeAt(0));
    return game;
}

function noRandom(bound) {
    assert.fail(`unexpected random(${bound})`);
}

function scriptedRandom(results) {
    const remaining = [...results];
    const bounds = [];
    const random = (bound) => {
        bounds.push(bound);
        assert.ok(remaining.length, `unexpected random(${bound})`);
        const result = remaining.shift();
        assert.ok(result >= 0 && result < bound);
        return result;
    };
    random.bounds = bounds;
    random.done = () => assert.deepEqual(remaining, []);
    return random;
}

function visibleRows(state) {
    return state.nhDisplay.grid.map(
        (row) => row.map((cell) => cell.ch).join('').trimEnd(),
    );
}

function captureBoundaries(state) {
    const captures = [];
    state._preNhgetchHook = () => captures.push({
        rows: visibleRows(state),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
    });
    return captures;
}

test('the unconstrained role menu fits the pinned 24-row tty exactly', () => {
    const state = selectionState();
    let context = prepare_player_selection(state, noRandom);
    context = answer_initial_player_selection(
        state, context, 'n', noRandom,
    );
    assert.equal(context.aspect, RS_ROLE);

    const spec = buildPlayerSelectionMenuSpec(state, context, noRandom);
    assert.equal(spec.title, 'Pick a role or profession');
    assert.deepEqual(spec.lines, [
        '<role> <race> <gender> <alignment>',
        '',
        'a - an Archeologist',
        'b - a Barbarian',
        'c - a Caveman/Cavewoman',
        'h - a Healer',
        'k - a Knight',
        'm - a Monk',
        'p - a Priest/Priestess',
        'r - a Rogue',
        'R - a Ranger',
        's - a Samurai',
        't - a Tourist',
        'v - a Valkyrie',
        'w - a Wizard',
        '* * Random',
        '/ - Pick race first',
        '" - Pick gender first',
        '[ - Pick alignment first',
        '~ - Set role/race/&c filtering',
        'q - Quit',
    ]);
});

test('manual sole candidates precede menu-time rigid PRNG calls', () => {
    const state = selectionState();
    let context = prepare_player_selection(state, noRandom);
    context = answer_initial_player_selection(
        state, context, 'n', noRandom,
    );
    buildPlayerSelectionMenuSpec(state, context, noRandom);
    context = continue_player_selection(
        state,
        context,
        { kind: 'value', value: str2role('Samurai') },
        noRandom,
    );

    assert.equal(context.aspect, RS_GENDER);
    assert.equal(state.flags.initrace, str2race('human'));
    assert.equal(state.flags.initalign, ROLE_NONE);

    // Opening Samurai's gender menu rigid-selects its sole lawful alignment;
    // the sole human race was assigned manually and did not consume rn2(1).
    const random = scriptedRandom([0]);
    const spec = buildPlayerSelectionMenuSpec(state, context, random);
    assert.deepEqual(random.bounds, [1]);
    assert.equal(state.flags.initalign, str2align('lawful'));
    assert.equal(spec.lines[0], 'Samurai human <gender> lawful');
    random.done();
});

test('race-first jumps return to role selection with the race preserved', () => {
    const state = selectionState();
    let context = prepare_player_selection(state, noRandom);
    context = answer_initial_player_selection(
        state, context, 'n', noRandom,
    );
    context = continue_player_selection(
        state, context, { kind: 'jump', aspect: RS_RACE }, noRandom,
    );
    assert.equal(context.aspect, RS_RACE);

    context = continue_player_selection(
        state,
        context,
        { kind: 'value', value: str2race('elf') },
        noRandom,
    );
    assert.equal(context.aspect, RS_ROLE);
    assert.equal(state.flags.initrace, str2race('elf'));
});

test('filter results follow source restart rules for each facet', () => {
    const state = selectionState();
    let context = prepare_player_selection(state, noRandom);
    context = answer_initial_player_selection(
        state, context, 'n', noRandom,
    );

    // Role always restarts at role, even when reset_role_filtering() was
    // cancelled or committed no selected filters.
    context = continue_player_selection(
        state, context, { kind: 'filter', selected: false }, noRandom,
    );
    assert.equal(context.aspect, RS_ROLE);

    // A filter opened from race repeats race when nothing remains selected.
    context = continue_player_selection(
        state, context, { kind: 'jump', aspect: RS_RACE }, noRandom,
    );
    context = continue_player_selection(
        state, context, { kind: 'filter', selected: false }, noRandom,
    );
    assert.equal(context.aspect, RS_RACE);

    // Any selected filter resets every facet and restarts at role.
    context = continue_player_selection(
        state, context, { kind: 'filter', selected: true }, noRandom,
    );
    assert.equal(context.aspect, RS_ROLE);
});

test('tty manual selection reaches confirmation through every facet', async () => {
    // n chooses menus; w/h/m/n choose Wizard, human, male, neutral; y starts.
    const state = selectionState('nwhmny');
    const captures = captureBoundaries(state);
    assert.equal(await ttyPlayerSelection(state, noRandom), true);

    assert.deepEqual(
        [state.flags.initrole, state.flags.initrace,
            state.flags.initgend, state.flags.initalign],
        [str2role('Wizard'), str2race('human'),
            str2gend('male'), str2align('neutral')],
    );
    assert.equal(captures.length, 6);
    assert.equal(
        captures[0].rows[0],
        "Shall I pick character's race, role, gender and alignment for you? [ynaq]",
    );
    assert.deepEqual(captures[0].cursor, [74, 0]);
    assert.equal(captures[1].rows[0], ' Pick a role or profession');
    assert.equal(captures[1].rows[23], ' (end)');
    assert.deepEqual(captures[1].cursor, [7, 23]);
    assert.equal(captures[2].rows[0].slice(41), 'Pick a race or species');
    assert.equal(captures[3].rows[0].slice(41), 'Pick a gender or sex');
    assert.equal(
        captures[4].rows[0].slice(41),
        'Pick an alignment or creed',
    );
    assert.equal(captures[5].rows[0].slice(41), 'Is this ok? [ynq]');
    assert.equal(
        captures[5].rows[2].slice(41),
        'Pick the neutral male human Wizard',
    );
});

test('uppercase facet accelerators select their unique PICK_ONE entries', async () => {
    // Uppercase race/gender/alignment group accelerators each identify one
    // entry, so PICK_ONE accepts them just like the visible lowercase key.
    const state = selectionState('nwHMNq');
    assert.equal(await ttyPlayerSelection(state, noRandom), false);
    assert.deepEqual(
        [state.flags.initrole, state.flags.initrace,
            state.flags.initgend, state.flags.initalign],
        [str2role('Wizard'), str2race('human'),
            str2gend('male'), str2align('neutral')],
    );
});

test('automatic tty selection preserves source draw order and banner overlay', async () => {
    const state = selectionState('yy');
    const captures = captureBoundaries(state);
    // Pick Ranger from 13 roles, human from four races, female from two
    // genders, and neutral from its two compatible alignments.
    const random = scriptedRandom([8, 0, 1, 0]);
    assert.equal(await ttyPlayerSelection(state, random), true);

    assert.deepEqual(random.bounds, [13, 4, 2, 2]);
    assert.equal(captures.length, 2);
    assert.equal(captures[1].rows[0].slice(0, 41).trim(), '');
    assert.equal(captures[1].rows[0].slice(41), 'Is this ok? [ynq]');
    assert.equal(
        captures[1].rows[2].slice(41),
        'Pick the neutral female human Ranger',
    );
    assert.equal(
        captures[1].rows[4].slice(0, 30).trimEnd(),
        'NetHack, Copyright 1985-2026',
    );
    assert.deepEqual(captures[1].cursor, [47, 7]);
    random.done();
});

test('confirmation rename preserves facets and tty base-window position', async () => {
    const state = selectionState('yaBob\ny');
    state.plname = 'Alice';
    state.iflags.renameallowed = true;
    // Initial tty_askname at row 12 leaves BASE_WINDOW on the following row;
    // the confirmation menu's docorner dismissal later supersedes this.
    state._ttyBaseCursorRow = 13;
    const captures = captureBoundaries(state);
    // Reuse the Ranger tuple so this case isolates rename display/state from
    // character-selection randomness.
    const random = scriptedRandom([8, 0, 1, 0]);

    assert.equal(await ttyPlayerSelection(state, random), true);
    assert.equal(state.plname, 'Bob');
    assert.deepEqual(
        [state.flags.initrole, state.flags.initrace,
            state.flags.initgend, state.flags.initalign],
        [str2role('Ranger'), str2race('human'),
            str2gend('female'), str2align('neutral')],
    );
    assert.equal(captures.length, 7);
    assert.deepEqual(captures[2].cursor, [13, 10]);
    assert.equal(captures[2].rows[10], 'Who are you?');
    assert.equal(
        captures[2].rows[6],
        '         Version 5.0.0 Unix, built May',
    );
    assert.equal(
        captures[6].rows[2].slice(41),
        'Bob the neutral female human Ranger',
    );
    random.done();
});

test('incompatible automatic fallback pauses at the source More boundary', async () => {
    // y requests automatic selection; q is invalid at --More--, Space
    // dismisses it, and the final q quits from confirmation.
    const state = selectionState('yq q');
    state.plname = 'Odd';
    state.flags.initrace = str2race('elf');
    state.flags.initgend = str2gend('male');
    state.flags.initalign = str2align('lawful');
    const captures = captureBoundaries(state);
    // No role accepts this fixed tuple. The fallback picks Healer, then its
    // sole compatible race and alignment; the latter rn2(1) calls matter.
    const random = scriptedRandom([3, 0, 0]);

    assert.equal(await ttyPlayerSelection(state, random), false);
    assert.deepEqual(random.bounds, [13, 1, 1]);
    assert.equal(captures.length, 4);
    assert.equal(captures[1].rows[0], 'Incompatible role!--More--');
    assert.deepEqual(captures[1].cursor, [26, 0]);
    assert.equal(captures[2].rows[0], captures[1].rows[0]);
    assert.deepEqual(captures[2].cursor, captures[1].cursor);
    assert.equal(captures[3].rows[0].slice(41), 'Is this ok? [ynq]');
    random.done();
});

test('tty menu overlay and heading options control selection rendering', () => {
    const state = selectionState();
    state.flags.initrole = str2role('Wizard');
    state.iflags.menu_overlay = false;
    state.iflags.menu_headings = { attr: ATR_NONE, color: NO_COLOR };
    let context = prepare_player_selection(state, noRandom);
    context = answer_initial_player_selection(
        state, context, 'n', noRandom,
    );

    const spec = buildPlayerSelectionMenuSpec(state, context, noRandom);
    assert.equal(spec.overlay, false);
    assert.equal(spec.titleAttr, ATR_NONE);
    const rendered = renderTtyMenu(state, spec);
    assert.equal(rendered.layout.fullScreen, true);
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [7, 15],
    );
    assert.equal(state.nhDisplay.grid[0][1].attr, ATR_NONE);
});
