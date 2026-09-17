// worm.js -- C ref: worm.c worm_known().

import { game } from './gstate.js';
import { cansee } from './vision.js';

// C ref: worm.c worm_known() (877-893). The segment array is the JS owner of
// wtails[worm->wormno]; a worm is known when any segment is in direct sight.
// Invisibility and telepathy are deliberately left to the caller, as in C.
export function worm_known(worm, state = game) {
    const segments = state.level?.worms?.[worm?.wormno]?.segments ?? [];
    return segments.some((segment) => cansee(
        segment.x ?? segment.wx,
        segment.y ?? segment.wy,
        state,
    ));
}
