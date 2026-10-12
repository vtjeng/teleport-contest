import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CQ_CANNED,
    GFILTER_NONE,
    NUM_GFILTER,
} from '../js/const.js';
import { cmdq_add_dir, cmdq_add_userinput } from '../js/cmd.js';
import { cmap_to_glyph } from '../js/display.js';
import { game } from '../js/gstate.js';
import { getpos } from '../js/getpos.js';
import { runSegment } from '../js/jsmain.js';
import { S_room } from '../js/symbols.js';

const PROBE = Object.freeze({
    seed: 613907,
    datetime: '20390127140622',
    nethackrc: [
        'OPTIONS=name:CursorProbe,role:Valkyrie,race:human,gender:female,align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=playmode:debug,pettype:none',
        '',
    ].join('\n'),
    recorderIsDst: true,
});

async function enterStableGame() {
    await runSegment({ ...PROBE, moves: ' \u0014  $' });
    game.flags.tips = false;
    game.flags.verbose = false;
    game.iflags.autodescribe = false;
}

function queueKeys(...keys) {
    for (const key of keys) game.nhDisplay.pushKey(key);
}

test('getpos returns an initial queued direction before opening the cursor loop', async () => {
    await enterStableGame();
    const start = { x: game.u.ux, y: game.u.uy };
    cmdq_add_dir(CQ_CANNED, 1, -1, 0, game);
    const cc = { x: start.x, y: start.y };

    assert.equal(await getpos(cc, true, 'desired location', game), 0);
    assert.deepEqual(cc, { x: start.x + 1, y: start.y - 1 });

    cmdq_add_userinput(CQ_CANNED, game);
    assert.equal(await getpos(cc, true, 'desired location', game), -1);
    assert.equal(game.command_queue[CQ_CANNED].length, 0);
});

test('getpos accepts a valid mouse position returned by readchar_poskey', async () => {
    await enterStableGame();
    const target = { x: game.u.ux + 2, y: game.u.uy + 1 };
    game.poskey = () => ({ key: 0, ...target, mod: 0 });
    const cc = { x: game.u.ux, y: game.u.uy };
    try {
        assert.equal(await getpos(cc, true, 'desired location', game), 0);
        assert.deepEqual(cc, target);
    } finally {
        delete game.poskey;
    }
});

test('getpos filter and moveskip keys update their C option state and messages', async () => {
    await enterStableGame();
    game.iflags.getloc_filter = GFILTER_NONE;
    game.iflags.getloc_moveskip = false;
    const observed = [];
    game._preNhgetchHook = async () => observed.push({
        filter: game.iflags.getloc_filter,
        moveskip: game.iflags.getloc_moveskip,
        message: game._ttyToplines,
    });
    queueKeys('"'.charCodeAt(0), '*'.charCodeAt(0), 0x1B);
    try {
        assert.equal(
            await getpos({ x: game.u.ux, y: game.u.uy }, true, 'desired location', game),
            -1,
        );
    } finally {
        delete game._preNhgetchHook;
    }

    assert.equal(observed[1].filter, (GFILTER_NONE + 1) % NUM_GFILTER);
    assert.equal(observed[1].message, 'Limiting targets to those in sight.');
    assert.equal(observed[2].moveskip, true);
    assert.equal(observed[2].message,
        'Skipping over similar terrain when fastmoving the cursor.');
});

test('getpos uses the active autodescribe and help keys with verbose wording', async () => {
    await enterStableGame();
    game.flags.verbose = true;
    game.commandBindings.specialKeys['getpos.autodescribe'] = 'x'.charCodeAt(0);
    game.commandBindings.specialKeys['getpos.help'] = 'H'.charCodeAt(0);
    const observed = [];
    game._preNhgetchHook = async () => observed.push({
        autodescribe: game.iflags.autodescribe,
        message: game._ttyToplines,
    });
    queueKeys('x'.charCodeAt(0), 0x1B);
    try {
        assert.equal(
            await getpos({ x: game.u.ux, y: game.u.uy }, true, 'desired location', game),
            -1,
        );
    } finally {
        delete game._preNhgetchHook;
        game.flags.verbose = false;
    }

    assert.match(observed[0].message, /Move cursor to the desired position:.*type a 'H'/u);
    assert.equal(observed[1].autodescribe, true);
    assert.equal(observed[1].message,
        'Automatic description of features under cursor is on.');
});

test('getpos same-glyph fast movement follows the configured run prefix', async () => {
    await enterStableGame();
    game.iflags.getloc_moveskip = true;
    const floor = cmap_to_glyph(S_room, game);
    const cursorBeforeInput = [];
    let preparedFloor = false;
    game._preNhgetchHook = async () => {
        if (!preparedFloor && game.gg.getposx === game.u.ux + 1) {
            for (let x = 1; x < 79; ++x) {
                const location = game.level.at(x, game.u.uy);
                location.disp_glyph = { glyph: floor };
            }
            preparedFloor = true;
        }
        cursorBeforeInput.push({ x: game.gg.getposx, y: game.gg.getposy });
    };
    queueKeys('l'.charCodeAt(0), 'G'.charCodeAt(0), 'l'.charCodeAt(0), 0x1B);
    try {
        assert.equal(
            await getpos({ x: game.u.ux, y: game.u.uy }, true, 'desired location', game),
            -1,
        );
    } finally {
        delete game._preNhgetchHook;
    }

    assert.equal(cursorBeforeInput.at(-1).x, 78);
    assert.equal(cursorBeforeInput.at(-1).y, game.u.uy);
});

test('cursor movement preserves the active message until the caller exits getpos', async () => {
    await enterStableGame();
    const messages = [];
    game._preNhgetchHook = async () => messages.push(game._ttyToplines);
    queueKeys('l'.charCodeAt(0), 0x1B);
    try {
        assert.equal(
            await getpos({ x: game.u.ux, y: game.u.uy }, true, 'desired location', game),
            -1,
        );
    } finally {
        delete game._preNhgetchHook;
    }

    assert.equal(messages[0], messages[1]);
});

test('non-forced unrecognized input reports Done and exits with the default result', async () => {
    await enterStableGame();
    queueKeys('Q'.charCodeAt(0));
    const cc = { x: game.u.ux, y: game.u.uy };

    assert.equal(await getpos(cc, false, 'desired location', game), 0);
    assert.deepEqual(cc, { x: -1, y: 0 });
    assert.match(game._ttyToplines, /Unknown direction: 'Q' \(aborted\).*Done\./u);
});
