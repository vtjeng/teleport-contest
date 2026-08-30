import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AMULET_OF_YENDOR, BAG_OF_HOLDING, CHEST, ICE_BOX, LARGE_BOX, LEASH,
    LOADSTONE, TOOL_CLASS, WEAPON_CLASS,
} from '../js/objects.js';
import { ECMD_TIME, SELL_NORMAL, W_ARM } from '../js/const.js';
import {
    container_at,
    doloot,
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
            oclass: 6, /* TOOL_CLASS */
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

test('doloot with unlocked container enters use_container and quits',
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // Place an unlocked ice box under the hero. use_container() should
        // prompt the player; answer 'q' to quit immediately.
        placeFloorObjects(state, [
            { otyp: ICE_BOX, olocked: 0 },
        ]);

        clearTtyMessageWindow(state);

        // Push 'q' to answer the "Do what with <container>?" prompt, then
        // 'n' for the directional loot question afterward.
        state.nhDisplay.pushKey('q'.charCodeAt(0));
        state.nhDisplay.pushKey('n'.charCodeAt(0));

        const result = await doloot(state);
        assert.equal(result, 0, 'doloot returns ECMD_OK (0) when quit');
        // 'q' exits immediately with no action, so no time passed.
        // The container's lknown is set; cknown stays 0 because nothing
        // was viewed or transferred (used === ECMD_OK, so containerdone
        // does not set cknown).
        const cobj = state.level.objects[ux][uy];
        assert.equal(cobj.lknown, 1,
            'lknown should be set after entering use_container');
        assert.equal(cobj.cknown, 0,
            'cknown stays 0 when quitting without viewing');
    });

test('use_container sets abort_looting on quit and clears current_container',
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // Place an empty unlocked large box under the hero.
        // C ref: pickup.c:3127-3128.  'q' sets abort_looting TRUE before
        // containerdone resets current_container to null.
        placeFloorObjects(state, [
            { otyp: LARGE_BOX, olocked: 0 },
        ]);

        clearTtyMessageWindow(state);

        // 'q' quits; 'n' answers the directional loot question.
        state.nhDisplay.pushKey('q'.charCodeAt(0));
        state.nhDisplay.pushKey('n'.charCodeAt(0));

        await doloot(state);

        // abort_looting set when the player presses 'q'.
        // C ref: pickup.c:3127.
        assert.equal(state.ga.abort_looting, true,
            'abort_looting should be true after pressing q');
        // containerdone clears current_container to avoid stale pointers.
        // C ref: pickup.c:3221-3222.
        assert.equal(state.gc.current_container, null,
            'current_container should be null after containerdone');
        // sellobj_state(SELL_NORMAL) resets the sell state.
        // C ref: shk.c:3921. deliberate == SELL_NORMAL (0), so
        // sell_response = 'a' (automatic) and sell_how = SELL_NORMAL.
        assert.equal(state.gs.sell_how, SELL_NORMAL,
            'sellobj_state should reset sell_how to SELL_NORMAL');
        assert.equal(state.gs.sell_response, 'a',
            'sellobj_state should set sell_response to auto-accept');
    });

test('viewing an empty container via : sets cknown and takes time',
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // Place an empty unlocked chest.  Viewing an empty container sets
        // cknown=1 (the player now knows it is empty) and the C source
        // counts this as ECMD_TIME because the player gained information.
        // C ref: pickup.c:3119-3121 sets used=ECMD_TIME when cknown is
        // initially false.
        placeFloorObjects(state, [
            { otyp: CHEST, olocked: 0 },
        ]);

        clearTtyMessageWindow(state);

        // ':' views, then the empty-container message sets TOPLINE_NEED_MORE.
        // The next yn_function call dismisses the pending message (consuming
        // a space), then reads 'q' from the queue.
        state.nhDisplay.pushKey(':'.charCodeAt(0));
        state.nhDisplay.pushKey(' '.charCodeAt(0)); // dismiss "is empty" msg
        state.nhDisplay.pushKey('q'.charCodeAt(0));
        state.nhDisplay.pushKey('n'.charCodeAt(0));

        const result = await doloot(state);

        const cobj = state.level.objects[ux][uy];
        // container_contents sets cknown when it inspects the box.
        // C ref: end.c:1606-1607.
        assert.equal(cobj.cknown, 1,
            'cknown should be 1 after viewing');
        // containerdone also sets cknown when used != ECMD_OK.
        // C ref: pickup.c:3209-3215.
        // used was set to ECMD_TIME (1) by the ':' view path.
        assert.equal(result, 1,
            'viewing empty container should return ECMD_TIME');
    });

// The non-empty container_contents path (sorted item display and
// xwaitforspace menu dismissal) is validated by the differential test
// with seed 42, where the C and JS PRNG logs match exactly (3368 calls).
// A unit test for that path requires a complete game-state container
// object whose doname_with_price does not trigger the shop-pricing
// boundary (OBJ_CONTAINED items fail assertPricedObjectNameable), so
// the differential serves as its validation.

test("'o' on an empty container prints empty message and sets cknown",
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // Place an empty, unlocked bag of holding under the hero.
        // C ref: pickup.c:3137-3143.  The 'o' answer on an empty container
        // prints the emptymsg, sets cknown=1, and counts as ECMD_TIME when
        // cknown was initially false (the hero gained information).
        placeFloorObjects(state, [
            { otyp: BAG_OF_HOLDING, olocked: 0 },
        ]);

        clearTtyMessageWindow(state);

        // 'o' attempts take-out on the empty bag.
        // 'n' answers the directional loot question afterward.
        state.nhDisplay.pushKey('o'.charCodeAt(0));
        state.nhDisplay.pushKey(' '.charCodeAt(0)); // dismiss pending msg
        state.nhDisplay.pushKey('n'.charCodeAt(0));

        const result = await doloot(state);

        const cobj = state.level.objects[ux][uy];
        assert.equal(cobj.cknown, 1,
            'cknown should be 1 after observing the bag is empty');
        assert.equal(result, ECMD_TIME,
            // ECMD_TIME because the hero learned the bag is empty.
            'should return ECMD_TIME for discovering empty bag');
        const toplines = state.nhDisplay?.toplines ?? '';
        assert.ok(toplines.includes('is empty'),
            `expected "is empty" in top line but got "${toplines}"`);
    });

// -- in_container rejection tests --
// These use doloot on an unlocked floor container and answer 'i' to trigger
// the put-in path through traditional_loot -> askchain -> in_container.

test("'i' on empty container with no inventory prints nothing-to-put-in",
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // Place an unlocked large box under the hero.
        placeFloorObjects(state, [
            { otyp: LARGE_BOX, olocked: 0 },
        ]);

        // MENU_TRADITIONAL so yn_function accepts 'i' as a hidden char.
        // In MENU_FULL (default), in_or_out_menu omits 'i' when inokay is
        // false and this path is unreachable.
        state.flags.menu_style = 0; /* MENU_TRADITIONAL */

        clearTtyMessageWindow(state);

        // Remove all inventory except the container (which is on the floor,
        // not carried, so invent is independent). Null the invent chain so
        // inokay is false.
        state.invent = null;

        // 'i' attempts put-in, but with no inventory, the "nothing to put
        // in" message prints and loot_in is cleared (C: 3157-3161).
        // ' ' dismisses the "is empty" message that prints from the outmaybe
        // path. Then 'n' for directional loot.
        state.nhDisplay.pushKey('i'.charCodeAt(0));
        state.nhDisplay.pushKey(' '.charCodeAt(0)); // dismiss message
        state.nhDisplay.pushKey('n'.charCodeAt(0));

        const result = await doloot(state);
        const toplines = state.nhDisplay?.toplines ?? '';
        // C: "You don't have anything to put in." when invent is null.
        assert.ok(toplines.includes("don't have anything to put in"),
            `expected "don't have anything to put in" in "${toplines}"`);
    });

test("'i' puts an inventory item into an unlocked floor container",
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // Place an unlocked large box under the hero.
        const box = placeFloorObjects(state, [
            { otyp: LARGE_BOX, olocked: 0 },
        ]);

        // Set menu_style to MENU_TRADITIONAL (0) so the loot path uses
        // traditional_loot() instead of the unported menu_loot().
        // C default is MENU_FULL, but the development sessions use
        // menustyle:traditional via the nethackrc.
        state.flags.menu_style = 0; /* MENU_TRADITIONAL */

        clearTtyMessageWindow(state);

        // Replace the hero's inventory with a single synthetic tool item
        // (quan=1, not worn, not wielded). This avoids askchain's uppercase
        // 'N' count prompt (unsupported for quan >= 2) and rejection
        // messages for worn or quest items.
        const synthItem = {
            otyp: LEASH, // leashmon=0 so in_container won't reject it
            oclass: TOOL_CLASS,
            quan: 1,
            owt: 12,
            invlet: 'z',
            where: 3, /* OBJ_INVENT */
            nobj: null,
            nexthere: null,
            ocontainer: null,
            o_id: 80001,
            dknown: 1,
            bknown: 1,
            rknown: 0,
            known: 0,
            oartifact: 0,
            no_charge: false,
            cursed: 0,
            blessed: 0,
            spe: 0,
            corpsenm: 0,
            oeroded: 0,
            oeroded2: 0,
            oerodeproof: 0,
            owornmask: 0,
            lamplit: 0,
            leashmon: 0, // not leashed, so in_container allows it
            unpaid: 0,
            age: 0,
            globby: 0,
            onamelth: 0,
            oextra: null,
            recharged: 0,
            pickup_prev: false,
        };
        state.invent = synthItem;
        // Clear wielded weapon and accessories so they don't interfere.
        state.uwep = null;
        state.uswapwep = null;
        state.uquiver = null;

        // Answer 'i' to enter the put-in path. query_classes prompts
        // "What kinds of thing do you want to stash? [)m]" even for a
        // single class because 'm' makes iletct > 1 (C: 176-177).
        // Answer 'a' (all) + Enter, then askchain prompts
        // "Put in: <item>? [ynaq]" for the single item. Answer 'y'.
        state.nhDisplay.pushKey('i'.charCodeAt(0));
        // getlin response: 'a' for all, then Enter.
        state.nhDisplay.pushKey('a'.charCodeAt(0));
        state.nhDisplay.pushKey('\r'.charCodeAt(0));
        // askchain prompt: 'y' to put in.
        state.nhDisplay.pushKey('y'.charCodeAt(0));
        // askchain prints "That was all." after the single item.
        // Dismiss messages: "You put X into Y" and "That was all.".
        for (let i = 0; i < 5; i++)
            state.nhDisplay.pushKey(' '.charCodeAt(0));
        state.nhDisplay.pushKey('n'.charCodeAt(0)); // directional loot

        const result = await doloot(state);
        // The transfer should take time.
        assert.equal(result, ECMD_TIME,
            'putting an item in should return ECMD_TIME');
        // The container should now have contents.
        assert.ok(box.cobj !== null,
            'container should have contents after put-in');
        const toplines = state.nhDisplay?.toplines ?? '';
        assert.ok(toplines.includes('You put'),
            `expected "You put" in "${toplines}"`);
    });

// -- stash_one ('s') tests --
// These exercise the stash_one path: use_container 's' answer -> getobj
// (stash_ok callback) -> in_container.

test("'s' with no inventory prints nothing-to-stash",
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // Place an unlocked large box under the hero.
        placeFloorObjects(state, [
            { otyp: LARGE_BOX, olocked: 0 },
        ]);

        // MENU_TRADITIONAL so yn_function accepts 's' as a hidden char.
        // In MENU_FULL (default), in_or_out_menu omits 's' when inokay is
        // false and this path is unreachable.
        state.flags.menu_style = 0; /* MENU_TRADITIONAL */

        clearTtyMessageWindow(state);

        // Clear inventory so inokay is false. The guard at C:3157-3161
        // prints "You don't have anything to stash." and clears stash_one
        // before the getobj prompt is reached.
        state.invent = null;

        // 's' triggers the stash path; the nothing-to-stash message
        // dismisses with a space, then 'n' for directional loot.
        state.nhDisplay.pushKey('s'.charCodeAt(0));
        state.nhDisplay.pushKey(' '.charCodeAt(0));
        state.nhDisplay.pushKey('n'.charCodeAt(0));

        const result = await doloot(state);
        const toplines = state.nhDisplay?.toplines ?? '';
        // C: "You don't have anything to stash."
        assert.ok(toplines.includes("don't have anything to stash"),
            `expected "don't have anything to stash" in "${toplines}"`);
    });

test("'s' stashes a single inventory item into a floor container",
    async () => {
        const state = await heroOnCleanSquare();
        const { ux, uy } = state.u;

        // Place an unlocked large box under the hero. C ref: pickup.c:3174-3186.
        // The 's' answer enters the stash_one path, which calls getobj with
        // stash_ok as the callback, then passes the chosen item to
        // in_container. stash_ok (C: 2957-2969) excludes the container
        // itself via ck_bag and suggests everything else.
        const box = placeFloorObjects(state, [
            { otyp: LARGE_BOX, olocked: 0 },
        ]);

        state.flags.menu_style = 0; /* MENU_TRADITIONAL */

        clearTtyMessageWindow(state);

        // Replace inventory with a single leash (TOOL_CLASS, quan=1, not
        // worn). A single suggested item makes getobj show the prompt
        // "What do you want to stash? [z or ?*]". invlet is a string
        // character, matching the JS port's convention (inventoryLetter
        // returns String.fromCharCode).
        const synthItem = {
            otyp: LEASH,
            oclass: TOOL_CLASS,
            quan: 1,
            owt: 12,
            invlet: 'z',
            where: 3, /* OBJ_INVENT */
            nobj: null,
            nexthere: null,
            ocontainer: null,
            o_id: 80002,
            dknown: 1,
            bknown: 1,
            rknown: 0,
            known: 0,
            oartifact: 0,
            no_charge: false,
            cursed: 0,
            blessed: 0,
            spe: 0,
            corpsenm: 0,
            oeroded: 0,
            oeroded2: 0,
            oerodeproof: 0,
            owornmask: 0,
            lamplit: 0,
            leashmon: 0,
            unpaid: 0,
            age: 0,
            globby: 0,
            onamelth: 0,
            oextra: null,
            recharged: 0,
            pickup_prev: false,
        };
        state.invent = synthItem;
        state.uwep = null;
        state.uswapwep = null;
        state.uquiver = null;

        // 's' enters stash_one. getobj prompts; answer 'z' to pick the
        // leash. in_container transfers it. Then dismiss messages and
        // answer 'n' for directional loot.
        state.nhDisplay.pushKey('s'.charCodeAt(0));
        state.nhDisplay.pushKey('z'.charCodeAt(0)); // getobj: pick leash
        for (let i = 0; i < 5; i++)
            state.nhDisplay.pushKey(' '.charCodeAt(0)); // dismiss messages
        state.nhDisplay.pushKey('n'.charCodeAt(0)); // directional loot

        const result = await doloot(state);

        // The stash took time.
        assert.equal(result, ECMD_TIME,
            'stashing an item should return ECMD_TIME');
        // The container should now have contents.
        assert.ok(box.cobj !== null,
            'container should have contents after stash');
        const toplines = state.nhDisplay?.toplines ?? '';
        assert.ok(toplines.includes('You put'),
            `expected "You put" in "${toplines}"`);
    });
