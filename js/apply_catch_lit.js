// Fire ignition of lamps, candles, candelabra, and oil.
// C refs: apply.c catch_lit() and timeout.c begin_burn().

import {
    OBJ_FLOOR,
    OBJ_INVENT,
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

// An object the fire would set alight through a path this port has not
// reached. js/cmd.js failClosedCommandRefusals() lists this class, so the
// segment ends on its last matching screen instead of losing every screen the
// command had already earned.
export class UnsupportedItemIgnitionError extends Error {
    constructor(reason) {
        super(`unsupported item ignition: ${reason}`);
        this.name = 'UnsupportedItemIgnitionError';
        this.reason = reason;
    }
}

export async function catch_item_light(obj, env) {
    if (obj.lamplit || !ignitable(obj)) return false;
    if (obj.where !== OBJ_FLOOR && obj.where !== OBJ_MINVENT
        && obj.where !== OBJ_INVENT) {
        // C's own gate is get_obj_location() answering FALSE at 1581, which is
        // what a buried, migrating or contained object gets. The three `where`
        // values above are the ones it locates.
        throw new UnsupportedItemIgnitionError(
            'an object get_obj_location() does not place',
        );
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
    if (obj.where === OBJ_INVENT) {
        // Every guard C evaluates first has now run, so an object C declines
        // to light -- a brass lantern, an empty magic lamp or candelabrum, a
        // burnt-out candle, a cursed candelabrum, or a cursed lamp whose
        // rn2(2) came up zero -- has already answered false, and the draw that
        // last one makes has been spent.
        //
        // What remains is apply.c catch_lit():1598-1614, which announces the
        // item with Yname2() and otense(), makeknown()s a potion of oil, and
        // bills an unpaid one to the shopkeeper watching it burn. None of that
        // is ported, and zap.c zhitu():4437 is the caller that reaches it, one
        // hit in three for a hero carrying an oil lamp, a wax or tallow
        // candle, or a potion of oil.
        throw new UnsupportedItemIgnitionError("the hero's own pack");
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
