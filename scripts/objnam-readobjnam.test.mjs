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

import { fuzzymatch, strstri } from '../js/hacklib.js';
import {
    RANDOM_TIN,
    TIN_UNDEFINED,
    UnsupportedWishError,
    o_ranges,
    readobjnam,
    rnd_otyp_by_namedesc,
    readobjnam_init,
    readobjnam_parse_charges,
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
    ARMOR_CLASS,
    ARROW,
    BAG_OF_TRICKS,
    BEARTRAP,
    BRASS_LANTERN,
    CLOAK_OF_DISPLACEMENT,
    ELVEN_BOOTS,
    FAKE_AMULET_OF_YENDOR,
    FOOD_CLASS,
    FOOD_RATION,
    GAUNTLETS_OF_POWER,
    GEM_CLASS,
    GRAY_DRAGON_SCALES,
    GRAY_DRAGON_SCALE_MAIL,
    HELM_OF_TELEPATHY,
    JADE,
    KATANA,
    LAND_MINE,
    LEATHER_ARMOR,
    LONG_SWORD,
    LUCKSTONE,
    MAGIC_LAMP,
    MEAT_RING,
    OIL_LAMP,
    POTION_CLASS,
    POT_SEE_INVISIBLE,
    POT_WATER,
    RED_DRAGON_SCALE_MAIL,
    RING_CLASS,
    RING_MAIL,
    SACK,
    SCALE_MAIL,
    SCROLL_CLASS,
    SCR_MAGIC_MAPPING,
    SCR_MAIL,
    SPBOOK_CLASS,
    SPEED_BOOTS,
    SPE_FINGER_OF_DEATH,
    SPE_NOVEL,
    SPE_WIZARD_LOCK,
    STRANGE_OBJECT,
    TOOLED_HORN,
    TOOL_CLASS,
    TOWEL,
    VENOM_CLASS,
    WAN_DEATH,
    WAND_CLASS,
    WEAPON_CLASS,
    YELLOW_DRAGON_SCALES,
    YELLOW_DRAGON_SCALE_MAIL,
} from '../js/objects.js';
import { NON_PM, SPE_LIM } from '../js/const.js';
import { init_artifacts } from '../js/artifacts.js';
import { name_to_monplus } from '../js/mondata.js';
import {
    PM_GRAY_DRAGON, PM_RED_DRAGON, PM_YELLOW_DRAGON, monst_globals_init,
} from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { objects_globals_init } from '../js/objects.js';
import { roles } from '../js/roles.js';

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

// objnam.c o_ranges[] (3346-3366).
test('o_ranges carries the nineteen wishable subranges', () => {
    assert.equal(o_ranges.length, 19);
    assert.deepEqual(o_ranges[0], {
        name: 'bag', oclass: TOOL_CLASS, f_o_range: SACK,
        l_o_range: BAG_OF_TRICKS,
    });
    // The row that catches a bare "lamp" before the description lookup can.
    assert.deepEqual(o_ranges[1], {
        name: 'lamp', oclass: TOOL_CLASS, f_o_range: OIL_LAMP,
        l_o_range: MAGIC_LAMP,
    });
    // "gray stone" and "grey stone" are the last two rows and share a range.
    assert.equal(o_ranges[17].name, 'gray stone');
    assert.equal(o_ranges[18].name, 'grey stone');
    assert.equal(o_ranges[18].f_o_range, LUCKSTONE);
    assert.equal(o_ranges[17].oclass, GEM_CLASS);
    // Every row's range runs forward, which rnd_class() relies on.
    for (const row of o_ranges)
        assert.ok(row.l_o_range >= row.f_o_range, row.name);
    // Only these five classes appear in the table.
    assert.deepEqual(
        [...new Set(o_ranges.map((row) => row.oclass))].sort((a, b) => a - b),
        [WEAPON_CLASS, ARMOR_CLASS, TOOL_CLASS, GEM_CLASS, VENOM_CLASS]
            .sort((a, b) => a - b),
    );
});

// objnam.c spellings[] (3372-3429), counted without C's terminating null row.
test('spellings carries the forty-six alternate spellings', () => {
    assert.equal(spellings.length, 46);
    assert.equal(spellings[0].sp, 'pickax');
    // "lantern" is the entry that turns a bare "lantern" into BRASS_LANTERN
    // (objects.h:930 names it "brass lantern"), and it is a `return 2` that
    // skips readobjnam_postparse3() entirely.
    assert.equal(spellings.find((row) => row.sp === 'lantern').ob,
                 BRASS_LANTERN);
    assert.equal(spellings.at(-1).sp, 'flintstone');
    // No row's spelling is empty; C's loop would stop there.
    for (const row of spellings) assert.ok(row.sp.length > 0);
});

// objnam.c wrp[] and wrpsym[] (2517-2528).
test('wrp and wrpsym pair the class words with their class symbols', () => {
    assert.equal(wrp.length, 13);
    assert.equal(wrpsym.length, 13);
    assert.deepEqual(wrpsym.slice(0, 8), [
        WAND_CLASS, RING_CLASS, POTION_CLASS, SCROLL_CLASS,
        GEM_CLASS, AMULET_CLASS, SPBOOK_CLASS, SPBOOK_CLASS,
    ]);
    // "spellbook" and "spell book" both name SPBOOK_CLASS; "food" and
    // "comestible" both name FOOD_CLASS.
    assert.equal(wrp[6], 'spellbook');
    assert.equal(wrp[7], 'spell book');
    assert.equal(wrpsym[11], FOOD_CLASS);
    assert.equal(wrpsym[12], FOOD_CLASS);
    assert.equal(wrp[11], 'food');
    assert.equal(wrp[12], 'comestible');
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

// A wizard-mode game with a shuffled objects[] and an initialized monster
// catalog: readobjnam() reads OBJ_DESCR(), which o_init.c shuffles, and calls
// name_to_monplus(), which needs monst_globals_init().  Zero choices
// deterministically initialize every randomized description.
function wishState() {
    const wizard = roles.find((role) => role.filecode === 'Wiz');
    const state = {
        // Object and monster id 1 is reserved; startup begins from 2.
        context: { ident: 2, current_fruit: 1 },
        flags: { implicit_uncursed: true, initalign: 0, invlet_constant: true },
        gf: { ffruit: { fid: 1, fname: 'slime mold', nextf: null } },
        iflags: {},
        program_state: { gameover: false, in_moveloop: true },
        moves: 1,
        u: { uprops: [], ulevel: 1, uluck: 0 },
        urole: { ...wizard },
        wizard: true,
    };
    objects_globals_init(state);
    init_objects(state, () => 0);
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
    const find = (name, oclass = 0) =>
        rnd_otyp_by_namedesc(name, oclass, 1, { state, random });

    // The objects[] name.
    assert.equal(find('magic lamp'), MAGIC_LAMP);
    // The " of " partial at 3499-3506: "tricks" has to reach "bag of tricks".
    assert.equal(find('tricks'), BAG_OF_TRICKS);
    // A shuffled description, which o_init.c assigns and objects.c does not:
    // with every shuffle choice zero, "mud boots" lands on ELVEN_BOOTS.
    assert.equal(find('mud boots'), ELVEN_BOOTS);
    // The partial description at 3510-3512: "cloth" has to reach the cloak
    // whose description is "piece of cloth".
    assert.equal(find('cloth'), CLOAK_OF_DISPLACEMENT);
    // The scan runs to the last objects[] entry, which is ACID_VENOM.
    assert.equal(find('acid venom'), ACID_VENOM);
    // 3504-3505 keeps the glob range out of the " of " partial match, so
    // neither end of it answers its monster's name.  Both ends matter: the
    // range is tested with `<` at one end and `>` at the other.
    assert.equal(find('gray ooze'), STRANGE_OBJECT);
    assert.equal(find('black pudding'), STRANGE_OBJECT);
    // Only the objects[] name is matched with retry_inverted set, so an
    // inverted description finds nothing where the description itself works.
    assert.equal(find('boots of mud'), STRANGE_OBJECT);
    // Nothing matches, and no draw is made: STRANGE_OBJECT is 0.
    draws.length = 0;
    assert.equal(find('florble'), STRANGE_OBJECT);
    assert.deepEqual(draws, []);
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
    assert.equal(resolved('tricks'), undefined); // a container, refused below
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
    // word with nothing after it.
    assert.equal(wish(state, 'spellbook').refusal,
                 'a name the first objects[] lookup does not resolve');
    // 4283-4284: the Amulet's description has to open the name or follow a
    // space, so one embedded in a word is not it.
    assert.equal(wish(state, 'brassAmulet of Yendor').refusal,
                 'a name the first objects[] lookup does not resolve');
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
    // These two name no object at all, so the lookup is what fails; had the
    // exception been missing, the "master" and "ninja" rank titles would have
    // matched instead.
    assert.equal(reason('master key'),
                 'a name the first objects[] lookup does not resolve');
    assert.equal(reason('ninja-to'),
                 'a name the first objects[] lookup does not resolve');
    // "magenta" is a potion description; the "mage" rank must not take it.
    assert.equal(wish(state, 'magenta').obj.otyp, POT_SEE_INVISIBLE);
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
                 'a name the first objects[] lookup does not resolve');
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
    // 4260-4270's " named ", which the oname() tail cannot finish.
    assert.equal(reason('long sword named Foo'), 'a " named " wish');
    // 4152-4174's corpse/statue/figurine gender hack.
    assert.equal(reason('statue of a gnome'),
                 'a "corpse/statue/figurine of" wish');
});
