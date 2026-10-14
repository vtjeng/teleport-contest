// rnd.js -- random-list helpers.
// C ref: rnd.c shuffle_int_array().
import { rn2 } from './rng.js';

// C ref: rnd.c shuffle_int_array() (299-310). Mutates the supplied array
// with the same descending Fisher-Yates draws used by the source helper.
export function shuffle_int_array(indices, count, random = rn2) {
    for (let i = count - 1; i > 0; i--) {
        const iswap = random(i + 1);
        if (iswap === i) continue;
        const temp = indices[i];
        indices[i] = indices[iswap];
        indices[iswap] = temp;
    }
}
