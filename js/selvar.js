// selvar.js — selection drawing ported from src/selvar.c:
// selection_do_randline().
//
// Other selvar.c operations still live beside their first callers
// (themerooms.js ThemeroomSelection, quest_levels.js selection_floodfill()).

import { COLNO, ROWNO } from './const.js';
import { rn2 } from './rng.js';

// C ref: selvar.c selection_do_randline(). Recursive midpoint displacement
// that draws a random zig-zag path from (x1,y1) to (x2,y2). The coordinates
// are map coordinates: the midpoint retry loop rejects points off the map,
// so a caller must not pass Lua-relative coordinates. `sel` must be a
// selection whose points are map coordinates. `rough` is a C schar; callers
// narrow it before the call. `random` has the rn2 shape and defaults to it.
export function selection_do_randline(x1, y1, x2, y2, rough, rec, sel, random = rn2) {
    if (rec < 1 || (x2 === x1 && y2 === y1))
        return;

    if (rough > Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)))
        rough = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));

    let mx, my;
    if (rough < 2) {
        mx = Math.trunc((x1 + x2) / 2);
        my = Math.trunc((y1 + y2) / 2);
    } else {
        do {
            const dx = random(rough) - Math.trunc(rough / 2);
            const dy = random(rough) - Math.trunc(rough / 2);
            mx = Math.trunc((x1 + x2) / 2) + dx;
            my = Math.trunc((y1 + y2) / 2) + dy;
        } while (mx > COLNO - 1 || mx < 0 || my < 0 || my > ROWNO - 1);
    }

    if (!sel.get(mx, my)) {
        sel.set(mx, my);
    }

    rough = Math.trunc((rough * 2) / 3);
    rec--;

    selection_do_randline(x1, y1, mx, my, rough, rec, sel, random);
    selection_do_randline(mx, my, x2, y2, rough, rec, sel, random);

    sel.set(x2, y2);
}
