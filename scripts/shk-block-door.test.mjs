// shk.c block_door() (5791-5821) and block_entry() (5823-5858) test
// IS_SHOP(roomno) with the room number, so C reads svr.rooms[index + 3]
// instead of the shop's own room. These tests play each recipe under
// recipes/shk.c/ up to the diagonal step it checks, then call the function
// twice: once with the slot C reads left as the level made it (an ordinary
// room, so no block), and once with that slot turned into a shop (so the
// shopkeeper blocks, as C would on a level whose room index + 3 is a shop).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { OROOM, ROOMOFFSET, SHOPBASE } from '../js/const.js';
import { block_door, block_entry } from '../js/shk.js';

function memoryStorage() {
    const values = new Map();
    return {
        getItem: (key) => (values.has(key) ? values.get(key) : null),
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
        get length() { return values.size; },
        key: (index) => [...values.keys()][index] ?? null,
    };
}

// Plays the recipe's single segment without its last `dropKeys` keys.
async function playRecipePrefix(name, dropKeys) {
    const recipe = JSON.parse(readFileSync(
        new URL(`../recipes/shk.c/${name}.session.json`, import.meta.url),
        'utf8',
    ));
    const segment = recipe.segments[0];
    await runSegment({
        seed: segment.seed,
        datetime: segment.datetime,
        nethackrc: segment.nethackrc,
        moves: segment.moves.slice(0, -dropKeys),
        storage: memoryStorage(),
    });
    return game;
}

// Calls `call` with `slot`'s rtype set to `rtype`, then restores it.
async function withSlotRtype(slot, rtype, call) {
    const saved = slot.rtype;
    slot.rtype = rtype;
    try {
        return await call();
    } finally {
        slot.rtype = saved;
    }
}

test('block_entry() reads the room three slots past the shop', async () => {
    // The recipe ends "bs": drop both, leaving the hero on the broken door
    // at (7,5) with a pick-axe and the shopkeeper at home on (6,5).
    const state = await playRecipePrefix(
        'block-entry-broken-door-pick-axe-diagonal', 2,
    );
    assert.deepEqual([state.u.ux, state.u.uy], [7, 5]);
    // The general store is room index 0, so its room number is ROOMOFFSET
    // and C's IS_SHOP(roomno) reads svr.rooms[3].
    const shopRoomno = state.level.at(6, 6).roomno;
    assert.equal(shopRoomno, ROOMOFFSET);
    const slot = state.level.rooms[shopRoomno];
    assert.equal(slot.rtype, OROOM);

    const messages = [];
    const message = async (text) => { messages.push(text); };
    // (6,6) is the diagonal step 'b' into the shop: y == shk.y + 1.
    assert.equal(await block_entry(6, 6, state, { message }), false);
    assert.deepEqual(messages, []);

    // SHOPBASE is the lowest shop rtype; any shop in that slot passes.
    const blocked = await withSlotRtype(
        slot, SHOPBASE, () => block_entry(6, 6, state, { message }),
    );
    assert.equal(blocked, true);
    assert.equal(messages.length, 1);
    assert.match(messages[0], / blocks your way!$/u);
});

test('block_door() reads the room three slots past the shop', async () => {
    // The recipe ends "us": drop both, leaving the hero inside on (9,7)
    // with an unpaid food ration and the shopkeeper at home on (9,6).
    const state = await playRecipePrefix(
        'block-door-broken-door-unpaid-diagonal', 2,
    );
    assert.deepEqual([state.u.ux, state.u.uy], [9, 7]);
    // (10,6) is the shop's broken door, the diagonal step 'u'.
    const shopRoomno = state.level.at(9, 7).roomno;
    assert.equal(shopRoomno, ROOMOFFSET);
    const slot = state.level.rooms[shopRoomno];
    assert.equal(slot.rtype, OROOM);

    const messages = [];
    const message = async (text) => { messages.push(text); };
    assert.equal(await block_door(10, 6, state, { message }), false);
    assert.deepEqual(messages, []);

    const blocked = await withSlotRtype(
        slot, SHOPBASE, () => block_door(10, 6, state, { message }),
    );
    assert.equal(blocked, true);
    assert.equal(messages.length, 1);
    assert.match(messages[0], / blocks your way!$/u);
});
