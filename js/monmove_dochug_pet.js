// Starting-pet action phases around dog_move().
// C ref: monmove.c dochug(), tame-monster path.

import {
    HALLUC,
    HALLUC_RES,
    MMOVE_DIED,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOTHING,
} from './const.js';
import { newsym } from './display.js';
import { wipe_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { is_wanderer } from './mondata.js';
import {
    distfleeck,
    set_apparxy,
} from './monmove.js';
import { rn2 } from './rng.js';

function requiredOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`pet dochug requires a ${name} operation`);
    return operation;
}

function activeProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && !value?.blocked;
}

// This is the complete source ordering for the reachable starting-pet action:
// pre-move upkeep, exact apparent hero location, two distfleeck() evaluations,
// dog movement, and postmov(). The integration preflight excludes unowned
// branches before action state or PRNG is changed.
export async function dochug_fresh_pet(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const preflightPet = requiredOperation(rawEnv, 'preflightPet');
    const resolveTrappedMonster = requiredOperation(
        rawEnv,
        'resolveTrappedMonster',
    );
    const finishEating = requiredOperation(rawEnv, 'finishEating');
    const movePet = requiredOperation(rawEnv, 'movePet');
    const postMonsterMove = requiredOperation(rawEnv, 'postMonsterMove');
    const monFlee = requiredOperation(rawEnv, 'monFlee');
    const distanceAndFear = rawEnv.distanceAndFear ?? distfleeck;
    const setApparentHero = rawEnv.setApparentHero ?? set_apparxy;
    const wipeEngraving = rawEnv.wipeEngraving ?? wipe_engr_at;
    const redraw = rawEnv.redraw ?? newsym;
    const env = { ...rawEnv, state, random };

    preflightPet(monster, state);
    if (!monster.mcanmove) return 0;

    wipeEngraving(monster.mx, monster.my, 1, false, env);
    if (monster.mflee) {
        // The source draws before discovering that starting dogs, cats, and
        // ponies lack intrinsic teleportation.
        random.rn2(40);
        // m_respond() is inert for all three starting-pet species.
        if (!monster.mfleetim
            && monster.mhp === monster.mhpmax
            && !random.rn2(25)) {
            monster.mflee = false;
        }
    }
    setApparentHero(monster, env);
    const range = await distanceAndFear(monster, { ...env, monFlee });

    const oldX = monster.mx;
    const oldY = monster.my;
    // The source evaluates every earlier disjunct before the final mpeaceful
    // term, so wandering pets can still consume their one-in-four draw.
    const mayMove = !range.nearby
        || monster.mflee
        || range.scared
        || monster.mconf
        || monster.mstun
        || (monster.minvis && !random.rn2(3))
        || (is_wanderer(monster.data) && !random.rn2(4))
        || (!monster.mcansee && !random.rn2(4))
        || monster.mpeaceful;
    let status;
    if (mayMove && await resolveTrappedMonster(monster, env)) {
        status = MMOVE_NOTHING;
    } else if (mayMove && monster.meating) {
        --monster.meating;
        if (monster.meating <= 0) finishEating(monster);
        status = MMOVE_DONE;
    } else if (mayMove) {
        // m_move() refreshes the apparent hero location immediately before
        // dispatching its tame-monster branch.
        setApparentHero(monster, env);
        status = await movePet(monster, false, env);
        status = await postMonsterMove(
            monster,
            oldX,
            oldY,
            status,
            env,
        );
    } else {
        status = MMOVE_NOTHING;
    }
    if (mayMove && status !== MMOVE_DIED) {
        await distanceAndFear(monster, { ...env, monFlee });
    }

    if (status === MMOVE_DIED) return 1;
    if ((status === MMOVE_NOTHING || status === MMOVE_DONE)
        && activeProperty(state, HALLUC)
        && !activeProperty(state, HALLUC_RES)) {
        redraw(monster.mx, monster.my);
    }
    return 0;
}
