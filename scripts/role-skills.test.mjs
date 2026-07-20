import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as constants from '../js/const.js';
import {
    P_ATTACK_SPELL,
    P_BASIC,
    P_DIVINATION_SPELL,
    P_EXPERT,
    P_HEALING_SPELL,
    P_MARTIAL_ARTS,
    P_GRAND_MASTER,
} from '../js/const.js';
import {
    DAGGER,
    objects_globals_init,
    SPE_FORCE_BOLT,
    SPE_HEALING,
    SPE_MAGIC_MAPPING,
} from '../js/objects.js';
import {
    restrictedSpellDiscipline,
    ROLE_SKILLS,
    skillsForRole,
} from '../js/role_skills.js';
import { roles } from '../js/roles.js';

const SKILL_TABLE_ROLES = Object.freeze({
    A: 'Arc',
    B: 'Bar',
    C: 'Cav',
    H: 'Hea',
    K: 'Kni',
    Mon: 'Mon',
    P: 'Pri',
    R: 'Rog',
    Ran: 'Ran',
    S: 'Sam',
    T: 'Tou',
    V: 'Val',
    W: 'Wiz',
});

test('every playable role has one immutable source skill catalog', () => {
    assert.deepEqual(
        Object.keys(ROLE_SKILLS),
        roles.map(({ filecode }) => filecode),
    );
    for (const role of roles) {
        const skills = skillsForRole(role);
        assert.ok(Object.isFrozen(skills));
        assert.ok(skills.length > 0);
        assert.equal(
            new Set(skills.map(({ skill }) => skill)).size,
            skills.length,
            `${role.filecode} contains duplicate skills`,
        );
    }
});

test('all role skill entries exactly match upstream u_init.c', () => {
    const source = readFileSync(
        new URL('../nethack-c/upstream/src/u_init.c', import.meta.url),
        'utf8',
    );
    for (const [suffix, filecode] of Object.entries(SKILL_TABLE_ROLES)) {
        const block = source.match(new RegExp(
            `static const struct def_skill Skill_${suffix}\\[\\] = `
                + '\\{([\\s\\S]*?)\\n\\};',
        ));
        assert.ok(block, `missing upstream Skill_${suffix}`);
        const entries = [...block[1].matchAll(
            /\{\s*(P_[A-Z0-9_]+),\s*(P_[A-Z0-9_]+|0)\s*\}/g,
        )]
            .filter((match) => match[1] !== 'P_NONE')
            .map((match) => ({
                skill: constants[match[1]],
                skmax: constants[match[2]],
            }));
        assert.deepEqual(ROLE_SKILLS[filecode], entries, filecode);
    }
});

test('catalog preserves representative role maxima and source aliases', () => {
    assert.deepEqual(
        skillsForRole('Arc').find(({ skill }) => skill === P_DIVINATION_SPELL),
        { skill: P_DIVINATION_SPELL, skmax: P_EXPERT },
    );
    assert.deepEqual(
        skillsForRole('Mon').find(({ skill }) => skill === P_MARTIAL_ARTS),
        { skill: P_MARTIAL_ARTS, skmax: P_GRAND_MASTER },
    );
    assert.deepEqual(
        skillsForRole('Bar').find(({ skill }) => skill === P_ATTACK_SPELL),
        { skill: P_ATTACK_SPELL, skmax: P_BASIC },
    );
});

test('starting spellbook filter follows the selected role discipline', () => {
    const state = { urole: { filecode: 'Hea' } };
    objects_globals_init(state);

    assert.equal(restrictedSpellDiscipline(SPE_HEALING, state), false);
    assert.equal(restrictedSpellDiscipline(SPE_FORCE_BOLT, state), true);

    state.urole = { filecode: 'Wiz' };
    assert.equal(restrictedSpellDiscipline(SPE_FORCE_BOLT, state), false);
    assert.equal(restrictedSpellDiscipline(SPE_MAGIC_MAPPING, state), false);
    assert.throws(
        () => restrictedSpellDiscipline(DAGGER, state),
        /not a spellbook/,
    );
});

test('unknown roles and object types fail instead of silently broadening loot', () => {
    assert.throws(() => skillsForRole({ filecode: '???' }), /no skill catalog/);
    assert.throws(
        () => restrictedSpellDiscipline(-1, {
            urole: { filecode: 'Wiz' },
            objects: [],
        }),
        /invalid spellbook object type/,
    );
});
