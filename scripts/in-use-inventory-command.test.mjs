import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rhack } from '../js/cmd.js';
import { flush_screen } from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { getRngLog } from '../js/rng.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

// New fixed inputs test ordinary command dispatch, independent of the
// admitted crystal ball's impairment roll and hallucination state.
const START = {
    seed: 17032021,
    datetime: '20490719140217',
    nethackrc: 'OPTIONS=name:InUseKeys,role:Barbarian,race:human,gender:female,align:neutral,playmode:debug\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!acoustics,!tips,!debug_mongen\n',
};

test('direct in-use keys invoke their existing handlers without spending time', async () => {
    for (const [key, message] of [
        ['(', 'You are not using any tools.'], // TOOL_SYM -> doprtool.
        ['*', 'You are not wearing or wielding anything.'], // seeall -> doprinuse.
    ]) {
        for (const multi of [0, -3]) { // Ordinary state and negative-multi queue reset.
            await runSegment({ ...START, moves: '  ', storage: {} });
            clearTtyMessageWindow(game);
            game.invent = null; // Force each canonical empty inventory scan.
            game.multi = multi;
            const turns = game.moves;
            const draws = getRngLog().length;
            await rhack(key.charCodeAt(0), game);
            assert.equal(game.multi, 0); // reset_cmd_vars always clears multi.
            assert.equal(game.context.move, 0);
            assert.equal(game.moves, turns);
            assert.equal(getRngLog().length, draws);
            await flush_screen(1); // Runtime draws at the next input boundary.
            assert.equal(game.nhDisplay.grid[0].map(c => c.ch).join('').trim(), message);
        }
    }
});

test('direct in-use dispatch retains source registration and ECMD_OK handling', () => {
    const c = readFileSync('nethack-c/upstream/src/cmd.c', 'utf8');
    assert.match(c, /"seeall", "show all equipment in use",\s*doprinuse,/u);
    assert.match(c, /"seetools", "show the tools currently in use",\s*doprtool,/u);
    assert.match(c, /res = \(\*func\)\(\);/u);
    assert.match(c, /\(res & \(ECMD_OK \| ECMD_TIME\)\) == ECMD_OK\) \{\s*reset_cmd_vars\(gm.multi < 0\);/u);
    const js = readFileSync('js/cmd.js', 'utf8');
    for (const [command, helper] of [['seetools', 'doprtool'], ['seeall', 'doprinuse']]) {
        const arm = js.slice(js.indexOf(`if (command === '${command}')`));
        assert.ok(arm.startsWith(`if (command === '${command}')`));
        assert.ok(arm.indexOf(`() => ${helper}(state, inventoryMenuHooks(state))`) < arm.indexOf('resetCommandVars'));
        assert.match(arm, /resetCommandVars\(state, state.multi < 0\);\s*return;/u);
    }
});
