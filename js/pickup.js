// Inventory burden feedback and floor-square inspection owned by pickup.c.
// C refs: pickup.c encumber_msg(), pickup() and check_here().

import {
    LOOKHERE_NOFLAGS,
    LOOKHERE_PICKED_SOME,
    is_pit,
} from './const.js';
import { flush_screen } from './display.js';
import { can_reach_floor, read_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { near_capacity, nomul } from './hack.js';
import { look_here } from './invent.js';
import { notake } from './mondata.js';
import { is_lava, is_pool, t_at } from './trap.js';
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

// A floor square this port cannot answer for yet.
export class UnsupportedPickupError extends Error {
    constructor(reason) {
        super(`unsupported pickup: ${reason}`);
        this.name = 'UnsupportedPickupError';
        this.reason = reason;
    }
}

// C ref: pickup.c pickup() (672-910), through the two arms that answer without
// taking anything: the early return for a square holding nothing, and the
// `autopickup && !flags.pickup` arm that describes the square instead. do.c
// goto_level() calls pickup(1) as its last statement, which is the caller this
// covers.
//
// The whole selection half below those arms -- autopick(), query_objlist() and
// pickup_object() -- stops instead. Reaching it needs `autopickup` set, and
// what it would do is the object-pickup work.
export async function pickup(what, state = game) {
    const u = state.u;
    const autopickup = what > 0;

    if (u.uswallow) {
        // The engulfed arm picks from u.ustuck->minvent rather than the floor.
        throw new UnsupportedPickupError('pickup() inside a monster');
    }
    if (autopickup && Math.trunc(state.multi ?? 0) < 0) {
        // unconscious() is HERO_FAINTED || u.usleep || ...; the elapsed-turn
        // boundary refuses every state that sets it.
        throw new UnsupportedPickupError('pickup() while helpless');
    }
    state.gp ??= {};
    state.gp.pickup_encumbrance = 0;

    const objectHere = Boolean(
        state.level?.objects?.[u.ux]?.[u.uy] ?? null,
    );
    if (autopickup
        && (state.context?.nopick || !objectHere
            || (is_pool(u.ux, u.uy, state) && !u.uinwater)
            || is_lava(u.ux, u.uy, state))) {
        if (state.flags?.mention_decor) {
            // describe_decor() and its iflags.prev_decor memory are unported;
            // ROADMAP.md lists them with the decor work.
            throw new UnsupportedPickupError(
                'pickup() with mention_decor set',
            );
        }
        await read_engr_at(u.ux, u.uy, state, {
            pline: ttyPline,
            canReachFloor: can_reach_floor,
        });
        return 0;
    }

    const trap = t_at(u.ux, u.uy, state);
    if (!can_reach_floor(Boolean(trap && is_pit(trap.ttyp)), state)) {
        // The unconditional describe_decor() on this arm has no owner, and
        // reaching the arm at all needs levitation, a steed or a pit.
        throw new UnsupportedPickupError(
            'pickup() by a hero who cannot reach the floor',
        );
    }

    if (notake(state.youmonst?.data)) {
        throw new UnsupportedPickupError(
            'pickup() by a hero who cannot take objects',
        );
    }
    if ((Math.trunc(state.multi ?? 0) && !state.context?.run)
        || (autopickup && !state.flags?.pickup)) {
        await check_here(false, state);
        return 0;
    }

    if (objectHere && state.context?.run && state.context.run !== 8
        && !state.context.nopick) {
        nomul(0, state);
    }

    throw new UnsupportedPickupError('pickup() selecting objects to take');
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
