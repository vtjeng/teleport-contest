// corpstat.js -- Corpse and statue construction.
// C ref: mkobj.c mkcorpstat().

import {
    CORPSTAT_INIT,
    CORPSTAT_SPE_VAL,
} from './const.js';
import { game } from './gstate.js';
import { is_rider } from './mondata.js';
import { mksobj, mksobj_at, weight } from './obj.js';
import { CORPSE, STATUE } from './objects.js';
import { PM_LICHEN, PM_LIZARD, S_TROLL } from './monsters.js';
import { obj_stop_timers, start_corpse_timeout } from './timeout.js';

function corpstatEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        hooks: env.hooks ?? {},
    };
}

function speciesIndex(species, state) {
    if (Number.isInteger(species)) {
        if (!state.mons?.[species])
            throw new RangeError(`mkcorpstat species ${species}`);
        return species;
    }
    if (Number.isInteger(species?.pmidx) && state.mons?.[species.pmidx])
        return species.pmidx;
    throw new TypeError('mkcorpstat requires a species index or record');
}

function specialCorpse(index, state) {
    const monster = state.mons?.[index];
    if (!monster)
        throw new RangeError(`mkcorpstat corpse species ${index}`);
    return index === PM_LIZARD
        || index === PM_LICHEN
        || monster.mlet === S_TROLL
        || is_rider(monster);
}

function monsterSpecies(monster, state) {
    if (monster?.data) return speciesIndex(monster.data, state);
    if (Number.isInteger(monster?.mnum))
        return speciesIndex(monster.mnum, state);
    if (Number.isInteger(monster?.mndx))
        return speciesIndex(monster.mndx, state);
    throw new TypeError('mkcorpstat monster has no species');
}

export function mkcorpstat(
    objtype,
    monster,
    species,
    x,
    y,
    corpstatflags,
    rawEnv = {},
) {
    if (objtype !== CORPSE && objtype !== STATUE)
        throw new RangeError(`mkcorpstat object type ${objtype}`);
    const env = corpstatEnv(rawEnv);
    const { state } = env;
    const init = Boolean(corpstatflags & CORPSTAT_INIT);
    const relocate = x === 0 && y === 0
        ? env.hooks.relocateObject : null;
    if (x === 0 && y === 0 && typeof relocate !== 'function')
        throw new Error('mkcorpstat requires random object relocation');
    const saveTraits = monster ? env.hooks.saveMonsterTraits : null;
    if (monster && typeof saveTraits !== 'function')
        throw new Error('mkcorpstat requires monster-trait persistence');

    // The C helpers are always present.  Validate their JS equivalents and
    // source arguments before mksobj() can consume RNG, allocate an id, arm a
    // timer, or link the new object into a floor chain.
    let resolvedSpecies = species;
    if (monster && resolvedSpecies == null)
        resolvedSpecies = monsterSpecies(monster, state);
    if (resolvedSpecies != null)
        resolvedSpecies = speciesIndex(resolvedSpecies, state);

    let obj;
    if (x === 0 && y === 0) {
        obj = mksobj(objtype, init, false, env);
        relocate(obj, env);
    } else {
        obj = mksobj_at(objtype, x, y, init, false, env);
    }

    obj.spe = corpstatflags & CORPSTAT_SPE_VAL;
    obj.norevive = Boolean(
        state.gm?.mkcorpstat_norevive ?? state.mkcorpstat_norevive,
    );

    if (monster) {
        saveTraits(obj, monster, env);
        const record = state.mons[resolvedSpecies];
        if (monster.mcan && !is_rider(record)) obj.norevive = true;
    }

    if (resolvedSpecies != null) {
        const oldSpecies = obj.corpsenm;
        const newSpecies = resolvedSpecies;
        obj.corpsenm = newSpecies;
        obj.owt = weight(obj, env);
        if (obj.otyp === CORPSE
            && (state.gz?.zombify
                || specialCorpse(oldSpecies, state)
                || specialCorpse(newSpecies, state))) {
            obj_stop_timers(obj, state, env);
            start_corpse_timeout(obj, env);
        }
    }
    return obj;
}
