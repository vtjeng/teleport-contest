import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ADMITTED_COMMANDS,
    cmdq_peek,
    failClosedCommandRefusals,
} from '../js/cmd.js';
import {
    A_WIS,
    CMDQ_KEY,
    COLNO,
    CORR,
    CQ_REPEAT,
    ECMD_CANCEL,
    ECMD_OK,
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
    SCR_TELEPORTATION,
    SPBOOK_CLASS,
    SPE_FORCE_BOLT,
    SPE_HEALING,
} from '../js/objects.js';
import { doread, read_ok, UnsupportedReadError } from '../js/read.js';
import { not_fully_identified } from '../js/objnam.js';
import { initRng } from '../js/rng.js';
import { UnsupportedSpellStudyError } from '../js/spell.js';
import {
    READ_MORE as CONFUSED_TELEPORT_MORE,
    confusedTeleportSetupMoves,
    loadReadConfusedTeleportRecipe,
} from './run-read-confused-teleport.mjs';
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
import {
    HEALING_BOOK_LETTER,
    HEALING_MESSAGE_MORE,
    HEALING_READ_COMMAND,
    HEALING_READ_WAIT,
    HEALING_REFRESH_DECLINE,
    loadReadKnownHealingRecipe,
} from './run-read-known-healing.mjs';

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

async function prepareUnknownIdentifyScroll() {
    const segment = firstSegment();
    const replay = await runSegment({ ...segment, moves: WAIT });
    let scroll = game.invent;
    while (scroll && scroll.otyp !== SCR_IDENTIFY) scroll = scroll.nobj;
    assert.ok(scroll, 'the fixed Wizard starts with an identify scroll');

    scroll.quan = 1;
    scroll.blessed = false;
    scroll.cursed = false;
    scroll.dknown = true;
    scroll.pickup_prev = true;
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj === scroll) continue;
        obj.known = true;
        obj.dknown = true;
        obj.bknown = true;
        obj.cknown = true;
        obj.lknown = true;
        obj.rknown = true;
        game.objects[obj.otyp].oc_name_known = 1;
        if (obj.oartifact) {
            game.artiexist ??= [];
            game.artiexist[obj.oartifact] ??= {};
            game.artiexist[obj.oartifact].found = true;
        }
    }
    game.objects[SCR_IDENTIFY].oc_name_known = 0;
    for (let i = 0; i < game.svd.disco.length; ++i) {
        if (game.svd.disco[i] === SCR_IDENTIFY) game.svd.disco[i] = 0;
    }
    assert.deepEqual(
        inventorySnapshot()
            .filter((obj) => obj.o_id !== scroll.o_id)
            .filter((obj) => not_fully_identified(obj, game))
            .map((obj) => obj.invlet),
        [],
    );
    return { replay, scroll };
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
    assert.deepEqual(mapseen.feat, {
        nfount: 0,
        nsink: 0,
        naltar: 0,
        nthrone: 0,
        ngrave: 0,
        ntree: 0,
        water: 0,
        lava: 0,
        ice: 0,
        nshop: 0,
        ntemple: 0,
        msalign: 0,
        shoptype: 0,
    });
});

test('an unknown identify scroll reports a fully identified remaining pack',
    async () => {
    const { replay, scroll } = await prepareUnknownIdentifyScroll();

    // This constructed pack isolates read.c seffect_identify()'s zero-item
    // identify_pack() arm. Quantity one makes useup() remove the selected
    // scroll, and every remaining object has each objnam.c identification
    // hallmark so count_unidentified() returns zero after that removal.
    // Unknown is the meaningful identify-scroll branch. Removing any stale
    // discovery entry keeps the setup equivalent to read.c's
    // `already_known = FALSE` arm rather than depending on this seed's pack.

    const movesBefore = game.moves;
    const rngBefore = replay.getRngLog().length;
    const literateBefore = game.u.uconduct.literate;
    const scoreBefore = game.u.urexp;
    const remainingIds = inventorySnapshot()
        .filter((obj) => obj.o_id !== scroll.o_id)
        .map((obj) => obj.o_id);

    // The first Space advances from the disappearance line to the scroll's
    // identity; the second advances to the already-identified-pack line.
    game.nhDisplay.pushKey(scroll.invlet.charCodeAt(0));
    game.nhDisplay.pushKey(SPACE_KEY.charCodeAt(0));
    game.nhDisplay.pushKey(SPACE_KEY.charCodeAt(0));
    assert.equal(await doread(game), ECMD_TIME);

    // read.c spends one Wisdom exercise draw before seffect_identify().
    // learnscrolltyp() spends the second when it credits discovery, and this
    // seed's nonzero ordinary rn2(5) result avoids the optional fourth draw.
    assert.equal(game.moves, movesBefore);
    assert.equal(replay.getRngLog().length, rngBefore + 3);
    assert.equal(game.u.uconduct.literate, literateBefore + 1);
    // learnscrolltyp() awards 10 score-only points for a new scroll type.
    assert.equal(game.u.urexp, scoreBefore + 10);
    assert.equal(game.objects[SCR_IDENTIFY].oc_name_known, 1);
    assert.equal(scroll.pickup_prev, false);
    assert.equal(
        inventorySnapshot().some((obj) => obj.o_id === scroll.o_id),
        false,
    );
    assert.deepEqual(
        inventorySnapshot().map((obj) => obj.o_id),
        remainingIds,
    );
    assert.equal(
        pendingTopLine(),
        'You have already identified the rest of your possessions.',
    );
});

test('a confused blessed teleport scroll stops after its reading messages',
    async () => {
    const segment = loadReadConfusedTeleportRecipe().segments[0];
    const replay = await runSegment({
        ...segment,
        moves: confusedTeleportSetupMoves(),
    });
    let scroll = game.invent;
    while (scroll && scroll.otyp !== SCR_TELEPORTATION) scroll = scroll.nobj;
    assert.ok(scroll, 'the debug wish creates a teleportation scroll');
    assert.equal(scroll.blessed, true);
    assert.equal(scroll.cursed, false);

    const movesBefore = game.moves;
    const rngBefore = replay.getRngLog().length;
    const literateBefore = game.u.uconduct.literate;
    const wisdomExerciseBefore = game.u.aexe[A_WIS];

    // The first Space clears the wished-object line still pending from the
    // setup. The inventory letter then selects the one wished scroll. The
    // next two Spaces dismiss the disappearance and confused-reading lines
    // and reach the fail-closed level_tele() boundary.
    game.nhDisplay.pushKey(CONFUSED_TELEPORT_MORE.charCodeAt(0));
    game.nhDisplay.pushKey(scroll.invlet.charCodeAt(0));
    game.nhDisplay.pushKey(CONFUSED_TELEPORT_MORE.charCodeAt(0));
    game.nhDisplay.pushKey(CONFUSED_TELEPORT_MORE.charCodeAt(0));
    await assert.rejects(
        () => doread(game),
        /level_tele\(\)/u,
    );

    assert.equal(game.moves, movesBefore);
    assert.equal(replay.getRngLog().length, rngBefore + 1);
    assert.equal(game.u.uconduct.literate, literateBefore + 1);
    assert.equal(game.gk.known, false);
    assert.equal(scroll.pickup_prev, false);
    assert.equal(scroll.in_use, true);
    assert.ok(inventorySnapshot().some((obj) => obj.o_id === scroll.o_id));
    assert.equal(
        pendingTopLine(),
        'Being confused, you mispronounce the magic words...',
    );
    // attrib.c exercise() changes AEXE only when rn2(19) beats current Wisdom;
    // this seed's draw does, so the one source-required exercise point lands.
    assert.equal(game.u.aexe[A_WIS], wisdomExerciseBefore + 1);
});

test('ordinary identify preserves the conditional second rn2(5)', async () => {
    const { replay, scroll } = await prepareUnknownIdentifyScroll();
    // ISAAC seed 1 gives the two Wisdom-exercise draws 4 and 11, then makes
    // the first ordinary identify rn2(5) zero and the source-required second
    // rn2(5) four.
    initRng(1);
    const movesBefore = game.moves;
    game.nhDisplay.pushKey(scroll.invlet.charCodeAt(0));
    game.nhDisplay.pushKey(SPACE_KEY.charCodeAt(0));
    game.nhDisplay.pushKey(SPACE_KEY.charCodeAt(0));
    assert.equal(await doread(game), ECMD_TIME);
    assert.equal(game.moves, movesBefore);
    assert.deepEqual(replay.getRngLog(), [
        'rn2(19)=4',
        'rn2(19)=11',
        'rn2(5)=0',
        'rn2(5)=4',
    ]);
    assert.equal(
        pendingTopLine(),
        'You have already identified the rest of your possessions.',
    );
});

test('declining a fresh known healing spellbook refresh takes no turn',
    async () => {
    const segment = loadReadKnownHealingRecipe().segments[0];
    const replay = await runSegment({
        ...segment,
        moves: HEALING_READ_WAIT,
    });
    let book = game.invent;
    while (book && book.otyp !== SPE_HEALING) book = book.nobj;
    assert.ok(book, 'the fixed Priestess starts with healing');
    // u_init.c gives the known healing book inventory letter g. initialspell()
    // records 20,000 turns of retention; the leading wait ages it once to the
    // 19,999 asserted here while leaving it above KEEN / 10.
    assert.equal(book.invlet, HEALING_BOOK_LETTER);
    assert.ok(game.svs.spl_book.some(
        ({ sp_id, sp_know }) => sp_id === SPE_HEALING && sp_know === 19_999,
    ));

    book.pickup_prev = true;
    const inventoryBefore = inventorySnapshot();
    const movesBefore = game.moves;
    const rngBefore = replay.getRngLog().length;
    const literateBefore = game.u.uconduct.literate;

    // The inventory letter selects healing. Space dismisses the knowledge
    // message, and Escape selects the refresh question's default no answer.
    game.nhDisplay.pushKey(HEALING_BOOK_LETTER.charCodeAt(0));
    game.nhDisplay.pushKey(HEALING_MESSAGE_MORE.charCodeAt(0));
    game.nhDisplay.pushKey(HEALING_REFRESH_DECLINE.charCodeAt(0));
    assert.equal(await doread(game), ECMD_OK);

    assert.equal(game.moves, movesBefore);
    assert.equal(replay.getRngLog().length, rngBefore);
    assert.equal(game.u.uconduct.literate, literateBefore + 1);
    assert.equal(book.pickup_prev, false);
    assert.equal(book.in_use, false);
    // objects.h gives the level-1 healing spellbook oc_delay 2, so
    // study_book() stores its negation before asking about a refresh.
    assert.equal(game.context.spbook.delay, -2);
    assert.equal(game.objects[SPE_HEALING].oc_name_known, 1);
    assert.deepEqual(inventorySnapshot(), inventoryBefore.map((obj) => (
        obj.o_id === book.o_id ? { ...obj, pickup_prev: false } : obj
    )));
    assert.match(
        game._pending_message,
        /^Refresh your memory anyway\? \[yn\] \(n\) /u,
    );
    assert.deepEqual(cmdq_peek(CQ_REPEAT, game), {
        typ: CMDQ_KEY,
        key: 'n'.charCodeAt(0),
    });
});

test('accepting a known healing refresh stops before study state', async () => {
    const segment = loadReadKnownHealingRecipe().segments[0];
    const replay = await runSegment({
        ...segment,
        moves: HEALING_READ_WAIT,
    });
    let book = game.invent;
    while (book && book.otyp !== SPE_HEALING) book = book.nobj;
    assert.ok(book);
    const movesBefore = game.moves;
    const rngBefore = replay.getRngLog().length;
    const literateBefore = game.u.uconduct.literate;

    game.nhDisplay.pushKey(HEALING_BOOK_LETTER.charCodeAt(0));
    game.nhDisplay.pushKey(HEALING_MESSAGE_MORE.charCodeAt(0));
    game.nhDisplay.pushKey('y'.charCodeAt(0));
    await assert.rejects(
        () => doread(game),
        (error) => error instanceof UnsupportedSpellStudyError
            && error.branch === 'refreshing the known spell',
    );
    assert.equal(game.moves, movesBefore);
    assert.equal(replay.getRngLog().length, rngBefore);
    assert.equal(game.u.uconduct.literate, literateBefore + 1);
    assert.equal(game.context.spbook.delay, -2);
    assert.equal(game.context.spbook.book, null);
    assert.equal(book.in_use, false);
    assert.equal(game.go?.occupation ?? null, null);
    assert.deepEqual(cmdq_peek(CQ_REPEAT, game), {
        typ: CMDQ_KEY,
        key: 'y'.charCodeAt(0),
    });
});

test('the command wrapper retains an accepted refresh refusal for retry', async () => {
    const segment = loadReadKnownHealingRecipe().segments[0];
    let boundary = null;
    const replay = await runSegment({
        ...segment,
        moves: `${HEALING_READ_WAIT}${HEALING_READ_COMMAND}`
            + `${HEALING_BOOK_LETTER}${HEALING_MESSAGE_MORE}y`,
    }, { onBoundary: (error) => { boundary = error; } });
    let book = game.invent;
    while (book && book.otyp !== SPE_HEALING) book = book.nobj;

    assert.equal(boundary?.name, 'UnsupportedHeroCommandBoundaryError');
    assert.match(boundary?.message ?? '', /refreshing the known spell/u);
    assert.deepEqual(game.context.pendingCommand, {
        key: HEALING_READ_COMMAND.charCodeAt(0),
        commandCount: 0,
        lastCommandCount: 0,
        multi: 0,
    });
    assert.equal(game.context.spbook.delay, -2);
    assert.equal(book?.in_use, false);
    assert.equal(game.go?.occupation ?? null, null);
    // failClosedCommand() resets command variables before exposing a
    // retryable boundary, so the parsed command is retained but its partial
    // repeat answer is not.
    assert.equal(cmdq_peek(CQ_REPEAT, game), null);
    // Startup and the accepted prompt branch add no command-local draw.
    const acceptedRngCalls = replay.getRngLog().length;
    const baseline = await runSegment({
        ...segment,
        moves: HEALING_READ_WAIT,
    });
    assert.equal(acceptedRngCalls, baseline.getRngLog().length);
});

test('magic mapping fails closed on an unsupported special level', async () => {
    const segment = {
        ...loadReadMagicMappingRecipe().segments[0], moves: MAP_READ_WAIT,
    };
    await runSegment(segment);
    let scroll = game.invent;
    while (scroll && scroll.otyp !== SCR_MAGIC_MAPPING) scroll = scroll.nobj;
    assert.ok(scroll, 'the fixed fixture carries its mapping scroll');
    game.specialLevels.push({ dlevel: { ...game.u.uz }, flags: {} });
    const before = {
        pickup_prev: scroll.pickup_prev,
        in_use: scroll.in_use,
        literate: game.u.uconduct.literate,
    };
    game.nhDisplay.pushKey(MAP_READ_LETTER.charCodeAt(0));

    await assert.rejects(
        () => doread(game),
        /selected readable object branch/u,
    );
    assert.deepEqual({
        pickup_prev: scroll.pickup_prev,
        in_use: scroll.in_use,
        literate: game.u.uconduct.literate,
    }, before);
    assert.equal(
        inventorySnapshot().some((obj) => obj.otyp === SCR_MAGIC_MAPPING),
        true,
    );
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
