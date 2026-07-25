// Magic and fire trap effects on monsters.
// C refs: trap.c trapeffect_magic_trap(), trapeffect_fire_trap(),
// thitm(), burnarmor(), and erode_obj().

import {
    FIRE_RES,
    MAX_ERODE,
    W_ARM,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_ARMU,
    W_ARMS,
} from './const.js';
import {
    capitalizedMonsterName,
    monsterCommonName,
    monsterPossessive,
} from './do_name.js';
import { dist2 } from './hacklib.js';
import {
    monster_resists_element,
} from './mondata.js';
import {
    PM_LEATHER_GOLEM,
    PM_PAPER_GOLEM,
    PM_STRAW_GOLEM,
    PM_WOOD_GOLEM,
} from './monsters.js';
import {
    erosionMatters,
    isFlammable,
    objectType,
} from './obj.js';
import {
    ALCHEMY_SMOCK,
    ARMOR_CLASS,
    GLASS,
    IRON,
    MITHRIL,
    MUMMY_WRAPPING,
    OBJ_DESCR,
    OBJ_NAME,
    ROBE,
    TOWEL,
} from './objects.js';
import { canSeeMonster } from './startup_a11y.js';
import { t_at } from './trap.js';
import {
    monster_avoids_known_trap,
    monster_learns_trap,
    nearby_monsters_learn_trap,
    reveal_monster_trap,
} from './trap_monster_shared.js';
import {
    ignite_items,
} from './apply_catch_lit.js';
import { ttyPline } from './tty_message.js';
import { cansee } from './vision.js';
import { which_armor } from './weapon.js';
import {
    burn_floor_objects,
    destroy_monster_fire_items,
    fire_object_name_at_quantity,
} from './zap_destroy_items.js';

function fireOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(
            `monster fire trap requires a ${name} operation`,
        );
    }
    return operation;
}

const MATERIAL_NAMES = Object.freeze([
    'mysterious',
    'liquid',
    'wax',
    'organic',
    'flesh',
    'paper',
    'cloth',
    'leather',
    'wooden',
    'bone',
    'dragonhide',
    'iron',
    'metal',
    'copper',
    'silver',
    'gold',
    'platinum',
    'mithril',
    'plastic',
    'glass',
    'gemstone',
    'stone',
]);

function pluralArmorDescription(description) {
    return /(?:boots|gloves|gauntlets|shoes)$/u.test(description);
}

function armorDescription(obj, slot, state) {
    const type = objectType(obj, state);
    const actual = OBJ_NAME(type, state) ?? '';
    const appearance = OBJ_DESCR(type, state) ?? '';
    switch (slot) {
    case W_ARMH: {
        const material = Math.trunc(type.oc_material);
        const hard = (material >= IRON && material <= MITHRIL)
            || (material === GLASS && obj.oclass === ARMOR_CLASS);
        return `${MATERIAL_NAMES[material] ?? 'mysterious'} `
            + `${hard ? 'helm' : 'hat'}`;
    }
    case W_ARMC:
        if (obj.otyp === ROBE) return 'robe';
        if (obj.otyp === MUMMY_WRAPPING) return 'wrapping';
        if (obj.otyp === ALCHEMY_SMOCK)
            return type.oc_name_known && obj.dknown ? 'smock' : 'apron';
        return 'cloak';
    case W_ARM:
        return fire_object_name_at_quantity(obj, 1, state);
    case W_ARMU:
        return 'shirt';
    case W_ARMS:
        return 'wooden shield';
    case W_ARMG:
        return obj.dknown
            && (type.oc_name_known ? actual : appearance)
                .toLowerCase().includes('gauntlets')
            ? 'gauntlets'
            : 'gloves';
    case W_ARMF:
        return obj.dknown
            && `${appearance} ${type.oc_name_known ? actual : ''}`
                .toLowerCase().includes('shoes')
            ? 'shoes'
            : 'boots';
    default:
        throw new RangeError(`unsupported armor slot ${slot}`);
    }
}

async function erodeMonsterArmor(obj, description, monster, env) {
    if (!obj
        || !erosionMatters(obj, env.state)
        || !isFlammable(obj, env.state)) {
        return false;
    }
    if (obj.oerodeproof && obj.rknown) return false;

    if (obj.oerodeproof
        || (obj.blessed && !env.random.rnl(4))) {
        if (obj.oerodeproof
            && env.state.flags?.verbose !== false
            && canSeeMonster(monster, env.state)) {
            const verb = pluralArmorDescription(description) ? 'are' : 'is';
            await ttyPline(
                `Somehow, ${monsterPossessive(monster, env.state)} `
                + `${description} ${verb} not affected by the heat.`,
                env.state,
            );
        }
        if (obj.oerodeproof) obj.rknown = true;
        return false;
    }
    if (Math.trunc(obj.oeroded ?? 0) >= MAX_ERODE) return false;

    const nextErosion = Math.trunc(obj.oeroded ?? 0) + 1;
    if (canSeeMonster(monster, env.state)) {
        const verb = pluralArmorDescription(description)
            ? 'smoulder'
            : 'smoulders';
        const adverb = nextErosion === MAX_ERODE
            ? ' completely'
            : nextErosion > 1 ? ' further' : '';
        await ttyPline(
            `${monsterPossessive(monster, env.state, true)} `
            + `${description} ${verb}${adverb}!`,
            env.state,
        );
    }
    obj.oeroded = nextErosion;
    return true;
}

// The no-equipment branch is observable: rn2(5) repeats until the torso
// case, which returns true even without torso armor and short-circuits the
// caller's rn2(3).
export async function burn_monster_armor(monster, env) {
    const { random, state } = env;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.otyp !== TOWEL || Math.trunc(obj.spe ?? 0) <= 0)
            continue;
        const oldSpe = Math.trunc(obj.spe);
        const newSpe = random.rn2(oldSpe + 1);
        if (newSpe === oldSpe) continue;
        if (canSeeMonster(monster, state)) {
            const towel = oldSpe < 3 ? 'moist towel' : 'wet towel';
            await ttyPline(
                `${monsterPossessive(monster, state, true)} ${towel} `
                + `dries${newSpe ? '' : ' out'}.`,
                state,
            );
        }
        obj.spe = Math.max(0, Math.min(7, newSpe));
        break;
    }

    while (true) {
        let slot;
        switch (random.rn2(5)) {
        case 0: slot = W_ARMH; break;
        case 1: {
            const torso = which_armor(monster, W_ARMC)
                ?? which_armor(monster, W_ARM)
                ?? which_armor(monster, W_ARMU);
            if (torso) {
                const torsoSlot = torso.owornmask & W_ARMC
                    ? W_ARMC
                    : torso.owornmask & W_ARM ? W_ARM : W_ARMU;
                await erodeMonsterArmor(
                    torso,
                    armorDescription(torso, torsoSlot, state),
                    monster,
                    env,
                );
            }
            return true;
        }
        case 2: slot = W_ARMS; break;
        case 3: slot = W_ARMG; break;
        case 4: slot = W_ARMF; break;
        default:
            throw new RangeError('burnarmor rn2(5) result was out of range');
        }
        const armor = which_armor(monster, slot);
        if (!armor) continue;
        const damaged = await erodeMonsterArmor(
            armor,
            armorDescription(armor, slot, state),
            monster,
            env,
        );
        if (damaged) return false;
    }
}

export async function trigger_monster_fire(monster, trap, env) {
    const killMonster = fireOperation(env, 'killMonster');
    const { random, state } = env;
    const x = trap.tx;
    const y = trap.ty;
    const inSight = canSeeMonster(monster, state)
        || monster === state.u.usteed;
    const seeSquare = cansee(x, y, state);
    const originalDamage = random.d(2, 4);
    if (inSight) {
        await ttyPline(
            `A tower of flame erupts from the floor under `
            + `${monsterCommonName(monster, state)}!`,
            state,
        );
    } else if (seeSquare) {
        await ttyPline(
            'You see a tower of flame erupt from the floor!',
            state,
        );
    }

    let killed = false;
    if (monster_resists_element(monster, FIRE_RES, state)) {
        if (inSight) {
            await ttyPline(
                `${capitalizedMonsterName(monster, state)} is uninjured.`,
                state,
            );
        }
    } else {
        let damage = originalDamage;
        let alternateDamage = 0;
        let immolate = false;
        switch (monster.data?.pmidx) {
        case PM_PAPER_GOLEM:
            immolate = true;
            alternateDamage = monster.mhpmax;
            break;
        case PM_STRAW_GOLEM:
            alternateDamage = Math.trunc(monster.mhpmax / 2);
            break;
        case PM_WOOD_GOLEM:
            alternateDamage = Math.trunc(monster.mhpmax / 4);
            break;
        case PM_LEATHER_GOLEM:
            alternateDamage = Math.trunc(monster.mhpmax / 8);
            break;
        default:
            break;
        }
        damage = Math.max(damage, alternateDamage);
        monster.mhp -= damage;
        if (monster.mhp < 1) {
            await killMonster(
                monster,
                capitalizedMonsterName(monster, state),
                { ...env, noCorpse: immolate },
            );
            killed = true;
        } else {
            monster.mhpmax -= random.rn2(damage + 1);
            if (monster.mhp > monster.mhpmax)
                monster.mhp = monster.mhpmax;
        }
    }

    if (await burn_monster_armor(monster, env) || random.rn2(3)) {
        const extraDamage = await destroy_monster_fire_items(
            monster,
            originalDamage,
            env,
        );
        await ignite_items(monster.minvent, env);
        if (!killed && extraDamage) {
            monster.mhp -= extraDamage;
            if (monster.mhp < 1) {
                await killMonster(
                    monster,
                    capitalizedMonsterName(monster, state),
                    env,
                );
                killed = true;
            }
        }
    }
    const burned = await burn_floor_objects(
        x,
        y,
        seeSquare,
        false,
        {
            ...env,
            igniteItems: ignite_items,
        },
    );
    if (burned
        && !seeSquare
        && dist2(x, y, state.u.ux, state.u.uy) <= 9) {
        await ttyPline('You smell smoke.', state);
    }
    if (seeSquare && t_at(x, y, state))
        reveal_monster_trap(trap);
    return killed;
}

export async function trigger_monster_magic(monster, trap, env) {
    if (monster_avoids_known_trap(monster, trap, env)) return false;
    monster_learns_trap(monster, trap.ttyp);
    nearby_monsters_learn_trap(trap, env.state);
    if (env.random.rn2(21))
        return false;
    return trigger_monster_fire(monster, trap, env);
}
