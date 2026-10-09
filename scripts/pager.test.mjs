import assert from 'node:assert/strict';
import test from 'node:test';

import { whatisMenuItems } from '../js/pager.js';

test('whatis rows keep C’s hidden group accelerators', () => {
    // pager.c do_look() passes '/' with gch 'y', '?' with 'n', 't' with '^',
    // 'T' with '"', 'e' with '`', and 'E' with '|' when lootabc is false.
    // windows.c add_menu() defines gch as the group accelerator; selection
    // still returns each row's visible C value.
    const rows = whatisMenuItems({
        flags: { lootabc: false },
        u: { uprops: [] },
    });

    const byValue = new Map(rows.map((row) => [row.value, row]));
    for (const [value, accelerator] of [
        ['/', 'y'],
        ['?', 'n'],
        ['t', '^'],
        ['T', '"'],
        ['e', '`'],
        ['E', '|'],
    ]) {
        assert.equal(byValue.get(value)?.selector, value);
        assert.equal(byValue.get(value)?.groupSelector, accelerator);
    }
});

// pager.c doidtrap2336-2389: queued directions use the real getdir owner;
// they avoid interactive input while retaining all source description logic.
import * as pager from '../js/pager.js';
import { readFileSync } from 'node:fs';
import { act_on_act, cmdq_add_dir, cmdq_add_key, reset_commands, MCMD } from '../js/cmd.js';
import { CQ_CANNED, ECMD_OK, HOLE, PIT, ROCKTRAP, ROOM, WEB } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { GameDisplay } from '../js/game_display.js';

function trapIdState() {
    const state = {
        level: new GameMap(), nhDisplay: new GameDisplay(null),
        u: { ux: 10, uy: 10, uprops: [] },
        flags: {}, iflags: {}, context: {}, program_state: {},
    };
    // Central room coordinate leaves every cardinal/vertical probe in bounds.
    state.level.at(10, 10).typ = ROOM;
    reset_commands(true, state);
    return state;
}

test('doidtrap source owner is exported and all descriptions take no time', async () => {
    const source = readFileSync(new URL('../nethack-c/upstream/src/pager.c', import.meta.url), 'utf8');
    assert.ok(source.includes('if (!getdir("^"))'));
    assert.ok(source.includes('u.dz < 0 ? is_hole(tt) : tt == ROCKTRAP'));
    assert.equal(typeof pager.doidtrap, 'function');
    for (const [ttyp, suffix] of [[WEB, 'a web woven'], [PIT, 'a pit dug'], [HOLE, 'a hole dug'], [ROCKTRAP, 'a falling rock trap set']]) {
        const state = trapIdState();
        // Source only identifies seen traps and derives the suffix from madeby_u.
        state.level.traps = [{ tx: 11, ty: 10, ttyp, tseen: true, madeby_u: true }];
        cmdq_add_dir(CQ_CANNED, 1, 0, 0, state);
        assert.equal(await pager.doidtrap(state), ECMD_OK);
        assert.ok(state._ttyToplines.includes(`That is ${suffix} by you.`));
    }
});

test('doidtrap canned LOOK_TRAP consumes its queued direction', async () => {
    const state = trapIdState();
    state.level.traps = [{ tx: 11, ty: 10, ttyp: PIT, tseen: true }];
    // act_on_act queues EC followed by DIR; dispatcher normally consumes EC.
    act_on_act(MCMD.LOOK_TRAP, 1, 0, state);
    state.command_queue[CQ_CANNED].shift();
    assert.equal(await pager.doidtrap(state), ECMD_OK);
    assert.ok(state._ttyToplines.includes('That is a pit.'));
    assert.equal(state.command_queue[CQ_CANNED].length, 0);
});


test('doidtrap hides unseen traps and respects the source vertical exclusions', async () => {
    // Upward viewing cannot see holes; downward viewing cannot see falling rocks.
    for (const [ttyp, dz, seen, description] of [
        [HOLE, -1, true, "I can't see a trap there."],
        [ROCKTRAP, 1, true, "I can't see a trap there."],
        [PIT, 0, false, "I can't see a trap there."],
        [PIT, -1, true, 'That is a pit.'],
    ]) {
        const state = trapIdState();
        state.level.traps = [{ tx: 10, ty: 10, ttyp, tseen: seen }];
        if (dz) cmdq_add_dir(CQ_CANNED, 0, 0, dz, state);
        else cmdq_add_key(CQ_CANNED, '.'.charCodeAt(0), state);
        assert.equal(await pager.doidtrap(state), ECMD_OK);
        assert.equal(state._ttyToplines, description);
    }
});

test('doidtrap cancellation returns source ECMD_CANCEL without description', async () => {
    const state = trapIdState();
    // C quitchars includes Escape; queueing the byte exercises getdir's
    // cancelled-result path without an input mock or placeholder return.
    cmdq_add_key(CQ_CANNED, 27, state);
    assert.equal(await pager.doidtrap(state), 2);
    assert.equal(state._ttyToplines ?? '', '');
});
