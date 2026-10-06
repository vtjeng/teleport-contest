// Monster-versus-monster attacks.
// C ref: mhitm.c -- noises(), pre_mm_attack(), missmm(), mattackm(),
// failed_grab(), hitmm(), mdamagem() and passivemm(). The unported neighbours
// are named where the arm that needs them refuses.

import {
    ACID_RES,
    ANTIMAGIC,
    ARTICLE_A,
    NO_NC_FLAGS,
    POLY_NOFLAGS,
    RLOC_MSG,
    SUPPRESS_NAME,
    SUPPRESS_IT,
    SUPPRESS_INVISIBLE,
    TELL,
    UNCHANGING,
    XKILL_GIVEMSG,
    XKILL_NOCORPSE,
    COLD_RES,
    CONFLICT,
    DEAF,
    ERODE_CORRODE,
    FIRE_RES,
    engulfing_u,
    IRONBARS,
    IS_OBSTRUCTED,
    IS_TREE,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    M_AP_TYPE,
    M_ATTK_AGR_DIED,
    M_ATTK_AGR_DONE,
    M_ATTK_DEF_DIED,
    M_ATTK_HIT,
    M_ATTK_MISS,
    M_AP_NOTHING,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    NC_SHOW_MSG,
    NATTK,
    NORMAL_SPEED,
    PASSES_WALLS,
    SHOCK_RES,
    SLEEP_RES,
    STONE_RES,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    helpless,
    ismnum,
} from './const.js';
import {
    Adjmonnam,
    capitalizedMonsterName,
    hliquid,
    Monnam,
    mon_nam,
    mon_nam_too,
    monsterPossessive,
    some_mon_nam,
    x_monnam,
} from './do_name.js';
import { game } from './gstate.js';
import {
    dist2,
    distmin,
    s_suffix,
    truncateByteString,
} from './hacklib.js';
import { grow_up } from './makemon.js';
import { could_seduce, getmattk, mtrapped_in_pit } from './mhitu.js';
import {
    golemeffects,
    healmon,
    mon_givit,
    mon_offmap,
    monkilled,
    mon_to_stone,
    monstone,
    newcham,
    pm_to_cham,
    shieldeff_mon,
    xkilled,
    set_ustuck,
    unstuck,
    zombie_maker,
    zombie_form,
    seemimic,
} from './mon.js';
import {
    is_elf,
    can_teleport,
    resists_magm,
    is_rider,
    is_whirly,
    is_orc,
    mon_hates_silver,
    mhis,
    passes_walls,
    resist_conflict,
    sticks,
    touch_petrifies,
    unsolid,
    Resists_Elem,
    poly_when_stoned,
    defended,
    haseyes,
    perceives,
    resists_blnd,
    slimeproof,
    stagger,
} from './mondata.js';
import { closed_door, itsstuck, monnear, youHear } from './monmove.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import { update_monster_region } from './region.js';
import {
    AD_ACID,
    AD_RBRE,
    AD_DGST,
    AD_DRIN,
    AD_ENCH,
    AD_STCK,
    AD_WRAP,
    AT_BITE,
    AT_BREA,
    AT_BOOM,
    AT_BUTT,
    AT_CLAW,
    AT_ENGL,
    AT_EXPL,
    AT_GAZE,
    AT_HUGS,
    AT_KICK,
    AT_MAGC,
    AT_NONE,
    AT_SPIT,
    AT_STNG,
    AT_TENT,
    AT_TUCH,
    AT_WEAP,
    AD_COLD,
    AD_ELEC,
    AD_FIRE,
    AD_SLEE,
    AD_PLYS,
    AD_STUN,
    MZ_HUGE,
    NON_PM,
    PM_GRID_BUG,
    PM_ARCHON,
    PM_FLOATING_EYE,
    PM_GREEN_SLIME,
    PM_MEDUSA,
    PM_NURSE,
    PM_WRAITH,
    S_MIMIC,
    S_TROLL,
} from './monsters.js';
import { ART_TROLLSBANE } from './artifacts.js';
import { objectType } from './obj.js';
import { SILVER, WAND_CLASS } from './objects.js';
import { makeplural } from './fruit.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';

import {
    erode_armor,
    mhitm_ad_blnd,
    mhitm_adtyping,
    mhitm_knockback,
    shade_miss,
} from './uhitm.js';
import { cansee, unblock_point } from './vision.js';
import { breamm, spitmm, thrwmm } from './mthrowu.js';
import { possibly_unwield } from './weapon.js';
import { find_mac, which_armor } from './worn.js';
import { finish_meating } from './dogmove.js';
import { place_worm_tail_randomly, remove_worm } from './worm.js';
import { newsym, flush_screen, shieldeff } from './display.js';
import { mon_explodes } from './explode.js';
import { drain_item, resist } from './zap.js';
import { ttyPline } from './tty_message.js';
import { canseemon, canspotmon } from './display.js';
import { mon_reflects } from './muse.js';
import { split_mon } from './potion.js';
import { messageAt } from './startup_a11y.js';
import { note_unported } from './unported.js';
import { polyself } from './polyself.js';
import { rloc, tele, tele_restrict } from './teleport.js';

// C ref: mhitm.c attk_protection() (1475-1518). Return the worn-item mask
// that protects a target from the attack type. This is a pure source helper;
// special attacks need no defense, hand attacks need gloves/feet/helmet, and
// the remaining contact attacks have no available protection.
export function attk_protection(aatyp) {
    switch (aatyp) {
    case AT_NONE:
    case AT_SPIT:
    case AT_EXPL:
    case AT_BOOM:
        case AT_GAZE:
    case AT_BREA:
    case AT_MAGC:
        return ~0;
    case AT_CLAW:
    case AT_TUCH:
    case AT_WEAP:
        return W_ARMG;
    case AT_KICK:
        return W_ARMF;
    case AT_BUTT:
        return W_ARMH;
    case AT_HUGS:
        return W_ARMC | W_ARMG;
    case AT_BITE:
    case AT_STNG:
    case AT_ENGL:
    case AT_TENT:
    default:
        return 0;
    }
}

// C ref: mhitm.c paralyze_monst() (1210-1219). A passive gaze/cube attack
// writes all four fields together and has no return value. Keep this small
// state owner beside its C source rather than dropping the mutation at the
// passiveum call site.
export function paralyze_monst(mon, amount) {
    const amt = Math.min(amount, 127);
    mon.mcanmove = false;
    mon.mfrozen = amt;
    mon.meating = 0;
    mon.mstrategy = (mon.mstrategy ?? 0) & ~STRAT_WAITFORU;
}

// C ref: mhitm.c sleep_monst() (1221-1245). zap.c discards its boolean
// result while trap_effects consumes it; the state transition remains owned
// by this source module.
export async function sleep_monst(mtmp, amount, how, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2 };
    // C reveals a furniture/object mimic before applying the resistance test;
    // this happens even when the monster is already helpless.
    if (how >= 0 && !mtmp.msleeping && !mtmp.mfrozen
        && mtmp.data?.mlet === S_MIMIC
        && (M_AP_TYPE(mtmp) === M_AP_FURNITURE
            || M_AP_TYPE(mtmp) === M_AP_OBJECT)) {
        seemimic(mtmp, state, env);
    }
    let resisted = Resists_Elem(mtmp, SLEEP_RES, state)
        || defended(mtmp, AD_SLEE, state);
    if (!resisted && how >= 0) {
        resisted = await resist(mtmp, how, 0, false, state, random);
    }
    if (resisted) {
        await shieldeff(mtmp.mx, mtmp.my, state);
        return false;
    }
    if (!mtmp.mcanmove) return false;
    finish_meating(mtmp, { state, redraw: env.redraw });
    amount += mtmp.mfrozen ?? 0;
    if (amount > 0) {
        mtmp.mcanmove = false;
        mtmp.mfrozen = Math.min(amount, 127);
    } else {
        mtmp.msleeping = true;
    }
    return true;
}

// C ref: mhitm.c slept_monst() (1250-1258). Sleep that leaves a grabber
// helpless releases the hero after the source's visible grip message.
export async function slept_monst(mtmp, env = {}) {
    const state = env.state ?? game;
    if (!helpless(mtmp) || mtmp !== state.u?.ustuck
        || sticks(state.youmonst?.data) || state.u?.uswallow)
        return;
    const message = env.message
        ?? (env.planning ? async () => {} : ttyPline);
    const name = Monnam(mtmp, state);
    await message(`${s_suffix(name)} grip relaxes.`, state, env);
    await unstuck(mtmp, state, env);
}

// The operations mhitm.c reaches that this file cannot import: the caller owns
// the terminal and the fail-closed boundary its own segment stops on.
function requireAttackOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`mattackm requires a ${name} operation`);
    return operation;
}

function attackEnv(rawEnv) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { d, rn2, rnd };
    for (const name of ['d', 'rn2', 'rnd']) {
        if (typeof random[name] !== 'function')
            throw new TypeError(`mattackm random injection requires ${name}`);
    }
    return { ...rawEnv, state, random };
}

// C ref: youprop.h:218 Conflict, `(HConflict || EConflict)`, over the hero's
// CONFLICT property. Two disjuncts and no blocking term: youprop.h gives a
// `blocked` alias to BLINDED, CLAIRVOYANT, INVIS, STEALTH, LEVITATION and
// FLYING alone, so no C path sets it for CONFLICT. mhitm.c reads Conflict
// once, in the cockatrice-instinct test at 436.
function Conflict(state) {
    const conflict = state.u?.uprops?.[CONFLICT];
    return Boolean(conflict?.intrinsic || conflict?.extrinsic);
}

// C ref: youprop.h:125 Deaf, `HDeaf || EDeaf || u.uroleplay.deaf`. Three
// disjuncts and no blocking term: the third is the deaf conduct, which only
// `OPTIONS=roleplay:deaf` sets and nothing clears. js/dothrow.js, js/sit.js
// and js/sounds.js each keep their own copy of this one-line macro beside the
// call that reads it, as C does.
function Deaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(deafness?.intrinsic || deafness?.extrinsic
        || state.u?.uroleplay?.deaf);
}

// C ref: mhitm.c noises() (26-38). What the hero hears when a fight he cannot
// see happens near enough. gf.far_noise and gn.noisetime rate-limit the line
// to one per ten moves at each distance band; decl.c starts the first at FALSE
// and the second at 0, and neither appears in save.c, so they live on the game
// state rather than in `input.storage`, as js/mhitu.js's `gh` pair does.
//
// The two gates are separate. This one asks whether the hero is deaf and, when
// he is not, spends the rate limit; You_hear() then decides independently
// whether the line reaches the screen and how it is worded. A run that fails
// only the second still writes both fields, as C does.
async function noises(magr, mattk, env) {
    const { state } = env;
    const message = requireAttackOperation(env, 'message');
    /* hack.h mdistu(): distu() applied to the monster's own square */
    const farq = dist2(magr.mx, magr.my, state.u.ux, state.u.uy) > 15;

    state.gf ??= {};
    /* decl.c:341 starts gf.far_noise at FALSE, and :555 gn.noisetime at 0.
       Without the first default the comparison below is against undefined,
       which neither distance band equals, so the near band would speak on the
       first unseen fight of a game where C stays quiet. */
    state.gf.far_noise ??= false;
    state.gn ??= {};
    state.gn.noisetime ??= 0;
    if (!Deaf(state)
        && (farq !== state.gf.far_noise
            || state.moves - state.gn.noisetime > 10)) {
        state.gf.far_noise = farq;
        state.gn.noisetime = state.moves;
        /* pline.c You_hear() owns the acoustics gate and the Underwater and
           Unaware prefixes, and C reaches all three from here. */
        const heard = youHear(
            `${mattk.aatyp === AT_EXPL ? 'an explosion' : 'some noises'}`
            + `${farq ? ' in the distance' : ''}.`,
            state,
        );
        if (heard) await message(heard, state);
    }
}

// C ref: mhitm.c pre_mm_attack() (40-73). "unhiding or unmimicking happens
// even if hero can't see it because the formerly concealed monster is now in
// action".
//
// Two arms refuse. A mimic on either side needs mon.c seemimic(), which writes
// to the map and prints nothing, so the stop sits exactly where C's branch
// begins.
//
// Both mundetected clears are ported, and only the aggressor's runs. A hidden
// defender stops mattackm() at its own :337-359 block, well above the call
// that arrives here, so `mdef.mundetected` is 0 on every path that reaches
// this function. The clear is written because C writes it.
//
// The marker write goes through the `markInvisible` seam for the same reason
// `redraw` does. Both write the live map: newsym() paints the module-global
// game, and display.c map_invisible() writes map memory and then paints
// through show_glyph_cell(), which reads that same global. The once-per-turn
// planning scan reaches this function -- js/unported_monster_actions.js
// preflightSimpleMonsterActions() runs moveSimplePet() with `planning: true`,
// and a pet's blow arrives here through dogmove.c dog_move() -- and its clone
// shares the live level's cells, so a dry run marking a square would leave a
// remembered 'I' and a painted cell behind in a game the scan may still refuse.
// The scan binds both seams to no-ops and replays the turn live afterwards.
function pre_mm_attack(magr, mdef, env) {
    const { state } = env;
    const unsupported = requireAttackOperation(env, 'unsupported');
    const redraw = requireAttackOperation(env, 'redraw');
    const markInvisible = requireAttackOperation(env, 'markInvisible');
    let showit = false;

    if (M_AP_TYPE(mdef)) {
        unsupported('a disguised monster being attacked');
    } else if (mdef.mundetected) {
        mdef.mundetected = 0;
        showit ||= state.gv.vis;
    }
    if (M_AP_TYPE(magr)) {
        unsupported('a disguised monster attacking');
    } else if (magr.mundetected) {
        magr.mundetected = 0;
        showit ||= state.gv.vis;
    }

    if (state.gv.vis) {
        // C's `if/else if` per participant: a marker write and a redraw are
        // mutually exclusive, so a monster the hero cannot spot is marked and
        // not redrawn even when showit is set.
        if (!canspotmon(magr, state))
            markInvisible(magr.mx, magr.my);
        else if (showit) redraw(magr.mx, magr.my);
        if (!canspotmon(mdef, state))
            markInvisible(mdef.mx, mdef.my);
        else if (showit) redraw(mdef.mx, mdef.my);
    }
}

// C ref: mhitm.c missmm() (74-93). "feedback for when a monster-vs-monster
// attack misses".
//
// could_seduce() answers 0 for ordinary physical attacks and can answer 1 or 2
// for a nymph's item-theft or seduction attack. C's whole expression is kept
// so the call happens where C makes it.
async function missmm(magr, mdef, mattk, env) {
    const { state } = env;
    const message = requireAttackOperation(env, 'message');

    pre_mm_attack(magr, mdef, env);

    if (state.gv.vis) {
        await message(
            `${capitalizedMonsterName(magr, state)} `
            + `${(magr.mcan || !could_seduce(magr, mdef, mattk, env))
                ? 'misses' : 'pretends to be friendly to'} `
            + `${mon_nam_too(mdef, magr, state, env)}.`,
            state,
        );
    } else {
        await noises(magr, mattk, env);
    }
}

// C ref: mhitm.c fightm() (106-169). Walk the live monster list in source
// order, selecting the first living adjacent target. mattackm() owns the
// ordinary physical attack and returns C's result bitmask; this function owns
// the Conflict bookkeeping and the source-ordered retaliation draws.
export async function fightm(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rnd };
    if (typeof random.rnd !== 'function')
        throw new TypeError('fightm random injection requires rnd');
    const env = { ...rawEnv, state, random };

    /* perhaps the monster will resist Conflict */
    if (resist_conflict(mtmp, state, random))
        return 0;

    if (state.u?.ustuck === mtmp) {
        /* perhaps we're holding it... */
        if (await itsstuck(mtmp, env)) return 0;
    }
    const hasUSwallowed = engulfing_u(mtmp, state);

    for (let mon = state.level?.monlist ?? null; mon;) {
        let next = mon.nmon;
        if (next === mtmp) next = mtmp.nmon;

        /* DEADMONSTER() is tested before the list is cleaned up. */
        if (mon !== mtmp && mon.mhp >= 1
            && monnear(mtmp, mon.mx, mon.my, state)) {
            if (!state.u?.uswallow && mtmp === state.u?.ustuck) {
                if (!random.rn2(4)) {
                    set_ustuck(null, state);
                    const message = requireAttackOperation(env, 'message');
                    await message(
                        `${capitalizedMonsterName(mtmp, state)} releases you!`,
                        state,
                    );
                } else {
                    break;
                }
            }

            state.gb ??= {};
            state.gb.bhitpos = { x: mon.mx, y: mon.my };
            state.gn ??= {};
            state.gn.notonhead = false;
            const result = await mattackm(mtmp, mon, env);

            if (result & M_ATTK_AGR_DIED) return 1;
            if (hasUSwallowed) return 0;

            /* Allow the attacked monster a chance to hit back. */
            if ((result & (M_ATTK_HIT | M_ATTK_DEF_DIED)) === M_ATTK_HIT
                && random.rn2(4)
                && mon.movement > random.rn2(NORMAL_SPEED)) {
                if (mon.movement > NORMAL_SPEED)
                    mon.movement -= NORMAL_SPEED;
                else
                    mon.movement = 0;
                state.gb.bhitpos = { x: mtmp.mx, y: mtmp.my };
                state.gn.notonhead = false;
                await mattackm(mon, mtmp, env);
            }

            return (result & M_ATTK_HIT) ? 1 : 0;
        }
        mon = next;
    }
    return 0;
}

/*
 *  mattackm() -- a monster attacks another monster.
 *
 *  Returns the same bitmask C documents at mhitm.c:274-283:
 *      0x4 M_ATTK_AGR_DIED, 0x2 M_ATTK_DEF_DIED, 0x1 M_ATTK_HIT,
 *      0x0 M_ATTK_MISS.
 *
 *  Attacker has targeted <bhitpos.x,bhitpos.y> rather than
 *  <mdef->mx,mdef->my>; matters for long worms.
 */
// C ref: mhitm.c mdisplacem() (180-288).  A monster displacement is a
// movement result, not an attack approximation: C gives the defender's
// hidden/mimic/eating state its own cleanup, performs the stoning contact
// check before swapping either map square, then updates both region caches.
// The return mask is consumed by monmove.c m_move(), so every result-bearing
// arm stays here rather than being represented by note_unported().
export async function mdisplacem(magr, mdef, quietly = false, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { d, rn1, rn2, rnd, rne, rnz };
    // The planning scan passes only { state, random, planning }.  Every
    // display seam below therefore needs an explicit planning no-op; falling
    // back to ttyPline/newsym would write the live terminal while the clone
    // is still being considered.  Live callers retain their injected seams.
    const planning = Boolean(rawEnv.planning);
    const message = planning ? async () => {} : (rawEnv.message ?? ttyPline);
    const redraw = planning ? () => {} : (rawEnv.redraw ?? newsym);
    const flush = planning ? async () => {} : (rawEnv.flushScreen ?? flush_screen);
    const unblockPoint = rawEnv.unblockPoint ?? ((x, y, targetState) => {
        if (planning && typeof rawEnv.admitPlannedVisionChange === 'function')
            rawEnv.admitPlannedVisionChange(x, y, targetState);
        unblock_point(x, y, targetState);
    });
    const operationEnv = {
        ...rawEnv,
        state,
        random,
        planning,
        message,
        redraw,
        flushScreen: flush,
        newsym: redraw,
        unblockPoint,
        hooks: {
            ...(rawEnv.hooks ?? {}),
            newsym: redraw,
        },
    };

    if (!magr || !mdef || magr === mdef) return M_ATTK_MISS;
    const pa = magr.data;
    const pd = mdef.data;
    const tx = mdef.mx;
    const ty = mdef.my;
    const fx = magr.mx;
    const fy = magr.my;
    if (m_at(fx, fy, state) !== magr || m_at(tx, ty, state) !== mdef)
        return M_ATTK_MISS;

    // C's displacement has the same 1-in-7 failure chance as do_attack().
    if (!random.rn2(7)) return M_ATTK_MISS;
    if (pa?.pmidx === PM_GRID_BUG && fx !== tx && fy !== ty)
        return M_ATTK_MISS;

    if (mdef.mundetected) mdef.mundetected = 0;
    if (M_AP_TYPE(mdef) && M_AP_TYPE(mdef) !== M_AP_MONSTER)
        seemimic(mdef, state, operationEnv);
    mdef.msleeping = 0;
    mdef.mstrategy = (mdef.mstrategy ?? 0) & ~STRAT_WAITMASK;
    finish_meating(mdef, operationEnv);

    state.gv ??= {};
    state.gv.vis = canspotmon(magr, state) && canspotmon(mdef, state);

    // monst.h resists_ston() is the monster's STONE_RES bitset.  which_armor
    // is source-owned by worn.c and checks the monster's worn inventory.
    if (touch_petrifies(pd)
        && !Resists_Elem(magr, STONE_RES, state)
        && !which_armor(magr, W_ARMG, state)) {
        if (poly_when_stoned(pa, state)) {
            await mon_to_stone(magr, state, {
                ...operationEnv,
                message,
            });
            return M_ATTK_HIT;
        }
        if (!quietly && canspotmon(magr, state)) {
            if (state.gv.vis) {
                await message(
                    `${Monnam(magr, state)} tries to move ${mon_nam(mdef, state)}`
                        + ` out of ${is_rider(pa) ? 'the' : mhis(magr, {
                            ...rawEnv,
                            state,
                            canSpotMonster: rawEnv.canSpotMonster ?? canspotmon,
                        })} way.`,
                    state,
                    rawEnv,
                );
            }
            await message(
                `${Monnam(magr, state)} turns to stone!`,
                state,
                rawEnv,
            );
        }
        await monstone(magr, state, { ...operationEnv, message });
        if (magr.mhp >= 1) return M_ATTK_HIT;
        if (magr.mtame && !state.gv.vis && !planning)
            await message('You have a peculiarly sad feeling for a moment, then it passes.', state, operationEnv);
        return M_ATTK_AGR_DIED;
    }

    remove_monster(fx, fy, state);
    if (mdef.wormno) {
        remove_worm(mdef, operationEnv);
    } else {
        remove_monster(tx, ty, state);
    }
    place_monster(magr, tx, ty, state);
    place_monster(mdef, fx, fy, state);
    if (mdef.wormno) {
        place_worm_tail_randomly(mdef, fx, fy, operationEnv);
    }
    update_monster_region(magr, state);
    update_monster_region(mdef, state);

    if (state.gv.vis && !quietly && !planning) {
        await message(
            `${Monnam(magr, state)} moves ${mon_nam(mdef, state)}`
                + ` out of ${is_rider(pa) ? 'the' : mhis(magr, {
                    ...rawEnv,
                    state,
                    canSpotMonster: rawEnv.canSpotMonster ?? canspotmon,
                })} way!`,
            state,
            rawEnv,
        );
    }
    if (!planning) {
        redraw(fx, fy, state);
        redraw(tx, ty, state);
        await flush(0, state);
    }
    return M_ATTK_HIT;
}

// C ref: mhitm.c mattackm() (292-577).
//
// The physical melee group is ported: AT_CLAW, AT_KICK, AT_BITE, AT_STNG,
// AT_TUCH, AT_BUTT and AT_TENT, with their dieroll = rnd(20 + i), hitmm(),
// missmm() and the passivemm() that follows every one of them. So is the
// `default` arm, which is where an empty AT_NONE slot lands and where C
// clears `attk` so passivemm() is skipped.
//
// The remaining unsupported arms stop at the `case` label so the boundary
// sits where C's unported branch begins:
//
//   AT_WEAP  the adjacent empty-handed arm ports mon_wield_item()'s zero-result
//            path and possibly_unwield()'s null-MON_WEP return before falling
//            through to the physical group below it. The distant half still
//            needs mthrowu.c thrwmm(), and a selected/current weapon still
//            needs mswingsm() and hitval().
//   AT_GAZE  gazemm().
//   AT_EXPL  explmm().
//   AT_ENGL  gulpmm().
//   AT_BREA and AT_SPIT  breamm() and spitmm().
//
// `strike` is C's, declared once above the loop and never re-initialized
// inside it, and every arm that reaches passivemm() assigns it in the same
// iteration. A `continue` cannot carry the previous slot's answer down,
// because it skips the passivemm() call at the foot of the loop, and C's
// AT_HUGS arm assigns `strike` before it tests it. The declaration stays where
// C puts it rather than moving inside the loop.
export async function mattackm(magr, mdef, rawEnv = {}) {
    const env = attackEnv(rawEnv);
    const { state, random } = env;
    const unsupported = requireAttackOperation(env, 'unsupported');
    let strike = 0; /* hit this attack */
    let struck = 0; /* hit at least once */
    const res = new Array(NATTK).fill(M_ATTK_MISS);
    let dieroll = 0;

    if (!magr || !mdef) return M_ATTK_MISS; /* mike@genat */
    if (helpless(magr)) return M_ATTK_MISS;
    const pa = magr.data;
    const pd = mdef.data;

    /* Grid bugs cannot attack at an angle. */
    if (pa === state.mons[PM_GRID_BUG] && magr.mx !== mdef.mx
        && magr.my !== mdef.my)
        return M_ATTK_MISS;

    /* Calculate the armour class differential. */
    let tmp = find_mac(mdef, state) + magr.m_lev;
    if (mdef.mconf || helpless(mdef)) {
        tmp += 4;
        mdef.msleeping = 0;
    }

    /* mundetected monsters become un-hidden if they are attacked */
    if (mdef.mundetected) {
        // C clears the flag, repaints and may print one of four lines through
        // noname_monnam(), makeplural(), a_monnam() or mon_nam(). Every one
        // needs display.c sensemon(), which has no port, and the fourth also
        // needs gl.last_hider, which nothing here writes.
        unsupported('a hidden monster noticed as it is attacked');
    }

    /* Elves hate orcs. */
    if (is_elf(pa) && is_orc(pd)) tmp++;

    /* Set up the visibility of action */
    state.gv ??= {};
    state.gv.vis = (cansee(magr.mx, magr.my, state) && canspotmon(magr, state))
        || (cansee(mdef.mx, mdef.my, state) && canspotmon(mdef, state));

    /* Set flag indicating monster has moved this turn. */
    magr.mlstmv = state.moves;

    /* controls whether a mind flayer uses all of its tentacle-for-DRIN
       attacks */
    state.gs ??= {};
    state.gs.skipdrin = false;

    /* Now perform all attacks for the monster. */
    for (let i = 0; i < NATTK; i++) {
        res[i] = M_ATTK_MISS;

        /* target might no longer be there */
        if (i > 0 && (m_at(state.gb.bhitpos.x, state.gb.bhitpos.y, state) !== mdef
                      || magr.mhp < 1 || mdef.mhp < 1))
            continue;

        const mattk = getmattk(magr, mdef, i, res, env);
        if (state.gs.skipdrin && mattk.aatyp === AT_TENT
            && mattk.adtyp === AD_DRIN)
            continue;
        let mwep = null; /* MON_WEP() is read only under AT_WEAP */
        let attk = 1;

        switch (mattk.aatyp) {
        case AT_WEAP: /* "hand to hand" attacks */
            if (distmin(magr.mx, magr.my, mdef.mx, mdef.my) > 1) {
                /* D: Do a ranged attack here! */
                strike = (await thrwmm(magr, mdef, env) === M_ATTK_MISS)
                         ? 0 : 1;
                if (strike)
                    /* don't really know if we hit or not; pretend we did */
                    res[i] |= M_ATTK_HIT;
                if (mdef.mhp < 1) /* DEADMONSTER */
                    res[i] = M_ATTK_DEF_DIED;
                if (magr.mhp < 1) /* DEADMONSTER */
                    res[i] |= M_ATTK_AGR_DIED;
                break;
            }
            if (magr.weapon_check === NEED_WEAPON || !magr.mw) {
                magr.weapon_check = NEED_HTH_WEAPON;
                const wieldMonsterItem = requireAttackOperation(
                    env,
                    'wieldMonsterItemAgainstMonster',
                );
                if (await wieldMonsterItem(magr, env) !== 0)
                    return M_ATTK_MISS;
            }
            // weapon.c mon_wield_item() returns 0 for the goblin's empty
            // inventory after setting NEED_WEAPON. C then calls
            // possibly_unwield() even though MON_WEP() is null; that is an
            // intentional no-op and the AT_WEAP arm falls through.
            possibly_unwield(magr, false, env);
            mwep = magr.mw ?? null;
            if (mwep)
                unsupported('an armed monster attacking another monster');
            /* FALLTHRU: C's empty-handed AT_WEAP arm joins the physical group. */

        case AT_CLAW:
        case AT_KICK:
        case AT_BITE:
        case AT_STNG:
        case AT_TUCH:
        case AT_BUTT:
        case AT_TENT:
            if (mattk.aatyp === AT_KICK && mtrapped_in_pit(magr, state))
                continue;
            /* Nymph that teleported away on first attack? */
            if (distmin(magr.mx, magr.my, mdef.mx, mdef.my) > 1)
                /* Continue because the monster may have a ranged attack. */
                continue;
            /* Monsters won't attack cockatrices physically if they
             * have a weapon instead. This instinct doesn't work for
             * players, or under conflict or confusion. */
            // `mwep` is null on every path this arm admits, so the whole
            // condition is FALSE and no test can separate its operators. It
            // is translated rather than dropped because the AT_WEAP arm that
            // supplies a weapon is a refusal rather than a gap.
            if (!magr.mconf && !Conflict(state) && mwep
                && mattk.aatyp !== AT_WEAP && touch_petrifies(mdef.data)) {
                strike = 0;
                break;
            }
            dieroll = random.rnd(20 + i);
            strike = (tmp > dieroll) ? 1 : 0;
            /* KMH -- don't accumulate to-hit bonuses */
            /* C's `if (mwep) tmp -= hitval(mwep, mdef);` needs a weapon this
               arm cannot have: only AT_WEAP sets mwep, and that case refuses
               above. */
            if (strike) {
                /* for eel AT_TUCH+AD_WRAP attack: can't grab an unsolid
                   target; the unsolid test is redundant since failed_grab
                   checks it too, but is cheap and avoids calling failed_grab
                   for ordinary targets */
                if (unsolid(mdef.data)
                    && await failed_grab(magr, mdef, mattk, env)) {
                    strike = 0;
                    break;
                }
                res[i] = await hitmm(magr, mdef, mattk, mwep, dieroll, env);
                /* C's pudding-splitting block at 447-464 asks next whether
                   `mwep` is iron or metal. That conjunct is FALSE for every
                   attack this arm admits, because only the refused AT_WEAP
                   case can set a weapon, so clone_mon() is unreachable. */
            } else {
                await missmm(magr, mdef, mattk, env);
            }
            break;

        case AT_HUGS: /* automatic if prev two attacks succeed */
            strike = i >= 2 && res[i - 1] === M_ATTK_HIT
                && res[i - 2] === M_ATTK_HIT;
            if (strike) {
                if (await failed_grab(magr, mdef, mattk, env)) {
                    strike = 0;
                } else {
                    res[i] = await hitmm(
                        magr, mdef, mattk, null, 0, env,
                    );
                }
            }
            break;

        case AT_GAZE:
            strike = 0;
            res[i] = await gazemm(magr, mdef, mattk, env);
            break;

        case AT_EXPL:
            if (distmin(magr.mx, magr.my, mdef.mx, mdef.my) > 1)
                continue;

            res[i] = await explmm(magr, mdef, mattk, env);
            if (res[i] === M_ATTK_MISS) {
                strike = 0;
                attk = 0;
            } else {
                strike = 1;
            }
            break;

        case AT_ENGL:
            unsupported('a monster engulfing another monster');
            break;

        case AT_BREA:
        case AT_SPIT:
            /* Ranged attacks aren't allowed at point blank range. */
            if (!monnear(magr, mdef.mx, mdef.my)) {
                const mmtmp = ((mattk.aatyp === AT_BREA)
                             ? await breamm(magr, mattk, mdef, env)
                             : await spitmm(magr, mattk, mdef, env));

                strike = (mmtmp === M_ATTK_MISS) ? 0 : 1;
                /* We don't really know if we hit or not; pretend we did. */
                if (strike)
                    res[i] |= M_ATTK_HIT;
                if (mdef.mhp < 1) /* DEADMONSTER */
                    res[i] = M_ATTK_DEF_DIED;
                if (magr.mhp < 1) /* DEADMONSTER */
                    res[i] |= M_ATTK_AGR_DIED;
            } else {
                strike = 0;
                attk = 0;
            }
            break;

        default: /* no attack */
            strike = 0;
            attk = 0;
            break;
        }

        if (attk && !(res[i] & M_ATTK_AGR_DIED)
            && distmin(magr.mx, magr.my, mdef.mx, mdef.my) <= 1) {
            res[i] = await passivemm(magr, mdef, Boolean(strike),
                                     (res[i] & M_ATTK_DEF_DIED), mwep, env);
        }

        if (res[i] & M_ATTK_DEF_DIED) return res[i];
        if (res[i] & M_ATTK_AGR_DIED) return res[i];
        /* return if aggressor can no longer attack */
        if ((res[i] & M_ATTK_AGR_DONE) || helpless(magr)) return res[i];
        /* eg. defender was knocked into a level teleport trap */
        if (mon_offmap(mdef)) return res[i];
        if (res[i] & M_ATTK_HIT) struck = 1; /* at least one hit */
    } /* for (;i < NATTK;) loop */

    return struck ? M_ATTK_HIT : M_ATTK_MISS;
}

// C ref: mhitm.c explmm() (970-1009). An elemental blast uses the common
// monster explosion path; other explosion attacks use the returned
// mdamagem() flags before the aggressor's separate death/lifesaving step.
async function explmm(magr, mdef, mattk, env) {
    const { state } = env;
    const message = requireAttackOperation(env, 'message');

    if (magr.mcan) return M_ATTK_MISS;

    if (cansee(magr.mx, magr.my, state)) {
        const text = `${Monnam(magr, state, env)} explodes!`;
        await message(messageAt(text, magr.mx, magr.my, state), state, env);
    } else {
        await noises(magr, mattk, env);
    }

    let result;
    if (mattk.adtyp === AD_FIRE || mattk.adtyp === AD_COLD
        || mattk.adtyp === AD_ELEC) {
        await mon_explodes(magr, mattk, state, env);
        // C marks the aggressor dead even if explosion damage was lifesaved.
        result = M_ATTK_AGR_DIED
            | (mdef.mhp < 1 ? M_ATTK_DEF_DIED : 0);
    } else {
        result = await mdamagem(magr, mdef, mattk, null, 0, env);
    }

    if (!(result & M_ATTK_AGR_DIED)) {
        const wasLeashed = Boolean(magr.mleashed);
        await mondead(magr, state, env);
        if (magr.mhp >= 1) return result; // C's aggressor lifesaving return.
        result |= M_ATTK_AGR_DIED;

        // mondead() suppresses m_unleash()'s slack line on this path.
        if (wasLeashed)
            await message('Your leash falls slack.', state, env);
    }

    if (magr.mtame)
        await message(
            'You have a melancholy feeling for a moment, then it passes.',
            state,
            env,
        );

    return result;
}

// C ref: mhitm.c failed_grab() (597-640). "can't hold an unsolid target
// (ghosts, lights, vortices, most elementals) or a long worm tail". The TRUE
// arm returns TRUE to suppress the hit, and prints only when gv.vis plus
// canspotmon(defender), or either combatant being the hero, permits output.
// It copies both names before formatting because C's suffix helpers share a
// static buffer; JavaScript strings preserve those copies directly.
//
// mattackm()'s ordinary contact arm skips this helper for a solid target, but
// its automatic AT_HUGS arm calls it after the preceding attacks succeed. That
// path can therefore use gn.notonhead to reject a solid long-worm tail.
//
// C declares this helper non-static for mhitu.c:808, :827 and :1305 and
// uhitm.c:5652, :5735 and :5779. Its asynchronous message result is awaited
// at every currently ported direct caller.
export async function failed_grab(magr, mdef, mattk, env = {}) {
    const state = env.state ?? game;
    const message = env.message ?? (env.planning ? async () => {}
        : ttyPline);
    const tailmiss = Boolean(state.gn?.notonhead);

    if ((unsolid(mdef.data) || tailmiss)
        /* hug attack: most holders (owlbear, python, pit fiend, &c);
           wrap damage: eel grabbing, trapper/lurker-above engulfing;
           stick-to damage: mimic, lichen;
           digestion damage: purple worm swallowing */
        && (mattk.aatyp === AT_HUGS || mattk.adtyp === AD_WRAP
            || mattk.adtyp === AD_STCK || mattk.adtyp === AD_DGST)) {
        if ((state.gv?.vis && canspotmon(mdef, state))
            || magr === state.youmonst || mdef === state.youmonst) {
            const magrnam = magr === state.youmonst
                ? 'Your' : s_suffix(Monnam(magr, state, env));
            const mdefnam = !tailmiss
                ? (mdef === state.youmonst
                    ? 'you' : mon_nam(mdef, state, env))
                : `${s_suffix(some_mon_nam(mdef, state, env))} tail`;
            const verb = mattk.adtyp === AD_DGST ? 'gulp'
                : mattk.adtyp === AD_STCK ? 'adhere' : 'grab';
            await message(
                `${truncateByteString(magrnam, 99)} ${verb} attempt `
                    + `${tailmiss ? 'fails to hold' : 'passes right through'} `
                    + `${truncateByteString(mdefnam, 99)}!`,
                state,
                env,
            );
        }
        return true;
    }
    return false;
}

// C ref: mhitm.c engulf_target() (805-845). The target must fit inside the
// engulfer, neither combatant may be trapped, and the two occupied squares
// must be places from which both combatants can later be separated. The hero
// half is the only one used by mhitu.c gulpmu() here; the monster half stays
// source-faithful because gulpmm() will eventually share this predicate.
export function engulf_target(magr, mdef, state = game) {
    const defenderIsHero = mdef === state.youmonst;
    const attackerIsHero = magr === state.youmonst;
    const defenderSize = mdef?.data?.msize;
    const attackerSize = magr?.data?.msize;

    if (defenderSize >= MZ_HUGE
        || (attackerSize < defenderSize && !is_whirly(magr?.data))) {
        return false;
    }
    if (mdef?.mtrapped || magr?.mtrapped) return false;

    const dx = defenderIsHero ? state.u?.ux : mdef?.mx;
    const dy = defenderIsHero ? state.u?.uy : mdef?.my;
    const defenderLocation = state.level?.at(dx, dy);
    const defenderPassesWalls = defenderIsHero
        ? Boolean(state.u?.uprops?.[PASSES_WALLS]?.intrinsic
            || state.u?.uprops?.[PASSES_WALLS]?.extrinsic)
        : passes_walls(mdef?.data);
    if (!defenderPassesWalls
        && (!defenderLocation
            || IS_OBSTRUCTED(defenderLocation.typ)
            || closed_door(dx, dy, state)
            || IS_TREE(defenderLocation.typ, state)
            || (defenderLocation.typ === IRONBARS
                && !is_whirly(magr?.data)))) {
        return false;
    }

    const ax = attackerIsHero ? state.u?.ux : magr?.mx;
    const ay = attackerIsHero ? state.u?.uy : magr?.my;
    const attackerLocation = state.level?.at(ax, ay);
    const attackerPassesWalls = attackerIsHero
        ? Boolean(state.u?.uprops?.[PASSES_WALLS]?.intrinsic
            || state.u?.uprops?.[PASSES_WALLS]?.extrinsic)
        : passes_walls(magr?.data);
    if (!attackerPassesWalls
        && (!attackerLocation
            || IS_OBSTRUCTED(attackerLocation.typ)
            || closed_door(ax, ay, state)
            || IS_TREE(attackerLocation.typ, state)
            || (attackerLocation.typ === IRONBARS
                && !is_whirly(mdef?.data)))) {
        return false;
    }

    return true;
}

// C ref: mhitm.c hitmm() (642-731). "Returns the result of mdamagem()."
//
// `weaponhit` and `silverhit` are C's, and both need a weapon: an AT_WEAP
// attack, which mattackm() refuses, or an AT_CLAW attacker holding one, which
// only that refused arm can set. They stay because the "%s hits" default arm
// reads `weaponhit` and would print nothing for an artifact.
async function hitmm(magr, mdef, mattk, mwep, dieroll, env) {
    const { state } = env;
    const unsupported = requireAttackOperation(env, 'unsupported');
    const message = requireAttackOperation(env, 'message');
    // Both need a weapon, which only the refused AT_WEAP arm can supply, so
    // both are constantly FALSE here: `weaponhit` selects the "%s hits"
    // default arm below and `silverhit` keeps the searing line out of reach.
    const weaponhit = mattk.aatyp === AT_WEAP
        || (mattk.aatyp === AT_CLAW && mwep);
    const silverhit = weaponhit && mwep
        && objectType(mwep, state).oc_material === SILVER;

    pre_mm_attack(magr, mdef, env);

    const compat = !magr.mcan ? could_seduce(magr, mdef, mattk, env) : 0;
    if (!compat && await shade_miss(magr, mdef, mwep, false, state.gv.vis,
                                    state, env))
        return M_ATTK_MISS; /* bypass mdamagem() */

    if (state.gv.vis) {
        const magr_name = capitalizedMonsterName(magr, state);
        let buf = '';

        if (compat) {
            // C uses the defender's mcansee flag to choose the verb and
            // compat's nymph gender result to choose the adverb.
            await message(
                `${magr_name} ${mdef.mcansee ? 'smiles at' : 'talks to'} `
                + `${mon_nam(mdef, state, env)} `
                + `${compat === 2 ? 'engagingly' : 'seductively'}.`,
                state,
            );
        } else {
            switch (mattk.aatyp) {
            case AT_BITE: buf = `${magr_name} bites`; break;
            case AT_STNG: buf = `${magr_name} stings`; break;
            case AT_BUTT: buf = `${magr_name} butts`; break;
            case AT_TUCH: buf = `${magr_name} touches`; break;
            case AT_TENT:
                buf = `${monsterPossessive(magr, state, true)} tentacles suck`;
                break;
            case AT_HUGS:
                if (magr !== state.u.ustuck) {
                    buf = `${magr_name} squeezes`;
                    break;
                }
                /* FALLTHRU */
            default:
                if (!weaponhit || !mwep || !mwep.oartifact)
                    buf = `${magr_name} hits`;
                break;
            }
            if (buf) {
                await message(
                    `${buf} ${mon_nam_too(mdef, magr, state, env)}.`,
                    state,
                );
            }

            if (mon_hates_silver(mdef) && silverhit) {
                // C's "%s %s sears %s!" needs objnam.c simpleonames() and the
                // "its own flesh" substitutions. Only a silver weapon reaches
                // it, and the AT_WEAP arm refuses ahead of that.
                unsupported('a silver weapon searing another monster');
            }
        }
    } else {
        await noises(magr, mattk, env);
    }

    return mdamagem(magr, mdef, mattk, mwep, dieroll, env);
}

// C ref: mhitm.c gazemm() (736-805). The gaze dispatch returns its own result,
// then mattackm() still passes the defender's passive slot using strike=FALSE.
// This deliberately keeps the gaze's hit result separate from the passive's
// return mask, as the C loop does.
async function gazemm(magr, mdef, mattk, env) {
    const { state } = env;
    const random = env.random;
    const message = requireAttackOperation(env, 'message');
    const archon = magr.data === state.mons?.[PM_ARCHON]
        && mattk.adtyp === AD_BLND;
    const altmesg = archon && !magr.mcansee;

    if (mdef.data?.mlet === S_MIMIC
        && M_AP_TYPE(mdef) !== M_AP_NOTHING) {
        seemimic(mdef, state, env);
    }
    mdef.mundetected = 0;

    if (state.gv?.vis) {
        const attacker = altmesg
            ? Adjmonnam(magr, 'blinded', state, env)
            : Monnam(magr, state, env);
        const target = canspotmon(mdef, state)
            ? mon_nam(mdef, state, env) : 'something';
        await message(`${attacker} gazes ${altmesg ? 'toward' : 'at'} ${target}...`, state);
    }

    if (magr.mcan || !mdef.mcansee
        || (archon ? resists_blnd(mdef, state) : !magr.mcansee)
        || (magr.minvis && !perceives(mdef.data))
        || mdef.msleeping) {
        if (state.gv?.vis && canspotmon(mdef, state))
            await message('but nothing happens.', state);
        return M_ATTK_MISS;
    }

    if (magr.data === state.mons?.[PM_MEDUSA]
        && await mon_reflects(mdef, null, state, env)) {
        if (canseemon(mdef, state)) {
            await mon_reflects(
                mdef,
                'The gaze is reflected away by %s %s.',
                state,
                env,
            );
        }
        if (mdef.mcansee) {
            if (await mon_reflects(magr, null, state, env)) {
                if (canseemon(magr, state)) {
                    await mon_reflects(
                        magr,
                        'The gaze is reflected away by %s %s.',
                        state,
                        env,
                    );
                }
                return M_ATTK_MISS;
            }
            if (mdef.minvis && !perceives(magr.data)) {
                if (canseemon(magr, state)) {
                    const pronounEnv = {
                        ...env,
                        state,
                        canSpotMonster: env.canSpotMonster ?? canspotmon,
                    };
                    await message(
                        `${Monnam(magr, state, env)} doesn't seem to notice `
                            + `that ${mhis(magr, pronounEnv)} gaze was reflected.`,
                        state,
                    );
                }
                return M_ATTK_MISS;
            }
            if (canseemon(magr, state)) {
                await message(
                    `${Monnam(magr, state, env)} is turned to stone!`,
                    state,
                );
            }
            await monstone(magr, state, env);
            if (magr.mhp >= 1) return M_ATTK_MISS;
            return M_ATTK_AGR_DIED;
        }
    } else if (archon) {
        await mhitm_ad_blnd(magr, mattk, mdef, null, state, env);
        // The radiance stun is independent of the blinding resistance result.
        if (random.rn2(2)) mdef.mstun = 1;
    }

    return mdamagem(magr, mdef, mattk, null, 0, env);
}

// C ref: mhitm.c mdamagem() (1014-1120). Apply attack-typed damage, the
// petrification contact guard, death bookkeeping, digestion effects and killer
// growth in the same order as the monster-versus-monster source.
async function mdamagem(magr, mdef, mattk, mwep, dieroll, env) {
    const { state, random } = env;
    const pd = mdef.data;
    const mhm = {
        damage: random.d(mattk.damn, mattk.damd),
        hitflags: M_ATTK_MISS,
        permdmg: 0,
        specialdmg: 0,
        dieroll,
        done: false,
    };

    if ((touch_petrifies(pd)
         || (mattk.adtyp === AD_DGST && pd === state.mons?.[PM_MEDUSA]))
        && !Resists_Elem(magr, STONE_RES, state)) {
        const protector = attk_protection(mattk.aatyp);
        let wornitems = magr.misc_worn_check ?? 0;
        if (mwep) wornitems |= W_ARMG; /* wielded weapon protects like gloves */
        if (protector === 0
            || (protector !== ~0 && (wornitems & protector) !== protector)) {
            if (poly_when_stoned(magr.data, state)) {
                await mon_to_stone(magr, state, env);
                return M_ATTK_HIT;
            }
            if (state.gv?.vis && canspotmon(magr, state)) {
                await requireAttackOperation(env, 'message')(
                    `${Monnam(magr, state, env)} turns to stone!`, state,
                );
            }
            await monstone(magr, state, env);
            if (magr.mhp >= 1) return M_ATTK_HIT;
            if (magr.mtame && !state.gv?.vis) {
                await requireAttackOperation(env, 'message')(
                    'You have a peculiarly sad feeling for a moment, then it passes.',
                    state,
                );
            }
            return M_ATTK_AGR_DIED;
        }
    }

    await mhitm_adtyping(magr, mattk, mdef, mhm, state, env);

    const knockFlags = { value: mhm.hitflags };
    const knocked = await mhitm_knockback(
        magr, mdef, mattk, knockFlags, Boolean(magr.mw), state, env, random,
    );
    mhm.hitflags = knockFlags.value;
    if (knocked
        && ((mhm.hitflags & (M_ATTK_DEF_DIED | M_ATTK_HIT)) !== 0
            || mon_offmap(mdef)))
        return mhm.hitflags;

    if (mhm.done) return mhm.hitflags;

    if (!mhm.damage) return mhm.hitflags;

    mdef.mhp -= mhm.damage;
    if (mdef.mhp < 1) {
        if (m_at(mdef.mx, mdef.my, state) === magr) { /* see gulpmm() */
            remove_monster(mdef.mx, mdef.my, state);
            mdef.mhp = 1; /* otherwise place_monster will complain */
            place_monster(mdef, mdef.mx, mdef.my, state);
            mdef.mhp = 0;
        }
        if (mattk.aatyp === AT_WEAP || mattk.aatyp === AT_CLAW) {
            /* monst.h troll_baned() (246-247): only Trollsbane sets the
               flag, and the AT_WEAP arm of mattackm() refuses before an
               armed attacker can arrive here. */
            state.gm ??= {};
            state.gm.mkcorpstat_norevive = mdef.data.mlet === S_TROLL && mwep
                && mwep.oartifact === ART_TROLLSBANE;
        }
        state.gz ??= {};
        state.gz.zombify = !mwep && zombie_maker(magr)
            && (mattk.aatyp === AT_TUCH
                || mattk.aatyp === AT_CLAW
                || mattk.aatyp === AT_BITE)
            && zombie_form(mdef.data) !== NON_PM;
        await monkilled(mdef, '', mattk.adtyp, state, env);
        state.gz.zombify = false; /* reset */
        state.gm ??= {};
        state.gm.mkcorpstat_norevive = false;
        if (mdef.mhp >= 1) return mhm.hitflags; /* mdef lifesaved */
        if (mhm.hitflags === M_ATTK_AGR_DIED)
            return M_ATTK_DEF_DIED | M_ATTK_AGR_DIED;

        if (mattk.adtyp === AD_DGST) {
            /* C performs these effects after monkilled() so their messages
             * follow the death message. Their return values are discarded. */
            if (ismnum(mdef.cham)) {
                await newcham(magr, null, {
                    ...env,
                    state,
                    ncflags: NC_SHOW_MSG,
                });
            } else if (pd === state.mons?.[PM_GREEN_SLIME]
                       && !slimeproof(magr.data)) {
                await newcham(magr, state.mons[PM_GREEN_SLIME], {
                    ...env,
                    state,
                    ncflags: NC_SHOW_MSG,
                });
            } else if (pd === state.mons?.[PM_WRAITH]) {
                await grow_up(magr, null, env);
                return M_ATTK_DEF_DIED
                    | (magr.mhp >= 1 ? 0 : M_ATTK_AGR_DIED);
            } else if (pd === state.mons?.[PM_NURSE]) {
                healmon(magr, magr.mhpmax, 0);
            }
            await mon_givit(magr, pd, { ...env, state });
        }

        return M_ATTK_DEF_DIED
            | (await grow_up(magr, mdef, env) ? 0 : M_ATTK_AGR_DIED);
    }
    return (mhm.hitflags === M_ATTK_AGR_DIED) ? M_ATTK_AGR_DIED : M_ATTK_HIT;
}

// C ref: mhitm.c mon_poly() (1122-1207). Return the remaining damage
// after magic resistance, system shock, or a complete shape transition.
export async function mon_poly(magr, mdef, damage, state = game, rawEnv = {}) {
    const random = rawEnv.random ?? { d, rn1, rn2, rnd, rne, rnz };
    const message = rawEnv.message ?? ttyPline;
    const env = { ...rawEnv, state, random, message };
    const oldform = mdef.data;
    const freaky = ' undergoes a freakish metamorphosis';

    // polyself() can ask for a form and uses the live core context. Stop
    // the dry run at the existing input boundary and replay this effect live.
    if (env.planning) {
        if (typeof env.requestPlanningInput !== 'function')
            throw new TypeError('planned mon_poly requires an input boundary');
        env.requestPlanningInput('mon_poly');
    }
    if (mdef === state.youmonst) {
        const active = (property) => Boolean(
            state.u.uprops[property].intrinsic
            || state.u.uprops[property].extrinsic,
        );
        if (active(ANTIMAGIC)) {
            await shieldeff(state.u.ux, state.u.uy, state);
        } else if (!active(UNCHANGING)) {
            if (state.u.ulycn === NON_PM) {
                await message('You are subjected to a freakish metamorphosis.', state);
                await polyself(POLY_NOFLAGS, state);
            } else if (state.u.umonnum !== state.u.ulycn) {
                await message('You feel an unnatural urge coming on.', state);
                note_unported('were.c you_were');
            } else {
                await message('You feel a natural urge coming on.', state);
                note_unported('were.c you_unwere');
            }
            damage = 0;
        }
    } else {
        const before = Monnam(mdef, state, env);
        if (resists_magm(mdef, state)) {
            if (state.gv?.vis) await shieldeff_mon(mdef, env);
        } else if (await resist(mdef, WAND_CLASS, 0, TELL, state, random, env)) {
            // Resist leaves the original damage unchanged.
        } else if (!random.rn2(25) && mdef.cham === NON_PM
            && (mdef.mcan || pm_to_cham(mdef.data.pmidx, state) !== NON_PM)) {
            if (state.gv?.vis) await message(`${before} shudders!`, state);
            damage += Math.trunc((mdef.mhpmax + 1) / 2);
            mdef.mhp -= damage;
            damage = 0;
            if (mdef.mhp < 1) {
                if (magr === state.youmonst)
                    await xkilled(mdef, XKILL_GIVEMSG | XKILL_NOCORPSE, state, env);
                else
                    await monkilled(mdef, '', AD_RBRE, state, env);
            }
        } else if (await newcham(mdef, null, { ...env, ncflags: NO_NC_FLAGS })) {
            if (state.gv?.vis) {
                const wasSeen = before.toLowerCase() !== 'it';
                const verbosely = state.flags.verbose || !wasSeen;
                if (canspotmon(mdef, state)) {
                    await message(`${before}${verbosely ? freaky : ''}`
                        + `${verbosely ? ' and' : ''} turns into `
                        + `${x_monnam(mdef, ARTICLE_A, null,
                            SUPPRESS_NAME | SUPPRESS_IT | SUPPRESS_INVISIBLE,
                            false, state, env)}.`, state);
                } else if (wasSeen || magr === state.youmonst) {
                    await message(`${before}${freaky}`
                        + `${wasSeen ? ' and disappears' : ''}.`, state);
                }
            }
            damage = 0;
            if (can_teleport(magr.data)) {
                if (magr === state.youmonst) await tele(state, env);
                else if (!await tele_restrict(magr, state, env))
                    await rloc(magr, RLOC_MSG, env);
            }
        } else if (state.gv?.vis && state.flags.verbose) {
            await message('Nothing happens.', state);
        }
    }
    if (mdef.data !== oldform && magr !== state.youmonst)
        magr.mspec_used += random.rnd(2);
    return damage;
}

// C ref: mhitm.c passivemm() (1304-1460). Run the defender's first AT_NONE
// response after active-attack effects, retaining the source damage and return
// mask even when a discarded helper remains a named gap.
async function passivemm(magr, mdef, mhitb, mdead, mwep, env) {
    const { state, random } = env;
    const message = requireAttackOperation(env, 'message');
    const mddat = mdef.data;
    let i;
    let tmp;
    const mhit = mhitb ? M_ATTK_HIT : M_ATTK_MISS;

    for (i = 0; ; i++) {
        if (i >= NATTK)
            return mdead | mhit; /* no passive attacks */
        if (mddat.mattk[i].aatyp === AT_NONE) break;
    }
    if (mddat.mattk[i].damn)
        tmp = random.d(mddat.mattk[i].damn, mddat.mattk[i].damd);
    else if (mddat.mattk[i].damd)
        tmp = random.d(mddat.mlevel + 1, mddat.mattk[i].damd);
    else
        tmp = 0;

    /* These affect the enemy even if defender killed. */
    switch (mddat.mattk[i].adtyp) {
    case AD_ACID:
        if (mhitb && !random.rn2(2)) {
            const attackerName = Monnam(magr, state, env);
            if (canseemon(magr, state)) {
                await message(
                    `${attackerName} is splashed by `
                        + `${s_suffix(mon_nam(mdef, state, env))} `
                        + `${hliquid('acid', { ...env, state })}!`,
                    state,
                );
            }
            if (Resists_Elem(magr, ACID_RES, state)) {
                if (canseemon(magr, state)) {
                    await message(
                        `${Monnam(magr, state, env)} is not affected.`, state,
                    );
                }
                tmp = 0;
            }
        } else {
            tmp = 0;
        }
        if (!random.rn2(30))
            await erode_armor(magr, ERODE_CORRODE, state, env);
        if (!random.rn2(6) && magr.mw)
            note_unported('trap.c acid_damage');
        break;
    case AD_ENCH: /* KMH -- remove enchantment (disenchanter) */
        if (mhitb && !mdef.mcan && mwep)
            drain_item(mwep, false, state, env);
        break;
    default:
        break;
    }
    if (mddat.mattk[i].adtyp === AD_ACID) {
        /* C's acid arm jumps directly to assess_dmg, before the cancellation
         * and dead-defender checks or the common rn2(3) gate. */
        magr.mhp -= tmp;
        if (magr.mhp <= 0) {
            await monkilled(magr, '', mddat.mattk[i].adtyp, state, env);
            return mdead | mhit | M_ATTK_AGR_DIED;
        }
        return mdead | mhit;
    }
    if (mdead || mdef.mcan) return mdead | mhit;

    /* These affect the enemy only if defender is still alive */
    if (random.rn2(3)) {
        switch (mddat.mattk[i].adtyp) {
        case AD_PLYS: /* Floating eye */
            if (tmp > 127) tmp = 127;
            if (mddat === state.mons?.[PM_FLOATING_EYE]) {
                if (!random.rn2(4)) tmp = 127;
                if (magr.mcansee && haseyes(magr.data) && mdef.mcansee
                    && (perceives(magr.data) || !mdef.minvis)) {
                    const format = s_suffix(Monnam(mdef, state, env))
                        .replaceAll('%', '%%')
                        + ' gaze is reflected by %s %s.';
                    if (await mon_reflects(
                        magr,
                        canseemon(magr, state) ? format : null,
                        state,
                        env,
                    )) {
                        return mdead | mhit;
                    }
                    if (canseemon(magr, state)) {
                        await message(
                            `${Monnam(magr, state, env)} is frozen by `
                                + `${s_suffix(mon_nam(mdef, state, env))} gaze!`,
                            state,
                        );
                    }
                    paralyze_monst(magr, tmp);
                    return mdead | mhit;
                }
            } else {
                /* C's else arm covers the non-floating-eye AD_PLYS response;
                 * gel cubes are the ordinary species which reaches it. */
                if (canseemon(magr, state)) {
                    await message(
                        `${Monnam(magr, state, env)} is frozen by `
                            + `${mon_nam(mdef, state, env)}.`,
                        state,
                    );
                }
                paralyze_monst(magr, tmp);
                return mdead | mhit;
            }
            return M_ATTK_HIT;
        case AD_COLD:
            if (Resists_Elem(magr, COLD_RES, state)) {
                if (canseemon(magr, state)) {
                    await message(
                        `${Monnam(magr, state, env)} is mildly chilly.`, state,
                    );
                    await golemeffects(magr, AD_COLD, tmp, { ...env, state });
                }
                tmp = 0;
                break;
            }
            if (canseemon(magr, state)) {
                await message(
                    `${Monnam(magr, state, env)} is suddenly very cold!`, state,
                );
            }
            healmon(mdef, Math.trunc(tmp / 2), Math.trunc(tmp / 2));
            if (mdef.mhpmax > ((mdef.m_lev + 1) * 8))
                await split_mon(mdef, magr, { ...env, state });
            break;
        case AD_STUN:
            if (!magr.mstun) {
                magr.mstun = 1;
                if (canseemon(magr, state)) {
                    await message(
                        `${Monnam(magr, state, env)} `
                            + `${makeplural(stagger(magr.data, 'stagger'))}...`,
                        state,
                    );
                }
            }
            tmp = 0;
            break;
        case AD_FIRE:
            if (Resists_Elem(magr, FIRE_RES, state)) {
                if (canseemon(magr, state)) {
                    await message(
                        `${Monnam(magr, state, env)} is mildly warmed.`, state,
                    );
                    await golemeffects(magr, AD_FIRE, tmp, { ...env, state });
                }
                tmp = 0;
                break;
            }
            if (canseemon(magr, state)) {
                await message(
                    `${Monnam(magr, state, env)} is suddenly very hot!`, state,
                );
            }
            break;
        case AD_ELEC:
            if (Resists_Elem(magr, SHOCK_RES, state)) {
                if (canseemon(magr, state)) {
                    await message(
                        `${Monnam(magr, state, env)} is mildly tingled.`, state,
                    );
                    await golemeffects(magr, AD_ELEC, tmp, { ...env, state });
                }
                tmp = 0;
                break;
            }
            if (canseemon(magr, state)) {
                await message(
                    `${Monnam(magr, state, env)} is jolted with electricity!`,
                    state,
                );
            }
            break;
        default:
            tmp = 0;
            break;
        }
    } else {
        tmp = 0;
    }

    /* assess_dmg: */
    magr.mhp -= tmp;
    if (magr.mhp <= 0) {
        await monkilled(magr, '', mddat.mattk[i].adtyp, state, env);
        return mdead | mhit | M_ATTK_AGR_DIED;
    }
    return mdead | mhit;
}
