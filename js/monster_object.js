// monster_object.js -- Species initialization for statues and figurines.
// C ref: mkobj.c mksobj_init() ROCK_CLASS/FIGURINE branches and mksobj()
// finalization shared by corpses, statues, and figurines.

import {
    CORPSTAT_FEMALE,
    CORPSTAT_MALE,
    CORPSTAT_NEUTER,
    NON_PM,
} from './const.js';
import { level_difficulty } from './dungeon.js';
import { add_to_container } from './invent.js';
import { rndmonnum, rndmonnum_adj } from './makemon.js';
import { is_female, is_male, is_neuter } from './mondata.js';
import { M2_HUMAN } from './monsters.js';
import {
    SPBOOK_NO_NOVEL,
    mkobj,
    obj_no_longer_held,
    set_corpsenm,
} from './obj.js';
import { FIGURINE, STATUE } from './objects.js';

function withContainerOwnership(env) {
    return {
        ...env,
        hooks: {
            ...env.hooks,
            objectNoLongerHeld: env.hooks?.objectNoLongerHeld
                ?? ((obj, normalized) => obj_no_longer_held(obj, normalized)),
        },
    };
}

function initializeStatue(obj, env) {
    obj.corpsenm = rndmonnum(env);
    const monster = env.state.mons?.[obj.corpsenm];
    if (!monster)
        throw new Error('statue initialization requires a complete monster catalog');

    const divisor = Math.trunc(level_difficulty(env.state) / 2) + 10;
    if (monster.msize >= 1 && env.random.rn2(divisor) > 10) {
        const normalized = withContainerOwnership(env);
        add_to_container(
            obj,
            mkobj(SPBOOK_NO_NOVEL, false, normalized),
            normalized,
        );
    }
}

function initializeFigurine(obj, env) {
    let attempts = 0;
    do {
        obj.corpsenm = rndmonnum_adj(5, 10, env);
    } while ((env.state.mons[obj.corpsenm].mflags2 & M2_HUMAN)
             && attempts++ < 30);
}

function finalizeMonsterObject(obj, env) {
    if (obj.corpsenm === NON_PM)
        obj.corpsenm = rndmonnum(env);

    if (obj.corpsenm !== NON_PM) {
        const monster = env.state.mons?.[obj.corpsenm];
        if (!monster) {
            throw new Error(
                'monster-object finalization requires a complete monster catalog',
            );
        }
        obj.spe = is_neuter(monster) ? CORPSTAT_NEUTER
            : is_female(monster) ? CORPSTAT_FEMALE
                : is_male(monster) ? CORPSTAT_MALE
                    : env.random.rn2(2)
                        ? CORPSTAT_FEMALE : CORPSTAT_MALE;
    }
    set_corpsenm(obj, obj.corpsenm, env);
}

// ObjectEnv hook for obj.js. Keeping both phases in one source-shaped owner
// prevents callers from recreating only the visible species field while
// skipping constructor RNG, gender, timers, or weight finalization.
export function monsterObject(obj, phase, env) {
    if (phase === 'initialize') {
        if (obj.otyp === STATUE) initializeStatue(obj, env);
        else if (obj.otyp === FIGURINE) initializeFigurine(obj, env);
        else throw new RangeError(`monsterObject initialize otyp ${obj.otyp}`);
        return obj;
    }
    if (phase === 'finalize') {
        finalizeMonsterObject(obj, env);
        return obj;
    }
    throw new RangeError(`monsterObject phase ${phase}`);
}
