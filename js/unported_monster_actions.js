// The fail-closed boundary for monster actions. This file holds no port; the
// ports of monmove.c and dogmove.c live in js/monmove.js and js/dogmove.js.
//
// runSimpleMonsterAction() executes one monster action for the movemon()
// adapter in js/allmain.js.
//
// Delete this file once ported coverage makes the boundary unnecessary.

import {
    BURN,
    HEADSTONE,
} from './const.js';
import {
    is_ice,
} from './dbridge.js';
// js/allmain.js imports this file's action runners, so this edge closes an
// import cycle. `stop_occupation` is a hoisted function declaration, which an
// ES module cycle initializes before either module body runs; nothing here
// reads it at module scope.
import { stop_occupation } from './allmain.js';
import { bot, map_invisible, newsym, tmp_at } from './display.js';
import { mdig_tunnel } from './dig.js';
import { flooreffects } from './do.js';
import { should_mulch_missile } from './dothrow.js';
import {
    dog_move,
    pet_ranged_attk,
} from './dogmove.js';
import { migrate_to_level } from './dog.js';
import { capitalizedMonsterName } from './do_name.js';
import { engr_at, wipe_engr_at } from './engrave.js';
import { game } from './gstate.js';
import {
    nh_delay_output,
} from './hack.js';
import { obj_extract_self, stackobj } from './invent.js';
import { mattackm, mdisplacem } from './mhitm.js';
import {
    mattacku,
} from './mhitu.js';
import { m_throw } from './mthrowu.js';
import { quest_stat_check, quest_talk } from './quest.js';
import {
    dochug,
    dochugw,
    m_avoid_kicked_loc,
    m_move,
    monflee,
    monfleeMessage,
    onscary,
    set_apparxy,
} from './monmove.js';
import { m_at } from './monst.js';
import {
    place_object,
    remove_object,
} from './obj.js';
import {
    create_gas_cloud,
    m_in_out_region,
} from './region.js';
import { coreRandom } from './rng.js';
import { ttyPline } from './tty_message.js';
import { passive_obj } from './uhitm.js';
import {
    block_point,
    cansee,
    unblock_point,
} from './vision.js';
import {
    dmgval,
    mon_wield_item,
} from './weapon.js';
import { canseemon, canspotmon } from './display.js';

function actionRandom(rawEnv) {
    return rawEnv.random ?? coreRandom;
}

async function admitSimpleDestinationAndRegion(monster, x, y, env) {
    // mon.c mfndpos() chose this square, and m_move() and dog_move() pass
    // the can_tunnel and can_unlock that postmov() acts on, so every terrain
    // type mfndpos() can select has a source arm after the move: room,
    // corridor and furniture squares, doors it opens, unlocks, busts, digs,
    // flows under or walks through, walls and trees it digs or passes,
    // pools and lava it can enter, iron bars and a raised drawbridge's span.
    // A trap on the destination is no longer refused here. C has no such gate:
    // monmove.c postmov() calls mintrap() after the move, and only there. That
    // is where an unported trap type now stops the scan, which also covers a
    // monster standing still on one -- a case this destination check never
    // saw.
    return m_in_out_region(monster, x, y, env);
}

function wipeSimpleEngraving(x, y, _count, _magical, env) {
    const engraving = engr_at(x, y, env.state);
    if (!engraving || engraving.engr_type === HEADSTONE
        || engraving.nowipeout
        || (engraving.engr_type === BURN && !is_ice(x, y, env.state))) {
        return;
    }
    return wipe_engr_at(x, y, _count, _magical, env);
}

// trap.c trapeffect_level_telep() reaches dog.c migrate_to_level() after a
// monster falls through a hole or trap door, which redraws the vacated square
// through the ordinary display owner.
function monsterMigrationOperation(env) {
    return (monster, destinationLedger, destinationCode, coordinate,
        migrationEnv = {}) => migrate_to_level(
        monster,
        destinationLedger,
        destinationCode,
        coordinate,
        {
            ...migrationEnv,
            newsym: migrationEnv.newsym ?? newsym,
        },
    );
}

// The fleeing path in monmove.c consumes canSeeMonster() to decide whether
// its source-owned message can be seen. mon_wield_item() now owns its own
// weapon.c canseemon() presentation checks.
function monsterWieldOperations(env) {
    return {
        canSeeMonster: (subject) => canseemon(subject, env.state),
    };
}

// Ordinary movement adapter used by the live monster turn and by
// uhitm.c:do_attack()'s consumed-return m_move() leprechaun check.
export async function moveSimpleOrdinary(monster, env) {
    return m_move(monster, {
        ...env,
        // monmove.c:2023 -> m_move_aggress:2097/2111 reaches hitmm/missmm
        // and pre_mm_attack through canonical mattackm.
        message: env.message ?? ttyPline,
        redraw: env.redraw ?? newsym,
        markInvisible: env.markInvisible ?? map_invisible,
        ...monsterWieldOperations(env),
        migrateToLevel: monsterMigrationOperation(env),
        setApparxy: (subject, operationEnv) =>
            set_apparxy(subject, operationEnv),
        mdigTunnel: mdig_tunnel,
        mayCrossRegion: admitSimpleDestinationAndRegion,
        // monmove.c m_move():1953 rejects the square the hero most recently
        // kicked before it filters occupants and tracking. The ordinary
        // adapter must provide the same predicate that the pet adapter uses.
        avoidKicked: (subject, x, y) =>
            m_avoid_kicked_loc(subject, x, y, env.state),
        // mon.c can_touch_safely() asks artifact.c touch_artifact() about
        // every item a monster considers. m_search_items(), postmov(), and
        // their object consumers now use artifactTouchable()'s canonical
        // synchronous monster owner; its monster arm is only a pickup gate
        // and never applies the hero's blast or damage.
    });
}

export async function moveSimplePet(monster, after, env) {
    return dog_move(monster, after, {
        ...env,
        migrateToLevel: monsterMigrationOperation(env),
        setApparxy: (subject, operationEnv) =>
            set_apparxy(subject, operationEnv),
        // dogmove.c:1280-1287 hands an ALLOW_U landing directly to
        // mattacku().  Starting pets are constrained by assertSimpleActionState
        // above; mattacku() itself keeps every attack family outside this
        // ordinary visible physical boundary fail-closed.
        attackHero: attackHeroWithMattacku,
        avoidKicked: (subject, x, y) =>
            m_avoid_kicked_loc(subject, x, y, env.state),
        canSeeMonster: (subject) => canseemon(subject, env.state),
        displaceMonster: (subject, target, moveEnv) =>
            mdisplacem(subject, target, false, moveEnv),
        mayCrossRegion: admitSimpleDestinationAndRegion,
        // Three printing sites share the `message` seam: dog_invent()'s carry
        // arm through dogmove.c pline_xy(), its drop arm through steal.c
        // mdrop_obj(), and dog_move()'s cursed-step line through pline.c
        // pline_mon(). Two of those three also repaint through the `redraw`
        // seam -- the carry arm at js/dogmove.js dog_invent()'s
        // obj_extract_self(), and the drop arm through js/steal.js relobj()'s
        // tail. The cursed-step line repaints nothing, matching C, where
        // dogmove.c:1296-1312 calls no newsym().
        message: ttyPline,
        waitMap: undefined,
        // js/mhitm.js pre_mm_attack() marks a combatant the hero cannot spot
        // through display.c map_invisible(), which writes map memory and then
        // paints through show_glyph_cell().
        markInvisible: map_invisible,
        petRangedAttack: runPetRangedAttack,
        redraw: newsym,
    });
}

// Operations the monster attack callers below put on the env. js/mthrowu.js
// m_throw() calls its callees itself; each key here stays because another
// reader on the same env takes it (grep -rn "<key>" js/), among them
// js/mthrowu.js drop_throw()'s floor operations and js/muse.js
// use_offensive()'s monsterName and throwMissile.
function monsterMissileEnv(monster, env) {
    return {
        canSeeMonster: (subject) => canseemon(subject, env.state),
        canSeeSquare: (x, y) => cansee(x, y, env.state),
        damageValue: (obj, target, actionEnv) => dmgval(
            obj,
            target,
            actionEnv.state,
            { random: actionEnv.random },
        ),
        delayOutput: nh_delay_output,
        extractObject: (obj, actionEnv) => obj_extract_self(obj, actionEnv),
        floorEffects: (obj, x, y, verb, actionEnv) => flooreffects(
            obj,
            x,
            y,
            verb,
            actionEnv,
        ),
        message: ttyPline,
        monsterAt: (x, y, state) => m_at(x, y, state),
        monsterName: (subject) => capitalizedMonsterName(
            subject,
            env.state,
            { displayRandom: env.displayRandom },
        ),
        newsym,
        unblockPoint: (x, y, state) => {
            unblock_point(x, y, state);
        },
        passiveObject: (target, obj, attack, actionEnv) => passive_obj(
            target,
            obj,
            attack,
            actionEnv.state,
            actionEnv,
        ),
        placeObject: (obj, x, y, actionEnv) => place_object(
            obj,
            x,
            y,
            actionEnv,
        ),
        shouldMulch: (obj, actionEnv) => should_mulch_missile(
            obj,
            actionEnv.state,
            actionEnv,
        ),
        stackObject: (obj, actionEnv) => stackobj(obj, {
            ...actionEnv,
            hooks: {
                ...(actionEnv.hooks ?? {}),
                extractExternalObject: remove_object,
            },
        }),
        temporaryDisplay: tmp_at,
        throwMissile: m_throw,
    };
}

// Shared mattacku adapter for dochug, pet attacks and the special movers.
// mattacku() calls its own dispatch callees; this keeps the missile keys
// other readers on its env take, and the wield operation js/mhitm.js
// mattackm() reads when mattacku() turns on the hero's steed.
export function attackHeroWithMattacku(monster, env) {
    return mattacku(monster, {
        ...env,
        ...monsterMissileEnv(monster, env),
        wieldMonsterItemAgainstMonster,
    });
}

// C ref: dogmove.c pet_ranged_attk(), called by dog_move and the mounted
// cmd.c domonability branch. Both use the same canonical attack operations.
export async function runPetRangedAttack(monster, forced, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    return pet_ranged_attk(monster, forced, {
        ...env,
        state,
        random: actionRandom(env),
        attackHero: attackHeroWithMattacku,
        // C path: dogmove.c pet_ranged_attk() -> mhitm.c mattackm()
        // -> mthrowu.c thrwmm() -> monshoot(). Keep the same missile
        // operations and display RNG on this monster-target caller.
        mattackm: (attacker, target, attackEnv) => mattackm(
            attacker,
            target,
            {
                ...attackEnv,
                ...monsterMissileEnv(attacker, attackEnv),
                wieldMonsterItemAgainstMonster,
            },
        ),
        message: rawEnv.message ?? ttyPline,
        markInvisible: map_invisible,
    });
}

export async function wieldMonsterItemAgainstMonster(
    weaponUser,
    weaponEnv,
) {
    return mon_wield_item(weaponUser, weaponEnv);
}

function simpleMonsterActionEnvironment(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = actionRandom(rawEnv);
    const env = {
        ...rawEnv,
        state,
        random,
        hooks: { ...(rawEnv.hooks ?? {}) },
        migrateToLevel: rawEnv.migrateToLevel
            ?? monsterMigrationOperation({ ...rawEnv, state, random }),
        setApparxy: rawEnv.setApparxy
            ?? ((subject, operationEnv) => set_apparxy(subject, operationEnv)),
        onscary: rawEnv.onscary
            ?? ((x, y, subject, operationEnv) =>
                onscary(x, y, subject, operationEnv.state)),
    };
    return { env, state };
}

// Build the operation bundle once for both C call sites: movemon's wrapped
// action and shk.c u_entered_shop's direct extra action.
function simpleMonsterActionOperations(env, state) {
    return {
        // One dochug() now serves both, as in C. m_move() picks the mover.
        // These are the same source-backed providers used by dochugw today.
        // Canonical mattacku operations are shared by both dochug
        // attacks, both pet calls, shk_move, pri_move and wormhitu.
        attackHero: attackHeroWithMattacku,
                // monmove.c:distfleeck564 and dochug's fear calls share the
                // canonical flight owner.
        monFlee: (subject, time, first, showMessage, fleeEnv) =>
                    monflee(subject, time, first, showMessage, {
                        ...fleeEnv,
                        canSeeMonster: (mtmp) => canseemon(mtmp, fleeEnv.state),
                        fleeMessage: monfleeMessage,
                        message: fleeEnv.message ?? ttyPline,
                        createGasCloud: createMonsterGasCloud,
                    }),
        questStatCheck: quest_stat_check,
                // C ref: monmove.c:722 quest_talk(). The one place a monster's
                // turn reads the keyboard: quest.c is_pure()'s wizard-mode
                // `adjust?` prompt.
        questTalk: (subject, talkEnv) => quest_talk(subject, {
                    ...talkEnv,
                    output: undefined,
                    message: ttyPline,
                    yn: undefined,
                }),
        wieldMonsterItem: (weaponUser, weaponEnv) =>
                    mon_wield_item(weaponUser, weaponEnv),
        wieldMonsterItemAgainstMonster,
        wipeEngraving: wipeSimpleEngraving,
    };
}

// Execute one direct monster action. C calls dochug()
// directly from shk.c u_entered_shop(), without dochugw()'s interruption step.
export async function runDirectMonsterAction(monster, rawEnv = {}) {
    const { env, state } = simpleMonsterActionEnvironment(rawEnv);
    return dochug(monster, {
        ...env,
        ...simpleMonsterActionOperations(env, state),
    });
}

// Execute one monster action for the movemon() adapter in js/allmain.js.
export async function runSimpleMonsterAction(monster, rawEnv = {}) {
    const { env, state } = simpleMonsterActionEnvironment(rawEnv);
    return dochugw(monster, true, {
        ...env,
        canSpotMonster: (subject) => canspotmon(subject, state),
        // C ref: monmove.c dochugw():223-235. Its radius is nine squares, so
        // this fires several turns before moveloop_core()'s own
        // monster_nearby() test, which scans the eight adjacent squares alone.
        // A meal finished here draws from env.random (js/eat.js eatfood()).
        stopOccupation: () => stop_occupation(state, {
            message: ttyPline,
            statusRefresh: () => bot(),
            random: env.random,
        }),
    });
}

function createMonsterGasCloud(x, y, size, damage, effectEnv) {
    const { state } = effectEnv;
    return create_gas_cloud(x, y, size, damage, {
        ...effectEnv,
        blockPoint: (cloudX, cloudY) =>
            block_point(cloudX, cloudY, state),
        canSee: (cloudX, cloudY) => cansee(cloudX, cloudY, state),
        newsym,
        message: effectEnv.message ?? ((text, target) => ttyPline(text, target)),
    });
}
