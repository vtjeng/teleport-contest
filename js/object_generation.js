// Shared object-generation integration for level features.
// Each hook remains owned by its source subsystem; this module only composes
// the environment expected by obj.js so callers do not silently omit a rare
// container, monster-object, or artifact branch.

import {
    artifactCount,
    isPermanentlyPoisoned,
    makeArtifact,
} from './artifacts.js';
import { LS_OBJECT } from './const.js';
import { populateContainer } from './mkobj_container.js';
import { del_light_source } from './light.js';
import { is_reviver } from './mondata.js';
import { monsterObject } from './monster_object.js';
import { obj_no_longer_held, remove_object } from './obj.js';
import { obj_stop_timers } from './timeout.js';
import { block_point } from './vision.js';

export function objectGenerationHooks(overrides = {}) {
    return {
        artifactCount,
        // mkobj.c place_object() calls vision.c block_point() for a boulder
        // landing on a square that does not already show one, level generation
        // included: mklev.c dig_corridor() drops one on about one corridor
        // square in fifty. js/obj.js place_object() runs it unconditionally
        // and says there what that costs.
        //
        // The third argument is the lifecycle env, not a state. Binding
        // block_point directly makes vision_reset() read env.level, find none
        // and return in silence, which leaves the transparency index unaware
        // of the boulder and shows up only as a screen mismatch many steps
        // later.
        blockPoint: (x, y, env) => block_point(x, y, env.state),
        deleteObjectLightSource: (obj, env) => {
            del_light_source(LS_OBJECT, obj, env.state);
        },
        isPermanentlyPoisoned,
        makeArtifact,
        monsterObject,
        extractExternalObject: (obj, env) => remove_object(obj, env),
        isReviver: (mnum, env) => {
            const monster = env.state.mons?.[mnum];
            if (!monster) {
                throw new Error(
                    `object merging requires monster ${mnum}`,
                );
            }
            return is_reviver(monster);
        },
        objectNoLongerHeld: obj_no_longer_held,
        populateContainer,
        stopObjectTimers: (obj, env) => {
            obj_stop_timers(obj, env.state, env);
        },
        ...overrides,
    };
}

export function objectGenerationEnv(rawEnv = {}) {
    return {
        ...rawEnv,
        hooks: objectGenerationHooks(rawEnv.hooks),
    };
}
