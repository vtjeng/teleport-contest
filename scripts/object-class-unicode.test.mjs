// Source-pinned test for symbols.js object_class_symbol(): which object
// glyphs a symbol set's S_* object-class Unicode entry reaches.
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNethackrc } from '../js/options.js';
import { initialize_symbols_from_options, object_class_symbol } from '../js/symbols.js';
import { AMULET_CLASS, RING_CLASS } from '../js/objects.js';

test('an S_* object-class Unicode entry reaches object index class - 1', () => {
    // dat/symbols, Enhanced2: "S_amulet: U+2299". glyphs.c:1138-1142 gives
    // find_oc the loadsyms[] offset, AMULET_CLASS - 1 = RING_CLASS, and
    // glyphs.c:258-261 matches glyph_to_obj() against it, so the glyph of
    // object index 4 (the generic ring) takes the Unicode.
    const state = {};
    initialize_symbols_from_options(
        parseNethackrc('OPTIONS=symset:Enhanced2'), state,
    );
    const ring = object_class_symbol(RING_CLASS, state, RING_CLASS);
    assert.equal(ring.displayCh, '⊙');
    // The byte stays the ring class's own ('=', 61), as wiz_custom() shows.
    assert.equal(ring.ttychar, 61);
    // The generic amulet keeps its byte: S_tool, the next class, has none.
    const amulet = object_class_symbol(AMULET_CLASS, state, AMULET_CLASS);
    assert.equal(amulet.displayCh, undefined);
    assert.equal(amulet.ch, '"');
    // A concrete object (index 200, any real otyp past the generics) never
    // takes a class entry.
    assert.equal(object_class_symbol(RING_CLASS, state, 200).displayCh, undefined);
});
