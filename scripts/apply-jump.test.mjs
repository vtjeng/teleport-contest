// Source-pinned pure predicates from apply.c check_jump() and
// get_valid_jump_position(). The expected terrain outcomes come directly from
// apply.c:1862-1883 and 1959-1964; no recorded session is needed for these
// functions because they only inspect their arguments and map state.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    D_CLOSED,
    D_ISOPEN,
    DOOR,
    IN_SIGHT,
    JUMPING,
    ROOM,
    STONE,
} from '../js/const.js';
import {
    check_jump,
    get_valid_jump_position,
} from '../js/apply.js';
import { GameMap } from '../js/game.js';

function makeState() {
    const level = new GameMap();
    const viz_array = Array.from(
        { length: 21 },
        () => Uint32Array.from({ length: 80 }, () => IN_SIGHT),
    );
    for (let x = 1; x < 80; ++x) {
        for (let y = 0; y < 21; ++y)
            level.at(x, y).typ = ROOM;
    }
    return {
        level,
        viz_array,
        u: {
            ux: 10,
            uy: 10,
            uprops: { [JUMPING]: { intrinsic: 0, extrinsic: 0 } },
        },
        gj: { jumping_is_magic: 0 },
        youmonst: { data: { mflags2: 0 } },
    };
}

test('check_jump rejects solid walls and closed doors', () => {
    const state = makeState();
    state.level.at(11, 10).typ = STONE;
    assert.equal(check_jump(0, 11, 10, state), false);

    state.level.at(11, 10).typ = DOOR;
    state.level.at(11, 10).doormask = D_CLOSED;
    assert.equal(check_jump(0, 11, 10, state), false);
});

test('get_valid_jump_position keeps the Knight distance and accessibility rules', async () => {
    const state = makeState();
    assert.equal(await get_valid_jump_position(12, 11, state), true);
    state.level.at(12, 11).typ = STONE;
    assert.equal(await get_valid_jump_position(12, 11, state), false);

    state.level.at(11, 10).typ = DOOR;
    state.level.at(11, 10).doormask = D_ISOPEN;
    state.level.at(11, 10).horizontal = true;
    assert.equal(await get_valid_jump_position(11, 10, state), false);
});

test('trapped jump crossing HUNGRY uses canonical hunger operations', async () => {
    const { runSegment } = await import('../js/jsmain.js');
    const gstate = await import('../js/gstate.js');
    const { dojump } = await import('../js/apply.js');
    const { FROMOUTSIDE, HUNGRY, NOT_HUNGRY, TIP_GETPOS, TT_PIT } = await import('../js/const.js');
    // Fixed independent startup; no pet or monster movement is needed by jump.
    await runSegment({ seed: 15840211, datetime: '20521018093000',
        nethackrc: 'OPTIONS=name:JumpHunger,role:Barbarian,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen,!acoustics', moves: '' });
    const { game } = gstate;
    const { clearTtyMessageWindow } = await import('../js/tty_message.js');
    clearTtyMessageWindow(game);
    game.u.uprops[JUMPING].intrinsic = FROMOUTSIDE;
    game.u.uprops[JUMPING].extrinsic = 1; // Avoid Knight's intrinsic-only distance rule.
    game.u.uhunger = 151; // Any source rnd(10) crosses the <=150 HUNGRY bound.
    game.u.uhs = NOT_HUNGRY;
    game.u.utrap = 3; // Positive trapped duration; type selects the source pit arm.
    game.u.utraptype = TT_PIT;
    game.context.tips = (game.context.tips ?? 0) | (1 << TIP_GETPOS); // Tip already viewed.
    game.nhDisplay.pushKey('.'.charCodeAt(0)); // Select current square after freeing from pit.
    game.nhDisplay.pushKey(32); // Allow a source More prompt between jump and hunger output.
    await dojump(game);
    assert.equal(game.u.uhs, HUNGRY);
    assert.ok(game.u.uhunger >= 141 && game.u.uhunger <= 150, 'exact source rnd(10) cost');
    assert.equal(game.u.utrap, 0);
});

test('jump forwards the supplied hunger callbacks and random source at the trapped caller', async () => {
    const { runSegment } = await import('../js/jsmain.js');
    const gstate = await import('../js/gstate.js');
    const { jump } = await import('../js/apply.js');
    const { HUNGRY, WEAK, TIP_GETPOS, TT_PIT } = await import('../js/const.js');
    const { clearTtyMessageWindow } = await import('../js/tty_message.js');
    await runSegment({ seed: 15840224, datetime: '20521018130000',
        nethackrc: 'OPTIONS=name:JumpCallbacks,role:Barbarian,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen,!acoustics', moves: '' });
    const { game } = gstate;
    clearTtyMessageWindow(game);
    game.u.uhunger = 51; // Any positive rnd(10) crosses WEAK; magic bypasses physical hunger guard.
    game.u.uhs = HUNGRY;
    game.u.utrap = 3;
    game.u.utraptype = TT_PIT;
    game.context.tips = (game.context.tips ?? 0) | (1 << TIP_GETPOS);
    game.nhDisplay.pushKey(46); // Source current-square target after leaving pit.
    const events = [];
    await jump(1, game, {
        random: { rnd: bound => { events.push(['rnd', bound]); return 1; } },
        message: async text => events.push(['message', text]),
        endRunning: s => events.push(['run', s === game]),
        statusRefresh: s => events.push(['bot', s === game]),
    });
    assert.equal(game.u.uhunger, 50);
    assert.equal(game.u.uhs, WEAK);
    assert.deepEqual(events, [['rnd', 10], ['message', 'You are beginning to feel weak.'], ['run', true], ['bot', true]]);
});

test('one-cell jump consumes a flat mutable range and emits no delay frame', async () => {
    const { runSegment } = await import('../js/jsmain.js');
    const gstate = await import('../js/gstate.js');
    const { jump } = await import('../js/apply.js');
    const { ROOM, TIP_GETPOS } = await import('../js/const.js');
    const { clearTtyMessageWindow } = await import('../js/tty_message.js');
    // Independent starting map; this unit fixture supplies one legal floor cell.
    await runSegment({ seed: 18541041, datetime: '20490318134536',
        nethackrc: 'OPTIONS=name:JumpRange,role:Wizard,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen,!acoustics,!tips', moves: '' });
    const { game } = gstate;
    clearTtyMessageWindow(game);
    const x = game.u.ux, y = game.u.uy;
    game.level.at(x + 1, y).typ = ROOM;
    game.viz_array[y][x + 1] |= IN_SIGHT;
    game.context.tips = (game.context.tips ?? 0) | (1 << TIP_GETPOS);
    game.nhDisplay.pushKey('l'.charCodeAt(0));
    game.nhDisplay.pushKey('.'.charCodeAt(0));
    let frames = 0;
    game._animationFrameHook = async () => { ++frames; };
    const draws = [];
    // apply.c2161 consumes one rnd(25) after the one-cell range becomes zero.
    await jump(1, game, { random: { rnd: n => { draws.push(n); return 7; } } });
    assert.deepEqual([game.u.ux, game.u.uy], [x + 1, y]);
    assert.deepEqual(draws, [25]);
    // dothrow.c971 delays only when the decremented integer range is nonzero.
    assert.equal(frames, 0);
});
