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
import { In_hell, depth, on_level, update_lastseentyp } from './dungeon.js';
import { money_cnt } from './invent.js';
import { cansee, seenv_matrix } from './vision.js';
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
    CORPSTAT_FEMALE, CORPSTAT_GENDER,
    HL_BOLD, HL_INVERSE, HL_ULINE, HL_UNDEF,
    LEVITATION, NOT_HUNGRY, SICK, SICK_NONVOMITABLE, SICK_VOMITABLE,
    SLIMED, STONED, STR18, STRANGLED, STUNNED, OBJ_FLOOR,
    BACKTRACK, DISP_ALL, DISP_ALWAYS, DISP_BEAM, DISP_CHANGE, DISP_END,
    DISP_FLASH, DISP_FREEMEM, DISP_TETHER,
    P_SHORT_SWORD, P_SABER,
    P_MORNING_STAR, P_QUARTERSTAFF, P_POLEARMS, P_LANCE,
    P_UNICORN_HORN,
    COLNO, ROWNO, STONE, ROOM, CORR, DOOR, STAIRS, LADDER, SCORR,
    HWALL, VWALL, TLCORNER, TRCORNER, BLCORNER, BRCORNER, SDOOR,
    CROSSWALL, TUWALL, TDWALL, TLWALL, TRWALL,
    IRONBARS, TREE, ALTAR, GRAVE, THRONE, SINK, FOUNTAIN,
    POOL, MOAT, ICE, LAVAPOOL, LAVAWALL, AIR, CLOUD, WATER,
    DBWALL, DRAWBRIDGE_UP, DRAWBRIDGE_DOWN,
    DB_FLOOR, DB_ICE, DB_LAVA, DB_MOAT, DB_UNDER,
    D_BROKEN, D_ISOPEN, D_CLOSED, D_LOCKED, D_TRAPPED, LA_DOWN,
    IS_STWALL, isok, u_at, Ugender, Upolyd,
    BEAR_TRAP, NO_TRAP, WEB, is_pit,
    In_mines, In_sokoban, Is_knox_level, MAXTCHARS,
    SV0, SV1, SV2, SV3, SV4, SV5, SV6, SV7,
    WM_MASK, WM_C_OUTER, WM_C_INNER,
    WM_W_LEFT, WM_W_RIGHT, WM_W_TOP, WM_W_BOTTOM,
    WM_T_LONG, WM_T_BL, WM_T_BR,
    WM_X_TL, WM_X_TR, WM_X_BL, WM_X_BR, WM_X_TLBR, WM_X_BLTR,
    HI_DOMESTIC, M_AP_FURNITURE, M_AP_OBJECT, M_AP_MONSTER,
    M_AP_TYPMASK, MON_STILL_ARRIVING, WARN_OF_MON,
    SYM_BOULDER, SYM_INVISIBLE, SYM_NOTHING,
    SYM_PET_OVERRIDE, SYM_HERO_OVERRIDE,
    WARNING, WARNCOUNT,
    PROT_FROM_SHAPE_CHANGERS,
    def_warnsyms,
} from './const.js';
import {
    ATR_NONE,
    ATR_INVERSE,
    ATR_BOLD,
    ATR_UNDERLINE,
    NO_COLOR,
    CLR_BLACK,
    CLR_BRIGHT_BLUE,
    CLR_BRIGHT_MAGENTA,
    CLR_GRAY,
    CLR_GREEN,
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
    dist2,
    encodeUtf8ByteString,
    mungspaces,
} from './hacklib.js';
import { hu_stat } from './eat.js';
import { observe_object } from './o_init.js';
import { can_reach_floor, engr_at, engr_can_be_felt } from './engrave.js';
import { status_version } from './version.js';
import { is_weptool } from './obj.js';
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
    misc_symbol,
    monster_class_symbol,
    object_class_symbol,
    optional_misc_symbol,
    symbol_at,
    MAXPCHARS,
    SYM_OFF_W,
    S_arrow_trap,
    S_digbeam,
    S_goodpos,
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
    S_vbeam,
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
    SYM_OFF_X,
    trap_to_defsym,
} from './symbols.js';
import { numeric_glyph_customization } from './glyphs.js';
import {
    GLYPH_ALTAR_OFF,
    GLYPH_BODY_OFF,
    GLYPH_BODY_PILETOP_OFF,
    GLYPH_CMAP_A_OFF,
    GLYPH_CMAP_B_OFF,
    GLYPH_CMAP_C_OFF,
    GLYPH_CMAP_GEH_OFF,
    GLYPH_CMAP_KNOX_OFF,
    GLYPH_CMAP_MAIN_OFF,
    GLYPH_CMAP_MINES_OFF,
    GLYPH_CMAP_SOKO_OFF,
    GLYPH_CMAP_STONE_OFF,
    GLYPH_DETECT_FEM_OFF,
    GLYPH_DETECT_MALE_OFF,
    GLYPH_INVIS_OFF,
    GLYPH_MON_FEM_OFF,
    GLYPH_MON_MALE_OFF,
    GLYPH_NOTHING_OFF,
    GLYPH_OBJ_OFF,
    GLYPH_OBJ_PILETOP_OFF,
    GLYPH_PET_FEM_OFF,
    GLYPH_PET_MALE_OFF,
    GLYPH_RIDDEN_FEM_OFF,
    GLYPH_RIDDEN_MALE_OFF,
    GLYPH_STATUE_FEM_OFF,
    GLYPH_STATUE_FEM_PILETOP_OFF,
    GLYPH_STATUE_MALE_OFF,
    GLYPH_STATUE_MALE_PILETOP_OFF,
    GLYPH_UNEXPLORED_OFF,
    GLYPH_WARNING_OFF,
    GLYPH_ZAP_OFF,
    MAX_GLYPH,
    NUM_ZAP,
} from './glyph_offsets.js';
// C ref: drawing.c defsyms[].color, the last column of every defsym.h PCHAR
// row, which display.c reads back through its cmap_color() macro.
import { CMAP_COLORS } from './symbol_data.js';
import { t_at } from './trap.js';
// pray.c owns critically_low_hp(); botl.c:2555 and wintty.c:4539 are two of
// its three C call sites, so the status line reads the one port in js/pray.js
// rather than keeping a second copy here.
import { critically_low_hp } from './pray.js';
import { visible_region_at } from './region.js';
import {
    M1_HUMANOID,
    NON_PM,
    NUMMONS,
    PM_TENGU,
} from './monsters.js';
import { rn2_on_display_rng } from './rng.js';
import {
    canSeeMonster,
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
// rendered character; cmap_to_glyph() numbers it and map_glyphinfo() picks
// the symbol.
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

/**
 * C ref: display.c reset_glyphmap()'s GLYPH_CMAP_B_OFF arm (2906-2928), the
 * half inside its `if (!iflags.use_color)`. Where colour is off and two pieces
 * of terrain draw the same byte, C marks the rarer one so that tty can print
 * it in inverse video and keep them apart.
 *
 * The gate is C's own, and it is not the gate MG_BW_ENGR sits behind: the
 * CMAP_A arm raises that bit whatever the colour option says. Only
 * tty_print_glyph() consults iflags.use_inverse, which is why no term for it
 * appears here.
 */
function cmapBlackAndWhiteFlags(cmap, state) {
    if (state.iflags?.wc_color !== false) return 0;
    const symbol = cmap_symbol_byte(cmap, state);
    switch (cmap) {
    case S_lava:
    case S_lavawall:
        return symbol === cmap_symbol_byte(S_pool, state)
            || symbol === cmap_symbol_byte(S_water, state) ? MG_BW_LAVA : 0;
    case S_ice:
        return symbol === cmap_symbol_byte(S_room, state)
            || symbol === cmap_symbol_byte(S_darkroom, state) ? MG_BW_ICE : 0;
    case S_sink:
        return symbol === cmap_symbol_byte(S_fountain, state)
            ? MG_BW_SINK : 0;
    default:
        return 0;
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

// The accessibility sidecars a cmap glyph carries. Everything in them is a
// function of the cmap index, which map_glyphinfo() recovers from the glyph
// number, so nothing about them has to be stored alongside the number.
function withCmapAccessibility(glyph, cmap, customizationName) {
    const kind = cmap >= S_stone && cmap <= S_trwall
        ? 'wall'
        : cmap >= S_room && cmap <= S_darkroom
            ? 'room'
            : cmap >= S_upstair && cmap <= S_fountain
                ? 'furniture'
                : 'cmap';
    return withAccessibilityMetadata(
        glyph,
        kind,
        `cmap:${cmap}:${customizationName ?? ''}`,
        { type: 'cmap', symbol: cmap },
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
        color: recorderMapColor(
            customization?.basicColor ?? color,
            state,
        ),
        dec: symbol.dec,
    };
    if (Number.isInteger(symbol.ttychar)) {
        Object.defineProperty(result, 'ttychar', { value: symbol.ttychar });
    }
    if (displayCh) result.displayCh = displayCh;
    if (customization?.rgb && state.iflags?.wc_color !== false) {
        result.rgb = [...customization.rgb];
        result.displayColor = `rgb(${customization.rgb.join(', ')})`;
    }
    return result;
}

// C's glyph_info carries the glyph number beside its resolved presentation.
// Keep the number non-enumerable so renderer-facing records retain their
// established shape while display.c glyph_at() consumers can read identity.
function withLogicalGlyph(presentation, glyph) {
    if (!Number.isInteger(glyph)) return presentation;
    Object.defineProperty(presentation, 'glyph', { value: glyph });
    return presentation;
}

function genderedMonsterGlyph(mnum, female, maleOffset, femaleOffset) {
    return Number.isInteger(mnum)
        ? mnum + (female ? femaleOffset : maleOffset)
        : undefined;
}

function drawbridgeMask(loc) {
    // drawbridgemask aliases struct rm's flags.  Keep the compatibility
    // field for state written by the earlier JS map representation.
    return loc.flags || loc.drawbridgemask || 0;
}

function accessibilityOverridesEnabled(state) {
    // C ref: display.c map_glyphinfo() and reset_glyphmap().  Merely defining
    // S_hero_override or S_pet_override is insufficient; sysconf must also
    // enable the accessibility glyph behavior.
    return state.sysopt?.accessibility === 1;
}

export function hero_glyph_info(state = game) {
    // C ref: display.h hero_glyph (654-656), the species half:
    // (Upolyd || !flags.showrace) ? u.umonnum : gu.urace.mnum. A polymorphed
    // hero shows her form rather than her race even with 'showrace' on, which
    // is why the disjunct is here and not only the option. Upolyd() is always
    // false while polyself is unported, so today the option alone decides.
    const showRace = Boolean(state.flags?.showrace);
    const mnum = (Upolyd(state.u) || !showRace)
        ? state.u?.umonnum : state.urace?.mnum;
    const species = state.mons?.[mnum] ?? state.youmonst?.data;
    const symbol = (accessibilityOverridesEnabled(state)
        ? optional_misc_symbol(SYM_HERO_OVERRIDE, state) : null)
        ?? monster_class_symbol(species?.mlet ?? 53, state);
    const logicalGlyph = genderedMonsterGlyph(
        mnum,
        Ugender(state),
        GLYPH_MON_MALE_OFF,
        GLYPH_MON_FEM_OFF,
    );
    const glyph = glyphPresentation(
        symbol,
        (showRace && !Upolyd(state.u))
            ? HI_DOMESTIC : species?.mcolor ?? CLR_WHITE,
        state,
        numeric_glyph_customization(logicalGlyph, state),
    );
    // C ref: display.h hero_glyph (654-656). The hero's own square takes an
    // ordinary monster glyph, so reset_glyphmap()'s GLYPH_MON arm gives it
    // MG_MALE or MG_FEMALE like any other monster -- but from Ugender rather
    // than from a mon->female, because the hero is not a struct monst.
    const attr = print_glyph_attr(
        monsterGenderFlag(Ugender(state)), state,
    );
    if (attr) glyph.attr = attr;
    return withLogicalGlyph(
        glyph,
        logicalGlyph,
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
    const mnum = monster.data?.pmidx;
    const logicalGlyph = monster.mtame
        ? genderedMonsterGlyph(
            mnum,
            monster.female,
            GLYPH_PET_MALE_OFF,
            GLYPH_PET_FEM_OFF,
        )
        : genderedMonsterGlyph(
            mnum,
            monster.female,
            GLYPH_MON_MALE_OFF,
            GLYPH_MON_FEM_OFF,
        );
    const glyph = glyphPresentation(
        symbol,
        monster.data.mcolor,
        state,
        numeric_glyph_customization(logicalGlyph, state),
    );
    // C ref: display.h pet_to_glyph() (563-565) and mon_to_glyph() (554-556),
    // resolved through reset_glyphmap()'s pet arms (3036-3049) and ordinary
    // monster arms (3050-3065). Pet highlighting is a tty presentation
    // attribute; it does not alter the remembered floor glyph.
    const attr = print_glyph_attr(
        (monster.mtame ? MG_PET : 0) | monsterGenderFlag(monster.female),
        state,
    );
    if (attr) glyph.attr = attr;
    withLogicalGlyph(glyph, logicalGlyph);
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
    // C ref: display.h random_obj_to_glyph() (932-936). A random corpse draws
    // its displayed body in the plain body range; every other random object
    // takes objnum_to_glyph()'s plain object range, a STATUE included, which
    // is why a hallucinated statue drawn this way shows the generic rock-class
    // statue. Neither arm asks obj_is_piletop(), and neither reaches
    // statue_to_glyph(). So this cannot route through object_glyph_info():
    // that function dispatches otyp === STATUE to statue_to_glyph(), which
    // reads a corpsenm the synthetic object does not carry, and the NaN it
    // returns reaches map_glyphinfo() as an unresolvable number.
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
    // C's ternary draws the species only on the corpse arm, after the object
    // draw, and that order is observable in the display-RNG stream.
    if (randomType === CORPSE)
        randomObject.corpsenm = displayDraw(displayRandom, NUMMONS);
    const glyph = map_glyphinfo(
        randomType === CORPSE
            ? randomObject.corpsenm + GLYPH_BODY_OFF
            : objnum_to_glyph(randomType),
        state,
    );
    if (!state.a11y?.glyph_updates) return glyph;
    return withObjectAccessibility(glyph, randomObject, state);
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
    // gender draw, and the glyph the two build lands in the ordinary monster
    // range, not in either statue range. `!(rng)(2)` picks the male half, so a
    // nonzero draw is the female one, and reset_glyphmap()'s GLYPH_MON_FEM
    // arm gives that half MG_FEMALE.
    const species = state.mons?.[displayDraw(displayRandom, NUMMONS)];
    if (!species) {
        throw new Error(
            'hallucinated statue display requires the complete monster catalog',
        );
    }
    const female = displayDraw(displayRandom, 2) !== 0;
    return actualMonsterGlyphInfo({ data: species, mtame: 0, female }, state);
}

// C ref: display.c display_monster()'s final pet/detected/ordinary branch.
// Hallucination changes the presented species for both detected and physically
// seen monsters, but not the gender half of the range each of the three
// what_mon() macros picks: that stays mon->female whatever species is shown.
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
    const mnum = species.pmidx;
    const logicalGlyph = detected
        ? genderedMonsterGlyph(
            mnum,
            monster.female,
            GLYPH_DETECT_MALE_OFF,
            GLYPH_DETECT_FEM_OFF,
        )
        : genderedMonsterGlyph(
            mnum,
            monster.female,
            GLYPH_MON_MALE_OFF,
            GLYPH_MON_FEM_OFF,
        );
    const glyph = glyphPresentation(
        monster_class_symbol(species.mlet, state),
        species.mcolor,
        state,
        numeric_glyph_customization(logicalGlyph, state),
    );
    const attr = print_glyph_attr(
        (detected ? MG_DETECT : 0) | monsterGenderFlag(monster.female),
        state,
    );
    if (attr) glyph.attr = attr;
    withLogicalGlyph(glyph, logicalGlyph);
    return withMonsterAccessibility(
        glyph,
        monster,
        species,
        state,
        detected ? 'detected' : 'monster',
    );
}

// C ref: display.h ridden_mon_to_glyph() (560-562), reached from
// display_self()'s maybe_display_usteed() (246-249). reset_glyphmap()
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
    const logicalGlyph = genderedMonsterGlyph(
        species.pmidx,
        monster.female,
        GLYPH_RIDDEN_MALE_OFF,
        GLYPH_RIDDEN_FEM_OFF,
    );
    const glyph = glyphPresentation(
        monster_class_symbol(species.mlet, state),
        species.mcolor,
        state,
        numeric_glyph_customization(logicalGlyph, state),
    );
    const attr = print_glyph_attr(
        MG_RIDDEN | monsterGenderFlag(monster.female), state,
    );
    if (attr) glyph.attr = attr;
    withLogicalGlyph(
        glyph,
        logicalGlyph,
    );
    return withMonsterAccessibility(
        glyph, monster, species, state, 'ridden',
    );
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
    const logicalGlyph = genderedMonsterGlyph(
        speciesIndex,
        monster.female,
        GLYPH_MON_MALE_OFF,
        GLYPH_MON_FEM_OFF,
    );
    const glyph = glyphPresentation(
        monster_class_symbol(species.mlet, state),
        species.mcolor,
        state,
        numeric_glyph_customization(logicalGlyph, state),
    );
    // display.c:578-581 passes mgendercode, which :524 read from the
    // *mimicking* monster's mon->female. The species on show is the
    // appearance's; the gender half of the range is not.
    const attr = print_glyph_attr(monsterGenderFlag(monster.female), state);
    if (attr) glyph.attr = attr;
    withLogicalGlyph(
        glyph,
        logicalGlyph,
    );
    return withMonsterAccessibility(
        glyph, monster, species, state, 'disguise',
    );
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
        // C ref: display.c display_monster()'s M_AP_FURNITURE arm (543-562).
        // makemon.c stores an S_* index in mappearance, and this is the whole
        // of what C does with it: cmap_to_glyph(sym), independently of the
        // terrain underneath. cmap_to_glyph() gives S_altar the neutral altar
        // rather than any alignment the mimic carries.
        return map_glyphinfo(
            cmap_to_glyph(monster.mappearance, state), state,
        );
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
        numeric_glyph_customization(warningLevel + GLYPH_WARNING_OFF, state),
    );
    withLogicalGlyph(glyph, warningLevel + GLYPH_WARNING_OFF);
    if (!state.a11y?.glyph_updates) return glyph;
    return withAccessibilityMetadata(
        glyph,
        'warning',
        `warning:${warningLevel}`,
        { type: 'warning', index: warningLevel },
    );
}

// C ref: display.h vobj_at() (22), the head of the floor pile at <x,y>. The
// name says "visible object", but the macro is a plain read of
// svl.level.objects[x][y]: it is a vestige of unimplemented invisible objects,
// as display.h:17-21 records, and it applies no visibility test at all.
export function vobj_at(x, y, state = game) {
    return state.level?.objects?.[x]?.[y] ?? null;
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
export function object_is_piletop(obj, state = game) {
    const next = state.level?.objects?.[obj.ox]?.[obj.oy]?.nexthere;
    return obj.where === OBJ_FLOOR
        && Boolean(next)
        && (obj.otyp !== BOULDER || next.otyp === BOULDER);
}

// ── display.h cmap glyph numbers ──
//
// The cmap half of the same number space the object macros below occupy: one
// integer per map square, resolved into a character, a colour and a set of
// glyphflags at print time by map_glyphinfo(). The cmap ranges are not one
// block. display.h splits the eleven wall symbols into five copies, one per
// dungeon branch, and lifts the five altar alignments out of the middle of
// cmap A, so a cmap index alone does not name a glyph: cmap_to_glyph() below
// picks the range and js/glyph_offsets.js holds each range's base.

// C ref: display.h enum altar_types (346-352). The order altarcolors[] and
// the GLYPH_ALTAR_OFF arm of reset_glyphmap() are both indexed by.
export const altar_unaligned = 0;
export const altar_chaotic = 1;
export const altar_neutral = 2;
export const altar_lawful = 3;
export const altar_other = 4;

// C ref: display.h enum level_walls (353-354), wallcolors[]'s index.
export const main_walls = 0;
export const mines_walls = 1;
export const gehennom_walls = 2;
export const knox_walls = 3;
export const sokoban_walls = 4;

// C ref: display.c altarcolors[] (2666-2670) over display.h enum altar_colors
// (290-311). USE_GENERAL_ALTAR_COLORS is undefined in this build, so the three
// aligned altars share CLR_GRAY and only unaligned and sanctum differ.
const altarcolors = Object.freeze([
    CLR_RED, CLR_GRAY, CLR_GRAY, CLR_GRAY, CLR_BRIGHT_MAGENTA,
]);

// C ref: display.c zapcolors[] (2661-2665) over display.h enum zap_colors
// (279-288). Indexed by the zap type dobuzz() carries, which is why C's
// comment there says "This must be the same order as used for buzz() in
// zap.c": entry n is the colour of flash_types[n]'s beam. HI_ZAP is
// CLR_BRIGHT_BLUE (color.h:55).
const zapcolors = Object.freeze([
    CLR_BRIGHT_BLUE, CLR_ORANGE, CLR_WHITE,
    CLR_BRIGHT_BLUE, CLR_BLACK, CLR_WHITE,
    CLR_GREEN, CLR_YELLOW,
]);

// C ref: display.c wallcolors[] (2673-2678). C initializes all five branches
// to defsyms[S_vwall + n].color and leaves the per-branch colours commented
// out; nothing writes the array afterwards, so every wall is CLR_GRAY.
const wallcolors = Object.freeze([
    CLR_GRAY, CLR_GRAY, CLR_GRAY, CLR_GRAY, CLR_GRAY,
]);

// C ref: display.h NO_GLYPH (548), which is MAX_GLYPH: one past the last real
// glyph, returned by cmap_to_glyph() for an index outside every cmap range.
export const NO_GLYPH = MAX_GLYPH;

// C ref: display.h GLYPH_INVISIBLE (549), an alias for GLYPH_INVIS_OFF. The
// range is one number wide -- display.h:504 puts GLYPH_DETECT_OFF one place
// above it -- so "the hero remembers an invisible monster here" is a single
// glyph rather than a species.
export const GLYPH_INVISIBLE = GLYPH_INVIS_OFF;

// C ref: display.h altar_to_glyph() (569-579). Unaligned is the default rather
// than a tested case, because AM_MASK has three bits and only four of its
// eight values are defined.
export function altar_to_glyph(amsk) {
    if ((amsk & AM_SANCTUM) === AM_SANCTUM)
        return GLYPH_ALTAR_OFF + altar_other;
    if ((amsk & AM_MASK) === AM_LAWFUL)
        return GLYPH_ALTAR_OFF + altar_lawful;
    if ((amsk & AM_MASK) === AM_NEUTRAL)
        return GLYPH_ALTAR_OFF + altar_neutral;
    if ((amsk & AM_MASK) === AM_CHAOTIC)
        return GLYPH_ALTAR_OFF + altar_chaotic;
    return GLYPH_ALTAR_OFF + altar_unaligned;
}

/**
 * C ref: display.h cmap_walls_to_glyph() (598-604). The one glyph macro that
 * is not a function of its argument alone: it reads the hero's own position
 * through In_mines(), In_hell(), Is_knox() and In_sokoban(), so the number a
 * wall gets is fixed where the square is recorded rather than where it is
 * repainted. Store what this returns; do not re-derive it at a repaint.
 *
 * The `state` argument reaches only one of the four. In_hell() takes a state
 * (js/dungeon.js), but In_mines(), Is_knox_level() and In_sokoban()
 * (js/const.js) compare the level they are handed against `game.mines_dnum`,
 * `game.knox_level` and `game.sokoban_dnum` on the module global, so this
 * answers correctly only when `state === game`. Passing a state that is not
 * the global returns main-dungeon wall numbers for Mines, Knox and Sokoban
 * walls, with no error: every production caller runs on the global, and the
 * tests that do not install theirs as the global work around it. Threading
 * those three predicates is a separate change, since js/const.js has other
 * callers.
 */
export function cmap_walls_to_glyph(cmap_idx, state = game) {
    const uz = state.u?.uz;
    return cmap_idx - S_vwall
        + (In_mines(uz) ? GLYPH_CMAP_MINES_OFF
            : In_hell(uz, state) ? GLYPH_CMAP_GEH_OFF
                : Is_knox_level(uz) ? GLYPH_CMAP_KNOX_OFF
                    : In_sokoban(uz) ? GLYPH_CMAP_SOKO_OFF
                        : GLYPH_CMAP_MAIN_OFF);
}

// C ref: display.h cmap_a_to_glyph() (613-614).
export function cmap_a_to_glyph(cmap_idx) {
    return (cmap_idx - S_ndoor) + GLYPH_CMAP_A_OFF;
}

// C ref: display.h cmap_b_to_glyph() (616-617).
export function cmap_b_to_glyph(cmap_idx) {
    return (cmap_idx - S_grave) + GLYPH_CMAP_B_OFF;
}

// C ref: display.h cmap_c_to_glyph() (619-620).
export function cmap_c_to_glyph(cmap_idx) {
    return (cmap_idx - S_digbeam) + GLYPH_CMAP_C_OFF;
}

/**
 * C ref: display.h cmap_to_glyph() (621-628). The chain that turns a defsym.h
 * index into a glyph number, in the order C tests it. S_altar takes the
 * neutral altar deliberately: an index carries no alignment, so a caller that
 * has one -- back_to_glyph() -- calls altar_to_glyph() itself instead.
 */
export function cmap_to_glyph(cmap_idx, state = game) {
    if (cmap_idx === S_stone) return GLYPH_CMAP_STONE_OFF;
    if (cmap_idx <= S_trwall) return cmap_walls_to_glyph(cmap_idx, state);
    if (cmap_idx < S_altar) return cmap_a_to_glyph(cmap_idx);
    if (cmap_idx === S_altar) return altar_to_glyph(AM_NEUTRAL);
    if (cmap_idx < S_arrow_trap + MAXTCHARS) return cmap_b_to_glyph(cmap_idx);
    if (cmap_idx <= S_goodpos) return cmap_c_to_glyph(cmap_idx);
    return NO_GLYPH;
}

// C ref: display.h trap_to_glyph() (630-631).
export function trap_to_glyph(trap, state = game) {
    return cmap_to_glyph(trap_to_defsym(trap.ttyp), state);
}

// C ref: display.h engraving_to_glyph() (633-634) over engrave.h
// engraving_to_defsym() (47-48), which reads the terrain under the engraving
// rather than anything the engraving carries.
export function engraving_to_glyph(engraving, state = game) {
    const location = state.level?.at(engraving.engr_x, engraving.engr_y);
    return cmap_to_glyph(
        location?.typ === CORR ? S_engrcorr : S_engroom, state,
    );
}

/**
 * C ref: display.h glyph_is_cmap() (723-725), the whole cmap span as one
 * contiguous range.
 *
 * The `#if 0` block directly above it (711-722) is a disjunction of the ten
 * per-range predicates, and it is not what the program compiles. The two are
 * not the same function: GLYPH_ZAP_OFF sits between GLYPH_CMAP_B_OFF and
 * GLYPH_CMAP_C_OFF in the enum (522-524), so the compiled form answers TRUE
 * for a zap glyph and the disabled one answers FALSE. glyphs.c:983 spells
 * `glyph_is_cmap(glyph) || glyph_is_cmap_zap(glyph)`, a disjunction that is
 * redundant under the compiled form and meaningful under the other, so the
 * difference was understood upstream. This transcribes the compiled form.
 */
export function glyph_is_cmap(glyph) {
    return glyph >= GLYPH_CMAP_STONE_OFF
        && glyph < GLYPH_CMAP_C_OFF + ((S_goodpos - S_digbeam) + 1);
}

// C ref: display.h glyph_is_cmap_zap() (699-700), one of the ten per-range
// predicates. It names the sub-range glyph_is_cmap() above admits along with
// every other cmap glyph, which zapdir_to_glyph() produces and
// map_glyphinfo()'s GLYPH_ZAP_OFF arm resolves.
export function glyph_is_cmap_zap(glyph) {
    return glyph >= GLYPH_ZAP_OFF && glyph < (NUM_ZAP << 2) + GLYPH_ZAP_OFF;
}

/**
 * C ref: glyphs.c glyph_to_cmap() (199-231). The inverse of cmap_to_glyph(),
 * and lossy in the two places cmap_to_glyph() is lossy: every branch's walls
 * come back as the main dungeon's indices, and all five altars come back as
 * S_altar.
 *
 * C's swallow, explosion and zap arms are omitted. No ported path produces a
 * number in any of those three ranges -- reset_glyphmap()'s arms for them are
 * unported for the same reason -- so each would be an untested inverse of an
 * absent forward direction. They fall to C's own default instead, MAXPCHARS,
 * which is the fencepost entry defsyms[] carries for exactly this.
 */
export function glyph_to_cmap(glyph) {
    if (!glyph_is_cmap(glyph)) return MAXPCHARS;
    if (glyph === GLYPH_CMAP_STONE_OFF) return S_stone;
    if (glyph < GLYPH_CMAP_A_OFF) {
        // The five wall ranges are adjacent and equally sized, so one
        // remainder covers what C spells as five separate range tests.
        return ((glyph - GLYPH_CMAP_MAIN_OFF) % ((S_trwall - S_vwall) + 1))
            + S_vwall;
    }
    if (glyph < GLYPH_ALTAR_OFF) return (glyph - GLYPH_CMAP_A_OFF) + S_ndoor;
    if (glyph < GLYPH_CMAP_B_OFF) return S_altar;
    if (glyph < GLYPH_ZAP_OFF) return (glyph - GLYPH_CMAP_B_OFF) + S_grave;
    // glyphs.c:1003-1004. The zap range holds four beam directions per
    // zap type, so the remainder recovers the direction, discarding the
    // type that zapdir_to_glyph() packed above it.
    if (glyph < GLYPH_CMAP_C_OFF)
        return ((glyph - GLYPH_ZAP_OFF) % 4) + S_vbeam;
    return (glyph - GLYPH_CMAP_C_OFF) + S_digbeam;
}

// ── display.h object glyph numbers ──
//
// C keeps one integer per map square in levl[x][y].glyph and resolves it into
// a character, a colour and a set of glyphflags at print time. The five macros
// below produce an object square's number; js/glyph_offsets.js holds the range
// bases they add, and map_glyphinfo() resolves one back.

// C ref: display.h objnum_to_glyph() (638). Unaffected by hallucination, and
// deliberately numbers CORPSE and STATUE in the plain object range, so it
// draws the generic body and the generic statue rather than the species the
// corpse_to_glyph() and statue_to_glyph() ranges carry.
export function objnum_to_glyph(onum) {
    return onum + GLYPH_OBJ_OFF;
}

// C ref: display.h corpse_to_glyph() (937-939).
export function corpse_to_glyph(obj, state = game) {
    return obj.corpsenm + (object_is_piletop(obj, state)
        ? GLYPH_BODY_PILETOP_OFF : GLYPH_BODY_OFF);
}

// C ref: display.h generic_obj_to_glyph() (940-942). The index is the object's
// class rather than its type, which is what hides an unseen potion's
// description colour behind the class colour.
export function generic_obj_to_glyph(obj, state = game) {
    return obj.oclass + (object_is_piletop(obj, state)
        ? GLYPH_OBJ_PILETOP_OFF : GLYPH_OBJ_OFF);
}

// C ref: display.h normal_obj_to_glyph() (943-945).
export function normal_obj_to_glyph(obj, state = game) {
    return obj.otyp + (object_is_piletop(obj, state)
        ? GLYPH_OBJ_PILETOP_OFF : GLYPH_OBJ_OFF);
}

// C ref: display.h statue_to_glyph() (950-961), its !Hallucination arm alone.
// The hallucinating arm draws a random monster instead of a statue and spends
// two display-RNG calls doing it; hallucinated_statue_glyph_info() above holds
// it, because the number it produces lies in the monster ranges rather than in
// the object ranges map_glyphinfo() below resolves.
export function statue_to_glyph(obj, state = game) {
    const female
        = ((obj.spe ?? 0) & CORPSTAT_GENDER) === CORPSTAT_FEMALE;
    const piletop = object_is_piletop(obj, state);
    return obj.corpsenm + (female
        ? (piletop ? GLYPH_STATUE_FEM_PILETOP_OFF : GLYPH_STATUE_FEM_OFF)
        : (piletop ? GLYPH_STATUE_MALE_PILETOP_OFF : GLYPH_STATUE_MALE_OFF));
}

// C refs: display.h glyph_is_body_piletop() (814-816) and glyph_is_body()
// (817-819). Each predicate below is called with levl[x][y].glyph, which is
// `undefined` for a square the hero remembers nothing of; every comparison
// against `undefined` is false, so an unremembered square answers no to all of
// them, which is the answer C's GLYPH_UNEXPLORED gives.
export function glyph_is_body_piletop(glyph) {
    return glyph >= GLYPH_BODY_PILETOP_OFF
        && glyph < GLYPH_BODY_PILETOP_OFF + NUMMONS;
}

export function glyph_is_body(glyph) {
    return (glyph >= GLYPH_BODY_OFF && glyph < GLYPH_BODY_OFF + NUMMONS)
        || glyph_is_body_piletop(glyph);
}

// C refs: display.h glyph_is_fem_statue_piletop() (821-823),
// glyph_is_male_statue_piletop() (824-826), glyph_is_fem_statue() (827-830),
// glyph_is_male_statue() (831-834) and glyph_is_statue() (835-836).
export function glyph_is_fem_statue_piletop(glyph) {
    return glyph >= GLYPH_STATUE_FEM_PILETOP_OFF
        && glyph < GLYPH_STATUE_FEM_PILETOP_OFF + NUMMONS;
}

export function glyph_is_male_statue_piletop(glyph) {
    return glyph >= GLYPH_STATUE_MALE_PILETOP_OFF
        && glyph < GLYPH_STATUE_MALE_PILETOP_OFF + NUMMONS;
}

export function glyph_is_fem_statue(glyph) {
    return (glyph >= GLYPH_STATUE_FEM_OFF
            && glyph < GLYPH_STATUE_FEM_OFF + NUMMONS)
        || glyph_is_fem_statue_piletop(glyph);
}

export function glyph_is_male_statue(glyph) {
    return (glyph >= GLYPH_STATUE_MALE_OFF
            && glyph < GLYPH_STATUE_MALE_OFF + NUMMONS)
        || glyph_is_male_statue_piletop(glyph);
}

export function glyph_is_statue(glyph) {
    return glyph_is_male_statue(glyph) || glyph_is_fem_statue(glyph);
}

// C refs: display.h glyph_is_normal_generic_obj() (839-840),
// glyph_is_piletop_generic_obj() (841-843) and glyph_is_generic_object()
// (844-846). C's comment: generic objects sit after strange object
// (GLYPH_OBJ_OFF) and before the other objects (GLYPH_OBJ_OFF +
// FIRST_OBJECT), which is the block of class placeholder rows objects[] opens
// with.
export function glyph_is_normal_generic_obj(glyph) {
    return glyph > GLYPH_OBJ_OFF
        && glyph < GLYPH_OBJ_OFF + FIRST_OBJECT - 1;
}

export function glyph_is_piletop_generic_obj(glyph) {
    return glyph > GLYPH_OBJ_PILETOP_OFF
        && glyph < GLYPH_OBJ_PILETOP_OFF + FIRST_OBJECT - 1;
}

export function glyph_is_generic_object(glyph) {
    assertGlyphNumber(glyph, 'glyph_is_generic_object');
    return glyph_is_normal_generic_obj(glyph)
        || glyph_is_piletop_generic_obj(glyph);
}

// C refs: display.h glyph_is_normal_piletop_obj() (847-850) and
// glyph_is_normal_object() (851-855). The two are not mirror images: the
// non-piletop range admits its FIRST_OBJECT - 1 entry with `>=` and the
// piletop range excludes it with `>`. Both are transcribed as written. The
// entry is objects[VENOM_CLASS], which obj_is_generic() never selects -- it
// takes only potions, gems and spellbooks -- so nothing this port produces
// lands on the asymmetry.
export function glyph_is_normal_piletop_obj(glyph) {
    return glyph === GLYPH_OBJ_PILETOP_OFF
        || (glyph > GLYPH_OBJ_PILETOP_OFF + FIRST_OBJECT - 1
            && glyph < GLYPH_OBJ_PILETOP_OFF + NUM_OBJECTS);
}

export function glyph_is_normal_object(glyph) {
    return glyph === GLYPH_OBJ_OFF
        || (glyph >= GLYPH_OBJ_OFF + FIRST_OBJECT - 1
            && glyph < GLYPH_OBJ_OFF + NUM_OBJECTS)
        || glyph_is_normal_piletop_obj(glyph);
}

// C ref: display.h glyph_is_object() (877-879), the union of the four object
// families. dogmove.c dog_move() asks it of levl[x][y].glyph, which is what
// js/dogmove.js passes.
//
// This and glyph_is_generic_object() above are the two exported entry points
// into the range predicates, so the argument check lives here. Both took a map
// location before this port stored a number, and both would answer a plain
// `false` for one, since every comparison against an object is false. That
// silence is the wrong answer rather than a missing one, so anything that is
// neither a number nor the `undefined` of an unremembered square is refused
// here, in the shape map_glyphinfo() below already uses.
function assertGlyphNumber(glyph, caller) {
    if (glyph !== undefined && !Number.isInteger(glyph)) {
        throw new TypeError(
            `${caller}() takes a glyph number, not ${typeof glyph === 'object'
                ? JSON.stringify(glyph) : glyph}`,
        );
    }
}

export function glyph_is_object(glyph) {
    assertGlyphNumber(glyph, 'glyph_is_object');
    return glyph_is_normal_object(glyph) || glyph_is_generic_object(glyph)
        || glyph_is_statue(glyph) || glyph_is_body(glyph);
}

// C ref: display.h:995-1013, the glyphflags reset_glyphmap() encodes and
// map_glyphinfo() passes on. Only the bits the object, monster and
// invisible-monster arms raise are spelled here; the rest belong with the arms
// that raise them, which are not ported.
//
// MG_INVIS is write-only in the tty window port: reset_glyphmap() (3035) is
// its only writer and `grep -rn MG_INVIS src/ include/ win/` finds no reader,
// so tty_print_glyph()'s attribute chain never sees it and the marker draws
// with ATR_NONE. It is carried because C carries it.
export const MG_CORPSE = 0x00002;
export const MG_INVIS = 0x00004;
export const MG_DETECT = 0x00008;
export const MG_PET = 0x00010;
export const MG_RIDDEN = 0x00020;
export const MG_STATUE = 0x00040;
export const MG_OBJPILE = 0x00080;
export const MG_BW_LAVA = 0x00100;
// display.h:1005-1008 gives these three the same value as each other, with the
// note that MG_BW_SINK "may become a distinct flag" some day. They are spelled
// separately because the arms that raise them are separate.
export const MG_BW_ICE = 0x00200;
export const MG_BW_SINK = 0x00200;
export const MG_BW_ENGR = 0x00200;
export const MG_NOTHING = 0x00400;
export const MG_MALE = 0x01000;
export const MG_FEMALE = 0x02000;

/**
 * C ref: win/tty/wintty.c tty_print_glyph() (3923-3937), the ordered chain
 * that picks at most one attribute for a printed map cell. C runs it on every
 * print, from the glyphflags glyphmap[] holds, which is why toggling
 * 'hilite_pile' and repainting changes a remembered pile that no draw has
 * touched since.
 *
 * C's chain has three arms and this holds the last two, in C's order. The
 * `bkglyphinfo->framecolor` arm above them needs iflags.bgcolors, which no
 * ported path sets, so it has no term here. Order is the whole point of the
 * function: a female pet under 'hilite_pet' takes iflags.wc2_petattr, and the
 * same pet with 'hilite_pet' off falls through to the inverse arm and takes
 * ATR_INVERSE from 'wizmgender'.
 *
 * Every caller supplies the glyphflags reset_glyphmap()'s arm for its glyph
 * raises. map_glyphinfo() derives them from a stored glyph number; the monster
 * and hero presentations derive them from the live monster instead, because
 * this port numbers no monster range and needs none. C's own comment at
 * detect.c:2205-2209 states the rule its writers keep: levl[x][y].glyph never
 * holds a monster, only the invisible-monster constant map_invisible()
 * (display.c:382) stores in its place. So a repaint has to re-derive every
 * monster cell whatever the port does, and docrt_flags() (display.c:1709) is
 * where C does it, by re-running newsym() over the level.
 */
function print_glyph_attr(glyphflags, state) {
    if ((glyphflags & MG_PET) && state.iflags?.wc_hilite_pet)
        return state.iflags.wc2_petattr ?? ATR_INVERSE;
    if (state.iflags?.wc_inverse === false) return ATR_NONE;
    if (((glyphflags & MG_OBJPILE) && state.iflags?.hilite_pile)
        || ((glyphflags & MG_FEMALE) && state.wizard
            && state.iflags?.wizmgender)
        || (glyphflags & (MG_DETECT | MG_BW_LAVA | MG_BW_ICE | MG_BW_SINK
                          | MG_BW_ENGR))) {
        return ATR_INVERSE;
    }
    return ATR_NONE;
}

// C ref: display.h mon_to_glyph() (554-556) and its four siblings, each of
// which picks the male or female half of its glyph range from mon->female,
// and display.c reset_glyphmap()'s six monster arms (2986-3065), which turn
// that choice back into MG_MALE or MG_FEMALE. The two are a round trip, so a
// port that stores no monster glyph number reads mon->female directly.
function monsterGenderFlag(female) {
    return female ? MG_FEMALE : MG_MALE;
}

// The G_* customization names display.h's five altar glyphs carry, in
// altar_types order. glyphs.c apply_customizations() keys every customization
// by glyph number, so a name is a function of the number and nothing has to
// travel with a resolved presentation to recover it.
export const ALTAR_CUSTOMIZATION_NAMES = Object.freeze([
    'G_unaligned_altar', 'G_chaotic_altar', 'G_neutral_altar',
    'G_lawful_altar', 'G_altar_other',
]);

// The glyph ranges map_glyphinfo() has an arm for: GLYPH_NOTHING, every object
// range, and every cmap range but the zap beams'. This is the port's own
// assertion rather than a ported predicate, and it is deliberately narrower
// than glyph_is_cmap(): that macro's contiguous span admits the zap range,
// which zapdir_to_glyph() would have to produce and no ported path does.
// GLYPH_UNEXPLORED is left out on a different footing. mklev.c
// clear_level_structures() (852) is what fills map memory with it; display.c
// clear_glyph_buffer() (2107) fills the glyph buffer, which is a separate
// array. This port encodes "nothing remembered here" as
// `remembered_glyph === undefined` instead, and newsym()'s
// `else if (loc.remembered_glyph)` guard stands in for C's show_mem of the
// unexplored glyph, so no path produces the number and this refuses it.
function mapGlyphinfoResolves(glyph) {
    return glyph === GLYPH_NOTHING_OFF
        || glyph === GLYPH_INVISIBLE
        || glyph_is_object(glyph)
        || glyph_is_cmap(glyph);
}

/**
 * C refs: display.c reset_glyphmap() (2739-3086), its object and cmap arms
 * with the closing colour clamp at 3072-3078; and display.c map_glyphinfo()
 * (2594-2655), which copies the resolved entry and turns sym.symidx into the
 * ttychar the window port prints.
 *
 * C rebuilds glyphmap[] for every glyph at once and reads the entry back at
 * print time. This port resolves one glyph on demand, which is the same thing
 * for every path a running game takes: docrt() re-runs newsym() over the whole
 * map, so the repaint after an option change re-resolves every square through
 * the values then in force, exactly as C's rebuilt table does.
 *
 * C needs no guard here: reset_glyphmap() walks the whole enum and every
 * number lands in some arm. This port resolves a subset, so the guard names
 * that subset -- see mapGlyphinfoResolves() below. C's chain is a single
 * descending run and the two families interleave within it: the eight object
 * arms straddle the cmap arms, with GLYPH_OBJ_OFF (2968) and GLYPH_BODY_OFF
 * (3004) below every one of them. The arms C has in between -- warning,
 * explosion and swallow -- have no ported producer, and the guard's bounds
 * stand in for the ones they would otherwise have supplied.
 *
 * Two of C's terms are absent because no ported path can make them true.
 * has_rogue_color needs gc.currentgraphics == ROGUESET with IBM symbol
 * handling, and the GMAP_ROGUELEVEL clamp needs Is_rogue_level(&u.uz); no
 * ported path reaches the rogue level, and js/display.js reglyph_darkroom()
 * already refuses the level for the same reason. The clamp's remaining term,
 * !iflags.use_color, is recorderMapColor()'s mapColorEnabled() test, which
 * also carries C's cmap_color()/wall_color()/altar_color() macros: each is
 * `iflags.use_color ? <table>[n] : NO_COLOR`, so the arms below read the table
 * directly and let the clamp answer for the option.
 */
export function map_glyphinfo(glyph, state = game) {
    if (!mapGlyphinfoResolves(glyph)) {
        throw new TypeError(
            `map_glyphinfo() has no arm for glyph ${glyph}`,
        );
    }
    let offset;
    let symbol;
    let color;
    let glyphflags = 0;
    // The defsym index the arm drew from, for the arms that drew from one.
    let cmap = null;
    let customizationName = null;
    if (glyph === GLYPH_NOTHING_OFF) {
        // display.c:2774-2777, the first arm of C's chain. The square is
        // known to hold nothing worth drawing, so it draws the blank the
        // symbol set gives SYM_NOTHING. reglyph_darkroom() is the ported
        // writer; display.c:1846 reads the number back.
        symbol = misc_symbol(SYM_NOTHING, state);
        color = NO_COLOR;
        glyphflags = MG_NOTHING;
    } else if ((offset = glyph - GLYPH_STATUE_FEM_PILETOP_OFF) >= 0) {
        symbol = statueSymbol(offset, state);
        color = statueColor(state);
        glyphflags = MG_STATUE | MG_FEMALE | MG_OBJPILE;
    } else if ((offset = glyph - GLYPH_STATUE_MALE_PILETOP_OFF) >= 0) {
        symbol = statueSymbol(offset, state);
        color = statueColor(state);
        glyphflags = MG_STATUE | MG_MALE | MG_OBJPILE;
    } else if ((offset = glyph - GLYPH_BODY_PILETOP_OFF) >= 0) {
        symbol = corpseSymbol(state);
        color = state.mons?.[offset]?.mcolor ?? NO_COLOR;
        glyphflags = MG_CORPSE | MG_OBJPILE;
    } else if ((offset = glyph - GLYPH_OBJ_PILETOP_OFF) >= 0) {
        symbol = objectSymbol(offset, state);
        color = state.objects?.[offset]?.oc_color ?? NO_COLOR;
        glyphflags = MG_OBJPILE;
    } else if ((offset = glyph - GLYPH_STATUE_FEM_OFF) >= 0) {
        symbol = statueSymbol(offset, state);
        color = statueColor(state);
        glyphflags = MG_STATUE | MG_FEMALE;
    } else if ((offset = glyph - GLYPH_STATUE_MALE_OFF) >= 0) {
        symbol = statueSymbol(offset, state);
        color = statueColor(state);
        glyphflags = MG_STATUE | MG_MALE;
    } else if ((offset = glyph - GLYPH_CMAP_C_OFF) >= 0) {
        // display.c:2884-2890. region.c's gas clouds are the ported producer.
        cmap = S_digbeam + offset;
        color = CMAP_COLORS[cmap];
    } else if ((offset = glyph - GLYPH_ZAP_OFF) >= 0) {
        // display.c:2877-2883. zapdir_to_glyph() below packs the beam
        // direction into the low two bits and the zap type above them, so the
        // mask recovers the S_vbeam..S_rslant offset and the shift recovers
        // zapcolors[]'s index.
        cmap = S_vbeam + (offset & 0x3);
        color = zapcolors[offset >> 2];
    } else if ((offset = glyph - GLYPH_CMAP_B_OFF) >= 0) {
        // display.c:2903-2929.
        cmap = S_grave + offset;
        color = CMAP_COLORS[cmap];
        glyphflags = cmapBlackAndWhiteFlags(cmap, state);
        if (cmap === S_fountain) customizationName = 'G_fountain';
    } else if ((offset = glyph - GLYPH_ALTAR_OFF) >= 0) {
        // display.c:2930-2937. Every altar draws S_altar; only the colour and
        // the customization separate the five alignments.
        cmap = S_altar;
        color = altarcolors[offset];
        customizationName = ALTAR_CUSTOMIZATION_NAMES[offset];
    } else if ((offset = glyph - GLYPH_CMAP_A_OFF) >= 0) {
        // display.c:2938-2959.
        cmap = S_ndoor + offset;
        color = CMAP_COLORS[cmap];
        const sym = cmap_symbol_byte(cmap, state);
        if (cmap === S_litcorr && sym === cmap_symbol_byte(S_corr, state)) {
            // A lit corridor drawn with the dark corridor's byte would be
            // invisible as a distinction; C brightens it instead.
            color = CLR_WHITE;
        } else if (cmap === S_engrcorr
                   && (sym === cmap_symbol_byte(S_corr, state)
                       || sym === cmap_symbol_byte(S_litcorr, state))) {
            glyphflags = MG_BW_ENGR;
        }
    } else if ((offset = glyph - GLYPH_CMAP_SOKO_OFF) >= 0) {
        // display.c:2960-2975, the four branch wall sets. Each draws the same
        // eleven symbols; only wallcolors[] separates them, and every entry of
        // that table holds CLR_GRAY.
        cmap = S_vwall + offset;
        color = wallcolors[sokoban_walls];
    } else if ((offset = glyph - GLYPH_CMAP_KNOX_OFF) >= 0) {
        cmap = S_vwall + offset;
        color = wallcolors[knox_walls];
    } else if ((offset = glyph - GLYPH_CMAP_GEH_OFF) >= 0) {
        cmap = S_vwall + offset;
        color = wallcolors[gehennom_walls];
    } else if ((offset = glyph - GLYPH_CMAP_MINES_OFF) >= 0) {
        cmap = S_vwall + offset;
        color = wallcolors[mines_walls];
    } else if ((offset = glyph - GLYPH_CMAP_MAIN_OFF) >= 0) {
        // display.c:2976-2981.
        cmap = S_vwall + offset;
        color = wallcolors[main_walls];
    } else if (glyph - GLYPH_CMAP_STONE_OFF >= 0) {
        // display.c:2982-2984. One glyph, so C uses SYM_OFF_P by itself.
        cmap = S_stone;
        color = CMAP_COLORS[cmap];
    } else if ((offset = glyph - GLYPH_OBJ_OFF) >= 0) {
        symbol = objectSymbol(offset, state);
        color = state.objects?.[offset]?.oc_color ?? NO_COLOR;
    } else if ((offset = glyph - GLYPH_BODY_OFF) >= 0) {
        symbol = corpseSymbol(state);
        color = state.mons?.[offset]?.mcolor ?? NO_COLOR;
        glyphflags = MG_CORPSE;
    } else {
        // display.c:3029-3035, the GLYPH_INVIS_OFF arm. It sits below every
        // object and cmap arm in C's descending chain and above the pet arms,
        // which have no port, so the guard above leaves it the only glyph that
        // reaches here. invis_color() is `color = NO_COLOR` (display.c:2687),
        // one of the two arms whose colour never varies.
        symbol = misc_symbol(SYM_INVISIBLE, state);
        color = NO_COLOR;
        glyphflags = MG_INVIS;
    }
    if (cmap !== null) {
        symbol = cmap_symbol(cmap, state);
    }
    const presentation = glyphPresentation(
        symbol,
        color,
        state,
        numeric_glyph_customization(glyph, state),
    );
    const attr = print_glyph_attr(glyphflags, state);
    if (attr) presentation.attr = attr;
    // The glyph number itself, which is what C stores in levl[x][y].glyph.
    // Non-enumerable, so that every existing copy of a presentation record --
    // the display buffer, map memory, the browser projection -- keeps the
    // shape it already had.
    Object.defineProperty(presentation, 'glyph', { value: glyph });
    if (!state.a11y?.glyph_updates) return presentation;
    // The GLYPH_NOTHING arm draws from no defsym index, so it takes its
    // accessibility kind directly. js/startup_a11y.js:535 tests
    // `oldKind === 'nothing'`, which is its transcription of display.c
    // show_glyph()'s disjunct on the old glyph; without this the arm reports
    // no kind, the reader falls back to 'other', and that disjunct can never
    // fire for a square the repair blanked.
    if (glyph === GLYPH_NOTHING_OFF) {
        return withAccessibilityMetadata(
            presentation, 'nothing', 'nothing', { type: 'nothing' },
        );
    }
    if (cmap === null) return presentation;
    return withCmapAccessibility(presentation, cmap, customizationName);
}

// display.c reset_glyphmap()'s two statue arms: mons[offset].mlet + SYM_OFF_M
// for the symbol and obj_color(STATUE) for the colour, so every statue takes
// the statue object's colour and the depicted species' class letter.
function statueSymbol(mnum, state) {
    const species = state.mons?.[mnum];
    if (!species) {
        throw new Error(
            'statue display requires the complete monster catalog',
        );
    }
    return monster_class_symbol(species.mlet, state);
}

function statueColor(state) {
    return state.objects?.[STATUE]?.oc_color ?? NO_COLOR;
}

// display.c reset_glyphmap()'s two body arms:
// objects[CORPSE].oc_class + SYM_OFF_O. The class carries the symbol; the
// species only chooses the colour, through mon_color(offset).
function corpseSymbol(state) {
    return object_class_symbol(FOOD_CLASS, state, CORPSE);
}

// display.c reset_glyphmap()'s two object arms:
// objects[offset].oc_class + SYM_OFF_O, redirected to SYM_BOULDER + SYM_OFF_X
// when the offset is BOULDER. `offset` is an otyp for an ordinary object and
// an oclass for a generic one, and objects[] carries a class placeholder row
// at each class index, so one lookup answers both.
function objectSymbol(otyp, state) {
    if (otyp === BOULDER) return misc_symbol(SYM_BOULDER, state);
    const type = state.objects?.[otyp];
    if (!type) {
        throw new Error(
            'object display requires the complete object catalog',
        );
    }
    return object_class_symbol(type.oc_class, state, otyp);
}

/**
 * C ref: display.h obj_to_glyph() (963-968) with Hallucination false, followed
 * by the map_glyphinfo() resolution of the number it returns. Its four macros
 * number a statue by corpsenm and gender (950-961), a corpse by corpsenm
 * (937-939), a generic object by oclass (940-942) and every other object by
 * otyp (943-945), each in its own range or its pile-top range. Two objects
 * share a glyph number only when all of that agrees, which is what
 * same_remembered_glyph() relies on for lock.c:584.
 *
 * obj_to_glyph() below routes the hallucinating cases elsewhere, so the STATUE
 * test here reaches statue_to_glyph()'s !Hallucination arm only.
 */
export function object_glyph_info(obj, state = game) {
    if (!obj) throw new TypeError('object_glyph_info requires an object');
    const glyph = map_glyphinfo(
        obj.otyp === STATUE
            ? statue_to_glyph(obj, state)
            : obj.otyp === CORPSE
                ? corpse_to_glyph(obj, state)
                : object_is_generic(obj)
                    ? generic_obj_to_glyph(obj, state)
                    : normal_obj_to_glyph(obj, state),
        state,
    );
    if (!state.a11y?.glyph_updates) return glyph;
    return withObjectAccessibility(glyph, obj, state);
}

// The accessibility sidecars object_glyph_info() adds, kept apart from the
// glyph resolution because they describe the object rather than the number:
// glyph_to_obj() would recover an ordinary object's otyp from the number, but
// not a zeroobj mimic's mappearance.
function withObjectAccessibility(glyph, obj, state) {
    const generic = object_is_generic(obj);
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

// C ref: display.h obj_to_glyph() (963-968) over statue_to_glyph() (950-961)
// and random_obj_to_glyph() (933-936). What one object looks like on screen
// right now: the statue test comes first and carries its own hallucination
// arm, so a hallucinated statue draws a random monster rather than a random
// object. Every branch consumes the display RNG exactly as the macro does.
//
// C returns the glyph number and leaves the resolution to whoever prints it;
// this returns the resolved presentation, because both consumers take one --
// show_glyph_cell(), the port's glyph buffer, and tmp_at()'s frame stack in
// js/zap.js. The number is still there, non-enumerable, on every presentation
// map_glyphinfo() resolves. The hallucinating arms are the reason this cannot
// simply be map_glyphinfo(number): a hallucinated statue's number is in the
// monster ranges, which map_glyphinfo() does not resolve.
export function obj_to_glyph(obj, state = game, displayRandom = undefined) {
    if (obj.otyp === STATUE) {
        return heroHallucinating(state)
            ? hallucinated_statue_glyph_info(state, displayRandom)
            : object_glyph_info(obj, state);
    }
    return heroHallucinating(state)
        ? random_object_glyph_info(state, displayRandom)
        : object_glyph_info(obj, state);
}

// C ref: display.c map_object(). Return the transient presentation separately
// from levl[x][y].glyph because hallucinated statues use a random monster on
// screen but a separately drawn random object in map memory. The shown half is
// obj_to_glyph() itself, which is what C passes to show_glyph() here.
function mappedObjectGlyphInfo(obj, state) {
    const shown = obj_to_glyph(obj, state);
    if (obj.otyp !== STATUE || !heroHallucinating(state))
        return { shown, remembered: shown };
    // map_object() gates this memory-only draw independently from its caller's
    // later decision to persist remembered output. The shown statue glyph has
    // already consumed every draw required when hero memory is disabled.
    const remembered = state.level?.flags?.hero_memory
        ? random_object_glyph_info(state) : shown;
    return { shown, remembered };
}

// ── display.c back_to_glyph ──
/**
 * C ref: display.c back_to_glyph() (2286-2427). The glyph number for the
 * terrain at <x,y>, ignoring everything standing on it. Every arm ends in one
 * cmap index and the tail runs it through cmap_to_glyph(); the altar arm is
 * the exception, because an altar's alignment picks one of five glyph numbers
 * that no single index can name, so it sets bypass_glyph and its `idx` is
 * dead. C's comment says so: "not really used".
 *
 * The dungeon branch enters here rather than at the repaint, through
 * cmap_walls_to_glyph(), so a wall recorded in the Mines keeps the Mines'
 * number after the hero leaves.
 */
export function back_to_glyph(x, y, state = game) {
    const ptr = state.level?.at(x, y);
    let idx;
    let bypass_glyph = NO_GLYPH;
    const typ = ptr.typ;
    if (WALL_TYPES.has(typ)) {
        // C's SDOOR case falls through to the ten wall cases unless the
        // secret door hides a tree, so the two share one arm here too.
        idx = typ === SDOOR && (ptr.arboreal_sdoor || ptr.candig)
            ? S_tree
            : ptr.seenv ? wall_angle(ptr) : S_stone;
        return cmap_to_glyph(idx, state);
    }

    switch (typ) {
    case SCORR:
    case STONE:
        idx = state.level?.flags?.arboreal ? S_tree : S_stone;
        break;
    case ROOM:
        idx = S_room;
        break;
    case CORR:
        idx = (ptr.waslit || state.flags?.lit_corridor) ? S_litcorr : S_corr;
        break;
    case IRONBARS:
        idx = S_bars;
        break;
    case TREE:
        idx = S_tree;
        break;
    case POOL:
    case MOAT:
        idx = S_pool;
        break;
    case STAIRS: {
        const stairway = stairway_at(x, y, state);
        const down = Boolean(ptr.ladder & LA_DOWN);
        idx = known_branch_stairs(stairway, state)
            ? down ? S_brdnstair : S_brupstair
            : down ? S_dnstair : S_upstair;
        break;
    }
    case LADDER: {
        const stairway = stairway_at(x, y, state);
        const down = Boolean(ptr.ladder & LA_DOWN);
        idx = known_branch_stairs(stairway, state)
            ? down ? S_brdnladder : S_brupladder
            : down ? S_dnladder : S_upladder;
        break;
    }
    case FOUNTAIN:
        idx = S_fountain;
        break;
    case SINK:
        idx = S_sink;
        break;
    case ALTAR:
        idx = S_altar; /* not really used */
        // struct rm aliases altarmask and flags; new level generation writes
        // flags and older callers filled altarmask.
        bypass_glyph = altar_to_glyph(ptr.altarmask ?? ptr.flags ?? 0);
        break;
    case GRAVE:
        idx = S_grave;
        break;
    case THRONE:
        idx = S_throne;
        break;
    case LAVAPOOL:
        idx = S_lava;
        break;
    case LAVAWALL:
        idx = S_lavawall;
        break;
    case ICE:
        idx = S_ice;
        break;
    case AIR:
        idx = S_air;
        break;
    case CLOUD:
        idx = S_cloud;
        break;
    case WATER:
        idx = S_water;
        break;
    case DOOR:
        // struct rm aliases flags and doormask, as it does for altarmask.
        if (ptr.flags || ptr.doormask) {
            const doormask = ptr.flags || ptr.doormask;
            if (doormask & D_BROKEN) idx = S_ndoor;
            else if (doormask & D_ISOPEN) {
                idx = ptr.horizontal ? S_hodoor : S_vodoor;
            } else idx = ptr.horizontal ? S_hcdoor : S_vcdoor;
        } else idx = S_ndoor;
        break;
    case DBWALL:
        idx = ptr.horizontal ? S_hcdbridge : S_vcdbridge;
        break;
    case DRAWBRIDGE_UP:
        switch (drawbridgeMask(ptr) & DB_UNDER) {
        case DB_MOAT:
            idx = S_pool;
            break;
        case DB_LAVA:
            idx = S_lava;
            break;
        case DB_ICE:
            idx = S_ice;
            break;
        case DB_FLOOR:
            idx = S_room;
            break;
        default:
            // C diagnoses the invalid underlay with impossible() and still
            // uses room floor, so callers always receive a drawable glyph.
            idx = S_room;
            break;
        }
        break;
    case DRAWBRIDGE_DOWN:
        idx = ptr.horizontal ? S_hodbridge : S_vodbridge;
        break;
    default:
        // C's impossible() arm, which also settles on room floor.
        idx = S_room;
        break;
    }

    return bypass_glyph !== NO_GLYPH ? bypass_glyph : cmap_to_glyph(idx, state);
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
    for (const field of ['glyph', 'a11yIdentity', 'a11ySubject']) {
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

// C ref: display.c glyph_at() (2478-2482). Read the logical number from the
// transient glyph buffer rather than levl[x][y].glyph, which is only map
// memory. The out-of-bounds fallback is C's room glyph; callers may ask about
// column zero even though isok() excludes it from ordinary map movement.
export function glyph_at(x, y, state = game) {
    if (x < 0 || y < 0 || x >= COLNO || y >= ROWNO)
        return cmap_to_glyph(S_room, state);
    return state.level?.at(x, y)?.disp_glyph?.glyph ?? GLYPH_UNEXPLORED_OFF;
}

/**
 * Convert a live glyph-presentation record into the persistent levl glyph
 * record used by map memory.
 *
 * Every layer now stores what C stores. levl[x][y].glyph is one integer, and
 * the character, colour and attribute are re-derived from it by
 * map_glyphinfo() at every draw, which is what lets a repaint after an option
 * change draw a remembered square under the values then in force rather than
 * the ones it was recorded under. Presentations that carry no number therefore
 * do not belong in map memory, and this refuses one rather than storing it.
 *
 * The two accessibility sidecars ride along because they describe what the
 * square holds rather than how it is drawn: js/startup_a11y.js reads
 * a11ySubject straight off the remembered record to name a mimic or a hider,
 * and a glyph number alone cannot recover a zeroobj mimic's mappearance. They
 * stay non-enumerable so that every existing copy of a remembered record keeps
 * the shape it already had.
 */
export function remembered_glyph_from_presentation(glyph) {
    if (!Number.isInteger(glyph?.glyph)) {
        throw new TypeError(
            'remembered glyph conversion requires a resolved glyph number',
        );
    }
    const remembered = { glyph: glyph.glyph };
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

/**
 * What to draw for a square the hero only remembers: C's
 * show_glyph(x, y, levl[x][y].glyph) at newsym()'s show_mem label
 * (display.c:1094-1095), with this port's resolution step made explicit
 * because show_glyph_cell() takes a presentation rather than a number.
 */
export function remembered_glyph_presentation(remembered, state = game) {
    return map_glyphinfo(remembered.glyph, state);
}

/**
 * C ref: lock.c pick_lock() (579, 584), which holds `int oldglyph =
 * door->glyph` across a feel_location() call and asks whether it changed. C
 * compares two glyph numbers with `!=`; this port wraps each number in a fresh
 * record on every map-memory write, so `!==` would answer "changed" for a
 * square feel_location() left exactly as it found it.
 *
 * Compare the numbers instead, which is C's own comparison.
 */
export function same_remembered_glyph(before, after) {
    if (before === after) return true;
    if (!before || !after) return false;
    return before.glyph === after.glyph;
}

// C ref: display.c feel_location() (736-905), the branch taken by a hero who
// can reach the floor. Two ported callers reach it, and one of them twice:
//
//   hack.c test_move() calls it from its obstructed arm (js/hack.js, the
//     IS_OBSTRUCTED branch), where the square is stone or a wall, and again
//     from its testdiag arm (js/hack.js, the blocksDiagonalDoorwayEntry()
//     branch), where the square is a DOOR that closed_door() has already
//     rejected and doorless_door() answers FALSE for -- an open doorway,
//     which can hold a floor object, and whose background arm draws the door
//     rather than wall or stone. Both calls need a blind hero in DO_MOVE mode.
//   lock.c pick_lock():583 calls it for any hero who has named an adjacent
//     square holding no door, who may be sighted and may be pointing at room
//     floor, an object, a seen trap or a felt engraving.
//
// So every layer _map_location() dispatches on is live here; the terrain arm
// is not the only one a walking hero can reach.
//
// Three blocks stop rather than run, and no running game can reach any of
// them: the Underwater return (769-771), the Levitation Rules (776-858) and
// the Punished bc_felt work (865-891). js/detect.js:255-283 enumerates the
// single writer of each of the four states behind them, and the guard below
// pins all four terms. They stay bare Errors for the reason recorded there.
//
// C's comment says the square is the hero's own or one of the eight adjacent
// to it. This asserts that instead of assuming it, because the hero's own
// square would additionally need display_self() and neither caller passes it.
export function feel_location(x, y, state = game) {
    if (state !== game) {
        throw new Error(
            'feel_location requires the active display state',
        );
    }
    if (!isok(x, y)) return;
    const location = state.level?.at(x, y);
    if (!location) return;
    // display.c:763-767. An accurate memory of an invisible monster is left
    // alone so that searching does not rediscover it every turn.
    if (glyph_is_invisible(location.remembered_glyph?.glyph)
        && m_at(x, y, state)) return;
    // display.c:902-905 finishes by drawing a monster the hero senses on top
    // of everything else, through display_monster(), which this port has only
    // as newsym()'s inlined arms. sensemon() needs telepathy, monster
    // detection or a warning match. js/lock.js pick_lock() cannot supply one,
    // because its m_at() refusal stops for any monster at all; test_move() can
    // in principle, since hack.c domove_core() falls through to it with a pet
    // it neither attacked nor displaced still standing on the square. The test
    // is hoisted above every write below so that the stop leaves the map
    // exactly as it found it; C runs it last, after the writes.
    const monster = u_at(x, y, state) ? null : m_at(x, y, state);
    if (monster && sensesMonster(monster, state)) {
        throw new UnsupportedMapMemoryError(
            'feeling a square that holds a sensed monster',
        );
    }
    const dx = x - state.u.ux;
    const dy = y - state.u.uy;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) {
        throw new Error(
            'feel_location subset requires an adjacent square',
        );
    }
    if (!can_reach_floor(false, state)
        || state.u.uinwater || state.uball || state.uchain) {
        throw new Error(
            'feel_location reached an unsupported tactile floor state',
        );
    }
    // display.c:774, set_seenv(), which indexes hero.y - target.y rather than
    // this function's target-relative dy.
    location.seenv = (location.seenv ?? 0)
        | seenv_matrix[1 - dy][dx + 1];

    // display.c:859-860.
    const engraving = engr_at(x, y, state);
    if (engraving && engr_can_be_felt(engraving)) engraving.erevealed = 1;

    _map_location(x, y, 1, state);

    // display.c:893-900. Floor spaces are dark if unlit, corridors are dark if
    // unlit. C assigns levl[x][y].glyph directly here rather than through
    // map_background(), so this write ignores hero_memory exactly as C does.
    //
    // The first arm is what lock.c:584 observes: with 'dark_room' and colour
    // both on, a lit room square the hero already remembers moves from S_room
    // to S_darkroom, and only the glyph number says so, because
    // reglyph_darkroom() has made the two draw the same byte.
    const darkroom = Boolean(state.flags?.dark_room);
    const remembered = location.remembered_glyph?.glyph;
    if (location.typ === ROOM
        && remembered === cmap_to_glyph(S_room, state)
        && (!location.waslit || (darkroom && state.iflags?.wc_color))) {
        showRememberedCmap(
            x, y, darkroom ? S_darkroom : S_stone, state,
        );
    } else if (location.typ === CORR
               && remembered === cmap_to_glyph(S_litcorr, state)
               && !location.waslit) {
        showRememberedCmap(x, y, S_corr, state);
    }
}

// The shape C writes as `show_glyph(x, y, lev->glyph = cmap_to_glyph(idx))`:
// one cmap index becomes the square's memory and its next draw at once. Two
// places use it -- feel_location()'s tail and newsym()'s out-of-sight
// correction -- and both write map memory directly rather than through
// map_background(), so neither consults level.flags.hero_memory. Each has
// already made its own hero_memory decision by the time it gets here.
function showRememberedCmap(x, y, cmap, state) {
    const glyph = map_glyphinfo(cmap_to_glyph(cmap, state), state);
    state.level.at(x, y).remembered_glyph
        = remembered_glyph_from_presentation(glyph);
    show_glyph_cell(x, y, glyph);
}

// C's bare `levl[x][y].glyph = <number>`, with no draw beside it:
// unmap_object() writes two and reglyph_darkroom() five.
function rememberedGlyphNumber(glyph, state) {
    return remembered_glyph_from_presentation(map_glyphinfo(glyph, state));
}

// The same write from a cmap index, which is how most of those callers spell
// it: `levl[x][y].glyph = cmap_to_glyph(idx)`.
function rememberedCmap(cmap, state) {
    return rememberedGlyphNumber(cmap_to_glyph(cmap, state), state);
}

// C ref: display.c _map_location() (448-472), the macro map_location() wraps.
// Puts whatever is not alive at <x,y> into map memory, and onto the screen
// when `show` is set.
//
// The engraving arm is engravingGlyph(), which already folds in
// spot_shows_engravings() and the erevealed test, so it answers non-null
// exactly where C's third condition holds; the memory and screen writes below
// it are map_engraving()'s two statements.
function _map_location(x, y, show, state) {
    const location = state.level?.at(x, y);
    if (!location) return;
    const covered = floorLayersCovered(location, state);
    const object = covered ? null : vobj_at(x, y, state);
    const trap = covered ? null : t_at(x, y, state);
    const engraving = covered
        ? null : engravingGlyph(engr_at(x, y, state), location, state);
    if (object) {
        map_object(object, show, state);
    } else if (trap?.tseen) {
        map_trap(trap, show, state);
    } else if (engraving) {
        if (state.level?.flags?.hero_memory) {
            location.remembered_glyph
                = remembered_glyph_from_presentation(engraving);
        }
        if (show) show_glyph_cell(x, y, engraving);
    } else {
        map_background(x, y, show, state);
    }
    update_lastseentyp(x, y, state, {
        canSeeMonster: (subject) => canSeeMonster(subject, state),
    });
    if (show && !_propertyActiveUnblocked(state.u, BLINDED)) {
        const region = visible_region_at(x, y, state);
        if (region) show_region(region, x, y, state);
    }
}

// C ref: region.c show_region() (731-735), which is one show_glyph() of the
// number the region carries. This port stores the cmap index on the region
// rather than the number -- region.c create_gas_cloud() (1194) sets
// `cmap_to_glyph(damage ? S_poisoncloud : S_cloud)` and js/region.js keeps the
// index of that same pair -- so the conversion happens here. The colour comes
// from defsyms[] with everything else: CLR_BRIGHT_GREEN for poison gas and
// CLR_GRAY for a harmless cloud, which is what the region's damage argument
// used to select here.
function show_region(region, x, y, state) {
    show_glyph_cell(
        x, y, map_glyphinfo(cmap_to_glyph(region.glyph_cmap, state), state),
    );
}

// C ref: display.c map_object() (325-366). C calls obj_to_glyph() once, then
// again after observe_object() has possibly made a generic object specific.
// The first of those two calls draws from the display RNG only while
// hallucinating, and the branch between them requires !Hallucination, so
// observing first and drawing once is the same sequence.
export function map_object(obj, show, state = game) {
    if (state !== game) {
        throw new TypeError('map_object() draws to the global game');
    }
    const { ox: x, oy: y } = obj;
    observeNearbyObject(obj, x, y, state);
    const mapped = mappedObjectGlyphInfo(obj, state);
    if (state.level?.flags?.hero_memory) {
        const location = state.level.at(x, y);
        if (location) {
            location.remembered_glyph
                = remembered_glyph_from_presentation(mapped.remembered);
        }
    }
    if (show) show_glyph_cell(x, y, mapped.shown);
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
//
// The MG_BW_ENGR test that used to sit here belongs to map_glyphinfo()'s
// CMAP_A arm, where reset_glyphmap() keeps it, so a remembered engraving
// answers a 'use_inverse' toggle rather than replaying the attribute it was
// recorded with.
function engravingGlyph(engraving, loc, state) {
    if (!engraving?.erevealed
        || (loc.typ !== ROOM && loc.typ !== ICE && loc.typ !== CORR)) {
        return null;
    }
    return map_glyphinfo(engraving_to_glyph(engraving, state), state);
}

function sameLevel(a, b) {
    return Boolean(a && b
        && a.dnum === b.dnum && a.dlevel === b.dlevel);
}

/**
 * C ref: display.h glyph_is_invisible() (773), `((glyph) == GLYPH_INVISIBLE)`.
 * The argument is the glyph number, which every caller reads out of map
 * memory as `levl[x][y].glyph` and this port spells
 * `loc.remembered_glyph?.glyph`; an unexplored square remembers nothing and
 * answers `undefined`, which is not the marker either.
 */
export function glyph_is_invisible(glyph) {
    assertGlyphNumber(glyph, 'glyph_is_invisible');
    return glyph === GLYPH_INVISIBLE;
}

/**
 * C ref: display.c map_invisible() (377-385). "Make the hero remember that a
 * square contains an invisible monster.  This is a special case in that the
 * square will continue to be displayed this way even when the hero is close
 * enough to see it."
 *
 * Two guards, and they are not the same guard. The hero's own square is
 * skipped outright -- C's comment is "don't display I at hero's location" --
 * while svl.level.flags.hero_memory gates only the memory write, so a game
 * with hero memory off still paints the marker for one frame. No ported path
 * clears hero_memory, so the second guard is pinned by a test rather than by a
 * recording.
 *
 * The marker lives in the object layer of map memory, which is why
 * newsym()'s monster arms clear it before drawing anything on top.
 *
 * The two halves land in different places: the memory write goes to the
 * `state` handed in, and show_glyph_cell() below takes no state and paints the
 * module-global `game`. see_nearby_objects() settled what to do about that
 * shape, and this refuses a foreign state for the same reason rather than
 * splitting the two halves silently. It matters here because the once-per-turn
 * planning clone shares its level cells with the live game
 * (js/unported_monster_actions.js planningState()), so a dry run that reached
 * this function would leave a remembered 'I' and a painted cell behind in the
 * running game. The clone never reaches it: js/mhitm.js pre_mm_attack() marks
 * through an injected operation that a planning scan binds to a no-op, the way
 * it binds `redraw`.
 */
export function map_invisible(x, y, state = game) {
    if (state !== game) {
        throw new TypeError('map_invisible() draws to the global game');
    }
    if (x === state.u?.ux && y === state.u?.uy) return;
    const location = state.level?.at(x, y);
    if (!location) return;
    if (state.level.flags?.hero_memory) {
        location.remembered_glyph
            = rememberedGlyphNumber(GLYPH_INVISIBLE, state);
    }
    show_glyph_cell(x, y, map_glyphinfo(GLYPH_INVISIBLE, state));
}

/**
 * C ref: display.c unmap_invisible() (387-396).  detect.c dosearch0() calls
 * this for every adjacent square with no monster on it, to clear the
 * remembered 'I' of an invisible monster which has since moved away.
 *
 * It splits its two halves the way map_invisible() does: unmap_object() writes
 * the memory of the `state` handed in, and the newsym() below takes none and
 * repaints the module-global `game`. map_invisible() refuses a foreign state
 * over that; this one does not, because every caller in the running game
 * (js/detect.js dosearch0(), js/dokick.js, js/hack.js domove_core()) passes the
 * live state, while scripts/detect.test.mjs drives dosearch0() through a
 * hand-built state whose memory half is exactly what that test reads. The
 * repaint is covered separately, against the live game, in
 * scripts/display-symbols.test.mjs.
 */
export function unmap_invisible(x, y, state = game) {
    if (!isok(x, y)) return false;
    const location = state.level?.at?.(x, y);
    if (!glyph_is_invisible(location?.remembered_glyph?.glyph)) return false;
    unmap_object(x, y, state);
    newsym(x, y);
    return true;
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

// C ref: display.h trap_to_glyph(), resolved. Search discovery temporarily
// needs the canonical trap glyph even when an object or monster covers the
// square.
export function trap_glyph_info(trap, state = game) {
    const glyph = map_glyphinfo(trap_to_glyph(trap, state), state);
    if (!state.a11y?.glyph_updates) return glyph;
    return withAccessibilityMetadata(
        glyph,
        'trap',
        `trap:${trap.ttyp}`,
        { type: 'trap', trap, ttyp: trap.ttyp },
    );
}

// C ref: display.c map_trap() (295-305). Remembers the trap's own glyph and,
// when `show` is set, paints it. trap.c feeltrap() is the ported caller, and
// it follows this with newsym(), which rewrites both the paint and the memory
// from whatever layer really covers the square -- an object pile, or the hero
// standing in the trap. The two writes are therefore only observable when
// newsym() leaves them alone, which is why they are made here rather than
// folded into the caller.
export function map_trap(trap, show, state = game) {
    const glyph = trap_glyph_info(trap, state);
    if (state.level?.flags?.hero_memory) {
        const location = state.level.at(trap.tx, trap.ty);
        if (location) {
            location.remembered_glyph
                = remembered_glyph_from_presentation(glyph);
        }
    }
    if (show) show_glyph_cell(trap.tx, trap.ty, glyph);
}

// C ref: display.c map_background() (278-287). Puts the square's own terrain
// back into map memory, and paints it when `show` is set. unmap_object() below
// is the only ported caller, and it always passes show = 0, because the
// caller that follows it -- hack.c domove_fight_empty() -- calls newsym().
export function map_background(x, y, show, state = game) {
    const location = state.level?.at(x, y);
    if (!location) return;
    const glyph = map_glyphinfo(back_to_glyph(x, y, state), state);
    if (state.level?.flags?.hero_memory) {
        location.remembered_glyph = remembered_glyph_from_presentation(glyph);
    }
    if (show) show_glyph_cell(x, y, glyph);
}

// The refusal class for a map-memory rewrite this port cannot perform.
// js/cmd.js failClosedCommandRefusals() lists it, so a command that reaches
// one ends its segment on the last screen it matched.
export class UnsupportedMapMemoryError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedMapMemoryError';
    }
}

// C ref: display.c unmap_object() (408-438). Forgets whatever the map showed
// at <x,y> and puts back the terrain, the seen trap, or plain stone. hack.c
// domove_fight_empty() calls it before it names what the hero swung at,
// because the square is about to become known empty.
//
// Its engraving arm stops, and no longer for want of a helper:
// engraving_to_glyph() is ported now, so the arm could be written as C writes
// it. What it still needs is a recorded case, because retiring the stop lets a
// force-fight at an engraved square keep running, and no differential covers
// that square today. The deferral force-fight-engraved-square owns the port;
// this comment says only why the stop stands, not that it cannot go.
// spot_shows_engravings() restricts the arm
// to CORR, ICE and ROOM, all three of them ACCESSIBLE() and none of them
// furniture, so the squares that can reach it are exactly the ones
// domove_fight_empty() calls thin air. That arm is live, so a force-fight at
// an engraved square reaches this refusal; js/cmd.js
// failClosedCommandRefusals() lists UnsupportedMapMemoryError, so the segment
// ends there rather than the error escaping.
export function unmap_object(x, y, state = game) {
    if (!state.level?.flags?.hero_memory) return;
    const location = state.level.at(x, y);
    if (!location) return;

    const trap = t_at(x, y, state);
    const covered = floorLayersCovered(location, state);
    if (trap && trap.tseen && !covered) {
        map_trap(trap, 0, state);
    } else if (location.seenv) {
        const showsEngravings = location.typ === CORR
            || location.typ === ICE
            || location.typ === ROOM;
        if (showsEngravings && engr_at(x, y, state) && !covered) {
            throw new UnsupportedMapMemoryError(
                'forgetting a square that shows an engraving',
            );
        }
        map_background(x, y, 0, state);
        /* turn remembered dark room squares dark */
        // C compares levl[x][y].glyph with cmap_to_glyph(S_room). The compare
        // can only succeed on what map_background() just wrote, and
        // back_to_glyph() writes S_room for exactly the ROOM squares this
        // test already names, so the typ test carries the whole condition.
        if (!location.waslit && location.typ === ROOM)
            location.remembered_glyph = rememberedCmap(S_stone, state);
    } else {
        location.remembered_glyph = rememberedCmap(S_stone, state);
    }
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
            if (glyph_is_generic_object(
                state.level.at(ix, iy).remembered_glyph?.glyph,
            )) newsym(ix, iy);
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
        // display.c mon_overrides_region()'s closing line (697-699): with no
        // monster to prefer, a remembered invisible monster still overrides
        // the cloud, so the marker survives a gas cloud drifting over it.
        if (!monsterSensed && !monsterWarning
            && !adjacentVisibleMonster
            && !glyph_is_invisible(loc.remembered_glyph?.glyph)) {
            show_region(region, x, y, game);
            return;
        }
    }

    // display.c:1013, `mon && (see_it || (!worm_tail && Detect_monsters))`.
    // C evaluates this before _map_location() files the remembered glyph, so
    // it is hoisted above the layer choice below rather than computed with
    // the rest of the monster presentation. No worm_tail operand: long worms
    // have no port, so is_worm_tail() is constantly false here.
    const shouldDisplayMonster = Boolean(
        monster && (monsterDirectlyVisible || monsterSensed),
    );

    // display.c:1032-1033, `else if (glyph_is_invisible(lev->glyph))
    // map_invisible(x, y);`. The third arm of C's four-arm chain: a visible
    // square with no monster to draw and no warning, whose memory already
    // holds the marker, re-asserts the marker instead of recomputing itself
    // from its layers. Without it the layer choice below would quietly replace
    // a remembered 'I' with the floor under it on the next repaint.
    //
    // It is placed above the layer work rather than beside the draw because
    // C's arm skips _map_location() entirely, and _map_location() is what
    // reaches map_object() and its observe_object() -- so taking this arm must
    // not mark a nearby object as seen up close.
    //
    // Every term below is load-bearing, including the hero-square one. C runs
    // this chain inside the `else` of `if (u_at(x, y))`, so the flat arm here
    // needs its own exclusion to stand in for that structure. Dropping it on
    // the grounds that map_invisible() declines the hero's square anyway would
    // decline the write and the draw but not the `return` below, and newsym()
    // would then leave the hero undrawn on a square whose memory holds the
    // marker.
    //
    // update_lastseentyp() above stays where the port already had it, one
    // hoist further out than C's copy inside _map_location().
    if (visible && !shouldDisplayMonster && !monsterWarning
        && !(game.u?.ux === x && game.u?.uy === y)
        && glyph_is_invisible(loc.remembered_glyph?.glyph)) {
        map_invisible(x, y, game);
        return;
    }

    const covered = floorLayersCovered(loc, game);
    const object = covered
        ? null : game.level?.objects?.[x]?.[y] ?? null;
    if (object) observeNearbyObject(object, x, y, game);
    const trapAt = t_at(x, y, game);
    // display.c:1014-1023. Seeing a monster held in a physical trap tells the
    // hero what holds it, and C writes that before _map_location() picks the
    // remembered glyph, so the first frame that shows the monster already
    // remembers the trap under it. trap.c mintrap():3742-3749 repeats the
    // write on the held monster's next move and pager.c:468-476 on a farlook,
    // but neither runs when the hero sees the monster and then empties the
    // square before it moves again.
    //
    // Two differences from the layer choice below, both C's: the trap is read
    // through t_at() rather than through covers_traps(), so water over the
    // square does not suppress the write; and the hero's own square cannot
    // reach it, because C runs this in the `else` of `if (u_at(x, y))` and the
    // port's m_at() answers null wherever the hero stands.
    const tt = trapAt ? trapAt.ttyp : NO_TRAP;
    if (shouldDisplayMonster && monster.mtrapped
        && (tt === BEAR_TRAP || is_pit(tt) || tt === WEB))
        trapAt.tseen = true;
    const trap = covered ? null : trapAt;
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
            ?? map_glyphinfo(back_to_glyph(x, y, game), game);
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
            loc.remembered_glyph
                = remembered_glyph_from_presentation(rememberedUnderlying);
        return;
    }

    // Only update display/memory if cell is IN_SIGHT (lit and visible)
    if (visible) {
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
        //
        // display.c show_mon_or_warn()'s marker clear (486-493) has no
        // separate statement here. C reaches it through display_monster()
        // after _map_location(x, y, FALSE) has already rewritten
        // levl[x][y].glyph from the layers -- map_background(),
        // map_object() and map_trap() each write it under
        // svl.level.flags.hero_memory -- so the clear finds no marker left to
        // clear and its vobj_at() re-map repeats _map_location()'s own
        // map_object(). The write below is that same write, so both halves are
        // covered. C's warning arm is the one that reaches show_mon_or_warn()
        // with the marker intact, and this port raises no warning level.
        const remembered = mapsMimicDisguise
            ? mappedMimic.remembered : rememberedUnderlying;
        if (game.level?.flags?.hero_memory
            || (mapsMimicDisguise
                && mimicAppearanceType === M_AP_FURNITURE)) {
            // display_monster() writes a furniture disguise directly to
            // levl[x][y].glyph even when ordinary hero memory is disabled.
            loc.remembered_glyph
                = remembered_glyph_from_presentation(remembered);
        }
        show_glyph_cell(x, y, shown);
    } else if (loc.remembered_glyph) {
        // display.c:1077-1097, the tail of newsym()'s "can't see the
        // location" arm. A square remembered as lit that the hero cannot see
        // now was either lit only by night vision or darkened out of sight,
        // and either way the memory is corrected before it is drawn. C's
        // comment at 1075 keeps these tests here rather than in
        // back_to_glyph(), because they hold only while the square is out of
        // sight; back_to_glyph() runs on the sighted pass too and would undo
        // its own promotion.
        const remembered = loc.remembered_glyph.glyph;
        let darkened = null;
        if (on_level(game.u?.uz, game.rogue_level)) {
            // display.c:1078-1085.
            if (remembered === cmap_to_glyph(S_litcorr, game)
                && loc.typ === CORR) darkened = S_corr;
            else if (remembered === cmap_to_glyph(S_room, game)
                     && loc.typ === ROOM && !loc.waslit) darkened = S_stone;
        } else if (!loc.waslit
                   || (game.flags?.dark_room && game.iflags?.wc_color)) {
            // display.c:1086-1093.
            if (remembered === cmap_to_glyph(S_litcorr, game)
                && loc.typ === CORR) darkened = S_corr;
            else if (remembered === cmap_to_glyph(S_room, game)
                     && loc.typ === ROOM)
                // sym.h:96 resolves DARKROOMSYM to S_darkroom here: its other
                // arm is the rogue level, which the branch above has taken.
                darkened = S_darkroom;
        }
        if (darkened !== null) {
            // C assigns levl[x][y].glyph inside the show_glyph() argument, so
            // the correction outlives the draw exactly as the promotion does.
            showRememberedCmap(x, y, darkened, game);
            return;
        }
        // display.c:1094-1095, the show_mem label: memory as it stands.
        show_glyph_cell(
            x, y, remembered_glyph_presentation(loc.remembered_glyph, game),
        );
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

// ── reglyph_darkroom ──
// C ref: display.c reglyph_darkroom() (1818-1855).
//
// C's double loop repairs levl[x][y].glyph, the remembered glyph, after
// 'dark_room' or 'color' has changed what an out-of-sight room or corridor
// square should look like. Every one of its four arms tests a condition
// map_background() and back_to_glyph() already applied when the square was
// last drawn, so the loop finds work only when one of those two options has
// moved since. options.c reaches this function from initoptions_finish()
// (7347), from reset_needed_visuals() (8999) and from goto_level() (do.c:1715);
// js/do.js:910-916 records why the goto_level() call has nothing to repair.
//
// All four arms run. Each is a comparison against a glyph number and an
// assignment of another, which is what map memory now holds; the two that
// need GLYPH_NOTHING were the reason this used to refuse three of the four
// option configurations, and the number they write is resolved by
// map_glyphinfo()'s first arm like any other.
//
// The map test is the whole of what guards the loop. initoptions_finish() runs
// before mklev() has built one, so every arm would compare against a square
// carrying no remembered glyph at all and find no work; that call must still
// reach the tail below, which is the reason this exists as a function: a
// SYMBOLS=S_room override moves S_darkroom with it, and the
// initoptions_finish() call is what first collapses the two onto one byte.
export function reglyph_darkroom(state = game) {
    const darkRoom = Boolean(state.flags?.dark_room);
    // display.c:1836-1837. On the rogue level C takes the GLYPH_NOTHING arm
    // however the two options stand.
    const keepsDarkroomGlyph = darkRoom && state.iflags?.wc_color
        && !on_level(state.u?.uz, state.rogue_level);
    if (state.level) {
        // display.c:1822-1823. The bounds are C's own, and every square
        // inside them exists: js/game.js GameMap allocates the whole
        // COLNO x ROWNO grid, so at() answers null only outside them.
        for (let x = 1; x < COLNO; x++) {
            for (let y = 0; y < ROWNO; y++) {
                const location = state.level.at(x, y);
                const remembered = () => location.remembered_glyph?.glyph;
                if (!darkRoom) {
                    // display.c:1827-1830. With 'dark_room' off a corridor the
                    // hero saw lit is drawn lit again wherever she is.
                    if (remembered() === cmap_to_glyph(S_corr, state)
                        && location.waslit) {
                        location.remembered_glyph
                            = rememberedCmap(S_litcorr, state);
                    }
                } else if (remembered() === cmap_to_glyph(S_litcorr, state)
                           && !cansee(x, y, state)) {
                    // display.c:1831-1833. A corridor remembered lit that the
                    // hero cannot see now goes back to the dark symbol.
                    location.remembered_glyph = rememberedCmap(S_corr, state);
                }
                // C re-reads lev->glyph for this pair, after the pair above
                // may have rewritten it, so this does too.
                if (!keepsDarkroomGlyph) {
                    // display.c:1838-1840. Nothing draws S_darkroom in this
                    // configuration, so a square remembered that way goes back
                    // to plain floor if the hero saw it lit and to nothing at
                    // all if she did not.
                    if (remembered() === cmap_to_glyph(S_darkroom, state)) {
                        location.remembered_glyph = location.waslit
                            ? rememberedCmap(S_room, state)
                            : rememberedGlyphNumber(GLYPH_NOTHING_OFF, state);
                    }
                } else if (remembered() === cmap_to_glyph(S_room, state)
                           && location.seenv && location.waslit
                           && !cansee(x, y, state)) {
                    // display.c:1842-1844.
                    location.remembered_glyph
                        = rememberedCmap(S_darkroom, state);
                } else if (remembered() === GLYPH_NOTHING_OFF
                           && location.typ === ROOM && location.seenv
                           && !cansee(x, y, state)) {
                    // display.c:1845-1847, the arm that takes back what
                    // 1838-1840 wrote when the options move the other way.
                    location.remembered_glyph
                        = rememberedCmap(S_darkroom, state);
                }
            }
        }
    }
    // display.c:1850-1853.
    const showsyms = state.gs?.showsyms;
    if (!showsyms) return;
    showsyms[S_darkroom] = darkRoom && state.iflags?.wc_color
        ? showsyms[S_room]
        : showsyms[SYM_OFF_X + SYM_NOTHING];
}

// ── zapdir_to_glyph ──
//
// C ref: display.c zapdir_to_glyph() (2460-2470). "Change the given zap
// direction and beam type into a glyph. Each beam type has four glyphs, one
// for each of the symbols below. The order of the zap symbols [0-3] as defined
// in defsym.h are: | S_vbeam (0,1) or (0,-1); - S_hbeam (1,0) or (-1,0);
// \ S_lslant (1,1) or (-1,-1); / S_rslant (-1,1) or (1,-1)."
//
// C returns the glyph number; this returns the resolved presentation, for the
// reason obj_to_glyph() records above: tmp_at()'s frame stack and
// show_glyph_cell() both take one. The number stays reachable on it.
//
// C's out-of-range guard is `impossible("zapdir_to_glyph: illegal beam type")`
// followed by beam_type = 0. Every ported caller passes dobuzz()'s hdmgtype,
// which is a wand's damage type (0..5) or Hallucination's rn2(6), so the guard
// is unreachable and a wrong number is a defect here rather than a glyph to
// substitute for.
export function zapdir_to_glyph(dx, dy, beam_type, state = game) {
    if (beam_type < 0 || beam_type >= NUM_ZAP) {
        throw new RangeError(`zapdir_to_glyph: illegal beam type ${beam_type}`);
    }
    const dir = (dx === dy) ? 2 : (dx && dy) ? 3 : dx ? 1 : 0;
    return map_glyphinfo(((beam_type << 2) | dir) + GLYPH_ZAP_OFF, state);
}

// ── tmp_at ──
//
// C ref: display.c tmp_at() (1174-1296) over its `struct tmp_glyph` (1165-1171)
// and TMP_AT_MAX_GLYPHS (1163). Temporarily places glyphs on the screen for a
// beam, a flash, or a tethered missile, and takes them back down again. C
// calls nh_delay_output() nowhere in here; every caller decides for itself
// whether to pause between frames.
//
// The frame stack is C's function-static `tglyph`, a linked list whose head is
// the innermost effect in progress. It lives on game state for the same reason
// flush_screen()'s `delay_flushing` does: a module variable would carry one
// segment's unfinished effect into the next, and js/gstate.js resetGame()
// replaces game state for every runSegment().
const TMP_AT_MAX_GLYPHS = COLNO * 2;

function tmpAtStack(state) {
    state.tmp_at_stack ??= [];
    return state.tmp_at_stack;
}

// C ref: display.c tether_glyph() (1126-1133). Only DISP_TETHER draws it, and
// nothing ported opens that style: its three callers are dothrow.c:1578,
// mthrowu.c:653 and zap.c bhit():3866, each behind a tethered-weapon test no
// ported path satisfies. The one call site below therefore refuses rather
// than computing zapdir_to_glyph(sgn(u.ux - x), sgn(u.uy - y), 2).
function tether_glyph() {
    throw new UnsupportedTransientDisplayError('tether_glyph()');
}

// A transient-display branch this port has not translated. js/cmd.js
// failClosedCommandRefusals() lists it, so a segment keeps every frame the
// command already matched instead of failing hard.
export class UnsupportedTransientDisplayError extends Error {
    constructor(what) {
        super(`display.c tmp_at() reached ${what}`);
        this.name = 'UnsupportedTransientDisplayError';
        this.what = what;
    }
}

export async function tmp_at(x, y, state = game) {
    const stack = tmpAtStack(state);

    switch (x) {
    case DISP_BEAM:
    case DISP_ALL:
    case DISP_TETHER:
    case DISP_FLASH:
    case DISP_ALWAYS:
        // C allocates a nested frame when one is already open; a plain array
        // push is the same list operation with the head at the end.
        stack.push({ saved: [], style: x, glyph: y });
        await flush_screen(0); /* flush buffered glyphs */
        return;

    case DISP_FREEMEM: /* in case game ends with tmp_at() in progress */
        stack.length = 0;
        return;

    default:
        break;
    }

    if (!stack.length) {
        // C's panic("tmp_at: tglyph not initialized").
        throw new Error('tmp_at: tglyph not initialized');
    }
    const tglyph = stack[stack.length - 1];

    switch (x) {
    case DISP_CHANGE:
        tglyph.glyph = y;
        break;

    case DISP_END:
        if (tglyph.style === DISP_BEAM || tglyph.style === DISP_ALL) {
            /* Erase (reset) from source to end */
            for (const spot of tglyph.saved) newsym(spot.x, spot.y);
        } else if (tglyph.style === DISP_TETHER) {
            if (y === BACKTRACK && tglyph.saved.length > 1) {
                throw new UnsupportedTransientDisplayError(
                    'a tethered weapon backtracking to the hero',
                );
            }
            for (const spot of tglyph.saved) newsym(spot.x, spot.y);
        } else { /* DISP_FLASH or DISP_ALWAYS */
            if (tglyph.saved.length) /* been called at least once */
                newsym(tglyph.saved[0].x, tglyph.saved[0].y);
        }
        stack.pop();
        break;

    default: /* do it */
        if (!isok(x, y)) break;
        if (tglyph.style === DISP_BEAM || tglyph.style === DISP_ALL) {
            if (tglyph.style !== DISP_ALL && !cansee(x, y, state)) break;
            if (tglyph.saved.length >= TMP_AT_MAX_GLYPHS)
                break; /* too many locations */
            /* save pos for later erasing */
            tglyph.saved.push({ x, y });
        } else if (tglyph.style === DISP_TETHER) {
            if (tglyph.saved.length >= TMP_AT_MAX_GLYPHS)
                break; /* too many locations */
            if (tglyph.saved.length) {
                const prev = tglyph.saved[tglyph.saved.length - 1];
                show_glyph_cell(prev.x, prev.y, tether_glyph(prev.x, prev.y));
            }
            /* save pos for later use or erasure */
            tglyph.saved.push({ x, y });
        } else { /* DISP_FLASH/ALWAYS */
            if (tglyph.saved.length) {
                /* not first call, so reset previous pos */
                newsym(tglyph.saved[0].x, tglyph.saved[0].y);
                tglyph.saved.length = 0; /* display is presently up to date */
            }
            if (!cansee(x, y, state) && tglyph.style !== DISP_ALWAYS) break;
            tglyph.saved.push({ x, y });
        }

        show_glyph_cell(x, y, tglyph.glyph); /* show it */
        await flush_screen(0);               /* make sure it shows up */
        break;
    }
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
    if ((weapon.oclass === WEAPON_CLASS || is_weptool(weapon, state))
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
    // C ref: wintty.c:4539 asks critically_low_hp(TRUE) before dashing the
    // unfilled half of the bar.
    if (critically_low_hp(true)) {
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

function _capacityStatus(capacity, shrinkLevel = 0) {
    return tty_capacity_status(capacity, shrinkLevel);
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
    return `${label}:${depth(u.uz)}`;
}

// C ref: botl.c do_statusline2() (140-142) and bot_via_windowport() (1036-1037)
// -- the same guard written twice, once for the string the two-line status
// draws and once for the BL_HP value the field-based status stores. A hero's
// hit points go below zero for exactly as long as it takes hack.c losehp() to
// reach end.c done(), and every status drawn in that window, including the one
// urgent_pline("You die...") flushes, shows zero rather than the debt.
//
// Both C sites clamp before their min(hp, 9999) cap; that cap is left out
// because no ported path can lift a hero above 9999 hit points.
//
// They also select `Upolyd ? u.mh : u.uhp` on the line above the clamp, and
// that is left out for the same kind of reason: no ported path leaves the hero
// polymorphed while a status line is drawn, because hack.c losehp()'s own
// Upolyd arm still raises UnsupportedHitPointLossError. A polyself port adds
// the selection here, and here only, since this is the one owner all three
// renderers read.
function _statusHitPoints(u) {
    const hp = u?.uhp ?? 0;
    return hp < 0 ? 0 : hp;
}

function _statusVitals(u) {
    return `$:${money_cnt(game.invent)} HP:${_statusHitPoints(u)}(${u.uhpmax || 0}) Pw:${u.uen || 0}(${u.uenmax || 0}) AC:${u.uac ?? 10} Xp:${_statusExperience(u)}`;
}

// C ref: botl.c initblstats[]'s BL_TIME entry, whose "%ld" is filled from
// svm.moves, under the " T:" prefix wintty.c status_fieldfmt[] supplies. This
// is the one field botl.c timebot() refreshes on its own.
function _statusTimeText() {
    return `T:${game.moves || 1}`;
}

function _statusLine2Configuration(capacity) {
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
    const build = () => {
        const capacityText = _capacityStatus(capacity, capacityLevel);
        return `${_statusLevelDescription(u, shortLevel)} ${_statusVitals(u)}${time}${_hungerStatus(u)}${capacityText
            ? ` ${capacityText}` : ''}${capacityPadding}${_statusConditions(u, conditionLevel)}${optional}`;
    };
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
        && _capacityStatus(capacity, capacityLevel)) {
        capacityLevel = 1;
        status = build();
    }
    if (status.length + versionLength > TTY_STATUS_WIDTH
        && _capacityStatus(capacity, capacityLevel)) {
        capacityLevel = 2;
        status = build();
    }
    if (status.length + versionLength > TTY_STATUS_WIDTH
        && !_capacityStatus(capacity, capacityLevel)) {
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

function _fieldOwner(field, value = null) {
    return value === null
        ? { kind: 'field', field }
        : { kind: 'field', field, value };
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
        _statusField(`HP:${_statusHitPoints(u)}`, _fieldOwner('hitpoints')),
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
function _statusLine2Fields(capacityValue) {
    const u = game.u;
    // _statusLine2Configuration() answers null for exactly the missing hero
    // this function has no row to draw for.
    const configuration = _statusLine2Configuration(capacityValue);
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
    const capacity = _capacityStatus(capacityValue, capacityLevel);
    if (capacity) {
        fields.push(
            _statusField(' '),
            _statusField(
                capacity,
                _fieldOwner('carrying-capacity', capacityValue),
            ),
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

function _statusLine2Layout(capacity) {
    const fields = _statusLine2Fields(capacity);
    if (!fields) return { text: '', owners: [] };
    const { row } = _renderStatusFields(fields);
    return { ...row.finish(), fields };
}

function _statusLine3VitalsLayout(capacityValue) {
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
        column = row.write(column, hunger, _fieldOwner('hunger'));
    }
    const capacity = _capacityStatus(capacityValue);
    if (capacity) {
        column = row.write(column, ' ');
        row.write(
            column,
            capacity,
            _fieldOwner('carrying-capacity', capacityValue),
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

// C ref: win/tty/wintty.c tty_create_nhwindow()'s NHW_STATUS arm (896-914),
// which clamps iflags.wc2_statuslines into 2..3 and sizes wins[WIN_STATUS] at
// that many rows, pinned to the bottom of the terminal.  Every reader of the
// status window's height goes through this: statusLayouts() produces one entry
// per row and writeStatusRows() writes them at display.rows - count.
export function status_window_rows() {
    return game.iflags?.wc2_statuslines === 3 ? 3 : 2;
}

function statusLayouts({ initialTtyRefresh = false } = {}) {
    const count = status_window_rows();
    if (game.iflags?.status_updates === false) {
        return Array.from({ length: count }, () => ({ text: '', owners: [] }));
    }
    // botl.c computes BL_CAP once per full status update. near_capacity()
    // stores inv_weight()'s result in gw.wc, so layout retries and highlight
    // selection must reuse this snapshot rather than recomputing live state.
    const capacity = game.u ? near_capacity(game) : 0;
    return count === 3
        ? [
            _statusLine1Layout(false),
            _statusLine3VitalsLayout(capacity),
            _statusLine3DetailsLayout({ initialTtyRefresh }),
        ]
        : [_statusLine1Layout(), _statusLine2Layout(capacity)];
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

function _statusFieldData(field, valueSnapshot = null) {
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
        const capacity = valueSnapshot ?? near_capacity(game);
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
            value: _statusHitPoints(u),
            percent: _statusPercentage(_statusHitPoints(u), u?.uhpmax ?? 0),
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
function _statusFieldStyle(field, valueSnapshot = null) {
    if (!game.iflags?.hilite_delta) return null;
    const rules = (game.iflags.status_hilites ?? []).filter(
        (rule) => rule.field === field,
    );
    const data = _statusFieldData(field, valueSnapshot);
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
            // C ref: botl.c:2555 asks critically_low_hp(FALSE) for BL_HP.
            if (field === 'hitpoints' && critically_low_hp(false)) {
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

// C refs: win/tty/wintty.c condattr() (4920-4952) and condcolor() (4907-4918),
// which read back the gc.cond_hilites[] bits botl.c parse_condition() set.
// Those bits are cumulative across statements, so this replays every rule
// naming the condition in configuration-file order: `clearAttributes` is the
// `&= ~mask` sweep "none" performs over all six entries, `attrib` the
// `|= mask` bits.
//
// condcolor() scans the array from index 0 and returns the first entry holding
// the condition, so the lowest color index wins however the statements were
// ordered.  A rule whose color is null is a group that failed on a bad color
// after committing its attributes; C never ran its
// `gc.cond_hilites[coloridx] |= conditions_bitmask`, so it offers no index to
// find.  With none left, condcolor() falls out of its loop and answers
// NO_COLOR.
function _statusConditionStyle(option) {
    if (!game.iflags?.hilite_delta) return null;
    const colors = new Set();
    let attrib = HL_UNDEF;
    let matched = false;
    for (const rule of game.iflags.status_hilites ?? []) {
        if (rule.field !== 'condition'
            || !rule.conditions.includes(option)) continue;
        matched = true;
        if (rule.style.color !== null) colors.add(rule.style.color);
        if (rule.style.clearAttributes) attrib = HL_UNDEF;
        attrib |= rule.style.attrib;
    }
    if (!matched) return null;
    return {
        color: colors.size ? Math.min(...colors) : NO_COLOR,
        attrib,
    };
}

function _statusOwnerStyle(owner) {
    if (!owner) return null;
    if (owner.kind === 'field') {
        return _statusFieldStyle(owner.field, owner.value ?? null);
    }
    if (owner.kind === 'condition') {
        return _statusConditionStyle(owner.option);
    }
    if (owner.kind === 'hitpoint-bar') {
        const hpStyle = _statusFieldStyle('hitpoints');
        return {
            color: hpStyle?.color ?? NO_COLOR,
            // C ref: wintty.c:4541 sets this mask from the BL_HP update rather
            // than from the configured HP rule, as
            // `HL_INVERSE | (hpbar_crit_hp ? HL_BLINK : 0)`.  HL_BLINK adds
            // nothing the recorder can see -- see _recorderStatusAttribute()
            // -- so the port carries the inverse bit alone.
            attrib: HL_INVERSE,
        };
    }
    return null;
}

// C ref: win/tty/wintty.c Begin_Attr() (4954-4971), which turns an HL_ mask
// into term_start_attr() calls, and recorder patch 006's nomux_set_attr(),
// which records ATR_INVERSE, ATR_BOLD and ATR_ULINE and drops ATR_DIM,
// ATR_ITALIC and ATR_BLINK.  The three dropped ones therefore leave no trace
// on a captured screen, and HL_NONE and HL_UNDEF both draw nothing.
//
// term_attr_fixup() (termcap.c:1410-1427) sits between the two and rewrites
// the mask when the terminal lacks a capability: no `us` turns HL_ULINE into
// HL_BOLD, no `mb` turns HL_BLINK into HL_BOLD, and no `mh` drops HL_DIM.
// The recorder runs under TERM=xterm-256color, which has all three, so it is
// the identity there and has no port.  Measured on the reference build at
// seed 7710041 and 20010704120000: hilite_status:hitpoints/always/underline
// captures underline rather than bold, and .../blink captures nothing rather
// than bold, which is only true when `us` and `mb` are both present.
function _recorderStatusAttribute(attrib) {
    let attr = ATR_NONE;
    if (attrib & HL_BOLD) attr |= ATR_BOLD;
    if (attrib & HL_ULINE) attr |= ATR_UNDERLINE;
    if (attrib & HL_INVERSE) attr |= ATR_INVERSE;
    return attr;
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
        attr: _recorderStatusAttribute(style.attrib),
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

// C ref: botl.c bot() (253-272).
//
// The gb.bot_disabled test at 254-256 returns before the status window is
// written *and* before disp.botl, disp.botlx and disp.time_botl are cleared,
// so the pending update survives the suppressed pass and the next enabled
// bot() still paints it.  js/windows.js select_menu() and getlin() are the two
// writers of the flag.
//
// C's remaining guards -- u.uhp != -1, gy.youmonst.data and
// suppress_map_output() -- cover dosave(), pre-initialization and the
// save/restore/hangup states this port does not enter.
export async function bot({ initialTtyRefresh = false } = {}) {
    if (game.gb?.bot_disabled === true)
        return;
    const optionalSnapshot = status_window_rows() === 3
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
// The gb.bot_disabled test at 276-278 returns before disp.time_botl is
// cleared, exactly as bot() does above; suppress_map_output() covers the save,
// restore and hangup states this port does not enter.
export async function timebot() {
    if (game.gb?.bot_disabled === true)
        return;
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
