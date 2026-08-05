// Inventory burden feedback and floor-square inspection owned by pickup.c.
// C refs: pickup.c encumber_msg(), pickup() and check_here().

import {
    BLINDED,
    EXT_ENCUMBER,
    FUMBLING,
    HVY_ENCUMBER,
    LOOKHERE_NOFLAGS,
    LOOKHERE_PICKED_SOME,
    LOOKHERE_SKIP_DFEATURE,
    LOST_NONE,
    MOD_ENCUMBER,
    OBJ_FLOOR,
    SLT_ENCUMBER,
    STAIRS,
    STONE,
    ROOM,
    CORR,
    is_pit,
} from './const.js';
import { flush_screen, newsym } from './display.js';
import { can_reach_floor, engr_at, read_engr_at } from './engrave.js';
import { game } from './gstate.js';
import {
    calc_capacity,
    inv_cnt,
    inv_weight,
    near_capacity,
    nomul,
    weight_cap,
} from './hack.js';
import {
    addinv_runtime,
    dfeature_at,
    look_here,
    obj_extract_self,
    preflight_addinv_sequence,
    preflight_look_here,
    prinv,
} from './invent.js';
import { notake } from './mondata.js';
import { observe_object } from './o_init.js';
import { objectGenerationEnv } from './object_generation.js';
import { CORPSE, SCR_SCARE_MONSTER } from './objects.js';
import { assertObjectNameable } from './objnam.js';
import { costly_spot } from './shk.js';
import { stairway_at } from './stairs.js';
import { is_lava, is_pool, t_at } from './trap.js';
import { ttyPline } from './tty_message.js';

const INCREASED_BURDEN_MESSAGES = Object.freeze([
    null,
    'Your movements are slowed slightly because of your load.',
    'You rebalance your load.  Movement is difficult.',
    'You stagger under your heavy load.  Movement is very hard.',
    'You can barely move a handspan with this load!',
    "You can't even move a handspan with this load!",
]);

const DECREASED_BURDEN_MESSAGES = Object.freeze([
    'Your movements are now unencumbered.',
    'Your movements are only slowed slightly by your load.',
    'You rebalance your load.  Movement is still difficult.',
    'You stagger under your load.  Movement is still very hard.',
]);

export async function encumber_msg(
    state = game,
    { message = ttyPline } = {},
) {
    state.go ??= {};
    const oldCapacity = Math.trunc(state.go.oldcap ?? 0);
    const newCapacity = near_capacity(state);
    let text = null;
    if (oldCapacity < newCapacity)
        text = INCREASED_BURDEN_MESSAGES[newCapacity] ?? null;
    else if (oldCapacity > newCapacity)
        text = DECREASED_BURDEN_MESSAGES[newCapacity] ?? null;

    if (text) {
        await message(text, state);
        state.disp ??= {};
        state.disp.botl = true;
    }
    state.go.oldcap = newCapacity;
    return newCapacity;
}

// A floor square this port cannot answer for yet.
export class UnsupportedPickupError extends Error {
    constructor(reason) {
        super(`unsupported pickup: ${reason}`);
        this.name = 'UnsupportedPickupError';
        this.reason = reason;
    }
}

function heroIsBlind(state) {
    const blindness = state.u?.uprops?.[BLINDED];
    return Boolean((blindness?.intrinsic || blindness?.extrinsic)
        && !blindness?.blocked);
}

// C ref: pickup.c pickup_object()'s sight-gated observe_object() call. Keep
// this source boundary independently testable because later object naming can
// also set dknown and would otherwise mask a wrong early Blind predicate.
export function observe_pickup_object(obj, state = game) {
    if (!heroIsBlind(state)) observe_object(obj, state);
    return obj;
}

// C ref: pickup.c reset_justpicked().  Regular pickup owns this direct reset;
// gl.loot_reset_justpicked is the separate doloot() handoff consumed by
// addinv_core0() and must not be used to delay this mutation.
export function reset_justpicked(head) {
    for (let obj = head; obj; obj = obj.nobj) obj.pickup_prev = false;
}

function heroHasProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

// This is the bounded branch of pickup.c describe_decor() reached by
// allmain.c moveloop_preamble(FALSE): a new hero stands on the traversed D:1
// staircase before the first command. Later terrain and repeated descriptions
// remain fail-closed at their existing callers.
function startupStairDecor(state) {
    const { u } = state;
    const cell = state.level?.at(u.ux, u.uy);
    const stair = stairway_at(u.ux, u.uy, state);
    const ordinaryExit = cell?.typ === STAIRS
        && stair?.up === true
        && stair.isladder === false
        && stair.u_traversed === true
        && u.uz?.dnum === 0
        && u.uz?.dlevel === 1
        && !u.uhave?.amulet
        && dfeature_at(u.ux, u.uy, state)
            === 'staircase up out of the dungeon';
    if (!ordinaryExit) {
        throw new UnsupportedPickupError(
            'mention_decor outside the initial D:1 staircase',
        );
    }
    if (u.uinwater || heroHasProperty(state, FUMBLING)
        || state.iflags?.defer_decor
        || state.decor_fumble_override
        || state.decor_levitate_override) {
        throw new UnsupportedPickupError(
            'exceptional initial decor description',
        );
    }
    if (state.iflags?.prev_decor !== STONE) {
        throw new UnsupportedPickupError(
            'repeated initial decor description',
        );
    }
    return 'staircase up out of the dungeon';
}

// This source-bounded plan covers describe_decor()'s two silent ordinary
// terrain results. The first step from the remembered startup staircase
// returns TRUE and stores ROOM or CORR. A following step on the same ordinary
// terrain returns FALSE and stores the same value. Other prior terrain can
// invoke back_on_ground(), and every feature-bearing or exceptional state can
// print, defer, or suppress feedback, so those states remain outside this
// owner.
function ordinaryDecorPlan(x, y, state) {
    const typ = state.level?.at(x, y)?.typ;
    if (typ !== ROOM && typ !== CORR) return null;
    if (!state.flags?.mention_decor) {
        throw new UnsupportedPickupError(
            'ordinary describe_decor without mention_decor',
        );
    }
    if (state.u.uinwater || heroHasProperty(state, FUMBLING)
        || state.iflags?.defer_decor
        || state.decor_fumble_override
        || state.decor_levitate_override) {
        throw new UnsupportedPickupError(
            'exceptional ordinary decor description',
        );
    }
    if (dfeature_at(x, y, state)) {
        throw new UnsupportedPickupError(
            'feature-bearing ordinary decor description',
        );
    }
    const previous = state.iflags?.prev_decor;
    if (previous !== STAIRS && previous !== typ) {
        throw new UnsupportedPickupError(
            'ordinary decor after unowned prior terrain',
        );
    }
    return { typ, result: previous !== typ };
}

// Admission calls this before movement so an excluded describe_decor() branch
// cannot move the hero and then fail. The function reads the destination and
// returns C's boolean result without changing terrain memory or output.
export function preflight_describe_decor_at(x, y, state = game) {
    const ordinary = ordinaryDecorPlan(x, y, state);
    if (ordinary) return ordinary.result;
    if (x !== state.u.ux || y !== state.u.uy) {
        throw new UnsupportedPickupError(
            'mention_decor outside silent ordinary terrain',
        );
    }
    startupStairDecor(state);
    return true;
}

// Temporary startup admission for the portion of pickup(1) selected by this
// boundary. It runs before reset_justpicked(), so an excluded object,
// engraving, or terrain leaves inventory and decor memory unchanged.
export function preflight_initial_pickup(state = game) {
    const { u } = state;
    if (state.level?.objects?.[u.ux]?.[u.uy]) {
        throw new UnsupportedPickupError('initial floor object');
    }
    if (engr_at(u.ux, u.uy, state)) {
        throw new UnsupportedPickupError('initial engraving');
    }
    if (state.flags?.mention_decor) startupStairDecor(state);
}

// C ref: pickup.c describe_decor(). This owns the startup staircase output and
// the silent STAIRS-to-ROOM/CORR and equal-ROOM/CORR branches described above.
export async function describe_decor(state) {
    const ordinary = ordinaryDecorPlan(state.u.ux, state.u.uy, state);
    if (ordinary) {
        state.iflags.prev_decor = ordinary.typ;
        return ordinary.result;
    }
    const feature = startupStairDecor(state);
    await ttyPline(state.flags?.verbose === true
        ? `There is a ${feature} here.`
        : `A ${feature}.`, state);
    state.iflags.prev_decor = STAIRS;
    return true;
}

function planAutomaticFloorPickup(state) {
    const { u } = state;
    const costly = costly_spot(u.ux, u.uy, state);
    const selected = [];
    const remaining = [];
    for (let obj = state.level.objects[u.ux][u.uy];
        obj;
        obj = obj.nexthere) {
        if (costly && !obj.no_charge) {
            remaining.push(obj);
            continue;
        }
        if ((obj.how_lost ?? LOST_NONE) !== LOST_NONE) {
            throw new UnsupportedPickupError(
                'pickup() with a lost-object option override',
            );
        }
        selected.push({ obj, count: obj.quan });
    }

    // Preflight every selected item before observe_object() or unlinking the
    // first. This is the narrow fail-closed boundary for special pickup
    // behavior and keeps both floor indexes and discovery state atomic.
    let addedWeight = 0;
    for (const { obj, count } of selected) {
        if (obj.where !== OBJ_FLOOR || !Number.isInteger(count) || count < 1)
            throw new UnsupportedPickupError('pickup() malformed floor object');
        if (obj.oartifact || obj.otyp === CORPSE
            || obj.otyp === SCR_SCARE_MONSTER) {
            throw new UnsupportedPickupError(
                'pickup() special artifact, corpse, or scare scroll',
            );
        }
        assertObjectNameable(obj, state);
        addedWeight += Math.trunc(obj.owt);
    }
    if (inv_cnt(false, state) + selected.length > 52) {
        throw new UnsupportedPickupError('pickup() with a full pack');
    }
    if (inv_weight(state) + addedWeight >= 2 * weight_cap(state)) {
        throw new UnsupportedPickupError(
            'pickup() requiring a partial or failed lift',
        );
    }
    const promptLimit = Math.max(
        near_capacity(state),
        state.flags?.pickup_burden ?? MOD_ENCUMBER,
    );
    if (calc_capacity(addedWeight, state) > promptLimit) {
        throw new UnsupportedPickupError('pickup() requiring a burden prompt');
    }

    const env = objectGenerationEnv({
        state,
        hooks: {
            message: ttyPline,
            inventoryComparisonDiscovered: () => ttyPline(
                'You learn more about your items by comparing them.',
                state,
            ),
        },
    });
    const addPlans = preflight_addinv_sequence(
        selected.map(({ obj }) => obj),
        env,
        { observeObjects: !heroIsBlind(state) },
    );
    for (const plan of addPlans)
        assertObjectNameable(plan.projectedResult, state);
    return { addPlans, env, remaining, selected };
}

// Random arrival commits placement, room entry and its display before
// goto_level() reaches pickup(1). Validate the complete supported floor
// transaction against the projected destination first, so a later naming or
// pricing refusal cannot leave those earlier writes behind.
export function preflight_random_arrival_pickup(state = game) {
    const { u } = state;
    if (u.uswallow)
        throw new UnsupportedPickupError('pickup() inside a monster');
    if (Math.trunc(state.multi) < 0)
        throw new UnsupportedPickupError('pickup() while helpless');

    const head = state.level?.objects?.[u.ux]?.[u.uy] ?? null;
    const inaccessibleLiquid = [
        is_pool(u.ux, u.uy, state) && !u.uinwater,
        is_lava(u.ux, u.uy, state),
    ].some(Boolean);
    if (state.context?.nopick || !head || inaccessibleLiquid) {
        if (state.flags?.mention_decor)
            preflight_describe_decor_at(u.ux, u.uy, state);
        return;
    }

    const trap = t_at(u.ux, u.uy, state);
    if (!can_reach_floor(Boolean(trap && is_pit(trap.ttyp)), state)) {
        throw new UnsupportedPickupError(
            'pickup() by a hero who cannot reach the floor',
        );
    }
    if (notake(state.youmonst?.data)) {
        throw new UnsupportedPickupError(
            'pickup() by a hero who cannot take objects',
        );
    }

    let remaining;
    let pickedSome;
    if ((Math.trunc(state.multi) && !state.context?.run)
        || !state.flags?.pickup) {
        remaining = [];
        for (let obj = head; obj; obj = obj.nexthere) remaining.push(obj);
    } else {
        if (state.ga?.apelist) {
            throw new UnsupportedPickupError(
                'pickup() with autopickup exceptions',
            );
        }
        if (state.flags?.pickup_types)
            throw new UnsupportedPickupError('pickup() with pickup_types');
        const plan = planAutomaticFloorPickup(state);
        remaining = plan.remaining;
        pickedSome = Boolean(plan.selected.length);
    }

    if (state.flags?.mention_decor)
        preflight_describe_decor_at(u.ux, u.uy, state);
    const lookhereFlags = pickedSome
        ? LOOKHERE_PICKED_SOME : LOOKHERE_NOFLAGS;
    preflight_look_here(remaining.length, lookhereFlags, state, {
        objects: remaining,
        decorTerrain: state.flags?.mention_decor
            ? state.level.at(u.ux, u.uy)?.typ : null,
    });
}

// C ref: pickup.c pickup() (672-910), autopick(), pickup_object(), pick_obj()
// and pickup_prinv(). In addition to the no-object/no-autopickup arms, this
// covers the complete ordinary generated-floor-object path used by a level
// teleport arrival. Special corpses, artifacts, scare scrolls, option filters,
// burden prompts, partial stacks and full packs stop before ownership changes.
export async function pickup(what, state = game) {
    const u = state.u;
    const autopickup = what > 0;

    if (u.uswallow) {
        // The engulfed arm picks from u.ustuck->minvent rather than the floor.
        throw new UnsupportedPickupError('pickup() inside a monster');
    }
    if (autopickup && Math.trunc(state.multi ?? 0) < 0) {
        // unconscious() is HERO_FAINTED || u.usleep || ...; the elapsed-turn
        // boundary refuses every state that sets it.
        throw new UnsupportedPickupError('pickup() while helpless');
    }
    state.gp ??= {};
    state.gp.pickup_encumbrance = 0;

    const objectHere = Boolean(
        state.level?.objects?.[u.ux]?.[u.uy] ?? null,
    );
    if (autopickup
        && (state.context?.nopick || !objectHere
            || (is_pool(u.ux, u.uy, state) && !u.uinwater)
            || is_lava(u.ux, u.uy, state))) {
        if (state.flags?.mention_decor) {
            await describe_decor(state);
        }
        await read_engr_at(u.ux, u.uy, state, {
            pline: ttyPline,
            canReachFloor: can_reach_floor,
        });
        return 0;
    }

    const trap = t_at(u.ux, u.uy, state);
    if (!can_reach_floor(Boolean(trap && is_pit(trap.ttyp)), state)) {
        // The unconditional describe_decor() on this arm has no owner, and
        // reaching the arm at all needs levitation, a steed or a pit.
        throw new UnsupportedPickupError(
            'pickup() by a hero who cannot reach the floor',
        );
    }

    if (notake(state.youmonst?.data)) {
        throw new UnsupportedPickupError(
            'pickup() by a hero who cannot take objects',
        );
    }
    if ((Math.trunc(state.multi ?? 0) && !state.context?.run)
        || (autopickup && !state.flags?.pickup)) {
        await check_here(false, state);
        return 0;
    }

    if (objectHere && state.context?.run && state.context.run !== 8
        && !state.context.nopick) {
        nomul(0, state);
    }

    if (state.ga?.apelist) {
        throw new UnsupportedPickupError(
            'pickup() with autopickup exceptions',
        );
    }
    if (state.flags?.pickup_types) {
        throw new UnsupportedPickupError('pickup() with pickup_types');
    }

    const { addPlans, env, selected } = planAutomaticFloorPickup(state);

    if (selected.length) reset_justpicked(state.invent);
    let picked = 0;
    for (let index = 0; index < selected.length; ++index) {
        const { obj, count } = selected[index];
        observe_pickup_object(obj, state);
        obj_extract_self(obj, env);
        newsym(u.ux, u.uy);
        const carried = await addinv_runtime(obj, env, addPlans[index]);
        const nearload = near_capacity(state);
        let prefix = null;
        if (nearload !== state.gp.pickup_encumbrance) {
            state.gp.pickup_encumbrance = nearload;
            if (nearload >= EXT_ENCUMBER)
                prefix = 'You have extreme difficulty lifting';
            else if (nearload >= HVY_ENCUMBER)
                prefix = 'You have much trouble lifting';
            else if (nearload >= MOD_ENCUMBER)
                prefix = 'You have trouble lifting';
            else if (nearload >= SLT_ENCUMBER)
                prefix = 'You have a little trouble lifting';
        }
        await prinv(prefix, carried, count, env);
        ++picked;
    }

    if (picked) newsym(u.ux, u.uy);
    await check_here(picked > 0, state);
    state.gp.pickup_encumbrance = 0;
    return selected.length > 0 ? 1 : 0;
}

// C ref: pickup.c check_here(), reached from domove() through spoteffects()
// and pickup(). uchain has no ported owner, so every object on the square
// counts, as it does for an unpunished hero.
export async function check_here(picked_some, state = game) {
    let lookhereFlags = picked_some
        ? LOOKHERE_PICKED_SOME : LOOKHERE_NOFLAGS;
    if (state.flags?.mention_decor && await describe_decor(state))
        lookhereFlags |= LOOKHERE_SKIP_DFEATURE;

    let count = 0;
    for (let obj = state.level?.objects?.[state.u.ux]?.[state.u.uy] ?? null;
        obj;
        obj = obj.nexthere) {
        ++count;
    }

    if (count) {
        // Stepping onto objects ends a run before their description prints.
        if (state.context.run) nomul(0, state);
        await flush_screen(1);
        await look_here(
            count,
            lookhereFlags,
            state,
            {
                message: ttyPline,
                readEngraving: () => read_engr_at(
                    state.u.ux,
                    state.u.uy,
                    state,
                    { pline: ttyPline, canReachFloor: can_reach_floor },
                ),
            },
        );
    } else {
        await read_engr_at(state.u.ux, state.u.uy, state, {
            pline: ttyPline,
            canReachFloor: can_reach_floor,
        });
    }
}
