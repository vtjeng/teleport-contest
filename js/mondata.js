// Monster name parsing, growth, and species relationships.
// C refs: src/mondata.c name_to_monplus(), name_to_mon(), grownups[],
// little_to_big(), big_to_little(); src/botl.c title_to_mon();
// src/mon.c undead_to_corpse(), can_be_hatched(), dead_species().

import {
    A_CHA,
    ALL_TRAPS,
    ACID_RES,
    ANTIMAGIC,
    COLD_RES,
    DISINT_RES,
    FEMALE,
    FIRE_RES,
    G_GENOD,
    M_SEEN_ACID,
    M_SEEN_COLD,
    M_SEEN_DISINT,
    M_SEEN_ELEC,
    M_SEEN_FIRE,
    M_SEEN_MAGR,
    M_SEEN_NOTHING,
    M_SEEN_POISON,
    M_SEEN_REFL,
    M_SEEN_SLEEP,
    MALE,
    MS_SILENT,
    NATTK,
    NEUTRAL,
    NO_TRAP,
    NUM_MGENDERS,
    POISON_RES,
    REFLECTING,
    SHOCK_RES,
    SLEEP_RES,
    Upolyd,
    W_ACCESSORY,
    W_ARMC,
    W_ARMOR,
    W_WEP,
} from './const.js';
import { effective_attribute } from './attrib.js';
import { artifact_defends } from './artifacts.js';
// grounded() below reads has_ceiling(). The two files already reach each other
// through js/shk.js and js/display.js, and both sides use the other's exports
// only inside function bodies, so this direct edge resolves the same way.
import { has_ceiling } from './dungeon.js';
import { game } from './gstate.js';
import { dist2, highc } from './hacklib.js';
import * as M from './monsters.js';
import { ALCHEMY_SMOCK } from './objects.js';
import { rn2, rnd } from './rng.js';
import { roles } from './roles.js';
import { is_fshk } from './shk.js';
// monstunseesu() below reads m_canseeu(), which reads perceives() from this
// file; the two modules reach each other the way this file and js/dungeon.js
// already do, and neither side uses the other's exports at module scope.
import { m_canseeu } from './vision.js';
import { mon_has_amulet } from './wizard.js';

function hasAttackType(species, attackType) {
    return Boolean(species?.mattk?.some(
        (attack) => attack.aatyp === attackType,
    ));
}

function hasDamageType(species, damageType) {
    return Boolean(species?.mattk?.some(
        (attack) => attack.adtyp === damageType,
    ));
}

// C refs: mondata.c attacktype(), noattacks(), dmgtype(); mondata.h's
// movement-facing permonst predicates. Keep these as direct catalog queries:
// callers decide how a capability interacts with level and monster state.
export function attacktype(species, attackType) {
    return hasAttackType(species, attackType);
}

export function attacktype_fordmg(species, attackType, damageType) {
    return Boolean(species?.mattk?.some(
        (attack) => attack.aatyp === attackType
            && (damageType === M.AD_ANY || attack.adtyp === damageType),
    ));
}

export function noattacks(species) {
    return !species?.mattk?.some(
        (attack) => attack.aatyp && attack.aatyp !== M.AT_BOOM,
    );
}

export function dmgtype(species, damageType) {
    return hasDamageType(species, damageType);
}

// C ref: mondata.h could_twoweap() (129-132). C adds three equality tests
// together and asks for a sum above one, so a form needs two weapon attacks
// among mattk[0], mattk[1] and mattk[2]. The comment at 124-128 records that
// stopping at three slots is deliberate rather than an oversight.
export function could_twoweap(species) {
    let weaponAttacks = 0;
    for (let slot = 0; slot < 3; ++slot) {
        if (species?.mattk?.[slot]?.aatyp === M.AT_WEAP) ++weaponAttacks;
    }
    return weaponAttacks > 1;
}

function flag1(species, mask) {
    return Boolean(species && ((species.mflags1 ?? 0) & mask));
}

function flag2(species, mask) {
    return Boolean(species && ((species.mflags2 ?? 0) & mask));
}

function flag3(species, mask) {
    return Boolean(species && ((species.mflags3 ?? 0) & mask));
}

export function verysmall(species) {
    return Number.isInteger(species?.msize) && species.msize < M.MZ_SMALL;
}

export function bigmonst(species) {
    return Number.isInteger(species?.msize) && species.msize >= M.MZ_LARGE;
}

export function is_flyer(species) { return flag1(species, M.M1_FLY); }
export function is_floater(species) {
    return species?.mlet === M.S_EYE || species?.mlet === M.S_LIGHT;
}
export function is_clinger(species) { return flag1(species, M.M1_CLING); }
// C ref: mondata.h:23-24 grounded(). The macro reads the global u.uz, which
// this port takes from the caller's state so that the planning clone answers
// for its own hero; has_ceiling() takes the same state, so the endgame
// topology it compares against is the caller's too.
export function grounded(species, state = game) {
    return !is_flyer(species) && !is_floater(species)
        && (!is_clinger(species) || !has_ceiling(state.u?.uz, state));
}
export function is_swimmer(species) { return flag1(species, M.M1_SWIM); }
export function breathless(species) { return flag1(species, M.M1_BREATHLESS); }
export function amphibious(species) { return flag1(species, M.M1_AMPHIBIOUS); }
export function passes_walls(species) { return flag1(species, M.M1_WALLWALK); }
export function amorphous(species) { return flag1(species, M.M1_AMORPHOUS); }
export function noncorporeal(species) { return species?.mlet === M.S_GHOST; }
export function tunnels(species) { return flag1(species, M.M1_TUNNEL); }
export function needspick(species) { return flag1(species, M.M1_NEEDPICK); }
export function hides_under(species) { return flag1(species, M.M1_CONCEAL); }
export function is_hider(species) { return flag1(species, M.M1_HIDE); }
export function haseyes(species) { return !flag1(species, M.M1_NOEYES); }
export function nohands(species) { return flag1(species, M.M1_NOHANDS); }
export function nolimbs(species) {
    return species != null
        && ((species.mflags1 ?? 0) & M.M1_NOLIMBS) === M.M1_NOLIMBS;
}
export function notake(species) { return flag1(species, M.M1_NOTAKE); }
export function has_head(species) { return !flag1(species, M.M1_NOHEAD); }
export function unsolid(species) { return flag1(species, M.M1_UNSOLID); }
export function thick_skinned(species) {
    return flag1(species, M.M1_THICK_HIDE);
}
export function mindless(species) { return flag1(species, M.M1_MINDLESS); }
export function humanoid(species) { return flag1(species, M.M1_HUMANOID); }
export function is_animal(species) { return flag1(species, M.M1_ANIMAL); }
export function slithy(species) { return flag1(species, M.M1_SLITHY); }

// C ref: mondata.c locoverbs[]. Each row holds the plain verb, its
// capitalized form, then the staggering verb and its capitalized form.
// locomotion() reads indexes 0 and 1; stagger() reads 2 and 3.
const LOCOVERBS = Object.freeze({
    levitate: ['float', 'Float', 'wobble', 'Wobble'],
    flys: ['fly', 'Fly', 'flutter', 'Flutter'],
    flyl: ['fly', 'Fly', 'stagger', 'Stagger'],
    slither: ['slither', 'Slither', 'falter', 'Falter'],
    ooze: ['ooze', 'Ooze', 'tremble', 'Tremble'],
    immobile: ['wiggle', 'Wiggle', 'pulsate', 'Pulsate'],
    crawl: ['crawl', 'Crawl', 'falter', 'Falter'],
});

// C ref: mondata.c locomotion(). locomotion() and stagger() share one branch
// order and differ only in which pair of indexes they read.
function locoverb(species, def, locoindx) {
    if (is_floater(species)) return LOCOVERBS.levitate[locoindx];
    if (is_flyer(species) && species.msize <= M.MZ_SMALL)
        return LOCOVERBS.flys[locoindx];
    if (is_flyer(species) && species.msize > M.MZ_SMALL)
        return LOCOVERBS.flyl[locoindx];
    if (slithy(species)) return LOCOVERBS.slither[locoindx];
    if (amorphous(species)) return LOCOVERBS.ooze[locoindx];
    if (!species?.mmove) return LOCOVERBS.immobile[locoindx];
    if (nolimbs(species)) return LOCOVERBS.crawl[locoindx];
    return def;
}

// C ref: mondata.c locomotion(). This is used by the live
// monmove.c:msg_mon_movement() path.
export function locomotion(species, fallback) {
    return locoverb(species, fallback, fallback[0] !== highc(fallback[0])
        ? 0 : 1);
}

export function lays_eggs(species) { return flag1(species, M.M1_OVIPAROUS); }
// mondata.h:78-79. An egg layer that is an S_EEL swimmer lays in water, which
// is what keeps sit.c's underwater and in_water arms from stopping an eel.
export function eggs_in_water(species) {
    return lays_eggs(species) && species?.mlet === M.S_EEL
        && is_swimmer(species);
}
export function regenerates(species) { return flag1(species, M.M1_REGEN); }
export function perceives(species) { return flag1(species, M.M1_SEE_INVIS); }
export function can_teleport(species) { return flag1(species, M.M1_TPORT); }
export function control_teleport(species) {
    return flag1(species, M.M1_TPORT_CNTRL);
}
// mondata.h:84-86. Three species by identity rather than by a flag.
export function telepathic(species) {
    return species?.pmidx === M.PM_FLOATING_EYE
        || species?.pmidx === M.PM_MIND_FLAYER
        || species?.pmidx === M.PM_MASTER_MIND_FLAYER;
}
export function acidic(species) { return flag1(species, M.M1_ACID); }
export function poisonous(species) { return flag1(species, M.M1_POIS); }
export function carnivorous(species) { return flag1(species, M.M1_CARNIVORE); }
export function herbivorous(species) { return flag1(species, M.M1_HERBIVORE); }
export function metallivorous(species) {
    return flag1(species, M.M1_METALLIVORE);
}

export function is_undead(species) { return flag2(species, M.M2_UNDEAD); }
export function is_were(species) { return flag2(species, M.M2_WERE); }
export function is_demon(species) { return flag2(species, M.M2_DEMON); }
export function is_mercenary(species) { return flag2(species, M.M2_MERC); }
export function is_elf(species) { return flag2(species, M.M2_ELF); }
export function is_dwarf(species) { return flag2(species, M.M2_DWARF); }
export function is_gnome(species) { return flag2(species, M.M2_GNOME); }
export function is_orc(species) { return flag2(species, M.M2_ORC); }
export function is_lord(species) { return flag2(species, M.M2_LORD); }
export function is_prince(species) { return flag2(species, M.M2_PRINCE); }
export function is_ndemon(species) {
    return is_demon(species) && !flag2(species, M.M2_LORD | M.M2_PRINCE);
}
export function is_dlord(species) {
    return is_demon(species) && is_lord(species);
}
export function is_dprince(species) {
    return is_demon(species) && is_prince(species);
}
export function is_human(species) { return flag2(species, M.M2_HUMAN); }
export function is_giant(species) { return flag2(species, M.M2_GIANT); }
export function is_domestic(species) { return flag2(species, M.M2_DOMESTIC); }
export function is_wanderer(species) { return flag2(species, M.M2_WANDER); }
export function strongmonst(species) { return flag2(species, M.M2_STRONG); }
export function throws_rocks(species) { return flag2(species, M.M2_ROCKTHROW); }
export function is_minion(species) { return flag2(species, M.M2_MINION); }
export function likes_gold(species) { return flag2(species, M.M2_GREEDY); }
export function likes_gems(species) { return flag2(species, M.M2_JEWELS); }
export function likes_objs(species) {
    return flag2(species, M.M2_COLLECT) || attacktype(species, M.AT_WEAP);
}
export function likes_magic(species) { return flag2(species, M.M2_MAGIC); }
export function extra_nasty(species) { return flag2(species, M.M2_NASTY); }
export function always_hostile(species) {
    return flag2(species, M.M2_HOSTILE);
}
export function always_peaceful(species) {
    return flag2(species, M.M2_PEACEFUL);
}
export function is_covetous(species) { return flag3(species, M.M3_COVETOUS); }
export function is_displacer(species) { return flag3(species, M.M3_DISPLACES); }
export function type_is_pname(species) { return flag2(species, M.M2_PNAME); }
// C ref: mondata.h is_mplayer() (157-158). C compares &mons[] addresses; the
// port compares the same catalog indices.
export function is_mplayer(species) {
    return species?.pmidx >= M.PM_ARCHEOLOGIST
        && species?.pmidx <= M.PM_WIZARD;
}

// C ref: mondata.h is_watch() (159-160). C compares &mons[] addresses; the
// port compares the same catalog indices, as is_mplayer() above does.
export function is_watch(species) {
    return species?.pmidx === M.PM_WATCHMAN
        || species?.pmidx === M.PM_WATCH_CAPTAIN;
}

export function is_golem(species) { return species?.mlet === M.S_GOLEM; }
export function nonliving(species) {
    return is_undead(species)
        || species?.pmidx === M.PM_MANES
        || is_golem(species)
        || species?.mlet === M.S_VORTEX;
}
export function webmaker(species) {
    return species?.pmidx === M.PM_CAVE_SPIDER
        || species?.pmidx === M.PM_GIANT_SPIDER;
}

export function is_whirly(species) {
    return species?.mlet === M.S_VORTEX
        || species?.pmidx === M.PM_AIR_ELEMENTAL;
}

export function likes_lava(species) {
    return species?.pmidx === M.PM_FIRE_ELEMENTAL
        || species?.pmidx === M.PM_SALAMANDER;
}

export function flaming(species) {
    return species?.pmidx === M.PM_FIRE_VORTEX
        || species?.pmidx === M.PM_FLAMING_SPHERE
        || likes_lava(species);
}

export function likes_fire(species) {
    return species?.pmidx === M.PM_FIRE_VORTEX
        || species?.pmidx === M.PM_FLAMING_SPHERE
        || likes_lava(species);
}

export function touch_petrifies(species) {
    return species?.pmidx === M.PM_COCKATRICE
        || species?.pmidx === M.PM_CHICKATRICE;
}

export function flesh_petrifies(species) {
    return touch_petrifies(species)
        || species?.pmidx === M.PM_MEDUSA;
}

export function slimeproof(species) {
    return species?.pmidx === M.PM_GREEN_SLIME
        || flaming(species)
        || noncorporeal(species);
}

// C ref: mondata.h vegan(). This is a species diet predicate; hero conduct
// code layers vegetarian() on top of it.
export function vegan(species) {
    return species?.mlet === M.S_BLOB
        || species?.mlet === M.S_JELLY
        || species?.mlet === M.S_FUNGUS
        || species?.mlet === M.S_VORTEX
        || species?.mlet === M.S_LIGHT
        || (species?.mlet === M.S_ELEMENTAL
            && species?.pmidx !== M.PM_STALKER)
        || (species?.mlet === M.S_GOLEM
            && species?.pmidx !== M.PM_FLESH_GOLEM
            && species?.pmidx !== M.PM_LEATHER_GOLEM)
        || noncorporeal(species);
}

// C refs: mondata.h hates_silver(), mondata.c mon_hates_silver(), and
// monmove.h is_vampshifter(). A shapechanger's current cham field matters
// even when its present species would not otherwise hate silver.
export function is_vampshifter(monster) {
    return monster?.cham === M.PM_VAMPIRE
        || monster?.cham === M.PM_VAMPIRE_LEADER
        || monster?.cham === M.PM_VLAD_THE_IMPALER;
}

export function hates_silver(species) {
    return is_were(species)
        || species?.mlet === M.S_VAMPIRE
        || is_demon(species)
        || species?.pmidx === M.PM_SHADE
        || (species?.mlet === M.S_IMP && species?.pmidx !== M.PM_TENGU);
}

export function mon_hates_silver(monster) {
    return is_vampshifter(monster) || hates_silver(monster?.data);
}

function monsterArtifactDefense(monster, obj, field, damageType, state) {
    if (!obj?.oartifact) return false;
    const artifact = state.artilist?.[obj.oartifact];
    if (!artifact) {
        throw new Error(
            `Resists_Elem requires artifact ${obj.oartifact} data`,
        );
    }
    return artifact[field]?.adtyp === damageType;
}

// C ref: mondata.c Resists_Elem(), elemental-property monster arm. Hero
// properties and the three non-elemental delegation cases have separate
// consumers and are outside this monster predicate.
export function monster_resists_element(monster, property, state = game) {
    if (!Number.isInteger(property) || property < 1 || property > 8)
        throw new RangeError(`invalid elemental resistance ${property}`);

    const resistanceMask = 1 << (property - 1);
    const resistanceBits = (monster.data?.mresists ?? 0)
        | (monster.mextrinsics ?? 0)
        | (monster.mintrinsics ?? 0);
    if (resistanceBits & resistanceMask) return true;

    const damageType = property + 1;
    if (monsterArtifactDefense(
        monster,
        monster.mw,
        'defn',
        damageType,
        state,
    )) {
        return true;
    }

    const slotmask = W_ARMOR | W_ACCESSORY | W_WEP;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        const wornProperty = Boolean(
            (obj.owornmask & slotmask)
            && state.objects?.[obj.otyp]?.oc_oprop === property,
        );
        const smockResistance = (obj.owornmask & W_ARMC) === W_ARMC
            && obj.otyp === ALCHEMY_SMOCK
            && (property === POISON_RES || property === ACID_RES);
        if (wornProperty || smockResistance
            || monsterArtifactDefense(
                monster,
                obj,
                'cary',
                damageType,
                state,
            )) {
            return true;
        }
    }
    return false;
}

// C ref: mondata.c resists_magm(), monster arm. General magic resistance
// includes species attacks, gray-dragon ancestry, wielded artifact defense,
// worn property grants, and carried artifact defense.
export function resists_magm(monster, state = game) {
    if (dmgtype(monster.data, M.AD_MAGM)
        || monster.data?.pmidx === M.PM_BABY_GRAY_DRAGON
        || dmgtype(monster.data, M.AD_RBRE)) {
        return true;
    }
    if (artifact_defends(monster.mw, M.AD_MAGM, state)) return true;

    const slotmask = W_ARMOR | W_ACCESSORY | W_WEP;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (((obj.owornmask & slotmask)
                && state.objects?.[obj.otyp]?.oc_oprop === ANTIMAGIC)
            || artifact_defends(obj, M.AD_MAGM, state, true)) {
            return true;
        }
    }
    return false;
}

// C ref: mondata.c resist_conflict(). Keep the unbounded lower end of the
// source chance: sufficiently strong monsters always resist a weak hero.
export function resist_conflict(monster, state = game, random = { rnd }) {
    if (typeof random.rnd !== 'function')
        throw new TypeError('resist_conflict random injection requires rnd');
    const resistChance = Math.min(
        19,
        effective_attribute(state, A_CHA)
            - Math.trunc(monster.m_lev ?? 0)
            + Math.trunc(state.u?.ulevel ?? 0),
    );
    return random.rnd(20) > resistChance;
}

// C ref: mondata.c mon_knows_traps(). The two sentinels retain their source
// meanings; ordinary trap types map to bit positions starting at one.
export function mon_knows_traps(monster, trapType) {
    if (trapType === ALL_TRAPS) return Boolean(monster.mtrapseen);
    if (trapType === NO_TRAP) return !monster.mtrapseen;
    return Boolean((monster.mtrapseen ?? 0) & (1 << (trapType - 1)));
}

// C ref: mondata.c mon_learns_traps(). The inverse of mon_knows_traps(); the
// two sentinels set and clear the whole mask.
export function mon_learns_traps(monster, trapType) {
    if (trapType === ALL_TRAPS) {
        monster.mtrapseen = -1;
    } else if (trapType === NO_TRAP) {
        monster.mtrapseen = 0;
    } else {
        monster.mtrapseen = (monster.mtrapseen ?? 0) | (1 << (trapType - 1));
    }
}

// C ref: mondata.c mons_see_trap(). Every monster that watches a trap fire
// remembers that type, which is what makes mintrap()'s `already_seen` arm
// reachable on a later trigger.
//
// m_cansee() is vision.h:42, a clear_path() macro. js/vision.js cannot be
// imported here: js/vision.js reaches js/mondata.js through js/display.js and
// js/startup_a11y.js, so the caller supplies the predicate instead.
export function mons_see_trap(trap, env = {}) {
    const state = env.state ?? game;
    const mCansee = env.mCansee;
    if (typeof mCansee !== 'function')
        throw new TypeError('mons_see_trap requires the mCansee owner');
    const tx = trap.tx;
    const ty = trap.ty;
    const maxdist = state.level?.at(tx, ty)?.lit ? 7 * 7 : 2;
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (is_animal(monster.data) || mindless(monster.data)
            || !haseyes(monster.data) || !monster.mcansee) {
            continue;
        }
        if (dist2(monster.mx, monster.my, tx, ty) > maxdist) continue;
        if (!mCansee(monster, tx, ty)) continue;
        mon_learns_traps(monster, trap.ttyp);
    }
}

// C ref: mondata.c passes_bars(). This combines shape, size, attack, and diet
// capabilities; no single flag is a sufficient substitute.
export function passes_bars(species) {
    return passes_walls(species) || amorphous(species) || unsolid(species)
        || is_whirly(species) || verysmall(species)
        || dmgtype(species, M.AD_RUST) || dmgtype(species, M.AD_CORR)
        || metallivorous(species) || (slithy(species) && !bigmonst(species));
}

// C ref: mondata.c sticks(). A wrapping attack sticks unless it is the
// engulfing form; explicit sticky damage and hug attacks always do.
export function sticks(species) {
    return hasDamageType(species, M.AD_STCK)
        || (hasDamageType(species, M.AD_WRAP)
            && !hasAttackType(species, M.AT_ENGL))
        || hasAttackType(species, M.AT_HUGS);
}

const pair = (little, big) => Object.freeze([little, big]);
const alternateName = (name, mnum, gender = NEUTRAL) => Object.freeze({
    name,
    mnum,
    gender,
});

// C ref: mondata.c:name_to_monplus() names[]. Source order is observable:
// the first full-word alternate match wins before the canonical mons[] scan.
const alternateMonsterNames = Object.freeze([
    alternateName('grey dragon', M.PM_GRAY_DRAGON),
    alternateName('baby grey dragon', M.PM_BABY_GRAY_DRAGON),
    alternateName('grey unicorn', M.PM_GRAY_UNICORN),
    alternateName('grey ooze', M.PM_GRAY_OOZE),
    alternateName('gray-elf', M.PM_GREY_ELF),
    alternateName('mindflayer', M.PM_MIND_FLAYER),
    alternateName('master mindflayer', M.PM_MASTER_MIND_FLAYER),
    alternateName('aligned priest', M.PM_ALIGNED_CLERIC, MALE),
    alternateName('aligned priestess', M.PM_ALIGNED_CLERIC, FEMALE),
    alternateName('high priest', M.PM_HIGH_CLERIC, MALE),
    alternateName('high priestess', M.PM_HIGH_CLERIC, FEMALE),
    alternateName('master of thief', M.PM_MASTER_OF_THIEVES),
    alternateName('master thief', M.PM_MASTER_OF_THIEVES),
    alternateName('master of assassin', M.PM_MASTER_ASSASSIN),
    alternateName('master-lich', M.PM_MASTER_LICH),
    alternateName('masterlich', M.PM_MASTER_LICH),
    alternateName('invisible stalker', M.PM_STALKER),
    alternateName('high-elf', M.PM_ELVEN_MONARCH),
    alternateName('wood-elf', M.PM_WOODLAND_ELF),
    alternateName('wood elf', M.PM_WOODLAND_ELF),
    alternateName('woodland nymph', M.PM_WOOD_NYMPH),
    alternateName('halfling', M.PM_HOBBIT),
    alternateName('genie', M.PM_DJINNI),
    alternateName('human wererat', M.PM_HUMAN_WERERAT),
    alternateName('human werejackal', M.PM_HUMAN_WEREJACKAL),
    alternateName('human werewolf', M.PM_HUMAN_WEREWOLF),
    alternateName('rat wererat', M.PM_WERERAT),
    alternateName('jackal werejackal', M.PM_WEREJACKAL),
    alternateName('wolf werewolf', M.PM_WEREWOLF),
    alternateName('ki rin', M.PM_KI_RIN),
    alternateName('kirin', M.PM_KI_RIN),
    alternateName('uruk hai', M.PM_URUK_HAI),
    alternateName('orc captain', M.PM_ORC_CAPTAIN),
    alternateName('woodland elf', M.PM_WOODLAND_ELF),
    alternateName('green elf', M.PM_GREEN_ELF),
    alternateName('grey elf', M.PM_GREY_ELF),
    alternateName('gray elf', M.PM_GREY_ELF),
    alternateName('elf lady', M.PM_ELF_NOBLE, FEMALE),
    alternateName('elf lord', M.PM_ELF_NOBLE, MALE),
    alternateName('elf noble', M.PM_ELF_NOBLE),
    alternateName('olog hai', M.PM_OLOG_HAI),
    alternateName('arch lich', M.PM_ARCH_LICH),
    alternateName('archlich', M.PM_ARCH_LICH),
    alternateName('incubi', M.PM_AMOROUS_DEMON, MALE),
    alternateName('succubi', M.PM_AMOROUS_DEMON, FEMALE),
    alternateName('violet fungi', M.PM_VIOLET_FUNGUS),
    alternateName('homunculi', M.PM_HOMUNCULUS),
    alternateName('baluchitheria', M.PM_BALUCHITHERIUM),
    alternateName('lurkers above', M.PM_LURKER_ABOVE),
    alternateName('cavemen', M.PM_CAVE_DWELLER, MALE),
    alternateName('cavewomen', M.PM_CAVE_DWELLER, FEMALE),
    alternateName('watchmen', M.PM_WATCHMAN),
    alternateName('djinn', M.PM_DJINNI),
    alternateName('mumakil', M.PM_MUMAK),
    alternateName('erinyes', M.PM_ERINYS),
]);

// Order is observable through big_to_little(): several adult forms have more
// than one possible predecessor and the C code returns the first match.
const grownups = Object.freeze([
    pair(M.PM_CHICKATRICE, M.PM_COCKATRICE),
    pair(M.PM_LITTLE_DOG, M.PM_DOG),
    pair(M.PM_DOG, M.PM_LARGE_DOG),
    pair(M.PM_HELL_HOUND_PUP, M.PM_HELL_HOUND),
    pair(M.PM_WINTER_WOLF_CUB, M.PM_WINTER_WOLF),
    pair(M.PM_KITTEN, M.PM_HOUSECAT),
    pair(M.PM_HOUSECAT, M.PM_LARGE_CAT),
    pair(M.PM_PONY, M.PM_HORSE),
    pair(M.PM_HORSE, M.PM_WARHORSE),
    pair(M.PM_KOBOLD, M.PM_LARGE_KOBOLD),
    pair(M.PM_LARGE_KOBOLD, M.PM_KOBOLD_LEADER),
    pair(M.PM_GNOME, M.PM_GNOME_LEADER),
    pair(M.PM_GNOME_LEADER, M.PM_GNOME_RULER),
    pair(M.PM_DWARF, M.PM_DWARF_LEADER),
    pair(M.PM_DWARF_LEADER, M.PM_DWARF_RULER),
    pair(M.PM_MIND_FLAYER, M.PM_MASTER_MIND_FLAYER),
    pair(M.PM_ORC, M.PM_ORC_CAPTAIN),
    pair(M.PM_HILL_ORC, M.PM_ORC_CAPTAIN),
    pair(M.PM_MORDOR_ORC, M.PM_ORC_CAPTAIN),
    pair(M.PM_URUK_HAI, M.PM_ORC_CAPTAIN),
    pair(M.PM_SEWER_RAT, M.PM_GIANT_RAT),
    pair(M.PM_CAVE_SPIDER, M.PM_GIANT_SPIDER),
    pair(M.PM_OGRE, M.PM_OGRE_LEADER),
    pair(M.PM_OGRE_LEADER, M.PM_OGRE_TYRANT),
    pair(M.PM_ELF, M.PM_ELF_NOBLE),
    pair(M.PM_WOODLAND_ELF, M.PM_ELF_NOBLE),
    pair(M.PM_GREEN_ELF, M.PM_ELF_NOBLE),
    pair(M.PM_GREY_ELF, M.PM_ELF_NOBLE),
    pair(M.PM_ELF_NOBLE, M.PM_ELVEN_MONARCH),
    pair(M.PM_LICH, M.PM_DEMILICH),
    pair(M.PM_DEMILICH, M.PM_MASTER_LICH),
    pair(M.PM_MASTER_LICH, M.PM_ARCH_LICH),
    pair(M.PM_VAMPIRE, M.PM_VAMPIRE_LEADER),
    pair(M.PM_BAT, M.PM_GIANT_BAT),
    pair(M.PM_BABY_GRAY_DRAGON, M.PM_GRAY_DRAGON),
    pair(M.PM_BABY_GOLD_DRAGON, M.PM_GOLD_DRAGON),
    pair(M.PM_BABY_SILVER_DRAGON, M.PM_SILVER_DRAGON),
    pair(M.PM_BABY_RED_DRAGON, M.PM_RED_DRAGON),
    pair(M.PM_BABY_WHITE_DRAGON, M.PM_WHITE_DRAGON),
    pair(M.PM_BABY_ORANGE_DRAGON, M.PM_ORANGE_DRAGON),
    pair(M.PM_BABY_BLACK_DRAGON, M.PM_BLACK_DRAGON),
    pair(M.PM_BABY_BLUE_DRAGON, M.PM_BLUE_DRAGON),
    pair(M.PM_BABY_GREEN_DRAGON, M.PM_GREEN_DRAGON),
    pair(M.PM_BABY_YELLOW_DRAGON, M.PM_YELLOW_DRAGON),
    pair(M.PM_RED_NAGA_HATCHLING, M.PM_RED_NAGA),
    pair(M.PM_BLACK_NAGA_HATCHLING, M.PM_BLACK_NAGA),
    pair(M.PM_GOLDEN_NAGA_HATCHLING, M.PM_GOLDEN_NAGA),
    pair(M.PM_GUARDIAN_NAGA_HATCHLING, M.PM_GUARDIAN_NAGA),
    pair(M.PM_SMALL_MIMIC, M.PM_LARGE_MIMIC),
    pair(M.PM_LARGE_MIMIC, M.PM_GIANT_MIMIC),
    pair(M.PM_BABY_LONG_WORM, M.PM_LONG_WORM),
    pair(M.PM_BABY_PURPLE_WORM, M.PM_PURPLE_WORM),
    pair(M.PM_BABY_CROCODILE, M.PM_CROCODILE),
    pair(M.PM_SOLDIER, M.PM_SERGEANT),
    pair(M.PM_SERGEANT, M.PM_LIEUTENANT),
    pair(M.PM_LIEUTENANT, M.PM_CAPTAIN),
    pair(M.PM_WATCHMAN, M.PM_WATCH_CAPTAIN),
    pair(M.PM_ALIGNED_CLERIC, M.PM_HIGH_CLERIC),
    pair(M.PM_STUDENT, M.PM_ARCHEOLOGIST),
    pair(M.PM_ATTENDANT, M.PM_HEALER),
    pair(M.PM_PAGE, M.PM_KNIGHT),
    pair(M.PM_ACOLYTE, M.PM_CLERIC),
    pair(M.PM_APPRENTICE, M.PM_WIZARD),
    pair(M.PM_MANES, M.PM_LEMURE),
    pair(M.PM_KEYSTONE_KOP, M.PM_KOP_SERGEANT),
    pair(M.PM_KOP_SERGEANT, M.PM_KOP_LIEUTENANT),
    pair(M.PM_KOP_LIEUTENANT, M.PM_KOP_KAPTAIN),
]);

function monsterIndexOrNonPm(value) {
    return Number.isInteger(value) ? value : M.NON_PM;
}

function asciiLower(value) {
    let lowered = '';
    for (const character of value) {
        const code = character.charCodeAt(0);
        lowered += code >= 0x41 && code <= 0x5A
            ? String.fromCharCode(code + 0x20)
            : character;
    }
    return lowered;
}

function asciiEquals(left, right) {
    return asciiLower(left) === asciiLower(right);
}

function asciiStartsWith(value, prefix) {
    return asciiEquals(value.slice(0, prefix.length), prefix);
}

function asciiEndsWith(value, suffix) {
    return value.length >= suffix.length
        && asciiEquals(value.slice(-suffix.length), suffix);
}

function asciiIndexOf(value, needle) {
    return asciiLower(value).indexOf(asciiLower(needle));
}

function initializedMonsterNameCatalog(state, operation) {
    if (!Array.isArray(state?.mons) || state.mons.length !== M.NUMMONS + 1)
        throw new Error(`${operation} requires monst_globals_init()`);
    for (let index = M.LOW_PM; index < M.NUMMONS; ++index) {
        const names = state.mons[index]?.pmnames;
        if (!Array.isArray(names) || names.length !== NUM_MGENDERS
            || names.some((name) => name !== null
                && typeof name !== 'string')) {
            throw new Error(`${operation} requires a complete monster catalog`);
        }
    }
    return state.mons;
}

function stripArticle(input) {
    if (input.startsWith('a ')) return { text: input.slice(2), offset: 2 };
    if (input.startsWith('an ')) return { text: input.slice(3), offset: 3 };
    if (input.startsWith('the ')) return { text: input.slice(4), offset: 4 };
    return { text: input, offset: 0 };
}

function normalizeMonsterNamePlural(input) {
    const vortices = asciiIndexOf(input, 'vortices');
    if (vortices >= 0) {
        // Strcpy(s + 4, "ex") truncates everything after the replacement.
        return `${input.slice(0, vortices + 4)}ex`;
    }
    if (input.length > 3 && asciiEndsWith(input, 'ies')
        && (input.length < 7 || !asciiEndsWith(input, 'zombies'))) {
        return `${input.slice(0, -3)}y`;
    }
    if (input.length > 3 && asciiEndsWith(input, 'ves'))
        return `${input.slice(0, -3)}f`;
    return input;
}

function suffixCanFollowMonsterName(suffix) {
    return suffix.startsWith(' ')
        || asciiEquals(suffix, 's')
        || asciiStartsWith(suffix, 's ')
        || asciiEquals(suffix, "'")
        || asciiStartsWith(suffix, "' ")
        || asciiEquals(suffix, "'s")
        || asciiStartsWith(suffix, "'s ")
        || asciiEquals(suffix, 'es')
        || asciiStartsWith(suffix, 'es ');
}

// C ref: botl.c:title_to_mon(). It intentionally accepts a title prefix
// without requiring a following word boundary.
function titleToMonster(input) {
    for (const role of roles) {
        for (const rank of role.rank) {
            if (rank.m && asciiStartsWith(input, rank.m))
                return { mnum: role.mnum, length: rank.m.length };
            if (rank.f && asciiStartsWith(input, rank.f))
                return { mnum: role.mnum, length: rank.f.length };
        }
    }
    return { mnum: M.NON_PM, length: 0 };
}

/**
 * C ref: mondata.c:name_to_monplus().
 *
 * `env.gender` models the optional input/output gender pointer. The returned
 * `remainder` is the suffix beginning at the same original-string offset as
 * C's remainder pointer, including its quirks after plural normalization.
 */
export function name_to_monplus(in_str, env = {}) {
    if (typeof in_str !== 'string')
        throw new TypeError('name_to_monplus requires monster-name text');
    const state = env?.state ?? game;
    const mons = initializedMonsterNameCatalog(state, 'name_to_monplus');
    const initialGender = env?.gender === undefined ? -1 : env.gender;
    if (!Number.isInteger(initialGender))
        throw new TypeError('name_to_monplus gender must be an integer');

    const nul = in_str.indexOf('\0');
    const source = nul >= 0 ? in_str.slice(0, nul) : in_str;
    const article = stripArticle(source);
    const input = normalizeMonsterNamePlural(article.text);

    for (const alternate of alternateMonsterNames) {
        const length = alternate.name.length;
        if (asciiStartsWith(input, alternate.name)
            && (input.length === length
                || input[length] === ' '
                || input[length] === "'")) {
            return {
                mnum: alternate.mnum,
                remainder: source.slice(article.offset + length),
                gender: alternate.gender,
            };
        }
    }

    let mnum = M.NON_PM;
    let matchedLength = 0;
    let matchedGender = -1;

    canonical:
    for (let index = M.LOW_PM; index < M.NUMMONS; ++index) {
        for (let gender = MALE; gender < NUM_MGENDERS; ++gender) {
            const name = mons[index].pmnames[gender];
            if (!name || name.length <= matchedLength
                || !asciiStartsWith(input, name)) {
                continue;
            }
            if (name.length === input.length) {
                mnum = index;
                matchedLength = name.length;
                matchedGender = gender;
                break canonical;
            }
            if (suffixCanFollowMonsterName(input.slice(name.length))) {
                mnum = index;
                matchedLength = name.length;
                matchedGender = gender;
            }
        }
    }

    if (mnum === M.NON_PM) {
        const title = titleToMonster(input);
        mnum = title.mnum;
        matchedLength = title.length;
    }

    let gender = initialGender;
    if (matchedGender !== -1
        && (gender === -1 || matchedGender !== NEUTRAL)) {
        gender = matchedGender;
    }
    return {
        mnum,
        remainder: matchedLength
            ? source.slice(article.offset + matchedLength)
            : null,
        gender,
    };
}

// Source name_to_mon() discards name_to_monplus()'s remainder.
export function name_to_mon(in_str, env = {}) {
    return name_to_monplus(in_str, env).mnum;
}

export function little_to_big(montype) {
    montype = monsterIndexOrNonPm(montype);
    for (const [little, big] of grownups) {
        if (montype === little) {
            montype = big;
            break;
        }
    }
    return montype;
}

export function big_to_little(montype) {
    montype = monsterIndexOrNonPm(montype);
    for (const [little, big] of grownups) {
        if (montype === big) {
            montype = little;
            break;
        }
    }
    return montype;
}

export function is_male(ptr) {
    return Boolean(ptr && Number.isInteger(ptr.mflags2)
        && (ptr.mflags2 & M.M2_MALE));
}

export function is_female(ptr) {
    return Boolean(ptr && Number.isInteger(ptr.mflags2)
        && (ptr.mflags2 & M.M2_FEMALE));
}

export function is_neuter(ptr) {
    return Boolean(ptr && Number.isInteger(ptr.mflags2)
        && (ptr.mflags2 & M.M2_NEUTER));
}

export function is_rider(ptr) {
    const index = ptr?.pmidx;
    return index === M.PM_DEATH
        || index === M.PM_FAMINE
        || index === M.PM_PESTILENCE;
}

function isMindFlayer(species) {
    return species?.pmidx === M.PM_MIND_FLAYER
        || species?.pmidx === M.PM_MASTER_MIND_FLAYER;
}

function isLongWorm(species) {
    return species?.pmidx === M.PM_BABY_LONG_WORM
        || species?.pmidx === M.PM_LONG_WORM
        || species?.pmidx === M.PM_LONG_WORM_TAIL;
}

// mondata.h:102. gu.urace.selfmask is the one M2 bit that names the hero's own
// race, so this asks whether the species is one of the hero's own kind.
export function your_race(species, state = game) {
    return ((species?.mflags2 ?? 0) & (state.urace?.selfmask ?? 0)) !== 0;
}

// C ref: mondata.c same_race(). Growth-family comparison is intentionally
// directional: after direct race/class checks, walk both directions from the
// first species before applying the handful of exceptional families.
export function same_race(first, second) {
    if (!first || !second) return false;
    if (first === second
        || (Number.isInteger(first.pmidx)
            && first.pmidx === second.pmidx)) {
        return true;
    }
    if (is_human(first)) return is_human(second);
    if (is_elf(first)) return is_elf(second);
    if (is_dwarf(first)) return is_dwarf(second);
    if (is_gnome(first)) return is_gnome(second);
    if (is_orc(first)) return is_orc(second);
    if (is_giant(first)) return is_giant(second);
    if (is_golem(first)) return is_golem(second);
    if (isMindFlayer(first)) return isMindFlayer(second);

    const firstKobold = first.mlet === M.S_KOBOLD
        || first.pmidx === M.PM_KOBOLD_ZOMBIE
        || first.pmidx === M.PM_KOBOLD_MUMMY;
    if (firstKobold) {
        return second.mlet === M.S_KOBOLD
            || second.pmidx === M.PM_KOBOLD_ZOMBIE
            || second.pmidx === M.PM_KOBOLD_MUMMY;
    }
    if (first.mlet === M.S_OGRE) return second.mlet === M.S_OGRE;
    if (first.mlet === M.S_NYMPH) return second.mlet === M.S_NYMPH;
    if (first.mlet === M.S_CENTAUR) return second.mlet === M.S_CENTAUR;
    if (is_unicorn(first)) return is_unicorn(second);
    if (first.mlet === M.S_DRAGON) return second.mlet === M.S_DRAGON;
    if (first.mlet === M.S_NAGA) return second.mlet === M.S_NAGA;
    if (is_rider(first)) return is_rider(second);
    if (is_minion(first)) return is_minion(second);
    if (first.pmidx === M.PM_TENGU || second.pmidx === M.PM_TENGU)
        return false;
    if (first.mlet === M.S_IMP) return second.mlet === M.S_IMP;
    if (second.mlet === M.S_IMP) return false;
    if (is_demon(first)) return is_demon(second);
    if (is_undead(first)) {
        if ([
            M.S_ZOMBIE,
            M.S_MUMMY,
            M.S_VAMPIRE,
            M.S_LICH,
            M.S_WRAITH,
            M.S_GHOST,
        ].includes(first.mlet)) {
            return second.mlet === first.mlet;
        }
    } else if (is_undead(second)) {
        return false;
    }

    if (first.mlet === second.mlet) {
        const secondIndex = second.pmidx;
        let previous = first.pmidx;
        for (let next = big_to_little(previous);
            next !== previous;
            previous = next, next = big_to_little(next)) {
            if (next === secondIndex) return true;
        }
        previous = first.pmidx;
        for (let next = little_to_big(previous);
            next !== previous;
            previous = next, next = little_to_big(next)) {
            if (next === secondIndex) return true;
        }
    }
    if (first.pmidx === M.PM_GARGOYLE
        || first.pmidx === M.PM_WINGED_GARGOYLE) {
        return second.pmidx === M.PM_GARGOYLE
            || second.pmidx === M.PM_WINGED_GARGOYLE;
    }
    if (first.pmidx === M.PM_KILLER_BEE
        || first.pmidx === M.PM_QUEEN_BEE) {
        return second.pmidx === M.PM_KILLER_BEE
            || second.pmidx === M.PM_QUEEN_BEE;
    }
    if (isLongWorm(first)) return isLongWorm(second);
    return false;
}

// C ref: mondata.h is_unicorn() and likes_gems().
export function is_unicorn(ptr) {
    return ptr?.mlet === M.S_UNICORN
        && Boolean(ptr.mflags2 & M.M2_JEWELS);
}

// C ref: mondata.h is_reviver().
export function is_reviver(ptr) {
    return is_rider(ptr) || ptr?.mlet === M.S_TROLL;
}

// C ref: mondata.h unique_corpstat() (174). "unique" here also covers the
// Wizard and any High Priest, which are not literally one of a kind.
export function unique_corpstat(ptr) {
    return Boolean(ptr?.geno & M.G_UNIQ);
}

// C ref: mondata.h emits_light() (178-185). Every luminous form listed there
// has range one; the second conditional exists only because the macro once
// gave the last two a wider range.
export function emits_light(ptr) {
    return ptr?.mlet === M.S_LIGHT
        || ptr?.pmidx === M.PM_FLAMING_SPHERE
        || ptr?.pmidx === M.PM_SHOCKING_SPHERE
        || ptr?.pmidx === M.PM_BABY_GOLD_DRAGON
        || ptr?.pmidx === M.PM_FIRE_VORTEX
        ? 1
        : (ptr?.pmidx === M.PM_FIRE_ELEMENTAL
            || ptr?.pmidx === M.PM_GOLD_DRAGON) ? 1 : 0;
}

function isElf(ptr) {
    return Boolean(ptr.mflags2 & M.M2_ELF);
}

function isDwarf(ptr) {
    return Boolean(ptr.mflags2 & M.M2_DWARF);
}

export function zombie_form(pm) {
    if (!pm || !Number.isInteger(pm.mlet) || !Number.isInteger(pm.mflags2))
        return M.NON_PM;
    switch (pm.mlet) {
    case M.S_ZOMBIE:
        return M.NON_PM;
    case M.S_KOBOLD:
        return M.PM_KOBOLD_ZOMBIE;
    case M.S_ORC:
        return M.PM_ORC_ZOMBIE;
    case M.S_GIANT:
        return pm.pmidx === M.PM_ETTIN
            ? M.PM_ETTIN_ZOMBIE
            : M.PM_GIANT_ZOMBIE;
    case M.S_HUMAN:
    case M.S_KOP:
        return isElf(pm) ? M.PM_ELF_ZOMBIE : M.PM_HUMAN_ZOMBIE;
    case M.S_HUMANOID:
        return isDwarf(pm) ? M.PM_DWARF_ZOMBIE : M.NON_PM;
    case M.S_GNOME:
        return M.PM_GNOME_ZOMBIE;
    default:
        return M.NON_PM;
    }
}

export function undead_to_corpse(mndx) {
    mndx = monsterIndexOrNonPm(mndx);
    switch (mndx) {
    case M.PM_KOBOLD_ZOMBIE:
    case M.PM_KOBOLD_MUMMY:
        return M.PM_KOBOLD;
    case M.PM_DWARF_ZOMBIE:
    case M.PM_DWARF_MUMMY:
        return M.PM_DWARF;
    case M.PM_GNOME_ZOMBIE:
    case M.PM_GNOME_MUMMY:
        return M.PM_GNOME;
    case M.PM_ORC_ZOMBIE:
    case M.PM_ORC_MUMMY:
        return M.PM_ORC;
    case M.PM_ELF_ZOMBIE:
    case M.PM_ELF_MUMMY:
        return M.PM_ELF;
    case M.PM_VAMPIRE:
    case M.PM_VAMPIRE_LEADER:
    case M.PM_HUMAN_ZOMBIE:
    case M.PM_HUMAN_MUMMY:
        return M.PM_HUMAN;
    case M.PM_GIANT_ZOMBIE:
    case M.PM_GIANT_MUMMY:
        return M.PM_GIANT;
    case M.PM_ETTIN_ZOMBIE:
    case M.PM_ETTIN_MUMMY:
        return M.PM_ETTIN;
    default:
        return mndx;
    }
}

function initializedMonster(state, mnum, operation) {
    if (!Array.isArray(state?.mons) || state.mons.length !== M.NUMMONS + 1)
        throw new Error(`${operation} requires monst_globals_init()`);
    const monster = state.mons[mnum];
    if (!monster || !Number.isInteger(monster.mflags1))
        throw new Error(`${operation} requires a complete monster catalog`);
    return monster;
}

// BREEDER_EGG is deliberately evaluated before the queen/winged-gargoyle
// exclusions, matching C's short-circuit order and its single rn2(77) draw.
export function can_be_hatched(mnum, env = {}) {
    mnum = monsterIndexOrNonPm(mnum);
    if (mnum === M.PM_SCORPIUS) mnum = M.PM_SCORPION;
    mnum = little_to_big(mnum);

    // These two exceptions do not consult mons[] or consume BREEDER_EGG.
    if (mnum === M.PM_KILLER_BEE || mnum === M.PM_GARGOYLE) return mnum;
    if (mnum < M.LOW_PM || mnum >= M.NUMMONS) return M.NON_PM;

    const monster = initializedMonster(env.state ?? game, mnum,
        'can_be_hatched');
    if (!(monster.mflags1 & M.M1_OVIPAROUS)) return M.NON_PM;

    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('can_be_hatched random injection requires rn2');
    const breederEgg = random.rn2(77) === 0;
    if (breederEgg
        || (mnum !== M.PM_QUEEN_BEE
            && mnum !== M.PM_WINGED_GARGOYLE)) {
        return mnum;
    }
    return M.NON_PM;
}

export function dead_species(m_idx, egg = false, env = {}) {
    m_idx = monsterIndexOrNonPm(m_idx);
    // Generic and malformed species are not viable; this also avoids looking
    // through mvitals with the NON_PM sentinel used by generic eggs.
    if (m_idx < M.LOW_PM || m_idx >= M.NUMMONS) return true;

    const state = env.state ?? game;
    const mvitals = state?.svm?.mvitals;
    if (!Array.isArray(mvitals) || mvitals.length !== M.NUMMONS)
        throw new Error('dead_species requires initialized mvitals');

    const alt_idx = egg ? big_to_little(m_idx) : m_idx;
    const current = mvitals[m_idx];
    const alternate = mvitals[alt_idx];
    if (!current || !alternate
        || !Number.isInteger(current.mvflags)
        || !Number.isInteger(alternate.mvflags)) {
        throw new Error('dead_species requires complete mvitals');
    }
    return Boolean((current.mvflags & G_GENOD)
        || (alternate.mvflags & G_GENOD));
}

// Pure functions of mondata.c, in that file's definition order, together with
// the mondata.h and monattk.h macros they need.  None of these makes a
// random-number call, writes output, or changes state, so porting one cannot
// change what already-working code does.  The game does not call most of them
// yet; scripts/mondata-pure.test.mjs pins each result to values read from C.
//
// Left for later, with the reason each one is not pure or not yet portable:
//   Resists_Elem            already ported above as monster_resists_element
//   resists_blnd            calls impossible()
//   defended, resists_drli, resists_blnd_by_arti, can_blnd
//                           need artifact and inventory support that the port
//                           does not have yet
//   get_atkdam_type         ROLL_FROM() is a random-number call
//   pronoun_gender          calls rn2()
//   set_mon_data, give_u_to_m_resistances, mon_learns_traps, mons_see_trap,
//   monstseesu             change monster or hero state.  monstunseesu() is
//                           ported below rather than here, because it does
//                           change monster state; setworn() calls it.
//   can_blow, can_chant, can_be_strangled
//                           their hero branches read Strangled and Breathless,
//                           which the port does not model yet
//   can_track               needs u_wield_art()
//   name_to_monclass        needs def_monsyms[], makesingular(), strstri()

// C ref: mondata.c levl_follower() (1209-1226). Answers whether a monster
// beside the hero accompanies her to the next level; dog.c keepdogs() reads it
// once per monster on the leaving level.
export function levl_follower(mtmp, state = game) {
    if (mtmp === state.u.usteed) return true;

    if (mtmp.iswiz && mon_has_amulet(mtmp)) return false;
    if (mtmp.mtame || mtmp.iswiz || is_fshk(mtmp)) return true;
    return Boolean((mtmp.data.mflags2 & M.M2_STALK)
        && (!mtmp.mflee || state.u.uhave?.amulet));
}

// C ref: mondata.h monsndx().
export function monsndx(species) { return species?.pmidx; }

// C ref: mondata.h is_silent() (62). MS_SILENT is the zero member of
// monflag.h's `enum ms_sounds`, so this is an equality test and not a
// truthiness test: every other msound value is a sound the species makes.
export function is_silent(species) {
    return species?.msound === MS_SILENT;
}

// C ref: mondata.h is_shapeshifter().
export function is_shapeshifter(species) {
    return Boolean(species?.mflags2 & M.M2_SHAPESHIFTER);
}

// C compares a species against a mons[] entry by pointer, as in
// `ptr == &mons[PM_GREMLIN]`. pmidx is that entry's index, so comparing it
// against the same constant gives the same answer without needing the table.
function speciesIs(species, ...indexes) {
    return indexes.includes(monsndx(species));
}

// C ref: mondata.h is_wooden() (68). weapon.c dmgval() gives an axe an extra
// rnd(4) against the one species this answers for.
export function is_wooden(species) {
    return speciesIs(species, M.PM_WOOD_GOLEM);
}

// C ref: mondata.h hates_light().
export function hates_light(species) {
    return speciesIs(species, M.PM_GREMLIN);
}

// C refs: mondata.h completelyburns(), completelyrots(), completelyrusts().
export function completelyburns(species) {
    return speciesIs(species, M.PM_PAPER_GOLEM, M.PM_STRAW_GOLEM);
}
export function completelyrots(species) {
    return speciesIs(species, M.PM_WOOD_GOLEM, M.PM_LEATHER_GOLEM);
}
export function completelyrusts(species) {
    return speciesIs(species, M.PM_IRON_GOLEM);
}

// C ref: monattk.h DISTANCE_ATTK_TYPE().
function DISTANCE_ATTK_TYPE(aatyp) {
    return aatyp === M.AT_SPIT || aatyp === M.AT_BREA
        || aatyp === M.AT_MAGC || aatyp === M.AT_GAZE;
}

// C ref: mondata.c poly_when_stoned(). G_EXTINCT is deliberately allowed.
export function poly_when_stoned(species, state = game) {
    return is_golem(species) && !speciesIs(species, M.PM_STONE_GOLEM)
        && !((state.svm?.mvitals?.[M.PM_STONE_GOLEM]?.mvflags ?? 0) & G_GENOD);
}

// C ref: mondata.c ranged_attk().
export function ranged_attk(species) {
    return Boolean(species?.mattk?.some(
        (attack) => DISTANCE_ATTK_TYPE(attack.aatyp),
    ));
}

// C ref: mondata.c mstrength(). The three name comparisons use the neutral
// pmname, which is pmnames[NEUTRAL] in C.
export function mstrength(species) {
    let tmp = species.mlevel;
    if (tmp > 49) tmp = Math.trunc((2 * (tmp - 6)) / 4);

    let n = (species.geno & M.G_SGROUP) ? 1 : 0;
    n += ((species.geno & M.G_LGROUP) ? 1 : 0) << 1;
    if (mstrength_ranged_attk(species)) n++;
    n += species.ac < 4 ? 1 : 0;
    n += species.ac < 0 ? 1 : 0;
    n += species.mmove >= 18 ? 1 : 0;

    const neutralName = species.pmnames?.[NEUTRAL];
    for (let i = 0; i < NATTK; i++) {
        const aatyp = species.mattk[i].aatyp;
        n += aatyp > 0 ? 1 : 0;
        n += aatyp === M.AT_MAGC ? 1 : 0;
        n += (aatyp === M.AT_WEAP && (species.mflags2 & M.M2_STRONG)) ? 1 : 0;
        if (aatyp === M.AT_EXPL) {
            const adtyp = species.mattk[i].adtyp;
            // Freezing, flaming, and shocking spheres can destroy equipment;
            // yellow and black lights cannot.
            n += (adtyp === M.AD_COLD || adtyp === M.AD_FIRE) ? 3
                : adtyp === M.AD_ELEC ? 5
                    : 0;
        }
    }

    for (let i = 0; i < NATTK; i++) {
        const adtyp = species.mattk[i].adtyp;
        if (adtyp === M.AD_DRLI || adtyp === M.AD_STON || adtyp === M.AD_DRST
            || adtyp === M.AD_DRDX || adtyp === M.AD_DRCO
            || adtyp === M.AD_WERE) {
            n += 2;
        } else if (neutralName !== 'grid bug') {
            // C's strcmp() is non-zero for every name except "grid bug".
            n += adtyp !== M.AD_PHYS ? 1 : 0;
        }
        n += (species.mattk[i].damd * species.mattk[i].damn) > 23 ? 1 : 0;
    }

    // Leprechauns have many hit dice but do little damage.
    if (neutralName === 'leprechaun') n -= 2;
    // Soldier ants and killer bees are underestimated by the formula, so they
    // get +2 here, which becomes +1 after the division below.
    if (neutralName === 'killer bee' || neutralName === 'soldier ant') n += 2;

    if (n === 0) tmp -= 1;
    else if (n < 6) tmp += Math.trunc(n / 3) + 1;
    else tmp += Math.trunc(n / 2);
    return tmp >= 0 ? tmp : 0;
}

// C ref: mondata.c mstrength_ranged_attk(), which is static in C.
function mstrength_ranged_attk(species) {
    const mask = (1 << M.AT_BREA) | (1 << M.AT_SPIT) | (1 << M.AT_GAZE);
    for (let i = 0; i < NATTK; i++) {
        const aatyp = species.mattk[i].aatyp;
        if (aatyp >= M.AT_WEAP || (aatyp < 32 && (mask & (1 << aatyp)) !== 0))
            return true;
    }
    return false;
}

// C ref: mondata.c mon_hates_blessings().
export function mon_hates_blessings(monster) {
    return is_vampshifter(monster) || hates_blessings(monster.data);
}

// C ref: mondata.c hates_blessings().
export function hates_blessings(species) {
    return is_undead(species) || is_demon(species);
}

// C ref: mondata.c mon_hates_light().
export function mon_hates_light(monster) {
    return hates_light(monster.data);
}

// C ref: mondata.c sliparm().
export function sliparm(species) {
    return is_whirly(species) || species.msize <= M.MZ_SMALL
        || noncorporeal(species);
}

// C ref: mondata.c breakarm().
export function breakarm(species) {
    if (sliparm(species)) return false;
    return bigmonst(species)
        || (species.msize > M.MZ_SMALL && !humanoid(species))
        // Humanoids that still cannot wear a suit.
        || speciesIs(species, M.PM_MARILITH, M.PM_WINGED_GARGOYLE);
}

// C ref: mondata.c cantvomit(). Rats, mice, and horses cannot vomit.
export function cantvomit(species) {
    if (species.mlet === M.S_RODENT
        && !speciesIs(species, M.PM_ROCK_MOLE, M.PM_WOODCHUCK)) {
        return true;
    }
    return speciesIs(species, M.PM_WARHORSE, M.PM_HORSE, M.PM_PONY);
}

// C ref: mondata.c num_horns().
export function num_horns(species) {
    switch (monsndx(species)) {
    case M.PM_HORNED_DEVIL:
    case M.PM_MINOTAUR:
    case M.PM_ASMODEUS:
    case M.PM_BALROG:
        return 2;
    case M.PM_WHITE_UNICORN:
    case M.PM_GRAY_UNICORN:
    case M.PM_BLACK_UNICORN:
    case M.PM_KI_RIN:
        return 1;
    default:
        return 0;
    }
}

// C ref: mondata.c dmgtype_fromattack(). C returns a pointer into mattk[] and
// null when nothing matches; this returns the attack object or null.
export function dmgtype_fromattack(species, dtyp, atyp) {
    for (let i = 0; i < NATTK; i++) {
        const attack = species.mattk[i];
        if (attack.adtyp === dtyp
            && (atyp === M.AT_ANY || attack.aatyp === atyp)) {
            return attack;
        }
    }
    return null;
}

// C ref: mondata.c max_passive_dmg(). resists_acid() and its siblings are the
// monst.h macros for Resists_Elem(), ported above as
// monster_resists_element().
export function max_passive_dmg(mdef, magr, state = game) {
    let multi2 = 0;
    // Each of magr's attacks can draw passive damage.
    for (let i = 0; i < NATTK; i++) {
        switch (magr.data.mattk[i].aatyp) {
        case M.AT_CLAW: case M.AT_BITE: case M.AT_KICK: case M.AT_BUTT:
        case M.AT_TUCH: case M.AT_STNG: case M.AT_HUGS: case M.AT_ENGL:
        case M.AT_TENT: case M.AT_WEAP:
            multi2++;
            break;
        default:
            break;
        }
    }

    let dmg = 0;
    for (let i = 0; i < NATTK; i++) {
        const attack = mdef.data.mattk[i];
        if (attack.aatyp !== M.AT_NONE && attack.aatyp !== M.AT_BOOM) continue;
        const adtyp = attack.adtyp;
        if ((adtyp === M.AD_FIRE && completelyburns(magr.data))
            || (adtyp === M.AD_DCAY && completelyrots(magr.data))
            || (adtyp === M.AD_RUST && completelyrusts(magr.data))) {
            dmg = magr.mhp;
        } else if ((adtyp === M.AD_ACID
                && !monster_resists_element(magr, ACID_RES, state))
            || (adtyp === M.AD_COLD
                && !monster_resists_element(magr, COLD_RES, state))
            || (adtyp === M.AD_FIRE
                && !monster_resists_element(magr, FIRE_RES, state))
            || (adtyp === M.AD_ELEC
                && !monster_resists_element(magr, SHOCK_RES, state))
            || adtyp === M.AD_PHYS) {
            dmg = attack.damn;
            if (!dmg) dmg = mdef.data.mlevel + 1;
            dmg *= attack.damd;
        }
        dmg *= multi2;
        break;
    }
    return dmg;
}

// C ref: mondata.c gender(). C returns the `unsigned female:1` bitfield, so
// callers get 0 or 1 and can index pmnames[]. The port stores female as a
// JavaScript boolean, so convert it the way monst.h's Mgender() does.
export function gender(monster) {
    // C's literal 2 is monflag.h:214 `enum mgender`'s NEUTRAL member, the same
    // pmnames[] index this file uses elsewhere. C has no NEUTER gender; the
    // similarly named M2_NEUTER is the species flag is_neuter() tests.
    if (is_neuter(monster.data)) return NEUTRAL;
    return monster.female ? FEMALE : MALE;
}

// C ref: mondata.c big_little_match().
export function big_little_match(montyp1, montyp2, state = game) {
    if (montyp1 === montyp2) return true;
    // Growing from one class letter to another is assumed impossible.
    if (state.mons[montyp1].mlet !== state.mons[montyp2].mlet) return false;
    for (let l = montyp1, b; (b = little_to_big(l)) !== l; l = b) {
        if (b === montyp2) return true;
    }
    for (let l = montyp2, b; (b = little_to_big(l)) !== l; l = b) {
        if (b === montyp1) return true;
    }
    return false;
}

// C ref: mondata.c raceptr().
export function raceptr(monster, state = game) {
    // Upolyd() reads the hero struct's two monster indexes, so it takes
    // state.u.
    if (monster === state.youmonst && !Upolyd(state.u))
        return state.mons[state.urace.mnum];
    return monster.data;
}

// C ref: mondata.c stagger(). Shares locoverb() with locomotion() above,
// reading the staggering pair of indexes instead of the plain pair.
export function stagger(species, def) {
    return locoverb(species, def, def[0] !== highc(def[0]) ? 2 : 3);
}

// C ref: mondata.c on_fire().
export function on_fire(species, mattk) {
    switch (monsndx(species)) {
    case M.PM_FLAMING_SPHERE:
    case M.PM_FIRE_VORTEX:
    case M.PM_FIRE_ELEMENTAL:
    case M.PM_SALAMANDER:
        return 'already on fire';
    case M.PM_WATER_ELEMENTAL:
    case M.PM_FOG_CLOUD:
    case M.PM_STEAM_VORTEX:
        return 'boiling';
    case M.PM_ICE_VORTEX:
    case M.PM_GLASS_GOLEM:
        return 'melting';
    case M.PM_STONE_GOLEM:
    case M.PM_CLAY_GOLEM:
    case M.PM_GOLD_GOLEM:
    case M.PM_AIR_ELEMENTAL:
    case M.PM_EARTH_ELEMENTAL:
    case M.PM_DUST_VORTEX:
    case M.PM_ENERGY_VORTEX:
        return 'heating up';
    default:
        return mattk.aatyp === M.AT_HUGS ? 'being roasted' : 'on fire';
    }
}

// C ref: mondata.c msummon_environ(). C returns the substance and writes the
// container word through a pointer; this returns both.
export function msummon_environ(species) {
    const mndx = species.mlet === M.S_ANGEL ? M.PM_ANGEL
        : species.mlet === M.S_LIGHT ? M.PM_YELLOW_LIGHT
            : monsndx(species);
    switch (mndx) {
    case M.PM_WATER_DEMON:
    case M.PM_AIR_ELEMENTAL:
    case M.PM_WATER_ELEMENTAL:
    case M.PM_FOG_CLOUD:
    case M.PM_ICE_VORTEX:
    case M.PM_FREEZING_SPHERE:
        return { what: 'vapor', cloud: 'cloud' };
    case M.PM_STEAM_VORTEX:
        return { what: 'steam', cloud: 'cloud' };
    case M.PM_ENERGY_VORTEX:
    case M.PM_SHOCKING_SPHERE:
        return { what: 'sparks', cloud: 'shower' };
    case M.PM_EARTH_ELEMENTAL:
    case M.PM_DUST_VORTEX:
        return { what: 'dust', cloud: 'cloud' };
    case M.PM_FIRE_ELEMENTAL:
    case M.PM_FIRE_VORTEX:
    case M.PM_FLAMING_SPHERE:
        return { what: 'flame', cloud: 'ball' };
    case M.PM_ANGEL:        // any 'A'-class
    case M.PM_YELLOW_LIGHT: // any 'y'-class
        return { what: 'light', cloud: 'flash' };
    default:
        return { what: 'smoke', cloud: 'cloud' };
    }
}

// C ref: mondata.c olfaction().
export function olfaction(species) {
    return !(is_golem(species)
        || species.mlet === M.S_EYE      // spheres
        || species.mlet === M.S_JELLY || species.mlet === M.S_PUDDING
        || species.mlet === M.S_BLOB || species.mlet === M.S_VORTEX
        || species.mlet === M.S_ELEMENTAL
        || species.mlet === M.S_FUNGUS   // mushrooms and fungi
        || species.mlet === M.S_LIGHT);
}

// C ref: mondata.c cvt_adtyp_to_mseenres().
export function cvt_adtyp_to_mseenres(adtyp) {
    switch (adtyp) {
    case M.AD_MAGM: return M_SEEN_MAGR;
    case M.AD_FIRE: return M_SEEN_FIRE;
    case M.AD_COLD: return M_SEEN_COLD;
    case M.AD_SLEE: return M_SEEN_SLEEP;
    case M.AD_DISN: return M_SEEN_DISINT;
    case M.AD_ELEC: return M_SEEN_ELEC;
    case M.AD_DRST: return M_SEEN_POISON;
    case M.AD_ACID: return M_SEEN_ACID;
    // M_SEEN_REFL has no matching AD_foo type.
    default: return M_SEEN_NOTHING;
    }
}

// C ref: mondata.c cvt_prop_to_mseenres().
export function cvt_prop_to_mseenres(prop) {
    switch (prop) {
    case ANTIMAGIC: return M_SEEN_MAGR;
    case FIRE_RES: return M_SEEN_FIRE;
    case COLD_RES: return M_SEEN_COLD;
    case SLEEP_RES: return M_SEEN_SLEEP;
    case DISINT_RES: return M_SEEN_DISINT;
    case POISON_RES: return M_SEEN_POISON;
    case SHOCK_RES: return M_SEEN_ELEC;
    case ACID_RES: return M_SEEN_ACID;
    case REFLECTING: return M_SEEN_REFL;
    default: return M_SEEN_NOTHING;
    }
}

// C ref: mondata.c monstunseesu() (1571-1582). Every monster that can see the
// hero forgets having watched her resist one effect. worn.c setworn() and
// setnotworn() call it through the monstunseesu_prop() macro at monst.h:94
// whenever a worn item stops granting its extrinsic.
export function monstunseesu(seenres, state = game) {
    if (seenres === M_SEEN_NOTHING || state.u?.uswallow) return;

    for (let mtmp = state.level?.monlist; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.mhp < 1) continue; /* DEADMONSTER() */
        if (m_canseeu(mtmp, state))
            mtmp.seen_resistance &= ~seenres; /* m_clearseenres() */
    }
}

export const _mondataInternals = Object.freeze({
    alternateMonsterNames,
    grownups,
});
