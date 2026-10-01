// Lycanthrope summoning.
// C ref: were.c were_summon(). were_change() and its helpers were ported
// earlier into js/mon.js; that split predates this file.

import { NO_MM_FLAGS, NON_PM, PROT_FROM_SHAPE_CHANGERS } from './const.js';
import { tamedog } from './dog.js';
import { game } from './gstate.js';
import { makemon_runtime } from './makemon_create.js';
import {
    PM_COYOTE,
    PM_FOX,
    PM_GIANT_RAT,
    PM_HUMAN_WEREJACKAL,
    PM_HUMAN_WERERAT,
    PM_HUMAN_WEREWOLF,
    PM_JACKAL,
    PM_RABID_RAT,
    PM_SEWER_RAT,
    PM_WARG,
    PM_WEREJACKAL,
    PM_WERERAT,
    PM_WEREWOLF,
    PM_WINTER_WOLF,
    PM_WINTER_WOLF_CUB,
    PM_WOLF,
} from './monsters.js';
import { rn2, rnd } from './rng.js';
import { canseemon } from './vision.js';

// youprop.h:376 Protection_from_shape_changers, intrinsic or extrinsic.
function Protection_from_shape_changers(state) {
    const property = state.u.uprops[PROT_FROM_SHAPE_CHANGERS];
    return Boolean(property.intrinsic || property.extrinsic);
}

// C ref: were.c were_summon() (142-188). "create monsters of the appropriate
// type for the lycanthrope `ptr`". C returns the total created and writes
// the count the hero can see through `visible`, and the beast noun through
// `genbuf` when the caller passes one; both out-parameters are objects with
// a `value` field here.
export async function were_summon(
    ptr,
    yours,
    visible,
    genbuf,
    state = game,
    random = null,
    runtimeEnv = {},
) {
    const pm = ptr.pmidx;
    let total = 0;
    const draws = random ?? { rn2, rnd };
    if (typeof draws.rn2 !== 'function' || typeof draws.rnd !== 'function') {
        throw new TypeError('were_summon requires an rn2 and rnd source');
    }

    visible.value = 0;
    if (Protection_from_shape_changers(state) && !yours)
        return 0;
    for (let i = draws.rnd(5); i > 0; i--) {
        let typ;
        switch (pm) {
        case PM_WERERAT:
        case PM_HUMAN_WERERAT:
            typ = draws.rn2(3) ? PM_SEWER_RAT
                               : draws.rn2(3) ? PM_GIANT_RAT : PM_RABID_RAT;
            if (genbuf)
                genbuf.value = 'rat';
            break;
        case PM_WEREJACKAL:
        case PM_HUMAN_WEREJACKAL:
            typ = draws.rn2(7) ? PM_JACKAL
                               : draws.rn2(3) ? PM_COYOTE : PM_FOX;
            if (genbuf)
                genbuf.value = 'jackal';
            break;
        case PM_WEREWOLF:
        case PM_HUMAN_WEREWOLF:
            typ = draws.rn2(5) ? PM_WOLF
                               : draws.rn2(2) ? PM_WARG : PM_WINTER_WOLF;
            if (genbuf)
                genbuf.value = 'wolf';
            break;
        default:
            continue;
        }
        const creationEnv = {
            ...runtimeEnv,
            state,
            ...(random ? { random } : {}),
            _wereSummon: true,
        };
        const mtmp = await makemon_runtime(
            state.mons[typ], state.u.ux, state.u.uy,
            NO_MM_FLAGS, creationEnv,
        );
        if (mtmp) {
            total++;
            if (canseemon(mtmp, state))
                visible.value += 1;
        }
        if (yours && mtmp)
            await tamedog(mtmp, null, false, creationEnv);
    }
    return total;
}

// C ref: were.c were_beastie() (62-84).  Return the animal form associated
// with a lycanthrope; the table is intentionally narrower than is_were().
export function were_beastie(pm) {
    switch (pm) {
    case PM_WERERAT:
    case PM_SEWER_RAT:
    case PM_GIANT_RAT:
    case PM_RABID_RAT:
        return PM_WERERAT;
    case PM_WEREJACKAL:
    case PM_JACKAL:
    case PM_FOX:
    case PM_COYOTE:
        return PM_WEREJACKAL;
    case PM_WEREWOLF:
    case PM_WOLF:
    case PM_WARG:
    case PM_WINTER_WOLF:
    case PM_WINTER_WOLF_CUB:
        return PM_WEREWOLF;
    default:
        return NON_PM;
    }
}
