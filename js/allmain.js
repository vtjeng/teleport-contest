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
    BLINDED,
    CLAIRVOYANT,
    COLNO,
    CQ_CANNED,
    LL_ACHIEVE,
    EXT_ENCUMBER,
    FAST,
    HALLUC,
    HALLUC_RES,
    HVY_ENCUMBER,
    INTRINSIC,
    MOD_ENCUMBER,
    NO_MM_FLAGS,
    NORMAL_SPEED,
    RLOC_NOMSG,
    SEARCHING,
    SLT_ENCUMBER,
    TELEPAT,
    TT_LAVA,
    UNENCUMBERED,
    WARNING,
    WARN_OF_MON,
} from './const.js';
import { acurr, exerchk } from './attrib.js';
import { makedog, see_nearby_monsters } from './dog.js';
import { mklev, l_nhcore_init } from './mklev.js';
import { u_on_upstairs } from './stairs.js';
import { m_at } from './monst.js';
import {
    adaptMonsterActionToDochugwSignature,
    decide_to_shapeshift,
    hideunder,
    mcalcdistress,
    mcalcmove,
    minliquid,
    movemon,
    movemon_singlemon,
    restrap,
    UnsupportedHideError,
    were_change,
} from './mon.js';
import {
    m_dowear,
    makemon_runtime,
    set_mimic_sym,
    UnsupportedMonsterCreationError,
} from './makemon_create.js';
import { init_objects } from './o_init.js';
import { maybe_shuffle_customizations } from './glyphs.js';
import { UnsupportedObjectNameError } from './objnam.js';
import { UnsupportedPotionError } from './potion.js';
import { UnsupportedObjectOperationError } from './obj.js';
import { UnsupportedMonsterPickupOperationError } from './steal.js';
import { objectGenerationHooks } from './object_generation.js';
import { reset_mvitals } from './monsters.js';
import { depth, init_dungeons } from './dungeon.js';
import { init_artifacts, mkot_trap_warn } from './artifacts.js';
import { role_init, welcomeIdentity, welcomeMessage } from './role_init.js';
import { livelog_printf } from './pline.js';
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
import { cmdq_clear, failClosedCommandRefusals, rhack } from './cmd.js';
import { deferred_goto } from './do.js';
import {
    domove,
    endRunning,
    end_running,
    lookaround,
    monster_nearby,
    near_capacity,
    nomul,
    pooleffects,
    overexert_hp,
    projected_capacity,
    runmode_delay_output,
    unmul,
} from './hack.js';
import { encumber_msg } from './pickup.js';
import {
    docrt,
    cls,
    bot,
    flush_screen,
    map_invisible,
    newsym,
    see_monsters,
    see_objects,
    see_traps,
    swallowed,
    timebot,
    UnsupportedMapMemoryError,
} from './display.js';
import {
    dismissPendingTtyMessage,
    displayPendingTtyMessageWindow,
    ttyNorep,
    ttyPline,
    ttyUrgentPline,
} from './tty_message.js';
import {
    canSeeMonster,
    emitGlyphUpdateNotices,
    emitStartupA11yNotices,
} from './startup_a11y.js';
import { u_wipe_engr } from './engrave.js';
import { check_special_room } from './rooms.js';
import { mnexto, rloc } from './teleport.js';
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
import { dosounds } from './sounds.js';
import {
    gethungry,
    maybe_finished_meal,
    preflightGetHungry,
    reset_eat,
    UnsupportedHungerTransitionError,
} from './eat.js';
import { UnsupportedEndOfGameError } from './end.js';
import { UnsupportedEnlightenmentError } from './insight.js';
import { UnsupportedShopError } from './shk.js';
import { UnsupportedVaultGuardError, invault } from './vault.js';
import { fightm } from './mhitm.js';
import {
    m_everyturn_effect,
    onscary,
    set_apparxy,
} from './monmove.js';
import {
    admitPlannedVisionChange,
    preflightElapsedTurnTail,
    preflightSimpleMonsterActions,
    runSimpleMonsterAction,
    UnsupportedSimpleMonsterActionError,
    wieldMonsterItemAgainstMonster,
} from './unported_monster_actions.js';
import {
    create_gas_cloud,
    run_regions,
} from './region.js';
import { note_unported } from './unported.js';
import {
    UnsupportedHeroTimeoutBoundaryError,
    nh_timeout,
    nh_timeout_requires_live_state,
    preflight_nh_timeout_elapsed_turn,
} from './timeout.js';
import { regen_hp, regen_pw } from './regen.js';
import { automatic_search, warnreveal } from './detect.js';
import { age_spells } from './spell.js';
import { settrack } from './track.js';
import { clear_splitobjs } from './obj.js';
import { makewish } from './zap.js';
import { clear_bypasses } from './worn.js';

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
    await u_on_upstairs();

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
    // C ref: allmain.c welcome(TRUE) also records the first major event.
    // The event uses the same identity text as the just-emitted welcome and
    // the current svm.moves value, which is 1 after u_init_role().
    livelog_printf(
        LL_ACHIEVE,
        `${g.plname} the ${welcomeIdentity(g)} entered the dungeon`,
        g,
    );
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

// C ref: allmain.c stop_occupation() (683-696). The single owner of "the hero
// stops what they were doing", for every caller that interrupts a multi-turn
// activity: makemon()'s and monmove.c dochugw()'s newly threatening monster,
// and moveloop_core()'s own monster_nearby() test after a turn of the activity.
//
// `env` carries the display operations that differ between the live game and an
// atomic planning clone. It is not only forwarded: maybe_finished_meal() passes
// it on to eatfood(), which owns the finished meal's object and message
// lifecycle, but this function also writes the `You stop %s.` line itself, so
// `message` is required whenever an occupation is installed. It is resolved by
// name rather than read directly because the two ways of getting it wrong fail
// in opposite directions: on this arm a missing `message` would be a bare
// TypeError, which js/jsmain.js does not convert, so the segment is discarded
// rather than ended; on the finished-meal arm it would fall through to
// eatOperations()'s `message = ttyPline` default and quietly write to the live
// terminal during a planning clone.
function requireOccupationOperation(env, name) {
    const operation = env?.[name];
    if (typeof operation !== 'function')
        throw new TypeError(`allmain.c stop_occupation() requires ${name}`);
    return operation;
}

export async function stop_occupation(state = game, env = {}) {
    if (state.go?.occupation) {
        const message = requireOccupationOperation(env, 'message');
        if (!await maybe_finished_meal(true, state, env)) {
            await message(`You stop ${state.go.occtxt}.`, state, env);
        }
        state.go.occupation = null;
        state.disp ??= {};
        state.disp.botl = true; /* in case u.uhs changed */
        nomul(0, state);
    } else if ((state.multi ?? 0) >= 0) {
        nomul(0, state);
    }
    // allmain.c:695. Outside both arms above, so an interruption that finds
    // no occupation and a negative multi still discards a canned sequence.
    cmdq_clear(CQ_CANNED, state);
}

// C ref: allmain.c maybe_generate_rnd_mon(). New monsters receive their
// movement only on the following allocation round because this gate follows
// the current round's monster movement allocation.
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
                ?? ((_monster, hookEnv) => stop_occupation(
                    hookEnv.state,
                    hookEnv,
                )),
        },
        random,
        state,
    });
}

// C ref: allmain.c moveloop_core() lines 360-361. The gate is C's, and so is
// the argument: rnd(3) is evaluated before u_wipe_engr() runs, and everything
// past that call -- the floor-reachability test and the wipe itself -- belongs
// to engrave.c and lives in js/engrave.js. Answers whether the rare wear
// branch fired, which is the only thing this gate decides.
export function maybeWipeHeroEngraving(
    state = game,
    random = { rn2, rnd },
) {
    const dexterity = acurr(state, A_DEX);
    if (random.rn2(40 + dexterity * 3) !== 0) return false;

    const count = random.rnd(3);
    u_wipe_engr(count, { state, random });
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
    if (!state.u.utrap || state.u.utraptype !== TT_LAVA) {
        if (!state.u.umoved) await pooleffects(false, state);
    }
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

// allmain.c:526 re-enters domove() for every turn of a run after the first,
// with rhack() off the stack. js/cmd.js failClosedCommand() cannot own a
// refusal raised here: it raises UnsupportedHeroCommandBoundaryError carrying
// a key, which advertises a retryable keystroke, and the rhack() call that
// started the run has already run its finally and deleted
// context.pendingCommand, so nothing can honour that. Convert to the turn
// boundary instead, as the deferred goto above and the occupation below do.
async function runDomoveAtTurnBoundary(state) {
    try {
        await domove(state);
    } catch (error) {
        if (!failClosedCommandRefusals().some(
            (type) => error instanceof type,
        )) {
            throw error;
        }
        throw new UnsupportedTurnBoundaryError(
            `a continued move reached ${error.message}`,
        );
    }
}

// allmain.c:383 calls unmul() from inside the once-per-turn block, so the
// ga.afternmv callback it runs is as far outside js/cmd.js failClosedCommand()
// as the deferred goto above. pray.c prayer_done() is the callback the port
// installs and it refuses six of its seven arms by name; without this
// conversion the first one reached would escape runSegment() as a hard failure
// and discard every screen the segment had already matched.
async function runUnmulAtTurnBoundary(state) {
    try {
        await unmul(null, state);
    } catch (error) {
        if (!failClosedCommandRefusals().some(
            (type) => error instanceof type,
        )) {
            throw error;
        }
        const boundary = new UnsupportedTurnBoundaryError(
            `a delayed action reached ${error.message}`,
        );
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

// C ref: allmain.c interrupt_multi() (975-983), which regen_hp():678 and
// regen_pw():617 reach when the hero regains the last hit point or the last
// power point during a multi-turn action. A run and a travel are deliberately
// exempt; every other positive multi is interrupted.
//
// A counted command reaches this. cmd.c rhack():3728-3729 installs a timed
// occupation with the repeats parse() left in gm.multi and clears neither
// context.run nor context.travel, so a counted `s` or `.` spanning the turn
// the hero tops up leaves exactly the state the guard admits. The test named
// 'a counted occupation leaves the state interrupt_multi() acts on', in
// scripts/count-prefix.test.mjs, pins that, so the claim cannot go stale
// unnoticed again.
//
// C ends the count before it prints, and ending it does not clear the
// occupation. hack.c nomul() (4160-4173) writes disp.botl, u.uinvulnerable,
// u.usleep, gm.multi, gm.multi_reason and gm.multireasonbuf and then calls
// end_running(TRUE) and cmdq_clear(CQ_CANNED) -- js/hack.js nomul() ports all
// of it -- and go.occupation appears nowhere in that list. So
// moveloop_core():485 still finds the occupation installed on the following
// turn and runs it once more. cmd.c timed_occupation() then finds no repeat
// left to spend and answers 0, which is what clears it. A counted `s`
// therefore searches one last time after the line prints.
//
// `norepMessage` is Norep()'s owner. finishElapsedTurn() substitutes a silent
// one while it dry-runs a burdened turn on the clone, as it does for every
// other line that block can write. Resolving it before nomul(0) keeps a caller
// that omitted the seam from ending the count and then failing on the line.
export async function interrupt_multi(message, state, env = {}) {
    if (!((state.multi ?? 0) > 0)
        || state.context.travel || state.context.run) {
        return;
    }
    const printing = Boolean(state.flags?.verbose && message);
    if (printing && typeof env.norepMessage !== 'function') {
        throw new TypeError(
            'allmain.c interrupt_multi() requires norepMessage',
        );
    }
    nomul(0, state);
    if (printing) await env.norepMessage(message, state);
}

function regionEffectEnv(state, random, { planning = false } = {}) {
    // C's run_regions() mutates the active level even while the elapsed-turn
    // preflight is running.  A planned turn owns a cloned level, so preserve
    // those mutations there while suppressing only the terminal operations;
    // drawing or printing from the clone would consume live output/input
    // before the real pass replays the same callbacks.
    const silentDisplay = async () => {};
    return {
        state,
        random,
        blockPoint: (x, y) => {
            if (planning) admitPlannedVisionChange(x, y, state);
            return block_point(x, y, state);
        },
        unblockPoint: (x, y) => {
            if (planning) admitPlannedVisionChange(x, y, state);
            return unblock_point(x, y, state);
        },
        doesBlock: (x, y, location) => does_block(
            x,
            y,
            location,
            state,
        ),
        canSee: (x, y) => cansee(x, y, state),
        newsym: planning ? () => {} : (x, y) => newsym(x, y),
        message: planning ? silentDisplay : (message) => ttyPline(message, state),
    };
}

async function runEveryTurnEffectWithRegionHooks(monster, env) {
    const regionEnv = regionEffectEnv(env.state, env.random, {
        planning: env.planning,
    });
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
    return minliquid(monster, {
        ...env,
        state: env.state,
        canSee: (x, y) => cansee(x, y, env.state),
        message: env.planning ? async () => {} : ttyPline,
        unsupported: unavailableElapsedTurnOperation(
            'monster liquid effect',
        ),
        // minliquid() uses rloc()'s result to decide whether its liquid
        // effect is finished. Keep the relocation on the elapsed-turn state
        // and provide the complete teleport.c hook set for both the planning
        // and live passes.
        relocateMonster: (subject, flags, relocationEnv) => rloc(
            subject,
            flags,
            {
                ...relocationEnv,
                state: env.state,
                random: relocationEnv.random ?? env.random,
                message: env.planning ? async () => {} : ttyPline,
                newsym: env.planning
                    ? () => {}
                    : (x, y) => newsym(x, y, env.state),
                onscary: (x, y, target) => onscary(
                    x,
                    y,
                    target,
                    env.state,
                ),
                setApparxy: (target, setEnv) => set_apparxy(target, {
                    ...setEnv,
                    state: env.state,
                    random: relocationEnv.random ?? env.random,
                }),
            },
        ),
        // C discards both inventory-chain return values. The chain owners
        // remain unported, so record their exact source calls and continue
        // the minliquid branch rather than turning a valid monster effect
        // into an elapsed-turn refusal.
        fireDamageChain: () => note_unported('trap.c fire_damage_chain'),
        waterDamageChain: () => note_unported('trap.c water_damage_chain'),
        // C discards deal_with_overcrowding()'s result. Its remaining level
        // transition branches are outside this span, so name and skip that
        // discarded call after rloc() has returned false.
        dealWithOvercrowding: () => note_unported(
            'mon.c deal_with_overcrowding',
        ),
        hooks: {
            ...(env.hooks ?? {}),
            newsym: env.planning ? () => {} : (x, y) => newsym(x, y),
        },
    });
}

export async function finishElapsedTurn(
    state,
    random,
    { planning = false, randomMonsterOnly = false } = {},
) {
    // Every message and status seam this block hands a callee is one of these
    // three, so the planning and live arms are chosen once rather than per
    // callee. Three further values follow the same rule at their single call
    // site: mcalcdistress()'s redrawSquare and visionRecalc below, and the
    // regionEnv that run_regions() consumes. The dry run works on a clone
    // whose state is discarded: a line it writes paints text the live pass
    // never wrote, ttyPline() on a turn whose clone still carries a pending
    // message reaches dismissPendingTtyMessage() and consumes a key the
    // segment still needs, and bot() reads the live game rather than the
    // clone. scripts/allmain-turn.test.mjs's 'a planned timeout writes no line
    // and reads no key' pins turnMessage through do.c heal_legs(), which
    // nh_timeout() reaches below.
    const silentDisplay = async () => {};
    const turnMessage = planning ? silentDisplay : ttyPline;
    const turnNorep = planning ? silentDisplay : ttyNorep;
    const turnStatusRefresh = planning ? silentDisplay : () => bot();
    // C ref: allmain.c moveloop_core()'s mvl_wtcap, taken once after the
    // monster loop. C reuses this snapshot only for u_calc_moveamt(),
    // regen_hp(), regen_pw(), and the overexertion check, and substitutes
    // UNENCUMBERED for the last two when the hero is invulnerable. eat.c
    // gethungry() and attrib.c exerper() each call near_capacity() themselves,
    // so they get a live evaluator below rather than this value, which
    // nh_timeout() and the hunger transition can already have invalidated.
    const wtcap = near_capacity(state);
    state.gw.were_changes = 0;
    await mcalcdistress(state, {
        state,
        random,
        planning,
        message: turnMessage,
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
    const planningDisplayRandom = planning
        ? state.displayCtx
            ? createCoreRandom(state.displayCtx, state).rn2
            : () => {
                throw new TypeError(
                    'planned monster naming requires initialized display RNG',
                );
            }
        : undefined;
    // A random mimic can be born during this cloned allocation. makemon.c
    // set_mimic_sym() rebuilds vision after choosing a blocking disguise, so
    // run that tail against the cloned monster map and mark the borrowed
    // transparency index for preflightSimpleMonsterActions() to restore.
    const planningCreationVisionHooks = planning ? {
        doesBlock: (x, y, location, normalized) => does_block(
            x,
            y,
            location,
            normalized.state,
        ),
        blockPoint: (x, y, normalized) => {
            admitPlannedVisionChange(x, y, normalized.state);
            block_point(x, y, normalized.state);
        },
    } : null;
    await maybe_generate_rnd_mon(state, {
        random,
        displayRandom: planningDisplayRandom,
        hooks: planningCreationVisionHooks,
        message: turnMessage,
        norepMessage: turnNorep,
        statusRefresh: turnStatusRefresh,
    });
    // planSimpleMonsterTurn() treats a truthy advanceRound result as "this
    // single unburdened allocation is fully preflighted" and must not plan a
    // second allocation that the live hero will not need.
    if (randomMonsterOnly && !nh_timeout_requires_live_state(state)) return true;
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

    // The timer queue's refusal is decided twice before this call: here on the
    // dry run, and again by the preflight_nh_timeout_elapsed_turn() call in
    // advanceElapsedTurn(), against the turn being entered. Neither verdict
    // survives the live monster scan that runs between them. mon.c
    // mpickstuff() is ported, and its corpse filter (js/monmove.js, over
    // mon.c:1875-1880) lets an M1_COLLECT monster take an acidic or petrifying
    // corpse off the floor; the corpse's ROT_CORPSE element stays in the queue
    // at the same expiry, because js/obj.js calls obj_timer_checks() only for
    // a nonzero `timed` and that function acts only on ice. So a turn the
    // preflight admitted can reach the drain with the corpse at OBJ_MINVENT,
    // which run_timers() refuses.
    //
    // advanceElapsedTurn() converts that refusal around its call to this
    // function, so the segment ends on its last matching screen instead of
    // being discarded whole.
    const liveTimeout = nh_timeout_requires_live_state(state);
    if (planning && liveTimeout) return { beforeTimeout: true };
    await nh_timeout(state, {
        planning,
        random,
        message: turnMessage,
        norepMessage: turnNorep,
        statusRefresh: turnStatusRefresh,
        // dig.c rot_corpse() redraws the square it cleared. The dry run works
        // on a clone whose objects are copies, so its rotting is discarded
        // with the clone -- but newsym() paints the live map whatever state it
        // is handed, so the clone must draw nothing.
        newsym: planning ? () => {} : newsym,
    });
    // C's fatal timeout never reaches the remaining upkeep. JS's end-game
    // owner returns so the recorder can retain its final capture.
    if (state.program_state?.gameover) return { afterTimeout: liveTimeout };
    if (liveTimeout) {
        const tailPlan = await preflightElapsedTurnTail(
            state,
            (planned, planningRandom) => finishElapsedTurnAfterTimeout(
                planned, planningRandom, wtcap, { planning: true },
            ),
        );
        const result = await finishElapsedTurnAfterTimeout(state, random, wtcap);
        if (tailPlan?.beforeUnmul && !result?.afterUnmul)
            throw new Error('elapsed-turn timeout tail disagreed with live delayed action');
        return { ...result, afterTimeout: true };
    }
    return finishElapsedTurnAfterTimeout(state, random, wtcap, { planning });
}

// C ref: allmain.c moveloop_core(), immediately after nh_timeout through
// negative-multi release. wtcap is the allocation's earlier mvl_wtcap, not a
// fresh capacity calculation after a timeout changes equipment or form.
async function finishElapsedTurnAfterTimeout(
    state, random, wtcap, { planning = false } = {},
) {
    const silentDisplay = async () => {};
    const turnMessage = planning ? silentDisplay : ttyPline;
    const turnNorep = planning ? silentDisplay : ttyNorep;
    const turnStatusRefresh = planning ? silentDisplay : () => bot();
    // C allmain.c calls run_regions() immediately after nh_timeout() on every
    // turn. Planned elapsed turns use the same source-ordered callbacks on
    // their cloned level; regionEffectEnv silences only the clone's drawing
    // and messages so the live pass remains the first terminal write.
    const regionEnv = regionEffectEnv(state, random, { planning });
    await run_regions(regionEnv);

    if (state.u.ublesscnt) state.u.ublesscnt--;
    // Both regenerators reach allmain.c interrupt_multi() on the turn they top
    // the hero up, and its Norep() is the only output either of them can make,
    // so they share one env.
    const regenEnv = {
        random,
        interruptMulti: interrupt_multi,
        norepMessage: turnNorep,
    };
    // C ref: allmain.c substitutes UNENCUMBERED for an invulnerable hero
    // instead of healing, and the two consumers below then read the
    // substituted value rather than the snapshot taken above.
    if (state.u.uinvulnerable) wtcap = UNENCUMBERED;
    else await regen_hp(wtcap, state, regenEnv);
    // C ref: allmain.c's "moving around while encumbered is hard work" block,
    // between regen_hp() and regen_pw(). The gate is allmain.c's; what it
    // guards is hack.c overexert_hp(), whose port lives in js/hack.js and
    // stops only for the arm that prints, exercises Constitution and faints.
    // Only a burdened hero can reach wtcap > MOD_ENCUMBER, and a burdened turn
    // is planned on the clone first, which runs this block too: a hero already
    // down to one hit point refuses there, and advanceElapsedTurn() converts
    // that refusal into the turn's boundary before the live pass starts. So
    // the live pass arrives here with a point to spare and spends it, marking
    // the status line for redraw. scripts/allmain-turn.test.mjs's "heavy, 30th
    // turn, healthy" row asserts that decrement.
    if (wtcap > MOD_ENCUMBER && state.u.umoved
        && !(wtcap < EXT_ENCUMBER
            ? state.moves % 30
            : state.moves % 10)) {
        overexert_hp(
            state,
            () => elapsedTurnBoundary('overexertion hit point loss'),
        );
    }
    await regen_pw(wtcap, state, regenEnv);

    // C ref: allmain.c moveloop_core():342-346. A Ranger or an Archeologist
    // holds SEARCHING from experience level 1 (js/attrib.js ran_abil and
    // arc_abil), so automatic searching runs on every turn that hero takes;
    // the following Warning arm then reveals nearby hidden threats through
    // detect.c warnreveal(). UnsupportedSearchError remains limited to the
    // explicit `s` command's unported terrain/trap branches and is converted
    // by js/cmd.js at that command boundary.
    //
    // detect.c:2079-2088, the trap block, is the one C does not gate on aflag,
    // and js/detect.js preflightTrap() refuses its two unported branches --
    // activate_statue_trap() and find_trap()'s hallucinatory display -- as
    // plain Errors that would escape runSegment(). Neither is recordable yet:
    // a statue trap needs level_difficulty() >= 8 (js/mktrap.js traptype_rnd())
    // or a Statuary theme room, and across seeds 1-6000 no D:1 Statuary placed
    // an unseen statue trap within a ten-step same-room walk of a Ranger's
    // arrival square, while hallucination has no D:1 source this port reaches.
    // Give them the boundary class, and this seam its catch, when a recorded
    // case reaches one.
    const searchEnv = {
        state,
        random,
        planning,
        // A planning clone must not repaint the live terminal.  The
        // discovery state changes still run on the clone through
        // detect.c's mfind0() and warning reveal path.
        newSym: planning ? () => {} : (x, y) => newsym(x, y),
    };
    if (propertyActive(state, SEARCHING)
        && !state.level.flags?.noautosearch
        && (state.multi ?? 0) >= 0) {
        if (planning)
            elapsedTurnBoundary('burdened multi-cycle automatic search');
        await automatic_search(searchEnv);
    }
    if (propertyActive(state, WARNING)) {
        await warnreveal({
            ...searchEnv,
        });
    }
    // C ref: allmain.c:351 mkot_trap_warn(). Sense traps near the hero when
    // wielding the Master Key of Thievery without gloves.
    await mkot_trap_warn(state);
    await dosounds(state, {
        random: random.rn2,
        pline: turnMessage,
    });
    await gethungry(state, {
        random,
        // eat.c gethungry() calls near_capacity() live at its accessory-time
        // branch, before newuhs() can lower capacity.
        nearCapacity: () => near_capacity(state),
        message: turnMessage,
        endRunning,
        statusRefresh: turnStatusRefresh,
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
        // encumber_msg()'s own default message is ttyPline, so naming the
        // seam changes nothing on the live pass and silences the dry run.
        encumberMessage: (subject) => encumber_msg(
            subject,
            { message: turnMessage },
        ),
        message: turnMessage,
    });
    await invault(state, {
        random,
        message: turnMessage,
        makemon_runtime,
        stopOccupation: () => stop_occupation(state),
        unmul: (msg) => unmul(msg, state),
    });
    maybeWipeHeroEngraving(state, random);

    // C ref: allmain.c moveloop_core() (379-388), the last statement of the
    // once-per-turn block. C's two intervening blocks -- the u.uevent.udemigod
    // countdown into intervene(), and movebubbles()/fumaroles() -- have no port
    // and could not act on this level anyway, so this stays last here too.
    //
    // "when immobile, count is in turns": nomul() with a negative value buys
    // that many turns during which moveloop_core() reads no key, and this is
    // what spends them. runmode_delay_output() draws one animation frame per
    // turn, exactly as it does for a run.
    if ((state.multi ?? 0) < 0) {
        // Count elapsed turns on the clone, but leave animation, the release
        // message and arbitrary afternmv callbacks to the live pass. A due
        // unmul ends this plan: after replaying the validated prefix, the
        // coordinator plans any remaining movement from the callback's real
        // result, including changes to burden, speed or the level.
        if (!planning) await runmode_delay_output(state);
        if (++state.multi === 0) { /* finished yet? */
            if (planning) return { beforeUnmul: true };
            await runUnmulAtTurnBoundary(state);
            /* if unmul caused a level change, take it now */
            if (state.u.utotype)
                elapsedTurnBoundary('a level change deferred by unmul()');
            return { afterUnmul: true };
        }
    }
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
        UnsupportedHideError,
        UnsupportedHeroTimeoutBoundaryError,
        UnsupportedHungerTransitionError,
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
        // muse.c use_offensive() hurls a potion that potion.c potionhit()
        // breaks on the hero, so its potionbreathe() tail now runs inside the
        // monster scan. The vapor arms this port leaves unported raise the
        // first class; the trycall() below them raises the second for a type
        // the hero has neither identified nor already called something.
        UnsupportedPotionError,
        // mon.c mondead() forgets the invisible-monster marker through
        // display.c unmap_object(), which refuses an engraved square. A
        // monster dying on a square that carries both reaches that refusal
        // from inside the monster scan, where the previous code raised the
        // injected refusal of the first class above.
        UnsupportedMapMemoryError,
    ];
}

const runElapsedTurnMonsterAction =
    adaptMonsterActionToDochugwSignature(runSimpleMonsterAction);

async function moveElapsedTurnMonster(monster, env) {
    return movemon_singlemon(monster, {
        ...env,
        everyTurnEffect: runEveryTurnEffectWithRegionHooks,
        visionRecalc: vision_recalc,
        clearBypasses: (subjectEnv) => clear_bypasses(subjectEnv),
        minLiquid: elapsedTurnMinLiquid,
        // C ref: mon.c movemon_singlemon():1268-1281. A monster whose gear
        // was flagged for reassessment reruns the complete worn.c m_dowear()
        // family before the rest of its movement turn.
        dowear: (subject, creation, subjectEnv) => m_dowear(
            subject,
            creation,
            subjectEnv,
        ),
        // C ref: mon.c restrap(). The planning scan binds the same
        // set_mimic_sym() implementation, so the two passes take the same
        // branches and spend the same draws. This live binding also preserves
        // makemon.c set_mimic_sym()'s final visibility-blocking update against
        // the live monster map.
        restrap: (subject, subjectEnv) => restrap(subject, {
            ...subjectEnv,
            setMimicSym: (mimic, mimicEnv) => set_mimic_sym(mimic, {
                ...mimicEnv,
                hooks: {
                    ...(mimicEnv.hooks ?? {}),
                    doesBlock: (x, y, location, normalized) => does_block(
                        x,
                        y,
                        location,
                        normalized.state,
                    ),
                    blockPoint: (x, y, normalized) => block_point(
                        x,
                        y,
                        normalized.state,
                    ),
                },
            }),
        }),
        canSeeMonster: (subject) => canSeeMonster(subject, env.state),
        // C ref: mon.c movemon_singlemon():1295-1303 and hideunder():4726-4801.
        // The planning scan binds the same function, so the two passes take
        // the same branches. This live binding is the one that owes the
        // newsym() C calls when the eel's mundetected changes.
        hideUnder: (subject, subjectEnv) => hideunder(subject, {
            ...subjectEnv,
            redraw: (x, y) => newsym(x, y),
        }),
        canSeeHero: () => true,
        canSeeSquare: (x, y) => cansee(x, y, env.state),
        fightMonster: (subject, subjectEnv) => fightm(subject, {
            ...subjectEnv,
            message: ttyPline,
            markInvisible: (x, y) => map_invisible(x, y, env.state),
            redraw: (x, y) => newsym(x, y),
            wieldMonsterItemAgainstMonster,
            unsupported: unavailableElapsedTurnOperation('conflict combat'),
        }),
        dochugwAction: runElapsedTurnMonsterAction,
    });
}

// Validate a movement prefix without running a due unmul callback. Resuming
// after that callback must not debit another hero ration.
async function planElapsedTurn(state, {
    consumeHeroRation = true,
    afterMonsterScan = false,
} = {}) {
    const initialCapacity = projected_capacity(state);
    let preflight;
    try {
        preflight = await preflightSimpleMonsterActions(state, {
            consumeHeroRation,
            afterMonsterScan,
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
    // A planned MonsterDeathPlanningError is returned as heroDeath rather
    // than caught above. Its presence is the atomic handoff: the live scan
    // below intentionally replays the selected monster action, where the
    // real state enters done_in_by() with the same DIED result.
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
    if (preflight.runsOncePerTurnUpkeep && !preflight.beforeTimeout) {
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
            }, { newsym });
        } catch (error) {
            if (!(error instanceof UnsupportedHeroTimeoutBoundaryError))
                throw error;
            const boundary = new UnsupportedTurnBoundaryError(error.message);
            boundary.reason = error.reason;
            throw boundary;
        }
    }
    return { ...preflight, initialCapacity };
}

// C ref: allmain.c moveloop_core(), elapsed turn. Monster movement can require
// multiple complete list scans while the hero lacks a ration. A fast hero's
// retained ration ends the scan even when a fast pet could act again;
// once-per-turn upkeep waits until both sides are out. This serves the first
// elapsed command and every subsequent elapsed command.
async function advanceElapsedTurn(state) {
    let preflight = await planElapsedTurn(state);
    const random = { d, rn1, rn2, rnd, rne, rnl, rnz };

    // A lethal monster action stops the planning clone before movemon() has
    // returned its scan result. The live pass must replay that action first,
    // including any life-saving recovery, then plan the continuation from the
    // post-scan state. Keep this separate from the movement gate: the
    // preflight's false gate is only the result of the early planning exit.
    let pendingDeathReplan = Boolean(preflight.heroDeath);
    let upkeepCount = 0;
    const replanContinuation = async ({ afterMonsterScan = false } = {}) => {
        const completedUpkeeps = upkeepCount;
        const resumed = await planElapsedTurn(state, {
            consumeHeroRation: false,
            afterMonsterScan,
        });
        preflight = {
            ...resumed,
            // preflightSimpleMonsterActions() reports only the suffix it was
            // able to scan. The live side has already completed the prefix;
            // rebase the expected count so the final source gate compares the
            // same complete allocation sequence on both sides.
            initialCapacity: preflight.initialCapacity,
            upkeepCount: completedUpkeeps + resumed.upkeepCount,
        };
        pendingDeathReplan = Boolean(resumed.heroDeath);
    };

    // C ref: allmain.c moveloop_core().  The outer loop repeats while the hero
    // still cannot move; the inner one runs monsters until either they are out
    // of rations or the hero regains one.  The once-per-turn block runs only
    // when both sides are out, which is why the gate carries !monstersCanMove
    // as well as the movement test.
    state.u.umovement -= NORMAL_SPEED;
    do {
        await encumber_msg(state);
        state.context.mon_moving = true;
        let monstersCanMove;
        try {
            do {
                let completedDeferredGoto = false;
                monstersCanMove = await movemon({
                    state,
                    random,
                    moveSingleMonster: moveElapsedTurnMonster,
                    clearBypasses: (subjectEnv) => clear_bypasses(subjectEnv),
                    // C ref: mon.c movemon():1343-1347. quest.c expulsion()
                    // schedules the hero's departure from inside the monster
                    // scan, so movemon()'s own tail performs it. The dry run
                    // deliberately stops short of it: generating a level
                    // against the cloned ISAAC context would cost as much as
                    // the live transition and answer nothing the live pass
                    // does not, so this transition is the one part of the
                    // turn whose refusals surface live.
                    deferredGoto: async (env) => {
                        await runDeferredGotoAtTurnBoundary(env.state);
                        completedDeferredGoto = true;
                    },
                });
                // C's terminal death path eventually longjmps out through
                // really_done(), but done_in_by() itself returns after a
                // life-saving recovery (end.c:185). js/end.js returns from
                // the terminal end-game display so replay can capture its
                // final window; stop only after that completed gameover path.
                if (state.program_state?.gameover) return;
                if (completedDeferredGoto || preflight.deferredGoto) {
                    // Resume at the live scan's source gate. A transition can
                    // be scheduled by its last actor; a wizard's answer to the
                    // quest alignment prompt can also avert the transition
                    // projected by the silent plan. In either case, use the
                    // live result to decide whether another scan is due.
                    await replanContinuation({
                        afterMonsterScan: !monstersCanMove
                            || state.u.umovement >= NORMAL_SPEED,
                    });
                } else if (pendingDeathReplan
                    && monstersCanMove
                    && state.u.umovement < NORMAL_SPEED) {
                    // The live scan replayed the lethal action and completed
                    // any recovery. Plan the next scan from that state.
                    await replanContinuation();
                }
                if (state.u.umovement >= NORMAL_SPEED) break;
            } while (monstersCanMove);
        } catch (error) {
            // A supported monster prefix can print before its next operation
            // refuses. Preserve that output through the gameplay boundary,
            // just as the preflight conversion above preserves an atomic
            // refusal before the live pass starts. The normal lethal monster
            // arm reaches done_in_by() here; its existing end.c boundary is
            // converted only after the real killer and death entry are set.
            // Below that entry, end.c really_done() settles with the level's
            // shopkeepers, vault guard and priests through paybill(), paygd()
            // and clearpriests(), whose unported arms raise the last three
            // classes; the planning pass never runs really_done(), so this
            // catch is the only one between them and js/jsmain.js.
            const liveScanRefusals = [
                UnsupportedSimpleMonsterActionError,
                UnsupportedEndOfGameError,
                // disclose() now reaches enlightenment() after the
                // container walk; an unported status property
                // (e.g. SLEEPY) raises this from inside really_done().
                UnsupportedEnlightenmentError,
                UnsupportedShopError,
                UnsupportedVaultGuardError,
                UnsupportedMonsterCreationError,
            ];
            if (!liveScanRefusals.some((type) => error instanceof type))
                throw error;
            const boundary = new UnsupportedTurnBoundaryError(error.message);
            boundary.reason = error.reason;
            throw boundary;
        } finally {
            state.context.mon_moving = false;
        }

        const runsOncePerTurnUpkeep =
            !monstersCanMove && state.u.umovement < NORMAL_SPEED;
        if (!pendingDeathReplan
            && runsOncePerTurnUpkeep !== preflight.runsOncePerTurnUpkeep) {
            throw new Error(
                'elapsed-turn preflight disagreed with the live movement gate',
            );
        }
        if (runsOncePerTurnUpkeep) {
            ++upkeepCount;
            let afterUnmul;
            let afterTimeout;
            try {
                const result = await finishElapsedTurn(state, random);
                afterUnmul = result?.afterUnmul;
                afterTimeout = result?.afterTimeout;
            } catch (error) {
                // A live-only timeout and its fresh tail can reach existing
                // command or upkeep refusals after the prefix has completed.
                // Preserve that prefix through the normal gameplay boundary;
                // unexpected errors, including TypeErrors, still escape.
                if (![...elapsedTurnPlanningRefusals(), ...failClosedCommandRefusals()].some(
                    (type) => error instanceof type,
                ))
                    throw error;
                const boundary = new UnsupportedTurnBoundaryError(
                    error.message,
                );
                boundary.reason = error.reason;
                throw boundary;
            }
            if (state.program_state?.gameover) return;
            if (preflight.beforeUnmul
                && upkeepCount === preflight.upkeepCount && !afterUnmul) {
                throw new Error(
                    'elapsed-turn preflight disagreed with live delayed action',
                );
            }
            if (preflight.beforeTimeout
                && upkeepCount === preflight.upkeepCount && !afterTimeout) {
                throw new Error(
                    'elapsed-turn preflight disagreed with live timeout',
                );
            }
            if (!pendingDeathReplan
                && (afterUnmul || afterTimeout)
                && state.u.umovement < NORMAL_SPEED) {
                preflight = await planElapsedTurn(state, {
                    consumeHeroRation: false,
                });
                pendingDeathReplan = Boolean(preflight.heroDeath);
                upkeepCount = 0;
            }
            if (pendingDeathReplan && state.u.umovement < NORMAL_SPEED) {
                await replanContinuation();
            }
        }
    } while (state.u.umovement < NORMAL_SPEED);
    if (!pendingDeathReplan
        && preflight.initialCapacity > 0
        && upkeepCount !== preflight.upkeepCount) {
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

    maybe_shuffle_customizations(g);

    // C allmain.c:194 clears object bypass marks before deciding whether this
    // input advances elapsed time. This is separate from movemon()'s tail, so
    // a command with no monster scan still consumes the pending cleanup.
    if (g.context?.bypasses)
        clear_bypasses(g);

    // C gates its entire elapsed-time block on the preceding command's
    // context.move value. Capture that value before the next command dispatch
    // below (including an internal repeat) resets it optimistically.
    if (g.context?.move) {
        // C ref: allmain.c moveloop_core() has one elapsed path for every
        // turn, and so does this.
        await advanceElapsedTurn(g);
    }
    // C's done_in_by() is NORETURN: nh_terminate() exits the process, so
    // nothing after the fatal monster action runs. The JS port returns
    // normally from advanceElapsedTurn() with gameover set. Skip every
    // post-turn effect — vision, bot, rhack — so the terminal stays on the
    // topten display that tty_raw_print wrote inside really_done().
    if (g.program_state?.gameover) return;

    // C has a separate clear_splitobjs() at movemon()'s terminal boundary.
    // This one is the once-per-player-input owner from allmain.c, so it also
    // runs when no monster scan occurred or the prior command consumed no
    // time.
    clear_splitobjs(g);

    // C ref: allmain.c moveloop_core() (445-450). Picking up the Amulet
    // schedules exactly one wish at the next once-per-input boundary. The
    // urgent message must be emitted before makewish() reads the next key;
    // otherwise the pending arrival --More-- consumes that key instead and
    // shifts every later wish prompt and screen.
    if (g.u.uhave?.amulet && !g.u.uevent?.amulet_wish) {
        g.u.uevent ??= {};
        g.u.uevent.amulet_wish = 1;
        await displayPendingTtyMessageWindow(g);
        await ttyUrgentPline(
            'The Amulet is bestowing a wish upon you!',
            g,
        );
        await makewish(g);
    }

    // Vision + display
    if (g.vision_full_recalc) {
        vision_recalc(0);
        g.vision_full_recalc = 0;
    }
    // Close the elapsed turn's display work before status calculation and
    // flushing can expose the completed frame.
    await emitGlyphUpdateNotices(g, { pline: ttyPline });
    find_ac(g);
    // C ref: allmain.c moveloop_core() (474-485). When the hero cannot move
    // this input, hallucination repaints the visible monster/object/trap
    // layers and redraws the swallowed stomach. The latter bypasses newsym(),
    // so the swallowed guard alone is not enough: omitting this branch leaves
    // the stale pre-hallucination DEC/Unicode stomach on the terminal.
    const hallucination = g.u.uprops?.[HALLUC];
    const hallucinating = Boolean(
        hallucination?.intrinsic
        && !hallucination?.blocked
        && !propertyActive(g, HALLUC_RES),
    );
    const blind = Boolean(g.u.uprops?.[BLINDED]?.intrinsic
        || g.u.uprops?.[BLINDED]?.extrinsic)
        && !g.u.uprops?.[BLINDED]?.blocked;
    if (!g.context?.mv || blind) {
        if (hallucinating) {
            see_monsters(g);
            see_objects(g);
            see_traps(g);
            if (g.u.uswallow) await swallowed(false, g);
        } else if (Boolean(g.u.uprops?.[TELEPAT]?.extrinsic)
            || propertyActive(g, WARNING)
            || propertyActive(g, WARN_OF_MON)
            || (g.level?.regions ?? []).some((region) => (
                region.visible && region.ttl !== -2
            ))) {
            // allmain.c:462-467. These sensing modes need only the monster
            // overlay; objects and traps retain their ordinary memory.
            see_monsters(g);
        }
    }
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
    // is helpless. nomul() with a negative value is the only writer that can
    // fail it, and js/pray.js dopray()'s `nomul(-3)` is the port's one such
    // caller. It cannot yet reach this guard: the block below returns before
    // rhack(), so no command starts while an occupation is set, and no ported
    // occupation makes multi negative on its own. The guard is written out
    // because it is C's.
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
        if (monster_nearby(g)) {
            // C ref: `if (monster_nearby()) { stop_occupation(); reset_eat(); }`
            // at allmain.c:505-508. Which arm of stop_occupation() (683-696)
            // runs depends on whether the callback above just answered 0,
            // because the clear at 500 precedes this test. A cleared occupation
            // takes `else if (gm.multi >= 0) nomul(0);` and prints nothing, and
            // reset_eat() is then inert too, because done_eating() zeroed
            // victual.eating on the same turn.
            await stop_occupation(g, {
                message: ttyPline,
                statusRefresh: () => bot(),
            });
            reset_eat(g);
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
            if (g.multi < COLNO && !--g.multi) end_running(true, g);
            await runDomoveAtTurnBoundary(g);
        } else {
            --g.multi;
            await rhack(g.cmdKey, g);
        }
    } else if ((g.multi ?? 0) === 0) {
        await rhack(0, g);
    }
    // C ref: save.c dosave():65 calls nh_terminate(EXIT_SUCCESS) and never
    // returns to moveloop_core(). The JS port returns normally with
    // program_state.gameover set. Skip every post-command effect so the
    // terminal stays on the exit_nhwindows farewell screen, matching the
    // C recorder's final capture inside nh_terminate().
    if (g.program_state?.gameover) return;
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
