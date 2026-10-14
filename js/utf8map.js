// utf8map.js -- Unicode glyph-map cleanup and custom-symbol reset.
// C refs: utf8map.c free_all_glyphmap_u() and reset_customsymbols().

import { PRIMARYSET } from './const.js';
import { game } from './gstate.js';
import {
    apply_customizations,
    clear_all_glyphmap_unicode,
} from './glyphs.js';

// C frees each glyphmap[glyph].u and clears pointers cached in gg.gbuf. The
// JavaScript glyph map stores the rendered string on each customization entry
// and keeps no gg.gbuf pointers, so deleting those strings clears the same
// state without leaving references to freed objects.
export function free_all_glyphmap_u(state) {
    clear_all_glyphmap_unicode(state);
}

// C utf8map.c:reset_customsymbols() first discards every Unicode override,
// then rebuilds symbol overrides for the active graphics set. Color overrides
// remain in place; apply_customizations() mirrors do_custom_symbols only.
export function reset_customsymbols(state = game) {
    free_all_glyphmap_u(state);
    apply_customizations(
        state.gc?.currentgraphics ?? PRIMARYSET,
        state,
        { symbols: true, colors: false },
    );
}
