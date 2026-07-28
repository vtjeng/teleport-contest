// Inventory burden feedback owned by pickup.c.
// C ref: pickup.c encumber_msg().

import { game } from './gstate.js';
import { near_capacity } from './hack.js';
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
