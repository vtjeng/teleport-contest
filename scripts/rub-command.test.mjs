import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { failClosedCommandRefusals } from '../js/cmd.js';
import {
    ECMD_CANCEL,
    ECMD_OK,
    CQ_REPEAT,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    BRASS_LANTERN,
    FLINT,
    LOADSTONE,
    LUCKSTONE,
    LUMP_OF_ROYAL_JELLY,
    MAGIC_LAMP,
    OIL_LAMP,
    POT_WATER,
    TOUCHSTONE,
} from '../js/objects.js';
import { PM_FLOATING_EYE } from '../js/monsters.js';
import { dorub, rub_ok, UnsupportedApplyError } from '../js/apply.js';
import {
    ESCAPE_KEY,
    EXTCMD_KEY,
    loadRubCommandRecipe,
    NEWLINE,
    SPACE_KEY,
    START,
    WIZWISH_KEY,
} from './run-rub-command.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function inventorySnapshot() {
    const objects = [];
    for (let obj = game.invent; obj; obj = obj.nobj)
        objects.push(structuredClone({ ...obj, nobj: null }));
    return objects;
}

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

function digest(values) {
    return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

function segmentThroughWish() {
    const segment = loadRubCommandRecipe().segments[0];
    return {
        ...segment,
        moves: `${START}${WIZWISH_KEY}magic lamp${NEWLINE}`,
    };
}

test('rub_ok suggests lamps, gray stones, and royal jelly', () => {
    // apply.c:1770-1781 excludes null and all other objects. Its three lamp
    // constants, obj.h is_graystone()'s four constants, and royal jelly are
    // the complete suggested set.
    assert.equal(rub_ok(null), GETOBJ_EXCLUDE);
    for (const otyp of [
        OIL_LAMP,
        MAGIC_LAMP,
        BRASS_LANTERN,
        LUCKSTONE,
        LOADSTONE,
        FLINT,
        TOUCHSTONE,
        LUMP_OF_ROYAL_JELLY,
    ]) {
        assert.equal(rub_ok({ otyp }), GETOBJ_SUGGEST, `otyp ${otyp}`);
    }
    // objects.h's potion of water is outside every accepted family.
    assert.equal(rub_ok({ otyp: POT_WATER }), GETOBJ_EXCLUDE);
});

test('dorub cancellation preserves the wished-for lamp and command time',
    async () => {
    const replay = await runSegment(segmentThroughWish());
    const inventory = inventorySnapshot();
    const moves = game.moves;
    const rngCalls = replay.getRngLog().length;

    // decl.c quitchars[] includes Escape, which makes getobj() answer null and
    // dorub() return ECMD_CANCEL before any object branch runs.
    // The wished-object inventory line is still pending. Space dismisses it
    // before Escape reaches getobj(), matching the command loop's handoff.
    game.nhDisplay.pushKey(SPACE_KEY.charCodeAt(0));
    game.nhDisplay.pushKey(ESCAPE_KEY.charCodeAt(0));
    assert.equal(await dorub(game), ECMD_CANCEL);
    assert.equal(game.moves, moves);
    assert.equal(replay.getRngLog().length, rngCalls);
    assert.deepEqual(inventorySnapshot(), inventory);
});

test('dorub stops after selecting an unwielded lamp', async () => {
    await runSegment(segmentThroughWish());
    const lamp = inventorySnapshot().find(({ otyp }) => otyp === MAGIC_LAMP);
    assert.ok(lamp, 'the debug wish created a magic lamp');
    const weapon = game.uwep;

    // apply.c:1796 branches on the selected object's class, then compares the
    // lamp with uwep before wield_tool(). This slice stops immediately after
    // selection, so neither the weapon slot nor the lamp may change.
    game.nhDisplay.pushKey(SPACE_KEY.charCodeAt(0));
    game.nhDisplay.pushKey(lamp.invlet.charCodeAt(0));
    await assert.rejects(
        () => dorub(game),
        { name: 'UnsupportedApplyError', branch: 'dorub() after object selection' },
    );
    assert.equal(game.uwep, weapon);
    assert.deepEqual(
        inventorySnapshot().find(({ o_id }) => o_id === lamp.o_id),
        lamp,
    );
    assert.ok(failClosedCommandRefusals().includes(UnsupportedApplyError));
});

test('dorub refuses a form without hands before prompting', async () => {
    const segment = loadRubCommandRecipe().segments[0];
    await runSegment({ ...segment, moves: START });
    // permonst.h marks the floating eye M1_NOHANDS. apply.c:1789 returns
    // ECMD_OK at this guard, before getobj() could read a key.
    game.youmonst.data = game.mons[PM_FLOATING_EYE];
    assert.equal(await dorub(game), ECMD_OK);
    assert.equal(
        game._pending_message,
        "You aren't able to rub anything without hands.",
    );
});

test('#rub dispatch reaches getobj instead of the command boundary',
    async () => {
    const segment = segmentThroughWish();
    let boundary = null;
    await runSegment({
        ...segment,
        moves: `${segment.moves}${EXTCMD_KEY}rub${NEWLINE}`,
    }, { onBoundary: (error) => { boundary = error; } });

    assert.equal(boundary, null);
    assert.match(topLine(), /^What do you want to rub\?/u);
});

test('the complete #rub cancellation recipe preserves the command boundary',
    () => withSerializedGrids(async () => {
        let boundary = null;
        const replay = await runSegment(
            loadRubCommandRecipe().segments[0],
            { onBoundary: (error) => { boundary = error; } },
        );
        const lamp = inventorySnapshot().find(({ otyp }) => otyp === MAGIC_LAMP);

        assert.equal(boundary, null);
        assert.equal(game.moves, 2);
        assert.equal(replay.getRngLog().length, 2777);
        assert.equal(replay.getScreens().length, 23);
        assert.equal(replay.getCursors().length, 23);
        // Digests come from the fresh C-matched seed-108 cancellation run and
        // cover every serialized cell attribute and cursor triple.
        assert.equal(
            digest(replay.getScreens()),
            '058ba68d0c8183a4d92210c60c57927ff70c936970abc04df0e9a9a1bd92220a',
        );
        assert.equal(
            digest(replay.getCursors()),
            '109b8b9a86fead5a6883a789bafacb441746d8e6bb14ebff148413d8984ce187',
        );
        assert.equal(game.context.pendingCommand, undefined);
        assert.equal(game.command_queue?.[CQ_REPEAT]?.length ?? 0, 0);
        assert.ok(lamp);
        assert.notEqual(game.uwep?.o_id, lamp.o_id);
        assert.equal(lamp.in_use, false);
    }));
