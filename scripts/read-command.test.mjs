import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMITTED_COMMANDS, failClosedCommandRefusals } from '../js/cmd.js';
import {
    COLNO,
    CORR,
    ECMD_CANCEL,
    ECMD_TIME,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    ROOMOFFSET,
    ROWNO,
    SCORR,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    POTION_CLASS,
    POT_WATER,
    SCROLL_CLASS,
    SCR_IDENTIFY,
    SCR_MAGIC_MAPPING,
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
import {
    loadReadMagicMappingRecipe,
    MAP_READ_LETTER,
    MAP_READ_MORE,
    MAP_READ_WAIT,
} from './run-read-magic-mapping.mjs';

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

test('an uncursed magic-mapping scroll maps the ordinary level and is used up',
    async () => {
    const segment = {
        ...loadReadMagicMappingRecipe().segments[0], moves: MAP_READ_WAIT,
    };
    const replay = await runSegment(segment);
    const scroll = inventorySnapshot().find(
        (obj) => obj.otyp === SCR_MAGIC_MAPPING,
    );
    assert.equal(scroll?.invlet, 'j');
    assert.equal(scroll?.blessed, false);
    assert.equal(scroll?.cursed, false);
    const movesBefore = game.moves;
    const rngBefore = replay.getRngLog().length;
    const literateBefore = game.u.uconduct.literate;
    let secretCorridor;
    let mappedRoom;
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const location = game.level.at(x, y);
            if (!secretCorridor && location.typ === SCORR)
                secretCorridor = { x, y };
            if (!mappedRoom && location.roomno >= ROOMOFFSET)
                mappedRoom = { index: location.roomno - ROOMOFFSET };
        }
    }
    assert.ok(secretCorridor, 'the fixed seed has a secret corridor to map');
    assert.ok(mappedRoom, 'the fixed seed has an ordinary room to remember');

    // j answers getobj(). Space dismisses the disappearance message before
    // seffect_magic_mapping() prints the coalescing-map message.
    game.nhDisplay.pushKey(MAP_READ_LETTER.charCodeAt(0));
    game.nhDisplay.pushKey(MAP_READ_MORE.charCodeAt(0));
    assert.equal(await doread(game), ECMD_TIME);

    assert.equal(game.moves, movesBefore);
    assert.equal(replay.getRngLog().length, rngBefore + 2);
    assert.equal(game.u.uconduct.literate, literateBefore + 1);
    assert.equal(game.gk.known, true);
    assert.equal(game.objects[SCR_MAGIC_MAPPING].oc_name_known, 1);
    assert.equal(
        inventorySnapshot().some((obj) => obj.otyp === SCR_MAGIC_MAPPING),
        false,
    );
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y)
            assert.equal(game.level.at(x, y).seenv, 0xff);
    }
    // detect.c show_map_spot() reveals secret corridors, and
    // dungeon.c room_discovered() updates the canonical mapseen record before
    // recalc_mapseen() derives overview state.
    assert.equal(
        game.level.at(secretCorridor.x, secretCorridor.y).typ,
        CORR,
    );
    const mapseen = game.svm.mapseenchn.find((entry) =>
        entry.lev.dnum === game.u.uz.dnum
        && entry.lev.dlevel === game.u.uz.dlevel);
    assert.equal(mapseen.msrooms[mappedRoom.index].seen, 1);
    assert.deepEqual(Object.keys(mapseen.feat).sort(), [
        'ice', 'lava', 'msalign', 'naltar', 'nfount', 'ngrave', 'nshop',
        'nsink', 'ntemple', 'nthrone', 'ntree', 'shoptype', 'water',
    ]);
});

test('magic mapping remains consumed and mapped through the next command',
    async () => {
    const recipe = loadReadMagicMappingRecipe();
    const baselineSegment = {
        ...recipe.segments[0], moves: MAP_READ_WAIT,
    };
    await runSegment(baselineSegment);
    const baselineMoves = game.moves;

    await runSegment(recipe.segments[0]);
    // The complete input spends one read turn and one trailing wait beyond
    // the baseline's settling wait.
    assert.equal(game.moves, baselineMoves + 2);
    assert.equal(game.objects[SCR_MAGIC_MAPPING].oc_name_known, 1);
    assert.equal(
        inventorySnapshot().some((obj) => obj.otyp === SCR_MAGIC_MAPPING),
        false,
    );
    for (let x = 1; x < 80; ++x) {
        for (let y = 0; y < 21; ++y)
            assert.equal(game.level.at(x, y).seenv, 0xff);
    }
});
