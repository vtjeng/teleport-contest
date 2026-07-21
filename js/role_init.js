// role_init.js -- source-faithful character selection and role setup.
// C ref: src/role.c selection helpers, rigid_role_checks(), role_init(),
// Hello(), and Goodbye(); src/allmain.c welcome().

import { P_CLERIC_SPELL } from './const.js';
import {
    M2_FEMALE,
    M2_HOSTILE,
    M2_MALE,
    M2_NASTY,
    M2_NEUTER,
    M2_PEACEFUL,
    M2_STALK,
    M3_CLOSE,
    M3_WAITFORU,
    M3_WANTSARTI,
    MS_LEADER,
    MS_NEMESIS,
    NUMMONS,
} from './monsters.js';
import { SPE_LIGHT } from './objects.js';
import { rn2, rn2_on_display_rng } from './rng.js';
import {
    A_CHAOTIC,
    A_LAWFUL,
    A_NEUTRAL,
    PICK_RANDOM,
    PICK_RIGID,
    ROLE_ALIGNS,
    ROLE_ALIGNMASK,
    ROLE_FEMALE,
    ROLE_GENDERS,
    ROLE_GENDMASK,
    ROLE_MALE,
    ROLE_NONE,
    ROLE_RACEMASK,
    ROLE_RANDOM,
    aligns,
    genders,
    races,
    roleIndex,
    roles,
    str2align,
    str2gend,
    str2race,
    str2role,
    validalign,
    validgend,
    validrace,
    validrole,
} from './roles.js';

const PM_CLERIC = 337;
const PM_KNIGHT = 335;
const PM_SAMURAI = 340;
const PM_TOURIST = 341;
const PM_VALKYRIE = 342;

// Every quest leader has a fixed gender in monsters.h. Two quest nemeses
// lack male, female, and neuter flags and therefore consume rn2(100).
const QUEST_MONSTER_GENDER = new Map([
    [344, 0], [345, 0], [346, 0], [347, 0], [348, 0], [349, 0],
    [350, 0], [351, 0], [352, 0], [353, 0], [354, 0], [355, 1],
    [356, 1],
    [357, null], [358, 0], [359, 1], [360, 0], [361, 0], [362, 0],
    [363, 0], [364, 0], [365, 0], [366, 0], [367, 0], [368, null],
]);

function filterState(filter = {}) {
    return {
        roles: filter.roles ?? [],
        mask: filter.mask ?? 0,
    };
}

function stateFilter(state) {
    return filterState(state.roleFilter ?? state.rfilter);
}

function validRaceIndex(racenum) {
    return Number.isInteger(racenum) && racenum >= 0 && racenum < races.length;
}

function choice(value, parser) {
    return Number.isInteger(value) ? value : parser(value);
}

function sourceRandom(random, bound) {
    const result = random(bound);
    if (!Number.isInteger(result) || result < 0 || result >= bound) {
        throw new RangeError(`random(${bound}) returned ${result}`);
    }
    return result;
}

export function randrole(forDisplay = false, random = rn2,
                         displayRandom = rn2_on_display_rng) {
    return sourceRandom(forDisplay ? displayRandom : random, roles.length);
}

export function randrace(rolenum, random = rn2) {
    const allowed = races.filter((race) => (
        roles[rolenum].allow & race.allow & ROLE_RACEMASK
    ));
    if (allowed.length) {
        let selected = Math.trunc(sourceRandom(random, allowed.length * 100) / 100);
        for (let i = 0; i < races.length; ++i) {
            if (roles[rolenum].allow & races[i].allow & ROLE_RACEMASK) {
                if (selected-- === 0) return i;
            }
        }
    }
    return sourceRandom(random, races.length);
}

export function randgend(rolenum, racenum, random = rn2) {
    const allowed = [];
    for (let i = 0; i < ROLE_GENDERS; ++i) {
        if (roles[rolenum].allow & races[racenum].allow
            & genders[i].allow & ROLE_GENDMASK) allowed.push(i);
    }
    if (allowed.length)
        return allowed[sourceRandom(random, allowed.length)];
    return sourceRandom(random, ROLE_GENDERS);
}

export function randalign(rolenum, racenum, random = rn2) {
    const allowed = [];
    for (let i = 0; i < ROLE_ALIGNS; ++i) {
        if (roles[rolenum].allow & races[racenum].allow
            & aligns[i].allow & ROLE_ALIGNMASK) allowed.push(i);
    }
    if (allowed.length)
        return allowed[sourceRandom(random, allowed.length)];
    return sourceRandom(random, ROLE_ALIGNS);
}

export function ok_role(rolenum, racenum, gendnum, alignnum, filter = {}) {
    const selectedFilter = filterState(filter);
    if (validrole(rolenum)) {
        if (selectedFilter.roles[rolenum]) return false;
        const allow = roles[rolenum].allow;
        if (validRaceIndex(racenum)
            && !(allow & races[racenum].allow & ROLE_RACEMASK)) return false;
        if (gendnum >= 0 && gendnum < ROLE_GENDERS
            && !(allow & genders[gendnum].allow & ROLE_GENDMASK)) return false;
        if (alignnum >= 0 && alignnum < ROLE_ALIGNS
            && !(allow & aligns[alignnum].allow & ROLE_ALIGNMASK)) return false;
        return true;
    }
    for (let i = 0; i < roles.length; ++i) {
        if (ok_role(i, racenum, gendnum, alignnum, selectedFilter)) return true;
    }
    return false;
}

export function ok_race(rolenum, racenum, gendnum, alignnum, filter = {}) {
    const selectedFilter = filterState(filter);
    if (validRaceIndex(racenum)) {
        if (selectedFilter.mask & races[racenum].selfmask) return false;
        const allow = races[racenum].allow;
        if (validrole(rolenum)
            && !(allow & roles[rolenum].allow & ROLE_RACEMASK)) return false;
        if (gendnum >= 0 && gendnum < ROLE_GENDERS
            && !(allow & genders[gendnum].allow & ROLE_GENDMASK)) return false;
        if (alignnum >= 0 && alignnum < ROLE_ALIGNS
            && !(allow & aligns[alignnum].allow & ROLE_ALIGNMASK)) return false;
        return true;
    }
    for (let i = 0; i < races.length; ++i) {
        if (ok_race(rolenum, i, gendnum, alignnum, selectedFilter)) return true;
    }
    return false;
}

export function ok_gend(rolenum, racenum, gendnum, _alignnum,
                        filter = {}) {
    const selectedFilter = filterState(filter);
    if (gendnum >= 0 && gendnum < ROLE_GENDERS) {
        if (selectedFilter.mask & genders[gendnum].allow) return false;
        const allow = genders[gendnum].allow;
        if (validrole(rolenum)
            && !(allow & roles[rolenum].allow & ROLE_GENDMASK)) return false;
        if (validRaceIndex(racenum)
            && !(allow & races[racenum].allow & ROLE_GENDMASK)) return false;
        return true;
    }
    for (let i = 0; i < ROLE_GENDERS; ++i) {
        if (ok_gend(rolenum, racenum, i, ROLE_NONE, selectedFilter)) return true;
    }
    return false;
}

export function ok_align(rolenum, racenum, _gendnum, alignnum,
                         filter = {}) {
    const selectedFilter = filterState(filter);
    if (alignnum >= 0 && alignnum < ROLE_ALIGNS) {
        if (selectedFilter.mask & aligns[alignnum].allow) return false;
        const allow = aligns[alignnum].allow;
        if (validrole(rolenum)
            && !(allow & roles[rolenum].allow & ROLE_ALIGNMASK)) return false;
        if (validRaceIndex(racenum)
            && !(allow & races[racenum].allow & ROLE_ALIGNMASK)) return false;
        return true;
    }
    for (let i = 0; i < ROLE_ALIGNS; ++i) {
        if (ok_align(rolenum, racenum, ROLE_NONE, i, selectedFilter)) return true;
    }
    return false;
}

export function randrole_filtered(random = rn2, filter = {}) {
    const candidates = [];
    for (let i = 0; i < roles.length; ++i) {
        if (ok_role(i, ROLE_NONE, ROLE_NONE, ROLE_NONE, filter)
            && ok_race(i, ROLE_RANDOM, ROLE_NONE, ROLE_NONE, filter)
            && ok_gend(i, ROLE_NONE, ROLE_RANDOM, ROLE_NONE, filter)
            && ok_align(i, ROLE_NONE, ROLE_NONE, ROLE_RANDOM, filter)) {
            candidates.push(i);
        }
    }
    return candidates.length
        ? candidates[sourceRandom(random, candidates.length)]
        : randrole(false, random);
}

export function pick_role(racenum, gendnum, alignnum, pickhow = PICK_RANDOM,
                          random = rn2, filter = {}) {
    const candidates = [];
    for (let i = 0; i < roles.length; ++i) {
        if (ok_role(i, racenum, gendnum, alignnum, filter)
            && ok_race(i, racenum >= 0 ? racenum : ROLE_RANDOM,
                gendnum, alignnum, filter)
            && ok_gend(i, racenum, gendnum >= 0 ? gendnum : ROLE_RANDOM,
                alignnum, filter)
            && ok_align(i, racenum, gendnum,
                alignnum >= 0 ? alignnum : ROLE_RANDOM, filter)) {
            candidates.push(i);
        }
    }
    if (!candidates.length
        || (candidates.length > 1 && pickhow === PICK_RIGID)) return ROLE_NONE;
    return candidates[sourceRandom(random, candidates.length)];
}

export function pick_race(rolenum, gendnum, alignnum,
                          pickhow = PICK_RANDOM, random = rn2, filter = {}) {
    const candidates = [];
    for (let i = 0; i < races.length; ++i) {
        if (ok_race(rolenum, i, gendnum, alignnum, filter)) candidates.push(i);
    }
    if (!candidates.length
        || (candidates.length > 1 && pickhow === PICK_RIGID)) return ROLE_NONE;
    return candidates[sourceRandom(random, candidates.length)];
}

export function pick_gend(rolenum, racenum, alignnum,
                          pickhow = PICK_RANDOM, random = rn2, filter = {}) {
    const candidates = [];
    for (let i = 0; i < ROLE_GENDERS; ++i) {
        if (ok_gend(rolenum, racenum, i, alignnum, filter)) candidates.push(i);
    }
    if (!candidates.length
        || (candidates.length > 1 && pickhow === PICK_RIGID)) return ROLE_NONE;
    return candidates[sourceRandom(random, candidates.length)];
}

export function pick_align(rolenum, racenum, gendnum,
                           pickhow = PICK_RANDOM, random = rn2, filter = {}) {
    const candidates = [];
    for (let i = 0; i < ROLE_ALIGNS; ++i) {
        if (ok_align(rolenum, racenum, gendnum, i, filter)) candidates.push(i);
    }
    if (!candidates.length
        || (candidates.length > 1 && pickhow === PICK_RIGID)) return ROLE_NONE;
    return candidates[sourceRandom(random, candidates.length)];
}

/**
 * Apply role.c:rigid_role_checks() to state.flags.
 *
 * Required state shape: `{ flags: { initrole, initrace, initgend,
 * initalign } }`. Choices may be source indices or strings accepted by the
 * corresponding str2* function. `state.roleFilter`, when present, has
 * `{ roles: boolean[], mask: number }`, matching `gr.rfilter`.
 */
export function rigid_role_checks(state, random = rn2) {
    const flags = normalizeCharacterFlags(state);
    const filter = stateFilter(state);
    let selected;

    if (flags.initrole === ROLE_RANDOM) {
        flags.initrole = pick_role(flags.initrace, flags.initgend,
            flags.initalign, PICK_RANDOM, random, filter);
        if (flags.initrole < 0)
            flags.initrole = randrole_filtered(random, filter);
    }
    if (flags.initrace === ROLE_RANDOM
        && (selected = pick_race(flags.initrole, flags.initgend,
            flags.initalign, PICK_RANDOM, random, filter)) !== ROLE_NONE) {
        flags.initrace = selected;
    }
    if (flags.initalign === ROLE_RANDOM
        && (selected = pick_align(flags.initrole, flags.initrace,
            flags.initgend, PICK_RANDOM, random, filter)) !== ROLE_NONE) {
        flags.initalign = selected;
    }
    if (flags.initgend === ROLE_RANDOM
        && (selected = pick_gend(flags.initrole, flags.initrace,
            flags.initalign, PICK_RANDOM, random, filter)) !== ROLE_NONE) {
        flags.initgend = selected;
    }

    if (flags.initrole !== ROLE_NONE) {
        if (flags.initrace === ROLE_NONE) {
            flags.initrace = pick_race(flags.initrole, flags.initgend,
                flags.initalign, PICK_RIGID, random, filter);
        }
        if (flags.initalign === ROLE_NONE) {
            flags.initalign = pick_align(flags.initrole, flags.initrace,
                flags.initgend, PICK_RIGID, random, filter);
        }
        if (flags.initgend === ROLE_NONE) {
            flags.initgend = pick_gend(flags.initrole, flags.initrace,
                flags.initalign, PICK_RIGID, random, filter);
        }
    }
    return flags;
}

export function normalizeCharacterFlags(state) {
    const flags = state.flags ??= {};
    const genderWasConfigText = typeof flags.initgend === 'string';
    flags.initrole = choice(flags.initrole, str2role);
    flags.initrace = choice(flags.initrace, str2race);
    flags.initgend = choice(flags.initgend, str2gend);
    flags.initalign = choice(flags.initalign, str2align);
    if (genderWasConfigText
        && flags.initgend >= 0 && flags.initgend < ROLE_GENDERS) {
        flags.female = flags.initgend === 1;
    } else if (typeof flags.female !== 'boolean') {
        // Fresh adapter states which omit the C boolean inherit their
        // configured gender. Numeric restore state with an existing boolean
        // keeps the hero's current sex, which can differ from initgend.
        flags.female = flags.initgend === 1;
    }
    if (!Number.isInteger(flags.pantheon)) flags.pantheon = -1;
    return flags;
}

// C ref: role.c plnamesuffix(). The async tty askname and generic-user
// filtering happen in tty_startup.js before this synchronous suffix parser.
export function plnamesuffix(state) {
    const flags = normalizeCharacterFlags(state);
    const original = String(state.plname ?? '');
    const plnamelen = state.gp?.plnamelen ?? state.plnamelen ?? 0;
    const dash = original.indexOf('-', plnamelen);
    if (dash >= 0) {
        state.plname = original.slice(0, dash);
        for (const token of original.slice(dash + 1).split('-')) {
            let parsed = str2role(token);
            if (parsed !== ROLE_NONE) flags.initrole = parsed;
            else if ((parsed = str2race(token)) !== ROLE_NONE)
                flags.initrace = parsed;
            else if ((parsed = str2gend(token)) !== ROLE_NONE)
                flags.initgend = parsed;
            else if ((parsed = str2align(token)) !== ROLE_NONE)
                flags.initalign = parsed;
        }
    } else {
        state.plname = original;
    }
    state.plname = state.plname.replaceAll(',', ' ');
    return flags;
}

function monsterGender(mnum, random) {
    const fixed = QUEST_MONSTER_GENDER.get(mnum);
    return fixed == null ? Number(sourceRandom(random, 100) < 50) : fixed;
}

function questOverrides(role, alignmnt) {
    return [
        {
            kind: 'leader', mnum: role.ldrnum, msound: MS_LEADER,
            mflags2Set: M2_PEACEFUL, mflags2Clear: 0,
            mflags3Set: M3_CLOSE, mflags3Clear: 0,
            maligntyp: alignmnt * 3,
        },
        {
            kind: 'guardian', mnum: role.guardnum,
            mflags2Set: M2_PEACEFUL, mflags2Clear: 0,
            mflags3Set: 0, mflags3Clear: 0,
            maligntyp: alignmnt * 3,
        },
        {
            kind: 'nemesis', mnum: role.neminum, msound: MS_NEMESIS,
            mflags2Set: M2_NASTY | M2_STALK | M2_HOSTILE,
            mflags2Clear: M2_PEACEFUL,
            mflags3Set: M3_WANTSARTI | M3_WAITFORU,
            mflags3Clear: M3_CLOSE,
        },
    ].filter((override) => override.mnum >= 0);
}

function applyQuestOverride(monster, override) {
    if ('msound' in override) monster.msound = override.msound;
    monster.mflags2 = ((monster.mflags2 ?? 0) & ~override.mflags2Clear)
        | override.mflags2Set;
    monster.mflags3 = ((monster.mflags3 ?? 0) & ~override.mflags3Clear)
        | override.mflags3Set;
    if ('maligntyp' in override) monster.maligntyp = override.maligntyp;
}

// Apply role_init's quest-monster mutations to a source-shaped mutable catalog.
export function applyRoleInitMonsterOverrides(
    state,
    monsters = state.mons,
) {
    if (!Array.isArray(monsters)) return false;
    let complete = true;
    for (const override of state.roleInitMonsterOverrides ?? []) {
        const monster = monsters[override.mnum];
        if (monster) applyQuestOverride(monster, override);
        else complete = false;
    }
    return complete;
}

function genderFromMonster(monster, fallbackMnum, random) {
    if (monster) {
        if (monster.mflags2 & M2_NEUTER) return 2;
        if (monster.mflags2 & M2_FEMALE) return 1;
        if (monster.mflags2 & M2_MALE) return 0;
    }
    return monsterGender(fallbackMnum, random);
}

function alignedGod(role, alignment) {
    if (alignment === A_LAWFUL) return role.lgod;
    if (alignment === A_NEUTRAL) return role.ngod;
    if (alignment === A_CHAOTIC) return role.cgod;
    return null;
}

/**
 * Initialize source role state before init_dungeons().
 *
 * Required state: `{ flags, plname }`; `flags` contains `initrole`,
 * `initrace`, `initgend`, `initalign`, `female`, and `pantheon`. Choices may
 * be source indices or config strings. Optional `pl_character`, `roleFilter`,
 * `objects`, `mons`, and `svq.quest_status` correspond to the C globals. The
 * `mons` must be the mutable catalog from monst_globals_init(). The
 * `random(bound)` callback must have rn2 semantics. Call rigid_role_checks()
 * first when selection contains ROLE_RANDOM or unspecified forced choices.
 */
export function role_init(state, random = rn2) {
    if (!Array.isArray(state.mons) || state.mons.length !== NUMMONS + 1) {
        throw new Error('role_init requires monst_globals_init()');
    }
    const flags = plnamesuffix(state);
    const filter = stateFilter(state);

    if (!validrole(flags.initrole)) {
        flags.initrole = str2role(state.pl_character);
        if (!validrole(flags.initrole))
            flags.initrole = randrole_filtered(random, filter);
    }
    state.pl_character = roles[flags.initrole].name.m;

    if (!validrace(flags.initrole, flags.initrace))
        flags.initrace = randrace(flags.initrole, random);

    if (flags.pantheon === -1
        && !validgend(flags.initrole, flags.initrace,
            Number(flags.female))) {
        flags.female = !flags.female;
    }
    if (!validgend(flags.initrole, flags.initrace, flags.initgend))
        flags.initgend = Number(flags.female);

    if (!validalign(flags.initrole, flags.initrace, flags.initalign))
        flags.initalign = randalign(flags.initrole, flags.initrace, random);
    const alignmnt = aligns[flags.initalign].value;

    state.urole = { ...roles[flags.initrole] };
    state.urace = { ...races[flags.initrace] };

    const overrides = questOverrides(state.urole, alignmnt);
    state.roleInitMonsterOverrides = overrides;
    if (!applyRoleInitMonsterOverrides(state)) {
        throw new Error('role_init requires a complete monster catalog');
    }

    state.svq ??= {};
    const questStatus = state.svq.quest_status ??= {};
    if (state.urole.ldrnum >= 0) {
        questStatus.ldrgend = genderFromMonster(
            state.mons?.[state.urole.ldrnum], state.urole.ldrnum, random,
        );
    }
    if (state.urole.neminum >= 0) {
        questStatus.nemgend = genderFromMonster(
            state.mons?.[state.urole.neminum], state.urole.neminum, random,
        );
    }

    if (flags.pantheon === -1) {
        let attempts = 0;
        flags.pantheon = flags.initrole;
        while (!roles[flags.pantheon].lgod && ++attempts < 100)
            flags.pantheon = randrole(false, random);
        if (!roles[flags.pantheon].lgod) {
            flags.pantheon = roles.findIndex((role) => role.lgod);
        }
    }
    if (!state.urole.lgod) {
        const pantheon = roles[flags.pantheon];
        state.urole.lgod = pantheon.lgod;
        state.urole.ngod = pantheon.ngod;
        state.urole.cgod = pantheon.cgod;
    }
    questStatus.godgend = Number(
        alignedGod(state.urole, alignmnt)?.startsWith('_') ?? false,
    );

    if (state.urole.mnum === PM_CLERIC && state.objects?.[SPE_LIGHT])
        state.objects[SPE_LIGHT].oc_skill = P_CLERIC_SPELL;

    return state;
}

export function Hello(
    role,
    { shopkeeper = false, mailDaemon = false } = {},
) {
    const index = roleIndex(role?.urole ?? role);
    const mnum = index >= 0 ? roles[index].mnum : role?.mnum;
    if (mnum === PM_KNIGHT) return 'Salutations';
    if (mnum === PM_SAMURAI)
        return shopkeeper ? 'Irasshaimase' : 'Konnichi wa';
    if (mnum === PM_TOURIST) return 'Aloha';
    if (mnum === PM_VALKYRIE) return mailDaemon ? 'Hallo' : 'Velkommen';
    return 'Hello';
}

export function Goodbye(role) {
    const index = roleIndex(role?.urole ?? role);
    const mnum = index >= 0 ? roles[index].mnum : role?.mnum;
    if (mnum === PM_KNIGHT) return 'Fare thee well';
    if (mnum === PM_SAMURAI) return 'Sayonara';
    if (mnum === PM_TOURIST) return 'Aloha';
    if (mnum === PM_VALKYRIE) return 'Farvel';
    return 'Goodbye';
}

export function characterConfigIdentity(state) {
    const flags = state.flags;
    const female = Boolean(flags.female);
    const role = state.urole ?? roles[flags.initrole];
    const race = state.urace ?? races[flags.initrace];
    const alignment = aligns[flags.initalign];
    return {
        role: female && role.name.f ? role.name.f : role.name.m,
        roleIndex: flags.initrole,
        race: race.noun,
        raceIndex: flags.initrace,
        gender: genders[Number(female)].adj,
        genderIndex: Number(female),
        alignment: alignment.adj,
        alignmentIndex: flags.initalign,
    };
}

export function welcomeIdentity(state) {
    const flags = state.flags;
    const female = Boolean(flags.female);
    const role = state.urole ?? roles[flags.initrole];
    const race = state.urace ?? races[flags.initrace];
    const words = [aligns[flags.initalign].adj];
    if (!role.name.f
        && (role.allow & ROLE_GENDMASK) === (ROLE_MALE | ROLE_FEMALE)) {
        words.push(genders[Number(female)].adj);
    }
    words.push(race.adj, female && role.name.f ? role.name.f : role.name.m);
    return words.join(' ');
}

export function welcomeMessage(state) {
    return `${Hello(state)} ${state.plname}, welcome to NetHack!  `
        + `You are a ${welcomeIdentity(state)}.`;
}
