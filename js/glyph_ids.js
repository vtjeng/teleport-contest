// Source-shaped catalog for glyphs.c:parse_id().  NetHack builds the same
// cache before parsing SYMBOLS=G_* entries; keeping it derived from the
// generated monster, object, and symbol tables avoids a 9,000-line ID dump.

import * as MONSTERS from './monsters.js';
import {
    GOLD_PIECE,
    FIRST_OBJECT,
    LAND_MINE,
    NUM_OBJECTS,
    OBJECT_DESCRIPTIONS,
    POT_GAIN_ABILITY,
    POT_WATER,
    RIN_ADORNMENT,
    RIN_PROTECTION_FROM_SHAPE_CHAN,
    SCR_BLANK_PAPER,
    SCR_ENCHANT_ARMOR,
    SCR_MAIL,
    SCR_STINKING_CLOUD,
    SLIME_MOLD,
    SPE_BLANK_PAPER,
    SPE_DIG,
    WAN_LIGHT,
    WAN_LIGHTNING,
} from './objects.js';
import { SYMBOL_INDEX_BY_NAME } from './symbol_data.js';

const { NUMMONS } = MONSTERS;

const MONSTER_PREFIXES = Object.freeze([
    'male_',
    'female_',
    'pet_male_',
    'pet_female_',
]);
const DETECTED_AND_RIDDEN_PREFIXES = Object.freeze([
    'detected_male_',
    'detected_female_',
    'ridden_male_',
    'ridden_female_',
]);
const STATUE_PREFIXES = Object.freeze([
    'statue_of_male_',
    'statue_of_female_',
]);
const PILETOP_STATUE_PREFIXES = Object.freeze([
    'piletop_statue_of_male_',
    'piletop_statue_of_female_',
]);
const WALL_BRANCHES = Object.freeze([
    'main',
    'mines',
    'gehennom',
    'knox',
    'sokoban',
]);
const ZAP_TYPES = Object.freeze([
    'missile',
    'fire',
    'frost',
    'sleep',
    'death',
    'lightning',
    'poison gas',
    'acid',
]);
const SWALLOW_POSITIONS = Object.freeze([
    'top left',
    'top center',
    'top right',
    'middle left',
    'middle right',
    'bottom left',
    'bottom center',
    'bottom right',
]);
const EXPLOSION_TYPES = Object.freeze([
    'dark',
    'noxious',
    'muddy',
    'wet',
    'magical',
    'fiery',
    'frosty',
]);
const EXPLOSION_POSITIONS = Object.freeze([
    'tl',
    'tc',
    'tr',
    'ml',
    'mc',
    'mr',
    'bl',
    'bc',
    'br',
]);

// glyphs.c:fix_glyphname() lowercases ASCII and replaces every other byte
// except an ASCII digit with an underscore.
function fixGlyphName(name) {
    return String(name).replace(/[A-Z]|[^a-z0-9]/gu, (character) => (
        character >= 'A' && character <= 'Z'
            ? character.toLowerCase()
            : '_'
    ));
}

function glyphId(detail) {
    return `G_${fixGlyphName(detail)}`;
}

function sourceSymbolNamesByIndex() {
    const names = [];
    for (const [name, index] of Object.entries(SYMBOL_INDEX_BY_NAME)) {
        // Aliases are appended after canonical defsym.h names, so the first
        // name for an index is loadsyms[]'s spelling.
        names[index] ??= name.slice(2);
    }
    return names;
}

function monsterNames() {
    const names = new Array(NUMMONS);
    // monsdump[] is generated from the PM_* enum, not from the mutable
    // permonst names (some human lycanthropes share their animal's name).
    for (const [name, index] of Object.entries(MONSTERS)) {
        if (/^PM_/u.test(name) && Number.isInteger(index)
            && index >= 0 && index < NUMMONS) {
            names[index] = name.slice(3);
        }
    }
    if (names.some((name) => !name))
        throw new Error('missing source monster glyph name');
    return names;
}

function objectGlyphDetail(index) {
    // glyphs.c:parse_id() has no IDs for random-description placeholders
    // between these source constants.
    if ((index > SCR_STINKING_CLOUD && index < SCR_MAIL)
        || (index > WAN_LIGHTNING && index < GOLD_PIECE)) {
        return null;
    }

    let prefix = '';
    if (index >= WAN_LIGHT && index <= WAN_LIGHTNING) {
        prefix = 'wand of ';
    } else if (index >= SPE_DIG && index < SPE_BLANK_PAPER) {
        prefix = 'spellbook of ';
    } else if (index >= SCR_ENCHANT_ARMOR
               && index <= SCR_STINKING_CLOUD) {
        prefix = 'scroll of ';
    } else if (index >= POT_GAIN_ABILITY && index <= POT_WATER) {
        // Preserve upstream's literal "flask of n" quirk for POT_WATER.
        prefix = index === POT_WATER ? 'flask of n' : 'potion of ';
    } else if (index >= RIN_ADORNMENT
               && index <= RIN_PROTECTION_FROM_SHAPE_CHAN) {
        prefix = 'ring of ';
    } else if (index === LAND_MINE) {
        prefix = 'unset ';
    }

    let name;
    if (index === SCR_BLANK_PAPER) name = 'blank scroll';
    else if (index === SPE_BLANK_PAPER) name = 'blank spellbook';
    else if (index === SLIME_MOLD) name = 'slime mold';
    else {
        const description = OBJECT_DESCRIPTIONS[index];
        name = description?.oc_name ?? description?.oc_descr;
    }
    if (!name) throw new Error(`missing source object glyph name ${index}`);
    return `${prefix}${name}`;
}

function appendMonsterFamily(ids, prefix, monsters) {
    for (const monster of monsters) ids.push(glyphId(`${prefix}${monster}`));
}

function appendObjectFamily(ids, piletop = false) {
    for (let index = 0; index < NUM_OBJECTS; ++index) {
        const detail = objectGlyphDetail(index);
        if (detail === null) continue;
        if (!piletop) {
            ids.push(glyphId(detail));
        } else if (index === FIRST_OBJECT - 1) {
            // display.h omits generic venom from both pile-top object ranges;
            // parse_id() consequently emits an empty cache ID for this glyph.
            ids.push('');
        } else {
            const prefix = index === 0 || index >= FIRST_OBJECT
                ? 'piletop_' : '';
            ids.push(glyphId(`${prefix}${detail}`));
        }
    }
}

function buildSourceGlyphIds() {
    const ids = [];
    const monsters = monsterNames();
    const symbols = sourceSymbolNamesByIndex();

    // display.h:glyph_offsets and glyphs.c:parse_id() determine this order.
    appendMonsterFamily(ids, MONSTER_PREFIXES[0], monsters);
    appendMonsterFamily(ids, MONSTER_PREFIXES[1], monsters);
    appendMonsterFamily(ids, MONSTER_PREFIXES[2], monsters);
    appendMonsterFamily(ids, MONSTER_PREFIXES[3], monsters);
    ids.push('G_invisible');
    appendMonsterFamily(ids, DETECTED_AND_RIDDEN_PREFIXES[0], monsters);
    appendMonsterFamily(ids, DETECTED_AND_RIDDEN_PREFIXES[1], monsters);
    appendMonsterFamily(ids, 'body_', monsters);
    appendMonsterFamily(ids, DETECTED_AND_RIDDEN_PREFIXES[2], monsters);
    appendMonsterFamily(ids, DETECTED_AND_RIDDEN_PREFIXES[3], monsters);
    appendObjectFamily(ids);

    ids.push('G_stone_substrate');
    for (const branch of WALL_BRANCHES) {
        for (let index = 1; index <= 11; ++index)
            ids.push(glyphId(`${symbols[index]}_${branch}`));
    }
    for (let index = 12; index <= 32; ++index)
        ids.push(glyphId(symbols[index]));
    for (const alignment of ['unaligned', 'chaotic', 'neutral', 'lawful'])
        ids.push(glyphId(`${alignment}_altar`));
    ids.push('G_altar_other');
    for (let index = 34; index <= 73; ++index)
        ids.push(glyphId(symbols[index]));
    for (const zapType of ZAP_TYPES) {
        for (let index = 74; index <= 77; ++index)
            ids.push(glyphId(`${zapType} zap ${symbols[index]}`));
    }
    for (let index = 78; index <= 87; ++index)
        ids.push(glyphId(symbols[index]));
    for (const monster of monsters) {
        for (const position of SWALLOW_POSITIONS)
            ids.push(glyphId(`swallow ${monster} ${position}`));
    }
    for (const explosionType of EXPLOSION_TYPES) {
        for (const position of EXPLOSION_POSITIONS)
            ids.push(glyphId(`${explosionType} expl_${position}`));
    }
    for (let warning = 0; warning < 6; ++warning)
        ids.push(`G_warning${warning}`);
    appendMonsterFamily(ids, STATUE_PREFIXES[0], monsters);
    appendMonsterFamily(ids, STATUE_PREFIXES[1], monsters);
    appendObjectFamily(ids, true);
    appendMonsterFamily(ids, 'piletop_body_', monsters);
    appendMonsterFamily(ids, PILETOP_STATUE_PREFIXES[0], monsters);
    appendMonsterFamily(ids, PILETOP_STATUE_PREFIXES[1], monsters);
    ids.push('G_unexplored', 'G_nothing');
    return ids;
}

export const SOURCE_GLYPH_IDS = Object.freeze(buildSourceGlyphIds());

const SOURCE_GLYPH_NAME_BY_FOLDED_ID = new Map(
    SOURCE_GLYPH_IDS.map((name) => [name.toLowerCase(), name]),
);

/** glyphs.c:match_glyph() lookup after its case-sensitive G_ gate. */
export function sourceGlyphName(name) {
    return SOURCE_GLYPH_NAME_BY_FOLDED_ID.get(String(name).toLowerCase())
        ?? null;
}
