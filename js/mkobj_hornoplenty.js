// C ref: mkobj.c hornoplenty() (2847-2936). Creates an object from a horn
// of plenty; mirrors bagotricks() in makemon.c.

import {
    ICE,
    IRONBARS,
    IS_ALTAR,
    Is_airlevel,
    Is_waterlevel,
    nothing_happens,
} from './const.js';
import {
    add_to_container,
    consume_obj_charge,
    hold_another_object,
    update_inventory,
} from './invent.js';
import { game } from './gstate.js';
import { can_reach_floor } from './engrave.js';
import { hitfloor } from './dothrow.js';
import { doaltarobj, dropy } from './do.js';
import { surface } from './dungeon.js';
import {
    carried,
    fixup_oil,
    mkobj,
    objectType,
    rnd_class,
    weight,
} from './obj.js';
import { addtobill } from './shk.js';
import { encumber_msg } from './pickup.js';
import { discover_object } from './o_init.js';
import { Doname2, The, aobjnam, otense, vtense } from './objnam.js';
import {
    FOOD_CLASS,
    FOOD_RATION,
    HORN_OF_PLENTY,
    LUMP_OF_ROYAL_JELLY,
    POTION_CLASS,
    POT_BOOZE,
    POT_OIL,
    POT_SICKNESS,
    POT_WATER,
} from './objects.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import { rn2 as coreRn2 } from './rng.js';


// Preserve obj.js's injected-random validation; this function only draws rn2.
function hornoplentyRandom(env) {
    const injected = env?.random;
    if (injected == null) return { rn2: coreRn2 };
    const names = ['rn2', 'rnd', 'rn1', 'rne'];
    if (!names.every((name) => typeof injected[name] === 'function')) {
        throw new TypeError(
            'random injection requires rn2, rnd, rn1, and rne',
        );
    }
    const random = Object.fromEntries(
        names.map((name) => [name, injected[name]]),
    );
    return { rn2: random.rn2 };
}

export async function hornoplenty(horn, tipping, targetbox, env = {}) {
    const state = env.state ?? game;
    const { rn2 } = hornoplentyRandom(env);
    const u = state.u;
    let objcount = 0;

    if (!horn || horn.otyp !== HORN_OF_PLENTY) {
        // C's impossible() emits only a diagnostic and returns void.
        note_unported('pline.c impossible');
    } else if (horn.spe < 1) {
        await ttyPline(nothing_happens, state);
        if (!horn.cknown) {
            horn.cknown = 1;
            update_inventory({ ...env, state });
        }
    } else {
        let obj;
        let what;

        consume_obj_charge(horn, !tipping, { ...env, state });
        if (!rn2(13)) {
            obj = mkobj(POTION_CLASS, false, { ...env, state });
            if (objectType(obj, state).oc_magic) {
                do {
                    obj.otyp = rnd_class(
                        POT_BOOZE,
                        POT_WATER,
                        { ...env, state },
                    );
                } while (obj.otyp === POT_SICKNESS);
                // Oil uses obj->age differently from other potions.
                if (obj.otyp === POT_OIL)
                    fixup_oil(obj, null, { ...env, state });
            }
            what = obj.quan > 1 ? 'Some potions' : 'A potion';
        } else {
            obj = mkobj(FOOD_CLASS, false, { ...env, state });
            if (obj.otyp === FOOD_RATION && !rn2(7))
                obj.otyp = LUMP_OF_ROYAL_JELLY;
            what = 'Some food';
        }
        ++objcount;
        await ttyPline(
            `${what} ${vtense(what, 'spill')} out.`,
            state,
        );
        obj.blessed = horn.blessed;
        obj.cursed = horn.cursed;
        obj.owt = weight(obj, { ...env, state });
        if (horn.unpaid)
            await addtobill(obj, false, false, tipping, state, env);

        state.iflags.suppress_price = (state.iflags.suppress_price ?? 0) + 1;
        if (!tipping) {
            // Preserve a caller hook; otherwise use pickup.c:encumber_msg.
            const holdHooks = {
                ...(env.hooks ?? {}),
                encumberMessage: env.hooks?.encumberMessage ?? encumber_msg,
            };
            obj = await hold_another_object(
                obj,
                u.uswallow
                    ? 'Oops!  %s out of your reach!'
                    : (Is_airlevel(u.uz)
                       || Is_waterlevel(u.uz)
                       || state.level.at(u.ux, u.uy).typ < IRONBARS
                       || state.level.at(u.ux, u.uy).typ >= ICE)
                        ? 'Oops!  %s away from you!'
                        : 'Oops!  %s to the floor!',
                The(aobjnam(obj, 'slip', state), state),
                null,
                { ...env, state, hooks: holdHooks },
            );
        } else if (targetbox) {
            add_to_container(targetbox, obj, { ...env, state });
            // C's add_to_container() deliberately leaves the weight stale.
            targetbox.owt = weight(targetbox, { ...env, state });
            if (carried(targetbox)) {
                await encumber_msg(state, env);
                update_inventory({ ...env, state });
            }
        } else if (!can_reach_floor(true, state)) {
            await hitfloor(obj, true, state, env);
        } else {
            if (IS_ALTAR(state.level.at(u.ux, u.uy).typ)) {
                await doaltarobj(obj, state);
            } else {
                await ttyPline(
                    `${Doname2(obj, state)} ${otense(obj, 'drop', state)} to the ${surface(u.ux, u.uy, state)}.`,
                    state,
                );
            }
            await dropy(obj, { ...env, state });
        }

        state.iflags.suppress_price -= 1;
        if (horn.dknown)
            discover_object(HORN_OF_PLENTY, true, true, true, state, env);
    }
    return objcount;
}
