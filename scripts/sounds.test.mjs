import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEAF,
    HALLUC,
    HALLUC_RES,
    ROOMOFFSET,
    VAULT,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { COIN_CLASS } from '../js/objects.js';
import { parseNethackrc } from '../js/options.js';
import { dosoundsInitialLevel } from '../js/sounds.js';

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

test('dosounds stops at each unported branch in source order', async () => {
    const fountainCourt = soundState();
    fountainCourt.level.flags.nfountains = 1;
    fountainCourt.level.flags.has_court = true;
    // One misses the earlier fountain gate before the court boundary.
    let script = scriptedRandom([1]);
    await assert.rejects(
        dosoundsInitialLevel(fountainCourt, {
            random: script.random,
            pline: async () => {},
        }),
        /unported later-level branch \(has_court\)/u,
    );
    script.assertBounds([400]);

    const vaultBeehive = vaultState();
    vaultBeehive.level.flags.has_beehive = true;
    // One misses the earlier vault gate before the beehive boundary.
    script = scriptedRandom([1]);
    await assert.rejects(
        dosoundsInitialLevel(vaultBeehive, {
            random: script.random,
            pline: async () => {},
        }),
        /unported later-level branch \(has_beehive\)/u,
    );
    script.assertBounds([200]);

    const sinkOracle = soundState();
    sinkOracle.level.flags.nsinks = 1;
    sinkOracle.oracle_level = { ...sinkOracle.u.uz };
    // One misses the earlier sink gate before the final Oracle boundary.
    script = scriptedRandom([1]);
    await assert.rejects(
        dosoundsInitialLevel(sinkOracle, {
            random: script.random,
            pline: async () => {},
        }),
        /unported later-level branch \(Oracle\)/u,
    );
    script.assertBounds([300]);
});
