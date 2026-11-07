// Port of include/youprop.h, the hero's property macros.
//
// C defines each property test once, as a macro over u.uprops[] (prop.h
// struct prop: intrinsic, extrinsic and blocked bitmasks). HXxx reads the
// intrinsic field, EXxx the extrinsic field and BXxx the blocked field; the
// bare name combines them. Every read of a property in js/ goes through
// this file; scripts/youprop-reads.mjs fails when code elsewhere reads
// u.uprops[] to test a property or keeps its own copy of one of these
// functions.
//
// Each function takes the hero struct its caller holds (`state.u`), as
// Upolyd() in js/const.js does, so a planning clone's call reads the clone's
// hero. The few macros that also read other globals (gy.youmonst, gm.multi,
// gu.uball, ublindf, u.uz's level) take the game state instead and say so.
// The H, E and B accessors return the field's value, 0 when the hero has no
// slot for it; the combined macros return a boolean, as C's || and && give
// 0 or 1. Passing the game state where the hero is expected, or the hero
// where the state is expected, follows js/gstate.js recordLiveGameUse(): it
// throws in local runs, while the judge's runSegment() records a
// `youpropArgument` use, which fails the game in local scoring, and the macro
// answers from the argument it should have had (the state's hero, or the
// live game whose globals C reads).

import {
    ACID_RES, ADORNED, AGGRAVATE_MONSTER, ANTIMAGIC, BLINDED,
    BLND_RES, CLAIRVOYANT, COLD_RES, CONFLICT, CONFUSION, DEAF,
    DETECT_MONSTERS, DISINT_RES, DISPLACED, DRAIN_RES, ENERGY_REGENERATION,
    FAST, FIRE_RES, FIXED_ABIL, FLYING, FREE_ACTION, FROMOUTSIDE, FUMBLING,
    GLIB, HALF_PHDAM, HALF_SPDAM, HALLUC, HALLUC_RES, HUNGER, INFRAVISION,
    INTRINSIC, INVIS, INVULNERABLE, I_SPECIAL, Is_waterlevel, JUMPING,
    LEVITATION, LIFESAVED, LOW_PM, MAGICAL_BREATHING, PASSES_WALLS,
    POISON_RES, POLYMORPH, POLYMORPH_CONTROL, PROTECTION,
    PROT_FROM_SHAPE_CHANGERS, REFLECTING, REGENERATION, SEARCHING, SEE_INVIS,
    SHOCK_RES, SICK, SICK_RES, SLEEPY, SLEEP_RES, SLIMED, SLOW_DIGESTION,
    STEALTH, STONED, STONE_RES, STRANGLED, STUNNED, SWIMMING, TELEPAT,
    TELEPORT, TELEPORT_CONTROL, TIMEOUT, UNCHANGING, VOMITING, WARNING,
    WARN_OF_MON, WARN_UNDEAD, WOUNDED_LEGS, WWALKING, W_ARTI,
} from './const.js';
import { is_fainted } from './eat.js';
import { game, recordLiveGameUse } from './gstate.js';
import {
    amphibious, breathless, defended, hates_silver, is_flyer, is_swimmer,
} from './mondata.js';
import { AD_DISE } from './monsters.js';
import { TOWEL } from './objects.js';
import { unconscious } from './trap.js';

// Helpers in this file that sit between a macro and the argument check.
const INTERNAL = new Set(['wrongArgument', 'heroArg', 'stateOf', 'slot',
    'intrinsic', 'extrinsic', 'blocked']);

// Report a macro given the wrong kind of argument: the outermost youprop.js
// function on the stack is the macro the caller misused, and the next frame
// is that caller.
function wrongArgument(problem) {
    const frames = String(new Error().stack).split('\n').slice(1).map((line) => {
        const m = /^\s*at (?:async )?(?:([\w$.<>]+) )?\(?(.*?):\d+:\d+\)?$/u.exec(line);
        // A call through a namespace import is named `Module.Blind`.
        const name = (m?.[1] ?? '<anonymous>').replace(/^.*\./u, '');
        return { name, file: (m?.[2] ?? '').replace(/^.*\/js\//u, '') };
    });
    const outside = frames.findIndex((frame) => frame.file !== 'youprop.js');
    const macro = frames.slice(0, outside < 0 ? frames.length : outside)
        .filter((frame) => !INTERNAL.has(frame.name)).at(-1)?.name ?? 'a macro';
    const caller = outside < 0 ? 'an unknown caller'
        : `${frames[outside].name} (${frames[outside].file})`;
    recordLiveGameUse('youpropArgument', `youprop.js ${macro}() was given ${problem}, in ${caller}`,
        (detail) => new TypeError(detail));
}

// The hero a hero macro reads: its argument, or the state's hero when it was
// given the game state.
function heroArg(u) {
    if (u?.u === undefined) return u;
    wrongArgument('the game state in place of the hero (state.u)');
    return u.u;
}

// The game state a state macro reads: its argument, or the live game, whose
// globals C reads, when it was given the hero.
function stateOf(state) {
    if (state.uprops === undefined) return state;
    wrongArgument('the hero in place of the game state');
    return game;
}

// u.uprops[index] for the hero `u`, or undefined when there is no hero or
// it has no slot: the copies these functions replaced read
// `state.u?.uprops?.[index]`, and unit tests build states without either.
function slot(u, index) {
    return heroArg(u)?.uprops?.[index];
}

function intrinsic(u, index) {
    return slot(u, index)?.intrinsic ?? 0;
}
function extrinsic(u, index) {
    return slot(u, index)?.extrinsic ?? 0;
}
function blocked(u, index) {
    return slot(u, index)?.blocked ?? 0;
}

/*** Resistances to troubles ***/

// C ref: youprop.h:26-28
export function HFire_resistance(u) {
    return intrinsic(u, FIRE_RES);
}
export function EFire_resistance(u) {
    return extrinsic(u, FIRE_RES);
}
export function Fire_resistance(u) {
    return Boolean(HFire_resistance(u) || EFire_resistance(u));
}

// C ref: youprop.h:30-32
export function HCold_resistance(u) {
    return intrinsic(u, COLD_RES);
}
export function ECold_resistance(u) {
    return extrinsic(u, COLD_RES);
}
export function Cold_resistance(u) {
    return Boolean(HCold_resistance(u) || ECold_resistance(u));
}

// C ref: youprop.h:34-36
export function HSleep_resistance(u) {
    return intrinsic(u, SLEEP_RES);
}
export function ESleep_resistance(u) {
    return extrinsic(u, SLEEP_RES);
}
export function Sleep_resistance(u) {
    return Boolean(HSleep_resistance(u) || ESleep_resistance(u));
}

// C ref: youprop.h:38-40
export function HDisint_resistance(u) {
    return intrinsic(u, DISINT_RES);
}
export function EDisint_resistance(u) {
    return extrinsic(u, DISINT_RES);
}
export function Disint_resistance(u) {
    return Boolean(HDisint_resistance(u) || EDisint_resistance(u));
}

// C ref: youprop.h:42-44
export function HShock_resistance(u) {
    return intrinsic(u, SHOCK_RES);
}
export function EShock_resistance(u) {
    return extrinsic(u, SHOCK_RES);
}
export function Shock_resistance(u) {
    return Boolean(HShock_resistance(u) || EShock_resistance(u));
}

// C ref: youprop.h:46-48
export function HPoison_resistance(u) {
    return intrinsic(u, POISON_RES);
}
export function EPoison_resistance(u) {
    return extrinsic(u, POISON_RES);
}
export function Poison_resistance(u) {
    return Boolean(HPoison_resistance(u) || EPoison_resistance(u));
}

// C ref: youprop.h:50-52
export function HDrain_resistance(u) {
    return intrinsic(u, DRAIN_RES);
}
export function EDrain_resistance(u) {
    return extrinsic(u, DRAIN_RES);
}
export function Drain_resistance(u) {
    return Boolean(HDrain_resistance(u) || EDrain_resistance(u));
}

// C ref: youprop.h:55-57. HAntimagic is set only by FROMFORM.
export function HAntimagic(u) {
    return intrinsic(u, ANTIMAGIC);
}
export function EAntimagic(u) {
    return extrinsic(u, ANTIMAGIC);
}
export function Antimagic(u) {
    return Boolean(HAntimagic(u) || EAntimagic(u));
}

// C ref: youprop.h:59-61
export function HAcid_resistance(u) {
    return intrinsic(u, ACID_RES);
}
export function EAcid_resistance(u) {
    return extrinsic(u, ACID_RES);
}
export function Acid_resistance(u) {
    return Boolean(HAcid_resistance(u) || EAcid_resistance(u));
}

// C ref: youprop.h:63-65
export function HStone_resistance(u) {
    return intrinsic(u, STONE_RES);
}
export function EStone_resistance(u) {
    return extrinsic(u, STONE_RES);
}
export function Stone_resistance(u) {
    return Boolean(HStone_resistance(u) || EStone_resistance(u));
}

// C ref: youprop.h:67-70. The third term reads gy.youmonst, so this macro
// takes the game state.
export function HSick_resistance(u) {
    return intrinsic(u, SICK_RES);
}
export function ESick_resistance(u) {
    return extrinsic(u, SICK_RES);
}
export function Sick_resistance(state) {
    state = stateOf(state);
    const u = state.u;
    return Boolean(HSick_resistance(u) || ESick_resistance(u)
        || defended(state.youmonst, AD_DISE, state));
}

// C ref: youprop.h:73. Intrinsic only.
export function Invulnerable(u) {
    return intrinsic(u, INVULNERABLE);
}

/*** Troubles ***/

// C ref: youprop.h:77. Takes the game state, which holds the ball.
export function Punished(state) {
    state = stateOf(state);
    return Boolean(state.uball);
}

// C ref: youprop.h:80-84. Timeouts (and FROMFORM), intrinsic only.
export function HStun(u) {
    return intrinsic(u, STUNNED);
}
export function Stunned(u) {
    return HStun(u);
}
export function HConfusion(u) {
    return intrinsic(u, CONFUSION);
}
export function Confusion(u) {
    return HConfusion(u);
}

// C ref: youprop.h:87-103. BBlinded is set by artifact lenses (the Eyes of
// the Overworld), which override every other blindness.
export function HBlinded(u) {
    return intrinsic(u, BLINDED);
}
export function EBlinded(u) {
    return extrinsic(u, BLINDED);
}
export function BBlinded(u) {
    return blocked(u, BLINDED);
}
export function Blinded(u) {
    return Boolean(HBlinded(u) && !BBlinded(u));
}
export function BlindedTimeout(u) {
    return HBlinded(u) & TIMEOUT;
}
export function PermaBlind(u) {
    return (HBlinded(u) & FROMOUTSIDE) !== 0;
}
export function Blindfolded(u) {
    return EBlinded(u);
}
export function Blindfolded_only(u) {
    return Boolean(Blindfolded(u) && !Blinded(u));
}
export function Blind(u) {
    return Boolean((HBlinded(u) || EBlinded(u)) && !BBlinded(u));
}

// C ref: youprop.h:108-113. Maladies are timeouts, intrinsic only.
export function Sick(u) {
    return intrinsic(u, SICK);
}
export function Stoned(u) {
    return intrinsic(u, STONED);
}
export function Strangled(u) {
    return intrinsic(u, STRANGLED);
}
export function Vomiting(u) {
    return intrinsic(u, VOMITING);
}
export function Glib(u) {
    return intrinsic(u, GLIB);
}
export function Slimed(u) {
    return intrinsic(u, SLIMED);
}

// C ref: youprop.h:116-120. Hallucination is solely a timeout; only its
// resistance has an extrinsic source.
export function HHallucination(u) {
    return intrinsic(u, HALLUC);
}
export function HHalluc_resistance(u) {
    return intrinsic(u, HALLUC_RES);
}
export function EHalluc_resistance(u) {
    return extrinsic(u, HALLUC_RES);
}
export function Halluc_resistance(u) {
    return Boolean(HHalluc_resistance(u) || EHalluc_resistance(u));
}
export function Hallucination(u) {
    return Boolean(HHallucination(u) && !Halluc_resistance(u));
}

// C ref: youprop.h:123-125
export function HDeaf(u) {
    return intrinsic(u, DEAF);
}
export function EDeaf(u) {
    return extrinsic(u, DEAF);
}
export function Deaf(u) {
    u = heroArg(u);
    return Boolean(HDeaf(u) || EDeaf(u) || u?.uroleplay?.deaf);
}

// C ref: youprop.h:127-129
export function HFumbling(u) {
    return intrinsic(u, FUMBLING);
}
export function EFumbling(u) {
    return extrinsic(u, FUMBLING);
}
export function Fumbling(u) {
    return Boolean(HFumbling(u) || EFumbling(u));
}

// C ref: youprop.h:136-138
export function HWounded_legs(u) {
    return intrinsic(u, WOUNDED_LEGS);
}
export function EWounded_legs(u) {
    return extrinsic(u, WOUNDED_LEGS);
}
export function Wounded_legs(u) {
    return Boolean(HWounded_legs(u) || EWounded_legs(u));
}

// C ref: youprop.h:141-143
export function HSleepy(u) {
    return intrinsic(u, SLEEPY);
}
export function ESleepy(u) {
    return extrinsic(u, SLEEPY);
}
export function Sleepy(u) {
    return Boolean(HSleepy(u) || ESleepy(u));
}

// C ref: youprop.h:145-147
export function HHunger(u) {
    return intrinsic(u, HUNGER);
}
export function EHunger(u) {
    return extrinsic(u, HUNGER);
}
export function Hunger(u) {
    return Boolean(HHunger(u) || EHunger(u));
}

/*** Vision and senses ***/

// C ref: youprop.h:150-152
export function HSee_invisible(u) {
    return intrinsic(u, SEE_INVIS);
}
export function ESee_invisible(u) {
    return extrinsic(u, SEE_INVIS);
}
export function See_invisible(u) {
    return Boolean(HSee_invisible(u) || ESee_invisible(u));
}

// C ref: youprop.h:154-157
export function HTelepat(u) {
    return intrinsic(u, TELEPAT);
}
export function ETelepat(u) {
    return extrinsic(u, TELEPAT);
}
export function Blind_telepat(u) {
    return Boolean(HTelepat(u) || ETelepat(u));
}
export function Unblind_telepat(u) {
    return ETelepat(u);
}

// C ref: youprop.h:159-161
export function HBlnd_resist(u) {
    return intrinsic(u, BLND_RES);
}
export function EBlnd_resist(u) {
    return extrinsic(u, BLND_RES);
}
export function Blnd_resist(u) {
    return Boolean(HBlnd_resist(u) || EBlnd_resist(u));
}

// C ref: youprop.h:163-165
export function HWarning(u) {
    return intrinsic(u, WARNING);
}
export function EWarning(u) {
    return extrinsic(u, WARNING);
}
export function Warning(u) {
    return Boolean(HWarning(u) || EWarning(u));
}

// C ref: youprop.h:168-170
export function HWarn_of_mon(u) {
    return intrinsic(u, WARN_OF_MON);
}
export function EWarn_of_mon(u) {
    return extrinsic(u, WARN_OF_MON);
}
export function Warn_of_mon(u) {
    return Boolean(HWarn_of_mon(u) || EWarn_of_mon(u));
}

// C ref: youprop.h:172-173
export function HUndead_warning(u) {
    return intrinsic(u, WARN_UNDEAD);
}
export function Undead_warning(u) {
    return HUndead_warning(u);
}

// C ref: youprop.h:175-177
export function HSearching(u) {
    return intrinsic(u, SEARCHING);
}
export function ESearching(u) {
    return extrinsic(u, SEARCHING);
}
export function Searching(u) {
    return Boolean(HSearching(u) || ESearching(u));
}

// C ref: youprop.h:179-182
export function HClairvoyant(u) {
    return intrinsic(u, CLAIRVOYANT);
}
export function EClairvoyant(u) {
    return extrinsic(u, CLAIRVOYANT);
}
export function BClairvoyant(u) {
    return blocked(u, CLAIRVOYANT);
}
export function Clairvoyant(u) {
    return Boolean((HClairvoyant(u) || EClairvoyant(u)) && !BClairvoyant(u));
}

// C ref: youprop.h:184-186
export function HInfravision(u) {
    return intrinsic(u, INFRAVISION);
}
export function EInfravision(u) {
    return extrinsic(u, INFRAVISION);
}
export function Infravision(u) {
    return Boolean(HInfravision(u) || EInfravision(u));
}

// C ref: youprop.h:188-190
export function HDetect_monsters(u) {
    return intrinsic(u, DETECT_MONSTERS);
}
export function EDetect_monsters(u) {
    return extrinsic(u, DETECT_MONSTERS);
}
export function Detect_monsters(u) {
    return Boolean(HDetect_monsters(u) || EDetect_monsters(u));
}

/*** Appearance and behavior ***/

// C ref: youprop.h:193
export function Adornment(u) {
    return extrinsic(u, ADORNED);
}

// C ref: youprop.h:195-199
export function HInvis(u) {
    return intrinsic(u, INVIS);
}
export function EInvis(u) {
    return extrinsic(u, INVIS);
}
export function BInvis(u) {
    return blocked(u, INVIS);
}
export function Invis(u) {
    return Boolean((HInvis(u) || EInvis(u)) && !BInvis(u));
}
export function Invisible(u) {
    return Boolean(Invis(u) && !See_invisible(u));
}

// C ref: youprop.h:202-204
export function HDisplaced(u) {
    return intrinsic(u, DISPLACED);
}
export function EDisplaced(u) {
    return extrinsic(u, DISPLACED);
}
export function Displaced(u) {
    return Boolean(HDisplaced(u) || EDisplaced(u));
}

// C ref: youprop.h:206-210. BStealth has FROMOUTSIDE set while riding a
// steed that does not fly.
export function HStealth(u) {
    return intrinsic(u, STEALTH);
}
export function EStealth(u) {
    return extrinsic(u, STEALTH);
}
export function BStealth(u) {
    return blocked(u, STEALTH);
}
export function Stealth(u) {
    return Boolean((HStealth(u) || EStealth(u)) && !BStealth(u));
}

// C ref: youprop.h:212-214
export function HAggravate_monster(u) {
    return intrinsic(u, AGGRAVATE_MONSTER);
}
export function EAggravate_monster(u) {
    return extrinsic(u, AGGRAVATE_MONSTER);
}
export function Aggravate_monster(u) {
    return Boolean(HAggravate_monster(u) || EAggravate_monster(u));
}

// C ref: youprop.h:216-218
export function HConflict(u) {
    return intrinsic(u, CONFLICT);
}
export function EConflict(u) {
    return extrinsic(u, CONFLICT);
}
export function Conflict(u) {
    return Boolean(HConflict(u) || EConflict(u));
}

/*** Transportation ***/

// C ref: youprop.h:221-223
export function HJumping(u) {
    return intrinsic(u, JUMPING);
}
export function EJumping(u) {
    return extrinsic(u, JUMPING);
}
export function Jumping(u) {
    return Boolean(HJumping(u) || EJumping(u));
}

// C ref: youprop.h:225-227
export function HTeleportation(u) {
    return intrinsic(u, TELEPORT);
}
export function ETeleportation(u) {
    return extrinsic(u, TELEPORT);
}
export function Teleportation(u) {
    return Boolean(HTeleportation(u) || ETeleportation(u));
}

// C ref: youprop.h:229-231
export function HTeleport_control(u) {
    return intrinsic(u, TELEPORT_CONTROL);
}
export function ETeleport_control(u) {
    return extrinsic(u, TELEPORT_CONTROL);
}
export function Teleport_control(u) {
    return Boolean(HTeleport_control(u) || ETeleport_control(u));
}

// C ref: youprop.h:235-245. HLevitation's I_SPECIAL marks a blessed potion's
// levitation, which '>' may end; BLevitation's I_SPECIAL marks being trapped
// in the floor and its FROMOUTSIDE being inside solid rock or water.
export function HLevitation(u) {
    return intrinsic(u, LEVITATION);
}
export function ELevitation(u) {
    return extrinsic(u, LEVITATION);
}
export function BLevitation(u) {
    return blocked(u, LEVITATION);
}
export function Levitation(u) {
    return Boolean((HLevitation(u) || ELevitation(u)) && !BLevitation(u));
}
export function Lev_at_will(u) {
    return ((HLevitation(u) & I_SPECIAL) !== 0 || (ELevitation(u) & W_ARTI) !== 0)
        && (HLevitation(u) & ~(I_SPECIAL | TIMEOUT)) === 0
        && (ELevitation(u) & ~W_ARTI) === 0;
}

// C ref: youprop.h:248-255. A flying steed carries the hero; BFlying is set
// while levitating, trapped in the floor, or inside rock or water.
export function HFlying(u) {
    return intrinsic(u, FLYING);
}
export function EFlying(u) {
    return extrinsic(u, FLYING);
}
export function BFlying(u) {
    return blocked(u, FLYING);
}
export function Flying(u) {
    u = heroArg(u);
    return Boolean((HFlying(u) || EFlying(u)
        || (u?.usteed && is_flyer(u.usteed.data))) && !BFlying(u));
}

// C ref: youprop.h:258-260. Is_waterlevel() reads the dungeon's water
// level, so this macro takes the game state.
export function HWwalking(u) {
    return intrinsic(u, WWALKING);
}
export function EWwalking(u) {
    return extrinsic(u, WWALKING);
}
export function Wwalking(state) {
    state = stateOf(state);
    const u = state.u;
    return Boolean((HWwalking(u) || EWwalking(u)) && !Is_waterlevel(u?.uz, state));
}

// C ref: youprop.h:264-267
export function HSwimming(u) {
    return intrinsic(u, SWIMMING);
}
export function ESwimming(u) {
    return extrinsic(u, SWIMMING);
}
export function Swimming(u) {
    u = heroArg(u);
    return Boolean(HSwimming(u) || ESwimming(u)
        || (u?.usteed && is_swimmer(u.usteed.data)));
}

// C ref: youprop.h:270-277. Amphibious and Breathless read
// gy.youmonst.data, so they take the game state.
export function HMagical_breathing(u) {
    return intrinsic(u, MAGICAL_BREATHING);
}
export function EMagical_breathing(u) {
    return extrinsic(u, MAGICAL_BREATHING);
}
export function Amphibious(state) {
    state = stateOf(state);
    const u = state.u;
    return Boolean(HMagical_breathing(u) || EMagical_breathing(u)
        || amphibious(state.youmonst?.data));
}
export function Breathless(state) {
    state = stateOf(state);
    const u = state.u;
    return Boolean(HMagical_breathing(u) || EMagical_breathing(u)
        || breathless(state.youmonst?.data));
}

// C ref: youprop.h:279
export function Underwater(u) {
    u = heroArg(u);
    return Boolean(u?.uinwater);
}

// C ref: youprop.h:284-286
export function HPasses_walls(u) {
    return intrinsic(u, PASSES_WALLS);
}
export function EPasses_walls(u) {
    return extrinsic(u, PASSES_WALLS);
}
export function Passes_walls(u) {
    return Boolean(HPasses_walls(u) || EPasses_walls(u));
}

/*** Physical attributes ***/

// C ref: youprop.h:289-291
export function HSlow_digestion(u) {
    return intrinsic(u, SLOW_DIGESTION);
}
export function ESlow_digestion(u) {
    return extrinsic(u, SLOW_DIGESTION);
}
export function Slow_digestion(u) {
    return Boolean(HSlow_digestion(u) || ESlow_digestion(u));
}

// C ref: youprop.h:293-295
export function HHalf_spell_damage(u) {
    return intrinsic(u, HALF_SPDAM);
}
export function EHalf_spell_damage(u) {
    return extrinsic(u, HALF_SPDAM);
}
export function Half_spell_damage(u) {
    return Boolean(HHalf_spell_damage(u) || EHalf_spell_damage(u));
}

// C ref: youprop.h:339-341
export function HHalf_physical_damage(u) {
    return intrinsic(u, HALF_PHDAM);
}
export function EHalf_physical_damage(u) {
    return extrinsic(u, HALF_PHDAM);
}
export function Half_physical_damage(u) {
    return Boolean(HHalf_physical_damage(u) || EHalf_physical_damage(u));
}

// C ref: hack.h:1236-1237, the one use of Half_physical_damage C wraps in a
// macro of its own.
//   #define Maybe_Half_Phys(dmg) \
//       ((Half_physical_damage) ? (((dmg) + 1) / 2) : (dmg))
// C's int division truncates toward zero, as Math.trunc does. Callers
// evaluate `dmg` before the property test, while C tests first; the test
// draws no random number and changes no state, so the order makes no
// difference.
export function Maybe_Half_Phys(dmg, u) {
    return Half_physical_damage(u) ? Math.trunc((dmg + 1) / 2) : dmg;
}

// C ref: youprop.h:343-345
export function HRegeneration(u) {
    return intrinsic(u, REGENERATION);
}
export function ERegeneration(u) {
    return extrinsic(u, REGENERATION);
}
export function Regeneration(u) {
    return Boolean(HRegeneration(u) || ERegeneration(u));
}

// C ref: youprop.h:347-349
export function HEnergy_regeneration(u) {
    return intrinsic(u, ENERGY_REGENERATION);
}
export function EEnergy_regeneration(u) {
    return extrinsic(u, ENERGY_REGENERATION);
}
export function Energy_regeneration(u) {
    return Boolean(HEnergy_regeneration(u) || EEnergy_regeneration(u));
}

// C ref: youprop.h:351-353
export function HProtection(u) {
    return intrinsic(u, PROTECTION);
}
export function EProtection(u) {
    return extrinsic(u, PROTECTION);
}
export function Protection(u) {
    return Boolean(HProtection(u) || EProtection(u));
}

// C ref: youprop.h:355-360
export function HProtection_from_shape_changers(u) {
    return intrinsic(u, PROT_FROM_SHAPE_CHANGERS);
}
export function EProtection_from_shape_changers(u) {
    return extrinsic(u, PROT_FROM_SHAPE_CHANGERS);
}
export function Protection_from_shape_changers(u) {
    return Boolean(HProtection_from_shape_changers(u) || EProtection_from_shape_changers(u));
}

// C ref: youprop.h:362-364
export function HPolymorph(u) {
    return intrinsic(u, POLYMORPH);
}
export function EPolymorph(u) {
    return extrinsic(u, POLYMORPH);
}
export function Polymorph(u) {
    return Boolean(HPolymorph(u) || EPolymorph(u));
}

// C ref: youprop.h:366-368
export function HPolymorph_control(u) {
    return intrinsic(u, POLYMORPH_CONTROL);
}
export function EPolymorph_control(u) {
    return extrinsic(u, POLYMORPH_CONTROL);
}
export function Polymorph_control(u) {
    return Boolean(HPolymorph_control(u) || EPolymorph_control(u));
}

// C ref: youprop.h:370-372
export function HUnchanging(u) {
    return intrinsic(u, UNCHANGING);
}
export function EUnchanging(u) {
    return extrinsic(u, UNCHANGING);
}
export function Unchanging(u) {
    return Boolean(HUnchanging(u) || EUnchanging(u));
}

// C ref: youprop.h:374-377. Very_fast ignores the plain intrinsic speed
// (FROMEXPER, FROMRACE, FROMOUTSIDE) but counts a timed or FROMFORM one.
export function HFast(u) {
    return intrinsic(u, FAST);
}
export function EFast(u) {
    return extrinsic(u, FAST);
}
export function Fast(u) {
    return Boolean(HFast(u) || EFast(u));
}
export function Very_fast(u) {
    return Boolean((HFast(u) & ~INTRINSIC) || EFast(u));
}

// C ref: youprop.h:379-381
export function HReflecting(u) {
    return intrinsic(u, REFLECTING);
}
export function EReflecting(u) {
    return extrinsic(u, REFLECTING);
}
export function Reflecting(u) {
    return Boolean(HReflecting(u) || EReflecting(u));
}

// C ref: youprop.h:383-387. Extrinsic only.
export function Free_action(u) {
    return extrinsic(u, FREE_ACTION);
}
export function Fixed_abil(u) {
    return extrinsic(u, FIXED_ABIL);
}
export function Lifesaved(u) {
    return extrinsic(u, LIFESAVED);
}

/*
 * Some pseudo-properties.
 */

// C ref: youprop.h:399. unconscious() (trap.c) includes u.usleep but not
// is_fainted() (eat.c). Takes the game state, which holds gm.multi.
export function Unaware(state) {
    state = stateOf(state);
    return Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || is_fainted(state));
}

// C ref: youprop.h:401. Takes the game state, which holds gy.youmonst.
export function Hate_silver(state) {
    state = stateOf(state);
    const u = state.u;
    return Boolean(u?.ulycn >= LOW_PM || hates_silver(state.youmonst?.data));
}

// C ref: youprop.h:405-406. A worn towel with charges left; there is no
// u.uprops[] slot. Takes the game state, which holds ublindf.
export function Half_gas_damage(state) {
    state = stateOf(state);
    const towel = state.ublindf;
    return Boolean(towel && towel.otyp === TOWEL && towel.spe > 0);
}
