// Inventory burden feedback and floor-square inspection owned by pickup.c.
// C refs: pickup.c encumber_msg() and check_here().

import { LOOKHERE_NOFLAGS, LOOKHERE_PICKED_SOME } from './const.js';
import { flush_screen } from './display.js';
import { can_reach_floor, read_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { near_capacity, nomul } from './hack.js';
import { look_here } from './invent.js';
import { ttyPline } from './tty_message.js';

const INCREASED_BURDEN_MESSAGES = Object.freeze([
    null,
    'Your movements are slowed slightly because of your load.',
    'You rebalance your load.  Movement is difficult.',
    'You stagger under your heavy load.  Movement is very hard.',
    'You can barely move a handspan with this load!',
    "You can't even move a handspan with this load!",
]);

const DECREASED_BURDEN_MESSAGES = Object.freeze([
    'Your movements are now unencumbered.',
    'Your movements are only slowed slightly by your load.',
    'You rebalance your load.  Movement is still difficult.',
    'You stagger under your load.  Movement is still very hard.',
]);

export async function encumber_msg(
    state = game,
    { message = ttyPline } = {},
) {
    state.go ??= {};
    const oldCapacity = Math.trunc(state.go.oldcap ?? 0);
    const newCapacity = near_capacity(state);
    let text = null;
    if (oldCapacity < newCapacity)
        text = INCREASED_BURDEN_MESSAGES[newCapacity] ?? null;
    else if (oldCapacity > newCapacity)
        text = DECREASED_BURDEN_MESSAGES[newCapacity] ?? null;

    if (text) {
        await message(text, state);
        state.disp ??= {};
        state.disp.botl = true;
    }
    state.go.oldcap = newCapacity;
    return newCapacity;
}

// C ref: pickup.c check_here(), reached from domove() through spoteffects()
// and pickup(). Its flags.mention_decor arm calls describe_decor(), which is
// not ported; js/hack.js refuses the squares that can produce a decor line
// before the move is admitted. uchain has no ported owner either, so every
// object on the square counts, as it does for an unpunished hero.
export async function check_here(picked_some, state = game) {
    let count = 0;
    for (let obj = state.level?.objects?.[state.u.ux]?.[state.u.uy] ?? null;
        obj;
        obj = obj.nexthere) {
        ++count;
    }

    if (count) {
        // Stepping onto objects ends a run before their description prints.
        if (state.context.run) nomul(0, state);
        await flush_screen(1);
        await look_here(
            count,
            picked_some ? LOOKHERE_PICKED_SOME : LOOKHERE_NOFLAGS,
            state,
            {
                message: ttyPline,
                readEngraving: () => read_engr_at(
                    state.u.ux,
                    state.u.uy,
                    state,
                    { pline: ttyPline, canReachFloor: can_reach_floor },
                ),
            },
        );
    } else {
        await read_engr_at(state.u.ux, state.u.uy, state, {
            pline: ttyPline,
            canReachFloor: can_reach_floor,
        });
    }
}
