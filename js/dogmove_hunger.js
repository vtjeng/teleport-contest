// Pet hunger state transitions.
// C ref: dogmove.c dog_hunger().

import { game } from './gstate.js';
import { carnivorous, herbivorous } from './mondata.js';

const DOG_WEAK = 500;
const DOG_STARVE = 750;

function operation(env, name) {
    if (typeof env[name] !== 'function')
        throw new TypeError(`dog_hunger requires a ${name} operation`);
    return env[name];
}

export async function dog_hunger(monster, edog, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    const moves = Math.trunc(state.moves ?? 0);
    if (moves <= Math.trunc(edog.hungrytime ?? 0) + DOG_WEAK)
        return false;

    const eatsMeat = env.carnivorous ?? carnivorous;
    const eatsPlants = env.herbivorous ?? herbivorous;
    if (!eatsMeat(monster.data) && !eatsPlants(monster.data)) {
        edog.hungrytime = moves + DOG_WEAK;
    } else if (!edog.mhpmax_penalty) {
        const newMaximum = Math.trunc(monster.mhpmax / 3);
        const dies = Math.min(monster.mhp, newMaximum) < 1;
        const starvePet = dies ? operation(env, 'starvePet') : null;
        const reportWeakPet = dies ? null : operation(env, 'reportWeakPet');
        const stopOccupation = dies ? null : operation(env, 'stopOccupation');
        monster.mconf = true;
        edog.mhpmax_penalty = monster.mhpmax - newMaximum;
        monster.mhpmax = newMaximum;
        if (monster.mhp > newMaximum) monster.mhp = newMaximum;
        if (dies) {
            await starvePet(monster, env);
            return true;
        }
        await reportWeakPet(monster, env);
        await stopOccupation(env);
    } else if (moves > edog.hungrytime + DOG_STARVE
               || monster.mhp < 1) {
        await operation(env, 'starvePet')(monster, env);
        return true;
    }
    return false;
}
