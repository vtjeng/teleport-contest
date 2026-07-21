// display.js — Map rendering and terminal output.
// C ref: display.c — newsym, show_glyph, docrt, cls, flush_screen.

import { game } from './gstate.js';
import { cansee } from './vision.js';
import {
    COLNO, ROWNO, STONE, ROOM, CORR, DOOR, STAIRS,
    HWALL, VWALL, TLCORNER, TRCORNER, BLCORNER, BRCORNER, SDOOR,
    CROSSWALL, TUWALL, TDWALL, TLWALL, TRWALL,
    D_BROKEN, D_ISOPEN, LA_DOWN,
    SV0, SV1, SV2, SV3, SV4, SV5, SV6, SV7,
    WM_MASK, WM_C_OUTER, WM_C_INNER,
    WM_T_LONG, WM_T_BL, WM_T_BR,
    WM_X_TL, WM_X_TR, WM_X_BL, WM_X_BR, WM_X_TLBR, WM_X_BLTR,
} from './const.js';
import { NO_COLOR, CLR_BROWN, CLR_WHITE, CLR_YELLOW, DEC_TO_UNICODE } from './terminal.js';
import { rankOf } from './roles.js';
import {
    cmap_symbol,
    S_stone,
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
    S_corr,
    S_litcorr,
    S_upstair,
    S_dnstair,
    S_brupstair,
    S_brdnstair,
} from './symbols.js';

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

function terrainCmap(index, color, state) {
    const symbol = cmap_symbol(index, state);
    const result = {
        ch: symbol.ch,
        color: mapColorEnabled(state) ? color : NO_COLOR,
        dec: symbol.dec,
    };
    if (symbol.displayCh) result.displayCh = symbol.displayCh;
    return result;
}

function stairwayAt(state, x, y) {
    for (let stairway = state.stairs; stairway; stairway = stairway.next) {
        if (stairway.sx === x && stairway.sy === y) return stairway;
    }
    return null;
}

function heroColor(state) {
    return state.iflags?.wc_color === false ? NO_COLOR : CLR_WHITE;
}

// ── Terrain to display character + color + DEC flag ──
export function terrain_glyph(loc, x, y, state = game) {
    const typ = loc.typ;
    if (WALL_TYPES.has(typ)) {
        return terrainCmap(
            loc.seenv ? wall_angle(loc) : S_stone,
            NO_COLOR,
            state,
        );
    }

    switch (typ) {
    case STONE:
        return terrainCmap(S_stone, NO_COLOR, state);
    case ROOM:
        return terrainCmap(S_room, NO_COLOR, state);
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
        const knownBranch = Boolean(stairway?.u_traversed
            && stairway.tolev?.dnum !== state.u?.uz?.dnum);
        return terrainCmap(
            knownBranch
                ? down ? S_brdnstair : S_brupstair
                : down ? S_dnstair : S_upstair,
            knownBranch ? CLR_YELLOW : NO_COLOR,
            state,
        );
    }
    default:        return { ch: '?', color: NO_COLOR, dec: false };
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
    loc.disp_browser_color = displayCh ? color : null;
    loc.gnew = 1;
}

function rememberedTerrainGlyph(glyph) {
    return {
        ch: glyph.ch,
        color: glyph.color,
        decgfx: glyph.dec,
        displayCh: glyph.displayCh ?? null,
    };
}

// ── newsym ──
export function newsym(x, y) {
    const loc = game.level?.at(x, y);
    if (!loc) return;

    if (game.u?.ux === x && game.u?.uy === y) {
        // Hero
        show_glyph_cell(x, y, '@', heroColor(game), false);
        const tg = terrain_glyph(loc, x, y);
        loc.remembered_glyph = rememberedTerrainGlyph(tg);
        return;
    }

    // Contestants: add monster, object, and trap display here.

    const tg = terrain_glyph(loc, x, y);
    // Only update display/memory if cell is IN_SIGHT (lit and visible)
    if (cansee(x, y)) {
        show_glyph_cell(
            x,
            y,
            tg.ch,
            tg.color,
            tg.dec,
            0,
            tg.displayCh ?? null,
        );
        if (game.level?.flags?.hero_memory) {
            loc.remembered_glyph = rememberedTerrainGlyph(tg);
        }
    } else if (loc.remembered_glyph) {
        // Out of sight but remembered — show remembered glyph
        show_glyph_cell(x, y, loc.remembered_glyph.ch,
            loc.remembered_glyph.color, loc.remembered_glyph.decgfx, 0,
            loc.remembered_glyph.displayCh);
    }
}

// ── docrt ──
export async function docrt() {
    if (!game.level) return;
    for (let y = 0; y < ROWNO; y++)
        for (let x = 1; x < COLNO; x++) {
            const loc = game.level.at(x, y);
            if (loc?.remembered_glyph) {
                show_glyph_cell(x, y, loc.remembered_glyph.ch,
                    loc.remembered_glyph.color,
                    loc.remembered_glyph.decgfx,
                    0,
                    loc.remembered_glyph.displayCh);
            }
        }
    if (game.u?.ux > 0) {
        show_glyph_cell(
            game.u.ux,
            game.u.uy,
            '@',
            heroColor(game),
            false,
        );
    }
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
function _statusLine1() {
    const u = game.u;
    if (!u) return '';
    const name = game.plname || 'Hero';
    const role = rankOf(game.urole, u.ulevel ?? 1, game.flags?.female)
        || game.urole?.rank?.m || game.urole?.name?.m || 'Adventurer';
    const title = `${name} the ${role}`;
    const stats = `St:${u.acurr?.a?.[0] || '?'} Dx:${u.acurr?.a?.[1] || '?'} Co:${u.acurr?.a?.[2] || '?'} In:${u.acurr?.a?.[3] || '?'} Wi:${u.acurr?.a?.[4] || '?'} Ch:${u.acurr?.a?.[5] || '?'}`;
    const align = u.ualign?.type === 0 ? 'Neutral' : u.ualign?.type > 0 ? 'Lawful' : 'Chaotic';
    // C uses cursor-forward for gap between title and stats
    // C pads to align stats starting at a fixed column
    const gap = Math.max(1, 31 - title.length);
    if (gap > 4) return `${title}\x1b[${gap}C${stats} ${align}`;
    return `${title}${' '.repeat(gap)}${stats} ${align}`;
}

function _statusLine2() {
    const u = game.u;
    if (!u) return '';
    return `Dlvl:${u.uz?.dlevel || 1} $:${game._goldCount || 0} HP:${u.uhp || 0}(${u.uhpmax || 0}) Pw:${u.uen || 0}(${u.uenmax || 0}) AC:${u.uac ?? 10} Xp:${u.ulevel || 1}/${u.uexp || 0} T:${game.moves || 1}`;
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

    let output = '';
    // Row 0: message
    output += (game._pending_message || '') + '\n';

    // Rows 1-21: map (rendered with DEC + ANSI, per-row SO/SI)
    for (let y = 0; y < ROWNO; y++) {
        output += render_map_row(y) + '\n';
    }

    // Row 22-23: status
    output += _statusLine1() + '\n';
    output += _statusLine2();

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
        for (let y = 0; y < ROWNO; y++) {
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
                    y + 1,
                    ch,
                    browserGlyphs && loc.disp_browser_ch
                        ? loc.disp_browser_color ?? loc.disp_color ?? NO_COLOR
                        : loc.disp_color ?? NO_COLOR,
                    loc.disp_attr ?? 0,
                );
            }
        }
        // Status lines
        const s1 = _statusLine1().replace(/\x1b\[[0-9;]*[A-Za-z]/g, m =>
            m.match(/\x1b\[\d+C/) ? ' '.repeat(parseInt(m.slice(2))) : '');
        for (let c = 0; c < Math.min(s1.length, display.cols); c++)
            display.setCell(c, 22, s1[c], NO_COLOR, 0);
        const s2 = _statusLine2();
        for (let c = 0; c < Math.min(s2.length, display.cols); c++)
            display.setCell(c, 23, s2[c], NO_COLOR, 0);
        // Cursor at hero
        if (game.u?.ux > 0)
            display.setCursor(game.u.ux - 1, game.u.uy + 1);
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
    // Status line updates happen in _buildScreenOutput
}

// ── pline ──
export async function pline(msg) {
    game._pending_message = msg;
}
