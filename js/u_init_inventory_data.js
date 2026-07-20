// Starting inventory descriptors and race substitutions.
// C ref: src/u_init.c Archeologist through Money, plus inv_subs[].

import * as O from './objects.js';
import { rn2 } from './rng.js';

export const UNDEF_TYP = 0;
export const UNDEF_SPE = 0x7f;
export const UNDEF_BLESS = 2;

function trobj(trotyp, trspe, trclass, trquanMin, trquanMax, trbless) {
    return Object.freeze({
        trotyp,
        trspe,
        trclass,
        trquan_min: trquanMin,
        trquan_max: trquanMax,
        trbless,
    });
}

function table(entries) {
    return Object.freeze(entries);
}

const Archeologist = table([
    trobj(O.BULLWHIP, 2, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.LEATHER_JACKET, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.FEDORA, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.FOOD_RATION, 0, O.FOOD_CLASS, 3, 3, 0),
    trobj(O.PICK_AXE, UNDEF_SPE, O.TOOL_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.TINNING_KIT, UNDEF_SPE, O.TOOL_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.TOUCHSTONE, 0, O.GEM_CLASS, 1, 1, 0),
    trobj(O.SACK, 0, O.TOOL_CLASS, 1, 1, 0),
]);

const Barbarian_0 = table([
    trobj(O.TWO_HANDED_SWORD, 0, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.AXE, 0, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.RING_MAIL, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.FOOD_RATION, 0, O.FOOD_CLASS, 1, 1, 0),
]);

const Barbarian_1 = table([
    trobj(O.BATTLE_AXE, 0, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.SHORT_SWORD, 0, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.RING_MAIL, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.FOOD_RATION, 0, O.FOOD_CLASS, 1, 1, 0),
]);

const Cave_man = table([
    trobj(O.CLUB, 1, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.SLING, 2, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.FLINT, 0, O.GEM_CLASS, 10, 20, UNDEF_BLESS),
    trobj(O.ROCK, 0, O.GEM_CLASS, 3, 3, 0),
    trobj(O.LEATHER_ARMOR, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
]);

const Healer = table([
    trobj(O.SCALPEL, 0, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.LEATHER_GLOVES, 1, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.STETHOSCOPE, 0, O.TOOL_CLASS, 1, 1, 0),
    trobj(O.POT_HEALING, 0, O.POTION_CLASS, 4, 4, UNDEF_BLESS),
    trobj(O.POT_EXTRA_HEALING, 0, O.POTION_CLASS, 4, 4, UNDEF_BLESS),
    trobj(O.WAN_SLEEP, UNDEF_SPE, O.WAND_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.SPE_HEALING, 0, O.SPBOOK_CLASS, 1, 1, 1),
    trobj(O.SPE_EXTRA_HEALING, 0, O.SPBOOK_CLASS, 1, 1, 1),
    trobj(O.SPE_STONE_TO_FLESH, 0, O.SPBOOK_CLASS, 1, 1, 1),
    trobj(O.APPLE, 0, O.FOOD_CLASS, 5, 5, 0),
]);

const Knight = table([
    trobj(O.LONG_SWORD, 1, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.LANCE, 1, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.RING_MAIL, 1, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.HELMET, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.SMALL_SHIELD, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.LEATHER_GLOVES, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.APPLE, 0, O.FOOD_CLASS, 10, 10, 0),
    trobj(O.CARROT, 0, O.FOOD_CLASS, 10, 10, 0),
]);

const Monk = table([
    trobj(O.LEATHER_GLOVES, 2, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.ROBE, 1, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(UNDEF_TYP, UNDEF_SPE, O.SCROLL_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.POT_HEALING, 0, O.POTION_CLASS, 3, 3, UNDEF_BLESS),
    trobj(O.FOOD_RATION, 0, O.FOOD_CLASS, 3, 3, 0),
    trobj(O.APPLE, 0, O.FOOD_CLASS, 5, 5, UNDEF_BLESS),
    trobj(O.ORANGE, 0, O.FOOD_CLASS, 5, 5, UNDEF_BLESS),
    trobj(O.FORTUNE_COOKIE, 0, O.FOOD_CLASS, 3, 3, UNDEF_BLESS),
]);

const Priest = table([
    trobj(O.MACE, 1, O.WEAPON_CLASS, 1, 1, 1),
    trobj(O.ROBE, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.SMALL_SHIELD, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.POT_WATER, 0, O.POTION_CLASS, 4, 4, 1),
    trobj(O.CLOVE_OF_GARLIC, 0, O.FOOD_CLASS, 1, 1, 0),
    trobj(O.SPRIG_OF_WOLFSBANE, 0, O.FOOD_CLASS, 1, 1, 0),
    trobj(UNDEF_TYP, UNDEF_SPE, O.SPBOOK_CLASS, 2, 2, UNDEF_BLESS),
]);

const Ranger = table([
    trobj(O.DAGGER, 1, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.BOW, 1, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.ARROW, 2, O.WEAPON_CLASS, 50, 59, UNDEF_BLESS),
    trobj(O.ARROW, 0, O.WEAPON_CLASS, 30, 39, UNDEF_BLESS),
    trobj(O.CLOAK_OF_DISPLACEMENT, 2, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.CRAM_RATION, 0, O.FOOD_CLASS, 4, 4, 0),
]);

const Rogue = table([
    trobj(O.SHORT_SWORD, 0, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.DAGGER, 0, O.WEAPON_CLASS, 6, 15, 0),
    trobj(O.LEATHER_ARMOR, 1, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.POT_SICKNESS, 0, O.POTION_CLASS, 1, 1, 0),
    trobj(O.LOCK_PICK, 0, O.TOOL_CLASS, 1, 1, 0),
    trobj(O.SACK, 0, O.TOOL_CLASS, 1, 1, 0),
]);

const Samurai = table([
    trobj(O.KATANA, 0, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.SHORT_SWORD, 0, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.YUMI, 0, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.YA, 0, O.WEAPON_CLASS, 26, 45, UNDEF_BLESS),
    trobj(O.SPLINT_MAIL, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
]);

const Tourist = table([
    trobj(O.DART, 2, O.WEAPON_CLASS, 21, 40, UNDEF_BLESS),
    trobj(UNDEF_TYP, UNDEF_SPE, O.FOOD_CLASS, 10, 10, 0),
    trobj(O.POT_EXTRA_HEALING, 0, O.POTION_CLASS, 2, 2, UNDEF_BLESS),
    trobj(O.SCR_MAGIC_MAPPING, 0, O.SCROLL_CLASS, 4, 4, UNDEF_BLESS),
    trobj(O.HAWAIIAN_SHIRT, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.EXPENSIVE_CAMERA, UNDEF_SPE, O.TOOL_CLASS, 1, 1, 0),
    trobj(O.CREDIT_CARD, 0, O.TOOL_CLASS, 1, 1, 0),
]);

const Valkyrie = table([
    trobj(O.SPEAR, 1, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.DAGGER, 0, O.WEAPON_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.SMALL_SHIELD, 3, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.FOOD_RATION, 0, O.FOOD_CLASS, 1, 1, 0),
]);

const Wizard = table([
    trobj(O.QUARTERSTAFF, 1, O.WEAPON_CLASS, 1, 1, 1),
    trobj(O.CLOAK_OF_MAGIC_RESISTANCE, 0, O.ARMOR_CLASS, 1, 1, UNDEF_BLESS),
    trobj(UNDEF_TYP, UNDEF_SPE, O.WAND_CLASS, 1, 1, UNDEF_BLESS),
    trobj(UNDEF_TYP, UNDEF_SPE, O.RING_CLASS, 2, 2, UNDEF_BLESS),
    trobj(UNDEF_TYP, UNDEF_SPE, O.POTION_CLASS, 3, 3, UNDEF_BLESS),
    trobj(UNDEF_TYP, UNDEF_SPE, O.SCROLL_CLASS, 3, 3, UNDEF_BLESS),
    trobj(O.SPE_FORCE_BOLT, 0, O.SPBOOK_CLASS, 1, 1, 1),
    trobj(UNDEF_TYP, UNDEF_SPE, O.SPBOOK_CLASS, 1, 1, UNDEF_BLESS),
    trobj(O.MAGIC_MARKER, 19, O.TOOL_CLASS, 1, 1, 0),
]);

const Healing_book = table([
    trobj(O.SPE_HEALING, UNDEF_SPE, O.SPBOOK_CLASS, 1, 1, 1),
]);
const Protection_book = table([
    trobj(O.SPE_PROTECTION, UNDEF_SPE, O.SPBOOK_CLASS, 1, 1, 1),
]);
const Confuse_monster_book = table([
    trobj(O.SPE_CONFUSE_MONSTER, UNDEF_SPE, O.SPBOOK_CLASS, 1, 1, 1),
]);
const Tinopener = table([
    trobj(O.TIN_OPENER, 0, O.TOOL_CLASS, 1, 1, 0),
]);
const Magicmarker = table([
    trobj(O.MAGIC_MARKER, 19, O.TOOL_CLASS, 1, 1, 0),
]);
const Lamp = table([
    trobj(O.OIL_LAMP, 1, O.TOOL_CLASS, 1, 1, 0),
]);
const Blindfold = table([
    trobj(O.BLINDFOLD, 0, O.TOOL_CLASS, 1, 1, 0),
]);
const Xtra_food = table([
    trobj(UNDEF_TYP, UNDEF_SPE, O.FOOD_CLASS, 2, 2, 0),
]);
const Leash = table([
    trobj(O.LEASH, 0, O.TOOL_CLASS, 1, 1, 0),
]);
const Towel = table([
    trobj(O.TOWEL, 0, O.TOOL_CLASS, 1, 1, 0),
]);
const Wishing = table([
    trobj(O.WAN_WISHING, 3, O.WAND_CLASS, 1, 1, 0),
]);
const Money = table([
    trobj(O.GOLD_PIECE, 0, O.COIN_CLASS, 1, 1, 0),
]);

export const STARTING_INVENTORY_TABLES = Object.freeze({
    Archeologist,
    Barbarian_0,
    Barbarian_1,
    Cave_man,
    Healer,
    Knight,
    Monk,
    Priest,
    Ranger,
    Rogue,
    Samurai,
    Tourist,
    Valkyrie,
    Wizard,
    Healing_book,
    Protection_book,
    Confuse_monster_book,
    Tinopener,
    Magicmarker,
    Lamp,
    Blindfold,
    Xtra_food,
    Leash,
    Towel,
    Wishing,
    Money,
});

function substitution(race, item_otyp, subs_otyp) {
    return Object.freeze({ race, item_otyp, subs_otyp });
}

export const INITIAL_INVENTORY_SUBSTITUTIONS = Object.freeze([
    substitution('Elf', O.DAGGER, O.ELVEN_DAGGER),
    substitution('Elf', O.SPEAR, O.ELVEN_SPEAR),
    substitution('Elf', O.SHORT_SWORD, O.ELVEN_SHORT_SWORD),
    substitution('Elf', O.BOW, O.ELVEN_BOW),
    substitution('Elf', O.ARROW, O.ELVEN_ARROW),
    substitution('Elf', O.HELMET, O.ELVEN_LEATHER_HELM),
    substitution('Elf', O.CLOAK_OF_DISPLACEMENT, O.ELVEN_CLOAK),
    substitution('Elf', O.CRAM_RATION, O.LEMBAS_WAFER),
    substitution('Orc', O.DAGGER, O.ORCISH_DAGGER),
    substitution('Orc', O.SPEAR, O.ORCISH_SPEAR),
    substitution('Orc', O.SHORT_SWORD, O.ORCISH_SHORT_SWORD),
    substitution('Orc', O.BOW, O.ORCISH_BOW),
    substitution('Orc', O.ARROW, O.ORCISH_ARROW),
    substitution('Orc', O.HELMET, O.ORCISH_HELM),
    substitution('Orc', O.SMALL_SHIELD, O.ORCISH_SHIELD),
    substitution('Orc', O.RING_MAIL, O.ORCISH_RING_MAIL),
    substitution('Orc', O.CHAIN_MAIL, O.ORCISH_CHAIN_MAIL),
    substitution('Orc', O.CRAM_RATION, O.TRIPE_RATION),
    substitution('Orc', O.LEMBAS_WAFER, O.TRIPE_RATION),
    substitution('Dwa', O.SPEAR, O.DWARVISH_SPEAR),
    substitution('Dwa', O.SHORT_SWORD, O.DWARVISH_SHORT_SWORD),
    substitution('Dwa', O.HELMET, O.DWARVISH_IRON_HELM),
    substitution('Dwa', O.LEMBAS_WAFER, O.CRAM_RATION),
    substitution('Gno', O.BOW, O.CROSSBOW),
    substitution('Gno', O.ARROW, O.CROSSBOW_BOLT),
]);

export const ELF_STARTING_INSTRUMENTS = Object.freeze([
    O.WOODEN_FLUTE,
    O.TOOLED_HORN,
    O.WOODEN_HARP,
    O.BELL,
    O.BUGLE,
    O.LEATHER_DRUM,
]);

export const ELF_STARTING_INSTRUMENT_ROLES = Object.freeze(['Pri', 'Wiz']);

// C ref: u_init.c u_init_race() local Instrument[] and ROLL_FROM(trotyp).
// The caller performs the elf/role eligibility check, then calls this before
// ini_inv(); that preserves the roll even when pauper makes ini_inv a no-op.
export function rollElfStartingInstrument(random = { rn2 }) {
    const index = random.rn2(ELF_STARTING_INSTRUMENTS.length);
    const instrument = ELF_STARTING_INSTRUMENTS[index];
    if (instrument === undefined)
        throw new RangeError(`invalid elven instrument roll ${index}`);
    return table([
        trobj(instrument, 0, O.TOOL_CLASS, 1, 1, 0),
    ]);
}

export const _uInitInventoryDataInternals = Object.freeze({ table, trobj });
