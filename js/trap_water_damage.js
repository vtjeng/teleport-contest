// Water damage for items.
// C ref: trap.c water_damage() (4712-4852) and water_damage_chain().
//
// water_damage_monster_equipment() handles the monster-equipment path
// (rust traps and rust monster attacks). water_damage() handles the
// general case for hero items: dipfountain(), dip-into-pool, and the
// pool/moat entry path in water_damage_chain().

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
import { carried } from './obj.js';
import { cxname } from './objnam.js';
import { erode_obj } from './trap_erode_obj.js';
import { ttyPline } from './tty_message.js';

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

// ── water_damage ──
// C ref: trap.c water_damage() (4712-4852). General water damage for
// hero-carried items. Called by dipfountain() and the dip-into-pool
// arm of dodip(). The `force` parameter skips the luck-based protection
// check; dipfountain and pool dipping always pass force=TRUE.
//
// Fail-closed branches: CAN_OF_GREASE, TOWEL/wet_a_towel, greased with
// potion of acid, container/waterproof, scroll blanking, spellbook blanking,
// potion dilution/acid. These throw so the scorer stops at the first
// unexercised branch rather than silently skipping it.
export async function water_damage(obj, description, force, env = {}) {
    if (!obj) return ER_NOTHING;

    const state = env.state;
    const message = env.message ?? ttyPline;
    const random = env.random ?? (await import('./rng.js'));

    // C ref: trap.c:4722-4723. splash_lit() extinguishes lit items.
    // For hero-carried items that are not lamplit, this returns false.
    if (obj.lamplit) {
        throw new WaterDamageError(
            'splash_lit() for a lit hero-carried item');
    }

    const in_invent = carried(obj);
    if (!description) description = cxname(obj, state);

    // C ref: trap.c:4728-4729. Can of grease absorbs water.
    const { CAN_OF_GREASE, TOWEL: TOWEL_OTYP } = await import('./objects.js');
    if (obj.otyp === CAN_OF_GREASE && (obj.spe ?? 0) > 0) {
        return ER_NOTHING;
    }

    // C ref: trap.c:4730-4734. Towel gets wetter.
    if (obj.otyp === TOWEL_OTYP && (obj.spe ?? 0) < 7) {
        throw new WaterDamageError(
            'wet_a_towel() for towel water damage');
    }

    // C ref: trap.c:4736-4750. Greased item.
    if (obj.greased) {
        if (!random.rn2(2)) {
            obj.greased = false;
            if (in_invent) {
                const { yname } = await import('./objnam.js');
                await message(
                    `The grease on ${yname(obj, state)} washes off.`,
                    state);
                const { update_inventory } = await import('./invent.js');
                update_inventory(env);
            }
            // C ref: trap.c:4744-4748. Ungreased potion of acid is destroyed.
            const { POT_ACID } = await import('./objects.js');
            if (obj.otyp === POT_ACID) {
                throw new WaterDamageError(
                    'pot_acid_damage() after grease washes off');
            }
        }
        return ER_GREASED;
    }

    // C ref: trap.c:4751-4770. Container and waterproof container.
    // obj.h: Is_container(o) = (o->otyp >= LARGE_BOX && o->otyp <= BAG_OF_TRICKS)
    const { LARGE_BOX, BAG_OF_TRICKS } = await import('./objects.js');
    if (obj.otyp >= LARGE_BOX && obj.otyp <= BAG_OF_TRICKS) {
        throw new WaterDamageError(
            'water damage to container contents');
    }

    // C ref: trap.c:4771-4777. Luck-based protection (skipped when force).
    if (!force) {
        const luck = state.u?.uluck ?? 0;
        if ((luck + 5) > random.rn2(20)) {
            return ER_NOTHING;
        }
    }

    // C ref: trap.c:4778-4792. Scroll blanking.
    const { SCROLL_CLASS, SPBOOK_CLASS, POTION_CLASS } =
        await import('./objects.js');
    if (obj.oclass === SCROLL_CLASS) {
        throw new WaterDamageError(
            'scroll blanking in water_damage()');
    }

    // C ref: trap.c:4793-4823. Spellbook blanking.
    if (obj.oclass === SPBOOK_CLASS) {
        throw new WaterDamageError(
            'spellbook blanking in water_damage()');
    }

    // C ref: trap.c:4824-4847. Potion dilution / acid destruction.
    if (obj.oclass === POTION_CLASS) {
        throw new WaterDamageError(
            'potion dilution/destruction in water_damage()');
    }

    // C ref: trap.c:4849. Default: rust erosion.
    return erode_obj(obj, description, ERODE_RUST, EF_NONE, env);
}

// Thrown when water_damage() reaches a branch this port has not ported.
export class WaterDamageError extends Error {
    constructor(reason) {
        super(`water_damage requires ${reason}`);
        this.name = 'WaterDamageError';
        this.reason = reason;
    }
}
