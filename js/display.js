// display.js — Map rendering and terminal output.
// C ref: display.c — newsym, show_glyph, docrt, cls, flush_screen.

import { game } from './gstate.js';
import { money_cnt } from './invent.js';
import { cansee } from './vision.js';
import {
    A_CHA, A_CON, A_DEX, A_INT, A_STR, A_WIS,
    AM_CHAOTIC, AM_LAWFUL, AM_MASK, AM_NEUTRAL, AM_SANCTUM,
    ACCESSIBLE, BLINDED, CONFUSION, DEAF, FLYING, HALLUC, HALLUC_RES,
    LEVITATION, NOT_HUNGRY, SICK, SICK_NONVOMITABLE, SICK_VOMITABLE,
    SLIMED, STONED, STR18, STRANGLED, STUNNED, OBJ_FLOOR,
    P_DAGGER, P_KNIFE, P_AXE, P_PICK_AXE, P_SHORT_SWORD, P_SABER,
    P_CLUB, P_MACE, P_MORNING_STAR, P_FLAIL, P_HAMMER,
    P_QUARTERSTAFF, P_POLEARMS, P_SPEAR, P_TRIDENT, P_LANCE,
    P_BOW, P_SLING, P_CROSSBOW, P_DART, P_SHURIKEN, P_BOOMERANG,
    P_WHIP, P_UNICORN_HORN,
    COLNO, ROWNO, STONE, ROOM, CORR, DOOR, STAIRS, LADDER, SCORR,
    HWALL, VWALL, TLCORNER, TRCORNER, BLCORNER, BRCORNER, SDOOR,
    CROSSWALL, TUWALL, TDWALL, TLWALL, TRWALL,
    IRONBARS, TREE, ALTAR, GRAVE, THRONE, SINK, FOUNTAIN,
    POOL, MOAT, ICE, LAVAPOOL, LAVAWALL, AIR, CLOUD, WATER,
    DBWALL, DRAWBRIDGE_UP, DRAWBRIDGE_DOWN,
    DB_FLOOR, DB_ICE, DB_LAVA, DB_MOAT, DB_UNDER,
    D_BROKEN, D_ISOPEN, D_CLOSED, D_LOCKED, D_TRAPPED, LA_DOWN,
    IS_STWALL, isok,
    SV0, SV1, SV2, SV3, SV4, SV5, SV6, SV7,
    WM_MASK, WM_C_OUTER, WM_C_INNER,
    WM_W_LEFT, WM_W_RIGHT, WM_W_TOP, WM_W_BOTTOM,
    WM_T_LONG, WM_T_BL, WM_T_BR,
    WM_X_TL, WM_X_TR, WM_X_BL, WM_X_BR, WM_X_TLBR, WM_X_BLTR,
    HI_DOMESTIC, HI_METAL, M_AP_FURNITURE, M_AP_OBJECT, M_AP_TYPMASK,
    SYM_BOULDER, SYM_PET_OVERRIDE, SYM_HERO_OVERRIDE,
} from './const.js';
import {
    ATR_NONE,
    ATR_INVERSE,
    NO_COLOR,
    CLR_BLACK,
    CLR_BLUE,
    CLR_BRIGHT_GREEN,
    CLR_BROWN,
    CLR_BRIGHT_BLUE,
    CLR_BRIGHT_MAGENTA,
    CLR_CYAN,
    CLR_GREEN,
    CLR_GRAY,
    CLR_MAGENTA,
    CLR_ORANGE,
    CLR_RED,
    CLR_WHITE,
    CLR_YELLOW,
    DEC_TO_UNICODE,
} from './terminal.js';
import { rankOf } from './roles.js';
import { m_at } from './monst.js';
import {
    depth as dungeonDepth,
    dist2,
    encodeUtf8ByteString,
} from './hacklib.js';
import { observe_object } from './o_init.js';
import { engr_at } from './engrave.js';
import { status_version } from './version.js';
import { objectType, isWeptool } from './obj.js';
import { newuexp } from './exper.js';
import { weapon_type } from './startup_skills.js';
import { bimanual } from './worn.js';
import {
    ART_MITRE_OF_HOLINESS,
    ART_TSURUGI_OF_MURAMASA,
} from './artifacts.js';
import {
    AKLYS,
    AMULET_OF_GUARDING,
    ARMOR_CLASS,
    AMULET_CLASS,
    BALL_CLASS,
    BOULDER,
    CHAIN_CLASS,
    CLOAK_OF_PROTECTION,
    COIN_CLASS,
    CORPSE,
    CORNUTHAUM,
    CREAM_PIE,
    DUNCE_CAP,
    DWARVISH_MATTOCK,
    EGG,
    ELVEN_LEATHER_HELM,
    FEDORA,
    FIRST_REAL_GEM,
    FIRST_SPELL,
    FLINT,
    FOOD_CLASS,
    GEM_CLASS,
    GRAPPLING_HOOK,
    ILLOBJ_CLASS,
    LAST_GLASS_GEM,
    LAST_SPELL,
    LUCKSTONE,
    OBJ_NAME,
    POTION_CLASS,
    RIN_PROTECTION,
    RING_CLASS,
    ROCK,
    ROCK_CLASS,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    STATUE,
    TIN,
    TIN_OPENER,
    TOOL_CLASS,
    TOWEL,
    VENOM_CLASS,
    WAND_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import {
    cmap_symbol,
    cmap_symbol_byte,
    glyph_customization,
    misc_symbol,
    monster_class_symbol,
    object_class_symbol,
    optional_misc_symbol,
    S_stone,
    S_bars,
    S_tree,
    S_vwall,
    S_hwall,
    S_tlcorn,
    S_trcorn,
    S_blcorn,
    S_brcorn,
    S_crwall,
    S_tuwall,
    S_tdwall,
    S_tlwall,
    S_trwall,
    S_ndoor,
    S_vodoor,
    S_hodoor,
    S_vcdoor,
    S_hcdoor,
    S_room,
    S_darkroom,
    S_engroom,
    S_corr,
    S_litcorr,
    S_engrcorr,
    S_upstair,
    S_dnstair,
    S_upladder,
    S_dnladder,
    S_brupstair,
    S_brdnstair,
    S_brupladder,
    S_brdnladder,
    S_altar,
    S_grave,
    S_throne,
    S_sink,
    S_fountain,
    S_pool,
    S_ice,
    S_lava,
    S_lavawall,
    S_vodbridge,
    S_hodbridge,
    S_vcdbridge,
    S_hcdbridge,
    S_air,
    S_cloud,
    S_water,
    trap_to_defsym,
} from './symbols.js';
import { t_at } from './trap.js';
import { visible_region_at } from './region.js';
import { M1_HUMANOID, NON_PM, PM_TENGU } from './monsters.js';

const WALL_TYPES = new Set([
    SDOOR, VWALL, HWALL, TLCORNER, TRCORNER, BLCORNER, BRCORNER,
    CROSSWALL, TUWALL, TDWALL, TLWALL, TRWALL,
]);

// C ref: include/defsym.h, trap cmap colors indexed by enum trap_types.
// Index 0 is NO_TRAP and is intentionally unused.
const TRAP_COLORS = Object.freeze([
    NO_COLOR,
    HI_METAL, HI_METAL, CLR_GRAY, CLR_BROWN, HI_METAL,
    CLR_RED, CLR_GRAY, CLR_BRIGHT_BLUE, CLR_BLUE, CLR_ORANGE,
    CLR_BLACK, CLR_BLACK, CLR_BROWN, CLR_BROWN, CLR_MAGENTA,
    CLR_MAGENTA, CLR_BRIGHT_MAGENTA, CLR_GRAY, CLR_GRAY,
    CLR_BRIGHT_BLUE, CLR_BRIGHT_BLUE, CLR_BRIGHT_GREEN, CLR_MAGENTA,
    CLR_ORANGE, CLR_ORANGE,
]);

// C ref: display.c wall_matrix[] and cross_matrix[][].
const T_D = 0;
const T_L = 1;
const T_U = 2;
const T_R = 3;
const T_STONE = 0;
const T_TLCORN = 1;
const T_TRCORN = 2;
const T_HWALL = 3;
const T_TDWALL = 4;
const WALL_MATRIX = [
    [S_stone, S_tlcorn, S_trcorn, S_hwall, S_tdwall],
    [S_stone, S_trcorn, S_brcorn, S_vwall, S_tlwall],
    [S_stone, S_brcorn, S_blcorn, S_hwall, S_tuwall],
    [S_stone, S_blcorn, S_tlcorn, S_vwall, S_trwall],
];

const C_BL = 0;
const C_TL = 1;
const C_TR = 2;
const C_BR = 3;
const C_TRCORN = 0;
const C_BRCORN = 1;
const C_BLCORN = 2;
const C_TLWALL = 3;
const C_TUWALL = 4;
const C_CRWALL = 5;
const CROSS_MATRIX = [
    [S_brcorn, S_blcorn, S_tlcorn, S_tuwall, S_trwall, S_crwall],
    [S_blcorn, S_tlcorn, S_trcorn, S_trwall, S_tdwall, S_crwall],
    [S_tlcorn, S_trcorn, S_brcorn, S_tdwall, S_tlwall, S_crwall],
    [S_trcorn, S_brcorn, S_blcorn, S_tlwall, S_tuwall, S_crwall],
];

// C ref: display.c check_pos().  Rock, corridors, and secret doors represent
// unfinished exterior terrain.  isok() deliberately excludes map column 0.
function check_pos(level, x, y, which) {
    if (!isok(x, y)) return which;
    const typ = level.at(x, y).typ;
    return IS_STWALL(typ) || typ === CORR || typ === SCORR || typ === SDOOR
        ? which
        : 0;
}

function more_than_one(a, b, c) {
    return Boolean((a && (b || c)) || (b && (a || c)) || (c && (a || b)));
}

// C ref: display.c set_twall().
function set_twall(level, x1, y1, x2, y2, x3, y3) {
    const is1 = check_pos(level, x1, y1, WM_T_LONG);
    const is2 = check_pos(level, x2, y2, WM_T_BL);
    const is3 = check_pos(level, x3, y3, WM_T_BR);
    return more_than_one(is1, is2, is3) ? 0 : is1 + is2 + is3;
}

// C ref: display.c set_wall().
function set_wall(level, x, y, horizontal) {
    const is1 = horizontal
        ? check_pos(level, x, y - 1, WM_W_TOP)
        : check_pos(level, x - 1, y, WM_W_LEFT);
    const is2 = horizontal
        ? check_pos(level, x, y + 1, WM_W_BOTTOM)
        : check_pos(level, x + 1, y, WM_W_RIGHT);
    return more_than_one(is1, is2, 0) ? 0 : is1 + is2;
}

// C ref: display.c set_corn().  The fourth coordinate is the inner quarter.
function set_corn(level, x1, y1, x2, y2, x3, y3, x4, y4) {
    const is1 = check_pos(level, x1, y1, 1);
    const is2 = check_pos(level, x2, y2, 1);
    const is3 = check_pos(level, x3, y3, 1);
    const is4 = check_pos(level, x4, y4, 1);
    if (is4) return WM_C_INNER;
    return is1 && is2 && is3 ? WM_C_OUTER : 0;
}

// C ref: display.c set_crosswall().
function set_crosswall(level, x, y) {
    const is1 = check_pos(level, x - 1, y - 1, 1);
    const is2 = check_pos(level, x + 1, y - 1, 1);
    const is3 = check_pos(level, x + 1, y + 1, 1);
    const is4 = check_pos(level, x - 1, y + 1, 1);
    const count = is1 + is2 + is3 + is4;
    if (count > 1) {
        if (is1 && is3 && !is2 && !is4) return WM_X_TLBR;
        if (is2 && is4 && !is1 && !is3) return WM_X_BLTR;
        return 0;
    }
    if (is1) return WM_X_TL;
    if (is2) return WM_X_TR;
    if (is3) return WM_X_BR;
    if (is4) return WM_X_BL;
    return 0;
}

// C ref: display.c xy_set_wall_state().  This is exported because vault wall
// repair updates individual cells through the same source boundary.
export function xy_set_wall_state(x, y, state = game) {
    const level = state.level;
    const loc = level?.at(x, y);
    if (!loc) return;

    let mode;
    switch (loc.typ) {
    case SDOOR:
        mode = set_wall(level, x, y, Boolean(loc.horizontal));
        break;
    case VWALL:
        mode = set_wall(level, x, y, false);
        break;
    case HWALL:
        mode = set_wall(level, x, y, true);
        break;
    case TDWALL:
        mode = set_twall(level, x, y - 1, x - 1, y + 1, x + 1, y + 1);
        break;
    case TUWALL:
        mode = set_twall(level, x, y + 1, x + 1, y - 1, x - 1, y - 1);
        break;
    case TLWALL:
        mode = set_twall(level, x + 1, y, x - 1, y - 1, x - 1, y + 1);
        break;
    case TRWALL:
        mode = set_twall(level, x - 1, y, x + 1, y + 1, x + 1, y - 1);
        break;
    case TLCORNER:
        mode = set_corn(
            level, x - 1, y - 1, x, y - 1, x - 1, y, x + 1, y + 1,
        );
        break;
    case TRCORNER:
        mode = set_corn(
            level, x, y - 1, x + 1, y - 1, x + 1, y, x - 1, y + 1,
        );
        break;
    case BLCORNER:
        mode = set_corn(
            level, x, y + 1, x - 1, y + 1, x - 1, y, x + 1, y - 1,
        );
        break;
    case BRCORNER:
        mode = set_corn(
            level, x + 1, y, x + 1, y + 1, x, y + 1, x - 1, y - 1,
        );
        break;
    case CROSSWALL:
        mode = set_crosswall(level, x, y);
        break;
    default:
        return;
    }

    loc.wall_info = ((loc.wall_info ?? loc.flags ?? 0) & ~WM_MASK) | mode;
}

// C ref: display.c set_wall_state(); called once by mklev after topologize().
export function set_wall_state(state = game) {
    for (let x = 0; x < COLNO; x++) {
        for (let y = 0; y < ROWNO; y++) xy_set_wall_state(x, y, state);
    }
}

function wallMode(loc) {
    // C's wall_info macro aliases struct rm.flags. The JS location keeps a
    // dedicated field, while the fallback supports source-shaped test data.
    return (loc.wall_info ?? loc.flags ?? 0) & WM_MASK;
}

function only(seenv, bits) {
    return Boolean((seenv & bits) && !(seenv & ~bits));
}

function cornerAngle(seenv, mode, which, outer, inner) {
    if (mode === 0) return which;
    if (mode === WM_C_OUTER) return seenv & outer ? which : S_stone;
    if (mode === WM_C_INNER) return seenv & ~inner ? which : S_stone;
    return S_stone;
}

// C ref: display.c wall_angle(). This returns an S_* cmap index, not a
// rendered character; symbol-set selection happens later in terrainCmap().
export function wall_angle(loc) {
    let seenv = (loc.seenv ?? 0) & 0xFF;
    const mode = wallMode(loc);

    switch (loc.typ) {
    case TUWALL:
    case TLWALL:
    case TRWALL:
    case TDWALL: {
        let row;
        if (loc.typ === TUWALL) {
            row = WALL_MATRIX[T_U];
            seenv = ((seenv >> 4) | (seenv << 4)) & 0xFF;
        } else if (loc.typ === TLWALL) {
            row = WALL_MATRIX[T_L];
            seenv = ((seenv >> 2) | (seenv << 6)) & 0xFF;
        } else if (loc.typ === TRWALL) {
            row = WALL_MATRIX[T_R];
            seenv = ((seenv >> 6) | (seenv << 2)) & 0xFF;
        } else {
            row = WALL_MATRIX[T_D];
        }

        let col;
        if (mode === 0) {
            if (seenv === SV4) col = T_TLCORN;
            else if (seenv === SV6) col = T_TRCORN;
            else if ((seenv & (SV3 | SV5 | SV7))
                || ((seenv & SV4) && (seenv & SV6))) col = T_TDWALL;
            else if (seenv & (SV0 | SV1 | SV2)) {
                col = seenv & (SV4 | SV6) ? T_TDWALL : T_HWALL;
            } else col = T_STONE;
        } else if (mode === WM_T_LONG) {
            if ((seenv & (SV3 | SV4))
                && !(seenv & (SV5 | SV6 | SV7))) col = T_TLCORN;
            else if ((seenv & (SV6 | SV7))
                && !(seenv & (SV3 | SV4 | SV5))) col = T_TRCORN;
            else if ((seenv & SV5)
                || ((seenv & (SV3 | SV4))
                    && (seenv & (SV6 | SV7)))) col = T_TDWALL;
            else col = T_STONE;
        } else if (mode === WM_T_BL) {
            if (only(seenv, SV4 | SV5)) col = T_TLCORN;
            else if ((seenv & (SV0 | SV1 | SV2 | SV7))
                && !(seenv & (SV3 | SV4 | SV5))) col = T_HWALL;
            else if (only(seenv, SV6)) col = T_STONE;
            else col = T_TDWALL;
        } else if (mode === WM_T_BR) {
            if (only(seenv, SV5 | SV6)) col = T_TRCORN;
            else if ((seenv & (SV0 | SV1 | SV2 | SV3))
                && !(seenv & (SV5 | SV6 | SV7))) col = T_HWALL;
            else if (only(seenv, SV4)) col = T_STONE;
            else col = T_TDWALL;
        } else col = T_STONE;
        return row[col];
    }

    case SDOOR:
        if (loc.arboreal_sdoor || loc.candig) return S_tree;
        if (loc.horizontal) {
            if (mode === 0) return seenv ? S_hwall : S_stone;
            if (mode === 1) {
                return seenv & (SV3 | SV4 | SV5 | SV6 | SV7)
                    ? S_hwall : S_stone;
            }
            if (mode === 2) {
                return seenv & (SV0 | SV1 | SV2 | SV3 | SV7)
                    ? S_hwall : S_stone;
            }
            return S_stone;
        }
        // Non-horizontal secret doors use the vertical-wall cases.
        // falls through
    case VWALL:
        if (mode === 0) return seenv ? S_vwall : S_stone;
        if (mode === 1) {
            return seenv & (SV1 | SV2 | SV3 | SV4 | SV5)
                ? S_vwall : S_stone;
        }
        if (mode === 2) {
            return seenv & (SV0 | SV1 | SV5 | SV6 | SV7)
                ? S_vwall : S_stone;
        }
        return S_stone;

    case HWALL:
        if (mode === 0) return seenv ? S_hwall : S_stone;
        if (mode === 1) {
            return seenv & (SV3 | SV4 | SV5 | SV6 | SV7)
                ? S_hwall : S_stone;
        }
        if (mode === 2) {
            return seenv & (SV0 | SV1 | SV2 | SV3 | SV7)
                ? S_hwall : S_stone;
        }
        return S_stone;

    case TLCORNER:
        return cornerAngle(
            seenv, mode, S_tlcorn, SV3 | SV4 | SV5, SV4,
        );
    case TRCORNER:
        return cornerAngle(
            seenv, mode, S_trcorn, SV5 | SV6 | SV7, SV6,
        );
    case BLCORNER:
        return cornerAngle(
            seenv, mode, S_blcorn, SV1 | SV2 | SV3, SV2,
        );
    case BRCORNER:
        return cornerAngle(
            seenv, mode, S_brcorn, SV7 | SV0 | SV1, SV0,
        );

    case CROSSWALL: {
        if (mode === 0) {
            if (seenv === SV0) return S_brcorn;
            if (seenv === SV2) return S_blcorn;
            if (seenv === SV4) return S_tlcorn;
            if (seenv === SV6) return S_trcorn;
            if (!(seenv & ~(SV0 | SV1 | SV2))
                && ((seenv & SV1) || seenv === (SV0 | SV2))) return S_tuwall;
            if (!(seenv & ~(SV2 | SV3 | SV4))
                && ((seenv & SV3) || seenv === (SV2 | SV4))) return S_trwall;
            if (!(seenv & ~(SV4 | SV5 | SV6))
                && ((seenv & SV5) || seenv === (SV4 | SV6))) return S_tdwall;
            if (!(seenv & ~(SV0 | SV6 | SV7))
                && ((seenv & SV7) || seenv === (SV0 | SV6))) return S_tlwall;
            return S_crwall;
        }

        if (mode >= WM_X_TL && mode <= WM_X_BR) {
            let row;
            if (mode === WM_X_TL) {
                row = CROSS_MATRIX[C_TL];
                seenv = ((seenv >> 4) | (seenv << 4)) & 0xFF;
            } else if (mode === WM_X_TR) {
                row = CROSS_MATRIX[C_TR];
                seenv = ((seenv >> 6) | (seenv << 2)) & 0xFF;
            } else if (mode === WM_X_BL) {
                row = CROSS_MATRIX[C_BL];
                seenv = ((seenv >> 2) | (seenv << 6)) & 0xFF;
            } else {
                row = CROSS_MATRIX[C_BR];
            }

            if (seenv === SV4) return S_stone;
            seenv &= ~SV4;
            let col;
            if (seenv === SV0) col = C_BRCORN;
            else if (seenv & (SV2 | SV3)) {
                if (seenv & (SV5 | SV6 | SV7)) col = C_CRWALL;
                else if (seenv & (SV0 | SV1)) col = C_TUWALL;
                else col = C_BLCORN;
            } else if (seenv & (SV5 | SV6)) {
                if (seenv & (SV1 | SV2 | SV3)) col = C_CRWALL;
                else if (seenv & (SV0 | SV7)) col = C_TLWALL;
                else col = C_TRCORN;
            } else if (seenv & SV1) {
                col = seenv & SV7 ? C_CRWALL : C_TUWALL;
            } else if (seenv & SV7) {
                col = seenv & SV1 ? C_CRWALL : C_TLWALL;
            } else col = C_CRWALL;
            return row[col];
        }

        if (mode === WM_X_TLBR) {
            if (only(seenv, SV1 | SV2 | SV3)) return S_blcorn;
            if (only(seenv, SV5 | SV6 | SV7)) return S_trcorn;
            if (only(seenv, SV0 | SV4)) return S_stone;
            return S_crwall;
        }
        if (mode === WM_X_BLTR) {
            if (only(seenv, SV0 | SV1 | SV7)) return S_brcorn;
            if (only(seenv, SV3 | SV4 | SV5)) return S_tlcorn;
            if (only(seenv, SV2 | SV6)) return S_stone;
            return S_crwall;
        }
        return S_stone;
    }

    default:
        return S_stone;
    }
}

function mapColorEnabled(state) {
    const activeSet = state.gc?.currentgraphics ?? 0;
    return state.iflags?.wc_color !== false
        && !state.gs?.symset?.[activeSet]?.nocolor;
}

function recorderMapColor(color, state) {
    if (!mapColorEnabled(state)) return NO_COLOR;
    // Recorder patch 006 serializes terminal-default gray as NO_COLOR. Black
    // also decodes as NO_COLOR: use_darkgray remaps it to wire color 8, while
    // !use_darkgray leaves zero in the shadow cell and the serializer treats
    // that zero as its terminal-default sentinel.
    if (color === CLR_GRAY || color === CLR_BLACK) return NO_COLOR;
    return color;
}

// C refs: display.c map_glyphinfo() and wintty.c tty_print_glyph().  When
// color is explicitly disabled, tty uses inverse video to distinguish terrain
// pairs whose configured symbols are otherwise identical.
function blackAndWhiteTerrainCue(index, state) {
    if (state.iflags?.wc_color !== false
        || state.iflags?.wc_inverse === false) return false;
    const symbol = cmap_symbol_byte(index, state);
    switch (index) {
    case S_lava:
    case S_lavawall:
        return symbol === cmap_symbol_byte(S_pool, state)
            || symbol === cmap_symbol_byte(S_water, state);
    case S_ice:
        return symbol === cmap_symbol_byte(S_room, state)
            || symbol === cmap_symbol_byte(S_darkroom, state);
    case S_sink:
        return symbol === cmap_symbol_byte(S_fountain, state);
    default:
        return false;
    }
}

function terrainCmap(index, color, state, customizationName = null) {
    const customization = customizationName
        ? glyph_customization(customizationName, state) : null;
    const glyph = glyphPresentation(
        cmap_symbol(index, state), color, state, customization,
    );
    if (blackAndWhiteTerrainCue(index, state)) glyph.attr = ATR_INVERSE;
    return glyph;
}

function stairwayAt(state, x, y) {
    for (let stairway = state.stairs; stairway; stairway = stairway.next) {
        if (stairway.sx === x && stairway.sy === y) return stairway;
    }
    return null;
}

function glyphPresentation(symbol, color, state, customization = null) {
    const displayCh = customization?.displayCh ?? symbol.displayCh;
    const result = {
        // tty_print_glyph() sends UTF-8 customizations through g_pututf8().
        // Recorder patch 006 does not mirror that byte sequence into its
        // shadow frame, so its existing cell stays untouched.  The browser
        // still receives the Unicode presentation independently.
        ch: customization?.displayCh ? null : symbol.ch,
        color: recorderMapColor(color, state),
        dec: symbol.dec,
    };
    if (displayCh) result.displayCh = displayCh;
    if (customization?.rgb && state.iflags?.wc_color !== false) {
        result.rgb = [...customization.rgb];
        result.displayColor = `rgb(${customization.rgb.join(', ')})`;
    }
    return result;
}

function knownBranchStairway(stairway, state) {
    return Boolean(stairway?.u_traversed
        && stairway.tolev?.dnum !== state.u?.uz?.dnum);
}

function drawbridgeMask(loc) {
    // drawbridgemask aliases struct rm's flags.  Keep the compatibility
    // field for state written by the earlier JS map representation.
    return loc.flags || loc.drawbridgemask || 0;
}

function altarPresentation(loc, state) {
    const mask = (loc.altarmask ?? loc.flags ?? 0);
    let category;
    let color;
    if ((mask & AM_SANCTUM) === AM_SANCTUM) {
        category = 'other';
        color = CLR_BRIGHT_MAGENTA;
    } else {
        switch (mask & AM_MASK) {
        case AM_LAWFUL:
            category = 'lawful';
            color = CLR_GRAY;
            break;
        case AM_NEUTRAL:
            category = 'neutral';
            color = CLR_GRAY;
            break;
        case AM_CHAOTIC:
            category = 'chaotic';
            color = CLR_GRAY;
            break;
        default:
            category = 'unaligned';
            color = CLR_RED;
            break;
        }
    }
    return terrainCmap(
        S_altar, color, state, `G_${category}_altar`,
    );
}

function accessibilityOverridesEnabled(state) {
    // C ref: display.c map_glyphinfo() and reset_glyphmap().  Merely defining
    // S_hero_override or S_pet_override is insufficient; sysconf must also
    // enable the accessibility glyph behavior.
    return state.sysopt?.accessibility === 1;
}

export function hero_glyph_info(state = game) {
    const showRace = Boolean(state.flags?.showrace);
    const mnum = showRace ? state.urace?.mnum : state.u?.umonnum;
    const species = state.mons?.[mnum] ?? state.youmonst?.data;
    const symbol = (accessibilityOverridesEnabled(state)
        ? optional_misc_symbol(SYM_HERO_OVERRIDE, state) : null)
        ?? monster_class_symbol(species?.mlet ?? 53, state);
    return glyphPresentation(
        symbol,
        showRace ? HI_DOMESTIC : species?.mcolor ?? CLR_WHITE,
        state,
    );
}

export function monster_glyph_info(monster, state = game) {
    if (!monster?.data)
        throw new TypeError('monster_glyph_info requires monster data');
    const appearanceType = monster.m_ap_type & M_AP_TYPMASK;
    if (appearanceType === M_AP_FURNITURE) {
        // C ref: display.c display_monster() maps a furniture appearance
        // through cmap_to_glyph(), independently of the underlying terrain.
        const sym = monster.mappearance;
        if (sym >= S_vwall && sym <= S_trwall)
            return terrainCmap(sym, NO_COLOR, state);
        switch (sym) {
        case S_ndoor:
        case S_room:
        case S_darkroom:
        case S_corr:
        case S_litcorr:
        case S_upstair:
        case S_dnstair:
            return terrainCmap(sym, NO_COLOR, state);
        case S_vodoor:
        case S_hodoor:
        case S_vcdoor:
        case S_hcdoor:
        case S_upladder:
        case S_dnladder:
            return terrainCmap(sym, CLR_BROWN, state);
        case S_bars:
            return terrainCmap(sym, HI_METAL, state);
        case S_tree:
            return terrainCmap(sym, CLR_GREEN, state);
        case S_engroom:
        case S_engrcorr:
            return terrainCmap(sym, CLR_BRIGHT_BLUE, state);
        case S_brupstair:
        case S_brdnstair:
        case S_brupladder:
        case S_brdnladder:
        case S_throne:
            return terrainCmap(sym, CLR_YELLOW, state);
        case S_altar:
            // cmap_to_glyph(S_altar) deliberately chooses neutral rather than
            // the alignment stored in the mimic's mcorpsenm overlay.
            return altarPresentation({ altarmask: AM_NEUTRAL }, state);
        case S_grave:
        case S_sink:
            return terrainCmap(sym, CLR_WHITE, state);
        case S_fountain:
            return terrainCmap(
                sym, CLR_BRIGHT_BLUE, state, 'G_fountain',
            );
        default:
            // Special-level descriptors can name other cmap entries. Keep
            // their symbol source-faithful even when no specialized color
            // mapping is needed by initial-level generation.
            return terrainCmap(sym, NO_COLOR, state);
        }
    }
    if (appearanceType === M_AP_OBJECT) {
        const storedCorpsenm = monster.mextra?.mcorpsenm;
        // C ref: display.c display_monster().  The temporary object starts
        // from zeroobj, so its class remains zero even though normal object
        // glyphs still derive their class from otyp.  That distinction is
        // visible for distant gems and spellbooks, and makes fake potions
        // concrete rather than generic.  display_monster() deliberately uses
        // PM_TENGU as a valid species placeholder when the mimic has no
        // mcorpsenm; corpse color and statue symbols can observe that field.
        const fakeObject = {
            otyp: monster.mappearance,
            oclass: 0,
            corpsenm: Number.isInteger(storedCorpsenm)
                && storedCorpsenm !== NON_PM
                ? storedCorpsenm : PM_TENGU,
            dknown: false,
            ox: monster.mx,
            oy: monster.my,
        };
        // map_object() observes only glyph_is_generic_object().  Class zero
        // is deliberately outside that glyph range, so even a nearby fake
        // gem or spellbook remains unobserved.
        return object_glyph_info(fakeObject, state);
    }
    const symbol = monster.mtame && accessibilityOverridesEnabled(state)
        ? optional_misc_symbol(SYM_PET_OVERRIDE, state)
            ?? monster_class_symbol(monster.data.mlet, state)
        : monster_class_symbol(monster.data.mlet, state);
    const glyph = glyphPresentation(symbol, monster.data.mcolor, state);
    // C ref: win/tty/wintty.c:tty_print_glyph(). Pet highlighting is a tty
    // presentation attribute; it does not alter the remembered floor glyph.
    if (monster.mtame && state.iflags?.wc_hilite_pet) {
        glyph.attr = state.iflags.wc2_petattr ?? ATR_INVERSE;
    }
    return glyph;
}

// C ref: display.h obj_is_generic().  Unobserved potions, real/glass gems,
// and ordinary spellbooks conceal their description color until nearby.
export function object_is_generic(obj) {
    return !obj?.dknown
        && (obj?.oclass === POTION_CLASS
            || (obj?.otyp >= FIRST_REAL_GEM && obj.otyp <= LAST_GLASS_GEM)
            || (obj?.otyp >= FIRST_SPELL && obj.otyp <= LAST_SPELL));
}

// C ref: display.h obj_is_piletop(). A top boulder conceals non-boulders
// beneath it, but two stacked boulders still use the pile-top glyph family.
function object_is_piletop(obj, state) {
    const next = state.level?.objects?.[obj.ox]?.[obj.oy]?.nexthere;
    return obj.where === OBJ_FLOOR
        && Boolean(next)
        && (obj.otyp !== BOULDER || next.otyp === BOULDER);
}

export function object_glyph_info(obj, state = game) {
    if (!obj) throw new TypeError('object_glyph_info requires an object');
    const generic = object_is_generic(obj);
    const actualType = state.objects?.[obj.otyp];
    const type = generic ? state.objects?.[obj.oclass] : actualType;
    let symbol;
    let color = type?.oc_color ?? NO_COLOR;
    if (obj.otyp === BOULDER) {
        symbol = misc_symbol(SYM_BOULDER, state);
    } else if (obj.otyp === STATUE && state.mons?.[obj.corpsenm]) {
        symbol = monster_class_symbol(state.mons[obj.corpsenm].mlet, state);
    } else {
        const objectClass = obj.otyp === CORPSE
            ? FOOD_CLASS
            : generic ? obj.oclass : actualType?.oc_class ?? obj.oclass;
        symbol = object_class_symbol(
            objectClass,
            state,
            generic ? objectClass : obj.otyp,
        );
        if (obj.otyp === CORPSE && state.mons?.[obj.corpsenm])
            color = state.mons[obj.corpsenm].mcolor;
    }
    const glyph = glyphPresentation(symbol, color, state);
    // C ref: win/tty/wintty.c tty_print_glyph(). Pile highlighting is a tty
    // presentation attribute and is suppressed together with inverse video.
    if (object_is_piletop(obj, state)
        && state.iflags?.hilite_pile
        && state.iflags?.wc_inverse !== false) {
        glyph.attr = ATR_INVERSE;
    }
    return glyph;
}

// ── Terrain to display character + color + DEC flag ──
export function terrain_glyph(loc, x, y, state = game) {
    const typ = loc.typ;
    if (WALL_TYPES.has(typ)) {
        const arborealSecretDoor = typ === SDOOR
            && (loc.arboreal_sdoor || loc.candig);
        return terrainCmap(
            arborealSecretDoor
                ? S_tree : loc.seenv ? wall_angle(loc) : S_stone,
            arborealSecretDoor ? CLR_GREEN : NO_COLOR,
            state,
        );
    }

    switch (typ) {
    case SCORR:
    case STONE:
        return state.level?.flags?.arboreal
            ? terrainCmap(S_tree, CLR_GREEN, state)
            : terrainCmap(S_stone, NO_COLOR, state);
    case ROOM:
        return terrainCmap(S_room, NO_COLOR, state);
    case IRONBARS:
        return terrainCmap(S_bars, HI_METAL, state);
    case TREE:
        return terrainCmap(S_tree, CLR_GREEN, state);
    case ALTAR:
        return altarPresentation(loc, state);
    case GRAVE:
        return terrainCmap(S_grave, CLR_WHITE, state);
    case THRONE:
        return terrainCmap(S_throne, CLR_YELLOW, state);
    case SINK:
        return terrainCmap(S_sink, CLR_WHITE, state);
    case FOUNTAIN: {
        return terrainCmap(
            S_fountain, CLR_BRIGHT_BLUE, state, 'G_fountain',
        );
    }
    case POOL:
    case MOAT:
        return terrainCmap(S_pool, CLR_BLUE, state);
    case ICE:
        return terrainCmap(S_ice, CLR_CYAN, state);
    case LAVAPOOL:
        return terrainCmap(S_lava, CLR_RED, state);
    case LAVAWALL:
        return terrainCmap(S_lavawall, CLR_ORANGE, state);
    case AIR:
        return terrainCmap(S_air, CLR_CYAN, state);
    case CLOUD:
        return terrainCmap(S_cloud, NO_COLOR, state);
    case WATER:
        return terrainCmap(S_water, CLR_BRIGHT_BLUE, state);
    case CORR: {
        const lit = Boolean(loc.waslit || state.flags?.lit_corridor);
        const cmap = lit ? S_litcorr : S_corr;
        const glyph = terrainCmap(cmap, NO_COLOR, state);
        if (lit) {
            const darkSymbol = cmap_symbol(S_corr, state);
            if (mapColorEnabled(state)
                && glyph.ch === darkSymbol.ch && glyph.dec === darkSymbol.dec) {
                // reset_glyphmap() preserves a visible distinction when the
                // configured dark and lit corridor symbols are identical.
                glyph.color = CLR_WHITE;
            }
        }
        return glyph;
    }
    case DOOR: {
        let cmap;
        // struct rm aliases flags and doormask. New level generation writes
        // flags; the fallback keeps older callers which filled doormask.
        const doormask = loc.flags || loc.doormask || 0;
        if (!doormask || (doormask & D_BROKEN)) cmap = S_ndoor;
        else if (doormask & D_ISOPEN) {
            cmap = loc.horizontal ? S_hodoor : S_vodoor;
        } else {
            cmap = loc.horizontal ? S_hcdoor : S_vcdoor;
        }
        return terrainCmap(
            cmap,
            cmap === S_ndoor ? NO_COLOR : CLR_BROWN,
            state,
        );
    }
    case STAIRS: {
        // C refs: display.c:back_to_glyph(), stairs.c:known_branch_stairs().
        const stairway = stairwayAt(state, x, y);
        const down = Boolean(loc.ladder & LA_DOWN);
        const knownBranch = knownBranchStairway(stairway, state);
        return terrainCmap(
            knownBranch
                ? down ? S_brdnstair : S_brupstair
                : down ? S_dnstair : S_upstair,
            knownBranch ? CLR_YELLOW : NO_COLOR,
            state,
        );
    }
    case LADDER: {
        const stairway = stairwayAt(state, x, y);
        const down = Boolean(loc.ladder & LA_DOWN);
        const knownBranch = knownBranchStairway(stairway, state);
        return terrainCmap(
            knownBranch
                ? down ? S_brdnladder : S_brupladder
                : down ? S_dnladder : S_upladder,
            knownBranch ? CLR_YELLOW : CLR_BROWN,
            state,
        );
    }
    case DBWALL:
        return terrainCmap(
            loc.horizontal ? S_hcdbridge : S_vcdbridge,
            CLR_BROWN,
            state,
        );
    case DRAWBRIDGE_UP:
        switch (drawbridgeMask(loc) & DB_UNDER) {
        case DB_MOAT:
            return terrainCmap(S_pool, CLR_BLUE, state);
        case DB_LAVA:
            return terrainCmap(S_lava, CLR_RED, state);
        case DB_ICE:
            return terrainCmap(S_ice, CLR_CYAN, state);
        case DB_FLOOR:
        default:
            // back_to_glyph() diagnoses an invalid underlay and still uses
            // room floor, so callers always receive a drawable background.
            return terrainCmap(S_room, NO_COLOR, state);
        }
    case DRAWBRIDGE_DOWN:
        return terrainCmap(
            loc.horizontal ? S_hodbridge : S_vodbridge,
            CLR_BROWN,
            state,
        );
    default:
        // display.c:back_to_glyph() uses room floor after its impossible().
        return terrainCmap(S_room, NO_COLOR, state);
    }
}

// ── show_glyph_cell ──
export function show_glyph_cell(
    x,
    y,
    ch,
    color = NO_COLOR,
    decgfx = false,
    attr = 0,
    displayCh = null,
    displayColor = null,
) {
    const loc = game.level?.at(x, y);
    if (!loc) return;
    if (ch !== null) {
        loc.disp_ch = ch;
        loc.disp_color = color;
        loc.disp_decgfx = !!decgfx;
        loc.disp_attr = attr | 0;
    }
    loc.disp_browser_ch = displayCh;
    loc.disp_browser_color = displayColor ?? (displayCh ? color : null);
    loc.disp_browser_attr = displayCh ? attr | 0 : null;
    loc.gnew = 1;
}

function rememberedMapGlyph(glyph) {
    const remembered = {
        ch: glyph.ch,
        color: glyph.color,
        decgfx: glyph.dec,
        displayCh: glyph.displayCh ?? null,
    };
    if (glyph.attr) remembered.attr = glyph.attr;
    if (glyph.displayColor) remembered.displayColor = glyph.displayColor;
    if (glyph.rgb) remembered.rgb = [...glyph.rgb];
    return remembered;
}

// C refs: engrave.h engraving_to_defsym()/spot_shows_engravings();
// display.c map_engraving(). Ice uses the room engraving symbol.
function engravingGlyph(engraving, loc, state) {
    if (!engraving?.erevealed
        || (loc.typ !== ROOM && loc.typ !== ICE && loc.typ !== CORR)) {
        return null;
    }
    const glyph = terrainCmap(
        loc.typ === CORR ? S_engrcorr : S_engroom,
        CLR_BRIGHT_BLUE,
        state,
    );
    if (loc.typ === CORR && state.iflags?.wc_inverse !== false) {
        const engraved = cmap_symbol_byte(S_engrcorr, state);
        if (engraved === cmap_symbol_byte(S_corr, state)
            || engraved === cmap_symbol_byte(S_litcorr, state)) {
            // display.c:reset_glyphmap() marks an otherwise indistinguishable
            // corridor engraving with MG_BW_ENGR; tty uses inverse video.
            glyph.attr = ATR_INVERSE;
        }
    }
    return glyph;
}

function sameLevel(a, b) {
    return Boolean(a && b
        && a.dnum === b.dnum && a.dlevel === b.dlevel);
}

function floorLayersCovered(loc, state) {
    // C refs: display.h covers_objects()/covers_traps(); dbridge.c is_pool()
    // and is_lava().  A submerged hero sees through water to floor layers.
    if (loc.typ === LAVAPOOL || loc.typ === LAVAWALL) return true;
    let pool = loc.typ === POOL || loc.typ === MOAT || loc.typ === WATER;
    if (loc.typ === DRAWBRIDGE_UP
        && (drawbridgeMask(loc) & DB_UNDER) === DB_MOAT
        && !sameLevel(state.u?.uz, state.juiblex_level)) {
        pool = true;
    }
    return pool && !state.u?.uinwater;
}

function trapGlyph(trap, state) {
    const color = TRAP_COLORS[trap.ttyp];
    if (color === undefined)
        throw new RangeError(`trap type ${trap.ttyp} has no display color`);
    return terrainCmap(trap_to_defsym(trap.ttyp), color, state);
}

function observeNearbyObject(object, x, y, state) {
    if (!object_is_generic(object) || !cansee(x, y, state)) return;
    const radius = state.u?.xray_range > 2 ? state.u.xray_range : 2;
    const nearDistance = radius * radius * 2 - radius;
    if (dist2(x, y, state.u?.ux ?? 0, state.u?.uy ?? 0) <= nearDistance)
        observe_object(object, state);
}

// ── newsym ──
export function newsym(x, y) {
    const loc = game.level?.at(x, y);
    if (!loc) return;

    const visible = cansee(x, y);
    if (visible) {
        // display.c:newsym() snapshots permanent location lighting at the
        // physical-visibility boundary, before any covering layer returns.
        loc.waslit = Boolean(loc.lit);
    }
    const engraving = engr_at(x, y, game);
    // display.c:newsym() reveals a visible engraving even when an object,
    // monster, or the hero currently covers its glyph.
    if (visible && engraving) engraving.erevealed = true;

    // display.c:newsym() lets a visible gas region cover every accessible
    // location, including the hero. Ordinary visible, unsensed monsters only
    // override it when adjacent; object-disguised mimics do not. Returning
    // here intentionally leaves the remembered underlying glyph untouched.
    const region = visible ? visible_region_at(x, y, game) : null;
    if (region && ACCESSIBLE(loc.typ)) {
        const monster = m_at(x, y, game);
        const adjacentVisibleMonster = monster
            && !monster.minvis
            && !monster.mundetected
            && ![M_AP_FURNITURE, M_AP_OBJECT].includes(
                monster.m_ap_type & M_AP_TYPMASK,
            )
            && dist2(x, y, game.u?.ux ?? 0, game.u?.uy ?? 0) <= 2;
        if (!adjacentVisibleMonster) {
            const cloud = terrainCmap(
                region.glyph,
                region.arg ? CLR_BRIGHT_GREEN : CLR_GRAY,
                game,
            );
            show_glyph_cell(
                x, y, cloud.ch, cloud.color, cloud.dec, cloud.attr ?? 0,
                cloud.displayCh ?? null, cloud.displayColor ?? null,
            );
            return;
        }
    }

    const covered = floorLayersCovered(loc, game);
    const object = covered
        ? null : game.level?.objects?.[x]?.[y] ?? null;
    if (object) observeNearbyObject(object, x, y, game);
    const trap = covered ? null : t_at(x, y, game);
    let underlying;
    if (object) underlying = object_glyph_info(object, game);
    else if (trap?.tseen) underlying = trapGlyph(trap, game);
    else {
        underlying = engravingGlyph(engraving, loc, game)
            ?? terrain_glyph(loc, x, y);
    }

    if (game.u?.ux === x && game.u?.uy === y) {
        const hero = hero_glyph_info(game);
        show_glyph_cell(
            x, y, hero.ch, hero.color, hero.dec, hero.attr ?? 0,
            hero.displayCh ?? null, hero.displayColor ?? null,
        );
        if (game.level?.flags?.hero_memory)
            loc.remembered_glyph = rememberedMapGlyph(underlying);
        return;
    }

    // Only update display/memory if cell is IN_SIGHT (lit and visible)
    if (visible) {
        const monster = m_at(x, y, game);
        const monsterVisible = Boolean(
            monster && !monster.minvis && !monster.mundetected,
        );
        const shown = monsterVisible
            ? monster_glyph_info(monster, game)
            : underlying;
        // display_monster() maps an unsensed mimic appearance onto memory.
        // Ordinary monsters leave memory as the actual layer underneath them.
        const remembered = monsterVisible
            && [M_AP_FURNITURE, M_AP_OBJECT].includes(
                monster.m_ap_type & M_AP_TYPMASK,
            )
            ? shown : underlying;
        if (game.level?.flags?.hero_memory)
            loc.remembered_glyph = rememberedMapGlyph(remembered);
        show_glyph_cell(
            x,
            y,
            shown.ch,
            shown.color,
            shown.dec,
            shown.attr ?? 0,
            shown.displayCh ?? null,
            shown.displayColor ?? null,
        );
    } else if (loc.remembered_glyph) {
        // Out of sight but remembered — show remembered glyph
        show_glyph_cell(x, y, loc.remembered_glyph.ch,
            loc.remembered_glyph.color, loc.remembered_glyph.decgfx,
            loc.remembered_glyph.attr ?? 0,
            loc.remembered_glyph.displayCh,
            loc.remembered_glyph.displayColor ?? null);
    }
}

// ── docrt ──
export async function docrt() {
    if (!game.level) return;
    for (let y = 0; y < ROWNO; y++)
        for (let x = 1; x < COLNO; x++) newsym(x, y);
    // display.c docrt(): the full redraw invalidates the tty status window;
    // the next flush performs bot() before placing the hero cursor.
    game.disp ??= {};
    game.disp.botlx = true;
}

// ── Status lines ──
const BOTL_NSIZ = 16; // include/botl.h
const TTY_STATUS_WIDTH = COLNO - 1;
const STATUS_HP_BAR_WIDTH = 30;

export function get_strength_str(strength) {
    const value = Math.trunc(strength ?? 0);
    if (value <= 18) return `${value}`;
    if (value > STR18(100)) return `${value - 100}`;
    if (value < STR18(100)) {
        return `18/${String(value - 18).padStart(2, '0')}`;
    }
    return '18/**';
}

// C ref: weapon.c P_NAME() and weapon_descr(). These are the singular skill
// descriptions which survive botl.c:weapon_status()'s special cases.
const WEAPON_SKILL_DESCRIPTIONS = Object.freeze({
    [P_DAGGER]: 'dagger',
    [P_KNIFE]: 'knife',
    [P_AXE]: 'axe',
    [P_PICK_AXE]: 'pick-axe',
    [P_CLUB]: 'club',
    [P_MACE]: 'mace',
    [P_MORNING_STAR]: 'morning star',
    [P_FLAIL]: 'flail',
    [P_HAMMER]: 'hammer',
    [P_QUARTERSTAFF]: 'quarterstaff',
    [P_POLEARMS]: 'polearms',
    [P_SPEAR]: 'spear',
    [P_TRIDENT]: 'trident',
    [P_LANCE]: 'lance',
    [P_BOW]: 'bow',
    [P_SLING]: 'sling',
    [P_CROSSBOW]: 'crossbow',
    [P_DART]: 'dart',
    [P_SHURIKEN]: 'shuriken',
    [P_BOOMERANG]: 'boomerang',
    [P_WHIP]: 'whip',
    [P_UNICORN_HORN]: 'unicorn horn',
});

// C ref: drawing.c def_oc_syms[].name after weapon.c makesingular().
const OBJECT_CLASS_DESCRIPTIONS = Object.freeze({
    [ILLOBJ_CLASS]: 'illegal object',
    [WEAPON_CLASS]: 'weapon',
    [ARMOR_CLASS]: 'armor',
    [RING_CLASS]: 'ring',
    [AMULET_CLASS]: 'amulet',
    [TOOL_CLASS]: 'tool',
    [FOOD_CLASS]: 'food',
    [POTION_CLASS]: 'potion',
    [SCROLL_CLASS]: 'scroll',
    [SPBOOK_CLASS]: 'spellbook',
    [WAND_CLASS]: 'wand',
    [COIN_CLASS]: 'coin',
    [GEM_CLASS]: 'rock',
    [ROCK_CLASS]: 'large stone',
    [BALL_CLASS]: 'iron ball',
    [CHAIN_CLASS]: 'chain',
    [VENOM_CLASS]: 'venom',
});

function _objectName(obj, state) {
    return OBJ_NAME(objectType(obj, state), state)
        ?? OBJECT_CLASS_DESCRIPTIONS[obj.oclass]
        ?? 'object';
}

function _statusAmmo(obj, state) {
    const type = objectType(obj, state);
    const skill = Math.trunc(type.oc_skill ?? type.oc_subtyp ?? 0);
    return (obj.oclass === WEAPON_CLASS || obj.oclass === GEM_CLASS)
        && skill >= -P_CROSSBOW && skill <= -P_BOW;
}

// C ref: weapon.c weapon_descr().
function _weaponDescr(obj, state) {
    const skill = weapon_type(obj, state);
    let description = WEAPON_SKILL_DESCRIPTIONS[skill];

    if (skill === 0) {
        if ([CORPSE, TIN, EGG, STATUE, BOULDER, TOWEL, TIN_OPENER]
            .includes(obj.otyp)) {
            description = _objectName(obj, state);
        } else if (obj.globby) {
            description = 'glob';
        } else {
            description = OBJECT_CLASS_DESCRIPTIONS[obj.oclass] ?? 'object';
        }
    } else if (skill === P_SLING && _statusAmmo(obj, state)) {
        description = obj.otyp === ROCK
            || (obj.otyp >= LUCKSTONE && obj.otyp <= FLINT)
            ? 'stone'
            : obj.oclass === GEM_CLASS
                ? 'gem'
                : OBJECT_CLASS_DESCRIPTIONS[obj.oclass] ?? 'object';
    } else if (skill === P_BOW && _statusAmmo(obj, state)) {
        description = 'arrow';
    } else if (skill === P_CROSSBOW && _statusAmmo(obj, state)) {
        description = 'bolt';
    } else if (skill === P_FLAIL && obj.otyp === GRAPPLING_HOOK) {
        description = 'hook';
    } else if (skill === P_PICK_AXE && obj.otyp === DWARVISH_MATTOCK) {
        description = 'mattock';
    }
    return description ?? _objectName(obj, state);
}

// C ref: botl.c weapon_status().
export function weapon_status(state = game) {
    const u = state.u;
    const weapon = state.uwep;
    if (!weapon) {
        if (state.uarmg) return 'Empty-hnd';
        const species = state.mons?.[u?.umonnum] ?? state.youmonst?.data;
        return species && (species.mflags1 & M1_HUMANOID)
            ? 'Bare-hnds' : 'No-weapon';
    }
    if (u?.twoweap) {
        const lance = weapon_type(weapon, state) === P_LANCE
            || weapon_type(state.uswapwep, state) === P_LANCE;
        return u.usteed && lance ? 'Dual+joust' : 'Dual-weps';
    }

    const skill = weapon_type(weapon, state);
    let description;
    if (u?.usteed && skill === P_LANCE) description = 'joust';
    else if (weapon.otyp === AKLYS) description = 'aklys';
    else if (weapon.oclass === WEAPON_CLASS
             && skill >= P_SHORT_SWORD && skill <= P_SABER) {
        description = 'sword';
    } else {
        switch (skill) {
        case P_QUARTERSTAFF: description = 'staff'; break;
        case P_MORNING_STAR: description = 'mrng-star'; break;
        case P_POLEARMS: description = 'pole'; break;
        case P_UNICORN_HORN: description = 'unihorn'; break;
        default:
            description = _weaponDescr(weapon, state);
            if (description.toLowerCase() === 'food'
                && weapon.otyp === CREAM_PIE) description = 'pie';
            break;
        }
    }

    description = description[0].toUpperCase() + description.slice(1);
    let result = '';
    if ((weapon.oclass === WEAPON_CLASS || isWeptool(weapon, state))
        && bimanual(weapon, state)
        && !description.startsWith('2')
        && !description.toLowerCase().startsWith('two')) result = '2H-';
    result += description;
    return result.replaceAll(' ', '-');
}

function _helmetSimpleName(helmet) {
    return [ELVEN_LEATHER_HELM, FEDORA, CORNUTHAUM, DUNCE_CAP]
        .includes(helmet.otyp) ? 'hat' : 'helm';
}

// C ref: botl.c armor_status().
export function armor_status(state = game) {
    const slots = [
        state.uarmg,
        state.uarmc,
        state.uarm,
        state.uarmu,
        state.uarmh,
        state.uarmf,
        state.uarms,
    ];
    const count = slots.filter(Boolean).length;
    let result;
    if (count === 0) {
        result = 'naked';
    } else if (count === 1) {
        result = state.uarmg ? 'gloves'
            : state.uarmc ? 'cloak'
                : state.uarm ? 'suit'
                    : state.uarmu ? 'shirt'
                        : state.uarmh ? _helmetSimpleName(state.uarmh)
                            : state.uarmf ? 'boots' : 'shield';
    } else {
        result = [
            state.uarmg && 'G',
            state.uarmc && 'C',
            state.uarm && 'A',
            state.uarmu && 'U',
            state.uarmh && 'H',
            state.uarmf && 'B',
            state.uarms && 'S',
        ].filter(Boolean).join('');
    }

    if (state.uright?.otyp === RIN_PROTECTION
        || state.uleft?.otyp === RIN_PROTECTION
        || state.uamul?.otyp === AMULET_OF_GUARDING
        || state.uarmc?.otyp === CLOAK_OF_PROTECTION
        || state.uarmh?.oartifact === ART_MITRE_OF_HOLINESS
        || state.uwep?.oartifact === ART_TSURUGI_OF_MURAMASA) result += '+';
    return result[0].toUpperCase() + result.slice(1);
}

const TERRAIN_DESCRIPTIONS = Object.freeze([
    'Stone', 'Wall', 'Wall', 'Wall', 'Wall', 'Wall', 'Wall', 'Wall',
    'Wall', 'Wall', 'Wall', 'Wall', 'Portcullis', 'Tree', 'Wall',
    'Stone', 'Pool', 'Moat', 'Water', '(gap)', 'Lava', 'LavaWall',
    'Bars', 'Doorway', 'Corridor', 'Room', 'Stairs', 'Ladder', 'Fountain',
    'Throne', 'Sink', 'Grave', 'Altar', 'Ice', 'Bridge', 'Air', 'Cloud',
    '', 'Wall', 'Floor', 'Ground', 'Open-door', 'Shut-door', 'Swamp',
    'Submerged', 'Sea', 'WaterWall',
]);

// C ref: hack.c classify_terrain(). The pseudo-types 39..46 are indices in
// botl.c terrain_descr[], not map terrain values.
export function classify_terrain(state = game) {
    const u = state.u;
    const loc = state.level?.at(u?.ux, u?.uy);
    let typ = state.level?.lastseentyp?.[u?.ux]?.[u?.uy] ?? loc?.typ ?? STONE;

    if (u?.uinwater) {
        typ = 44; // xSUBMERGED
    } else {
        switch (typ) {
        case STONE:
            if (state.level?.flags?.arboreal) typ = TREE;
            break;
        case CORR:
        case ROOM:
            typ = sameLevel(u?.uz, state.earth_level) ? 40 : 39;
            break;
        case DOOR: {
            const mask = loc?.flags || loc?.doormask || 0;
            if (mask & D_ISOPEN) typ = 41;
            else if (mask & (D_CLOSED | D_LOCKED | D_TRAPPED)) typ = 42;
            break;
        }
        case DRAWBRIDGE_UP: {
            const under = drawbridgeMask(loc ?? {}) & DB_UNDER;
            typ = under === DB_ICE ? ICE
                : under === DB_LAVA ? LAVAPOOL
                    : under === DB_MOAT ? MOAT : STONE;
            if (typ === STONE || typ === ROOM) typ = 40;
            break;
        }
        case MOAT:
            if (sameLevel(u?.uz, state.medusa_level)) typ = 45;
            else if (sameLevel(u?.uz, state.juiblex_level)) typ = 43;
            break;
        case WATER:
            if (!sameLevel(u?.uz, state.water_level)) typ = 46;
            break;
        default:
            break;
        }
    }

    state.iflags ??= {};
    state.iflags.terrain_typ = typ;
    return typ;
}

function _terrainStatus(state = game) {
    const typ = classify_terrain(state);
    return TERRAIN_DESCRIPTIONS[typ] ?? '';
}

function _optionalStatusEntries() {
    const fields = [];
    if (game.flags?.weaponstatus) {
        fields.push({ field: 'weapon', text: weapon_status(game) });
    }
    if (game.flags?.armorstatus) {
        fields.push({ field: 'armor', text: armor_status(game) });
    }
    if (game.flags?.terrainstatus) {
        fields.push({ field: 'terrain', text: _terrainStatus(game) });
    }
    return fields;
}

function _optionalStatusFields() {
    const fields = _optionalStatusEntries();
    return fields.length ? ` ${fields.map(({ text }) => text).join(' ')}` : '';
}

function _statusPlayerName() {
    // C ref: botl.c bot_via_windowport(). Capitalize only the initial ASCII
    // byte, then truncate only when the complete title exceeds 30 bytes.
    const rawName = game.plname || 'Hero';
    const role = rankOf(game.urole, game.u?.ulevel ?? 1, game.flags?.female)
        || game.urole?.rank?.m || game.urole?.name?.m || 'Adventurer';
    const nameBytes = encodeUtf8ByteString(rawName);
    const roleBytes = encodeUtf8ByteString(role);
    if (nameBytes[0] >= 0x61 && nameBytes[0] <= 0x7A) {
        nameBytes[0] -= 0x20;
    }
    if (nameBytes.length + 5 + roleBytes.length > 30) {
        nameBytes.length = Math.min(
            nameBytes.length,
            Math.max(30 - 5 - roleBytes.length, BOTL_NSIZ),
        );
    }
    // wintty.c:tty_putstatusfield() advances once per byte. Use NUL as an
    // internal skipped-cell marker for high-bit bytes; _newStatusRow() turns
    // each marker into an unowned blank, matching patch 006 nomux_putch().
    return nameBytes.map((byte) => (
        byte < 0x80 ? String.fromCharCode(byte) : '\0'
    )).join('');
}

function _statusTitle() {
    const u = game.u;
    if (!u) return '';
    const name = _statusPlayerName();
    const role = rankOf(game.urole, u.ulevel ?? 1, game.flags?.female)
        || game.urole?.rank?.m || game.urole?.name?.m || 'Adventurer';
    return `${name} the ${role}`;
}

function _statusHitpointBarTitle() {
    let bar = _statusTitle()
        .slice(0, STATUS_HP_BAR_WIDTH)
        .padEnd(STATUS_HP_BAR_WIDTH);
    if (_criticallyLowHp(true)) {
        const chars = [...bar];
        for (let index = chars.length - 1; index >= 1; index -= 2) {
            if (chars[index] === ' ' && chars[index - 1] === ' ') {
                chars[index] = '-';
            }
        }
        bar = chars.join('');
    }
    return bar;
}

function _statusAlignment(u = game.u) {
    return u?.ualign?.type === 0
        ? 'Neutral' : u?.ualign?.type > 0 ? 'Lawful' : 'Chaotic';
}

const HUNGER_STATUS = Object.freeze([
    'Satiated', '', 'Hungry', 'Weak', 'Fainting', 'Fainted', 'Starved',
]);

function _propertyActive(u, index) {
    const property = u.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function _propertyIntrinsic(u, index) {
    return Boolean(u.uprops?.[index]?.intrinsic);
}

function _propertyActiveUnblocked(u, index) {
    return _propertyActive(u, index) && !u.uprops?.[index]?.blocked;
}

function _hungerStatus(u) {
    if ((u.uhs ?? NOT_HUNGRY) === NOT_HUNGRY) return '';
    const hunger = HUNGER_STATUS[u.uhs];
    return hunger ? ` ${hunger}` : '';
}

const STATUS_CONDITION_SPECS = Object.freeze([
    { option: 'barehanded', rank: 20, enabled: false,
        forms: ['Bare', 'Bar', 'Bh'] },
    { option: 'blind', rank: 10, enabled: true,
        forms: ['Blind', 'Blnd', 'Bl'] },
    { option: 'conf', rank: 10, enabled: true,
        forms: ['Conf', 'Cnf', 'Cf'] },
    { option: 'deaf', rank: 10, enabled: true,
        forms: ['Deaf', 'Def', 'Df'] },
    { option: 'fly', rank: 10, enabled: true,
        forms: ['Fly', 'Fly', 'Fl'] },
    { option: 'foodpois', rank: 6, enabled: true,
        forms: ['FoodPois', 'Fpois', 'Poi'] },
    { option: 'hallucinat', rank: 10, enabled: true,
        forms: ['Hallu', 'Hal', 'Hl'] },
    { option: 'ice', rank: 20, enabled: false,
        forms: ['Icy', 'Icy', 'Ic'] },
    { option: 'levitate', rank: 10, enabled: true,
        forms: ['Lev', 'Lev', 'Lv'] },
    { option: 'ride', rank: 10, enabled: true,
        forms: ['Ride', 'Rid', 'Rd'] },
    { option: 'slime', rank: 6, enabled: true,
        forms: ['Slime', 'Slim', 'Slm'] },
    { option: 'stone', rank: 6, enabled: true,
        forms: ['Stone', 'Ston', 'Sto'] },
    { option: 'strngl', rank: 4, enabled: true,
        forms: ['Strngl', 'Stngl', 'Str'] },
    { option: 'stun', rank: 10, enabled: true,
        forms: ['Stun', 'Stun', 'St'] },
    { option: 'termill', rank: 6, enabled: true,
        forms: ['TermIll', 'Ill', 'Ill'] },
]);

function _statusConditionActive(option, u) {
    switch (option) {
    case 'barehanded': return !game.uarmg && !game.uwep;
    case 'blind': return _propertyActiveUnblocked(u, BLINDED);
    case 'conf': return _propertyIntrinsic(u, CONFUSION);
    case 'deaf': return _propertyActive(u, DEAF) || u.uroleplay?.deaf;
    case 'fly': return _propertyActiveUnblocked(u, FLYING);
    case 'foodpois':
        return _propertyIntrinsic(u, SICK)
            && Boolean((u.usick_type ?? 0) & SICK_VOMITABLE);
    case 'hallucinat':
        return _propertyIntrinsic(u, HALLUC)
            && !_propertyActive(u, HALLUC_RES);
    case 'ice':
        return game.level?.at(u.ux, u.uy)?.typ === ICE;
    case 'levitate': return _propertyActiveUnblocked(u, LEVITATION);
    case 'ride': return Boolean(u.usteed);
    case 'slime': return _propertyIntrinsic(u, SLIMED);
    case 'stone': return _propertyIntrinsic(u, STONED);
    case 'strngl': return _propertyIntrinsic(u, STRANGLED);
    case 'stun': return _propertyIntrinsic(u, STUNNED);
    case 'termill':
        return _propertyIntrinsic(u, SICK)
            && Boolean((u.usick_type ?? 0) & SICK_NONVOMITABLE);
    default: return false;
    }
}

// C ref: botl.c condtests[], conditions[], and cond_cmp(). Encumbrance remains
// absent at the new-game boundary because u_init_carry_attr_boost() guarantees
// that the initial inventory is within capacity.
function _statusConditionEntries(u, shrinkLevel = 0) {
    const configured = game.iflags?.status_conditions ?? {};
    return STATUS_CONDITION_SPECS
        .filter((spec) => (configured[spec.option] ?? spec.enabled)
            && _statusConditionActive(spec.option, u))
        .sort((left, right) => left.rank - right.rank
            || left.option.localeCompare(right.option))
        .map((spec) => ({
            option: spec.option,
            text: spec.forms[shrinkLevel],
        }));
}

function _statusConditions(u, shrinkLevel = 0) {
    const conditions = _statusConditionEntries(u, shrinkLevel);
    return conditions.length
        ? ` ${conditions.map(({ text }) => text).join(' ')}` : '';
}

function _statusExperience(u) {
    return game.flags?.showexp
        ? `${u.ulevel || 1}/${u.uexp || 0}`
        : `${u.ulevel || 1}`;
}

// C ref: botl.c describe_level(). The tutorial uses its branch label in the
// compact status field; ordinary startup retains the traditional Dlvl label.
function _statusLevelDescription(u, short = false) {
    const tutorial = Number.isInteger(game.tutorial_dnum)
        && u.uz?.dnum === game.tutorial_dnum;
    // wintty.c shrink_dlvl() replaces everything before the colon, including
    // special-level descriptions such as "Tutorial", with the short label.
    const label = short ? 'Dl' : tutorial ? 'Tutorial' : 'Dlvl';
    return `${label}:${dungeonDepth(u.uz)}`;
}

function _statusVitals(u) {
    return `$:${money_cnt(game.invent)} HP:${u.uhp || 0}(${u.uhpmax || 0}) Pw:${u.uen || 0}(${u.uenmax || 0}) AC:${u.uac ?? 10} Xp:${_statusExperience(u)}`;
}

function _statusLine2Configuration() {
    const u = game.u;
    if (!u) return null;
    const time = game.flags?.time ? ` T:${game.moves || 1}` : '';
    const optional = _optionalStatusFields();
    const versionLength = game.flags?.showvers
        ? status_version(game.flags).length + 1 : 0;
    let conditionLevel = 0;
    let capacityPadding = '';
    let shortLevel = false;
    const build = () => `${_statusLevelDescription(u, shortLevel)} ${_statusVitals(u)}${time}${_hungerStatus(u)}${capacityPadding}${_statusConditions(u, conditionLevel)}${optional}`;
    let status = build();
    // wintty.c make_things_fit() first tries both abbreviated condition
    // vocabularies, then shortens "Dlvl" to "Dl" before truncating.
    while (status.length + versionLength > TTY_STATUS_WIDTH
        && conditionLevel < 2) {
        conditionLevel++;
        status = build();
    }
    if (status.length + versionLength > TTY_STATUS_WIDTH) {
        // shrink_enc() reconstructs an unencumbered BL_CAP as one blank;
        // unlike tty_status_update(), it does not suppress that blank again.
        capacityPadding = ' ';
        status = build();
    }
    if (status.length + versionLength > TTY_STATUS_WIDTH) {
        shortLevel = true;
        status = build();
    }
    return { capacityPadding, conditionLevel, shortLevel, status };
}

function _statusLine3VitalsBase(u) {
    return `${_statusAlignment(u)} ${_statusVitals(u)}`;
}

function _statusLine3DetailsConfiguration() {
    const u = game.u;
    if (!u) return null;
    const time = game.flags?.time ? ` T:${game.moves || 1}` : '';
    const optional = _optionalStatusFields();
    const version = game.flags?.showvers ? status_version(game.flags) : '';
    const versionFieldLength = version ? version.length + 1 : 0;
    let conditionLevel = 0;
    let shortLevel = false;
    const prefix = () => `${_statusLevelDescription(u, shortLevel)}${time}`;
    let conditions = _statusConditions(u, conditionLevel);
    const nominalLength = () => prefix().length + conditions.length
        + optional.length + versionFieldLength;
    while (nominalLength() > TTY_STATUS_WIDTH && conditionLevel < 2) {
        conditionLevel++;
        conditions = _statusConditions(u, conditionLevel);
    }
    if (nominalLength() > TTY_STATUS_WIDTH) shortLevel = true;

    return { conditionLevel, conditions, optional, shortLevel, time, version };
}

function _newStatusRow() {
    const chars = new Array(TTY_STATUS_WIDTH).fill(' ');
    const owners = new Array(TTY_STATUS_WIDTH).fill(null);
    let extent = 0;
    const write = (start, text, owner = null) => {
        for (let index = 0; index < text.length; ++index) {
            const column = start + index;
            if (column >= 0 && column < TTY_STATUS_WIDTH) {
                const skippedByte = text[index] === '\0';
                chars[column] = skippedByte ? ' ' : text[index];
                owners[column] = skippedByte ? null : owner;
            }
        }
        extent = Math.max(
            extent,
            Math.min(TTY_STATUS_WIDTH, Math.max(0, start + text.length)),
        );
        return start + text.length;
    };
    const clear = (start, end) => {
        for (let column = Math.max(0, start);
            column < Math.min(TTY_STATUS_WIDTH, end);
            ++column) {
            chars[column] = ' ';
            owners[column] = null;
        }
        extent = Math.max(extent, Math.min(TTY_STATUS_WIDTH, end));
    };
    const finish = () => {
        let length = extent;
        while (length > 0 && chars[length - 1] === ' ') --length;
        return {
            text: chars.slice(0, length).join(''),
            owners: owners.slice(0, length),
        };
    };
    return { clear, finish, write };
}

function _fieldOwner(field) {
    return { kind: 'field', field };
}

function _conditionOwner(option) {
    return { kind: 'condition', option };
}

function _hpBarOwner() {
    return { kind: 'hitpoint-bar' };
}

function _writeSeparatedFields(row, start, entries) {
    let column = start;
    for (const { field, text } of entries) {
        column = row.write(column, ' ');
        column = row.write(column, text, _fieldOwner(field));
    }
    return column;
}

function _writeConditions(row, start, entries) {
    let column = start;
    for (const { option, text } of entries) {
        column = row.write(column, ' ');
        column = row.write(column, text, _conditionOwner(option));
    }
    return column;
}

function _writeVitals(row, start, u) {
    let column = start;
    column = row.write(column, `$:${money_cnt(game.invent)}`, _fieldOwner('gold'));
    column = row.write(column, ' ');
    column = row.write(column, `HP:${u.uhp || 0}`, _fieldOwner('hitpoints'));
    column = row.write(column, `(${u.uhpmax || 0})`, _fieldOwner('hitpoints-max'));
    column = row.write(column, ' ');
    column = row.write(column, `Pw:${u.uen || 0}`, _fieldOwner('power'));
    column = row.write(column, `(${u.uenmax || 0})`, _fieldOwner('power-max'));
    column = row.write(column, ' ');
    column = row.write(column, `AC:${u.uac ?? 10}`, _fieldOwner('armor-class'));
    column = row.write(column, ' ');
    column = row.write(
        column,
        `Xp:${u.ulevel || 1}`,
        _fieldOwner('experience-level'),
    );
    if (game.flags?.showexp) {
        column = row.write(column, '/');
        column = row.write(column, `${u.uexp || 0}`, _fieldOwner('experience'));
    }
    return column;
}

function _statusLine1Layout(includeAlignment = true) {
    const u = game.u;
    if (!u) return { text: '', owners: [] };
    const row = _newStatusRow();
    let column;
    if (game.iflags?.wc2_hitpointbar) {
        const hp = _statusFieldData('hitpoints');
        let barLength = Math.trunc(
            (STATUS_HP_BAR_WIDTH * hp.percent) / 100,
        );
        if (barLength < 1 && hp.percent > 0) barLength = 1;
        if (barLength >= STATUS_HP_BAR_WIDTH && hp.percent < 100) {
            barLength = STATUS_HP_BAR_WIDTH - 1;
        }
        row.write(0, '[');
        const bar = _statusHitpointBarTitle();
        // record-session.mjs ports the recorder harness's ANSI compression:
        // a run of at least five literal spaces becomes a cursor-forward
        // escape. Such skipped cells remain at terminal defaults even when
        // the C tty emitted the spaces inside the highlighted bar. Preserve
        // shorter padding runs because the harness leaves those bytes intact.
        const highlighted = bar.slice(0, barLength);
        const visibleLength = highlighted.trimEnd().length;
        const paddingLength = highlighted.length - visibleLength;
        const capturedLength = paddingLength >= 5
            ? visibleLength : highlighted.length;
        row.write(1, bar.slice(0, capturedLength), _hpBarOwner());
        row.write(1 + capturedLength, bar.slice(capturedLength));
        row.write(1 + STATUS_HP_BAR_WIDTH, ']');
        column = STATUS_HP_BAR_WIDTH + 2;
    } else {
        const title = _statusTitle().padEnd(STATUS_HP_BAR_WIDTH);
        row.write(0, title, _fieldOwner('title'));
        column = title.length;
    }

    column = Math.max(31, column + 1);
    const attrs = u.acurr?.a ?? [];
    const fields = [
        ['strength', `St:${attrs[A_STR] ? get_strength_str(attrs[A_STR]) : '?'}`],
        ['dexterity', `Dx:${attrs[A_DEX] || '?'}`],
        ['constitution', `Co:${attrs[A_CON] || '?'}`],
        ['intelligence', `In:${attrs[A_INT] || '?'}`],
        ['wisdom', `Wi:${attrs[A_WIS] || '?'}`],
        ['charisma', `Ch:${attrs[A_CHA] || '?'}`],
    ];
    for (let index = 0; index < fields.length; ++index) {
        if (index) column = row.write(column, ' ');
        const [field, text] = fields[index];
        column = row.write(column, text, _fieldOwner(field));
    }
    if (includeAlignment) {
        column = row.write(column, ' ');
        row.write(column, _statusAlignment(u), _fieldOwner('alignment'));
    }
    return row.finish();
}

function _statusLine2Layout() {
    const u = game.u;
    const configuration = _statusLine2Configuration();
    if (!u || !configuration) return { text: '', owners: [] };
    const { capacityPadding, conditionLevel, shortLevel, status } = configuration;
    const row = _newStatusRow();
    let column = row.write(
        0,
        _statusLevelDescription(u, shortLevel),
        _fieldOwner('dungeon-level'),
    );
    column = row.write(column, ' ');
    column = _writeVitals(row, column, u);
    if (game.flags?.time) {
        column = row.write(column, ' ');
        column = row.write(column, `T:${game.moves || 1}`, _fieldOwner('time'));
    }
    const hunger = _statusFieldData('hunger').text;
    if (hunger) {
        column = row.write(column, ' ');
        column = row.write(column, hunger, _fieldOwner('hunger'));
    }
    if (capacityPadding) column = row.write(column, capacityPadding);
    column = _writeConditions(
        row,
        column,
        _statusConditionEntries(u, conditionLevel),
    );
    column = _writeSeparatedFields(row, column, _optionalStatusEntries());
    if (game.flags?.showvers) {
        const version = status_version(game.flags);
        const start = Math.max(
            status.length + 1,
            TTY_STATUS_WIDTH - version.length,
        );
        row.write(start, version, _fieldOwner('version'));
    }
    return row.finish();
}

function _statusLine3VitalsLayout() {
    const u = game.u;
    if (!u) return { text: '', owners: [] };
    const row = _newStatusRow();
    let column = row.write(
        0,
        _statusAlignment(u),
        _fieldOwner('alignment'),
    );
    column = row.write(column, ' ');
    column = _writeVitals(row, column, u);
    const hunger = _statusFieldData('hunger').text;
    if (hunger) {
        column = row.write(column, ' ');
        row.write(column, hunger, _fieldOwner('hunger'));
    }
    return row.finish();
}

function _statusLine3DetailsLayout({ initialTtyRefresh = false } = {}) {
    const u = game.u;
    const configuration = _statusLine3DetailsConfiguration();
    if (!u || !configuration) return { text: '', owners: [] };
    const {
        conditionLevel,
        conditions,
        optional,
        shortLevel,
        time,
        version,
    } = configuration;
    const row = _newStatusRow();
    let column = row.write(
        0,
        _statusLevelDescription(u, shortLevel),
        _fieldOwner('dungeon-level'),
    );
    if (time) {
        column = row.write(column, ' ');
        column = row.write(
            column,
            time.slice(1),
            _fieldOwner('time'),
        );
    }

    // C ref: wintty.c render_status(). It computes nominal field positions,
    // indents BL_CONDITION toward BL_HUNGER, then resumes later fields at
    // their nominal positions. That can overwrite the indented condition.
    const conditionNominalStart = column;
    let nominal = column;
    let conditionStart = null;
    if (conditions) {
        const x = nominal + 1; // tty field positions are one-based.
        const hungerX = _statusLine3VitalsBase(u).length + 1;
        let lastColumn = TTY_STATUS_WIDTH + 1;
        if (!optional && version) lastColumn -= version.length + 1;
        let conditionX = x;
        if (x < hungerX
            && hungerX + conditions.length < lastColumn - 1) {
            conditionX = hungerX;
        } else if (x + conditions.length < TTY_STATUS_WIDTH) {
            conditionX = lastColumn - conditions.length;
        }
        conditionStart = conditionX - 1;
        _writeConditions(row, conditionStart, _statusConditionEntries(
            u,
            conditionLevel,
        ));
        nominal += conditions.length;
    }
    if (optional) {
        _writeSeparatedFields(row, nominal, _optionalStatusEntries());
        nominal += optional.length;
    }
    if (version) {
        const field = ` ${version}`;
        const rightStart = TTY_STATUS_WIDTH - field.length;
        const start = Math.max(nominal, rightStart);
        row.clear(nominal, start);
        row.write(start, ' ');
        row.write(start + 1, version, _fieldOwner('version'));
    }

    if (initialTtyRefresh && conditionStart !== null) {
        // newgame()'s explicit bot() follows the flush-triggered initial
        // status pass.  On that second tty pass, BL_CONDITION is redrawn:
        // its indent clears unchanged optional fields, then BL_VERS redraws
        // from its nominal position.  This incremental overlap is visible at
        // a More boundary before moveloop's forced status refresh.
        row.clear(conditionNominalStart, conditionStart);
        _writeConditions(row, conditionStart, _statusConditionEntries(
            u,
            conditionLevel,
        ));
        if (version) {
            const field = ` ${version}`;
            const rightStart = TTY_STATUS_WIDTH - field.length;
            const start = Math.max(nominal, rightStart);
            row.clear(nominal, start);
            row.write(start, ' ');
            row.write(start + 1, version, _fieldOwner('version'));
        }
    }
    return row.finish();
}

function statusLayouts({ initialTtyRefresh = false } = {}) {
    const count = game.iflags?.wc2_statuslines === 3 ? 3 : 2;
    if (game.iflags?.status_updates === false) {
        return Array.from({ length: count }, () => ({ text: '', owners: [] }));
    }
    return game.iflags?.wc2_statuslines === 3
        ? [
            _statusLine1Layout(false),
            _statusLine3VitalsLayout(),
            _statusLine3DetailsLayout({ initialTtyRefresh }),
        ]
        : [_statusLine1Layout(), _statusLine2Layout()];
}

function _statusPercentage(value, maximum) {
    if (!maximum) return 0;
    const percent = Math.trunc((100 * value) / maximum);
    return percent === 0 && value !== 0 ? 1 : percent;
}

function _statusExperiencePercentage(u) {
    const level = u.ulevel ?? 1;
    if (level >= 30) return 0;
    const levelStart = newuexp(level - 1);
    const gained = (u.uexp ?? 0) - levelStart;
    const needed = newuexp(level) - levelStart;
    return gained === needed - 1
        ? 100 : _statusPercentage(gained, needed);
}

function _criticallyLowHp(onlyIfInjured) {
    const u = game.u;
    const current = u?.uhp ?? 0;
    let maximum = u?.uhpmax ?? 0;
    if (onlyIfInjured && current >= maximum) return false;
    maximum = Math.min(maximum, 15 * (u?.ulevel ?? 1));
    const rank = (u?.ulevel ?? 1) <= 2
        ? 0 : (u.ulevel <= 30 ? Math.trunc((u.ulevel + 2) / 4) : 8);
    const divisor = rank <= 1 ? 5
        : rank <= 3 ? 6 : rank <= 5 ? 7 : rank <= 7 ? 8 : 9;
    return current <= 5 || current * divisor <= maximum;
}

function _statusFieldData(field) {
    const u = game.u;
    const attrs = u?.acurr?.a ?? [];
    const title = _statusTitle();
    switch (field) {
    case 'title':
        // botl.c get_hilite() advances through BL_TITLE by the complete
        // svp.plname byte length even when status formatting truncated the
        // name. The title has one internal cell per source byte, so multibyte
        // names follow strlen(), not JavaScript code-unit indexing.
        return {
            text: title.slice(
                encodeUtf8ByteString(game.plname || 'Hero').length + 5,
            ),
        };
    case 'strength': return { value: attrs[A_STR] ?? 0 };
    case 'dexterity': return { value: attrs[A_DEX] ?? 0 };
    case 'constitution': return { value: attrs[A_CON] ?? 0 };
    case 'intelligence': return { value: attrs[A_INT] ?? 0 };
    case 'wisdom': return { value: attrs[A_WIS] ?? 0 };
    case 'charisma': return { value: attrs[A_CHA] ?? 0 };
    case 'alignment': return { text: _statusAlignment(u) };
    case 'score': return { value: 0 };
    case 'carrying-capacity': return { value: 0, text: '' };
    case 'gold': return { value: money_cnt(game.invent) };
    case 'power':
        return {
            value: u?.uen ?? 0,
            percent: _statusPercentage(u?.uen ?? 0, u?.uenmax ?? 0),
        };
    case 'power-max': return { value: u?.uenmax ?? 0 };
    case 'experience-level':
        return {
            value: u?.ulevel ?? 1,
            percent: _statusExperiencePercentage(u),
        };
    case 'armor-class': return { value: u?.uac ?? 10 };
    case 'hd': return { value: 0 };
    case 'time': return { value: game.moves ?? 1 };
    case 'hunger':
        return {
            value: u?.uhs ?? NOT_HUNGRY,
            text: HUNGER_STATUS[u?.uhs ?? NOT_HUNGRY] ?? '',
        };
    case 'hitpoints':
        return {
            value: u?.uhp ?? 0,
            percent: _statusPercentage(u?.uhp ?? 0, u?.uhpmax ?? 0),
        };
    case 'hitpoints-max': return { value: u?.uhpmax ?? 0 };
    case 'dungeon-level': return { text: _statusLevelDescription(u) };
    case 'experience':
        return {
            value: u?.uexp ?? 0,
            percent: _statusExperiencePercentage(u),
        };
    case 'version': return { text: status_version(game.flags) };
    case 'weapon': return { text: weapon_status(game) };
    case 'armor': return { text: armor_status(game) };
    case 'terrain': return { text: _terrainStatus(game) };
    default: return { text: '' };
    }
}

function _statusFuzzyText(value) {
    return String(value ?? '').toLowerCase().replace(/[" _-]+/gu, '');
}

function _statusRelationMatches(actual, relation, threshold) {
    switch (relation) {
    case '<': return actual < threshold;
    case '<=': return actual <= threshold;
    case '>': return actual > threshold;
    case '>=': return actual >= threshold;
    default: return actual === threshold;
    }
}

// C ref: botl.c:get_hilite(). Initial status has no up/down transition, but
// persistent percentage, absolute, text, always, and critical rules retain
// the source best-fit precedence.
function _statusFieldStyle(field) {
    if (!game.iflags?.hilite_delta) return null;
    const rules = (game.iflags.status_hilites ?? []).filter(
        (rule) => rule.field === field,
    );
    const data = _statusFieldData(field);
    if (!rules.length || (data.text === '' && data.value == null)) return null;
    let selected = null;
    let exact = false;
    let persistent = false;
    let critical = false;
    const minimum = {
        percentage: Number.POSITIVE_INFINITY,
        absolute: Number.POSITIVE_INFINITY,
    };
    const maximum = {
        percentage: Number.NEGATIVE_INFINITY,
        absolute: Number.NEGATIVE_INFINITY,
    };
    for (const rule of rules) {
        if (critical && rule.behavior !== 'critical') continue;
        if (persistent && rule.behavior === 'always') continue;
        if (rule.behavior === 'always') {
            selected = rule;
        } else if (rule.behavior === 'critical') {
            if (field === 'hitpoints' && _criticallyLowHp(false)) {
                selected = rule;
                critical = true;
                persistent = false;
            }
        } else if (rule.behavior === 'text') {
            const matches = _statusFuzzyText(rule.text)
                === _statusFuzzyText(data.text);
            if (matches) {
                selected = rule;
                exact = true;
            }
        } else if (rule.behavior === 'percentage'
                   || rule.behavior === 'absolute') {
            const actual = rule.behavior === 'percentage'
                ? data.percent ?? 0 : data.value ?? 0;
            if (rule.relation === '=' && actual === rule.value) {
                selected = rule;
                exact = persistent = true;
                minimum[rule.behavior] = rule.value;
                maximum[rule.behavior] = rule.value;
            } else if (!exact
                       && _statusRelationMatches(
                           actual, rule.relation, rule.value,
                       )) {
                if ((rule.relation === '<' || rule.relation === '<=')
                    && rule.value <= minimum[rule.behavior]) {
                    selected = rule;
                    minimum[rule.behavior] = rule.value;
                    persistent = true;
                } else if ((rule.relation === '>' || rule.relation === '>=')
                           && rule.value >= maximum[rule.behavior]) {
                    selected = rule;
                    maximum[rule.behavior] = rule.value;
                    persistent = true;
                }
            }
        }
    }
    return selected?.style ?? null;
}

function _statusConditionStyle(option) {
    if (!game.iflags?.hilite_delta) return null;
    const colors = new Set();
    let attr = ATR_NONE;
    let matched = false;
    for (const rule of game.iflags.status_hilites ?? []) {
        if (rule.field !== 'condition'
            || !rule.conditions.includes(option)) continue;
        matched = true;
        colors.add(rule.style.color);
        if (rule.style.clearAttributes) attr = ATR_NONE;
        attr |= rule.style.attr;
    }
    return matched
        ? { color: Math.min(...colors), attr } : null;
}

function _statusOwnerStyle(owner) {
    if (!owner) return null;
    if (owner.kind === 'field') return _statusFieldStyle(owner.field);
    if (owner.kind === 'condition') {
        return _statusConditionStyle(owner.option);
    }
    if (owner.kind === 'hitpoint-bar') {
        const hpStyle = _statusFieldStyle('hitpoints');
        return {
            color: hpStyle?.color ?? NO_COLOR,
            // wintty.c assigns inverse independently of the configured HP
            // rule; unsupported blink is intentionally absent from capture.
            attr: ATR_INVERSE,
        };
    }
    return null;
}

function _recorderStatusStyle(style) {
    if (!style) return { color: NO_COLOR, attr: ATR_NONE };
    // Recorder patch 006 begins with terminal-default gray active. Selecting
    // CLR_GRAY emits no observable transition. CLR_BLACK also decodes as the
    // default whether use_darkgray remaps it to wire color 8 or leaves zero,
    // which the serializer uses as its terminal-default sentinel.
    return {
        color: style.color === CLR_GRAY || style.color === CLR_BLACK
            ? NO_COLOR : style.color,
        attr: style.attr,
    };
}

function _statusStyleRows(layouts) {
    return layouts.map(({ owners }) => {
        const cache = new Map();
        return owners.map((owner) => {
            if (!owner) return _recorderStatusStyle(null);
            if (!cache.has(owner)) {
                cache.set(
                    owner,
                    _recorderStatusStyle(_statusOwnerStyle(owner)),
                );
            }
            return cache.get(owner);
        });
    });
}

function mapViewport(rows, statusRowCount) {
    const height = Math.min(ROWNO, rows - 1 - statusRowCount);
    if (height >= ROWNO) return { height: ROWNO, top: 0 };

    // win/tty/wintty.c setclipped() and tty_cliparound(). Startup begins
    // with clipy=0; one cliparound() follows initial hero placement.
    let top = 0;
    let bottom = height;
    const heroY = game.u?.uy ?? 0;
    if (heroY < top + 2) {
        top = Math.max(0, heroY - Math.trunc((bottom - top) / 2));
        bottom = top + height;
    } else if (heroY > bottom - 2) {
        bottom = Math.min(
            ROWNO,
            bottom + Math.trunc((bottom - top) / 2),
        );
        top = bottom - height;
    }
    return { height, top };
}

function writeStatusRows(
    display,
    layouts = statusLayouts(),
) {
    if (!display?.grid) return;
    const styles = game.iflags?.status_updates === false
        ? layouts.map(() => [])
        : _statusStyleRows(layouts);
    const firstRow = display.rows - layouts.length;
    for (let index = 0; index < layouts.length; ++index) {
        const screenRow = firstRow + index;
        display.clearRow(screenRow);
        const { text } = layouts[index];
        for (let column = 0;
            column < Math.min(text.length, display.cols);
            ++column) {
            const style = styles[index]?.[column];
            display.setCell(
                column,
                screenRow,
                text[column],
                style?.color ?? NO_COLOR,
                style?.attr ?? ATR_NONE,
            );
        }
    }
}

// ── Serialize terminal grid for screen comparison ──
export function serialize_terminal_grid(display) {
    let output = '';
    let lastRow = 0;
    for (let r = 0; r < display.rows; r++) {
        for (let c = 0; c < display.cols; c++) {
            if (display.grid[r][c].ch !== ' ') { lastRow = r; break; }
        }
    }
    for (let r = 0; r <= lastRow; r++) {
        let lastCol = -1;
        for (let c = display.cols - 1; c >= 0; c--) {
            if (display.grid[r][c].ch !== ' ') { lastCol = c; break; }
        }
        if (lastCol < 0) { if (r < lastRow) output += '\n'; continue; }
        let firstCol = 0;
        for (let c = 0; c <= lastCol; c++) {
            if (display.grid[r][c].ch !== ' ') { firstCol = c; break; }
        }
        if (firstCol > 4) output += `\x1b[${firstCol}C`;
        else if (firstCol > 0) output += ' '.repeat(firstCol);
        for (let c = firstCol; c <= lastCol; c++) output += display.grid[r][c].ch;
        if (r < lastRow) output += '\n';
    }
    return output;
}

// ── Build screen output ──
function _buildScreenOutput() {
    const display = game?.nhDisplay;
    if (!display) return;
    const statusRows = game._renderedStatusLayouts ?? statusLayouts();
    const viewport = mapViewport(display.rows, statusRows.length);

    // Render into the canonical terminal grid.
    if (display.grid) {
        display.clearScreen();
        // Message line
        const msg = game._pending_message || '';
        for (let c = 0; c < Math.min(msg.length, display.cols); c++)
            display.setCell(c, 0, msg[c], NO_COLOR, 0);
        // Map — write characters to grid (DEC → Unicode for browser display)
        const browserGlyphs = Boolean(display.spans);
        for (let offset = 0; offset < viewport.height; ++offset) {
            const y = viewport.top + offset;
            for (let x = 1; x < COLNO; x++) {
                const loc = game.level?.at(x, y);
                if (!loc) continue;
                const ch = browserGlyphs && loc.disp_browser_ch
                    ? loc.disp_browser_ch
                    : (loc.disp_decgfx
                        ? DEC_TO_UNICODE[loc.disp_ch] || loc.disp_ch
                        : loc.disp_ch);
                if (!ch || ch === ' ') continue;
                display.setCell(
                    x - 1,
                    offset + 1,
                    ch,
                    browserGlyphs
                        ? loc.disp_browser_color ?? loc.disp_color ?? NO_COLOR
                        : loc.disp_color ?? NO_COLOR,
                    browserGlyphs && loc.disp_browser_ch
                        ? loc.disp_browser_attr ?? 0
                        : loc.disp_attr ?? 0,
                );
            }
        }
        writeStatusRows(display, statusRows);
        // Cursor at hero
        if (game.u?.ux > 0)
            display.setCursor(
                game.u.ux - 1,
                game.u.uy - viewport.top + 1,
            );
    }
}

// ── flush_screen ──
export async function flush_screen(mode) {
    if (game.disp?.botl || game.disp?.botlx || game.disp?.time_botl) {
        await bot({
            // Before moveloop_preamble(), tty field dirtiness can preserve
            // the initial three-row condition/optional-field overlap.
            initialTtyRefresh: Boolean(
                game.program_state
                && !game.program_state.in_moveloop
                && game.u?.ux,
            ),
        });
    }
    _buildScreenOutput();
}

// ── cls ──
export async function cls() {
    const display = game?.nhDisplay;
    if (display?.clearScreen) display.clearScreen();
    game._pending_message = '';
    // display.c cls() forces the bottom lines to be rebuilt after clearing
    // the physical screen.
    game.disp ??= {};
    game.disp.botlx = true;
}

// ── bot ──
export async function bot({ initialTtyRefresh = false } = {}) {
    const optionalSnapshot = game.iflags?.wc2_statuslines === 3
        ? JSON.stringify(_optionalStatusEntries().map(
            ({ field, text }) => [field, text],
        ))
        : '';
    const optionalFieldsChanged = optionalSnapshot
        !== game._statusOptionalFieldSnapshot;
    // wintty.c renders only dirty fields. On the second initial pass,
    // BL_CONDITION can clear unchanged BL_WEAPON/BL_ARMOR/BL_TERRAIN cells;
    // if equipment changed meanwhile, those fields redraw afterward and
    // restore the steady layout.
    const retainInitialOverlap = initialTtyRefresh
        && !optionalFieldsChanged;
    const layouts = statusLayouts({
        initialTtyRefresh: retainInitialOverlap,
    });
    game._statusOptionalFieldSnapshot = optionalSnapshot;
    game._renderedStatusLayouts = layouts;
    writeStatusRows(game?.nhDisplay, layouts);
    if (game.disp) {
        game.disp.botl = false;
        game.disp.botlx = false;
        game.disp.time_botl = false;
    }
}
