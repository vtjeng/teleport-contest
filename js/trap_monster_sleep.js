// Sleep and wake-up trap effects on monsters.
// C refs: trap.c trapeffect_slp_gas_trap() and trapeffect_sqky_board().
// mhitm.c:sleep_monst() and mon.c:wake_nearto() remain injected owners.

import {
    BOLT_LIM,
    DEAF,
    SLP_GAS_TRAP,
} from './const.js';
import { dist2 } from './hacklib.js';
import {
    breathless,
    is_clinger,
    is_floater,
    is_flyer,
    mindless,
} from './mondata.js';
import { canSeeMonster } from './startup_a11y.js';
import {
    monster_avoids_known_trap,
    monster_learns_trap,
    monster_skips_floor_trap,
    nearby_monsters_learn_trap,
    reveal_monster_trap,
} from './trap_monster_shared.js';
import { ttyPline } from './tty_message.js';
import { couldsee } from './vision.js';

function sleepTrapOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(
            `monster sleep trap requires a ${name} operation`,
        );
    }
    return operation;
}

function trapMonsterName(monster, state, capitalized, env) {
    let name = sleepTrapOperation(env, 'monsterName')(monster, state);
    if (capitalized)
        name = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    return name;
}

function inSight(monster, state) {
    return canSeeMonster(monster, state) || monster === state.u.usteed;
}

function heroIsDeaf(state) {
    const property = state.u?.uprops?.[DEAF];
    return (Boolean(property?.intrinsic || property?.extrinsic)
        && !property?.blocked)
        || Boolean(state.u?.uroleplay?.deaf);
}

export async function trigger_monster_sleeping_gas(
    monster,
    trap,
    env,
) {
    const { random, state } = env;
    const resistsSleep = sleepTrapOperation(
        env,
        'resistsSleep',
    );
    const sleepMonster = sleepTrapOperation(env, 'sleepMonster');
    sleepTrapOperation(env, 'monsterName');
    if (monster_skips_floor_trap(monster, env)) return false;
    if (monster_avoids_known_trap(monster, trap, env)) return false;
    monster_learns_trap(monster, trap.ttyp);
    nearby_monsters_learn_trap(trap, state);

    if (resistsSleep(monster, SLP_GAS_TRAP, env)
        || breathless(monster.data)
        || monster.msleeping
        || !monster.mcanmove) {
        return false;
    }

    const slept = await sleepMonster(monster, random.rnd(25), -1, env);
    if (!slept) return false;
    if (inSight(monster, state)) {
        await ttyPline(
            `${trapMonsterName(monster, state, true, env)} suddenly falls `
            + 'asleep!',
            state,
        );
        reveal_monster_trap(trap);
    }
    return true;
}

const SQUEAKY_BOARD_NOTES = Object.freeze([
    'a C note',
    'a D flat',
    'a D note',
    'an E flat',
    'an E note',
    'an F note',
    'an F sharp',
    'a G note',
    'a G sharp',
    'an A note',
    'a B flat',
    'a B note',
]);

export async function trigger_monster_squeaky_board(
    monster,
    trap,
    env,
) {
    const { state } = env;
    const wakeNear = sleepTrapOperation(env, 'wakeNear');
    sleepTrapOperation(env, 'monsterName');
    if (monster_skips_floor_trap(monster, env)) return false;
    if (monster_avoids_known_trap(monster, trap, env)) return false;
    monster_learns_trap(monster, trap.ttyp);
    nearby_monsters_learn_trap(trap, state);
    if (is_floater(monster.data)
        || is_flyer(monster.data)
        || (is_clinger(monster.data) && monster.mundetected)) {
        return false;
    }

    const deaf = heroIsDeaf(state);
    const visible = inSight(monster, state);
    const note = SQUEAKY_BOARD_NOTES[trap.tnote] ?? 'a note';
    if (visible) {
        if (!deaf) {
            await ttyPline(
                `A board beneath ${trapMonsterName(
                    monster,
                    state,
                    false,
                    env,
                )} squeaks ${note} loudly.`,
                state,
            );
            reveal_monster_trap(trap);
        } else if (!mindless(monster.data)) {
            await ttyPline(
                `${trapMonsterName(monster, state, true, env)} stops `
                + 'momentarily and appears to cringe.',
                state,
            );
        }
    } else if (!deaf) {
        const range = couldsee(monster.mx, monster.my, state)
            ? BOLT_LIM + 1
            : BOLT_LIM - 3;
        const nearby = dist2(
            monster.mx,
            monster.my,
            state.u.ux,
            state.u.uy,
        ) <= range * range;
        await ttyPline(
            `You hear ${note} squeak `
            + `${nearby ? 'nearby' : 'in the distance'}.`,
            state,
        );
    }
    await wakeNear(monster.mx, monster.my, 40, env);
    return false;
}
