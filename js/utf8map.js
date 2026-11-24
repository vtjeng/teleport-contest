// utf8map.js -- Unicode glyph-map cleanup and custom-symbol reset.
// C refs: utf8map.c free_all_glyphmap_u(), reset_customsymbols() and
// mixed_to_utf8().

import { BUFSZ } from './const.js';
import { map_glyphinfo } from './display.js';
import { game } from './gstate.js';
import { utf8Text } from './hacklib.js';
import { decode_mixed } from './windows.js';
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
        state.gc?.currentgraphics,
        state,
        { symbols: true, colors: false },
    );
}

// C ref: utf8map.c mixed_to_utf8() (83-140), which wintty.c tty_putmixed()
// calls in place of windows.c decode_mixed() while SYMHANDLING(H_UTF8). It
// runs the same loop and differs in what replaces an encglyph() sequence:
// the glyph's gm.u->utf8str bytes when it has them, otherwise its
// gs.showsyms[] byte. Every write is bounded by the caller's BUFSZ buffer,
// so the result is the decoded text cut to BUFSZ - 1 bytes. The result is a
// byte string (js/hacklib.js bytesText()).
export function mixed_to_utf8(str, state = game) {
    return decode_mixed(str, state, (glyph) => {
        const unicode = map_glyphinfo(glyph, state).displayCh;
        return unicode ? utf8Text(unicode) : null;
    }).slice(0, BUFSZ - 1);
}
