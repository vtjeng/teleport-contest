// objnam_readobjnam.js -- the wish parser.
// C ref: objnam.c readobjnam() and the group of functions that serve only it:
// readobjnam_init(), readobjnam_preparse(), readobjnam_parse_charges(),
// readobjnam_postparse1(), readobjnam_postparse2(), readobjnam_postparse3(),
// wishymatch(), rnd_otyp_by_namedesc(), and the o_ranges[], spellings[],
// wrp[] and wrpsym[] tables those read.
//
// objnam.c's naming half -- xname(), doname(), an(), the() and their helpers
// -- is a separate group of functions and lives in js/objnam.js.

import { NON_PM, SPE_LIM } from './const.js';
import { makesingular } from './fruit.js';
import { fuzzymatch, lcase, strstri } from './hacklib.js';
import {
    ACID_VENOM,
    AMULET_CLASS,
    AMULET_OF_ESP,
    AMULET_OF_GUARDING,
    AMULET_VERSUS_POISON,
    ARMOR_CLASS,
    BAG_OF_TRICKS,
    BLINDING_VENOM,
    BRASS_LANTERN,
    BULLWHIP,
    CLOAK_OF_DISPLACEMENT,
    CREAM_PIE,
    DUNCE_CAP,
    DWARVISH_MATTOCK,
    ELVEN_LEATHER_HELM,
    ELVEN_MITHRIL_COAT,
    ENORMOUS_MEATBALL,
    EUCALYPTUS_LEAF,
    EXPENSIVE_CAMERA,
    FEDORA,
    FLINT,
    FOOD_CLASS,
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
    IRON_SHOES,
    KATANA,
    KELP_FROND,
    LARGE_BOX,
    LEATHER_GLOVES,
    LEMBAS_WAFER,
    LEVITATION_BOOTS,
    LOADSTONE,
    LOW_BOOTS,
    LUCKSTONE,
    MAGIC_LAMP,
    MAGIC_MARKER,
    MUMMY_WRAPPING,
    OIL_LAMP,
    PICK_AXE,
    POTION_CLASS,
    POT_SLEEPING,
    RING_CLASS,
    RIN_INCREASE_ACCURACY,
    RIN_PROTECTION_FROM_SHAPE_CHAN,
    ROCK,
    SACK,
    SCROLL_CLASS,
    SCR_CHARGING,
    SHIELD_OF_REFLECTION,
    SHORT_SWORD,
    SILVER_SABER,
    SMALL_SHIELD,
    SPBOOK_CLASS,
    TALLOW_CANDLE,
    TIN,
    TIN_OPENER,
    TOOLED_HORN,
    TOOL_CLASS,
    TOUCHSTONE,
    TRIPE_RATION,
    T_SHIRT,
    VENOM_CLASS,
    WAND_CLASS,
    WAX_CANDLE,
    WEAPON_CLASS,
    YELLOW_DRAGON_SCALES,
    YELLOW_DRAGON_SCALE_MAIL,
} from './objects.js';

// C ref: objnam.c's TIN_UNDEFINED, TIN_EMPTY and TIN_SPINACH (3928-3930),
// the values readobjnam_init() and readobjnam_preparse() give d.contents.
export const TIN_UNDEFINED = 0;
export const TIN_EMPTY = 1;
export const TIN_SPINACH = 2;

// C ref: hack.h:1400 RANDOM_TIN, the tin variety readobjnam_init() starts
// from.  It is negative, so readobjnam()'s `d.tvariety >= 0` test at
// objnam.c:5311 never fires for a wish that names no variety.
export const RANDOM_TIN = -2;

// C ref: objnam.c o_ranges[] (3346-3366), the wishable subranges.
export const o_ranges = Object.freeze([
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
    ['dragon scales', ARMOR_CLASS, GRAY_DRAGON_SCALES, YELLOW_DRAGON_SCALES],
    ['dragon scale mail', ARMOR_CLASS, GRAY_DRAGON_SCALE_MAIL,
     YELLOW_DRAGON_SCALE_MAIL],
    ['sword', WEAPON_CLASS, SHORT_SWORD, KATANA],
    ['venom', VENOM_CLASS, BLINDING_VENOM, ACID_VENOM],
    ['gray stone', GEM_CLASS, LUCKSTONE, FLINT],
    ['grey stone', GEM_CLASS, LUCKSTONE, FLINT],
].map(([name, oclass, f_o_range, l_o_range]) => Object.freeze({
    name, oclass, f_o_range, l_o_range,
})));

// C ref: objnam.c spellings[] (3372-3429), the alternate spellings.  C ends
// the table with a null row that its `while (as->sp)` loops stop on;
// iterating the array here needs no such terminator.
export const spellings = Object.freeze([
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
    ['huge meatball', ENORMOUS_MEATBALL], /* likely conflated name */
    ['huge chunk of meat', ENORMOUS_MEATBALL], /* original name */
    ['marker', MAGIC_MARKER],
    ['hook', GRAPPLING_HOOK],
    ['grappling iron', GRAPPLING_HOOK],
    ['grapnel', GRAPPLING_HOOK],
    ['grapple', GRAPPLING_HOOK],
    ['protection from shape shifters', RIN_PROTECTION_FROM_SHAPE_CHAN],
    ['accuracy', RIN_INCREASE_ACCURACY],
    /* if we ever add other sizes, move this to o_ranges[] with "bag" */
    ['box', LARGE_BOX],
    /* normally we wouldn't have to worry about unnecessary <space>, but
       " stone" will get stripped off, preventing a wishymatch; that actually
       lets "flint stone" be a match, so we also accept bogus "flintstone" */
    ['luck stone', LUCKSTONE],
    ['load stone', LOADSTONE],
    ['touch stone', TOUCHSTONE],
    ['flintstone', FLINT],
].map(([sp, ob]) => Object.freeze({ sp, ob })));

// C ref: objnam.c wrp[] and wrpsym[] (2517-2528).  The two arrays are indexed
// together, and `sizeof wrpsym` -- 13, one more than SIZE(wrp) -- is what
// bounds both loops that read them: the class-name loop in
// readobjnam_postparse1() and the random class in readobjnam()'s `any:` arm.
export const wrp = Object.freeze([
    'wand', 'ring', 'potion', 'scroll', 'gem',
    'amulet', 'spellbook', 'spell book',
    /* for non-specific wishes */
    'weapon', 'armor', 'tool', 'food', 'comestible',
]);
export const wrpsym = Object.freeze([
    WAND_CLASS, RING_CLASS, POTION_CLASS,
    SCROLL_CLASS, GEM_CLASS, AMULET_CLASS,
    SPBOOK_CLASS, SPBOOK_CLASS, WEAPON_CLASS,
    ARMOR_CLASS, TOOL_CLASS, FOOD_CLASS,
    FOOD_CLASS,
]);

// C's `!strncmpi(str, prefix, strlen(prefix))`.  lcase() rather than
// toLowerCase(), because C folds with lowc(), which touches 'A'-'Z' alone.
export function strncmpiIsPrefix(str, prefix) {
    return lcase(str).startsWith(lcase(prefix));
}

// C's `!strcmpi(a, b)`.
export function strcmpiEqual(a, b) {
    return lcase(a) === lcase(b);
}

// C's strsubst() on a copy of the caller's string.  hacklib.c strsubst()
// finds its target with case-sensitive strstr(), but wishymatch() reaches it
// only after a case-insensitive strstri() has already found the same text, so
// this fold matches where wishymatch()'s guard did.
function strsubstFold(str, orig, replacement) {
    const at = strstri(str, orig);
    if (at < 0) return str;
    return str.slice(0, at) + replacement + str.slice(at + orig.length);
}

// C ref: objnam.c wishymatch() (3243-3338).  `u_str` comes from the player, so
// it might be a variant spelling; `o_str` comes from objects[] and is
// canonical.  `retry_inverted` turns on the extra " of " handling.
//
// The detect_SP and ability arms write a '\0' into their caller's buffer and
// put the old byte back before returning, which JavaScript strings make
// unnecessary; the helmet and gauntlets arms copy into a scratch buffer that
// truncates at BUFSZ, which no wish this port accepts is long enough to reach.
export function wishymatch(u_str, o_str, retry_inverted) {
    const detect_SP = 'detect ';
    const SP_detection = ' detection';

    /* ignore spaces & hyphens and upper/lower case when comparing */
    if (fuzzymatch(u_str, o_str, ' -', true))
        return true;

    if (retry_inverted) {
        /* when just one of the strings is in the form "foo of bar",
           convert it into "bar foo" and perform another comparison */
        const u_of = strstri(u_str, ' of ');
        const o_of = strstri(o_str, ' of ');
        if (u_of >= 0 && o_of < 0) {
            const buf = `${u_str.slice(u_of + 4)} ${u_str.slice(0, u_of)}`;
            if (fuzzymatch(buf, o_str, ' -', true))
                return true;
        } else if (o_of >= 0 && u_of < 0) {
            const buf = `${o_str.slice(o_of + 4)} ${o_str.slice(0, o_of)}`;
            if (fuzzymatch(u_str, buf, ' -', true))
                return true;
        }
    }

    /* [note: if something like "elven speed boots" ever gets added, these
       special cases should be changed to call wishymatch() recursively in
       order to get the "of" inversion handling] */
    if (o_str.startsWith('dwarvish ')) {
        if (strncmpiIsPrefix(u_str, 'dwarven '))
            return fuzzymatch(u_str.slice(8), o_str.slice(9), ' -', true);
    } else if (o_str.startsWith('elven ')) {
        if (strncmpiIsPrefix(u_str, 'elvish '))
            return fuzzymatch(u_str.slice(7), o_str.slice(6), ' -', true);
        else if (strncmpiIsPrefix(u_str, 'elfin '))
            return fuzzymatch(u_str.slice(6), o_str.slice(6), ' -', true);
    } else if (strstri(o_str, 'helm') >= 0 && strstri(u_str, 'helmet') >= 0) {
        return wishymatch(strsubstFold(u_str, 'helmet', 'helm'), o_str, true);
    } else if (strstri(o_str, 'gauntlets') >= 0
               && strstri(u_str, 'gloves') >= 0) {
        return wishymatch(strsubstFold(u_str, 'gloves', 'gauntlets'), o_str,
                          true);
    } else if (o_str.startsWith(detect_SP)) {
        /* check for "detect <foo>" vs "<foo> detection" */
        const p = strstri(u_str, SP_detection);
        if (p >= 0 && p + SP_detection.length === u_str.length) {
            /* convert "<foo> detection" into "detect <foo>" */
            const head = u_str.slice(0, p);
            let buf = detect_SP + head;
            /* "detect monster" -> "detect monsters" */
            if (strcmpiEqual(head, 'monster'))
                buf += 's';
            return fuzzymatch(buf, o_str, ' -', true);
        }
    } else if (strstri(o_str, SP_detection) >= 0) {
        /* and the inverse, "<foo> detection" vs "detect <foo>" */
        if (strncmpiIsPrefix(u_str, detect_SP)) {
            /* convert "detect <foo>s" into "<foo> detection" */
            const p = makesingular(u_str.slice(detect_SP.length));
            return fuzzymatch(p + SP_detection, o_str, ' -', true);
        }
    } else if (strstri(o_str, 'ability') >= 0) {
        /* when presented with "foo of bar", makesingular() used to
           singularize both foo & bar, but now only does so for foo */
        /* catch "{potion(s),ring} of {gain,restore,sustain} abilities" */
        const p = strstri(u_str, 'abilities');
        if (p >= 0 && p + 'abilities'.length === u_str.length)
            return fuzzymatch(`${u_str.slice(0, p)}ability`, o_str, ' -', true);
    } else if (o_str === 'aluminum') {
        /* this special case doesn't really fit anywhere else... */
        /* (note that " wand" will have been stripped off by now) */
        if (strcmpiEqual(u_str, 'aluminium'))
            return fuzzymatch(u_str.slice(9), o_str.slice(8), ' -', true);
    }

    return false;
}

// C ref: objnam.c's `struct _readobjnam_data`, as readobjnam_init()
// (3933-3961) leaves it.
//
// C's `bp` and `origbp` are two pointers into one buffer, and the chain both
// advances `bp` past consumed text and writes '\0' into the buffer to truncate
// it.  This port keeps `bp` as the string `bp` points at and `consumed` as the
// text between `origbp` and `bp`, so `consumed + bp` is what C's `origbp`
// reads and `consumed.length` is C's `bp - origbp`.
export function readobjnam_init(bp, state) {
    return {
        otmp: null,
        cnt: 0, spe: 0, spesgn: 0, typ: 0,
        very: 0, rechrg: 0, blessed: 0, uncursed: 0, iscursed: 0,
        ispoisoned: 0, isgreased: 0, eroded: 0, eroded2: 0,
        erodeproof: 0, halfeaten: 0, islit: 0, unlabeled: 0,
        ishistoric: 0, isdiluted: 0, /* statues, potions */
        /* box/chest and wizard mode door */
        trapped: 0, locked: 0, unlocked: 0, broken: 0,
        open: 0, closed: 0, doorless: 0, /* wizard mode door */
        looted: 0, /* wizard mode fountain/sink/throne/tree and grave */
        real: 0, fake: 0, /* Amulet */
        tvariety: RANDOM_TIN,
        mgend: -1, /* not specified, aka random */
        mntmp: NON_PM,
        contents: TIN_UNDEFINED,
        oclass: 0,
        actualn: null, dn: null, un: null,
        wetness: 0,
        gsize: 0,
        zombify: false,
        bp, consumed: '',
        name: null,
        ftype: state?.context?.current_fruit ?? 0,
        globbuf: '',
        fruitbuf: '',
    };
}

// C's `atoi(p)` followed by `while (digit(*p)) p++`.  atoi() skips leading
// whitespace and accepts a sign, while the digit loop that follows advances
// only over digits, so it stops where atoi() started when the number carried
// either.  Answering both keeps that quirk visible.
export function scanCount(str, from) {
    const match = /^[ \t\n\v\f\r]*[+-]?[0-9]*/u.exec(str.slice(from));
    const value = Number.parseInt(match[0], 10);
    let end = from;
    // Indexing past the end answers undefined, and every comparison against it
    // is false, so this stops where C's digit loop stops at the '\0'.
    while (str[end] >= '0' && str[end] <= '9') end++;
    return { value: Number.isNaN(value) ? 0 : value, end };
}

// C ref: objnam.c readobjnam_parse_charges() (4178-4237).  Consumes a
// parenthesised "(n)", "(n:m)" or "(lit)" suffix from the end of d.bp and then
// clamps spe and rechrg.  C splices the text after the ')' back onto the
// truncated buffer; this rebuilds the same string.
export function readobjnam_parse_charges(d) {
    const at = d.bp.length > 1 ? d.bp.lastIndexOf('(') : -1;
    if (at >= 0) {
        let keeptrailingchars = true;
        /* drop the space before '(' along with the parenthesised text */
        const head = d.bp.slice(0, at > 0 && d.bp[at - 1] === ' ' ? at - 1 : at);
        let p = at + 1; /* advance past '(' */
        if (strncmpiIsPrefix(d.bp.slice(p), 'lit)')) {
            d.islit = 1;
            p += 4 - 1; /* point at ')' */
        } else {
            const charges = scanCount(d.bp, p);
            d.spe = charges.value;
            p = charges.end;
            if (d.bp[p] === ':') {
                p++;
                d.rechrg = d.spe;
                const recharges = scanCount(d.bp, p);
                d.spe = recharges.value;
                p = recharges.end;
            }
            if (d.bp[p] !== ')') {
                d.spe = 0;
                d.rechrg = 0;
                /* mis-matched parentheses; rest of string will be ignored
                 * [probably we should restore everything back to '('
                 * instead since it might be part of "named ..."]
                 */
                keeptrailingchars = false;
            } else {
                d.spesgn = 1;
            }
        }
        d.bp = keeptrailingchars ? head + d.bp.slice(p + 1) : head;
    }
    /*
     * otmp->spe is type schar, so we don't want spe to be any bigger or
     * smaller.  Also, spe should always be positive --some cheaters may
     * try to confuse atoi().
     */
    if (d.spe < 0) {
        d.spesgn = -1; /* cheaters get what they deserve */
        d.spe = Math.abs(d.spe);
    }
    /* cap on obj->spe is independent of (and less than) SCHAR_LIM */
    if (d.spe > SPE_LIM)
        d.spe = SPE_LIM; /* slime mold uses d.ftype, so not affected */
    if (d.rechrg < 0 || d.rechrg > 7)
        d.rechrg = 7; /* recharge_limit */
    return d;
}
