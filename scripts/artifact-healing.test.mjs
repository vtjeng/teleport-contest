// artifact.c:1780-1816: independent feedback gates and source HP selection.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { invoke_healing } from '../js/artifacts.js';
import { BLINDED, FROMOUTSIDE, ECMD_TIME, W_TOOL, OBJ_INVENT, SICK, SLIMED, SICK_ALL } from '../js/const.js';
import { PM_AIR_ELEMENTAL } from '../js/monsters.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

async function hero() {
    // Independently chosen Healer startup avoids injury and malignant statuses.
    await runSegment({ seed: 16051001, datetime: '20560301121531',
        nethackrc: 'OPTIONS=name:Fay,role:Healer,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen,!acoustics\n', moves: '' });
    clearTtyMessageWindow(game);
    game._ttyToplines = '';
    // Full HP makes each status-only comparison independent of healamt.
    game.u.uhp = game.u.uhpmax;
    return { where: OBJ_INVENT };
}

test('healing HP deficit prints both ordinary messages before adding the rounded half', async () => {
    const obj = await hero();
    // Deficit five gives C (max+1-hp)/2 == three, distinct from floor(deficit/2).
    game.u.uhp -= 5;
    const old = game.u.uhp;
    assert.equal(await invoke_healing(obj, game), ECMD_TIME);
    assert.equal(game._pending_message, 'You feel better.  You feel better.');
    assert.equal(game.u.uhp, old + 3);
    assert.equal(game.disp.botl, true);
});

test('permanent intrinsic blindness alone gives first feedback then the no-effect message', async () => {
    const obj = await hero();
    // HBlinded has FROMOUTSIDE but no TIMEOUT; boolean Blinded exceeds zero cream.
    game.u.uprops[BLINDED].intrinsic = FROMOUTSIDE;
    // At 80 columns the first message must be acknowledged before the longer
    // no-effect message; observe that production input boundary explicitly.
    // The fixture permits this deliberate pending input instead of treating it
    // as end-of-input; the controlled key below resumes the ordinary TTY path.
    const onEmptyQueue = game.nhDisplay.onEmptyQueue;
    game.nhDisplay.onEmptyQueue = undefined;
    const invocation = invoke_healing(obj, game);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(game._pending_message, 'You feel better.');
    assert.equal(game.nhDisplay.isWaitingForInput, true);
    game.nhDisplay.terminal.pushKey(' '.charCodeAt(0));
    await invocation;
    game.nhDisplay.onEmptyQueue = onEmptyQueue;
    assert.equal(game._pending_message, 'You feel a surge of power, but nothing seems to happen.');
    assert.equal(game.u.uprops[BLINDED].intrinsic, FROMOUTSIDE);
});

test('Eyes blocker suppresses only the first blindness feedback gate', async () => {
    const obj = await hero();
    // Eyes blocks the boolean intrinsic-blindness macro even with FROMOUTSIDE.
    game.u.uprops[BLINDED].intrinsic = FROMOUTSIDE;
    game.u.uprops[BLINDED].blocked = W_TOOL;
    await invoke_healing(obj, game);
    assert.equal(game._pending_message, 'You feel a surge of power, but nothing seems to happen.');
});

test('cream comparison uses boolean Blinded rather than its raw intrinsic duration', async () => {
    const obj = await hero();
    // Boolean TRUE is one; one cream defeats the first > comparison even
    // though FROMOUTSIDE is numerically large. No timeout defeats the second.
    game.u.ucreamed = 1;
    game.u.uprops[BLINDED].intrinsic = FROMOUTSIDE;
    await invoke_healing(obj, game);
    assert.equal(game._pending_message, 'You feel a surge of power, but nothing seems to happen.');
});

test('permanent blindness with cream gives slightly feedback only and retains high flags', async () => {
    const obj = await hero();
    // TRUE is one, so one cream suppresses first feedback. Two timed turns
    // exceed that cream and only the second gate emits its slightly prefix.
    game.u.ucreamed = 1;
    game.u.uprops[BLINDED].intrinsic = FROMOUTSIDE | 2;
    game.u.uprops[BLINDED].blocked = W_TOOL;
    await invoke_healing(obj, game);
    assert.equal(game._pending_message, 'You feel slightly better.');
    assert.equal(game.u.uprops[BLINDED].intrinsic, FROMOUTSIDE | 1);
});

test('sickness and slime are cleared by their canonical owners after both messages', async () => {
    const obj = await hero();
    // Positive timers with both sickness kinds exercise source SICK_ALL clear.
    game.u.uprops[SICK].intrinsic = 20;
    game.u.usick_type = SICK_ALL;
    game.u.uprops[SLIMED].intrinsic = 20;
    await invoke_healing(obj, game);
    assert.equal(game._pending_message, 'You feel better.  You feel better.');
    assert.equal(game.u.uprops[SICK].intrinsic, 0);
    assert.equal(game.u.usick_type, 0);
    assert.equal(game.u.uprops[SLIMED].intrinsic, 0);
});

test('polymorphed healing reads and updates monster HP, leaving ordinary HP alone', async () => {
    const obj = await hero();
    // A distinct form makes Upolyd true; five-point deficit again heals three.
    game.u.umonnum = PM_AIR_ELEMENTAL;
    game.u.mhmax = 20;
    game.u.mh = 15;
    const ordinary = game.u.uhp;
    await invoke_healing(obj, game);
    assert.equal(game.u.mh, 18);
    assert.equal(game.u.uhp, ordinary);
    assert.equal(game._pending_message, 'You feel better.  You feel better.');
});

test('C source retains separate first and timeout feedback conditions', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/artifact.c', import.meta.url), 'utf8');
    assert.match(c, /if \(healamt \|\| Sick \|\| Slimed \|\| Blinded > creamed\)\s+You_feel\("better\."\);\s+if \(healamt \|\| Sick \|\| Slimed \|\| BlindedTimeout > creamed\)/u);
});
