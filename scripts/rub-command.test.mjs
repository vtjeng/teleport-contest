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
    loadRubLampNothingRecipe,
    loadRubLampSmokeRecipe,
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

async function prepareAlreadyWieldedMagicLamp() {
    await runSegment(segmentThroughWish());
    const lamp = inventoryObject(MAGIC_LAMP);
    assert.ok(lamp, 'the debug wish created a magic lamp');
    assert.ok(lamp.spe > 0, 'a wished-for magic lamp has a charge');

    // apply.c:1814 identifies the selected object and uwep by pointer. Setting
    // both references to this one inventory object reaches that source arm
    // without spending the preceding wield turn, which the integration case
    // below covers. Space dismisses the pending wish result before getobj()
    // consumes the lamp's existing inventory letter.
    game.uwep = lamp;
    lamp.owornmask |= W_WEP;
    game.nhDisplay.pushKey(SPACE_KEY.charCodeAt(0));
    game.nhDisplay.pushKey(lamp.invlet.charCodeAt(0));
    return lamp;
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

for (const { label, rolls, message } of [
    {
        label: 'smoke',
        // apply.c:1817 needs a nonzero result to retain the lamp. The following
        // rn2(2) result of 1 selects the sighted puff-of-smoke message.
        rolls: [2, 1],
        message: 'You see a puff of smoke.',
    },
    {
        label: 'nothing',
        // A different nonzero rn2(3) result reaches the same retained-lamp
        // branch. The following rn2(2) result of 0 selects nothing_happens.
        rolls: [1, 0],
        message: 'Nothing happens.',
    },
]) {
    test(`dorub's charged magic-lamp ${label} outcome retains the lamp`,
        async () => {
        const lamp = await prepareAlreadyWieldedMagicLamp();
        const originalLamp = structuredClone({ ...lamp, nobj: null });
        const bounds = [];
        const remainingRolls = [...rolls];
        const random = {
            rn2: (bound) => {
                bounds.push(bound);
                return remainingRolls.shift();
            },
        };

        assert.equal(await dorub(game, { random }), ECMD_TIME);
        assert.deepEqual(bounds, [3, 2]);
        assert.deepEqual(remainingRolls, []);
        assert.equal(game._pending_message, message);
        assert.deepEqual(
            structuredClone({ ...lamp, nobj: null }),
            originalLamp,
        );
        assert.equal(game.uwep, lamp);
    });
}

test('dorub keeps the magic-lamp release outcome fail-closed after its draw',
    async () => {
    await prepareAlreadyWieldedMagicLamp();
    const bounds = [];
    const random = {
        // apply.c:1817 interprets rn2(3) == 0 as the djinni-release arm. This
        // slice records that draw but must not enter its billing or mutations.
        rn2: (bound) => {
            bounds.push(bound);
            return 0;
        },
    };

    await assert.rejects(
        () => dorub(game, { random }),
        /releasing a djinni from a magic lamp/u,
    );
    assert.deepEqual(bounds, [3]);
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

for (const {
    label, loadRecipe, message, moves, rngCalls, screenDigest, cursorDigest,
} of [
    {
        label: 'smoke',
        loadRecipe: loadRubLampSmokeRecipe,
        message: 'You now wield a lamp.  You see a puff of smoke.',
        // Seed 731 spends the wield turn, the rub-effect turn, and one
        // following monster turn before the input recipe ends.
        moves: 3,
        // These counts and digests cover the complete seed-731 fresh case.
        rngCalls: 2149,
        screenDigest:
            '3d35a4ade0c38299c65e20a17f3088d6a2f0dc04a1fb42d7fb788a17f0cdcde9',
        cursorDigest:
            'a4c601d01644b4b2a7ce982ed1ed4c282d083dd0029e77335af6dc40ebb8e80a',
    },
    {
        label: 'nothing happens',
        loadRecipe: loadRubLampNothingRecipe,
        message: 'You now wield a lamp.  Nothing happens.',
        // Seed 743 has one more intervening monster action than seed 731
        // before the recorder reaches the same post-effect input boundary.
        moves: 4,
        // These counts and digests cover the complete seed-743 fresh case.
        rngCalls: 2723,
        screenDigest:
            '6f595f6979aca8c0f4d0143e440bd26fc3e6d6007e0b7928862d47061bd34c1f',
        cursorDigest:
            '4d236e1e538e65dfe4debf475f9ce9fccc6e77d67a5c09e75092f5edc52d912f',
    },
]) {
    test(`the complete #rub recipe reaches the ${label} result`,
        () => withSerializedGrids(async () => {
        let boundary = null;
        const replay = await runSegment(
            loadRecipe().segments[0],
            { onBoundary: (error) => { boundary = error; } },
        );

        // apply.c:1806-1835 spends the wield turn, drains the canned rub and
        // lamp letter, preserves both RNG calls, and retains the charged lamp.
        assert.equal(boundary, null);
        assert.equal(game.moves, moves);
        assert.equal(replay.getRngLog().length, rngCalls);
        // Both fresh cases finish with 23 complete screens and cursors. Their
        // digests cover every serialized cell attribute and cursor triple.
        assert.equal(replay.getScreens().length, 23);
        assert.equal(replay.getCursors().length, 23);
        assert.equal(digest(replay.getScreens()), screenDigest);
        assert.equal(digest(replay.getCursors()), cursorDigest);
        assert.equal(game.nhDisplay.toplines, message);
        assert.equal(game.uwep?.otyp, MAGIC_LAMP);
        assert.equal(game.uwep?.spe, 1);
        assert.equal(game.uwep?.invlet, 'o');
        assert.equal(game.uwep?.owornmask & W_WEP, W_WEP);
        assert.equal(game.unweapon, true);
        assert.equal(game.context.pendingCommand, undefined);
        assert.equal(game.command_queue[CQ_CANNED].length, 0);
    }));
}

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
