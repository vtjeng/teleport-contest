// mon.js -- Runtime monster turn state.
// C ref: mon.c mcalcmove().

import { MFAST, MSLOW, NORMAL_SPEED } from './const.js';
import { game } from './gstate.js';
import { rn2 } from './rng.js';

// C ref: mon.c mcalcmove(). Adjust a monster's base speed, then randomly
// round a moving monster to a multiple of NORMAL_SPEED. The rounding draw is
// unconditional, including when the adjusted speed already has no remainder.
export function mcalcmove(
    monster,
    monsterMoving,
    state = game,
    random = rn2,
) {
    let movement = monster.data.mmove;

    if (monster.mspeed === MSLOW) {
        movement = movement < NORMAL_SPEED
            ? Math.trunc((2 * movement + 1) / 3)
            : 4 + Math.trunc(movement / 3);
    } else if (monster.mspeed === MFAST) {
        movement = Math.trunc((4 * movement + 2) / 3);
    }

    if (monster === state.u?.usteed && state.u.ugallop
        && state.context?.mv) {
        movement = Math.trunc((random(2) ? 4 : 5) * movement / 3);
    }

    if (monsterMoving) {
        const adjustment = movement % NORMAL_SPEED;
        movement -= adjustment;
        if (random(NORMAL_SPEED) < adjustment)
            movement += NORMAL_SPEED;
    }
    return movement;
}
