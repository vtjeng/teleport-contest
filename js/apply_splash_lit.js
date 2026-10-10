// Light extinguishing and water splashes for hero- and monster-carried objects.
// C refs: apply.c snuff_candle(), snuff_lit(), and splash_lit().

import { OBJ_MINVENT } from './const.js';
import {
    is_pool,
} from './dbridge.js';
import { game } from './gstate.js';
import { get_obj_location } from './light.js';
import {
    humanoid,
    is_floater,
    is_flyer,
} from './mondata.js';
import {
    isCandle,
} from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    BRASS_LANTERN,
    CANDELABRUM_OF_INVOCATION,
    MAGIC_LAMP,
    OIL_LAMP,
    POT_OIL,
} from './objects.js';
import { otense, xnameFresh, Yname2 } from './objnam.js';
import { Shk_Your } from './shk.js';
import { end_burn } from './timeout.js';

import { heroIsBlind } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';
import { cansee, couldsee } from './vision.js';

function splashOperation(env, name, fallback) {
    const operation = env[name] ?? fallback;
    if (typeof operation !== 'function')
        throw new TypeError(`lit-item splash requires a ${name} operation`);
    return operation;
}

function sameLevel(left, right) {
    return Boolean(left && right
        && left.dnum === right.dnum
        && left.dlevel === right.dlevel);
}

function onWaterLevel(state) {
    return sameLevel(state.u?.uz, state.water_level);
}

function distanceSquaredFromHero(x, y, state) {
    const dx = Math.trunc(x) - Math.trunc(state.u?.ux ?? 0);
    const dy = Math.trunc(y) - Math.trunc(state.u?.uy ?? 0);
    return dx * dx + dy * dy;
}

function monsterInventoryLocation(obj, state) {
    if (obj.where !== OBJ_MINVENT || !obj.ocarry) {
        throw new RangeError(
            'lit-item splash requires a monster-carried object',
        );
    }
    return get_obj_location(obj, 0, state);
}

function objectSubject(obj, env) {
    const objectName = splashOperation(env, 'objectName', xnameFresh);
    return `The ${objectName(obj, env.state)}`;
}

async function stopBurn(obj, env) {
    const endBurn = splashOperation(
        env,
        'endBurn',
        (target, nestedEnv) => end_burn(
            target,
            true,
            objectGenerationEnv(nestedEnv),
        ),
    );
    return endBurn(obj, env);
}

// C ref: apply.c snuff_candle() (1472-1494). The floor and hero-inventory
// callers test Blind; monster inventory instead tests the carrier's square.
export async function snuff_candle(obj, env = {}) {
    const state = env.state ?? game;
    const candle = isCandle(obj);
    if ((!candle && obj.otyp !== CANDELABRUM_OF_INVOCATION)
        || !obj.lamplit) {
        return false;
    }
    const context = { ...env, state };
    const location = get_obj_location(obj, 0, state);
    const many = candle
        ? Math.trunc(obj.quan ?? 1) > 1
        : Math.trunc(obj.spe ?? 0) > 1;
    const visible = obj.where === OBJ_MINVENT
        ? Boolean(location && splashOperation(
            context, 'squareVisible', cansee,
        )(location.x, location.y, state))
        : !(context.heroBlind ?? heroIsBlind)(state);
    if (visible) {
        const message = splashOperation(context, 'message', ttyPline);
        await message(
            `${Shk_Your(obj, state)}${candle ? '' : "candelabrum's "}`
            + `candle${many ? "s'" : "'s"} flame`
            + `${many ? 's are' : ' is'} extinguished.`,
            state,
            context,
        );
    }
    await stopBurn(obj, context);
    return true;
}

// C ref: apply.c snuff_lit() (1497-1514). Keep the source order for the
// swallowed-hero inventory branch in mhitu.c gulpmu(): a visible message is
// emitted before end_burn() stops the object's timer and light source.
export async function snuff_lit(obj, env = {}) {
    const state = env.state ?? game;
    const context = { ...env, state };
    if (!obj?.lamplit) return false;
    if (obj.otyp === OIL_LAMP
        || obj.otyp === MAGIC_LAMP
        || obj.otyp === BRASS_LANTERN
        || obj.otyp === POT_OIL) {
        const location = get_obj_location(obj, 0, state);
        const visible = obj.where === OBJ_MINVENT
            ? Boolean(location && splashOperation(
                context, 'squareVisible', cansee,
            )(location.x, location.y, state))
            : !(context.heroBlind ?? heroIsBlind)(state);
        if (visible) {
            const message = splashOperation(context, 'message', ttyPline);
            const objectYname = splashOperation(
                context,
                'objectYname',
                (target) => Yname2(target, state),
            );
            await message(
                `${objectYname(obj, state, context)} `
                + `${otense(obj, 'go', state)} out!`,
                state,
                context,
            );
        }
        await stopBurn(obj, context);
        return true;
    }
    return snuff_candle(obj, context);
}

export async function splash_monster_light(obj, env) {
    let dunk = false;
    if (obj.lamplit && obj.otyp === BRASS_LANTERN) {
        const monster = obj.ocarry;
        monsterInventoryLocation(obj, env.state);
        if (monster && humanoid(monster.data)) {
            const squareVisible = splashOperation(
                env,
                'squareVisible',
                cansee,
            );
            const squareCouldSee = splashOperation(
                env,
                'squareCouldSee',
                couldsee,
            );
            const poolAt = splashOperation(env, 'poolAt', is_pool);
            const visible = squareVisible(
                monster.mx,
                monster.my,
                env.state,
            );
            const heard = squareCouldSee(monster.mx, monster.my, env.state)
                && distanceSquaredFromHero(
                    monster.mx,
                    monster.my,
                    env.state,
                ) < 25;
            dunk = poolAt(monster.mx, monster.my, env.state)
                && ((!is_flyer(monster.data)
                        && !is_floater(monster.data))
                    || onWaterLevel(env.state));
            if (visible || heard) {
                const message = splashOperation(env, 'message', ttyPline);
                await message(
                    `${objectSubject(obj, env)} `
                    + `${heard ? 'crackles' : ''}`
                    + `${heard && visible ? ' and ' : ''}`
                    + `${visible ? 'flickers' : ''}.`,
                    env.state,
                );
            }
            if (!dunk) return false;
        }
    }

    const result = await snuff_lit(obj, env);
    if (dunk) {
        const age = Math.trunc(obj.age ?? 0);
        obj.age = age - (age > 200 ? 100 : Math.trunc(age / 2));
    }
    return result;
}
