// Ordinary-room dungeon features.
// C ref: mklev.c find_okay_roompos(), mkfount(), mksink(), mkaltar(),
// and mkgrave().

import {
    ALTAR,
    A_LAWFUL,
    FOUNTAIN,
    OROOM,
    SINK,
    Align2amask,
} from './const.js';
import { level_difficulty } from './dungeon.js';
import { make_grave } from './grave.js';
import { game } from './gstate.js';
import { add_to_buried } from './invent.js';
import { occupied } from './mktrap.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    curseFreeObject,
    mkobj,
    mksobj,
    mksobj_at,
    weight,
} from './obj.js';
import { BELL, GOLD_PIECE, RANDOM_CLASS } from './objects.js';
import { rn1, rn2, rnd, rne, rnz } from './rng.js';
import { set_levltyp } from './terrain.js';

function roomFeatureEnv(rawEnv = {}) {
    return objectGenerationEnv({
        ...rawEnv,
        state: rawEnv.state ?? game,
        random: rawEnv.random ?? { rn1, rn2, rnd, rne, rnz },
    });
}

function roomHook(env, name) {
    const hook = env.hooks?.[name];
    if (typeof hook !== 'function')
        throw new Error(`room feature generation requires ${name}`);
    return hook;
}

export function find_okay_roompos(croom, coordinate, rawEnv = {}) {
    const env = roomFeatureEnv(rawEnv);
    const { state } = env;
    let tryct = 0;

    do {
        if (++tryct > 200) return false;
        if (!roomHook(env, 'somexyspace')(croom, coordinate, env))
            return false;
    } while (occupied(coordinate.x, coordinate.y, state)
        || roomHook(env, 'bydoor')(coordinate.x, coordinate.y, env));
    return true;
}

export function mkfount(croom, rawEnv = {}) {
    const env = roomFeatureEnv(rawEnv);
    const { random, state } = env;
    const coordinate = { x: 0, y: 0 };

    if (!find_okay_roompos(croom, coordinate, env)) return;
    if (!set_levltyp(coordinate.x, coordinate.y, FOUNTAIN, env)) return;
    if (!random.rn2(7))
        state.level.at(coordinate.x, coordinate.y).horizontal = true;

    // Retain mklev.c's explicit increment after set_levltyp() recounts the
    // level; this source quirk leaves the new feature counted twice.
    ++state.level.flags.nfountains;
}

export function mksink(croom, rawEnv = {}) {
    const env = roomFeatureEnv(rawEnv);
    const { state } = env;
    const coordinate = { x: 0, y: 0 };

    if (!find_okay_roompos(croom, coordinate, env)) return;
    if (!set_levltyp(coordinate.x, coordinate.y, SINK, env)) return;

    // See mkfount(): upstream keeps this increment after the recount too.
    ++state.level.flags.nsinks;
}

export function mkaltar(croom, rawEnv = {}) {
    const env = roomFeatureEnv(rawEnv);
    const { random, state } = env;
    const coordinate = { x: 0, y: 0 };

    if (croom.rtype !== OROOM) return;
    if (!find_okay_roompos(croom, coordinate, env)) return;
    if (!set_levltyp(coordinate.x, coordinate.y, ALTAR, env)) return;

    const alignment = random.rn2(A_LAWFUL + 2) - 1;
    state.level.at(coordinate.x, coordinate.y).flags = Align2amask(alignment);
}

export function mkgrave(croom, rawEnv = {}) {
    const env = roomFeatureEnv(rawEnv);
    const { random, state } = env;
    const coordinate = { x: 0, y: 0 };
    // This initializer precedes mklev.c's room-type check and therefore
    // consumes its draw even when the function immediately returns.
    const dobell = !random.rn2(10);

    if (croom.rtype !== OROOM) return;
    if (!find_okay_roompos(croom, coordinate, env)) return;

    make_grave(
        coordinate.x,
        coordinate.y,
        dobell ? 'Saved by the bell!' : null,
        env,
    );

    if (!random.rn2(3)) {
        const gold = mksobj(GOLD_PIECE, true, false, env);
        gold.quan = random.rnd(20)
            + level_difficulty(state) * random.rnd(5);
        gold.owt = weight(gold, env);
        gold.ox = coordinate.x;
        gold.oy = coordinate.y;
        add_to_buried(gold, env);
    }

    for (let tryct = random.rn2(5); tryct; --tryct) {
        const object = mkobj(RANDOM_CLASS, true, env);
        if (!object) return;
        curseFreeObject(object, env);
        object.ox = coordinate.x;
        object.oy = coordinate.y;
        add_to_buried(object, env);
    }

    if (dobell) {
        mksobj_at(
            BELL,
            coordinate.x,
            coordinate.y,
            true,
            false,
            env,
        );
    }
}
