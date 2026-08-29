import assert from 'node:assert/strict';
import test from 'node:test';

import { CHEST, ICE_BOX, LARGE_BOX } from '../js/objects.js';
import { ECMD_OK } from '../js/const.js';
import { container_at, dotip } from '../js/pickup.js';
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
