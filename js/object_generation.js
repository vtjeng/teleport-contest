// Shared object-generation integration for level features.
// Each hook remains owned by its source subsystem; this module only composes
// the environment expected by obj.js so callers do not silently omit a rare
// container, monster-object, or artifact branch.

import {
    artifactCount,
    isPermanentlyPoisoned,
} from './artifacts.js';

export function objectGenerationHooks(overrides = {}) {
    return {
        artifactCount,
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
