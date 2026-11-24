// Gives a test state built by hand the three display grids js/gstate.js
// creates with every game state (gg.gbuf, tty_map_cells and nomux_map), so
// js/display.js glyph_buffer_at(), tty_map_cell_at() and nomux_cell_at() can
// read and write it. A grid the state already has is kept.

import { initialGbuf, initialNomuxMap, initialTtyMapCells } from '../js/gstate.js';

export function withScreenBuffers(state) {
    state.gg ??= {};
    state.gg.gbuf ??= initialGbuf();
    state.tty_map_cells ??= initialTtyMapCells();
    state.nomux_map ??= initialNomuxMap();
    return state;
}
