// Source-pinned tests for cmd.c readchar_core(), readchar_poskey(),
// yn_function_menu(), dosuspend_core(), dosh_core(), and dummyfunction().

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    dosh_core,
    dosuspend_core,
    dummyfunction,
    readchar,
    readchar_poskey,
    yn_function,
} from '../js/cmd.js';
import { ECMD_CANCEL, ECMD_OK } from '../js/const.js';
import { getnow } from '../js/calendar.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

function inputState(keys = [], iflags = {}) {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    state.iflags = { ...iflags };
    state.program_state = { input_state: 'command' };
    state.u = { ux: 10, uy: 10 };
    for (const key of keys) state.nhDisplay.pushKey(key);
    return state;
}

const initializedSegment = {
    seed: 424242,
    datetime: '20320405060708',
    nethackrc: 'OPTIONS=name:CmdInputMenu,role:Wizard,race:human,gender:male,align:neutral\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen\n'
        + 'OPTIONS=pettype:none,!acoustics,!autopickup,playmode:debug\n',
    moves: '#herecmdmenu\u001b',
};

async function initializedGame() {
    // This independent debug segment reaches a settled level and dismisses
    // the existing #herecmdmenu entry point before focused prompts run.
    await runSegment({ ...initializedSegment });
    return game;
}

test('readchar_core gives the queue and Alt-meta branches source order', async () => {
    const state = inputState([0x1B, 'x'.charCodeAt(0)], { altmeta: true });
    // cmd.c:5221-5226 reads the C queue before the do-again buffer and the
    // window port; the second call therefore consumes the physical key.
    state.readchar_queue = ['q'.charCodeAt(0)];
    assert.equal(await readchar(state), 'q'.charCodeAt(0));
    // cmd.c:5249-5259 combines ESC plus x into Meta-x when input_state is not
    // other; 0x80 is the C eighth-bit mask used by that branch.
    state.program_state.input_state = 'command';
    assert.equal(await readchar(state), 0xF8);
    assert.equal(state.program_state.input_state, 'other');
});

test('readchar_poskey copies the source window-port outputs before reset', async () => {
    const state = inputState([], {});
    state.poskey = () => ({
        // The ASCII byte is the ordinary keyboard result for this test; the
        // other values pin nh_poskey()'s three C out parameters.
        key: 'k'.charCodeAt(0), x: 23, y: 6, mod: 2,
    });
    const x = { value: 10 };
    const y = { value: 10 };
    const mod = { value: 0 };
    assert.equal(await readchar_poskey(x, y, mod, state), 'k'.charCodeAt(0));
    assert.deepEqual({ x: x.value, y: y.value, mod: mod.value }, {
        // These coordinates and modifier identify one synthetic click event;
        // they are independent of the development recordings.
        x: 23, y: 6, mod: 2,
    });
    assert.equal(state.program_state.input_state, 'other');
});

test('yn_function_menu covers each response family and C defaults', async () => {
    const cases = [
        // decl.c:113-118 defines the five response sets used by cmd.c.
        ['yn', 'y', 'n', 'y'],
        ['ynq', 'q', 'n', 'q'],
        ['ynaq', 'a', 'y', 'a'],
        ['rl', 'l', '\0', 'l'],
        ['hsq', 's', 'q', 's'],
    ];
    for (const [resp, key, def, expected] of cases) {
        const state = await initializedGame();
        state.iflags.query_menu = true;
        state.nhDisplay.pushKey(key.charCodeAt(0));
        const result = await yn_function(
            'Choose', resp, def, false, state,
        );
        assert.equal(
            result,
            expected.charCodeAt(0),
            `menu response ${resp} selects ${expected}`,
        );
    }

    const cancelled = await initializedGame();
    cancelled.iflags.query_menu = true;
    cancelled.nhDisplay.pushKey(0x1B);
    // cmd.c:5455-5457 returns def when select_menu() reports no selection;
    // 'n' is the source default for this y/n prompt.
    assert.equal(
        await yn_function('Choose', 'yn', 'n', false, cancelled),
        'n'.charCodeAt(0),
    );
});

test('external command cores preserve time state and record only platform gaps', async () => {
    const state = await initializedGame();
    state.fixedDatetime = '20320405060708';
    state.urealtime = { realtime: 7, start_timing: 0, finish_time: 0 };
    // cmd.c:5676 uses Norep() when the tty window cannot suspend; ECMD_OK is
    // still the handler result and no platform gap is recorded on that path.
    assert.equal(await dosuspend_core(state), ECMD_OK);
    assert.match(state.nhDisplay.toplines, /suspend.*not available/u);

    state.urealtime.start_timing = 0;
    assert.equal(await dosh_core(state), ECMD_OK);
    assert.ok(game.unported.has('sys/unix/unixunix.c dosh'));
    assert.equal(
        state.urealtime.start_timing,
        // getnow() reads the fixed recorder time, so dosh_core() restarts its
        // clock at the deterministic Unix-second value used by the segment.
        getnow(state),
    );
});

test('dummyfunction starts an unselected command as a cancellation', () => {
    // cmd.c:3633 initializes rhack()'s function pointer with ECMD_CANCEL.
    assert.equal(dummyfunction(), ECMD_CANCEL);
});
