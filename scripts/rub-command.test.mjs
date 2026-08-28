import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
    ADMITTED_COMMANDS,
    failClosedCommandRefusals,
} from '../js/cmd.js';
import {
    CMDQ_EXTCMD,
    CMDQ_KEY,
    CQ_CANNED,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    CQ_REPEAT,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    W_WEP,
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
import { wield_tool } from '../js/wield.js';
import {
    ESCAPE_KEY,
    EXTCMD_KEY,
    loadRubLampWieldRecipe,
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

function inventoryObject(otyp) {
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === otyp) return obj;
    }
    return null;
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

test('dorub wields an unwielded lamp and queues its continuation', async () => {
    const replay = await runSegment(segmentThroughWish());
    const lamp = inventoryObject(MAGIC_LAMP);
    assert.ok(lamp, 'the debug wish created a magic lamp');
    const weapon = game.uwep;
    const rngCalls = replay.getRngLog().length;

    // apply.c:1806-1812 calls wield_tool(), then appends dorub followed by the
    // selected letter to CQ_CANNED and answers ECMD_TIME. wield.c:730-752's
    // ordinary-tool arm prints the wield message, replaces uwep, and marks a
    // non-weapon lamp through gu.unweapon.
    game.nhDisplay.pushKey(SPACE_KEY.charCodeAt(0));
    game.nhDisplay.pushKey(lamp.invlet.charCodeAt(0));
    assert.equal(await dorub(game), ECMD_TIME);
    assert.equal(game.uwep, lamp);
    assert.equal(lamp.owornmask & W_WEP, W_WEP);
    assert.equal(weapon.owornmask & W_WEP, 0);
    assert.equal(game.unweapon, true);
    assert.equal(game._pending_message, 'You now wield a lamp.');
    assert.equal(replay.getRngLog().length, rngCalls);
    assert.deepEqual(
        game.command_queue[CQ_CANNED].map((node) => ({
            typ: node.typ,
            command: node.ec_entry?.ef_txt,
            key: node.key,
        })),
        [
            // cmdq_add_ec() stores dorub's extcmdlist row, whose public
            // command spelling is "rub".
            { typ: CMDQ_EXTCMD, command: 'rub', key: undefined },
            // cmdq_add_key() stores the selected lamp's existing inventory
            // letter so the continuation does not prompt the player again.
            { typ: CMDQ_KEY, command: undefined, key: lamp.invlet },
        ],
    );
    assert.ok(failClosedCommandRefusals().includes(UnsupportedApplyError));
});

test('wield_tool keeps other lamp types outside this slice', async () => {
    await runSegment(segmentThroughWish());
    const lamp = inventoryObject(MAGIC_LAMP);
    assert.ok(lamp, 'the debug wish created the lamp used for this boundary');
    // apply.c routes oil lamps through the same wield_tool() call, but the
    // queued slice explicitly leaves oil and brass lamp behavior unported.
    // Reusing the wished tool with OIL_LAMP's source type selects that case
    // without adding a second debug wish or another input sequence.
    lamp.otyp = OIL_LAMP;
    await assert.rejects(
        () => wield_tool(lamp, 'rub', game),
        /wield_tool\(\) with a non-magic lamp/u,
    );
    assert.notEqual(game.uwep, lamp);
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

test('rub is admitted when dorub queues its own continuation', () => {
    // apply.c:1808 queues dorub itself rather than a command key. rhack()
    // dispatches that extcmdlist row on the following turn, so the temporary
    // JS command-admission boundary must admit the row's public name.
    assert.ok(ADMITTED_COMMANDS.includes('rub'));
});

test('the complete #rub wield recipe stops before the lamp effect',
    () => withSerializedGrids(async () => {
        let boundary = null;
        const replay = await runSegment(
            loadRubLampWieldRecipe().segments[0],
            { onBoundary: (error) => { boundary = error; } },
        );

        // apply.c:1806-1813 spends one turn after wielding, then the queued
        // dorub consumes the canned `o` and reaches apply.c:1817. The first
        // unported effect would be rn2(3), so the refusal must identify the
        // already-wielded lamp and leave the matched 2,128-call prefix intact.
        // The branch subclass intentionally retains its parent's public
        // `name`; cmd.js documents the distinction as constructor identity.
        assert.equal(boundary?.name, 'UnsupportedHeroCommandBoundaryError');
        assert.match(boundary?.message ?? '', /already-wielded lamp/u);
        assert.equal(game.moves, 2);
        assert.equal(replay.getRngLog().length, 2128);
        assert.equal(replay.getScreens().length, 22);
        assert.equal(replay.getCursors().length, 22);
        // Digests cover every serialized cell attribute and cursor triple in
        // the independently chosen seed-731 prefix through the wield turn.
        assert.equal(
            digest(replay.getScreens()),
            'bc4082ded29c99eefbdfa577efbed1afedc47e27562da6e25cc859494e90dd3d',
        );
        assert.equal(
            digest(replay.getCursors()),
            'b53ca793b9d2201bcac07499740bcd3d08087211d4510343f4f69e23244d31b0',
        );
        assert.equal(game.uwep?.otyp, MAGIC_LAMP);
        assert.equal(game.uwep?.invlet, 'o');
        assert.equal(game.uwep?.owornmask & W_WEP, W_WEP);
        assert.equal(game.unweapon, true);
        assert.equal(game.context.pendingCommand, undefined);
        assert.equal(game.command_queue[CQ_CANNED].length, 0);
    }));

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
