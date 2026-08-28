// mthrowu.js -- Monster ranged attacks and hero-is-hit-by-missile logic.
//
// C ref: mthrowu.c. This file holds thitu() (75-155, hero hit by non-monster
// missile), thrwmu()'s ordinary single-shot path (1174-1263), monmulti()'s
// quantity-one result (201-259), monshoot()'s visible announcement head
// (262-300), and the
// line-of-fire tests every ranged monster action asks before it acts:
// blocking_terrain() (1281-1288), linedup() (1330-1372),
// m_lined_up() (1375-1394) and lined_up() (1397-1401).
// Polearm and returning-weapon attacks, multishot, unseen feedback, the rest
// of monshoot(), m_throw(), breamu() and spitmu() remain behind
// js/unported_monster_actions.js.

import {
    A_CON,
    A_STR,
    BLINDED,
    BOLT_LIM,
    IS_OBSTRUCTED,
    IS_WATERWALL,
    KILLED_BY,
    KILLED_BY_AN,
    LAVAWALL,
    M_AP_MONSTER,
    M_AP_NOTHING,
    M_AP_TYPE,
    Upolyd,
    NEED_RANGED_WEAPON,
    NEED_WEAPON,
    isok,
    u_at,
} from './const.js';
import { game } from './gstate.js';
import { distmin, sgn, upstart } from './hacklib.js';
import { hands_obj } from './invent.js';
import { m_carrying } from './mon.js';
import { throws_rocks } from './mondata.js';
// closed_door() belongs to monmove.c, and js/monmove.js imports lined_up()
// back for m_move()'s item search. Both sides of that cycle are hoisted
// function declarations, which an ES module cycle initializes before either
// module body runs; nothing here reads the import at module scope.
import { closed_door } from './monmove.js';
import { ammo_and_launcher, sobj_at } from './obj.js';
import {
    ACID_VENOM,
    AKLYS,
    BOULDER,
    SILVER,
    WAN_STRIKING,
    WEAPON_CLASS,
} from './objects.js';
import { an, obj_is_pname, singular, vtense, xnameFresh } from './objnam.js';
import { rn2, rnd } from './rng.js';
import { clear_path, couldsee } from './vision.js';
import { mon_wield_item, select_rwep } from './weapon.js';
import { is_pole } from './worn.js';
import { exclam } from './zap.js';

// C ref: mthrowu.c blocking_terrain() (1281-1288). "return TRUE if terrain at
// x,y blocks linedup checks".
export function blocking_terrain(x, y, state = game) {
    // cmd.c isok() rejects column zero, which GameMap.at() still answers a
    // cell for, so the two tests are not interchangeable here. Every square
    // isok() accepts has a cell: GameMap builds the whole COLNO x ROWNO grid
    // in its constructor (js/game.js:39-47).
    if (!isok(x, y)) return true;
    const location = state.level.at(x, y);
    return IS_OBSTRUCTED(location.typ)
        || closed_door(x, y, state)
        || IS_WATERWALL(location.typ)
        || location.typ === LAVAWALL;
}

// C ref: mthrowu.c linedup() (1330-1372). Is <bx,by> in a straight orthogonal
// or diagonal line to <ax,ay>, within BOLT_LIM, with nothing in between?
//
// `boulderhandling` is C's: 0 blocks on any obstruction, 1 ignores boulders,
// 2 rolls rn2(2 + boulderspots) for a ray blocked by boulders alone. The draw
// is the only randomness here and only arm 2 spends it.
//
// C also stores the displacement in gt.tbx and gt.tby "for use after
// successful return". Those two have no ported reader -- m_throw() and
// thrwmu() are their consumers -- so this keeps them local.
export function linedup(ax, ay, bx, by, boulderhandling, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const tbx = ax - bx;
    const tby = ay - by;

    /* sometimes displacement makes a monster think that you're at its
       own location; prevent it from throwing and zapping in that case */
    if (!tbx && !tby) return false;

    /* straight line, orthogonal to the map or diagonal */
    if ((!tbx || !tby || Math.abs(tbx) === Math.abs(tby))
        && distmin(tbx, tby, 0, 0) < BOLT_LIM) {
        if (u_at(ax, ay, state)
            ? Boolean(couldsee(bx, by, state))
            : Boolean(clear_path(ax, ay, bx, by))) {
            return true;
        }
        /* don't have line of sight, but might still be lined up
           if that lack of sight is due solely to boulders */
        if (boulderhandling === 0) return false;
        const dx = sgn(ax - bx);
        const dy = sgn(ay - by);
        let x = bx;
        let y = by;
        let boulderspots = 0;
        do {
            /* <x,y> is guaranteed to eventually converge with <ax,ay> */
            x += dx;
            y += dy;
            if (blocking_terrain(x, y, state)) return false;
            if (sobj_at(BOULDER, x, y, state)) ++boulderspots;
        } while (x !== ax || y !== ay);
        /* reached target position without encountering obstacle */
        if (boulderhandling === 1 || random.rn2(2 + boulderspots) < 2)
            return true;
    }
    return false;
}

// C ref: mthrowu.c m_lined_up() (1375-1394). A monster aims at where it
// believes the hero is, <mux,muy>, not at the hero's real square.
export function m_lined_up(mtarg, mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const utarget = mtarg === state.youmonst;
    const tx = utarget ? mtmp.mux : mtarg.mx;
    const ty = utarget ? mtmp.muy : mtarg.my;
    const ignore_boulders = utarget
        && (throws_rocks(mtmp.data)
            || Boolean(m_carrying(mtmp, WAN_STRIKING, state)));

    /* hero concealment usually trumps monst awareness of being lined up */
    // Upolyd is false for every hero the port reaches, so the rn2(25) is not
    // spent today; it is written out rather than dropped because skipping a
    // draw would shift every later call in the turn once polymorph lands.
    const apType = M_AP_TYPE(state.youmonst);
    if (utarget && Upolyd(state.u) && random.rn2(25)
        && (state.u.uundetected
            || (apType !== M_AP_NOTHING && apType !== M_AP_MONSTER))) {
        return false;
    }

    /* [no callers care about the 1 vs 2 situation any more] */
    return linedup(tx, ty, mtmp.mx, mtmp.my,
        utarget ? (ignore_boulders ? 1 : 2) : 0,
        { state, random });
}

// C ref: mthrowu.c lined_up() (1397-1401). "is mtmp in position to use ranged
// attack on hero?"
export function lined_up(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    return m_lined_up(state.youmonst, mtmp, { ...rawEnv, state });
}

// youprop.h:341 Blind. hero is blind if the intrinsic or extrinsic is present
// and not blocked (typically by telepathy). Each C port file defines this
// module-locally; see the note in js/hack.js heroIsBlind().
function heroIsBlind(state) {
    const blindness = state.u?.uprops?.[BLINDED];
    return Boolean(
        (blindness?.intrinsic || blindness?.extrinsic)
        && !blindness?.blocked,
    );
}

function requireRangedOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`monster ranged attack requires a ${name} operation`);
    return operation;
}

function refuseRanged(env, reason) {
    return requireRangedOperation(env, 'unsupported')(reason);
}

// C ref: mthrowu.c monmulti() (201-259), quantity-one arm. The source skips
// every skill, race, launcher and random adjustment when quan is one.
export function monmulti(monster, missile, launcher, env = {}) {
    if (Math.trunc(missile.quan ?? 1) !== 1)
        return refuseRanged(env, 'monster multishot');
    return 1;
}

// C ref: mthrowu.c monshoot() (262-300), through the first m_throw() call for
// a visible quantity-one thrown weapon. Missile flight remains an injected
// boundary. The planning pass supplies a no-op so the live pass can reach the
// source-ordered announcement before its flight operation refuses.
export async function monshoot(monster, missile, launcher, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    const target = env.monsterTarget ?? null;
    if (target)
        return refuseRanged(env, 'monster ranged attack on another monster');

    const range = distmin(
        monster.mx,
        monster.my,
        monster.mux,
        monster.muy,
    );
    const multishot = monmulti(monster, missile, launcher, env);
    const seesMonster = requireRangedOperation(env, 'canSeeMonster');
    if (!seesMonster(monster, state))
        return refuseRanged(env, 'unseen monster ranged feedback');

    if (ammo_and_launcher(missile, launcher, state))
        return refuseRanged(env, 'monster ranged launcher action');
    if (obj_is_pname(missile, state))
        return refuseRanged(env, 'named monster missile announcement');

    const singleName = singular(missile, xnameFresh, state);
    const objectName = an(singleName);
    state.m_shot ??= {};
    state.m_shot.s = false;
    const monsterName = requireRangedOperation(env, 'monsterName');
    const message = requireRangedOperation(env, 'message');
    await message(
        `${monsterName(monster, state)} throws ${objectName}!`,
        state,
    );
    state.m_shot.o = missile.otyp;
    state.m_shot.n = multishot;
    state.m_shot.i = 1;

    const throwMissile = requireRangedOperation(env, 'throwMissile');
    await throwMissile(
        monster,
        monster.mx,
        monster.my,
        sgn(monster.mux - monster.mx),
        sgn(monster.muy - monster.my),
        range,
        missile,
        env,
    );
    return 0;
}

// C ref: mthrowu.c thrwmu() (1174-1263), through the source-ordered wield
// turn, ordinary line and retreat checks, and monshoot()'s first m_throw().
export async function thrwmu(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const env = { ...rawEnv, state, random };

    if (monster.weapon_check === NEED_WEAPON || !monster.mw) {
        monster.weapon_check = NEED_RANGED_WEAPON;
        const selectRangedWeapon = (subject, selectionEnv) => {
            const propellorResult = {};
            select_rwep(subject, {
                ...selectionEnv,
                propellorResult,
            });
            return propellorResult.value;
        };
        if (await mon_wield_item(monster, {
            ...env,
            handsObject: hands_obj,
            selectRangedWeapon,
        }) !== 0) {
            return 1;
        }
    }

    const selected = select_rwep(monster, env);
    if (!selected) return 0;

    if (is_pole(selected, state) || selected.otyp === AKLYS) {
        return refuseRanged(
            env,
            'monster polearm or returning-weapon action',
        );
    }
    if (!lined_up(monster, env)) return 0;

    const currentDistance = distmin(
        state.u.ux,
        state.u.uy,
        monster.mx,
        monster.my,
    );
    const previousDistance = distmin(
        state.u.ux0,
        state.u.uy0,
        monster.mx,
        monster.my,
    );
    if (currentDistance > previousDistance
        && env.random.rn2(BOLT_LIM - currentDistance)) {
        return 0;
    }
    if (selected.oclass !== WEAPON_CLASS)
        return refuseRanged(env, 'monster special missile action');

    return monshoot(monster, selected, monster.mw, env);
}

// C ref: mthrowu.c thitu() (75-155). "hero is hit by something other than a
// monster (though it could be a missile thrown or shot by a monster)".
//
// For a dart trap, `name` is "little dart" and `obj` is the dart object.
// The acid venom, stone missile, potion, and silver branches do not fire for a
// dart; each is guarded so that a future caller who reaches them gets a clear
// refusal rather than silent misbehavior.
//
// env.message is the async message owner (ttyPline or equivalent).
// env.losehp and env.exercise are cycle-breaking injections from the caller.
// env.random provides rnd(); the caller must supply it.
export async function thitu(tlev, dam, obj, name, state = game, env = {}) {
    const random = env.random ?? { rnd };
    const message = env.message;
    if (typeof message !== 'function')
        throw new TypeError('thitu requires a message owner');
    const losehp = env.losehp;
    if (typeof losehp !== 'function')
        throw new TypeError('thitu requires losehp');
    const exercise = env.exercise;
    if (typeof exercise !== 'function')
        throw new TypeError('thitu requires exercise');

    const named = name != null;
    let onm, knm;
    let kprefix = KILLED_BY_AN;

    if (!named) {
        if (!obj) throw new Error('thitu: name & obj both null?');
        // C formats with doname() or mshot_xname(). For the dart trap caller,
        // name is always "little dart", so this branch is unreachable there.
        // Guard it for future callers.
        throw new Error('thitu without a name is not yet ported');
    } else {
        knm = name;
        const lower = name.toLowerCase();
        if (lower.startsWith('the ') || lower.startsWith('an ')
            || lower.startsWith('a '))
            kprefix = KILLED_BY;
    }
    onm = an(name);

    const is_acid = obj && obj.otyp === ACID_VENOM;

    const dieroll = random.rnd(20);
    if (state.u.uac + tlev <= dieroll) {
        // Miss. C increments gm.mesg_given, which only m_throw() reads; that
        // function is not ported, so the counter has no consumer yet.
        if (heroIsBlind(state) || !state.flags?.verbose) {
            await message('It misses.', state);
        } else if (state.u.uac + tlev <= dieroll - 2) {
            // Clear miss: "A little dart misses you."
            const capitalized = upstart(onm);
            await message(
                `${capitalized} ${vtense(capitalized, 'miss')} you.`,
                state,
            );
        } else {
            await message(`You are almost hit by ${onm}.`, state);
        }
        return 0;
    }

    // Hit.
    if (heroIsBlind(state) || !state.flags?.verbose)
        await message(`You are hit${exclam(dam)}`, state);
    else
        await message(`You are hit by ${onm}${exclam(dam)}`, state);

    if (is_acid) {
        // C ref: mthrowu.c:123-125. Acid_resistance and monstseesu() are not
        // ported; a dart is never acid, so this cannot fire for the dart trap
        // caller.
        throw new Error('thitu acid branch is not yet ported');
    } else if (obj && !is_acid
               && env.stone_missile?.(obj)
               && env.passes_rocks?.(state.youmonst.data)) {
        // C ref: mthrowu.c:126-133. stone_missile + passes_rocks: not ported,
        // unreachable for a dart.
        throw new Error('thitu stone missile branch is not yet ported');
    } else if (obj && obj.oclass === env.POTION_CLASS) {
        // C ref: mthrowu.c:134-138. potionhit() is not ported, unreachable
        // for a dart.
        throw new Error('thitu potion branch is not yet ported');
    } else {
        // C ref: mthrowu.c:139-151. The generic hit path that runs for darts,
        // arrows, rocks, and any non-special missile.
        //
        // Silver searing: the dart is iron, not silver. For a future caller
        // whose missile is silver and the hero hates silver, exercise(A_CON,
        // FALSE) and the message need to fire. Both Hate_silver and the
        // material lookup are unported; guard them behind optional env hooks.
        if (obj && env.objectMaterial?.(obj, state) === SILVER
            && env.Hate_silver?.(state)) {
            await message('The silver sears your flesh!', state);
            await exercise(A_CON, false, state);
        }
        // is_acid is false here for a dart; the burn + monstunseesu path does
        // not fire.
        await losehp(dam, knm, kprefix, state);
        await exercise(A_STR, false, state);
    }
    return 1;
}
