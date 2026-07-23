import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    BURN,
    DUST,
    ENGRAVE,
    FLYING,
    HOLE,
    ICE,
    LEVITATION,
    PIT,
    P_BASIC,
    P_RIDING,
    ROOM,
    TT_PIT,
} from '../js/const.js';
import {
    can_reach_floor,
    engr_at,
    make_engr_at,
    read_engr_at,
    wipe_engr_at,
    wipeout_text,
} from '../js/engrave.js';
import { encodeUtf8ByteString } from '../js/hacklib.js';
import {
    AD_STCK,
    AD_WRAP,
    AT_ENGL,
    AT_HUGS,
    M1_CLING,
    M1_FLY,
    M1_HIDE,
    MZ_HUGE,
    S_MIMIC,
} from '../js/monsters.js';

function scriptedRandom(script) {
    const remaining = [...script];
    return {
        random: {
            rn2(bound) {
                const expected = remaining.shift();
                assert.ok(expected, `unexpected rn2(${bound})`);
                assert.deepEqual(expected.slice(0, 2), ['rn2', bound]);
                assert.ok(expected[2] >= 0 && expected[2] < bound);
                return expected[2];
            },
            rnd(bound) {
                assert.fail(`unexpected rnd(${bound})`);
            },
        },
        done() {
            assert.deepEqual(remaining, []);
        },
    };
}

function noDrawRandom() {
    return {
        rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
    };
}

function nicheWipeScript() {
    return [
        // Index zero selects the unmapped 'a'; rubout zero makes it unreadable.
        ['rn2', 11, 0], ['rn2', 4, 0],
        // Index one selects 'd'; rubout one and replacement one choose '|'.
        ['rn2', 11, 1], ['rn2', 4, 1], ['rn2', 2, 1],
        // Index two is the embedded space. It still consumes both source draws.
        ['rn2', 11, 2], ['rn2', 4, 3],
        // Index ten selects 'm'; replacement one from "nr" is 'r'.
        ['rn2', 11, 10], ['rn2', 4, 1], ['rn2', 2, 1],
        // Index nine selects unmapped 'u', which becomes unreadable.
        ['rn2', 11, 9], ['rn2', 4, 2],
    ];
}

function floorReachState() {
    const uprops = [];
    uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[FLYING] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    const weaponSkills = [];
    weaponSkills[P_RIDING] = { skill: 0 };
    return {
        u: {
            ux: 12,
            uy: 6,
            uz: { dnum: 0, dlevel: 1 },
            uprops,
            weapon_skills: weaponSkills,
            uswallow: false,
            ustuck: null,
            usteed: null,
            uundetected: false,
            utrap: 0,
            utraptype: 0,
        },
        youmonst: {
            data: { mflags1: 0, msize: 2, mlet: 0, mattk: [] },
        },
        level: { traps: [] },
        air_level: { dnum: 5, dlevel: 1 },
        water_level: { dnum: 5, dlevel: 2 },
    };
}

test('can_reach_floor preserves swallow, hold, levitation, and riding gates', () => {
    const swallowed = floorReachState();
    swallowed.u.uswallow = true;
    assert.equal(can_reach_floor(true, swallowed), false);

    const held = floorReachState();
    held.u.ustuck = {
        data: { mattk: [{ aatyp: AT_HUGS, adtyp: 0 }] },
    };
    assert.equal(can_reach_floor(true, held), false);
    held.youmonst.data.mattk = [{ aatyp: 0, adtyp: AD_STCK }];
    assert.equal(can_reach_floor(true, held), true);
    held.youmonst.data.mattk = [{ aatyp: 0, adtyp: AD_WRAP }];
    assert.equal(can_reach_floor(true, held), true);
    held.youmonst.data.mattk = [{ aatyp: AT_ENGL, adtyp: AD_WRAP }];
    assert.equal(can_reach_floor(true, held), false);

    const levitating = floorReachState();
    levitating.u.uprops[LEVITATION].intrinsic = 1;
    assert.equal(can_reach_floor(true, levitating), false);
    levitating.u.uz = { ...levitating.air_level };
    assert.equal(can_reach_floor(true, levitating), true);
    levitating.u.uz = { ...levitating.water_level };
    assert.equal(can_reach_floor(true, levitating), true);

    const mounted = floorReachState();
    mounted.u.usteed = { data: { mflags1: 0 } };
    assert.equal(can_reach_floor(true, mounted), false);
    mounted.u.weapon_skills[P_RIDING].skill = P_BASIC;
    assert.equal(can_reach_floor(true, mounted), true);
});

test('can_reach_floor preserves hiding, flight, size, and seen-pit gates', () => {
    const hidden = floorReachState();
    hidden.u.uundetected = true;
    hidden.youmonst.data.mflags1 = M1_HIDE | M1_CLING;
    assert.equal(can_reach_floor(true, hidden), false);
    hidden.youmonst.data.mlet = S_MIMIC;
    assert.equal(can_reach_floor(true, hidden), true);
    hidden.youmonst.data.mflags1 |= M1_FLY;
    assert.equal(can_reach_floor(true, hidden), false);

    const pit = floorReachState();
    pit.level.traps.push({ tx: 12, ty: 6, ttyp: PIT, tseen: true });
    assert.equal(can_reach_floor(true, pit), false);
    assert.equal(can_reach_floor(false, pit), true);
    pit.u.utrap = 1;
    pit.u.utraptype = TT_PIT;
    assert.equal(can_reach_floor(true, pit), true);

    const shaft = floorReachState();
    shaft.level.traps.push({ tx: 12, ty: 6, ttyp: HOLE, tseen: true });
    assert.equal(can_reach_floor(true, shaft), false);
    shaft.u.uprops[FLYING].extrinsic = 1;
    assert.equal(can_reach_floor(true, shaft), true);
    shaft.u.uprops[FLYING].extrinsic = 0;
    shaft.youmonst.data.msize = MZ_HUGE;
    assert.equal(can_reach_floor(true, shaft), true);
});

test('wipeout_text ages the teleport-niche message in source call order', () => {
    const scripted = scriptedRandom(nicheWipeScript());

    // mklev.c calls wipe_engr_at(..., 5, FALSE) for the 11-byte
    // teleport-trap warning "ad aerarium"; seed zero selects the core RNG path.
    assert.equal(
        wipeout_text('ad aerarium', 5, 0, { random: scripted.random }),
        '?| aerari?r',
    );
    scripted.done();
});

test('wipeout_text selects and mutates UTF-8 bytes', () => {
    const scripted = scriptedRandom([
        // "éA" occupies bytes C3 A9 41. Byte index two selects ASCII 'A';
        // its only source rubout replacement is '^'.
        ['rn2', 3, 2], ['rn2', 4, 1], ['rn2', 1, 0],
        // Byte index zero then selects C3. High bytes have no rubout mapping,
        // so it becomes '?', leaving the A9 continuation byte malformed.
        ['rn2', 3, 0], ['rn2', 4, 2],
    ]);

    const wiped = wipeout_text('éA', 2, 0, { random: scripted.random });
    scripted.done();
    // The low-surrogate escape stores the invalid A9 byte without replacing
    // it by U+FFFD; re-encoding recovers C's exact post-rubout byte sequence.
    assert.equal(wiped, '?' + String.fromCharCode(0xDCA9) + '^');
    assert.deepEqual(encodeUtf8ByteString(wiped), [0x3F, 0xA9, 0x5E]);
});

test('make_engr_at creates and replaces C-shaped DUST engraving state', () => {
    const state = {};
    const random = noDrawRandom();
    // These are mklev.c makeniche()'s coordinates, text, time, and type shape;
    // the arbitrary coordinates distinguish lookup from list position.
    const first = make_engr_at(
        17,
        8,
        'ad aerarium',
        null,
        0,
        DUST,
        { state, random },
    );

    assert.equal(engr_at(17, 8, state), first);
    assert.equal(engr_at(18, 8, state), null);
    assert.deepEqual(first.engr_txt, [
        'ad aerarium',
        'ad aerarium',
        'ad aerarium',
    ]);
    assert.deepEqual(
        [first.engr_x, first.engr_y, first.engr_time, first.engr_type],
        [17, 8, 0, DUST],
    );
    // Eleven source characters plus NUL occupy each of the three text slots.
    assert.equal(first.engr_szeach, 12);
    assert.equal(first.engr_alloc, 36);
    assert.equal(first.nxt_engr, null);
    assert.equal(first.guardobjects, false);
    assert.equal(first.nowipeout, false);
    assert.equal(first.eread, false);
    assert.equal(first.erevealed, false);

    // make_engr_at deletes an engraving already at the target coordinate.
    const replacement = make_engr_at(
        17,
        8,
        'new',
        'pristine',
        7,
        DUST,
        { state, random },
    );
    assert.equal(engr_at(17, 8, state), replacement);
    assert.notEqual(replacement, first);
    assert.equal(replacement.nxt_engr, null);
    assert.deepEqual(replacement.engr_txt, ['new', 'new', 'pristine']);
    // The longer eight-character pristine string plus NUL fixes all slot sizes.
    assert.equal(replacement.engr_szeach, 9);
    assert.equal(replacement.engr_alloc, 27);
});

test('make_engr_at sizes text slots by UTF-8 bytes', () => {
    const state = {};
    // One e-acute occupies two UTF-8 bytes; the two-character pristine form
    // occupies four, so C allocates five bytes per slot including NUL.
    const engraving = make_engr_at(
        31,
        12,
        'é',
        'éé',
        0,
        DUST,
        { state, random: noDrawRandom() },
    );

    assert.deepEqual(engraving.engr_txt, ['é', 'é', 'éé']);
    assert.equal(engraving.engr_szeach, 5);
    assert.equal(engraving.engr_alloc, 15);
});

test('wipe_engr_at ages only the actual DUST text and skips erosion odds', () => {
    const state = {};
    const random = noDrawRandom();
    const engraving = make_engr_at(
        17,
        8,
        'ad aerarium',
        null,
        0,
        DUST,
        { state, random },
    );
    const scripted = scriptedRandom(nicheWipeScript());

    assert.equal(
        wipe_engr_at(17, 8, 5, false, {
            state,
            random: scripted.random,
        }),
        engraving,
    );
    scripted.done();
    assert.deepEqual(engraving.engr_txt, [
        '?| aerari?r',
        'ad aerarium',
        'ad aerarium',
    ]);
    assert.equal(engr_at(17, 8, state), engraving);
});

test('wipe_engr_at deletes a DUST engraving whose actual text is erased', () => {
    const state = {};
    const random = noDrawRandom();
    // Underscore is one of engrave.c's small punctuation marks and a trailing
    // space checks the source's post-wipe trailing-space trim.
    make_engr_at(23, 9, '_ ', null, 0, DUST, { state, random });
    const scripted = scriptedRandom([
        // Select underscore from the two-character text; punctuation erasure
        // does not consume a replacement draw after the standard rn2(4).
        ['rn2', 2, 0], ['rn2', 4, 3],
    ]);

    assert.equal(
        wipe_engr_at(23, 9, 1, false, {
            state,
            random: scripted.random,
        }),
        null,
    );
    scripted.done();
    assert.equal(engr_at(23, 9, state), null);
    assert.equal(state.head_engr, null);
});

test('read_engr_at reports, remembers, and punctuates a carved message', async () => {
    const state = {
        u: { uprops: [] },
        level: { at: () => ({ typ: ROOM }) },
    };
    const engraving = make_engr_at(
        12,
        6,
        'Move around with h j k l',
        null,
        0,
        ENGRAVE,
        { state, random: noDrawRandom() },
    );
    const messages = [];

    assert.equal(await read_engr_at(12, 6, state, {
        pline: async (message) => messages.push(message),
    }), true);
    assert.deepEqual(messages, [
        'Something is engraved here on the floor.',
        'You read: "Move around with h j k l".',
    ]);
    assert.equal(engraving.engr_txt[1], engraving.engr_txt[0]);
    assert.equal(engraving.eread, true);
    assert.equal(engraving.erevealed, true);
});

test('read_engr_at uses tactile burn text but cannot sense blind dust', async () => {
    const state = {
        u: { uprops: [] },
        level: { at: () => ({ typ: ICE }) },
    };
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    make_engr_at(
        4,
        5,
        'Careful!',
        null,
        0,
        BURN,
        { state, random: noDrawRandom() },
    );
    const messages = [];
    assert.equal(await read_engr_at(4, 5, state, {
        pline: async (message) => messages.push(message),
        canReachFloor: () => true,
    }), true);
    assert.deepEqual(messages, [
        'Some text has been melted into the ice here.',
        'You feel the words: "Careful!"',
    ]);

    make_engr_at(
        4,
        5,
        'unseen',
        null,
        0,
        DUST,
        { state, random: noDrawRandom() },
    );
    messages.length = 0;
    assert.equal(await read_engr_at(4, 5, state, {
        pline: async (message) => messages.push(message),
    }), false);
    assert.deepEqual(messages, []);
});

test('blind tactile engravings require the source reach-floor gate', async () => {
    const state = {
        u: { uprops: [] },
        level: { at: () => ({ typ: ROOM }) },
    };
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const messages = [];
    for (const engravingType of [ENGRAVE, BURN]) {
        make_engr_at(
            8,
            7,
            'Out of reach',
            null,
            0,
            engravingType,
            { state, random: noDrawRandom() },
        );
        assert.equal(await read_engr_at(8, 7, state, {
            pline: async (message) => messages.push(message),
            canReachFloor: (checkPits, receivedState) => {
                assert.equal(checkPits, true);
                assert.equal(receivedState, state);
                return false;
            },
        }), false, engravingType);
        assert.deepEqual(messages, []);
    }
    await assert.rejects(
        read_engr_at(8, 7, state, {
            pline: async (message) => messages.push(message),
        }),
        /requires a canReachFloor callback/u,
    );
});
