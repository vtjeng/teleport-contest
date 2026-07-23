// allmain.js — Main game loop.
// C ref: allmain.c — newgame, moveloop, moveloop_core.
//
// Per-turn replay remains while command and turn subsystems are ported. The
// PRNG-owning initializers and new-game sequence below are source-derived;
// UUID, notice, and glyph-map setup remain to be ported.

import { game } from './gstate.js';
import {
    A_DEX,
    COLNO,
    EXT_ENCUMBER,
    FAST,
    HVY_ENCUMBER,
    INTRINSIC,
    LEVITATION,
    MOD_ENCUMBER,
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
import { dmonsfree } from './makemon_create.js';
import { init_objects } from './o_init.js';
import { objectGenerationHooks } from './object_generation.js';
import { reset_mvitals } from './monsters.js';
import { init_dungeons } from './dungeon.js';
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
import { wipe_engr_at } from './engrave.js';
import { check_special_room_state } from './rooms.js';
import { mnexto } from './teleport.js';
import { vision_recalc, vision_reset, init_vision_globals } from './vision.js';
import { rn2, rnd } from './rng.js';
import { dosoundsInitialLevel } from './sounds.js';
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

function propertyActiveUnblocked(hero, propertyIndex) {
    const property = hero?.uprops?.[propertyIndex];
    return Boolean(
        (property?.intrinsic || property?.extrinsic) && !property?.blocked,
    );
}

// C ref: allmain.c moveloop_core() lines 360-361 and engrave.c
// u_wipe_engr(). The currently reachable D:1 commands leave the hero standing
// on the floor. Reject future reachability states instead of silently skipping
// u_wipe_engr()'s can_reach_floor(TRUE) contract.
export function maybeWipeHeroEngraving(
    state = game,
    random = { rn2, rnd },
) {
    const dexterity = effective_attribute(state, A_DEX);
    if (random.rn2(40 + dexterity * 3) !== 0) return false;

    // rnd(3) is evaluated before u_wipe_engr() checks floor reachability.
    const count = random.rnd(3);
    const hero = state.u;
    if (hero?.uswallow || hero?.ustuck || hero?.usteed
        || hero?.uundetected || propertyActiveUnblocked(hero, LEVITATION)) {
        throw new Error(
            'initial-level engraving wear reached an unported '
                + 'can_reach_floor state',
        );
    }
    wipe_engr_at(hero.ux, hero.uy, count, false, { state, random });
    return true;
}

// C ref: allmain.c moveloop_core()
export async function moveloop_core() {
    const g = game;

    // C gates its entire elapsed-time block on the preceding command's
    // context.move value. Capture that value before the once-per-input code
    // below resets it optimistically for the next command.
    if (g.context?.move) {
        g.u.umovement -= NORMAL_SPEED;
        // Fast-forward residual per-step RNG around the source-owned movement
        // allocation boundary. Monster action state, regen, sounds, and hunger
        // remain in the replay scaffold.
        const stepNum = (g.moves || 1) - 1;
        await fastforward_step(stepNum, () => {
            // C ref: mon.c movemon() and allmain.c moveloop_core(). Until
            // movemon() is ported, this callback temporarily owns its terminal
            // dead-monster purge as well as the later list-order allocation.
            dmonsfree(g);
            for (let monster = g.level?.monlist ?? null;
                monster;
                monster = monster.nmon) {
                monster.movement += mcalcmove(monster, true, g);
            }
        }, () => {
            // near_capacity() follows movemon() in C. Current reachable
            // commands cannot change the startup inventory, whose initializer
            // guarantees an unencumbered load; runtime burden is ported with
            // the later monster-action boundary.
            u_calc_moveamt(UNENCUMBERED, g);
        }, async () => {
            await dosoundsInitialLevel(g);
        }, () => {
            maybeWipeHeroEngraving(g);
        });
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

    // Advance turn
    if (g.context?.move) {
        g.moves = (g.moves || 1) + 1;
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
