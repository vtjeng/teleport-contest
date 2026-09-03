// mthrowu.js -- Monster ranged attacks and hero-is-hit-by-missile logic.
//
// C ref: mthrowu.c. This file holds thitu() (75-155, hero hit by non-monster
// missile), thrwmu()'s ordinary single-shot path (1174-1263), monmulti()'s
// quantity-one result (201-259), monshoot()'s visible announcement head
// (262-300), m_throw()'s ordinary quantity-one hit and drop settlement
// (572-844) together with the POTION_CLASS arm (698-701) that muse.c
// use_offensive() reaches, and the
// line-of-fire tests every ranged monster action asks before it acts:
// blocking_terrain() (1281-1288), linedup() (1330-1372),
// m_lined_up() (1375-1394) and lined_up() (1397-1401).
// Polearm and returning-weapon attacks, multishot, unseen feedback, alternate
// m_throw() flight and hit outcomes, breamu(), and spitmu() remain behind
// js/unported_monster_actions.js.

import {
    A_CON,
    A_DEX,
    A_STR,
    BLINDED,
    BOLT_LIM,
    CONFUSION,
    DISP_END,
    DISP_FLASH,
    FUMBLING,
    HALF_PHDAM,
    IRONBARS,
    IS_OBSTRUCTED,
    IS_SINK,
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
    POTHIT_MONST_THROW,
    P_BOW,
    SLT_ENCUMBER,
    STUNNED,
    isok,
    u_at,
} from './const.js';
import { effective_attribute } from './attrib.js';
import { freehand } from './engrave.js';
import { game } from './gstate.js';
import { calc_capacity } from './hack.js';
import { distmin, sgn, upstart } from './hacklib.js';
import { hands_obj } from './invent.js';
import { m_carrying } from './mon.js';
import { bigmonst, is_elf, nohands, throws_rocks } from './mondata.js';
import { PM_MONK, PM_ROGUE } from './monsters.js';
// closed_door() belongs to monmove.c, and js/monmove.js imports lined_up()
// back for m_move()'s item search. Both sides of that cycle are hoisted
// function declarations, which an ES module cycle initializes before either
// module body runs; nothing here reads the import at module scope.
import { closed_door } from './monmove.js';
import { ammo_and_launcher, objectType, sobj_at } from './obj.js';
import {
    ACID_VENOM,
    AKLYS,
    BLINDING_VENOM,
    BOULDER,
    CREAM_PIE,
    EGG,
    GEM_CLASS,
    POTION_CLASS,
    SILVER,
    STRANGE_OBJECT,
    VENOM_CLASS,
    WAN_STRIKING,
    WEAPON_CLASS,
} from './objects.js';
import {
    an,
    killer_xname,
    mshot_xname,
    obj_is_pname,
    singular,
    the,
    vtense,
    xnameFresh,
} from './objnam.js';
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

function propertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function maybeHalfPhysical(damage, state) {
    return propertyActive(state, HALF_PHDAM)
        ? Math.trunc((damage + 1) / 2) : damage;
}

// C ref: mthrowu.c u_catch_thrown_obj() (531-549), through the failed-catch
// result selected by an ordinary monster missile. A successful catch hands the
// object to hold_another_object(), which remains a named boundary.
function u_catch_thrown_obj(obj, env) {
    const { state, random } = env;
    const role = state.urole?.mnum;
    const catchChance = 100 - effective_attribute(state, A_DEX)
        - ((role === PM_MONK || role === PM_ROGUE) ? 20 : 0);
    if (!heroIsBlind(state)
        && !propertyActive(state, CONFUSION)
        && !propertyActive(state, STUNNED)
        && !propertyActive(state, FUMBLING)
        && obj.oclass !== VENOM_CLASS
        && !nohands(state.youmonst.data)
        && freehand(state)
        && calc_capacity(obj.owt, state) <= SLT_ENCUMBER
        && random.rn2(catchChance) === 0) {
        return refuseRanged(env, 'successful monster missile catch');
    }
    return false;
}

// C ref: mthrowu.c drop_throw() (162-196), ordinary surviving object arm.
// Operations are resolved before the first floor write so an incomplete live
// adapter cannot strand a free missile after the hit.
export async function drop_throw(obj, ohit, x, y, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    const shouldMulch = requireRangedOperation(env, 'shouldMulch');
    const shipsAway = requireRangedOperation(env, 'shipsAway');
    const monsterAt = requireRangedOperation(env, 'monsterAt');
    const floorEffects = requireRangedOperation(env, 'floorEffects');
    const placeObject = requireRangedOperation(env, 'placeObject');
    const passiveObject = requireRangedOperation(env, 'passiveObject');
    const stackObject = requireRangedOperation(env, 'stackObject');

    if (obj.otyp === CREAM_PIE || obj.oclass === VENOM_CLASS
        || (ohit && obj.otyp === EGG)) {
        return refuseRanged(env, 'destroyed special monster missile');
    }
    if (ohit && shouldMulch(obj, env))
        return refuseRanged(env, 'destroyed monster missile');
    if (shipsAway(x, y, state))
        return refuseRanged(env, 'monster missile shipping through a down gate');

    let monster = monsterAt(x, y, state);
    if (floorEffects(obj, x, y, 'fall', env))
        return refuseRanged(env, 'monster missile floor effect');
    placeObject(obj, x, y, env);
    if (!monster && u_at(x, y, state)) monster = state.youmonst;
    if (monster && ohit) await passiveObject(monster, obj, null, env);
    stackObject(obj, env);
    state.gt ??= {};
    state.gt.thrownobj = null;
    return false;
}

// C ref: mthrowu.c monmulti() (201-259), quantity-one arm. The source skips
// every skill, race, launcher and random adjustment when quan is one.
export function monmulti(monster, missile, launcher, env = {}) {
    if (Math.trunc(missile.quan ?? 1) !== 1)
        return refuseRanged(env, 'monster multishot');
    return 1;
}

// C ref: mthrowu.c m_throw() (572-844), quantity-one, ordinary untethered
// weapon hit. Alternate flight, interception, catch, special-object, miss,
// death, floor-effect, and return paths retain named refusals.
export async function m_throw(monster, x, y, dx, dy, range, obj, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2, rnd };
    const env = { ...rawEnv, state, random };

    // Resolve every injected owner before the source-ordered inventory
    // extraction. The planning pass also executes the complete path on cloned
    // state, but a missing live adapter must still fail before mutation.
    const canSeeMonster = requireRangedOperation(env, 'canSeeMonster');
    const canSeeSquare = requireRangedOperation(env, 'canSeeSquare');
    const monsterAt = requireRangedOperation(env, 'monsterAt');
    const objectToGlyph = requireRangedOperation(env, 'objectToGlyph');
    const temporaryDisplay = requireRangedOperation(env, 'temporaryDisplay');
    const delayOutput = requireRangedOperation(env, 'delayOutput');
    const clearObjectKnowledge = requireRangedOperation(
        env,
        'clearObjectKnowledge',
    );
    const observeObject = requireRangedOperation(env, 'observeObject');
    const extractObject = requireRangedOperation(env, 'extractObject');
    const setMonsterNotWielded = requireRangedOperation(
        env,
        'setMonsterNotWielded',
    );
    const damageValue = requireRangedOperation(env, 'damageValue');
    const hitHero = requireRangedOperation(env, 'hitHero');
    const stopOccupation = requireRangedOperation(env, 'stopOccupation');
    // drop_throw() resolves its remaining seven dependencies at entry.
    requireRangedOperation(env, 'shouldMulch');
    requireRangedOperation(env, 'shipsAway');
    requireRangedOperation(env, 'floorEffects');
    requireRangedOperation(env, 'placeObject');
    requireRangedOperation(env, 'passiveObject');
    requireRangedOperation(env, 'stackObject');

    if (Math.trunc(obj.quan ?? 1) !== 1)
        return refuseRanged(env, 'monster multishot');
    // C ref: muse.c use_offensive()'s MUSE_POT_* case is the other live
    // caller; it hands over a potion, whose hero-hit arm at 698-701 calls
    // potionhit(). Every other object class still refuses.
    if (obj.oclass !== WEAPON_CLASS && obj.oclass !== POTION_CLASS)
        return refuseRanged(env, 'monster special missile action');
    if (obj.cursed || obj.greased)
        return refuseRanged(env, 'cursed or greased monster missile flight');
    if (obj.oartifact)
        return refuseRanged(env, 'monster returning or artifact missile');
    if (obj.opoisoned)
        return refuseRanged(env, 'poisoned monster missile');

    state.gb ??= {};
    state.gb.bhitpos ??= {};
    state.gb.bhitpos.x = x;
    state.gb.bhitpos.y = y;
    state.gn ??= {};
    state.gn.notonhead = false;

    if (monster.mw === obj)
        await setMonsterNotWielded(monster, obj, env);
    extractObject(obj, env);
    const singleobj = obj;
    state.gt ??= {};
    state.gt.thrownobj = singleobj;
    singleobj.owornmask = 0;
    if (!canSeeMonster(monster, state)) clearObjectKnowledge(singleobj, state);

    const nextX = state.gb.bhitpos.x + dx;
    const nextY = state.gb.bhitpos.y + dy;
    if (!isok(nextX, nextY))
        return refuseRanged(env, 'blocked monster missile terrain');
    const nextLocation = state.level.at(nextX, nextY);
    if (IS_OBSTRUCTED(nextLocation.typ)
        || closed_door(nextX, nextY, state)
        || nextLocation.typ === IRONBARS) {
        return refuseRanged(env, 'blocked monster missile terrain');
    }
    state.mesg_given = 0;
    await temporaryDisplay(
        DISP_FLASH,
        objectToGlyph(singleobj, state),
        state,
    );

    let hit = false;
    // C leaves the loop by `break` from three arms; two are ported. The weapon
    // arm settles the object through drop_throw(), the potion arm through
    // potionhit()'s obfree().
    let settled = false;
    while (range-- > 0) {
        singleobj.ox = state.gb.bhitpos.x += dx;
        singleobj.oy = state.gb.bhitpos.y += dy;
        if (canSeeSquare(state.gb.bhitpos.x, state.gb.bhitpos.y, state))
            observeObject(singleobj, state);

        if (monsterAt(state.gb.bhitpos.x, state.gb.bhitpos.y, state))
            return refuseRanged(env, 'monster missile flight');
        if (u_at(state.gb.bhitpos.x, state.gb.bhitpos.y, state)) {
            if (state.multi) requireRangedOperation(env, 'endMulti')(0, state);
            if (singleobj.oclass === GEM_CLASS)
                return refuseRanged(env, 'unicorn gem catch');
            if (u_catch_thrown_obj(singleobj, env)) return 0;
            if (singleobj.oclass === POTION_CLASS) {
                // potionhit() always uses the object up, so the flight loop
                // hands over ownership and never reaches drop_throw().
                await requireRangedOperation(env, 'potionHit')(
                    state.youmonst,
                    singleobj,
                    POTHIT_MONST_THROW,
                    env,
                );
                settled = true;
                break;
            }
            if (singleobj.otyp === EGG
                || singleobj.otyp === CREAM_PIE
                || singleobj.otyp === BLINDING_VENOM) {
                return refuseRanged(env, 'special monster missile hit');
            }

            let damage = damageValue(singleobj, state.youmonst, env);
            let hitv = 3 - distmin(
                state.u.ux,
                state.u.uy,
                monster.mx,
                monster.my,
            );
            if (hitv < -4) hitv = -4;
            if (is_elf(monster.data)
                && objectType(singleobj, state).oc_skill === -P_BOW) {
                return refuseRanged(env, 'elven monster shooting bonus');
            }
            if (bigmonst(state.youmonst.data)) hitv++;
            hitv += 8 + singleobj.spe;
            if (damage < 1) damage = 1;
            if (singleobj.otyp !== ACID_VENOM)
                damage = maybeHalfPhysical(damage, state);
            hit = Boolean(await hitHero(hitv, damage, singleobj, env));
            await stopOccupation(state, env);
            if (!hit)
                return refuseRanged(env, 'monster missile miss');
            await drop_throw(
                singleobj,
                true,
                state.u.ux,
                state.u.uy,
                env,
            );
            settled = true;
            break;
        }

        random.rn2(5); /* forcehit, consumed even without iron bars */
        if (!range) return refuseRanged(env, 'monster missile range expiry');
        const nextFlightX = state.gb.bhitpos.x + dx;
        const nextFlightY = state.gb.bhitpos.y + dy;
        if (!isok(nextFlightX, nextFlightY))
            return refuseRanged(env, 'blocked monster missile terrain');
        const location = state.level.at(nextFlightX, nextFlightY);
        if (IS_OBSTRUCTED(location.typ)
            || closed_door(
                nextFlightX,
                nextFlightY,
                state,
            )
            || location.typ === IRONBARS
            || IS_SINK(state.level.at(
                state.gb.bhitpos.x,
                state.gb.bhitpos.y,
            ).typ)) {
            return refuseRanged(env, 'blocked monster missile terrain');
        }
        await temporaryDisplay(
            state.gb.bhitpos.x,
            state.gb.bhitpos.y,
            state,
        );
        await delayOutput(state);
    }

    if (!settled)
        return refuseRanged(env, 'monster missile without settlement');
    await temporaryDisplay(state.gb.bhitpos.x, state.gb.bhitpos.y, state);
    await delayOutput(state);
    await temporaryDisplay(DISP_END, 0, state);
    state.mesg_given = 0;
    state.gt.thrownobj = null;
    return 0;
}

// C ref: mthrowu.c monshoot() (262-300), visible quantity-one thrown-weapon
// arm through m_throw() and the source-ordered m_shot reset.
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
    state.m_shot.n = 0;
    state.m_shot.i = 0;
    state.m_shot.o = STRANGE_OBJECT;
    state.m_shot.s = false;
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
    // C: rn2(BOLT_LIM - distmin(x, y, mtmp->mux, mtmp->muy))
    const targetDistance = distmin(
        monster.mx,
        monster.my,
        monster.mux,
        monster.muy,
    );
    if (currentDistance > previousDistance
        && env.random.rn2(BOLT_LIM - targetDistance)) {
        return 0;
    }
    if (selected.oclass !== WEAPON_CLASS)
        return refuseRanged(env, 'monster special missile action');

    const endMulti = requireRangedOperation(env, 'endMulti');
    await monshoot(monster, selected, monster.mw, env);
    endMulti(0, state);
    return 0;
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
        name = obj.quan > 1 ? refuseRanged(env, 'plural monster missile name')
            : mshot_xname(obj, state);
        knm = killer_xname(obj, state);
        kprefix = KILLED_BY;
    } else {
        knm = name;
        const lower = name.toLowerCase();
        if (lower.startsWith('the ') || lower.startsWith('an ')
            || lower.startsWith('a '))
            kprefix = KILLED_BY;
    }
    onm = obj && obj_is_pname(obj, state) ? the(name, state)
        : obj && obj.quan > 1 ? name : an(name);

    const is_acid = obj && obj.otyp === ACID_VENOM;

    const dieroll = random.rnd(20);
    if (state.u.uac + tlev <= dieroll) {
        // Miss. C increments gm.mesg_given, which m_throw() reads when deciding
        // whether a later multishot miss needs its own message.
        state.mesg_given = (state.mesg_given ?? 0) + 1;
        if (env.requireHit) return refuseRanged(env, 'monster missile miss');
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
        if (env.requireHit && dam >= state.u.uhp)
            return refuseRanged(env, 'fatal monster missile hit');
        await losehp(dam, knm, kprefix, state);
        await exercise(A_STR, false, state);
    }
    return 1;
}
