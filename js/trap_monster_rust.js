// Rust-trap effects on monsters.
// C ref: trap.c trapeffect_rust_trap(), monster branch.

import {
    ARM,
    ER_NOTHING,
    HEAD,
    W_AMUL,
    W_ARM,
    W_ARMC,
    W_ARMG,
    W_ARMH,
    W_ARMS,
    W_ARMU,
    W_SWAPWEP,
    W_WEP,
} from './const.js';
import { monsterCommonName } from './do_name.js';
import {
    is_vampshifter,
    nonliving,
} from './mondata.js';
import {
    AD_RUST,
    PM_GREMLIN,
    PM_IRON_GOLEM,
} from './monsters.js';
import {
    cloak_simple_name,
    gloves_simple_name,
    helm_simple_name,
    suit_simple_name,
} from './objnam.js';
import { AMULET_OF_LIFE_SAVING } from './objects.js';
import { splash_monster_light } from './apply_splash_lit.js';
import { mbodypart } from './polyself.js';
import { canSeeMonster } from './startup_a11y.js';
import {
    monster_avoids_known_trap,
    monster_learns_trap,
    monster_skips_floor_trap,
    nearby_monsters_learn_trap,
    reveal_monster_trap,
} from './trap_monster_shared.js';
import {
    water_damage_monster_equipment,
} from './trap_water_damage.js';
import { ttyPline } from './tty_message.js';
import { which_armor } from './weapon.js';
import { bimanual } from './worn.js';

function rustOperation(env, name, fallback) {
    const operation = env[name] ?? fallback;
    if (typeof operation !== 'function')
        throw new TypeError(`monster rust trap requires a ${name} operation`);
    return operation;
}

function monsterLifeSaver(monster) {
    if (nonliving(monster.data) && !is_vampshifter(monster)) return null;
    const amulet = which_armor(monster, W_AMUL);
    return amulet?.otyp === AMULET_OF_LIFE_SAVING ? amulet : null;
}

function rustMonsterName(monster, state, env) {
    return rustOperation(
        env,
        'monsterName',
        monsterCommonName,
    )(monster, state);
}

function capitalized(name) {
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

async function damageArmor(monster, slot, description, env) {
    const waterDamage = rustOperation(
        env,
        'waterDamage',
        water_damage_monster_equipment,
    );
    return waterDamage(
        which_armor(monster, slot),
        description,
        env,
    );
}

export async function trigger_monster_rust(monster, trap, env) {
    const { random, state } = env;
    if (monster_skips_floor_trap(monster, env)) return false;

    const ironGolem = monster.data?.pmidx === PM_IRON_GOLEM;
    const gremlin = monster.data?.pmidx === PM_GREMLIN;
    const killMonster = ironGolem
        ? rustOperation(env, 'killMonster')
        : null;
    const splitMonster = gremlin
        ? rustOperation(env, 'splitMonster')
        : null;
    if (monster_avoids_known_trap(monster, trap, env)) return false;
    monster_learns_trap(monster, trap.ttyp);
    nearby_monsters_learn_trap(trap, state);

    const visible = canSeeMonster(monster, state)
        || monster === state.u.usteed;
    if (visible) reveal_monster_trap(trap);
    const aim = random.rn2(5);
    const name = visible ? rustMonsterName(monster, state, env) : '';
    const waterDamage = rustOperation(
        env,
        'waterDamage',
        water_damage_monster_equipment,
    );

    switch (aim) {
    case 0: {
        if (visible) {
            await ttyPline(
                `A gush of water hits ${name} on the `
                + `${mbodypart(monster, HEAD)}!`,
                state,
            );
        }
        const helmet = which_armor(monster, W_ARMH);
        await waterDamage(
            helmet,
            helm_simple_name(helmet, state),
            env,
        );
        break;
    }
    case 1: {
        if (visible) {
            await ttyPline(
                `A gush of water hits ${name}'s left `
                + `${mbodypart(monster, ARM)}!`,
                state,
            );
        }
        if (await damageArmor(monster, W_ARMS, 'shield', env)
            !== ER_NOTHING) {
            break;
        }
        if (monster.mw && bimanual(monster.mw, state))
            await waterDamage(monster.mw, null, env);
        const gloves = which_armor(monster, W_ARMG);
        await waterDamage(
            gloves,
            gloves_simple_name(gloves, state),
            env,
        );
        break;
    }
    case 2: {
        if (visible) {
            await ttyPline(
                `A gush of water hits ${name}'s right `
                + `${mbodypart(monster, ARM)}!`,
                state,
            );
        }
        await waterDamage(monster.mw, null, env);
        const gloves = which_armor(monster, W_ARMG);
        await waterDamage(
            gloves,
            gloves_simple_name(gloves, state),
            env,
        );
        break;
    }
    default: {
        if (visible)
            await ttyPline(`A gush of water hits ${name}!`, state);
        const splashLight = rustOperation(
            env,
            'splashLight',
            splash_monster_light,
        );
        for (let obj = monster.minvent; obj; obj = obj.nobj) {
            if (obj.lamplit
                && !(obj.owornmask & (W_WEP | W_SWAPWEP))) {
                await splashLight(obj, env);
            }
        }
        let armor = which_armor(monster, W_ARMC);
        if (armor) {
            await waterDamage(
                armor,
                cloak_simple_name(armor, state),
                env,
            );
            break;
        }
        armor = which_armor(monster, W_ARM);
        if (armor) {
            await waterDamage(
                armor,
                suit_simple_name(armor, state),
                env,
            );
            break;
        }
        armor = which_armor(monster, W_ARMU);
        if (armor) await waterDamage(armor, 'shirt', env);
        break;
    }
    }

    if (ironGolem) {
        if (visible) {
            const lifeSaver = rustOperation(
                env,
                'monsterLifeSaver',
                monsterLifeSaver,
            )(monster, state);
            await ttyPline(
                `${capitalized(name)} `
                + `${lifeSaver ? 'starts to fall' : 'falls'} to pieces!`,
                state,
            );
        }
        await killMonster(monster, null, {
            ...env,
            damageType: AD_RUST,
        });
        return monster.mhp < 1;
    }
    if (gremlin && random.rn2(3))
        await splitMonster(monster, null, env);
    return false;
}
