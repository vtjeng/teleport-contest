import assert from 'node:assert/strict';
import test from 'node:test';

import {
    confdir,
    dxdy_moveok,
    getdir,
    key2txt,
    movecmd,
    redraw_cmd,
    y_n,
    yn_function,
} from '../js/cmd.js';
import {
    CONFUSION,
    DIR_ERR,
    ECMD_CANCEL,
    ECMD_OK,
    MV_ANY,
    MV_RUN,
    MV_RUSH,
    MV_WALK,
    QBUFSZ,
    STUNNED,
    quitchars,
} from '../js/const.js';
import { PM_GRID_BUG } from '../js/monsters.js';
import { TOPLINE_NEED_MORE } from '../js/tty_message.js';
import { doride } from '../js/steed.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { u_maybe_impaired } from '../js/hack.js';
import {
    ESCAPE_KEY,
    RIDE_COMMAND,
    SPACE_KEY,
    STRANGE_KEY,
    loadRideDirectionRecipe,
} from './run-ride-direction.mjs';

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// Locate a segment by the keys it types, so reordering the matrix cannot
// silently point a test at a different case.
function segmentFor(moves, predicate = () => true) {
    const found = loadRideDirectionRecipe().segments.find(
        (segment) => segment.moves === `.${moves}` && predicate(segment),
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
    return found;
}

// The prompt-only segment, borrowed whenever a case needs a level to stand on
// but types keys no recording can hold because C mounts where the port stops.
function promptSegment() {
    return segmentFor(RIDE_COMMAND, ({ nethackrc }) => (
        !nethackrc.includes('cmdassist') && !nethackrc.includes('BIND=')
    ));
}

async function rideWith(segment, answer, options = {}) {
    let boundary = null;
    const replay = await runSegment(
        { ...segment, moves: `.${RIDE_COMMAND}${answer}`, ...options },
        { onBoundary: (error) => { boundary = error; } },
    );
    return { boundary, replay };
}

// A state carrying only what the pure cmd.c direction helpers read.
function directionState() {
    return { u: { dx: 0, dy: 0, dz: 0, umonnum: 0 } };
}

test('the ride-direction matrix contains only source-selected inputs', () => {
    const recipe = loadRideDirectionRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 11);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // Every segment opens the prompt through the extended-command row,
        // after one wait that puts the hero on a settled level.
        assert.ok(segment.moves.startsWith(`.${RIDE_COMMAND}`));
    }
    // No segment answers the prompt with a direction: this matrix exists for
    // getdir() itself, and the two matrices that follow it --
    // scripts/run-mount-steed.mjs and scripts/run-ride-dismount.mjs -- own
    // what mount_steed() does with an answered one.
    const answers = recipe.segments.map(
        (segment) => segment.moves.slice(`.${RIDE_COMMAND}`.length, -1) || null,
    );
    assert.deepEqual(
        [...new Set(answers)].sort(),
        [null, '.', '?', '_', ESCAPE_KEY, SPACE_KEY, STRANGE_KEY, 's'].sort(),
    );
});

test('the direction prompt paints the query and parks the cursor after it',
    async () => {
    // topl.c:423 formats "%s " from the query, and show_topl() writes it from
    // column zero, so the cursor lands one column past the trailing space:
    // "In what direction? " is 19 characters.
    await runSegment({ ...promptSegment(), moves: `.${RIDE_COMMAND}` });
    assert.equal(topLine(), 'In what direction?');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [19, 0],
    );
});

test('each quitchars[] cancel leaves the prompt row clear and spends nothing',
    async () => {
    // getdir() answers 0 for a quitchars[] key without printing anything, and
    // doride() turns that into ECMD_CANCEL, which rhack() resets rather than
    // charging a turn.
    //
    // Only two of the four quitchars[] members are usable: the recorder's
    // terminal maps a carriage return onto a line feed, and a line feed is
    // C('j'), which reset_commands() binds to do_rush_south.
    for (const key of [ESCAPE_KEY, SPACE_KEY]) {
        assert.ok(quitchars.includes(key), `quitchars[] holds ${key}`);
        const segment = segmentFor(`${RIDE_COMMAND}${key}.`);
        const before = await runSegment({ ...segment, moves: '.' });
        const start = { moves: game.moves, rng: before.getRngLog().length };

        const { boundary, replay } = await rideWith(segment, key);
        // The cancel has to run the segment out rather than stop in it, so
        // that the assertions below observe a cleared row and an unspent turn
        // rather than the state a refusal would have frozen.
        assert.equal(boundary, null, JSON.stringify(key));
        assert.equal(
            replay.getScreens().length,
            `.${RIDE_COMMAND}${key}`.length + 1,
            JSON.stringify(key),
        );
        assert.equal(topLine(), '', `${JSON.stringify(key)} clears the row`);
        assert.equal(game.moves, start.moves);
        assert.equal(replay.getRngLog().length, start.rng);
        assert.equal(game.context.move, 0);
        assert.equal(game.multi, 0);
    }
});

test('an accepted direction hands mount_steed() the square it names',
    async () => {
    // movecmd() sets u.dx/u.dy from the key's movement handler, doride() finds
    // isok() true for every one of these, and mount_steed() reads the square.
    // Each pair is the key and the [u.dx, u.dy] cmd.c's xdir[]/ydir[] give the
    // direction reset_commands() binds it to.
    //
    // '\n' is here because it is C('j'): a line feed answers the prompt with
    // do_rush_south rather than cancelling, even though quitchars[] lists it.
    //
    // Nothing stands beside this hero, so every direction lands on
    // mount_steed()'s `!mtmp` guard (steed.c:249-255), which prints and returns
    // FALSE before the impairment roll. That is the shortest proof the roll
    // sits behind the guards: the whole command spends no randomness.
    for (const [key, dx, dy] of [
        ['l', 1, 0], ['h', -1, 0], ['j', 0, 1], ['k', 0, -1],
        ['y', -1, -1], ['b', -1, 1],
        ['L', 1, 0], ['\n', 0, 1],
    ]) {
        const before = await runSegment({
            ...promptSegment(), moves: `.${RIDE_COMMAND}`,
        });
        const spentBefore = before.getRngLog().length;
        const { boundary, replay } = await rideWith(promptSegment(), key);
        assert.equal(boundary, null, JSON.stringify(key));
        assert.deepEqual(
            [game.u.dx, game.u.dy, game.u.dz], [dx, dy, 0], JSON.stringify(key),
        );
        assert.equal(topLine(), 'I see nobody there.', JSON.stringify(key));
        assert.equal(
            replay.getRngLog().length, spentBefore, JSON.stringify(key),
        );
    }
});

test("the self keys zero the direction and mount the hero's own square",
    async () => {
    // getdir()'s first arm answers before movecmd() runs, so u.dx, u.dy and
    // u.dz all stay zero and doride() tests isok() at the hero's own square.
    // NHKF_GETDIR_SELF2 is 's' whether or not num_pad is set: cmd.c compares
    // both spkeys unconditionally. m_at() finds no monster on the hero's own
    // square, so mount_steed() answers the same way it does for an empty one.
    for (const key of ['.', 's']) {
        const { boundary } = await rideWith(promptSegment(), key);
        assert.equal(boundary, null, key);
        assert.equal(topLine(), 'I see nobody there.', key);
        assert.deepEqual([game.u.dx, game.u.dy, game.u.dz], [0, 0, 0], key);
    }
});

test("'>' and '<' answer the prompt with u.dz alone", async () => {
    // move_funcs[]'s last two rows hold dodown and doup, so movecmd() returns
    // 0 for them while setting u.dz from zdir[]. getdir()'s invalid-direction
    // arm is gated on `!is_mov && !u.dz`, so a nonzero u.dz still returns 1 --
    // and `if (!u.dz) confdir(FALSE)` skips the impairment reroll.
    for (const [key, dz] of [['>', 1], ['<', -1]]) {
        const { boundary } = await rideWith(promptSegment(), key);
        assert.equal(boundary, null, key);
        assert.equal(topLine(), 'I see nobody there.', key);
        assert.deepEqual([game.u.dx, game.u.dy, game.u.dz], [0, 0, dz], key);
    }
});

test('an invalid direction key opens help_dir() while cmdassist is set',
    async () => {
    // help_dir()'s pline-only path sits inside an `#if 0` block, so with
    // cmdassist -- which optlist.h:233 defaults On -- it always builds an
    // NHW_TEXT window listing the direction keys.
    const { boundary, replay } = await rideWith(promptSegment(), STRANGE_KEY);
    assert.equal(boundary?.name, 'UnsupportedHeroCommandBoundaryError');
    assert.match(boundary.message, /help_dir\(\)/u);
    // The prompt screen was painted and the answering key consumed, so the
    // segment keeps every screen up to and including the open prompt.
    assert.equal(replay.getScreens().length, `.${RIDE_COMMAND}`.length + 1);

    // '?' is gc.Cmd.spkeys[NHKF_GETDIR_HELP], and `help_requested ||
    // iflags.cmdassist` reaches help_dir() through either operand, so turning
    // cmdassist off leaves '?' asking for the window anyway.
    const noAssist = segmentFor(`${RIDE_COMMAND}${STRANGE_KEY}.`);
    const asked = await rideWith(noAssist, '?');
    assert.match(asked.boundary?.message ?? '', /help_dir\(\)/u);
});

test('without cmdassist an invalid direction key prints the strange-direction '
    + 'message', async () => {
    // did_help stays FALSE only when neither operand of `help_requested ||
    // iflags.cmdassist` holds, which is the one route to this pline().
    const segment = segmentFor(`${RIDE_COMMAND}${STRANGE_KEY}.`);
    const before = await runSegment({ ...segment, moves: '.' });
    const start = { moves: game.moves, rng: before.getRngLog().length };

    const after = await runSegment({
        ...segment, moves: `.${RIDE_COMMAND}${STRANGE_KEY}`,
    });
    assert.equal(topLine(), 'What a strange direction!');
    // getdir() answered 0, so doride() returned ECMD_CANCEL and no turn ran.
    assert.equal(game.moves, start.moves);
    assert.equal(after.getRngLog().length, start.rng);
    assert.equal(game.context.move, 0);
});

test('the mouse and redraw keys stop the direction prompt', async () => {
    // NHKF_GETDIR_MOUSE runs getpos(), and redraw_cmd() sends '^R' back to the
    // retry label through docrt_flags(); neither has an owner in this port.
    for (const [key, pattern] of [
        ['_', /simulated mouse click/u],
        ['\x12', /repaints the screen/u],
    ]) {
        const { boundary } = await rideWith(promptSegment(), key);
        assert.equal(
            boundary?.name, 'UnsupportedHeroCommandBoundaryError',
            JSON.stringify(key),
        );
        assert.match(boundary.message, pattern, JSON.stringify(key));
    }
});

test('moving a gc.Cmd.spkeys[] getdir key moves the arm that reads it',
    async () => {
    // Each matrix segment binds one special key onto 'a' and then presses the
    // key that used to hold it, which now has to reach the ordinary
    // invalid-direction arm. Re-running them here checks the port reads the
    // table rather than comparing against '.', 's', '?' and '_' directly.
    for (const [spkey, displaced] of [
        ['getdir.self', '.'], ['getdir.self2', 's'],
        ['getdir.help', '?'], ['getdir.mouse', '_'],
    ]) {
        const segment = segmentFor(
            `${RIDE_COMMAND}${displaced}.`,
            ({ nethackrc }) => nethackrc.includes(`BIND=a:${spkey}`),
        );
        await runSegment({
            ...segment, moves: `.${RIDE_COMMAND}${displaced}`,
        });
        assert.equal(topLine(), 'What a strange direction!', spkey);

        // And the key the bind moved the arm onto takes it instead. The two
        // self keys run through to mount_steed()'s `!mtmp` guard; the other
        // two stop in an arm this port has not reached.
        const { boundary } = await rideWith(segment, 'a');
        if (spkey === 'getdir.self' || spkey === 'getdir.self2') {
            assert.equal(boundary, null, spkey);
            assert.equal(topLine(), 'I see nobody there.', spkey);
        } else {
            assert.equal(
                boundary?.name, 'UnsupportedHeroCommandBoundaryError', spkey,
            );
            assert.match(
                boundary.message,
                spkey === 'getdir.help' ? /help_dir\(\)/u
                    : /simulated mouse click/u,
                spkey,
            );
        }
    }
});

test('movecmd resolves a key through move_funcs[] and reports u.dz', () => {
    const state = directionState();
    // cmd.c:3463-3471 binds gc.Cmd.dirchars, its upper case and its control
    // form to the walk, run and rush handler of the same direction, and
    // movecmd(MV_ANY) accepts all three columns.
    for (const key of ['l', 'L', '\x0C']) {
        assert.equal(movecmd(key.charCodeAt(0), MV_ANY, state), 1, key);
        assert.deepEqual([state.u.dx, state.u.dy, state.u.dz], [1, 0, 0], key);
    }
    // A named mode accepts only its own column.
    assert.equal(movecmd('l'.charCodeAt(0), MV_WALK, state), 1);
    assert.equal(movecmd('l'.charCodeAt(0), MV_RUN, state), 0);
    assert.equal(movecmd('L'.charCodeAt(0), MV_RUN, state), 1);
    assert.equal(movecmd('\x0C'.charCodeAt(0), MV_RUSH, state), 1);

    // The down and up rows return 0 because `return !u.dz`, while still
    // writing all three fields; DIR_ERR leaves u.dx and u.dy alone.
    state.u.dx = 7;
    state.u.dy = 7;
    assert.equal(movecmd('>'.charCodeAt(0), MV_ANY, state), 0);
    assert.deepEqual([state.u.dx, state.u.dy, state.u.dz], [0, 0, 1]);
    assert.equal(movecmd('<'.charCodeAt(0), MV_ANY, state), 0);
    assert.deepEqual([state.u.dx, state.u.dy, state.u.dz], [0, 0, -1]);

    state.u.dx = 7;
    state.u.dy = 7;
    // 'a' is bound to #apply and 'q' to #quaff, so neither is in move_funcs[];
    // 0x01 is bound to nothing at all.
    for (const key of ['a'.charCodeAt(0), 'q'.charCodeAt(0), 0x01]) {
        assert.equal(movecmd(key, MV_ANY, state), 0, String(key));
        assert.deepEqual([state.u.dx, state.u.dy, state.u.dz], [7, 7, 0]);
    }
    assert.equal(DIR_ERR, -1);
});

test('dxdy_moveok zeroes a grid bug diagonal instead of refusing it', () => {
    const state = directionState();
    // hack.h NODIAG() names only PM_GRID_BUG, so an ordinary hero keeps every
    // direction, diagonals included.
    state.u.dx = 1;
    state.u.dy = -1;
    assert.equal(dxdy_moveok(state), 1);
    assert.deepEqual([state.u.dx, state.u.dy], [1, -1]);

    state.u.umonnum = PM_GRID_BUG;
    assert.equal(dxdy_moveok(state), 0);
    // The diagonal is cleared, which is what makes getdir() answer 0 with
    // "You can't orient yourself that direction."
    assert.deepEqual([state.u.dx, state.u.dy], [0, 0]);

    // A cardinal direction survives in either form.
    state.u.dx = 0;
    state.u.dy = 1;
    assert.equal(dxdy_moveok(state), 1);
    assert.deepEqual([state.u.dx, state.u.dy], [0, 1]);
});

test('redraw_cmd recognises only the key bound to doredraw', () => {
    const state = directionState();
    // cmd.c binds #redraw to '^R'.
    assert.equal(redraw_cmd(0x12, state), true);
    // commands_init() adds '^L' as an alias for #redraw, but reset_commands()
    // then takes the byte away again: C('l') is the rush-east key, and its
    // cmdbind_remove()/bind_key_fn() pair runs after commands_init(). Nothing
    // else in the direction set collides with '^R'.
    assert.equal(redraw_cmd(0x0C, state), false);
    assert.equal(redraw_cmd('l'.charCodeAt(0), state), false);
    assert.equal(redraw_cmd(0x1B, state), false);
});

test('key2txt names the four keys that have no printable form', () => {
    // cmd.c key2txt()'s four literals, then visctrl() for everything else.
    assert.equal(key2txt(0x20), '<space>');
    assert.equal(key2txt(0x1B), '<esc>');
    assert.equal(key2txt(0x0A), '<enter>');
    assert.equal(key2txt(0x7F), '<del>');
    assert.equal(key2txt('l'.charCodeAt(0)), 'l');
    assert.equal(key2txt(0x12), '^R');
    // '\r' has no literal of its own and falls through to visctrl().
    assert.equal(key2txt(0x0D), '^M');
});

test('u_maybe_impaired draws rn2(5) only for a confused hero', async () => {
    const replay = await runSegment({
        ...promptSegment(), moves: `.${RIDE_COMMAND}`,
    });
    const drawn = () => replay.getRngLog().length;

    // hack.c:2420 is `Stunned || (Confusion && !rn2(5))`, so an unimpaired
    // hero short-circuits before the draw.
    let before = drawn();
    assert.equal(u_maybe_impaired(game), false);
    assert.equal(drawn(), before);

    // Stunned answers TRUE from the first operand, still without a draw.
    game.u.uprops[STUNNED].intrinsic = 1;
    before = drawn();
    assert.equal(u_maybe_impaired(game), true);
    assert.equal(drawn(), before);
    game.u.uprops[STUNNED].intrinsic = 0;

    // Confusion reaches the draw, whichever way the roll falls: `!rn2(5)`
    // decides the result but the call is spent either way.
    game.u.uprops[CONFUSION].intrinsic = 1;
    before = drawn();
    u_maybe_impaired(game);
    assert.equal(drawn(), before + 1);
    game.u.uprops[CONFUSION].intrinsic = 0;

    // confdir() stops on the impairment rather than rerolling the direction.
    // Stunned is the deterministic half; the confused half turns on rn2(5).
    game.u.uprops[STUNNED].intrinsic = 1;
    assert.throws(
        () => confdir(false, game),
        /an impaired hero rerolls the direction/u,
    );
    game.u.uprops[STUNNED].intrinsic = 0;
    // force_impairment reaches the same stop without consulting the hero.
    assert.throws(
        () => confdir(true, game),
        /an impaired hero rerolls the direction/u,
    );
    // The unimpaired hero passes straight through, which is what every
    // accepted direction above relies on.
    assert.equal(confdir(false, game), undefined);
});

test('yn_function stops on a query too long for QBUFSZ', async () => {
    await runSegment({ ...promptSegment(), moves: `.${RIDE_COMMAND}` });
    // cmd.c:5484 truncates at `strlen(query) >= QBUFSZ` after paniclog().
    await assert.rejects(
        yn_function('x'.repeat(QBUFSZ), null, '\0', false, game),
        /needs paniclog\(\)/u,
    );
    // One character short, the guard has to let the prompt open; the replay's
    // input is spent, so the read behind it is what fails instead.
    await assert.rejects(
        yn_function('x'.repeat(QBUFSZ - 1), null, '\0', false, game),
        (error) => !/needs paniclog\(\)/u.test(error.message),
    );
});

test('a restricted response set stops before the prompt paints', async () => {
    await runSegment({ ...promptSegment(), moves: `.${RIDE_COMMAND}` });
    const row = topLine();
    // Every yn_function() caller other than getdir() passes a response string,
    // which reaches tty_yn_function()'s do/while loop; none of it is ported.
    await assert.rejects(
        yn_function('Force the mount to succeed?', 'yn', 'n', true, game),
        /restricted response set/u,
    );
    // doride()'s debug-mode question goes through y_n(), so it reaches the
    // same guard rather than a hand-written wizard test.
    await assert.rejects(
        y_n('Force the mount to succeed?', game),
        /restricted response set/u,
    );
    // The guard precedes show_topl(), so neither call painted a query.
    assert.equal(topLine(), row);
    // getdir() itself always passes a null response, so this refusal is not on
    // its path.
    assert.equal(typeof getdir, 'function');
});

// Drive doride() once against the game a segment left behind, answering the
// direction prompt from a stub instead of the spent replay queue. Two of
// doride()'s conditions have no reachable game state: no generated level puts
// a hero where isok() can fail, and debug mode needs a recorder sysconf that a
// fresh checkout does not have.
async function rideOnce(answer, mutate = () => {}) {
    await runSegment({ ...promptSegment(), moves: `.${RIDE_COMMAND}` });
    const display = game.nhDisplay;
    const readKey = display.readKey;
    display.readKey = async () => answer.charCodeAt(0);
    mutate(game);
    try {
        return { result: await doride(game), error: null };
    } catch (error) {
        return { result: null, error };
    } finally {
        display.readKey = readKey;
    }
}

test('a direction that leaves the map cancels instead of mounting',
    async () => {
    // doride()'s `isok(u.ux + u.dx, u.uy + u.dy)`. isok() answers TRUE for
    // every square a generated level can put a hero on: over the 400 D:1
    // levels of seeds 7710000-7710399 no Knight starts within two squares of
    // the map border, so the guard needs a hero placed on column 1 by hand.
    const off = await rideOnce('h', (state) => { state.u.ux = 1; });
    assert.equal(off.error, null);
    assert.equal(off.result, ECMD_CANCEL);

    // The same key one column further in reaches mount_steed(), which is what
    // makes the test above about isok() rather than about 'h'. mount_steed()
    // finds no monster there and answers FALSE, so doride() returns ECMD_OK
    // rather than the ECMD_CANCEL the guard above produces.
    const on = await rideOnce('h', (state) => { state.u.ux = 2; });
    assert.equal(on.error, null);
    assert.equal(on.result, ECMD_OK);
});

test('debug mode asks whether to force the mount', async () => {
    // doride()'s `wizard && y_n("Force the mount to succeed?")`. y_n() passes
    // ynchars, and tty_yn_function() covers only the unrestricted arm, so the
    // question stops there rather than at mount_steed(). No recording can
    // reach it: ROADMAP.md records that a playmode:debug recording needs a
    // sysconf naming the running user, which is uncommitted.
    const forced = await rideOnce('l', (state) => { state.wizard = true; });
    assert.match(forced.error?.message ?? '', /restricted response set/u);
    game.wizard = false;

    // Without debug mode the same keystroke skips the question entirely and
    // runs straight into mount_steed().
    const plain = await rideOnce('l');
    assert.equal(plain.error, null);
    assert.equal(plain.result, ECMD_OK);
});

test('yn_function returns the key it read, and stops if asked to repeat it',
    async () => {
    await runSegment({ ...promptSegment(), moves: `.${RIDE_COMMAND}` });
    const display = game.nhDisplay;
    const readKey = display.readKey;
    display.readKey = async () => 'l'.charCodeAt(0);
    try {
        // getdir()'s own call: a null response set, addcmdq FALSE. The result
        // is the raw keystroke, which is what movecmd() then resolves.
        assert.equal(
            await yn_function('In what direction?', null, '\0', false, game),
            'l'.charCodeAt(0),
        );
        // hack.h's y_n() and its siblings pass addcmdq TRUE, which reaches
        // cmdq_add_key(CQ_REPEAT, res). No command queue is ported, and every
        // one of those callers also passes a response set, so this guard is
        // second in line for all of them.
        await assert.rejects(
            yn_function('In what direction?', null, '\0', true, game),
            /cmdq_add_key\(CQ_REPEAT\)/u,
        );
    } finally {
        display.readKey = readKey;
    }
});

test('a pending --More-- is dismissed before the direction prompt paints',
    async () => {
    // topl.c:389-390. tty_yn_function() calls more() when the top line is
    // waiting on one, so the answering keystroke is not spent dismissing it.
    // No ported caller can arrive in that state -- tty_get_ext_cmd() ends with
    // clear_nhwindow(WIN_MESSAGE), and doextcmd() is getdir()'s only route --
    // so the pending message is placed here by hand.
    await runSegment({ ...promptSegment(), moves: `.${RIDE_COMMAND}` });
    const display = game.nhDisplay;
    const readKey = display.readKey;
    let keys = [];
    display.readKey = async () => keys.shift().charCodeAt(0);
    const ask = async (stopped) => {
        game._pending_message = 'You hear a door open.';
        display.toplin = TOPLINE_NEED_MORE;
        game._ttyMessageStopped = stopped;
        return yn_function('In what direction?', null, '\0', false, game);
    };
    try {
        // The space dismisses the --More--, so 'l' is what answers the query.
        keys = [' ', 'l'];
        assert.equal(await ask(false), 'l'.charCodeAt(0));
        assert.equal(keys.length, 0);

        // WIN_STOP is the other half of the same condition: after Escape at an
        // earlier --More--, topl.c suppresses this one, so the first keystroke
        // answers the query instead of dismissing anything.
        keys = ['l', ' '];
        assert.equal(await ask(true), 'l'.charCodeAt(0));
        assert.equal(keys.length, 1);
    } finally {
        display.readKey = readKey;
        game._pending_message = '';
    }
});

