// allmain.js — Main game loop.
// C ref: allmain.c — newgame, moveloop, moveloop_core.
//
// The implemented command boundary uses one source-derived elapsed-turn path.
// Unsupported command branches stop before live state changes, and an
// unsupported branch of the elapsed turn stops the segment where the turn
// reaches it; UUID, notice, and glyph-map setup remain to be ported.

import { cliparound } from './wintty.js';
import { getnow, night } from './calendar.js';
import { game } from './gstate.js';
import {
    A_DEX,
    COLNO,
    CQ_CANNED,
    CQ_REPEAT,
    LL_ACHIEVE,
    EXT_ENCUMBER,
    HVY_ENCUMBER,
    MOD_ENCUMBER,
    NO_MM_FLAGS,
    NORMAL_SPEED,
    NON_PM,
    POLY_NOFLAGS,
    RLOC_NOMSG,
    RUN_TPORT,
    SLT_ENCUMBER,
    TT_LAVA,
    UNENCUMBERED,
    Upolyd,
    ismnum,
} from './const.js';
import { acurr, exerchk } from './attrib.js';
import {
    makedog, see_nearby_monsters,
} from './dog.js';
import { mklev, l_nhcore_init } from './mklev.js';
import { run_end_turn_callbacks } from './nhlua.js';
import { u_on_upstairs } from './stairs.js';
import { m_at } from './monst.js';
import {
    adaptMonsterActionToDochugwSignature,
    decide_to_shapeshift,
    hideunder,
    mcalcdistress,
    mcalcmove,
    minliquid,
    mnexto,
    movemon,
    movemon_singlemon,
    restrap,
    were_change,
} from './mon.js';
import {
    m_dowear,
    makemon_runtime,
    set_mimic_sym,
} from './makemon_create.js';
import { init_objects } from './o_init.js';
import { maybe_shuffle_customizations } from './glyphs.js';
import { UnsupportedObjectOperationError } from './obj.js';
import { polyself, set_uasmon } from './polyself.js';
import { you_were } from './were.js';
import { objectGenerationHooks } from './object_generation.js';
import { reset_mvitals } from './monsters.js';
import { depth, init_dungeons, on_level } from './dungeon.js';
import { movebubbles, fumaroles } from './mkmaze.js';
import { init_artifacts, mkot_trap_warn } from './artifacts.js';
import { role_init, welcomeHallucinationMessage, welcomeIdentity,
    welcomeMessage } from './role_init.js';
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
import { read_wizkit } from './files.js';
import { obj_delivery } from './dokick.js';
import { cmdq_clear, dolookaround, failClosedCommandRefusals, rhack } from './cmd.js';
import { next_to_u } from './apply_next_to_u.js';
import { canletgo, deferred_goto, dropx, save_currentstate } from './do.js';
import { glibr } from './do_wear.js';
import {
    domove,
    endRunning,
    end_running,
    lookaround,
    monster_nearby,
    near_capacity,
    nomul,
    notice_all_mons,
    pooleffects,
    overexert_hp,
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
    under_water,
    timebot,
    status_eval_next_unhilite,
} from './display.js';
import {
    dismissPendingTtyMessage,
    displayPendingTtyMessageWindow,
    ttyNorep,
    ttyPline,
    ttyUrgentPline,
} from './tty_message.js';
import { emitGlyphUpdateNotices } from './startup_a11y.js';
import { u_wipe_engr } from './engrave.js';
import { check_special_room } from './rooms.js';
import { rloc, tele } from './teleport.js';
import {
    block_point,
    cansee,
    does_block,
    init_vision_globals,
    m_canseeu,
    unblock_point,
    vision_reset,
    vision_recalc_async,
} from './vision.js';
import {
    coreRandom,
    rn2,
    isTerminated,
    raceTermination,
} from './rng.js';
import { dosounds } from './sounds.js';
import {
    gethungry,
    maybe_finished_meal,
    reset_eat,
} from './eat.js';
import { UnsupportedVaultGuardError, gd_move, invault } from './vault.js';
import { fightm } from './mhitm.js';
import {
    m_everyturn_effect,
    onscary,
    set_apparxy,
} from './monmove.js';
import {
    runSimpleMonsterAction,
    UnsupportedSimpleMonsterActionError,
    wieldMonsterItemAgainstMonster,
} from './unported_monster_actions.js';
import {
    create_gas_cloud,
    run_regions,
} from './region.js';
import {
    nh_timeout,
    do_storms,
} from './timeout.js';
import { regen_hp, regen_pw } from './regen.js';
import {
    automatic_search,
    do_vicinity_map,
    warnreveal,
} from './detect.js';
import { age_spells } from './spell.js';
import { settrack } from './track.js';
import { check_leash } from './apply.js';
import { clear_splitobjs } from './obj.js';
import { makewish } from './zap.js';
import { clear_bypasses } from './worn.js';
import { canseemon } from './display.js';
import { amulet, intervene } from './wizard.js';
import { rndcurse } from './sit.js';
import {
    BClairvoyant, Blind, EClairvoyant, ETelepat, Fast, Glib, HClairvoyant,
    Hallucination, Polymorph, Searching, Teleportation, Unchanging, Very_fast,
    Warn_of_mon, Warning,
} from './youprop.js';

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
        await mnexto(stairOccupant, RLOC_NOMSG, { state: g });
    await makedog({ state: g });

    const objectHooks = objectGenerationHooks();
    u_init_inventory_attrs(g, undefined, { objectHooks });

    // Initial display. C ref: allmain.c newgame() calls docrt() alone; the
    // explicit vision_recalc(0) and cls() are what js/display.js docrt()
    // leaves to its callers.
    await vision_recalc_async(0);
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
    await use_initial_inventory({
        state: g,
        hooks: objectHooks,
        initialSpell: initialspell,
    });
    finalize_startup_skills(g);
    find_ac(g);

    // C ref: allmain.c newgame() (826-829).
    if (g.wizard) {
        await read_wizkit(g);
        await obj_delivery(false, { state: g }); /* finish wizkit */
    }

    // C ref: allmain.c newgame() -> com_pager("legacy").
    await ttyLegacyIntroduction(g);

    // C ref: allmain.c newgame(). The elapsed-time clock starts here, which
    // insight.c fmt_elapsed_time() reads for the ^X window's closing line.
    g.urealtime.realtime = 0;
    g.urealtime.start_timing = getnow(g);
    save_currentstate(g);
    // C ref: allmain.c:840. "useful data now exists"; pline.c impossible()
    // reads it for its "Saving and reloading" advice.
    g.program_state ??= {};
    g.program_state.something_worth_saving
        = (g.program_state.something_worth_saving ?? 0) + 1;

    // C ref: allmain.c welcome(TRUE) prints the hallucination prelude first.
    const hallucinationWelcome = welcomeHallucinationMessage(g);
    if (hallucinationWelcome) await ttyPline(hallucinationWelcome, g);
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
    // allmain.c:845-848. dolookaround() scans with getloc_filter set to
    // GFILTER_VIEW, whatever whatis_filter the player chose.
    if (g.a11y?.glyph_updates) await dolookaround(g);
    else await notice_all_mons(true, g);
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
        if (Very_fast(u)) {
            if (random(3) !== 0) moveamt += NORMAL_SPEED;
        } else if (Fast(u)) {
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
// `env` carries the caller's display operations. It is not only forwarded:
// maybe_finished_meal() passes it on to eatfood(), which owns the finished
// meal's object and message lifecycle, but this function also writes the
// `You stop %s.` line itself, so
// `message` is required whenever an occupation is installed. It is resolved by
// name rather than read directly because the two ways of getting it wrong fail
// in opposite directions: on this arm a missing `message` would be a bare
// TypeError, which js/jsmain.js does not convert, so the segment is discarded
// rather than ended; on the finished-meal arm it would fall through to
// eatOperations()'s `message = ttyPline` default and quietly write to the
// terminal.
function requireOccupationOperation(env, name) {
    const operation = env?.[name];
    if (typeof operation !== 'function')
        throw new TypeError(`allmain.c stop_occupation() requires ${name}`);
    return operation;
}

export async function stop_occupation(state = game, env = {}) {
    if (state.go?.occupation) {
        const message = requireOccupationOperation(env, 'message');
        // A meal that finishes here reaches eat.c newuhs(), whose bot() call
        // C makes directly. Callers pass only their message seam; refresh
        // the status line for the game, and stay silent for any other state.
        const mealEnv = {
            ...env,
            statusRefresh: env.statusRefresh
                ?? (state === game ? () => bot() : () => {}),
        };
        if (!await maybe_finished_meal(true, state, mealEnv)) {
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
    const random = env.random ?? coreRandom;
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
    random = coreRandom,
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

    const random = env.random ?? coreRandom;
    if (typeof random.rn1 !== 'function') {
        throw new TypeError('clairvoyance cadence requires rn1');
    }
    const blocked = Boolean(BClairvoyant(state.u));
    const active = Boolean(
        HClairvoyant(state.u) || EClairvoyant(state.u),
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

async function applyClairvoyancePlan(plan, state, env) {
    if (!plan.due) return false;
    if (plan.mapRequired)
        await env.doVicinityMap(null, { state });
    state.context.seer_turn = plan.moves + plan.random.rn1(31, 15);
    return true;
}

// C ref: allmain.c moveloop_core()'s once-per-hero-took-time clairvoyance
// block. The cadence advances even when the hero cannot currently map.
export async function maybeRunClairvoyance(state = game, env = {}) {
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
    if (state.iflags?.hilite_delta)
        status_eval_next_unhilite(state);
    await applyClairvoyancePlan(plan, state, env);
    // A fast hero sinks once per action, so possibly more than once a turn.
    if (state.u.utrap && state.u.utraptype === TT_LAVA) {
        const { sink_into_lava } = await import('./trap.js');
        await sink_into_lava(state);
    }
    // When the hero escapes from lava, he cannot just stay there.
    else if (!state.u.umoved)
        await pooleffects(false, state);
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
// `norepMessage` is Norep()'s owner. Resolving it before nomul(0) keeps a
// caller that omitted the seam from ending the count and then failing on the
// line.
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
    return minliquid(monster, {
        ...env,
        state: env.state,
        canSee: (x, y) => cansee(x, y, env.state),
        message: ttyPline,
        // minliquid() uses rloc()'s result to decide whether its liquid
        // effect is finished. Keep the relocation on the elapsed-turn state
        // and provide the complete teleport.c hook set.
        relocateMonster: (subject, flags, relocationEnv) => rloc(
            subject,
            flags,
            {
                ...relocationEnv,
                state: env.state,
                random: relocationEnv.random ?? env.random,
                message: ttyPline,
                newsym: (x, y) => newsym(x, y, env.state),
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
        // mon.c:minliquid_core() discards this inventory-chain result.
        fireDamageChain: async (
            chain, force, here, x, y, effectEnv,
        ) => {
            const { fire_damage_chain } = await import('./trap.js');
            await fire_damage_chain(chain, force, here, x, y, effectEnv);
        },
        hooks: {
            ...(env.hooks ?? {}),
            newsym: (x, y) => newsym(x, y),
        },
    });
}

// C ref: allmain.c moveloop_core(), the once-per-turn block that runs when
// both the hero and the monsters are out of movement. C's done() does not
// return; the JavaScript end-game path returns so the recorder can capture
// its last screen, so this stops wherever the game has ended. A wizard or
// life-saving recovery leaves gameover clear, and the upkeep carries on.
export async function finishElapsedTurn(state, random) {
    // C ref: allmain.c moveloop_core()'s mvl_wtcap, taken once after the
    // monster loop. C reuses this snapshot only for u_calc_moveamt(),
    // regen_hp(), regen_pw(), and the overexertion check, and substitutes
    // UNENCUMBERED for the last two when the hero is invulnerable. eat.c
    // gethungry() and attrib.c exerper() each call near_capacity() themselves,
    // so they get a live evaluator below rather than this value, which
    // nh_timeout() and the hunger transition can already have invalidated.
    let wtcap = near_capacity(state);
    state.gw.were_changes = 0;
    await mcalcdistress(state, {
        state,
        random,
        message: ttyPline,
        redrawSquare: newsym,
        visionRecalc: vision_recalc_async,
        minLiquid: elapsedTurnMinLiquid,
        decideToShapeshift: decide_to_shapeshift,
        wereChange: were_change,
    });

    for (let monster = state.level.monlist;
        monster;
        monster = monster.nmon) {
        // monst.h:102 declares movement a short, so C's `+=` wraps at
        // 16 bits. A monster that movemon() skips keeps accruing: a ridden
        // steed that arrived with the hero keeps MON_STILL_ARRIVING
        // (dog.c mon_arrive() returns early for it) and so overflows
        // to a negative ration after enough turns.
        monster.movement = ((monster.movement + mcalcmove(
            monster,
            true,
            state,
            random.rn2,
        )) << 16) >> 16;
    }
    await maybe_generate_rnd_mon(state, {
        random,
        message: ttyPline,
        norepMessage: ttyNorep,
        statusRefresh: () => bot(),
    });
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
        if (state._pending_message)
            await dismissPendingTtyMessage(state);
        elapsedTurnBoundary('game end through done(ESCAPED)');
    }
    state.hero_seq = state.moves * 8;
    if (state.flags?.time && !state.context?.run) {
        state.disp ??= {};
        state.disp.time_botl = true;
    }

    // C ref: allmain.c moveloop_core() calls glibr() after the once-per-turn
    // hook and before nh_timeout(). do.c dropz() redraws the landing square
    // through the newsym hook.
    if (Glib(state.u)) {
        await glibr(state, {
            message: ttyPline,
            canletgo,
            dropx: (object) => dropx(object, { state }),
        });
    }

    await nh_timeout(state, {
        random,
        message: ttyPline,
        norepMessage: ttyNorep,
        statusRefresh: () => bot(),
        // dig.c rot_corpse() redraws the square it cleared.
        newsym,
        // timeout.c hatch_egg() can create a monster during an occupation.
        // makemon.c's dochugw() then interrupts that occupation, through the
        // timeout's own state and message seam.
        hooks: {
            stopOccupation: (_monster, hookEnv) => stop_occupation(
                hookEnv.state, hookEnv,
            ),
        },
    });
    if (state.program_state?.gameover) return;

    // C allmain.c calls run_regions() immediately after nh_timeout() on every
    // turn.
    await run_regions(regionEffectEnv(state, random));
    if (state.program_state?.gameover) return;

    if (state.u.ublesscnt) state.u.ublesscnt--;
    // Both regenerators reach allmain.c interrupt_multi() on the turn they top
    // the hero up, and its Norep() is the only output either of them can make,
    // so they share one env.
    const regenEnv = {
        random,
        interruptMulti: interrupt_multi,
        norepMessage: ttyNorep,
    };
    // C ref: allmain.c substitutes UNENCUMBERED for an invulnerable hero
    // instead of healing, and the two consumers below then read the
    // substituted value rather than the snapshot taken above.
    if (state.u.uinvulnerable) wtcap = UNENCUMBERED;
    else await regen_hp(wtcap, state, regenEnv);
    // C ref: allmain.c's "moving around while encumbered is hard work" block,
    // between regen_hp() and regen_pw(). The gate is allmain.c's; what it
    // guards is hack.c overexert_hp().
    if (wtcap > MOD_ENCUMBER && state.u.umoved
        && !(wtcap < EXT_ENCUMBER
            ? state.moves % 30
            : state.moves % 10)) {
        await overexert_hp(state, {
            random,
            message: ttyPline,
            statusRefresh: () => bot(),
            encumberMessage: (subject) => encumber_msg(
                subject, { message: ttyPline },
            ),
        });
    }
    await regen_pw(wtcap, state, regenEnv);

    if (!state.u.uinvulnerable) {
        // C allmain.c:307-320, periodic teleportation.
        if (Teleportation(state.u) && !random.rn2(85)) {
            const oldUx = state.u.ux;
            const oldUy = state.u.uy;
            await tele(state, { random, message: ttyPline });
            if (state.program_state?.gameover) return;
            if (state.u.ux !== oldUx || state.u.uy !== oldUy) {
                if (!(await next_to_u(state, { random, message: ttyPline })))
                    await check_leash(oldUx, oldUy, { state, random, message: ttyPline });
                cmdq_clear(CQ_CANNED, state);
                cmdq_clear(CQ_REPEAT, state);
            }
        }
        // C ref: allmain.c moveloop_core():322-339. `mvl_change` is a C static,
        // so keep its per-game, nonsaved value on the game object. The save
        // serializer intentionally omits this transient field, as C's static is
        // reset when a saved game is restored.
        state.mvl_change ??= 0;
        if ((state.mvl_change === 1 && !Polymorph(state.u))
            || (state.mvl_change === 2 && state.u.ulycn === NON_PM)) {
            state.mvl_change = 0;
        }
        if (Polymorph(state.u) && !random.rn2(100)) {
            state.mvl_change = 1;
        } else if (ismnum(state.u.ulycn) && !Upolyd(state.u)
            && !random.rn2(80 - (20 * Number(night(state))))) {
            state.mvl_change = 2;
        }
        if (state.mvl_change && !Unchanging(state.u)
            && (state.multi ?? 0) >= 0) {
            await stop_occupation(state, { message: ttyPline });
            if (state.mvl_change === 1) {
                await polyself(POLY_NOFLAGS, state);
            } else {
                await you_were(state, { random, message: ttyPline });
            }
            if (state.program_state?.gameover) return;
            state.mvl_change = 0;
        }
    }

    // C allmain.c:342-346. Search can reveal terrain, display a found trap,
    // or animate a statue.
    if (Searching(state.u)
        && !state.level.flags?.noautosearch
        && (state.multi ?? 0) >= 0) {
        await automatic_search({ state, random });
        if (state.program_state?.gameover) return;
    }
    if (Warning(state.u)) {
        await warnreveal({
            state, random,
            newSym: (x, y) => newsym(x, y),
        });
    }
    // C ref: allmain.c:347-350. A were change this turn (were.c new_were()
    // and were_change(), counted from mcalcdistress()) updates the hero's
    // innate intrinsics, mainly Drain_resistance.
    if (state.gw.were_changes) set_uasmon(state);
    // C ref: allmain.c:351 mkot_trap_warn(). Sense traps near the hero when
    // wielding the Master Key of Thievery without gloves.
    await mkot_trap_warn(state);
    await dosounds(state, {
        random: random.rn2,
        pline: ttyPline,
    });
    // C allmain.c:353. Storm rays and thunder can change the hero, monsters,
    // and movement state.
    const stormy = Boolean(state.level.flags.stormy);
    await do_storms(state);
    if (stormy && state.program_state?.gameover) return;
    await gethungry(state, {
        random,
        // C reads capacity before newuhs can change temporary strength.
        nearCapacity: () => near_capacity(state),
        message: ttyPline, endRunning, statusRefresh: () => bot(),
    });
    if (state.program_state?.gameover) return;
    age_spells(state);
    // C ref: allmain.c moveloop_core() calls exerchk() here, before invault()
    // and engraving wear.
    await exerchk(state, {
        random,
        // attrib.c exerper() switches on near_capacity() live, after
        // gethungry() has run. A WEAK transition lowers weight_cap() through
        // ATEMP(A_STR), so the snapshot above can be a whole band too low.
        nearCapacity: () => near_capacity(state),
        encumberMessage: (subject) => encumber_msg(
            subject,
            { message: ttyPline },
        ),
        message: ttyPline,
    });
    await invault(state, {
        random,
        message: ttyPline,
        makemon_runtime,
        stopOccupation: (hookEnv = { state }) => stop_occupation(
            hookEnv.state, { ...hookEnv, message: ttyPline },
        ),
        unmul: (msg) => unmul(msg, state),
    });
    if (state.u.uhave?.amulet)
        await amulet(state, { random, message: ttyPline });
    maybeWipeHeroEngraving(state, random);

    // C allmain.c:361-367. A due intervention can curse inventory, summon
    // monsters, or resurrect the Wizard.
    if (state.u.uevent?.udemigod && !state.u.uinvulnerable) {
        if (state.u.udg_cnt) state.u.udg_cnt--;
        if (!state.u.udg_cnt) {
            await intervene(state, {
                random,
                message: ttyPline,
                rndcurse,
                makemon: makemon_runtime,
                hooks: {
                    stopOccupation: (_monster, hookEnv) => stop_occupation(
                        hookEnv.state, hookEnv,
                    ),
                },
            });
            state.u.udg_cnt = random.rn1(200, 50);
            if (state.program_state?.gameover) return;
        }
    }

    // C allmain.c:374-377. These owners move terrain and occupants, update
    // shared vision, and can emit messages.
    const bubbles = on_level(state.u.uz, state.water_level)
        || on_level(state.u.uz, state.air_level);
    if (bubbles || state.level.flags.fumaroles) {
        if (bubbles) await movebubbles(state);
        else await fumaroles(state);
        if (state.program_state?.gameover) return;
    }

    // C allmain.c:379-388. "when immobile, count is in turns": nomul() with a
    // negative value buys that many turns during which moveloop_core() reads
    // no key, and this is what spends them. runmode_delay_output() draws one
    // animation frame per turn, exactly as it does for a run.
    if ((state.multi ?? 0) < 0) {
        await runmode_delay_output(state);
        if (++state.multi === 0) { /* finished yet? */
            await runUnmulAtTurnBoundary(state);
            /* if unmul caused a level change, take it now */
            if (state.u.utotype)
                await runDeferredGotoAtTurnBoundary(state);
        }
    }
}

// The refusal classes the monster scan and the once-per-turn round can raise
// that advanceElapsedTurn() converts to UnsupportedTurnBoundaryError, so the
// segment stops on its last matching screen rather than throwing out of
// runSegment(). The turn also raises UnsupportedTurnBoundaryError directly,
// from finishElapsedTurn()'s own stops; those pass through the catches
// unchanged because js/jsmain.js already treats that class as a segment
// boundary. A refusal class that is neither in this list nor already an
// UnsupportedTurnBoundaryError escapes runSegment() as a hard failure, so a
// newly invented one belongs here.
// Resolve classes when called, after the mutually importing game owners
// have initialized. A module-scope array could read these bindings before
// their declarations execute.
function elapsedTurnRefusals() {
    return [
        UnsupportedSimpleMonsterActionError,
        // Both pickup arms -- dogmove.c dog_invent()'s and mon.c
        // mpickstuff()'s -- call splitobj() from inside the monster scan, so
        // this class reaches here from a path that used to stop at an
        // injected refusal. Without it a split refusal discards the segment
        // instead of stopping on its last matching screen.
        UnsupportedObjectOperationError,
    ];
}

const runElapsedTurnMonsterAction =
    adaptMonsterActionToDochugwSignature(runSimpleMonsterAction);

async function moveElapsedTurnMonster(monster, env) {
    const stop = await movemon_singlemon(monster, {
        ...env,
        // C ref: mon.c movemon_singlemon():1233-1239, a guard parked at <0,0>.
        guardMove: (guard, guardEnv) => gd_move(guard, guardEnv),
        everyTurnEffect: runEveryTurnEffectWithRegionHooks,
        visionRecalc: vision_recalc_async,
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
        // C ref: mon.c restrap(). This binding preserves makemon.c
        // set_mimic_sym()'s final visibility-blocking update against the
        // monster map.
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
                },
            }),
        }),
        canSeeMonster: (subject) => canseemon(subject, env.state),
        // C ref: mon.c movemon_singlemon():1295-1303 and hideunder():4726-4801.
        // This binding owes the newsym() C calls when the eel's mundetected
        // changes.
        hideUnder: (subject, subjectEnv) => hideunder(subject, {
            ...subjectEnv,
            redraw: (x, y) => newsym(x, y),
        }),
        // C ref: mon.c movemon_singlemon():1305, m_canseeu().
        canSeeHero: (subject) => m_canseeu(subject, env.state),
        canSeeSquare: (x, y) => cansee(x, y, env.state),
        fightMonster: (subject, subjectEnv) => fightm(subject, {
            ...subjectEnv,
            message: ttyPline,
            markInvisible: (x, y) => map_invisible(x, y, env.state),
            redraw: (x, y) => newsym(x, y),
            wieldMonsterItemAgainstMonster,
        }),
        dochugwAction: runElapsedTurnMonsterAction,
    });
    // display.c show_glyph() prints a glyph-update notice through pline_xy()
    // while the monster is still moving, so its vpline() flush shows the
    // status of that moment. Drain the notices this monster queued before
    // the next monster or the turn's upkeep (regeneration, for one) changes
    // what that flush would show.
    if (!env.state.program_state?.gameover)
        await emitGlyphUpdateNotices(env.state, { pline: ttyPline });
    return stop;
}

// C ref: allmain.c moveloop_core(), the `if (svc.context.move)` block.
// Monster movement can require multiple complete list scans while the hero
// lacks a ration. A fast hero's retained ration ends the scan even when a fast
// pet could act again; once-per-turn upkeep waits until both sides are out.
// This serves the first elapsed command and every subsequent elapsed command.
async function advanceElapsedTurn(state) {
    const random = coreRandom;

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
                monstersCanMove = await movemon({
                    state,
                    random,
                    moveSingleMonster: moveElapsedTurnMonster,
                    clearBypasses: (subjectEnv) => clear_bypasses(subjectEnv),
                    // C ref: mon.c movemon():1343-1347. quest.c expulsion()
                    // schedules the hero's departure from inside the monster
                    // scan, so movemon()'s own tail performs it.
                    deferredGoto: (env) => runDeferredGotoAtTurnBoundary(
                        env.state,
                    ),
                });
                // C's terminal death path eventually longjmps out through
                // really_done(), but done_in_by() itself returns after a
                // life-saving recovery (end.c:185). js/end.js returns from
                // the terminal end-game display so replay can capture its
                // final window; stop only after that completed gameover path.
                if (state.program_state?.gameover) return;
                if (state.u.umovement >= NORMAL_SPEED) break;
            } while (monstersCanMove);
        } catch (error) {
            // A supported monster prefix can print before its next operation
            // refuses. Preserve that output through the gameplay boundary.
            // The normal lethal monster arm reaches done_in_by() here; its
            // existing end.c boundary is converted only after the real killer
            // and death entry are set. Below that entry, end.c really_done()
            // settles with the level's shopkeepers, vault guard and priests
            // through paybill(), paygd() and clearpriests(); paygd()'s
            // unported arm raises UnsupportedVaultGuardError. The scan also
            // reaches every owner elapsedTurnRefusals() names.
            const liveScanRefusals = [
                ...elapsedTurnRefusals(),
                UnsupportedVaultGuardError,
            ];
            if (!liveScanRefusals.some((type) => error instanceof type))
                throw error;
            const boundary = new UnsupportedTurnBoundaryError(error.message);
            boundary.reason = error.reason;
            throw boundary;
        } finally {
            state.context.mon_moving = false;
        }

        if (!monstersCanMove && state.u.umovement < NORMAL_SPEED) {
            try {
                await finishElapsedTurn(state, random);
            } catch (error) {
                // A timeout or a later upkeep owner can reach existing
                // command or upkeep refusals after the prefix has completed.
                // Preserve that prefix through the normal gameplay boundary;
                // unexpected errors, including TypeErrors, still escape.
                if (![...elapsedTurnRefusals(), ...failClosedCommandRefusals()].some(
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
        }
    } while (state.u.umovement < NORMAL_SPEED);

    // C runs the once-per-hero-action block outside both loops.
    await finishHeroTimeEffects(state, {
        random,
        encumberMessage: encumber_msg,
        doVicinityMap: (sobj, { state: mapState } = {}) =>
            do_vicinity_map(sobj, mapState ?? state, { random }),
    });
    // C allmain.c:432: redraw after stationary pool effects, before the
    // nearby-monster observation, only in the hero-took-time block.
    if (state.u.uinwater) await under_water(0, state);
    await see_nearby_monsters(state);
}

// The entry point every driver calls once per input: playSegment() in
// js/jsmain.js, js/nethack.js, the test drivers and the judge's frozen
// drivers. Once the segment has terminated (js/end.js nh_terminate()) it runs
// no game code; it reads one raw key from the display's queue, outside
// nhgetch() and its capture hook, so a driver that stops only when its keys
// run out drains them and stops, and the browser page idles on the final
// screen. Otherwise it races the C function's body against the segment's
// termination notice and returns once either settles.
export async function moveloop_core() {
    if (isTerminated()) {
        const display = game.nhDisplay;
        if (display?.readKey) await display.readKey();
        return;
    }
    await raceTermination(moveloop_core_body());
}

// C ref: allmain.c moveloop_core()
async function moveloop_core_body() {
    const g = game;

    maybe_shuffle_customizations(g);

    // C allmain.c:194 clears object bypass marks before deciding whether this
    // input advances elapsed time. This is separate from movemon()'s tail, so
    // a command with no monster scan still consumes the pending cleanup.
    if (g.context?.bypasses)
        clear_bypasses(g);

    // C ref: allmain.c:200-201 resumes a terminal-interrupted wish before
    // context.move can allocate elapsed time or dispatch another command.
    if (g.context?.resume_wish) await makewish(g);

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

    const hallucinating = Hallucination(g.u);
    const blind = Blind(g.u);
    // Keep the existing non-hallucinatory vision/region ordering. Hallucination
    // below follows C's sensing layers before spending pending vision work.
    // C ref: allmain.c moveloop_core() (454-472). Both recalculations sit
    // inside `if (!svc.context.mv || Blind)`, so a running hero who can see
    // keeps stale vision until the recalculation after domove(). lookaround()
    // reads that stale seenv: on the Plane of Water, movebubbles() resets the
    // bubbles' old cells to unseen water, so a rush can plunge into them.
    if (!hallucinating && (!g.context?.mv || blind) && g.vision_full_recalc) {
        await vision_recalc_async(0);
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
    if (!g.context?.mv || blind) {
        if (hallucinating) {
            await see_monsters(g);
            see_objects(g);
            see_traps(g);
            if (g.u.uswallow) await swallowed(false, g);
        } else if (ETelepat(g.u)
            || Warning(g.u)
            || Warn_of_mon(g.u)
            || (g.level?.regions ?? []).some((region) => (
                region.visible && region.ttl !== -2
            ))) {
            // allmain.c:462-467. These sensing modes need only the monster
            // overlay; objects and traps retain their ordinary memory.
            await see_monsters(g);
        }
        // C ref: allmain.c:470-471. Recalculate after the sensing layers;
        // a blind hero's tactile repaint can itself consume display RNG.
        if (hallucinating && g.vision_full_recalc) {
            await vision_recalc_async(0);
            g.vision_full_recalc = 0;
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
        random: coreRandom,
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
    if (g.vision_full_recalc) await vision_recalc_async(0);
    // C ref: allmain.c moveloop_core():546, CLIPPING: after rhack() and
    // vision_recalc() so that the map is redrawn once with correct vision.
    await cliparound(g.u.ux, g.u.uy, g);
    // C ref: allmain.c moveloop_core() (548-555). Outside non-teleport
    // running (domove() does it there), every seventh count step -- or, when
    // traveling, every seventh turn -- marks the status line dirty while a
    // run is in progress and displays the map window. context.run can still
    // hold a finished travel's 8 here: findtravelpath() puts it back after
    // nomul(0), and only reset_cmd_vars() or end_running() clears it, so a
    // counted command after travel takes this arm on its first step.
    // tty_display_nhwindow(WIN_MAP, FALSE) only ends glyph output, clears
    // rawprint and flushes stdout; the JS grid has no output stream to flush.
    const multi = g.multi ?? 0;
    if ((!g.context.run || g.flags.runmode === RUN_TPORT)
        && (multi && (!g.context.travel ? !(multi % 7) : !(g.moves % 7)))) {
        if (g.flags.time && g.context.run) {
            g.disp ??= {};
            g.disp.botl = true;
        }
        if (g.nhDisplay?.nomuxRaw) g.nhDisplay.nomuxRaw.rawprint = 0;
    }
    // show_glyph() emits its accessibility pline before returning to the
    // command loop. Preserve that boundary for command-generated reveals even
    // when no later region or combat message forces an earlier drain.
    await emitGlyphUpdateNotices(g, { pline: ttyPline });
    // C ref: allmain.c moveloop_core() (558-563), the end_turn callbacks.
    await run_end_turn_callbacks(g);
}

// C ref: allmain.c moveloop()
export async function moveloop(resuming) {
    await vision_recalc_async(0);
    await docrt();
    await flush_screen(1);

    // C ref: allmain.c moveloop() loops until nh_terminate() exits the
    // process. The port's moveloop_core() returns once the segment has
    // terminated, so this stops on the gameover that nh_terminate() sets.
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
