// Projectile trap effects on monsters.
// C refs: trap.c mintrap(), trapeffect_arrow_trap(),
// trapeffect_dart_trap(), trapeffect_rocktrap(), t_missile(), and thitm().

import { newsym } from './display.js';
import { stackobj } from './invent.js';
import { passes_walls, unsolid } from './mondata.js';
import { objectGenerationEnv } from './object_generation.js';
import { donameFresh } from './objnam.js';
import {
    dealloc_obj,
    mksobj,
    place_object,
    weight,
} from './obj.js';
import {
    ARROW,
    DART,
    ROCK,
} from './objects.js';
import {
    canSeeMonster,
    canSpotMonster,
} from './startup_a11y.js';
import {
    delete_monster_trap,
    monster_avoids_known_trap,
    monster_learns_trap,
    monster_skips_floor_trap,
    nearby_monsters_learn_trap,
    reveal_monster_trap,
} from './trap_monster_shared.js';
import { ttyPline } from './tty_message.js';
import { cansee } from './vision.js';

function projectileOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(
            `monster projectile trap requires a ${name} operation`,
        );
    }
    return operation;
}

function trapMonsterName(monster, state, capitalized, env) {
    let name = canSpotMonster(monster, state)
        ? projectileOperation(env, 'monsterName')(monster, state)
        : 'it';
    if (capitalized)
        name = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    return name;
}

function trapMissile(otyp, trap, env) {
    const objectEnv = objectGenerationEnv(env);
    const missile = mksobj(otyp, true, false, objectEnv);
    missile.quan = 1;
    missile.owt = weight(missile, objectEnv);
    missile.opoisoned = false;
    missile.ox = trap.tx;
    missile.oy = trap.ty;
    return { missile, objectEnv };
}

async function triggerMissileTrap(
    monster,
    trap,
    env,
    {
        missileType,
        attackLevel,
        poisonDenominator = 0,
    },
) {
    const { random, state } = env;
    if (monster_skips_floor_trap(monster, env)) return false;
    const killMonster = projectileOperation(env, 'killMonster');
    const missileDamage = projectileOperation(env, 'missileDamage');
    const monsterArmorClass = projectileOperation(
        env,
        'monsterArmorClass',
    );
    projectileOperation(env, 'monsterName');
    if (monster_avoids_known_trap(monster, trap, env)) return false;
    monster_learns_trap(monster, trap.ttyp);
    nearby_monsters_learn_trap(trap, state);

    const inSight = canSeeMonster(monster, state)
        || monster === state.u.usteed;
    const seeSquare = cansee(monster.mx, monster.my, state);
    if (trap.once && trap.tseen && !random.rn2(15)) {
        if (inSight && seeSquare) {
            ttyPline(
                `${trapMonsterName(monster, state, true, env)} `
                + 'triggers a trap '
                + 'but nothing happens.',
                state,
            );
        }
        delete_monster_trap(trap, state);
        newsym(monster.mx, monster.my);
        return false;
    }

    trap.once = true;
    const { missile, objectEnv } = trapMissile(missileType, trap, env);
    if (poisonDenominator && !random.rn2(poisonDenominator))
        missile.opoisoned = true;
    if (inSight) reveal_monster_trap(trap);
    const strike = monsterArmorClass(monster, state)
        + attackLevel + Math.trunc(missile.spe ?? 0) <= random.rnd(20);
    if (!strike) {
        if (seeSquare) {
            const missileName = donameFresh(missile, state);
            ttyPline(
                `${trapMonsterName(monster, state, true, env)} `
                + `is almost hit by ${missileName}!`,
                state,
            );
        }
        place_object(missile, monster.mx, monster.my, objectEnv);
        stackobj(missile, objectEnv);
        return false;
    }

    if (seeSquare) {
        const missileName = donameFresh(missile, state);
        ttyPline(
            `${trapMonsterName(monster, state, true, env)} `
            + `is hit by ${missileName}!`,
            state,
        );
    }
    const damage = Math.max(
        missileDamage(missile, monster, state, random),
        1,
    );
    monster.mhp -= damage;
    let killed = false;
    if (monster.mhp < 1) {
        await killMonster(
            monster,
            seeSquare
                ? trapMonsterName(monster, state, true, env)
                : '',
            env,
        );
        killed = true;
    }
    dealloc_obj(missile, objectEnv);
    return killed;
}

export async function trigger_monster_arrow_trap(monster, trap, env) {
    return triggerMissileTrap(monster, trap, env, {
        missileType: ARROW,
        attackLevel: 8,
    });
}

// Poisoning is assigned before thitm() checks accuracy; against monsters it
// labels the projectile but does not add a separate poison-damage step.
export async function trigger_monster_dart_trap(monster, trap, env) {
    return triggerMissileTrap(monster, trap, env, {
        missileType: DART,
        attackLevel: 7,
        poisonDenominator: 6,
    });
}

// The damage override forces a hit without a to-hit draw and leaves the rock
// on the floor after either survival or death.
export async function trigger_monster_rock_trap(monster, trap, env) {
    const { random, state } = env;
    if (monster_skips_floor_trap(monster, env)) return false;
    const killMonster = projectileOperation(env, 'killMonster');
    projectileOperation(env, 'monsterName');
    if (monster_avoids_known_trap(monster, trap, env)) return false;
    monster_learns_trap(monster, trap.ttyp);
    nearby_monsters_learn_trap(trap, state);

    const inSight = canSeeMonster(monster, state)
        || monster === state.u.usteed;
    const seeSquare = cansee(monster.mx, monster.my, state);
    if (trap.once && trap.tseen && !random.rn2(15)) {
        if (inSight && seeSquare) {
            await ttyPline(
                `A trap door above `
                + `${trapMonsterName(monster, state, false, env)} `
                + 'opens, but nothing falls out!',
                state,
            );
        }
        delete_monster_trap(trap, state);
        newsym(monster.mx, monster.my);
        return false;
    }

    trap.once = true;
    const { missile: rock, objectEnv } = trapMissile(ROCK, trap, env);
    if (inSight) reveal_monster_trap(trap);
    const damage = random.d(2, 6);
    const harmless = passes_walls(monster.data) && !unsolid(monster.data);
    const rockName = donameFresh(rock, state);
    const monsterName = trapMonsterName(monster, state, true, env);
    if (seeSquare) {
        await ttyPline(
            `${monsterName} is hit by ${rockName}${harmless
                ? ' but is not harmed.'
                : '!'}`,
            state,
        );
    }

    let killed = false;
    if (!harmless) {
        monster.mhp -= damage;
        if (monster.mhp < 1) {
            await killMonster(monster, monsterName, env);
            killed = true;
        }
    }
    place_object(rock, trap.tx, trap.ty, objectEnv);
    stackobj(rock, objectEnv);
    return killed;
}
