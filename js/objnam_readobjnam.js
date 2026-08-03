// objnam_readobjnam.js -- the wish parser.
// C ref: objnam.c readobjnam() and the group of functions that serve only it:
// readobjnam_init(), readobjnam_preparse(), readobjnam_parse_charges(),
// readobjnam_postparse1(), readobjnam_postparse2(), readobjnam_postparse3(),
// wishymatch(), rnd_otyp_by_namedesc(), and the o_ranges[], spellings[],
// wrp[] and wrpsym[] tables those read.
//
// objnam.c's naming half -- xname(), doname(), an(), the() and their helpers
// -- is a separate group of functions and lives in js/objnam.js.

import { nartifact_exist, permapoisoned } from './artifacts.js';
import {
    FEMALE, GOLD_SYM, LOW_PM, MALE, NEUTRAL, NON_PM, SPE_LIM, ismnum,
} from './const.js';
import { makesingular } from './fruit.js';
import { game } from './gstate.js';
import { digit, fuzzymatch, lcase, lowc, mungspaces, strstri } from './hacklib.js';
import { name_to_monplus } from './mondata.js';
import { PM_GRAY_DRAGON, PM_YELLOW_DRAGON } from './monsters.js';
import {
    curseFreeObject, erosionMatters, isContainer, mksobj, objectType,
    rnd_class, weight,
} from './obj.js';
import { is_quest_artifact } from './questpgr.js';
import { rn1, rn2, rnd } from './rng.js';
import {
    ACID_VENOM,
    AMULET_CLASS,
    AMULET_OF_ESP,
    AMULET_OF_GUARDING,
    AMULET_OF_YENDOR,
    AMULET_VERSUS_POISON,
    ARMOR_CLASS,
    BAG_OF_TRICKS,
    BEARTRAP,
    BELL_OF_OPENING,
    BLINDING_VENOM,
    BRASS_LANTERN,
    BULLWHIP,
    CLOAK_OF_DISPLACEMENT,
    CORPSE,
    CREAM_PIE,
    DUNCE_CAP,
    DWARVISH_MATTOCK,
    EGG,
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
    FORTUNE_COOKIE,
    GAUNTLETS_OF_DEXTERITY,
    GAUNTLETS_OF_POWER,
    GEM_CLASS,
    GLOB_OF_BLACK_PUDDING,
    GLOB_OF_GRAY_OOZE,
    GRAPPLING_HOOK,
    GRAY_DRAGON_SCALES,
    GRAY_DRAGON_SCALE_MAIL,
    HAWAIIAN_SHIRT,
    HEAVY_IRON_BALL,
    HELM_OF_TELEPATHY,
    HORN_OF_PLENTY,
    IRON_CHAIN,
    IRON_SHOES,
    KATANA,
    KELP_FROND,
    LAND_MINE,
    LARGE_BOX,
    LAST_REAL_GEM,
    LEATHER_GLOVES,
    LEMBAS_WAFER,
    LEVITATION_BOOTS,
    LOADSTONE,
    LOW_BOOTS,
    LUCKSTONE,
    MAGIC_LAMP,
    MAGIC_MARKER,
    MAXOCLASSES,
    MUMMY_WRAPPING,
    NUM_OBJECTS,
    OBJ_DESCR,
    OBJ_NAME,
    OIL_LAMP,
    ORANGE,
    PICK_AXE,
    POTION_CLASS,
    POT_SLEEPING,
    POT_WATER,
    RING_CLASS,
    RIN_INCREASE_ACCURACY,
    RIN_PROTECTION_FROM_SHAPE_CHAN,
    ROCK,
    SACK,
    SCALE_MAIL,
    SCROLL_CLASS,
    SCR_BLANK_PAPER,
    SCR_CHARGING,
    SCR_MAIL,
    SHIELD_OF_REFLECTION,
    SHORT_SWORD,
    SILVER_SABER,
    SKELETON_KEY,
    SLIME_MOLD,
    SMALL_SHIELD,
    SPBOOK_CLASS,
    SPE_BLANK_PAPER,
    SPE_NOVEL,
    STATUE,
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
// together and hold 13 entries each, so `sizeof wrpsym` equals SIZE(wrp) and
// one bound serves both loops that read them: the class-name loop in
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

// C's strsubst() on a copy of the caller's string, with one difference this
// port has not settled: hacklib.c strsubst() finds its target with
// case-sensitive strstr(), while wishymatch()'s guard above it uses
// case-insensitive strstri().  So C leaves "Helmet of brilliance" unchanged and
// recurses on the original, where this fold rewrites it to "Helm".  Matching C
// exactly would re-enter the same branch with the same string, which is why the
// deferral "wishymatch() folds case where C's strsubst() does not" holds it: the
// recursion needs tracing before the fold is removed.
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

// A wish this port cannot grant yet.  Every refusal below names the C line it
// stands at, and each sits before the draw its branch would make, so a refused
// wish spends no random number.
export class UnsupportedWishError extends Error {
    constructor(reason, buf) {
        super(`unsupported wish: ${reason}`);
        this.name = 'UnsupportedWishError';
        this.reason = reason;
        // The line mungspaces() left, which readobjnam() reads.
        this.buf = buf;
    }
}

function wishEnv(env = {}) {
    const state = env.state ?? game;
    return { ...env, state, hooks: env.hooks ?? {} };
}

function wishRandom(env) {
    return env.random ?? { rn2, rnd, rn1 };
}

// What C's origbp reads: the text bp has passed over, followed by what is left
// of it.  A truncation the chain writes into the buffer lands inside bp, so
// this shows the same string C would.
function origbp(d) {
    return d.consumed + d.bp;
}

// C's `!BSTRCMPI(base, eos(base) - n, tail)`: compares the last n characters,
// and answers "different" when the string is shorter than n.
function endsWithFold(str, tail) {
    return str.length >= tail.length
        && strcmpiEqual(str.slice(str.length - tail.length), tail);
}

// C's `!strncmpi(d->bp, w, l = strlen(w))` chains assign `l` before testing,
// so the length left behind is the matched word's.  0 means nothing matched,
// which is the only case where C's `l` goes unread.
function matchPrefix(bp, ...words) {
    for (const word of words)
        if (strncmpiIsPrefix(bp, word)) return word.length;
    return 0;
}

// C advances d->bp through the buffer; this moves the same text onto
// d.consumed, so `consumed + bp` stays what C's origbp reads and
// `consumed.length` is C's `bp - origbp`.
function advance(d, l) {
    d.consumed += d.bp.slice(0, l);
    d.bp = d.bp.slice(l);
}

// C's `while (*d->bp == ' ') d->bp++`, answering how far to advance.
function leadingSpaces(bp) {
    let count = 0;
    while (bp[count] === ' ') count++;
    return count;
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

// C ref: objnam.c rnd_otyp_by_namedesc() (3454-3529).  Answers the objects[]
// entry a typed name selects, or STRANGE_OBJECT for none.  `xtra_prob` is
// added to each candidate's generation chance, and a nonzero one lets a type
// that is never generated randomly be chosen at all.
//
// The rn2() at 3522 fires even when exactly one type matched, because the loop
// after it never runs for n == 1; omitting it desynchronizes the stream.
export function rnd_otyp_by_namedesc(name, oclass, xtra_prob, env = {}) {
    const { state } = wishEnv(env);
    const random = wishRandom(env);
    const objects = state.objects;
    const validobjs = [];
    let maxprob = 0;

    if (!name)
        return STRANGE_OBJECT;

    /* only skip "foo of" for "foo of bar" if target doesn't contain " of " */
    const check_of = strstri(name, ' of ') < 0;
    const minglob = GLOB_OF_GRAY_OOZE;
    const maxglob = GLOB_OF_BLACK_PUDDING;

    let lo;
    let hi;
    if (oclass) {
        const bases = state.svb?.bases;
        if (!Array.isArray(bases))
            throw new Error('rnd_otyp_by_namedesc requires init_objects()');
        lo = bases[oclass];
        hi = bases[oclass + 1] - 1;
    } else {
        lo = MAXOCLASSES; /* STRANGE_OBJECT + 1; */
        hi = NUM_OBJECTS - 1;
    }
    /* FIXME:
     * When this spans classes (the !oclass case), the item
     * probabilities are not very useful because they don't take
     * the class generation probability into account.
     */
    for (let i = lo; i <= hi; ++i) {
        /* don't match extra descriptions (w/o real name) */
        let zn = OBJ_NAME(objects[i], state);
        if (zn == null) continue;
        let of;
        if (wishymatch(name, zn, true) /* objects[] name */
            /* let "<bar>" match "<foo> of <bar>" ... with a few exceptions */
            || (check_of
                && i !== BELL_OF_OPENING
                && (i < minglob || i > maxglob)
                && (of = strstri(zn, ' of ')) >= 0
                && wishymatch(name, zn.slice(of + 4), false)) /* partial name */
            || ((zn = OBJ_DESCR(objects[i], state)) != null
                && wishymatch(name, zn, false)) /* objects[] description */
            /* "cloth" should match "piece of cloth" */
            || (zn != null && check_of && (of = strstri(zn, ' of ')) >= 0
                && wishymatch(name, zn.slice(of + 4), false))
            || ((zn = objects[i].oc_uname ?? null) != null
                && wishymatch(name, zn, false)) /* user-called name */
        ) {
            validobjs.push(i);
            maxprob += objects[i].oc_prob + xtra_prob;
        }
    }

    if (validobjs.length > 0 && maxprob) {
        let prob = random.rn2(maxprob);
        let i = 0;
        for (; i < validobjs.length - 1; i++)
            if ((prob -= objects[validobjs[i]].oc_prob + xtra_prob) < 0)
                break;
        return validobjs[i];
    }
    return STRANGE_OBJECT;
}

// C ref: objnam.c readobjnam_preparse() (3965-4175).  Consumes a count and
// every leading qualifier, answering 1 when the line held nothing but
// qualifiers and 0 when anything else remains.
//
// Two arms stop instead of running.  "wet"/"moist" draws rn2(3) or rnd(2) for
// a towel's wetness at 4025-4027, and the corpse/statue/figurine gender hack
// at 4152-4174 is the only arm that sets save_bp -- with save_bp set, C
// removes the gender word with strsubst(), which folds no case, so a
// capitalized "Female " leaves l at 0 and the loop stops advancing.
export function readobjnam_preparse(d, state) {
    let res = 1;

    for (;;) {
        let l;

        if (!d.bp) break;
        res = 0;

        if ((l = matchPrefix(d.bp, 'an ', 'a '))) {
            d.cnt = 1;
        } else if ((l = matchPrefix(d.bp, 'the '))) {
            /* just increment `bp' by `l' below */
        } else if (!d.cnt && digit(d.bp[0]) && d.bp !== '0') {
            const count = scanCount(d.bp, 0);
            d.cnt = count.value;
            advance(d, count.end);
            advance(d, leadingSpaces(d.bp));
            l = 0;
        } else if (d.bp[0] === '+' || d.bp[0] === '-') {
            d.spesgn = d.bp[0] === '+' ? 1 : -1;
            advance(d, 1);
            const enchantment = scanCount(d.bp, 0);
            d.spe = enchantment.value;
            advance(d, enchantment.end);
            advance(d, leadingSpaces(d.bp));
            l = 0;
        } else if ((l = matchPrefix(d.bp, 'blessed ', 'holy '))) {
            d.blessed = 1;
            d.uncursed = d.iscursed = 0;
        } else if ((l = matchPrefix(d.bp, 'cursed ', 'unholy '))) {
            d.iscursed = 1;
            d.blessed = d.uncursed = 0;
        } else if ((l = matchPrefix(d.bp, 'uncursed '))) {
            d.uncursed = 1;
            d.blessed = d.iscursed = 0;
        } else if ((l = matchPrefix(d.bp, 'rustproof ', 'erodeproof ',
                                    'corrodeproof ', 'fixed ', 'fireproof ',
                                    'rotproof ', 'tempered ', 'crackproof '))) {
            d.erodeproof = 1;
        } else if ((l = matchPrefix(d.bp, 'lit ', 'burning '))) {
            d.islit = 1;
        } else if ((l = matchPrefix(d.bp, 'unlit ', 'extinguished '))) {
            d.islit = 0;

        /* "wet" and "moist" are only applicable for towels */
        } else if (matchPrefix(d.bp, 'moist ', 'wet ')) {
            // objnam.c:4022-4027 draws rn2(3) for "wet" and rnd(2) for
            // "moist"; refuse before the draw.
            throw new UnsupportedWishError('a "wet" or "moist" wish',
                                           origbp(d));

        /* "unlabeled" and "blank" are synonymous */
        } else if ((l = matchPrefix(d.bp, 'unlabeled ', 'unlabelled ',
                                    'blank '))) {
            d.unlabeled = 1;
        } else if ((l = matchPrefix(d.bp, 'poisoned '))) {
            d.ispoisoned = 1;

        /* "trapped" recognized but not honored outside wizard mode */
        } else if ((l = matchPrefix(d.bp, 'trapped '))) {
            d.trapped = 0; /* undo any previous "untrapped" */
            if (state.wizard) d.trapped = 1;
        } else if ((l = matchPrefix(d.bp, 'untrapped '))) {
            d.trapped = 2; /* not trapped */

        /* locked, unlocked, broken: box/chest lock states, also door states;
           open, closed, doorless: additional door states */
        } else if ((l = matchPrefix(d.bp, 'locked '))) {
            d.locked = d.closed = 1;
            d.unlocked = d.broken = d.open = d.doorless = 0;
        } else if ((l = matchPrefix(d.bp, 'unlocked '))) {
            d.unlocked = d.closed = 1;
            d.locked = d.broken = d.open = d.doorless = 0;
        } else if ((l = matchPrefix(d.bp, 'broken '))) {
            d.broken = 1;
            d.locked = d.unlocked = d.open = d.closed = d.doorless = 0;
        } else if ((l = matchPrefix(d.bp, 'open '))) {
            d.open = 1;
            d.closed = d.locked = d.broken = d.doorless = 0;
        } else if ((l = matchPrefix(d.bp, 'closed '))) {
            d.closed = 1;
            d.open = d.locked = d.broken = d.doorless = 0;
        } else if ((l = matchPrefix(d.bp, 'doorless '))) {
            d.doorless = 1;
            d.open = d.closed = d.locked = d.unlocked = d.broken = 0;
        /* looted: fountain/sink/throne/tree; disturbed: grave */
        } else if ((l = matchPrefix(d.bp, 'looted ', 'disturbed '))) {
            d.looted = 1;
        } else if ((l = matchPrefix(d.bp, 'greased '))) {
            d.isgreased = 1;
        } else if ((l = matchPrefix(d.bp, 'zombifying '))) {
            d.zombify = true;
        } else if ((l = matchPrefix(d.bp, 'very '))) {
            /* very rusted very heavy iron ball */
            d.very = 1;
        } else if ((l = matchPrefix(d.bp, 'thoroughly '))) {
            d.very = 2;
        } else if ((l = matchPrefix(d.bp, 'rusty ', 'rusted ', 'burnt ',
                                    'burned ', 'cracked '))) {
            d.eroded = 1 + d.very;
            d.very = 0;
        } else if ((l = matchPrefix(d.bp, 'corroded ', 'rotted '))) {
            d.eroded2 = 1 + d.very;
            d.very = 0;
        } else if ((l = matchPrefix(d.bp, 'partly eaten ',
                                    'partially eaten '))) {
            d.halfeaten = 1;
        } else if ((l = matchPrefix(d.bp, 'historic '))) {
            d.ishistoric = 1;
        } else if ((l = matchPrefix(d.bp, 'diluted '))) {
            d.isdiluted = 1;
        } else if ((l = matchPrefix(d.bp, 'empty '))) {
            d.contents = TIN_EMPTY;
        } else if ((l = matchPrefix(d.bp, 'small '))) { /* glob sizes */
            /* "small" might be part of a monster name rather than a prefix */
            if (!strncmpiIsPrefix(d.bp.slice(l), 'glob')
                && strstri(d.bp.slice(l), ' glob') < 0)
                break;
            d.gsize = 1;
        } else if ((l = matchPrefix(d.bp, 'medium '))) {
            d.gsize = 2;
        } else if ((l = matchPrefix(d.bp, 'large '))) {
            /* "large" might be part of a monster or object name */
            if (!strncmpiIsPrefix(d.bp.slice(l), 'glob')
                && strstri(d.bp.slice(l), ' glob') < 0)
                break;
            /* "very large " had "very " peeled off on previous iteration */
            d.gsize = (d.very !== 1) ? 3 : 4;
        } else if ((l = matchPrefix(d.bp, 'real '))) {
            /* accept "real Amulet of Yendor" with "blessed" or "cursed"
               or useless "erodeproof" before or after "real" ... */
            d.real = 1;
        } else if ((l = matchPrefix(d.bp, 'fake '))) {
            d.fake = 1;
            d.real = 0;
        } else if ((l = matchPrefix(d.bp, 'female '))) {
            d.mgend = FEMALE;
        } else if ((l = matchPrefix(d.bp, 'male '))) {
            d.mgend = MALE;
        } else if ((l = matchPrefix(d.bp, 'neuter '))) {
            d.mgend = NEUTRAL;
        } else if ((l = matchPrefix(d.bp, 'corpse ', 'statue ', 'figurine '))
                   && strncmpiIsPrefix(d.bp.slice(l), 'of ')) {
            /*
             * Corpse/statue/figurine gender hack:  in order to accept
             * "statue of a female gnome ruler" for gnome queen we need
             * to recognize and skip over "statue of [a ]".
             */
            throw new UnsupportedWishError(
                'a "corpse/statue/figurine of" wish', origbp(d));
        } else {
            break;
        }
        advance(d, l);
    }
    /* C restores d->bp to save_bp here, which only the refused arm sets. */
    return res;
}

// C ref: objnam.c readobjnam_postparse1() (4239-4663).  Every block runs for
// the plainest wish and merely takes no branch.  Answers C's goto code: 0 to
// fall through to readobjnam_postparse2(), 1 for `srch:`, 2 for `typfnd:`, 3
// to return d.otmp, 4 for `any:` and 5 for `wiztrap:`.
export function readobjnam_postparse1(d, env) {
    const { state } = env;
    let p;

    /* now we have the actual name, as delivered by xname, say
     *  green potions called whisky
     *  scrolls labeled "QWERTY"
     *  wand of wishing
     *  elven cloak
     */
    if ((p = strstri(d.bp, ' named ')) >= 0) {
        /* note: if 'name' is too long, oname() will truncate it */
        d.name = d.bp.slice(p + 7);
        d.bp = d.bp.slice(0, p);
    }
    if ((p = strstri(d.bp, ' called ')) >= 0) {
        /* note: if 'un' is too long, obj lookup just won't match anything */
        d.un = d.bp.slice(p + 8);
        d.bp = d.bp.slice(0, p);
        /* "helmet called telepathy" is not "helmet" (a specific type)
         * "shield called reflection" is not "shield" (a general type)
         */
        for (const row of o_ranges)
            if (strcmpiEqual(d.bp, row.name)) {
                d.oclass = row.oclass;
                return 1; /*goto srch;*/
            }
    }
    if ((p = strstri(d.bp, ' labeled ')) >= 0) {
        d.dn = d.bp.slice(p + 9);
        d.bp = d.bp.slice(0, p);
    } else if ((p = strstri(d.bp, ' labelled ')) >= 0) {
        d.dn = d.bp.slice(p + 10);
        d.bp = d.bp.slice(0, p);
    }
    if ((p = strstri(d.bp, ' of spinach')) >= 0) {
        d.bp = d.bp.slice(0, p);
        d.contents = TIN_SPINACH;
    }
    /* real vs fake is only useful for wizard mode but we'll accept its
       parsing in normal play */
    p = strstri(d.bp, OBJ_DESCR(state.objects[AMULET_OF_YENDOR], state));
    if (p >= 0 && (p === 0 || d.bp[p - 1] === ' ')) {
        /* "Amulet of Yendor" matches two items, name of real Amulet and
           description of fake one; also accept partial specification of the
           full name of the fake, which unlike the prefixes above has to come
           in the right order */
        let s = d.bp;
        if (strncmpiIsPrefix(s, 'cheap ')) {
            d.fake = 1;
            s = s.slice(6);
        }
        if (strncmpiIsPrefix(s, 'plastic ')) {
            d.fake = 1;
            s = s.slice(8);
        }
        if (strncmpiIsPrefix(s, 'imitation ')) {
            d.fake = 1;
            s = s.slice(10);
        }
        /* when 'fake' is True, it overrides 'real' if both were given;
           when it is False, force 'real' whether that was specified or not */
        d.real = d.fake ? 0 : 1;
        d.typ = d.real ? AMULET_OF_YENDOR : FAKE_AMULET_OF_YENDOR;
        return 2; /*goto typfnd;*/
    }

    /*
     * Skip over "pair of ", "pairs of", "set of" and "sets of".
     *
     * We should only double count if the object in question is not
     * referred to as a "pair of".
     */
    if (strncmpiIsPrefix(d.bp, 'pair of ')) {
        advance(d, 8);
        d.cnt *= 2;
    } else if (strncmpiIsPrefix(d.bp, 'pairs of ')) {
        advance(d, 9);
        if (d.cnt > 1) d.cnt *= 2;
    } else if (strncmpiIsPrefix(d.bp, 'set of ')) {
        advance(d, 7);
    } else if (strncmpiIsPrefix(d.bp, 'sets of ')) {
        advance(d, 8);
    }

    /* Intercept pudding globs here; they're a valid wish target,
     * but we need them to not get treated like a corpse.
     */
    /* check for "glob", "<foo> glob", and "glob of <foo>" */
    if (strcmpiEqual(d.bp, 'glob') || endsWithFold(d.bp, ' glob')
        || strcmpiEqual(d.bp, 'globs') || endsWithFold(d.bp, ' globs')
        || strstri(d.bp, 'glob of ') >= 0
        || strstri(d.bp, 'globs of ') >= 0) {
        // objnam.c:4340-4362 picks a random pudding with rn1() at 4354 when
        // the monster name does not resolve, and every glob is a FOOD_CLASS
        // object outside this port's boundary.
        throw new UnsupportedWishError('a glob wish', origbp(d));
    } else {
        /*
         * Find corpse type using "of" (figurine of an orc, tin of orc meat).
         * Don't check if it's a wand or spellbook, and don't match "ogre" or
         * "giant" inside "gauntlets of ogre power" and its alternates.
         */
        if (strstri(d.bp, 'wand ') < 0 && strstri(d.bp, 'spellbook ') < 0
            && strstri(d.bp, 'gauntlets ') < 0 && strstri(d.bp, 'gloves ') < 0
            && strstri(d.bp, 'finger ') < 0) {
            if (strstri(d.bp, 'tin of ') >= 0) {
                // objnam.c:4374-4386.  tin_variety_txt() is unported and a tin
                // is outside this port's boundary.
                throw new UnsupportedWishError('a tin wish', origbp(d));
            } else if ((p = strstri(d.bp, ' of ')) >= 0) {
                const found = name_to_monplus(d.bp.slice(p + 4),
                                              { state, gender: d.mgend });
                d.mntmp = found.mnum;
                d.mgend = found.gender;
                if (d.mntmp >= LOW_PM)
                    d.bp = d.bp.slice(0, p);
            }
        }
    }
    /* Find corpse type w/o "of" (red dragon scale mail, yeti corpse) */
    if (!strncmpiIsPrefix(d.bp, 'samurai sword') /* not the "samurai" monster */
        && !strncmpiIsPrefix(d.bp, 'wizard lock') /* not the "wizard" monster */
        && !strncmpiIsPrefix(d.bp, 'death wand') /* 'of inversion', not Rider */
        && !strncmpiIsPrefix(d.bp, 'master key') /* not the "master" rank */
        && !strncmpiIsPrefix(d.bp, 'ninja-to') /* not the "ninja" rank */
        && !strncmpiIsPrefix(d.bp, 'magenta')) { /* not the "mage" rank */
        if (d.mntmp < LOW_PM && d.bp.length > 2) {
            const found = name_to_monplus(d.bp, { state, gender: d.mgend });
            d.mntmp = found.mnum;
            d.mgend = found.gender;
            if (d.mntmp >= LOW_PM) {
                const obp = d.bp;
                const obpConsumed = d.consumed;

                /* 'rest' is a pointer past the matching portion; if that was
                   an alternate name or a rank title rather than the canonical
                   monster name we wouldn't otherwise know how much to skip */
                if (typeof found.remainder !== 'string')
                    throw new Error('name_to_monplus matched with no remainder');
                advance(d, d.bp.length - found.remainder.length);

                if (d.bp[0] === ' ') {
                    advance(d, 1);
                } else if (strncmpiIsPrefix(d.bp, 's ')
                           || (d.consumed.length > 0
                               && strncmpiIsPrefix(
                                   `${d.consumed.at(-1)}${d.bp}`, "s' "))) {
                    advance(d, 2);
                } else if (strncmpiIsPrefix(d.bp, 'es ')
                           || strncmpiIsPrefix(d.bp, "'s ")) {
                    advance(d, 3);
                } else if (!d.bp && !d.actualn && !d.dn && !d.un && !d.oclass) {
                    /* no referent; they don't really mean a monster type */
                    d.bp = obp;
                    d.consumed = obpConsumed;
                    d.mntmp = NON_PM;
                }
            }
        }
    }

    /* first change to singular if necessary */
    if (d.bp
        /* we want "tricks" to match "bag of tricks" but that wouldn't work
           if it gets singularized to "trick" */
        && !strcmpiEqual(d.bp, 'tricks')
        /* an odd potential wish; fail rather than get a false match with
           "cloth" because it might yield a "cloth spellbook" */
        && !strcmpiEqual(d.bp, 'clothes')) {
        const sng = makesingular(d.bp);

        if (d.bp !== sng) {
            if (d.cnt === 1) d.cnt = 2;
            d.bp = sng;
        }
    }

    /* Alternate spellings (pick-ax, silver sabre, &c) */
    for (const as of spellings) {
        if (wishymatch(d.bp, as.sp, true)) {
            d.typ = as.ob;
            return 2; /*goto typfnd;*/
        }
    }
    /* can't use spellings list for this one due to shuffling */
    if (strncmpiIsPrefix(d.bp, 'grey spell'))
        d.bp = `${d.bp.slice(0, 2)}a${d.bp.slice(3)}`;

    if ((p = strstri(d.bp, 'armour')) >= 0) {
        /* skip past "armo", then copy remainder beyond "u" */
        d.bp = d.bp.slice(0, p + 4) + d.bp.slice(p + 5);
    }

    /* dragon scales - assumes order of dragons */
    if (strcmpiEqual(d.bp, 'scales')
        && d.mntmp >= PM_GRAY_DRAGON && d.mntmp <= PM_YELLOW_DRAGON) {
        d.typ = GRAY_DRAGON_SCALES + d.mntmp - PM_GRAY_DRAGON;
        d.mntmp = NON_PM; /* no monster */
        return 2; /*goto typfnd;*/
    }

    d.p = d.bp.length; /* C's d->p = eos(d->bp) */
    if (endsWithFold(d.bp, 'holy water')) {
        /* neither "holy water" nor "unholy water" is an actual potion type,
           and adjective parsing stops at "potion of ..." */
        if (endsWithFold(d.bp, 'unholy water')) {
            d.iscursed = 1;
            d.blessed = d.uncursed = 0; /* unholy water */
        } else {
            d.blessed = 1;
            d.iscursed = d.uncursed = 0; /* holy water */
        }
        d.typ = POT_WATER;
        return 2; /*goto typfnd;*/
    }
    /* accept "paperback" or "paperback book", reject "paperback spellbook" */
    if (strncmpiIsPrefix(d.bp, 'paperback')) {
        const dbp = d.bp.slice(9); /* just past "paperback" */

        if (!dbp || strncmpiIsPrefix(dbp, ' book')) {
            d.typ = SPE_NOVEL;
            return 2; /*goto typfnd;*/
        }
        d.otmp = null;
        return 3;
    }
    if (d.unlabeled && endsWithFold(d.bp, 'scroll')) {
        d.typ = SCR_BLANK_PAPER;
        return 2; /*goto typfnd;*/
    }
    if (d.unlabeled && endsWithFold(d.bp, 'spellbook')) {
        d.typ = SPE_BLANK_PAPER;
        return 2; /*goto typfnd;*/
    }
    /* specific food rather than color of gem/potion/spellbook[/scales] */
    if (endsWithFold(d.bp, 'orange') && d.mntmp === NON_PM) {
        d.typ = ORANGE;
        return 2; /*goto typfnd;*/
    }
    if (endsWithFold(d.bp, 'gold piece') || endsWithFold(d.bp, 'zorkmid')
        || strcmpiEqual(d.bp, 'gold') || strcmpiEqual(d.bp, 'money')
        || strcmpiEqual(d.bp, 'coin') || d.bp[0] === GOLD_SYM) {
        // objnam.c:4531-4544 builds gold with mksobj() and returns it without
        // reaching typfnd:, which is outside this port's boundary.
        throw new UnsupportedWishError('a wish for gold', origbp(d));
    }

    /* check for single character object class code ("/" for wand, &c) */
    if (d.bp.length === 1) {
        // objnam.c:4547-4551.  def_char_to_objclass() is unported, and both
        // outcomes are outside the boundary: a class symbol reaches `any:`
        // with no type, and no objects[] name or description is one character
        // long, so anything else matches nothing.
        throw new UnsupportedWishError('a one-character wish', origbp(d));
    }

    /* Search for class names: XXXXX potion, scroll of XXXXX.
       Avoid false hits on, e.g., rings for "ring mail". */
    if (!strncmpiIsPrefix(d.bp, 'enchant ')
        && !strncmpiIsPrefix(d.bp, 'destroy ')
        && !strncmpiIsPrefix(d.bp, 'detect food')
        && !strncmpiIsPrefix(d.bp, 'food detection')
        && !strncmpiIsPrefix(d.bp, 'ring mail')
        && !strncmpiIsPrefix(d.bp, 'studded leather armor')
        && !strncmpiIsPrefix(d.bp, 'leather armor')
        && !strncmpiIsPrefix(d.bp, 'tooled horn')
        && !strncmpiIsPrefix(d.bp, 'food ration')
        && !strncmpiIsPrefix(d.bp, 'meat ring')) {
        for (let i = 0; i < wrpsym.length; i++) {
            const j = wrp[i].length;

            /* check for "<class> [ of ] something" */
            if (strncmpiIsPrefix(d.bp, wrp[i])) {
                d.oclass = wrpsym[i];
                if (d.oclass !== AMULET_CLASS) {
                    advance(d, j);
                    if (strncmpiIsPrefix(d.bp, ' of '))
                        d.actualn = d.bp.slice(4);
                    /* else if(*bp) ?? */
                } else {
                    d.actualn = d.bp;
                }
                return 1; /*goto srch;*/
            }
            /* check for "something <class>" */
            if (endsWithFold(d.bp, wrp[i])) {
                d.oclass = wrpsym[i];
                /* for "foo amulet", leave the class name so that wishymatch()
                   can do "of inversion" to try matching "amulet of foo" */
                if (d.oclass !== AMULET_CLASS) {
                    d.p -= j;
                    let cut = d.p;
                    if (cut > 0 && d.bp[cut - 1] === ' ') cut -= 1;
                    d.bp = d.bp.slice(0, cut);
                } else {
                    /* amulet without "of"; convoluted wording but better a
                       special case that's handled than one that's missing */
                    if (strncmpiIsPrefix(d.bp, 'versus poison ')) {
                        d.typ = AMULET_VERSUS_POISON;
                        return 2; /*goto typfnd;*/
                    }
                    // objnam.c:4605-4615 strips " amulet" and calls
                    // rnd_otyp_by_namedesc(amubuf, AMULET_CLASS, 0), which
                    // draws; refuse before it.
                    throw new UnsupportedWishError('a "<shape> amulet" wish',
                                                   origbp(d));
                }
                d.actualn = d.dn = d.bp;
                return 1; /*goto srch;*/
            }
        }
    }

    /* Wishing in wizard mode can create traps and furniture.
     * Part I:  distinguish between trap and object for the two types of traps
     * which have corresponding objects:  bear trap and land mine.
     */
    if (state.wizard && (strncmpiIsPrefix(d.bp, 'bear')
                         || strncmpiIsPrefix(d.bp, 'land'))) {
        const beartrap = lowc(d.bp[0]) === 'b';
        let zp = d.bp.slice(4); /* skip "bear"/"land" */

        if (zp[0] === ' ') zp = zp.slice(1); /* embedded space is optional */
        if (strncmpiIsPrefix(zp, beartrap ? 'trap' : 'mine')) {
            zp = zp.slice(4);
            if (d.trapped === 2 || strcmpiEqual(zp, ' object')) {
                /* "untrapped <foo>" or "<foo> object" */
                d.typ = beartrap ? BEARTRAP : LAND_MINE;
                return 2; /*goto typfnd;*/
            } else if (d.trapped === 1 || zp !== '') {
                // objnam.c:4653-4658 goes to wiztrap:, where wizterrainwish()
                // builds a trap rather than an object.
                throw new UnsupportedWishError('a wizard-mode trap wish',
                                               origbp(d));
            }
            /* [no prefix or suffix; we're going to end up matching
               the object name and getting a disarmed trap object] */
        }
    }

    return 0;
}

// C ref: objnam.c readobjnam_postparse2() (4665-4724).
export function readobjnam_postparse2(d, env) {
    /* "grey stone" check must be before general "stone" */
    for (const row of o_ranges)
        if (strcmpiEqual(d.bp, row.name)) {
            d.typ = rnd_class(row.f_o_range, row.l_o_range, env);
            return 2; /*goto typfnd;*/
        }

    if (endsWithFold(d.bp, ' stone') || endsWithFold(d.bp, ' gem')) {
        d.bp = d.bp.slice(0,
                          d.p - (strcmpiEqual(d.bp.slice(d.p - 4), ' gem')
                                 ? 4 : 6));
        d.oclass = GEM_CLASS;
        d.dn = d.actualn = d.bp;
        return 1; /*goto srch;*/
    } else if (strcmpiEqual(d.bp, 'looking glass')) {
        /* avoid false hit on "* glass" */
    } else if (endsWithFold(d.bp, ' glass') || strcmpiEqual(d.bp, 'glass')) {
        // objnam.c:4686-4714 treats "broken glass" as a non-existent item and
        // draws rn2(NUM_GLASS_GEMS) for a bare "glass"; both are outside this
        // port's boundary, and the canonical-form rewrite below them feeds
        // only those two.
        throw new UnsupportedWishError('a glass-gem wish', origbp(d));
    }

    d.actualn = d.bp;
    if (!d.dn)
        d.dn = d.actualn; /* ex. "skull cap" */

    return 0;
}

// C ref: objnam.c readobjnam_postparse3()'s head and its first match
// (4726-4750).
export function readobjnam_postparse3(d, env) {
    const { state } = env;

    /* check real names of gems first */
    if (!d.oclass && d.actualn) {
        for (let i = state.svb.bases[GEM_CLASS]; i <= LAST_REAL_GEM; i++) {
            const zn = OBJ_NAME(state.objects[i], state);

            if (zn != null && strcmpiEqual(d.actualn, zn)) {
                d.typ = i;
                return 2; /*goto typfnd;*/
            }
        }
        /* "tin of foo" would be caught above, but plain "tin" has
           a random chance of yielding "tin wand" unless we do this */
        if (strcmpiEqual(d.actualn, 'tin')) {
            d.typ = TIN;
            return 2; /*goto typfnd;*/
        }
    }

    if ((d.typ = rnd_otyp_by_namedesc(d.actualn, d.oclass, 1, env))
        !== STRANGE_OBJECT)
        return 2; /*goto typfnd;*/
    // objnam.c:4751-4758 tries d.dn, d.un and d.origbp next, each with its own
    // draw, and 4760-4899 goes on to Japanese item names, the ARMOR_CLASS
    // " mail" retry, spinach, named fruits, artifacts and the class-filtered
    // spellings list.  A wish that reaches here has matched nothing, so
    // rnd_otyp_by_namedesc() answered STRANGE_OBJECT without drawing.
    throw new UnsupportedWishError(
        'a name the first objects[] lookup does not resolve', origbp(d));
}

// The fields readobjnam_preparse() and readobjnam_parse_charges() can set that
// still feed fine-tuning code this port has not reached -- d.islit's light
// source at objnam.c:5086-5091, and everything from the erosion block at 5271
// through the partly-eaten one at 5383 -- with the value readobjnam_init()
// gives each.  d.spe, d.spesgn, d.blessed, d.uncursed and d.iscursed are absent
// because the typfnd: tail now applies all five.
const UNSUPPORTED_WISH_FIELDS = Object.freeze({
    rechrg: 0, islit: 0, erodeproof: 0,
    eroded: 0, eroded2: 0, very: 0, unlabeled: 0, ispoisoned: 0,
    trapped: 0, locked: 0, unlocked: 0, broken: 0,
    open: 0, closed: 0, doorless: 0, looted: 0,
    isgreased: 0, halfeaten: 0, ishistoric: 0, isdiluted: 0,
    real: 0, fake: 0, gsize: 0, wetness: 0, zombify: false,
    mgend: -1, contents: TIN_UNDEFINED,
});

// The wish boundary, checked before the parse chain can spend a random number.
// A guard placed after the chain would let a wish outside the boundary draw
// first and stop afterwards.
//
// The count is not tested here.  readobjnam_postparse1()'s makesingular() block
// raises d.cnt to 2 after this runs, so a count refused here would still let
// "daggers" through.  readobjnam() tests it once postparse1 has settled it.
function requireSimpleWishQualifiers(d) {
    for (const [field, value] of Object.entries(UNSUPPORTED_WISH_FIELDS))
        if (d[field] !== value)
            throw new UnsupportedWishError(`a wish that sets ${field}`,
                                           origbp(d));
}

// The types the typfnd: tail cannot finish.  Each names the fine-tuning block
// it would reach, and each is refused before mksobj().  A type is not known
// until readobjnam_postparse3() has matched it, so the one draw that match
// makes has already happened -- it is the draw C makes, in C's order, and no
// later one follows it.
// The stack boundary.  objnam.c:5071-5083's wizard arm assigns otmp->quan from
// d.cnt, and nothing has yet checked the inventory line hold_another_object()
// prints for a stack, so a wish that would set quan above 1 stops.
//
// Both operands have to be read here rather than beside the qualifier guard.
// d.cnt is not settled until readobjnam_postparse1() has run: "pair of " doubles
// it at objnam.c:4408 and the makesingular() block at 4423-4433 raises it from 1
// to 2, so "daggers" and "the daggers" arrive at the earlier guard holding 1.
// And oc_merge is not knowable until postparse3() has resolved the type.  Both
// are needed, because the tail leaves quan alone for a type that does not merge:
// "pair of speed boots" reaches d.cnt 2 and still produces the single pair C
// produces, so refusing on the count alone would stop a wish C completes.
//
// This stands after postparse3()'s lookup, which is the one draw C makes in the
// same place, and before mksobj(), so no draw follows the stop.
function requireSingleWishedObject(d, type, state) {
    if (d.cnt > 1 && type.oc_merge && state.wizard) {
        throw new UnsupportedWishError('a wish for more than one object',
                                       origbp(d));
    }
}

function requireSimpleWishedObject(d, type, state) {
    const refuse = (reason) => {
        throw new UnsupportedWishError(reason, origbp(d));
    };
    if (!state.wizard) {
        /* objnam.c:4999-5023 substitutes for five wizard-only types and
           refuses an oc_nowish one; wiz_wish() is this port's only caller. */
        refuse('a wish outside wizard mode');
    }
    if (type.oc_unique) {
        /* mksobj() makes an oc_unique type an artifact, which
           objnam.c:5348-5357 then measures with rn2(nartifact_exist()). */
        refuse('a wish for a unique object');
    }
    switch (d.typ) {
    case TIN: /* objnam.c:5121-5129 and 5311-5312 */
    case SLIME_MOLD: /* 5134-5136, the named-fruit spe */
    case CORPSE: /* 5140-5158, which draws rn2(2) for a gender */
    case STATUE:
    case FIGURINE:
    case EGG: /* 5223-5231, set_corpsenm()'s hatch timer */
        refuse('a wish for a corpse, statue, figurine, egg or tin');
        break;
    default:
        break;
    }
    if (isContainer({ otyp: d.typ })) {
        /* objnam.c:5289-5299 empties a container and 5301-5310 sets its lock
           state; mksobj() also fills a chest, which this port has not
           verified through a wish. */
        refuse('a wish for a container');
    }
}

// C ref: objnam.c readobjnam() (4902-5400).  `no_wish` is the caller's
// sentinel object, answered for "nothing", "nil" and "none"; C compares its
// address, so identity is what matters here too.
export function readobjnam(bp, no_wish, env = {}) {
    const normalized = wishEnv(env);
    const { state } = normalized;
    const random = wishRandom(normalized);
    const d = readobjnam_init(bp, state);

    if (bp == null) {
        // objnam.c:4913-4914 goes straight to `any:`, whose
        // wrpsym[rn2(sizeof wrpsym)] grants a random object.
        throw new UnsupportedWishError('a wish with no text', '');
    }

    /* first, remove extra whitespace they may have typed */
    d.bp = mungspaces(bp);
    /* allow wishing for "nothing" to preserve wishless conduct...
       [now requires "wand of nothing" if that's what was really wanted] */
    if (strcmpiEqual(d.bp, 'nothing') || strcmpiEqual(d.bp, 'nil')
        || strcmpiEqual(d.bp, 'none'))
        return no_wish;
    /* save the [nearly] unmodified choice string */
    d.fruitbuf = d.bp;

    if (readobjnam_preparse(d, state)) {
        // objnam.c:4924-4925.  A line of nothing but qualifiers reaches
        // `any:` and its wrpsym[rn2(13)] draw.
        throw new UnsupportedWishError('a wish with no object name', origbp(d));
    }

    if (!d.cnt)
        d.cnt = 1; /* will be changed to 2 if makesingular() changes string */

    readobjnam_parse_charges(d);
    requireSimpleWishQualifiers(d);

    let action = readobjnam_postparse1(d, normalized);
    // Two refusals stand here rather than at typfnd:, because
    // readobjnam_postparse3() would otherwise draw first -- "gnome corpse"
    // spends rn2(1) on CORPSE before its monster becomes visible again, and
    // "long sword named Foo" spends rn2(51) on a sword it then declines to
    // name.
    if (d.mntmp >= LOW_PM
        && !(d.mntmp >= PM_GRAY_DRAGON && d.mntmp <= PM_YELLOW_DRAGON)) {
        // objnam.c:5026-5030 turns a wished-for pudding corpse into a glob,
        // and 5206-5245 sets corpsenm for a tin, corpse, egg, figurine or
        // statue.  The ten dragons pass because the one arm of that block this
        // port has, `case SCALE_MAIL` at 5246-5251, is theirs; a dragon in
        // front of a type the tail cannot finish is still refused below, after
        // the lookup draw C makes in the same place.
        throw new UnsupportedWishError('a wish naming a monster type',
                                       origbp(d));
    }
    if (d.name) {
        // objnam.c:5325-5346 runs the name through artifact_name(),
        // lookup_novel() and oname().
        throw new UnsupportedWishError('a " named " wish', origbp(d));
    }
    if (action === 0) /* C breaks out of the switch into retry: */
        action = readobjnam_postparse2(d, normalized);
    if (action === 0 || action === 1) /* 1 is C's goto srch: */
        action = readobjnam_postparse3(d, normalized);
    if (action !== 2) {
        // Each of C's other codes is refused where its branch is raised: 3
        // returns d.otmp, 4 goes to `any:`, 5 to wiztrap: and 6 back to
        // retry:.  This is the fail-closed backstop.
        throw new UnsupportedWishError(`readobjnam action ${action}`,
                                       origbp(d));
    }

    /* typfnd: */
    if (d.typ)
        d.oclass = state.objects[d.typ].oc_class;

    requireSimpleWishedObject(d, objectType(d.typ, state), state);
    requireSingleWishedObject(d, objectType(d.typ, state), state);

    /*
     * Create the object, then fine-tune it.
     */
    d.otmp = mksobj(d.typ, true, false, normalized);
    d.typ = d.otmp.otyp;
    d.oclass = d.otmp.oclass; /* what we actually got */

    /* if player specified a reasonable count, maybe honor it; d.otmp->globby
       is false because a glob wish is refused in readobjnam_postparse1() */
    if (d.cnt > 0) {
        if (objectType(d.typ, state).oc_merge
            /* quantity isn't restricted when debugging; the three
               alternatives at objnam.c:5077-5083, one of which draws rnd(6),
               belong to the non-wizard wish refused above */
            && state.wizard)
            d.otmp.quan = d.cnt;
    }

    // objnam.c:5086-5091 lights a wished-for light source; d.islit is 0, so it
    // does not run.

    if (d.spesgn === 0) {
        /* spe not specified; retain the randomly assigned value */
        d.spe = d.otmp.spe;
    }
    // objnam.c:5097-5098 leaves a wizard's requested enchantment alone, capped
    // only by the SPE_LIM readobjnam_parse_charges() has already applied.  The
    // 5099-5117 clamps against rnd(5), Luck and the rolled spe belong to the
    // non-wizard hero requireSimpleWishedObject() refuses above.
    if (d.spesgn === -1)
        d.spe = -d.spe;

    /* set otmp->spe.  This may, or may not, use d.spe... */
    switch (d.typ) {
    case TOWEL:
        // d.wetness is 0 for every wish this port admits, because
        // readobjnam_preparse()'s "wet " and "moist " arms set it and
        // UNSUPPORTED_WISH_FIELDS refuses them.  The arm is still needed: it is
        // what stops a requested enchantment from reaching a towel, which C
        // leaves at the 0 mksobj() rolled.
        if (d.wetness)
            d.otmp.spe = d.wetness;
        break;
    case SKELETON_KEY:
    case HEAVY_IRON_BALL:
    case IRON_CHAIN:
        /* objnam.c:5141-5146 breaks without assigning otmp->spe */
        break;
    /* scroll of mail:  0: delivered in-game via external event (or randomly
       for fake mail); 1: from bones or wishing; 2: written with marker */
    case SCR_MAIL:
        // objnam.c:5168-5174 wraps this arm in #ifdef MAIL_STRUCTURES, which
        // include/global.h:430 defines unconditionally.  include/objects.h
        // gates the SCR_MAIL row on the same macro, and js/objects.js carries
        // that row, so the comparison build has both.
        d.otmp.spe = 1;
        break;
    /* splash of venom:  0: normal, and transitory; 1: wishing */
    case ACID_VENOM:
    case BLINDING_VENOM:
        d.otmp.spe = 1;
        break;
    default:
        // objnam.c:5123-5187's other arms belong to types
        // requireSimpleWishedObject() refuses: TIN, SLIME_MOLD, CHEST,
        // LARGE_BOX, STATUE, FIGURINE and CORPSE.  WAN_WISHING falls through
        // to here for a wizard, which is the only hero that reaches this code.
        d.otmp.spe = d.spe;
        break;
    }

    /* set otmp->corpsenm or dragon scale [mail] */
    if (ismnum(d.mntmp)) {
        // objnam.c:5195-5203 renames a long worm tail and switches a
        // werecreature to its human form.  Only the ten dragons reach here,
        // and none of them is either, so both rewrites are dead.
        switch (d.typ) {
        case SCALE_MAIL:
            /* Dragon mail - depends on the order of objects & dragons. */
            // Both operands hold for every wish that arrives, because the
            // refusal above admits no other monster; the test is kept because
            // C has it, and it starts doing work the moment that widens.
            if (d.mntmp >= PM_GRAY_DRAGON && d.mntmp <= PM_YELLOW_DRAGON)
                d.otmp.otyp = GRAY_DRAGON_SCALE_MAIL + d.mntmp
                              - PM_GRAY_DRAGON;
            break;
        default:
            // objnam.c:5206-5245's TIN, CORPSE, EGG, FIGURINE and STATUE arms
            // belong to types requireSimpleWishedObject() refuses.
            break;
        }
    }

    /* set blessed/cursed -- setting the fields directly is safe
     * since weight() is called below and addinv() will take care
     * of luck */
    if (d.iscursed) {
        curseFreeObject(d.otmp, normalized);
    } else if (d.uncursed) {
        d.otmp.blessed = false;
        // C's second operand is `(Luck < 0 && !wizard)`, and the arm below
        // reads `(Luck >= 0 || wizard)`.  Every wish this port admits is a
        // wizard's, so `wizard` settles both without reading Luck -- which
        // has no owner in the port yet.
        d.otmp.cursed = false;
    } else if (d.blessed) {
        d.otmp.blessed = true;
        d.otmp.cursed = false;
    } else if (d.spesgn < 0) {
        curseFreeObject(d.otmp, normalized);
    }

    /* set eroded and erodeproof; js/obj.js owns objnam.c erosion_matters()
       under the name erosionMatters(), where trap.c's erode_obj() found it
       first */
    if (erosionMatters(d.otmp, state)) {
        /* wished-for item shouldn't be eroded unless specified */
        d.otmp.oeroded = 0;
        d.otmp.oeroded2 = 0;
        // d.eroded, d.eroded2 and d.erodeproof are 0, so the three arms at
        // objnam.c:5269-5283 assign nothing.
    }

    /* set otmp->recharged */
    if (d.oclass === WAND_CLASS) {
        /* prevent wishing abuse; the WAN_WISHING clamp at objnam.c:5287-5288
           belongs to the non-wizard wish refused above */
        d.otmp.recharged = d.rechrg;
    }

    // objnam.c:5292-5323: poisoned, [un]trapped, empty containers, box lock
    // states, greased, diluted and the tin variety all need a qualifier or a
    // type refused above, and 5325-5346's oname() needs d.name.

    if (permapoisoned(d.otmp))
        d.otmp.opoisoned = 1;

    /* more wishing abuse: don't allow wishing for certain artifacts */
    /* and make them pay; charge them for the wish anyway! */
    if ((is_quest_artifact(d.otmp, state)
         || (d.otmp.oartifact && random.rn2(nartifact_exist(state)) > 1))
        && !state.wizard) {
        // objnam.c:5350-5356 destroys the object and answers hands_obj.
        throw new UnsupportedWishError('an artifact denied to a non-wizard',
                                       origbp(d));
    }

    // objnam.c:5359-5370's partly-eaten arm needs d.halfeaten.
    d.otmp.owt = weight(d.otmp, normalized);
    // d.very is 0, so objnam.c:5372's HEAVY_IRON_BALL bonus does not apply.

    return d.otmp;
}
