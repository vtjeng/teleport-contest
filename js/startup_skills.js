// New-game spell and skill initialization after the starting inventory has
// been equipped and inspected.
// C refs: src/spell.c initialspell(), num_spells(), spell_skilltype(), and
// skill_based_spellbook_id(); src/weapon.c skill_init(),
// unrestrict_weapon_skill(), and practice_needed_to_advance(); src/u_init.c
// pauper_reinit() and the final portion of u_init_skills_discoveries().

import {
    NO_SPELL,
    P_ATTACK_SPELL,
    P_BARE_HANDED_COMBAT,
    P_BASIC,
    P_BOW,
    P_CLERIC_SPELL,
    P_CROSSBOW,
    P_ENCHANTMENT_SPELL,
    P_EXPERT,
    P_GRAND_MASTER,
    P_HEALING_SPELL,
    P_ISRESTRICTED,
    P_MASTER,
    P_NONE,
    P_NUM_SKILLS,
    P_RIDING,
    P_SKILLED,
    P_UNSKILLED,
} from './const.js';
import { game } from './gstate.js';
import {
    PM_ARCHEOLOGIST,
    PM_CAVE_DWELLER,
    PM_CLERIC,
    PM_HEALER,
    PM_KNIGHT,
    PM_MONK,
    PM_PONY,
    PM_ROGUE,
    PM_SAMURAI,
    PM_TOURIST,
    PM_WIZARD,
} from './monsters.js';
import { discover_object } from './o_init.js';
import {
    FLINT,
    FOOD_RATION,
    GEM_CLASS,
    MAXSPELL,
    OBJ_NAME,
    SACK,
    SPE_FORCE_BOLT,
    SPE_HEALING,
    SPE_PROTECTION,
    SPBOOK_CLASS,
    TOOL_CLASS,
    TOUCHSTONE,
    WEAPON_CLASS,
} from './objects.js';
import { skillsForRole } from './role_skills.js';

export const SPELL_KNOWLEDGE_KEEN = 20000;
export const LEVEL_ONE_SPELL_POWER = 5;

function objectCatalog(state) {
    if (!Array.isArray(state.objects))
        throw new Error('startup skills require an initialized object catalog');
    return state.objects;
}

function objectSkill(otyp, state) {
    const type = objectCatalog(state)[otyp];
    if (!type)
        throw new RangeError(`startup skills: invalid object type ${otyp}`);
    return Math.trunc(type.oc_skill ?? type.oc_subtyp ?? P_NONE);
}

function objectLevel(otyp, state) {
    const type = objectCatalog(state)[otyp];
    if (!type)
        throw new RangeError(`startup spells: invalid object type ${otyp}`);
    return Math.trunc(type.oc_level ?? type.oc_oc2 ?? 0);
}

function spellSlots(state) {
    state.svs ??= {};
    const slots = state.svs.spl_book ??= [];
    for (let index = 0; index <= MAXSPELL; ++index) {
        slots[index] ??= { sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 };
    }
    return slots;
}

function skillSlots(state) {
    if (!state.u)
        throw new Error('startup skills require an initialized hero');
    const slots = state.u.weapon_skills ??= [];
    for (let skill = 0; skill < P_NUM_SKILLS; ++skill) {
        slots[skill] ??= { skill: 0, max_skill: 0, advance: 0 };
    }
    slots.length = P_NUM_SKILLS;
    return slots;
}

function reportImpossible(options, message) {
    if (typeof options?.impossible === 'function') options.impossible(message);
}

export function practice_needed_to_advance(level) {
    const rank = Math.trunc(level);
    return rank * rank * 20;
}

export function spell_skilltype(booktype, state = game) {
    return objectSkill(booktype, state);
}

// C ref: spell.c initialspell(). The final slot is the permanent sentinel;
// playable spells occupy indices 0 through MAXSPELL - 1.
export function initialspell(obj, state = game, options = {}) {
    if (!obj || !Number.isInteger(obj.otyp))
        throw new TypeError('initialspell requires an inventory object');
    const slots = spellSlots(state);
    const otyp = obj.otyp;
    let index = 0;
    while (index < MAXSPELL
           && slots[index].sp_id !== NO_SPELL
           && slots[index].sp_id !== otyp) ++index;

    if (index === MAXSPELL) {
        reportImpossible(options, 'Too many spells memorized!');
        return -1;
    }
    if (slots[index].sp_id !== NO_SPELL) {
        reportImpossible(
            options,
            `Spell ${OBJ_NAME(objectCatalog(state)[otyp], state)} already known.`,
        );
        return -1;
    }

    slots[index].sp_id = otyp;
    slots[index].sp_lev = objectLevel(otyp, state);
    slots[index].sp_know = SPELL_KNOWLEDGE_KEEN;
    return index;
}

export function num_spells(state = game) {
    const slots = spellSlots(state);
    let count = 0;
    while (count < MAXSPELL && slots[count].sp_id !== NO_SPELL) ++count;
    return count;
}

function isAmmo(obj, state) {
    const skill = objectSkill(obj.otyp, state);
    return (obj.oclass === WEAPON_CLASS || obj.oclass === GEM_CLASS)
        && skill >= -P_CROSSBOW
        && skill <= -P_BOW;
}

// C ref: weapon.c weapon_type(). This helper is exported because startup
// equipment and later weapon work use the same object-table interpretation.
export function weapon_type(obj, state = game) {
    if (!obj) return P_BARE_HANDED_COMBAT;
    if (obj.oclass !== WEAPON_CLASS
        && obj.oclass !== TOOL_CLASS
        && obj.oclass !== GEM_CLASS) return P_NONE;
    return Math.abs(objectSkill(obj.otyp, state));
}

export function unrestrict_weapon_skill(skill, state = game) {
    const slots = skillSlots(state);
    if (!Number.isInteger(skill) || skill < 0 || skill >= P_NUM_SKILLS)
        return false;
    if (slots[skill].skill !== P_ISRESTRICTED) return false;
    slots[skill].skill = P_UNSKILLED;
    slots[skill].max_skill = P_BASIC;
    slots[skill].advance = 0;
    return true;
}

function spellbookKnowledgeLimit(currentSkill, pauper) {
    switch (currentSkill) {
    case P_BASIC:
        return 3;
    case P_SKILLED:
        return 5;
    case P_EXPERT:
    case P_MASTER:
    case P_GRAND_MASTER:
        return 7;
    case P_UNSKILLED:
    default:
        return pauper ? 0 : 1;
    }
}

export function skill_based_spellbook_id(
    state = game,
    { discoverObject = discover_object } = {},
) {
    if (state.urole?.mnum !== PM_WIZARD) return 0;
    if (!Array.isArray(state.svb?.bases))
        throw new Error('spellbook identification requires object class bounds');
    const objects = objectCatalog(state);
    const skills = skillSlots(state);
    const first = state.svb.bases[SPBOOK_CLASS];
    const last = state.svb.bases[SPBOOK_CLASS + 1];
    let identified = 0;

    for (let booktype = first; booktype < last; ++booktype) {
        const skill = spell_skilltype(booktype, state);
        if (skill === P_NONE) continue;
        const knownUpToLevel = spellbookKnowledgeLimit(
            skills[skill].skill,
            Boolean(state.u.uroleplay?.pauper),
        );
        if (Math.trunc(objects[booktype].oc_level) <= knownUpToLevel) {
            discoverObject(booktype, true, false, false, state);
            ++identified;
        }
    }
    return identified;
}

// C ref: weapon.c skill_init(). The caller invokes this only after every
// starting object has had its equipment, discovery, and initialspell effects.
export function skill_init(
    classSkills,
    state = game,
    options = {},
) {
    const roleSkills = classSkills ?? skillsForRole(state.urole);
    const skills = skillSlots(state);

    for (let skill = 0; skill < P_NUM_SKILLS; ++skill) {
        skills[skill].skill = P_ISRESTRICTED;
        skills[skill].max_skill = P_ISRESTRICTED;
        skills[skill].advance = 0;
    }

    for (let obj = state.invent ?? null; obj; obj = obj.nobj) {
        if (isAmmo(obj, state)) continue;
        const skill = weapon_type(obj, state);
        if (skill !== P_NONE) skills[skill].skill = P_BASIC;
    }

    switch (state.urole?.mnum) {
    case PM_HEALER:
    case PM_MONK:
        skills[P_HEALING_SPELL].skill = P_BASIC;
        break;
    case PM_CLERIC:
        skills[P_CLERIC_SPELL].skill = P_BASIC;
        break;
    case PM_WIZARD:
        skills[P_ATTACK_SPELL].skill = P_BASIC;
        skills[P_ENCHANTMENT_SPELL].skill = P_BASIC;
        break;
    default:
        break;
    }

    for (const definition of roleSkills) {
        if (definition.skill === P_NONE) break;
        const skill = Math.trunc(definition.skill);
        if (skill < 0 || skill >= P_NUM_SKILLS)
            throw new RangeError(`invalid role skill ${skill}`);
        skills[skill].max_skill = Math.trunc(definition.skmax);
        if (skills[skill].skill === P_ISRESTRICTED)
            skills[skill].skill = P_UNSKILLED;
    }

    if (skills[P_BARE_HANDED_COMBAT].max_skill > P_EXPERT)
        skills[P_BARE_HANDED_COMBAT].skill = P_BASIC;
    if (state.urole?.petnum === PM_PONY)
        skills[P_RIDING].skill = P_BASIC;

    for (let skill = 0; skill < P_NUM_SKILLS; ++skill) {
        if (skills[skill].skill === P_ISRESTRICTED) continue;
        if (skills[skill].max_skill < skills[skill].skill) {
            reportImpossible(options, `skill_init: current exceeds maximum for ${skill}`);
            skills[skill].max_skill = skills[skill].skill;
        }
        skills[skill].advance = practice_needed_to_advance(
            skills[skill].skill - 1,
        );
    }

    unrestrict_weapon_skill(
        spell_skilltype(state.urole.spelspec, state),
        state,
    );
    if (!state.u.uroleplay?.pauper)
        skill_based_spellbook_id(state, options);
    return skills;
}

const PAUPER_PREKNOWN_OBJECT = Object.freeze(new Map([
    [PM_HEALER, SPE_HEALING],
    [PM_CLERIC, SPE_PROTECTION],
    [PM_KNIGHT, SPE_PROTECTION],
    [PM_MONK, SPE_PROTECTION],
    [PM_WIZARD, SPE_FORCE_BOLT],
    [PM_ARCHEOLOGIST, TOUCHSTONE],
    [PM_CAVE_DWELLER, FLINT],
    [PM_ROGUE, SACK],
    [PM_TOURIST, SACK],
    [PM_SAMURAI, FOOD_RATION],
]));

export function pauper_reinit(
    state = game,
    { discoverObject = discover_object } = {},
) {
    if (!state.u?.uroleplay?.pauper) return false;
    const skills = skillSlots(state);
    for (let skill = 0; skill < P_NUM_SKILLS; ++skill) {
        if (skills[skill].skill > P_UNSKILLED) {
            skills[skill].skill = P_UNSKILLED;
            skills[skill].advance = 0;
        }
    }
    state.u.weapon_slots = 2;

    const preknown = PAUPER_PREKNOWN_OBJECT.get(state.urole?.mnum);
    if (preknown !== undefined)
        discoverObject(preknown, true, false, false, state);
    return true;
}

export function ensure_starting_spell_power(state = game) {
    const { u } = state;
    if (num_spells(state) === 0 || u.uenmax >= LEVEL_ONE_SPELL_POWER)
        return false;
    u.ueninc ??= [];
    u.uen = LEVEL_ONE_SPELL_POWER;
    u.uenmax = LEVEL_ONE_SPELL_POWER;
    u.uenpeak = LEVEL_ONE_SPELL_POWER;
    u.ueninc[u.ulevel] = LEVEL_ONE_SPELL_POWER;
    return true;
}

// This is the source-order tail of u_init_skills_discoveries(). The caller
// must first traverse inventory in nobj order, invoking initialspell() for
// each non-blank spellbook after applying that object's discovery/equipment
// effects. find_ac() remains after this function at the integration boundary.
export function finalize_startup_skills(state = game, options = {}) {
    skill_init(skillsForRole(state.urole), state, options);
    pauper_reinit(state, options);
    ensure_starting_spell_power(state);
    return state;
}

export const _startupSkillInternals = Object.freeze({
    PAUPER_PREKNOWN_OBJECT,
    isAmmo,
    spellbookKnowledgeLimit,
});
