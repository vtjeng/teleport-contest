import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    COLD_RES,
    FAST,
    FROMEXPER,
    FROMOUTSIDE,
    FROM_FORM,
    FROM_RACE,
    INFRAVISION,
    POISON_RES,
    SEARCHING,
    SEE_INVIS,
    SLEEP_RES,
    STEALTH,
} from '../js/const.js';
import { init_dungeons } from '../js/dungeon.js';
import { game, resetGame } from '../js/gstate.js';
import { init_objects } from '../js/o_init.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { role_init } from '../js/role_init.js';
import {
    races,
    roles,
    str2align,
    str2gend,
    str2race,
    str2role,
} from '../js/roles.js';
import {
    LEFT_HANDED,
    RIGHT_HANDED,
    u_init_misc,
} from '../js/u_init.js';

const SUMMER_RECORDING_TIME = new Date('2026-07-20T19:34:56.000Z');

function initialState(
    role,
    race,
    gender,
    alignment,
    { roleplay = {}, moves = 0 } = {},
) {
    const roleIndex = str2role(role);
    const raceIndex = str2race(race);
    const genderIndex = str2gend(gender);
    const alignmentIndex = str2align(alignment);
    return {
        fixedDatetime: '20260720123456',
        moves,
        flags: {
            initrole: roleIndex,
            initrace: raceIndex,
            initgend: genderIndex,
            initalign: alignmentIndex,
        },
        urole: roles[roleIndex],
        urace: races[raceIndex],
        u: {
            staleRestoreField: 73,
            uroleplay: roleplay,
        },
    };
}

function scriptedRandom(expectedCalls) {
    const queue = [...expectedCalls];
    const calls = [];
    function take(kind, bound) {
        calls.push(`${kind}(${bound})`);
        assert.ok(queue.length, `unexpected ${kind}(${bound})`);
        const expected = queue.shift();
        assert.deepEqual(
            { kind, bound },
            { kind: expected.kind, bound: expected.bound },
        );
        return expected.result;
    }
    return {
        calls,
        rn2: (bound) => take('rn2', bound),
        rnd: (bound) => take('rnd', bound),
        done: () => assert.deepEqual(queue, []),
    };
}

function propertyIntrinsic(state, index) {
    return state.u.uprops[index].intrinsic;
}

test('u_init_misc clears hero state and preserves only roleplay options', () => {
    const state = initialState('Healer', 'human', 'male', 'neutral', {
        roleplay: {
            blind: true,
            nudist: true,
            numbones: 4,
            numrerolls: 2,
        },
    });
    state.svs = {
        spl_book: [
            { sp_id: 386, sp_lev: 1, sp_know: 20_000 },
        ],
    };
    // C's spellbook is fixed-size; this stale JS-only tail must not survive
    // the struct reset boundary.
    state.svs.spl_book[43] = { sp_id: 999 };
    state.urealtime = { realtime: 19, start_timing: 20, finish_time: 21 };
    const random = scriptedRandom([
        // Healer starts with rnd(4) spell energy before handedness.
        { kind: 'rnd', bound: 4, result: 3 },
        // Zero is the one-in-ten left-handed branch.
        { kind: 'rn2', bound: 10, result: 0 },
    ]);

    u_init_misc(state, random, { now: SUMMER_RECORDING_TIME });

    assert.equal('staleRestoreField' in state.u, false);
    assert.deepEqual(state.u.uroleplay, {
        blind: true,
        nudist: true,
        deaf: false,
        pauper: false,
        reroll: false,
        reserved1: false,
        reserved2: false,
        reserved3: false,
        numbones: 4,
        numrerolls: 2,
    });
    assert.equal(state.flags.female, false);
    assert.equal(state.flags.beginner, true);
    assert.deepEqual(state.u.uz, { dnum: 0, dlevel: 1 });
    assert.deepEqual(state.u.uz0, { dnum: 0, dlevel: 0 });
    assert.deepEqual(state.u.utolev, state.u.uz);
    assert.notEqual(state.u.utolev, state.u.uz);
    assert.equal(state.u.ugrave_arise, -1);
    assert.equal(state.u.ulycn, -1);
    assert.equal(state.u.umonnum, state.urole.mnum);
    assert.equal(state.u.umonster, state.urole.mnum);
    assert.equal(state.youmonst.m_id, 1);
    assert.equal(state.youmonst.mnum, state.urole.mnum);
    assert.equal(state.youmonst.cham, -1);
    assert.equal(state.youmonst.data.mnum, state.urole.mnum);
    assert.deepEqual(state.context.warntype, {
        obj: 0,
        speciesidx: -1,
        species: null,
        polyd: 0,
    });
    assert.equal(state.gw.were_changes, 0);

    // Representative scalar, nested, and fixed-array members verify that the
    // C memset boundary produces source-shaped zeroes, not missing values.
    assert.deepEqual(state.u.ucamefrom, { dnum: 0, dlevel: 0 });
    assert.deepEqual(state.u.uhave, {
        amulet: 0,
        bell: 0,
        book: 0,
        menorah: 0,
        questart: 0,
        unused: 0,
    });
    assert.equal(state.u.uevent.udemigod, 0);
    assert.equal(state.u.uconduct.food, 0);
    assert.deepEqual(state.u.urooms, [0, 0, 0, 0, 0]);
    assert.equal(state.u.uhpinc.length, 30);
    assert.equal(state.u.ueninc.length, 30);
    assert.equal(state.u.skill_record.length, 60);
    assert.equal(state.u.weapon_skills.length, 38);
    assert.equal(state.u.uachieved.length, 32);

    // Healer/human starts with 11+2 HP and 1+1+rnd(4) Pw.
    assert.deepEqual(
        [state.u.uhp, state.u.uhpmax, state.u.uhppeak],
        [13, 13, 13],
    );
    assert.deepEqual(
        [state.u.uen, state.u.uenmax, state.u.uenpeak],
        [5, 5, 5],
    );
    assert.equal(state.u.uhpinc[0], 13);
    assert.equal(state.u.ueninc[0], 5);
    assert.equal(state.u.ulevel, 1);
    assert.equal(state.u.ulevelmax, 1);
    assert.equal(state.u.uhunger, 900);
    assert.equal(state.u.uhs, 1);
    assert.equal(state.disp.botl, true);
    assert.equal(state.u.ublesscnt, 300);
    assert.deepEqual(state.u.ualignbase, [0, 0]);
    assert.deepEqual(state.u.ualign, { type: 0, record: 10 });
    assert.deepEqual(
        [state.u.nv_range, state.u.xray_range,
            state.u.unblind_telepat_range],
        [1, -1, -1],
    );
    assert.equal(state.u.uhandedness, LEFT_HANDED);
    assert.ok(propertyIntrinsic(state, BLINDED) & FROMOUTSIDE);

    assert.equal(state.svs.spl_book.length, 43);
    assert.ok(state.svs.spl_book.every((spell) => spell.sp_id === 0));
    // u_init_misc invalidates old spells by id without clearing the other
    // fields in the fixed-size spell array.
    assert.deepEqual(state.svs.spl_book[0], {
        sp_id: 0,
        sp_lev: 1,
        sp_know: 20_000,
    });
    assert.deepEqual(state.urealtime, {
        realtime: 0,
        start_timing: 0,
        finish_time: 0,
    });
    // The recorder runs in New York: 12:34:56 EDT is 16:34:56 UTC.
    assert.equal(
        state.ubirthday,
        Date.UTC(2026, 6, 20, 16, 34, 56) / 1000,
    );
    assert.equal(state.gm.mrank_sz, 14);
    random.done();
});

test('representative roles preserve initial HP, Pw, alignment, and RNG order', () => {
    const cases = [
        {
            // Tourist has fixed initial Pw, so handedness is its only draw.
            config: ['Tourist', 'human', 'female', 'neutral'],
            calls: [{ kind: 'rn2', bound: 10, result: 9 }],
            hp: 10,
            pw: 2,
            record: 0,
            align: 0,
            hand: RIGHT_HANDED,
        },
        {
            // Wizard/elf exercises role energy randomization before the hand.
            config: ['Wizard', 'elf', 'female', 'chaotic'],
            calls: [
                { kind: 'rnd', bound: 3, result: 2 },
                { kind: 'rn2', bound: 10, result: 5 },
            ],
            hp: 11,
            pw: 8,
            record: 0,
            align: -1,
            hand: RIGHT_HANDED,
        },
        {
            // Valkyrie/dwarf exercises a zero racial energy contribution.
            config: ['Valkyrie', 'dwarf', 'female', 'lawful'],
            calls: [{ kind: 'rn2', bound: 10, result: 0 }],
            hp: 18,
            pw: 1,
            record: 0,
            align: 1,
            hand: LEFT_HANDED,
        },
    ];

    for (const expected of cases) {
        const state = initialState(...expected.config);
        const random = scriptedRandom(expected.calls);
        u_init_misc(state, random);

        assert.deepEqual(
            [state.u.uhp, state.u.uen, state.u.ualign.record,
                state.u.ualign.type, state.u.uhandedness],
            [expected.hp, expected.pw, expected.record,
                expected.align, expected.hand],
            expected.config.join('/'),
        );
        assert.equal(state.flags.female,
            expected.config[2] === 'female');
        random.done();
    }
});

test('level-one role, race, and form intrinsics retain distinct source bits', () => {
    const barbarian = initialState(
        'Barbarian', 'orc', 'male', 'chaotic',
    );
    const barbarianRandom = scriptedRandom([
        { kind: 'rn2', bound: 10, result: 1 },
    ]);
    u_init_misc(barbarian, barbarianRandom);
    assert.equal(
        propertyIntrinsic(barbarian, POISON_RES),
        FROM_FORM | FROMEXPER | FROM_RACE | FROMOUTSIDE,
    );
    assert.equal(
        propertyIntrinsic(barbarian, INFRAVISION),
        FROM_FORM | FROM_RACE | FROMOUTSIDE,
    );
    barbarianRandom.done();

    const monk = initialState('Monk', 'human', 'male', 'neutral');
    const monkRandom = scriptedRandom([
        // Monk's rnd(2) energy result exercises the other newpw bound.
        { kind: 'rnd', bound: 2, result: 1 },
        { kind: 'rn2', bound: 10, result: 1 },
    ]);
    u_init_misc(monk, monkRandom);
    for (const propertyIndex of [FAST, SLEEP_RES, SEE_INVIS]) {
        assert.equal(
            propertyIntrinsic(monk, propertyIndex),
            FROMEXPER | FROMOUTSIDE,
        );
    }
    assert.equal(propertyIntrinsic(monk, INFRAVISION), 0);
    monkRandom.done();

    const ranger = initialState('Ranger', 'elf', 'female', 'chaotic');
    const rangerRandom = scriptedRandom([
        { kind: 'rn2', bound: 10, result: 1 },
    ]);
    u_init_misc(ranger, rangerRandom);
    assert.equal(
        propertyIntrinsic(ranger, SEARCHING),
        FROMEXPER | FROMOUTSIDE,
    );
    assert.equal(
        propertyIntrinsic(ranger, INFRAVISION),
        FROM_FORM | FROM_RACE | FROMOUTSIDE,
    );
    rangerRandom.done();

    const rogue = initialState('Rogue', 'human', 'male', 'chaotic');
    const rogueRandom = scriptedRandom([
        { kind: 'rn2', bound: 10, result: 1 },
    ]);
    u_init_misc(rogue, rogueRandom);
    assert.equal(
        propertyIntrinsic(rogue, STEALTH),
        FROMEXPER | FROMOUTSIDE,
    );
    rogueRandom.done();

    const valkyrie = initialState(
        'Valkyrie', 'dwarf', 'female', 'lawful',
    );
    const valkyrieRandom = scriptedRandom([
        { kind: 'rn2', bound: 10, result: 1 },
    ]);
    u_init_misc(valkyrie, valkyrieRandom);
    assert.equal(
        propertyIntrinsic(valkyrie, COLD_RES),
        FROM_FORM | FROMEXPER | FROMOUTSIDE,
    );
    assert.equal(
        propertyIntrinsic(valkyrie, INFRAVISION),
        FROM_FORM,
    );
    valkyrieRandom.done();
});

test('moves remains the source boundary for newhp alignment record setup', () => {
    const state = initialState(
        'Healer', 'human', 'male', 'neutral', { moves: 1 },
    );
    const random = scriptedRandom([
        { kind: 'rnd', bound: 4, result: 1 },
        { kind: 'rn2', bound: 10, result: 1 },
    ]);
    u_init_misc(state, random);

    // u_init_role(), which changes moves to one, belongs after mklev. This
    // proves u_init_misc does not hide an incorrectly ordered integration.
    assert.equal(state.u.ualign.record, 0);
    random.done();
});

function freshBootstrap(seed, role, race, gender, alignment) {
    resetGame();
    initRng(seed);
    enableRngLog();
    init_objects(game);
    game.fixedDatetime = '20260720123456';
    game.moves = 0;
    game.plname = 'FreshBootstrap';
    game.flags = {
        initrole: role,
        initrace: race,
        initgend: gender,
        initalign: alignment,
        pantheon: -1,
    };
    game.u = { uroleplay: {} };
    role_init(game);
    init_dungeons(game);
    u_init_misc(game);
    assert.equal(game.moves, 0);
    assert.equal(game.u.ualign.record, game.urole.initrecord);
    return [...getRngLog()];
}

test('fresh role/dungeon/u_init composition reaches the recorder boundaries', () => {
    const cases = [
        {
            // Calls 1..199 initialize objects, 200..299 initialize dungeons,
            // then Healer adds randomized Pw and handedness.
            config: [271828, 'Healer', 'human', 'male', 'neutral'],
            length: 301,
            tail: ['rnd(4)=1', 'rn2(10)=4'],
        },
        {
            // Wizard's quest-gender call shifts the dungeon/u_init boundary
            // by one; elf does not add a random draw in u_init_misc.
            config: [271828, 'Wizard', 'elf', 'female', 'chaotic'],
            length: 302,
            tail: ['rnd(3)=3', 'rn2(10)=9'],
        },
        {
            // Valkyrie has no role_init or newpw draw, leaving handedness as
            // call 300 before l_nhcore_init's two calls.
            config: [161803, 'Valkyrie', 'dwarf', 'female', 'lawful'],
            length: 300,
            tail: ['rn2(10)=9'],
        },
    ];

    for (const expected of cases) {
        const log = freshBootstrap(...expected.config);
        assert.equal(log.length, expected.length, expected.config.join('/'));
        assert.deepEqual(
            log.slice(-expected.tail.length),
            expected.tail,
            expected.config.join('/'),
        );
    }
});
