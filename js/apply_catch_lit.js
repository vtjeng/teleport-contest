// Fire ignition of lamps, candles, candelabra, and oil.
// C refs: apply.c catch_lit() and timeout.c begin_burn().

import {
    OBJ_FLOOR,
    OBJ_INVENT,
    SHOPBASE,
} from './const.js';
import { game } from './gstate.js';
import { objectGenerationEnv } from './object_generation.js';
import { discover_object } from './o_init.js';
import { bill_dummy_object, carried } from './obj.js';
import { Yname2, otense, yname } from './objnam.js';
import { in_rooms } from './rooms.js';
import { costly_spot, shop_keeper } from './shk.js';
import { verbalize } from './pline.js';
import {
    BRASS_LANTERN,
    CANDELABRUM_OF_INVOCATION,
    MAGIC_LAMP,
    OIL_LAMP,
    POT_OIL,
    TALLOW_CANDLE,
    WAX_CANDLE,
} from './objects.js';
import { begin_burn } from './timeout.js';
import { get_obj_location } from './light.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import { cansee } from './vision.js';
import { heroIsBlind } from './startup_a11y.js';
import { rn2 } from './rng.js';

function ignitionOperation(env, name, fallback) {
    const operation = env[name] ?? fallback;
    if (typeof operation !== 'function') {
        throw new TypeError(`item ignition requires a ${name} operation`);
    }
    return operation;
}

// C ref: obj.h ignitable() (397-400). This is a pure type predicate.
export function ignitable(obj) {
    return obj.otyp === BRASS_LANTERN
        || obj.otyp === OIL_LAMP
        || (obj.otyp === MAGIC_LAMP && obj.spe > 0)
        || obj.otyp === CANDELABRUM_OF_INVOCATION
        || obj.otyp === TALLOW_CANDLE
        || obj.otyp === WAX_CANDLE
        || obj.otyp === POT_OIL;
}

// C ref: apply.c catch_lit() (1577-1625).
export async function catch_lit(obj, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    if (obj.lamplit || !ignitable(obj)) return false;
    const location = get_obj_location(obj, 0, state);
    if (!location) return false;
    if (((obj.otyp === MAGIC_LAMP
            || obj.otyp === CANDELABRUM_OF_INVOCATION)
            && obj.spe === 0)
        || ((obj.otyp === BRASS_LANTERN
                || obj.otyp === OIL_LAMP
                || obj.otyp === CANDELABRUM_OF_INVOCATION
                || obj.otyp === TALLOW_CANDLE
                || obj.otyp === WAX_CANDLE
                || obj.otyp === POT_OIL)
            && Math.trunc(obj.age ?? 0) === 0)
        || obj.otyp === BRASS_LANTERN
        || (obj.otyp === CANDELABRUM_OF_INVOCATION && obj.cursed)) {
        return false;
    }
    const random = env.random ?? { rn2 };
    if ((obj.otyp === OIL_LAMP || obj.otyp === MAGIC_LAMP)
        && obj.cursed && random.rn2(2) === 0) {
        return false;
    }

    const squareVisible = ignitionOperation(env, 'squareVisible', cansee);
    const message = ignitionOperation(env, 'message', ttyPline);
    const discoverObject = ignitionOperation(
        env,
        'discoverObject',
        discover_object,
    );
    const beginBurn = ignitionOperation(env, 'beginBurn', begin_burn);
    const costlySpot = ignitionOperation(env, 'costlySpot', costly_spot);
    const roomsAt = ignitionOperation(env, 'inRooms', in_rooms);
    const shopKeeper = ignitionOperation(env, 'shopKeeper', shop_keeper);
    const billDummyObject = ignitionOperation(
        env,
        'billDummyObject',
        bill_dummy_object,
    );
    const speak = ignitionOperation(
        env,
        'verbalize',
        (line, messageState) => verbalize(
            line,
            messageState,
            { message },
        ),
    );
    const blind = heroIsBlind(state);
    if (obj.where === OBJ_INVENT
        || squareVisible(location.x, location.y, state)) {
        if (obj.where === OBJ_FLOOR
            && squareVisible(location.x, location.y, state)) {
            // pline.c set_msg_xy() is a discarded void display-coordinate
            // update with no JavaScript owner yet.
            note_unported('pline.c set_msg_xy');
        }
        await message(
            `${Yname2(obj, state)} ${otense(obj, blind ? 'feel' : 'catch')} `
                + `${blind ? 'warm.' : 'light!'}`,
            state,
        );
    }
    if (obj.otyp === POT_OIL) {
        await discoverObject(
            obj.otyp,
            true,
            true,
            true,
            state,
            objectGenerationEnv(env),
        );
    }
    if (carried(obj) && obj.unpaid
        && costlySpot(state.u.ux, state.u.uy, state)) {
        // C's shop_keeper lookup precedes SetVoice; the no-sound TTY build
        // compiles SetVoice to an empty macro, but the lookup can still update
        // shop state when it first encounters an angry keeper.
        const roomno = roomsAt(
            state.u.ux,
            state.u.uy,
            SHOPBASE,
            state,
        )[0] ?? 0;
        shopKeeper(roomno, state);
        // C discards check_unpaid()'s void result. Record and skip its
        // unsupported fee path, then continue in source order.
        note_unported('shk.c check_unpaid');
        await speak(
            `That's in addition to the cost of ${yname(obj, state)} `
                + `${obj.quan === 1 ? 'itself' : 'themselves'}, of course.`,
            state,
        );
        await billDummyObject(obj, objectGenerationEnv(env));
    }
    await beginBurn(obj, false, objectGenerationEnv(env));
    return true;
}

export async function ignite_items(head, env) {
    const byFloor = head?.where === OBJ_FLOOR;
    for (let obj = head; obj;) {
        const next = byFloor ? obj.nexthere : obj.nobj;
        if (!obj.lamplit && !obj.in_use)
            await catch_lit(obj, env);
        obj = next;
    }
}
