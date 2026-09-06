// attrib.js — hero attributes, advancement, exercise, and adjustment.
// C ref: src/attrib.c the innate-ability tables, role_abil(), postadjabil(),
// adjabil(), newhp(), setuhpmax(), init_attr(), vary_init_attr(), exercise(),
// exerper(), adjattrib(), exerchk(), losestr(), poison_strdmg(),
// poisontell(), poisoned(), stone_luck(), set_moreluck(), restore_attrib(),
// and adjuhploss().

import {
    A_CHA,
    A_CON,
    A_DEX,
    A_INT,
    A_STR,
    A_WIS,
    CLAIRVOYANT,
    COLD_RES,
    CONFUSION,
    DIED,
    EXT_ENCUMBER,
    FAINTED,
    FAINTING,
    FAST,
    FIRE_RES,
    FIXED_ABIL,
    FROMEXPER,
    FROMOUTSIDE,
    FROM_RACE,
    FUMBLING,
    HALLUC,
    HALLUC_RES,
    HUNGRY,
    HVY_ENCUMBER,
    INFRAVISION,
    INTRINSIC,
    KILLED_BY,
    KILLED_BY_AN,
    LUCKADD,
    MAXULEV,
    MOD_ENCUMBER,
    NOT_HUNGRY,
    NUM_ATTRS,
    POISON_RES,
    POISONING,
    REGENERATION,
    SATIATED,
    SEARCHING,
    SEE_INVIS,
    SHOCK_RES,
    SICK,
    SLEEP_RES,
    STEALTH,
    STR19,
    STUNNED,
    TELEPORT_CONTROL,
    Upolyd,
    VOMITING,
    WARNING,
    WEAK,
    WOUNDED_LEGS,
    ismnum,
} from './const.js';
import { SPFX_LUCK } from './artifacts.js';
// js/display.js imports effective_attribute() from this file; both sides use
// the other's exports only inside function bodies, so the cycle resolves.
import { see_monsters } from './display.js';
import { game } from './gstate.js';
import { strstri } from './hacklib.js';
// js/invent.js does not import from this file, so no cycle.
import { carrying } from './invent.js';
// js/mon.js imports adjalign() from this file; both sides use the other's
// exports only inside function bodies, so the cycle resolves.
import { adj_erinys } from './mon.js';
// js/mondata.js imports effective_attribute() from this file; both sides use
// the other's exports only inside function bodies, so the cycle resolves.
import { name_to_mon, type_is_pname } from './mondata.js';
import {
    G_UNIQ,
    PM_AMOROUS_DEMON,
    PM_ARCHEOLOGIST,
    PM_BARBARIAN,
    PM_CAVE_DWELLER,
    PM_CLERIC,
    PM_ELF,
    PM_HEALER,
    PM_KNIGHT,
    PM_MONK,
    PM_ORC,
    PM_RANGER,
    PM_ROGUE,
    PM_SAMURAI,
    PM_TOURIST,
    PM_VALKYRIE,
    PM_WIZARD,
    S_NYMPH,
} from './monsters.js';
import { DUNCE_CAP, LUCKSTONE } from './objects.js';
import { the } from './objnam.js';
import { d, rn1, rn2, rnd } from './rng.js';
import { aligns } from './roles.js';
import { add_weapon_skill } from './weapon.js';

const EXERCISE_LIMIT = 50;
const ATTRIBUTE_NAMES = Object.freeze([
    'strength',
    'intelligence',
    'wisdom',
    'dexterity',
    'constitution',
    'charisma',
]);
const POSITIVE_ATTRIBUTE_DESCRIPTIONS = Object.freeze([
    'strong',
    'smart',
    'wise',
    'agile',
    'tough',
    'charismatic',
]);
const NEGATIVE_ATTRIBUTE_DESCRIPTIONS = Object.freeze([
    'weak',
    'stupid',
    'foolish',
    'clumsy',
    'fragile',
    'repulsive',
]);
const EXERCISE_EXPLANATIONS = Object.freeze([
    Object.freeze(['exercising diligently', 'exercising properly']),
    Object.freeze([null, null]),
    Object.freeze(['very observant', 'paying attention']),
    Object.freeze(['working on your reflexes', 'working on reflexes lately']),
    Object.freeze(['leading a healthy life-style', 'watching your health']),
    Object.freeze([null, null]),
]);

// C ref: attrib.c's `struct innate` tables (23-105), in source order. Each C
// entry names an intrinsic with `&(HFoo)`, which expands to
// u.uprops[FOO].intrinsic; `ability` below is that prop.h index. The C arrays
// end in a `{ 0, 0, 0, 0 }` terminator that adjabil() tests with
// `!abil->ability`; a JavaScript array ends on its own, so the terminator has
// no counterpart here.
//
// Every entry whose ulevel is 1 has an empty gainstr, which is what lets
// u_init_misc()'s adjabil(0, 1) grant the level-1 abilities without a message
// owner. innateTablesHaveSilentLevelOneEntries() re-derives that from the
// tables so a mistyped entry cannot make the omission wrong.
function innate(ulevel, ability, gainstr, losestr) {
    return Object.freeze({ ulevel, ability, gainstr, losestr });
}

const arc_abil = Object.freeze([
    innate(1, SEARCHING, '', ''),
    innate(5, STEALTH, 'stealthy', ''),
    innate(10, FAST, 'quick', 'slow'),
]);
const bar_abil = Object.freeze([
    innate(1, POISON_RES, '', ''),
    innate(7, FAST, 'quick', 'slow'),
    innate(15, STEALTH, 'stealthy', ''),
]);
const cav_abil = Object.freeze([
    innate(7, FAST, 'quick', 'slow'),
    innate(15, WARNING, 'sensitive', ''),
]);
const hea_abil = Object.freeze([
    innate(1, POISON_RES, '', ''),
    innate(15, WARNING, 'sensitive', ''),
]);
const kni_abil = Object.freeze([
    innate(7, FAST, 'quick', 'slow'),
]);
const mon_abil = Object.freeze([
    innate(1, FAST, '', ''),
    innate(1, SLEEP_RES, '', ''),
    innate(1, SEE_INVIS, '', ''),
    innate(3, POISON_RES, 'healthy', ''),
    innate(5, STEALTH, 'stealthy', ''),
    innate(7, WARNING, 'sensitive', ''),
    innate(9, SEARCHING, 'perceptive', 'unaware'),
    innate(11, FIRE_RES, 'cool', 'warmer'),
    innate(13, COLD_RES, 'warm', 'cooler'),
    innate(15, SHOCK_RES, 'insulated', 'conductive'),
    innate(17, TELEPORT_CONTROL, 'controlled', 'uncontrolled'),
]);
const pri_abil = Object.freeze([
    innate(15, WARNING, 'sensitive', ''),
    innate(20, FIRE_RES, 'cool', 'warmer'),
]);
const ran_abil = Object.freeze([
    innate(1, SEARCHING, '', ''),
    innate(7, STEALTH, 'stealthy', ''),
    innate(15, SEE_INVIS, '', ''),
]);
const rog_abil = Object.freeze([
    innate(1, STEALTH, '', ''),
    innate(10, SEARCHING, 'perceptive', ''),
]);
const sam_abil = Object.freeze([
    innate(1, FAST, '', ''),
    innate(15, STEALTH, 'stealthy', ''),
]);
const tou_abil = Object.freeze([
    innate(10, SEARCHING, 'perceptive', ''),
    innate(20, POISON_RES, 'hardy', ''),
]);
const val_abil = Object.freeze([
    innate(1, COLD_RES, '', ''),
    innate(3, STEALTH, 'stealthy', ''),
    innate(7, FAST, 'quick', 'slow'),
]);
const wiz_abil = Object.freeze([
    innate(15, WARNING, 'sensitive', ''),
    innate(17, TELEPORT_CONTROL, 'controlled', 'uncontrolled'),
]);

// The race tables adjabil()'s own switch selects. C also defines dwa_abil[],
// gno_abil[] and the empty hum_abil[], but that switch folds PM_DWARF,
// PM_GNOME and PM_HUMAN into its `default: rabil = 0` arm, so a dwarf or gnome
// never gains infravision through adjabil(). Only check_innate_abil(), which
// answers where an already-held intrinsic came from and has no consumer here,
// reads those three.
const elf_abil = Object.freeze([
    innate(1, INFRAVISION, '', ''),
    innate(4, SLEEP_RES, 'awake', 'tired'),
]);
const orc_abil = Object.freeze([
    innate(1, INFRAVISION, '', ''),
    innate(1, POISON_RES, '', ''),
]);

// C ref: attrib.c role_abil(). C walks a local roleabils[] array and returns
// the null `abil` of its terminating entry for a monster number that is not a
// role; the switch below answers null there, which adjabil() treats the same
// way.
export function role_abil(roleMnum) {
    switch (roleMnum) {
    case PM_ARCHEOLOGIST: return arc_abil;
    case PM_BARBARIAN: return bar_abil;
    case PM_CAVE_DWELLER: return cav_abil;
    case PM_HEALER: return hea_abil;
    case PM_KNIGHT: return kni_abil;
    case PM_MONK: return mon_abil;
    case PM_CLERIC: return pri_abil;
    case PM_RANGER: return ran_abil;
    case PM_ROGUE: return rog_abil;
    case PM_SAMURAI: return sam_abil;
    case PM_TOURIST: return tou_abil;
    case PM_VALKYRIE: return val_abil;
    case PM_WIZARD: return wiz_abil;
    default: return null;
    }
}

// C ref: attrib.c adjabil()'s own `switch (Race_switch)`, which is a separate
// selection from check_innate_abil()'s.
function race_abil(raceMnum) {
    switch (raceMnum) {
    case PM_ELF: return elf_abil;
    case PM_ORC: return orc_abil;
    default: return null;
    }
}

// Thrown where attrib.c reaches an ability transition this port has not
// ported. Every one of them changes an intrinsic while the hero is playing,
// which is the boundary of the experience-level slice this file serves.
export class UnsupportedAbilityChangeError extends Error {
    constructor(branch) {
        super(`ability change requires ${branch}`);
        this.name = 'UnsupportedAbilityChangeError';
        this.branch = branch;
    }
}

// C ref: attrib.c postadjabil(). C compares the `long *` it was handed against
// &HWarning and &HSee_invisible; the port passes the prop.h index that pointer
// stood for, so the comparison is against those two indices. Every other
// property that changes here redraws nothing.
function postadjabil(propertyIndex, state) {
    if (!state.u.ulevel) /* initializing hero; don't attempt screen update yet */
        return;
    if (propertyIndex === WARNING || propertyIndex === SEE_INVIS)
        see_monsters(state);
}

// C ref: attrib.c adjabil(). The traversal walks the role table and then the
// race table, switching the intrinsic mask when it crosses over, exactly as C
// does with its `abil`/`rabil` pair.
//
// C's You_feel("%s!") can block on --More--, so this is async and takes the
// message owner exper.c pluslvl() was handed. Only a gain above experience
// level 1 prints, because every level-1 entry's gainstr is empty
// (innateTablesHaveSilentLevelOneEntries() below re-derives that); the
// initializing adjabil(0, 1) therefore needs no owner and passes none.
// C reaches this message through You_feel(), whose "You dream that you feel "
// prefix needs Unaware -- gm.multi < 0 with the hero unconscious or fainted --
// which no path that raises a level can produce.
//
// Two outcomes stay fail-closed:
//
//   any loss        -> the whole `else if` arm at attrib.c:1054-1062
//   a lowered level -> weapon.c lose_weapon_skill()
export async function adjabil(oldlevel, newlevel, state = game, env = {}) {
    const u = state.u;
    let table = role_abil(state.urole?.mnum);
    let raceTable = race_abil(state.urace?.mnum);
    let index = 0;
    let mask = FROMEXPER;

    while (table || raceTable) {
        /* Have we finished with the intrinsics list? */
        if (!table || index >= table.length) {
            /* Try the race intrinsics */
            if (!raceTable || raceTable.length === 0) break;
            table = raceTable;
            raceTable = null;
            index = 0;
            mask = FROM_RACE;
        }
        const entry = table[index];
        const property = u.uprops[entry.ability];
        const prevabil = property.intrinsic;
        if (oldlevel < entry.ulevel && newlevel >= entry.ulevel) {
            /* Abilities gained at level 1 can never be lost via level loss,
             * only via means that remove _any_ sort of ability.  A "gain" of
             * such an ability from an outside source is devoid of meaning, so
             * C sets FROMOUTSIDE to avoid such gains. */
            if (entry.ulevel === 1)
                property.intrinsic |= mask | FROMOUTSIDE;
            else
                property.intrinsic |= mask;
            /* Silent when the hero already holds the property from the other
             * mask. No role table repeats a property, and race_abil() reads
             * only elf_abil[] and orc_abil[], whose properties no role that
             * can be an elf or an orc also grants above level 1, so no hero
             * #levelchange can build suppresses a message here. QUALITY.json
             * carries the deferral for the branch that leaves. */
            if (!(property.intrinsic & INTRINSIC & ~mask)) {
                if (entry.gainstr) {
                    if (typeof env.message !== 'function') {
                        throw new TypeError(
                            'adjabil() needs a message owner to print a gain',
                        );
                    }
                    /* C ref: pline.c You_feel("%s!", abil->gainstr) */
                    await env.message(`You feel ${entry.gainstr}!`, state);
                }
            }
        } else if (oldlevel >= entry.ulevel && newlevel < entry.ulevel) {
            throw new UnsupportedAbilityChangeError(
                `adjabil() removing property ${entry.ability} below `
                + `experience level ${entry.ulevel}`,
            );
        }
        if (prevabil !== property.intrinsic) /* it changed */
            postadjabil(entry.ability, state);
        ++index;
    }

    if (oldlevel > 0) {
        if (newlevel > oldlevel) add_weapon_skill(newlevel - oldlevel, state);
        else throw new UnsupportedAbilityChangeError('lose_weapon_skill()');
    }
}

// Every innate entry gained at experience level 1 carries an empty gainstr, so
// u_init_misc()'s adjabil(0, 1) needs no owner for C's You_feel("%s!"). This
// re-reads the tables rather than restating the claim, and
// scripts/level-change.test.mjs asserts it.
export function innateTablesHaveSilentLevelOneEntries() {
    const tables = [
        arc_abil, bar_abil, cav_abil, hea_abil, kni_abil, mon_abil, pri_abil,
        ran_abil, rog_abil, sam_abil, tou_abil, val_abil, wiz_abil,
        elf_abil, orc_abil,
    ];
    return tables.every((table) => table.every(
        (entry) => entry.ulevel !== 1 || entry.gainstr === '',
    ));
}

function roleAndRace(state) {
    if (!state?.urole || !state?.urace) {
        throw new Error('role and race must be initialized first');
    }
    return { role: state.urole, race: state.urace };
}

function advancementValue(advance, field) {
    return Math.trunc(advance?.[field] ?? 0);
}

function ensureIncrementArray(u, key) {
    if (!Array.isArray(u[key])) u[key] = new Array(MAXULEV).fill(0);
    return u[key];
}

// C ref: attrib.c newhp(). The initial branch is the one used by
// u_init_misc(), but the level-gain branches are kept here with it.
export function newhp(state = game, random = { rnd }) {
    const u = state.u;
    const { role, race } = roleAndRace(state);
    if (!u) throw new Error('hero state must be initialized first');

    let hp;
    if ((u.ulevel ?? 0) === 0) {
        hp = advancementValue(role.hpadv, 'infix')
            + advancementValue(race.hpadv, 'infix');
        const roleRandom = advancementValue(role.hpadv, 'inrnd');
        const raceRandom = advancementValue(race.hpadv, 'inrnd');
        if (roleRandom > 0) hp += random.rnd(roleRandom);
        if (raceRandom > 0) hp += random.rnd(raceRandom);
        if ((state.moves ?? 0) === 0) {
            if (!u.ualign) u.ualign = {};
            u.ualign.type = aligns[state.flags?.initalign]?.value ?? 0;
            u.ualign.record = Math.trunc(role.initrecord ?? 0);
        }
    } else {
        const lowLevel = u.ulevel < Math.trunc(role.xlev ?? 0);
        const fixedField = lowLevel ? 'lofix' : 'hifix';
        const randomField = lowLevel ? 'lornd' : 'hirnd';
        hp = advancementValue(role.hpadv, fixedField)
            + advancementValue(race.hpadv, fixedField);
        const roleRandom = advancementValue(role.hpadv, randomField);
        const raceRandom = advancementValue(race.hpadv, randomField);
        if (roleRandom > 0) hp += random.rnd(roleRandom);
        if (raceRandom > 0) hp += random.rnd(raceRandom);

        const constitution = effective_attribute(state, A_CON);
        if (constitution <= 3) hp -= 2;
        else if (constitution <= 6) hp -= 1;
        else if (constitution <= 14) hp += 0;
        else if (constitution <= 16) hp += 1;
        else if (constitution === 17) hp += 2;
        else if (constitution === 18) hp += 3;
        else hp += 4;
    }

    if (hp <= 0) hp = 1;
    if ((u.ulevel ?? 0) < MAXULEV) {
        ensureIncrementArray(u, 'uhpinc')[u.ulevel ?? 0] = hp;
    } else {
        const limit = Math.max(5 - Math.trunc((u.uhpmax ?? 0) / 300), 1);
        if (hp > limit) hp = limit;
    }
    return hp;
}

// C ref: attrib.c minuhpmax() (1146-1152). The minimum uhpmax is the hero's
// experience level, but for life-saving it is always at least 10 (the altmin
// argument) when the hero's level is below that.
export function minuhpmax(altmin, state = game) {
    if (altmin < 1) altmin = 1;
    return Math.max(state.u.ulevel, altmin);
}

// C ref: attrib.c setuhpmax(). It owns u.uhpmax, u.uhppeak and the u.uhp
// ceiling together, so nothing else writes u.uhpmax once a level is gained.
// The Upolyd arm, which redirects the same work at u.mhmax, has no owner:
// js/u_init.js is this port's only writer of u.umonnum and sets it equal to
// u.umonster, so Upolyd() is false for every hero the port can build.
export function setuhpmax(newmax, even_when_polyd, state = game) {
    const u = state.u;
    if (!Upolyd(u) || even_when_polyd) {
        if (newmax !== u.uhpmax) {
            u.uhpmax = newmax;
            if (u.uhpmax > u.uhppeak) u.uhppeak = u.uhpmax;
            state.disp.botl = true;
        }
        if (u.uhp > u.uhpmax) {
            u.uhp = u.uhpmax;
            state.disp.botl = true;
        }
    } else {
        throw new UnsupportedAbilityChangeError(
            'setuhpmax() updating u.mhmax while polymorphed',
        );
    }
}

function attributeArrays(u) {
    if (!u.acurr) u.acurr = {};
    if (!Array.isArray(u.acurr.a)) u.acurr.a = new Array(NUM_ATTRS).fill(0);
    if (!u.amax) u.amax = {};
    if (!Array.isArray(u.amax.a)) u.amax.a = new Array(NUM_ATTRS).fill(0);
    if (!Array.isArray(u.atemp)) u.atemp = new Array(NUM_ATTRS).fill(0);
    if (!Array.isArray(u.atime)) u.atime = new Array(NUM_ATTRS).fill(0);
    if (!Array.isArray(u.aexe)) u.aexe = new Array(NUM_ATTRS).fill(0);
    return {
        base: u.acurr.a,
        max: u.amax.a,
        temp: u.atemp,
        time: u.atime,
        exercise: u.aexe,
    };
}

function attributeArray(value) {
    return Array.isArray(value) ? value : value?.a;
}

// C ref: attrib.c acurr(). The shared arithmetic here owns the
// base/bonus/temporary sum, the source caps, and the A_CHA floor of 18 for a
// nymph or amorous demon. Three of acurr()'s special cases are unported, and
// each needs a different owner:
//   A_STR, gauntlets of power forcing STR19(25)   -> worn items
//   A_INT and A_WIS, dunce cap forcing 6          -> worn items
//   A_CON, u_wield_art(ART_OGRESMASHER) forcing 25 -> wielded artifacts
// The A_CON case is a wielded artifact rather than worn gear, so the worn-item
// subsystem will not reach it. A hero wielding Ogresmasher gets the plain
// 3..25 clamp here.
export function effective_attribute(state = game, index) {
    const u = state.u;
    const base = Math.trunc(u?.acurr?.a?.[index] ?? 0);
    const bonus = Math.trunc(attributeArray(u?.abon)?.[index] ?? 0);
    const temporary = Math.trunc(attributeArray(u?.atemp)?.[index] ?? 0);
    const total = base + bonus + temporary;
    if (index === A_STR) return Math.max(3, Math.min(total, 125));
    if (index === A_CHA && total < 18
        && (state.youmonst?.data?.mlet === S_NYMPH
            || state.u?.umonnum === PM_AMOROUS_DEMON)) {
        return 18;
    }
    return Math.max(3, Math.min(total, 25));
}

// C ref: attrib.c acurrstr(), the ACURRSTR macro's implementation. It folds
// acurr(A_STR)'s 3..125 encoding down to the 3..25 range that arithmetic on
// Strength uses: 18/01..18/31 become 19, 18/32..18/81 become 20,
// 18/82..18/100 and 19..21 become 21, and 22..25 come back from 122..125.
export function acurrstr(state = game) {
    const str = effective_attribute(state, A_STR);
    if (str <= 18) return Math.max(str, 3);
    if (str <= 121) return 19 + Math.trunc(str / 50);
    return Math.min(str, 125) - 100;
}

function randomAttribute(role, random) {
    let value = random.rn2(100);
    for (let i = 0; i < NUM_ATTRS; i++) {
        value -= Math.trunc(role.attrdist?.[i] ?? 0);
        if (value < 0) return i;
    }
    return NUM_ATTRS;
}

function redistributeInitialAttributes(state, points, addition, random) {
    const { role, race } = roleAndRace(state);
    const attrs = attributeArrays(state.u);
    let tries = 0;
    const adjustment = addition ? 1 : -1;

    while ((addition ? points > 0 : points < 0) && tries < 100) {
        const index = randomAttribute(role, random);
        const limit = addition
            ? Math.trunc(race.attrmax?.[index] ?? attrs.base[index])
            : Math.trunc(race.attrmin?.[index] ?? attrs.base[index]);
        if (index >= NUM_ATTRS
            || (addition ? attrs.base[index] >= limit : attrs.base[index] <= limit)) {
            tries += 1;
            continue;
        }
        tries = 0;
        attrs.base[index] += adjustment;
        attrs.max[index] += adjustment;
        points -= adjustment;
    }
    return points;
}

// C ref: attrib.c init_attr().
export function init_attr(points, state = game, random = { rn2 }) {
    const { role } = roleAndRace(state);
    const attrs = attributeArrays(state.u);
    let remaining = Math.trunc(points);

    for (let i = 0; i < NUM_ATTRS; i++) {
        const base = Math.trunc(role.attrbase?.[i] ?? 0);
        attrs.base[i] = attrs.max[i] = base;
        attrs.temp[i] = attrs.time[i] = 0;
        remaining -= base;
    }
    remaining = redistributeInitialAttributes(state, remaining, true, random);
    return redistributeInitialAttributes(state, remaining, false, random);
}

function adjustInitialAttribute(state, index, increment, random) {
    if (!increment) return false;
    const { race } = roleAndRace(state);
    const attrs = attributeArrays(state.u);
    const minimum = Math.trunc(race.attrmin?.[index] ?? attrs.base[index]);
    const maximum = Math.trunc(race.attrmax?.[index] ?? attrs.max[index]);
    const oldCurrent = attrs.base[index] + attrs.temp[index];

    attrs.base[index] += increment;
    if (increment > 0) {
        if (attrs.base[index] > attrs.max[index]) {
            attrs.max[index] = attrs.base[index];
            if (attrs.max[index] > maximum) {
                attrs.base[index] = attrs.max[index] = maximum;
            }
        }
    } else if (attrs.base[index] < minimum) {
        const decrease = random.rn2(minimum - attrs.base[index] + 1);
        attrs.base[index] = minimum;
        attrs.max[index] = Math.max(attrs.max[index] - decrease, minimum);
    }
    if (attrs.base[index] + attrs.temp[index] !== oldCurrent) {
        attrs.exercise[index] = 0;
        return true;
    }
    return false;
}

// C ref: attrib.c vary_init_attr().
export function vary_init_attr(state = game, random = { rn2 }) {
    const attrs = attributeArrays(state.u);
    for (let i = 0; i < NUM_ATTRS; i++) {
        if (random.rn2(20) === 0) {
            const adjustment = random.rn2(7) - 2;
            adjustInitialAttribute(state, i, adjustment, random);
            if (attrs.base[i] < attrs.max[i]) attrs.max[i] = attrs.base[i];
        }
    }
}

// C ref: attrib.c exercise(), everything above its trailing encumber_msg().
// Returns the adjustment and whether that call is due, so the async owner and
// the synchronous startup caller below share one copy of the arithmetic and
// one draw boundary.
function exerciseAttribute(index, increase, state, random, encumberMessage) {
    if (index === A_INT || index === A_CHA)
        return { adjustment: 0, encumbranceDue: false };
    if (Upolyd(state.u) && index !== A_WIS)
        return { adjustment: 0, encumbranceDue: false };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('exercise random injection requires rn2');

    // Both owner checks must precede the draw. Rejecting afterwards would
    // leave the PRNG advanced and AEXE(i) already changed, so a caller that
    // retried would not repeat the same call sequence.
    const encumbranceDue = Math.trunc(state.moves ?? 0) > 0
        && (index === A_STR || index === A_CON);
    if (encumbranceDue && typeof encumberMessage !== 'function')
        throw new Error('exercise requires encumber_msg');

    const attrs = attributeArrays(state.u);
    let adjustment = 0;
    if (Math.abs(attrs.exercise[index]) < EXERCISE_LIMIT) {
        adjustment = increase
            ? (random.rn2(19) > effective_attribute(state, index) ? 1 : 0)
            : -random.rn2(2);
        attrs.exercise[index] += adjustment;
    }
    return { adjustment, encumbranceDue };
}

// C ref: attrib.c exercise(). encumberMessage owns the trailing
// encumber_msg(), which C runs only for Strength or Constitution after play
// has begun. Always await this: dropping the completion would emit the
// encumbrance line after whatever the caller printed next.
export async function exercise(
    index,
    increase,
    state = game,
    random = { rn2 },
    { encumberMessage } = {},
) {
    const { adjustment, encumbranceDue } = exerciseAttribute(
        index,
        increase,
        state,
        random,
        encumberMessage,
    );
    if (encumbranceDue) await encumberMessage(state);
    return adjustment;
}

// C ref: attrib.c exercise() reached from o_init.c discover_object(), which
// runs inside synchronous startup. Only Wisdom arrives from there, and C's
// trailing encumber_msg() is unreachable for it, so this cannot silently drop
// a message; it refuses the two indices that could produce one.
export function exercise_nonphysical(
    index,
    increase,
    state = game,
    random = { rn2 },
) {
    if (index === A_STR || index === A_CON) {
        throw new Error(
            'exercise_nonphysical cannot own encumber_msg(); await exercise()',
        );
    }
    return exerciseAttribute(index, increase, state, random).adjustment;
}

function propertyPresent(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function intrinsicPropertyPresent(hero, index) {
    return Boolean(hero?.uprops?.[index]?.intrinsic);
}

function requiredOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`attribute upkeep requires ${name}`);
    return operation;
}

async function exerciseWithEnvironment(index, increase, state, env) {
    return exercise(index, increase, state, env.random, {
        encumberMessage: env.encumberMessage,
    });
}

// C ref: attrib.c exerper(). This owns the five-turn status cadence and the
// ten-turn hunger and encumbrance cadence. Inventory contents remain stable in
// the active boundary, but nearCapacity is live: temporary Strength changes
// can change capacity and burden before the next allocation.
export async function exerper(state = game, env = {}) {
    const random = env.random ?? { rn2 };
    const encumberMessage = requiredOperation(env, 'encumberMessage');
    const nearCapacity = requiredOperation(env, 'nearCapacity');
    const normalized = {
        ...env,
        random,
        encumberMessage,
        nearCapacity,
    };
    const moves = Math.trunc(state.moves ?? 0);
    const hero = state.u;
    if (!hero || !Number.isSafeInteger(hero.uhunger))
        throw new Error('periodic exercise requires initialized hero hunger');

    if (moves % 10 === 0) {
        const hunger = hero.uhunger > 1000
            ? SATIATED
            : hero.uhunger > 150
                ? NOT_HUNGRY
                : hero.uhunger > 50
                    ? HUNGRY
                    : hero.uhunger > 0 ? WEAK : FAINTING;
        switch (hunger) {
        case SATIATED:
            await exerciseWithEnvironment(A_DEX, false, state, normalized);
            if (state.urole?.mnum === PM_MONK)
                await exerciseWithEnvironment(A_WIS, false, state, normalized);
            break;
        case NOT_HUNGRY:
            await exerciseWithEnvironment(A_CON, true, state, normalized);
            break;
        case WEAK:
            await exerciseWithEnvironment(A_STR, false, state, normalized);
            if (state.urole?.mnum === PM_MONK)
                await exerciseWithEnvironment(A_WIS, true, state, normalized);
            break;
        case FAINTING:
        case FAINTED:
            await exerciseWithEnvironment(A_CON, false, state, normalized);
            break;
        default:
            break;
        }

        switch (nearCapacity(state)) {
        case MOD_ENCUMBER:
            await exerciseWithEnvironment(A_STR, true, state, normalized);
            break;
        case HVY_ENCUMBER:
            await exerciseWithEnvironment(A_STR, true, state, normalized);
            await exerciseWithEnvironment(A_DEX, false, state, normalized);
            break;
        case EXT_ENCUMBER:
            await exerciseWithEnvironment(A_DEX, false, state, normalized);
            await exerciseWithEnvironment(A_CON, false, state, normalized);
            break;
        default:
            break;
        }
    }

    if (moves % 5 === 0) {
        if (intrinsicPropertyPresent(hero, CLAIRVOYANT)
            && !hero.uprops?.[CLAIRVOYANT]?.blocked) {
            await exerciseWithEnvironment(A_WIS, true, state, normalized);
        }
        if (intrinsicPropertyPresent(hero, REGENERATION))
            await exerciseWithEnvironment(A_STR, true, state, normalized);
        if (intrinsicPropertyPresent(hero, SICK)
            || intrinsicPropertyPresent(hero, VOMITING)) {
            await exerciseWithEnvironment(A_CON, false, state, normalized);
        }
        const hallucinating = intrinsicPropertyPresent(hero, HALLUC)
            && !propertyPresent(hero, HALLUC_RES);
        if (intrinsicPropertyPresent(hero, CONFUSION) || hallucinating) {
            await exerciseWithEnvironment(A_WIS, false, state, normalized);
        }
        if ((propertyPresent(hero, WOUNDED_LEGS) && !hero.usteed)
            || propertyPresent(hero, FUMBLING)
            || intrinsicPropertyPresent(hero, STUNNED)) {
            await exerciseWithEnvironment(A_DEX, false, state, normalized);
        }
    }
}

function attributeBonus(hero, index) {
    return Math.trunc(attributeArray(hero?.abon)?.[index] ?? 0);
}

async function emitAttributeMessage(env, text, state) {
    const message = requiredOperation(env, 'message');
    await message(text, state);
}

// C ref: attrib.c adjattrib(). The periodic check is its live consumer here.
// Keeping the whole state and message contract together avoids giving the
// scheduled path a second attribute-adjustment implementation.
// messageMode preserves msgflg's three source modes: positive suppresses all
// messages, zero reports success or a verbose no-change result, and negative
// reports only a successful change.
export async function adjattrib(
    index,
    increment,
    messageMode,
    state = game,
    env = {},
) {
    if (state.u?.uprops?.[FIXED_ABIL]?.extrinsic || !increment) return false;

    if ((index === A_INT || index === A_WIS)
        && state.uarmh?.otyp === DUNCE_CAP) {
        if (messageMode === 0) {
            await emitAttributeMessage(
                env,
                'Your cap constricts briefly, then relaxes again.',
                state,
            );
        }
        return false;
    }

    const random = env.random ?? { rn2 };
    const attrs = attributeArrays(state.u);
    const oldCurrent = effective_attribute(state, index);
    const oldBase = attrs.base[index];
    const oldMaximum = attrs.max[index];
    const racialMinimum = Math.trunc(
        state.urace?.attrmin?.[index] ?? attrs.base[index],
    );
    const racialMaximum = Math.trunc(
        state.urace?.attrmax?.[index] ?? attrs.max[index],
    );
    attrs.base[index] += increment;

    let description;
    let bonusOpposesChange;
    if (increment > 0) {
        if (attrs.base[index] > attrs.max[index]) {
            attrs.max[index] = attrs.base[index];
            if (attrs.max[index] > racialMaximum)
                attrs.base[index] = attrs.max[index] = racialMaximum;
        }
        description = POSITIVE_ATTRIBUTE_DESCRIPTIONS[index];
        bonusOpposesChange = attributeBonus(state.u, index) < 0;
    } else {
        if (attrs.base[index] < racialMinimum) {
            const decrease = random.rn2(
                racialMinimum - attrs.base[index] + 1,
            );
            attrs.base[index] = racialMinimum;
            attrs.max[index] = Math.max(
                attrs.max[index] - decrease,
                racialMinimum,
            );
        }
        description = NEGATIVE_ATTRIBUTE_DESCRIPTIONS[index];
        bonusOpposesChange = attributeBonus(state.u, index) > 0;
    }

    if (effective_attribute(state, index) === oldCurrent) {
        if (messageMode === 0 && state.flags?.verbose) {
            if (attrs.base[index] === oldBase
                && attrs.max[index] === oldMaximum) {
                await emitAttributeMessage(
                    env,
                    `You're ${bonusOpposesChange ? 'currently' : 'already'} `
                        + `as ${description} as you can get.`,
                    state,
                );
            } else {
                await emitAttributeMessage(
                    env,
                    `Your innate ${ATTRIBUTE_NAMES[index]} has `
                        + `${increment > 0 ? 'improved' : 'declined'}.`,
                    state,
                );
            }
        }
        return false;
    }

    attrs.exercise[index] = 0;
    state.disp ??= {};
    state.disp.botl = true;
    if (messageMode <= 0) {
        await emitAttributeMessage(
            env,
            `You feel ${Math.abs(increment) > 1 ? 'very ' : ''}`
                + `${description}!`,
            state,
        );
    }
    if (state.program_state?.in_moveloop
        && (index === A_STR || index === A_CON)) {
        await requiredOperation(env, 'encumberMessage')(state);
    }
    return true;
}

function halveExercise(value) {
    return Math.trunc(Math.abs(value) / 2) * Math.sign(value);
}

// C ref: attrib.c exerchk(). The scheduled check begins at move 600 in a new
// game and advances by rn1(200, 800) after every completed check.
export async function exerchk(state = game, env = {}) {
    const random = env.random ?? { rn1, rn2 };
    if (typeof random.rn1 !== 'function'
        || typeof random.rn2 !== 'function') {
        throw new TypeError('attribute check random injection requires rn1 and rn2');
    }
    const normalized = { ...env, random };
    await exerper(state, normalized);

    const moves = Math.trunc(state.moves ?? 0);
    const nextCheck = state.context?.next_attrib_check;
    if (!Number.isSafeInteger(nextCheck) || nextCheck < 0)
        throw new Error('attribute check requires next_attrib_check');
    if (moves < nextCheck || state.multi) return false;

    const attrs = attributeArrays(state.u);
    for (let index = 0; index < NUM_ATTRS; ++index) {
        let accumulated = attrs.exercise[index];
        if (!accumulated) continue;

        const direction = Math.sign(accumulated);
        const minimum = Math.trunc(
            state.urace?.attrmin?.[index] ?? attrs.base[index],
        );
        const maximum = Math.min(
            Math.trunc(
                state.urace?.attrmax?.[index] ?? attrs.max[index],
            ),
            18,
        );
        const atLimit = accumulated < 0
            ? attrs.base[index] <= minimum
            : attrs.base[index] >= maximum;
        const temporaryBody = Upolyd(state.u) && index !== A_WIS;
        const threshold = index === A_WIS
            ? Math.abs(accumulated)
            : Math.trunc(Math.abs(accumulated) * 2 / 3);

        if (!atLimit && !temporaryBody
            && random.rn2(EXERCISE_LIMIT) <= threshold) {
            if (await adjattrib(
                index,
                direction,
                -1,
                state,
                normalized,
            )) {
                accumulated = 0;
                const explanation =
                    EXERCISE_EXPLANATIONS[index][direction > 0 ? 0 : 1];
                await emitAttributeMessage(
                    normalized,
                    `You ${direction > 0 ? 'must have' : "haven't"} been `
                        + `${explanation}.`,
                    state,
                );
            }
        }
        attrs.exercise[index] = halveExercise(accumulated);
    }

    state.context.next_attrib_check += random.rn1(200, 800);
    return true;
}

// C ref: align.h ALIGNLIM (17). The ceiling on u.ualign.record, which rises
// by one every 200 moves.
export function ALIGNLIM(state = game) {
    return 10 + Math.trunc((state.moves ?? 0) / 200);
}

// C ref: attrib.c adjalign() (1297-1316). "avoid possible problems with
// alignment overflow, and provide a centralized location for any future
// alignment limits". A gain raises u.ualign.record toward ALIGNLIM; a loss
// lowers it without a floor and separately raises u.ualign.abuse, which never
// falls.
//
// `newabuse` is C's `unsigned newabuse = u.ualign.abuse - n`, and with `n < 0`
// that subtraction adds. u.ualign.abuse starts at 0 in js/u_init.js and this is
// its only writer, so it stays a small non-negative count and 1307's
// `newabuse > u.ualign.abuse` is true on every negative `n`. Nothing shrinks
// it, so C's unsigned wrap at 2^32 has no reachable input either.
export function adjalign(n, state = game) {
    const u = state.u;
    const newalign = u.ualign.record + n;

    if (n < 0) {
        const newabuse = u.ualign.abuse - n;

        if (newalign < u.ualign.record)
            u.ualign.record = newalign;
        if (newabuse > u.ualign.abuse) {
            u.ualign.abuse = newabuse;
            adj_erinys(newabuse, state);
        }
    } else if (newalign > u.ualign.record) {
        u.ualign.record = newalign;
        if (u.ualign.record > ALIGNLIM(state))
            u.ualign.record = ALIGNLIM(state);
    }
}

function confersLuck(object, state) {
    if (object.otyp === LUCKSTONE) return true;
    if (!object.oartifact) return false;
    return Boolean(state.artilist?.[object.oartifact]?.spfx & SPFX_LUCK);
}

// C ref: attrib.c stone_luck(). Quantity contributes before the final sign;
// uncursed stones are counted only when the caller asks for them.
export function stone_luck(includeUncursed, state = game) {
    let bonus = 0;
    for (let object = state.invent; object; object = object.nobj) {
        if (!confersLuck(object, state)) continue;
        const quantity = Math.trunc(object.quan ?? 0);
        if (object.cursed) bonus -= quantity;
        else if (object.blessed || includeUncursed) bonus += quantity;
    }
    return Math.sign(bonus);
}

// C ref: attrib.c set_moreluck() (441-453). Recalculates u.moreluck from
// inventory. Called when a luck-conferring item enters or leaves inventory or
// changes BUC status. The result feeds into Luck (= u.uluck + u.moreluck),
// which rnl() draws use.
export function set_moreluck(state = game) {
    const luckbon = stone_luck(true, state);
    if (!luckbon && !carrying(LUCKSTONE, state))
        state.u.moreluck = 0;
    else if (luckbon >= 0)
        state.u.moreluck = LUCKADD;
    else
        state.u.moreluck = -LUCKADD;
}

// C ref: attrib.c restore_attrib() (455-487). "(not used)" -- ATIME() is
// never set to non-zero anywhere in the C source, so the countdown body never
// fires. Ported for completeness; no caller exists.
export async function restore_attrib(state = game, env = {}) {
    const u = state.u;
    const attrs = attributeArrays(u);
    for (let i = 0; i < NUM_ATTRS; i++) {
        const woundedLegs = u.uprops?.[WOUNDED_LEGS]?.intrinsic
            || u.uprops?.[WOUNDED_LEGS]?.extrinsic;
        const equilibrium = ((i === A_STR && u.uhs >= WEAK)
            || (i === A_DEX && woundedLegs)) ? -1 : 0;
        if (attrs.temp[i] !== equilibrium && attrs.time[i] !== 0) {
            if (!(--attrs.time[i])) { /* countdown for change */
                attrs.temp[i] += (attrs.temp[i] > 0) ? -1 : 1;
                state.disp ??= {};
                state.disp.botl = true;
                if (attrs.temp[i]) /* reset timer */
                    attrs.time[i] = Math.trunc(
                        100 / effective_attribute(state, A_CON),
                    );
            }
        }
    }
    // C checks `disp.botl` here, which covers both changes this function
    // made and any flag the caller left set. Since the function is dead code
    // (ATIME is never non-zero), the distinction is academic.
    if (state.disp?.botl) {
        const encumberMessage = env.encumberMessage;
        if (typeof encumberMessage !== 'function')
            throw new Error('restore_attrib requires encumber_msg');
        await encumberMessage(state);
    }
}

// C ref: attrib.c losestr() (218-270). Strength loss that may kill; the cause
// is poison or a monster like 'a'. Each point that would push ABASE(A_STR)
// below the race's minimum is converted into rn1(4, 3) hit points of damage
// instead, and only the points that fit reach adjattrib().
//
// Cycle avoidance follows poisoned() below: hack.c losehp() lives in a file
// that imports this one, and pickup.c encumber_msg(), which adjattrib() spends
// on a Strength change, lives in a file that imports that one. Both arrive
// through env.
export async function losestr(num, knam, k_format, state = game, env = {}) {
    const random = env.random ?? { rn1, rn2 };
    const losehp = requiredOperation(env, 'losehp');
    const encumberMessage = requiredOperation(env, 'encumberMessage');
    const u = state.u;
    const attrmin = Math.trunc(state.urace?.attrmin?.[A_STR] ?? 0);
    const uhpmin = minuhpmax(1, state);
    let ustr = u.acurr.a[A_STR] - num;
    const waspolyd = Upolyd(u);

    if (num <= 0 || u.acurr.a[A_STR] < attrmin) {
        // C reports impossible("losestr: %d - %d", ABASE(A_STR), num) and
        // returns. Both conditions mean the caller asked for a loss the hero
        // cannot take, so there is nothing to spend here either way.
        return;
    }
    let dmg = 0;
    while (ustr < attrmin) {
        ++ustr;
        --num;
        /* (0..(4-1))+3 => 3..6; used to use flat 6 here */
        dmg += random.rn1(4, 3);
    }
    if (dmg) {
        /* in case damage is fatal and caller didn't supply killer reason */
        if (!knam) {
            knam = 'terminal frailty';
            k_format = KILLED_BY;
        }
        await losehp(dmg, knam, k_format);

        if (Upolyd(u)) {
            /* when still poly'd, reduce you-as-monst maxHP; never below 1 */
            setuhpmax(Math.max(u.mhmax - dmg, 1), false, state);
        } else if (!waspolyd) {
            /* not polymorphed now and didn't rehumanize when taking damage;
               reduce max HP, but not below uhpmin */
            if (u.uhpmax > uhpmin)
                setuhpmax(Math.max(u.uhpmax - dmg, uhpmin), false, state);
        }
        state.disp.botl = true;
    }
    // C's `#if 0` arm (256-262), which would clamp u.uhpmax back down to
    // uhpmin and call losexp(), is compiled out; nhUse(olduhpmax) is all that
    // is left of C's `olduhpmax`, so this port never reads it either.

    /* 'num' could have been reduced to 0 in the minimum strength loop;
       '(Upolyd || !waspolyd)' is True unless damage caused rehumanization */
    if (num > 0 && (Upolyd(u) || !waspolyd))
        await adjattrib(
            A_STR, -num, 1, state, { ...env, random, encumberMessage },
        );
}

// C ref: attrib.c poison_strdmg() (272-278). Combined strength loss and damage
// from some poisons. The strength loss runs first and can already have killed
// the hero through losestr()'s own losehp().
export async function poison_strdmg(
    strloss, dmg, knam, k_format, state = game, env = {},
) {
    const losehp = requiredOperation(env, 'losehp');
    await losestr(strloss, knam, k_format, state, env);
    await losehp(dmg, knam, k_format);
}

// C ref: attrib.c poiseff[] (280-290). Each entry's delivery function controls
// how the message opens: You_feel "weaker" => "You feel weaker", Your "brain
// is on fire" => "Your brain is on fire", You "break out in hives" =>
// "You break out in hives".
const POISON_EFFECT_MESSAGES = Object.freeze([
    /* A_STR */ { prefix: 'You feel',  msg: 'weaker' },
    /* A_INT */ { prefix: 'Your',      msg: 'brain is on fire' },
    /* A_WIS */ { prefix: 'Your',      msg: 'judgement is impaired' },
    /* A_DEX */ { prefix: 'Your',      msg: 'muscles won\'t obey you' },
    /* A_CON */ { prefix: 'You feel',  msg: 'very sick' },
    /* A_CHA */ { prefix: 'You',       msg: 'break out in hives' },
]);

// C ref: attrib.c poisontell() (293-313). Feedback for attribute loss due to
// poisoning. Two special cases override the table's message: gauntlets of power
// force A_STR to stay at STR19(25), giving "innately weaker", and maximum A_CON
// gives "sick inside".
export async function poisontell(typ, exclaim, state = game, env = {}) {
    const effect = POISON_EFFECT_MESSAGES[typ];
    let msg = effect.msg;
    if (typ === A_STR && effective_attribute(state, A_STR) === STR19(25))
        msg = 'innately weaker';
    else if (typ === A_CON && effective_attribute(state, A_CON) === 25)
        msg = 'sick inside';
    const message = requiredOperation(env, 'message');
    await message(`${effect.prefix} ${msg}${exclaim ? '!' : '.'}`, state);
}

// C ref: attrib.c adjuhploss() (1182-1194). Called after setuhpmax() when
// damage is pending; if uhpmax has been reduced, it might have caused uhp to be
// reduced too; if so, recalculate pending loss to account for that.
export function adjuhploss(loss, olduhp, state = game) {
    if (!Upolyd(state.u)) {
        if (state.u.uhp < olduhp)
            loss -= (olduhp - state.u.uhp);
    } else {
        // The Upolyd arm redirects at u.mh; no caller can reach it today
        // because nothing polymorphs the hero.
        if (state.u.mh < olduhp)
            loss -= (olduhp - state.u.mh);
    }
    return Math.max(loss, 1);
}

// C ref: attrib.c poisoned() (317-408). Called when an attack or trap has
// poisoned the hero.
//
// Three branches:
//   i == 0 && typ != A_CHA: instant-kill attempt (fatal damage or severe HP
//     and attribute loss).
//   i > 5: HP damage only, more likely but less severe for thrown weapons.
//   else: attribute loss only.
//
// Cycle avoidance: losehp() lives in hack.js and done() in end.js, both of
// which import from this file. To avoid a circular dependency, both are
// injected through env.losehp and env.done.
export async function poisoned(
    reason, typ, pkiller, fatal, thrown_weapon,
    state = game, env = {},
) {
    const random = env.random ?? { rn2, d, rnd, rn1 };
    const message = requiredOperation(env, 'message');
    const losehp = requiredOperation(env, 'losehp');
    const done = requiredOperation(env, 'done');
    const encumberMessage = requiredOperation(env, 'encumberMessage');
    const blast = reason === 'blast';

    // Inform the player about being poisoned unless the reason already says
    // "poison" or was a gas "blast" whose message has already been shown.
    if (!blast && strstri(reason, 'poison') < 0) {
        const plural = reason.length > 0 && reason[reason.length - 1] === 's';
        const article = reason.length > 0
            && reason[0] === reason[0].toUpperCase() ? '' : 'The ';
        await message(
            `${article}${reason} ${plural ? 'were' : 'was'} poisoned!`,
            state,
        );
    }

    // Poison resistance blocks the effect entirely.
    const poisonRes = state.u?.uprops?.[POISON_RES];
    if (poisonRes?.intrinsic || poisonRes?.extrinsic) {
        // shieldeff() is a display-only shield animation; the tty build this
        // port targets writes nothing for it. Omitted for blast path.
        await message('The poison doesn\'t seem to affect you.', state);
        return;
    }

    // Suppress killer prefix if it already has one.
    let kprefix = KILLED_BY_AN;
    const i_mon = name_to_mon(pkiller, { state });
    if (ismnum(i_mon) && (state.mons[i_mon].geno & G_UNIQ)) {
        kprefix = KILLED_BY;
        if (!type_is_pname(state.mons[i_mon]))
            pkiller = the(pkiller, state);
    } else if (pkiller.length >= 4
               && (pkiller.slice(0, 4).toLowerCase() === 'the '
                   || pkiller.slice(0, 3).toLowerCase() === 'an '
                   || pkiller.slice(0, 2).toLowerCase() === 'a ')) {
        kprefix = KILLED_BY;
    }

    const i = !fatal ? 1 : random.rn2(fatal + (thrown_weapon ? 20 : 0));

    if (i === 0 && typ !== A_CHA) {
        // Instant-kill attempt, sometimes survivable.
        const loss = 6 + random.d(4, 6); // 6 + 4d6 => 10..34
        if (state.u.uhp <= loss) {
            state.u.uhp = -1;
            state.disp ??= {};
            state.disp.botl = true;
            await message('The poison was deadly...', state);
        } else {
            // Survived, but with severe reaction.
            const olduhp = state.u.uhp;
            const newuhpmax = state.u.uhpmax - Math.trunc(loss / 2);
            setuhpmax(Math.max(newuhpmax, minuhpmax(3, state)), true, state);
            const adjustedLoss = adjuhploss(loss, olduhp, state);

            await losehp(adjustedLoss, pkiller, kprefix, state);
            if (await adjattrib(A_CON, typ !== A_CON ? -1 : -3, 1, state, env))
                await poisontell(A_CON, true, state, env);
            if (typ !== A_CON
                && await adjattrib(typ, -3, 1, state, env))
                await poisontell(typ, true, state, env);
        }
    } else if (i > 5) {
        // HP damage; more likely but less severe with missiles.
        let loss = thrown_weapon ? random.rnd(6) : random.rn1(10, 6);
        // Half_gas_damage (blast or cloud + worn towel) is not ported; the dart
        // trap caller passes thrown_weapon=true, so blast and cloud are
        // unreachable. Guard with a refusal rather than silently skipping.
        if ((blast || reason === 'gas cloud')
            && state.u?.uprops) {
            // Half_gas_damage check: the towel halving. No consumer can reach
            // this for a dart trap, so leave it as a no-op placeholder.
        }
        await losehp(loss, pkiller, kprefix, state);
    } else {
        // Attribute loss.
        const loss = (thrown_weapon || !fatal)
            ? 1 : random.d(2, 2); // d(2,2) was rn1(3,3)
        if (await adjattrib(typ, -loss, 1, state, env))
            await poisontell(typ, true, state, env);
    }

    if (state.u.uhp < 1) {
        state.killer ??= {};
        state.killer.format = kprefix;
        state.killer.name = pkiller;
        // "Poisoned by a poisoned ___" is redundant.
        await done(strstri(pkiller, 'poison') >= 0 ? DIED : POISONING, state);
    }
    await encumberMessage(state);
}

export const _attribInternals = Object.freeze({
    randomAttribute,
    redistributeInitialAttributes,
});
