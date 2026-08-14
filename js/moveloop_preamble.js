// moveloop_preamble.js -- State established before the first command.
// C ref: allmain.c moveloop_preamble().

import {
    FULL_MOON,
    LUCKMAX,
    LUCKMIN,
    NEW_MOON,
    NORMAL_SPEED,
} from './const.js';
import { friday_13th, phase_of_the_moon } from './calendar.js';
import { set_wear } from './do_wear.js';
import { game } from './gstate.js';
import { update_inventory } from './invent.js';
import {
    pickup,
    preflight_initial_pickup,
    reset_justpicked,
} from './pickup.js';
import { rnd } from './rng.js';
import { initrack } from './track.js';
import { ttyPline } from './tty_message.js';

// C ref: attrib.c change_luck().
export function change_luck(amount, state = game) {
    const current = state.u?.uluck ?? 0;
    state.u.uluck = Math.max(LUCKMIN, Math.min(LUCKMAX, current + amount));
}

// encumber_msg() remains at its source boundary. Monster visibility deferral
// remains with the future vision subsystem.
export async function moveloop_preamble(
    resuming = false,
    state = game,
    env = {},
) {
    state.flags ??= {};
    state.iflags ??= {};
    state.program_state ??= {};
    state.context ??= {};
    state.disp ??= {};
    state.u ??= {};

    // Deferred explore-mode entry is restore-only and belongs with restore.
    state.flags.moonphase = phase_of_the_moon(state);
    if (state.flags.moonphase === FULL_MOON) {
        await ttyPline('You are lucky!  Full moon tonight.', state);
        change_luck(1, state);
    } else if (state.flags.moonphase === NEW_MOON) {
        await ttyPline('Be careful!  New moon tonight.', state);
    }

    state.flags.friday13 = friday_13th(state);
    if (state.flags.friday13) {
        await ttyPline(
            'Watch out!  Bad things can happen on Friday the 13th.',
            state,
        );
        change_luck(-1, state);
    }

    if (!resuming) {
        state.program_state.beyond_savefile_load = 1;
        state.context.rndencode = rnd(9000);

        // C ref: allmain.c:73 set_wear((struct obj *) 0), "for side-effects of
        // starting gear". u_init.c ini_inv_use_obj() dressed the hero with
        // bare setworn() calls, so this is where the <X>_on() callbacks run
        // over the finished gear; do_wear.c set_wear() lists what each one
        // does for the types a new game can start in.
        set_wear(state);
        preflight_initial_pickup(state);
        reset_justpicked(state.invent);
        await pickup(1, state);

        state.context.seer_turn = rnd(30);
        state.u.umovement = NORMAL_SPEED;
        initrack(state);
    }

    state.disp.botlx = true;
    if (resuming) {
        // read_engr_at() and fix_shop_damage() belong to restore/map state.
    }

    state.u.uz0 ??= { dnum: 0, dlevel: 0 };
    state.u.uz ??= { dnum: 0, dlevel: 0 };
    state.u.uz0.dlevel = state.u.uz.dlevel;
    state.context.move = 0;

    if (state.iflags.fuzzerpending) {
        // include/flag.h: fuzzer_impossible_panic is enum value 1.
        state.iflags.debug_fuzzer = 1;
        state.iflags.fuzzerpending = false;
    }
    state.program_state.in_moveloop = 1;
    if (state.iflags.perm_invent) {
        update_inventory({
            state,
            hooks: env.hooks,
        });
    }
    return state;
}
