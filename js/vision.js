// vision.js — C ref: vision.c Algorithm C shadow-casting
// Stripped-down port for the contest skeleton: no underwater or pit handling.
// Contestants should port the full vision.c for complete parity.

import { game } from './gstate.js';
import { on_level } from './dungeon.js';
import { do_light_sources } from './light.js';
import { BOULDER } from './objects.js';
import { visible_region_at } from './region.js';
import { m_at } from './monst.js';
import {
    BLINDED, CLOUD, COLNO, COULD_SEE, DB_MOAT, DB_UNDER, DRAWBRIDGE_UP,
    IN_SIGHT, LAVAWALL, MOAT, ROWNO, DOOR, SDOOR, POOL, WATER,
    D_CLOSED, D_LOCKED, D_TRAPPED,
    M_AP_FURNITURE, M_AP_OBJECT, M_AP_TYPMASK, SEE_INVIS,
    SV0, SV1, SV2, SV3, SV4, SV5, SV6, SV7,
    IS_WALL, TEMP_LIT,
} from './const.js';
import { newsym } from './display.js';
import {
    S_hcdoor,
    S_ndoor,
    S_stone,
    S_tree,
    S_vcdoor,
} from './symbols.js';

function heroIsBlind(hero) {
    const blindness = hero?.uprops?.[BLINDED];
    return Boolean(blindness?.intrinsic || blindness?.extrinsic)
        && !blindness?.blocked;
}

// C ref: vision.c seenv_matrix
const seenv_matrix = [
    [SV2, SV1, SV0],
    [SV3, 0,   SV7],
    [SV4, SV5, SV6],
];

// Circle data for range limits (C vision.c:27-70)
const circle_data = [
    /*  0*/ 0,
    /*  1*/ 1, 1,
    /*  3*/ 2, 2, 1,
    /*  6*/ 3, 3, 2, 1,
    /* 10*/ 4, 4, 4, 3, 2,
    /* 15*/ 5, 5, 5, 4, 3, 2,
    /* 21*/ 6, 6, 6, 5, 5, 4, 2,
    /* 28*/ 7, 7, 7, 6, 6, 5, 4, 2,
    /* 36*/ 8, 8, 8, 7, 7, 6, 6, 4, 2,
    /* 45*/ 9, 9, 9, 9, 8, 8, 7, 6, 5, 3,
    /* 55*/ 10, 10, 10, 10, 9, 9, 8, 7, 6, 5, 3,
    /* 66*/ 11, 11, 11, 11, 10, 10, 9, 9, 8, 7, 5, 3,
    /* 78*/ 12, 12, 12, 12, 11, 11, 10, 10, 9, 8, 7, 5, 3,
    /* 91*/ 13, 13, 13, 13, 12, 12, 12, 11, 10, 10, 9, 7, 6, 3,
    /*105*/ 14, 14, 14, 14, 13, 13, 13, 12, 12, 11, 10, 9, 8, 6, 3,
    /*120*/ 15, 15, 15, 15, 14, 14, 14, 13, 13, 12, 11, 10, 9, 8, 6, 3,
    /*136*/ 16,
];
const circle_start = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78, 91, 105, 120];

// Vision state arrays
const viz_clear = Array.from({ length: ROWNO }, () => new Int8Array(COLNO));
const left_ptrs = Array.from({ length: ROWNO }, () => new Int16Array(COLNO));
const right_ptrs = Array.from({ length: ROWNO }, () => new Int16Array(COLNO));

// Double-buffered COULD_SEE bitmap
const cs_buf0 = Array.from({ length: ROWNO }, () => new Uint8Array(COLNO));
const cs_buf1 = Array.from({ length: ROWNO }, () => new Uint8Array(COLNO));
const cs_rmin0 = new Int16Array(ROWNO).fill(COLNO);
const cs_rmax0 = new Int16Array(ROWNO).fill(0);
const cs_rmin1 = new Int16Array(ROWNO).fill(COLNO);
const cs_rmax1 = new Int16Array(ROWNO).fill(0);

function mark_visible_range(row, left, right) {
    if (left > right) return;
    const rowp = game.cs_rows?.[row];
    if (!rowp) return;
    for (let i = left; i <= right; i++) rowp[i] = COULD_SEE;
    if (game.cs_left[row] > left) game.cs_left[row] = left;
    if (game.cs_right[row] < right) game.cs_right[row] = right;
}

function heroSeesInvisible() {
    const property = game.u?.uprops?.[SEE_INVIS];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// defsym.h keeps every wall cmap entry in the contiguous half-open range
// [S_stone, S_ndoor).  C's is_lightblocker_mappear() expresses this as
// mappearance < S_ndoor because a valid furniture appearance is nonnegative.
function isWallMimicAppearance(appearance) {
    return appearance >= S_stone && appearance < S_ndoor;
}

// C refs: monst.h is_lightblocker_mappear(); vision.c does_block().
function mimicBlocksLight(x, y) {
    const monster = m_at(x, y, game);
    if (!monster || (monster.minvis && !heroSeesInvisible())) return false;
    const appearanceType = monster.m_ap_type & M_AP_TYPMASK;
    if (appearanceType === M_AP_OBJECT)
        return monster.mappearance === BOULDER;
    return appearanceType === M_AP_FURNITURE
        && (monster.mappearance === S_hcdoor
            || monster.mappearance === S_vcdoor
            || isWallMimicAppearance(monster.mappearance)
            || monster.mappearance === S_tree);
}

function blocksVisionAt(x, y) {
    // Vision state is a game-global singleton, like vision.c's levl,
    // level.objects, monster grid, and region registry.
    const level = game.level;
    const loc = level.at(x, y);
    if (!loc) return true;
    const typ = loc.typ ?? 0;
    if (typ < POOL) return true;  // STONE, walls, SDOOR, SCORR
    if (typ === DOOR) {
        // rm.doormask aliases the shared flags field in C.  Generated levels
        // use flags while some focused callers still populate doormask.
        const mask = loc.flags || loc.doormask || 0;
        if (mask & (D_CLOSED | D_LOCKED | D_TRAPPED)) return true;
    }
    const drawbridgeMask = loc.flags || loc.drawbridgemask || 0;
    const moat = !on_level(game.u?.uz, game.juiblex_level)
        && (typ === MOAT
            || (typ === DRAWBRIDGE_UP
                && (drawbridgeMask & DB_UNDER) === DB_MOAT));
    if (typ === CLOUD || typ === WATER || typ === LAVAWALL
        || (game.u?.uinwater && moat)) {
        return true;
    }
    for (let object = level.objects?.[x]?.[y] ?? null;
        object;
        object = object.nexthere) {
        if (object.otyp === BOULDER) return true;
    }
    if (mimicBlocksLight(x, y)) return true;
    if (visible_region_at(x, y, game)) return true;
    return false;
}

// C ref: vision.c does_block(). The level and vision arrays are game-global
// singletons in both implementations.
export function does_block(x, y, _location = null, state = game) {
    if (state !== game)
        throw new Error('does_block requires the active game state');
    return blocksVisionAt(x, y);
}

function rebuildVisionPoint(x, y, state) {
    if (state !== game)
        throw new Error('vision point mutation requires the active game state');
    const affectedCurrentVision = Boolean(state.viz_array?.[y]?.[x]);
    const oldVisionMin = state._viz_rmin;
    const oldVisionMax = state._viz_rmax;
    vision_reset();
    state._viz_rmin = oldVisionMin;
    state._viz_rmax = oldVisionMax;
    if (affectedCurrentVision) state.vision_full_recalc = 1;
}

// C refs: vision.c block_point(), unblock_point(), recalc_block_point().
// The JS owner rebuilds the compact transparency index as a unit; preserving
// the prior display bounds gives the same subsequent vision_recalc() contract.
export function block_point(x, y, state = game) {
    rebuildVisionPoint(x, y, state);
}

export function unblock_point(x, y, state = game) {
    rebuildVisionPoint(x, y, state);
}

export function recalc_block_point(x, y, state = game) {
    rebuildVisionPoint(x, y, state);
}

// C ref: vision_reset() — rebuild viz_clear and left/right ptrs
export function vision_reset() {
    const level = game.level;
    if (!level) return;

    for (let y = 0; y < ROWNO; y++) {
        viz_clear[y].fill(0);
        let dig_left = 0;
        let block = true;
        for (let x = 1; x < COLNO; x++) {
            const cur_block = blocksVisionAt(x, y);
            if (block !== cur_block) {
                if (block) {
                    for (let i = dig_left; i < x; i++) {
                        left_ptrs[y][i] = dig_left;
                        right_ptrs[y][i] = x - 1;
                    }
                } else {
                    let i = dig_left;
                    if (dig_left) dig_left--;
                    for (; i < x; i++) {
                        left_ptrs[y][i] = dig_left;
                        right_ptrs[y][i] = x;
                        viz_clear[y][i] = 1;
                    }
                }
                dig_left = x;
                block = !block;
            }
        }
        let i = dig_left;
        if (!block && dig_left) dig_left--;
        for (; i < COLNO; i++) {
            left_ptrs[y][i] = dig_left;
            right_ptrs[y][i] = COLNO - 1;
            viz_clear[y][i] = block ? 0 : 1;
        }
    }
    game._viz_rmin = null;
    game._viz_rmax = null;
}

// Bresenham quadrant path functions (C ref: vision.c q1-q4_path)
function q1_path(srow, scol, y2, x2) {
    let x = scol, y = srow;
    const dx = x2 - x, dy = y - y2;
    const dxs = dx << 1, dys = dy << 1;
    if (dy > dx) {
        let err = dxs - dy;
        for (let k = dy - 1; k; k--) {
            if (err >= 0) { x++; err -= dys; }
            y--;
            err += dxs;
            if (!viz_clear[y][x]) return 0;
        }
    } else {
        let err = dys - dx;
        for (let k = dx - 1; k; k--) {
            if (err >= 0) { y--; err -= dxs; }
            x++;
            err += dys;
            if (!viz_clear[y][x]) return 0;
        }
    }
    return 1;
}

function q2_path(srow, scol, y2, x2) {
    let x = scol, y = srow;
    const dx = x - x2, dy = y - y2;
    const dxs = dx << 1, dys = dy << 1;
    if (dy > dx) {
        let err = dxs - dy;
        for (let k = dy - 1; k; k--) {
            if (err >= 0) { x--; err -= dys; }
            y--;
            err += dxs;
            if (!viz_clear[y][x]) return 0;
        }
    } else {
        let err = dys - dx;
        for (let k = dx - 1; k; k--) {
            if (err >= 0) { y--; err -= dxs; }
            x--;
            err += dys;
            if (!viz_clear[y][x]) return 0;
        }
    }
    return 1;
}

function q3_path(srow, scol, y2, x2) {
    let x = scol, y = srow;
    const dx = x - x2, dy = y2 - y;
    const dxs = dx << 1, dys = dy << 1;
    if (dy > dx) {
        let err = dxs - dy;
        for (let k = dy - 1; k; k--) {
            if (err >= 0) { x--; err -= dys; }
            y++;
            err += dxs;
            if (!viz_clear[y][x]) return 0;
        }
    } else {
        let err = dys - dx;
        for (let k = dx - 1; k; k--) {
            if (err >= 0) { y++; err -= dxs; }
            x--;
            err += dys;
            if (!viz_clear[y][x]) return 0;
        }
    }
    return 1;
}

function q4_path(srow, scol, y2, x2) {
    let x = scol, y = srow;
    const dx = x2 - x, dy = y2 - y;
    const dxs = dx << 1, dys = dy << 1;
    if (dy > dx) {
        let err = dxs - dy;
        for (let k = dy - 1; k; k--) {
            if (err >= 0) { x++; err -= dys; }
            y++;
            err += dxs;
            if (!viz_clear[y][x]) return 0;
        }
    } else {
        let err = dys - dx;
        for (let k = dx - 1; k; k--) {
            if (err >= 0) { y++; err -= dxs; }
            x++;
            err += dys;
            if (!viz_clear[y][x]) return 0;
        }
    }
    return 1;
}

// C ref: vision.c clear_path(). The quadrant routines deliberately skip the
// two endpoints and test only intervening cells against viz_clear.
export function clear_path(col1, row1, col2, row2) {
    if (col1 < col2) {
        return row1 > row2
            ? q1_path(row1, col1, row2, col2)
            : q4_path(row1, col1, row2, col2);
    }
    if (row1 > row2) return q2_path(row1, col1, row2, col2);
    if (row1 === row2 && col1 === col2) return 1;
    return q3_path(row1, col1, row2, col2);
}

function circle_offset(range, rowOffset) {
    return circle_data[circle_start[range] + rowOffset];
}

// C ref: vision.c right_side()
function right_side(row, left, right_mark, limitsIdx) {
    const nrow = row + game.vis_step;
    const deeper = nrow >= 0 && nrow < ROWNO
        && (limitsIdx < 0 || circle_data[limitsIdx] >= circle_data[limitsIdx + 1]);
    const lim_max = limitsIdx >= 0
        ? Math.min(COLNO - 1, game.vis_start_col + circle_data[limitsIdx])
        : COLNO - 1;
    if (right_mark > lim_max) right_mark = lim_max;
    const nextLimIdx = limitsIdx >= 0 ? limitsIdx + 1 : -1;

    while (left <= right_mark) {
        let right_edge = right_ptrs[row][left];
        if (right_edge > lim_max) right_edge = lim_max;

        if (!viz_clear[row][left]) {
            if (right_edge > right_mark) {
                right_edge = (row - game.vis_step >= 0 && row - game.vis_step < ROWNO && viz_clear[row - game.vis_step][right_mark])
                    ? right_mark + 1 : right_mark;
            }
            mark_visible_range(row, left, right_edge);
            left = right_edge + 1;
            continue;
        }

        if (left !== game.vis_start_col) {
            for (; left <= right_edge; left++) {
                const result = game.vis_step < 0
                    ? q1_path(game.vis_start_row, game.vis_start_col, row, left)
                    : q4_path(game.vis_start_row, game.vis_start_col, row, left);
                if (result) break;
            }
            if (left > lim_max) return;
            if (left === lim_max) {
                mark_visible_range(row, lim_max, lim_max);
                return;
            }
            if (left >= right_edge) { left = right_edge; continue; }
        }

        let right;
        if (right_mark < right_edge) {
            for (right = right_mark; right <= right_edge; right++) {
                const result = game.vis_step < 0
                    ? q1_path(game.vis_start_row, game.vis_start_col, row, right)
                    : q4_path(game.vis_start_row, game.vis_start_col, row, right);
                if (!result) break;
            }
            right--;
        } else {
            right = right_edge;
        }

        if (left <= right) {
            if (left === right && left === game.vis_start_col && game.vis_start_col < COLNO - 1
                && !viz_clear[row][game.vis_start_col + 1]) {
                right = game.vis_start_col + 1;
            }
            if (right > lim_max) right = lim_max;
            mark_visible_range(row, left, right);
            if (deeper) right_side(nrow, left, right, nextLimIdx);
            left = right + 1;
        }
    }
}

// C ref: vision.c left_side()
function left_side(row, left_mark, right, limitsIdx) {
    const nrow = row + game.vis_step;
    const deeper = nrow >= 0 && nrow < ROWNO
        && (limitsIdx < 0 || circle_data[limitsIdx] >= circle_data[limitsIdx + 1]);
    const lim_min = limitsIdx >= 0
        ? Math.max(0, game.vis_start_col - circle_data[limitsIdx])
        : 0;
    if (left_mark < lim_min) left_mark = lim_min;
    const nextLimIdx = limitsIdx >= 0 ? limitsIdx + 1 : -1;

    while (right >= left_mark) {
        let left_edge = left_ptrs[row][right];
        if (left_edge < lim_min) left_edge = lim_min;

        if (!viz_clear[row][right]) {
            if (left_edge < left_mark) {
                left_edge = (row - game.vis_step >= 0 && row - game.vis_step < ROWNO && viz_clear[row - game.vis_step][left_mark])
                    ? left_mark - 1 : left_mark;
            }
            mark_visible_range(row, left_edge, right);
            right = left_edge - 1;
            continue;
        }

        if (right !== game.vis_start_col) {
            for (; right >= left_edge; right--) {
                const result = game.vis_step < 0
                    ? q2_path(game.vis_start_row, game.vis_start_col, row, right)
                    : q3_path(game.vis_start_row, game.vis_start_col, row, right);
                if (result) break;
            }
            if (right < lim_min) return;
            if (right === lim_min) {
                mark_visible_range(row, lim_min, lim_min);
                return;
            }
            if (right <= left_edge) { right = left_edge; continue; }
        }

        let left;
        if (left_mark > left_edge) {
            for (left = left_mark; left >= left_edge; left--) {
                const result = game.vis_step < 0
                    ? q2_path(game.vis_start_row, game.vis_start_col, row, left)
                    : q3_path(game.vis_start_row, game.vis_start_col, row, left);
                if (!result) break;
            }
            left++;
        } else {
            left = left_edge;
        }

        if (left <= right) {
            if (left === right && right === game.vis_start_col && game.vis_start_col > 0
                && !viz_clear[row][game.vis_start_col - 1]) {
                left = game.vis_start_col - 1;
            }
            if (left < lim_min) left = lim_min;
            mark_visible_range(row, left, right);
            if (deeper) left_side(nrow, left, right, nextLimIdx);
            right = left - 1;
        }
    }
}

// C ref: vision.c view_from()
function view_from(srow, scol, cs_rows, cs_left, cs_right, range = 0) {
    game.vis_start_col = scol;
    game.vis_start_row = srow;
    game.cs_rows = cs_rows;
    game.cs_left = cs_left;
    game.cs_right = cs_right;

    let left, right;
    if (viz_clear[srow][scol]) {
        left = left_ptrs[srow][scol];
        right = right_ptrs[srow][scol];
    } else {
        left = !scol ? 0
            : (viz_clear[srow][scol - 1] ? left_ptrs[srow][scol - 1] : scol - 1);
        right = scol === COLNO - 1 ? COLNO - 1
            : (viz_clear[srow][scol + 1] ? right_ptrs[srow][scol + 1] : scol + 1);
    }

    let limitsIdx = -1;
    if (range) {
        if (left < scol - range) left = scol - range;
        if (right > scol + range) right = scol + range;
        limitsIdx = circle_start[range] + 1;
    }

    mark_visible_range(srow, left, right);

    const nrow_down = srow + 1;
    if (nrow_down < ROWNO) {
        game.vis_step = 1;
        if (scol < COLNO - 1) right_side(nrow_down, scol, right, limitsIdx);
        if (scol) left_side(nrow_down, left, scol, limitsIdx);
    }
    const nrow_up = srow - 1;
    if (nrow_up >= 0) {
        game.vis_step = -1;
        if (scol < COLNO - 1) right_side(nrow_up, scol, right, limitsIdx);
        if (scol) left_side(nrow_up, left, scol, limitsIdx);
    }
}

// C ref: vision_recalc(control)
export function vision_recalc(control = 0) {
    const u = game.u;
    if (!u || !game.level) return;
    game.vision_full_recalc = 0;
    if (game.in_mklev) return;

    // Swap to unused buffer
    const next = game.active_buf === 0 ? cs_buf1 : cs_buf0;
    const next_rmin = game.active_buf === 0 ? cs_rmin1 : cs_rmin0;
    const next_rmax = game.active_buf === 0 ? cs_rmax1 : cs_rmax0;

    for (let y = 0; y < ROWNO; y++) {
        next[y].fill(0);
        next_rmin[y] = COLNO;
        next_rmax[y] = 0;
    }

    if (control !== 2) {
        view_from(u.uy, u.ux, next, next_rmin, next_rmax);
    }

    const level = game.level;
    const ux = u.ux, uy = u.uy;

    // C ref: vision.c vision_recalc(), Blind branch. Keep COULD_SEE so
    // monster line-of-sight remains available, but grant the hero no
    // IN_SIGHT cells and remove anything which was visible previously.
    if (control !== 2 && heroIsBlind(u)) {
        const oldArray = game.viz_array;
        game.viz_array = next;
        game.active_buf = game.active_buf === 0 ? 1 : 0;
        if (oldArray) {
            for (let row = 0; row < ROWNO; ++row) {
                for (let col = 0; col < COLNO; ++col) {
                    if (oldArray[row][col] & IN_SIGHT) newsym(col, row);
                }
            }
        }
        game._viz_rmin = next_rmin;
        game._viz_rmax = next_rmax;
        return;
    }

    // The current vision subset models the ordinary one-square night-vision
    // range. C computes night vision before overlaying mobile light sources.
    for (let row = 0; row < ROWNO; row++) {
        for (let col = next_rmin[row]; col <= next_rmax[row]; col++) {
            if (!(next[row][col] & COULD_SEE)) continue;
            if (Math.abs(col - ux) <= 1 && Math.abs(row - uy) <= 1)
                next[row][col] |= IN_SIGHT;
        }
    }

    // C ref: vision.c vision_recalc() -> light.c do_light_sources().
    do_light_sources(next, {
        state: game,
        clearPath: clear_path,
        circleOffset: circle_offset,
    });

    // Convert permanent and mobile lighting within line of sight to IN_SIGHT.
    for (let row = 0; row < ROWNO; row++) {
        const dy = Math.sign(uy - row);
        for (let col = next_rmin[row]; col <= next_rmax[row]; col++) {
            if (!(next[row][col] & COULD_SEE)
                || (next[row][col] & IN_SIGHT)) continue;
            const loc = level?.at(col, row);
            if (!loc) continue;

            if (loc.lit || (next[row][col] & TEMP_LIT)) {
                if ((loc.typ === DOOR || loc.typ === SDOOR || IS_WALL(loc.typ))
                    && !viz_clear[row]?.[col]) {
                    // Walls/doors: only IN_SIGHT if adjacent cell toward hero is lit
                    const dx = Math.sign(ux - col);
                    const flev = level?.at(col + dx, row + dy);
                    if (flev?.lit
                        || (next[row + dy]?.[col + dx] & TEMP_LIT)) {
                        next[row][col] |= IN_SIGHT;
                    }
                } else {
                    next[row][col] |= IN_SIGHT;
                }
            }
        }
    }

    // Swap viz_array and run newsym updates
    const old_array = game.viz_array;
    game.viz_array = next;
    game.active_buf = game.active_buf === 0 ? 1 : 0;

    const old_rmin = game._viz_rmin;
    const old_rmax = game._viz_rmax;
    if (old_array && control !== 2 && game.level) {
        for (let row = 0; row < ROWNO; row++) {
            const old_row = old_array[row];
            const next_row = next[row];
            const start = old_rmin
                ? Math.min(old_rmin[row], next_rmin[row])
                : next_rmin[row];
            const stop = old_rmax
                ? Math.max(old_rmax[row], next_rmax[row])
                : next_rmax[row];
            if (start > stop) continue;
            const dy = Math.sign(uy - row);
            for (let col = start; col <= stop; col++) {
                const nv = next_row[col];
                const ov = old_row[col];
                const loc = game.level.at(col, row);
                if (!loc) continue;

                if (nv & IN_SIGHT) {
                    const oldseenv = loc.seenv || 0;
                    const sv = seenv_matrix[dy + 1][(col < ux) ? 0 : (col > ux ? 2 : 1)];
                    loc.seenv = (loc.seenv || 0) | sv;
                    if (!(ov & IN_SIGHT) || oldseenv !== loc.seenv) {
                        newsym(col, row);
                    }
                } else if ((nv & COULD_SEE)
                    && (loc.lit || (nv & TEMP_LIT))) {
                    if ((IS_WALL(loc.typ) || loc.typ === DOOR || loc.typ === SDOOR)
                        && !viz_clear[row][col]) {
                        const dx = Math.sign(ux - col);
                        const adjLoc = game.level.at(col + dx, row + dy);
                        if (adjLoc?.lit
                            || (next[row + dy]?.[col + dx] & TEMP_LIT)) {
                            next_row[col] |= IN_SIGHT;
                            const oldseenv = loc.seenv || 0;
                            const sv = seenv_matrix[dy + 1][(col < ux) ? 0 : (col > ux ? 2 : 1)];
                            loc.seenv = (loc.seenv || 0) | sv;
                            if (!(ov & IN_SIGHT) || oldseenv !== loc.seenv)
                                newsym(col, row);
                        }
                    } else {
                        next_row[col] |= IN_SIGHT;
                        const oldseenv = loc.seenv || 0;
                        const sv = seenv_matrix[dy + 1][(col < ux) ? 0 : (col > ux ? 2 : 1)];
                        loc.seenv = (loc.seenv || 0) | sv;
                        if (!(ov & IN_SIGHT) || oldseenv !== loc.seenv)
                            newsym(col, row);
                    }
                } else if ((nv & COULD_SEE) && loc.waslit) {
                    loc.waslit = 0;
                    newsym(col, row);
                } else {
                    if ((ov & IN_SIGHT)
                        || ((nv & COULD_SEE) ^ (ov & COULD_SEE))) {
                        newsym(col, row);
                    }
                }
            }
        }
        if (ux > 0) newsym(ux, uy);
    }

    game._viz_rmin = next_rmin;
    game._viz_rmax = next_rmax;
}

// C ref: cansee(x, y). The optional state keeps focused rendering calls on
// the same owner; production uses the default game singleton.
export function cansee(x, y, state = game) {
    if (y < 0 || y >= ROWNO || x < 0 || x >= COLNO) return false;
    return !!(state.viz_array?.[y]?.[x] & IN_SIGHT);
}

// C ref: couldsee(x, y). The optional state mirrors cansee()'s focused-call
// ownership while production continues to use the game singleton.
export function couldsee(x, y, state = game) {
    if (y < 0 || y >= ROWNO || x < 0 || x >= COLNO) return false;
    return !!(state.viz_array?.[y]?.[x] & COULD_SEE);
}

export function init_vision_globals() {
    // A runSegment() call is a new NetHack process.  C's file-static vision
    // buffers therefore begin zeroed for every segment; clear the module
    // buffers explicitly so a prior game cannot redraw stale visible cells
    // while initializing a blind hero.
    for (let row = 0; row < ROWNO; ++row) {
        cs_buf0[row].fill(0);
        cs_buf1[row].fill(0);
    }
    cs_rmin0.fill(COLNO);
    cs_rmax0.fill(0);
    cs_rmin1.fill(COLNO);
    cs_rmax1.fill(0);
    game.viz_array = cs_buf0;
    game.active_buf = 0;
    game.vision_full_recalc = 0;
    game.vis_step = 0;
    game.vis_start_col = 0;
    game.vis_start_row = 0;
    game.cs_rows = null;
    game.cs_left = null;
    game.cs_right = null;
    game._viz_rmin = null;
    game._viz_rmax = null;
}
