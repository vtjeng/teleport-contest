// allmain.js — Main game loop.
// C ref: allmain.c — newgame, moveloop, moveloop_core.
//
// Per-turn replay remains while command and turn subsystems are ported. The
// PRNG-owning initializers and new-game sequence below are source-derived;
// UUID, notice, and glyph-map setup remain to be ported.

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
    SLT_ENCUMBER,
    UNENCUMBERED,
} from './const.js';
import { effective_attribute } from './attrib.js';
import { makedog } from './dog.js';
import { mklev, l_nhcore_init, u_on_upstairs } from './mklev.js';
import { m_at } from './monst.js';
import { mcalcmove } from './mon.js';
import { dmonsfree, makemon } from './makemon_create.js';
import { init_objects } from './o_init.js';
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
import { domove, endRunning, rhack } from './cmd.js';
import { docrt, cls, bot, flush_screen } from './display.js';
import { ttyPline } from './tty_message.js';
import { emitStartupA11yNotices } from './startup_a11y.js';
import { can_reach_floor, wipe_engr_at } from './engrave.js';
import { check_special_room_state } from './rooms.js';
import { mnexto } from './teleport.js';
import { vision_recalc, vision_reset, init_vision_globals } from './vision.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { dosoundsInitialLevel } from './sounds.js';
import { gethungry } from './eat.js';
import {
    fastforward_step,
} from './fastforward.js';

// PRNG-owning initializer seam corresponding to the point immediately before
// allmain.c:newgame() calls mklev().
export function newgame_pre_mklev(g = game) {
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
    u_init_misc(g);
    l_nhcore_init(g);
    return g;
}

// C ref: allmain.c newgame()
export async function newgame() {
    const g = game;

    // C ref: allmain.c newgame(). Preserve this order: each initializer owns
    // state and PRNG effects used by every initializer that follows it.
    newgame_pre_mklev(g);

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
    check_special_room_state(false, g);
    const stairOccupant = m_at(g.u.ux, g.u.uy, g);
    if (stairOccupant)
        mnexto(stairOccupant, RLOC_NOMSG, { state: g });
    makedog({ state: g });

    const objectHooks = objectGenerationHooks();
    u_init_inventory_attrs(g, undefined, { objectHooks });

    // Initial display
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

    // C ref: allmain.c welcome(TRUE) -> pline().
    await ttyPline(welcomeMessage(g), g);
    // C re-enables monster notices only after the welcome, then chooses
    // between #lookaround and the distance-sorted monster notice pass.
    await emitStartupA11yNotices(g);
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
export function maybe_generate_rnd_mon(state = game, env = {}) {
    const random = env.random ?? { d, rn1, rn2, rnd, rne, rnz };
    const createMonster = env.makemon ?? makemon;
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
    return createMonster(null, 0, 0, NO_MM_FLAGS, {
        ...env,
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
export function finishHeroTimeEffects(state = game, env = {}) {
    if (!Number.isSafeInteger(state.hero_seq) || state.hero_seq < 0) {
        throw new Error('hero time effects require initialized hero_seq');
    }
    // Validate injected owners before changing hero_seq. Once admitted,
    // preserve C's increment -> map -> schedule order.
    const plan = clairvoyancePlan(state, env);
    state.hero_seq++;
    applyClairvoyancePlan(plan, state, env);
}

const MONSTER_ACTION_BOUNDARY =
    'moveloop reached the unported monster-action phase';
const TURN_REPLAY_BOUNDARY =
    'moveloop reached the end of the residual turn replay';

export class UnsupportedTurnBoundaryError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedTurnBoundaryError';
    }
}

function requireNoPendingMonsterAction(state) {
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.mhp > 0 && monster.movement >= NORMAL_SPEED)
            throw new UnsupportedTurnBoundaryError(MONSTER_ACTION_BOUNDARY);
    }
}

// C ref: allmain.c moveloop_core()
export async function moveloop_core() {
    const g = game;

    if (g.context?.turn_replay_blocked)
        throw new UnsupportedTurnBoundaryError(TURN_REPLAY_BOUNDARY);

    // C gates its entire elapsed-time block on the preceding command's
    // context.move value. Capture that value before the next command dispatch
    // below (including an internal repeat) resets it optimistically.
    if (g.context?.move) {
        // movemon() owns every live monster with a complete action ration.
        // Until it is ported, reject that boundary before debiting the hero
        // so retries cannot duplicate partial elapsed-time state changes.
        requireNoPendingMonsterAction(g);
        g.u.umovement -= NORMAL_SPEED;
        // A fast hero can retain a complete action after paying for the prior
        // command. C still runs movemon() before noticing that surplus; the
        // currently ported initial-command slice has no live monster-action
        // owner, so do not start a new allocation turn in that case.
        if (g.u.umovement < NORMAL_SPEED) {
            // g.moves still names the preceding source turn here. This replay
            // phase uses that one-behind value, then the hero-allocation
            // callback advances moves before later once-per-turn effects.
            const elapsedReplayStep = g.moves || 1;
            // Fast-forward residual per-step RNG around the source-owned
            // movement allocation boundary. Monster actions, regeneration,
            // and other intervening turn work remain replay-owned; random-
            // monster generation, ambient sounds, hunger, and engraving wear
            // run through their source callbacks below.
            const replayComplete = await fastforward_step(
                elapsedReplayStep,
                () => {
                    // C ref: mon.c movemon() and allmain.c moveloop_core().
                    // Until movemon() is ported, this callback temporarily
                    // owns its terminal dead-monster purge and later
                    // list-order allocation.
                    dmonsfree(g);
                    for (let monster = g.level?.monlist ?? null;
                        monster;
                        monster = monster.nmon) {
                        monster.movement += mcalcmove(monster, true, g);
                    }
                }, () => {
                    maybe_generate_rnd_mon(g);
                }, () => {
                    // near_capacity() follows movemon() in C. Current
                    // reachable commands cannot change the startup inventory,
                    // whose initializer guarantees an unencumbered load;
                    // runtime burden is ported with the later monster-action
                    // boundary.
                    u_calc_moveamt(UNENCUMBERED, g);
                    // C increments moves after hero allocation and before all
                    // once-per-turn effects, including dosounds().
                    g.moves = (g.moves || 1) + 1;
                    g.hero_seq = g.moves * 8;
                }, async () => {
                    await dosoundsInitialLevel(g);
                }, () => {
                    // Current reachable commands cannot change the startup
                    // inventory, whose initializer guarantees an unencumbered
                    // load. Runtime burden is ported with the later
                    // monster-action boundary.
                    gethungry(g, {
                        random: { rn2 },
                        nearCapacity: () => UNENCUMBERED,
                    });
                }, () => {
                    maybeWipeHeroEngraving(g);
                }, () => {
                    finishHeroTimeEffects(g);
                },
            );
            if (!replayComplete) {
                g.context.turn_replay_blocked = true;
                throw new UnsupportedTurnBoundaryError(TURN_REPLAY_BOUNDARY);
            }
        } else {
            // A fast hero's surplus action does not start a new turn, but it
            // still advances the per-action sequence and seer cadence.
            finishHeroTimeEffects(g);
        }
    }

    // Vision + display
    if (g.vision_full_recalc) {
        vision_recalc(0);
        g.vision_full_recalc = 0;
    }
    find_ac(g);
    await bot();
    await flush_screen(1);

    // C ref: allmain.c moveloop_core(). A positive multi repeats the saved
    // command without another input boundary. For movement, values below
    // COLNO are remaining finite repeats; COLNO and above are the source's
    // run-until-stopped sentinel range and are not decremented here. Movement
    // repeats its established intent directly; other counted commands re-enter
    // rhack() with cmd_key.
    g.context.move = 1;
    if ((g.multi ?? 0) > 0) {
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
}

// C ref: allmain.c moveloop()
export async function moveloop(resuming) {
    vision_recalc(0);
    await docrt();
    await flush_screen(1);

    for (;;) {
        await moveloop_core();
        if (game.program_state?.gameover) break;
    }
}
