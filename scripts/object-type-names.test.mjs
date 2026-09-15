import assert from 'node:assert/strict';
import test from 'node:test';
import { BUFSZ, NON_PM } from '../js/const.js';
import { PM_SAMURAI } from '../js/monsters.js';
import { decodeUtf8ByteString, encodeUtf8ByteString } from '../js/hacklib.js';
import { disco_typename, init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import { obj_typename, simple_typename, xcalled, xnameFresh } from '../js/objnam.js';
import { loadCalledTypeRecipes, verifyCalledTypeSegment } from './run-worn-glove-name.mjs';
import {
    AMULET_OF_REFLECTION, DART, FLINT, GAUNTLETS_OF_POWER, GOLD_PIECE,
    GRAY_DRAGON_SCALES,
    JADE, MAGIC_HARP, OIL_LAMP, POT_HEALING, RIN_PROTECTION, SCR_IDENTIFY,
    SPE_BOOK_OF_THE_DEAD, SPE_FORCE_BOLT, SPE_NOVEL, WAN_SLEEP, WOODEN_HARP,
    objects_globals_init,
} from '../js/objects.js';

function namingState() {
    // Distant naming prevents this formatting-only fixture from discovering
    // objects. Zero shuffle choices fix appearances; this is not a RNG test.
    const state = { gd: { distantname: 1 }, u: { uprops: [] }, iflags: {},
        flags: {}, urole: {}, program_state: {} };
    objects_globals_init(state);
    init_objects(state, () => 0);
    return state;
}
function object(state, otyp, fields = {}) {
    // A single seen object exercises the normal, non-plural class branch.
    return newObject({ otyp, oclass: state.objects[otyp].oc_class,
        quan: 1, dknown: true, corpsenm: NON_PM, ...fields });
}

test('xcalled reserves the NUL and truncates only the user suffix', () => {
    // C objnam.c:565–570: prefix plus " called " must fit before suffix.
    assert.equal(xcalled('wet ', BUFSZ, 'towel', 'bath'), 'wet towel called bath');
    const prefix = 'ring called ';
    const exact = prefix.length + 1; // Only the NUL fits after the prefix.
    assert.equal(xcalled('', exact, 'ring', 'discard'), prefix);
    assert.throws(() => xcalled('', exact - 1, 'ring', 'discard'), RangeError);
    assert.equal(xcalled('', exact + 3, 'ring', 'abcdef'), `${prefix}abc`);
    // C %.Ns counts bytes and may split the two-byte UTF-8 é.
    assert.equal(xcalled('', exact + 1, 'ring', 'é'),
        prefix + decodeUtf8ByteString([0xc3]));
    const unicode = xcalled('', exact + 3, 'ring', 'éé');
    assert.equal(encodeUtf8ByteString(unicode).length, exact + 2);
});

test('obj_typename preserves every class alias arm and appearance suffix', () => {
    const state = namingState();
    // C objnam.c:229–291 supplies each class word and called/description order.
    // The appearance strings come from objects.h after the zero-choice shuffle.
    const cases = [
        [POT_HEALING, 'potion called probe (purple-red)', 'potion of healing called probe (purple-red)'],
        [SCR_IDENTIFY, 'scroll called probe (KERNOD WEL)', 'scroll of identify called probe (KERNOD WEL)'],
        [WAN_SLEEP, 'wand called probe (runed)', 'wand of sleep called probe (runed)'],
        [SPE_FORCE_BOLT, 'spellbook called probe (red)', 'spellbook of force bolt called probe (red)'],
        [SPE_NOVEL, 'book called probe (paperback)', 'novel called probe (paperback)'],
        [RIN_PROTECTION, 'ring called probe (black onyx)', 'ring of protection called probe (black onyx)'],
        [AMULET_OF_REFLECTION, 'amulet called probe (hexagonal)', 'amulet of reflection called probe (hexagonal)'],
        [GAUNTLETS_OF_POWER, 'pair of riding gloves called probe', 'pair of gauntlets of power called probe (riding gloves)'],
        [FLINT, 'gray stone called probe', 'flint stone called probe (gray)'],
        [JADE, 'green gem called probe', 'jade stone called probe (green)'],
        [GOLD_PIECE, 'gold piece', 'gold piece'],
        [DART, 'dart called probe', 'dart called probe'],
    ];
    for (const [otyp, unknown, known] of cases) {
        const type = state.objects[otyp];
        type.oc_uname = 'probe';
        type.oc_name_known = false;
        assert.equal(obj_typename(otyp, state), unknown);
        type.oc_name_known = true;
        assert.equal(obj_typename(otyp, state), known);
    }
    // The unique book replaces, rather than follows, "spellbook of".
    state.objects[SPE_BOOK_OF_THE_DEAD].oc_name_known = true;
    state.objects[SPE_BOOK_OF_THE_DEAD].oc_uname = 'relic';
    assert.equal(obj_typename(SPE_BOOK_OF_THE_DEAD, state),
        'Book of the Dead called relic (papyrus)');
    state.urole.mnum = PM_SAMURAI;
    state.objects[WOODEN_HARP].oc_uname = 'strings';
    state.objects[WOODEN_HARP].oc_name_known = false;
    assert.equal(obj_typename(WOODEN_HARP, state), 'koto called strings');
});

test('Samurai discoveries put the English explanation before the alias', () => {
    const state = namingState();
    state.urole.mnum = PM_SAMURAI;
    // o_init.c:667–681 uses "harp" until the magical type is known.
    state.objects[MAGIC_HARP].oc_uname = 'strings';
    assert.equal(disco_typename(MAGIC_HARP, state), 'koto [harp] called strings');
    state.objects[MAGIC_HARP].oc_name_known = true;
    assert.equal(disco_typename(MAGIC_HARP, state), 'magic koto [magic harp] called strings (koto)');
});

test('obj_typename preserves the dragon set and null-name fallback arms', () => {
    const state = namingState();
    // objnam.c:257–258 prefixes dragon scales with "set of".
    state.objects[GRAY_DRAGON_SCALES].oc_uname = 'shed';
    assert.equal(obj_typename(GRAY_DRAGON_SCALES, state),
        'set of gray dragon scales called shed');
    // C's static-analyzer fallback distinguishes a generic class index from
    // a real object whose actual name is unexpectedly null.
    state.obj_descr[state.objects[DART].oc_name_idx].oc_name = null;
    assert.equal(obj_typename(DART, state), 'object?');
});

test('obj_typename reserves its appearance when a name fills BUFSZ', () => {
    const state = namingState();
    // At BUFSZ characters the suffix exceeds every caller's available room.
    for (const otyp of [POT_HEALING, AMULET_OF_REFLECTION, GAUNTLETS_OF_POWER, JADE]) {
        const type = state.objects[otyp];
        type.oc_uname = 'x'.repeat(BUFSZ);
        for (const known of [false, true]) {
            type.oc_name_known = known;
            const named = obj_typename(otyp, state);
            assert.equal(named.length, BUFSZ - 1);
            if (known || otyp === POT_HEALING || otyp === AMULET_OF_REFLECTION)
                assert.ok(named.endsWith(')'));
            const alias = type.oc_uname;
            assert.ok(!simple_typename(otyp, state).includes(' called '));
            assert.equal(type.oc_uname, alias);
        }
    }
});

test('xname existing class branches consume xcalled with source prefixes', () => {
    const state = namingState();
    // The ten xcalled sites in C xname_flags use class words except for
    // weapons/tools (appearance), armor (simple type), and mineral gems.
    for (const [otyp, base] of [
        [AMULET_OF_REFLECTION, 'amulet'], [DART, 'dart'], [OIL_LAMP, 'lamp'],
        [GAUNTLETS_OF_POWER, 'pair of gloves'], [POT_HEALING, 'potion'],
        [SCR_IDENTIFY, 'scroll'], [WAN_SLEEP, 'wand'], [SPE_NOVEL, 'novel'],
        [SPE_FORCE_BOLT, 'spellbook'], [RIN_PROTECTION, 'ring'],
        [JADE, 'gem'], [FLINT, 'stone'],
    ]) {
        state.objects[otyp].oc_name_known = false;
        state.objects[otyp].oc_uname = 'probe';
        assert.equal(xnameFresh(object(state, otyp), state), `${base} called probe`);
    }
    assert.equal(xnameFresh(object(state, POT_HEALING, { odiluted: true }), state),
        'diluted potion called probe');
    assert.equal(xnameFresh(object(state, POT_HEALING, { dknown: false }), state), 'potion');
    state.objects[POT_HEALING].oc_name_known = true;
    assert.equal(xnameFresh(object(state, POT_HEALING), state), 'potion of healing');
    state.iflags.override_ID = true;
    assert.equal(xnameFresh(object(state, WAN_SLEEP, { dknown: false }), state), 'wand of sleep');
});

test('long aliases retain xname plural and instance-name buffer bounds', () => {
    const state = namingState();
    const type = state.objects[WAN_SLEEP];
    type.oc_uname = 'x'.repeat(BUFSZ);
    // C PREFIX=80 leaves 175 visible bytes, including the plural's added s.
    const capacity = BUFSZ - 80 - 1;
    assert.equal(xnameFresh(object(state, WAN_SLEEP), state).length, capacity);
    const plural = xnameFresh(object(state, WAN_SLEEP, { quan: 2 }), state);
    assert.equal(plural.length, capacity);
    assert.ok(plural.startsWith('wands called '));
    const named = object(state, WAN_SLEEP);
    named.oextra = { oname: 'individual' };
    assert.equal(xnameFresh(named, state).length, capacity);
});

for (const { label, recipe } of loadCalledTypeRecipes()) {
    test(`independent ${label} reaches its stored alias and discoveries command`, async () => {
        await verifyCalledTypeSegment(recipe.segments[0]);
    });
}
