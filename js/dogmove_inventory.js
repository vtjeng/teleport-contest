// Pet inventory action selection.
// C ref: dogmove.c dog_invent().

import {
    ACCFOOD,
    CADAVER,
    MMOVE_DIED,
    MMOVE_MOVED,
    MMOVE_NOTHING,
} from './const.js';
import { dogfood as classifyDogFood } from './dogfood.js';
import { game } from './gstate.js';
import { can_carry } from './moncarry.js';
import {
    BALL_CLASS,
    CHAIN_CLASS,
    ROCK_CLASS,
    SCR_MAIL,
} from './objects.js';
import { rn2 } from './rng.js';

function inventoryOperation(rawEnv, name, fallback) {
    const operation = rawEnv[name] ?? fallback;
    if (typeof operation !== 'function')
        throw new TypeError(`dog_invent requires a ${name} operation`);
    return operation;
}

function isPrize(obj, state) {
    const tracking = state.context?.achieveo;
    if (!tracking) return false;
    return (Boolean(tracking.mines_prize_oid)
            && obj.o_id === tracking.mines_prize_oid)
        || (Boolean(tracking.soko_prize_oid)
            && obj.o_id === tracking.soko_prize_oid);
}

function cannotFetch(obj, state) {
    return obj.oclass === BALL_CLASS
        || obj.oclass === CHAIN_CLASS
        || obj.oclass === ROCK_CLASS
        || obj.otyp === SCR_MAIL
        || isPrize(obj, state);
}

// Return MMOVE_MOVED when the pet ate, MMOVE_DIED when eating killed it,
// and MMOVE_NOTHING for dropping, pickup, or no action.
export async function dog_invent(monster, edog, heroDistance, rawEnv = {}) {
    if (monster.msleeping || !monster.mcanmove || monster.meating)
        return MMOVE_NOTHING;

    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('dog_invent random injection requires rn2');
    const operationEnv = { ...rawEnv, state, random };
    const findDroppable = inventoryOperation(
        rawEnv,
        'droppables',
    );

    if (findDroppable(monster, operationEnv)) {
        if (edog.apport <= 0)
            throw new RangeError('dog_invent requires positive apport');
        if ((!random.rn2(heroDistance + 1)
                || !random.rn2(edog.apport))
            && random.rn2(10) < edog.apport) {
            await inventoryOperation(rawEnv, 'dropInventory')(
                monster,
                operationEnv,
            );
            if (edog.apport > 1) edog.apport--;
            edog.dropdist = heroDistance;
            edog.droptime = state.moves;
        }
        return MMOVE_NOTHING;
    }

    const obj = state.level?.objects?.[monster.mx]?.[monster.my] ?? null;
    if (!obj || cannotFetch(obj, state)) return MMOVE_NOTHING;

    const dogfood = inventoryOperation(rawEnv, 'dogfood', classifyDogFood);
    const canReach = inventoryOperation(
        rawEnv,
        'couldReachItem',
    );
    const foodType = dogfood(monster, obj, operationEnv);
    if ((foodType <= CADAVER
            || (edog.mhpmax_penalty && foodType === ACCFOOD))
        && canReach(monster, obj.ox, obj.oy, state)) {
        return await inventoryOperation(rawEnv, 'eatObject')(
            monster,
            obj,
            monster.mx,
            monster.my,
            false,
            operationEnv,
        );
    }

    const canCarry = inventoryOperation(rawEnv, 'canCarry', can_carry);
    const amount = canCarry(monster, obj, operationEnv);
    if (amount > 0 && !obj.cursed
        && canReach(monster, obj.ox, obj.oy, state)
        && random.rn2(20) < edog.apport + 3
        && (random.rn2(heroDistance)
            || !random.rn2(edog.apport))) {
        await inventoryOperation(rawEnv, 'pickObject')(
            monster,
            obj,
            amount,
            operationEnv,
        );
    }
    return MMOVE_NOTHING;
}
