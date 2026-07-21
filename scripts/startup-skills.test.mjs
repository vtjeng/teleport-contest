import assert from 'node:assert/strict';
import test from 'node:test';

import {
    NO_SPELL,
    P_ATTACK_SPELL,
    P_BARE_HANDED_COMBAT,
    P_BASIC,
    P_BOW,
    P_CLERIC_SPELL,
    P_ENCHANTMENT_SPELL,
    P_HEALING_SPELL,
    P_ISRESTRICTED,
    P_NUM_SKILLS,
    P_PICK_AXE,
    P_RIDING,
    P_SLING,
    P_UNSKILLED,
} from '../js/const.js';
import { discover_object, init_objects } from '../js/o_init.js';
import {
    ARROW,
    FLINT,
    FOOD_RATION,
    MAXSPELL,
    PICK_AXE,
    SACK,
    SPE_EXTRA_HEALING,
    SPE_FIREBALL,
    SPE_FORCE_BOLT,
    SPE_HEALING,
    SPE_LIGHT,
    SPE_MAGIC_MISSILE,
    SPE_PROTECTION,
    TOUCHSTONE,
} from '../js/objects.js';
import { skillsForRole } from '../js/role_skills.js';
import { roles } from '../js/roles.js';
import {
    LEVEL_ONE_SPELL_POWER,
    SPELL_KNOWLEDGE_KEEN,
    ensure_starting_spell_power,
    finalize_startup_skills,
    initialspell,
    num_spells,
    pauper_reinit,
    practice_needed_to_advance,
    skill_init,
    spell_skilltype,
    weapon_type,
} from '../js/startup_skills.js';

function roleByFilecode(filecode) {
    const role = roles.find((candidate) => candidate.filecode === filecode);
    assert.ok(role, `missing test role ${filecode}`);
    return role;
}

function startupState(filecode, { pauper = false } = {}) {
    const state = {
        invent: null,
        program_state: {},
        urole: roleByFilecode(filecode),
        u: {
            uroleplay: { pauper },
            ulevel: 1,
            uen: 2,
            uenmax: 2,
            uenpeak: 3,
            ueninc: new Array(30).fill(0),
            weapon_slots: 0,
            weapon_skills: Array.from(
                { length: P_NUM_SKILLS },
                () => ({ skill: 9, max_skill: 9, advance: 999 }),
            ),
        },
        svs: {
            spl_book: Array.from(
                { length: MAXSPELL + 1 },
                () => ({ sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 }),
            ),
        },
    };
    // Fixed zero choices initialize class bounds and aliases. Startup skill
    // behavior itself must not consume random numbers.
    init_objects(state, () => 0);
    return state;
}

function inventoryObject(otyp, state, next = null) {
    return {
        otyp,
        oclass: state.objects[otyp].oc_class,
        nobj: next,
    };
}

test('startup spell and practice constants retain their source arithmetic', () => {
    // KEEN is spell.c's full-memory duration. A level-one spell costs
    // 1 * 5 Pw, and skills.h advances at level squared times 20 practice.
    assert.equal(SPELL_KNOWLEDGE_KEEN, 20000);
    assert.equal(LEVEL_ONE_SPELL_POWER, 5);
    assert.deepEqual(
        [0, 1, 2, 3].map(practice_needed_to_advance),
        [0, 20, 80, 180],
    );
});

test('initialspell stores source spell records and stops at the sentinel', () => {
    const state = startupState('Hea');
    assert.equal(spell_skilltype(SPE_HEALING, state), P_HEALING_SPELL);
    assert.equal(initialspell({ otyp: SPE_HEALING }, state), 0);
    assert.equal(initialspell({ otyp: SPE_EXTRA_HEALING }, state), 1);
    assert.equal(num_spells(state), 2);
    assert.deepEqual(state.svs.spl_book[0], {
        sp_id: SPE_HEALING,
        sp_lev: 1,
        sp_know: SPELL_KNOWLEDGE_KEEN,
    });
    assert.equal(state.svs.spl_book[2].sp_id, NO_SPELL);

    const messages = [];
    assert.equal(initialspell(
        { otyp: SPE_HEALING },
        state,
        { impossible: (message) => messages.push(message) },
    ), -1);
    assert.equal(num_spells(state), 2);
    assert.deepEqual(messages, ['Spell healing already known.']);

    // A completely occupied playable range must stop before the permanent
    // sentinel at MAXSPELL and report the source overflow diagnostic.
    for (let index = 0; index < MAXSPELL; ++index)
        state.svs.spl_book[index].sp_id = SPE_HEALING;
    assert.equal(initialspell(
        { otyp: SPE_EXTRA_HEALING },
        state,
        { impossible: (message) => messages.push(message) },
    ), -1);
    assert.equal(messages.at(-1), 'Too many spells memorized!');
});

test('skill_init initializes every valid role skill matrix', () => {
    const expectedBasic = Object.freeze({
        Arc: [],
        Bar: [P_BARE_HANDED_COMBAT],
        Cav: [P_BARE_HANDED_COMBAT],
        Hea: [P_HEALING_SPELL],
        Kni: [P_RIDING],
        Mon: [P_HEALING_SPELL, P_BARE_HANDED_COMBAT],
        Pri: [P_CLERIC_SPELL],
        Ran: [],
        Rog: [],
        Sam: [P_BARE_HANDED_COMBAT],
        Tou: [],
        Val: [],
        Wiz: [P_ATTACK_SPELL, P_ENCHANTMENT_SPELL],
    });

    for (const role of roles) {
        const state = startupState(role.filecode);
        const definitions = skillsForRole(role);
        const maximums = new Map(
            definitions.map(({ skill, skmax }) => [skill, skmax]),
        );
        const specialSkill = spell_skilltype(role.spelspec, state);
        if (!maximums.has(specialSkill)) maximums.set(specialSkill, P_BASIC);
        const basics = new Set(expectedBasic[role.filecode]);

        skill_init(definitions, state, { discoverObject: () => {} });
        for (let skill = 0; skill < P_NUM_SKILLS; ++skill) {
            const record = state.u.weapon_skills[skill];
            const maximum = maximums.get(skill) ?? P_ISRESTRICTED;
            const current = basics.has(skill)
                ? P_BASIC
                : maximum === P_ISRESTRICTED
                    ? P_ISRESTRICTED
                    : P_UNSKILLED;
            assert.deepEqual(
                record,
                {
                    skill: current,
                    max_skill: maximum,
                    advance: current === P_ISRESTRICTED
                        ? 0
                        : practice_needed_to_advance(current - 1),
                },
                `${role.filecode} skill ${skill}`,
            );
        }
    }
});

test('skill_init skips ammunition but learns held weapon-tool skills', () => {
    const state = startupState('Arc');
    const touchstone = inventoryObject(TOUCHSTONE, state);
    const arrow = inventoryObject(ARROW, state, touchstone);
    state.invent = inventoryObject(PICK_AXE, state, arrow);

    assert.equal(weapon_type(state.invent, state), P_PICK_AXE);
    assert.equal(weapon_type(arrow, state), P_BOW);
    assert.equal(weapon_type(touchstone, state), P_SLING);
    skill_init(skillsForRole(state.urole), state, {
        discoverObject: () => {},
    });

    assert.equal(state.u.weapon_skills[P_PICK_AXE].skill, P_BASIC);
    assert.equal(state.u.weapon_skills[P_BOW].skill, P_ISRESTRICTED);
    assert.equal(state.u.weapon_skills[P_SLING].skill, P_UNSKILLED);
});

test('skill_init raises a carried weapon skill maximum when needed', () => {
    const state = startupState('Wiz');
    // Wizards restrict pick-axe, so carrying one promotes the current skill
    // to Basic before the source consistency pass raises its maximum.
    state.invent = inventoryObject(PICK_AXE, state);
    const messages = [];

    skill_init(skillsForRole(state.urole), state, {
        discoverObject: () => {},
        impossible: (message) => messages.push(message),
    });

    assert.deepEqual(state.u.weapon_skills[P_PICK_AXE], {
        skill: P_BASIC,
        max_skill: P_BASIC,
        advance: practice_needed_to_advance(P_BASIC - 1),
    });
    assert.deepEqual(messages, [
        `skill_init: current exceeds maximum for ${P_PICK_AXE}`,
    ]);
});

test('Wizard spellbook identification follows initialized skill thresholds', () => {
    const state = startupState('Wiz');
    for (const type of [
        SPE_MAGIC_MISSILE,
        SPE_FIREBALL,
        SPE_LIGHT,
    ]) {
        assert.equal(state.objects[type].oc_name_known, 0);
        assert.equal(state.objects[type].oc_encountered, 0);
    }

    skill_init(skillsForRole(state.urole), state);
    // Attack starts Basic, so level 2 is identified but level 4 is not.
    assert.equal(state.objects[SPE_MAGIC_MISSILE].oc_name_known, 1);
    assert.equal(state.objects[SPE_FIREBALL].oc_name_known, 0);
    // Unskilled non-pauper disciplines still identify level-1 books.
    assert.equal(state.objects[SPE_LIGHT].oc_name_known, 1);
    assert.equal(state.objects[SPE_MAGIC_MISSILE].oc_encountered, 0);
    assert.equal(state.objects[SPE_LIGHT].oc_encountered, 0);
});

test('pauper_reinit demotes skills and pre-discovers each role key item', () => {
    const expected = Object.freeze({
        Arc: TOUCHSTONE,
        Bar: undefined,
        Cav: FLINT,
        Hea: SPE_HEALING,
        Kni: SPE_PROTECTION,
        Mon: SPE_PROTECTION,
        Pri: SPE_PROTECTION,
        Ran: undefined,
        Rog: SACK,
        Sam: FOOD_RATION,
        Tou: SACK,
        Val: undefined,
        Wiz: SPE_FORCE_BOLT,
    });

    for (const role of roles) {
        const state = startupState(role.filecode, { pauper: true });
        skill_init(skillsForRole(role), state);
        const calls = [];
        pauper_reinit(state, {
            discoverObject(...args) {
                calls.push(args.slice(0, 4));
                return discover_object(...args);
            },
        });

        assert.equal(state.u.weapon_slots, 2, role.filecode);
        assert.ok(
            state.u.weapon_skills.every(
                ({ skill }) => skill <= P_UNSKILLED,
            ),
            `${role.filecode} has no trained pauper skill`,
        );
        const object = expected[role.filecode];
        assert.deepEqual(
            calls,
            object === undefined ? [] : [[object, true, false, false]],
            `${role.filecode} preknown object`,
        );
        if (object !== undefined)
            assert.equal(state.objects[object].oc_name_known, 1);

        if (role.filecode === 'Wiz') {
            // pauper skill_init skips the Wizard's skill-based book IDs;
            // pauper_reinit only reveals force bolt.
            assert.equal(state.objects[SPE_MAGIC_MISSILE].oc_name_known, 0);
            assert.equal(state.objects[SPE_FORCE_BOLT].oc_name_known, 1);
        }
    }
});

test('finalize_startup_skills applies the source level-one power floor', () => {
    const state = startupState('Hea');
    initialspell({ otyp: SPE_HEALING }, state);
    finalize_startup_skills(state, { discoverObject: () => {} });

    assert.equal(state.u.uen, LEVEL_ONE_SPELL_POWER);
    assert.equal(state.u.uenmax, LEVEL_ONE_SPELL_POWER);
    assert.equal(state.u.uenpeak, LEVEL_ONE_SPELL_POWER);
    assert.equal(state.u.ueninc[1], LEVEL_ONE_SPELL_POWER);

    state.u.uen = 7;
    state.u.uenmax = 8;
    state.u.uenpeak = 9;
    state.u.ueninc[1] = 4;
    assert.equal(ensure_starting_spell_power(state), false);
    assert.deepEqual(
        [state.u.uen, state.u.uenmax, state.u.uenpeak, state.u.ueninc[1]],
        [7, 8, 9, 4],
    );

    const noSpell = startupState('Bar');
    assert.equal(ensure_starting_spell_power(noSpell), false);
    assert.equal(noSpell.u.uenmax, 2);
});
