// C ref: engrave.c random_engraving().

import { ENGRAVEFILE, MD_PAD_RUMORS } from './const.js';
import { wipeout_text } from './engrave.js';
import { game } from './gstate.js';
import { textBytes } from './hacklib.js';
import { get_rnd_text, getrumor } from './random_text.js';
import { coreRandom } from './rng.js';

export function random_engraving(rawEnv = {}) {
    const env = {
        ...rawEnv,
        random: rawEnv.random ?? coreRandom,
        state: rawEnv.state ?? game,
    };
    const selectRumor = env.getRumor
        ?? ((truth, excludeCookie) => getrumor(truth, excludeCookie, env));
    const selectRandomText = env.getRandomText
        ?? ((filename, random, padlength) => get_rnd_text(
            filename,
            random,
            padlength,
            env,
        ));
    const wipeText = env.wipeoutText ?? wipeout_text;

    let pristine;
    // Preserve the source's short-circuit order: a zero initial draw bypasses
    // getrumor(), while a nonempty rumor bypasses the engraving-file draw.
    if (!env.random.rn2(4)
        || !(pristine = selectRumor(0, true))
        || !pristine) {
        pristine = selectRandomText(
            ENGRAVEFILE,
            (bound) => env.random.rn2(bound),
            MD_PAD_RUMORS,
        );
    }

    const count = Math.trunc(textBytes(pristine).length / 4);
    return {
        text: wipeText(pristine, count, 0, env),
        pristine,
    };
}
