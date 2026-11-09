// Shared object-generation integration for level features.
// Each hook remains owned by its source subsystem; this module only composes
// the environment expected by obj.js so callers do not silently omit a rare
// container, monster-object, or artifact branch.

import {
    artifactCount,
    isPermanentlyPoisoned,
} from './artifacts.js';
import { ONAME_LEVEL_DEF } from './const.js';
import { oname } from './do_name.js';
import { monsterObject } from './monster_object.js';
import { obj_no_longer_held } from './obj.js';
import { block_point, recalc_block_point } from './vision.js';

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
        // mkobj.c remove_object():2518 is the other half: lifting a boulder
        // off a square calls vision.c recalc_block_point() there.
        recalcBlockPoint: (x, y, env) => recalc_block_point(x, y, env.state),
        isPermanentlyPoisoned,
        monsterObject,
        objectNoLongerHeld: obj_no_longer_held,
        nameObject: (obj, name, env) => oname(obj, name, ONAME_LEVEL_DEF, env),
        ...overrides,
    };
}

export function objectGenerationEnv(rawEnv = {}) {
    return {
        ...rawEnv,
        hooks: objectGenerationHooks(rawEnv.hooks),
    };
}
