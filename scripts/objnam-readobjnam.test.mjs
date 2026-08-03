// The wish parser's pure half: hacklib.c fuzzymatch() and strstri(), and
// objnam.c wishymatch(), o_ranges[], spellings[], wrp[], wrpsym[],
// readobjnam_init() and readobjnam_parse_charges().
//
// None of these draws a random number, writes output or changes game state,
// so no recorded session can check them; the values below are read from the C
// source and are the only proof the port is right.

import assert from 'node:assert/strict';
import test from 'node:test';

import { fuzzymatch, strstri } from '../js/hacklib.js';
import {
    RANDOM_TIN,
    TIN_UNDEFINED,
    o_ranges,
    readobjnam_init,
    readobjnam_parse_charges,
    scanCount,
    spellings,
    wishymatch,
    wrp,
    wrpsym,
} from '../js/objnam_readobjnam.js';
import {
    AMULET_CLASS,
    ARMOR_CLASS,
    BAG_OF_TRICKS,
    BRASS_LANTERN,
    FOOD_CLASS,
    GEM_CLASS,
    LUCKSTONE,
    MAGIC_LAMP,
    OIL_LAMP,
    POTION_CLASS,
    RING_CLASS,
    SACK,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    TOOL_CLASS,
    VENOM_CLASS,
    WAND_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import { NON_PM, SPE_LIM } from '../js/const.js';

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
