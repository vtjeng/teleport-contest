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

// C ref: track.c hastrack(). Only the populated prefix is meaningful even
// after the circular insertion point has wrapped.
export function hastrack(x, y, state = game) {
    const count = Math.trunc(state.track?.utcnt ?? 0);
    const track = state.track?.utrack ?? [];
    for (let index = 0; index < count; ++index) {
        if (track[index]?.x === x && track[index]?.y === y) return true;
    }
    return false;
}
