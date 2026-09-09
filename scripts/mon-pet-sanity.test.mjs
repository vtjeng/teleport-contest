import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MAGICAL_BREATHING,
    M_POISONGAS_BAD,
    M_POISONGAS_MINOR,
    M_POISONGAS_OK,
    POISON_RES,
    POOL,
} from '../js/const.js';
import { get_mleash } from '../js/apply.js';
import { GameMap } from '../js/game.js';
import {
    genus,
    m_poisongas_ok,
    pet_sanity_check,
} from '../js/mon.js';
import * as M from '../js/monsters.js';
import { LEASH } from '../js/objects.js';

function monsterState() {
    const state = { level: new GameMap(), u: { uprops: [] } };
    M.monst_globals_init(state);
    state.u = {
        ux: 5,
        uy: 5,
        uz: { dnum: 0, dlevel: 1 },
        uprops: [],
        uinvulnerable: false,
        uinwater: false,
    };
    state.youmonst = { data: state.mons[M.PM_HUMAN] };
    state.water_level = { dnum: 1, dlevel: 1 };
    return state;
}

test('genus maps every quest guardian in both C modes', () => {
    // mon.c:470-532, each case in the switch is listed separately so a
    // dropped guardian cannot hide behind a shared table entry.
    const state = monsterState();
    const guardians = [
        [M.PM_STUDENT, M.PM_ARCHEOLOGIST],
        [M.PM_CHIEFTAIN, M.PM_BARBARIAN],
        [M.PM_NEANDERTHAL, M.PM_CAVE_DWELLER],
        [M.PM_ATTENDANT, M.PM_HEALER],
        [M.PM_PAGE, M.PM_KNIGHT],
        [M.PM_ABBOT, M.PM_MONK],
        [M.PM_ACOLYTE, M.PM_CLERIC],
        [M.PM_HUNTER, M.PM_RANGER],
        [M.PM_THUG, M.PM_ROGUE],
        [M.PM_ROSHI, M.PM_SAMURAI],
        [M.PM_GUIDE, M.PM_TOURIST],
        [M.PM_APPRENTICE, M.PM_WIZARD],
        [M.PM_WARRIOR, M.PM_VALKYRIE],
    ];
    for (const [guardian, role] of guardians) {
        assert.equal(genus(guardian, 1, state), role);
        assert.equal(genus(guardian, 0, state), M.PM_HUMAN);
    }
});

test('genus collapses ordinary races and preserves unrelated species', () => {
    const state = monsterState();
    assert.equal(genus(M.PM_DWARF_LEADER, 0, state), M.PM_DWARF);
    assert.equal(genus(M.PM_ELF_NOBLE, 0, state), M.PM_ELF);
    assert.equal(genus(M.PM_GNOME_LEADER, 0, state), M.PM_GNOME);
    assert.equal(genus(M.PM_ORC_CAPTAIN, 0, state), M.PM_ORC);
    assert.equal(genus(M.PM_NEWT, 0, state), M.PM_NEWT);
});

test('m_poisongas_ok follows C immunity, resistance, and bad branches', () => {
    // mon.c:330-357. These species rows and fields come from monsters.h;
    // this test does not derive expected values from the JS helper itself.
    const state = monsterState();
    const subject = (index, overrides = {}) => ({
        data: state.mons[index],
        mx: 5,
        my: 5,
        minvent: null,
        ...overrides,
    });

    assert.equal(m_poisongas_ok(subject(M.PM_IRON_GOLEM), state), M_POISONGAS_OK);
    assert.equal(m_poisongas_ok(
        subject(M.PM_HUMAN, { cham: M.PM_VAMPIRE }), state,
    ), M_POISONGAS_OK);
    assert.equal(m_poisongas_ok(subject(M.PM_HEZROU), state), M_POISONGAS_OK);
    assert.equal(m_poisongas_ok(
        subject(M.PM_GREEN_DRAGON), state,
    ), M_POISONGAS_OK);
    state.level.at(5, 5).typ = POOL;
    assert.equal(m_poisongas_ok(subject(M.PM_GIANT_EEL), state), M_POISONGAS_OK);
    state.level.at(5, 5).typ = 0;
    assert.equal(m_poisongas_ok(subject(M.PM_HUMAN), state), M_POISONGAS_BAD);

    const resistant = subject(M.PM_HUMAN, {
        mintrinsics: 1 << (POISON_RES - 1),
    });
    assert.equal(m_poisongas_ok(resistant, state), M_POISONGAS_MINOR);

    state.u.uprops[POISON_RES] = { intrinsic: true, extrinsic: false };
    assert.equal(m_poisongas_ok(state.youmonst, state), M_POISONGAS_MINOR);
    state.u.uprops[POISON_RES] = { intrinsic: false, extrinsic: false };
    state.u.uprops[MAGICAL_BREATHING] = { intrinsic: true, extrinsic: false };
    assert.equal(m_poisongas_ok(state.youmonst, state), M_POISONGAS_OK);
});

test('pet_sanity_check reports future droptime and get_mleash scans hero inventory', () => {
    const state = monsterState();
    state.moves = 10;
    const pet = {
        m_id: 7,
        mextra: { edog: { droptime: 11 } },
    };
    const messages = [];
    pet_sanity_check(pet, 'fmon', state, {
        impossible(message) { messages.push(message); },
    });
    assert.deepEqual(messages, [
        'insane pet #7 has droptime (11) in the future (10) (fmon)',
    ]);

    const leash = { otyp: LEASH, leashmon: 7, nobj: null };
    state.invent = leash;
    assert.equal(get_mleash(pet, state), leash);
    assert.equal(get_mleash({ m_id: 8 }, state), null);
});
