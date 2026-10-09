// Pure selection algebra from src/nhlsel.c:
// l_selection_or() and l_selection_sub().
import { COLNO, ROWNO } from './const.js';
import { ThemeroomSelection } from './themerooms.js';

function checkSelection(selection) {
    if (!(selection instanceof ThemeroomSelection))
        throw new TypeError('selection operator requires two selections');
}

// selvar.c selection_getpoint(): decode its signed-char (value + 1) storage.
function selectionPoint(selection, x, y) {
    if (x < 0 || x >= COLNO || y < 0 || y >= ROWNO) return 0;
    return selection.points[y * COLNO + x] - 1;
}

// l_selection_push_new() result bounds are the minimal rectangle containing
// nonzero values; an empty selection retains C's invalid (COLNO,ROWNO,0,0) box.
function selectionBounds(selection) {
    let lx = COLNO;
    let ly = ROWNO;
    let hx = 0;
    let hy = 0;
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            if (!selectionPoint(selection, x, y)) continue;
            lx = Math.min(lx, x);
            ly = Math.min(ly, y);
            hx = Math.max(hx, x);
            hy = Math.max(hy, y);
        }
    }
    return { lx, ly, hx, hy };
}

// rect_bounds() in rect.c.
function rectBounds(a, b) {
    return {
        lx: Math.min(a.lx, b.lx),
        ly: Math.min(a.ly, b.ly),
        hx: Math.max(a.hx, b.hx),
        hy: Math.max(a.hy, b.hy),
    };
}

// C nhlsel.c l_selection_or(): Lua __bor and __add. Preserve each numeric
// selection value, the C x-major/y-minor evaluation order, and the left input's
// JavaScript coordinate-frame marker (both C operands share one map frame).
export function l_selection_or(a, b) {
    checkSelection(a);
    checkSelection(b);
    const bounds = rectBounds(selectionBounds(a), selectionBounds(b));
    const result = new ThemeroomSelection(null, a.absolute);
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            result.set(x, y, selectionPoint(a, x, y) | selectionPoint(b, x, y));
        }
    }
    return result;
}

// C nhlsel.c l_selection_sub(): Lua __sub. The source expression
// (a_pt ^ b_pt) & a_pt retains the original point's unexcluded bits.
export function l_selection_sub(a, b) {
    checkSelection(a);
    checkSelection(b);
    const bounds = rectBounds(selectionBounds(a), selectionBounds(b));
    const result = new ThemeroomSelection(null, a.absolute);
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            const aPoint = selectionPoint(a, x, y);
            const bPoint = selectionPoint(b, x, y);
            result.set(x, y, (aPoint ^ bPoint) & aPoint);
        }
    }
    return result;
}
