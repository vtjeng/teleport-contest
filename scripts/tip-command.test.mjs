import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CHEST, DAGGER, LARGE_BOX, WEAPON_CLASS,
} from '../js/objects.js';
import { ECMD_OK, ECMD_TIME, OBJ_CONTAINED } from '../js/const.js';
import { dotip } from '../js/pickup.js';
import { count_contents } from '../js/invent.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

// A fresh state placed by runSegment with the hero on a known square.
// Seed 5501900 produces a Valkyrie on a clean square with no pets and
// no autopickup, matching the loot-command tests.
async function heroOnCleanSquare() {
    await runSegment({
        seed: 5501900,
        datetime: '20330607081011',
        nethackrc: 'OPTIONS=name:Tipper,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!acoustics,!autopickup',
        moves: '',
    });
    return game;
}

// Builds a minimal floor-object chain at the hero's position.
// Each entry is { otyp, olocked, lknown, broken }.
function placeFloorObjects(state, specs) {
    const { ux, uy } = state.u;
    let head = null;
    // Build the chain in reverse so the first spec is the head.
    for (let i = specs.length - 1; i >= 0; i--) {
        const s = specs[i];
        head = {
            otyp: s.otyp,
            oclass: 6, /* TOOL_CLASS */
            olocked: s.olocked ?? 0,
            obroken: s.obroken ?? 0,
            lknown: s.lknown ?? 0,
            cknown: 0,
            cobj: null,
            nexthere: head,
            nobj: null,
            quan: 1,
            owt: 100,
            ox: ux,
            oy: uy,
            o_id: 70000 + i,
            where: 7, /* OBJ_FLOOR */
            dknown: 1,
            bknown: 1,
            rknown: 0,
            known: 0,
            invlet: 0,
            oartifact: 0,
            no_charge: false,
            cursed: 0,
            blessed: 0,
            spe: 0,
            corpsenm: 0,
            oeroded: 0,
            oeroded2: 0,
            oerodeproof: 0,
            globby: 0,
            onamelth: 0,
            oextra: null,
            unpaid: 0,
            age: 0,
            recharged: 0,
        };
    }
    state.level.objects[ux][uy] = head;
    return head;
}

// -- dotip single-container quit tests --

test('dotip with a single container prompts ynq and quit returns ECMD_OK',
    async () => {
        const state = await heroOnCleanSquare();

        // Place a single broken chest under the hero. The witnessed C path
        // has dotip() find one floor container, prompt "There is <name>
        // here, tip it? [ynq] (q)", and the player answers 'q'.
        // C ref: pickup.c:3601-3611.
        placeFloorObjects(state, [
            { otyp: CHEST, obroken: 1 },
        ]);

        clearTtyMessageWindow(state);

        // Push 'q' to answer the ynq prompt.
        state.nhDisplay.pushKey('q'.charCodeAt(0));

        const result = await dotip(state);
        assert.equal(result, ECMD_OK,
            'dotip returns ECMD_OK when the player answers q');
        // The toplines should contain the prompt text.
        const toplines = state.nhDisplay?.toplines ?? '';
        assert.ok(toplines.includes('here, tip it?'),
            `expected "here, tip it?" in "${toplines}"`);
    });

test('dotip with a single container and answer n falls through to inventory path',
    async () => {
        const state = await heroOnCleanSquare();

        // Place a single large box. The player answers 'n' to skip the
        // floor container, which makes dotip() fall through to the
        // inventory tipping path (unported), producing an error.
        // C ref: pickup.c:3612-3613.
        placeFloorObjects(state, [
            { otyp: LARGE_BOX },
        ]);

        clearTtyMessageWindow(state);

        // Push 'n' to decline the floor container.
        state.nhDisplay.pushKey('n'.charCodeAt(0));

        // The inventory tipping path is unported, so dotip() throws.
        await assert.rejects(
            () => dotip(state),
            (err) => {
                assert.ok(err.message.includes('inventory tipping'),
                    `expected "inventory tipping" in "${err.message}"`);
                return true;
            },
            'dotip should throw on the unported inventory tipping path',
        );
    });

test('dotip with no floor containers falls through to inventory path',
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // No containers on the floor.
        state.level.objects[ux][uy] = null;

        clearTtyMessageWindow(state);

        // dotip() should skip the floor-container block and reach the
        // unported inventory tipping path.
        await assert.rejects(
            () => dotip(state),
            (err) => {
                assert.ok(err.message.includes('inventory tipping'),
                    `expected "inventory tipping" in "${err.message}"`);
                return true;
            },
            'dotip should throw on the unported inventory tipping path',
        );
    });

// -- count_contents tests --

// Helper: builds a container with N stacks of items inside.
// Each inner item is a minimal object in the container's cobj chain.
function containerWithItems(n, otyp = CHEST) {
    let head = null;
    for (let i = n - 1; i >= 0; i--) {
        head = {
            otyp: 1, /* arbitrary non-container type */
            oclass: 1,
            quan: i + 1, /* distinct quan values to test quantity mode */
            nobj: head,
            cobj: null,
            unpaid: 0,
            no_charge: false,
            where: OBJ_CONTAINED,
        };
    }
    return {
        otyp,
        oclass: 6,
        cobj: head,
        where: 7, /* OBJ_FLOOR */
    };
}

test('count_contents counts stacks with everything=true, quantity=false', () => {
    // C ref: objnam.c:1377 calls count_contents(obj, FALSE, FALSE, TRUE,
    // FALSE) to count stacks for the "containing N items" suffix. Each
    // stack counts as 1 regardless of its quan.
    const box = containerWithItems(4);
    const count = count_contents(box, false, false, true, false);
    assert.equal(count, 4,
        'four stacks counted as four items (one per stack)');
});

test('count_contents counts individual items with everything=true, quantity=true', () => {
    // When quantity=true, each stack contributes its quan instead of 1.
    // Our helper gives items quan values 1, 2, 3, 4 for a total of 10.
    const box = containerWithItems(4);
    const count = count_contents(box, false, true, true, false);
    assert.equal(count, 10,
        'four stacks with quan 1+2+3+4 = 10 individual items');
});

test('count_contents returns 0 for an empty container', () => {
    const box = containerWithItems(0);
    const count = count_contents(box, false, false, true, false);
    assert.equal(count, 0, 'empty container has no stacks');
});

// -- dotip y-branch tests --

test('dotip y-branch with empty container prints the empty message',
    async () => {
        // Place an empty unlocked chest under the hero and answer 'y' to
        // the tip prompt. tipcontainer_gettarget shows a PICK_ONE menu
        // with "on the floor" preselected; pressing Enter accepts it.
        // tipcontainer_checks finds the chest empty and prints "It's
        // empty." C ref: pickup.c:4047-4050.
        const state = await heroOnCleanSquare();

        const { ux, uy } = state.u;
        placeFloorObjects(state, [
            { otyp: CHEST, obroken: 1 },
        ]);
        clearTtyMessageWindow(state);

        // Keys: 'y' (accept ynq), Enter (accept preselected "on the floor").
        state.nhDisplay.pushKey('y'.charCodeAt(0));
        state.nhDisplay.pushKey(13); // Enter

        const result = await dotip(state);
        // C ref: pickup.c:3614-3616. dotip() calls tipcontainer(), which
        // calls tipcontainer_checks(). The empty check prints "It's empty."
        // and returns TIPCHECK_EMPTY, but tipcontainer() returns normally
        // and dotip() returns ECMD_TIME regardless.
        assert.equal(result, ECMD_TIME,
            'dotip returns ECMD_TIME after the tip attempt');
        // C ref: pickup.c:4047-4050 calls "You have to open %s to tip it."
        // for locked, then check for empty which prints "%s is empty."
        // with the container name.
        const toplines = state.nhDisplay?.toplines ?? '';
        assert.ok(toplines.includes('is empty'),
            `expected "is empty" in toplines: "${toplines}"`);
    });

test('dotip y-branch with items spills them to the floor',
    async () => {
        // Place a chest containing two items under the hero and answer 'y'
        // to tip it. After confirming "on the floor" with Enter, the items
        // spill out with terse formatting. The chest ends up empty.
        // C ref: pickup.c:3752-3829.
        const state = await heroOnCleanSquare();

        const { ux, uy } = state.u;
        // Build a chest with two daggers inside. DAGGER (otyp 34) uses
        // WEAPON_CLASS (2), which donameFresh can format. Each dagger
        // weighs 10 and has quan 1.
        const item2 = {
            otyp: DAGGER, oclass: WEAPON_CLASS, quan: 1, nobj: null,
            cobj: null, where: OBJ_CONTAINED, unpaid: 0, no_charge: false,
            invlet: 0, o_id: 80002, dknown: 1, bknown: 0, rknown: 0,
            known: 0, oartifact: 0, cursed: 0, blessed: 0, spe: 0,
            corpsenm: 0, oeroded: 0, oeroded2: 0, oerodeproof: 0,
            owt: 10, age: 0, recharged: 0, oextra: null, onamelth: 0,
            globby: 0, how_lost: 0, ox: ux, oy: uy, nexthere: null,
            obroken: 0, olocked: 0, lknown: 0, tknown: 0, otrapped: 0,
            cknown: 0,
        };
        const item1 = {
            ...item2, o_id: 80001, nobj: item2, quan: 1,
        };
        const chest = placeFloorObjects(state, [
            { otyp: CHEST, obroken: 1 },
        ]);
        chest.cobj = item1;
        item1.ocontainer = chest;
        item2.ocontainer = chest;

        clearTtyMessageWindow(state);

        // Keys: 'y' (accept ynq), Enter (accept "on the floor"),
        // then spaces to dismiss any --More-- prompts from the spill output.
        state.nhDisplay.pushKey('y'.charCodeAt(0));
        state.nhDisplay.pushKey(13); // Enter
        for (let i = 0; i < 5; i++) state.nhDisplay.pushKey(32); // spaces

        const result = await dotip(state);
        assert.equal(result, ECMD_TIME,
            'dotip returns ECMD_TIME after tipping items out');
        assert.equal(chest.cobj, null,
            'chest is empty after tipping (all items spilled)');
        assert.equal(chest.cknown, 1,
            'cknown is set after tipping (player knows contents)');
    });
