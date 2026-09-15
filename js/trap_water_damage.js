// Water damage for items.
// C ref: trap.c water_damage() (4712-4852) and water_damage_chain().
//
// water_damage_monster_equipment() handles the monster-equipment path
// (rust traps and rust monster attacks). water_damage() handles the
// general case for hero items: dipfountain(), dip-into-pool, and the
// pool/moat entry path in water_damage_chain().

import {
    BURIED_TOO,
    CONTAINED_TOO,
    DEAF,
    EF_NONE,
    ERODE_RUST,
    ER_DAMAGED,
    ER_GREASED,
    ER_NOTHING,
    FLYING,
    HALLUC,
    HALLUC_RES,
    LEVITATION,
    OBJ_INVENT,
    OBJ_MINVENT,
    WWALKING,
    W_ARMOR,
    W_WEP,
} from './const.js';
import { splash_monster_light } from './apply_splash_lit.js';
import { carried, isCandle, isContainer } from './obj.js';
import { cxname, otense, vtense, Yname2, yname } from './objnam.js';
import { hliquid } from './do_name.js';
import { get_obj_location } from './light.js';
import { game } from './gstate.js';
import { discover_object } from './o_init.js';
import { erode_obj } from './trap_erode_obj.js';
import { end_burn } from './timeout.js';
import { objectGenerationEnv } from './object_generation.js';
import { note_unported } from './unported.js';
import { heroIsBlind } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';

function propertyActive(hero, property) {
    const value = hero?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function heroIsDeaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(
        deafness?.intrinsic || deafness?.extrinsic
        || state.u?.uroleplay?.deaf,
    );
}

function heroHallucinating(state) {
    return propertyActive(state.u, HALLUC)
        && !propertyActive(state.u, HALLUC_RES);
}

function sameLevel(left, right) {
    return Boolean(left && right
        && left.dnum === right.dnum
        && left.dlevel === right.dlevel);
}

function containerIsWaterproof(obj, objects) {
    return obj.otyp === objects.OILSKIN_SACK
        || obj.otyp === objects.ICE_BOX
        || obj.otyp === objects.LARGE_BOX
        || obj.otyp === objects.CHEST;
}

async function updateInventory(env) {
    if (typeof env.updateInventory === 'function') {
        return env.updateInventory(env);
    }
    const { update_inventory } = await import('./invent.js');
    return update_inventory(env);
}

async function splashEndBurn(obj, env) {
    if (typeof env.endBurn === 'function') {
        return env.endBurn(obj, env);
    }
    return end_burn(obj, true, objectGenerationEnv(env));
}

async function heroPoolAt(x, y, state, env) {
    if (typeof env.poolAt === 'function')
        return env.poolAt(x, y, state);
    // Keep trap.js out of this module's static dependency graph: trap.js owns
    // the production pool predicate and imports trap_effects.js, which calls
    // back into this file.
    const { is_pool } = await import('./trap.js');
    return is_pool(x, y, state);
}

async function splashHeroLight(obj, env, state) {
    if (!obj?.lamplit) return false;

    if (obj.where === OBJ_MINVENT) {
        return splash_monster_light(obj, env);
    }

    let dunk = false;
    if (obj.otyp === (await import('./objects.js')).BRASS_LANTERN
        && obj.where === OBJ_INVENT) {
        const useeit = !heroIsBlind(state);
        const uhearit = !heroIsDeaf(state);
        dunk = await heroPoolAt(state.u?.ux, state.u?.uy, state, env)
            && ((!propertyActive(state.u, LEVITATION)
                    && !propertyActive(state.u, FLYING)
                    && !propertyActive(state.u, WWALKING))
                || sameLevel(state.u?.uz, state.water_level));
        if (useeit || uhearit) {
            const message = env.message ?? ttyPline;
            await message(
                `${Yname2(obj, state)} `
                + `${uhearit ? 'crackles' : ''}`
                + `${uhearit && useeit ? ' and ' : ''}`
                + `${useeit ? 'flickers' : ''}.`,
                state,
            );
        }
        if (!dunk) return false;
    }

    const {
        BRASS_LANTERN,
        CANDELABRUM_OF_INVOCATION,
        MAGIC_LAMP,
        OIL_LAMP,
        POT_OIL,
    } = await import('./objects.js');
    if (obj.otyp === OIL_LAMP
        || obj.otyp === MAGIC_LAMP
        || obj.otyp === BRASS_LANTERN
        || obj.otyp === POT_OIL) {
        const location = get_obj_location(obj, 0, state);
        if (obj.where === OBJ_MINVENT
            ? location && !heroIsBlind(state)
            : !heroIsBlind(state)) {
            const message = env.message ?? ttyPline;
            await message(
                `${Yname2(obj, state)} ${otense(obj, 'go')} out!`,
                state,
            );
        }
        await splashEndBurn(obj, env);
    } else if (isCandle(obj) || obj.otyp === CANDELABRUM_OF_INVOCATION) {
        const candle = isCandle(obj);
        const many = candle
            ? Math.trunc(obj.quan ?? 1) > 1
            : Math.trunc(obj.spe ?? 0) > 1;
        if (!heroIsBlind(state)) {
            const message = env.message ?? ttyPline;
            const kind = candle ? 'candle' : "candelabrum's candle";
            await message(
                `Your ${kind}${many ? "s'" : "'s"} flame`
                    + `${many ? 's are' : ' is'} extinguished.`,
                state,
            );
        }
        await splashEndBurn(obj, env);
    } else {
        return false;
    }

    if (dunk) {
        const age = Math.trunc(obj.age ?? 0);
        obj.age = age - (age > 200 ? 100 : Math.trunc(age / 2));
    }
    return true;
}

async function splashLit(obj, env, state) {
    if (typeof env.splashLight === 'function')
        return env.splashLight(obj, env);
    return splashHeroLight(obj, env, state);
}

async function wetTowel(obj, random, env) {
    const rnd = random.rnd ?? (await import('./rng.js')).rnd;
    const amount = -rnd(7 - (obj.spe ?? 0));
    if (typeof env.wetATowel === 'function') {
        await env.wetATowel(obj, amount, true, env);
    } else {
        note_unported('weapon.c wet_a_towel');
    }
}

async function acidDamage(obj, inInvent, described, env) {
    if (typeof env.potAcidDamage === 'function') {
        await env.potAcidDamage(obj, inInvent, described, env);
    } else {
        note_unported('trap.c pot_acid_damage');
    }
}

async function blankNovel(obj, env) {
    obj.novelidx = 0;
    if (obj.oextra && typeof obj.oextra === 'object')
        delete obj.oextra.oname;
    if (typeof env.blankNovel === 'function') {
        await env.blankNovel(obj, env);
    } else {
        note_unported('zap.c blank_novel');
    }
}

async function damageContents(obj, env) {
    if (!obj.cobj) return;
    if (typeof env.waterDamageChain === 'function') {
        await env.waterDamageChain(obj.cobj, false, env);
    } else {
        note_unported('trap.c water_damage_chain');
    }
}

function waterOperation(env, name, fallback) {
    const operation = env[name] ?? fallback;
    if (typeof operation !== 'function') {
        throw new TypeError(
            `monster water damage requires a ${name} operation`,
        );
    }
    return operation;
}

// Rust traps pass force=TRUE and only select worn armor or MON_WEP().
// Keep other water_damage() callers fail-closed before any item mutation.
export async function water_damage_monster_equipment(
    obj,
    description,
    env,
) {
    if (!obj) return ER_NOTHING;
    const wornMask = Math.trunc(obj.owornmask ?? 0);
    if (obj.where !== OBJ_MINVENT
        || !obj.ocarry
        || !(wornMask & (W_ARMOR | W_WEP))) {
        throw new RangeError(
            'monster water damage requires worn armor or a wielded weapon',
        );
    }

    const splashLight = waterOperation(
        env,
        'splashLight',
        splash_monster_light,
    );
    if (await splashLight(obj, env)) return ER_DAMAGED;

    if (obj.greased) {
        if (!env.random.rn2(2)) obj.greased = false;
        return ER_GREASED;
    }

    const erodeObject = waterOperation(
        env,
        'erodeObject',
        erode_obj,
    );
    return erodeObject(
        obj,
        description,
        ERODE_RUST,
        EF_NONE,
        env,
    );
}

// ── water_damage ──
// C ref: trap.c water_damage() (4712-4852). General water damage for
// hero-carried items. Called by dipfountain() and the dip-into-pool
// arm of dodip(). The `force` parameter skips the luck-based protection
// check; dipfountain and pool dipping always pass force=TRUE.
//
export async function water_damage(obj, description, force, env = {}) {
    if (!obj) return ER_NOTHING;

    const state = env.state ?? game;
    const message = env.message ?? ttyPline;
    const random = env.random ?? (await import('./rng.js'));

    // C ref: trap.c:4722-4723. splash_lit() extinguishes lit items. The
    if (obj.lamplit) {
        // splash_lit() returns FALSE for a brass lantern that is not dunked,
        // so water_damage() must continue into its ordinary object branches.
        if (await splashLit(obj, env, state)) return ER_DAMAGED;
    }

    const in_invent = carried(obj);
    if (!description) description = cxname(obj, state);

    // C ref: trap.c:4728-4729. Can of grease absorbs water.
    const objects = await import('./objects.js');
    const { CAN_OF_GREASE, TOWEL: TOWEL_OTYP } = objects;
    if (obj.otyp === CAN_OF_GREASE && (obj.spe ?? 0) > 0) {
        return ER_NOTHING;
    }

    // C ref: trap.c:4730-4734. Towel gets wetter.
    if (obj.otyp === TOWEL_OTYP && (obj.spe ?? 0) < 7) {
        await wetTowel(obj, random, env);
        return ER_NOTHING;
    }

    // C ref: trap.c:4736-4750. Greased item.
    if (obj.greased) {
        if (!random.rn2(2)) {
            obj.greased = false;
            if (in_invent) {
                await message(
                    `The grease on ${yname(obj, state)} washes off.`,
                    state);
                await updateInventory(env);
            }
            // C ref: trap.c:4744-4748. Ungreased potion of acid is destroyed.
            if (obj.otyp === objects.POT_ACID)
                await acidDamage(obj, in_invent, true, env);
        }
        return ER_GREASED;
    }

    // C ref: trap.c:4751-4770. Container and waterproof container.
    // obj.h: Is_container(o) and Waterproof_container(o). Waterproof
    // containers are oilskin sacks, ice boxes, and the two box types.
    if (isContainer(obj)
        && (!containerIsWaterproof(obj, objects)
            || (obj.cursed && !random.rn2(3)))) {
        if (in_invent) {
            await message(
                `Some ${hliquid('water', { ...env, state })}`
                    + ` gets into your ${description}!`,
                state,
            );
            state.gm ??= {};
            state.gm.mentioned_water = !heroHallucinating(state);
        }
        await damageContents(obj, env);
        return ER_DAMAGED;
    }
    if (isContainer(obj) && containerIsWaterproof(obj, objects)) {
        if (in_invent && !heroIsBlind(state) && !state.u?.uinwater) {
            await message(
                `The ${hliquid('water', { ...env, state })}`
                    + ` cannot get into your ${description}.`,
                state,
            );
            state.gm ??= {};
            state.gm.mentioned_water = !heroHallucinating(state);
            const makeKnown = env.makeKnown ?? env.makeknown;
            if (typeof makeKnown === 'function') {
                await makeKnown(obj.otyp, state, env);
            } else {
                discover_object(obj.otyp, true, true, true, state, {
                    random,
                });
            }
        }
        return ER_DAMAGED;
    }

    // C ref: trap.c:4771-4777. Luck-based protection (skipped when force).
    if (!force) {
        const luck = state.u?.uluck ?? 0;
        if ((luck + 5) > random.rn2(20)) {
            return ER_NOTHING;
        }
    }

    // C ref: trap.c:4778-4792. Scroll blanking.
    const { SCROLL_CLASS, SPBOOK_CLASS, POTION_CLASS } =
        objects;
    if (obj.oclass === SCROLL_CLASS) {
        if (obj.otyp === objects.SCR_BLANK_PAPER) return ER_NOTHING;
        if (in_invent)
            await message(`Your ${description} ${vtense(description, 'fade')}.`, state);
        obj.otyp = objects.SCR_BLANK_PAPER;
        obj.dknown = 0;
        obj.spe = 0;
        if (in_invent) await updateInventory(env);
        return ER_DAMAGED;
    }

    // C ref: trap.c:4793-4823. Spellbook blanking.
    if (obj.oclass === SPBOOK_CLASS) {
        const oldType = obj.otyp;
        if (oldType === objects.SPE_BOOK_OF_THE_DEAD) {
            const location = get_obj_location(
                obj,
                CONTAINED_TOO | BURIED_TOO,
                state,
            );
            const ox = location?.x ?? 0;
            const oy = location?.y ?? 0;
            if (location) {
                obj.ox = ox;
                obj.oy = oy;
            }
            if (location && (await import('./const.js')).isok(ox, oy)) {
                const canSee = env.canSee
                    ?? (await import('./vision.js')).cansee;
                if (canSee(ox, oy, state)) {
                    await message(
                        `Steam rises from ${await import('./objnam.js')
                            .then(({ the, xname }) => the(xname(obj, state), state))}.`,
                        state,
                    );
                }
            }
            return ER_NOTHING;
        }
        if (oldType === objects.SPE_BLANK_PAPER) return ER_NOTHING;
        if (in_invent)
            await message(`Your ${description} ${vtense(description, 'fade')}.`, state);
        obj.otyp = objects.SPE_BLANK_PAPER;
        if (obj.spestudied) obj.spestudied = random.rn2(obj.spestudied);
        obj.dknown = 0;
        if (oldType === objects.SPE_NOVEL) await blankNovel(obj, env);
        if (in_invent) await updateInventory(env);
        return ER_DAMAGED;
    }

    // C ref: trap.c:4824-4847. Potion dilution / acid destruction.
    if (obj.oclass === POTION_CLASS) {
        if (obj.otyp === objects.POT_ACID) {
            await acidDamage(obj, in_invent, false, env);
            return ER_DESTROYED;
        }
        if (obj.odiluted) {
            if (in_invent)
                await message(
                    `Your ${description} ${vtense(description, 'dilute')} further.`,
                    state,
                );
            obj.otyp = objects.POT_WATER;
            obj.dknown = 0;
            obj.blessed = false;
            obj.cursed = false;
            obj.odiluted = 0;
            if (in_invent) await updateInventory(env);
            return ER_DAMAGED;
        }
        if (obj.otyp !== objects.POT_WATER) {
            if (in_invent)
                await message(
                    `Your ${description} ${vtense(description, 'dilute')}.`,
                    state,
                );
            obj.odiluted = (obj.odiluted ?? 0) + 1;
            if (in_invent) await updateInventory(env);
            return ER_DAMAGED;
        }
        return ER_NOTHING;
    }

    // C ref: trap.c:4849. Default: rust erosion.
    return erode_obj(obj, description, ERODE_RUST, EF_NONE, env);
}
