// Elemental destruction of monster inventory.
// C refs: zap.c destroy_items(), destroyable(), and maybe_destroy_item().

import {
    FIRE_RES,
    OBJ_MINVENT,
} from './const.js';
import {
    monsterPossessive,
} from './do_name.js';
import {
    obfree,
    obj_extract_self,
} from './invent.js';
import {
    monster_resists_element,
} from './mondata.js';
import { objectGenerationEnv } from './object_generation.js';
import { donameFresh } from './objnam.js';
import {
    weight,
} from './obj.js';
import {
    GLOB_OF_GREEN_SLIME,
    POT_OIL,
    POTION_CLASS,
    SCR_FIRE,
    SCROLL_CLASS,
    SPE_BOOK_OF_THE_DEAD,
    SPE_FIREBALL,
    SPBOOK_CLASS,
} from './objects.js';
import { canSeeMonster } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';

function withoutObjectArticle(name) {
    return name.replace(/^(?:an?|the) /u, '').replace(/^\d+ /u, '');
}

export function fire_object_name_at_quantity(obj, quantity, state) {
    const original = obj.quan;
    obj.quan = quantity;
    try {
        return withoutObjectArticle(donameFresh(obj, state));
    } finally {
        obj.quan = original;
    }
}

function fireDestroyable(obj) {
    if (obj.oartifact || (obj.in_use && obj.quan === 1)) return false;
    if (obj.otyp === SCR_FIRE || obj.otyp === SPE_FIREBALL) return false;
    return obj.otyp === GLOB_OF_GREEN_SLIME
        || obj.oclass === POTION_CLASS
        || obj.oclass === SCROLL_CLASS
        || obj.oclass === SPBOOK_CLASS;
}

async function removeObjectQuantity(obj, quantity, env) {
    const lifecycleEnv = objectGenerationEnv(env);
    if (quantity < obj.quan) {
        obj.quan -= quantity;
        obj.owt = weight(obj, lifecycleEnv);
        return;
    }
    obj_extract_self(obj, lifecycleEnv);
    obfree(obj, null, lifecycleEnv);
}

function destroyedItemSubject(monster, obj, destroyed, available, state) {
    const singular = fire_object_name_at_quantity(obj, 1, state);
    const plural = fire_object_name_at_quantity(obj, 2, state);
    const owner = monsterPossessive(monster, state);
    if (destroyed === 1 && available === 1)
        return `${monsterPossessive(monster, state, true)} ${singular}`;
    const prefix = destroyed === 1
        ? 'One of '
        : destroyed < available ? 'Some of '
            : available === 2 ? 'Both of ' : 'All of ';
    return `${prefix}${owner} ${plural}`;
}

async function maybeDestroyMonsterFireItem(monster, obj, env) {
    const visible = canSeeMonster(monster, env.state);
    if (obj.otyp === SPE_BOOK_OF_THE_DEAD) {
        if (visible) {
            await ttyPline(
                `${monsterPossessive(monster, env.state, true)} `
                + `${fire_object_name_at_quantity(obj, 1, env.state)} glows `
                + 'a strange dark red, but remains intact.',
                env.state,
            );
        }
        return 0;
    }

    const available = Math.trunc(obj.quan) - (obj.in_use ? 1 : 0);
    let damage;
    let singularVerb;
    let pluralVerb;
    if (obj.oclass === POTION_CLASS) {
        damage = env.random.rnd(6);
        if (obj.otyp === POT_OIL) {
            singularVerb = 'ignites and explodes';
            pluralVerb = 'ignite and explode';
        } else {
            singularVerb = 'boils and explodes';
            pluralVerb = 'boil and explode';
        }
    } else if (obj.oclass === SCROLL_CLASS) {
        damage = 1;
        singularVerb = 'catches fire and burns';
        pluralVerb = 'catch fire and burn';
    } else if (obj.oclass === SPBOOK_CLASS) {
        damage = 1;
        singularVerb = 'catches fire and burns';
        pluralVerb = '';
    } else {
        damage = Math.trunc((obj.owt + 19) / 20);
        singularVerb = 'boils and explodes';
        pluralVerb = 'boil and explode';
    }

    let destroyed = 0;
    for (let index = 0; index < available; ++index) {
        if (!env.random.rn2(3)) ++destroyed;
    }
    if (!destroyed) return 0;

    if (visible) {
        await ttyPline(
            `${destroyedItemSubject(
                monster,
                obj,
                destroyed,
                available,
                env.state,
            )} ${destroyed > 1 ? pluralVerb : singularVerb}!`,
            env.state,
        );
    }
    await removeObjectQuantity(obj, destroyed, env);
    const carrierResists = obj.oclass !== POTION_CLASS
        && obj.otyp !== GLOB_OF_GREEN_SLIME
        && monster_resists_element(monster, FIRE_RES, env.state);
    return carrierResists ? 0 : damage;
}

// The damage-scaled rn2(5), reservoir selection, per-stack damage roll, and
// per-item rn2(3) calls retain their source order.
export async function destroy_monster_fire_items(monster, damage, env) {
    let limit = Math.trunc(damage / 5);
    if (damage % 5 > env.random.rn2(5)) ++limit;
    limit = Math.min(limit, 20);
    if (limit < 1) return 0;

    const selected = Array(limit).fill(null);
    let eligible = 0;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (!fireDestroyable(obj)) continue;
        const index = eligible < limit
            ? eligible
            : env.random.rn2(eligible);
        ++eligible;
        if (index < limit) selected[index] = obj;
    }
    let extraDamage = 0;
    for (let index = 0; index < Math.min(eligible, limit); ++index) {
        const obj = selected[index];
        if (obj?.where === OBJ_MINVENT && obj.ocarry === monster) {
            extraDamage += await maybeDestroyMonsterFireItem(
                monster,
                obj,
                env,
            );
        }
    }
    return extraDamage;
}
