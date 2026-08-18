// Water damage for monster equipment selected by a rust trap.
// C ref: trap.c water_damage(), forced monster-equipment path.

import {
    EF_NONE,
    ERODE_RUST,
    ER_DAMAGED,
    ER_GREASED,
    ER_NOTHING,
    OBJ_MINVENT,
    W_ARMOR,
    W_WEP,
} from './const.js';
import { splash_monster_light } from './apply_splash_lit.js';
import { erode_obj } from './trap_erode_obj.js';

function waterOperation(env, name, fallback) {
    const operation = env[name] ?? fallback;
    if (typeof operation !== 'function') {
        throw new TypeError(
            `monster water damage requires a ${name} operation`,
        );
    }
    return operation;
}

// Rust traps pass force=TRUE and only select worn armor or MON_WEP().
// Keep other water_damage() callers fail-closed before any item mutation.
export async function water_damage_monster_equipment(
    obj,
    description,
    env,
) {
    if (!obj) return ER_NOTHING;
    const wornMask = Math.trunc(obj.owornmask ?? 0);
    if (obj.where !== OBJ_MINVENT
        || !obj.ocarry
        || !(wornMask & (W_ARMOR | W_WEP))) {
        throw new RangeError(
            'monster water damage requires worn armor or a wielded weapon',
        );
    }

    const splashLight = waterOperation(
        env,
        'splashLight',
        splash_monster_light,
    );
    if (await splashLight(obj, env)) return ER_DAMAGED;

    if (obj.greased) {
        if (!env.random.rn2(2)) obj.greased = false;
        return ER_GREASED;
    }

    const erodeObject = waterOperation(
        env,
        'erodeObject',
        erode_obj,
    );
    return erodeObject(
        obj,
        description,
        ERODE_RUST,
        EF_NONE,
        env,
    );
}
