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
    SLIMED, STONED, STR18, STRANGLED, STUNNED,
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
    SV0, SV1, SV2, SV3, SV4, SV5, SV6, SV7,
    WM_MASK, WM_C_OUTER, WM_C_INNER,
    WM_T_LONG, WM_T_BL, WM_T_BR,
    WM_X_TL, WM_X_TR, WM_X_BL, WM_X_BR, WM_X_TLBR, WM_X_BLTR,
    HI_DOMESTIC, HI_METAL, M_AP_FURNITURE, M_AP_OBJECT, M_AP_TYPMASK,
} from './const.js';
import {
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
import { dist2 } from './hacklib.js';
import { observe_object } from './o_init.js';
import { engr_at } from './engrave.js';
import { status_version } from './version.js';
import { objectType, isWeptool } from './obj.js';
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

// ── ANSI color codes ──
// Maps CLR_* constants (0-15) to ANSI SGR color codes.
// C ref: wintty.c term_start_color
const ANSI_DEFAULT = 39;
const ANSI_COLOR = [
    30,  // CLR_BLACK     0
    31,  // CLR_RED       1
    32,  // CLR_GREEN     2
    33,  // CLR_BROWN     3
    34,  // CLR_BLUE      4
    35,  // CLR_MAGENTA   5
    36,  // CLR_CYAN      6
    37,  // CLR_GRAY      7
    39,  // NO_COLOR      8 → default
    91,  // CLR_ORANGE    9
    92,  // CLR_BRIGHT_GREEN  10
    93,  // CLR_YELLOW    11
    94,  // CLR_BRIGHT_BLUE   12
    95,  // CLR_BRIGHT_MAGENTA 13
    96,  // CLR_BRIGHT_CYAN   14
    97,  // CLR_WHITE     15
];

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
    // recorder patch 006 serializes terminal-default gray without an ANSI
    // color and cannot retain a zero-valued black foreground.  Both decode
    // as NO_COLOR, matching how the tty presents ordinary gray glyphs.
    if (color === CLR_GRAY || color === CLR_BLACK) return NO_COLOR;
    return color;
}

function terrainCmap(index, color, state, customizationName = null) {
    const customization = customizationName
        ? glyph_customization(customizationName, state) : null;
    return glyphPresentation(
        cmap_symbol(index, state), color, state, customization,
    );
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
        ? optional_misc_symbol(5, state) : null)
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
        ? optional_misc_symbol(4, state)
            ?? monster_class_symbol(monster.data.mlet, state)
        : monster_class_symbol(monster.data.mlet, state);
    return glyphPresentation(symbol, monster.data.mcolor, state);
}

// C ref: display.h obj_is_generic().  Unobserved potions, real/glass gems,
// and ordinary spellbooks conceal their description color until nearby.
export function object_is_generic(obj) {
    return !obj?.dknown
        && (obj?.oclass === POTION_CLASS
            || (obj?.otyp >= FIRST_REAL_GEM && obj.otyp <= LAST_GLASS_GEM)
            || (obj?.otyp >= FIRST_SPELL && obj.otyp <= LAST_SPELL));
}

export function object_glyph_info(obj, state = game) {
    if (!obj) throw new TypeError('object_glyph_info requires an object');
    const generic = object_is_generic(obj);
    const actualType = state.objects?.[obj.otyp];
    const type = generic ? state.objects?.[obj.oclass] : actualType;
    let symbol;
    let color = type?.oc_color ?? NO_COLOR;
    if (obj.otyp === BOULDER) {
        symbol = misc_symbol(2, state);
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
    return glyphPresentation(symbol, color, state);
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
        const shown = monster && !monster.minvis && !monster.mundetected
            ? monster_glyph_info(monster, game)
            : underlying;
        // display_monster() maps an unsensed mimic appearance onto memory.
        // Ordinary monsters leave memory as the actual layer underneath them.
        const remembered = monster
            && !monster.minvis
            && !monster.mundetected
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
}

// ── Serialize a map row with DEC line-drawing and ANSI colors ──
function render_map_row(y) {
    if (!game.level) return '';
    let firstCol = -1, lastCol = -1;
    for (let x = 1; x < COLNO; x++) {
        const loc = game.level.at(x, y);
        if (loc?.disp_ch && loc.disp_ch !== ' ') {
            if (firstCol < 0) firstCol = x;
            lastCol = x;
        }
    }
    if (firstCol < 0) return '';

    let output = '';
    let activeColor = ANSI_DEFAULT;  // default
    let activeDec = false;

    // Leading gap
    const gap = firstCol - 1;
    if (gap > 4) output += `\x1b[${gap}C`;
    else if (gap > 0) output += ' '.repeat(gap);

    for (let x = firstCol; x <= lastCol; x++) {
        const loc = game.level.at(x, y);
        const ch = loc?.disp_ch ?? ' ';
        const color = loc?.disp_color ?? NO_COLOR;
        const dec = !!loc?.disp_decgfx;

        if (ch === ' ') {
            // Space runs
            let run = 1;
            while (x + run <= lastCol && (game.level.at(x + run, y)?.disp_ch ?? ' ') === ' ') run++;
            if (activeDec) { output += '\x0f'; activeDec = false; }
            if (run > 4) output += `\x1b[${run}C`;
            else output += ' '.repeat(run);
            x += run - 1;
            continue;
        }

        let wantAnsi = ANSI_COLOR[color] ?? ANSI_DEFAULT;
        if (wantAnsi !== activeColor) {
            output += `\x1b[${wantAnsi}m`;
            activeColor = wantAnsi;
        }

        // DEC mode switching
        if (dec && !activeDec) { output += '\x0e'; activeDec = true; }
        else if (!dec && activeDec) { output += '\x0f'; activeDec = false; }

        output += ch;
    }

    // Reset state at end of row (C does per-row SO/SI)
    if (activeColor !== ANSI_DEFAULT) output += `\x1b[${ANSI_DEFAULT}m`;
    if (activeDec) output += '\x0f';

    return output;
}

// ── Status lines ──
const BOTL_NSIZ = 16; // include/botl.h

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

function _optionalStatusFields() {
    const fields = [];
    if (game.flags?.weaponstatus) fields.push(weapon_status(game));
    if (game.flags?.armorstatus) fields.push(armor_status(game));
    if (game.flags?.terrainstatus) fields.push(_terrainStatus(game));
    return fields.length ? ` ${fields.join(' ')}` : '';
}

function _statusLine1(includeAlignment = true) {
    const u = game.u;
    if (!u) return '';
    // C ref: botl.c do_statusline1().  The status line capitalizes only an
    // initial ASCII lowercase byte, then reserves at most BOTL_NSIZ bytes for
    // the player name.  Player names are ASCII in the source option parser.
    const rawName = game.plname || 'Hero';
    let name = rawName.slice(0, BOTL_NSIZ);
    if (name[0] >= 'a' && name[0] <= 'z') {
        name = name[0].toUpperCase() + name.slice(1);
    }
    const role = rankOf(game.urole, u.ulevel ?? 1, game.flags?.female)
        || game.urole?.rank?.m || game.urole?.name?.m || 'Adventurer';
    const title = `${name} the ${role}`;
    const attrs = u.acurr?.a ?? [];
    const strength = attrs[A_STR]
        ? get_strength_str(attrs[A_STR]) : '?';
    const stats = `St:${strength} Dx:${attrs[A_DEX] || '?'} Co:${attrs[A_CON] || '?'} In:${attrs[A_INT] || '?'} Wi:${attrs[A_WIS] || '?'} Ch:${attrs[A_CHA] || '?'}`;
    const align = u.ualign?.type === 0 ? 'Neutral' : u.ualign?.type > 0 ? 'Lawful' : 'Chaotic';
    // C uses cursor-forward for gap between title and stats
    // C pads to align stats starting at a fixed column
    const gap = Math.max(1, 31 - title.length);
    const suffix = includeAlignment ? ` ${align}` : '';
    if (gap > 4) return `${title}\x1b[${gap}C${stats}${suffix}`;
    return `${title}${' '.repeat(gap)}${stats}${suffix}`;
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

// C ref: botl.c do_statusline2(), condition assembly. Encumbrance remains
// absent at the new-game boundary because u_init_carry_attr_boost() guarantees
// that the initial inventory is within capacity.
function _statusConditions(u, shrinkLevel = 0) {
    const conditions = [];
    const add = (...forms) => conditions.push(forms[shrinkLevel]);
    if (_propertyIntrinsic(u, STONED)) add('Stone', 'Ston', 'Sto');
    if (_propertyIntrinsic(u, SLIMED)) add('Slime', 'Slim', 'Slm');
    if (_propertyIntrinsic(u, STRANGLED)) add('Strngl', 'Stngl', 'Str');
    if (_propertyIntrinsic(u, SICK)) {
        if ((u.usick_type ?? 0) & SICK_VOMITABLE)
            add('FoodPois', 'Fpois', 'Poi');
        if ((u.usick_type ?? 0) & SICK_NONVOMITABLE)
            add('TermIll', 'Ill', 'Ill');
    }
    if (_propertyActiveUnblocked(u, BLINDED)) add('Blind', 'Blnd', 'Bl');
    if (_propertyActive(u, DEAF) || u.uroleplay?.deaf)
        add('Deaf', 'Def', 'Df');
    if (_propertyIntrinsic(u, STUNNED)) add('Stun', 'Stun', 'St');
    if (_propertyIntrinsic(u, CONFUSION)) add('Conf', 'Cnf', 'Cf');
    if (_propertyIntrinsic(u, HALLUC)
        && !_propertyActive(u, HALLUC_RES)) add('Hallu', 'Hal', 'Hl');
    if (_propertyActiveUnblocked(u, LEVITATION)) add('Lev', 'Lev', 'Lv');
    if (_propertyActiveUnblocked(u, FLYING)) add('Fly', 'Fly', 'Fl');
    if (u.usteed) add('Ride', 'Rid', 'Rd');
    return conditions.length ? ` ${conditions.join(' ')}` : '';
}

function _statusExperience(u) {
    return game.flags?.showexp
        ? `${u.ulevel || 1}/${u.uexp || 0}`
        : `${u.ulevel || 1}`;
}

function _statusVersionSuffix(status) {
    if (!game.flags?.showvers) return status.slice(0, 79);
    const version = status_version(game.flags);
    // win/tty/wintty.c render_status() right-justifies BL_VERS against the
    // TTY's 79 printable status columns when it is the row's final field.
    const versionColumn = Math.max(status.length + 1, 79 - version.length);
    return `${status.padEnd(versionColumn)}${version}`.slice(0, 79);
}

function _statusLine2() {
    const u = game.u;
    if (!u) return '';
    const time = game.flags?.time ? ` T:${game.moves || 1}` : '';
    const optional = _optionalStatusFields();
    const versionLength = game.flags?.showvers
        ? status_version(game.flags).length + 1 : 0;
    let conditionLevel = 0;
    let capacityPadding = '';
    let shortLevel = false;
    const build = () => `${shortLevel ? 'Dl' : 'Dlvl'}:${u.uz?.dlevel || 1} $:${money_cnt(game.invent)} HP:${u.uhp || 0}(${u.uhpmax || 0}) Pw:${u.uen || 0}(${u.uenmax || 0}) AC:${u.uac ?? 10} Xp:${_statusExperience(u)}${time}${_hungerStatus(u)}${capacityPadding}${_statusConditions(u, conditionLevel)}${optional}`;
    let status = build();
    // wintty.c make_things_fit() first tries both abbreviated condition
    // vocabularies, then shortens "Dlvl" to "Dl" before truncating.
    while (status.length + versionLength > 79 && conditionLevel < 2) {
        conditionLevel++;
        status = build();
    }
    if (status.length + versionLength > 79) {
        // shrink_enc() reconstructs an unencumbered BL_CAP as one blank;
        // unlike tty_status_update(), it does not suppress that blank again.
        capacityPadding = ' ';
        status = build();
    }
    if (status.length + versionLength > 79) {
        shortLevel = true;
        status = build();
    }
    return _statusVersionSuffix(status);
}

function _statusLine3VitalsBase(u) {
    const align = u.ualign?.type === 0
        ? 'Neutral' : u.ualign?.type > 0 ? 'Lawful' : 'Chaotic';
    return `${align} $:${money_cnt(game.invent)} HP:${u.uhp || 0}(${u.uhpmax || 0}) Pw:${u.uen || 0}(${u.uenmax || 0}) AC:${u.uac ?? 10} Xp:${_statusExperience(u)}`;
}

function _statusLine3Vitals() {
    const u = game.u;
    if (!u) return '';
    return `${_statusLine3VitalsBase(u)}${_hungerStatus(u)}`;
}

function _statusLine3Details() {
    const u = game.u;
    if (!u) return '';
    const time = game.flags?.time ? ` T:${game.moves || 1}` : '';
    const optional = _optionalStatusFields();
    const version = game.flags?.showvers ? status_version(game.flags) : '';
    const versionFieldLength = version ? version.length + 1 : 0;
    let conditionLevel = 0;
    let shortLevel = false;
    const prefix = () => `${shortLevel ? 'Dl' : 'Dlvl'}:${u.uz?.dlevel || 1}${time}`;
    let conditions = _statusConditions(u, conditionLevel);
    const nominalLength = () => prefix().length + conditions.length
        + optional.length + versionFieldLength;
    while (nominalLength() > 79 && conditionLevel < 2) {
        conditionLevel++;
        conditions = _statusConditions(u, conditionLevel);
    }
    if (nominalLength() > 79) shortLevel = true;

    // C ref: wintty.c render_status(). It computes nominal field positions,
    // indents BL_CONDITION toward BL_HUNGER, then resumes later fields at
    // their nominal positions. That can overwrite the indented condition.
    const row = new Array(79).fill(' ');
    const write = (start, text) => {
        for (let index = 0; index < text.length; ++index) {
            const column = start + index;
            if (column >= 0 && column < row.length) row[column] = text[index];
        }
    };
    const level = prefix();
    write(0, level);
    let nominal = level.length;
    if (conditions) {
        const x = nominal + 1; // tty field positions are one-based.
        const hungerX = _statusLine3VitalsBase(u).length + 1;
        let lastColumn = 80;
        if (!optional && version) lastColumn -= versionFieldLength;
        let conditionX = x;
        if (x < hungerX
            && hungerX + conditions.length < lastColumn - 1) {
            conditionX = hungerX;
        } else if (x + conditions.length < 79) {
            conditionX = lastColumn - conditions.length;
        }
        write(conditionX - 1, conditions);
        nominal += conditions.length;
    }
    if (optional) {
        write(nominal, optional);
        nominal += optional.length;
    }
    if (version) {
        const field = ` ${version}`;
        const rightStart = 79 - field.length;
        const start = Math.max(nominal, rightStart);
        for (let column = nominal; column < start && column < row.length;
            ++column) row[column] = ' ';
        write(start, field);
    }
    return row.join('').trimEnd();
}

function statusTextRows() {
    return game.iflags?.wc2_statuslines === 3
        ? [_statusLine1(false), _statusLine3Vitals(), _statusLine3Details()]
        : [_statusLine1(), _statusLine2()];
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

function writeStatusRows(display, rows = statusTextRows()) {
    if (!display?.grid) return;
    const firstRow = display.rows - rows.length;
    for (let index = 0; index < rows.length; ++index) {
        const screenRow = firstRow + index;
        display.clearRow(screenRow);
        const text = rows[index].replace(
            /\x1b\[[0-9;]*[A-Za-z]/g,
            (sequence) => sequence.match(/\x1b\[\d+C/)
                ? ' '.repeat(parseInt(sequence.slice(2), 10)) : '',
        );
        for (let column = 0;
            column < Math.min(text.length, display.cols);
            ++column) {
            display.setCell(column, screenRow, text[column], NO_COLOR, 0);
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
    const statusRows = statusTextRows();
    const viewport = mapViewport(display.rows, statusRows.length);

    let output = '';
    // Row 0: message
    output += (game._pending_message || '') + '\n';

    // Map viewport between the message row and the status window.
    for (let offset = 0; offset < viewport.height; ++offset) {
        const y = viewport.top + offset;
        output += render_map_row(y) + '\n';
    }

    output += statusRows.join('\n');

    game._screen_output = output;

    // Also write to grid for serialize_terminal_grid
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
    _buildScreenOutput();
}

// ── cls ──
export async function cls() {
    const display = game?.nhDisplay;
    if (display?.clearScreen) display.clearScreen();
    game._pending_message = '';
}

// ── bot ──
export async function bot() {
    writeStatusRows(game?.nhDisplay);
}
