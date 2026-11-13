// Source-pinned test for symbols.js readSymbolSetFile(): which object glyphs
// a UTF8 symbol set's S_* object-class Unicode entry reaches.
import assert from 'node:assert/strict';
import test from 'node:test';

import { PRIMARYSET } from '../js/const.js';
import { GLYPH_OBJ_OFF, GLYPH_OBJ_PILETOP_OFF } from '../js/glyph_offsets.js';
import { apply_customizations, numeric_glyph_customization } from '../js/glyphs.js';
import { parseNethackrc } from '../js/options.js';
import { AMULET_CLASS, RING_CLASS } from '../js/objects.js';
import { initialize_symbols_from_options, object_class_symbol } from '../js/symbols.js';

test('an S_* object-class Unicode entry reaches object index class - 1', () => {
    // dat/symbols, Enhanced2: "S_amulet: U+2299". symbols.c:638-641 sends
    // the line of a UTF8-handling set to glyphrep_to_custom_map_entries();
    // glyphs.c:1138-1142 gives find_oc the loadsyms[] offset,
    // AMULET_CLASS - 1 = RING_CLASS, and glyphs.c:258-261 matches
    // glyph_to_obj() against it, so the glyphs of object index 4 (the
    // generic ring, on the floor and atop a pile) take the Unicode.
    const state = {};
    initialize_symbols_from_options(
        parseNethackrc('OPTIONS=symset:Enhanced2'), state,
    );
    apply_customizations(state.gc?.currentgraphics ?? PRIMARYSET, state);
    for (const offset of [GLYPH_OBJ_OFF, GLYPH_OBJ_PILETOP_OFF]) {
        assert.equal(
            numeric_glyph_customization(offset + RING_CLASS, state)?.displayCh,
            '⊙',
        );
        // The generic amulet keeps no Unicode: S_tool, the next class, has
        // no entry in Enhanced2.
        assert.equal(
            numeric_glyph_customization(offset + AMULET_CLASS, state)
                ?.displayCh,
            undefined,
        );
        // A concrete object (index 200, past the generics) takes no class
        // entry.
        assert.equal(
            numeric_glyph_customization(offset + 200, state)?.displayCh,
            undefined,
        );
    }
    // The class symbols keep their bytes ('=' and '"'), as wiz_custom()
    // shows for the generic ring.
    assert.equal(object_class_symbol(RING_CLASS, state).ttychar, 61);
    assert.equal(object_class_symbol(AMULET_CLASS, state).ch, '"');
});
