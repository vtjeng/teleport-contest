// GENERATED FILE - do not edit.
// Regenerate with: node scripts/generate-glyph-offsets.mjs
// Source: nethack-c/upstream/include/display.h at 16ff59115315917b93185d026aeefea06db9b0f4.
//
// display.h enum glyph_offsets, in source order, plus the NUM_ZAP it reads.
// Each offset is the first glyph number of one range; the range runs to the
// offset below it in this list, which is why the members are chained rather
// than written as literals. display.c reset_glyphmap() walks the chain
// downwards, subtracting each offset in turn, so the order here is the order
// its arms must be tested in.

import {
    MAXEXPCHARS,
    MAXTCHARS,
    WARNCOUNT,
} from './const.js';
import {
    NUMMONS,
} from './monsters.js';
import {
    NUM_OBJECTS,
} from './objects.js';
import { SYMBOL_INDEX_BY_NAME } from './symbol_data.js';

const S_trwall = SYMBOL_INDEX_BY_NAME.s_trwall;
const S_vwall = SYMBOL_INDEX_BY_NAME.s_vwall;
const S_brdnladder = SYMBOL_INDEX_BY_NAME.s_brdnladder;
const S_ndoor = SYMBOL_INDEX_BY_NAME.s_ndoor;
const S_arrow_trap = SYMBOL_INDEX_BY_NAME.s_arrow_trap;
const S_grave = SYMBOL_INDEX_BY_NAME.s_grave;
const S_goodpos = SYMBOL_INDEX_BY_NAME.s_goodpos;
const S_digbeam = SYMBOL_INDEX_BY_NAME.s_digbeam;

// display.h:359. The number of zap beam types; four cmap symbols per type.
export const NUM_ZAP = 8;

export const GLYPH_MON_OFF = 0;
export const GLYPH_MON_MALE_OFF = (GLYPH_MON_OFF);
export const GLYPH_MON_FEM_OFF = (NUMMONS + GLYPH_MON_MALE_OFF);
export const GLYPH_PET_OFF = (NUMMONS + GLYPH_MON_FEM_OFF);
export const GLYPH_PET_MALE_OFF = (GLYPH_PET_OFF);
export const GLYPH_PET_FEM_OFF = (NUMMONS + GLYPH_PET_MALE_OFF);
export const GLYPH_INVIS_OFF = (NUMMONS + GLYPH_PET_FEM_OFF);
export const GLYPH_DETECT_OFF = (1 + GLYPH_INVIS_OFF);
export const GLYPH_DETECT_MALE_OFF = (GLYPH_DETECT_OFF);
export const GLYPH_DETECT_FEM_OFF = (NUMMONS + GLYPH_DETECT_MALE_OFF);
export const GLYPH_BODY_OFF = (NUMMONS + GLYPH_DETECT_FEM_OFF);
export const GLYPH_RIDDEN_OFF = (NUMMONS + GLYPH_BODY_OFF);
export const GLYPH_RIDDEN_MALE_OFF = (GLYPH_RIDDEN_OFF);
export const GLYPH_RIDDEN_FEM_OFF = (NUMMONS + GLYPH_RIDDEN_MALE_OFF);
export const GLYPH_OBJ_OFF = (NUMMONS + GLYPH_RIDDEN_FEM_OFF);
export const GLYPH_CMAP_OFF = (NUM_OBJECTS + GLYPH_OBJ_OFF);
export const GLYPH_CMAP_STONE_OFF = (GLYPH_CMAP_OFF);
export const GLYPH_CMAP_MAIN_OFF = (1 + GLYPH_CMAP_STONE_OFF);
export const GLYPH_CMAP_MINES_OFF = (((S_trwall - S_vwall) + 1) + GLYPH_CMAP_MAIN_OFF);
export const GLYPH_CMAP_GEH_OFF = (((S_trwall - S_vwall) + 1) + GLYPH_CMAP_MINES_OFF);
export const GLYPH_CMAP_KNOX_OFF = (((S_trwall - S_vwall) + 1) + GLYPH_CMAP_GEH_OFF);
export const GLYPH_CMAP_SOKO_OFF = (((S_trwall - S_vwall) + 1) + GLYPH_CMAP_KNOX_OFF);
export const GLYPH_CMAP_A_OFF = (((S_trwall - S_vwall) + 1) + GLYPH_CMAP_SOKO_OFF);
export const GLYPH_ALTAR_OFF = (((S_brdnladder - S_ndoor) + 1) + GLYPH_CMAP_A_OFF);
export const GLYPH_CMAP_B_OFF = (5 + GLYPH_ALTAR_OFF);
export const GLYPH_ZAP_OFF = ((S_arrow_trap + MAXTCHARS - S_grave) + GLYPH_CMAP_B_OFF);
export const GLYPH_CMAP_C_OFF = ((NUM_ZAP << 2) + GLYPH_ZAP_OFF);
export const GLYPH_SWALLOW_OFF = (((S_goodpos - S_digbeam) + 1) + GLYPH_CMAP_C_OFF);
export const GLYPH_EXPLODE_OFF = ((NUMMONS << 3) + GLYPH_SWALLOW_OFF);
export const GLYPH_EXPLODE_DARK_OFF = (GLYPH_EXPLODE_OFF);
export const GLYPH_EXPLODE_NOXIOUS_OFF = (MAXEXPCHARS + GLYPH_EXPLODE_DARK_OFF);
export const GLYPH_EXPLODE_MUDDY_OFF = (MAXEXPCHARS + GLYPH_EXPLODE_NOXIOUS_OFF);
export const GLYPH_EXPLODE_WET_OFF = (MAXEXPCHARS + GLYPH_EXPLODE_MUDDY_OFF);
export const GLYPH_EXPLODE_MAGICAL_OFF = (MAXEXPCHARS + GLYPH_EXPLODE_WET_OFF);
export const GLYPH_EXPLODE_FIERY_OFF = (MAXEXPCHARS + GLYPH_EXPLODE_MAGICAL_OFF);
export const GLYPH_EXPLODE_FROSTY_OFF = (MAXEXPCHARS + GLYPH_EXPLODE_FIERY_OFF);
export const GLYPH_WARNING_OFF = (MAXEXPCHARS + GLYPH_EXPLODE_FROSTY_OFF);
export const GLYPH_STATUE_OFF = (WARNCOUNT + GLYPH_WARNING_OFF);
export const GLYPH_STATUE_MALE_OFF = (GLYPH_STATUE_OFF);
export const GLYPH_STATUE_FEM_OFF = (NUMMONS + GLYPH_STATUE_MALE_OFF);
export const GLYPH_PILETOP_OFF = (NUMMONS + GLYPH_STATUE_FEM_OFF);
export const GLYPH_OBJ_PILETOP_OFF = (GLYPH_PILETOP_OFF);
export const GLYPH_BODY_PILETOP_OFF = (NUM_OBJECTS + GLYPH_OBJ_PILETOP_OFF);
export const GLYPH_STATUE_MALE_PILETOP_OFF = (NUMMONS + GLYPH_BODY_PILETOP_OFF);
export const GLYPH_STATUE_FEM_PILETOP_OFF = (NUMMONS + GLYPH_STATUE_MALE_PILETOP_OFF);
export const GLYPH_UNEXPLORED_OFF = (NUMMONS + GLYPH_STATUE_FEM_PILETOP_OFF);
export const GLYPH_NOTHING_OFF = (GLYPH_UNEXPLORED_OFF + 1);
// One past the last range, which is C's value for a bare final member.
export const MAX_GLYPH = GLYPH_NOTHING_OFF + 1;
