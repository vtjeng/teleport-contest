// display.js — Map rendering, terminal output, and the bottom status lines.
// C ref: display.c — newsym, show_glyph, docrt, cls, flush_screen.
// C ref: botl.c — this file is that file's port too, and holds every botl.c
// function and table the game reaches: enc_stat[], terrain_descr[],
// weapon_status(), armor_status(), bot_via_windowport(), describe_level(),
// get_hilite(), and the condition tables. eat.c's hu_stat[] is the one status
// table that lives elsewhere, in js/eat.js, because eat.c defines it.

import { game } from './gstate.js';
import { known_branch_stairs, stairway_at } from './stairs.js';
import { effective_attribute } from './attrib.js';
import { near_capacity } from './hack.js';
import { update_lastseentyp } from './dungeon.js';
import { money_cnt } from './invent.js';
import { cansee, seenv_matrix, vision_recalc } from './vision.js';
// js/tty_message.js imports flush_screen() from this file; both sides use the
// other's exports only inside function bodies, so the cycle resolves.
import {
    TOPLINE_EMPTY,
    clearTtyMessageWindow,
    dismissPendingTtyMessage,
} from './tty_message.js';
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
    HI_DOMESTIC, HI_METAL, M_AP_FURNITURE, M_AP_OBJECT, M_AP_MONSTER,
    M_AP_TYPMASK, MON_STILL_ARRIVING, WARN_OF_MON,
    SYM_BOULDER, SYM_PET_OVERRIDE, SYM_HERO_OVERRIDE, WARNING, WARNCOUNT,
    PROT_FROM_SHAPE_CHANGERS,
    def_warnsyms,
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
import { is_flyer } from './mondata.js';
import { m_at } from './monst.js';
import {
    depth as dungeonDepth,
    dist2,
    encodeUtf8ByteString,
    mungspaces,
} from './hacklib.js';
import { hu_stat } from './eat.js';
import { observe_object } from './o_init.js';
import { engr_at } from './engrave.js';
import { status_version } from './version.js';
import { isWeptool } from './obj.js';
import { newuexp, UnsupportedExperienceChangeError } from './exper.js';
import { weapon_type } from './startup_skills.js';
import { weapon_descr } from './weapon.js';
import { bimanual } from './worn.js';
import {
    ART_MITRE_OF_HOLINESS,
    ART_TSURUGI_OF_MURAMASA,
} from './artifacts.js';
import {
    AKLYS,
    AMULET_OF_GUARDING,
    BOULDER,
    CLOAK_OF_PROTECTION,
    CORPSE,
    CORNUTHAUM,
    CREAM_PIE,
    DUNCE_CAP,
    ELVEN_LEATHER_HELM,
    FEDORA,
    FIRST_OBJECT,
    FIRST_REAL_GEM,
    FIRST_SPELL,
    FOOD_CLASS,
    ILLOBJ_CLASS,
    LAST_GENERIC,
    LAST_GLASS_GEM,
    LAST_SPELL,
    NUM_OBJECTS,
    POTION_CLASS,
    RIN_PROTECTION,
    STATUE,
    STRANGE_OBJECT,
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
    symbol_at,
    SYM_OFF_W,
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
import {
    M1_HUMANOID,
    NON_PM,
    NUMMONS,
    PM_TENGU,
} from './monsters.js';
import { rn2_on_display_rng } from './rng.js';
import {
    monsterVisible,
    noteGlyphBufferMutation,
    queueGlyphUpdateNotice,
    sensesMonster,
    sensesMonsterWithoutDetection,
} from './startup_a11y.js';

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

function withAccessibilityMetadata(
    glyph,
    kind,
    identity,
    subject,
    description = null,
) {
    // Keep these sidecars non-enumerable so ordinary presentation copies retain
    // their established shape. Display-buffer and map-memory boundaries copy
    // the selected metadata they need explicitly.
    Object.defineProperties(glyph, {
        a11yKind: {
            configurable: true,
            value: kind,
        },
        a11yIdentity: {
            configurable: true,
            value: identity,
        },
        a11ySubject: {
            configurable: true,
            value: subject,
        },
        a11yDescription: {
            configurable: true,
            value: description,
        },
    });
    return glyph;
}

function terrainCmap(index, color, state, customizationName = null) {
    const customization = customizationName
        ? glyph_customization(customizationName, state) : null;
    const glyph = glyphPresentation(
        cmap_symbol(index, state), color, state, customization,
    );
    if (blackAndWhiteTerrainCue(index, state)) glyph.attr = ATR_INVERSE;
    if (!state.a11y?.glyph_updates) return glyph;
    const kind = index >= S_stone && index <= S_trwall
        ? 'wall'
        : index >= S_room && index <= S_darkroom
            ? 'room'
            : index >= S_upstair && index <= S_fountain
                ? 'furniture'
                : 'cmap';
    return withAccessibilityMetadata(
        glyph,
        kind,
        `cmap:${index}:${customizationName ?? ''}`,
        { type: 'cmap', symbol: index },
    );
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

function withMonsterAccessibility(
    glyph,
    monster,
    species,
    state,
    identityVariant = 'monster',
) {
    if (!state.a11y?.glyph_updates) return glyph;
    return withAccessibilityMetadata(
        glyph,
        'monster',
        `monster:${identityVariant}:${species?.pmidx ?? -1}:${monster.female ? 1 : 0}`,
        { type: 'monster', monster, species },
    );
}

function actualMonsterGlyphInfo(monster, state) {
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
    return withMonsterAccessibility(
        glyph,
        monster,
        monster.data,
        state,
        monster.mtame ? 'pet' : 'monster',
    );
}

function displayDraw(random, bound) {
    const result = random(bound);
    if (!Number.isInteger(result) || result < 0 || result >= bound) {
        throw new RangeError(
            `display RNG returned ${result} outside 0..${bound - 1}`,
        );
    }
    return result;
}

export function random_object_glyph_info(
    state = game,
    displayRandom = rn2_on_display_rng,
) {
    // display.h random_obj_to_glyph(): ordinary random objects retain their
    // concrete object glyph, while a random corpse draws its displayed body.
    const randomType = FIRST_OBJECT + displayDraw(
        displayRandom,
        NUM_OBJECTS - FIRST_OBJECT,
    );
    const type = state.objects?.[randomType];
    if (!type) {
        throw new Error(
            'random object display requires the complete object catalog',
        );
    }
    const randomObject = {
        otyp: randomType,
        oclass: type.oc_class,
        dknown: true,
    };
    if (randomType === CORPSE)
        randomObject.corpsenm = displayDraw(displayRandom, NUMMONS);
    return object_glyph_info(randomObject, state);
}

function heroHallucinating(state) {
    // youprop.h Hallucination: the property is solely an intrinsic timeout,
    // and either intrinsic or extrinsic resistance suppresses it.
    return Boolean(state.u)
        && _propertyIntrinsic(state.u, HALLUC)
        && !_propertyActive(state.u, HALLUC_RES);
}

export function hallucinated_statue_glyph_info(
    state = game,
    displayRandom = rn2_on_display_rng,
) {
    // display.h statue_to_glyph(): the random species choice precedes the
    // gender draw. The current renderer has one class glyph for both genders,
    // but the second call remains part of the observable display-RNG stream.
    const species = state.mons?.[displayDraw(displayRandom, NUMMONS)];
    if (!species) {
        throw new Error(
            'hallucinated statue display requires the complete monster catalog',
        );
    }
    const shown = actualMonsterGlyphInfo({ data: species, mtame: 0 }, state);
    displayDraw(displayRandom, 2);
    return shown;
}

// C ref: display.c display_monster()'s final pet/detected/ordinary branch.
// Hallucination changes the presented species for both detected and physically
// seen monsters; only detected presentation receives inverse video.
function presentedMonsterGlyphInfo(monster, state, detected) {
    const hallucinating = heroHallucinating(state);
    if (monster.mtame && !hallucinating)
        return actualMonsterGlyphInfo(monster, state);
    const species = hallucinating
        ? state.mons?.[rn2_on_display_rng(NUMMONS)]
        : monster.data;
    if (!species) {
        throw new Error(
            'monster display requires the complete monster catalog',
        );
    }
    const glyph = glyphPresentation(
        monster_class_symbol(species.mlet, state),
        species.mcolor,
        state,
    );
    if (detected && state.iflags?.wc_inverse !== false)
        glyph.attr = ATR_INVERSE;
    return withMonsterAccessibility(
        glyph,
        monster,
        species,
        state,
        detected ? 'detected' : 'monster',
    );
}

// C ref: display.h ridden_mon_to_glyph() (560-562), reached from
// display_self()'s maybe_display_usteed() (245-249). reset_glyphmap()
// (display.c:2986-3003) gives a ridden glyph the species symbol and mon_color()
// and sets MG_RIDDEN rather than MG_PET, so neither the SYM_PET_OVERRIDE
// accessibility symbol nor win/tty/wintty.c's hilite_pet attribute applies to
// it. what_mon() replaces the species under Hallucination, at the cost of one
// display-RNG draw.
function riddenMonsterGlyphInfo(monster, state) {
    const species = heroHallucinating(state)
        ? state.mons?.[rn2_on_display_rng(NUMMONS)] : monster.data;
    if (!species) {
        throw new Error(
            'ridden monster display requires the complete monster catalog',
        );
    }
    return withMonsterAccessibility(glyphPresentation(
        monster_class_symbol(species.mlet, state),
        species.mcolor,
        state,
    ), monster, species, state, 'ridden');
}

// C ref: display.c display_monster() with sightflags == DETECTED and
// win/tty/wintty.c tty_print_glyph()'s MG_DETECT handling.  Tame monsters use
// their pet presentation unless hallucination defeats that source exception.
function detectedMonsterGlyphInfo(monster, state) {
    return presentedMonsterGlyphInfo(monster, state, true);
}

function mimickedMonsterGlyphInfo(monster, state) {
    // C ref: display.c display_monster(), M_AP_MONSTER. This transient
    // disguise uses mappearance unless Hallucination replaces it with one
    // display-RNG species draw; tame highlighting does not apply.
    const speciesIndex = heroHallucinating(state)
        ? rn2_on_display_rng(NUMMONS) : monster.mappearance;
    const species = state.mons?.[speciesIndex];
    if (!species) {
        throw new Error(
            'mimicked monster display requires the complete monster catalog',
        );
    }
    return withMonsterAccessibility(glyphPresentation(
        monster_class_symbol(species.mlet, state),
        species.mcolor,
        state,
    ), monster, species, state, 'disguise');
}

function mimicObject(monster) {
    const storedCorpsenm = monster.mextra?.mcorpsenm;
    return {
        // display.c display_monster() initializes this temporary object from
        // zeroobj, so its class intentionally remains zero.
        otyp: monster.mappearance,
        oclass: 0,
        corpsenm: Number.isInteger(storedCorpsenm)
            && storedCorpsenm !== NON_PM
            ? storedCorpsenm : PM_TENGU,
        // display_monster() deliberately uses PM_TENGU when mextra has no
        // mcorpsenm. Corpse color and statue presentation can observe it.
        dknown: false,
        ox: monster.mx,
        oy: monster.my,
    };
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
        // map_object() observes only glyph_is_generic_object().  Class zero
        // is deliberately outside that glyph range, so even a nearby fake
        // gem or spellbook remains unobserved.
        return object_glyph_info(mimicObject(monster), state);
    }
    if (appearanceType === M_AP_MONSTER)
        return mimickedMonsterGlyphInfo(monster, state);
    return presentedMonsterGlyphInfo(monster, state, false);
}

// C ref: display.h mon_warning() and display.c warning_of().
function monsterWarnsHero(monster, state) {
    if (!monster || monster.mpeaceful || !_propertyActive(state.u, WARNING))
        return false;
    const warningLevel = Math.trunc((monster.m_lev ?? 0) / 4);
    const threshold = Math.trunc(state.context?.warnlevel ?? 1);
    return dist2(
        monster.mx,
        monster.my,
        state.u?.ux ?? 0,
        state.u?.uy ?? 0,
    ) < 100 && warningLevel >= threshold;
}

function warningGlyphInfo(monster, state) {
    const warningLevel = _propertyActiveUnblocked(state.u, HALLUC)
        ? rn2_on_display_rng(WARNCOUNT - 1) + 1
        : Math.min(
            Math.trunc((monster.m_lev ?? 0) / 4),
            WARNCOUNT - 1,
        );
    const glyph = glyphPresentation(
        symbol_at(SYM_OFF_W + warningLevel, state),
        def_warnsyms[warningLevel].color,
        state,
        glyph_customization(`G_warning${warningLevel}`, state),
    );
    if (!state.a11y?.glyph_updates) return glyph;
    return withAccessibilityMetadata(
        glyph,
        'warning',
        `warning:${warningLevel}`,
        { type: 'warning', index: warningLevel },
    );
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
    // display.h obj_to_glyph() numbers a generic object into the leading
    // FIRST_OBJECT-1 slots of the object glyph ranges, which is the whole of
    // what glyph_is_generic_object() recognizes. This port stores
    // presentations rather than glyph numbers, so it carries the same fact as
    // a mark, which remembered_glyph_from_presentation() copies into map
    // memory for see_nearby_objects() to read back.
    if (generic) glyph.genericObject = true;
    // C ref: win/tty/wintty.c tty_print_glyph(). Pile highlighting is a tty
    // presentation attribute and is suppressed together with inverse video.
    const piletop = object_is_piletop(obj, state);
    if (piletop
        && state.iflags?.hilite_pile
        && state.iflags?.wc_inverse !== false) {
        glyph.attr = ATR_INVERSE;
    }
    if (!state.a11y?.glyph_updates) return glyph;
    // glyph_to_obj() recovers the generic class index from a generic glyph.
    // Class zero is outside that glyph range, so zeroobj gem/spellbook
    // disguises encode STRANGE_OBJECT rather than their mappearance.
    const encodedGeneric = generic
        && obj.oclass >= ILLOBJ_CLASS
        && obj.oclass <= LAST_GENERIC;
    const encodedOtyp = encodedGeneric
        ? null : generic ? STRANGE_OBJECT : obj.otyp;
    const semanticType = state.objects?.[encodedOtyp];
    const identity = encodedGeneric
        ? `object:generic:${obj.oclass}`
        : encodedOtyp === STATUE
            ? `object:statue:${obj.corpsenm ?? NON_PM}`
            : encodedOtyp === CORPSE
                ? `object:corpse:${obj.corpsenm ?? NON_PM}`
                : `object:${encodedOtyp}`;
    return withAccessibilityMetadata(
        glyph,
        'object',
        identity,
        {
            type: 'object',
            generic: encodedGeneric,
            otyp: encodedOtyp,
            oclass: encodedGeneric
                ? obj.oclass : semanticType?.oc_class ?? obj.oclass,
            corpsenm: obj.corpsenm,
        },
    );
}

// C ref: display.c map_object(). Return the transient presentation separately
// from levl[x][y].glyph because hallucinated statues use a random monster on
// screen but a separately drawn random object in map memory.
function mappedObjectGlyphInfo(obj, state) {
    if (!heroHallucinating(state)) {
        const glyph = object_glyph_info(obj, state);
        return { shown: glyph, remembered: glyph };
    }

    if (obj.otyp !== STATUE) {
        const glyph = random_object_glyph_info(state);
        return { shown: glyph, remembered: glyph };
    }

    const shown = hallucinated_statue_glyph_info(state);
    // map_object() gates this memory-only draw independently from its caller's
    // later decision to persist remembered output. The shown statue glyph has
    // already consumed every draw required when hero memory is disabled.
    const remembered = state.level?.flags?.hero_memory
        ? random_object_glyph_info(state) : shown;
    return { shown, remembered };
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
        const stairway = stairway_at(x, y, state);
        const down = Boolean(loc.ladder & LA_DOWN);
        const knownBranch = known_branch_stairs(stairway, state);
        return terrainCmap(
            knownBranch
                ? down ? S_brdnstair : S_brupstair
                : down ? S_dnstair : S_upstair,
            knownBranch ? CLR_YELLOW : NO_COLOR,
            state,
        );
    }
    case LADDER: {
        const stairway = stairway_at(x, y, state);
        const down = Boolean(loc.ladder & LA_DOWN);
        const knownBranch = known_branch_stairs(stairway, state);
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
export function show_glyph_cell(x, y, glyph) {
    if (!glyph || typeof glyph !== 'object'
        || !Object.hasOwn(glyph, 'dec')) {
        throw new TypeError(
            'show_glyph_cell requires a glyph-presentation record',
        );
    }
    const {
        ch,
        color = NO_COLOR,
        dec: decgfx = false,
        attr = 0,
        displayCh = null,
        displayColor = null,
    } = glyph;
    const loc = game.level?.at(x, y);
    if (!loc) return;
    const logicalPresentation = {
        ch,
        color,
        dec: !!decgfx,
        attr: attr | 0,
        displayCh,
        displayColor: displayColor ?? (displayCh ? color : null),
        a11yKind: glyph.a11yKind ?? null,
        a11yDescription: glyph.a11yDescription ?? null,
    };
    if (glyph.rgb) logicalPresentation.rgb = [...glyph.rgb];
    for (const field of ['a11yIdentity', 'a11ySubject']) {
        if (glyph[field] !== undefined) {
            Object.defineProperty(logicalPresentation, field, {
                configurable: true,
                value: glyph[field],
            });
        }
    }
    const previousPresentation = loc.disp_glyph ?? null;
    const previousGnew = loc.gnew;
    // C's gbuf retains logical glyph identity even when a UTF-8 customization
    // deliberately leaves the recorder-facing `ch` cell untouched.
    loc.disp_glyph = logicalPresentation;
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
    // This order is the sparse-frame contract: install the buffer write, record
    // its mutation, then test notice eligibility and queue it. The first
    // eligible notice captures a full frame; filtered intervening writes remain
    // in the delta applied before the next eligible notice.
    noteGlyphBufferMutation(x, y, game);
    queueGlyphUpdateNotice(
        x,
        y,
        previousPresentation,
        logicalPresentation,
        previousGnew,
        game,
    );
}

/**
 * Convert a live glyph-presentation record into the persistent levl glyph
 * record used by map memory.  The input must use display.js presentation
 * fields (`dec`, optional browser/RGB metadata); the result uses the
 * persistent `decgfx` field. Pass `trap` only when the remembered layer itself
 * represents that trap; hidden traps beneath another remembered layer must not
 * contribute their logical identity. Accessibility identity and subject are
 * canonical remembered-glyph state used to describe hero-memory mimics and
 * hiders, so this boundary copies those sidecars explicitly.
 */
export function remembered_glyph_from_presentation(glyph, trap = null) {
    if (!glyph || typeof glyph !== 'object'
        || !Object.hasOwn(glyph, 'dec')) {
        throw new TypeError(
            'remembered glyph conversion requires a presentation record',
        );
    }
    const remembered = {
        ch: glyph.ch,
        color: glyph.color,
        decgfx: glyph.dec,
        displayCh: glyph.displayCh ?? null,
    };
    // C stores a logical glyph number in levl[x][y].glyph.  Presentation can
    // collide after symbol customization, so retain the trap identity needed
    // by detect.c:find_trap() in the same canonical memory record.
    if (trap) remembered.trapType = trap.ttyp;
    if (glyph.genericObject) remembered.genericObject = true;
    if (glyph.attr) remembered.attr = glyph.attr;
    if (glyph.displayColor) remembered.displayColor = glyph.displayColor;
    if (glyph.rgb) remembered.rgb = [...glyph.rgb];
    for (const field of ['a11yIdentity', 'a11ySubject']) {
        if (glyph[field] !== undefined) {
            Object.defineProperty(remembered, field, {
                configurable: true,
                value: glyph[field],
            });
        }
    }
    return remembered;
}

// C ref: display.c feel_location(), adjacent obstructed-location branch used
// by hack.c:test_move(). Other tactile layers remain with their live owners.
// The caller has already established blindness and an ordinary wall or stone
// destination, so this subset owns the source seenv, memory, and display write.
export function feel_location(x, y, state = game) {
    if (state !== game) {
        throw new Error(
            'feel_location requires the active display state',
        );
    }
    if (!isok(x, y)) return;
    const location = state.level?.at(x, y);
    if (!location) return;
    const dx = x - state.u.ux;
    const dy = y - state.u.uy;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) {
        throw new Error(
            'feel_location obstacle subset requires an adjacent square',
        );
    }
    location.seenv = (location.seenv ?? 0)
        | seenv_matrix[1 - dy][dx + 1];
    const glyph = terrain_glyph(location, x, y, state);
    if (state.level?.flags?.hero_memory) {
        location.remembered_glyph =
            remembered_glyph_from_presentation(glyph);
    }
    show_glyph_cell(x, y, glyph);
    if (state.level.lastseentyp?.[x])
        state.level.lastseentyp[x][y] = location.typ;
}

// C ref: display.c feel_newsym(). Used where the hero knows what happened to a
// square whether or not she can see it, such as the door she has just pulled
// open in lock.c doopen_indir(). js/hack.js refuses a blind hero before the
// autoopen branch runs, so only the sighted arm is live today.
//
// The two arms treat `state` differently, which a later caller has to know.
// newsym() ignores it and paints the module-level `game`; feel_location()
// throws a plain Error for `state !== game` and for any non-adjacent square,
// neither of which C's feel_newsym restricts. A caller outside a command
// boundary gets that bare Error rather than a retryable refusal, because
// js/cmd.js converts only the Unsupported* classes.
export function feel_newsym(x, y, state = game) {
    if (_propertyActiveUnblocked(state.u, BLINDED)) feel_location(x, y, state);
    else newsym(x, y);
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

/**
 * C ref: display.h glyph_is_invisible().  C compares levl[x][y].glyph with
 * GLYPH_INVISIBLE; this port's map memory holds a presentation record instead,
 * so the equivalent state is the `invisible_monster` marker that
 * display.c map_invisible() writes when it remembers the 'I' it drew.
 * map_invisible() is not ported, so nothing writes that marker yet and this
 * predicate is currently always false.  Porting map_invisible() is what makes
 * it answer TRUE, and unmap_invisible() below is what has to change with it.
 */
export function glyph_is_invisible(location) {
    return Boolean(location?.remembered_glyph?.invisible_monster);
}

/**
 * C ref: display.c unmap_invisible().  detect.c dosearch0() calls this for
 * every adjacent square with no monster on it, to clear the remembered 'I' of
 * an invisible monster which has since moved away.
 *
 * Only the FALSE arm is ported.  The TRUE arm needs display.c unmap_object(),
 * which is not ported, so it throws rather than leaving stale memory behind.
 * It is unreachable today: glyph_is_invisible() cannot answer TRUE while
 * map_invisible(), its only writer, is unported.
 */
export function unmap_invisible(x, y, state = game) {
    if (!isok(x, y)) return false;
    const location = state.level?.at?.(x, y);
    if (!glyph_is_invisible(location)) return false;
    throw new Error(
        'unmap_invisible cannot clear a remembered invisible monster: '
        + 'unmap_object() is not ported',
    );
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

// C ref: display.c trap_to_glyph(). Search discovery temporarily needs the
// canonical trap glyph even when an object or monster covers the square.
export function trap_glyph_info(trap, state = game) {
    const color = TRAP_COLORS[trap.ttyp];
    if (color === undefined)
        throw new RangeError(`trap type ${trap.ttyp} has no display color`);
    const glyph = terrainCmap(trap_to_defsym(trap.ttyp), color, state);
    if (!state.a11y?.glyph_updates) return glyph;
    return withAccessibilityMetadata(
        glyph,
        'trap',
        `trap:${trap.ttyp}`,
        { type: 'trap', trap, ttyp: trap.ttyp },
    );
}

/**
 * C ref: display.h glyph_is_generic_object(). C asks the question of the
 * glyph number stored in levl[x][y].glyph; the port asks it of the mark
 * object_glyph_info() puts on a generic object's presentation and
 * remembered_glyph_from_presentation() carries into map memory.
 */
export function glyph_is_generic_object(location) {
    return Boolean(location?.remembered_glyph?.genericObject);
}

/**
 * C ref: display.c see_nearby_objects() (1574-1604). Mark the top object of
 * each nearby pile as seen up close, and redraw the ones the map still
 * remembers in their generic form. dungeon.c u_on_newpos() calls this on
 * every same-level hero step, which is where a walk turns a remembered `!`
 * or `*` from its class colour into the object's own.
 *
 * C's newsym_force() is newsym() plus the glyph buffer's dirty bookkeeping.
 * js/display.js flush_screen() repaints from game.level rather than from a
 * dirty range, so newsym() alone carries the whole effect here.
 *
 * The redraw below is newsym(), which takes no state and reads the
 * module-global `game`, so a caller threading some other state would observe
 * objects on that state while repainting cells of the live map. Every caller
 * passes the live state; this refuses anything else rather than splitting the
 * two halves silently.
 */
export function see_nearby_objects(state = game) {
    if (state !== game) {
        throw new TypeError('see_nearby_objects() redraws the global game');
    }
    const x = state.u?.ux ?? 0;
    const y = state.u?.uy ?? 0;
    // these 'r' and 'neardist' calculations match distant_name(objnam.c)
    const radius = state.u?.xray_range > 2 ? state.u.xray_range : 2;
    // neardist produces a small square with rounded corners
    const nearDistance = radius * radius * 2 - radius;

    for (let iy = y - radius; iy <= y + radius; ++iy) {
        for (let ix = x - radius; ix <= x + radius; ++ix) {
            if (!isok(ix, iy)) continue;
            // skip if no object or the object has already been marked as
            // having been seen up close
            const object = state.level?.objects?.[ix]?.[iy] ?? null;
            if (!object || object.dknown) continue;
            // skip if the spot can't be seen or is too far (diagonal)
            if (!cansee(ix, iy, state) || dist2(ix, iy, x, y) > nearDistance)
                continue;

            observe_object(object, state);
            // operate on remembered glyph rather than current one
            if (glyph_is_generic_object(state.level.at(ix, iy)))
                newsym(ix, iy);
        }
    }
}

function observeNearbyObject(object, x, y, state) {
    if (heroHallucinating(state)
        || !object_is_generic(object)
        || !cansee(x, y, state)) return;
    const radius = state.u?.xray_range > 2 ? state.u.xray_range : 2;
    const nearDistance = radius * radius * 2 - radius;
    if (dist2(x, y, state.u?.ux ?? 0, state.u?.uy ?? 0) <= nearDistance)
        observe_object(object, state);
}

// ── newsym ──
// C ref: display.c newsym().  This is a side-effect-only map mutation; callers
// which need the persistent map glyph must reread
// level.at(x, y).remembered_glyph afterward.
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
    // location, including the hero. Sensed monsters and generic monster
    // warnings override the region; ordinary visible monsters do so only when
    // adjacent, and object-disguised mimics do not. The early return
    // intentionally leaves the remembered underlying glyph untouched.
    const region = visible ? visible_region_at(x, y, game) : null;
    const monster = visible ? m_at(x, y, game) : null;
    const monsterDirectlyVisible = Boolean(
        monster && monsterVisible(monster, game),
    );
    if (visible) {
        update_lastseentyp(x, y, game, {
            canSeeMonster: (subject) => monsterVisible(subject, game),
        });
    }
    const sensedWithoutDetection = Boolean(
        monster && sensesMonsterWithoutDetection(monster, game),
    );
    const monsterSensed = Boolean(
        monster
        && (sensedWithoutDetection || sensesMonster(monster, game)),
    );
    const detectedOnly = monsterSensed
        && !monsterDirectlyVisible
        && !sensedWithoutDetection;
    const monsterWarning = Boolean(
        monster
        && x === monster.mx
        && y === monster.my
        && monsterWarnsHero(monster, game),
    );
    if (region && ACCESSIBLE(loc.typ)) {
        const adjacentVisibleMonster = monster
            && monsterDirectlyVisible
            && ![M_AP_FURNITURE, M_AP_OBJECT].includes(
                monster.m_ap_type & M_AP_TYPMASK,
            )
            && dist2(x, y, game.u?.ux ?? 0, game.u?.uy ?? 0) <= 2;
        if (!monsterSensed && !monsterWarning
            && !adjacentVisibleMonster) {
            const cloud = terrainCmap(
                region.glyph,
                region.arg ? CLR_BRIGHT_GREEN : CLR_GRAY,
                game,
            );
            show_glyph_cell(x, y, cloud);
            return;
        }
    }

    const covered = floorLayersCovered(loc, game);
    const object = covered
        ? null : game.level?.objects?.[x]?.[y] ?? null;
    if (object) observeNearbyObject(object, x, y, game);
    const trap = covered ? null : t_at(x, y, game);
    const mapsLocation = visible
        || (game.u?.ux === x && game.u?.uy === y);
    let underlying;
    let rememberedUnderlying;
    if (object && mapsLocation) {
        const mapped = mappedObjectGlyphInfo(object, game);
        underlying = mapped.shown;
        rememberedUnderlying = mapped.remembered;
    } else if (object) {
        // Out-of-sight non-hero cells retain existing memory without invoking
        // map_object() or consuming its Hallucination display draws.
        underlying = rememberedUnderlying = object_glyph_info(object, game);
    } else if (trap?.tseen) {
        underlying = rememberedUnderlying = trap_glyph_info(trap, game);
    } else {
        underlying = engravingGlyph(engraving, loc, game)
            ?? terrain_glyph(loc, x, y);
        rememberedUnderlying = underlying;
    }

    if (game.u?.ux === x && game.u?.uy === y) {
        // C ref: display.h display_self() (251-260). maybe_display_usteed()
        // puts a visible steed's glyph on the hero's square while the hero
        // rides; the hero's own glyph shows through only when there is no
        // steed or the hero cannot see it.
        const steed = game.u.usteed;
        const hero = (steed && monsterVisible(steed, game))
            ? riddenMonsterGlyphInfo(steed, game)
            : hero_glyph_info(game);
        show_glyph_cell(x, y, hero);
        if (game.level?.flags?.hero_memory)
            loc.remembered_glyph = remembered_glyph_from_presentation(
                rememberedUnderlying,
                object ? null : trap?.tseen ? trap : null,
            );
        return;
    }

    // Only update display/memory if cell is IN_SIGHT (lit and visible)
    if (visible) {
        const shouldDisplayMonster = Boolean(
            monster && (monsterDirectlyVisible || monsterSensed),
        );
        const mimicAppearanceType = monster?.m_ap_type & M_AP_TYPMASK;
        // PHYSICALLY_SEEN mimicry presents the disguise before any sensed real
        // monster presentation. Object disguises therefore own their complete
        // map_object() draw sequence here, while monster disguises consume
        // their transient what_mon() draw without replacing floor memory.
        const mapsMimicDisguise = shouldDisplayMonster && !detectedOnly
            && [M_AP_FURNITURE, M_AP_OBJECT, M_AP_MONSTER].includes(
                mimicAppearanceType,
            );
        let mappedMimic = null;
        if (mapsMimicDisguise) {
            if (mimicAppearanceType === M_AP_OBJECT)
                mappedMimic = mappedObjectGlyphInfo(
                    mimicObject(monster),
                    game,
                );
            else {
                const glyph = monster_glyph_info(monster, game);
                mappedMimic = {
                    shown: glyph,
                    remembered: mimicAppearanceType === M_AP_MONSTER
                        ? rememberedUnderlying : glyph,
                };
            }
        }
        // display_monster()'s PHYSICALLY_SEEN category is broader than literal
        // sight: telepathy and warn-of-mon sensing enter it too. It handles the
        // disguise before revealing the real monster: object and furniture
        // appearances can update memory, while a monster appearance is a
        // transient presentation only.
        const revealsMappedMimic = mapsMimicDisguise
            && (monsterSensed
                || _propertyActive(game.u, PROT_FROM_SHAPE_CHANGERS));
        if (revealsMappedMimic
            && mimicAppearanceType === M_AP_MONSTER) {
            // display_monster() emits this disguise before overwriting it with
            // the sensed real form. Besides preserving rendering order, the
            // intermediate write can drive accessibility glyph-change notices.
            show_glyph_cell(x, y, mappedMimic.shown);
        }
        // display_monster() exposes a mimic's real monster glyph when sensing
        // defeats its appearance. Detect-only sensing uses the detected glyph
        // family; physical sight alone shows the disguise.
        const shown = shouldDisplayMonster
            ? (detectedOnly
                ? detectedMonsterGlyphInfo(monster, game)
                : monsterSensed || revealsMappedMimic
                    ? presentedMonsterGlyphInfo(monster, game, false)
                    : mappedMimic?.shown
                        ?? monster_glyph_info(monster, game))
            : monsterWarning ? warningGlyphInfo(monster, game) : underlying;
        // PHYSICALLY_SEEN object and furniture mimics map their disguise
        // before sensing reveals the real monster. M_AP_MONSTER leaves the
        // underlying floor memory intact, and DETECTED skips every disguise.
        const remembered = mapsMimicDisguise
            ? mappedMimic.remembered : rememberedUnderlying;
        if (game.level?.flags?.hero_memory
            || (mapsMimicDisguise
                && mimicAppearanceType === M_AP_FURNITURE)) {
            // display_monster() writes a furniture disguise directly to
            // levl[x][y].glyph even when ordinary hero memory is disabled.
            loc.remembered_glyph = remembered_glyph_from_presentation(
                remembered,
                remembered === underlying && !object && trap?.tseen
                    ? trap : null,
            );
        }
        show_glyph_cell(x, y, shown);
    } else if (loc.remembered_glyph) {
        // Out of sight but remembered — show remembered glyph
        show_glyph_cell(x, y, {
            ch: loc.remembered_glyph.ch,
            color: loc.remembered_glyph.color,
            dec: loc.remembered_glyph.decgfx,
            attr: loc.remembered_glyph.attr ?? 0,
            displayCh: loc.remembered_glyph.displayCh,
            displayColor: loc.remembered_glyph.displayColor ?? null,
            rgb: loc.remembered_glyph.rgb
                ? [...loc.remembered_glyph.rgb]
                : undefined,
        });
    }
}

// ── see_monsters ──
// C ref: display.c see_monsters() (1487-1522). Redraws every monster on the
// level after something changed what the hero can perceive. newsym() reads the
// module-global game, so this does too, and refuses any other state rather
// than iterating one game's monsters while drawing another's map.
//
// gd.defer_see_monsters is not modeled: goto_level() is its only setter and no
// level change is ported.
export function see_monsters(state = game) {
    if (state !== game)
        throw new TypeError('see_monsters() draws the global game state');

    let new_warn_obj_cnt = 0;

    /* steed and unseen engulfer/holder/holdee are recognized via touch */
    if (state.u.usteed) state.u.usteed.meverseen = 1;
    if (state.u.ustuck) state.u.ustuck.meverseen = 1;

    const warn_of_mon = Boolean(state.u.uprops?.[WARN_OF_MON]?.intrinsic
                                || state.u.uprops?.[WARN_OF_MON]?.extrinsic);
    for (let mon = state.level?.monlist ?? null; mon; mon = mon.nmon) {
        if (mon.mhp < 1) continue; /* DEADMONSTER() */
        if ((mon.mstate & MON_STILL_ARRIVING) !== 0) continue;
        newsym(mon.mx, mon.my);
        if (mon.wormno) {
            // worm.c see_wsegs() redraws the tail segments; no worm reaches
            // any level this port generates.
            throw new Error('see_monsters() over a long worm');
        }
        if (warn_of_mon
            && (state.context?.warntype?.obj & mon.data.mflags2) !== 0) {
            ++new_warn_obj_cnt;
        }
    }

    if (new_warn_obj_cnt !== (state.warn_obj_cnt ?? 0)) {
        // artifact.c Sting_effects() makes Sting glow or stop glowing. Nothing
        // grants Warn_of_mon on the levels this port reaches, so the count
        // cannot leave zero and this arm cannot be entered.
        throw new Error('see_monsters() toggling a warning artifact');
    }

    /* when mounted, hero's location gets caught by the monster loop */
    if (!state.u.usteed) newsym(state.u.ux, state.u.uy);
}

// ── docrt ──
// C ref: display.c docrt() through docrt_flags(docrtRecalc) (1990-2050).
//
// C shuts vision down, clears the screen, shows every remembered glyph, turns
// vision back on and overlays the monsters. The port's newsym() answers
// memory, vision and monsters together from the level and the vision arrays,
// so one sweep replaces C's three passes.
//
// The vision recalculation C brackets that repaint with stays with this
// function's callers, and they do not all make the same calls. goto_level()
// makes both, vision_recalc(2) then vision_recalc(0), at js/do.js:550-551;
// newgame() at js/allmain.js:201 and moveloop() at js/allmain.js:826 each make
// vision_recalc(0) alone, because neither has prior vision state to shut down.
// A fourth caller -- doup(), a level teleport, a trapdoor fall -- must decide
// which shape it needs from its own upstream site rather than by copying a
// neighbour: this function performs no vision work itself, and an arriving
// hero whose caller omits the recalculation gets no map.
//
// What does belong here is cls()'s first statement,
// display_nhwindow(WIN_MESSAGE, FALSE). It reaches win/tty/wintty.c
// tty_display_nhwindow()'s NHW_MESSAGE arm, which calls more() when the top
// line still holds a message the player has not acknowledged, and that is the
// input boundary a level change stops on: a descending hero sees
// "You descend the stairs.--More--" over the level she is leaving rather than
// the level she has arrived on. cls()'s remaining statements clear the
// physical map and the glyph buffer, which the sweep below and
// _buildScreenOutput() rewrite in full before the next flush.
export async function docrt() {
    if (!game.level || !game.u?.ux || game.program_state?.in_docrt) return;
    game.program_state ??= {};
    game.program_state.in_docrt = true;
    try {
        if (await dismissPendingTtyMessage(game)) {
            // tty_display_nhwindow() restores TOPLINE_NEED_MORE after more()
            // has reset it, so tty_clear_nhwindow() takes its repair branch.
            clearTtyMessageWindow(game);
        } else if (game.nhDisplay) {
            game.nhDisplay.toplin = TOPLINE_EMPTY;
        }
        for (let y = 0; y < ROWNO; y++)
            for (let x = 1; x < COLNO; x++) newsym(x, y);
    } finally {
        game.program_state.in_docrt = false;
    }
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
            description = weapon_descr(weapon, state);
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
    if (typ !== state.iflags.terrain_typ) {
        state.iflags.terrain_typ = typ;
        if (state.flags?.terrainstatus && !state.context?.run) {
            state.disp ??= {};
            state.disp.botl = true;
        }
    }
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

// botl.c reads eat.c's hu_stat[] and stores the bare word in the status
// field; the eight-column padding belongs to the table, not to the field.
//
// Read per call rather than mapped into a module-scope table: js/eat.js now
// imports what the #eat command needs, and those imports reach this file, so a
// module-scope read of hu_stat[] would run while js/eat.js is still
// initializing and throw. Returns undefined for an index outside the table, as
// indexing it would.
function hungerStatusField(uhs) {
    const entry = hu_stat[uhs];
    return entry === undefined ? undefined : mungspaces(entry);
}

// C ref: botl.c enc_stat[], indexed by near_capacity(). insight.c reads it too.
export const enc_stat = Object.freeze([
    '', 'Burdened', 'Stressed',
    'Strained', 'Overtaxed', 'Overloaded',
]);
const ENC_STAT_FORMS = Object.freeze([
    enc_stat,
    Object.freeze(['', 'Burden', 'Stress', 'Strain', 'Overtax', 'Overload']),
    Object.freeze(['', 'Brd', 'Strs', 'Strn', 'Ovtx', 'Ovld']),
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
    const hunger = hungerStatusField(u.uhs);
    return hunger ? ` ${hunger}` : '';
}

// C refs: botl.c enc_stat[] and wintty.c shrink_enc(). Keeping the lookup
// separate makes all source vocabulary rows independently testable.
export function tty_capacity_status(capacity, shrinkLevel) {
    return ENC_STAT_FORMS[shrinkLevel]?.[capacity] ?? '';
}

function _capacityStatus(shrinkLevel = 0) {
    return tty_capacity_status(near_capacity(game), shrinkLevel);
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

export function statusConditionActive(option, u) {
    switch (option) {
    case 'barehanded': return !game.uarmg && !game.uwep;
    case 'blind': return _propertyActiveUnblocked(u, BLINDED);
    case 'conf': return _propertyIntrinsic(u, CONFUSION);
    case 'deaf': return _propertyActive(u, DEAF) || u.uroleplay?.deaf;
    // youprop.h:253's Flying counts a flying steed as carrying the hero, and
    // botl.c:1194 reads the whole macro. No steed this port can reach flies,
    // so the steed term is dormant; it is written out because the other five
    // copies of the macro carry it too and one that did not would be a silent
    // divergence the moment a steed does fly. Those five are hack.js
    // heroIsFlying(), engrave.js heroFlying(), trap.js Flying(), steed.js
    // Flying() and polyself.js Flying() -- one per C file that expands the
    // macro. engrave.js spells the steed term `usteed?.data?.mflags1 & M1_FLY`
    // rather than is_flyer(), so a grep for this line's spelling finds only
    // four of the five. scripts/dismount-steed.test.mjs, "a flying steed
    // carries the hero through every copy of Flying", pins this copy and three
    // of the five against one flying steed; engrave.js's and steed.js's are
    // module-private, reachable only through can_reach_floor() and
    // mount_steed().
    case 'fly':
        return Boolean((u.uprops?.[FLYING]?.intrinsic
                        || u.uprops?.[FLYING]?.extrinsic
                        || (u.usteed && is_flyer(u.usteed.data)))
                       && !u.uprops?.[FLYING]?.blocked);
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
            && statusConditionActive(spec.option, u))
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

// C ref: botl.c initblstats[]'s BL_TIME entry, whose "%ld" is filled from
// svm.moves, under the " T:" prefix wintty.c status_fieldfmt[] supplies. This
// is the one field botl.c timebot() refreshes on its own.
function _statusTimeText() {
    return `T:${game.moves || 1}`;
}

function _statusLine2Configuration() {
    const u = game.u;
    if (!u) return null;
    const time = game.flags?.time ? ` ${_statusTimeText()}` : '';
    const optional = _optionalStatusFields();
    const versionLength = game.flags?.showvers
        ? status_version(game.flags).length + 1 : 0;
    let conditionLevel = 0;
    let capacityLevel = 0;
    let capacityPadding = '';
    let shortLevel = false;
    const build = () => `${_statusLevelDescription(u, shortLevel)} ${_statusVitals(u)}${time}${_hungerStatus(u)}${_capacityStatus(capacityLevel)
        ? ` ${_capacityStatus(capacityLevel)}` : ''}${capacityPadding}${_statusConditions(u, conditionLevel)}${optional}`;
    let status = build();
    // wintty.c make_things_fit() first tries both abbreviated condition
    // vocabularies, then both carrying-capacity abbreviations, and finally
    // shortens "Dlvl" to "Dl" before truncating.
    while (status.length + versionLength > TTY_STATUS_WIDTH
        && conditionLevel < 2) {
        conditionLevel++;
        status = build();
    }
    if (status.length + versionLength > TTY_STATUS_WIDTH
        && _capacityStatus(capacityLevel)) {
        capacityLevel = 1;
        status = build();
    }
    if (status.length + versionLength > TTY_STATUS_WIDTH
        && _capacityStatus(capacityLevel)) {
        capacityLevel = 2;
        status = build();
    }
    if (status.length + versionLength > TTY_STATUS_WIDTH
        && !_capacityStatus(capacityLevel)) {
        // shrink_enc() reconstructs an unencumbered BL_CAP as one blank;
        // unlike tty_status_update(), it does not suppress that blank again.
        capacityPadding = ' ';
        status = build();
    }
    if (status.length + versionLength > TTY_STATUS_WIDTH) {
        shortLevel = true;
        status = build();
    }
    return { capacityLevel, capacityPadding, conditionLevel, shortLevel };
}

function _statusLine3HungerPrefix(u) {
    // wintty.c check_fields() records BL_HUNGER's column before either
    // BL_HUNGER or BL_CAP contributes its current text.  The condition row
    // aligns to that stable field column, not to the rendered end of the row.
    return `${_statusAlignment(u)} ${_statusVitals(u)}`;
}

function _statusLine3DetailsConfiguration() {
    const u = game.u;
    if (!u) return null;
    const time = game.flags?.time ? ` ${_statusTimeText()}` : '';
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

    return { conditionLevel, shortLevel, time, version };
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

function _writeCapturedHighlight(row, start, text, owner) {
    let column = start;
    for (let index = 0; index < text.length;) {
        const spaces = text[index] === ' ';
        let end = index + 1;
        while (end < text.length && (text[end] === ' ') === spaces) ++end;
        const run = text.slice(index, end);
        // record-session.mjs compresses every maximal run of at least five
        // literal spaces into cursor-forward movement.  A compressed run was
        // never written into the recorder shadow grid, so it retains terminal
        // defaults even when the surrounding bytes were highlighted.
        column = row.write(
            column,
            run,
            spaces && run.length >= 5 ? null : owner,
        );
        index = end;
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

// One entry of the ordered list a status row is laid out from. `text` is the
// status_vals[] string the core last handed the window port and `owner` is the
// highlight owner _statusStyleRows() reads back off the rendered row. C ref:
// wintty.c check_fields(), which walks fieldorder[] in this order and gives
// each field the column the running total of the fields before it reaches.
//
// C's leading blanks and BL_EXP's '/' are separate entries here because
// render_status() writes them outside the field's own color and attribute.
function _statusField(text, owner = null) {
    return { owner, text };
}

// C ref: wintty.c set_condition_length(). BL_CONDITION carries no
// status_vals[] string; its length is one space plus one word per set bit, and
// render_status() writes the words itself so each can take its own color.
// `indent` marks the last row of a three-row status line, the only row whose
// conditions C lines up with a column on the row above.
function _conditionStatusField(entries, indent) {
    return {
        entries,
        indent,
        kind: 'condition',
        text: entries.map(({ text }) => ` ${text}`).join(''),
    };
}

// C ref: wintty.c tty_status_update()'s default arm under
// status_fieldfmt[BL_VERS], " %s". render_status() right justifies the field
// when it ends its row and writes that leading space unhighlighted.
function _versionStatusField(version) {
    return { kind: 'version', text: ` ${version}`, version };
}

function _optionalStatusFieldList() {
    return _optionalStatusEntries().flatMap(({ field, text }) => [
        _statusField(' '),
        _statusField(text, _fieldOwner(field)),
    ]);
}

function _vitalStatusFields(u) {
    const fields = [
        _statusField(`$:${money_cnt(game.invent)}`, _fieldOwner('gold')),
        _statusField(' '),
        _statusField(`HP:${u.uhp || 0}`, _fieldOwner('hitpoints')),
        _statusField(`(${u.uhpmax || 0})`, _fieldOwner('hitpoints-max')),
        _statusField(' '),
        _statusField(`Pw:${u.uen || 0}`, _fieldOwner('power')),
        _statusField(`(${u.uenmax || 0})`, _fieldOwner('power-max')),
        _statusField(' '),
        _statusField(`AC:${u.uac ?? 10}`, _fieldOwner('armor-class')),
        _statusField(' '),
        _statusField(`Xp:${u.ulevel || 1}`, _fieldOwner('experience-level')),
    ];
    if (game.flags?.showexp) {
        fields.push(
            _statusField('/'),
            _statusField(`${u.uexp || 0}`, _fieldOwner('experience')),
        );
    }
    return fields;
}

function _writeStatusFields(row, start, fields) {
    let column = start;
    for (const { owner, text } of fields) {
        column = row.write(column, text, owner);
    }
    return column;
}

// C ref: wintty.c render_status() (5036-5062). Line the conditions up with
// BL_HUNGER on the row above; where that leaves too little room, right justify
// them; where even that does not fit, leave them at the column check_fields()
// gave them. The four columns here do not share a base, so each names its own:
// `hungerX` is the one-based tty_status[BEFORE][BL_HUNGER].x; `nominal` is the
// zero-based column check_fields() gave BL_CONDITION, which is a different
// field on a different row; `x` below is C's one-based
// tty_status[NOW][BL_CONDITION].x; and the return is zero-based.
//
// C's last_col equals cw->cols here. It drops BL_VERS's width only when
// fieldorder[row][i + 1] is BL_VERS, and threelineorder[]'s entry after
// BL_CONDITION is BL_WEAPON.
function _conditionIndent(nominal, length, hungerX) {
    const x = nominal + 1; // tty columns are one-based
    const lastColumn = TTY_STATUS_WIDTH + 1; // cw->cols
    if (hungerX !== null && x < hungerX
        && hungerX + length < lastColumn - 1) return hungerX - 1;
    if (x + length < TTY_STATUS_WIDTH) return lastColumn - length - 1;
    return nominal;
}

// C ref: wintty.c render_status() (5185-5210). BL_VERS pads with spaces from
// its nominal column to vstart = cw->cols - lth and draws there. The padding
// erases whatever stands between, which on a three-row status line is the
// indented BL_CONDITION; wintty.c:5194-5196 records that as a FIXME.
function _writeVersion(row, nominal, field) {
    const start = Math.max(nominal, TTY_STATUS_WIDTH - field.text.length);
    row.clear(nominal, start);
    row.write(start, ' ');
    row.write(start + 1, field.version, _fieldOwner('version'));
}

// C ref: wintty.c check_fields() (4647-4737) and render_status() (4991-5262).
// check_fields() assigns every field the column the running total of the
// fields before it reaches, and render_status() draws them there, moving only
// the two whose column does not follow from that total. Both moved fields
// leave the running total alone, so what follows a displaced BL_CONDITION
// resumes at its nominal column.
//
// Returns the unfinished row alongside the columns the caller may need to
// redraw a field over, which is what _statusLine3DetailsLayout()'s second
// initial pass does.
function _renderStatusFields(fields, hungerX = null) {
    const row = _newStatusRow();
    const geometry = {
        conditionNominal: null,
        conditionStart: null,
        versionNominal: null,
    };
    let nominal = 0;
    for (const field of fields) {
        if (field.kind === 'condition') {
            geometry.conditionNominal = nominal;
            if (field.entries.length) {
                geometry.conditionStart = field.indent
                    ? _conditionIndent(nominal, field.text.length, hungerX)
                    : nominal;
                _writeConditions(row, geometry.conditionStart, field.entries);
            }
        } else if (field.kind === 'version') {
            geometry.versionNominal = nominal;
            _writeVersion(row, nominal, field);
        } else {
            row.write(nominal, field.text, field.owner);
        }
        nominal += field.text.length;
    }
    return { geometry, row };
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
        const highlighted = bar.slice(0, barLength);
        _writeCapturedHighlight(row, 1, highlighted, _hpBarOwner());
        row.write(1 + highlighted.length, bar.slice(highlighted.length));
        row.write(1 + STATUS_HP_BAR_WIDTH, ']');
        column = STATUS_HP_BAR_WIDTH + 2;
    } else {
        const title = _statusTitle().padEnd(STATUS_HP_BAR_WIDTH);
        row.write(0, title, _fieldOwner('title'));
        column = title.length;
    }

    column = Math.max(31, column + 1);
    const attrs = [
        effective_attribute(game, A_STR),
        effective_attribute(game, A_INT),
        effective_attribute(game, A_WIS),
        effective_attribute(game, A_DEX),
        effective_attribute(game, A_CON),
        effective_attribute(game, A_CHA),
    ];
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

// The fields wintty.c twolineorder[]'s second row holds, in its order.
function _statusLine2Fields() {
    const u = game.u;
    // _statusLine2Configuration() answers null for exactly the missing hero
    // this function has no row to draw for.
    const configuration = _statusLine2Configuration();
    if (!configuration) return null;
    const {
        capacityLevel,
        capacityPadding,
        conditionLevel,
        shortLevel,
    } = configuration;
    const fields = [
        _statusField(
            _statusLevelDescription(u, shortLevel),
            _fieldOwner('dungeon-level'),
        ),
        _statusField(' '),
        ..._vitalStatusFields(u),
    ];
    if (game.flags?.time) {
        fields.push(
            _statusField(' '),
            _statusField(_statusTimeText(), _fieldOwner('time')),
        );
    }
    const hunger = _statusFieldData('hunger').text;
    if (hunger) {
        fields.push(
            _statusField(' '),
            _statusField(hunger, _fieldOwner('hunger')),
        );
    }
    const capacity = _capacityStatus(capacityLevel);
    if (capacity) {
        fields.push(
            _statusField(' '),
            _statusField(capacity, _fieldOwner('carrying-capacity')),
        );
    }
    if (capacityPadding) fields.push(_statusField(capacityPadding));
    fields.push(_conditionStatusField(
        _statusConditionEntries(u, conditionLevel),
        false,
    ));
    fields.push(..._optionalStatusFieldList());
    if (game.flags?.showvers) {
        fields.push(_versionStatusField(status_version(game.flags)));
    }
    return fields;
}

function _statusLine2Layout() {
    const fields = _statusLine2Fields();
    if (!fields) return { text: '', owners: [] };
    const { row } = _renderStatusFields(fields);
    return { ...row.finish(), fields };
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
    column = _writeStatusFields(row, column, _vitalStatusFields(u));
    const hunger = _statusFieldData('hunger').text;
    if (hunger) {
        column = row.write(column, ' ');
        row.write(column, hunger, _fieldOwner('hunger'));
    }
    const capacity = _capacityStatus();
    if (capacity) {
        column = row.write(column, ' ');
        row.write(
            column,
            capacity,
            _fieldOwner('carrying-capacity'),
        );
    }
    return row.finish();
}

// The fields wintty.c threelineorder[]'s third row holds, in its order, with
// the column a three-row BL_CONDITION indents toward.
function _statusLine3DetailsFields() {
    const u = game.u;
    // As in _statusLine2Fields(): a null configuration is a missing hero.
    const configuration = _statusLine3DetailsConfiguration();
    if (!configuration) return null;
    const { conditionLevel, shortLevel, time, version } = configuration;
    const fields = [
        _statusField(
            _statusLevelDescription(u, shortLevel),
            _fieldOwner('dungeon-level'),
        ),
    ];
    if (time) {
        fields.push(
            _statusField(' '),
            _statusField(time.slice(1), _fieldOwner('time')),
        );
    }
    fields.push(_conditionStatusField(
        _statusConditionEntries(u, conditionLevel),
        true,
    ));
    fields.push(..._optionalStatusFieldList());
    if (version) fields.push(_versionStatusField(version));
    return {
        fields,
        // C ref: wintty.c render_status():5054-5057, tty_status[BEFORE]
        // [BL_HUNGER].x. BL_HUNGER follows the alignment and the vitals on the
        // second of three rows, and check_fields() gives it that column
        // whether or not the hunger word is currently empty.
        hungerX: _statusLine3HungerPrefix(u).length + 1,
    };
}

function _statusLine3DetailsLayout({ initialTtyRefresh }) {
    const built = _statusLine3DetailsFields();
    if (!built) return { text: '', owners: [] };
    const { fields, hungerX } = built;
    const { geometry, row } = _renderStatusFields(fields, hungerX);

    if (initialTtyRefresh && geometry.conditionStart !== null) {
        // newgame()'s explicit bot() follows the flush-triggered initial
        // status pass.  On that second tty pass, BL_CONDITION is redrawn:
        // its indent clears unchanged optional fields, then BL_VERS redraws
        // from its nominal position.  This incremental overlap is visible at
        // a More boundary before moveloop's forced status refresh.
        row.clear(geometry.conditionNominal, geometry.conditionStart);
        _writeConditions(
            row,
            geometry.conditionStart,
            fields.find(({ kind }) => kind === 'condition').entries,
        );
        const version = fields.find(({ kind }) => kind === 'version');
        if (version) _writeVersion(row, geometry.versionNominal, version);
    }
    return { ...row.finish(), fields, hungerX };
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

// C ref: botl.c exp_percent_changing(). exper.c more_experienced() asks it
// whether a status redraw is needed after experience points changed but
// 'showexp' left the points off the status line: a percentage highlight rule
// on the Xp field reads those points, so its selected rule can change even
// though nothing printed does.
//
// The first term of C's test is a constant here. initblstats[] builds BL_XP
// through INIT_BLSTATP, so its percent_matters is TRUE, and nothing in the
// program writes that member afterwards. What decides the answer is
// curr->thresholds, the STATUSHILITE rules parsed for the field; with none of
// them C returns FALSE without evaluating exp_percentage() at all.
//
// A rule on the field is refused rather than guessed. C answers it by
// comparing get_hilite()'s choice against curr->hilite_rule, the rule the
// last draw settled on, and this port keeps no such per-field memory:
// _statusFieldStyle() reselects from current state every time the status line
// is built. Reproducing the comparison means giving the renderer that memory.
export function exp_percent_changing(state = game) {
    /* "if status update is already requested, skip this processing" */
    if (state.disp?.botl) return false;
    const thresholds = (state.iflags?.status_hilites ?? []).filter(
        (rule) => rule.field === 'experience-level',
    );
    if (!thresholds.length) return false;
    throw new UnsupportedExperienceChangeError(
        'exp_percent_changing() with a status-highlight rule on Xp',
    );
}

// C ref: botl.c xlev_to_rank(). Converts an experience level (1..30) to a
// rank index (0..8): 1..2 give 0, 3..5 give 1, and every further band of four
// levels gives the next index, with level 30 alone giving 8.
export function xlev_to_rank(xlev) {
    return xlev <= 2 ? 0 : xlev <= 30 ? Math.trunc((xlev + 2) / 4) : 8;
}

function _criticallyLowHp(onlyIfInjured) {
    const u = game.u;
    const current = u?.uhp ?? 0;
    let maximum = u?.uhpmax ?? 0;
    if (onlyIfInjured && current >= maximum) return false;
    maximum = Math.min(maximum, 15 * (u?.ulevel ?? 1));
    const rank = xlev_to_rank(u?.ulevel ?? 1);
    const divisor = rank <= 1 ? 5
        : rank <= 3 ? 6 : rank <= 5 ? 7 : rank <= 7 ? 8 : 9;
    return current <= 5 || current * divisor <= maximum;
}

function _statusFieldData(field) {
    const u = game.u;
    const attrs = [
        effective_attribute(game, A_STR),
        effective_attribute(game, A_INT),
        effective_attribute(game, A_WIS),
        effective_attribute(game, A_DEX),
        effective_attribute(game, A_CON),
        effective_attribute(game, A_CHA),
    ];
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
    case 'carrying-capacity': {
        const capacity = near_capacity(game);
        return {
            value: capacity,
            text: enc_stat[capacity] ?? '',
        };
    }
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
            text: hungerStatusField(u?.uhs ?? NOT_HUNGRY) ?? '',
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
        const msg = game._pending_message || '';
        let skippedMessageCells = null;
        for (let c = 0; c < Math.min(msg.length, display.cols); ++c) {
            if (msg[c] === '\0') {
                skippedMessageCells ??= [];
                skippedMessageCells[c] = { ...display.grid[0][c] };
            }
        }
        display.clearScreen();
        // Message line
        for (let c = 0; c < Math.min(msg.length, display.cols); c++) {
            // Recorder patch 006 ignores signed high-bit TTY bytes after the
            // source cursor has advanced. tty_message.js represents each such
            // byte as NUL, so restore the physical cell which clearScreen()
            // temporarily erased instead of projecting the marker.
            if (msg[c] === '\0') {
                const cell = skippedMessageCells[c];
                display.setCell(c, 0, cell.ch, cell.color, cell.attr);
            } else {
                display.setCell(c, 0, msg[c], NO_COLOR, 0);
            }
        }
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

// C ref: display.c flush_screen()'s function-static `delay_flushing`. Its only
// writer is a `flush_screen(-1)` call, and do.c goto_level() makes exactly two
// of them, at do.c:1718 and do.c:1839.
//
// C can keep it in a function-static because C never leaves goto_level()
// between that pair. This port can: js/do.js goto_level() raises fail-closed
// boundaries between its own two `await flush_screen(-1)` calls, and a
// boundary raised at any of them would strand the toggle in its delayed state.
// Those two calls are the whole window, so a refusal after the second one
// releases the toggle first and strands nothing. A module variable would
// suppress every later flush in the process, so each remaining segment of the
// session would record its cursor at the origin. The flag lives on game state,
// which js/gstate.js resetGame() replaces wholesale for each runSegment(), so
// a new segment always starts undelayed. That is a port-side correction for a
// port-side abort, not a divergence from the static's semantics within one
// level change.

// C ref: display.c flush_screen() (2207-2266). `mode` is C's cursor_on_u, and
// the body below reads it for the -1 sentinel alone.
//
// A value of -1 toggles the delay: goto_level() calls flush_screen(-1) at
// do.c:1718 to postpone every map flush while it builds the destination, and
// again at do.c:1839 to release it. The second call falls past the guard below
// and flushes.
//
// Every other value behaves as C's flush_screen(1) does, because
// _buildScreenOutput() places the cursor on the hero unconditionally. No
// ported caller passes 0, so the gap is latent; a caller that needs C's
// cursor_on_u == 0 behaviour -- pline.c:274's NO_CURS_ON_U among them -- must
// first give _buildScreenOutput() a way to leave the cursor where it stands.
export async function flush_screen(mode) {
    if (mode === -1) game.delay_flushing = !game.delay_flushing;
    if (game.delay_flushing) return;
    // C ref: display.c flush_screen() (2235-2239). The turn counter has its
    // own arm, which refreshes that field alone.
    if (game.disp?.botl || game.disp?.botlx) {
        await bot({
            // Before moveloop_preamble(), tty field dirtiness can preserve
            // the initial three-row condition/optional-field overlap.
            initialTtyRefresh: Boolean(
                game.program_state
                && !game.program_state.in_moveloop
                && game.u?.ux,
            ),
        });
    } else if (game.disp?.time_botl) {
        await timebot();
    }
    _buildScreenOutput();
    // C ref: display.c flush_glyph_buffer(). Once the buffered map has reached
    // the window port, each gbuf entry is clean until show_glyph() writes it
    // again. This also makes show_glyph()'s explicit gnew exception precise.
    if (game.level?.at) {
        for (let x = 1; x < COLNO; ++x)
            for (let y = 0; y < ROWNO; ++y)
                game.level.at(x, y).gnew = 0;
    }
}

// ── cls ──
export async function cls() {
    const display = game?.nhDisplay;
    if (display?.clearScreen) display.clearScreen();
    // C's cls() clears both the physical terminal and its pending glyph
    // buffer.  disp_* is the JS glyph-buffer owner; leaving it populated lets
    // the next flush reconstruct dungeon cells which were meant to stay
    // hidden on a temporary find_trap() display.
    if (game.level?.at) {
        for (let x = 1; x < COLNO; ++x) {
            for (let y = 0; y < ROWNO; ++y) {
                const loc = game.level.at(x, y);
                loc.disp_ch = null;
                loc.disp_color = NO_COLOR;
                loc.disp_decgfx = false;
                loc.disp_attr = 0;
                loc.disp_browser_ch = null;
                loc.disp_browser_color = null;
                loc.disp_browser_attr = null;
                loc.disp_glyph = null;
                loc.gnew = 0;
            }
        }
    }
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

// ── timebot ──

// C ref: botl.c timebot() (274-294). allmain.c moveloop_core() and
// display.c flush_screen() reach it only when disp.time_botl is set while
// disp.botl and disp.botlx are both clear, which is the turn counter moving
// with nothing else marked dirty.
//
// gb.bot_disabled has no ported writer, and suppress_map_output() covers the
// save, restore and hangup states this port does not enter.
export async function timebot() {
    if (game.flags?.time && game.iflags?.status_updates !== false) {
        // VIA_WINDOWPORT() is true for the tty: wintty.c sets both
        // WC2_HILITE_STATUS and WC2_FLUSH_STATUS in tty_procs.wincap2, so C
        // takes stat_update_time() rather than falling back to whole bot().
        _stat_update_time();
    }
    if (game.disp) game.disp.time_botl = false;
}

// C ref: botl.c stat_update_time() (1284-1299). It refreshes blstats[BL_TIME]
// alone and flushes the status window. Every other field keeps the
// status_vals[] string the last full status pass left there, so wintty.c
// make_things_fit() and render_status() lay the row out again from those
// cached strings with only BL_TIME's own length changed.
//
// game._renderedStatusLayouts is this port's status_vals[]: bot() stores the
// field list it rendered each row from, and rendering that list again with
// BL_TIME's entry replaced is the same re-layout. A field that flows keeps its
// text and moves by the difference; BL_VERS and a three-row BL_CONDITION are
// placed from the row's width instead and so do not move at all.
function _stat_update_time() {
    const rendered = game._renderedStatusLayouts;
    // Before the first full status pass there is no cached text to keep.
    // moveloop_preamble() sets disp.botlx, so a full pass always precedes the
    // first turn that can set disp.time_botl, and C's blstats[] is likewise
    // unpopulated until then.
    const layouts = rendered
        ? rendered.map((layout) => _refreshTimeField(layout))
        : statusLayouts();
    game._renderedStatusLayouts = layouts;
    writeStatusRows(game?.nhDisplay, layouts);
}

export class UnsupportedStatusRefreshError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedStatusRefreshError';
    }
}

// C ref: wintty.c make_things_fit() (4583-4636), which runs on every BL_FLUSH,
// stat_update_time()'s included, and restarts its shrink ladder from the
// unshrunk strings the core last sent.
//
// A turn-counter refresh moves only BL_TIME's length, and the counter only
// grows, so a row that still fits keeps the rung the full status pass chose: a
// shorter rung did not fit the narrower counter and cannot fit the wider one.
// A row that no longer fits needs a rung this port cannot reach from the
// rendered strings, because shrinking the condition words, the encumbrance
// word and Dlvl each read the value the core sent rather than the text on the
// row. C's fit test is rowsz[condrow] - 1 <= cw->cols - 1, which is the sum of
// the row's field lengths against TTY_STATUS_WIDTH.
// The test is relative, comparing the row before and after the counter is
// replaced. An absolute test would throw on every later refresh once a row
// stood over the limit, including refreshes that change no width at all, such
// as T:10 to T:11. Only a refresh that carries the row across the limit needs
// a rung the last full pass did not already choose.
function _rowWidth(fields) {
    return fields.reduce((total, { text }) => total + text.length, 0);
}

function _refuseUnfittableStatusRow(cached, refreshed) {
    if (_rowWidth(refreshed) > TTY_STATUS_WIDTH
        && _rowWidth(cached) <= TTY_STATUS_WIDTH) {
        throw new UnsupportedStatusRefreshError(
            'make_things_fit() shrinking a row on a turn-counter refresh',
        );
    }
}

function _isTimeField({ owner }) {
    return owner?.kind === 'field' && owner.field === 'time';
}

// One status row laid out again with BL_TIME's cached string replaced by the
// current turn counter. A row that holds no BL_TIME comes back untouched,
// which is every row when the 'time' option is off and every row but the last
// when it is on.
function _refreshTimeField(layout) {
    const cached = layout.fields?.find(_isTimeField);
    if (!cached) return layout;
    const refreshed = _statusField(_statusTimeText(), _fieldOwner('time'));
    const fields = layout.fields.map(
        (field) => (field === cached ? refreshed : field),
    );
    _refuseUnfittableStatusRow(layout.fields, fields);
    const hungerX = layout.hungerX ?? null;
    const { row } = _renderStatusFields(fields, hungerX);
    return { ...row.finish(), fields, hungerX };
}
