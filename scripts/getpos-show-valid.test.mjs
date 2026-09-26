import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { getpos } from '../js/getpos.js';
import { runSegment } from '../js/jsmain.js';

const C_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/getpos.c', import.meta.url), 'utf8',
);
const APPLY_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/apply.c', import.meta.url), 'utf8',
);
const PLINE_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/pline.c', import.meta.url), 'utf8',
);
const DISPLAY_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/display.c', import.meta.url), 'utf8',
);
const WINDOWS_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/windows.c', import.meta.url), 'utf8',
);

const PROBE = Object.freeze({
    seed: 613907,
    datetime: '20390127140622',
    nethackrc: [
        'OPTIONS=name:ValidProbe,role:Valkyrie,race:human,gender:female,align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=playmode:debug,pettype:none',
        '',
    ].join('\n'),
    recorderIsDst: true,
});

test('getpos SHOWVALID always resumes targeting without a callback', async () => {
    const replay = await runSegment({
        ...PROBE,
        // Dismiss startup, enter wizard teleport, dismiss its More and the
        // farlook tip, then leave SHOWVALID as the next getpos key.
        moves: ' \u0014  $',
    });

    assert.equal(replay.getInputExhausted(), true);
    assert.equal(game.getpos_hilitefunc, undefined);
    // The next getpos loop iteration redraws the source goal prompt after
    // SHOWVALID; '$' must not be interpreted as a terrain feature symbol.
    assert.equal(game._ttyToplines, 'Move cursor to the desired position:');
    assert.equal(game.nhDisplay.inputQueueLength, 0);
});

test('getpos SHOWVALID retains the optional highlight callback', async () => {
    await runSegment({
        ...PROBE,
        moves: ' \u0014  $.',
    });
    game.iflags.bgcolors = false;
    const calls = [];
    game.getpos_hilitefunc = async (enabled) => { calls.push(enabled); };
    const coordinate = { x: game.u.ux, y: game.u.uy };
    game.nhDisplay.pushKey('$'.charCodeAt(0));
    game.nhDisplay.pushKey(0x1B);

    assert.equal(
        await getpos(coordinate, false, 'desired location', game),
        -1,
    );
    assert.deepEqual(calls, [true, false]);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
});

test('getpos consumes the caller-installed selection during its initial prompt flush', async () => {
    await runSegment({
        ...PROBE,
        moves: ' \u0014  $.',
    });
    game.iflags.bgcolors = false;
    game.flags.verbose = true;
    const hero = { x: game.u.ux, y: game.u.uy };
    game.getpos_getvalid = async (x, y) => x === hero.x + 2 && y === hero.y;
    game.getpos_hilitefunc = async () => {};

    const jumpStart = APPLY_SOURCE.indexOf(
        '\njump(int magic) /* 0=Physical, otherwise skill level */',
    );
    const jumpBody = APPLY_SOURCE.slice(jumpStart, jumpStart + 12000);
    const installSelection = jumpBody.indexOf('getpos_sethilite(');
    const enterGetpos = jumpBody.indexOf('getpos(&cc, TRUE');
    const getposStart = C_SOURCE.indexOf(
        'getpos(coord *ccp, boolean force, const char *goal)',
    );
    const getposBody = C_SOURCE.slice(getposStart, getposStart + 24000);
    const handleTip = getposBody.indexOf('handle_tip(TIP_GETPOS)');
    const verboseMessage = getposBody.indexOf('if (flags.verbose)', handleTip);
    const initialCursor = getposBody.indexOf('curs(WIN_MAP, cx, cy)', verboseMessage);
    const initialFlush = getposBody.indexOf('flush_screen(0)', initialCursor);
    const setHiliteStart = C_SOURCE.indexOf('\ngetpos_sethilite(\n');
    const setHiliteEnd = C_SOURCE.indexOf('\n}', setHiliteStart);
    const setHiliteBody = C_SOURCE.slice(setHiliteStart, setHiliteEnd);
    assert.match(
        PLINE_SOURCE,
        /flush_screen\(\(gp\.pline_flags & NO_CURS_ON_U\) \? 0 : 1\)/u,
    );
    assert.ok(installSelection >= 0 && installSelection < enterGetpos);
    assert.match(setHiliteBody, /selection_force_newsyms\(sel\)/u);
    assert.ok(handleTip >= 0 && handleTip < verboseMessage);
    assert.ok(verboseMessage < initialCursor && initialCursor < initialFlush);

    let cursorAtFirstInput;
    game._preNhgetchHook = async () => {
        cursorAtFirstInput = [
            game.nhDisplay.cursorCol,
            game.nhDisplay.cursorRow,
            game.nhDisplay.cursorVisible,
        ];
    };
    game.nhDisplay.pushKey(0x1B);
    try {
        assert.equal(
            await getpos({ x: hero.x, y: hero.y }, true, 'desired position', game),
            -1,
        );
    } finally {
        delete game._preNhgetchHook;
        delete game.getpos_getvalid;
        delete game.getpos_hilitefunc;
    }

    assert.deepEqual(cursorAtFirstInput, [hero.x - 1, hero.y + 1, 1]);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
});

test('getpos preserves the final dirty-glyph cursor when no prompt pline follows', async () => {
    await runSegment({
        ...PROBE,
        moves: ' \u0014  $.',
    });
    game.iflags.bgcolors = false;
    game.flags.verbose = false;
    game.flags.tips = false;
    const hero = { x: game.u.ux, y: game.u.uy };
    const lastDirtyGlyph = { x: hero.x + 2, y: hero.y };
    game.getpos_getvalid = async (x, y) => (
        x === lastDirtyGlyph.x && y === lastDirtyGlyph.y
    );
    game.getpos_hilitefunc = async () => {};

    const flushStart = DISPLAY_SOURCE.indexOf('flush_screen(int cursor_on_u)');
    const flushBody = DISPLAY_SOURCE.slice(flushStart, flushStart + 2000);
    const cursStart = WINDOWS_SOURCE.indexOf('hup_curs(winid window UNUSED');
    const cursBody = WINDOWS_SOURCE.slice(cursStart, cursStart + 180);
    assert.match(flushBody, /for \(y = 0; y < ROWNO; y\+\+\)[\s\S]*?for \(; x <= gg\.gbuf_stop\[y\];/u);
    assert.match(cursBody, /\{\s*return;\s*\}/u);

    let cursorAtFirstInput;
    game._preNhgetchHook = async () => {
        cursorAtFirstInput = [
            game.nhDisplay.cursorCol,
            game.nhDisplay.cursorRow,
            game.nhDisplay.cursorVisible,
        ];
    };
    game.nhDisplay.pushKey(0x1B);
    try {
        assert.equal(
            await getpos({ x: hero.x, y: hero.y }, true, 'desired position', game),
            -1,
        );
    } finally {
        delete game._preNhgetchHook;
        delete game.getpos_getvalid;
        delete game.getpos_hilitefunc;
    }

    assert.deepEqual(cursorAtFirstInput, [
        lastDirtyGlyph.x,
        lastDirtyGlyph.y + 1,
        1,
    ]);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
});

test('getpos SHOWVALID branch matches the C continuation contract', () => {
    const marker = '} else if (c == gc.Cmd.spkeys[NHKF_GETPOS_SHOWVALID])';
    const start = C_SOURCE.indexOf(marker);
    assert.notEqual(start, -1);
    const end = C_SOURCE.indexOf('} else if', start + marker.length);
    const branch = C_SOURCE.slice(start, end);
    const callback = branch.indexOf('if (getpos_hilitefunc)');
    const showGoal = branch.indexOf('show_goal_msg = TRUE;');
    const continueInput = branch.indexOf('goto nxtc;');
    assert.notEqual(callback, -1);
    assert.ok(callback < showGoal);
    assert.ok(showGoal < continueInput);
});
