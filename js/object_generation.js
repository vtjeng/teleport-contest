// Shared object-generation integration for level features.
// Each hook remains owned by its source subsystem; this module only composes
// the environment expected by obj.js so callers do not silently omit a rare
// container, monster-object, or artifact branch.

import {
    artifactCount,
    isPermanentlyPoisoned,
    makeArtifact,
} from './artifacts.js';
import { populateContainer } from './mkobj_container.js';
import { monsterObject } from './monster_object.js';
import { obj_no_longer_held } from './obj.js';
import { obj_stop_timers } from './timeout.js';

export function objectGenerationHooks(overrides = {}) {
    return {
        artifactCount,
        isPermanentlyPoisoned,
        makeArtifact,
        monsterObject,
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
