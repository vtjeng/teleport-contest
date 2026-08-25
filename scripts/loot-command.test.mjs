import assert from 'node:assert/strict';
import test from 'node:test';

import { CHEST, ICE_BOX, LARGE_BOX } from '../js/objects.js';
import {
    container_at,
    doloot,
    UnsupportedPickupError,
} from '../js/pickup.js';
import { isContainer } from '../js/obj.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

// A fresh state placed by runSegment with the hero on a known square.
async function heroOnCleanSquare() {
    await runSegment({
        seed: 5501900,
        datetime: '20330607081011',
        nethackrc: 'OPTIONS=name:Looter,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!acoustics,!autopickup',
        moves: '',
    });
    return game;
}

// Builds a minimal floor-object chain at the hero's position.
// Each entry is { otyp, olocked, lknown }.
function placeFloorObjects(state, specs) {
    const { ux, uy } = state.u;
    let head = null;
    // Build the chain in reverse so the first spec is the head.
    for (let i = specs.length - 1; i >= 0; i--) {
        const s = specs[i];
        head = {
            otyp: s.otyp,
            oclass: 8, /* TOOL_CLASS */
            olocked: s.olocked ?? 0,
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

// -- container_at unit tests --

test('container_at counts containers on a square', async () => {
    const state = await heroOnCleanSquare();
    const { ux, uy } = state.u;

    // Empty square: no containers.
    state.level.objects[ux][uy] = null;
    // C ref: pickup.c:2024-2038. An empty square should return 0.
    assert.equal(container_at(ux, uy, true, state), 0,
        'empty square has 0 containers');
    assert.equal(container_at(ux, uy, false, state), 0,
        'empty square (countem=false) has 0 containers');

    // One chest (otyp 215, a container per obj.h Is_container()): count 1.
    placeFloorObjects(state, [{ otyp: CHEST }]);
    assert.equal(container_at(ux, uy, true, state), 1,
        'one chest -> count 1');
    assert.equal(container_at(ux, uy, false, state), 1,
        'one chest (countem=false) -> count 1');

    // Chest and ice box (otyp 216): count 2 when counting all.
    placeFloorObjects(state, [
        { otyp: CHEST, olocked: 1 },
        { otyp: ICE_BOX },
    ]);
    assert.equal(container_at(ux, uy, true, state), 2,
        'chest + ice box -> count 2');
    // countem=false stops at the first container found.
    assert.equal(container_at(ux, uy, false, state), 1,
        'chest + ice box (countem=false) -> count 1 (early exit)');
});

// -- isContainer boundary check --

test('isContainer matches the C range LARGE_BOX..BAG_OF_TRICKS', () => {
    // C ref: obj.h Is_container(). LARGE_BOX=214, BAG_OF_TRICKS=220.
    // Verify that the isContainer predicate container_at() uses matches.
    assert.ok(isContainer({ otyp: LARGE_BOX }),
        'LARGE_BOX is a container');
    assert.ok(isContainer({ otyp: CHEST }),
        'CHEST is a container');
    assert.ok(isContainer({ otyp: ICE_BOX }),
        'ICE_BOX is a container');
    assert.ok(!isContainer({ otyp: LARGE_BOX - 1 }),
        'otyp below LARGE_BOX is not a container');
    assert.ok(!isContainer({ otyp: 221 }),
        'otyp 221 (above BAG_OF_TRICKS) is not a container');
});

// -- doloot direct-call tests --
// These tests call doloot() directly on existing game state. The state is
// from a completed runSegment, so the message window carries a pending
// display. clearTtyMessageWindow() resets it so ttyPline can print without
// needing keystroke dismissal.

test('doloot with a single locked chest (lknown=0) prints "Hmmm" message',
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // Place a locked chest under the hero. lknown=0 causes the "Hmmm"
        // variant of the locked message.
        // C ref: pickup.c:2108-2109.
        const chest = placeFloorObjects(state, [
            { otyp: CHEST, olocked: 1, lknown: 0 },
        ]);

        // Clear pending message so ttyPline does not attempt dismissal.
        clearTtyMessageWindow(state);

        // doloot() should find the locked chest, print the message, and
        // set lknown = 1. The locked container returns ECMD_OK (no time).
        const result = await doloot(state);
        assert.equal(result, 0, 'locked container -> ECMD_OK');
        assert.equal(chest.lknown, 1,
            'lknown set to 1 after discovering the lock');
        const toplines = state.nhDisplay?.toplines ?? '';
        assert.ok(toplines.includes('turns out to be locked'),
            `expected "turns out to be locked" in "${toplines}"`);
    });

test('doloot with a single locked chest (lknown=1) prints "is locked"',
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // Place a locked chest with lknown=1 under the hero. C uses the
        // "The chest is locked." message variant.
        // C ref: pickup.c:2107.
        placeFloorObjects(state, [
            { otyp: CHEST, olocked: 1, lknown: 1 },
        ]);

        clearTtyMessageWindow(state);

        const result = await doloot(state);
        assert.equal(result, 0, 'locked container -> ECMD_OK');
        const toplines = state.nhDisplay?.toplines ?? '';
        assert.ok(toplines.includes('is locked'),
            `expected "is locked" in "${toplines}"`);
        assert.ok(!toplines.includes('Hmmm'),
            'should not include "Hmmm" when lock is already known');
    });

test('doloot with unlocked container throws at use_container boundary',
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // Place an unlocked ice box under the hero. do_loot_cont() should
        // set lknown=1 and then throw at the use_container() boundary.
        placeFloorObjects(state, [
            { otyp: ICE_BOX, olocked: 0 },
        ]);

        clearTtyMessageWindow(state);

        await assert.rejects(
            () => doloot(state),
            (err) => {
                assert.ok(err instanceof UnsupportedPickupError,
                    'should throw UnsupportedPickupError');
                assert.ok(err.message.includes('use_container'),
                    `expected "use_container" in "${err.message}"`);
                return true;
            },
            'unlocked container should hit use_container boundary',
        );
    });
