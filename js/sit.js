// C ref: sit.c lay_an_egg() (358-399) and dosit() (400-568). `#sit` owns
// the complete guard and terrain chain here; source-discarded void effects
// that remain unported are named at their call sites and skipped.

import {
    A_STR,
    A_WIS,
    COLD_RES,
    DEAF,
    DRAWBRIDGE_DOWN,
    ECMD_OK,
    ECMD_TIME,
    FOOT,
    FIRE_RES,
    FOUNTAIN,
    HALF_PHDAM,
    HALLUC,
    HALLUC_RES,
    IS_ALTAR,
    IS_GRAVE,
    IS_SINK,
    IS_THRONE,
    KILLED_BY,
    LADDER,
    LEVITATION,
    SLIMED,
    SPIKED_PIT,
    STAIRS,
    TT_BEARTRAP,
    TT_BURIEDBALL,
    TT_INFLOOR,
    TT_LAVA,
    TT_PIT,
    TT_WEB,
    Upolyd,
} from './const.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { game } from './gstate.js';
import {
    amorphous,
    eggs_in_water,
    humanoid,
    is_hider,
    lays_eggs,
    likes_lava,
    mhis,
    slithy,
    sticks,
} from './mondata.js';
import {
    PM_ELECTRIC_EEL,
    PM_GIANT_EEL,
    PM_GREMLIN,
    PM_TRAPPER,
    S_DRAGON,
} from './monsters.js';
import { isBox, mksobj, objectType, remove_object, set_corpsenm, weight } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { observe_object } from './o_init.js';
import { The, the, xnameFresh } from './objnam.js';
import {
    CLOTH,
    COIN_CLASS as OBJECT_COIN_CLASS,
    CORPSE,
    CREAM_PIE,
    EGG,
    TOWEL as OBJECT_TOWEL,
    WATER_WALKING_BOOTS,
} from './objects.js';
import { body_part } from './polyself.js';
import { d, rn1, rn2, rne, rnd } from './rng.js';
import { S_altar, S_grave, S_ice, S_sink, S_throne } from './symbols.js';
import { is_ice } from './terrain.js';
import { Flying, is_lava, is_pool, t_at, uescaped_shaft, uteetering_at_seen_pit } from './trap.js';
import { Monnam, hliquid, mon_nam } from './do_name.js';
import { canSpotMonster } from './startup_a11y.js';
import { note_unported } from './unported.js';

// youprop.h:120 Hallucination: intrinsic only, unless resisted.
function Hallucination(state) {
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(hallucination?.intrinsic)
        && !Boolean(resistance?.intrinsic || resistance?.extrinsic);
}

// youprop.h:240 Levitation, including its blocking term.
function Levitation(state) {
    const value = state.u?.uprops?.[LEVITATION];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

// youprop.h:125 Deaf: intrinsic/extrinsic deafness and the roleplay option.
function Deaf(state) {
    const value = state.u?.uprops?.[DEAF];
    return Boolean(value?.intrinsic || value?.extrinsic)
        || Boolean(state.u?.uroleplay?.deaf);
}

function Underwater(state) {
    return Boolean(state.u?.uinwater);
}

function Is_waterlevel(state) {
    const level = state.water_level;
    const here = state.u?.uz;
    return Boolean(level && here
        && level.dnum === here.dnum && level.dlevel === here.dlevel);
}

function Half_physical_damage(state) {
    const value = state.u?.uprops?.[HALF_PHDAM];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function Fire_resistance(state) {
    const value = state.u?.uprops?.[FIRE_RES];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function Cold_resistance(state) {
    const value = state.u?.uprops?.[COLD_RES];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function sit_message(what) {
    return `You sit on the ${what}.`;
}

function sit_water_random(rawEnv) {
    return rawEnv.random ?? { d, rn1, rn2, rne, rnd };
}

async function sit_exercise(index, state, random) {
    const { exercise } = await import('./attrib.js');
    const options = {};
    if (index === A_STR && (state.moves ?? 0) > 0) {
        const { encumber_msg } = await import('./pickup.js');
        options.encumberMessage = encumber_msg;
    }
    await exercise(index, false, state, random, options);
}

// sit.c:511-525, reached both by the label gotos above and by the ordinary
// pool arm below. The split_mon result controls dryup() exactly as in C.
async function sit_in_water(state, random, rawEnv) {
    const u = state.u;
    await (rawEnv.message ?? (await import('./tty_message.js')).ttyPline)(
        `You sit in the ${hliquid('water', { ...rawEnv, state })}.`, state,
    );

    if (Upolyd(u) && u.umonnum === PM_GREMLIN) {
        const { split_mon } = await import('./potion.js');
        const clone = await split_mon(state.youmonst, null, {
            ...rawEnv,
            state,
            random,
        });
        if (clone && state.level?.at(u.ux, u.uy)?.typ === FOUNTAIN) {
            const { dryup } = await import('./fountain.js');
            await dryup(u.ux, u.uy, true, state, { ...rawEnv, random });
        }
        // Splitting or failing to split protects gear from the water.
        return;
    }

    const { water_damage } = await import('./trap_water_damage.js');
    if (!random.rn2(10) && state.uarm)
        await water_damage(state.uarm, 'armor', true, { ...rawEnv, state, random });
    if (!random.rn2(10) && state.uarmf
        && state.uarmf.otyp !== WATER_WALKING_BOOTS) {
        await water_damage(
            state.uarmf,
            'armor',
            true,
            { ...rawEnv, state, random },
        );
    }
}

// C ref: sit.c lay_an_egg() (358-399). This complete helper is called only
// after dosit() has established lays_eggs(gy.youmonst.data).
export async function lay_an_egg(state = game, rawEnv = {}) {
    const u = state.u;
    const species = state.youmonst?.data;
    const random = sit_water_random(rawEnv);
    const message = rawEnv.message ?? (await import('./tty_message.js')).ttyPline;
    const eggType = objectType(EGG, state);

    if (!state.flags?.female) {
        await message(
            Hallucination(state)
                ? 'You may think you are a platypus, but a male still can\'t lay eggs!'
                : "Males can't lay eggs!",
            state,
        );
        return ECMD_OK;
    }
    if (u.uhunger < eggType.oc_nutrition) {
        await message("You don't have enough energy to lay an egg.", state);
        return ECMD_OK;
    }
    if (eggs_in_water(species)) {
        if (!(Underwater(state) || Is_waterlevel(state))) {
            await message('A splash tetra you are not.', state);
            return ECMD_OK;
        }
        if (Upolyd(u)
            && (u.umonnum === PM_GIANT_EEL
                || u.umonnum === PM_ELECTRIC_EEL)) {
            await message('You yearn for the Sargasso Sea.', state);
            return ECMD_OK;
        }
    }

    const objectEnv = objectGenerationEnv({ ...rawEnv, state, random });
    const egg = mksobj(EGG, false, false, objectEnv);
    egg.spe = 1;
    egg.quan = 1;
    egg.owt = weight(egg, objectEnv);
    const { egg_type_from_parent } = await import('./mon.js');
    set_corpsenm(
        egg,
        egg_type_from_parent(u.umonnum, false, { ...rawEnv, random }),
        objectEnv,
    );
    egg.known = 1;
    observe_object(egg, state);
    await message(
        `You ${eggs_in_water(species) ? 'spawn' : 'lay'} an egg.`, state,
    );

    // do.c dropy() needs the same display, object extraction, and
    // encumbrance operations its production command supplies.
    const { dropy } = await import('./do.js');
    const [{ encumber_msg }, { newsym }] = await Promise.all([
        import('./pickup.js'),
        import('./display.js'),
    ]);
    const dropEnv = {
        ...rawEnv,
        state,
        hooks: {
            encumberMessage: encumber_msg,
            extractExternalObject: remove_object,
            newsym,
        },
    };
    await dropy(egg, dropEnv);
    // The second stackobj() is present in C even though dropy() also reaches
    // stackobj() through dropz(). Keep this source call and object identity.
    const { stackobj } = await import('./invent.js');
    stackobj(egg, objectEnv);
    const { morehungry } = await import('./eat.js');
    await morehungry(eggType.oc_nutrition, state, { ...rawEnv, random });
    return ECMD_TIME;
}

// C ref: sit.c dosit() (400-568), the full #sit handler. The command's
// return is forwarded to rhack(), which alone charges the turn.
export async function dosit(state = game, rawEnv = {}) {
    const u = state.u;
    const species = state.youmonst?.data;
    const random = sit_water_random(rawEnv);
    const message = rawEnv.message ?? (await import('./tty_message.js')).ttyPline;
    const trap = t_at(u.ux, u.uy, state);
    const typ = state.level?.at(u.ux, u.uy)?.typ;

    if (u.usteed) {
        await message(
            `You are already sitting on ${mon_nam(u.usteed, state, rawEnv)}.`,
            state,
        );
        return ECMD_OK;
    }
    if (u.uundetected && is_hider(species) && u.umonnum !== PM_TRAPPER)
        u.uundetected = 0;

    const { can_reach_floor } = await import('./engrave.js');
    if (!can_reach_floor(false, state)) {
        if (u.uswallow) await message('There are no seats in here!', state);
        else if (Levitation(state)) await message('You tumble in place.', state);
        else await message('You are sitting on air.', state);
        return ECMD_OK;
    } else if (u.ustuck && !sticks(species)) {
        if (humanoid(u.ustuck.data)) {
            await message(
                `${Monnam(u.ustuck, state, rawEnv)} won't offer ${mhis(
                    u.ustuck,
                    { ...rawEnv, state, canSpotMonster },
                )} lap.`,
                state,
            );
        } else {
            await message(`${Monnam(u.ustuck, state, rawEnv)} has no lap.`, state);
        }
        return ECMD_OK;
    } else if (is_pool(u.ux, u.uy, state) && !Underwater(state)) {
        await sit_in_water(state, random, rawEnv);
        return ECMD_TIME;
    } else if (Upolyd(u) && u.umonnum === PM_GREMLIN
               && (typ === FOUNTAIN || is_pool(u.ux, u.uy, state))) {
        await sit_in_water(state, random, rawEnv);
        return ECMD_TIME;
    }

    const pile = state.level?.objects?.[u.ux]?.[u.uy] ?? null;
    if (pile
        && !(uteetering_at_seen_pit(trap, state)
             || uescaped_shaft(trap, state))) {
        const obj = pile;
        if (species?.mlet === S_DRAGON && obj.oclass === OBJECT_COIN_CLASS) {
            const { money_cnt } = await import('./invent.js');
            await message(
                `You coil up around your ${(obj.quan + money_cnt(
                    state.invent,
                    state,
                ) < u.ulevel * 1000) ? 'meager ' : ''}hoard.`,
                state,
            );
        } else if (obj.otyp === OBJECT_TOWEL) {
            await message("It's probably not a good time for a picnic...", state);
        } else {
            if (slithy(species)) {
                await message(
                    `You coil up around ${the(xnameFresh(obj, state), state)}.`,
                    state,
                );
            } else {
                await message(
                    `You sit on ${the(xnameFresh(obj, state), state)}.`, state,
                );
            }
            if (obj.otyp === CORPSE
                && amorphous(state.mons[obj.corpsenm])) {
                await message("It's squishy...", state);
            } else if (obj.otyp === CREAM_PIE) {
                if (!Deaf(state)) await message('Squelch!', state);
                const { useupf } = await import('./invent.js');
                await useupf(obj, obj.quan, {
                    state,
                    hooks: { extractExternalObject: remove_object },
                });
            } else if (!(isBox(obj)
                         || objectType(obj, state).oc_material === CLOTH)) {
                await message("It's not very comfortable...", state);
            }
        }
    } else if (trap !== null || (u.utrap && u.utraptype >= TT_LAVA)) {
        if (u.utrap) {
            await sit_exercise(A_WIS, state, random);
            if (u.utraptype === TT_BEARTRAP) {
                await message(
                    `You can't sit down with your ${body_part(FOOT, state.youmonst)} in the bear trap.`,
                    state,
                );
                ++u.utrap;
            } else if (u.utraptype === TT_PIT) {
                if (trap && trap.ttyp === SPIKED_PIT) {
                    await message('You sit down on a spike.  Ouch!', state);
                    const damage = Half_physical_damage(state)
                        ? random.rn2(2) : 1;
                    const { losehp } = await import('./hack.js');
                    await losehp(
                        damage,
                        'sitting on an iron spike',
                        KILLED_BY,
                        state,
                        rawEnv,
                    );
                    await sit_exercise(A_STR, state, random);
                } else {
                    await message('You sit down in the pit.', state);
                }
                u.utrap += random.rn2(5);
            } else if (u.utraptype === TT_WEB) {
                await message(
                    'You sit in the spider web and get entangled further!',
                    state,
                );
                u.utrap += random.rn1(10, 5);
            } else if (u.utraptype === TT_LAVA) {
                await message(`You sit in the ${hliquid('lava', { ...rawEnv, state })}!`, state);
                if (u.uprops?.[SLIMED]?.intrinsic)
                    note_unported('timeout.c burn_away_slime');
                u.utrap += random.rnd(4);
                const { losehp } = await import('./hack.js');
                await losehp(random.d(2, 10), 'sitting in lava', KILLED_BY,
                    state, rawEnv);
            } else if (u.utraptype === TT_INFLOOR
                       || u.utraptype === TT_BURIEDBALL) {
                await message("You can't maneuver to sit!", state);
                ++u.utrap;
            }
        } else {
            await message(`${Flying(state) ? 'You land' : 'You sit down'}.`, state);
            note_unported('trap.c dotrap');
        }
    } else if ((Underwater(state) || Is_waterlevel(state))
                && !eggs_in_water(species)) {
        if (Is_waterlevel(state))
            await message('There are no cushions floating nearby.', state);
        else
            await message('You sit down on the muddy bottom.', state);
    } else if (is_pool(u.ux, u.uy, state) && !eggs_in_water(species)) {
        await sit_in_water(state, random, rawEnv);
    } else if (IS_SINK(typ)) {
        await message(sit_message(CMAP_EXPLANATIONS[S_sink]), state);
        await message(
            `Your ${humanoid(species) ? 'rump' : 'underside'} gets wet.`, state,
        );
    } else if (IS_ALTAR(typ)) {
        await message(sit_message(CMAP_EXPLANATIONS[S_altar]), state);
        note_unported('pray.c altar_wrath');
    } else if (IS_GRAVE(typ)) {
        await message(sit_message(CMAP_EXPLANATIONS[S_grave]), state);
    } else if (typ === STAIRS) {
        await message(sit_message('stairs'), state);
    } else if (typ === LADDER) {
        await message(sit_message('ladder'), state);
    } else if (is_lava(u.ux, u.uy, state)) {
        await message(sit_message(hliquid('lava', { ...rawEnv, state })), state);
        // Unlike the trapped-lava arm above, sit.c calls this unconditionally;
        // the helper itself decides whether any slime needs to burn away.
        note_unported('timeout.c burn_away_slime');
        if (likes_lava(species)) {
            await message(`${The(hliquid('lava', { ...rawEnv, state }), state)} feels warm.`, state);
            return ECMD_TIME;
        }
        await message(`${The(hliquid('lava', { ...rawEnv, state }), state)} burns you!`, state);
        const { losehp } = await import('./hack.js');
        await losehp(random.d(Fire_resistance(state) ? 2 : 10, 10),
            'sitting on lava', KILLED_BY, state, rawEnv);
    } else if (is_ice(u.ux, u.uy, state)) {
        await message(sit_message(CMAP_EXPLANATIONS[S_ice]), state);
        if (!Cold_resistance(state))
            await message(`${The(CMAP_EXPLANATIONS[S_ice], state)} feels cold.`, state);
    } else if (typ === DRAWBRIDGE_DOWN) {
        await message(sit_message('drawbridge'), state);
    } else if (IS_THRONE(typ)) {
        await message(sit_message(CMAP_EXPLANATIONS[S_throne]), state);
        note_unported('sit.c throne_sit_effect');
    } else if (lays_eggs(species)) {
        return await lay_an_egg(state, rawEnv);
    } else {
        const { surface } = await import('./dungeon.js');
        await message(
            `Having fun sitting on the ${surface(u.ux, u.uy, state)}?`, state,
        );
    }
    return ECMD_TIME;
}
