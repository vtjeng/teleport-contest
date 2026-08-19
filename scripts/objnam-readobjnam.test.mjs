// The wish parser: hacklib.c fuzzymatch() and strstri(), and objnam.c
// readobjnam() with its parse chain, wishymatch(), rnd_otyp_by_namedesc() and
// the four tables they read.
//
// Most of these draw no random number, write no output and change no game
// state, so no recorded session can check them; the values below are read from
// the C source and are the only proof the port is right.  The end-to-end
// evidence for the wishes readobjnam() does resolve is in
// scripts/run-wizard-wish.mjs, which replays them against fresh C recordings.

import assert from 'node:assert/strict';
import test from 'node:test';

import { fuzzymatch, mungspaces, strstri } from '../js/hacklib.js';
import {
    RANDOM_TIN,
    TIN_UNDEFINED,
    UnsupportedWishError,
    o_ranges,
    readobjnam,
    rnd_otyp_by_namedesc,
    readobjnam_init,
    readobjnam_parse_charges,
    readobjnam_postparse1,
    readobjnam_postparse2,
    readobjnam_postparse3,
    readobjnam_preparse,
    scanCount,
    spellings,
    wishymatch,
    wrp,
    wrpsym,
} from '../js/objnam_readobjnam.js';
import {
    ACID_VENOM,
    AGATE,
    AMULET_CLASS,
    AMULET_OF_ESP,
    AMULET_OF_GUARDING,
    AMULET_VERSUS_POISON,
    ARMOR_CLASS,
    ARROW,
    BAG_OF_HOLDING,
    BAG_OF_TRICKS,
    BEARTRAP,
    BLINDING_VENOM,
    BRASS_LANTERN,
    BROADSWORD,
    BULLWHIP,
    CHEST,
    CLOAK_OF_DISPLACEMENT,
    CLOAK_OF_MAGIC_RESISTANCE,
    COIN_CLASS,
    CORPSE,
    CREAM_PIE,
    DUNCE_CAP,
    DWARVISH_MATTOCK,
    EGG,
    ELVEN_DAGGER,
    ELVEN_LEATHER_HELM,
    ELVEN_MITHRIL_COAT,
    ENORMOUS_MEATBALL,
    EUCALYPTUS_LEAF,
    EXPENSIVE_CAMERA,
    FAKE_AMULET_OF_YENDOR,
    FEDORA,
    FIGURINE,
    FLINT,
    FOOD_CLASS,
    FOOD_RATION,
    FORTUNE_COOKIE,
    GAUNTLETS_OF_DEXTERITY,
    GAUNTLETS_OF_POWER,
    GEM_CLASS,
    GRAPPLING_HOOK,
    GRAY_DRAGON_SCALES,
    GRAY_DRAGON_SCALE_MAIL,
    HAWAIIAN_SHIRT,
    HEAVY_IRON_BALL,
    HELM_OF_TELEPATHY,
    HORN_OF_PLENTY,
    ICE_BOX,
    IRON_SHOES,
    JADE,
    JUMPING_BOOTS,
    KATANA,
    KELP_FROND,
    LAND_MINE,
    LARGE_BOX,
    LEATHER_ARMOR,
    LEATHER_GLOVES,
    LEMBAS_WAFER,
    LEVITATION_BOOTS,
    LOADSTONE,
    LONG_SWORD,
    LOW_BOOTS,
    LUCKSTONE,
    MAGIC_LAMP,
    MAGIC_MARKER,
    MEAT_RING,
    MUMMY_WRAPPING,
    OILSKIN_SACK,
    OIL_LAMP,
    PICK_AXE,
    PLATE_MAIL,
    POTION_CLASS,
    POT_INVISIBILITY,
    POT_SLEEPING,
    POT_WATER,
    RED_DRAGON_SCALE_MAIL,
    RING_CLASS,
    RING_MAIL,
    RIN_INCREASE_ACCURACY,
    RIN_PROTECTION_FROM_SHAPE_CHAN,
    ROCK,
    SACK,
    SCALE_MAIL,
    SCROLL_CLASS,
    SCR_CHARGING,
    SCR_MAGIC_MAPPING,
    SCR_MAIL,
    SHIELD_OF_REFLECTION,
    SHORT_SWORD,
    SILVER_SABER,
    SLIME_MOLD,
    SMALL_SHIELD,
    SPBOOK_CLASS,
    SPEED_BOOTS,
    SPE_DIG,
    SPE_FINGER_OF_DEATH,
    SPE_NOVEL,
    SPE_WIZARD_LOCK,
    STRANGE_OBJECT,
    TALLOW_CANDLE,
    TIN,
    TIN_OPENER,
    TOOLED_HORN,
    TOOL_CLASS,
    TOUCHSTONE,
    TOWEL,
    TRIPE_RATION,
    T_SHIRT,
    VENOM_CLASS,
    WAND_CLASS,
    WAN_DEATH,
    WAX_CANDLE,
    WEAPON_CLASS,
    YELLOW_DRAGON_SCALES,
    YELLOW_DRAGON_SCALE_MAIL,
} from '../js/objects.js';
import {
    CORPSTAT_FEMALE, CORPSTAT_MALE, CORPSTAT_RANDOM, NON_PM, SPE_LIM,
} from '../js/const.js';
import {
    ART_GRAYSWANDIR, ART_STING, ART_VORPAL_BLADE, init_artifacts,
} from '../js/artifacts.js';
import { name_to_monplus } from '../js/mondata.js';
import {
    PM_GIANT_MIMIC, PM_GRAY_DRAGON, PM_RED_DRAGON, PM_SMALL_MIMIC,
    PM_YELLOW_DRAGON,
    monst_globals_init, reset_mvitals,
} from '../js/monsters.js';
import { mksobj } from '../js/obj.js';
import { init_objects } from '../js/o_init.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { objects_globals_init } from '../js/objects.js';
import { roles } from '../js/roles.js';
import { timeout_globals_init } from '../js/timeout.js';
import {
    CASES as RANDOM_WISH_CASES, loadRandomWishRecipe,
} from './run-random-wish.mjs';
import {
    CASES as CONTAINER_CASES, loadWishedContainerRecipe,
} from './run-wished-container.mjs';

// hacklib.c fuzzymatch(): "match occurs only when the end of both strings has
// been reached", after every ignore_chars byte is skipped in both.
test('fuzzymatch skips the ignored characters in both strings', () => {
    // objnam.c calls it with " -" throughout, which is what makes "pickaxe",
    // "pick axe" and "pick-axe" one name (objnam.c:3368-3370 says so).
    assert.equal(fuzzymatch('pickaxe', 'pick-axe', ' -', true), true);
    assert.equal(fuzzymatch('PICK AXE', 'pick-axe', ' -', true), true);
    // caseblind false leaves 'P' and 'p' distinct.
    assert.equal(fuzzymatch('PICK AXE', 'pick-axe', ' -', false), false);
    // A string that runs out early does not match: "pick" ends while
    // "pick-axe" still has "axe".
    assert.equal(fuzzymatch('pick', 'pick-axe', ' -', true), false);
    // With no ignore characters the comparison is plain case-insensitive
    // equality, which is how the port spells C's strcmpi().
    assert.equal(fuzzymatch('pick axe', 'pickaxe', '', true), false);
    assert.equal(fuzzymatch('', '', ' -', true), true);
    // Trailing ignorable characters are skipped on the way to the end.
    assert.equal(fuzzymatch('lamp -- ', 'lamp', ' -', true), true);
});

// hacklib.c strstri(): case-insensitive substring search.  The port answers an
// offset where C answers a pointer, and -1 where C answers NULL.
test('strstri finds a substring case-blind', () => {
    assert.equal(strstri('boots of speed', ' of '), 5);
    assert.equal(strstri('Boots Of Speed', ' of '), 5);
    assert.equal(strstri('speed boots', ' of '), -1);
    // C's "special case: empty substring" answers the string itself.
    assert.equal(strstri('anything', ''), 0);
});

// objnam.c wishymatch() (3243-3338).  Each expectation names the branch it
// reaches, because several of them are the only route to an objects[] entry.
test('wishymatch accepts a canonical name and its spacing variants', () => {
    // objects.h:243 names PICK_AXE "pick-axe"; the fuzzymatch() at 3253 is
    // what lets a player type it without the hyphen.
    assert.equal(wishymatch('pick-axe', 'pick-axe', true), true);
    assert.equal(wishymatch('pick axe', 'pick-axe', true), true);
    // The player's capitalization must not matter: 3253 passes caseblind.
    assert.equal(wishymatch('Pick-Axe', 'pick-axe', true), true);
    assert.equal(wishymatch('lamp', 'oil lamp', true), false);
});

test('wishymatch inverts "foo of bar" against "bar foo"', () => {
    // objnam.c:3256-3272.  objects.h:836 names SPEED_BOOTS "speed boots", so
    // "boots of speed" reaches it only through this branch.
    assert.equal(wishymatch('boots of speed', 'speed boots', true), true);
    // The same input with retry_inverted off is what rnd_otyp_by_namedesc()
    // passes for a description, and it must not match.
    assert.equal(wishymatch('boots of speed', 'speed boots', false), false);
    // Both inversions compare caseblind.
    assert.equal(wishymatch('Boots of Speed', 'speed boots', true), true);
    // The inverse direction: the objects[] entry carries the " of ".
    assert.equal(wishymatch('opening bell', 'bell of opening', true), true);
    assert.equal(wishymatch('Opening Bell', 'bell of opening', true), true);
    // Neither side inverts when both already contain " of ".
    assert.equal(wishymatch('boots of speed', 'ring of speed', true), false);
});

test('wishymatch accepts the recorded spelling variants', () => {
    // objnam.c:3279-3288, the dwarvish/elven arms.  objects.h:660 names
    // ELVEN_MITHRIL_COAT "elven mithril coat" and objects.h:255 names
    // DWARVISH_MATTOCK "dwarvish mattock".
    assert.equal(wishymatch('elvish mithril coat', 'elven mithril coat', true),
                 true);
    assert.equal(wishymatch('Elvish Mithril Coat', 'elven mithril coat', true),
                 true);
    assert.equal(wishymatch('elfin mithril coat', 'elven mithril coat', true),
                 true);
    assert.equal(wishymatch('Elfin Mithril Coat', 'elven mithril coat', true),
                 true);
    assert.equal(wishymatch('dwarven mattock', 'dwarvish mattock', true), true);
    assert.equal(wishymatch('Dwarven Mattock', 'dwarvish mattock', true), true);
    // objnam.c:3289-3296, helmet -> helm and gloves -> gauntlets.
    assert.equal(wishymatch('helmet of brilliance', 'helm of brilliance', true),
                 true);
    assert.equal(wishymatch('gloves of dexterity', 'gauntlets of dexterity',
                            true), true);
    // Both of those recurse with retry_inverted still set, which is the only
    // way an inverted spelling of either reaches its objects[] name.
    assert.equal(wishymatch('brilliance helmet', 'helm of brilliance', true),
                 true);
    assert.equal(wishymatch('dexterity gloves', 'gauntlets of dexterity', true),
                 true);
    // The same two arms must not recurse on a name that carries only the
    // objects[] half of the pair: C requires both, and recursing with an
    // unchanged string would not terminate.
    assert.equal(wishymatch('dunce cap', 'helm of brilliance', true), false);
    assert.equal(wishymatch('dunce cap', 'gauntlets of power', true), false);
    // A capital is the one input where C does not terminate. Its guards at
    // 3287 and 3291 use case-insensitive strstri() and its substitution uses
    // case-sensitive strsubst(), so C recurses on an unchanged string until
    // the stack runs out; the recorded C program exits on SIGSEGV for both.
    // js/objnam_readobjnam.js strsubstFold() folds case so the substitution
    // lands, which is what makes these two answer at all.
    assert.equal(wishymatch('Helmet of brilliance', 'helm of brilliance', true),
                 true);
    assert.equal(wishymatch('Gloves of dexterity', 'gauntlets of dexterity',
                            true), true);
    // objnam.c:3297-3320, "detect <foo>" against "<foo> detection" both ways.
    assert.equal(wishymatch('monster detection', 'detect monsters', true),
                 true);
    assert.equal(wishymatch('Monster Detection', 'detect monsters', true),
                 true);
    assert.equal(wishymatch('detect monsters', 'monster detection', true),
                 true);
    assert.equal(wishymatch('Detect Monsters', 'monster detection', true),
                 true);
    // The "monster" -> "monsters" fix-up at 3310-3311 is what makes the first
    // of those work; without it the singular would be compared.
    assert.equal(wishymatch('food detection', 'detect food', true), true);
    // " detection" has to be present and has to end the string.  A name that
    // merely happens to be the length the end-of-string test measures is not
    // one: "monsterss" is nine characters, which is where a not-found offset
    // of -1 plus " detection"'s ten would land.
    assert.equal(wishymatch('monsterss', 'detect monsters', true), false);
    // objnam.c:3321-3330, "abilities" -> "ability".
    assert.equal(wishymatch('gain abilities', 'gain ability', true), true);
    assert.equal(wishymatch('Gain Abilities', 'gain ability', true), true);
    // rnd_otyp_by_namedesc() also offers the text after " of " on its own, so
    // this arm has to match a bare "abilities" against a bare "ability".
    assert.equal(wishymatch('abilities', 'ability', false), true);
    // objnam.c:3331-3336, the one metal whose spelling differs.
    assert.equal(wishymatch('aluminium', 'aluminum', true), true);
    assert.equal(wishymatch('aluminum', 'aluminum', true), true);
});

// objnam.c o_ranges[] (3346-3366), every row read off the C source in order.
// Order is load-bearing: readobjnam_postparse2() walks the table and stops at
// the first row whose name the wish spells, so "gray stone" ahead of "grey
// stone" and "gloves" ahead of "gauntlets" is what C's own comment about the
// grey-stone check being first is protecting.
test('o_ranges carries the nineteen wishable subranges', () => {
    assert.deepEqual(o_ranges, [
        ['bag', TOOL_CLASS, SACK, BAG_OF_TRICKS],
        ['lamp', TOOL_CLASS, OIL_LAMP, MAGIC_LAMP],
        ['candle', TOOL_CLASS, TALLOW_CANDLE, WAX_CANDLE],
        ['horn', TOOL_CLASS, TOOLED_HORN, HORN_OF_PLENTY],
        ['shield', ARMOR_CLASS, SMALL_SHIELD, SHIELD_OF_REFLECTION],
        ['hat', ARMOR_CLASS, FEDORA, DUNCE_CAP],
        ['helm', ARMOR_CLASS, ELVEN_LEATHER_HELM, HELM_OF_TELEPATHY],
        ['gloves', ARMOR_CLASS, LEATHER_GLOVES, GAUNTLETS_OF_DEXTERITY],
        ['gauntlets', ARMOR_CLASS, LEATHER_GLOVES, GAUNTLETS_OF_DEXTERITY],
        ['boots', ARMOR_CLASS, LOW_BOOTS, LEVITATION_BOOTS],
        ['shoes', ARMOR_CLASS, LOW_BOOTS, IRON_SHOES],
        ['cloak', ARMOR_CLASS, MUMMY_WRAPPING, CLOAK_OF_DISPLACEMENT],
        ['shirt', ARMOR_CLASS, HAWAIIAN_SHIRT, T_SHIRT],
        ['dragon scales', ARMOR_CLASS, GRAY_DRAGON_SCALES,
         YELLOW_DRAGON_SCALES],
        ['dragon scale mail', ARMOR_CLASS, GRAY_DRAGON_SCALE_MAIL,
         YELLOW_DRAGON_SCALE_MAIL],
        ['sword', WEAPON_CLASS, SHORT_SWORD, KATANA],
        ['venom', VENOM_CLASS, BLINDING_VENOM, ACID_VENOM],
        ['gray stone', GEM_CLASS, LUCKSTONE, FLINT],
        ['grey stone', GEM_CLASS, LUCKSTONE, FLINT],
    ].map(([name, oclass, f_o_range, l_o_range]) => ({
        name, oclass, f_o_range, l_o_range,
    })));
});

// objnam.c spellings[] (3372-3429), every row read off the C source in order,
// without C's terminating null row.  readobjnam_postparse1() walks the whole
// table with wishymatch() and takes the first hit, so a missing row loses a
// spelling and a reordered one can answer with the wrong type: "grappling
// iron", "grapnel" and "grapple" all sit behind the shorter "hook".
test('spellings carries the forty-six alternate spellings', () => {
    assert.deepEqual(spellings, [
        ['pickax', PICK_AXE],
        ['whip', BULLWHIP],
        ['saber', SILVER_SABER],
        ['silver sabre', SILVER_SABER],
        ['smooth shield', SHIELD_OF_REFLECTION],
        ['grey dragon scale mail', GRAY_DRAGON_SCALE_MAIL],
        ['grey dragon scales', GRAY_DRAGON_SCALES],
        ['iron ball', HEAVY_IRON_BALL],
        ['lantern', BRASS_LANTERN],
        ['mattock', DWARVISH_MATTOCK],
        ['amulet of poison resistance', AMULET_VERSUS_POISON],
        ['amulet of protection', AMULET_OF_GUARDING],
        ['amulet of telepathy', AMULET_OF_ESP],
        ['helm of esp', HELM_OF_TELEPATHY],
        ['gauntlets of ogre power', GAUNTLETS_OF_POWER],
        ['gauntlets of giant strength', GAUNTLETS_OF_POWER],
        ['elven chain mail', ELVEN_MITHRIL_COAT],
        ['silver shield', SHIELD_OF_REFLECTION],
        ['potion of sleep', POT_SLEEPING],
        ['scroll of recharging', SCR_CHARGING],
        ['recharging', SCR_CHARGING],
        ['stone', ROCK],
        ['camera', EXPENSIVE_CAMERA],
        ['tee shirt', T_SHIRT],
        ['can', TIN],
        ['can opener', TIN_OPENER],
        ['kelp', KELP_FROND],
        ['eucalyptus', EUCALYPTUS_LEAF],
        ['lembas', LEMBAS_WAFER],
        ['tripe', TRIPE_RATION],
        ['cookie', FORTUNE_COOKIE],
        ['pie', CREAM_PIE],
        ['huge meatball', ENORMOUS_MEATBALL],
        ['huge chunk of meat', ENORMOUS_MEATBALL],
        ['marker', MAGIC_MARKER],
        ['hook', GRAPPLING_HOOK],
        ['grappling iron', GRAPPLING_HOOK],
        ['grapnel', GRAPPLING_HOOK],
        ['grapple', GRAPPLING_HOOK],
        ['protection from shape shifters', RIN_PROTECTION_FROM_SHAPE_CHAN],
        ['accuracy', RIN_INCREASE_ACCURACY],
        ['box', LARGE_BOX],
        ['luck stone', LUCKSTONE],
        ['load stone', LOADSTONE],
        ['touch stone', TOUCHSTONE],
        ['flintstone', FLINT],
    ].map(([sp, ob]) => ({ sp, ob })));
});

// objnam.c wrp[] and wrpsym[] (2517-2528).  Every row of both tables is read
// off the C source here, in order.  Order is load-bearing twice over: the
// class-word loop in readobjnam_postparse1() walks the two arrays with one
// index, and readobjnam()'s `any:` arm indexes wrpsym[] with rn2(13), so a row
// in the wrong place turns a wish into the wrong object rather than into a
// failed parse.
test('wrp and wrpsym pair the class words with their class symbols', () => {
    assert.deepEqual(wrp, [
        'wand', 'ring', 'potion', 'scroll', 'gem',
        'amulet', 'spellbook', 'spell book',
        /* for non-specific wishes */
        'weapon', 'armor', 'tool', 'food', 'comestible',
    ]);
    assert.deepEqual(wrpsym, [
        WAND_CLASS, RING_CLASS, POTION_CLASS,
        SCROLL_CLASS, GEM_CLASS, AMULET_CLASS,
        SPBOOK_CLASS, SPBOOK_CLASS, WEAPON_CLASS,
        ARMOR_CLASS, TOOL_CLASS, FOOD_CLASS,
        FOOD_CLASS,
    ]);
    // C's `rn2((int) sizeof wrpsym)` is the byte count of a char array, so the
    // draw's bound is the row count and the two tables have to agree on it.
    assert.equal(wrpsym.length, 13);
    assert.equal(wrp.length, wrpsym.length);
});

// objnam.c readobjnam_init() (3933-3961).
test('readobjnam_init starts every field at its C default', () => {
    const d = readobjnam_init('magic lamp', { context: { current_fruit: 7 } });
    assert.equal(d.bp, 'magic lamp');
    assert.equal(d.consumed, '');
    assert.equal(d.otmp, null);
    assert.equal(d.tvariety, RANDOM_TIN);
    assert.equal(d.mgend, -1);
    assert.equal(d.mntmp, NON_PM);
    assert.equal(d.contents, TIN_UNDEFINED);
    assert.equal(d.zombify, false);
    assert.equal(d.name, null);
    // d->ftype = svc.context.current_fruit, the only field whose default is
    // read out of the game rather than written as a literal.
    assert.equal(d.ftype, 7);
    for (const field of [
        'cnt', 'spe', 'spesgn', 'typ', 'very', 'rechrg', 'blessed', 'uncursed',
        'iscursed', 'ispoisoned', 'isgreased', 'eroded', 'eroded2',
        'erodeproof', 'halfeaten', 'islit', 'unlabeled', 'ishistoric',
        'isdiluted', 'trapped', 'locked', 'unlocked', 'broken', 'open',
        'closed', 'doorless', 'looted', 'real', 'fake', 'oclass', 'wetness',
        'gsize',
    ])
        assert.equal(d[field], 0, field);
    for (const field of ['actualn', 'dn', 'un'])
        assert.equal(d[field], null, field);
    assert.equal(d.globbuf, '');
    assert.equal(d.fruitbuf, '');
});

// C's `atoi(p)` then `while (digit(*p)) p++`, which readobjnam_preparse() and
// readobjnam_parse_charges() both spell out.
test('scanCount reads atoi but advances only over digits', () => {
    assert.deepEqual(scanCount('12x', 0), { value: 12, end: 2 });
    // atoi() accepts the sign; the digit loop does not advance over it, so the
    // caller is left looking at the '-'.
    assert.deepEqual(scanCount('-2)', 0), { value: -2, end: 0 });
    // Likewise for the leading space atoi() skips.
    assert.deepEqual(scanCount(' 5)', 0), { value: 5, end: 0 });
    // atoi() of text with no digits is 0.
    assert.deepEqual(scanCount(')', 0), { value: 0, end: 0 });
});

// objnam.c readobjnam_parse_charges() (4178-4237).
test('readobjnam_parse_charges takes a parenthesised charge count', () => {
    const d = readobjnam_init('wand of digging (5)', {});
    readobjnam_parse_charges(d);
    // The space before '(' goes with the charges (the idx = -1 at 4185-4186).
    assert.equal(d.bp, 'wand of digging');
    assert.equal(d.spe, 5);
    // Reaching the ')' is what sets spesgn (4207).
    assert.equal(d.spesgn, 1);
    assert.equal(d.rechrg, 0);
});

test('readobjnam_parse_charges splits "(n:m)" into rechrg and spe', () => {
    const d = readobjnam_init('wand of wishing (2:3)', {});
    readobjnam_parse_charges(d);
    assert.equal(d.bp, 'wand of wishing');
    // 4194-4199: the first number becomes rechrg and the second becomes spe.
    assert.equal(d.rechrg, 2);
    assert.equal(d.spe, 3);
    assert.equal(d.spesgn, 1);
});

test('readobjnam_parse_charges recognizes "(lit)"', () => {
    const d = readobjnam_init('lamp (lit)', {});
    readobjnam_parse_charges(d);
    assert.equal(d.bp, 'lamp');
    assert.equal(d.islit, 1);
    // The lit arm sets no charge, so spesgn stays at its init value.
    assert.equal(d.spesgn, 0);
    assert.equal(d.spe, 0);
});

test('readobjnam_parse_charges keeps text after the closing paren', () => {
    const d = readobjnam_init('scroll (3) named foo', {});
    readobjnam_parse_charges(d);
    // 4213-4221 splices what follows ')' back onto the truncated buffer.
    assert.equal(d.bp, 'scroll named foo');
    assert.equal(d.spe, 3);
});

test('readobjnam_parse_charges drops the tail on mismatched parens', () => {
    const d = readobjnam_init('wand of death (-2)', {});
    readobjnam_parse_charges(d);
    // atoi() reads -2 but the digit loop leaves p on the '-', so the ')' test
    // at 4201 fails: the charges are discarded and the tail is not kept.
    assert.equal(d.bp, 'wand of death');
    assert.equal(d.spe, 0);
    assert.equal(d.rechrg, 0);
    assert.equal(d.spesgn, 0);
});

test('readobjnam_parse_charges clamps spe and rechrg', () => {
    const capped = readobjnam_init('wand (200)', {});
    readobjnam_parse_charges(capped);
    // 4232-4233 caps spe at SPE_LIM.
    assert.equal(capped.spe, SPE_LIM);
    const recharged = readobjnam_init('wand (9:1)', {});
    readobjnam_parse_charges(recharged);
    // 4234-4235 caps rechrg at 7, the recharge limit.
    assert.equal(recharged.rechrg, 7);
    assert.equal(recharged.spe, 1);
});

test('readobjnam_parse_charges makes a negative charge a negative sign', () => {
    // readobjnam_preparse() is what leaves a negative spe behind, from a "-3"
    // prefix; 4228-4231 then turns it into spesgn = -1 with spe made positive.
    const d = readobjnam_init('long sword', {});
    d.spe = -3;
    readobjnam_parse_charges(d);
    assert.equal(d.spe, 3);
    assert.equal(d.spesgn, -1);
    assert.equal(d.bp, 'long sword');
});

test('readobjnam_parse_charges cuts at the paren, not before it', () => {
    // 4184-4187 drops the character before '(' only when it is a space.
    const d = readobjnam_init('wand(5)', {});
    readobjnam_parse_charges(d);
    assert.equal(d.bp, 'wand');
    assert.equal(d.spe, 5);
    // A line that is nothing but a charge count leaves an empty name behind.
    const bare = readobjnam_init('(5)', {});
    readobjnam_parse_charges(bare);
    assert.equal(bare.bp, '');
    assert.equal(bare.spe, 5);
});

test('readobjnam_parse_charges leaves a one-character name alone', () => {
    // 4180's `strlen(d->bp) > 1` guard: a bare "(" is too short to search.
    const d = readobjnam_init('(', {});
    readobjnam_parse_charges(d);
    assert.equal(d.bp, '(');
    assert.equal(d.spesgn, 0);
});

// What a wish needs on top of wishState() before it can build a figurine or a
// statue: mkobj.c mksobj() picks the monster with makemon.c rndmonnum(), which
// reads dungeon.c level_difficulty() and svm.mvitals.  Depth 1 of a
// twenty-level dungeon is where a wish is made in every recorded case.
const DUNGEON_FIXTURE = Object.freeze({
    astral_level: { dnum: 0, dlevel: 0 },
    branches: [],
    dungeons: [{
        depth_start: 1,
        dunlev_ureached: 1,
        entry_lev: 1,
        flags: { align: 0, hellish: false },
        num_dunlevs: 20,
    }],
    level: { flags: { temperature: 0 } },
    quest_dnum: 1,
    rogue_level: { dnum: 0, dlevel: 0 },
    sanctum_level: { dnum: 0, dlevel: 0 },
    specialLevels: [],
});

// The shuffle choice init_objects() runs under here.  o_init.c shuffle() picks
// its swap partner as `i = j + random(o_high - j + 1)`, so answering 0 would
// swap every entry with itself and leave objects[] holding the descriptions
// objects.h wrote -- against which no assertion could tell a shuffled lookup
// from a static-table read.  Answering 1 wherever the bound allows swaps each
// entry with the next one and the last with itself, which rotates every
// shuffled range one place left: the entry at index j ends up with the
// description objects.h gave j + 1, and the top of each range ends up with the
// bottom's.
const SHIFT_DESCRIPTIONS = (bound) => (bound > 1 ? 1 : 0);

// A wizard-mode game with a shuffled objects[] and an initialized monster
// catalog: readobjnam() reads OBJ_DESCR(), which o_init.c shuffles, and calls
// name_to_monplus(), which needs monst_globals_init().
function wishState() {
    const wizard = roles.find((role) => role.filecode === 'Wiz');
    const state = {
        // Object and monster id 1 is reserved; startup begins from 2.
        context: { ident: 2, current_fruit: 1 },
        flags: { implicit_uncursed: true, initalign: 0, invlet_constant: true },
        // Two fruits, neither named after an objects[] entry.  "slime mold" is
        // SLIME_MOLD's own oc_name (objects.h:1094), so a fruit called that is
        // caught by rnd_otyp_by_namedesc() and the named-fruit block at
        // objnam.c:4805-4870 never sees it.  The second name is already
        // plural, which objnam.c:4857-4860's comment gives as the only way its
        // singular arm can be reached, and its fid differs from
        // svc.context.current_fruit so a test can tell d.ftype from the
        // default readobjnam_init() copied.
        gf: {
            ffruit: {
                fid: 1,
                fname: 'kiwi',
                nextf: { fid: 2, fname: 'papayas', nextf: null },
            },
        },
        iflags: {},
        program_state: { gameover: false, in_moveloop: true },
        moves: 1,
        // objnam.c:5363 raises u.uconduct.wisharti for a named artifact.
        u: { uprops: [], ulevel: 1, uluck: 0, uconduct: { wisharti: 0 } },
        urole: { ...wizard },
        wizard: true,
    };
    objects_globals_init(state);
    init_objects(state, SHIFT_DESCRIPTIONS);
    monst_globals_init(state);
    init_artifacts(state);
    return state;
}

// Records every draw the parse chain makes, so a test can assert both the
// object and the calls that produced it.  Each stub answers its lowest result,
// which picks the first candidate rnd_otyp_by_namedesc() collected.
function recordingRandom(draws) {
    return {
        rn2: (x) => { draws.push(`rn2(${x})`); return 0; },
        rnd: (x) => { draws.push(`rnd(${x})`); return 1; },
        rn1: (x, y) => { draws.push(`rn1(${x},${y})`); return y; },
        rne: (x) => { draws.push(`rne(${x})`); return 1; },
        rnz: (x) => { draws.push(`rnz(${x})`); return x; },
    };
}

// recordingRandom() answers every rn2() with 0, which sends mkobj.c
// blessorcurse() down its curse() branch, so no object it builds is ever
// blessed.  blessorcurse() reads two rn2() in a row -- `if (!rn2(chance))` to
// act at all, then `if (!rn2(2))` to choose between curse() and bless() -- and
// for a magic lamp chance is 2, so both are rn2(2).  This stub answers the
// first rn2(2) with 0 to enter and every later one with 1 to bless.  It is what
// gives the `uncursed` arm's `blessed = false` something to undo.  A fresh stub
// is built per wish() call, so the count restarts with each wish.
function blessingRandom(draws) {
    const base = recordingRandom(draws);
    let seenPair = 0;
    return {
        ...base,
        rn2: (x) => {
            draws.push(`rn2(${x})`);
            if (x !== 2) return 0;
            return seenPair++ === 0 ? 0 : 1;
        },
    };
}

// The sentinel readobjnam() answers for "nothing"; C compares its address, so
// any object identity will do.
const NO_WISH = Object.freeze({});

function wish(state, text, makeRandom = recordingRandom) {
    const draws = [];
    const random = makeRandom(draws);
    try {
        return { obj: readobjnam(text, NO_WISH, { state, random }), draws };
    } catch (error) {
        if (error instanceof UnsupportedWishError)
            return { refusal: error.reason, draws };
        throw error;
    }
}

// The chain readobjnam() drives, stopped at readobjnam_postparse3() so a test
// can read the goto code that function answers and the fields it wrote.
// readobjnam() keeps neither: it turns the code into a jump and discards the
// parse data when it returns.  The order below is readobjnam()'s own --
// mungspaces() and the fruitbuf copy at objnam.c:4919-4926, the count default
// at 4931-4932, readobjnam_parse_charges(), then postparse1, postparse2 and
// postparse3.  What is deliberately left out is the loop that feeds a 6 back
// into postparse2, because the 6 itself is what one test below measures.
function parseToPostparse3(state, text) {
    const draws = [];
    const env = { state, random: recordingRandom(draws) };
    const d = readobjnam_init(text, state);
    d.bp = mungspaces(text);
    d.fruitbuf = d.bp;
    assert.equal(readobjnam_preparse(d, state), 0, text);
    if (!d.cnt) d.cnt = 1;
    readobjnam_parse_charges(d);
    let action = readobjnam_postparse1(d, env);
    if (action === 0) action = readobjnam_postparse2(d, env);
    // Every input below reaches postparse3; a chain that stopped earlier would
    // make the assertions after this call measure nothing.
    assert.ok(action === 0 || action === 1, `${text} reached postparse3`);
    return { action: readobjnam_postparse3(d, env), d, draws };
}

// The six fields objnam.c:4852-4866 writes when a fruit name matches, gathered
// so one assertion can show that the other five stayed at readobjnam_init()'s
// zero while the one under test moved.
function fruitFacts(d) {
    const { blessed, cnt, ftype, halfeaten, iscursed, uncursed } = d;
    return { blessed, cnt, ftype, halfeaten, iscursed, uncursed };
}

// mondata.c name_to_monplus() runs on every wish longer than two characters
// (objnam.c:4404-4407), and a false monster match silently truncates the name
// before the object lookup.  These four pin what the parse chain depends on.
test('name_to_monplus finds no monster in three ordinary wish names', () => {
    const state = wishState();
    for (const name of ['magic lamp', 'speed boots', 'amulet of life saving']) {
        const found = name_to_monplus(name, { state });
        assert.equal(found.mnum, NON_PM, name);
    }
    // The one recorded wish name that does hold a monster: monst.c names
    // PM_GRAY_DRAGON "gray dragon", leaving " scale mail" for the object.
    const dragon = name_to_monplus('gray dragon scale mail', { state });
    assert.equal(dragon.mnum, PM_GRAY_DRAGON);
    assert.equal(dragon.remainder, ' scale mail');
});

test('readobjnam resolves an exact objects[] name', () => {
    const state = wishState();
    const { obj, draws } = wish(state, 'magic lamp');
    assert.equal(obj.otyp, MAGIC_LAMP);
    assert.equal(obj.oclass, TOOL_CLASS);
    assert.equal(obj.quan, 1);
    // objects.h:931 gives MAGIC_LAMP oc_prob 15, and
    // readobjnam_postparse3() adds xtra_prob 1 to it: rn2(16) selects the one
    // candidate and is spent even though the loop after it never runs.  The
    // three draws after it are mksobj()'s: next_ident() and blessorcurse().
    assert.deepEqual(draws, ['rn2(16)', 'rnd(2)', 'rn2(2)', 'rn2(2)']);
});

test('readobjnam resolves an inverted "of" spelling', () => {
    const state = wishState();
    const { obj, draws } = wish(state, 'boots of speed');
    assert.equal(obj.otyp, SPEED_BOOTS);
    // objects.h:836 gives SPEED_BOOTS oc_prob 12, so the match draws rn2(13).
    assert.equal(draws[0], 'rn2(13)');
});

test('readobjnam resolves an alternate spelling without a lookup', () => {
    const state = wishState();
    const { obj, draws } = wish(state, 'lantern');
    assert.equal(obj.otyp, BRASS_LANTERN);
    // spellings[] returns 2 from readobjnam_postparse1(), which skips
    // readobjnam_postparse3() entirely, so the first draw is mksobj()'s
    // next_ident() rather than a lookup.
    assert.equal(draws[0], 'rnd(2)');
});

test('the iron ball spelling reaches its type without a lookup draw', () => {
    const state = wishState();
    const { obj, draws } = wish(state, 'iron ball');
    assert.equal(obj.otyp, HEAVY_IRON_BALL);
    // spellings[] returns straight to typfnd:, so the first draw belongs to
    // mksobj()'s next_ident() rather than rnd_otyp_by_namedesc().
    assert.equal(draws[0], 'rnd(2)');
});

test('readobjnam picks at random inside an o_ranges[] subrange', () => {
    const state = wishState();
    const { obj, draws } = wish(state, 'lamp');
    // objects.h:929,931 give OIL_LAMP and MAGIC_LAMP the same description,
    // "lamp", but readobjnam_postparse2()'s o_ranges[] row catches the bare
    // word first and calls rnd_class(OIL_LAMP, MAGIC_LAMP).  Their oc_prob
    // values, 45 and 15, sum to the rnd(60) below, and the lowest result picks
    // the first of the two.
    assert.equal(obj.otyp, OIL_LAMP);
    assert.equal(draws[0], 'rnd(60)');
});

test('readobjnam answers the caller sentinel for a declined wish', () => {
    const state = wishState();
    for (const text of ['nothing', 'nil', 'none', 'Nothing']) {
        const { obj, draws } = wish(state, text);
        assert.equal(obj, NO_WISH, text);
        assert.deepEqual(draws, [], text);
    }
});

// Every refusal below has to come before the draw its branch would make;
// otherwise a wish outside the port's boundary moves the random-number stream
// and then stops, which no screen would show.
test('readobjnam refuses a wish outside its boundary without drawing', () => {
    const state = wishState();
    for (const text of [
        // readobjnam_preparse() consumes a qualifier the typfnd: tail cannot
        // apply.  A count is not here: it is refused after the lookup instead,
        // which the stack test below covers.
        'rustproof long sword', 'wet towel', 'partly eaten food ration',
        // One string per remaining UNSUPPORTED_WISH_FIELDS entry with a
        // visible effect, because a field dropped from that object leaves the
        // rest of the suite green.  Each names the objnam.c block that would
        // finish the wish: isgreased at 5335, ispoisoned at 5307-5312,
        // unlabeled at 5289-5292, islit at 5086-5091, isdiluted at 5300-5303,
        // eroded at 5273-5283 and rechrg at 5155-5166.
        'greased long sword', 'poisoned dagger', 'unlabeled scroll of mail',
        'lit brass lantern', 'diluted potion of see invisible',
        'rusty long sword', 'wand of death (3:5)',
        // A monster name outside the dragon range, which the typfnd: tail
        // would turn into a corpse.
        'newt corpse',
        // Types whose fine tuning is unported.
        'glob of gray ooze', 'tin of newt meat', 'gold piece',
        // A unique object, which mksobj() would make an artifact.
        'Amulet of Yendor',
        // And a name that matches nothing, which C answers by printing
        // "Nothing fitting that description exists in the game." and asking
        // again.
        'florble',
    ]) {
        const { refusal, draws } = wish(state, text);
        assert.ok(refusal, `${text} is refused`);
        assert.deepEqual(draws, [], `${text} draws nothing`);
    }
});

// objnam.c:5094-5120, 5191-5253 and 5255-5268: the enchantment sign, the
// dragon-scale rewrite and the blessed/cursed arms of the typfnd: tail.  Every
// wish below runs in wizard mode, which is the only mode readobjnam() serves
// here, so the `Luck` operand of each BUC test is short-circuited away.
test('readobjnam applies a blessed word and a +N enchantment', () => {
    const state = wishState();
    const { obj, draws } = wish(state, 'blessed +3 gray dragon scale mail');
    // 5246-5251 rewrites SCALE_MAIL to GRAY_DRAGON_SCALE_MAIL plus the
    // dragon's offset from PM_GRAY_DRAGON; objects.h:493-495 states that the
    // two orderings match, which is what makes the arithmetic legal.
    assert.equal(obj.otyp, GRAY_DRAGON_SCALE_MAIL);
    // 5097-5098 leaves a wizard's requested enchantment alone and 5188
    // assigns it over the rne(3) mkobj.c:1096 rolled.
    assert.equal(obj.spe, 3);
    // 5264-5265's `(Luck >= 0 || wizard)` and `(Luck < 0 && !wizard)`.
    assert.equal(obj.blessed, true);
    assert.equal(obj.cursed, false);
    // DRGN_ARMR (objects.h:497-499) weighs every dragon suit 40, against the
    // 250 of the "scale mail" row at 583-585 that mksobj() built from; 5395's
    // weight() call is what replaces the stale value.
    assert.equal(obj.owt, 40);
    // objects.h:584 gives SCALE_MAIL oc_prob 66, so the lookup draws rn2(67).
    // The rest are mksobj()'s: next_ident(), then mkobj.c:1085-1097's
    // ARMOR_CLASS arm, whose first rn2(10) fails, whose second succeeds, and
    // which then rolls a blessing and an enchantment the wish overrides.
    assert.deepEqual(draws, ['rn2(67)', 'rnd(2)', 'rn2(10)', 'rn2(10)',
                             'rn2(2)', 'rne(3)']);
});

test('readobjnam converts scale mail for each named dragon', () => {
    const state = wishState();
    // Both ends of 5248's range, which is tested with `>=` at one end and
    // `<=` at the other, plus one interior dragon.  monsters.js and objects.js
    // put PM_GRAY_DRAGON at 143 and GRAY_DRAGON_SCALE_MAIL at 101, so each
    // expected type is 101 + (pm - 143).
    assert.equal(wish(state, 'gray dragon scale mail').obj.otyp,
                 GRAY_DRAGON_SCALE_MAIL);
    assert.equal(PM_RED_DRAGON - PM_GRAY_DRAGON,
                 RED_DRAGON_SCALE_MAIL - GRAY_DRAGON_SCALE_MAIL);
    assert.equal(wish(state, 'red dragon scale mail').obj.otyp,
                 RED_DRAGON_SCALE_MAIL);
    assert.equal(PM_YELLOW_DRAGON - PM_GRAY_DRAGON,
                 YELLOW_DRAGON_SCALE_MAIL - GRAY_DRAGON_SCALE_MAIL);
    assert.equal(wish(state, 'yellow dragon scale mail').obj.otyp,
                 YELLOW_DRAGON_SCALE_MAIL);
    // 5246's `case SCALE_MAIL` is the only arm the dragons reach, so a dragon
    // in front of any other armor name leaves the type alone.
    assert.equal(wish(state, 'gray dragon ring mail').obj.otyp, RING_MAIL);
    // And a scale mail with no dragon in front of it stays plain.
    assert.equal(wish(state, 'scale mail').obj.otyp, SCALE_MAIL);
});

test('readobjnam negates a -N enchantment and curses the object', () => {
    const state = wishState();
    const { obj, draws } = wish(state, '-2 long sword');
    // objects.h:271 gives LONG_SWORD oc_prob 50, so the lookup draws rn2(51).
    assert.equal(draws[0], 'rn2(51)');
    // 5119-5120's `if (d.spesgn == -1) d.spe = -d.spe`, over the rne(3)
    // mkobj.c:879 rolled.
    assert.equal(obj.spe, -2);
    // 5266-5267: a negative enchantment with no BUC word curses the object.
    assert.equal(obj.cursed, true);
    assert.equal(obj.blessed, false);
    // A positive one does not, and leaves mkobj.c:880's rn2(2) blessing --
    // false, since the stub answers 0 -- in place.
    const plus = wish(state, '+3 long sword').obj;
    assert.equal(plus.spe, 3);
    assert.equal(plus.cursed, false);
    assert.equal(plus.blessed, false);
    // 5266's test is `< 0`, not `<= 0`: an unenchanted wish leaves d.spesgn at
    // 0 and reaches none of the four arms.  The long sword is the object that
    // shows it, because mkobj.c:878-880 leaves this one uncursed where
    // mkobj.c:1008's blessorcurse() curses a magic lamp on its own.
    const bare = wish(state, 'long sword').obj;
    assert.equal(bare.cursed, false);
    assert.equal(bare.blessed, false);
    // 5094-5096's `if (d.spesgn == 0) d.spe = d.otmp->spe` retains what
    // mksobj() rolled, which is the rne(3) at mkobj.c:878-880 -- 1 under the
    // stub, since recordingRandom() answers rnd()/rne() with 1.  Without that
    // branch d.spe would stay 0 and the sword would come back unenchanted, so
    // this is the assertion that separates the two.
    assert.equal(bare.spe, 1);
});

test('readobjnam applies the cursed and uncursed words', () => {
    const state = wishState();
    // mkobj.c:1008's blessorcurse(otmp, 2) curses a magic lamp outright here,
    // because the stub answers 0 to both of its rn2() calls.  That is what
    // makes each arm below discriminating: "uncursed" has to undo it and
    // "blessed" has to reverse it.
    const plain = wish(state, 'magic lamp').obj;
    assert.equal(plain.cursed, true);
    assert.equal(wish(state, 'cursed magic lamp').obj.cursed, true);
    const uncursed = wish(state, 'uncursed magic lamp').obj;
    assert.equal(uncursed.cursed, false);
    assert.equal(uncursed.blessed, false);
    const blessed = wish(state, 'blessed magic lamp').obj;
    assert.equal(blessed.cursed, false);
    assert.equal(blessed.blessed, true);
    // 3997-4004: the last BUC word wins, because each arm clears the other two.
    const last = wish(state, 'cursed uncursed blessed magic lamp').obj;
    assert.equal(last.blessed, true);
    assert.equal(last.cursed, false);
});

// The uncursed arm sets both fields, and the test above can only see the
// cursed one, because every object recordingRandom() builds starts cursed.
// Under blessingRandom() blessorcurse() blesses instead, so 5261's
// `otmp->blessed = 0` is the line that has to run.
test('an uncursed wish clears a blessing the object was created with', () => {
    const state = wishState();
    const plain = wish(state, 'magic lamp', blessingRandom).obj;
    assert.equal(plain.blessed, true);
    assert.equal(plain.cursed, false);
    const uncursed = wish(state, 'uncursed magic lamp', blessingRandom).obj;
    assert.equal(uncursed.blessed, false);
    assert.equal(uncursed.cursed, false);
});

test('readobjnam blesses holy water and curses unholy water', () => {
    const state = wishState();
    // objnam.c:4489-4500 sets d.blessed or d.iscursed rather than a type of
    // its own, so the typfnd: tail is the only thing that tells the two
    // apart.  Neither reaches mkobj.c's blessorcurse(), which skips POT_WATER.
    const holy = wish(state, 'holy water').obj;
    assert.equal(holy.otyp, POT_WATER);
    assert.equal(holy.blessed, true);
    assert.equal(holy.cursed, false);
    const unholy = wish(state, 'unholy water').obj;
    assert.equal(unholy.otyp, POT_WATER);
    assert.equal(unholy.cursed, true);
    assert.equal(unholy.blessed, false);
});

test('readobjnam refuses a monster name outside the dragon range', () => {
    const state = wishState();
    // The typfnd: tail has 5246's `case SCALE_MAIL` and none of the other
    // arms at 5206-5245, so every non-dragon monster name is still refused --
    // and refused before readobjnam_postparse3() can draw for the object.
    const newt = wish(state, 'newt corpse');
    assert.equal(newt.refusal, 'a wish naming a monster type');
    assert.deepEqual(newt.draws, []);
    // A dragon reaches the lookup, so a dragon-named type the tail cannot
    // finish is refused after the draw C makes in the same place.
    const corpse = wish(state, 'gray dragon corpse');
    assert.equal(corpse.refusal,
                 'a wish for a corpse, statue, figurine, egg or tin');
    assert.deepEqual(corpse.draws, ['rn2(1)']);
});

test('readobjnam makes the named mimic corpse used by pet quickmimic', () => {
    const state = wishState();
    Object.assign(state, DUNGEON_FIXTURE);
    state.u.uz = { dnum: 0, dlevel: 1 };
    reset_mvitals(state);
    timeout_globals_init(state);
    const draws = [];
    const corpse = readobjnam('small mimic corpse', NO_WISH,
        objectGenerationEnv({ state, random: recordingRandom(draws) }));

    // objnam.c:5147-5165 uses rn2(2) for a species without a fixed gender;
    // recordingRandom() answers 0, selecting CORPSTAT_FEMALE.  Lines
    // 5216-5224 then replace the random corpse mksobj() made and restart its
    // corpse timer with the requested monster.
    assert.equal(corpse.otyp, CORPSE);
    assert.equal(corpse.corpsenm, PM_SMALL_MIMIC);
    assert.equal(corpse.spe, CORPSTAT_FEMALE);
    assert.equal(corpse.timed, 1);
    assert.equal(corpse.owt, 300);
    assert.ok(draws.some((draw) => draw.startsWith('rnz(')));

    const maleState = wishState();
    Object.assign(maleState, DUNGEON_FIXTURE);
    maleState.u.uz = { dnum: 0, dlevel: 1 };
    reset_mvitals(maleState);
    timeout_globals_init(maleState);
    const maleDraws = [];
    const maleRandom = recordingRandom(maleDraws);
    maleRandom.rn2 = (bound) => {
        maleDraws.push(`rn2(${bound})`);
        return bound === 2 ? 1 : 0;
    };
    const male = readobjnam('small mimic corpse', NO_WISH,
        objectGenerationEnv({
            state: maleState,
            random: maleRandom,
        }));
    assert.equal(male.corpsenm, PM_SMALL_MIMIC);
    assert.equal(male.spe, CORPSTAT_MALE);

    const giantState = wishState();
    Object.assign(giantState, DUNGEON_FIXTURE);
    giantState.u.uz = { dnum: 0, dlevel: 1 };
    reset_mvitals(giantState);
    timeout_globals_init(giantState);
    const giant = readobjnam('giant mimic corpse', NO_WISH,
        objectGenerationEnv({
            state: giantState,
            random: recordingRandom([]),
        }));
    assert.equal(giant.corpsenm, PM_GIANT_MIMIC);
});

test('readobjnam refuses a count above one', () => {
    const state = wishState();
    // objnam.c:5071-5083's wizard arm assigns otmp->quan directly, but no
    // recorded case covers the inventory line a stack produces, so a count
    // stops here.  A count of one reaches the same object as no count at all.
    const many = wish(state, '3 daggers');
    assert.equal(many.refusal, 'a wish for more than one object');
    // The stop stands after readobjnam_postparse3()'s lookup, because
    // oc_merge is not knowable until the type is.  objects.h gives DAGGER
    // oc_prob 30, so the lookup draws rn2(31) -- the one draw C makes in the
    // same place, with none after it.
    assert.deepEqual(many.draws, ['rn2(31)']);
    for (const text of ['a long sword', 'the long sword', '1 long sword'])
        assert.equal(wish(state, text).obj.otyp, LONG_SWORD, text);

    // The other arm of objnam.c:5037.  "potions" leaves a class word and no
    // type, so nothing can read oc_merge until mkobj() has drawn one; the same
    // guard therefore stands after that draw, and a refused class wish has
    // already spent random numbers where a refused named one spends the lookup
    // draw alone.
    const drawn = wish(state, '3 potions');
    assert.equal(drawn.refusal, 'a wish for more than one object');
    assert.notDeepEqual(drawn.draws, []);
    // A count of one on that same arm is granted, so what the guard turns on
    // is the count and not the class word.
    assert.equal(wish(state, '1 potion').obj.oclass, POTION_CLASS);
});

// The count a plural name produces, which readobjnam_preparse() never sees.
// objnam.c:4408 doubles d.cnt for "pair of " and 4423-4433's makesingular()
// block raises it from 1 to 2, both inside readobjnam_postparse1(), so a guard
// reading d.cnt before that call sees 1.  Both forms below reached
// hold_another_object() with quan 2 until the stack guard moved after the
// lookup.
test('readobjnam refuses the count a plural name produces', () => {
    const state = wishState();
    for (const text of ['daggers', 'the daggers']) {
        const plural = wish(state, text);
        assert.equal(plural.refusal, 'a wish for more than one object', text);
        assert.deepEqual(plural.draws, ['rn2(31)'], text);
    }
    // But the count alone does not decide it.  "pair of " doubles d.cnt for
    // boots too, and objnam.c:5071-5083 leaves quan alone for a type that does
    // not merge, so C produces the single pair this must also produce.
    const boots = wish(state, 'pair of speed boots');
    assert.equal(boots.obj.otyp, SPEED_BOOTS);
    assert.equal(boots.obj.quan, 1);
});

// objnam.c:5123-5187's `switch (d.typ)` reaches its `default: otmp->spe =
// d.spe` only for the types no earlier arm claims.  TOWEL has its own arm at
// 5133-5136 that assigns d.wetness alone, and SKELETON_KEY, HEAVY_IRON_BALL
// and IRON_CHAIN break at 5141-5146 without assigning, so a requested
// enchantment must not reach any of the four.  A towel makes it visible:
// js/objnam.js:304-305 prints "moist" for spe 1 or 2, so a +2 towel that took
// the default arm would read "a moist towel" where C prints "a towel".
test('readobjnam leaves spe alone for the types C breaks on', () => {
    const state = wishState();
    for (const text of ['+2 towel', '-2 towel']) {
        const towel = wish(state, text);
        assert.equal(towel.obj.otyp, TOWEL, text);
        // mksobj() rolls no spe for a towel: mkobj.c's TOOL_CLASS switch has
        // no TOWEL case, so the object keeps the 0 it was created with.
        assert.equal(towel.obj.spe, 0, text);
    }
    const chain = wish(state, '+2 iron chain');
    assert.equal(chain.obj.spe, 0);
    // The control: a long sword has no arm of its own, so the default arm
    // assigns the enchantment C's wizard branch left unclamped at 5097-5098.
    const sword = wish(state, '+2 long sword');
    assert.equal(sword.obj.otyp, LONG_SWORD);
    assert.equal(sword.obj.spe, 2);
});

// objnam.c:5168-5174 sets spe to 1 for a wished-for scroll of mail, marking it
// as coming from bones or wishing rather than from an in-game mail event.  The
// arm sits inside #ifdef MAIL_STRUCTURES, which include/global.h:430 defines
// unconditionally; include/objects.h gates the SCR_MAIL row on the same macro,
// and js/objects.js carries that row, so the comparison build compiles both.
test('readobjnam marks a wished-for scroll of mail', () => {
    const state = wishState();
    const mail = wish(state, 'scroll of mail');
    assert.equal(mail.obj.otyp, SCR_MAIL);
    assert.equal(mail.obj.spe, 1);
});

// objnam.c readobjnam_preparse() (3965-4175).
test('readobjnam_preparse consumes the qualifiers it recognizes', () => {
    const state = wishState();
    const d = readobjnam_init('blessed +3 rustproof long sword', state);
    assert.equal(readobjnam_preparse(d, state), 0);
    assert.equal(d.bp, 'long sword');
    assert.equal(d.consumed, 'blessed +3 rustproof ');
    assert.equal(d.blessed, 1);
    assert.equal(d.spe, 3);
    assert.equal(d.spesgn, 1);
    assert.equal(d.erodeproof, 1);
    // "blessed" clears the other two, which 3999-4001 spells out.
    assert.equal(d.iscursed, 0);
    assert.equal(d.uncursed, 0);
});

test('readobjnam_preparse reads a count and an article', () => {
    const state = wishState();
    const counted = readobjnam_init('7 daggers', state);
    readobjnam_preparse(counted, state);
    assert.equal(counted.cnt, 7);
    assert.equal(counted.bp, 'daggers');
    // "a"/"an" mean one; "the" means nothing at all.
    const article = readobjnam_init('a long sword', state);
    readobjnam_preparse(article, state);
    assert.equal(article.cnt, 1);
    assert.equal(article.bp, 'long sword');
    const the = readobjnam_init('the long sword', state);
    readobjnam_preparse(the, state);
    assert.equal(the.cnt, 0);
    assert.equal(the.bp, 'long sword');
    // 3980's `strcmp(d->bp, "0")` keeps a bare "0" out of the count arm.
    const zero = readobjnam_init('0', state);
    readobjnam_preparse(zero, state);
    assert.equal(zero.cnt, 0);
    assert.equal(zero.bp, '0');
});

test('readobjnam_preparse answers 1 only for an empty line', () => {
    const state = wishState();
    // C's comment at 3963-3964 claims 1 for a line of nothing but qualifiers
    // too, but `res = 0` runs at the top of every iteration the loop enters,
    // so a consumed qualifier leaves 0 behind.  readobjnam() reads the answer
    // as "go to `any:` and grant a random object", which is why an Escape at
    // the wish prompt -- which empties the buffer -- grants one.
    const d = readobjnam_init('blessed ', state);
    assert.equal(readobjnam_preparse(d, state), 0);
    assert.equal(d.bp, '');
    // An empty line never enters the loop, so res keeps its initial 1.
    const empty = readobjnam_init('', state);
    assert.equal(readobjnam_preparse(empty, state), 1);
});

test('readobjnam_preparse leaves a glob adjective alone', () => {
    const state = wishState();
    // 4113-4116: "small" is a glob size only when "glob" follows; otherwise it
    // is part of a monster name and the loop stops without consuming it.
    const mimic = readobjnam_init('small mimic corpse', state);
    readobjnam_preparse(mimic, state);
    assert.equal(mimic.bp, 'small mimic corpse');
    assert.equal(mimic.gsize, 0);
    const glob = readobjnam_init('small glob of gray ooze', state);
    readobjnam_preparse(glob, state);
    assert.equal(glob.bp, 'glob of gray ooze');
    assert.equal(glob.gsize, 1);
    // 4121-4127 gives "large" the same guard and gsize 3.
    const large = readobjnam_init('large glob of gray ooze', state);
    readobjnam_preparse(large, state);
    assert.equal(large.bp, 'glob of gray ooze');
    assert.equal(large.gsize, 3);
    // 4108-4110's "zombifying".
    const zombie = readobjnam_init('zombifying newt corpse', state);
    readobjnam_preparse(zombie, state);
    assert.equal(zombie.bp, 'newt corpse');
    assert.equal(zombie.zombify, true);
    // 4152-4160: "corpse"/"statue"/"figurine" is the gender hack only when
    // "of " follows, so the word on its own is left in place.
    const bare = readobjnam_init('corpse mail', state);
    readobjnam_preparse(bare, state);
    assert.equal(bare.bp, 'corpse mail');
});

// objnam.c rnd_otyp_by_namedesc() (3454-3529), the lookup readobjnam ends at.
test('rnd_otyp_by_namedesc matches a name, a description and a partial', () => {
    const state = wishState();
    const draws = [];
    const random = recordingRandom(draws);
    // 3516-3521 sums oc_prob + xtra_prob over every candidate and 3522 draws
    // rn2() of that sum, so the bound is what the candidate set decides and the
    // stub pinned at 0 always answers the first candidate whatever the set
    // holds.  Each call therefore states its bound as well as its answer.
    const find = (name, expectedDraws, oclass = 0) => {
        draws.length = 0;
        const otyp = rnd_otyp_by_namedesc(name, oclass, 1, { state, random });
        assert.deepEqual(draws, expectedDraws, name);
        return otyp;
    };

    // The objects[] name.  objects.h:931 gives the magic lamp oc_prob 15 and
    // no other entry answers the name, so the sole candidate makes rn2(16).
    assert.equal(find('magic lamp', ['rn2(16)']), MAGIC_LAMP);
    // The " of " partial at 3499-3506: "tricks" has to reach "bag of tricks",
    // oc_prob 20 at objects.h:911.
    assert.equal(find('tricks', ['rn2(21)']), BAG_OF_TRICKS);
    // A shuffled description, which o_init.c assigns and objects.c does not.
    // SHIFT_DESCRIPTIONS moves each range's descriptions one place down, and
    // objects.h:712-717 puts the jumping boots immediately before the elven
    // boots inside o_init.c's SPEED_BOOTS..LEVITATION_BOOTS range, so the
    // "mud boots" objects.h wrote against ELVEN_BOOTS is worn by
    // JUMPING_BOOTS in this game.  Every boot in that range has oc_prob 12,
    // so the bound cannot tell them apart; the answer is the whole test.
    assert.equal(find('mud boots', ['rn2(13)']), JUMPING_BOOTS);
    // The partial description at 3510-3512: "cloth" reaches both the cloak
    // wearing "piece of cloth" -- objects.h:644-649 puts the cloak of magic
    // resistance, oc_prob 6, immediately before the cloak of displacement --
    // and the spellbook wearing plain "cloth", which objects.h:1306-1309 makes
    // the finger of death, oc_prob 5.  7 + 6 is the bound, and the cloak is
    // reached first because it has the lower object number.
    assert.equal(find('cloth', ['rn2(13)']), CLOAK_OF_MAGIC_RESISTANCE);
    // The scan runs to the last objects[] entry, which is ACID_VENOM;
    // objects.h:1640-1641 gives it oc_prob 500.
    assert.equal(find('acid venom', ['rn2(501)']), ACID_VENOM);
    // 3504-3505 keeps the glob range out of the " of " partial match, so
    // neither end of it answers its monster's name.  Both ends matter: the
    // range is tested with `<` at one end and `>` at the other.  A miss
    // collects no candidate and so makes no draw.
    assert.equal(find('gray ooze', []), STRANGE_OBJECT);
    assert.equal(find('black pudding', []), STRANGE_OBJECT);
    // Only the objects[] name is matched with retry_inverted set, so an
    // inverted description finds nothing where the description itself works.
    assert.equal(find('boots of mud', []), STRANGE_OBJECT);
    // Nothing matches at all: STRANGE_OBJECT is 0.
    assert.equal(find('florble', []), STRANGE_OBJECT);
});

test('rnd_otyp_by_namedesc weights its candidates by oc_prob', () => {
    const state = wishState();
    // objects.h:929,931 give OIL_LAMP and MAGIC_LAMP the same description,
    // "lamp", so both are candidates.  Their oc_prob values are 45 and 15 and
    // readobjnam_postparse3() adds 1 to each, so the draw is rn2(62).
    const drawn = [];
    const pick = (result) => rnd_otyp_by_namedesc('lamp', 0, 1, {
        state,
        random: {
            rn2: (x) => { drawn.push(x); return result; },
            rnd: () => 1,
            rn1: (x, y) => y,
            rne: () => 1,
        },
    });
    assert.equal(pick(0), OIL_LAMP);
    assert.deepEqual(drawn, [62]);
    // 45 lands one past OIL_LAMP's share, so the loop stops on the second.
    assert.equal(pick(45), OIL_LAMP);
    assert.equal(pick(46), MAGIC_LAMP);
});

// The branches of readobjnam_postparse1() that reshape the typed name before
// the lookup.  Each expectation is the objects[] entry the C reaches.
test('readobjnam follows the name-reshaping branches', () => {
    const state = wishState();
    const resolved = (text) => wish(state, text).obj?.otyp;

    // 4448-4459: makesingular() is skipped for "tricks", which must stay
    // plural to reach "bag of tricks", but not for other plurals.
    assert.equal(resolved('tricks'), BAG_OF_TRICKS);
    assert.equal(wish(state, 'tricks').draws[0], 'rn2(21)');
    // 4467-4473: "armour" loses its "u" so that "leather armour" matches.
    assert.equal(resolved('leather armour'), LEATHER_ARMOR);
    // 4460-4466: the spellings[] loop compares with retry_inverted set, so an
    // inverted alternate spelling reaches its entry.  "helm of esp" is
    // spellings[]'s wording; "esp helm" is the inversion of it.
    assert.equal(resolved('esp helm'), HELM_OF_TELEPATHY);
    // 4479-4485: a dragon's scales are found by monster number, and the
    // monster is then cleared so no corpse handling follows.  Both ends of
    // the dragon range have to be inside it.
    assert.equal(resolved('gray dragon scales'), GRAY_DRAGON_SCALES);
    assert.equal(resolved('yellow dragon scales'), YELLOW_DRAGON_SCALES);
    // 4513-4519 blanks a scroll or spellbook only for an "unlabeled" wish,
    // which is a qualifier this port refuses; a bare "spellbook" is a class
    // word with nothing after it, so the lookup fails and objnam.c:5037 draws
    // a spellbook of its own.  SPE_DIG is objects[]'s first spellbook and
    // rnd() answering 1 stops the probability walk on it.
    const book = wish(state, 'spellbook');
    assert.equal(book.obj.otyp, SPE_DIG);
    assert.equal(book.obj.oclass, SPBOOK_CLASS);
    // 4283-4284: the Amulet's description has to open the name or follow a
    // space, so one embedded in a word is not it.
    assert.equal(wish(state, 'brassAmulet of Yendor').refusal,
                 'a wish no lookup resolves');
    // 4502-4511: "paperback" and "paperback book" are the novel; anything
    // else after it returns a null object instead.
    assert.equal(resolved('paperback'), SPE_NOVEL);
    assert.equal(resolved('paperback book'), SPE_NOVEL);
    assert.equal(wish(state, 'paperback spellbook').refusal,
                 'readobjnam action 3');
    // 4283-4306: the fake Amulet is reached by prefixing its description.
    assert.equal(resolved('imitation Amulet of Yendor'),
                 FAKE_AMULET_OF_YENDOR);
});

test('readobjnam keeps a monster name out of six object names', () => {
    const state = wishState();
    // objnam.c:4396-4401.  Without each exception name_to_monplus() would
    // match a monster or a rank title and truncate the name, which shows up
    // as the monster-type refusal rather than as an object or a failed
    // lookup.
    const reason = (text) => wish(state, text).refusal;
    // "samurai sword" is KATANA's description, not the samurai monster.
    assert.equal(wish(state, 'samurai sword').obj.otyp, KATANA);
    assert.equal(wish(state, 'wizard lock').obj.otyp, SPE_WIZARD_LOCK);
    // "death wand" inverts to "wand of death", not the Rider.
    assert.equal(wish(state, 'death wand').obj.otyp, WAN_DEATH);
    // "master key" names no object at all, so the lookup is what fails; had
    // the exception been missing, the "master" rank title would have matched
    // and truncated the name.  "ninja-to" keeps its whole name too, and
    // readobjnam_postparse3()'s Japanese_items[] row (objnam.c:3432-3446)
    // then spells it a broadsword.
    assert.equal(reason('master key'),
                 'a wish no lookup resolves');
    assert.equal(wish(state, 'ninja-to').obj.otyp, BROADSWORD);
    // "magenta" is a potion description; the "mage" rank must not take it.
    // objects.h:1143 writes it against the potion of see invisible, and
    // SHIFT_DESCRIPTIONS moves it one place down to the entry before it,
    // objects.h:1141's potion of invisibility.
    assert.equal(wish(state, 'magenta').obj.otyp, POT_INVISIBILITY);
    // 4372-4373's own exceptions: "wand ", "spellbook ", "gauntlets ",
    // "gloves " and "finger " suppress the "<foo> of <monster>" split, so
    // these three name objects rather than monsters.
    assert.equal(wish(state, 'wand of death').obj.otyp, WAN_DEATH);
    assert.equal(wish(state, 'finger of death').obj.otyp, SPE_FINGER_OF_DEATH);
    assert.equal(wish(state, 'gauntlets of ogre power').obj.otyp,
                 GAUNTLETS_OF_POWER);
    assert.equal(wish(state, 'gloves of ogre power').obj.otyp,
                 GAUNTLETS_OF_POWER);
    // 4374-4386 takes a tin before the "<foo> of <monster>" split does, so
    // "tin of newt meat" is a tin rather than a newt.
    assert.equal(reason('tin of newt meat'), 'a tin wish');
    // A bare monster name leaves no referent, so 4425-4429 puts the name back
    // and forgets the monster; the lookup then fails on its own.
    assert.equal(reason('newt'),
                 'a wish no lookup resolves');
    // With a referent the monster stays, and the wish is out of boundary.
    assert.equal(reason('newt corpse'), 'a wish naming a monster type');
    // 4425-4429 puts the name back only when nothing else has been parsed:
    // a " called " or " labeled " phrase counts, so the monster stays.
    assert.equal(reason('newt called foo'), 'a wish naming a monster type');
    assert.equal(reason('newt labeled foo'), 'a wish naming a monster type');
    // monst.c's first monster is the giant ant, whose number is LOW_PM
    // itself, so it is the one that distinguishes `>= LOW_PM` from `>`.
    assert.equal(reason('giant ant corpse'), 'a wish naming a monster type');
});

test('readobjnam leaves the ten class-word exceptions alone', () => {
    const state = wishState();
    // objnam.c:4553-4562.  Each of these would otherwise lose its leading or
    // trailing class word to the wrp[] loop and match something else.
    assert.equal(wish(state, 'ring mail').obj.otyp, RING_MAIL);
    assert.equal(wish(state, 'leather armor').obj.otyp, LEATHER_ARMOR);
    assert.equal(wish(state, 'tooled horn').obj.otyp, TOOLED_HORN);
    assert.equal(wish(state, 'food ration').obj.otyp, FOOD_RATION);
    assert.equal(wish(state, 'meat ring').obj.otyp, MEAT_RING);
    // And the loop itself still runs for everything else, in both
    // directions: a leading class word with " of ", and a trailing one.
    assert.equal(wish(state, 'scroll of magic mapping').obj.otyp,
                 SCR_MAGIC_MAPPING);
    assert.equal(wish(state, 'magic mapping scroll').obj.otyp,
                 SCR_MAGIC_MAPPING);
});

test('readobjnam finds a gem by its real name before its class', () => {
    const state = wishState();
    // objnam.c:4733-4742 compares d.actualn against every real gem's name
    // with strcmpi and needs no draw; the class-word loop has not set
    // d.oclass for a bare "agate", so the loop runs.
    const bare = wish(state, 'agate');
    assert.equal(bare.obj.otyp, AGATE);
    assert.equal(bare.draws[0], 'rnd(2)'); // mksobj()'s next_ident()
    // The loop runs through LAST_REAL_GEM itself, which is jade; the entry
    // after it is a worthless piece of glass.
    const last = wish(state, 'jade');
    assert.equal(last.obj.otyp, JADE);
    assert.equal(last.draws[0], 'rnd(2)');
    // readobjnam_postparse2()'s " stone" and " gem" suffixes (4676-4682) set
    // d.oclass, which skips that loop and reaches the weighted lookup.
    // objects.h gives AGATE oc_prob 14, so the draw is rn2(15).
    assert.equal(wish(state, 'agate stone').obj.otyp, AGATE);
    assert.equal(wish(state, 'agate gem').draws[0], 'rn2(15)');
});

test('readobjnam gives a wizard a disarmed trap object', () => {
    const state = wishState();
    // objnam.c:4626-4661.  With no prefix or suffix the name falls through to
    // the object lookup; " object" takes the object directly; anything else
    // appended asks for an armed trap, which is outside the boundary.
    assert.equal(wish(state, 'bear trap').obj.otyp, BEARTRAP);
    assert.equal(wish(state, 'land mine').obj.otyp, LAND_MINE);
    const direct = wish(state, 'beartrap object');
    assert.equal(direct.obj.otyp, BEARTRAP);
    assert.equal(direct.draws[0], 'rnd(2)'); // no lookup draw
    assert.equal(wish(state, 'landmine object').obj.otyp, LAND_MINE);
    assert.equal(wish(state, 'bear trap trap').refusal,
                 'a wizard-mode trap wish');
});

test('readobjnam honors the count for a mergeable type', () => {
    const state = wishState();
    // objnam.c:5074-5084.  mksobj() rolls rn1(6, 6) arrows, and the count --
    // 1, since readobjnam() supplies it when the player gives none -- then
    // replaces that quantity because arrows carry oc_merge.
    const { obj, draws } = wish(state, 'arrow');
    assert.equal(obj.otyp, ARROW);
    assert.equal(obj.quan, 1);
    assert.ok(draws.includes('rn1(6,6)'), 'mksobj() rolled a stack');
});

test('readobjnam refuses each glob spelling', () => {
    const state = wishState();
    // objnam.c:4340-4345 recognizes six shapes, and all of them draw rn1() at
    // 4354 for a monster type it cannot resolve.
    for (const text of [
        'glob', 'gray ooze glob', 'globs', 'gray ooze globs',
        'glob of gray ooze', 'globs of gray ooze',
    ]) {
        const { refusal, draws } = wish(state, text);
        assert.equal(refusal, 'a glob wish', text);
        assert.deepEqual(draws, [], text);
    }
});

test('readobjnam refuses the branches that leave the typfnd tail', () => {
    const state = wishState();
    const reason = (text) => wish(state, text).refusal;
    // objnam.c:4531-4544, gold, which returns its object before typfnd:.
    for (const text of ['gold', 'money', 'coin', 'zorkmid', '$100'])
        assert.equal(reason(text), 'a wish for gold', text);
    // 4547-4551, a single character, which is either a class symbol or
    // nothing at all.
    assert.equal(reason('/'), 'a one-character wish');
    // 4374-4386, a tin, and 4686-4714, a worthless glass gem.
    assert.equal(reason('tin of spinach'),
                 'a wish for a corpse, statue, figurine, egg or tin');
    assert.equal(reason('worthless piece of blue glass'), 'a glass-gem wish');
    // 4152-4174's corpse/statue/figurine gender hack.
    assert.equal(reason('statue of a gnome'),
                 'a "corpse/statue/figurine of" wish');
});

// objnam.c readobjnam_postparse3()'s tail (4751-4899) and the typfnd: d.name
// block (5345-5365). scripts/run-wizard-wish.mjs carries the end-to-end
// evidence; these pin the branches a screen cannot separate.
test('readobjnam resolves a name through each arm of the postparse3 tail', () => {
    const state = wishState();

    // 4761-4771's Japanese_items[] table.  Nothing in objects[] is named
    // "wakizashi", so the lookup above has already failed without drawing and
    // the only draws left are mksobj()'s.
    const japanese = wish(state, 'wakizashi');
    assert.equal(japanese.obj.otyp, SHORT_SWORD);
    assert.equal(japanese.draws.filter((d) => d === 'rn2(51)').length, 0);

    // 4775-4781's ARMOR_CLASS retry, the arm that returns 6.  The class-word
    // loop leaves "plate", " mail" is appended, and the second pass through
    // readobjnam_postparse2() and readobjnam_postparse3() finds PLATE_MAIL.
    // The lookup draw is rn2(41), the total oc_prob of the armor candidates
    // "plate mail" collects, and it happens once: the first pass matched
    // nothing and so drew nothing.
    const plate = wish(state, 'plate armor');
    assert.equal(plate.obj.otyp, PLATE_MAIL);
    assert.equal(plate.draws[0], 'rn2(41)');

    // 4873-4881's artifact_name(), which reaches a type no name or
    // description in objects[] can: SILVER_SABER's own name is "silver
    // saber".  d.oclass has to be 0 for the arm to run at all, so the wish
    // carries no class word.
    const arti = wish(state, 'Grayswandir');
    assert.equal(arti.obj.otyp, SILVER_SABER);
    assert.equal(arti.obj.oartifact, ART_GRAYSWANDIR);
    assert.equal(arti.obj.oextra.oname, 'Grayswandir');
    assert.equal(arti.obj.quan, 1);
    assert.equal(state.u.uconduct.wisharti, 1);

    // 4883-4896's class-filtered spellings[] list, which only a wish that
    // named a class reaches.  "saber" is spellings[]'s wording for
    // SILVER_SABER, and readobjnam_postparse1()'s unfiltered pass over the
    // same table has already been skipped, because "weapon" left "saber"
    // behind only after that pass ran.
    assert.equal(wish(state, 'saber weapon').obj.otyp, SILVER_SABER);

    // A name that reaches 4899 having matched nothing stops without drawing.
    const nothing = wish(state, 'zzyzx');
    assert.equal(nothing.refusal, 'a wish no lookup resolves');
    assert.deepEqual(nothing.draws, []);
});

test('the typfnd: name block tells an artifact wish from a label', () => {
    const state = wishState();

    // objnam.c:5350-5353 rewrites the player's spelling to artilist[]'s, and
    // because the type matches, 5361's pointer test is true: the object
    // becomes the artifact and the wish counts against conduct.
    const fuzzy = wish(state, 'elven dagger named sting');
    assert.equal(fuzzy.obj.otyp, ELVEN_DAGGER);
    assert.equal(fuzzy.obj.oextra.oname, 'Sting');
    assert.equal(fuzzy.obj.oartifact, ART_STING);
    assert.equal(state.u.uconduct.wisharti, 1);

    // The same name on the wrong base type.  artifact_name() still answers
    // Sting, but objtyp is ELVEN_DAGGER against a LONG_SWORD, so 5353 leaves
    // d.name pointing into the wish buffer, oname() finds no artifact of that
    // name and type to make, and 5361 is false on both operands.  The object
    // is an ordinary long sword that happens to be called Sting.
    const fresh = wishState();
    const label = wish(fresh, 'long sword named Sting');
    assert.equal(label.obj.otyp, LONG_SWORD);
    assert.equal(label.obj.oextra.oname, 'Sting');
    assert.equal(label.obj.oartifact, 0);
    assert.equal(fresh.u.uconduct.wisharti, 0);

    // A name no artifact carries is only a label, and 5354-5357's novel
    // lookup leaves it alone because the type is not SPE_NOVEL.
    const named = wish(fresh, 'long sword named Fido');
    assert.equal(named.obj.oextra.oname, 'Fido');
    assert.equal(named.obj.oartifact, 0);
    assert.equal(fresh.u.uconduct.wisharti, 0);

    // 5355-5357's novel arm, which replaces the player's title with the
    // catalog's.  do_name.c:1627-1660 accepts the American spelling of
    // _The_Colour_of_Magic_ and answers the British one.
    const novel = wish(fresh, 'novel named The Color of Magic');
    assert.equal(novel.obj.otyp, SPE_NOVEL);
    assert.equal(novel.obj.oextra.oname, 'The Colour of Magic');
    assert.equal(novel.obj.novelidx, 0);
    // 5357 replaces d.name with the catalog's title, so 5361's pointer test
    // can no longer see an artifact name and the novel costs no conduct.
    assert.equal(fresh.u.uconduct.wisharti, 0);
});

// The three lookups objnam.c:4751-4758 makes after the first, and the two
// guards that skip two of them. A wish reaches each of these only by failing
// the one before it.
test('readobjnam tries the description, the label and the called name', () => {
    const state = wishState();

    // A " labeled " phrase leaves d.dn holding text of its own, so the guard
    // at 4751 admits the second lookup.  Its rn2(51) -- the weight total of
    // the long swords "long sword" collects -- is the evidence it ran, because
    // d.actualn is "zzyzx" and the first lookup answered without drawing.
    const labeled = wish(state, 'zzyzx labeled long sword');
    assert.equal(labeled.obj.otyp, LONG_SWORD);
    assert.deepEqual(labeled.draws.slice(0, 1), ['rn2(51)']);

    // The same phrase over a label nothing matches stops rather than resolving
    // to whatever d.typ last held.
    assert.equal(wish(state, 'zzyzx labeled foo').refusal,
                 'a wish no lookup resolves');

    // The third lookup has no guard at all, and it is the only one that reads
    // the " called " text.  rn2(51) is the weight total of the long swords it
    // collects, so the draw is the evidence that the un lookup ran.
    const called = wish(state, 'zzyzx called long sword');
    assert.equal(called.obj.otyp, LONG_SWORD);
    assert.equal(called.draws[0], 'rn2(51)');
});

// Two more arms of the postparse3 tail that a granted wish cannot show.
//
// objnam.c:4775-4781's ARMOR_CLASS retry, read at the arm rather than through
// the loop that consumes it.  Running the loop is what the whole-wish
// assertions below do, and a wrong strstri() guard makes that loop run for
// ever: scripts/run-test-suite.mjs passes no --test-timeout, so the runner
// would hang instead of failing.  These two read the goto code itself, so
// neither result depends on the loop terminating.
test('the mail retry fires on a name without "mail" and on no other', () => {
    const state = wishState();

    // "plate" with d.oclass ARMOR_CLASS holds no "mail", so the arm appends it
    // and asks for the retry.  6 is C's `goto retry:`.
    const plate = parseToPostparse3(state, 'plate armor');
    assert.equal(plate.action, 6);
    assert.equal(plate.d.bp, 'plate mail');
    // The first pass matched nothing, so the appending arm was reached without
    // a lookup draw; the rn2(41) the whole wish spends belongs to pass two.
    assert.deepEqual(plate.draws, []);

    // "mail" holds "mail" at offset 0, so 4776's `strstri(...) < 0` is false
    // and the arm is skipped.  Had it fired, appending " mail" would leave
    // "mail" still at the front and it would ask for a retry for ever.  0 is
    // the fall-through that sends the wish to `any:` with only its class.
    const mail = parseToPostparse3(state, 'mail armor');
    assert.equal(mail.action, 0);
    assert.equal(mail.d.bp, 'mail');
});

test('readobjnam stops rather than retrying a name that already says mail', () => {
    const state = wishState();
    // The same two arms through the whole wish: the retry loop terminates and
    // the wish falls into typfnd: with d.typ 0, so it gets a drawn suit of
    // armor rather than a plate mail.
    const armor = wish(state, 'mail armor');
    assert.equal(armor.obj.oclass, ARMOR_CLASS);
    assert.notEqual(armor.obj.otyp, PLATE_MAIL);
});

// objnam.c readobjnam_postparse3()'s named-fruit block (4805-4870).  Every
// field it writes is dead to a wish: readobjnam() refuses a named SLIME_MOLD at
// requireSimpleWishedObject() before the typfnd: tail can read any of them.  So
// the block is measured where it runs.  A wish for the hero's own fruit is
// ordinary play -- it is what OPTIONS=fruit exists for -- and until this test
// the block ran under nothing at all.
test('the named-fruit block matches three ways and sets what C sets', () => {
    const state = wishState();
    const fruit = (text) => {
        const { action, d, draws } = parseToPostparse3(state, text);
        assert.equal(action, 2, text); /* C's goto typfnd: */
        assert.deepEqual(draws, [], text);
        assert.equal(d.typ, SLIME_MOLD, text);
        return d;
    };

    // ftyp 1, the exact match.  cntf stays 0 and 4865 copies it over the 1 the
    // count default left, so a plain fruit wish reaches typfnd: with no count
    // at all.  d.ftype names the fruit that matched, not current_fruit.
    assert.deepEqual(fruitFacts(fruit('kiwi')),
                     { blessed: 0, cnt: 0, ftype: 1, halfeaten: 0,
                       iscursed: 0, uncursed: 0 });
    assert.deepEqual(fruitFacts(fruit('papayas')),
                     { blessed: 0, cnt: 0, ftype: 2, halfeaten: 0,
                       iscursed: 0, uncursed: 0 });

    // ftyp 2, makesingular() of an already-plural fruit name, which 4861-4862
    // answers with a count of 1.
    assert.equal(fruit('papaya').cnt, 1);
    assert.equal(fruit('papaya').ftype, 2);

    // ftyp 3, makeplural() of a singular one, which 4863-4864 answers with 2.
    assert.equal(fruit('kiwis').cnt, 2);
    assert.equal(fruit('kiwis').ftype, 1);

    // 4815-4839's own prefix loop, which re-strips what readobjnam_preparse()
    // took off d.bp: d.fruitbuf keeps the line as the player typed it.  An
    // explicit count wins over the plural adjustment, because 4861 and 4863
    // both test `!cntf`.
    assert.equal(fruit('blessed 2 kiwis').blessed, 1);
    assert.equal(fruit('blessed 2 kiwis').cnt, 2);
    assert.equal(fruit('cursed kiwi').iscursed, 1);
    assert.equal(fruit('uncursed kiwi').uncursed, 1);
    assert.equal(fruit('a kiwi').cnt, 1);
    assert.equal(fruit('an kiwi').cnt, 1);
    // Both spellings of the half-eaten prefix.  readobjnam() refuses these two
    // at requireSimpleWishQualifiers() long before postparse3, so the block's
    // own halfeatenf is reachable only from here.
    assert.equal(fruit('partly eaten kiwi').halfeaten, 1);
    assert.equal(fruit('partially eaten kiwi').halfeaten, 1);

    // A name no fruit carries leaves the block without setting d.typ, and the
    // wish stops at the end of postparse3 instead.
    assert.equal(wish(state, 'zzyzx').refusal, 'a wish no lookup resolves');
});

test('the artifact lookup is fuzzy and runs only for a classless wish', () => {
    const state = wishState();

    // artifact_name() is called with fuzzy TRUE, so a missing space still
    // reaches the artifact, and the object carries artilist[]'s spelling.
    const fuzzy = wish(state, 'vorpalblade');
    assert.equal(fuzzy.obj.otyp, LONG_SWORD);
    assert.equal(fuzzy.obj.oextra.oname, 'Vorpal Blade');

    // 4872's `!d->oclass` keeps a wish that named a class away from the
    // artifact table: "Grayswandir weapon" is a weapon whose name matches no
    // weapon, and the class-filtered spellings list below cannot place it
    // either, so objnam.c:5037 draws a weapon instead of building the
    // artifact.  ARROW is objects[]'s first weapon and rnd() answering 1 stops
    // the probability walk on it.
    const drawn = wish(state, 'Grayswandir weapon');
    assert.equal(drawn.obj.otyp, ARROW);
    assert.equal(drawn.obj.oartifact, 0);
    assert.equal(state.u.uconduct.wisharti, 1); /* from the wish above */

    // 4890's wishymatch() keeps retry_inverted, so an inverted spelling still
    // matches once the class word is stripped.  spellings[] spells this one
    // "potion of sleep"; the wish spells it the other way round and names the
    // class as well, which is what carries it past
    // readobjnam_postparse1()'s own pass over the same table.
    assert.equal(wish(state, 'sleep potion potion').obj.otyp, POT_SLEEPING);
});

test('a second wish for one artifact still counts against conduct', () => {
    const state = wishState();
    assert.equal(wish(state, 'Grayswandir').obj.oartifact, ART_GRAYSWANDIR);
    assert.equal(state.u.uconduct.wisharti, 1);

    // do_name.c:385-388 refuses to make a second Grayswandir, so the saber
    // comes back an ordinary saber with no name at all.  objnam.c:5361 still
    // counts the wish, because its second operand asks what d.name points at
    // rather than what the object became.
    const second = wish(state, 'silver saber named Grayswandir');
    assert.equal(second.obj.otyp, SILVER_SABER);
    assert.equal(second.obj.oartifact, 0);
    assert.equal(Boolean(second.obj.oextra?.oname), false);
    assert.equal(second.obj.quan, 1);
    assert.equal(state.u.uconduct.wisharti, 2);

    // The same rewrite through 5353 on a fresh game does make the artifact,
    // and the fuzzy spelling shows that 5350's artifact_name() is what
    // supplies the name the object ends up with.
    const fresh = wishState();
    const named = wish(fresh, 'long sword named vorpalblade');
    assert.equal(named.obj.oartifact, ART_VORPAL_BLADE);
    assert.equal(named.obj.oextra.oname, 'Vorpal Blade');
    assert.equal(fresh.u.uconduct.wisharti, 1);
});

// objnam.c readobjnam()'s typfnd: tail sends every type to mksobj(), and
// mkobj.c mksobj_init():1010-1022 sends six of the seven container types on to
// mkbox_cnts(). All seven finish here.
test('readobjnam admits all seven container types', () => {
    const state = wishState();

    // The four mkbox_cnts() fills through mksobj_init()'s ICE_BOX, SACK and
    // BAG_OF_HOLDING labels, and the one Is_container() counts that
    // mkbox_cnts() never sees: mksobj_init():1036-1039 gives a bag of tricks
    // rn1(18, 3) charges instead.
    assert.equal(wish(state, 'sack').obj.otyp, SACK);
    assert.equal(wish(state, 'oilskin sack').obj.otyp, OILSKIN_SACK);
    assert.equal(wish(state, 'bag of holding').obj.otyp, BAG_OF_HOLDING);
    assert.equal(wish(state, 'ice box').obj.otyp, ICE_BOX);
    assert.equal(wish(state, 'bag of tricks').obj.otyp, BAG_OF_TRICKS);

    // The two that roll a lock and a trap on the way through.
    assert.equal(wish(state, 'chest').obj.otyp, CHEST);
    assert.equal(wish(state, 'large box').obj.otyp, LARGE_BOX);
});

// mksobj_init():1012-1014 rolls olocked, otrapped and, only where 1013 left the
// box trapped, tknown; mkbox_cnts():315-320 then takes the maximum from that
// lock. Both decisions show up in the draw list, because the count draw carries
// its own bound and the tknown draw is either present or absent.
test('a wished chest and large box draw their lock, trap and maximum', () => {
    const state = wishState();
    const steered = (results) => (draws) => steeredRandom(draws, results);

    // steeredRandom() answers an unsteered rn2() with 0, so rn2(5) leaves
    // olocked clear, rn2(10) leaves otrapped set, and the tknown draw follows.
    // An unlocked chest holds at most 5 and an unlocked large box at most 3.
    assert.deepEqual(wish(state, 'chest', steered({})).draws.slice(-4),
                     ['rn2(5)', 'rn2(10)', 'rn2(100)', 'rn2(6)']);
    assert.deepEqual(wish(state, 'large box', steered({})).draws.slice(-4),
                     ['rn2(5)', 'rn2(10)', 'rn2(100)', 'rn2(4)']);

    // rn2(5) answering 3 locks the box and rn2(10) answering 7 leaves it
    // untrapped, so no tknown draw runs at all and the maxima rise to 7 and 5.
    const lockedUntrapped = steered({ rn2: { 5: 3, 10: 7 } });
    assert.deepEqual(wish(state, 'chest', lockedUntrapped).draws.slice(-3),
                     ['rn2(5)', 'rn2(10)', 'rn2(8)']);
    assert.deepEqual(wish(state, 'large box', lockedUntrapped).draws.slice(-3),
                     ['rn2(5)', 'rn2(10)', 'rn2(6)']);

    // An ice box rolls neither, and its maximum of 20 does not move.
    assert.equal(wish(state, 'ice box', steered({})).draws.at(-1), 'rn2(21)');
    assert.equal(wish(state, 'ice box', lockedUntrapped).draws.at(-1),
                 'rn2(21)');
});

// mkbox_cnts():311-336 picks the maximum from the container's own type, and
// the sack arm at 321-327 reads the turn counter before falling through to the
// bag of holding's unconditional 1. Reaching that through a wish is what the
// slice added; recordingRandom() answers every rn2() with 0, so no content is
// ever built and the draw itself is the whole observation.
test('a wished container spends mkbox_cnts()"s count draw', () => {
    const beforeFirstTurn = wishState();
    // wishState() starts at moves 1, which is svm.moves <= 1: n stays 0.
    assert.equal(beforeFirstTurn.moves, 1);
    assert.deepEqual(wish(beforeFirstTurn, 'sack').draws.at(-1), 'rn2(1)');
    // A bag of holding never reads the turn counter, so the same game gives
    // it n = 1 on the very move a sack is refused contents.
    assert.deepEqual(
        wish(beforeFirstTurn, 'bag of holding').draws.at(-1), 'rn2(2)',
    );

    // One turn later the sack falls through to the same n = 1.
    const afterFirstTurn = wishState();
    afterFirstTurn.moves = 2;
    assert.deepEqual(wish(afterFirstTurn, 'sack').draws.at(-1), 'rn2(2)');
    assert.deepEqual(
        wish(afterFirstTurn, 'oilskin sack').draws.at(-1), 'rn2(2)',
    );
    // The container type that never reaches mkbox_cnts() spends no count draw
    // at all: rn1(18, 3) for its charges is the last thing mksobj() does.
    assert.deepEqual(
        wish(afterFirstTurn, 'bag of tricks').draws.at(-1), 'rn1(18,3)',
    );
});

// The differential evidence for the container tail lives in
// scripts/run-wished-container.mjs, which records fresh C output for nineteen
// wishes and compares complete screens, cursors and random-number calls. This
// guards what that matrix is made of: a matrix that kept only empty containers,
// or lost the segment that wishes before taking a turn, would still pass.
test('the wished-container matrix keeps its content spread', () => {
    const recipe = loadWishedContainerRecipe();
    assert.equal(recipe.segments.length, CONTAINER_CASES.length);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        // Every segment submits its wish and then waits, so the inventory
        // line paints over a screen the reply settled.
        assert.equal(segment.moves.endsWith('\n.'), true);
    }
    // Exactly one case wishes before taking a turn, which is the only way to
    // reach mkbox_cnts():324's svm.moves <= 1 arm from a wish.
    assert.deepEqual(
        CONTAINER_CASES.filter(({ opened }) => !opened).map(({ wish: text }) => text),
        ['sack'],
    );
    // All seven container types, and eight of boxiprobs[]'s nine content
    // classes, counting the empty container as its own outcome.
    assert.deepEqual(
        [...new Set(CONTAINER_CASES.map(({ otyp }) => otyp))].sort((a, b) => a - b),
        [SACK, OILSKIN_SACK, BAG_OF_HOLDING, BAG_OF_TRICKS,
         CHEST, LARGE_BOX, ICE_BOX].sort((a, b) => a - b),
    );
    assert.deepEqual(
        [...new Set(CONTAINER_CASES.flatMap(({ contents }) => contents))].sort(),
        [COIN_CLASS, FOOD_CLASS, GEM_CLASS, POTION_CLASS, RING_CLASS,
         SCROLL_CLASS, SPBOOK_CLASS, WAND_CLASS].sort(),
    );
    assert.equal(
        CONTAINER_CASES.filter(({ contents }) => contents.length === 0).length,
        4,
    );
    // Both maxima of both lockable types, so the count draw's bound is
    // recorded for each of mkbox_cnts():315-320's four answers. The fourth
    // lock-and-trap combination, an unlocked trapped box, is not here: the two
    // rolls are independent, so it would repeat draws these four already make.
    assert.deepEqual(
        CONTAINER_CASES
            .filter(({ locked }) => locked !== undefined)
            .map(({ otyp, locked, trapped }) => [otyp, locked, trapped]),
        [[CHEST, true, true], [CHEST, false, false],
         [LARGE_BOX, true, false], [LARGE_BOX, false, false]],
    );
    // One segment weighs enough for invent.c hold_another_object() to reach
    // drop_it, and it shares its wish with one that does not.
    assert.deepEqual(
        CONTAINER_CASES.filter(({ dropped }) => dropped)
            .map(({ wish: text }) => text),
        ['ice box'],
    );
    assert.equal(
        CONTAINER_CASES.filter(({ otyp }) => otyp === ICE_BOX).length, 2,
    );
});

// ---------------------------------------------------------------------------
// objnam.c readobjnam()'s `any:` label (4994-4996) and the d.typ == 0 arm of
// its typfnd: tail (5037). An Escape at the wish prompt empties the buffer
// (zap.c:6346-6347), which is what sends a wish down both.
// ---------------------------------------------------------------------------

// Answers `results[bound]` where the table has an entry and recordingRandom()'s
// lowest result everywhere else, so a test can steer one draw and leave the
// rest deterministic.
function steeredRandom(draws, results) {
    const base = recordingRandom(draws);
    return {
        ...base,
        rn2: (x) => { base.rn2(x); return results.rn2?.[x] ?? 0; },
        rnd: (x) => { base.rnd(x); return results.rnd?.[x] ?? 1; },
    };
}

// mkobj()'s probability walk subtracts each type's oc_prob from rnd(total), so
// steering that one draw to a class's cumulative weight selects the type it
// lands on. All three below are FOOD_CLASS or TOOL_CLASS totals of 1000.
const TRIPE_RATION_DRAW = 140; /* the class's first row, cumulative 140 */
const SLIME_MOLD_DRAW = 387; /* cumulative 312 before it, 387 through it */
const TIN_DRAW = 1000; /* the class's last row */
const EGG_DRAW = 225; /* cumulative 140 before it, 225 through it */
const LARGE_BOX_DRAW = 40; /* the class's first row */
const CHEST_DRAW = 75; /* cumulative 40 before it, 75 through it */
const FIGURINE_DRAW = 795; /* cumulative 770 before it, 795 through it */

test('an empty wish line draws its class from wrpsym[]', () => {
    // objnam.c:4924-4925 sends a line readobjnam_preparse() answers 1 for
    // straight to `any:`, whose rn2(13) is the first draw the wish makes.
    const state = wishState();
    const wand = wish(state, '');
    assert.equal(wand.draws[0], 'rn2(13)');
    // wrpsym[0] is WAND_CLASS, and recordingRandom() answers every rn2() 0.
    assert.equal(wand.obj.oclass, WAND_CLASS);

    // The far end of the same table, which is what pins the bound: wrpsym[12]
    // is FOOD_CLASS, so an rn2(13) of 12 has to stay in range.
    const food = [];
    const last = readobjnam('', NO_WISH, {
        state,
        random: steeredRandom(food, { rn2: { 13: 12 } }),
    });
    assert.equal(last.oclass, FOOD_CLASS);
    // wrpsym[9] is ARMOR_CLASS, one of the three rows no class word test
    // reaches, because "armor" is stripped by readobjnam_postparse1() first.
    const armor = [];
    assert.equal(readobjnam('', NO_WISH, {
        state,
        random: steeredRandom(armor, { rn2: { 13: 9 } }),
    }).oclass, ARMOR_CLASS);
});

test('a class word skips the any: draw', () => {
    const state = wishState();
    // objnam.c:4995's `if (!d.oclass)`. "potion" leaves POTION_CLASS behind
    // and no type, so C falls past wiztrap: and `any:` into typfnd: with
    // d.typ 0 and grants mkobj(POTION_CLASS, FALSE) -- with no rn2(13) at all.
    const potion = wish(state, 'potion');
    assert.equal(potion.obj.oclass, POTION_CLASS);
    assert.equal(potion.draws.includes('rn2(13)'), false);
    // A name that resolves to a type reaches typfnd: by `goto typfnd`, which
    // steps over `any:` entirely; d.oclass is 0 there until 4998 sets it, so a
    // port that ran `any:` unconditionally would draw here too.
    const lamp = wish(state, 'magic lamp');
    assert.equal(lamp.obj.otyp, MAGIC_LAMP);
    assert.equal(lamp.draws.includes('rn2(13)'), false);
    // A line of nothing but qualifiers is not the empty line: the preparse
    // loop consumed "blessed" and so answered 0, and with no class word the
    // wish reaches objnam.c:4992's null return instead.
    assert.equal(wish(state, 'blessed ').refusal, 'a wish no lookup resolves');
});

test('the any: arm leaves the count at 0, so a drawn stack survives', () => {
    // C's `goto any` steps over objnam.c:4927-4928, which is the only line
    // that raises d.cnt from 0 to 1. The count block at 5069-5083 then reads
    // `d.cnt > 0` and leaves mksobj()'s own quantity alone.
    const state = wishState();
    const stacked = [];
    // wrpsym[8] is WEAPON_CLASS; ARROW is objects[]'s first weapon, is
    // multigen, and mkobj.c mksobj():963 gives it rn1(6, 6) of itself.
    const arrows = readobjnam('', NO_WISH, {
        state,
        random: steeredRandom(stacked, { rn2: { 13: 8 } }),
    });
    assert.equal(arrows.otyp, ARROW);
    assert.equal(arrows.quan, 6); /* rn1(6, 6) answering its base */

    // The same draw reached by naming the class instead: readobjnam_preparse()
    // answers 0, d.cnt becomes 1, and 5081 overwrites the stack with it.
    const single = wish(state, 'weapon');
    assert.equal(single.obj.otyp, ARROW);
    assert.equal(single.obj.quan, 1);
});

// objnam.c:5122-5185's arms for the types a draw can reach. Each is shown
// with an explicit enchantment, because that is what separates the arm from
// the `default:` below it: with no "+n" the tail copies otmp->spe back into
// itself and every arm looks alike.
test('a drawn tin is not spinach, whatever mksobj() made it', () => {
    // objnam.c:5122's `d.otmp->spe = 0`. mkobj.c mksobj():925-937 sends every
    // tin through eat.c set_tin_variety(), whose spinach limb sets spe 1 and
    // whose RANDOM_TIN limb sets the negative code -(r + 1); either would name
    // the tin wrongly if the `default:` arm copied it back out of d.spe.
    const state = wishState();
    const draws = [];
    const tin = readobjnam('', NO_WISH, {
        state,
        random: steeredRandom(draws, { rn2: { 13: 11 }, rnd: { 1000: TIN_DRAW } }),
    });
    assert.equal(tin.otyp, TIN);
    assert.equal(tin.spe, 0);
    // What mksobj() left before the arm ran: recordingRandom()'s rn2(6) of 0
    // takes mksobj():925's spinach branch, so spe was 1.
    const made = [];
    assert.equal(mksobj(TIN, true, false, {
        state, random: recordingRandom(made),
    }).spe, 1);
});

test('a drawn slime mold, box and figurine keep the spe C leaves them', () => {
    const state = wishState();
    const drawn = (text, results) => {
        const draws = [];
        return readobjnam(text, NO_WISH, {
            state, random: steeredRandom(draws, results),
        });
    };

    // objnam.c:5137-5139 assigns d.ftype, which readobjnam_init() copied from
    // svc.context.current_fruit -- 1 in this fixture -- rather than the "+3".
    // The `case SLIME_MOLD:` label is what this pins; its assignment repeats a
    // value mksobj():971-975 has already set from the same field, and only
    // objnam.c:4805-4870's named-fruit block can separate the two.  That block
    // is ported, but a wish it matches is refused at
    // requireSimpleWishedObject() before the spe switch runs, so nothing can
    // reach this arm with a d.ftype of its own.
    const mold = drawn('+3 zzyzx food', { rnd: { 1000: SLIME_MOLD_DRAW } });
    assert.equal(mold.otyp, SLIME_MOLD);
    assert.equal(mold.spe, 1);
    // The contrast: a food type with no arm of its own takes `default:` and
    // does get the "+3".
    const tripe = drawn('+3 zzyzx food', { rnd: { 1000: TRIPE_RATION_DRAW } });
    assert.equal(tripe.otyp, TRIPE_RATION);
    assert.equal(tripe.spe, 3);

    // objnam.c:5141-5146's bare `break;`, which a chest and a large box share
    // with the skeleton key, the heavy iron ball and the iron chain.
    const box = drawn('+3 zzyzx tool', { rnd: { 1000: LARGE_BOX_DRAW } });
    assert.equal(box.otyp, LARGE_BOX);
    assert.equal(box.spe, 0);
    const chest = drawn('+3 zzyzx tool', { rnd: { 1000: CHEST_DRAW } });
    assert.equal(chest.otyp, CHEST);
    assert.equal(chest.spe, 0);
});

test('a drawn figurine loses the gender mksobj() rolled for it', () => {
    // objnam.c:5147-5165 with C's P null. mkobj.c mksobj():1216-1223 gives a
    // figurine the gender of the monster it rolled, and this arm replaces it
    // with CORPSTAT_RANDOM. The monster machinery needs a dungeon and a
    // monsterObject hook, which the plain wish fixture does not carry.
    const state = wishState();
    Object.assign(state, DUNGEON_FIXTURE);
    state.u.uz = { dnum: 0, dlevel: 1 };
    reset_mvitals(state);
    const draws = [];
    const figurine = readobjnam('+3 zzyzx tool', NO_WISH, objectGenerationEnv({
        state,
        random: steeredRandom(draws, { rnd: { 1000: FIGURINE_DRAW } }),
    }));
    assert.equal(figurine.otyp, FIGURINE);
    assert.equal(figurine.spe, CORPSTAT_RANDOM);
    // The monster survives: objnam.c:5195-5245's corpsenm switch reads
    // d.mntmp, which is NON_PM here, so it does not run and mksobj()'s own
    // choice stands.
    assert.notEqual(figurine.corpsenm, NON_PM);
});

test('a class wish that also names a dragon stops on every drawn carrier', () => {
    // requireSimpleRandomWishedObject(). objnam.c:5206-5245's corpsenm switch
    // is unported, and "gray dragon food" is a wish that reaches it: the
    // dragon passes the monster-type refusal, "food" leaves FOOD_CLASS with no
    // type, and mkobj() can answer a tin or an egg.  Three of the switch's five
    // labels are reachable this way and each needs its own draw; CORPSE and
    // STATUE are not, CORPSE because objects.h gives it oc_prob 0 and STATUE
    // because it is ROCK_CLASS, which wrpsym[] does not hold.
    const state = wishState();
    Object.assign(state, DUNGEON_FIXTURE);
    state.u.uz = { dnum: 0, dlevel: 1 };
    reset_mvitals(state);
    const carriers = [
        ['gray dragon food', TIN_DRAW],
        ['gray dragon food', EGG_DRAW],
        // A figurine is TOOL_CLASS, so its wish has to name that class.
        ['gray dragon tool', FIGURINE_DRAW],
    ];
    for (const [text, draw] of carriers) {
        const stopped = [];
        assert.throws(() => readobjnam(text, NO_WISH, objectGenerationEnv({
            state,
            random: steeredRandom(stopped, { rnd: { 1000: draw } }),
        })), (error) => error instanceof UnsupportedWishError
            && error.reason
                === 'a random wish that drew a monster-carrying type',
        `${text} at ${draw}`);
    }
    // The same wish on a type the corpsenm switch does not name is granted,
    // which is what keeps the refusal to the three types it is for.
    const granted = [];
    assert.equal(readobjnam('gray dragon food', NO_WISH, objectGenerationEnv({
        state,
        random: steeredRandom(granted, { rnd: { 1000: TRIPE_RATION_DRAW } }),
    })).otyp, TRIPE_RATION);
});

// The differential evidence for the random-object tail lives in
// scripts/run-random-wish.mjs, which records fresh C output for twenty-one
// wishes and compares complete screens, cursors and random-number calls. This
// guards what that matrix is made of: a matrix that had lost the tin, the
// stack or the class-word route would still pass.
test('the random-wish matrix keeps its class and type spread', () => {
    const recipe = loadRandomWishRecipe();
    assert.equal(recipe.segments.length, RANDOM_WISH_CASES.length);
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);

    // Every class wrpsym[] can name. The table holds thirteen rows and eleven
    // distinct classes, because SPBOOK_CLASS and FOOD_CLASS each appear twice.
    assert.deepEqual(
        [...new Set(RANDOM_WISH_CASES.map(({ oclass }) => oclass))].sort(),
        [...new Set(wrpsym)].sort(),
    );
    // The four types whose spe arm only a drawn type reaches, plus the egg
    // that reaches `default:` and the slime mold's fruit id.
    for (const otyp of [TIN, SLIME_MOLD, FIGURINE, CHEST, LARGE_BOX, EGG]) {
        assert.equal(
            RANDOM_WISH_CASES.some((entry) => entry.otyp === otyp), true,
            `otyp ${otyp}`,
        );
    }
    // At least one stack larger than the two a food or gem roll can give,
    // which is the only shape that shows the `any:` route leaving d.cnt at 0.
    assert.equal(
        RANDOM_WISH_CASES.some(({ quan }) => (quan ?? 1) > 2), true,
    );
    // The class-word route, which reaches the same tail without an rn2(13).
    assert.deepEqual(
        RANDOM_WISH_CASES.filter(({ wish: text }) => text !== undefined)
            .map(({ wish: text }) => text),
        ['zzyzx potion'],
    );
});
