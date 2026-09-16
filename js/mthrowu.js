// mthrowu.js -- Monster ranged attacks and hero-is-hit-by-missile logic.
//
// C ref: mthrowu.c. This file holds every function from mthrowu.c:
// rnd_hallublast (50-55), m_has_launcher_and_ammo (57-71), thitu (75-155),
// drop_throw (162-196), monmulti (201-259), monshoot (262-314),
// ohitmon (321-502), ucatchgem (505-529),
// u_catch_thrown_obj (531-549 partial), m_throw (572-844),
// return_from_mtoss (850-965), thrwmm (968-1012), spitmm (1014-1077),
// breathwep_name (1082-1089), breamm (1091-1150), m_useupall (1153-1158),
// m_useup (1160-1170), thrwmu (1174-1263), spitmu (1265-1271),
// breamu (1273-1278), blocking_terrain (1281-1288), linedup_callback
// (1295-1328), linedup (1330-1372), m_lined_up (1375-1394),
// lined_up (1397-1401), hit_bars (1417-1495), hits_bars (1498-1559).

import {
    A_CON,
    A_DEX,
    A_STR,
    ACID_RES,
    ARM,
    BACKTRACK,
    FACE,
    BLINDED,
    BOLT_LIM,
    BZ_OFS_AD,
    BZ_VALID_ADTYP,
    CONFUSION,
    DEAF,
    DISP_TETHER,
    DISP_END,
    DISP_FLASH,
    EYE,
    EDOG,
    FOOT,
    FUMBLING,
    HALF_PHDAM,
    HALLUC,
    HALLUC_RES,
    IRONBARS,
    IS_OBSTRUCTED,
    IS_SINK,
    IS_WATERWALL,
    KILLED_BY,
    KILLED_BY_AN,
    HAND,
    LAVAWALL,
    LOW_PM,
    M_AP_MONSTER,
    M_AP_NOTHING,
    M_AP_TYPE,
    M_ATTK_HIT,
    M_SEEN_ACID,
    M_ATTK_MISS,
    M_SEEN_REFL,
    MON_POLE_DIST,
    Upolyd,
    NEED_RANGED_WEAPON,
    NEED_WEAPON,
    NEUTRAL,
    PET_MISSILE_RANGE2,
    POISON_RES,
    POTHIT_MONST_THROW,
    POTHIT_OTHER_THROW,
    P_BOW,
    P_CROSSBOW,
    P_DART,
    P_KNIFE,
    P_SHURIKEN,
    P_SPEAR,
    BRK_BY_HERO,
    BRK_MELEE,
    SLEEP_RES,
    SLT_ENCUMBER,
    STONE_RES,
    STONED,
    STUNNED,
    TIMEOUT,
    W_NONDIGGABLE,
    W_WEP,
    WT_IRON_BALL_INCR,
    XKILL_NOMSG,
    isok,
    u_at,
} from './const.js';
import { acurr, acurrstr, poisoned } from './attrib.js';
import { freehand } from './engrave.js';
import { game } from './gstate.js';
import { calc_capacity, end_running, nomul, rounddiv } from './hack.js';
import { dist2, distmin, s_suffix, sgn, upstart } from './hacklib.js';
import {
    add_to_minv,
    delobj,
    hands_obj,
    hold_another_object,
    obfree,
    obj_extract_self,
    stackobj,
} from './invent.js';
import {
    multishot_class_bonus,
    omon_adj,
    should_mulch_missile,
} from './dothrow.js';
import { m_carrying, mondied, seemimic, setmangry, xkilled } from './mon.js';
import { m_at } from './monst.js';
import { down_gate, ship_object } from './dokick.js';
import {
    amorphous,
    bigmonst,
    can_blnd,
    cvt_adtyp_to_mseenres,
    get_atkdam_type,
    is_elf,
    hates_silver,
    is_unicorn,
    mhim,
    mhis,
    mon_hates_silver,
    monster_resists_element,
    monstseesu,
    monstunseesu,
    nohands,
    noncorporeal,
    nonliving,
    passes_rocks,
    poly_when_stoned,
    throws_rocks,
    touch_petrifies,
    is_vampshifter,
    is_gnome,
    is_lord,
    is_mplayer,
    is_orc,
    is_prince,
    monsndx,
} from './mondata.js';
import {
    AD_ACID,
    AD_BLND,
    AD_DRST,
    AD_SLEE,
    AT_SPIT,
    AT_WEAP,
    MZ_TINY,
    PM_CYCLOPS,
    PM_FLOATING_EYE,
    PM_MONK,
    PM_ROGUE,
    PM_STONE_GOLEM,
} from './monsters.js';
// closed_door() belongs to monmove.c, and js/monmove.js imports lined_up()
// back for m_move()'s item search. Both sides of that cycle are hoisted
// function declarations, which an ES module cycle initializes before either
// module body runs; nothing here reads the import at module scope.
import { closed_door } from './monmove.js';
import {
    ammo_and_launcher,
    is_flammable,
    is_flimsy,
    is_ammo,
    is_launcher,
    matching_launcher,
    mksobj,
    objectType,
    place_object,
    sobj_at,
    splitobj,
    stone_missile,
    weight,
} from './obj.js';
import {
    ACID_VENOM,
    ARMOR_CLASS,
    ARM_GLOVES,
    BALL_CLASS,
    BLINDING_VENOM,
    BOULDER,
    CHAIN_CLASS,
    COIN_CLASS,
    CORPSE,
    CREAM_PIE,
    CREDIT_CARD,
    EGG,
    ELVEN_ARROW,
    ELVEN_BOW,
    ENORMOUS_MEATBALL,
    FIRST_GLASS_GEM,
    FOOD_CLASS,
    GEM_CLASS,
    GOLD,
    HEAVY_IRON_BALL,
    LAST_GLASS_GEM,
    LENSES,
    LOCK_PICK,
    MAGIC_WHISTLE,
    MEAT_STICK,
    POTION_CLASS,
    POT_ACID,
    ROCK_CLASS,
    SILVER,
    SKELETON_KEY,
    SPBOOK_CLASS,
    STATUE,
    STRANGE_OBJECT,
    TALLOW_CANDLE,
    TIN_WHISTLE,
    TOOL_CLASS,
    VENOM_CLASS,
    WAN_STRIKING,
    WAND_CLASS,
    WAR_HAMMER,
    WAX_CANDLE,
    WEAPON_CLASS,
    CROSSBOW,
    CROSSBOW_BOLT,
    ORCISH_ARROW,
    ORCISH_BOW,
} from './objects.js';
import {
    an,
    donameFresh,
    distant_name,
    isPoisonable,
    killer_xname,
    mshot_xname,
    obj_is_pname,
    singular,
    the,
    Tobjnam,
    vtense,
    xnameFresh,
} from './objnam.js';
import { rn2, rnd } from './rng.js';
import { note_unported } from './unported.js';
import { cansee, canseemon, clear_path, couldsee } from './vision.js';
import { autoreturn_weapon, dmgval, mon_wield_item, select_rwep } from './weapon.js';
import { spec_abon, Stone_resistance } from './artifacts.js';
import { extract_from_minvent, find_mac, is_pole } from './worn.js';
import { mwelded } from './wield.js';
import { dobuzz, exclam, hit, miss } from './zap.js';
import { harmless_missile } from './dothrow.js';
import { observe_object, discover_object } from './o_init.js';
import { make_blinded, potionhit } from './potion.js';
import { munstone } from './muse.js';
import { dropy, flooreffects } from './do.js';
import { makeplural } from './fruit.js';
import { body_part, mbodypart, polymon } from './polyself.js';
import { passive_obj, shade_miss } from './uhitm.js';
import { is_lava, is_pool } from './trap.js';
import { obj_sheds_light } from './light.js';
import {
    capitalizedMonsterName,
    monsterCommonName,
    some_mon_nam,
    Monnam,
    mon_nam,
    hliquid,
} from './do_name.js';
import { canSpotMonster } from './startup_a11y.js';

/* C ref: mthrowu.c:24-28. Breath weapon names indexed by BZ_OFS_AD(typ).
 * Keep consistent with breath weapons in zap.c, and AD_* in monattk.h. */
const breathwep = [
    'fragments', 'fire', 'frost', 'sleep gas', 'a disintegration blast',
    'lightning', 'poison gas', 'acid', 'strange breath #8',
    'strange breath #9',
];

/* C ref: mthrowu.c:31-48. Hallucinatory blast types for rnd_hallublast(). */
const hallublasts = [
    'asteroids', 'beads', 'bubbles', 'butterflies', 'champagne', 'chaos',
    'coins', 'cotton candy', 'crumbs', 'dark matter', 'darkness', 'data',
    'dust specks', 'emoticons', 'emotions', 'entropy', 'flowers', 'foam',
    'fog', 'gamma rays', 'gelatin', 'gemstones', 'ghosts', 'glass shards',
    'glitter', 'good vibes', 'gravel', 'gravity', 'gravy', 'grawlixes',
    'holy light', 'hornets', 'hot air', 'hyphens', 'hypnosis', 'infrared',
    'insects', 'jargon', 'laser beams', 'leaves', 'lightening', 'logic gates',
    'magma', 'marbles', 'mathematics', 'megabytes', 'metal shavings',
    'metapatterns', 'meteors', 'mist', 'mud', 'music', 'nanites', 'needles',
    'noise', 'nostalgia', 'oil', 'paint', 'photons', 'pixels', 'plasma',
    'polarity', 'powder', 'powerups', 'prismatic light', 'pure logic',
    'purple', 'radio waves', 'rainbows', 'rock music', 'rocket fuel', 'rope',
    'sadness', 'salt', 'sand', 'scrolls', 'sludge', 'smileys', 'snowflakes',
    'sparkles', 'specularity', 'spores', 'stars', 'steam', 'tetrahedrons',
    'text', 'the past', 'tornadoes', 'toxic waste', 'ultraviolet light',
    'viruses', 'water', 'waveforms', 'wind', 'X-rays', 'zorkmids',
];

// C ref: mthrowu.c rnd_hallublast() (50-55). Return a random hallucinatory
// blast name. Uses the gameplay RNG (ROLL_FROM macro).
export function rnd_hallublast(random = { rn2 }) {
    return hallublasts[random.rn2(hallublasts.length)];
}

// ---- Module-local hero-property helpers ----
// Each C port file defines these locally; see the pattern in js/mcastu.js.
function heroProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function Hallucination(state) {
    return heroProperty(state, HALLUC)
        && !heroProperty(state, HALLUC_RES);
}

function Deaf(state) {
    return heroProperty(state, DEAF) || Boolean(state.u?.uroleplay?.deaf);
}

function Sleep_resistance(state) {
    return heroProperty(state, SLEEP_RES);
}

// C ref: mondata.h mdistu(). Distance-squared from the hero to a monster.
function mdistu(mon, state) {
    return dist2(state.u.ux, state.u.uy, mon.mx, mon.my);
}

// C ref: mondata.h m_seenres(). Check whether the monster has seen a
// particular resistance type.
function m_seenres(mtmp, mask) {
    return (mtmp.seen_resistance & mask) !== 0;
}

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

// C ref: mthrowu.c linedup_callback() (1295-1328). Walk from <bx,by> toward
// <ax,ay> in a straight orthogonal or diagonal line, within BOLT_LIM, calling
// fnc(x,y) at each step. Returns true if fnc returns true for any step;
// returns false if the walk reaches <ax,ay>, hits blocking terrain, or the
// line is not straight / too long. C also stores the displacement in gt.tbx
// and gt.tby.
export function linedup_callback(ax, ay, bx, by, fnc, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    state.gt ??= {};
    const tbx = state.gt.tbx = ax - bx;
    const tby = state.gt.tby = ay - by;

    /* sometimes displacement makes a monster think that you're at its
       own location; prevent it from throwing and zapping in that case */
    if (!tbx && !tby) return false;

    /* straight line, orthogonal to the map or diagonal */
    if ((!tbx || !tby || Math.abs(tbx) === Math.abs(tby))
        && distmin(tbx, tby, 0, 0) < BOLT_LIM) {
        const dx = sgn(ax - bx);
        const dy = sgn(ay - by);
        let x = bx;
        let y = by;
        do {
            /* <x,y> is guaranteed to eventually converge with <ax,ay> */
            x += dx;
            y += dy;
            if (blocking_terrain(x, y, state)) return false;
            if (fnc(x, y)) return true;
        } while (x !== ax || y !== ay);
    }
    return false;
}

// C ref: mthrowu.c linedup() (1330-1372). Is <bx,by> in a straight orthogonal
// or diagonal line to <ax,ay>, within BOLT_LIM, with nothing in between?
//
// `boulderhandling` is C's: 0 blocks on any obstruction, 1 ignores boulders,
// 2 rolls rn2(2 + boulderspots) for a ray blocked by boulders alone. The draw
// is the only randomness here and only arm 2 spends it.
//
// C also stores the displacement in gt.tbx and gt.tby "for use after
// successful return". buzzmu() reads sgn(gt.tbx) and sgn(gt.tby) as the
// direction deltas for buzz(); m_throw() and thrwmu() read them for the
// throw direction. Surface them on state.gt.
export function linedup(ax, ay, bx, by, boulderhandling, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    state.gt ??= {};
    const tbx = state.gt.tbx = ax - bx;
    const tby = state.gt.tby = ay - by;

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
    const catchChance = 100 - acurr(state, A_DEX)
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

// C ref: mthrowu.c drop_throw() (162-196).
export async function drop_throw(obj, ohit, x, y, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    const shouldMulch = env.shouldMulch
        ?? ((missile, actionEnv) => should_mulch_missile(
            missile,
            state,
            actionEnv,
        ));
    const monsterAt = env.monsterAt ?? m_at;
    const floorEffects = env.floorEffects ?? flooreffects;
    const placeObject = env.placeObject ?? place_object;
    const passiveObject = env.passiveObject
        ?? ((target, missile, attack, actionEnv) =>
            passive_obj(target, missile, attack, state, actionEnv));
    const stackObject = env.stackObject ?? stackobj;
    let broken = obj.otyp === CREAM_PIE || obj.oclass === VENOM_CLASS
        || Boolean(ohit && obj.otyp === EGG);
    if (!broken) broken = Boolean(ohit && shouldMulch(obj, env));
    if (broken) {
        delobj(obj, env);
    } else {
        if (down_gate(x, y, state) !== -1)
            broken = await ship_object(obj, x, y, false, env);
        if (!broken) {
            let monster = monsterAt(x, y, state);
            broken = Boolean(await floorEffects(obj, x, y, 'fall', env));
            if (!broken) {
                placeObject(obj, x, y, env);
                if (!monster && u_at(x, y, state)) monster = state.youmonst;
                if (monster && ohit) await passiveObject(monster, obj, null, env);
                stackObject(obj, env);
            }
        }
    }
    state.gt ??= {};
    state.gt.thrownobj = null;
    return broken;
}

// C ref: mthrowu.c monmulti() (201-259). Compute the number of missiles in a
// monster's volley in the source order, including the one gameplay RNG draw.
export function monmulti(monster, missile, launcher, env = {}) {
    const state = env.state ?? game;
    const random = { rnd, ...(env.random ?? {}) };
    let multishot = 1;

    if (missile.quan > 1
        && (is_ammo(missile, state)
            ? matching_launcher(missile, launcher, state)
            : missile.oclass === WEAPON_CLASS)
        && !monster.mconf) {
        /* Assumes lords are skilled, princes are expert. */
        if (is_prince(monster.data))
            multishot += 2;
        else if (is_lord(monster.data))
            multishot++;
        /* Fake players are treated as skilled regardless of role limits. */
        else if (is_mplayer(monster.data))
            multishot++;

        /* Elven craftsmanship makes for light, quick bows. */
        if (missile.otyp === ELVEN_ARROW && !missile.cursed)
            multishot++;
        /* A wielded elven bow gives its bonus only to matching ammunition. */
        if (launcher && launcher.otyp === ELVEN_BOW
            && ammo_and_launcher(missile, launcher, state)
            && !launcher.cursed)
            multishot++;
        /* One third of launcher enchantment. */
        if (ammo_and_launcher(missile, launcher, state) && launcher.spe > 1)
            multishot += rounddiv(launcher.spe, 3);

        /* Some randomness. */
        multishot = random.rnd(multishot);

        /* Role-specific class bonus. */
        multishot += multishot_class_bonus(
            monsndx(monster.data), missile, launcher, state,
        );

        /* Racial bonus. */
        if ((is_elf(monster.data) && missile.otyp === ELVEN_ARROW
             && launcher && launcher.otyp === ELVEN_BOW)
            || (is_orc(monster.data) && missile.otyp === ORCISH_ARROW
                && launcher && launcher.otyp === ORCISH_BOW)
            || (is_gnome(monster.data) && missile.otyp === CROSSBOW_BOLT
                && launcher && launcher.otyp === CROSSBOW))
            multishot++;
    }

    if (missile.quan < multishot)
        multishot = Math.trunc(missile.quan);
    if (multishot < 1)
        multishot = 1;
    return multishot;
}

// C ref: mthrowu.c ohitmon() (321-502). Object hits a monster from a throw.
// Handles to-hit calculation, potions, damage, special effects (poison,
// silver searing, petrification, blinding), monster death, and object
// disposal. Returns TRUE if the missile is used up and the caller should
// stop the flight; FALSE if the missile continues.
export async function ohitmon(mtmp, otmp, range, verbose, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2, rnd };
    const env = { ...rawEnv, state, random };
    const message = env.message ?? ttyPline;

    let damage, tmp;
    const mon_launcher = state.gm?.marcher
        ? (state.gm.marcher.mw ?? null) : null;

    /* assert(otmp != NULL); */
    state.gn ??= {};
    state.gn.notonhead = (state.gb.bhitpos.x !== mtmp.mx
                          || state.gb.bhitpos.y !== mtmp.my);
    const ismimic = M_AP_TYPE(mtmp)
                    && M_AP_TYPE(mtmp) !== M_AP_MONSTER;
    const vis = cansee(state.gb.bhitpos.x, state.gb.bhitpos.y, state);
    if (vis)
        observe_object(otmp, state);

    tmp = 5 + find_mac(mtmp, state) + omon_adj(mtmp, otmp, false, env);
    /* High level monsters will be more likely to hit */
    /* This check applies only if this monster is the target
     * the archer was aiming at. */
    if (state.gm?.marcher && state.gm.mtarget === mtmp) {
        if (state.gm.marcher.m_lev > 5)
            tmp += state.gm.marcher.m_lev - 5;
        if (mon_launcher && mon_launcher.oartifact)
            tmp += spec_abon(mon_launcher, mtmp, state, env);
    }
    if (tmp < random.rnd(20)) {
        if (!ismimic) {
            if (vis)
                await miss(distant_name(otmp, mshot_xname, state), mtmp, state, env);
            else if (verbose && !state.gm?.mtarget)
                await message('It is missed.', state, env);
        }
        if (!range) { /* Last position; object drops */
            await drop_throw(otmp, 0, mtmp.mx, mtmp.my, env);
            return 1;
        }
    } else if (otmp.oclass === POTION_CLASS) {
        if (ismimic)
            seemimic(mtmp, state, env);
        mtmp.msleeping = 0;
        /* probably thrown by a monster rather than 'other', but the
           distinction only matters when hitting the hero */
        await potionhit(mtmp, otmp, POTHIT_OTHER_THROW, env);
        return 1;
    } else {
        const material = objectType(otmp, state).oc_material;
        const harmless = (stone_missile(otmp, state)
                          && passes_rocks(mtmp.data));

        damage = dmgval(otmp, mtmp, state, env);
        if (otmp.otyp === ACID_VENOM
            && monster_resists_element(mtmp, ACID_RES, state))
            damage = 0;

        if (ismimic)
            seemimic(mtmp, state, env);
        mtmp.msleeping = 0;
        note_unported('sounds.c Soundeffect'); /* Soundeffect(se_splat_egg, 35) */
        if (vis) {
            if (otmp.otyp === EGG) {
                await message(`Splat!  ${Monnam(mtmp, state, env)} is hit with `
                    + `${otmp.known ? an(state.mons[otmp.corpsenm].pmnames[NEUTRAL]) : 'an'} egg!`,
                state, env);
            } else {
                let how;
                if (!harmless)
                    how = exclam(damage); /* "!" or "." */
                else
                    how = ` but passes harmlessly through ${mhim(mtmp).slice(0, 9)}.`;
                await hit(
                    distant_name(otmp, mshot_xname, state),
                    mtmp,
                    how,
                    state,
                    env,
                );
            }
        } else if (verbose && !state.gm?.mtarget)
            await message(`${otmp.otyp === EGG ? 'Splat!  ' : ''}`
                + `${Monnam(mtmp, state, env)} is hit${exclam(damage)}`, state, env);

        if (otmp.opoisoned && isPoisonable(otmp, state)) {
            if (monster_resists_element(mtmp, POISON_RES, state)) {
                if (vis)
                    await message(`The poison doesn't seem to affect ${mon_nam(mtmp, state, env)}.`, state, env);
            } else {
                if (random.rn2(30)) {
                    damage += random.rnd(6);
                } else {
                    if (vis)
                        await message('The poison was deadly...', state, env);
                    damage = mtmp.mhp;
                }
            }
        }
        if (material === SILVER && mon_hates_silver(mtmp)) {
            const flesh = (!noncorporeal(mtmp.data)
                           && !amorphous(mtmp.data));

            /* note: extra silver damage is handled by dmgval() */
            if (vis) {
                let m_name = mon_nam(mtmp, state, env);
                if (flesh) /* s_suffix returns a modifiable buffer */
                    m_name = s_suffix(m_name) + ' flesh';
                await message(`The silver sears ${m_name}!`, state, env);
            } else if (verbose && !state.gm?.mtarget) {
                await message(`${flesh ? 'Its flesh' : 'It'} is seared!`, state, env);
            }
        }
        if (otmp.otyp === ACID_VENOM && cansee(mtmp.mx, mtmp.my, state)) {
            if (monster_resists_element(mtmp, ACID_RES, state)) {
                if (vis || (verbose && !state.gm?.mtarget))
                    await message(`${Monnam(mtmp, state, env)} is unaffected.`, state, env);
            } else {
                if (vis)
                    await message(`The ${hliquid('acid', { state, displayRandom: env.displayRandom })} burns ${mon_nam(mtmp, state, env)}!`, state, env);
                else if (verbose && !state.gm?.mtarget)
                    await message('It is burned!', state, env);
            }
        }
        if (otmp.otyp === EGG
            && touch_petrifies(state.mons[otmp.corpsenm])) {
            if (!await munstone(mtmp, false, state, env))
                note_unported('trap.c minstapetrify'); /* minstapetrify(mtmp, FALSE) */
            if (monster_resists_element(mtmp, STONE_RES, state))
                damage = 0;
        }

        /* might already be dead (if petrified) */
        if (!harmless && mtmp.mhp > 0 /* !DEADMONSTER */) {
            mtmp.mhp -= damage;
            if (mtmp.mhp <= 0 /* DEADMONSTER */) {
                if (vis || (verbose && !state.gm?.mtarget)) {
                    const fate = nonliving(mtmp.data)
                        || is_vampshifter(mtmp)
                        || !canSpotMonster(mtmp, state)
                        ? 'destroyed' : 'killed';
                    const killMessage = `${Monnam(mtmp, state, env)}`
                        + ` is ${fate}!`;
                    if (typeof env.message === 'function')
                        await env.message(killMessage, state, env);
                    else
                        await ttyPline(killMessage, state);
                }
                /* don't blame hero for unknown rolling boulder trap */
                if (!state.context?.mon_moving
                    && (otmp.otyp !== BOULDER || range >= 0
                        || otmp.otrapped))
                    await xkilled(mtmp, XKILL_NOMSG, state, env);
                else
                    await mondied(mtmp, state, env);
            }
        }

        /* blinding venom and cream pie do 0 damage, but verify
           that the target is still alive anyway */
        if (mtmp.mhp > 0 /* !DEADMONSTER */
            && can_blnd(null, mtmp,
                        (otmp.otyp === BLINDING_VENOM) ? AT_SPIT
                                                       : AT_WEAP,
                        otmp, state)) {
            if (vis && mtmp.mcansee)
                await message(`${Monnam(mtmp, state, env)} is blinded by `
                    + `${the(otmp.oclass === VENOM_CLASS ? 'venom'
                        : otmp.otyp === CREAM_PIE ? 'pie' : xnameFresh(otmp, state))}.`,
                state, env);
            mtmp.mcansee = 0;
            tmp = (mtmp.mblinded | 0) + random.rnd(25) + 20;
            if (tmp > 127)
                tmp = 127;
            mtmp.mblinded = tmp;
        }

        if (mtmp.mhp > 0 /* !DEADMONSTER */ && !state.context?.mon_moving)
            await setmangry(mtmp, true, { state });

        const objgone = await drop_throw(otmp, 1,
            state.gb.bhitpos.x, state.gb.bhitpos.y, env);
        if (!objgone && range === -1) { /* special case */
            obj_extract_self(otmp, env); /* free it for motion again */
            return false;
        }
        return true;
    }
    return false;
}

// C ref: mthrowu.c ucatchgem() (505-529). Hero catches a gem thrown by a
// monster if poly'd into a unicorn. Catches and drops worthless glass;
// catches and keeps a real gem via hold_another_object.
async function ucatchgem(gem, mon, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    /* won't catch rock or gray stone; catch (then drop) worthless glass */
    if (gem.otyp <= LAST_GLASS_GEM && is_unicorn(state.youmonst.data)) {
        const gem_xname = xnameFresh(gem, state);
        const mon_s_name = s_suffix(monsterCommonName(mon, state));

        if (gem.otyp >= FIRST_GLASS_GEM) {
            note_unported('pline.c pline'); /* You("catch the %s.", gem_xname) */
            note_unported('pline.c pline'); /* You("are not interested in %s junk.", mon_s_name) */
            /* makeknown(gem->otyp) = discover_object(otyp, TRUE, TRUE, TRUE) */
            discover_object(gem.otyp, true, true, true, state);
            await dropy(gem, env);
        } else {
            note_unported('pline.c pline'); /* You("accept %s gift in the spirit ...") */
            await hold_another_object(gem, 'You catch, but drop, %s.',
                                      gem_xname, 'You catch:', env);
        }
        return true;
    }
    return false;
}

// C ref: mthrowu.c m_throw() (572-844), ordinary untethered missile hit and
// miss. A stack is split before flight so one missile leaves per call.
// A miss lets the missile continue flying and drop at range expiry or terrain.
export async function m_throw(monster, x, y, dx, dy, range, obj, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = { rn2, rnd, ...(rawEnv.random ?? {}) };
    const env = { ...rawEnv, state, random };
    const arw = autoreturn_weapon(obj);
    const tethered_weapon = monster.mw === obj
        && Boolean(arw?.tethered);

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
    // drop_throw() uses these bound floor and inventory operations.
    requireRangedOperation(env, 'shouldMulch');
    requireRangedOperation(env, 'floorEffects');
    requireRangedOperation(env, 'placeObject');
    requireRangedOperation(env, 'passiveObject');
    requireRangedOperation(env, 'stackObject');

    state.gb ??= {};
    state.gb.bhitpos ??= {};
    state.gb.bhitpos.x = x;
    state.gb.bhitpos.y = y;
    state.gn ??= {};
    state.gn.notonhead = false;

    let singleobj;
    if (Math.trunc(obj.quan ?? 1) === 1) {
        if (monster.mw === obj)
            await setMonsterNotWielded(monster, obj, env);
        extractObject(obj, env);
        singleobj = obj;
    } else {
        // C splitobj(obj, 1L) keeps the parent stack in monster inventory;
        // obj_extract_self() moves the one missile into OBJ_FREE.
        singleobj = splitobj(obj, 1, env);
        extractObject(singleobj, env);
    }
    state.gt ??= {};
    state.gt.thrownobj = singleobj;
    singleobj.owornmask = 0;
    if (!canSeeMonster(monster, state)) clearObjectKnowledge(singleobj, state);

    // C ref: mthrowu.c:622-637. Cursed or greased missiles can misfire after
    // extraction, and both replacement direction draws precede flight-check.
    if ((singleobj.cursed || singleobj.greased) && (dx || dy)
        && !random.rn2(7)) {
        if (canSeeMonster(monster, state) && state.flags?.verbose) {
            if (is_ammo(singleobj, state)) {
                if (typeof env.message === 'function')
                    await env.message(`${Monnam(monster, state)} misfires!`, state);
            } else if (typeof env.message === 'function') {
                await env.message(
                    `${Tobjnam(singleobj, 'slip')} as ${mon_nam(monster, state)} throws it!`,
                    state,
                );
            }
        }
        dx = random.rn2(3) - 1;
        dy = random.rn2(3) - 1;
        if (!dx && !dy) {
            await drop_throw(singleobj, 0, state.gb.bhitpos.x,
                state.gb.bhitpos.y, env);
            return 0;
        }
    }

    const nextX = state.gb.bhitpos.x + dx;
    const nextY = state.gb.bhitpos.y + dy;
    const singleobj_ref = { obj: singleobj };
    // C ref: MT_FLIGHTCHECK(TRUE, 0) — pre-flight check before the loop.
    if (!isok(nextX, nextY)
        || IS_OBSTRUCTED(state.level.at(nextX, nextY).typ)
        || closed_door(nextX, nextY, state)
        || (state.level.at(nextX, nextY).typ === IRONBARS
            && hits_bars(singleobj_ref,
                         state.gb.bhitpos.x, state.gb.bhitpos.y,
                         nextX, nextY, 0, 0, state, random))) {
        if (singleobj_ref.obj) {
            await drop_throw(singleobj_ref.obj, 0,
                             state.gb.bhitpos.x, state.gb.bhitpos.y, env);
        }
        state.gt.thrownobj = null;
        return 0;
    }
    state.mesg_given = 0;
    await temporaryDisplay(
        tethered_weapon ? DISP_TETHER : DISP_FLASH,
        objectToGlyph(singleobj, state),
        state,
    );

    // C ref: mthrowu.c:584-587. Only a currently wielded throw-and-return
    // weapon is tethered; an un-wielded returning weapon flies normally.
    let return_flightpath = false;

    let hit = false;
    let blindinc = 0;
    // C leaves the loop by `break` from three arms. Weapon and venom paths
    // settle through drop_throw(); the potion arm uses potionhit()'s obfree().
    while (range-- > 0) {
        singleobj.ox = state.gb.bhitpos.x += dx;
        singleobj.oy = state.gb.bhitpos.y += dy;
        if (canSeeSquare(state.gb.bhitpos.x, state.gb.bhitpos.y, state))
            observeObject(singleobj, state);

        { /* C ref: m_throw lines 679-693 -- monster hit or hero hit */
            let mtmp = monsterAt(state.gb.bhitpos.x, state.gb.bhitpos.y, state);
            if (mtmp && shade_miss(monster, mtmp, singleobj, true, true, state, env)) {
                /* shade: missile passes harmlessly through */
                mtmp = null;
            } else if (mtmp) {
                if (await ohitmon(mtmp, singleobj, range, true, env)) {
                    break;
                }
            }
        }
        if (u_at(state.gb.bhitpos.x, state.gb.bhitpos.y, state)) {
            if (state.multi) requireRangedOperation(env, 'endMulti')(0, state);
            /* hero might be poly'd into a unicorn */
            if (singleobj.oclass === GEM_CLASS
                && await ucatchgem(singleobj, monster, env)) {
                break;
            }
            if (!tethered_weapon && u_catch_thrown_obj(singleobj, env)) {
                break;
            }
            if (singleobj.oclass === POTION_CLASS) {
                // potionhit() always uses the object up, so the flight loop
                // hands over ownership and never reaches drop_throw().
                await requireRangedOperation(env, 'potionHit')(
                    state.youmonst,
                    singleobj,
                    POTHIT_MONST_THROW,
                    env,
                );
                break;
            }
            const oldumort = state.u.umortality;
            let hitv;
            let damage;
            if (singleobj.otyp === EGG
                && !touch_petrifies(state.mons?.[singleobj.corpsenm])) {
                // C's impossible() is diagnostic-only; it does not consume
                // the missile or stop the flight.
                note_unported('mthrowu.c impossible');
                hitv = 0;
                damage = 0;
            } else if (singleobj.otyp === CREAM_PIE
                       || singleobj.otyp === BLINDING_VENOM) {
                // C ref: mthrowu.c:701-702. Spit venom uses thitu(8, 0)
                // and cream pies use the same special hit path, skipping
                // weapon damage and its RNG draws.
                damage = 0;
                hitv = 8;
            } else {
                damage = damageValue(singleobj, state.youmonst, env);
                hitv = 3 - distmin(
                    state.u.ux,
                    state.u.uy,
                    monster.mx,
                    monster.my,
                );
                if (hitv < -4) hitv = -4;
                if (is_elf(monster.data)
                    && objectType(singleobj, state).oc_skill === -P_BOW) {
                    hitv++;
                    if (monster.mw && monster.mw.otyp === ELVEN_BOW)
                        hitv++;
                    if (singleobj.otyp === ELVEN_ARROW)
                        damage++;
                }
                if (bigmonst(state.youmonst.data)) hitv++;
                hitv += 8 + singleobj.spe;
                if (damage < 1) damage = 1;
                if (singleobj.otyp !== ACID_VENOM)
                    damage = maybeHalfPhysical(damage, state);
            }
            hit = Boolean(await hitHero(hitv, damage, singleobj, env));
            // C thitu() calls losehp(), whose lethal done() path is NORETURN.
            // The JavaScript end-game path returns after setting gameover so
            // the replay can capture its final screen. done_object_cleanup()
            // has already settled gt.thrownobj in that path; continuing here
            // would pass the same floor object to drop_throw() a second time.
            if (state.program_state?.gameover)
                return 0;
            if (hit && singleobj.opoisoned
                && isPoisonable(singleobj, state)) {
                if (typeof env.poisoned === 'function') {
                    await env.poisoned(
                        xnameFresh(singleobj, state),
                        A_STR,
                        killer_xname(singleobj, state),
                        (state.u.umortality ?? 0) > (oldumort ?? 0) ? 0 : 10,
                        true,
                        state,
                        env,
                    );
                } else if (typeof env.message === 'function'
                           && typeof env.losehp === 'function'
                           && typeof env.done === 'function'
                           && typeof env.encumberMessage === 'function') {
                    await poisoned(
                        xnameFresh(singleobj, state),
                        A_STR,
                        killer_xname(singleobj, state),
                        (state.u.umortality ?? 0) > (oldumort ?? 0) ? 0 : 10,
                        true,
                        state,
                        env,
                    );
                } else {
                    note_unported('attrib.c poisoned');
                }
            }
            if (hit && can_blnd(
                null,
                state.youmonst,
                singleobj.otyp === BLINDING_VENOM ? AT_SPIT : AT_WEAP,
                singleobj,
                state,
            )) {
                blindinc = random.rnd(25);
                if (typeof env.message === 'function') {
                    if (singleobj.otyp === CREAM_PIE) {
                        if (heroIsBlind(state)) {
                            await env.message(
                                `There's something sticky all over your ${body_part(FACE, state.youmonst)}.`,
                                state,
                            );
                        } else {
                            await env.message('Yecch!  You\'ve been creamed.', state);
                        }
                    } else if (heroIsBlind(state)) {
                        let eyes = body_part(EYE, state.youmonst);
                        const pmidx = state.youmonst.data?.pmidx;
                        if (pmidx !== PM_CYCLOPS && pmidx !== PM_FLOATING_EYE)
                            eyes = makeplural(eyes);
                        await env.message(
                            `Your ${eyes} ${vtense(eyes, 'sting')}.`,
                            state,
                        );
                    } else {
                        await env.message('The venom blinds you.', state);
                    }
                }
            }
            if (hit && singleobj.otyp === EGG) {
                const stoned = state.u.uprops?.[STONED];
                if (!stoned?.intrinsic
                    && !Stone_resistance(state)
                    && !(poly_when_stoned(state.youmonst.data, state)
                         && await polymon(PM_STONE_GOLEM, state))) {
                    // make_stoned() has no owner in the current port. Keep the
                    // source branch explicit while preserving its no-RNG path.
                    note_unported('trap.c make_stoned');
                }
            }
            await stopOccupation(state, env);
            if (hit) {
                if (!tethered_weapon) {
                    await drop_throw(
                        singleobj,
                        true,
                        state.u.ux,
                        state.u.uy,
                        env,
                    );
                } else {
                    return_flightpath = true;
                }
                break;
            }
            // Miss: missile continues flying past the hero.
            // C ref: mthrowu.c:787-795 -- if (!hitu), the flight loop
            // does NOT break; the missile keeps going.
        }

        const forcehit = !random.rn2(5);
        // C ref: mthrowu.c:798-822, MT_FLIGHTCHECK(FALSE, forcehit).
        // End of flight: range expired, edge of map, terrain blocked,
        // iron bars (via hits_bars), or sank.
        const nextFlightX = state.gb.bhitpos.x + dx;
        const nextFlightY = state.gb.bhitpos.y + dy;
        let flightEnded = !range;
        if (!flightEnded) {
            if (!isok(nextFlightX, nextFlightY)) {
                flightEnded = true;
            } else {
                const location = state.level.at(nextFlightX, nextFlightY);
                if (IS_OBSTRUCTED(location.typ)
                    || closed_door(nextFlightX, nextFlightY, state)
                    || (location.typ === IRONBARS
                        && hits_bars(singleobj_ref,
                                     state.gb.bhitpos.x, state.gb.bhitpos.y,
                                     nextFlightX, nextFlightY,
                                     forcehit ? 1 : 0, 0, state, random))
                    || IS_SINK(state.level.at(
                        state.gb.bhitpos.x,
                        state.gb.bhitpos.y,
                    ).typ)) {
                    flightEnded = true;
                }
            }
        }
        if (flightEnded) {
            if (singleobj_ref.obj) { /* hits_bars might have destroyed it */
                // C ref: mthrowu.c:800-821.
                if (range && cansee(state.gb.bhitpos.x, state.gb.bhitpos.y)
                    && IS_SINK(state.level.at(
                        state.gb.bhitpos.x,
                        state.gb.bhitpos.y,
                    ).typ)) {
                    note_unported('pline.c pline'); /* sink plop/drop message */
                } else if ((state.m_shot?.n ?? 0) > 1
                           && (!state.mesg_given
                               || state.gb.bhitpos.x !== state.u.ux
                               || state.gb.bhitpos.y !== state.u.uy)
                           && (cansee(state.gb.bhitpos.x, state.gb.bhitpos.y)
                               || (state.gm?.marcher
                                   && canseemon(state.gm.marcher, state)))) {
                    note_unported('pline.c pline'); /* "%s misses." */
                }
                if (!tethered_weapon) {
                    await drop_throw(singleobj_ref.obj, 0,
                        state.gb.bhitpos.x, state.gb.bhitpos.y, env);
                } else {
                    return_flightpath = true;
                }
            }
            break;
        }
        await temporaryDisplay(
            state.gb.bhitpos.x,
            state.gb.bhitpos.y,
            state,
        );
        await delayOutput(state);
    }

    await temporaryDisplay(state.gb.bhitpos.x, state.gb.bhitpos.y, state);
    await delayOutput(state);
    if (arw && return_flightpath) {
        await return_from_mtoss(monster, singleobj, tethered_weapon, state, random, env);
        // monster could be DEADMONSTER now
    } else {
        await temporaryDisplay(DISP_END, 0, state);
    }
    state.mesg_given = 0;
    if (blindinc) {
        state.u.ucreamed = Math.trunc(state.u.ucreamed ?? 0) + blindinc;
        const blinded = state.u.uprops?.[BLINDED];
        const blindedTimeout = Math.trunc(blinded?.intrinsic ?? 0) & TIMEOUT;
        await make_blinded(blindedTimeout + blindinc, false, state);
    }
    state.gt.thrownobj = null;
    return 0;
}

// C ref: mthrowu.c return_from_mtoss() (850-965). Cleanup after a monster's
// throw of a returning weapon (Aklys / Mjollnir). Handles the return flight
// animation, the message, re-equipping the weapon, and the case where the
// return goes wrong (weapon hits thrower or drops).
let returnDoNotAnnoy = 0;

export async function return_from_mtoss(magr, otmp, tethered_weapon, state = game, random = { rn2, rnd }, rawEnv = {}) {
    const env = { ...rawEnv, state, random };
    const impaired = (magr.mconf || magr.mstun || magr.mblinded);
    let notcaught = false;
    let hits_thrower_flag = false;
    let x = state.gb.bhitpos.x;
    let y = state.gb.bhitpos.y;
    const made_it_back = random.rn2(100);
    let dmg = 0;

    if (otmp && made_it_back) {
        /* it made it back to thrower's location */
        if (tethered_weapon) {
            if (typeof env.temporaryDisplay === 'function')
                await env.temporaryDisplay(DISP_END, BACKTRACK, state);
        } else if (x !== magr.mx || y !== magr.my) {
            // C ref: mthrowu.c:865-877. The non-tethered return retraces the
            // path, consuming display-only work but no gameplay RNG.
            if (typeof env.temporaryDisplay === 'function') {
                const objectToGlyph = typeof env.objectToGlyph === 'function'
                    ? env.objectToGlyph(otmp, state) : 0;
                await env.temporaryDisplay(DISP_FLASH, objectToGlyph, state);
                const dx = sgn(x - magr.mx);
                const dy = sgn(y - magr.my);
                while (isok(x, y)
                       && (x !== magr.mx || y !== magr.my)) {
                    await env.temporaryDisplay(x, y, state);
                    if (typeof env.delayOutput === 'function')
                        await env.delayOutput(state);
                    x -= dx;
                    y -= dy;
                }
                await env.temporaryDisplay(DISP_END, 0, state);
            }
        }
        x = magr.mx;
        y = magr.my;
        if (!impaired && random.rn2(100)) {
            /* Weapon returns successfully to the thrower's hand. */
            const moves = state.moves ?? state.svm?.moves ?? 0;
            if (!returnDoNotAnnoy || moves - returnDoNotAnnoy > 500) {
                if (typeof env.message === 'function') {
                    await env.message(
                        `${Tobjnam(otmp, 'return')} to `
                        + `${s_suffix(mon_nam(magr, state))} `
                        + `${mbodypart(magr, HAND)}!`,
                        state,
                    );
                }
                returnDoNotAnnoy = moves;
            }
            if (otmp) {
                add_to_minv(magr, otmp, env);
                if (tethered_weapon) {
                    magr.mw = otmp;
                    otmp.owornmask |= W_WEP;
                }
            }
            if (cansee(x, y, state)) {
                if (typeof env.newsym === 'function')
                    env.newsym(x, y, state);
                else
                    note_unported('display.c newsym');
            }
        } else {
            /* Weapon return fumbled. */
            dmg = random.rn2(2);
            if (!dmg) {
                /* Lands at feet. */
                if (canseemon(magr, state)) {
                    if (typeof env.message === 'function') {
                        await env.message(
                            `${Tobjnam(otmp, 'return')} back to `
                            + `${mon_nam(magr, state)}, landing at `
                            + `${mhis(magr)} ${makeplural(mbodypart(magr, FOOT))}.`,
                            state,
                        );
                    }
                } else if (!Deaf(state)) {
                    if (typeof env.message === 'function')
                        await env.message(
                            `You hear something land near ${mon_nam(magr, state)}.`,
                            state,
                        );
                }
            } else {
                /* Hits thrower's arm. */
                dmg += random.rnd(3);
                if (canseemon(magr, state)) {
                    if (typeof env.message === 'function')
                        await env.message(
                            `${Tobjnam(otmp, 'fly')} back toward `
                            + `${mon_nam(magr, state)}, hitting `
                            + `${mhis(magr)} ${body_part(ARM, state.youmonst)}!`,
                            state,
                        );
                } else if (!Deaf(state)) {
                    if (typeof env.message === 'function')
                        await env.message(
                            `You hear something hit ${mon_nam(magr, state)} with a thud!`,
                            state,
                        );
                }
                hits_thrower_flag = true;
            }
            notcaught = true;
        }
    } else {
        /* it didn't make it back to thrower's location */
        if (tethered_weapon)
            note_unported('display.c tmp_at'); /* tmp_at(DISP_END, 0) */
        note_unported('pline.c pline'); /* "You hear a loud snap!" */
        notcaught = true;
    }
    if (otmp) {
        if (hits_thrower_flag) {
            // artifact_hit() is an unowned side-effect hook in this caller;
            // the ordinary weapon damage and monster death remain local.
            if (otmp.oartifact)
                note_unported('artifact.c artifact_hit');
            magr.mhp -= dmg;
            if (magr.mhp < 1) /* DEADMONSTER */
                note_unported('mon.c monkilled');
        }
        if (notcaught) {
            note_unported('apply.c snuff_candle'); /* (void) snuff_candle() */
            if (!await ship_object(otmp, x, y, false, env)) {
                if (await flooreffects(otmp, x, y, 'drop', env)) {
                    if (cansee(x, y, state)) {
                        if (typeof env.newsym === 'function')
                            env.newsym(x, y, state);
                        else
                            note_unported('display.c newsym');
                    }
                    return;
                }
                place_object(otmp, x, y, env);
                stackobj(otmp, env);
            }
            if (!Deaf(state) && !state.u?.uinwater) {
                if (is_pool(x, y, state)
                    || (is_lava(x, y, state) && !is_flammable(otmp, state))) {
                    note_unported('sound.c Soundeffect');
                    if (typeof env.message === 'function')
                        await env.message(weight(otmp, env) > 9 ? 'Splash!' : 'Plop!', state);
                }
            }
            if (obj_sheds_light(otmp)) {
                state.gv = state.gv ?? {};
                state.gv.vision_full_recalc = 1;
            }
        }
    }
    if (cansee(x, y, state)) {
        if (typeof env.newsym === 'function')
            env.newsym(x, y, state);
        else
            note_unported('display.c newsym');
    }
}

// C ref: mthrowu.c thrwmm() (968-1012). Monster throws item at another
// monster. Returns M_ATTK_HIT or M_ATTK_MISS.
export async function thrwmm(mtmp, mtarg, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const env = { ...rawEnv, state, random };

    /* Polearms won't be applied by monsters against other monsters */
    if (mtmp.weapon_check === NEED_WEAPON || !mtmp.mw) {
        mtmp.weapon_check = NEED_RANGED_WEAPON;
        /* mon_wield_item resets weapon_check as appropriate */
        if (await mon_wield_item(mtmp, {
            ...env,
            handsObject: hands_obj,
            selectRangedWeapon: (subject, selectionEnv) => {
                const propellorResult = {};
                select_rwep(subject, {
                    ...selectionEnv,
                    propellorResult,
                });
                return propellorResult.value;
            },
        }) !== 0)
            return M_ATTK_MISS;
    }

    /* Pick a weapon */
    const otmp = select_rwep(mtmp, env);
    if (!otmp)
        return M_ATTK_MISS;
    const ispole = is_pole(otmp, state);

    const x = mtmp.mx;
    const y = mtmp.my;

    const mwep = mtmp.mw ?? null; /* wielded weapon */

    if (!ispole && m_lined_up(mtarg, mtmp, { state, random })) {
        const chance = Math.max(BOLT_LIM - distmin(x, y, mtarg.mx, mtarg.my), 1);

        if (!mtarg.mflee || !random.rn2(chance)) {
            if (ammo_and_launcher(otmp, mwep, state)
                && dist2(mtmp.mx, mtmp.my, mtarg.mx, mtarg.my)
                   > PET_MISSILE_RANGE2)
                return M_ATTK_MISS; /* Out of range */
            /* Set target monster */
            state.gm ??= {};
            state.gm.mtarget = mtarg;
            state.gm.marcher = mtmp;
            await monshoot(mtmp, otmp, mwep, env);
            state.gm.marcher = null;
            state.gm.mtarget = null;
            nomul(0, state);
            return M_ATTK_HIT;
        }
    }
    return M_ATTK_MISS;
}

// C ref: mthrowu.c spitmm() (1014-1077). Monster spits substance at monster.
// Returns M_ATTK_HIT or M_ATTK_MISS.
export async function spitmm(mtmp, mattk, mtarg, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2, rnd };
    const env = { ...rawEnv, state, random };

    if (mtmp.mcan) {
        if (!Deaf(state) && mdistu(mtmp, state) < BOLT_LIM * BOLT_LIM) {
            if (canseemon(mtmp, state)) {
                if (typeof env.message === 'function')
                    await env.message(
                        `A dry rattle comes from ${s_suffix(mon_nam(mtmp, state))} throat.`,
                        state,
                    );
            } else {
                note_unported('sound.c Soundeffect');
                if (typeof env.message === 'function')
                    await env.message('You hear a dry rattle nearby.', state);
            }
        }
        return M_ATTK_MISS;
    }
    if (m_lined_up(mtarg, mtmp, { state, random })) {
        const utarg = (mtarg === state.youmonst);
        const tx = utarg ? mtmp.mux : mtarg.mx;
        const ty = utarg ? mtmp.muy : mtarg.my;

        let otmp;
        switch (mattk.adtyp) {
        case AD_BLND:
        case AD_DRST:
            otmp = mksobj(BLINDING_VENOM, true, false, { state, random });
            break;
        default:
            /* C: impossible("bad attack type in spitmm"); FALLTHROUGH */
        case AD_ACID:
            otmp = mksobj(ACID_VENOM, true, false, { state, random });
            break;
        }
        if (!random.rn2(BOLT_LIM - distmin(mtmp.mx, mtmp.my, tx, ty))) {
            if (canseemon(mtmp, state)) {
                if (typeof env.message === 'function') {
                    await env.message(
                        `${capitalizedMonsterName(mtmp, state)} spits venom!`,
                        state,
                        env,
                    );
                } else {
                    note_unported('pline.c pline'); /* "%s spits venom!" */
                }
            }
            if (!utarg) {
                state.gm ??= {};
                state.gm.mtarget = mtarg;
            }
            await m_throw(mtmp, mtmp.mx, mtmp.my, sgn(state.gt.tbx), sgn(state.gt.tby),
                    distmin(mtmp.mx, mtmp.my, tx, ty), otmp, env);
            state.gm ??= {};
            state.gm.mtarget = null;
            nomul(0, state);

            /* If this is a pet, it'll get hungry. Minions and
             * spell beings won't hunger */
            if (mtmp.mtame && !mtmp.isminion) {
                const dog = EDOG(mtmp);
                /* Hunger effects will catch up next move */
                if (dog && dog.hungrytime > 1)
                    dog.hungrytime -= 5;
            }

            return M_ATTK_HIT;
        } else {
            obj_extract_self(otmp, { state });
            obfree(otmp, null, { state });
        }
    }
    return M_ATTK_MISS;
}

// C ref: mthrowu.c breathwep_name() (1082-1089). Return the name of a breath
// weapon. If the player is hallucinating, return a silly name instead.
// typ is AD_MAGM, AD_FIRE, etc.
export function breathwep_name(typ, state = game, random = { rn2 }) {
    if (Hallucination(state))
        return rnd_hallublast(random);
    return breathwep[BZ_OFS_AD(typ)];
}

// C ref: mthrowu.c breamm() (1091-1150). Monster breathes at monster (ranged).
// Returns M_ATTK_HIT or M_ATTK_MISS.
export async function breamm(mtmp, mattk, mtarg, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2, rnd };
    const env = { ...rawEnv, state, random };

    const typ = get_atkdam_type(mattk.adtyp, random);
    const utarget = (mtarg === state.youmonst);

    if (m_lined_up(mtarg, mtmp, { state, random })) {
        if (mtmp.mcan) {
            if (!Deaf(state)) {
                if (canseemon(mtmp, state)) {
                    if (typeof env.message === 'function')
                        await env.message(`${Monnam(mtmp, state)} coughs.`, state);
                } else {
                    note_unported('sound.c Soundeffect');
                    if (typeof env.message === 'function')
                        await env.message('You hear a cough.', state);
                }
            }
            return M_ATTK_MISS;
        }

        /* if we've seen the actual resistance, don't bother, or
           if we're close by and they reflect, just jump the player */
        if (utarget && (m_seenres(mtmp, cvt_adtyp_to_mseenres(typ))
                        || m_seenres(mtmp, M_SEEN_REFL)))
            return M_ATTK_HIT;

        if (!mtmp.mspec_used && random.rn2(3)) {
            if (BZ_VALID_ADTYP(typ)) {
                if (canseemon(mtmp, state)
                    && typeof env.message === 'function') {
                    await env.message(
                        `${Monnam(mtmp, state)} breathes `
                        + `${breathwep_name(typ, state, random)}!`,
                        state,
                    );
                }
                state.gb ??= {};
                state.gb.buzzer = mtmp;
                // C discards dobuzz()'s return value, but the call itself owns
                // the beam walk, damage, messages, and all of its RNG draws.
                // Keep the attack environment available so the planning clone
                // can route output through its silent message seam.
                await dobuzz(
                    -20 - BZ_OFS_AD(typ),
                    mattk.damn,
                    mtmp.mx, mtmp.my,
                    sgn(state.gt.tbx), sgn(state.gt.tby),
                    utarget, utarget, false,
                    state, random, env,
                );
                state.gb.buzzer = 0;
                nomul(0, state);
                /* breath runs out sometimes. Also, give monster some
                 * cunning; don't breath if the target fell asleep. */
                if (!utarget || !random.rn2(3))
                    mtmp.mspec_used = 8 + random.rn2(18);
                if (utarget && typ === AD_SLEE && !Sleep_resistance(state))
                    mtmp.mspec_used += random.rnd(20);

                /* If this is a pet, it'll get hungry. Minions and
                 * spell beings won't hunger */
                if (mtmp.mtame && !mtmp.isminion) {
                    const dog = EDOG(mtmp);
                    /* Hunger effects will catch up next move */
                    if (dog && dog.hungrytime >= 10)
                        dog.hungrytime -= 10;
                }
            } /* else impossible("Breath weapon %d used", typ-1); */
        } else {
            return M_ATTK_MISS;
        }
    }
    return M_ATTK_HIT;
}

// C ref: mthrowu.c monshoot() (262-314). When the hero can see the throwing
// monster, announces the throw and records the missile type in m_shot.o for
// multishot feedback; when the monster is unseen, sets m_shot.o to
// STRANGE_OBJECT to suppress that feedback. Both arms fall through to the
// shared m_throw() loop and m_shot reset.
export async function monshoot(monster, missile, launcher, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    const mtarg = state.gm?.mtarget ?? null;
    const range = distmin(
        monster.mx,
        monster.my,
        mtarg ? mtarg.mx : monster.mux,
        mtarg ? mtarg.my : monster.muy,
    );
    const multishot = monmulti(monster, missile, launcher, env);
    state.m_shot ??= {};
    const canSeeMonster = requireRangedOperation(env, 'canSeeMonster');
    if (canSeeMonster(monster, state)) {
        // Visible arm: announce the throw and record the missile type.
        let onm;
        if (multishot > 1) {
            // "N arrows"; multishot > 1 implies otmp->quan > 1, so
            // xname()'s result will already be pluralized.
            onm = `${multishot} ${xnameFresh(missile, state)}`;
        } else {
            // "an arrow"
            const singleName = singular(missile, xnameFresh, state);
            onm = obj_is_pname(missile, state) ? the(singleName, state) : an(singleName);
        }
        state.m_shot.s = ammo_and_launcher(missile, launcher, state) ? true : false;
        const trgbuf = mtarg ? some_mon_nam(mtarg, state) : '';
        note_unported('pline.c set_msg_xy'); /* set_msg_xy(mtmp->mx, mtmp->my) */
        const monsterName = requireRangedOperation(env, 'monsterName');
        const message = requireRangedOperation(env, 'message');
        await message(
            `${monsterName(monster, state)} ${state.m_shot.s ? 'shoots' : 'throws'} ${onm}${mtarg ? ' at ' : ''}${trgbuf}!`,
            state,
        );
        state.m_shot.o = missile.otyp;
    } else {
        // Unseen arm: suppress multishot feedback (C: mthrowu.c:295-296).
        state.m_shot.o = STRANGE_OBJECT;
    }
    state.m_shot.n = multishot;
    const throwMissile = requireRangedOperation(env, 'throwMissile');
    for (state.m_shot.i = 1; state.m_shot.i <= state.m_shot.n; state.m_shot.i++) {
        await throwMissile(
            monster,
            monster.mx,
            monster.my,
            sgn(state.gt.tbx),
            sgn(state.gt.tby),
            range,
            missile,
            env,
        );
        // Conceptually all N missiles are in flight at once, but if mtmp
        // gets killed, cancel pending shots.
        if (monster.mhp < 1 /* DEADMONSTER */ && state.m_shot.i < state.m_shot.n)
            break;
    }
    state.m_shot.n = 0;
    state.m_shot.i = 0;
    state.m_shot.o = STRANGE_OBJECT;
    state.m_shot.s = false;
    return 0;
}

// C ref: mthrowu.c m_useupall() (1153-1158). Remove an item from a monster's
// inventory, unequipping it first, and free it.
export function m_useupall(mon, obj, env = {}) {
    extract_from_minvent(mon, obj, true, false, env);
    obfree(obj, null, env);
}

// C ref: mthrowu.c m_useup() (1160-1170). Remove one instance of an item from
// a monster's inventory.
export function m_useup(mon, obj, env = {}) {
    if (obj.quan > 1) {
        obj.quan--;
        obj.owt = weight(obj, env);
    } else {
        m_useupall(mon, obj, env);
    }
}

// C ref: mthrowu.c thrwmu() (1174-1263). This includes the non-line-of-fire
// polearm arm and the throw-and-return weapon arm before ordinary monshoot().
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

    if (is_pole(selected, state)) {
        // C ref: mthrowu.c:1196-1240. Polearms are applied without a
        // lined-up check, but only when the selected polearm is wielded.
        if (selected !== monster.mw)
            return 0;
        const rang = dist2(
            monster.mx,
            monster.my,
            monster.mux,
            monster.muy,
        );
        if (rang > MON_POLE_DIST || !couldsee(monster.mx, monster.my, state))
            return 0;

        if (canseemon(monster, state)) {
            const name = xnameFresh(selected, state);
            const verb = typeof env.swingVerb === 'function'
                ? env.swingVerb(selected, rang <= 2, env)
                : null;
            if (verb && typeof env.message === 'function') {
                await env.message(
                    `${Monnam(monster, state)} ${verb} `
                    + `${obj_is_pname(selected, state) ? the(name, state) : an(name)}.`,
                    state,
                );
            } else {
                note_unported('mhitu.c mswings_verb/pline_mon');
            }
        }

        let damage = dmgval(selected, state.youmonst, state, env);
        let hitv = 3 - distmin(
            state.u.ux,
            state.u.uy,
            monster.mx,
            monster.my,
        );
        if (hitv < -4) hitv = -4;
        if (bigmonst(state.youmonst.data)) hitv++;
        hitv += 8 + selected.spe;
        if (damage < 1) damage = 1;
        if (typeof env.hitHero === 'function') {
            await env.hitHero(
                hitv,
                maybeHalfPhysical(damage, state),
                selected,
                env,
            );
        } else {
            note_unported('mthrowu.c thitu');
        }
        if (typeof env.stopOccupation === 'function')
            await env.stopOccupation(state, env);
        else
            note_unported('allmain.c stop_occupation');
        return 0;
    }

    let arw = autoreturn_weapon(selected);
    let always_toss = false;
    if (arw && !mwelded(selected, state)) {
        const rang = dist2(
            monster.mx,
            monster.my,
            monster.mux,
            monster.muy,
        );
        if (rang > arw.range || !couldsee(monster.mx, monster.my, state))
            return 0;
        always_toss = true;
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

    const endMulti = requireRangedOperation(env, 'endMulti');
    await monshoot(monster, selected, monster.mw, env);
    endMulti(0, state);
    return 0;
}

// C ref: mthrowu.c spitmu() (1265-1271). Monster spits at the hero.
// Trivial wrapper: calls spitmm with youmonst as the target.
export async function spitmu(mtmp, mattk, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    return spitmm(mtmp, mattk, state.youmonst, rawEnv);
}

// C ref: mthrowu.c breamu() (1273-1278). Monster breathes at the hero.
// Trivial wrapper: calls breamm with youmonst as the target.
export async function breamu(mtmp, mattk, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    return breamm(mtmp, mattk, state.youmonst, rawEnv);
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
        name = obj.quan > 1 ? donameFresh(obj, state)
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

    if (is_acid && propertyActive(state, ACID_RES)) {
        // C ref: mthrowu.c:123-125. The resistance ledger is maintained by
        // mondata.c monstseesu(); the acid-resistance property is the same
        // intrinsic-or-extrinsic test used by youprop.h Acid_resistance.
        await message("It doesn't seem to hurt you.", state);
        monstseesu(M_SEEN_ACID, state);
    } else if (obj && !is_acid
               && stone_missile(obj, state)
               && passes_rocks(state.youmonst.data)) {
        // C ref: mthrowu.c:126-133. A rock-passing hero is unharmed. The
        // source's `named` approximation distinguishes an overhead hit from
        // a horizontal missile, which stops at the hero.
        await message(
            `It ${named ? 'passes harmlessly through' : "doesn't harm"} you.`,
            state,
        );
    } else if (obj && obj.oclass === POTION_CLASS) {
        // C ref: mthrowu.c:134-138. potionhit() is only partially ported for
        // hero targets, so record the source gap and leave its consumed-object
        // handoff to the caller that owns the potion flight.
        note_unported('potion.c potionhit');
    } else {
        // C ref: mthrowu.c:139-151. The generic hit path runs for ordinary
        // darts, arrows, rocks, and other non-special missiles.
        //
        // C ref: youprop.h:401 Hate_silver. This macro combines lycanthropy
        // with the hero's current form, so keep its two source terms here.
        if (obj && objectType(obj, state).oc_material === SILVER
            && ((state.u.ulycn ?? -1) >= LOW_PM
                || hates_silver(state.youmonst.data))) {
            await message('The silver sears your flesh!', state);
            await exercise(A_CON, false, state);
        }
        if (is_acid) {
            await message('It burns!', state);
            monstunseesu(M_SEEN_ACID, state);
        }
        if (env.planning && dam >= state.u.uhp
            && typeof env.planningDeath === 'function') {
            // losehp() would enter end.c done() on the clone. Reproduce its
            // state writes, then hand the monster identity to the live pass.
            end_running(true, state);
            state.disp ??= {};
            state.disp.botl = true;
            state.u.uhp -= dam;
            throw env.planningDeath();
        }
        await losehp(dam, knm, kprefix, state, {
            fromMonster: Boolean(env.fromMonster),
            message,
        });
        // C losehp() enters end.c really_done() on lethal damage, whose
        // NORETURN path never reaches exercise(A_STR, FALSE).
        if (state.program_state?.gameover)
            return 1;
        await exercise(A_STR, false, state);
    }
    return 1;
}

// C ref: mthrowu.c m_has_launcher_and_ammo() (58-71). TRUE when the monster
// wields a launcher and carries at least one matching projectile.
export function m_has_launcher_and_ammo(mtmp, state = game) {
    const mwep = mtmp.mw; /* MON_WEP() */
    if (mwep && is_launcher(mwep, state)) {
        for (let otmp = mtmp.minvent; otmp; otmp = otmp.nobj) {
            if (ammo_and_launcher(otmp, mwep, state))
                return true;
        }
    }
    return false;
}

// C ref: mthrowu.c hit_bars() (1417-1495). Resolve a projectile hitting iron
// bars: it might break against the bars (dissolving them if acid), or bounce
// off with a sound effect, or break the bars when the hero hammers them.
// *objp is set to null if the object breaks.
export function hit_bars(objRef, objx, objy, barsx, barsy, breakflags, state = game, random = { rn2 }) {
    const otmp = objRef.obj;
    const obj_type = otmp.otyp;
    const location = state.level.at(barsx, barsy);
    const nodissolve = (location.wall_info & W_NONDIGGABLE) !== 0;
    const your_fault = (breakflags & BRK_BY_HERO) !== 0;
    const melee_attk = (breakflags & BRK_MELEE) !== 0;
    let noise = 0;

    // C: hero_breaks() and breaks() are not ported. They test whether the
    // object shatters and produce breakage messages and effects. Both use the
    // return value in a condition. Since neither is ported, the break path
    // never fires and the object always survives to hit the bars.
    const broke = false;
    if (your_fault)
        note_unported('dothrow.c hero_breaks');
    else
        note_unported('dothrow.c breaks');

    if (broke) {
        objRef.obj = null; /* object is now gone */
        /* breakage makes its own noises */
        if (obj_type === POT_ACID) {
            if (cansee(barsx, barsy, state) && !nodissolve) {
                note_unported('pline.c pline'); /* "The iron bars are dissolved!" */
            } else {
                note_unported('pline.c pline'); /* You_hear hissing */
            }
            if (!nodissolve)
                note_unported('monmove.c dissolve_bars');
        }
    } else {
        if (!Deaf(state)) {
            /* Sound effect table: Whang/Whap/Flapp/Clink/Clonk */
            const barsounds = [
                '', 'Whang', 'Whap', 'Flapp', 'Clink', 'Clonk',
            ];
            let bsindx;
            if (obj_type === BOULDER || obj_type === HEAVY_IRON_BALL) {
                bsindx = 1;
            } else if (harmless_missile(otmp, state)) {
                bsindx = 2;
            } else if (is_flimsy(otmp, state)) {
                bsindx = 3;
            } else {
                const otype = objectType(otmp, state);
                if (otmp.oclass === COIN_CLASS
                    || otype.oc_material === GOLD
                    || otype.oc_material === SILVER) {
                    bsindx = 4;
                } else {
                    bsindx = barsounds.length - 1;
                }
            }
            note_unported('pline.c pline'); /* pline("%s!", barsounds[bsindx]) */
        }
        if (!(harmless_missile(otmp, state) || is_flimsy(otmp, state)))
            noise = 4 * 4;

        if (your_fault && (otmp.otyp === WAR_HAMMER
                           || otmp.otyp === HEAVY_IRON_BALL)) {
            const spe = (otmp.otyp === HEAVY_IRON_BALL)
                       ? Math.trunc(otmp.owt / WT_IRON_BALL_INCR)
                       : otmp.spe;
            const chance = (melee_attk ? 40 : 60) - acurrstr(state) - spe;

            if (!random.rn2(Math.max(2, chance))) {
                note_unported('pline.c pline'); /* "You break the bars apart!" */
                note_unported('monmove.c dissolve_bars');
                noise = noise * 2;
            }
        }

        if (noise)
            note_unported('mon.c wake_nearto');
    }
}

// C ref: mthrowu.c hits_bars() (1498-1559). TRUE iff a thrown/kicked/rolled
// object doesn't pass through iron bars. When whodidit != -1 and the object
// would hit, calls hit_bars() to resolve breakage and sound effects.
export function hits_bars(obj_ref, x, y, barsx, barsy, always_hit, whodidit, state = game, random = { rn2 }) {
    const otmp = obj_ref.obj;
    const obj_type = otmp.otyp;
    let hits = always_hit;

    if (!hits) {
        switch (otmp.oclass) {
        case WEAPON_CLASS: {
            const otype = objectType(otmp, state);
            const oskill = otype.oc_skill;
            hits = (oskill !== -P_BOW && oskill !== -P_CROSSBOW
                    && oskill !== -P_DART && oskill !== -P_SHURIKEN
                    && oskill !== P_SPEAR
                    && oskill !== P_KNIFE); /* but not dagger */
            break;
        }
        case ARMOR_CLASS:
            hits = (objectType(obj_type, state).oc_armcat !== ARM_GLOVES);
            break;
        case TOOL_CLASS:
            hits = (obj_type !== SKELETON_KEY && obj_type !== LOCK_PICK
                    && obj_type !== CREDIT_CARD && obj_type !== TALLOW_CANDLE
                    && obj_type !== WAX_CANDLE && obj_type !== LENSES
                    && obj_type !== TIN_WHISTLE && obj_type !== MAGIC_WHISTLE);
            break;
        case ROCK_CLASS: /* includes boulder */
            if (obj_type !== STATUE
                || state.mons[otmp.corpsenm].msize > MZ_TINY)
                hits = true;
            break;
        case FOOD_CLASS:
            if (obj_type === CORPSE
                && state.mons[otmp.corpsenm].msize > MZ_TINY)
                hits = true;
            else
                hits = (obj_type === MEAT_STICK
                        || obj_type === ENORMOUS_MEATBALL);
            break;
        case SPBOOK_CLASS:
        case WAND_CLASS:
        case BALL_CLASS:
        case CHAIN_CLASS:
            hits = true;
            break;
        default:
            break;
        }
    }

    if (hits && whodidit !== -1) {
        hit_bars(obj_ref, x, y, barsx, barsy,
                 (whodidit === 1) ? BRK_BY_HERO : 0, state, random);
    }

    return hits;
}
