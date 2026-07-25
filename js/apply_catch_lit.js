// Fire ignition of lamps, candles, candelabra, and oil.
// C refs: apply.c catch_lit() and timeout.c begin_burn().

import {
    OBJ_FLOOR,
    OBJ_MINVENT,
} from './const.js';
import {
    monsterPossessive,
} from './do_name.js';
import { objectGenerationEnv } from './object_generation.js';
import { discover_object } from './o_init.js';
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
import { ttyPline } from './tty_message.js';
import { cansee } from './vision.js';
import {
    fire_object_name_at_quantity,
} from './zap_destroy_items.js';

function ignitionOperation(env, name, fallback) {
    const operation = env[name] ?? fallback;
    if (typeof operation !== 'function') {
        throw new TypeError(`item ignition requires a ${name} operation`);
    }
    return operation;
}

function ignitable(obj) {
    return obj.otyp === BRASS_LANTERN
        || obj.otyp === OIL_LAMP
        || (obj.otyp === MAGIC_LAMP && obj.spe > 0)
        || obj.otyp === CANDELABRUM_OF_INVOCATION
        || obj.otyp === TALLOW_CANDLE
        || obj.otyp === WAX_CANDLE
        || obj.otyp === POT_OIL;
}

export async function catch_item_light(obj, env) {
    if (obj.lamplit || !ignitable(obj)) return false;
    if (obj.where !== OBJ_FLOOR && obj.where !== OBJ_MINVENT) {
        const unsupported = ignitionOperation(
            env,
            'unsupported',
            (reason) => {
                throw new RangeError(`unsupported item ignition: ${reason}`);
            },
        );
        return unsupported('non-floor, non-monster inventory');
    }
    const carrier = obj.where === OBJ_MINVENT ? obj.ocarry : null;
    if (carrier && !carrier.mx) return false;
    if (((obj.otyp === MAGIC_LAMP
            || obj.otyp === CANDELABRUM_OF_INVOCATION)
            && obj.spe === 0)
        || (obj.otyp !== MAGIC_LAMP && Math.trunc(obj.age ?? 0) === 0)
        || obj.otyp === BRASS_LANTERN
        || (obj.otyp === CANDELABRUM_OF_INVOCATION && obj.cursed)) {
        return false;
    }
    if ((obj.otyp === OIL_LAMP || obj.otyp === MAGIC_LAMP)
        && obj.cursed && !env.random.rn2(2)) {
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
    const visible = obj.where === OBJ_FLOOR
        ? squareVisible(obj.ox, obj.oy, env.state)
        : carrier
            && squareVisible(carrier.mx, carrier.my, env.state);
    if (visible) {
        const name = fire_object_name_at_quantity(obj, 1, env.state);
        const subject = carrier
            ? `${monsterPossessive(carrier, env.state, true)} ${name}`
            : `${/^[aeiou]/iu.test(name) ? 'An' : 'A'} ${name}`;
        await message(`${subject} catches light!`, env.state);
    }
    if (obj.otyp === POT_OIL) {
        discoverObject(
            obj.otyp,
            true,
            true,
            true,
            env.state,
            objectGenerationEnv(env),
        );
    }
    beginBurn(obj, false, objectGenerationEnv(env));
    return true;
}

export async function ignite_items(head, env) {
    const byFloor = head?.where === OBJ_FLOOR;
    for (let obj = head; obj;) {
        const next = byFloor ? obj.nexthere : obj.nobj;
        if (!obj.lamplit && !obj.in_use)
            await catch_item_light(obj, env);
        obj = next;
    }
}
