// allmain.js — Main game loop.
// C ref: allmain.c — newgame, moveloop, moveloop_core.
//
// Per-turn replay remains while command and turn subsystems are ported. The
// PRNG-owning initializers and new-game sequence below are source-derived;
// UUID, notice, and glyph-map setup remain to be ported.

import { game } from './gstate.js';
import { COLNO, RLOC_NOMSG } from './const.js';
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
import { check_special_room_state } from './rooms.js';
import { mnexto } from './teleport.js';
import { vision_recalc, vision_reset, init_vision_globals } from './vision.js';
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

// C ref: allmain.c moveloop_core()
export async function moveloop_core() {
    const g = game;

    // C gates its entire elapsed-time block on the preceding command's
    // context.move value. Capture that value before the once-per-input code
    // below resets it optimistically for the next command.
    if (g.context?.move) {
        // Fast-forward residual per-step RNG around the source-owned movement
        // allocation boundary. Monster action state, regen, sounds, and hunger
        // remain in the replay scaffold.
        const stepNum = (g.moves || 1) - 1;
        fastforward_step(stepNum, () => {
            // C ref: mon.c movemon() and allmain.c moveloop_core(). Until
            // movemon() is ported, this callback temporarily owns its terminal
            // dead-monster purge as well as the later list-order allocation.
            dmonsfree(g);
            for (let monster = g.level?.monlist ?? null;
                monster;
                monster = monster.nmon) {
                monster.movement += mcalcmove(monster, true, g);
            }
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
