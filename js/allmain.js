// allmain.js — Main game loop.
// C ref: allmain.c — newgame, moveloop, moveloop_core.
//
// The implemented command boundary uses one source-derived elapsed-turn path.
// Unsupported command and monster branches stop before live state changes;
// UUID, notice, and glyph-map setup remain to be ported.

import { getnow } from './calendar.js';
import { game } from './gstate.js';
import {
    A_DEX,
    CLAIRVOYANT,
    COLNO,
    EXT_ENCUMBER,
    FAST,
    HVY_ENCUMBER,
    INTRINSIC,
    MOD_ENCUMBER,
    NO_MM_FLAGS,
    NORMAL_SPEED,
    RLOC_NOMSG,
    SEARCHING,
    SLT_ENCUMBER,
    UNENCUMBERED,
} from './const.js';
import { effective_attribute, exerchk } from './attrib.js';
import { makedog, see_nearby_monsters } from './dog.js';
import { mklev, l_nhcore_init } from './mklev.js';
import { u_on_upstairs } from './stairs.js';
import { m_at } from './monst.js';
import {
    adaptMonsterActionToDochugwSignature,
    decide_to_shapeshift,
    mcalcdistress,
    mcalcmove,
    movemon,
    movemon_singlemon,
    UnsupportedMonsterDistressError,
    were_change,
} from './mon.js';
import {
    dmonsfree,
    m_dowear,
    makemon_runtime,
    UnsupportedMonsterCreationError,
} from './makemon_create.js';
import { init_objects } from './o_init.js';
import { UnsupportedObjectNameError } from './objnam.js';
import { UnsupportedObjectOperationError } from './obj.js';
import { UnsupportedMonsterPickupOperationError } from './steal.js';
import { objectGenerationHooks } from './object_generation.js';
import { reset_mvitals } from './monsters.js';
import { depth, init_dungeons } from './dungeon.js';
import { init_artifacts } from './artifacts.js';
import { role_init, welcomeMessage } from './role_init.js';
import { u_init_misc } from './u_init.js';
import {
    find_ac,
    u_init_inventory_attrs,
} from './u_init_inventory_attrs.js';
import { use_initial_inventory } from './u_init_inventory_use.js';
import {
    finalize_startup_skills,
    initialspell,
} from './startup_skills.js';
import { reroll_menu } from './startup_reroll.js';
import { ttyLegacyIntroduction } from './legacy_startup.js';
import { failClosedCommandRefusals, rhack } from './cmd.js';
import { deferred_goto } from './do.js';
import {
    domove,
    endRunning,
    lookaround,
    monsterNearby,
    near_capacity,
    nomul,
    projected_capacity,
    runmode_delay_output,
} from './hack.js';
import { encumber_msg } from './pickup.js';
import {
    docrt,
    cls,
    bot,
    flush_screen,
    newsym,
    timebot,
} from './display.js';
import {
    dismissPendingTtyMessage,
    ttyNorep,
    ttyPline,
} from './tty_message.js';
import {
    canSeeMonster,
    emitGlyphUpdateNotices,
    emitStartupA11yNotices,
} from './startup_a11y.js';
import { can_reach_floor, wipe_engr_at } from './engrave.js';
import { check_special_room } from './rooms.js';
import { mnexto } from './teleport.js';
import {
    block_point,
    cansee,
    does_block,
    init_vision_globals,
    unblock_point,
    vision_recalc,
    vision_reset,
} from './vision.js';
import {
    createCoreRandom,
    d,
    rn1,
    rn2,
    rnd,
    rne,
    rnl,
    rnz,
} from './rng.js';
import { dosoundsInitialLevel } from './sounds.js';
import {
    eatfood,
    gethungry,
    preflightGetHungry,
    UnsupportedHungerTransitionError,
} from './eat.js';
import { m_everyturn_effect } from './monmove.js';
import {
    preflightSimpleMonsterActions,
    runSimpleMonsterAction,
    UnsupportedSimpleMonsterActionError,
} from './unported_monster_actions.js';
import {
    create_gas_cloud,
    run_regions,
} from './region.js';
import {
    UnsupportedHeroTimeoutBoundaryError,
    nh_timeout_elapsed_turn,
    preflight_nh_timeout_elapsed_turn,
} from './timeout.js';
import { regen_hp, regen_pw } from './regen.js';
import { automatic_search } from './detect.js';
import { age_spells } from './spell.js';
import { settrack } from './track.js';
import { is_lava, is_pool } from './trap.js';
import { clear_splitobjs } from './obj.js';

// PRNG-owning initializer seam corresponding to the point immediately before
// allmain.c:newgame() calls mklev(). Asynchronous only because u_init_misc()
// is; nothing it awaits can suspend before mklev().
export async function newgame_pre_mklev(g = game) {
    g.disp ??= {};
    g.disp.botlx = true;
    g.context ??= {};
    g.context.ident = 2;
    g.context.warnlevel = 1;
    g.context.next_attrib_check = 600;
    g.context.tribute = { enabled: true };
    // C ref: context.h achievement_tracking.  Prize creation on Mines' End
    // and Sokoban End records object identity here before floor stacking;
    // actual achievements are awarded later when the hero picks the prize up.
    g.context.achieveo = {
        mines_prize_oid: 0,
        soko_prize_oid: 0,
        castle_prize_old: 0,
        mines_prize_otyp: 0,
        soko_prize_otyp: 0,
        castle_prize_otyp: 0,
        minetn_reached: false,
    };
    reset_mvitals(g);
    init_objects(g);
    g.flags.pantheon = -1;
    role_init(g);
    init_dungeons(g);
    init_artifacts(g);
    await u_init_misc(g);
    l_nhcore_init(g);
    return g;
}

// C ref: allmain.c newgame()
export async function newgame() {
    const g = game;
    // allmain.c newgame() brackets initialization and the welcome message
    // with notice_mon_off()/notice_mon_on().
    g.a11y ??= {};
    g.a11y.mon_notices_blocked
        = (g.a11y.mon_notices_blocked ?? 0) + 1;

    // C ref: allmain.c newgame(). Preserve this order: each initializer owns
    // state and PRNG effects used by every initializer that follows it.
    await newgame_pre_mklev(g);

    // Real mklev generates the level with correct room positions
    // Structural phase consumes RNG for rooms/corridors/doors/stairs
    await mklev();

    // C ref: allmain.c newgame() → u_on_upstairs(). In C, room filling above
    // is part of mklev(), so hero placement follows it.
    u_on_upstairs();

    // C ref: allmain.c newgame(). Vision and room membership must observe the
    // final hero square before an existing monster is displaced and the
    // starting pet chooses a neighboring square.
    init_vision_globals();
    vision_reset();
    await check_special_room(false, g);
    const stairOccupant = m_at(g.u.ux, g.u.uy, g);
    if (stairOccupant)
        mnexto(stairOccupant, RLOC_NOMSG, { state: g });
    await makedog({ state: g });

    const objectHooks = objectGenerationHooks();
    u_init_inventory_attrs(g, undefined, { objectHooks });

    // Initial display. C ref: allmain.c newgame() calls docrt() alone; the
    // explicit vision_recalc(0) and cls() are what js/display.js docrt()
    // leaves to its callers.
    vision_recalc(0);
    await cls();
    await docrt();
    // The first tty render and newgame()'s explicit BL_FLUSH retain the
    // initial three-line overlap. Later dirty-field flushes, including the
    // welcome pline after equipment is worn, use the steady-state layout.
    await flush_screen(1);
    await bot({ initialTtyRefresh: true });

    // C ref: allmain.c newgame(). Only the accepted inventory reaches object
    // discovery, equipment, spell, and skill initialization.  Each rejected
    // u_init_inventory_attrs() still repeats inherent role/race knowledge.
    while (g.u.uroleplay.reroll && await reroll_menu(g)) {
        u_init_inventory_attrs(g, undefined, { objectHooks });
        await bot();
    }

    // C ref: u_init.c u_init_skills_discoveries().
    use_initial_inventory({
        state: g,
        hooks: objectHooks,
        initialSpell: initialspell,
    });
    finalize_startup_skills(g);
    find_ac(g);

    // C ref: allmain.c newgame() -> com_pager("legacy").
    await ttyLegacyIntroduction(g);

    // C ref: allmain.c newgame(). The elapsed-time clock starts here, which
    // insight.c fmt_elapsed_time() reads for the ^X window's closing line.
    g.urealtime.realtime = 0;
    g.urealtime.start_timing = getnow(g);

    // C ref: allmain.c welcome(TRUE) -> pline().
    await ttyPline(welcomeMessage(g), g);
    // C re-enables monster notices only after the welcome, then chooses
    // between #lookaround and the distance-sorted monster notice pass.
    g.a11y.mon_notices_blocked = Math.max(
        0,
        g.a11y.mon_notices_blocked - 1,
    );
    await emitStartupA11yNotices(g, { pline: ttyPline });
}

// C ref: allmain.c u_calc_moveamt(). Add the hero's next movement ration
// after monster allocation and random-monster generation.
export function u_calc_moveamt(wtcap, state = game, random = rn2) {
    const u = state.u;
    let moveamt;

    if (u.usteed && u.umoved) {
        moveamt = mcalcmove(u.usteed, true, state, random);
    } else {
        if (!Number.isInteger(state.youmonst?.data?.mmove))
            throw new Error('u_calc_moveamt requires initialized hero form');
        moveamt = state.youmonst.data.mmove;
        const speed = u.uprops?.[FAST] ?? {};
        const intrinsic = Math.trunc(speed.intrinsic ?? 0);
        const extrinsic = Math.trunc(speed.extrinsic ?? 0);
        if ((intrinsic & ~INTRINSIC) || extrinsic) {
            if (random(3) !== 0) moveamt += NORMAL_SPEED;
        } else if (intrinsic || extrinsic) {
            if (random(3) === 0) moveamt += NORMAL_SPEED;
        }
    }

    switch (wtcap) {
    case SLT_ENCUMBER:
        moveamt -= Math.trunc(moveamt / 4);
        break;
    case MOD_ENCUMBER:
        moveamt -= Math.trunc(moveamt / 2);
        break;
    case HVY_ENCUMBER:
        moveamt -= Math.trunc((moveamt * 3) / 4);
        break;
    case EXT_ENCUMBER:
        moveamt -= Math.trunc((moveamt * 7) / 8);
        break;
    default:
        break;
    }

    u.umovement += moveamt;
    if (u.umovement < 0) u.umovement = 0;
}

// C ref: allmain.c maybe_generate_rnd_mon(). New monsters receive their
// movement only on the following allocation round because this gate follows
// the current round's monster movement allocation.
async function stopOccupationForRuntimeMonster(_monster, env) {
    const { state } = env;
    if (!state.go?.occupation) return;
    const occupation = state.go.occupation;
    const meal = state.context?.victual;
    if (occupation === eatfood && meal?.usedtime >= meal?.reqtime) {
        // C ref: eat.c maybe_finished_meal(TRUE). Clear the occupation before
        // the final eatfood() call so done_eating()->newuhs() sees the meal as
        // finished, then let eatfood own its object and message lifecycle.
        state.go.occupation = null;
        await eatfood(state, {
            message: env.message,
            statusRefresh: env.statusRefresh,
        });
    } else {
        await env.message(`You stop ${state.go.occtxt}.`, state, env);
    }
    state.go.occupation = null;
    state.disp ??= {};
    state.disp.botl = true;
    nomul(0, state);
    // C also clears CQ_CANNED. The port has no command queue.
}

export async function maybe_generate_rnd_mon(state = game, env = {}) {
    const random = env.random ?? { d, rn1, rn2, rnd, rne, rnz };
    const createMonster = env.makemon ?? makemon_runtime;
    const heroLevel = state.u?.uz;
    const strongholdLevel = state.stronghold_level;
    if (!heroLevel || !strongholdLevel || !state.u?.uevent) {
        throw new Error(
            'maybe_generate_rnd_mon requires initialized level globals',
        );
    }
    const bound = state.u.uevent.udemigod
        ? 25
        : depth(heroLevel, state) > depth(strongholdLevel, state) ? 50 : 70;
    if (random.rn2(bound) !== 0) return null;
    return await createMonster(null, 0, 0, NO_MM_FLAGS, {
        ...env,
        hooks: {
            ...(env.hooks ?? {}),
            stopOccupation: env.hooks?.stopOccupation
                ?? stopOccupationForRuntimeMonster,
        },
        random,
        state,
    });
}

// C ref: allmain.c moveloop_core() lines 360-361 and engrave.c
// u_wipe_engr(). rnd(3) is evaluated before can_reach_floor(TRUE).
export function maybeWipeHeroEngraving(
    state = game,
    random = { rn2, rnd },
) {
    const dexterity = effective_attribute(state, A_DEX);
    if (random.rn2(40 + dexterity * 3) !== 0) return false;

    const count = random.rnd(3);
    const hero = state.u;
    if (!can_reach_floor(true, state)) return false;
    wipe_engr_at(hero.ux, hero.uy, count, false, { state, random });
    return true;
}

function clairvoyancePlan(state, env) {
    const moves = state.moves;
    const seerTurn = state.context?.seer_turn;
    if (!Number.isSafeInteger(moves) || moves < 0
        || !Number.isSafeInteger(seerTurn) || seerTurn < 0) {
        throw new Error(
            'clairvoyance cadence requires initialized moves and seer_turn',
        );
    }
    if (moves < seerTurn) return { due: false };

    const random = env.random ?? { rn1 };
    if (typeof random.rn1 !== 'function') {
        throw new TypeError('clairvoyance cadence requires rn1');
    }
    const clairvoyance = state.u?.uprops?.[CLAIRVOYANT] ?? {};
    const blocked = Boolean(clairvoyance.blocked);
    const active = Boolean(
        clairvoyance.intrinsic || clairvoyance.extrinsic,
    ) && !blocked;
    const inEndgame = Number.isInteger(state.astral_level?.dnum)
        && state.u?.uz?.dnum === state.astral_level.dnum;
    const mapRequired = Boolean(
        (state.u?.uhave?.amulet || active) && !inEndgame && !blocked,
    );
    if (mapRequired && typeof env.doVicinityMap !== 'function') {
        throw new Error('active clairvoyance requires doVicinityMap');
    }
    return { due: true, mapRequired, moves, random };
}

function applyClairvoyancePlan(plan, state, env) {
    if (!plan.due) return false;
    if (plan.mapRequired)
        env.doVicinityMap(null, { state });
    state.context.seer_turn = plan.moves + plan.random.rn1(31, 15);
    return true;
}

// C ref: allmain.c moveloop_core()'s once-per-hero-took-time clairvoyance
// block. The cadence advances even when the hero cannot currently map.
export function maybeRunClairvoyance(state = game, env = {}) {
    return applyClairvoyancePlan(clairvoyancePlan(state, env), state, env);
}

// C ref: allmain.c moveloop_core()'s once-per-hero-took-time boundary.
// New-turn allocation establishes moves*8; each action within that turn then
// receives the next sequence number before clairvoyance cadence is checked.
export async function finishHeroTimeEffects(state = game, env = {}) {
    if (!Number.isSafeInteger(state.hero_seq) || state.hero_seq < 0) {
        throw new Error('hero time effects require initialized hero_seq');
    }
    if (typeof env.encumberMessage !== 'function') {
        throw new Error('hero time effects require encumber_msg');
    }
    // Validate injected owners before changing hero_seq. Once admitted,
    // preserve C's increment -> encumbrance -> map -> schedule order.
    const plan = clairvoyancePlan(state, env);
    state.hero_seq++;
    await env.encumberMessage(state);
    applyClairvoyancePlan(plan, state, env);
}

export class UnsupportedTurnBoundaryError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedTurnBoundaryError';
    }
}

// allmain.c:538-539 runs deferred_goto() outside rhack(), after the command's
// failClosedCommand() wrapper has returned. Convert the same owner-specific
// refusals here so a late goto_level() boundary preserves the supported
// segment prefix instead of escaping runSegment() as a hard failure.
async function runDeferredGotoAtTurnBoundary(state) {
    try {
        await deferred_goto(state);
    } catch (error) {
        if (!failClosedCommandRefusals().some(
            (type) => error instanceof type,
        )) {
            throw error;
        }
        const boundary = new UnsupportedTurnBoundaryError(error.message);
        boundary.reason = error.reason;
        throw boundary;
    }
}

function propertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function elapsedTurnBoundary(reason) {
    throw new UnsupportedTurnBoundaryError(
        `elapsed turn reached ${reason}`,
    );
}

// C ref: allmain.c interrupt_multi(), which regen_hp() and regen_pw() reach
// when the hero regains the last hit point or the last power point during a
// multi-turn action. A run and a travel are deliberately exempt, and a run is
// the only way this port reaches a positive multi, so this is a no-op today.
// A counted repeat would print through Norep(); regen_hp() and regen_pw() are
// synchronous, so that arm stops before nomul(0) changes anything.
export function interrupt_multi(message, state) {
    if (!((state.multi ?? 0) > 0)
        || state.context.travel || state.context.run) {
        return;
    }
    if (state.flags?.verbose && message)
        elapsedTurnBoundary('a multi-turn interruption message');
    nomul(0, state);
}

function regionEffectEnv(state, random) {
    return {
        state,
        random,
        blockPoint: (x, y) => block_point(x, y, state),
        unblockPoint: (x, y) => unblock_point(x, y, state),
        doesBlock: (x, y, location) => does_block(
            x,
            y,
            location,
            state,
        ),
        canSee: (x, y) => cansee(x, y, state),
        newsym: (x, y) => newsym(x, y),
        message: (message) => ttyPline(message, state),
    };
}

async function runEveryTurnEffectWithRegionHooks(monster, env) {
    const regionEnv = regionEffectEnv(env.state, env.random);
    await m_everyturn_effect(monster, {
        ...env,
        createGasCloud: (x, y, size, damage, effectEnv) =>
            create_gas_cloud(x, y, size, damage, {
                ...effectEnv,
                ...regionEnv,
            }),
    });
}

function elapsedTurnMinLiquid(monster, env) {
    if (is_pool(monster.mx, monster.my, env.state)
        || is_lava(monster.mx, monster.my, env.state)) {
        elapsedTurnBoundary('an immobile monster in liquid');
    }
    return false;
}

async function finishElapsedTurn(
    state,
    random,
    { planning = false, randomMonsterOnly = false } = {},
) {
    // C ref: allmain.c moveloop_core()'s mvl_wtcap, taken once after the
    // monster loop. C reuses this snapshot only for u_calc_moveamt(),
    // regen_hp(), regen_pw(), and the overexertion check, and substitutes
    // UNENCUMBERED for the last two when the hero is invulnerable. eat.c
    // gethungry() and attrib.c exerper() each call near_capacity() themselves,
    // so they get a live evaluator below rather than this value, which
    // nh_timeout() and the hunger transition can already have invalidated.
    let wtcap = near_capacity(state);
    const regionEnv = planning ? null : regionEffectEnv(state, random);
    state.gw.were_changes = 0;
    await mcalcdistress(state, {
        state,
        random,
        message: planning ? async () => {} : ttyPline,
        redrawSquare: planning ? () => {} : newsym,
        visionRecalc: planning ? () => {} : vision_recalc,
        minLiquid: elapsedTurnMinLiquid,
        decideToShapeshift: decide_to_shapeshift,
        wereChange: were_change,
    });

    for (let monster = state.level.monlist;
        monster;
        monster = monster.nmon) {
        monster.movement += mcalcmove(
            monster,
            true,
            state,
            random.rn2,
        );
    }
    const silentMessage = async () => {};
    const planningDisplayRandom = planning
        ? state.displayCtx
            ? createCoreRandom(state.displayCtx, state).rn2
            : () => {
                throw new TypeError(
                    'planned monster naming requires initialized display RNG',
                );
            }
        : undefined;
    await maybe_generate_rnd_mon(state, {
        random,
        displayRandom: planningDisplayRandom,
        message: planning ? silentMessage : ttyPline,
        norepMessage: planning ? silentMessage : ttyNorep,
        statusRefresh: planning ? silentMessage : () => bot(),
    });
    // planSimpleMonsterTurn() treats a truthy advanceRound result as "this
    // single unburdened allocation is fully preflighted" and must not plan a
    // second allocation that the live hero will not need.
    if (randomMonsterOnly) return true;
    u_calc_moveamt(wtcap, state, random.rn2);
    settrack(state);

    state.moves++;
    if (state.moves >= 1000000000) {
        // C ref: allmain.c moveloop_core() runs display_nhwindow(WIN_MESSAGE,
        // TRUE), then urgent_pline("The dungeon capitulates."), then
        // done(ESCAPED). Only the first is ported. done() drives the
        // disclosure prompts, the "You escaped from the dungeon" summary, and
        // topten, and recorder patch 006 writes its single final capture
        // inside nh_terminate() after topten has painted. Printing the pline
        // and capturing a frame here would invent a boundary no C run
        // produces, so stop after the dismissal C performs first.
        if (!planning && state._pending_message)
            await dismissPendingTtyMessage(state);
        elapsedTurnBoundary('game end through done(ESCAPED)');
    }
    state.hero_seq = state.moves * 8;
    if (state.flags?.time && !state.context?.run) {
        state.disp ??= {};
        state.disp.time_botl = true;
    }

    nh_timeout_elapsed_turn(state);
    // Full planning remains specific to the burdened multi-allocation path.
    // An unburdened clone returns just after random monster generation above,
    // which is the newly async lifecycle that also needs atomic preflight.
    if (planning && state.level.regions.length)
        elapsedTurnBoundary('burdened multi-cycle region upkeep');
    if (!planning) await run_regions(regionEnv);

    if (state.u.ublesscnt) state.u.ublesscnt--;
    // C ref: allmain.c substitutes UNENCUMBERED for an invulnerable hero
    // instead of healing, and the two consumers below then read the
    // substituted value rather than the snapshot taken above.
    if (state.u.uinvulnerable) wtcap = UNENCUMBERED;
    else regen_hp(wtcap, state, { random, interruptMulti: interrupt_multi });
    // C ref: allmain.c's "moving around while encumbered is hard work" block,
    // between regen_hp() and regen_pw(). overexert_hp() costs a hit point and
    // refreshes the status line, and at uhp <= 1 it also prints a message,
    // draws rn2 through exercise(A_CON, FALSE), and calls fall_asleep(). None
    // of that is ported, so the branch stops instead. Only a burdened hero can
    // reach wtcap > MOD_ENCUMBER, and a burdened turn is planned on the clone
    // first, so the live pass stops before spending anything on this turn.
    if (wtcap > MOD_ENCUMBER && state.u.umoved
        && !(wtcap < EXT_ENCUMBER
            ? state.moves % 30
            : state.moves % 10)) {
        elapsedTurnBoundary('overexertion hit point loss');
    }
    regen_pw(wtcap, state, { random, interruptMulti: interrupt_multi });

    if (propertyActive(state, SEARCHING)
        && !state.level.flags?.noautosearch
        && (state.multi ?? 0) >= 0) {
        if (planning)
            elapsedTurnBoundary('burdened multi-cycle automatic search');
        await automatic_search({ state, random });
    }
    await dosoundsInitialLevel(state, {
        random: random.rn2,
        pline: planning ? async () => {} : ttyPline,
    });
    await gethungry(state, {
        random,
        // eat.c gethungry() calls near_capacity() live at its accessory-time
        // branch, before newuhs() can lower capacity.
        nearCapacity: () => near_capacity(state),
        message: planning ? async () => {} : ttyPline,
        endRunning,
        statusRefresh: planning ? async () => {} : () => bot(),
    });
    age_spells(state);
    // C ref: allmain.c moveloop_core() calls exerchk() here, before invault()
    // and engraving wear.
    await exerchk(state, {
        random,
        // attrib.c exerper() switches on near_capacity() live, after
        // gethungry() has run. A WEAK transition lowers weight_cap() through
        // ATEMP(A_STR), so the snapshot above can be a whole band too low.
        nearCapacity: () => near_capacity(state),
        encumberMessage: planning
            ? (subject) => encumber_msg(
                subject,
                { message: async () => {} },
            )
            : encumber_msg,
        message: planning ? async () => {} : ttyPline,
    });
    maybeWipeHeroEngraving(state, random);
}


function unavailableElapsedTurnOperation(operation) {
    return () => {
        throw new UnsupportedTurnBoundaryError(
            `elapsed turn reached ${operation}`,
        );
    };
}

// The refusal classes the cloned once-per-turn round can raise that must be
// converted to UnsupportedTurnBoundaryError, so the segment stops on its last
// matching screen rather than throwing out of runSegment(). The clone also
// raises UnsupportedTurnBoundaryError directly, from finishElapsedTurn()'s own
// stops and from the operations unavailableElapsedTurnOperation() covers;
// those pass through the catch below unchanged because js/jsmain.js already
// treats that class as a segment boundary. A refusal class that is neither in
// this list nor already an UnsupportedTurnBoundaryError escapes runSegment()
// as a hard failure, so a newly invented one belongs here.
// Built per call rather than at module scope. js/eat.js now imports what the
// #eat command needs, which makes this file part of an import cycle with it,
// and a module-scope read of a class js/eat.js exports would run while that
// module is still initializing. This list is consulted only on the error path
// below, so rebuilding it costs nothing a turn pays.
function elapsedTurnPlanningRefusals() {
    return [
        UnsupportedSimpleMonsterActionError,
        UnsupportedHeroTimeoutBoundaryError,
        UnsupportedHungerTransitionError,
        UnsupportedMonsterDistressError,
        UnsupportedMonsterCreationError,
        // Both pickup arms -- dogmove.c dog_invent()'s and mon.c
        // mpickstuff()'s -- call distant_name(), splitobj() and mpickobj()
        // from inside the monster scan, so these three reach here from a path
        // that used to stop at an injected refusal of the first class above.
        // Without them a naming, split or pickup refusal discards the whole
        // segment instead of stopping on its last matching screen.
        UnsupportedObjectNameError,
        UnsupportedObjectOperationError,
        UnsupportedMonsterPickupOperationError,
    ];
}

const runElapsedTurnMonsterAction =
    adaptMonsterActionToDochugwSignature(runSimpleMonsterAction);

async function moveElapsedTurnMonster(monster, env) {
    return movemon_singlemon(monster, {
        ...env,
        everyTurnEffect: runEveryTurnEffectWithRegionHooks,
        visionRecalc: vision_recalc,
        clearBypasses: unavailableElapsedTurnOperation(
            'monster bypass cleanup',
        ),
        minLiquid: elapsedTurnMinLiquid,
        // C ref: mon.c movemon_singlemon():1268-1281. A monster whose gear
        // was flagged for reassessment reruns worn.c m_dowear(); only a
        // monster that would actually put something on stops the turn.
        dowear: (subject, creation, subjectEnv) => m_dowear(subject, creation, {
            ...subjectEnv,
            wearArmor: unavailableElapsedTurnOperation(
                'monster equipment changes',
            ),
        }),
        restrap: unavailableElapsedTurnOperation('monster hiding'),
        canSeeMonster: (subject) => canSeeMonster(subject, env.state),
        hideUnder: unavailableElapsedTurnOperation('eel concealment'),
        canSeeHero: () => true,
        canSeeSquare: (x, y) => cansee(x, y, env.state),
        fightMonster: unavailableElapsedTurnOperation('conflict combat'),
        dochugwAction: runElapsedTurnMonsterAction,
    });
}

// C ref: allmain.c moveloop_core(), elapsed turn. Monster movement can require
// multiple complete list scans while the hero lacks a ration. A fast hero's
// retained ration ends the scan even when a fast pet could act again;
// once-per-turn upkeep waits until both sides are out. This serves the first
// elapsed command and every subsequent elapsed command.
async function advanceElapsedTurn(state) {
    const initialCapacity = projected_capacity(state);
    let preflight;
    try {
        preflight = await preflightSimpleMonsterActions(state, {
            advanceRound: (planned, planningRandom) => finishElapsedTurn(
                planned,
                planningRandom,
                {
                    planning: true,
                    randomMonsterOnly: initialCapacity <= 0,
                },
            ),
        });
    } catch (error) {
        // The planning round runs the whole once-per-turn block on the clone,
        // so any owner it reaches can refuse: monster distress, the timeout
        // preflight, the hunger transition, and random monster generation all
        // raise their own class. js/jsmain.js breaks the segment only for the
        // three boundary types, so a class that is neither converted here nor
        // already one of those escapes as a hard failure and discards the
        // matching prefix instead of stopping on it.
        if (!elapsedTurnPlanningRefusals().some(
            (type) => error instanceof type,
        )) {
            throw error;
        }
        const boundary = new UnsupportedTurnBoundaryError(error.message);
        boundary.reason = error.reason;
        throw boundary;
    }
    // C reaches hunger and timeout work only after the current monster scans
    // leave both sides without a movement ration.  The cloned scan above
    // determines that gate without changing live state, so unsupported upkeep
    // can still stop atomically without rejecting a fast hero who retains a
    // ration and does not allocate a new turn.
    const reachesTurnLimit = preflight.runsOncePerTurnUpkeep
        && (state.moves || 1) + 1 >= 1000000000;
    // The turn C would finish with done(ESCAPED) is refused here, beside the
    // other preflight boundaries, so both capacity paths stop identically. A
    // burdened hero's full dry run also reaches the limit inside
    // finishElapsedTurn; an unburdened hero's shortened dry run returns before
    // it, and letting the live pass discover the limit would leave moves at
    // the wrap value with an ISAAC draw already spent.
    if (reachesTurnLimit)
        elapsedTurnBoundary('game end through done(ESCAPED)');
    if (preflight.runsOncePerTurnUpkeep) {
        try {
            preflightGetHungry(state, {
                nearCapacity: () => initialCapacity,
                message: ttyPline,
                endRunning,
                statusRefresh: () => bot(),
            });
        } catch (error) {
            if (!(error instanceof UnsupportedHungerTransitionError))
                throw error;
            const boundary = new UnsupportedTurnBoundaryError(error.message);
            boundary.reason = error.reason;
            throw boundary;
        }
        try {
            // C runs the per-turn timeouts against the turn it is entering.
            preflight_nh_timeout_elapsed_turn({
                ...state,
                moves: (state.moves || 1) + 1,
            });
        } catch (error) {
            if (!(error instanceof UnsupportedHeroTimeoutBoundaryError))
                throw error;
            const boundary = new UnsupportedTurnBoundaryError(error.message);
            boundary.reason = error.reason;
            throw boundary;
        }
    }
    const random = { d, rn1, rn2, rnd, rne, rnl, rnz };

    // C ref: allmain.c moveloop_core().  The outer loop repeats while the hero
    // still cannot move; the inner one runs monsters until either they are out
    // of rations or the hero regains one.  The once-per-turn block runs only
    // when both sides are out, which is why the gate carries !monstersCanMove
    // as well as the movement test.
    state.u.umovement -= NORMAL_SPEED;
    let upkeepCount = 0;
    do {
        await encumber_msg(state);
        state.context.mon_moving = true;
        let monstersCanMove;
        try {
            do {
                monstersCanMove = await movemon({
                    state,
                    random,
                    moveSingleMonster: moveElapsedTurnMonster,
                    clearBypasses: unavailableElapsedTurnOperation(
                        'terminal monster bypass cleanup',
                    ),
                    deferredGoto: unavailableElapsedTurnOperation(
                        'a deferred monster level transition',
                    ),
                });
                if (state.u.umovement >= NORMAL_SPEED) break;
            } while (monstersCanMove);
        } finally {
            state.context.mon_moving = false;
        }

        const runsOncePerTurnUpkeep =
            !monstersCanMove && state.u.umovement < NORMAL_SPEED;
        if (runsOncePerTurnUpkeep !== preflight.runsOncePerTurnUpkeep) {
            throw new Error(
                'elapsed-turn preflight disagreed with the live movement gate',
            );
        }
        if (runsOncePerTurnUpkeep) {
            ++upkeepCount;
            await finishElapsedTurn(state, random);
        }
    } while (state.u.umovement < NORMAL_SPEED);
    if (initialCapacity > 0 && upkeepCount !== preflight.upkeepCount) {
        throw new Error(
            'elapsed-turn preflight disagreed with live allocation count',
        );
    }

    // C runs the once-per-hero-action block outside both loops.
    await finishHeroTimeEffects(state, {
        random,
        encumberMessage: encumber_msg,
    });
    see_nearby_monsters(state);
}

// C ref: allmain.c moveloop_core()
export async function moveloop_core() {
    const g = game;

    // C gates its entire elapsed-time block on the preceding command's
    // context.move value. Capture that value before the next command dispatch
    // below (including an internal repeat) resets it optimistically.
    if (g.context?.move) {
        // C ref: allmain.c moveloop_core() has one elapsed path for every
        // turn, and so does this.
        await advanceElapsedTurn(g);
    }

    // C has a separate clear_splitobjs() at movemon()'s terminal boundary.
    // This one is the once-per-player-input owner from allmain.c, so it also
    // runs when no monster scan occurred or the prior command consumed no
    // time.
    clear_splitobjs(g);

    // Vision + display
    if (g.vision_full_recalc) {
        vision_recalc(0);
        g.vision_full_recalc = 0;
    }
    // Close the elapsed turn's display work before status calculation and
    // flushing can expose the completed frame.
    await emitGlyphUpdateNotices(g, { pline: ttyPline });
    find_ac(g);
    // C ref: allmain.c moveloop_core() (473-478). The status line repaints
    // only when a writer marked it dirty, and a turn on which only the counter
    // moved refreshes that one field. curs_on_u() is display.c's
    // flush_screen(1); C runs it in each arm and not at all when neither
    // holds, so a turn that marked nothing leaves the screen as it stands
    // until cmd.c parse() flushes before the next key.
    if (g.disp?.botl || g.disp?.botlx) {
        await bot();
        await flush_screen(1);
    } else if (g.disp?.time_botl) {
        await timebot();
        await flush_screen(1);
    }

    await runEveryTurnEffectWithRegionHooks(g.youmonst, {
        state: g,
        random: { d, rn1, rn2, rnd, rne, rnl, rnz },
    });
    // Close glyph work produced by region hooks before command dispatch.
    await emitGlyphUpdateNotices(g, { pline: ttyPline });

    // C ref: allmain.c moveloop_core(). A positive multi repeats the saved
    // command without another input boundary. For movement, values below
    // COLNO are remaining finite repeats; COLNO and above are the source's
    // run-until-stopped sentinel range and are not decremented here. Movement
    // repeats its established intent directly; other counted commands re-enter
    // rhack() with cmd_key.
    g.context.move = 1;

    // C ref: allmain.c moveloop_core() (485-509). While an occupation is set
    // and the hero is not helpless, the turn belongs to the occupation: C runs
    // the callback, clears go.occupation when it answers 0, and returns without
    // reading a key, so every turn of a multi-turn action passes through here
    // instead of rhack(). The MICRO/WIN32CON keyboard-abort arm inside it is
    // compiled out for the recorder's Unix build.
    //
    // The `gm.multi >= 0` guard is what suspends an occupation while the hero
    // is helpless; nomul() with a negative value is its only writer, and every
    // ported caller passes 0.
    if ((g.multi ?? 0) >= 0 && g.go?.occupation) {
        let finished;
        try {
            // C's callbacks read globals; this port's read the operations
            // their command path injects. eat.c eatfood() needs only bot(),
            // through the newuhs() call done_eating() makes.
            finished = await g.go.occupation(g, { statusRefresh: () => bot() });
        } catch (error) {
            // The occupation runs outside js/cmd.js failClosedCommand(), so a
            // refusal it raises would otherwise escape runSegment() as a hard
            // failure and discard the segment's matching prefix.
            if (failClosedCommandRefusals().some((t) => error instanceof t)) {
                throw new UnsupportedTurnBoundaryError(
                    `an occupation reached ${error.message}`,
                );
            }
            throw error;
        }
        if (finished === 0) g.go.occupation = null;
        if (monsterNearby(g)) {
            // C ref: `if (monster_nearby()) { stop_occupation(); reset_eat(); }`
            // at allmain.c:505-508. Which arm of stop_occupation() (684-696)
            // runs depends on whether the callback above just answered 0,
            // because the clear at 502 precedes this test.
            if (g.go.occupation) {
                // Still installed: stop_occupation() prints
                // You("stop %s.", go.occtxt) unless maybe_finished_meal()
                // finishes the meal instead, clears go.occupation, sets
                // disp.botl and calls nomul(0); reset_eat() then flags
                // victual.doreset so the next bite runs do_reset_eat().
                // Neither has a port, and the resumed meal that follows an
                // interruption needs doeat()'s already-partly-eaten arm,
                // which stops too.
                throw new UnsupportedTurnBoundaryError(
                    'an occupation interrupted by a nearby monster',
                );
            }
            // Already cleared: stop_occupation() reaches none of that and
            // takes `else if (gm.multi >= 0) nomul(0);` instead, and
            // reset_eat() (eat.c:308-318) is guarded by victual.eating, which
            // done_eating() zeroed on this same turn. C emits nothing here, so
            // the turn continues. stop_occupation()'s closing
            // cmdq_clear(CQ_CANNED) has no ported command queue.
            nomul(0, g);
        }
        await runmode_delay_output(g);
        return;
    }

    g.u.umoved = false;
    if ((g.multi ?? 0) > 0) {
        await lookaround(g);
        await runmode_delay_output(g);
        // lookaround() may clear multi.
        if (!g.multi) {
            g.context.move = 0;
            return;
        }
        if (g.context.mv) {
            if (g.multi < COLNO && !--g.multi) endRunning(g);
            await domove(g);
        } else {
            --g.multi;
            await rhack(g.cmdKey, g);
        }
    } else if ((g.multi ?? 0) === 0) {
        await rhack(0, g);
    }
    if (g.u.utotype)
        await runDeferredGotoAtTurnBoundary(g);
    // C ref: allmain.c moveloop_core():541, the second of the function's two
    // vision_recalc() calls. It runs after rhack() and before the next
    // iteration's monster movement, so a command that sets vision_full_recalc
    // -- teleds() and dismount_steed() both do -- has the flag cleared before
    // the monster scan reads it. Without this the scan would take
    // movemon_singlemon()'s own recalculation arm on the turn the command
    // charged, which C reaches only when movemon()'s tail sets the flag.
    if (g.vision_full_recalc) vision_recalc(0);
    // show_glyph() emits its accessibility pline before returning to the
    // command loop. Preserve that boundary for command-generated reveals even
    // when no later region or combat message forces an earlier drain.
    await emitGlyphUpdateNotices(g, { pline: ttyPline });
}

// C ref: allmain.c moveloop()
export async function moveloop(resuming) {
    vision_recalc(0);
    await docrt();
    await flush_screen(1);

    // C ref: allmain.c moveloop() runs until program_state.gameover. The only
    // writer in the port is js/jsmain.js's player-selection abort, which
    // returns before this loop starts, so every game-ending path currently
    // leaves through a thrown boundary instead. done() will restore the
    // in-play writer.
    for (;;) {
        await moveloop_core();
        if (game.program_state?.gameover) break;
    }
}

// C ref: allmain.c timet_delta(). The number of seconds between two time_t
// values, which C obtains from difftime().
export function timet_delta(etim, stim) {
    return etim - stim;
}
