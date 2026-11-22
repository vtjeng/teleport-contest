// C ref: display.c reset_glyphmap() (2739-3086), the function that rebuilds
// glyphmap[]. The rest of display.c is in js/display.js, which imports this;
// reset_glyphmap() is apart because symbols.c assign_graphics() calls it and
// js/symbols.js cannot import js/display.js without closing an import cycle
// through modules that read symbols.js constants as they load.

import { game } from './gstate.js';

/**
 * C rebuilds glyphmap[], the table that gives each glyph its symbol index,
 * colour and glyphflags, and every show_glyph() copies an entry of it into
 * gg.gbuf. This port resolves a glyph when js/display.js map_glyphinfo() is
 * asked for it and keeps no table, so the one thing a rebuild fixes that a
 * later lookup could read differently is kept instead: iflags.use_color as
 * reset_glyphmap() read it for the colour macros (2683-2694), the
 * black-and-white flags (2890) and the final test (3081).
 *
 * gg.glyphmap_use_color is that value. It is written here only, at the six
 * places C calls reset_glyphmap(): allmain.c newgame() (797), do.c
 * goto_level() (1838), restore.c dorecover() (907), symbols.c
 * assign_graphics() (249), options.c initoptions_finish() (7348) and
 * reset_needed_visuals() (8983). scripts/print-time-flags.test.mjs pins the
 * six. It is derived state: every game start and restore passes one of those
 * calls before the first map cell is drawn.
 *
 * Between an in-game toggle of 'color' and the reset_needed_visuals() that
 * ends the options command, the table still holds the old answer: turning
 * colour on leaves every glyph without one until then, and turning it off
 * leaves each glyph its colour, which wintty.c tty_print_glyph() (3892) then
 * declines to print.
 */
export function reset_glyphmap(state = game) {
    state.gg ??= {};
    state.gg.glyphmap_use_color = state.iflags?.wc_color !== false;
}

// iflags.use_color as glyphmap[] encodes it. A state no reset_glyphmap() has
// reached, which only a test builds by hand, has an empty table in C; it
// reads the option itself here.
export function glyphmap_use_color(state = game) {
    return state.gg?.glyphmap_use_color
        ?? (state.iflags?.wc_color !== false);
}
