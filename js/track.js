// track.js -- Hero movement history.
// C ref: track.c initrack(), settrack(), and hastrack().

import { game } from './gstate.js';
import { RIN_STEALTH } from './objects.js';

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

// C ref: track.c settrack().  A worn ring of stealth suppresses footprints;
// the intrinsic Stealth property deliberately does not.
export function settrack(state = game) {
    if (state.uleft?.otyp === RIN_STEALTH
        || state.uright?.otyp === RIN_STEALTH) {
        return false;
    }
    const track = state.track ?? initrack(state);
    if (track.utcnt < UTSZ) track.utcnt++;
    if (track.utpnt === UTSZ) track.utpnt = 0;
    track.utrack[track.utpnt].x = state.u.ux;
    track.utrack[track.utpnt].y = state.u.uy;
    track.utpnt++;
    return true;
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
