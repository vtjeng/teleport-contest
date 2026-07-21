// C ref: engrave.c make_grave().

import {
    EPITAPHFILE,
    GRAVE,
    HEADSTONE,
    MD_PAD_RUMORS,
    ROOM,
} from './const.js';
import { del_engr_at, make_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { get_rnd_text } from './random_text.js';
import { rn2 } from './rng.js';
import { set_levltyp } from './terrain.js';
import { t_at } from './trap.js';

export function make_grave(x, y, text, rawEnv = {}) {
    const env = {
        ...rawEnv,
        random: rawEnv.random ?? { rn2 },
        state: rawEnv.state ?? game,
    };
    const location = env.state.level?.at(x, y);
    // Keep the source's short-circuit order: t_at() is not consulted when the
    // terrain itself already rejects a grave.
    if (!location
        || ((location.typ !== ROOM && location.typ !== GRAVE)
            || t_at(x, y, env.state))) return null;

    const setLevelType = env.setLevelType ?? set_levltyp;
    if (!setLevelType(x, y, GRAVE, env)) return null;

    del_engr_at(x, y, env.state);
    if (text == null) {
        text = get_rnd_text(
            EPITAPHFILE,
            (bound) => env.random.rn2(bound),
            MD_PAD_RUMORS,
            env,
        );
    }
    return make_engr_at(
        x,
        y,
        text,
        null,
        0,
        HEADSTONE,
        env,
    );
}
