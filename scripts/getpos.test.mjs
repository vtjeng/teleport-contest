import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    CQ_CANNED,
    VIBRATING_SQUARE,
    WEB,
    GFILTER_NONE,
    NUM_GFILTER,
} from '../js/const.js';
import { cmdq_add_dir, cmdq_add_key, cmdq_add_userinput } from '../js/cmd.js';
import { cmap_to_glyph } from '../js/display.js';
import { game } from '../js/gstate.js';
import { getpos } from '../js/getpos.js';
import { runSegment } from '../js/jsmain.js';
import {
    cmap_symbol_byte,
    MAXPCHARS,
    S_arrow_trap,
    S_cloud,
    S_room,
} from '../js/symbols.js';
import { SYM_OFF_P } from '../js/symbol_data.js';

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

const GETPOS_C = readFileSync(
    new URL('../nethack-c/upstream/src/getpos.c', import.meta.url), 'utf8',
);
const GETPOS_JS = readFileSync(new URL('../js/getpos.js', import.meta.url), 'utf8');

test('getpos keeps the C out-parameters alive across its input and feature loops', () => {
    const body = GETPOS_C.slice(GETPOS_C.indexOf('int\ngetpos('));
    assert.match(body, /coordxy tx = u\.ux, ty = u\.uy;[\s\S]*?for \(;;\)/u);
    assert.match(body, /for \(ty = lo_y; ty <= hi_y; ty\+\+\)[\s\S]*?for \(tx = lo_x; tx <= hi_x; tx\+\+\)/u);
    assert.match(body, /if \(c == 0\) \{\s*if \(!isok\(tx, ty\)\)\s*continue;/u);
    assert.match(body, /c == '\^' && is_cmap_trap\(sidx\)/u);
    assert.match(body, /c == '~'[\s\S]*?known_vibrating_square_at\(tx, ty\)/u);
    assert.match(body, /if \(!goal\)\s*goal = "desired location";/u);
    assert.match(body, /cx = -1;\s*cy = 0;\s*result = 0/u);
    assert.match(GETPOS_JS, /const target = goal \?\? 'desired location'/u);
    assert.match(GETPOS_JS, /key === '\^'\.charCodeAt\(0\)/u);
    assert.match(GETPOS_JS, /key === '~'\.charCodeAt\(0\)/u);
});

test('getpos matches traps by cmap family and finds a hidden Invocation square', async () => {
    await enterStableGame();
    const start = { x: game.u.ux, y: game.u.uy };
    const target = { x: start.x + 1, y: start.y };
    const webSymbol = S_arrow_trap + WEB - 1;
    const oldWebSymbol = game.gs.showsyms[SYM_OFF_P + webSymbol];
    const oldVibratingSymbol = game.gs.showsyms[
        SYM_OFF_P + S_arrow_trap + VIBRATING_SQUARE - 1
    ];
    const oldDisplayGlyph = game.level.at(target.x, target.y).disp_glyph;
    const oldSeen = game.level.at(target.x, target.y).seenv;
    const oldTraps = game.level.traps;
    const oldInvocationPosition = game.inv_pos;
    const dungeon = game.dungeons[game.u.uz.dnum];
    const oldHellish = dungeon.flags.hellish;
    const oldNumLevels = dungeon.num_dunlevs;
    const oldDepth = game.u.uz.dlevel;
    const oldShowsym = game.gs.showsyms[SYM_OFF_P + S_arrow_trap + VIBRATING_SQUARE - 1];
    const cloudByteIndex = SYM_OFF_P + S_cloud;
    const oldCloudSymbol = game.gs.showsyms[cloudByteIndex];
    const oldCmapVibrating = cmap_symbol_byte(
        S_arrow_trap + VIBRATING_SQUARE - 1, game,
    );
    try {
        game.gs.showsyms[SYM_OFF_P + webSymbol] = '!'.charCodeAt(0);
        assert.equal(cmap_symbol_byte(webSymbol, game), '!'.charCodeAt(0));
        game.level.at(target.x, target.y).disp_glyph = {
            glyph: cmap_to_glyph(webSymbol, game),
        };
        game.level.traps = [
            ...(oldTraps ?? []),
            { tx: target.x, ty: target.y, ttyp: WEB, tseen: 1 },
        ];
        let inputIndex = 0;
        const trapInputs = [];
        game.poskey = (x, y, mod) => {
            trapInputs.push({ x: x.value, y: y.value, mod: mod.value });
            return ['^'.charCodeAt(0), 0][inputIndex++];
        };
        const cc = { ...start };
        assert.equal(await getpos(cc, true, 'desired location', game), 0);
        assert.deepEqual(cc, target);
        assert.deepEqual(trapInputs, [
            { x: start.x, y: start.y, mod: 0 },
            { x: target.x, y: target.y, mod: MAXPCHARS },
        ]);

        // A '~' match comes from the active vibrating-square byte, while the
        // map displays ordinary floor and has no remembered terrain there.
        dungeon.flags.hellish = true;
        dungeon.num_dunlevs = game.u.uz.dlevel + 1;
        game.inv_pos = { ...target };
        game.gs.showsyms[
            SYM_OFF_P + S_arrow_trap + VIBRATING_SQUARE - 1
        ] = '~'.charCodeAt(0);
        assert.equal(
            cmap_symbol_byte(S_arrow_trap + VIBRATING_SQUARE - 1, game),
            '~'.charCodeAt(0),
        );
        game.level.at(target.x, target.y).disp_glyph = {
            glyph: cmap_to_glyph(S_room, game),
        };
        game.level.at(target.x, target.y).seenv = 0;
        game.level.traps = [
            ...(oldTraps ?? []),
            {
                tx: target.x, ty: target.y,
                ttyp: VIBRATING_SQUARE, tseen: 1,
            },
        ];
        inputIndex = 0;
        const vibrationInputs = [];
        game.poskey = (x, y, mod) => {
            vibrationInputs.push({ x: x.value, y: y.value, mod: mod.value });
            return ['~'.charCodeAt(0), 0][inputIndex++];
        };
        const vibrationCc = { ...start };
        assert.equal(
            await getpos(vibrationCc, true, 'desired location', game), 0,
        );
        assert.deepEqual(vibrationCc, target);
        assert.deepEqual(vibrationInputs, [
            { x: start.x, y: start.y, mod: 0 },
            { x: target.x, y: target.y, mod: MAXPCHARS },
        ]);

        // No map symbol matches this temporary active cloud symbol. The C
        // nested loops finish with tx=cx+1, ty=cy+1 and keep those values for
        // the following NUL mouse input.
        game.gs.showsyms[cloudByteIndex] = 'Q'.charCodeAt(0);
        assert.equal(cmap_symbol_byte(S_cloud, game), 'Q'.charCodeAt(0));
        inputIndex = 0;
        const scanInputs = [];
        game.poskey = (x, y, mod) => {
            scanInputs.push({ x: x.value, y: y.value, mod: mod.value });
            return ['Q'.charCodeAt(0), 0][inputIndex++];
        };
        const scanCc = { ...start };
        assert.equal(
            await getpos(scanCc, true, 'desired location', game), 0,
        );
        assert.deepEqual(scanInputs, [
            { x: start.x, y: start.y, mod: 0 },
            { x: start.x + 1, y: start.y + 1, mod: MAXPCHARS },
        ]);
        assert.deepEqual(scanCc, { x: start.x + 1, y: start.y + 1 });
    } finally {
        delete game.poskey;
        game.gs.showsyms[cloudByteIndex] = oldCloudSymbol;
        game.gs.showsyms[SYM_OFF_P + webSymbol] = oldWebSymbol;
        game.gs.showsyms[SYM_OFF_P + S_arrow_trap + VIBRATING_SQUARE - 1]
            = oldShowsym ?? oldVibratingSymbol;
        game.level.at(target.x, target.y).disp_glyph = oldDisplayGlyph;
        game.level.at(target.x, target.y).seenv = oldSeen;
        game.level.traps = oldTraps;
        game.inv_pos = oldInvocationPosition;
        dungeon.flags.hellish = oldHellish;
        dungeon.num_dunlevs = oldNumLevels;
        game.u.uz.dlevel = oldDepth;
        assert.equal(cmap_symbol_byte(
            S_arrow_trap + VIBRATING_SQUARE - 1, game,
        ), oldCmapVibrating);
    }
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

test('getpos retains mouse outputs across an invalid click and a queued key', async () => {
    await enterStableGame();
    const start = { x: game.u.ux, y: game.u.uy };
    const observed = [];
    let reads = 0;
    game.poskey = (x, y, mod) => {
        observed.push({ x: x.value, y: y.value, mod: mod.value });
        reads += 1;
        if (reads === 1) {
            cmdq_add_key(CQ_CANNED, 'l'.charCodeAt(0), game);
            return { key: 0, x: -1, y: -1, mod: 0 };
        }
        return 0x1B;
    };
    try {
        assert.equal(
            await getpos({ ...start }, true, 'desired location', game),
            -1,
        );
    } finally {
        delete game.poskey;
    }

    assert.deepEqual(observed, [
        { x: start.x, y: start.y, mod: 0 },
        { x: -1, y: -1, mod: 0 },
    ]);
    assert.equal(game.command_queue[CQ_CANNED].length, 0);
});

test('getpos Space exit retains the C result coordinates', async () => {
    await enterStableGame();
    const start = { x: game.u.ux, y: game.u.uy };
    const cc = { ...start };
    let firstRead = true;
    game.poskey = () => {
        if (firstRead) {
            firstRead = false;
            cmdq_add_key(CQ_CANNED, 0x20, game);
            return 'l'.charCodeAt(0);
        }
        return 0x1B;
    };
    assert.equal(await getpos(cc, false, '', game), 0);
    delete game.poskey;
    assert.deepEqual(cc, { x: -1, y: 0 });
    assert.match(game._ttyToplines, /Done\./u);
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
