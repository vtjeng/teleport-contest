// pray.js -- the hero's deity, the troubles a prayer would fix, the #pray
// command, and the prayer a god answers by taking offence.
//
// C ref: src/pray.c critically_low_hp() (116-156), stuck_in_wall() (161-181),
//        in_trouble() (198-284), worst_cursed_item() (288-346),
//        angrygods() (704-784), gods_upset() (1436-1443),
//        consume_offering() (1446-1474), bestow_artifact() (1780-1834),
//        sacrifice_value() (1838-1850), dosacrifice() (1854-1896),
//        eval_offering() (1898-1957), offer_corpse() (1959-2122),
//        blocked_boulder() (2677-2719), can_pray() (2124-2173),
//        dopray() (2199-2273), prayer_done() (2276-2343),
//        maybe_turn_mon_iter() (2347-2405), doturn() (2407-2489),
//        u_gname() (2524), and align_gname() (2530).
//
// prayer_done() covers its head and the gp.p_type == 0 arm; angrygods() covers
// cases 0 and 1 of its switch and the trailing rnz(300). water_prayer(),
// pray_revive(), and everything the remaining angrygods() cases reach remain
// source gaps. pleased() is ported below; its calls to source helpers that
// still lack a running-game owner are recorded with note_unported().

import {
    A_CHAOTIC,
    A_LAWFUL,
    A_MAX,
    A_NEUTRAL,
    A_NONE,
    A_STR,
    A_WIS,
    ALTAR,
    AM_SANCTUM,
    AM_SHRINE,
    AM_MASK,
    Amask2align,
    AGGRAVATE_MONSTER,
    BLND_RES,
    BLINDED,
    BOLT_LIM,
    CONFUSION,
    DEAF,
    ECMD_OK,
    ECMD_TIME,
    EXT_ENCUMBER,
    FAST,
    FOOT,
    FIXED_ABIL,
    FROMOUTSIDE,
    HALLUC,
    HALLUC_RES,
    HUNGRY,
    HVY_ENCUMBER,
    INTRINSIC,
    IS_ALTAR,
    LARGEST_INT,
    MAXULEV,
    NOTELL,
    IS_OBSTRUCTED,
    LL_CONDUCT,
    LL_DIVINEGIFT,
    LL_ARTIFACT,
    LUCKMAX,
    nothing_happens,
    ONAME_GIFT,
    ONAME_KNOW_ARTI,
    PARANOID_CONFIRM,
    PARANOID_PRAY,
    PASSES_WALLS,
    PLNMSG_OBJ_GLOWS,
    PROTECTION,
    SCORR,
    SDOOR,
    SICK,
    SLIMED,
    STONED,
    STRANGLED,
    STOMACH,
    STUNNED,
    TELEDS_NO_FLAGS,
    TELL,
    TIMEOUT,
    TELEPAT,
    STEALTH,
    something,
    TT_BURIEDBALL,
    TT_LAVA,
    UNCHANGING,
    Upolyd,
    WEAK,
    WOUNDED_LEGS,
    W_SADDLE,
    EYE,
    isok,
    ismnum,
    has_mcorpsenm,
    MCORPSENM,
    M_AP_FURNITURE,
    M_AP_TYPMASK,
    CXN_ARTICLE,
} from './const.js';
import {
    artifact_origin,
    artiname,
    confers_luck,
    discover_artifact,
    hcolor,
    mk_artifact,
    nartifact_exist,
} from './artifacts.js';
import {
    ALIGNLIM,
    adjalign,
    adjattrib,
    exercise,
    setuhpmax,
} from './attrib.js';
import { paranoid_query, y_n } from './cmd.js';
import { eaten_stat, floorfood } from './eat.js';
import { xlev_to_rank } from './display.js';
import { dropy, heal_legs } from './do.js';
import { stuck_ring, unchanger } from './do_wear.js';
import { In_hell } from './dungeon.js';
import { freehand } from './engrave.js';
import { game } from './gstate.js';
import { near_capacity, nomul, You_can_move_again } from './hack.js';
import { livelog_printf } from './pline.js';
import { dist2, upstart, s_suffix } from './hacklib.js';
import { change_luck } from './moveloop_preamble.js';
import {
    attacktype_fordmg,
    can_chant,
    is_demon,
    is_human,
    is_undead,
    is_unicorn,
    is_vampshifter,
    nohands,
    throws_rocks,
    your_race,
} from './mondata.js';
import { makeplural } from './fruit.js';
import {
    AD_BLND,
    AT_ENGL,
    PM_CLERIC,
    PM_CYCLOPS,
    PM_FLOATING_EYE,
    PM_KNIGHT,
    PM_ACID_BLOB,
    PM_WRAITH,
    S_GHOST,
    S_LICH,
    S_MUMMY,
    S_VAMPIRE,
    S_WRAITH,
    S_ZOMBIE,
} from './monsters.js';
import { Glib } from './wield.js';
import {
    carried,
    is_weptool,
    peek_at_iced_corpse_age,
    remove_object,
    set_bknown,
    sobj_at,
    uncurse,
} from './obj.js';
import { obj_stop_timers } from './timeout.js';
import { get_mtraits } from './corpstat.js';
import {
    BOULDER,
    AMULET_OF_YENDOR,
    CORPSE,
    FAKE_AMULET_OF_YENDOR,
    FUMBLE_BOOTS,
    GAUNTLETS_OF_FUMBLING,
    HELM_OF_OPPOSITE_ALIGNMENT,
    LEVITATION_BOOTS,
    LOADSTONE,
    AMULET_OF_STRANGULATION,
    RIN_LEVITATION,
    RIN_SUSTAIN_ABILITY,
    SADDLE,
    WEAPON_CLASS,
    SPE_TURN_UNDEAD,
} from './objects.js';
import { body_part, mbodypart, rehumanize } from './polyself.js';
import {
    make_blinded,
    make_confused,
    make_deaf,
    make_glib,
    make_hallucinated,
    set_itimeout,
} from './potion.js';
import { region_danger } from './region.js';
import { losexp, pluslvl } from './exper.js';
import { d, rn1, rn2, rnl, rnd, rne, rnz } from './rng.js';
import { Punished } from './steed.js';
import {
    Flying,
    Levitation,
    is_pool_or_lava,
    reset_utrap,
} from './trap.js';
import { safe_teleds } from './teleport.js';
import { ttyPline } from './tty_message.js';
import { canseemon, couldsee } from './vision.js';
import { heroIsBlind, messageAt } from './startup_a11y.js';
import { Monnam } from './do_name.js';
import { killed, mon_offmap } from './mon.js';
import { monflee } from './monmove.js';
import { set_malign } from './makemon.js';
import { cmap_to_type } from './mkroom.js';
import { resist } from './zap.js';
import { known_spell, spelleffects } from './spell.js';
import { welded } from './wield.js';
import { bimanual, which_armor } from './worn.js';
import { encumber_msg, rider_corpse_revival } from './pickup.js';
import { init_uhunger } from './u_init.js';
import { see_monsters } from './display.js';
import { feel_cockatrice, update_inventory, useup, useupf } from './invent.js';
import { discover_object, observe_object } from './o_init.js';
import { unrestrict_weapon_skill, weapon_type } from './startup_skills.js';
import {
    an, ansimpleoname, bare_artifactname, corpse_xname,
    gloves_simple_name, otense, vtense, yname, Yobjnam2,
} from './objnam.js';
import { verbalize } from './pline.js';
import { note_unported } from './unported.js';

// Raised where pray.c reaches a branch this port has not translated.
// js/cmd.js failClosedCommandRefusals() lists it, so the segment keeps every
// frame the command already matched instead of failing hard.
export class UnsupportedPrayerError extends Error {
    constructor(what) {
        super(`prayer reached an unported branch: ${what}`);
        this.name = 'UnsupportedPrayerError';
    }
}

// C ref: pray.c TROUBLE_* (76-101). Positive values are serious trouble,
// negative ones are comparative annoyances, and in_trouble() answers the worst
// one it finds. can_pray() reads only the sign, but the values are what
// fix_worst_trouble() switches on, so they are kept as C spells them.
export const TROUBLE_STONED = 14;
export const TROUBLE_SLIMED = 13;
export const TROUBLE_STRANGLED = 12;
export const TROUBLE_LAVA = 11;
export const TROUBLE_SICK = 10;
export const TROUBLE_STARVING = 9;
export const TROUBLE_REGION = 8; /* stinking cloud */
export const TROUBLE_HIT = 7;
export const TROUBLE_LYCANTHROPE = 6;
export const TROUBLE_COLLAPSING = 5;
export const TROUBLE_STUCK_IN_WALL = 4;
export const TROUBLE_CURSED_LEVITATION = 3;
export const TROUBLE_UNUSEABLE_HANDS = 2;
export const TROUBLE_CURSED_BLINDFOLD = 1;

export const TROUBLE_PUNISHED = -1;
export const TROUBLE_FUMBLING = -2;
export const TROUBLE_CURSED_ITEMS = -3;
export const TROUBLE_SADDLE = -4;
export const TROUBLE_BLIND = -5;
export const TROUBLE_POISONED = -6;
export const TROUBLE_WOUNDED_LEGS = -7;
export const TROUBLE_HUNGRY = -8;
export const TROUBLE_STUNNED = -9;
export const TROUBLE_CONFUSED = -10;
export const TROUBLE_HALLUCINATION = -11;

// C ref: pray.c:67 `#define STRIDENT 4`, the alignment record from which a god
// weighs the hero's bad luck at a third rather than in full.
const STRIDENT = 4;

// C ref: pray.c:39 `#define Cursed_obj(obj, typ)`.
function Cursed_obj(obj, typ) {
    return Boolean(obj) && obj.otyp === typ && Boolean(obj.cursed);
}

// C ref: pray.c:105 `#define on_altar()`. C's macro omits the u.uswallow test
// that its sibling at pray.c:1860 spells out, so a swallowed hero standing
// over an altar square still counts as being on it.
function on_altar(state) {
    return IS_ALTAR(state.level.at(state.u.ux, state.u.uy).typ);
}

// C ref: pray.c:107 `#define a_align(x, y)`.
function a_align(x, y, state) {
    return Amask2align(state.level.at(x, y).altarmask & AM_MASK);
}

// C ref: pray.c altarmask_at() (2490-2504).  The altar alignment helper is
// owned by pray.c even when pager.c asks for a remembered furniture mimic.
export function altarmask_at(x, y, state = game) {
    const monster = state.level?.monsters?.[x]?.[y] ?? null;
    if (monster
        && (monster.m_ap_type & M_AP_TYPMASK) === M_AP_FURNITURE
        && cmap_to_type(monster.mappearance) === ALTAR) {
        return has_mcorpsenm(monster) ? MCORPSENM(monster) : 0;
    }
    const location = state.level?.at(x, y);
    return IS_ALTAR(location?.typ)
        ? location.altarmask ?? location.flags ?? 0
        : 0;
}

// C ref: pray.c dosacrifice() (1854-1896). The floorfood() selector is shared
// with eat.c and returns the selected object before the offering helper arms.
// Those helper bodies remain explicit source gaps because they discard their
// results here; preserving the dispatch and ECMD result keeps this function's
// caller contract source-shaped without inventing their messages or effects.
export async function dosacrifice(state = game) {
    const u = state.u;
    const altaralign = a_align(u.ux, u.uy, state);

    if (!on_altar(state) || u.uswallow) {
        await ttyPline(
            `You are not ${Levitation(state) || Flying(state) ? 'over' : 'on'} an altar.`,
            state,
        );
        return ECMD_OK;
    }
    if (intrinsic(state, CONFUSION) || intrinsic(state, STUNNED)) {
        await ttyPline('You are too impaired to perform the rite.', state);
        return ECMD_OK;
    }
    const altar = state.level.at(u.ux, u.uy);
    const highaltar = Boolean(altar.altarmask & AM_SANCTUM);
    const otmp = await floorfood('sacrifice', 1, state);
    if (!otmp) return ECMD_OK;

    if (otmp.otyp === AMULET_OF_YENDOR) {
        if (!highaltar) {
            note_unported('pray.c offer_too_soon');
            return ECMD_TIME;
        }
        note_unported('pray.c offer_real_amulet');
        // C marks offer_real_amulet() NOTREACHED. Its return is void, so the
        // source control flow continues to the final nothing_happens arm if
        // this still-unported helper unexpectedly returns.
    }
    if (otmp.otyp === FAKE_AMULET_OF_YENDOR) {
        note_unported('pray.c offer_fake_amulet');
        return ECMD_TIME;
    }
    if (otmp.otyp === CORPSE) {
        await offer_corpse(otmp, highaltar, altaralign, state);
        return ECMD_TIME;
    }

    // The selector currently accepts only corpses and amulets, but C retains
    // this final arm for a directly supplied object that reaches dosacrifice.
    await ttyPline(nothing_happens, state);
    return ECMD_TIME;
}

// C ref: pray.c:1446-1474 consume_offering(). The offering is consumed before
// its Wisdom exercise; the order matters because exercise() may draw RNG.
async function consume_offering(otmp, state) {
    if (Hallucination(state)) {
        switch (rn2(3)) {
        case 0:
            await ttyPline(
                'Your sacrifice sprouts wings and a propeller and roars away!',
                state,
            );
            break;
        case 1:
            await ttyPline(
                'Your sacrifice puffs up, swelling bigger and bigger, and pops!',
                state,
            );
            break;
        case 2:
            await ttyPline(
                'Your sacrifice collapses into a cloud of dancing particles '
                    + 'and fades away!',
                state,
            );
            break;
        }
    } else if (Blind(state) && state.u.ualign.type === A_LAWFUL) {
        await ttyPline('Your sacrifice disappears!', state);
    } else {
        const effect = state.u.ualign.type === A_LAWFUL
            ? 'flash of light'
            : state.u.ualign.type === A_NEUTRAL
                ? 'plume of smoke'
                : 'burst of flame';
        await ttyPline(`Your sacrifice is consumed in a ${effect}!`, state);
    }

    // pray.c consume_offering() reaches invent.c useup()/useupf(), then
    // shk.c obfree() for an inventory corpse or mkobj.c delobj() for a floor
    // corpse. The former stops timeout.c object timers; the latter removes
    // the object from the floor list before freeing it.
    const env = {
        state,
        hooks: {
            extractExternalObject: remove_object,
            stopObjectTimers: (obj, hookEnv) => {
                obj_stop_timers(obj, hookEnv.state, hookEnv);
            },
        },
    };
    if (carried(otmp)) useup(otmp, env);
    else await useupf(otmp, 1, env);
    await exercise(A_WIS, true, state);
}

// C ref: pray.c:1780-1834 bestow_artifact(). The selected alignment-specific
// mk_artifact() path creates a new gift; the normal-object/A_NONE hook in
// artifacts.js is a separate caller with different selection rules.
async function bestow_artifact(maxGiftValue, state) {
    const { u } = state;
    const nartifacts = nartifact_exist(state);
    let doBestow = u.ulevel > 2 && u.uluck >= 0;
    if (doBestow) {
        if (state.wizard)
            doBestow = (await y_n('Gift an artifact?', state)) === 'y';
        else
            doBestow = !rn2(6 + (2 * u.ugifts * nartifacts));
    }

    if (!doBestow) return false;

    const otmp = mk_artifact(
        null,
        a_align(u.ux, u.uy, state),
        maxGiftValue,
        true,
        { state },
    );
    if (!otmp) return false;

    artifact_origin(otmp, ONAME_GIFT | ONAME_KNOW_ARTI, state);
    if (otmp.spe < 0) otmp.spe = 0;
    if (otmp.cursed) await uncurse(otmp, state);
    otmp.oerodeproof = true;

    const blind = Blind(state);
    const hallucinating = Hallucination(state);
    let name = hallucinating
        ? 'a doodad'
        : blind
            ? 'an object'
            : ansimpleoname(otmp, state);
    if (!blind) name += ` named ${bare_artifactname(otmp, state)}`;
    await at_your_feet(upstart(name), state);
    await dropy(otmp, state);
    await godvoice(u.ualign.type, 'Use my gift wisely!', state);
    u.ugifts++;
    u.ublesscnt = rnz(300 + (50 * nartifacts));
    await exercise(A_WIS, true, state);
    livelog_printf(
        LL_DIVINEGIFT | LL_ARTIFACT,
        `was bestowed with ${artiname(otmp.oartifact, state)} by `
            + align_gname(u.ualign.type, state),
        state,
    );
    unrestrict_weapon_skill(weapon_type(otmp, state), state);

    if (!hallucinating && !blind) {
        observe_object(otmp, state);
        discover_object(otmp.otyp, true, true, true, state);
        discover_artifact(otmp.oartifact, state);
    }
    return true;
}

// C ref: pray.c:1838-1850 sacrifice_value(). This reads the corpse's age and
// partial nutrition without changing game state or consuming RNG.
export function sacrifice_value(otmp, state = game) {
    let value = 0;
    if (otmp.corpsenm === PM_ACID_BLOB
        || state.moves <= peek_at_iced_corpse_age(otmp, state) + 50) {
        value = Math.trunc(state.mons[otmp.corpsenm].difficulty) + 1;
        if (otmp.oeaten)
            value = eaten_stat(value, otmp, { state });
    }
    return value;
}

// C ref: pray.c:1898-1957 eval_offering(). Its return is the corpse's value
// after undead and unicorn-specific alignment effects.
async function eval_offering(otmp, altaralign, state) {
    let value = sacrifice_value(otmp, state);
    if (!value) return 0;

    const ptr = state.mons[otmp.corpsenm];
    if (is_undead(ptr)) {
        if (state.u.ualign.type !== A_CHAOTIC
            || (ptr === state.mons[PM_WRAITH]
                && state.u.uconduct.unvegetarian)) {
            value += 1;
        }
    } else if (is_unicorn(ptr)) {
        const unicornAlign = Math.sign(ptr.maligntyp);
        if (unicornAlign === altaralign) {
            const insult = unicornAlign === A_CHAOTIC
                ? 'chaos'
                : unicornAlign ? 'law' : 'balance';
            await ttyPline(`Such an action is an insult to ${insult}!`, state);
            await adjattrib(A_WIS, -1, 0, state, { message: ttyPline });
            return -1;
        }
        if (state.u.ualign.type === altaralign) {
            if (state.u.ualign.record < ALIGNLIM(state)) {
                await ttyPline(
                    `You feel appropriately ${align_str(state.u.ualign.type)}.`,
                    state,
                );
            } else {
                await ttyPline(
                    'You feel you are thoroughly on the right path.', state,
                );
            }
            adjalign(5, state);
            value += 3;
        } else if (unicornAlign === state.u.ualign.type) {
            state.u.ualign.record = -1;
            value = 1;
        } else {
            value += 3;
        }
    }
    return value;
}

// C ref: pray.c:1959-2122 offer_corpse(). Unported helpers at these sites are
// void in C, so their results are discarded exactly where the source does.
async function offer_corpse(otmp, highaltar, altaralign, state) {
    const { u } = state;
    const maxValue = 24;
    const priorAtheism = Math.trunc(u.uconduct.gnostic ?? 0);
    u.uconduct.gnostic = priorAtheism + 1;
    if (!priorAtheism) {
        livelog_printf(
            LL_CONDUCT,
            `rejected atheism by offering ${corpse_xname(otmp, null, CXN_ARTICLE, state)}`
                + ` on an altar of ${align_gname(altaralign, state)}`,
            state,
        );
    }

    await feel_cockatrice(otmp, true, state);
    if (await rider_corpse_revival(otmp, false, state)) return;

    const ptr = state.mons[otmp.corpsenm];
    if (your_race(ptr, state)) {
        note_unported('pray.c sacrifice_your_race');
        return;
    }
    if (otmp.oextra?.omonst) {
        const mtmp = get_mtraits(otmp, false, state);
        if (mtmp?.mtame) {
            await ttyPline('So this is how you repay loyalty?', state);
            adjalign(-3, state);
            u.uprops[AGGRAVATE_MONSTER].intrinsic |= FROMOUTSIDE;
            note_unported('pray.c offer_negative_valued');
            return;
        }
    }

    let value = await eval_offering(otmp, altaralign, state);
    if (value === 0) {
        await ttyPline(nothing_happens, state);
        return;
    }
    if (value < 0) {
        note_unported('pray.c offer_negative_valued');
        return;
    }
    if (altaralign !== u.ualign.type && highaltar) {
        note_unported('pray.c desecrate_altar');
        return;
    }
    if (u.ualign.type !== altaralign) {
        note_unported('pray.c offer_different_alignment_altar');
        return;
    }

    await consume_offering(otmp, state);
    if (u.ugangr) {
        const savedAnger = u.ugangr;
        u.ugangr -= Math.trunc(
            value * (u.ualign.type === A_CHAOTIC ? 2 : 3) / maxValue,
        );
        if (u.ugangr < 0) u.ugangr = 0;
        if (u.ugangr !== savedAnger) {
            if (u.ugangr) {
                await ttyPline(
                    `${u_gname(state)} seems ${Hallucination(state)
                        ? 'groovy' : 'slightly mollified'}.`,
                    state,
                );
                if (u.uluck < 0) change_luck(1, state);
            } else {
                await ttyPline(
                    `${u_gname(state)} seems ${Hallucination(state)
                        ? 'cosmic (not a new fact)' : 'mollified'}.`,
                    state,
                );
                if (u.uluck < 0) u.uluck = 0;
            }
        } else if (Hallucination(state)) {
            await ttyPline('The gods seem tall.', state);
        } else {
            await ttyPline('You have a feeling of inadequacy.', state);
        }
    } else if (u.ualign.record < 0) {
        if (value > maxValue) value = maxValue;
        if (value > -u.ualign.record) value = -u.ualign.record;
        adjalign(value, state);
        await ttyPline('You feel partially absolved.', state);
    } else if (u.ublesscnt > 0) {
        const savedBlesscnt = u.ublesscnt;
        u.ublesscnt -= Math.trunc(
            value * (u.ualign.type === A_CHAOTIC ? 500 : 300) / maxValue,
        );
        if (u.ublesscnt < 0) u.ublesscnt = 0;
        if (u.ublesscnt !== savedBlesscnt) {
            if (u.ublesscnt) {
                if (Hallucination(state)) {
                    await ttyPline(
                        'You realize that the gods are not like you and I.',
                        state,
                    );
                } else {
                    await ttyPline('You have a hopeful feeling.', state);
                }
                if (u.uluck < 0) change_luck(1, state);
            } else {
                if (Hallucination(state)) {
                    await ttyPline(
                        'Overall, there is a smell of fried onions.', state,
                    );
                } else {
                    await ttyPline('You have a feeling of reconciliation.', state);
                }
                if (u.uluck < 0) u.uluck = 0;
            }
        }
    } else {
        if (await bestow_artifact(value, state)) return;

        const originalLuck = u.uluck;
        let luckIncrease = Math.trunc(value * LUCKMAX / (maxValue * 2));
        if (originalLuck > value) luckIncrease = 0;
        else if (originalLuck + luckIncrease > value)
            luckIncrease = value - originalLuck;

        change_luck(luckIncrease, state);
        if (u.uluck < 0) u.uluck = 0;
        if (u.uluck !== originalLuck) {
            if (Blind(state)) {
                await ttyPline(
                    `You think ${something} brushed your `
                        + `${makeplural(body_part(FOOT, state.youmonst))}.`,
                    state,
                );
            } else {
                await ttyPline(
                    `You ${Hallucination(state)
                        ? 'see crabgrass' : 'glimpse a four-leaf clover'} at your `
                        + `${makeplural(body_part(FOOT, state.youmonst))}`
                        + `${Hallucination(state)
                            ? '. A funny thing in a dungeon.' : '.'}`,
                    state,
                );
            }
        }
    }
}

// C ref: pray.c:788-803 at_your_feet(), used for a divine artifact gift.
async function at_your_feet(str, state) {
    const blind = Blind(state);
    if (blind) str = 'Something';
    if (state.u.uswallow) {
        const captor = state.u.ustuck;
        await ttyPline(
            `${str} ${vtense(str, 'drop')} into `
                + `${s_suffix(Monnam(captor, state))} `
                + `${mbodypart(captor, STOMACH)}.`,
            state,
        );
    } else {
        await ttyPline(
            `${str} ${vtense(str, blind ? 'land' : 'appear')} `
                + `${Levitation(state) ? 'beneath' : 'at'} your `
                + `${makeplural(body_part(FOOT, state.youmonst))}!`,
            state,
        );
    }
}

function Blind(state) {
    const blinded = state.u?.uprops?.[BLINDED];
    const resistance = state.u?.uprops?.[BLND_RES];
    return Boolean(blinded && (blinded.intrinsic || blinded.extrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic));
}

// The intrinsic half of a youprop.h macro. Every trouble test below that reads
// one names it here rather than reaching into u.uprops, so a stray `.extrinsic`
// cannot creep into a test C writes as intrinsic-only.
function intrinsic(state, propidx) {
    return Math.trunc(state.u.uprops?.[propidx]?.intrinsic ?? 0);
}

function extrinsic(state, propidx) {
    return Math.trunc(state.u.uprops?.[propidx]?.extrinsic ?? 0);
}

// C ref: youprop.h:372 Unchanging (HUnchanging || EUnchanging).
function Unchanging(state) {
    return Boolean(intrinsic(state, UNCHANGING) || extrinsic(state, UNCHANGING));
}

// C ref: pray.c critically_low_hp() (116-156). "critically low hit points if
// hp <= 5 or hp <= maxhp/N for some N".
export function critically_low_hp(only_if_injured, state = game) {
    let divisor;
    const curhp = Upolyd(state.u) ? state.u.mh : state.u.uhp;
    let maxhp = Upolyd(state.u) ? state.u.mhmax : state.u.uhpmax;

    if (only_if_injured && !(curhp < maxhp)) return false;
    /* if maxhp is extremely high, use lower threshold for the division test */
    const hplim = 15 * state.u.ulevel;
    if (maxhp > hplim) maxhp = hplim;
    /* 7 used to be the unconditional divisor */
    switch (xlev_to_rank(state.u.ulevel)) { /* maps 1..30 into 0..8 */
    case 0:
    case 1:
        divisor = 5;
        break; /* explvl 1 to 5 */
    case 2:
    case 3:
        divisor = 6;
        break; /* explvl 6 to 13 */
    case 4:
    case 5:
        divisor = 7;
        break; /* explvl 14 to 21 */
    case 6:
    case 7:
        divisor = 8;
        break; /* explvl 22 to 29 */
    default:
        divisor = 9;
        break; /* explvl 30+ */
    }
    /* 5 is a magic number in TROUBLE_HIT handling below */
    return curhp <= 5 || curhp * divisor <= maxhp;
}

// C ref: pray.c stuck_in_wall() (161-181). "return True if surrounded by
// impassible rock, regardless of the state of your own location (for example,
// inside a doorless closet)".
export function stuck_in_wall(state = game) {
    let count = 0;

    if (intrinsic(state, PASSES_WALLS) || extrinsic(state, PASSES_WALLS))
        return false;
    for (let i = -1; i <= 1; i++) {
        const x = state.u.ux + i;
        for (let j = -1; j <= 1; j++) {
            if (!i && !j) continue;
            const y = state.u.uy + j;
            if (!isok(x, y)
                || (IS_OBSTRUCTED(state.level.at(x, y).typ)
                    && (state.level.at(x, y).typ !== SDOOR
                        && state.level.at(x, y).typ !== SCORR))
                || (blocked_boulder(i, j, state)
                    && !throws_rocks(state.youmonst?.data)))
                ++count;
        }
    }
    return count === 8;
}

// C ref: pray.c in_trouble() (198-284).
//
// "Return 0 if nothing particular seems wrong, positive numbers for serious
// trouble, and negative numbers for comparative annoyances. This returns the
// worst problem."
export function in_trouble(state = game) {
    let otmp;

    /*
     * major troubles
     */
    if (intrinsic(state, STONED)) return TROUBLE_STONED;
    if (intrinsic(state, SLIMED)) return TROUBLE_SLIMED;
    if (intrinsic(state, STRANGLED)) return TROUBLE_STRANGLED;
    if (state.u.utrap && state.u.utraptype === TT_LAVA) return TROUBLE_LAVA;
    if (intrinsic(state, SICK)) return TROUBLE_SICK;
    if (state.u.uhs >= WEAK) return TROUBLE_STARVING;
    if (region_danger(state)) return TROUBLE_REGION;
    if ((!Upolyd(state.u) || Unchanging(state))
        && critically_low_hp(false, state))
        return TROUBLE_HIT;
    if (ismnum(state.u.ulycn)) return TROUBLE_LYCANTHROPE;
    if (near_capacity(state) >= EXT_ENCUMBER
        && state.u.amax.a[A_STR] - state.u.acurr.a[A_STR] > 3)
        return TROUBLE_COLLAPSING;
    if (stuck_in_wall(state)) return TROUBLE_STUCK_IN_WALL;
    if (Cursed_obj(state.uarmf, LEVITATION_BOOTS)
        || stuck_ring(state.uleft, RIN_LEVITATION, state)
        || stuck_ring(state.uright, RIN_LEVITATION, state))
        return TROUBLE_CURSED_LEVITATION;
    if (nohands(state.youmonst?.data) || !freehand(state)) {
        /* for bag/box access [cf use_container()]...
           make sure it's a case that we know how to handle;
           otherwise "fix all troubles" would get stuck in a loop */
        if (welded(state.uwep, state)) return TROUBLE_UNUSEABLE_HANDS;
        if (Upolyd(state.u) && nohands(state.youmonst?.data)
            && (!Unchanging(state)
                || ((otmp = unchanger(state)) !== null && otmp.cursed)))
            return TROUBLE_UNUSEABLE_HANDS;
    }
    // Blindfolded is EBlinded alone, so ublindf is necessarily worn here.
    if (extrinsic(state, BLINDED) && state.ublindf.cursed)
        return TROUBLE_CURSED_BLINDFOLD;

    /*
     * minor troubles
     */
    if (Punished(state)
        || (state.u.utrap && state.u.utraptype === TT_BURIEDBALL))
        return TROUBLE_PUNISHED;
    if (Cursed_obj(state.uarmg, GAUNTLETS_OF_FUMBLING)
        || Cursed_obj(state.uarmf, FUMBLE_BOOTS))
        return TROUBLE_FUMBLING;
    if (worst_cursed_item(state)) return TROUBLE_CURSED_ITEMS;
    if (state.u.usteed) { /* can't voluntarily dismount from a cursed saddle */
        otmp = which_armor(state.u.usteed, W_SADDLE, state);
        if (Cursed_obj(otmp, SADDLE)) return TROUBLE_SADDLE;
    }

    if ((intrinsic(state, BLINDED) & TIMEOUT) > 1
        && !(intrinsic(state, BLINDED) & ~TIMEOUT)
        && (!state.u.uswallow
            || !attacktype_fordmg(state.u.ustuck.data, AT_ENGL, AD_BLND)))
        return TROUBLE_BLIND;
    /* deafness isn't its own trouble; healing magic cures deafness
       when it cures blindness, so do the same with trouble repair */
    if ((intrinsic(state, DEAF) & TIMEOUT) > 1) return TROUBLE_BLIND;

    for (let i = 0; i < A_MAX; i++)
        if (state.u.acurr.a[i] < state.u.amax.a[i]) return TROUBLE_POISONED;
    if ((intrinsic(state, WOUNDED_LEGS) || extrinsic(state, WOUNDED_LEGS))
        && !state.u.usteed)
        return TROUBLE_WOUNDED_LEGS;
    if (state.u.uhs >= HUNGRY) return TROUBLE_HUNGRY;
    if (intrinsic(state, STUNNED) & TIMEOUT) return TROUBLE_STUNNED;
    if (intrinsic(state, CONFUSION) & TIMEOUT) return TROUBLE_CONFUSED;
    if (intrinsic(state, HALLUC) & TIMEOUT) return TROUBLE_HALLUCINATION;
    return 0;
}

// C ref: pray.c worst_cursed_item() (288-346). "select an item for
// TROUBLE_CURSED_ITEMS". in_trouble() reads only whether the answer is null.
export function worst_cursed_item(state = game) {
    let otmp;

    /* if strained or worse, check for loadstone first */
    if (near_capacity(state) >= HVY_ENCUMBER) {
        for (otmp = state.invent; otmp; otmp = otmp.nobj)
            if (Cursed_obj(otmp, LOADSTONE)) return otmp;
    }
    /* weapon takes precedence if it is interfering
       with taking off a ring or putting on a shield */
    if (welded(state.uwep, state)
        && (state.uright || bimanual(state.uwep, state))) { /* weapon */
        otmp = state.uwep;
    /* gloves come next, due to rings */
    } else if (state.uarmg && state.uarmg.cursed) { /* gloves */
        otmp = state.uarmg;
    /* then shield due to two handed weapons and spells */
    } else if (state.uarms && state.uarms.cursed) { /* shield */
        otmp = state.uarms;
    /* then cloak due to body armor */
    } else if (state.uarmc && state.uarmc.cursed) { /* cloak */
        otmp = state.uarmc;
    } else if (state.uarm && state.uarm.cursed) { /* suit */
        otmp = state.uarm;
    /* if worn helmet of opposite alignment is making you an adherent
       of the current god, he/she/it won't uncurse that for you */
    } else if (state.uarmh && state.uarmh.cursed /* helmet */
               && state.uarmh.otyp !== HELM_OF_OPPOSITE_ALIGNMENT) {
        otmp = state.uarmh;
    } else if (state.uarmf && state.uarmf.cursed) { /* boots */
        otmp = state.uarmf;
    } else if (state.uarmu && state.uarmu.cursed) { /* shirt */
        otmp = state.uarmu;
    } else if (state.uamul && state.uamul.cursed) { /* amulet */
        otmp = state.uamul;
    } else if (state.uleft && state.uleft.cursed) { /* left ring */
        otmp = state.uleft;
    } else if (state.uright && state.uright.cursed) { /* right ring */
        otmp = state.uright;
    } else if (state.ublindf && state.ublindf.cursed) { /* eyewear */
        otmp = state.ublindf; /* must be non-blinding lenses */
    /* if weapon wasn't handled above, do it now */
    } else if (welded(state.uwep, state)) { /* weapon */
        otmp = state.uwep;
    /* active secondary weapon even though it isn't welded */
    } else if (state.uswapwep && state.uswapwep.cursed && state.u.twoweap) {
        otmp = state.uswapwep;
    /* all worn items ought to be handled by now */
    } else {
        // C leaves otmp NULL when the scan runs out, and that is the whole of
        // the "no cursed item worth fixing" answer.
        for (otmp = state.invent; otmp; otmp = otmp.nobj) {
            if (!otmp.cursed) continue;
            if (otmp.otyp === LOADSTONE || confers_luck(otmp, state)) break;
        }
    }
    return otmp ?? null;
}

// C ref: pray.c fix_curse_trouble() (348-370). This helper owns the common
// visible uncurse message and inventory refresh used by several
// fix_worst_trouble() arms. The source calls unported helpers only where their
// return value is discarded; those boundaries remain explicit gaps rather
// than silently changing the property they own.
export async function fix_curse_trouble(otmp, what = null, state = game) {
    if (!otmp) {
        note_unported('pray.c impossible');
        return;
    }

    if (otmp === state.uarmg && Glib(state)) {
        make_glib(0, state);
        await ttyPline(
            `Your ${gloves_simple_name(state.uarmg, state)} are no longer slippery.`,
            state,
        );
        if (!otmp.cursed) return;
    }

    const blindfoldedOnly = Boolean(
        state.u?.uprops?.[BLINDED]?.extrinsic,
    ) && !heroIsBlinded(state);
    if (!heroIsBlind(state) || (otmp === state.ublindf && blindfoldedOnly)) {
        await ttyPline(
            `${what ?? Yobjnam2(otmp, 'softly glow', state)} ${hcolor('amber', state)}.`,
            state,
        );
        state.iflags ??= {};
        state.iflags.last_msg = PLNMSG_OBJ_GLOWS;
        otmp.bknown = Hallucination(state) ? 0 : 1;
    }
    await uncurse(otmp, { state });
    update_inventory({ state });
}

function heroIsBlinded(state) {
    const property = state.u?.uprops?.[BLINDED];
    return Boolean((property?.intrinsic ?? 0) && !(property?.blocked ?? 0));
}

function heroIsDeaf(state) {
    const property = state.u?.uprops?.[DEAF];
    return Boolean(
        (property?.intrinsic ?? 0) || (property?.extrinsic ?? 0)
            || state.u?.uroleplay?.deaf,
    );
}

// C ref: pray.c fix_worst_trouble() (372-600). Every switch arm is retained
// in source order. Helpers whose C implementations are not yet available are
// represented by note_unported(); helpers with live JavaScript owners are
// called at their source point, including their asynchronous message order.
export async function fix_worst_trouble(trouble, state = game) {
    let otmp = null;
    let what = null;

    switch (trouble) {
    case TROUBLE_STONED:
        note_unported('potion.c make_stoned');
        break;
    case TROUBLE_SLIMED:
        note_unported('potion.c make_slimed');
        break;
    case TROUBLE_STRANGLED:
        if (state.uamul && state.uamul.otyp === AMULET_OF_STRANGULATION) {
            await ttyPline('Your amulet vanishes!', state);
            note_unported('invent.c useup');
        }
        await ttyPline('You can breathe again.', state);
        state.u.uprops[STRANGLED].intrinsic = 0;
        state.disp ??= {};
        state.disp.botl = true;
        break;
    case TROUBLE_LAVA:
        if (!await safe_teleds(TELEDS_NO_FLAGS, state))
            await reset_utrap(true, state);
        note_unported('hack.c rescued_from_terrain');
        break;
    case TROUBLE_STARVING:
        // FALLTHROUGH
    case TROUBLE_HUNGRY:
        await ttyPline(`Your ${body_part(STOMACH, state.youmonst)} feels content.`, state);
        init_uhunger(state);
        state.disp ??= {};
        state.disp.botl = true;
        break;
    case TROUBLE_SICK:
        await ttyPline('You feel better.', state);
        note_unported('potion.c make_sick');
        break;
    case TROUBLE_REGION:
        note_unported('region.c region_safety');
        break;
    case TROUBLE_HIT: {
        await ttyPline('You feel much better.', state);
        if (Upolyd(state.u)) {
            const maxhp = state.u.mhmax + rnd(5);
            setuhpmax(Math.max(maxhp, 5 + 1), false, state);
            state.u.mh = state.u.mhmax;
        }
        let maxhp = state.u.uhpmax;
        if (maxhp < state.u.ulevel * 5 + 11)
            maxhp += rnd(5);
        setuhpmax(Math.max(maxhp, 5 + 1), true, state);
        state.u.uhp = state.u.uhpmax;
        state.disp ??= {};
        state.disp.botl = true;
        break;
    }
    case TROUBLE_COLLAPSING:
        await ttyPline(
            `You feel ${state.u.amax.a[A_STR] - state.u.acurr.a[A_STR] > 6
                ? 'much ' : ''}stronger.`,
            state,
        );
        state.u.acurr.a[A_STR] = state.u.amax.a[A_STR];
        state.disp ??= {};
        state.disp.botl = true;
        if (state.u.uprops?.[FIXED_ABIL]?.extrinsic) {
            if ((otmp = stuck_ring(
                state.uleft, RIN_SUSTAIN_ABILITY, state,
            ))) {
                if (otmp === state.uleft) what = 'Your left ring softly glows';
            } else if ((otmp = stuck_ring(
                state.uright, RIN_SUSTAIN_ABILITY, state,
            ))) {
                if (otmp === state.uright) what = 'Your right ring softly glows';
            }
            if (otmp) await fix_curse_trouble(otmp, what, state);
        }
        break;
    case TROUBLE_STUCK_IN_WALL:
        if (await safe_teleds(TELEDS_NO_FLAGS, state)) {
            await ttyPline('Your surroundings change.', state);
        } else {
            const passesWalls = state.u.uprops[PASSES_WALLS] ??= {
                intrinsic: 0,
                extrinsic: 0,
            };
            set_itimeout(passesWalls, d(4, 4) + 4);
            await ttyPline('You feel much slimmer.', state);
        }
        break;
    case TROUBLE_CURSED_LEVITATION:
        if (Cursed_obj(state.uarmf, LEVITATION_BOOTS)) {
            otmp = state.uarmf;
        } else if ((otmp = stuck_ring(
            state.uleft, RIN_LEVITATION, state,
        ))) {
            if (otmp === state.uleft) what = 'Your left ring softly glows';
        } else if ((otmp = stuck_ring(
            state.uright, RIN_LEVITATION, state,
        ))) {
            if (otmp === state.uright) what = 'Your right ring softly glows';
        }
        await fix_curse_trouble(otmp, what, state);
        break;
    case TROUBLE_UNUSEABLE_HANDS:
        if (welded(state.uwep, state)) {
            await fix_curse_trouble(state.uwep, null, state);
            break;
        }
        if (Upolyd(state.u) && nohands(state.youmonst?.data)) {
            if (!Unchanging(state)) {
                await ttyPline('Your shape becomes uncertain.', state);
                await rehumanize(state);
            } else if ((otmp = unchanger(state)) && otmp.cursed) {
                await fix_curse_trouble(otmp, null, state);
                break;
            }
        }
        if (nohands(state.youmonst?.data) || !freehand(state))
            note_unported('pray.c impossible');
        break;
    case TROUBLE_CURSED_BLINDFOLD:
        await fix_curse_trouble(state.ublindf, null, state);
        break;
    case TROUBLE_LYCANTHROPE:
        note_unported('were.c you_unwere');
        break;
    case TROUBLE_PUNISHED:
        await ttyPline('Your chain disappears.', state);
        if (state.u.utrap && state.u.utraptype === TT_BURIEDBALL)
            note_unported('dig.c buried_ball_to_freedom');
        else
            note_unported('ball.c unpunish');
        break;
    case TROUBLE_FUMBLING:
        if (Cursed_obj(state.uarmg, GAUNTLETS_OF_FUMBLING)) {
            otmp = state.uarmg;
        } else if (Cursed_obj(state.uarmf, FUMBLE_BOOTS)) {
            otmp = state.uarmf;
        }
        await fix_curse_trouble(otmp, null, state);
        break;
    case TROUBLE_CURSED_ITEMS:
        otmp = worst_cursed_item(state);
        if (otmp === state.uright) what = 'Your right ring softly glows';
        else if (otmp === state.uleft) what = 'Your left ring softly glows';
        await fix_curse_trouble(otmp, what, state);
        break;
    case TROUBLE_POISONED:
        await ttyPline(
            Hallucination(state)
                ? "There's a tiger in your tank."
                : 'You feel in good health again.',
            state,
        );
        for (let i = 0; i < A_MAX; i++) {
            if (state.u.acurr.a[i] < state.u.amax.a[i]) {
                state.u.acurr.a[i] = state.u.amax.a[i];
                state.disp ??= {};
                state.disp.botl = true;
            }
        }
        await encumber_msg(state);
        break;
    case TROUBLE_BLIND: {
        let msgbuf = '';
        let eyes = body_part(EYE, state.youmonst);
        const cureDeaf = Boolean(intrinsic(state, DEAF) & TIMEOUT);
        if (heroIsBlinded(state)) {
            const pmidx = state.youmonst?.data?.pmidx;
            if (pmidx !== PM_FLOATING_EYE && pmidx !== PM_CYCLOPS)
                eyes = makeplural(eyes);
            msgbuf = `Your ${eyes} ${vtense(eyes, 'feel')} better`;
            state.u.ucreamed = 0;
            note_unported('potion.c make_blinded');
        }
        if (cureDeaf) {
            await make_deaf(0, false, state);
            if (!heroIsDeaf(state))
                msgbuf += `${msgbuf ? ' and you' : 'You'} can hear again`;
        }
        if (msgbuf) await ttyPline(`${msgbuf}.`, state);
        break;
    }
    case TROUBLE_WOUNDED_LEGS:
        await heal_legs(state);
        break;
    case TROUBLE_STUNNED:
        note_unported('potion.c make_stunned');
        break;
    case TROUBLE_CONFUSED:
        await make_confused(0, true, state);
        break;
    case TROUBLE_HALLUCINATION:
        await ttyPline('Looks like you are back in Kansas.', state);
        await make_hallucinated(0, false, 0, state);
        break;
    case TROUBLE_SADDLE:
        otmp = which_armor(state.u.usteed, W_SADDLE, state);
        if (!heroIsBlind(state)) {
            await ttyPline(
                `${Yobjnam2(otmp, 'softly glow', state)} ${hcolor('amber', state)}.`,
                state,
            );
            set_bknown(otmp, 1, { state });
        }
        if (otmp) await uncurse(otmp, { state });
        break;
    default:
        break;
    }
}

// C ref: pray.c can_pray() (2124-2173). "determine prayer results in advance;
// also used for enlightenment". `praying` false means no messages should be
// given; only dopray() reaches this port's copy, so it always passes true.
export async function can_pray(praying, state = game) {
    let alignment;
    const { u } = state;
    state.gp ??= {};

    state.gp.p_aligntyp = on_altar(state)
        ? a_align(u.ux, u.uy, state) : u.ualign.type;
    state.gp.p_trouble = in_trouble(state);

    // C's guard reads `p_aligntyp == A_LAWFUL || p_aligntyp != A_NEUTRAL`,
    // which its own comment ("ok if chaotic or none") contradicts: the second
    // disjunct already admits chaotic and Moloch. Ported as written.
    if (is_demon(state.youmonst?.data)
        && (state.gp.p_aligntyp === A_LAWFUL
            || state.gp.p_aligntyp !== A_NEUTRAL)) {
        if (praying) {
            await ttyPline(
                'The very idea of praying to a '
                + `${state.gp.p_aligntyp ? 'lawful' : 'neutral'} god is `
                + 'repugnant to you.',
                state,
            );
        }
        return false;
    }

    if (praying) {
        await ttyPline(
            `You begin praying to ${align_gname(state.gp.p_aligntyp, state)}.`,
            state,
        );
    }

    if (u.ualign.type && u.ualign.type === -state.gp.p_aligntyp)
        alignment = -u.ualign.record; /* Opposite alignment altar */
    else if (u.ualign.type !== state.gp.p_aligntyp)
        alignment = Math.trunc(u.ualign.record / 2); /* Different alignment */
    else
        alignment = u.ualign.record;

    if (state.gp.p_aligntyp === A_NONE) /* praying to Moloch */
        state.gp.p_type = -2;
    else if ((state.gp.p_trouble > 0) ? (u.ublesscnt > 200)   /* big trouble */
        : (state.gp.p_trouble < 0) ? (u.ublesscnt > 100) /* minor difficulty */
            : (u.ublesscnt > 0))                        /* not in trouble */
        state.gp.p_type = 0;                     /* too soon... */
    else if (((u.uluck ?? 0) + (u.moreluck ?? 0)) < 0 || u.ugangr
             || alignment < 0)
        state.gp.p_type = 1; /* too naughty... */
    else /* alignment >= 0 */ {
        if (on_altar(state) && u.ualign.type !== state.gp.p_aligntyp)
            state.gp.p_type = 2;
        else
            state.gp.p_type = 3;
    }

    // No ported hero is undead: js/u_init.js writes u.umonnum === u.umonster,
    // so Upolyd is constantly false, and no player race is undead. The rn2(10)
    // below therefore never draws; it is written out because skipping it would
    // silently drop a call from a form that can reach here later.
    if (is_undead(state.youmonst?.data) && !In_hell(u.uz, state)
        && (state.gp.p_aligntyp === A_LAWFUL
            || (state.gp.p_aligntyp === A_NEUTRAL && !rn2(10))))
        state.gp.p_type = -1;
    /* Note:  when !praying, the random factor for neutrals makes the
       return value a non-deterministic approximation for enlightenment.
       This case should be uncommon enough to live with... */

    return !praying
        ? (state.gp.p_type === 3 && !In_hell(u.uz, state))
        : true;
}

// C ref: pray.c dopray() (2199-2273), the '#pray' command.
export async function dopray(state = game) {
    /*
     * If ParanoidPray is set, confirm prayer to avoid accidental slips
     * of Alt+p.  If ParanoidConfirm is also set, require "yes" rather
     * than just "y" (will also require "no" to decline).
     */
    if ((state.flags.paranoia_bits & PARANOID_PRAY) !== 0) {
        // flag.h:556 ParanoidConfirm, a different bit from the ParanoidPray
        // one above: it asks for "yes" spelled out rather than a single 'y'.
        const ok = await paranoid_query(
            (state.flags.paranoia_bits & PARANOID_CONFIRM) !== 0,
            'Are you sure you want to pray?',
            state,
        );
        // C's cmdq_clear(CQ_REPEAT) pair below this is inside `#if 0`.
        if (!ok) /* declined the "are you sure?" confirmation */
            return ECMD_OK;
    }

    // C logs the first broken gnostic conduct before can_pray() may refuse
    // the prayer. The counter and chronicle entry advance together.
    if (!state.u.uconduct.gnostic)
        livelog_printf(LL_CONDUCT, 'rejected atheism with a prayer', state);
    state.u.uconduct.gnostic++;

    /* set up p_type and p_alignment */
    if (!await can_pray(true, state)) return ECMD_OK;

    if (state.wizard && state.gp.p_type >= 0) {
        // C ref: dopray():2233-2258. Wizard-mode shortcut that forces the
        // gods to be pleased. in_doagain is always false in JS, so the
        // ParanoidPray arm that clears it is a no-op; both paths use y_n.
        const ok = (await y_n('Force the gods to be pleased?', state))
            === 'y'.charCodeAt(0);
        if (ok) {
            state.u.ublesscnt = 0;
            if (state.u.uluck < 0) state.u.uluck = 0;
            if (state.u.ualign.record <= 0) state.u.ualign.record = 1;
            state.u.ugangr = 0;
            if (state.gp.p_type < 2) state.gp.p_type = 3;
        }
    }
    // The prayer itself is a three-turn wait. nomul() writes gm.multi, and
    // allmain.c moveloop_core() counts it back up one turn at a time and calls
    // hack.c unmul() when it reaches zero; unmul() prints nomovemsg and runs
    // the callback. state.afternmv is C's ga.afternmv; js/do_wear.js
    // armoroff() writes it too, with the Armor_off callback, and cancel_doff()
    // there records why the two never overlap. It is stored flat beside
    // state.nomovemsg and state.multi_reason, the two globals dopray() sets
    // alongside it. No segment boundary can fall between the write and the
    // read, because moveloop_core() reads no key while gm.multi is negative,
    // so it needs no save handling -- decl.c:175 leaves C's copy out of the
    // save file for the same reason.
    nomul(-3, state);
    state.multi_reason = 'praying';
    state.nomovemsg = 'You finish your prayer.';
    state.afternmv = prayer_done;

    if (state.gp.p_type === 3 && !In_hell(state.u.uz, state)) {
        // C ref: dopray():2265-2270. A coaligned hero in good standing is
        // invulnerable while praying. prayer_done() clears the flag.
        if (!heroIsBlind(state))
            await ttyPline(
                'You are surrounded by a shimmering light.', state,
            );
        state.u.uinvulnerable = true;
    }

    return ECMD_TIME;
}

// C ref: pray.c prayer_done() (2276-2343), the ga.afternmv callback dopray()
// installs. The p_type 0 arm remains the only fully wired failure path here;
// the p_type 3 arm reaches pleased(), whose complete source branch is below.
//
// C's return value distinguishes the Inhell arm from the rest, and only
// moveloop_core()'s occupation loop reads an afternmv result; unmul() discards
// it. Nothing is returned here.
export async function prayer_done(state = game) {
    state.u.uinvulnerable = false;
    if (state.gp.p_type === -2) {
        // Praying at an unaligned altar: wake_nearby(), adjalign(-2) and,
        // outside Gehennom, "Nothing else happens."
        throw new UnsupportedPrayerError("prayer_done()'s Moloch arm");
    } else if (state.gp.p_type === -1) {
        // Praying while polymorphed into an undead creature: godvoice(),
        // rehumanize() and losehp(rnd(20)).
        throw new UnsupportedPrayerError("prayer_done()'s undead arm");
    }
    if (In_hell(state.u.uz, state)) {
        // "Since you are in Gehennom, %s can't help you." plus an rnl() roll
        // against u.ualign.record that decides whether angrygods() runs.
        throw new UnsupportedPrayerError("prayer_done()'s Gehennom arm");
    }

    if (state.gp.p_type === 0) {
        // C guards water_prayer(FALSE) with `on_altar() && u.ualign.type !=
        // alignment`. can_pray() only reaches p_type 0 by way of u.ublesscnt,
        // so an altar-standing hero can arrive here; water_prayer() blesses
        // and curses the potions underfoot and is not ported.
        if (on_altar(state) && state.u.ualign.type !== state.gp.p_aligntyp)
            throw new UnsupportedPrayerError('water_prayer()');
        state.u.ublesscnt += rnz(250);
        change_luck(-3, state);
        await gods_upset(state.u.ualign.type, state);
    } else if (state.gp.p_type === 1) {
        // "too naughty". pray.c:2323-2325 runs the same on_altar()
        // water_prayer(FALSE) call the p_type 0 arm above does, then
        // angrygods(u.ualign.type). What it skips relative to p_type 0 is the
        // pair of penalties between them, u.ublesscnt += rnz(250) and
        // change_luck(-3).
        throw new UnsupportedPrayerError("prayer_done()'s p_type 1 arm");
    } else if (state.gp.p_type === 2) {
        // A coaligned hero on a cross-aligned altar: water_prayer() decides
        // between the p_type 0 penalties and pleased().
        throw new UnsupportedPrayerError("prayer_done()'s p_type 2 arm");
    } else {
        // Coaligned and in good standing: pray_revive(), water_prayer(TRUE)
        // and pleased(), which is the whole reward half of pray.c. The altar
        // helpers return values that this arm discards, so retain their source
        // gaps and continue to pleased().
        if (on_altar(state)) {
            note_unported('pray.c pray_revive');
            note_unported('pray.c water_prayer');
        }
        await pleased(state.gp.p_aligntyp, state);
    }
}

// C ref: pray.c maybe_turn_mon_iter() (2347-2405). `iter_mons()` invokes this
// callback for living, on-map monsters; the asynchronous owners below keep
// that same cached-next traversal in doturn().
function turnDefaultMessage(text, state, env = {}) {
    if (env.planning) return undefined;
    return ttyPline(text, state);
}

// C ref: mon.c pline_mon() as reached by monmove.c monflee(). The detail kinds
// are the ones monflee() selects after its source visibility and light tests.
async function turnFleeMessage(monster, detail, env = {}) {
    const state = env.state ?? game;
    const name = Monnam(monster, state);
    let text;
    switch (detail.kind) {
    case 'immobile-flinch':
        text = `${name} seems to flinch.`;
        break;
    case 'frightened':
        text = `${name} is frightened.`;
        break;
    case 'painful-light':
        text = `${name} flees from the painful light of `
            + '[its imagination?].';
        break;
    case 'bright-light':
        text = '"Bright light!"';
        break;
    default:
        text = `${name} turns to flee.`;
        break;
    }
    const message = env.message ?? turnDefaultMessage;
    return message(messageAt(text, monster.mx, monster.my, state), state, env);
}

// C ref: pray.c maybe_turn_mon_iter() (2347-2405). The two file-static C
// values are state fields so a helper call observes the same values doturn()
// installed. `killed()` and `monflee()` discard their C return values; a
// refusal from either unported downstream branch remains a command boundary.
export async function maybe_turn_mon_iter(mtmp, state = game, env = {}) {
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    const couldSee = env.couldSee
        ?? ((x, y) => couldsee(x, y, state));
    const range = env.turnUndeadRange ?? state.turn_undead_range ?? 0;
    if (!couldSee(mtmp.mx, mtmp.my) || dist2(
        mtmp.mx,
        mtmp.my,
        state.u.ux,
        state.u.uy,
    ) > range) return;

    if (mtmp.mpeaceful
        || (!is_undead(mtmp.data)
            && !is_vampshifter(mtmp)
            && !(is_demon(mtmp.data)
                && state.u.ulevel > (MAXULEV / 2)))) return;

    mtmp.msleeping = false;
    if (intrinsic(state, CONFUSION)) {
        const messageCount = state.turn_undead_msg_cnt ?? 0;
        state.turn_undead_msg_cnt = messageCount + 1;
        if (!messageCount) {
            await (env.message ?? turnDefaultMessage)(
                'Unfortunately, your voice falters.', state, env,
            );
        }
        mtmp.mflee = false;
        mtmp.mfrozen = 0;
        mtmp.mcanmove = true;
    } else if (!await resist(mtmp, '\0', 0, TELL, state, random)) {
        let xlev = 6;
        switch (mtmp.data?.mlet) {
        case S_LICH:
            xlev += 2;
            // FALLTHROUGH
        case S_GHOST:
            xlev += 2;
            // FALLTHROUGH
        case S_VAMPIRE:
            xlev += 2;
            // FALLTHROUGH
        case S_WRAITH:
            xlev += 2;
            // FALLTHROUGH
        case S_MUMMY:
            xlev += 2;
            // FALLTHROUGH
        case S_ZOMBIE:
            if (state.u.ulevel >= xlev
                && !await resist(mtmp, '\0', 0, NOTELL, state, random)) {
                if (state.u.ualign.type === A_CHAOTIC) {
                    mtmp.mpeaceful = true;
                    set_malign(mtmp, state);
                } else {
                    await killed(mtmp, state, {
                        ...env,
                        state,
                        random,
                        message: env.message ?? turnDefaultMessage,
                        unsupported: env.unsupported
                            ?? ((what) => {
                                throw new UnsupportedPrayerError(what);
                            }),
                    });
                }
                break;
            }
            // FALLTHROUGH
        default:
            await monflee(mtmp, 0, false, true, {
                ...env,
                state,
                random,
                couldSee,
                canSeeMonster: env.canSeeMonster
                    ?? ((monster) => canseemon(monster, state)),
                fleeMessage: env.fleeMessage ?? turnFleeMessage,
                message: env.message ?? turnDefaultMessage,
            });
            break;
        }
    }
}

// C ref: pray.c doturn() (2407-2489), the #turn extended command.
export async function doturn(state = game, env = {}) {
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    const message = env.message ?? turnDefaultMessage;
    const normalized = { ...env, state, random, message };
    const role = state.urole?.mnum;

    if (role !== PM_CLERIC && role !== PM_KNIGHT) {
        if (known_spell(SPE_TURN_UNDEAD, state)) {
            return await spelleffects(
                SPE_TURN_UNDEAD, false, false, state, normalized,
            );
        }
        await message("You don't know how to turn undead!", state, env);
        return ECMD_OK;
    }

    state.u.uconduct.gnostic++;
    const Gname = halu_gname(state.u.ualign.type, state);
    if (!can_chant(state.youmonst, state)) {
        await message(
            `You are ${intrinsic(state, STRANGLED)
                ? 'not able to call' : 'incapable of calling'} upon ${Gname}`
                + ' to turn aside evilness.', state, env,
        );
        return state.u.uconduct.gnostic === 1 ? ECMD_TIME : ECMD_OK;
    }

    if ((state.u.ualign.type !== A_CHAOTIC
            && (is_demon(state.youmonst?.data)
                || is_undead(state.youmonst?.data)
                || is_vampshifter(state.youmonst)))
        || state.u.ugangr > 6) {
        await message(
            `For some reason, ${Gname} seems to ignore you.`, state, env,
        );
        note_unported('wizard.c aggravate');
        await exercise(A_WIS, false, state, random);
        return ECMD_TIME;
    }

    if (In_hell(state.u.uz, state)) {
        await message(
            `Since you are in Gehennom, ${Gname} `
                + `${Gname === Moloch ? "won't" : "can't"} help you.`,
            state,
            env,
        );
        note_unported('wizard.c aggravate');
        return ECMD_TIME;
    }

    await message(
        `Calling upon ${Gname}, you chant an arcane formula.`, state, env,
    );
    await exercise(A_WIS, true, state, random);
    state.turn_undead_range = BOLT_LIM
        + Math.trunc(state.u.ulevel / 5);
    state.turn_undead_range *= state.turn_undead_range;
    state.turn_undead_msg_cnt = 0;

    // C iter_mons() caches nmon before invoking the callback. The callback is
    // asynchronous here, so awaiting each one also preserves C's mutation and
    // random-call order before the negative multi state is installed.
    for (let mtmp = state.level?.monlist ?? null; mtmp;) {
        const next = mtmp.nmon;
        if (mtmp.mhp >= 1 && !mon_offmap(mtmp)) {
            await maybe_turn_mon_iter(mtmp, state, normalized);
        }
        mtmp = next;
    }

    nomul(-(5 - Math.trunc((state.u.ulevel - 1) / 6)), state);
    state.multi_reason = 'trying to turn the monsters';
    state.nomovemsg = You_can_move_again;
    return ECMD_TIME;
}

// C ref: pray.c pleased() (1071-1386). A successful prayer first reports the
// deity's satisfaction, then chooses a trouble repair, blessing, recovery, or
// divine gift. The source helpers that are still outside the port are recorded
// at their call sites; their branches retain source order and RNG draws.
export async function pleased(g_align, state = game) {
    const { u } = state;
    state.iflags ??= {};
    state.disp ??= {};
    let trouble = in_trouble(state);
    let pat_on_head = 0;
    let kick_on_butt;
    const luck = (u.uluck ?? 0) + (u.moreluck ?? 0);

    const satisfaction = u.ualign.record >= 14
        ? (Hallucination(state) ? 'pleased as punch' : 'well-pleased')
        : u.ualign.record >= STRIDENT
            ? (Hallucination(state) ? 'ticklish' : 'pleased')
            : (Hallucination(state) ? 'full' : 'satisfied');
    await ttyPline(
        `You feel that ${align_gname(g_align, state)} is ${satisfaction}.`,
        state,
    );

    /* not your deity */
    if (on_altar(state) && state.gp.p_aligntyp !== u.ualign.type) {
        adjalign(-1, state);
        return;
    } else if (u.ualign.record < 2 && trouble <= 0) {
        adjalign(1, state);
    }

    if (!trouble && u.ualign.record >= 14) {
        /* if hero was in trouble, but got better, no special favor */
        if (state.gp.p_trouble === 0) pat_on_head = 1;
    } else {
        let action;
        let prayer_luck;
        /* Keep Luck at -1 or above so the rn1() bound stays positive. */
        prayer_luck = Math.max(luck, -1);
        action = rn1(
            prayer_luck + (on_altar(state)
                ? 3 + Number(Boolean(
                    state.level.at(u.ux, u.uy).altarmask & AM_SHRINE,
                ))
                : 2),
            1,
        );
        if (!on_altar(state)) action = Math.min(action, 3);
        if (u.ualign.record < STRIDENT)
            action = (u.ualign.record > 0 || !rnl(2)) ? 1 : 0;

        switch (Math.min(action, 5)) {
        case 5:
            pat_on_head = 1;
            // FALLTHROUGH
        case 4:
            do {
                await fix_worst_trouble(trouble, state);
                trouble = in_trouble(state);
            } while (trouble !== 0);
            break;
        case 3:
            await fix_worst_trouble(trouble, state);
            // FALLTHROUGH
        case 2:
            {
                let tryct = 0;
                while ((trouble = in_trouble(state)) > 0 && (++tryct < 10))
                    await fix_worst_trouble(trouble, state);
            }
            break;
        case 1:
            if (trouble > 0)
                await fix_worst_trouble(trouble, state);
            break;
        case 0:
            break;
        default:
            break;
        }
    }

    /* A pat on the head is only possible once all troubles are gone. */
    if (pat_on_head) {
        switch (rn2((luck + 6) >> 1)) {
        case 0:
            break;
        case 1: {
            const weapon = u.uwep;
            if (weapon && (welded(weapon, state)
                || weapon.oclass === WEAPON_CLASS
                || is_weptool(weapon, state))) {
                let repair_buf = '';
                if (weapon.oeroded || weapon.oeroded2)
                    repair_buf = ` and ${otense(weapon, 'are')} now as good as new`;

                if (weapon.cursed) {
                    if (!heroIsBlind(state)) {
                        await ttyPline(
                            `${Yobjnam2(weapon, 'softly glow', state)} ${hcolor('amber', state)}${repair_buf}.`,
                            state,
                        );
                        state.iflags.last_msg = PLNMSG_OBJ_GLOWS;
                    } else {
                        await ttyPline(
                            `You feel the power of ${u_gname(state)} over ${yname(weapon, state)}.`,
                            state,
                        );
                    }
                    await uncurse(weapon, { state });
                    weapon.bknown = 1;
                    repair_buf = '';
                } else if (!weapon.blessed) {
                    if (!heroIsBlind(state)) {
                        await ttyPline(
                            `${Yobjnam2(weapon, 'softly glow', state)} with ${an(hcolor('light blue', state))} aura${repair_buf}.`,
                            state,
                        );
                        state.iflags.last_msg = PLNMSG_OBJ_GLOWS;
                    } else {
                        await ttyPline(
                            `You feel the blessing of ${u_gname(state)} over ${yname(weapon, state)}.`,
                            state,
                        );
                    }
                    await uncurse(weapon, { state });
                    weapon.blessed = true;
                    weapon.bknown = 1;
                    repair_buf = '';
                }

                if (weapon.oeroded || weapon.oeroded2) {
                    weapon.oeroded = 0;
                    weapon.oeroded2 = 0;
                    if (repair_buf)
                        await ttyPline(
                            `${Yobjnam2(weapon, null, state)} ${otense(
                                weapon, heroIsBlind(state) ? 'feel' : 'look',
                            )} as good as new!`, state,
                        );
                }
                update_inventory({ state });
            }
            break;
        }
        case 3:
            // Two tune hints are source branches; only the sound and
            // achievement interfaces remain gaps. Once both hints are heard,
            // C falls through to the ordinary recovery branch.
            if (!u.uevent.uopened_dbridge && !u.uevent.gehennom_entered) {
                if (u.uevent.uheard_tune < 1) {
                    await godvoice(g_align, null, state);
                    note_unported('pray.c SetVoice');
                    await verbalize(
                        `Hark, ${is_human(state.youmonst?.data)
                            ? 'mortal' : 'creature'}!`,
                        state,
                    );
                    note_unported('pray.c SetVoice');
                    await verbalize(
                        'To enter the castle, thou must play the right tune!',
                        state,
                    );
                    u.uevent.uheard_tune++;
                    break;
                } else if (u.uevent.uheard_tune < 2) {
                    note_unported('pray.c Soundeffect');
                    note_unported('pray.c You_hear');
                    await ttyPline(`It sounds like:  "${state.svt?.tune ?? ''}".`, state);
                    u.uevent.uheard_tune++;
                    note_unported('pray.c record_achievement');
                    break;
                }
            }
            // FALLTHROUGH
        case 2:
            if (!heroIsBlind(state))
                await ttyPline(
                    `You are surrounded by ${an(hcolor('golden', state))} glow.`,
                    state,
                );
            /* If a prior level was lost, regain one level first. */
            if (u.ulevel < u.ulevelmax) {
                u.ulevelmax -= 1;
                await pluslvl(false, state, { message: ttyPline });
            } else {
                u.uhpmax += 5;
                if (u.uhpmax > u.uhppeak) u.uhppeak = u.uhpmax;
                if (Upolyd(u)) u.mhmax += 5;
            }
            u.uhp = u.uhpmax;
            if (Upolyd(u)) u.mh = u.mhmax;
            if (u.acurr.a[A_STR] < u.amax.a[A_STR]) {
                u.acurr.a[A_STR] = u.amax.a[A_STR];
                state.disp.botl = true;
                await encumber_msg(state);
            }
            if (u.uhunger < 900) init_uhunger(state);
            if (u.uluck < 0) u.uluck = 0;
            u.ucreamed = 0;
            await make_blinded(0, true, state);
            state.disp.botl = true;
            break;
        case 4: {
            let any = 0;
            if (heroIsBlind(state))
                await ttyPline(`You feel the power of ${u_gname(state)}.`, state);
            else
                await ttyPline(
                    `You are surrounded by ${an(hcolor('light blue', state))} aura.`,
                    state,
                );
            for (let object = state.invent; object; object = object.nobj) {
                if (object.cursed
                    && (object !== u.uarmh
                        || u.uarmh.otyp !== HELM_OF_OPPOSITE_ALIGNMENT)) {
                    if (!heroIsBlind(state)) {
                        await ttyPline(
                            `${Yobjnam2(object, null, state)} ${hcolor('amber', state)}.`,
                            state,
                        );
                        state.iflags.last_msg = PLNMSG_OBJ_GLOWS;
                        object.bknown = 1;
                        ++any;
                    }
                    await uncurse(object, { state });
                }
            }
            if (any) update_inventory({ state });
            break;
        }
        case 5: {
            await godvoice(
                u.ualign.type,
                'Thou hast pleased me with thy progress,',
                state,
            );
            const grant = (property, label) => {
                const prop = u.uprops[property];
                prop.intrinsic ??= 0;
                if (!(prop.intrinsic & INTRINSIC)) {
                    prop.intrinsic |= FROMOUTSIDE;
                    return label;
                }
                return null;
            };
            const gift = grant(TELEPAT, 'Telepathy')
                ?? grant(FAST, 'Speed')
                ?? grant(STEALTH, 'Stealth');
            if (gift) {
                await ttyPline(`"and thus I grant thee the gift of ${gift}!"`, state);
                if (gift === 'Telepathy' && heroIsBlind(state)) see_monsters(state);
            } else {
                const prop = u.uprops[PROTECTION];
                prop.intrinsic ??= 0;
                if (!(prop.intrinsic & INTRINSIC)) {
                    prop.intrinsic |= FROMOUTSIDE;
                    if (!u.ublessed) u.ublessed = rn1(3, 2);
                } else {
                    u.ublessed++;
                }
                await ttyPline('"and thus I grant thee the gift of my protection!"', state);
            }
            await verbalize('Use it wisely in my name!', state);
            break;
        }
        case 7:
        case 8:
            if (u.ualign.record >= 20 && !u.uevent.uhand_of_elbereth) {
                note_unported('pray.c gcrownu');
                break;
            }
            // FALLTHROUGH
        case 6:
            note_unported('pray.c give_spell');
            break;
        default:
            note_unported('pray.c impossible');
            break;
        }
    }

    u.ublesscnt = rnz(350);
    kick_on_butt = u.uevent.udemigod ? 1 : 0;
    if (u.uevent.uhand_of_elbereth) kick_on_butt++;
    if (kick_on_butt) u.ublesscnt += kick_on_butt * rnz(1000);

    if ((state.moves ?? 0) > 100000) {
        let incr = Math.trunc(((state.moves ?? 0) - 100000) / 100);
        const largest = LARGEST_INT - u.ublesscnt;
        if (incr > largest) incr = largest;
        u.ublesscnt += incr;
    }
}

// C ref: pray.c gods_upset() (1436-1443). "The g_align god is upset with you."
// Anger at the hero's own god accumulates; anger at another god is spent.
export async function gods_upset(g_align, state = game) {
    if (g_align === state.u.ualign.type) state.u.ugangr++;
    else if (state.u.ugangr) state.u.ugangr--;
    await angrygods(g_align, state);
}

// C ref: youprop.h:119-120 Hallucination, the bare HALLUC intrinsic minus
// either form of Halluc_resistance.
function Hallucination(state) {
    const halluc = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(halluc?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: pray.c angrygods() (704-784). How badly a god reacts is
// `rn2(maxanger)`, and maxanger grows with the anger already stored and with
// bad luck, so the first prayer of a game -- one point of anger and the three
// points of luck prayer_done() has just taken -- lands on rn2(4).
//
// Cases 0 and 1 merely report displeasure. Cases 2 and 3 are also live for a
// level-1 hero: godvoice(), the two verbal messages, Wisdom loss, and losexp()
// all run before the shared prayer timer. The remaining cases reach
// rndcurse(), attrcurse(), punish(), summon_minion(), or god_zaps_you() and
// still stop by name below.
const GOD_VOICES = ['booms out', 'thunders', 'rings out', 'booms'];

// C ref: pray.c godvoice() (1414-1426). `words == NULL` leaves a trailing
// space after the colon, which is observable before a TTY --More-- prompt.
async function godvoice(g_align, words, state) {
    const quote = words === null ? '' : '"';
    const text = words === null ? '' : words;
    const voice = GOD_VOICES[rn2(GOD_VOICES.length)];
    await ttyPline(
        `The voice of ${align_gname(g_align, state)} ${voice}: `
            + `${quote}${text}${quote}`,
        state,
    );
}

export async function angrygods(resp_god, state = game) {
    let maxanger;
    const { u } = state;

    if (In_hell(u.uz, state)) resp_god = A_NONE;
    u.ublessed = 0; /* lose divine protection */

    const Luck = (u.uluck ?? 0) + (u.moreluck ?? 0);
    /* changed from tmp = u.ugangr + abs (u.uluck) -- rph */
    /* added test for alignment diff -dlc */
    if (resp_god !== u.ualign.type) {
        maxanger = Math.trunc(u.ualign.record / 2)
            + (Luck > 0 ? Math.trunc(-Luck / 3) : -Luck);
    } else {
        maxanger = 3 * u.ugangr
            + ((Luck > 0 || u.ualign.record >= STRIDENT)
                ? Math.trunc(-Luck / 3)
                : -Luck);
    }
    if (maxanger < 1) maxanger = 1; /* possible if bad align & good luck */
    else if (maxanger > 15) maxanger = 15; /* be reasonable */

    switch (rn2(maxanger)) {
    case 0:
    case 1:
        await ttyPline(
            `You feel that ${align_gname(resp_god, state)} is `
            + `${Hallucination(state) ? 'bummed' : 'displeased'}.`,
            state,
        );
        break;
    case 2:
    case 3:
        await godvoice(resp_god, null, state);
        await ttyPline(
            `"Thou ${u.ualign.record < 0 && resp_god === u.ualign.type
                ? 'hast strayed from the path'
                : 'art arrogant'}, ${is_human(state.youmonst?.data)
                ? 'mortal' : 'creature'}."`,
            state,
        );
        await ttyPline('"Thou must relearn thy lessons!"', state);
        await adjattrib(A_WIS, -1, 0, state, { message: ttyPline });
        await losexp(null, state);
        break;
    case 6:
        // C punishes an unpunished hero here and falls through to the curse
        // arm below when the hero already carries a ball and chain.
        throw new UnsupportedPrayerError("angrygods()'s punishment");
    case 4:
    case 5:
        throw new UnsupportedPrayerError("angrygods()'s curses");
    case 7:
    case 8:
        throw new UnsupportedPrayerError("angrygods()'s summoned minion");
    default:
        throw new UnsupportedPrayerError("angrygods()'s lightning bolt");
    }
    /* even though this might not be in response to prayer, set pray timer */
    const new_ublesscnt = rnz(300);
    if (new_ublesscnt > u.ublesscnt) u.ublesscnt = new_ublesscnt;
}

// C ref: decl.c Moloch.
const Moloch = 'Moloch';

// C ref: pray.c align_gname(). role.c stores a name whose worship is
// grammatically awkward with a leading underscore, which C strips here.
export function align_gname(alignment, state = game) {
    let gnam;
    switch (alignment) {
    case A_NONE:
        gnam = Moloch;
        break;
    case A_LAWFUL:
        gnam = state.urole.lgod;
        break;
    case A_NEUTRAL:
        gnam = state.urole.ngod;
        break;
    case A_CHAOTIC:
        gnam = state.urole.cgod;
        break;
    default:
        // C reports impossible() and carries on with "someone".
        gnam = 'someone';
        break;
    }
    return gnam.startsWith('_') ? gnam.slice(1) : gnam;
}

// C ref: pray.c halu_gname(). Returns a hallucinated deity name when the hero
// is hallucinating, otherwise falls back to align_gname(). The hallucinated
// path uses rn2_on_display_rng and randrole, which are unported.
export function halu_gname(alignment, state = game) {
    // Hallucination branch uses display RNG — unported.
    return align_gname(alignment, state);
}

// C ref: pray.c u_gname(). The name of the hero's own deity.
export function u_gname(state = game) {
    return align_gname(state.u.ualign.type, state);
}

// C ref: pray.c blocked_boulder() (2677-2719). Whether a boulder pile one step
// away in direction (dx, dy) cannot be pushed. stuck_in_wall() is the only
// caller, and it evaluates isok(u.ux + dx, u.uy + dy) first, so the object
// chain read below is always in bounds even though C checks nothing here.
function blocked_boulder(dx, dy, state) {
    let count = 0;

    for (let otmp = state.level.objects[state.u.ux + dx][state.u.uy + dy];
        otmp;
        otmp = otmp.nexthere) {
        if (otmp.otyp === BOULDER) count += otmp.quan;
    }

    /* next spot beyond boulder(s) */
    const nx = state.u.ux + 2 * dx;
    const ny = state.u.uy + 2 * dy;
    switch (count) {
    case 0:
        /* no boulders--not blocked */
        return false;
    case 1:
        /* possibly blocked depending on if it's pushable */
        break;
    case 2:
        /* this is only approximate since multiple boulders might sink */
        if (is_pool_or_lava(nx, ny, state)) /* does its own isok() check */
            break; /* still need Sokoban check below */
        /* FALLTHRU */
    default:
        /* more than one boulder--blocked after they push the top one;
           don't force them to push it first to find out */
        return true;
    }

    /* can't push boulder diagonally in Sokoban */
    if (dx && dy && state.level.flags?.sokoban_rules) return true;
    if (!isok(nx, ny)) return true;
    if (IS_OBSTRUCTED(state.level.at(nx, ny).typ)) return true;
    if (sobj_at(BOULDER, nx, ny, state)) return true;

    return false;
}
