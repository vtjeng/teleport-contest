import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { BLINDED, COULD_SEE, IN_SIGHT, NHW_MESSAGE, ROOM } from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { tty_yn_function } from '../js/topl.js';
import { TOPLINE_EMPTY } from '../js/tty_message.js';
import { tty_create_nhwindow } from '../js/wintty.js';
import { vision_recalc, vision_reset } from '../js/vision.js';

async function pendingBlindVision() {
    await runSegment({ seed: 8432110, datetime: '20261031103000',
        nethackrc: 'OPTIONS=name:PromptVision,role:Valkyrie,race:human,gender:female,align:neutral,playmode:debug,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',
        moves: '' });
    game.u.ux = 10;
    game.u.uy = 10;
    game.u.uprops[BLINDED].intrinsic = 0;
    for (let x = 7; x <= 13; x++)
        for (let y = 7; y <= 13; y++)
            Object.assign(game.level.at(x, y), { typ: ROOM, lit: true });
    vision_reset(game);
    vision_recalc(0);
    assert.ok(game.viz_array[10][9] & IN_SIGHT);
    game.u.uprops[BLINDED].intrinsic = 1;
    game.vision_full_recalc = 1;
    game._pending_message = '';
    game._ttyToplines = '';
    game.nhDisplay.toplin = TOPLINE_EMPTY;
    return game;
}

for (const resp of ['yn', null]) {
    test('prompt consumes deferred blind vision before input, responses=' + resp, async () => {
        const state = await pendingBlindVision();
        let atInput;
        state._preNhgetchHook = () => {
            atInput = { flag: state.vision_full_recalc, sight: state.viz_array[10][9] };
        };
        state.nhDisplay.pushKey('n'.charCodeAt(0));
        try { assert.equal(await tty_yn_function('Continue?', resp, 'n', state), 'n'.charCodeAt(0)); }
        finally { delete state._preNhgetchHook; }
        assert.equal(atInput.flag, 0);
        assert.equal(atInput.sight & IN_SIGHT, 0);
        assert.ok(atInput.sight & COULD_SEE);
    });
}

test('bones restore prompt retains the startup vision safeguard', async () => {
    const state = await pendingBlindVision();
    state._bonesRestorePrompt = true;
    const before = state.viz_array;
    state.nhDisplay.pushKey('n'.charCodeAt(0));
    try { await tty_yn_function('Restore?', 'yn', 'n', state); }
    finally { delete state._bonesRestorePrompt; }
    assert.equal(state.vision_full_recalc, 1);
    assert.equal(state.viz_array, before);
    assert.ok(state.viz_array[10][9] & IN_SIGHT);
});

test('non-global prompt does not recalculate either owner vision', async () => {
    await pendingBlindVision();
    const state = { ...game, u: structuredClone(game.u), nhDisplay: new GameDisplay(null),
        wintty: { wins: [] }, program_state: {}, viz_array: structuredClone(game.viz_array) };
    tty_create_nhwindow(NHW_MESSAGE, state);
    state.nhDisplay.toplin = TOPLINE_EMPTY;
    const liveVision = game.viz_array;
    const otherVision = state.viz_array;
    state.nhDisplay.pushKey('n'.charCodeAt(0));
    await tty_yn_function('Clone?', 'yn', 'n', state);
    assert.equal(state.vision_full_recalc, 1);
    assert.equal(game.vision_full_recalc, 1);
    assert.equal(game.viz_array, liveVision);
    assert.equal(state.viz_array, otherVision);
});

for (const name of ['slime', 'monochrome', 'between-turn-control']) {
    test('prompt deferred vision ' + name + ' matches independent public C recording', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(readFileSync(new URL(
                '../recordings/topl.c/prompt-deferred-vision-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
