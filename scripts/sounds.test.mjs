import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEAF,
    HALLUC,
    HALLUC_RES,
    ROOMOFFSET,
    SHOPBASE,
    VAULT,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { COIN_CLASS } from '../js/objects.js';
import { parseNethackrc } from '../js/options.js';
import {
    dosoundsInitialLevel,
    UnsupportedAmbientSoundError,
} from '../js/sounds.js';

function soundState() {
    const uprops = [];
    uprops[DEAF] = { intrinsic: 0, extrinsic: 0 };
    uprops[HALLUC] = { intrinsic: 0, extrinsic: 0 };
    uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
    return {
        flags: { acoustics: true },
        level: new GameMap(),
        u: {
            uinwater: false,
            urooms: [0, 0, 0, 0, 0],
            uroleplay: { deaf: false },
            uprops,
            uswallow: false,
            uz: { dnum: 0, dlevel: 1 },
        },
    };
}

function scriptedRandom(results) {
    const bounds = [];
    return {
        random(bound) {
            bounds.push(bound);
            assert.ok(results.length, `unexpected rn2(${bound})`);
            return results.shift();
        },
        assertBoundsSoFar(expected) {
            assert.deepEqual(bounds, expected);
        },
        assertBounds(expected) {
            assert.deepEqual(bounds, expected);
            assert.deepEqual(results, []);
        },
    };
}

function messageSink() {
    const messages = [];
    return {
        messages,
        async pline(message) {
            messages.push(message);
        },
    };
}

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

async function runSounds(state, results) {
    const script = scriptedRandom(results);
    const sink = messageSink();
    await dosoundsInitialLevel(state, {
        random: script.random,
        pline: sink.pline,
    });
    return { script, messages: sink.messages };
}

test('dosounds returns before drawing when hearing is unavailable', async () => {
    const states = [];

    const deaf = soundState();
    deaf.u.uprops[DEAF].intrinsic = 1;
    states.push(deaf);

    const roleplayDeaf = soundState();
    roleplayDeaf.u.uroleplay.deaf = true;
    states.push(roleplayDeaf);

    const acousticsOff = soundState();
    acousticsOff.flags.acoustics = false;
    states.push(acousticsOff);

    const swallowed = soundState();
    swallowed.u.uswallow = true;
    states.push(swallowed);

    const underwater = soundState();
    underwater.u.uinwater = true;
    states.push(underwater);

    for (const state of states) {
        state.level.flags.nfountains = 1;
        const { script, messages } = await runSounds(state, []);
        script.assertBounds([]);
        assert.deepEqual(messages, []);
    }
});

test('valued false acoustics options suppress the first sound draw', async () => {
    for (const value of ['false', 'no', 'off', '0']) {
        const state = soundState();
        state.flags = parseNethackrc(`OPTIONS=acoustics:${value}`).flags;
        state.level.flags.nfountains = 1;
        const { script, messages } = await runSounds(state, []);
        script.assertBounds([]);
        assert.deepEqual(messages, [], value);
    }
});

test('dosounds preserves fountain and sink gate and selection order', async () => {
    const state = soundState();
    state.level.flags.nfountains = 1;
    state.level.flags.nsinks = 1;

    // Zero hits each ambient gate; 2 and 1 select the third fountain and
    // second sink messages respectively.
    const { script, messages } = await runSounds(state, [0, 2, 0, 1]);
    script.assertBounds([400, 3, 300, 2]);
    assert.deepEqual(messages, [
        'You hear the splashing of a naiad.',
        'You hear a gurgling noise.',
    ]);
});

test('dosounds awaits each message before drawing for the next branch', async () => {
    const state = soundState();
    state.level.flags.nfountains = 1;
    state.level.flags.nsinks = 1;
    // Both zeroes hit their gates; selections 2 and 1 choose the third
    // fountain and second sink messages.
    const script = scriptedRandom([0, 2, 0, 1]);
    const fountain = deferred();
    const sink = deferred();
    const gates = [fountain, sink];
    const messages = [];
    let completed = false;
    const execution = dosoundsInitialLevel(state, {
        random: script.random,
        pline(message) {
            messages.push(message);
            return gates[messages.length - 1].promise;
        },
    }).then(() => { completed = true; });

    await flushMicrotasks();
    script.assertBoundsSoFar([400, 3]);
    assert.deepEqual(messages, ['You hear the splashing of a naiad.']);
    assert.equal(completed, false);

    fountain.resolve();
    await flushMicrotasks();
    script.assertBounds([400, 3, 300, 2]);
    assert.deepEqual(messages, [
        'You hear the splashing of a naiad.',
        'You hear a gurgling noise.',
    ]);
    assert.equal(completed, false);

    sink.resolve();
    await execution;
    assert.equal(completed, true);
});

test('dosounds applies hallucination only when it is not resisted', async () => {
    const hallucinating = soundState();
    hallucinating.level.flags.nfountains = 1;
    hallucinating.u.uprops[HALLUC].intrinsic = 1;

    // The fountain gate hits and selection 2 shifts to the hallucination-only
    // fourth message.
    let result = await runSounds(hallucinating, [0, 2]);
    result.script.assertBounds([400, 3]);
    assert.deepEqual(result.messages, ['You hear a soda fountain!']);

    const resisted = soundState();
    resisted.level.flags.nfountains = 1;
    resisted.u.uprops[HALLUC].intrinsic = 1;
    resisted.u.uprops[HALLUC_RES].extrinsic = 1;

    // The same selection remains the ordinary third message when resisted.
    result = await runSounds(resisted, [0, 2]);
    result.script.assertBounds([400, 3]);
    assert.deepEqual(result.messages, [
        'You hear the splashing of a naiad.',
    ]);
});

function vaultState({ gold = false, subroom = false } = {}) {
    const state = soundState();
    const room = {
        // A 2-by-2 room keeps the inclusive source scan easy to verify.
        lx: 2,
        hx: 3,
        ly: 4,
        hy: 5,
        roomnoidx: 0,
        rtype: VAULT,
    };
    if (subroom) {
        state.level.rooms = [];
        state.level.nroom = 0;
        state.subrooms = [room];
    } else {
        state.level.rooms = [room];
        state.level.nroom = 1;
    }
    state.level.flags.has_vault = true;
    if (gold) {
        // The far upper corner protects both inclusive source scan bounds.
        state.level.objects[3][5] = {
            oclass: COIN_CLASS,
            nexthere: null,
        };
    }
    return state;
}

test('dosounds reports the source vault messages from floor gold', async () => {
    const withGold = vaultState({ gold: true });
    // Zero hits the 1-in-200 vault gate; 1 selects the gold-aware message.
    let result = await runSounds(withGold, [0, 1]);
    result.script.assertBounds([200, 2]);
    assert.deepEqual(result.messages, [
        'You hear someone counting gold coins.',
    ]);

    const withoutGold = vaultState();
    // The same selection falls back to the searching message without coins.
    result = await runSounds(withoutGold, [0, 1]);
    result.script.assertBounds([200, 2]);
    assert.deepEqual(result.messages, ['You hear someone searching.']);

    const hallucinating = vaultState({ gold: true });
    hallucinating.u.uprops[HALLUC].intrinsic = 1;
    // Hallucination shifts selection 1 to the source's case 2 message.
    result = await runSounds(hallucinating, [0, 1]);
    result.script.assertBounds([200, 2]);
    assert.deepEqual(result.messages, ['You hear Ebenezer Scrooge!']);
});

test('dosounds finds a vault in the separate subroom array', async () => {
    const state = vaultState({ gold: true, subroom: true });
    // Zero hits the vault gate; selection 1 requests the gold-aware message.
    const result = await runSounds(state, [0, 1]);
    result.script.assertBounds([200, 2]);
    assert.deepEqual(result.messages, [
        'You hear someone counting gold coins.',
    ]);
});

test('dosounds suppresses vault noise around its occupant or guard', async () => {
    const occupied = vaultState({ gold: true });
    occupied.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
    // The gate hits, but gd_sound() prevents the selection draw in the vault.
    let result = await runSounds(occupied, [0]);
    result.script.assertBounds([200]);
    assert.deepEqual(result.messages, []);

    const guarded = vaultState({ gold: true });
    guarded.level.monlist = {
        isgd: false,
        nmon: {
            isgd: true,
            mextra: { egd: { gdlevel: { ...guarded.u.uz } } },
            nmon: null,
        },
    };
    // A same-level guard behind a non-guard still suppresses selection.
    result = await runSounds(guarded, [0]);
    result.script.assertBounds([200]);
    assert.deepEqual(result.messages, []);
});

test('dosounds clears a stale vault flag at the source gate', async () => {
    const state = soundState();
    state.level.flags.has_vault = true;

    // Zero reaches search_special(VAULT), which finds no room in this state.
    const { script, messages } = await runSounds(state, [0]);
    script.assertBounds([200]);
    assert.equal(state.level.flags.has_vault, false);
    assert.deepEqual(messages, []);
});

// Runs dosounds() expecting a refusal, and reports everything the refusal
// position has to leave untouched: the draws taken, the messages printed, and
// the level flags.
async function refusedSounds(state, results) {
    const script = scriptedRandom(results);
    const sink = messageSink();
    const flagsBefore = { ...state.level.flags };
    let error = null;
    try {
        await dosoundsInitialLevel(state, {
            random: script.random,
            pline: sink.pline,
        });
    } catch (caught) {
        error = caught;
    }
    return { error, script, messages: sink.messages, flagsBefore };
}

test('dosounds refuses each unported branch by name, in source order',
    async () => {
        const fountainCourt = soundState();
        fountainCourt.level.flags.nfountains = 1;
        fountainCourt.level.flags.has_court = true;
        // One misses the earlier fountain gate before the court boundary.
        let refusal = await refusedSounds(fountainCourt, [1]);
        assert.ok(refusal.error instanceof UnsupportedAmbientSoundError);
        assert.equal(refusal.error.name, 'UnsupportedAmbientSoundError');
        assert.equal(refusal.error.message,
            'dosounds() needs the has_court level-sound branch');
        // The refusal precedes sounds.c:226's own rn2(200) court gate, so the
        // fountain draw is the only one taken, nothing is printed, and the
        // level flags are as they were.
        refusal.script.assertBounds([400]);
        assert.deepEqual(refusal.messages, []);
        assert.deepEqual(fountainCourt.level.flags, refusal.flagsBefore);

        const vaultBeehive = vaultState();
        vaultBeehive.level.flags.has_beehive = true;
        // One misses the earlier vault gate before the beehive boundary.
        refusal = await refusedSounds(vaultBeehive, [1]);
        assert.ok(refusal.error instanceof UnsupportedAmbientSoundError);
        assert.equal(refusal.error.message,
            'dosounds() needs the has_beehive level-sound branch');
        refusal.script.assertBounds([200]);
        assert.deepEqual(refusal.messages, []);
        assert.deepEqual(vaultBeehive.level.flags, refusal.flagsBefore);

        // Oracle branch is ported: sink gate misses, Oracle rn2(400) gate
        // misses (non-zero), function completes normally with no message.
        const sinkOracle = soundState();
        sinkOracle.level.flags.nsinks = 1;
        sinkOracle.oracle_level = { ...sinkOracle.u.uz };
        refusal = await refusedSounds(sinkOracle, [1, 1]);
        assert.equal(refusal.error, null);
        refusal.script.assertBounds([300, 400]);
        assert.deepEqual(refusal.messages, []);
        assert.deepEqual(sinkOracle.level.flags, refusal.flagsBefore);
    });

// Creates a minimal state where has_shop is set and a tended shop exists.
// The shopkeeper (resident) is placed at (5, 5) inside a room whose roomno is
// ROOMOFFSET + 0 = 3. The hero is at (20, 10), outside the shop.
function shopState({ tended = true } = {}) {
    const state = soundState();
    const roomnoidx = 0;
    const roomno = roomnoidx + ROOMOFFSET;
    const room = {
        lx: 3,
        hx: 7,
        ly: 3,
        hy: 7,
        roomnoidx,
        rtype: SHOPBASE, // general store
    };
    if (tended) {
        room.resident = {
            isshk: true,
            mx: 5,
            my: 5,
            mhp: 10,
            mextra: {
                eshk: {
                    shoplevel: { ...state.u.uz },
                    shoproom: roomno,
                },
            },
        };
        // Place the shopkeeper on the map so in_rooms() finds it in the shop.
        state.level.locations[5][5].roomno = roomno;
    } else {
        room.resident = null;
    }
    state.level.rooms = [room, { hx: -1 }];
    state.level.nroom = 1;
    state.level.flags.has_shop = true;
    return state;
}

test('dosounds plays the shop sound when a tended shop exists', async () => {
    const state = shopState();
    // rn2(200) = 0 hits the shop gate; rn2(2) = 0 selects the first message.
    const result = await runSounds(state, [0, 0]);
    result.script.assertBounds([200, 2]);
    assert.deepEqual(result.messages, [
        'You hear someone cursing shoplifters.',
    ]);
});

test('dosounds selects the cash register message for shop sounds', async () => {
    const state = shopState();
    // rn2(200) = 0 hits the shop gate; rn2(2) = 1 selects the second message.
    const result = await runSounds(state, [0, 1]);
    result.script.assertBounds([200, 2]);
    assert.deepEqual(result.messages, [
        'You hear the chime of a cash register.',
    ]);
});

test('dosounds selects the hallucination shop message', async () => {
    const state = shopState();
    state.u.uprops[HALLUC].intrinsic = 1;
    // rn2(200) = 0 hits the shop gate; rn2(2) = 1, shifted by hallu = 1,
    // selects shop_msg[2] -- the hallucination message.
    const result = await runSounds(state, [0, 1]);
    result.script.assertBounds([200, 2]);
    assert.deepEqual(result.messages, [
        'You hear Neiman and Marcus arguing!',
    ]);
});

test('dosounds is silent for an untended shop', async () => {
    const state = shopState({ tended: false });
    // rn2(200) = 0 hits the shop gate; tended_shop returns false, so no draw
    // for the message index and no message.
    const result = await runSounds(state, [0]);
    result.script.assertBounds([200]);
    assert.deepEqual(result.messages, []);
});

test('dosounds is silent when the hero is inside the shop', async () => {
    const state = shopState();
    // The hero is currently in the shop room.
    state.u.ushops = [ROOMOFFSET, 0, 0, 0, 0];
    // rn2(200) = 0 hits the shop gate; the ushops check suppresses the
    // message, so no rn2(2) draw occurs.
    const result = await runSounds(state, [0]);
    result.script.assertBounds([200]);
    assert.deepEqual(result.messages, []);
});

test('dosounds clears a stale shop flag when no shop room exists', async () => {
    const state = soundState();
    state.level.flags.has_shop = true;
    // rn2(200) = 0 hits the shop gate; search_special(ANY_SHOP) finds nothing.
    const { script, messages } = await runSounds(state, [0]);
    script.assertBounds([200]);
    assert.equal(state.level.flags.has_shop, false);
    assert.deepEqual(messages, []);
});

test('dosounds returns after the shop gate even without a message', async () => {
    // An untended shop still returns before later branches.
    const state = shopState({ tended: false });
    state.level.flags.has_temple = true;
    // rn2(200) = 0 hits the shop gate; the untended shop produces no message.
    // The temple flag would cause a refusal if shop did not return first.
    const result = await runSounds(state, [0]);
    result.script.assertBounds([200]);
    assert.deepEqual(result.messages, []);
});
