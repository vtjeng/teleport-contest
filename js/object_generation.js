// Shared object-generation integration for level features.
// Each hook remains owned by its source subsystem; this module only composes
// the environment expected by obj.js so callers do not silently omit a rare
// container, monster-object, or artifact branch.

import {
    artifactCount,
    isPermanentlyPoisoned,
} from './artifacts.js';
import { recalc_block_point } from './vision.js';

export function objectGenerationHooks(overrides = {}) {
    return {
        artifactCount,
        // mkobj.c remove_object():2518: lifting a boulder off a square calls
        // vision.c recalc_block_point() there. The third argument is the
        // lifecycle env, not a state. explode.js scatter() substitutes a
        // no-op only when its caller's hooks lack this one, so this copy stays
        // until that no-op goes.
        recalcBlockPoint: (x, y, env) => recalc_block_point(x, y, env.state),
        isPermanentlyPoisoned,
        ...overrides,
    };
}

export function objectGenerationEnv(rawEnv = {}) {
    return {
        ...rawEnv,
        hooks: objectGenerationHooks(rawEnv.hooks),
    };
}
