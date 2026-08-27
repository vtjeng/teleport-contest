import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMITTED_COMMANDS, failClosedCommandRefusals } from '../js/cmd.js';
import {
    ECMD_CANCEL,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    POTION_CLASS,
    POT_WATER,
    SCROLL_CLASS,
    SCR_IDENTIFY,
    SPBOOK_CLASS,
    SPE_FORCE_BOLT,
} from '../js/objects.js';
import { doread, read_ok, UnsupportedReadError } from '../js/read.js';
import {
    ESCAPE_KEY,
    INVALID_LETTER,
    loadReadCommandRecipe,
    READ_KEY,
    SPACE_KEY,
    WAIT,
} from './run-read-command.mjs';

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

function pendingTopLine() {
    return game._pending_message ?? '';
}

function firstSegment() {
    return loadReadCommandRecipe().segments[0];
}

function inventorySnapshot(state = game) {
    const objects = [];
    for (let obj = state.invent; obj; obj = obj.nobj) {
        objects.push(structuredClone({ ...obj, nobj: null }));
    }
    return objects;
}

test('read_ok suggests scrolls and spellbooks and downplays other objects',
    () => {
    // read.c:313-322. The null object is excluded. A scroll and a spellbook
    // take the two suggested classes, while every other class remains
    // selectable but absent from the prompt's suggested-letter set.
    assert.equal(read_ok(null), GETOBJ_EXCLUDE);
    assert.equal(
        read_ok({ otyp: SCR_IDENTIFY, oclass: SCROLL_CLASS }),
        GETOBJ_SUGGEST,
    );
    assert.equal(
        read_ok({ otyp: SPE_FORCE_BOLT, oclass: SPBOOK_CLASS }),
        GETOBJ_SUGGEST,
    );
    assert.equal(
        read_ok({ otyp: POT_WATER, oclass: POTION_CLASS }),
        GETOBJ_DOWNPLAY,
    );
});

test('read is admitted and selected objects stop before pickup_prev changes',
    async () => {
    assert.ok(ADMITTED_COMMANDS.includes('read'));
    assert.ok(failClosedCommandRefusals().includes(UnsupportedReadError));

    // The opening wait reaches the running game's real inventory. The first
    // scroll or spellbook is a valid getobj() answer regardless of the
    // Wizard's shuffled object descriptions.
    const segment = firstSegment();
    await runSegment({ ...segment, moves: WAIT });
    let selected = game.invent;
    while (selected && selected.oclass !== SCROLL_CLASS
        && selected.oclass !== SPBOOK_CLASS) selected = selected.nobj;
    assert.ok(selected, 'the Wizard starts with something readable');
    selected.pickup_prev = 1;
    game.nhDisplay.pushKey(selected.invlet.charCodeAt(0));
    await assert.rejects(
        () => doread(game),
        /selected readable object/u,
    );
    assert.equal(selected.pickup_prev, 1);
});

test('an invalid read letter retries and Escape cancels without taking time',
    async () => {
    const segment = firstSegment();
    const baselineReplay = await runSegment({ ...segment, moves: WAIT });
    const waited = game.moves;
    const rngCalls = baselineReplay.getRngLog().length;
    const inventory = inventorySnapshot();

    // The invalid z prints getobj()'s retry line. Space dismisses --More--,
    // Escape answers the repeated prompt, and the final wait proves that the
    // read itself did not consume a turn.
    const cancelledReplay = await runSegment({
        ...segment,
        moves: `${WAIT}${READ_KEY}${INVALID_LETTER}`
            + `${SPACE_KEY}${ESCAPE_KEY}`,
    });
    assert.equal(pendingTopLine(), 'Never mind.');
    assert.equal(game.moves, waited);
    assert.equal(cancelledReplay.getRngLog().length, rngCalls);
    assert.deepEqual(inventorySnapshot(), inventory);

    await runSegment({ ...segment, moves: `${WAIT}${READ_KEY}` });
    assert.match(topLine(), /^What do you want to read\?/u);

    // A direct cancellation returns the exact result doread() hands rhack().
    await runSegment({ ...segment, moves: WAIT });
    game.nhDisplay.pushKey(ESCAPE_KEY.charCodeAt(0));
    game.gk ??= {};
    game.gk.known = true;
    assert.equal(await doread(game), ECMD_CANCEL);
    assert.equal(game.gk.known, false);
});
