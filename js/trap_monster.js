// Monster trap dispatch and result normalization.
// C refs: trap.c mintrap() and trapeffect_selector().

import {
    ANTI_MAGIC,
    ARROW_TRAP,
    BEAR_TRAP,
    DART_TRAP,
    FIRE_TRAP,
    HOLE,
    HURTLING,
    MAGIC_TRAP,
    MON_MIGRATING,
    PIT,
    ROCKTRAP,
    RUST_TRAP,
    SLP_GAS_TRAP,
    SPIKED_PIT,
    SQKY_BOARD,
    STATUE_TRAP,
    TELEP_TRAP,
    TRAPDOOR,
    WEB,
} from './const.js';
import { game } from './gstate.js';
import { t_at } from './trap.js';
import {
    monster_avoids_known_trap,
    monster_learns_trap,
    nearby_monsters_learn_trap,
} from './trap_monster_shared.js';

const FLOOR_TRIGGER_TRAPS = new Set([
    ARROW_TRAP,
    DART_TRAP,
    ROCKTRAP,
    SQKY_BOARD,
    BEAR_TRAP,
    SLP_GAS_TRAP,
    RUST_TRAP,
    FIRE_TRAP,
    PIT,
    SPIKED_PIT,
    HOLE,
    TRAPDOOR,
]);

function requiredOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(
            `monster trap dispatch requires a ${name} operation`,
        );
    }
    return operation;
}

async function trigger(env, name, monster, trap) {
    return requiredOperation(env, name)(monster, trap, env);
}

// Return labels preserve the distinctions consumed by monmove.c:postmov()
// and dothrow.c:mhurtle_step(). "finished" permits later action; the other
// results stop this monster's current movement.
export async function resolve_monster_trap(
    monster,
    rawEnv = {},
    trapFlags = 0,
) {
    const state = rawEnv.state ?? game;
    const trapAt = rawEnv.trapAt ?? t_at;
    if (typeof trapAt !== 'function')
        throw new TypeError('monster trap dispatch requires trapAt');
    const env = { ...rawEnv, state, trapFlags };

    if (monster.mtrapped) {
        const stillCaught = await requiredOperation(
            env,
            'resolveTrappedMonster',
        )(monster, env);
        return stillCaught ? 'caught' : 'finished';
    }

    const trap = trapAt(monster.mx, monster.my, state);
    if (!trap) {
        monster.mtrapped = false;
        return 'finished';
    }
    if ((trapFlags & HURTLING)
        && FLOOR_TRIGGER_TRAPS.has(trap.ttyp)) {
        return 'finished';
    }

    let killed = false;
    let moved = false;
    switch (trap.ttyp) {
    case RUST_TRAP:
        await trigger(env, 'triggerRustTrap', monster, trap);
        break;
    case SQKY_BOARD:
        await trigger(env, 'triggerSqueakyBoard', monster, trap);
        break;
    case SLP_GAS_TRAP:
        await trigger(env, 'triggerSleepingGas', monster, trap);
        break;
    case ARROW_TRAP:
        killed = await trigger(env, 'triggerArrowTrap', monster, trap);
        break;
    case DART_TRAP:
        killed = await trigger(env, 'triggerDartTrap', monster, trap);
        break;
    case ROCKTRAP:
        killed = await trigger(env, 'triggerRockTrap', monster, trap);
        break;
    case BEAR_TRAP:
        killed = await trigger(env, 'triggerBearTrap', monster, trap);
        break;
    case PIT:
    case SPIKED_PIT:
        killed = await trigger(env, 'triggerPitTrap', monster, trap);
        break;
    case WEB:
        await trigger(env, 'triggerWebTrap', monster, trap);
        break;
    case ANTI_MAGIC:
        killed = await trigger(env, 'triggerAntiMagicTrap', monster, trap);
        break;
    case MAGIC_TRAP:
        killed = await trigger(env, 'triggerMagicTrap', monster, trap);
        break;
    case FIRE_TRAP:
        killed = await trigger(env, 'triggerFireTrap', monster, trap);
        break;
    case STATUE_TRAP:
        if (!monster_avoids_known_trap(monster, trap, env)) {
            monster_learns_trap(monster, trap.ttyp);
            nearby_monsters_learn_trap(trap, state);
        }
        break;
    case TELEP_TRAP:
        moved = await trigger(env, 'triggerTeleportTrap', monster, trap);
        break;
    case HOLE:
    case TRAPDOOR:
        await trigger(env, 'triggerHoleTrap', monster, trap);
        moved = Boolean(monster.mstate & MON_MIGRATING);
        break;
    default:
        requiredOperation(env, 'unsupported')(
            `post-move trap type ${trap.ttyp}`,
        );
    }

    if (killed || monster.mhp < 1) return 'killed';
    if (moved || (monster.mstate & MON_MIGRATING)) return 'moved';
    if (monster.mtrapped) return 'caught';
    return 'finished';
}
