// track.js -- Hero movement history.
// C ref: track.c initrack().

import { game } from './gstate.js';

const UTSZ = 100;

export function initrack(state = game) {
    state.track = {
        utcnt: 0,
        utpnt: 0,
        utrack: Array.from(
            { length: UTSZ },
            () => ({ x: 0, y: 0 }),
        ),
    };
    return state.track;
}
