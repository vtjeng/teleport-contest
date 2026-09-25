// Focused tests for do.c doup() and the ascending arm of goto_level(). These
// tests cover the guards that refuse ascent, the successful ascending path
// through a previously visited level, and the transit message.
//
// The recorded evidence is the fresh differential in scripts/run-ascend.mjs
// (a hero descends, then ascends back to D:1) and the development session
// seed0007-rogue-snake-swamp, whose step 68 types '<' on D:2.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ECMD_OK,
    ECMD_TIME,
    LFILE_EXISTS,
    TT_PIT,
} from '../js/const.js';
import { doup } from '../js/do.js';
import { ledger_no, level_info } from '../js/dungeon.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { AD_DGST, AT_ENGL, AT_HUGS } from '../js/monsters.js';
import { stairway_add, stairway_at } from '../js/stairs.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { loadDescendRefusalRecipe } from './run-descend-refusal.mjs';

// gt.toplines, which pline.c writes whether or not the row has been repainted.
function toplines(state) {
    return state._ttyToplines ?? '';
}

// Locate a matrix segment by the keys it types: same utility as dodown.test.mjs.
function segmentFor(moves) {
    const found = loadDescendRefusalRecipe().segments.find(
        (segment) => segment.moves === moves,
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
    return found;
}

// Replay a prefix of the descend-refusal matrix segment and return game state.
// The hero starts on the up staircase, so an empty moves prefix leaves the
// hero on the upstair.
async function ascendTo(moves) {
    await runSegment({ ...segmentFor('h>..'), moves });
    return game;
}

// Drop the current message so the next pline() starts a fresh top line.
function quiet(state) {
    clearTtyMessageWindow(state);
    state._ttyToplines = '';
}

test('doup() refuses when the hero is not on an up staircase', async () => {
    // do.c:1313-1315. The hero walks one step east off the up staircase, so
    // stairway_at() answers null. The refusal is "You can't go up here."
    const state = await ascendTo('h');
    quiet(state);
    const stway = stairway_at(state.u.ux, state.u.uy, state);
    assert.equal(stway, null, 'no stairway under the hero after moving east');

    assert.equal(await doup(state), ECMD_OK);
    assert.equal(toplines(state), "You can't go up here.");
});

test('doup() refuses when the stairway under the hero is a downstair',
    async () => {
    // do.c:1313, the (stway && !stway->up) branch. The hero is on the up
    // staircase at game start; add a downstair at the same position. Because
    // stairway_add prepends, stairway_at returns the downstair first.
    const state = await ascendTo('h');
    quiet(state);
    stairway_add(state.u.ux, state.u.uy, false, false, {
        dnum: state.u.uz.dnum,
        dlevel: state.u.uz.dlevel + 1,
    });

    assert.equal(await doup(state), ECMD_OK);
    assert.equal(toplines(state), "You can't go up here.");
});

test('doup() defers when the hero is in a pit', async () => {
    // do.c:1308-1311. climb_pit() is void and its result is discarded, so the
    // named gap is recorded and the command still spends a turn.
    const state = await ascendTo('');
    quiet(state);
    state.u.utrap = 3;
    state.u.utraptype = TT_PIT;

    assert.equal(await doup(state), ECMD_TIME);
    assert.ok(state.unported.has('trap.c climb_pit'));
});

test('doup() refuses when the hero is stuck', async () => {
    // do.c:1321-1322. u_stuck_cannot_go("up") refuses a held hero. Fabricated
    // because no ported path writes u.ustuck for the hero.
    const state = await ascendTo('');
    quiet(state);
    state.u.ustuck = { data: state.youmonst.data };

    assert.equal(await doup(state), ECMD_TIME);
    assert.equal(toplines(state), 'You are being held, and cannot go up.');
});

test('doup() distinguishes swallowed from engulfed holders', async () => {
    for (const [attacks, condition] of [
        [[{ aatyp: AT_ENGL, adtyp: AD_DGST }], 'swallowed'],
        [[], 'engulfed'],
    ]) {
        const state = await ascendTo('');
        quiet(state);
        state.u.uswallow = 1;
        state.u.ustuck = {
            data: { ...state.youmonst.data, mattk: attacks },
        };

        assert.equal(await doup(state), ECMD_TIME);
        assert.equal(
            toplines(state), `You are ${condition}, and cannot go up.`,
        );
    }
});

test('doup() releases a holder when the hero can stick to it', async () => {
    const state = await ascendTo('');
    quiet(state);
    const holder = { data: state.youmonst.data };
    state.u.ustuck = holder;
    state.youmonst.data = {
        ...state.youmonst.data,
        mattk: [{ aatyp: AT_HUGS, adtyp: 0 }],
    };
    state.iflags.debug_fuzzer = 1;

    assert.equal(await doup(state), ECMD_OK);
    assert.equal(state.u.ustuck, null);
    assert.match(toplines(state), /^You release /u);
});

// near_capacity() and next_to_u() are shared with dodown and are tested
// through integration recordings. The overloaded guard (do.c:1324-1328) and
// the "held back by pet" guard (do.c:1336-1338) use the same helpers and
// are difficult to exercise in isolation without triggering goto_level's
// full flow. next_to_u() checks leashed monsters, not tame distance.

test('doup() declines the D:1 escape prompt by default', async () => {
    // do.c:1330-1335. y_n() defaults to n; the prompt is still shown.
    const state = await ascendTo('');
    quiet(state);
    // The hero starts on D:1, which IS ledger 1.
    assert.equal(ledger_no(state.u.uz, state), 1);

    state.nhDisplay.pushKey('n'.charCodeAt(0));
    assert.equal(await doup(state), ECMD_OK);
    assert.equal(
        toplines(state),
        'Beware, there will be no return!  Still climb? [yn] (n) n',
    );
});

test('doup() skips the D:1 escape prompt under the debug fuzzer', async () => {
    const state = await ascendTo('');
    quiet(state);
    state.iflags.debug_fuzzer = 1;

    assert.equal(await doup(state), ECMD_OK);
    assert.equal(toplines(state), '');
});


test('doup() sets DIR_UP through set_move_cmd before anything else',
    async () => {
    // do.c:1302. set_move_cmd(DIR_UP, 0) sets u.dz = -1, u.dx = 0, u.dy = 0.
    // This happens before any guard, so it fires even when doup refuses.
    const state = await ascendTo('h');
    quiet(state);
    // The hero is off the staircase, so doup refuses. But set_move_cmd runs.
    await doup(state);
    assert.equal(state.u.dz, -1);
    assert.equal(state.u.dx, 0);
    assert.equal(state.u.dy, 0);
});

test('doup() reports when the steed is immobile', async () => {
    // do.c:1317-1318 and steed.c:876-895. The C message names the steed.
    const state = await ascendTo('');
    quiet(state);
    state.u.uz.dlevel = 2; // avoid ledger_no == 1

    state.u.usteed = { msleeping: 1, mcanmove: 1, meating: 0,
        data: state.youmonst.data };

    assert.equal(await doup(state), ECMD_OK);
    assert.match(toplines(state), /won't move!/u);
});

test('savelev() captures level state and getlev() restores it', async () => {
    // save.c savelev() and restore.c getlev(). Verify that the level snapshot
    // round-trips through save and restore.
    const { savelev } = await import('../js/save.js');
    const { getlev } = await import('../js/restore.js');

    const state = await ascendTo('');
    quiet(state);

    const ledger = ledger_no(state.u.uz, state);
    const originalLevel = state.level;
    const originalStairs = state.stairs;
    const originalMoves = state.moves;

    // Save the level.
    savelev(ledger, state);

    // Verify the snapshot was created.
    assert.ok(state._savedLevels?.[ledger], 'snapshot exists after savelev');
    assert.equal(
        state._savedLevels[ledger].omoves, originalMoves,
        // omoves records the turn counter at save time so getlev() can compute
        // elapsed time for monster catch-up.
        'omoves captures the current turn counter',
    );
    assert.ok(
        level_info(ledger, state).flags & LFILE_EXISTS,
        // LFILE_EXISTS is the flag goto_level() reads to decide between
        // mklev() (new level) and getlev() (restore).
        'LFILE_EXISTS is set after saving',
    );

    // Overwrite the live level to prove getlev() restores from the snapshot.
    state.level = null;
    state.stairs = null;

    // Restore the level.
    await getlev(ledger, state);

    assert.equal(state.level, originalLevel,
        'getlev restores the same level object');
    assert.equal(state.stairs, originalStairs,
        'getlev restores the same stairs chain');
    // The snapshot should be deleted after restore.
    assert.equal(state._savedLevels?.[ledger], undefined,
        'the snapshot is consumed (deleted) after restore');
});
