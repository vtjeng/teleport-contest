// C refs: sit.c take_gold() (14-35), throne_sit_effect() (39-234),
// lay_an_egg() (358-399), and dosit() (400-568). `#sit` owns the complete
// guard and terrain chain; source-discarded void effects that remain
// unported are named and skipped.

import {
    A_CON,
    A_MAX,
    A_STR,
    A_WIS,
    BLINDED,
    COLD_RES,
    CONFUSION,
    DEAF,
    DRAWBRIDGE_DOWN,
    ECMD_OK,
    ECMD_TIME,
    EYE,
    FOOT,
    FIRE_RES,
    FROMOUTSIDE,
    FOUNTAIN,
    HALF_PHDAM,
    HALLUC,
    HALLUC_RES,
    HEAD,
    INTRINSIC,
    IS_ALTAR,
    IS_GRAVE,
    IS_SINK,
    IS_THRONE,
    KILLED_BY,
    KILLED_BY_AN,
    LADDER,
    LEVITATION,
    ROOM,
    SEE_INVIS,
    SHOCK_RES,
    SLIMED,
    SPIKED_PIT,
    STAIRS,
    TT_BEARTRAP,
    TT_BURIEDBALL,
    TT_INFLOOR,
    TT_LAVA,
    TT_PIT,
    TT_WEB,
    TIMEOUT,
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
    haseyes,
    is_prince,
    slithy,
    sticks,
} from './mondata.js';
import {
    PM_ELECTRIC_EEL,
    PM_GIANT_EEL,
    PM_GREMLIN,
    PM_FLOATING_EYE,
    PM_CYCLOPS,
    PM_TRAPPER,
    S_DRAGON,
} from './monsters.js';
import { isBox, mksobj, newObject, objectType, remove_object, set_corpsenm, weight } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { observe_object } from './o_init.js';
import { makeplural } from './fruit.js';
import { The, the, vtense, xnameFresh } from './objnam.js';
import {
    CLOTH,
    COIN_CLASS as OBJECT_COIN_CLASS,
    CORPSE,
    CREAM_PIE,
    EGG,
    TOWEL as OBJECT_TOWEL,
    WATER_WALKING_BOOTS,
    SPE_REMOVE_CURSE,
    SPBOOK_CLASS,
} from './objects.js';
import { body_part } from './polyself.js';
import { d, rn1, rn2, rne, rnd } from './rng.js';
import { S_altar, S_grave, S_ice, S_sink, S_throne } from './symbols.js';
import { is_ice } from './terrain.js';
import { Flying, is_lava, is_pool, t_at, uescaped_shaft, uteetering_at_seen_pit } from './trap.js';
import { Monnam, hliquid, mon_nam } from './do_name.js';
import { canSpotMonster, heroIsBlind } from './startup_a11y.js';
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

// C ref: sit.c take_gold() (14-35). Save the next inventory link before
// delobj() frees a coin stack; invent.c delobj_core() still consumes the
// zap.c obj_resists() draw before removing ordinary coins.
async function take_gold(state, rawEnv = {}) {
    const random = sit_water_random(rawEnv);
    const message = rawEnv.message
        ?? (await import('./tty_message.js')).ttyPline;
    const env = { ...rawEnv, state, random, message };
    let lostMoney = false;

    for (let otmp = state.invent; otmp;) {
        const nobj = otmp.nobj;
        if (otmp.oclass === OBJECT_COIN_CLASS) {
            lostMoney = true;
            const { remove_worn_item } = await import('./steal.js');
            await remove_worn_item(otmp, false, state, env);
            const { delobj } = await import('./invent.js');
            delobj(otmp, env);
        }
        otmp = nobj;
    }

    if (!lostMoney) {
        await message('You feel a strange sensation.', state);
    } else {
        await message('You notice you have no gold!', state);
        state.disp ??= {};
        state.disp.botl = true;
    }
}

async function sit_exercise(index, state, random) {
    const { exercise } = await import('./attrib.js');
    const options = {};
    if ((index === A_STR || index === A_CON) && (state.moves ?? 0) > 0) {
        const { encumber_msg } = await import('./pickup.js');
        options.encumberMessage = encumber_msg;
    }
    await exercise(index, false, state, random, options);
}

// C ref: sit.c special_throne_effect() case 10. Vlad's Tower's special
// throne applies seffect_remove_curse() to a blessed fake spellbook while
// HConfusion is temporarily forced on.
async function special_throne_effect(effect, state, rawEnv = {}) {
    if (effect !== 10) {
        note_unported('sit.c special_throne_effect');
        return;
    }

    const u = state.u;
    const confusion = u.uprops?.[CONFUSION];
    const savedConfusion = confusion?.intrinsic ?? 0;
    const confusionProperty = (u.uprops ??= {})[CONFUSION]
        ??= { intrinsic: 0, extrinsic: 0 };
    const fakeSpellbook = newObject({
        otyp: SPE_REMOVE_CURSE,
        oclass: SPBOOK_CLASS,
        blessed: true,
    });
    confusionProperty.intrinsic = 1;
    try {
        const { seffects } = await import('./read.js');
        await seffects(fakeSpellbook, state, {
            ...rawEnv,
            state,
            random: sit_water_random(rawEnv),
        });
    } finally {
        confusionProperty.intrinsic = savedConfusion;
    }
}

// C ref: sit.c throne_sit_effect() (39-234). C's calls to still-unported
// void effects are named at their source positions; the courtmon() result is
// retained because C evaluates it before discarding makemon()'s result.
async function throne_sit_effect(state, rawEnv = {}) {
    const u = state.u;
    const random = sit_water_random(rawEnv);
    const message = rawEnv.message
        ?? (await import('./tty_message.js')).ttyPline;
    const tx = u.ux;
    const ty = u.uy;
    const specialThrone = u.uz?.dnum === state.tower_dnum;

    if (random.rnd(6) > 4) {
        let effect = random.rnd(13);

        if (state.wizard && !state.iflags?.debug_fuzzer) {
            const { getlin } = await import('./windows.js');
            const answer = await getlin(
                'Throne sit effect (1..13) [0=random]', state,
            );
            if (answer?.[0] === '\x1b') {
                await message('Never mind.', state);
                return; // sit.c: the caller still consumes a turn.
            }
            const requested = Number.parseInt(answer ?? '', 10) || 0;
            if (requested >= 1 && requested <= 13) effect = requested;
        }

        if (specialThrone) {
            await special_throne_effect(effect, state, {
                ...rawEnv,
                random,
                message,
            });
            return;
        }

        switch (effect) {
        case 1: {
            const { adjattrib } = await import('./attrib.js');
            await adjattrib(
                random.rn2(A_MAX), -random.rn1(4, 3), 0, state,
                { ...rawEnv, random, message },
            );
            const { losehp } = await import('./hack.js');
            await losehp(random.rnd(10), 'cursed throne', KILLED_BY_AN,
                state, rawEnv);
            break;
        }
        case 2: {
            const { adjattrib } = await import('./attrib.js');
            await adjattrib(
                random.rn2(A_MAX), 1, 0, state,
                { ...rawEnv, random, message },
            );
            break;
        }
        case 3: {
            const shock = u.uprops?.[SHOCK_RES];
            const shockResistant = Boolean(shock?.intrinsic || shock?.extrinsic);
            await message(
                `A${shockResistant ? 'n' : ' massive'} electric shock shoots through your body!`,
                state,
            );
            const { losehp } = await import('./hack.js');
            await losehp(
                random.rnd(shockResistant ? 6 : 30),
                'electric chair', KILLED_BY_AN, state, rawEnv,
            );
            await sit_exercise(A_CON, state, random);
            break;
        }
        case 4: {
            await message('You feel much, much better!', state);
            if (Upolyd(u)) {
                if (u.mh >= u.mhmax - 5) u.mhmax += 4;
                u.mh = u.mhmax;
            }
            if (u.uhp >= u.uhpmax - 5) {
                u.uhpmax += 4;
                if (u.uhpmax > u.uhppeak) u.uhppeak = u.uhpmax;
            }
            u.uhp = u.uhpmax;
            u.ucreamed = 0;
            const { make_blinded } = await import('./potion.js');
            await make_blinded(0, true, state, { ...rawEnv, message });
            note_unported('potion.c make_sick');
            const { heal_legs } = await import('./do.js');
            await heal_legs(state, { message });
            state.disp ??= {};
            state.disp.botl = true;
            break;
        }
        case 5:
            await take_gold(state, { ...rawEnv, random, message });
            break;
        case 6: {
            const luck = (u.uluck ?? 0) + (u.moreluck ?? 0);
            if ((u.uluck ?? 0) + random.rn2(5) < 0) {
                await message('You feel your luck is changing.', state);
                const { change_luck } = await import('./moveloop_preamble.js');
                change_luck(1, state);
            } else {
                const { makewish } = await import('./zap.js');
                await makewish(state);
            }
            break;
        }
        case 7: {
            let count = random.rnd(10);
            await message('A voice echoes:', state);
            note_unported('sit.c SetVoice');
            const { verbalize } = await import('./pline.js');
            await verbalize(
                `Thine audience hath been summoned, ${state.flags?.female ? 'Dame' : 'Sire'}!`,
                state,
                { message },
            );
            const { courtmon } = await import('./mkroom.js');
            while (count--) {
                courtmon(state, random);
                note_unported('makemon.c makemon');
            }
            break;
        }
        case 8:
            await message('A voice echoes:', state);
            note_unported('sit.c SetVoice');
            {
                const { verbalize } = await import('./pline.js');
                await verbalize(
                    `By thine Imperious order, ${state.flags?.female ? 'Dame' : 'Sire'}...`,
                    state,
                    { message },
                );
            }
            {
                const { do_genocide } = await import('./read.js');
                await do_genocide(5, state);
            }
            break;
        case 9: {
            await message('A voice echoes:', state);
            note_unported('sit.c SetVoice');
            const { verbalize } = await import('./pline.js');
            await verbalize(
                'A curse upon thee for sitting upon this most holy throne!',
                state,
                { message },
            );
            const luck = (u.uluck ?? 0) + (u.moreluck ?? 0);
            if (luck > 0) {
                const blind = u.uprops?.[BLINDED]?.intrinsic ?? 0;
                const { make_blinded } = await import('./potion.js');
                await make_blinded(
                    (blind & TIMEOUT) + random.rn1(100, 250),
                    true,
                    state,
                    { ...rawEnv, message },
                );
                const { change_luck } = await import('./moveloop_preamble.js');
                change_luck(luck > 1 ? -random.rnd(2) : -1, state);
            } else {
                note_unported('sit.c rndcurse');
            }
            break;
        }
        case 10: {
            const luck = (u.uluck ?? 0) + (u.moreluck ?? 0);
            const seeInvisible = u.uprops?.[SEE_INVIS]?.intrinsic ?? 0;
            if (luck < 0 || (seeInvisible & INTRINSIC)) {
                if (state.level?.flags?.nommap) {
                    await message('A terrible drone fills your head!', state);
                    const confusion = u.uprops?.[CONFUSION]?.intrinsic ?? 0;
                    const { make_confused } = await import('./potion.js');
                    await make_confused(
                        (confusion & TIMEOUT) + random.rnd(30),
                        false,
                        state,
                        { ...rawEnv, message },
                    );
                } else {
                    await message('An image forms in your mind.', state);
                    const { do_mapping } = await import('./detect.js');
                    await do_mapping(state, { ...rawEnv, random });
                }
            } else {
                if (!heroIsBlind(state)) {
                    await message('Your vision becomes clear.', state);
                } else {
                    const species = state.youmonst?.data;
                    const count = !haseyes(species) ? 0
                        : (species.pmidx === PM_CYCLOPS
                            || species.pmidx === PM_FLOATING_EYE) ? 1 : 2;
                    let eye = body_part(EYE, state.youmonst);
                    if (count === 0) {
                        await message(
                            `You have a very strange feeling in your ${body_part(HEAD, state.youmonst)}.`,
                            state,
                        );
                    } else {
                        if (count > 1) eye = makeplural(eye);
                        await message(`Your ${eye} ${vtense(eye, 'tingle')}...`, state);
                    }
                }
                const seeInvisibleProp = (u.uprops[SEE_INVIS] ??= {
                    intrinsic: 0,
                    extrinsic: 0,
                });
                seeInvisibleProp.intrinsic |= FROMOUTSIDE;
                const { newsym } = await import('./display.js');
                newsym(u.ux, u.uy);
            }
            break;
        }
        case 11: {
            const luck = (u.uluck ?? 0) + (u.moreluck ?? 0);
            if (luck < 0) {
                await message('You feel threatened.', state);
                note_unported('wizard.c aggravate');
            } else {
                await message('You feel a wrenching sensation.', state);
                const { tele } = await import('./teleport.js');
                await tele(state);
            }
            break;
        }
        case 12: {
            await message('You are granted an insight!', state);
            if (state.invent) {
                const { identify_pack } = await import('./invent.js');
                await identify_pack(random.rn2(5), false, state);
            }
            break;
        }
        case 13: {
            await message('Your mind turns into a pretzel!', state);
            const confusion = u.uprops?.[CONFUSION]?.intrinsic ?? 0;
            const { make_confused } = await import('./potion.js');
            await make_confused(
                (confusion & TIMEOUT) + random.rn1(7, 16),
                false,
                state,
                { ...rawEnv, message },
            );
            break;
        }
        default:
            note_unported('pline.c impossible');
            break;
        }
    } else if (is_prince(state.youmonst?.data)
               || state.u?.uevent?.uhand_of_elbereth) {
        await message('You feel very comfortable here.', state);
    } else {
        await message('You feel somehow out of place...', state);
    }

    if (!specialThrone && !random.rn2(3)) {
        let removeThrone = !state.wizard;
        if (state.wizard) {
            const { tty_yn_function } = await import('./getline.js');
            removeThrone = await tty_yn_function(
                'Analyze throne?', 'yn', 'n', state,
            ) === 'y';
        }
        if (removeThrone) {
            const location = state.level?.at(tx, ty);
            if (location) {
                location.typ = ROOM;
                location.flags = 0;
            }
            const { map_background, newsym } = await import('./display.js');
            map_background(tx, ty, false, state);
            newsym(tx, ty); // newsym_force() differs only in tty dirty bookkeeping.
            const { cansee } = await import('./vision.js');
            await message(
                `The throne ${cansee(tx, ty, state) ? 'vanishes' : 'has vanished'} in a puff of logic.`,
                state,
            );
        }
    }
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
        const { altar_wrath } = await import('./pray.js');
        await altar_wrath(u.ux, u.uy, state);
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
        await throne_sit_effect(state, rawEnv);
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
