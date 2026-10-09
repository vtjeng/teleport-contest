// Hero lycanthropy and lycanthrope summoning.
// C ref: were.c you_were(), you_unwere(), set_ulycn(), were_summon(). were_change() and its helpers were ported
// earlier into js/mon.js; that split predates this file.

import {
    NEUTRAL, NO_MM_FLAGS, NON_PM, PARANOID_WERECHANGE,
    POLYMORPH_CONTROL, PROT_FROM_SHAPE_CHANGERS, STUNNED, UNCHANGING,
} from './const.js';
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
import { rn1, rn2, rnd } from './rng.js';

import { polymon, rehumanize, set_uasmon } from './polyself.js';
import { canseemon } from './display.js';
import { monster_nearby } from './hack.js';
import { paranoid_query } from './cmd.js';
import { an } from './objnam.js';
import { heroUnaware } from './pline.js';
import { is_were } from './mondata.js';
import { ttyPline } from './tty_message.js';

// C ref: were.c you_were() (192-212). Controlled changes ask before testing
// nearby monsters; an uncontrolled change is suppressed by that test.
export async function you_were(state = game, env = {}) {
    const active = (property) => Boolean(state.u.uprops[property].intrinsic
        || state.u.uprops[property].extrinsic);
    const controllable_poly = active(POLYMORPH_CONTROL)
        && !(active(STUNNED) || heroUnaware(state));
    if (active(UNCHANGING) || state.u.umonnum === state.u.ulycn)
        return;
    if (controllable_poly) {
        const beast = state.mons[state.u.ulycn].pmnames[NEUTRAL].slice(4);
        if (!await paranoid_query(
            Boolean(state.flags.paranoia_bits & PARANOID_WERECHANGE),
            `Do you want to change into ${an(beast)}?`, state,
        )) return;
    } else if (monster_nearby(state)) {
        return;
    }
    state.gw.were_changes++;
    await polymon(state.u.ulycn, state, env);
}

// C ref: were.c you_unwere() (213-228). Purification cures the infection
// before deciding whether to leave beast form; Unchanging blocks only that
// form change. A retained beast gets a fallback timer only when none remains.
export async function you_unwere(purify, state = game, env = {}) {
    const active = (property) => Boolean(state.u.uprops[property].intrinsic
        || state.u.uprops[property].extrinsic);
    const controllable_poly = active(POLYMORPH_CONTROL)
        && !(active(STUNNED) || heroUnaware(state));
    const message = env.message ?? (env.planning ? async () => {} : ttyPline);
    if (purify) {
        await message('You feel purified.', state);
        set_ulycn(NON_PM, state);
    }
    let leaveBeast = false;
    if (!active(UNCHANGING) && is_were(state.youmonst.data)
        && !monster_nearby(state)) {
        if (controllable_poly) {
            // Canonical paranoid_query reads live input. Defer only when C
            // actually reaches that query, preserving the preceding gates.
            if (env.planning) {
                if (typeof env.requestPlanningInput !== 'function')
                    throw new TypeError('planned you_unwere requires an input boundary');
                env.requestPlanningInput('you_unwere');
            }
            leaveBeast = !await paranoid_query(
                Boolean(state.flags.paranoia_bits & PARANOID_WERECHANGE),
                'Remain in beast form?', state,
            );
        } else {
            leaveBeast = true;
        }
    }
    if (leaveBeast) {
        await rehumanize(state, env);
    } else if (is_were(state.youmonst.data) && !state.u.mtimedone) {
        state.u.mtimedone = (env.random?.rn1 ?? rn1)(200, 200);
    }
}

// C ref: were.c set_ulycn() (232-237). Keep u.ulycn in its canonical state
// field, then refresh form-derived properties such as drain resistance.
export function set_ulycn(which, state = game) {
    state.u.ulycn = which;
    set_uasmon(state);
}

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
