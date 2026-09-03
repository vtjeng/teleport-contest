// mon.js -- Runtime monster turn state, and the removal lifecycle a monster
// runs when the hero kills it.
// C refs: mon.c movemon(), movemon_singlemon(), hideunder(), mcalcmove(),
// mpickstuff(), curr_mon_load(), max_mon_load(), m_consume_obj(),
// zombie_maker(), unstuck(),
// mon_leaving_level(), m_detach(), mlifesaver(), lifesaved_monster(),
// logdeadmon(), mondead(), corpse_chance(), make_corpse(), mondied(),
// monkilled(), killed(), xkilled() and adj_erinys(); mthrowu.c m_carrying();
// do_name.c safe_oname().

import {
    A_CHAOTIC,
    ALLOW_BARS,
    ALLOW_DIG,
    ALLOW_M,
    ALLOW_ROCK,
    ALLOW_SANCT,
    ALLOW_SSM,
    ALLOW_TRAPS,
    ALLOW_U,
    ALLOW_WALL,
    BOLT_LIM,
    BUSTDOOR,
    CONFLICT,
    CORPSTAT_BURIED,
    CORPSTAT_FEMALE,
    CORPSTAT_INIT,
    CORPSTAT_MALE,
    CORPSTAT_NONE,
    DEAF,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    engulfing_u,
    FIRE_RES,
    FULL_MOON,
    G_GENOD,
    HALLUC,
    HALLUC_RES,
    has_mcorpsenm,
    has_mgivenname,
    has_oname,
    In_endgame,
    I_SPECIAL,
    IS_WATERWALL,
    is_pit,
    isok,
    ismnum,
    LS_MONSTER,
    MAX_CARR_CAP,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_NOTHING,
    M_AP_OBJECT,
    M_AP_TYPE,
    M_AP_TYPMASK,
    MFAST,
    MON_DETACH,
    MON_FLOOR,
    MON_MIGRATING,
    MSLOW,
    NATTK,
    NOGARLIC,
    NORMAL_SPEED,
    NOTONL,
    ONAME_NO_FLAGS,
    OPENDOOR,
    PROT_FROM_SHAPE_CHANGERS,
    RLOC_MSG,
    RLOC_NOMSG,
    ROOM,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
    TAINT_AGE,
    UNLOCKDOOR,
    W_AMUL,
    WT_HUMAN,
    XKILL_GIVEMSG,
    XKILL_NOCONDUCT,
    XKILL_NOCORPSE,
    XKILL_NOMSG,
    helpless,
    u_at,
} from './const.js';
import { artifact_exists } from './artifacts.js';
import { night } from './calendar.js';
import {
    glyph_is_invisible,
    newsym,
    unmap_object,
} from './display.js';
import {
    capitalizedMonsterName,
    hliquid,
    monsterCommonName,
} from './do_name.js';
import { flooreffects } from './do.js';
import { finish_meating } from './dogmove.js';
import { has_ceiling, on_level } from './dungeon.js';
import { sengr_at } from './engrave.js';
import { adjalign } from './attrib.js';
import { experience, more_experienced, newexplevel } from './exper.js';
import { game } from './gstate.js';
import { disturb_buried_zombies } from './hack.js';
import { dist2 } from './hacklib.js';
import { delobj, obj_extract_self, stackobj } from './invent.js';
import { any_light_source, del_light_source } from './light.js';
import { mkcorpstat } from './corpstat.js';
import { change_luck } from './moveloop_preamble.js';
import { freemcorpsenm } from './makemon.js';
import {
    dmonsfree,
    newcham_distress,
    pick_vampire_shape,
    preflight_newcham_distress,
    remove_worm,
    set_mon_data,
    wormgone,
} from './makemon_create.js';
import { m_next2u } from './mhitu.js';
import {
    always_hostile,
    amphibious,
    amorphous,
    attacktype,
    bigmonst,
    breathless,
    can_teleport,
    ceiling_hider,
    completelyburns,
    completelyrots,
    completelyrusts,
    control_teleport,
    dmgtype,
    emits_light,
    flesh_petrifies,
    haseyes,
    is_female,
    is_giant,
    is_golem,
    is_clinger,
    is_floater,
    is_flyer,
    is_hider,
    is_human,
    is_minion,
    is_mplayer,
    is_neuter,
    is_reviver,
    is_rider,
    is_swimmer,
    is_shapeshifter,
    is_male,
    is_undead,
    is_unicorn,
    is_vampshifter,
    is_were,
    likes_lava,
    monster_resists_element,
    monsndx,
    needspick,
    nohands,
    nonliving,
    on_fire,
    passes_bars,
    passes_walls,
    regenerates,
    resist_conflict,
    strongmonst,
    telepathic,
    throws_rocks,
    tunnels,
    undead_to_corpse,
    unique_corpstat,
    unsolid,
    verysmall,
    zombie_form,
} from './mondata.js';
import {
    AD_DCAY,
    AD_DGST,
    AD_DRST,
    AD_FIRE,
    AD_POLY,
    AD_RBRE,
    AD_RUST,
    AD_SEDU,
    AD_SPEL,
    AD_SSEX,
    AD_STCK,
    AT_BOOM,
    AT_ENGL,
    AT_HUGS,
    AT_MAGC,
    AT_WEAP,
    G_FREQ,
    G_NOCORPSE,
    G_UNIQ,
    M1_AMPHIBIOUS,
    M1_FLY,
    M1_REGEN,
    M1_SEE_INVIS,
    M1_TPORT,
    M1_TPORT_CNTRL,
    M2_COLLECT,
    MS_GUARDIAN,
    MS_LEADER,
    MS_NEMESIS,
    MZ_MEDIUM,
    NON_PM,
    PM_ARCHEOLOGIST,
    PM_BLACK_DRAGON,
    PM_BLACK_PUDDING,
    PM_BLACK_UNICORN,
    PM_BLUE_DRAGON,
    PM_BROWN_PUDDING,
    PM_CLAY_GOLEM,
    PM_DWARF_MUMMY,
    PM_DWARF_ZOMBIE,
    PM_ELF_MUMMY,
    PM_ELF_ZOMBIE,
    PM_ERINYS,
    PM_ETTIN_MUMMY,
    PM_ETTIN_ZOMBIE,
    PM_FLESH_GOLEM,
    PM_FOG_CLOUD,
    PM_GIANT_MUMMY,
    PM_GIANT_ZOMBIE,
    PM_GLASS_GOLEM,
    PM_GNOME_MUMMY,
    PM_GNOME_ZOMBIE,
    PM_GOLD_DRAGON,
    PM_GOLD_GOLEM,
    PM_GRAY_DRAGON,
    PM_GRAY_OOZE,
    PM_GRAY_UNICORN,
    PM_GREEN_DRAGON,
    PM_GREEN_SLIME,
    PM_GHOUL,
    PM_HIGH_CLERIC,
    PM_HUMAN,
    PM_HUMAN_MUMMY,
    PM_HUMAN_WEREJACKAL,
    PM_HUMAN_WERERAT,
    PM_HUMAN_WEREWOLF,
    PM_HUMAN_ZOMBIE,
    PM_IRON_GOLEM,
    PM_KOBOLD_MUMMY,
    PM_KOBOLD_ZOMBIE,
    PM_GIANT_MIMIC,
    PM_LARGE_MIMIC,
    PM_LEATHER_GOLEM,
    PM_LIZARD,
    PM_LONG_WORM,
    PM_MAIL_DAEMON,
    PM_MEDUSA,
    PM_MINOTAUR,
    PM_NURSE,
    PM_ORANGE_DRAGON,
    PM_ORC_MUMMY,
    PM_ORC_ZOMBIE,
    PM_PAPER_GOLEM,
    PM_RED_DRAGON,
    PM_ROPE_GOLEM,
    PM_SILVER_DRAGON,
    PM_SKELETON,
    PM_SMALL_MIMIC,
    PM_STALKER,
    PM_STEAM_VORTEX,
    PM_STONE_GOLEM,
    PM_VAMPIRE,
    PM_VAMPIRE_LEADER,
    PM_VLAD_THE_IMPALER,
    PM_WEREJACKAL,
    PM_WERERAT,
    PM_WEREWOLF,
    PM_WHITE_DRAGON,
    PM_WHITE_UNICORN,
    PM_WIZARD,
    PM_WRAITH,
    PM_WOOD_GOLEM,
    PM_YELLOW_DRAGON,
    S_EEL,
    S_GHOST,
    S_KOP,
    S_LICH,
    S_MIMIC,
    S_VAMPIRE,
    S_ZOMBIE,
} from './monsters.js';
import {
    accessible,
    m_can_break_boulder,
    m_in_air,
    monhaskey,
    onscary,
} from './monmove.js';
import { m_at, remove_monster } from './monst.js';
import {
    clear_dknown,
    clear_splitobjs,
    mkobj,
    objectType,
    place_object,
    sobj_at,
    splitobj,
} from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    AMULET_OF_LIFE_SAVING,
    BOULDER,
    CARROT,
    CORPSE,
    EGG,
    FIGURINE,
    FOOD_CLASS,
    GLOB_OF_GREEN_SLIME,
    POTION_CLASS,
    RANDOM_CLASS,
    TIN,
} from './objects.js';
import { distant_name, donameFresh } from './objnam.js';
import { d, rn1, rn2, rnd, rne } from './rng.js';
import {
    canSeeMonster,
    canSpotMonster,
    heroIsBlind,
    messageAt,
    sensesMonster,
} from './startup_a11y.js';
import { mpickobj, relobj } from './steal.js';
import { noteleport_level } from './teleport.js';
import { fill_pit, is_lava, is_pool, t_at, Flying, Levitation } from './trap.js';
import { ttyPline } from './tty_message.js';
import {
    cansee,
    canseemon,
    couldsee,
    does_block,
    is_lightblocker_mappear,
    unblock_point,
} from './vision.js';
import { which_armor } from './worn.js';

function monsterTurnEnv(env = {}) {
    const state = env.state ?? game;
    const moveSingleMonster = env.moveSingleMonster;
    const clearBypasses = env.clearBypasses;
    const deferredGoto = env.deferredGoto;
    if (typeof moveSingleMonster !== 'function')
        throw new TypeError('movemon requires a moveSingleMonster operation');
    if (typeof clearBypasses !== 'function')
        throw new TypeError('movemon requires a clearBypasses operation');
    if (typeof deferredGoto !== 'function')
        throw new TypeError('movemon requires a deferredGoto operation');
    return {
        ...env,
        state,
        moveSingleMonster,
        clearBypasses,
        deferredGoto,
    };
}

// C ref: mon.c iter_mons_safe(). Snapshot identities before the first
// callback so deletion and insertion can safely mutate the live monlist.
export async function iter_mons_safe(callback, state = game) {
    if (typeof callback !== 'function')
        throw new TypeError('iter_mons_safe requires a callback');
    const monsters = [];
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        monsters.push(monster);
    }
    for (const monster of monsters) {
        if (await callback(monster)) break;
    }
}

// C ref: mon.c movemon(). moveSingleMonster owns movemon_singlemon(). Its
// Boolean result means "terminate traversal", not "monster moved"; like C, it
// separately maintains state.somebody_can_move for movemon()'s return value.
// The other two required operations own worn.c clear_bypasses() and do.c
// deferred_goto(). They are preflighted together so an unavailable later
// boundary cannot leave a partially processed monster list.
export async function movemon(env = {}) {
    const normalized = monsterTurnEnv(env);
    const { state } = normalized;

    state.somebody_can_move = false;
    await iter_mons_safe(
        async (monster) => {
            const stop = await normalized.moveSingleMonster(
                monster,
                normalized,
            );
            // C's done_in_by() is NORETURN, so once a monster kills the hero
            // no later monster in the list gets a turn. js/end.js returns from
            // the end-game display instead, so that replay can capture its
            // final window; ending the traversal is what stands in for C's
            // longjmp out of the whole move loop.
            return stop || Boolean(state.program_state?.gameover);
        },
        state,
    );

    if (any_light_source(state)) state.vision_full_recalc = 1;
    if (state.context?.bypasses)
        await normalized.clearBypasses(normalized);
    clear_splitobjs(state);
    dmonsfree(state);

    if (state.u?.utotype) {
        await normalized.deferredGoto(normalized);
        state.somebody_can_move = false;
    }
    return state.somebody_can_move;
}

function requiredSingleMonsterOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(
            `movemon_singlemon requires a ${name} operation`,
        );
    }
    return operation;
}

// C ref: mon.c movemon_singlemon() ends in `(void) dochugw(mtmp, TRUE);`
// (mon.c:1320). This file never calls dochugw() itself: the port injects that
// call as the `dochugwAction` operation, which movemon_singlemon() below
// invokes with the normalized action environment as a third argument that C's
// two-parameter dochugw() has no counterpart for. Adapt an environment-owned
// action to that signature without letting the source `chug` argument
// displace the environment.
export function adaptMonsterActionToDochugwSignature(action) {
    return (monster, _chug, env) => action(monster, env);
}

function activeMonsterOperations(env) {
    return {
        visionRecalc: requiredSingleMonsterOperation(env, 'visionRecalc'),
        clearBypasses: requiredSingleMonsterOperation(env, 'clearBypasses'),
        minLiquid: requiredSingleMonsterOperation(env, 'minLiquid'),
        dowear: requiredSingleMonsterOperation(env, 'dowear'),
        restrap: requiredSingleMonsterOperation(env, 'restrap'),
        canSeeMonster: requiredSingleMonsterOperation(env, 'canSeeMonster'),
        hideUnder: requiredSingleMonsterOperation(env, 'hideUnder'),
        canSeeHero: requiredSingleMonsterOperation(env, 'canSeeHero'),
        canSeeSquare: requiredSingleMonsterOperation(env, 'canSeeSquare'),
        fightMonster: requiredSingleMonsterOperation(env, 'fightMonster'),
        dochugwAction: requiredSingleMonsterOperation(env, 'dochugwAction'),
    };
}

function conflictActive(state) {
    const conflict = state.u?.uprops?.[CONFLICT];
    return Boolean(conflict?.intrinsic || conflict?.extrinsic);
}

// C ref: monst.h:255 mon_offmap(). A monster whose mstate has left MON_FLOOR
// is detached, migrating, or in limbo, and is no longer on this level's map.
export function mon_offmap(monster) {
    return (monster.mstate ?? MON_FLOOR) !== MON_FLOOR;
}

function monsterOnMap(monster) {
    return !mon_offmap(monster);
}

// C ref: mon.c get_iter_mons(). Walks this level's monsters and answers the
// first one `bfunc` accepts, or null. C caches each monster's `nmon` before
// calling `bfunc` so that a predicate which removes the monster from the chain
// still leaves the walk somewhere valid.
export function get_iter_mons(bfunc, state = game) {
    let next = null;
    for (let mtmp = state.level?.monlist ?? null; mtmp; mtmp = next) {
        next = mtmp.nmon;
        if (mtmp.mhp < 1 /* DEADMONSTER() */ || mon_offmap(mtmp)) continue;
        if (bfunc(mtmp)) return mtmp;
    }
    return null;
}

// C ref: mon.c pm_to_cham(). Answers the shape a monster of species `mndx`
// reverts to, which is that species itself for a shapeshifter and NON_PM for
// everything else.
export function pm_to_cham(mndx, state = game) {
    const species = state.mons?.[mndx];
    return species && is_shapeshifter(species) ? mndx : NON_PM;
}

// C ref: mon.c restore_cham(), which dog.c mon_arrive() calls on every monster
// that reaches a level, because Protection_from_shape_changers may have
// changed while the monster was off the map.
//
// The forced-revert arm needs normal_shape(), which is unported: it undoes a
// mimic's disguise through seemimic() and a vampshifter's form through
// newcham(). Neither the hero property nor mcan can be set on any path that
// reaches a level change today, so the arm stops rather than runs.
export function restore_cham(monster, state = game) {
    const shapeChangerProtection
        = state.u?.uprops?.[PROT_FROM_SHAPE_CHANGERS];
    if (shapeChangerProtection?.intrinsic
        || shapeChangerProtection?.extrinsic
        || monster.mcan) {
        throw new RangeError(
            'restore_cham: forcing a natural shape is future work',
        );
    }
    if (monster.cham === NON_PM)
        monster.cham = pm_to_cham(monsndx(monster.data), state);
}

// C ref: mon.c set_ustuck() (3421-3434). The sanity-check impossible() at the
// top runs only under iflags.sanity_check or the debug fuzzer, neither of
// which this port models. Clearing the holder clears the swallow state with
// it, which is why teleds() reads u.uswallow before calling this.
export function set_ustuck(mtmp, state = game) {
    state.disp ??= {};
    state.disp.botl = true;
    state.u.ustuck = mtmp;
    if (!state.u.ustuck) {
        state.u.uswallow = 0;
        state.u.uswldtim = 0;
    }
}

// C ref: mon.c movemon_singlemon(). The injected operations retain the source
// subsystem boundaries for guard cleanup, liquid effects, runtime equipment,
// hiding, perception, monster combat, and dochugw(). All operations reachable
// after the movement debit are preflighted before m_everyturn_effect() so a
// missing owner cannot duplicate its fog-cloud side effect on retry.
export async function movemon_singlemon(monster, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2 };

    if (state.u?.utotype) {
        state.somebody_can_move = false;
        return true;
    }

    const parkedGuard = monster.isgd
        && !monster.mx
        && !((monster.mstate ?? MON_FLOOR) & MON_MIGRATING);
    if (parkedGuard) {
        if ((state.moves ?? 0) > (monster.mlstmv ?? 0)) {
            const guardMove = requiredSingleMonsterOperation(env, 'guardMove');
            await guardMove(monster, { ...env, state, random });
            monster.mlstmv = state.moves;
        }
        return false;
    }
    if (monster.mhp < 1 || !monsterOnMap(monster)) return false;

    const everyTurnEffect = requiredSingleMonsterOperation(
        env,
        'everyTurnEffect',
    );
    const willSpendMovement = monster.movement >= NORMAL_SPEED;
    const operations = willSpendMovement ? activeMonsterOperations(env) : null;
    if (willSpendMovement && monster.data?.mlet === S_EEL
        && typeof random.rn2 !== 'function') {
        throw new TypeError(
            'movemon_singlemon random injection requires rn2',
        );
    }
    const normalized = {
        ...env,
        state,
        random,
        ...operations,
    };

    await everyTurnEffect(monster, normalized);
    if (!willSpendMovement) return false;

    monster.movement -= NORMAL_SPEED;
    if (monster.movement >= NORMAL_SPEED) state.somebody_can_move = true;

    if (state.vision_full_recalc)
        await operations.visionRecalc(0, normalized);
    if (state.context?.bypasses)
        await operations.clearBypasses(normalized);
    clear_splitobjs(state);
    if (await operations.minLiquid(monster, normalized)) return false;

    if (monster.misc_worn_check & I_SPECIAL) {
        const believedHeroIsDistant = dist2(
            monster.mx,
            monster.my,
            monster.mux,
            monster.muy,
        ) > 9;
        if (monster.mpeaceful || monster.mtame || believedHeroIsDistant) {
            monster.misc_worn_check &= ~I_SPECIAL;
            const oldWorn = monster.misc_worn_check;
            await operations.dowear(monster, false, normalized);
            if (monster.misc_worn_check !== oldWorn || !monster.mcanmove)
                return false;
        }
    }

    if (is_hider(monster.data)) {
        if (await operations.restrap(monster, normalized)) return false;
        const appearance = monster.m_ap_type & M_AP_TYPMASK;
        if (appearance === M_AP_FURNITURE || appearance === M_AP_OBJECT)
            return false;
        if (monster.mundetected) return false;
    } else if (monster.data?.mlet === S_EEL
        && !monster.mundetected
        && (monster.mflee
            || dist2(
                monster.mx,
                monster.my,
                state.u?.ux,
                state.u?.uy,
        ) > 2)
        && !operations.canSeeMonster(monster, normalized)) {
        if (!random.rn2(4)
            && await operations.hideUnder(monster, normalized)) {
            return false;
        }
    }

    if (conflictActive(state) && !monster.iswiz
        && operations.canSeeHero(monster, normalized)) {
        if (operations.canSeeSquare(monster.mx, monster.my, normalized)
            && dist2(
                monster.mx,
                monster.my,
                state.u?.ux,
                state.u?.uy,
            ) <= BOLT_LIM * BOLT_LIM
            && await operations.fightMonster(monster, normalized)) {
            return false;
        }
    }
    await operations.dochugwAction(monster, true, normalized);
    return false;
}

// C ref: mthrowu.c m_carrying(). The hero-form case is retained because
// source callers can pass &youmonst even though ordinary movement passes a
// level monster.
export function m_carrying(monster, type, state = game) {
    const inventory = monster === state.youmonst
        ? state.invent
        : monster.minvent;
    for (let obj = inventory; obj; obj = obj.nobj) {
        if (obj.otyp === type) return obj;
    }
    return null;
}

// C ref: mon.c m_consume_obj() (1392-1453), the tame-monster branch for a
// corpse.  dogmove.c dog_eat() is its live caller.  The uball/uchain and
// Has_contents arms are gated before entry.  After delobj, corpses that
// trigger polyfood, mlevelgain, mhealup, mstoning, sliming, pyrolisk
// explosion, or mon_givit effects are refused fail-closed; only inert
// corpses, ordinary food items, and the mimic-quickmimic branch pass through.
export async function m_consume_obj(mtmp, otmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const unsupported = rawEnv.unsupported;
    const stop = (reason) => {
        if (typeof unsupported === 'function') unsupported(reason);
        throw new TypeError(`m_consume_obj requires ${reason}`);
    };

    if (!mtmp?.mtame) stop('a tame monster');
    if (otmp === state.uball || otmp === state.uchain)
        stop('an unpunished object');
    if (otmp?.oartifact) stop('an ordinary object');

    // C line 1410: corpsenm is NON_PM for non-CORPSE objects.
    const corpsenm = otmp.otyp === CORPSE ? otmp.corpsenm : NON_PM;

    // Non-corpse food items: the C special-effect macros (ofood, polyfood,
    // mlevelgain, mhealup, mstoning) all require CORPSE, EGG, or TIN; the
    // CARROT eye-cure check is by otyp.  Keep every other food arm guarded
    // until its downstream effect is ported.
    if (otmp.otyp !== CORPSE) {
        if (otmp.otyp === EGG) stop('a non-EGG food item');
        if (otmp.otyp === TIN) stop('a non-TIN food item');
        if (otmp.otyp === GLOB_OF_GREEN_SLIME)
            stop('a non-slime food item');
        if (otmp.cobj) stop('an empty food container');
        delobj(otmp, objectGenerationEnv({ ...rawEnv, state }));
        if (otmp.otyp === CARROT && !mtmp.mcansee) {
            // C ref: muse.c mcureblindness() (2872-2881), reached by
            // mon.c m_consume_obj() after the CARROT arm's delobj().
            mtmp.mcansee = true;
            mtmp.mblinded = 0;
            const canSeeMonster = rawEnv.canSeeMonster
                ?? ((subject) => canseemon(subject, state));
            if (canSeeMonster(mtmp) && haseyes(mtmp.data)) {
                const message = rawEnv.message ?? ttyPline;
                await message(
                    messageAt(
                        `${capitalizedMonsterName(mtmp, state)} can see again.`,
                        mtmp.mx,
                        mtmp.my,
                        state,
                    ),
                    state,
                );
            }
        }
        return;
    }

    if (otmp.cobj) stop('an empty corpse object');

    const corpseSpecies = ismnum(corpsenm) ? state.mons?.[corpsenm] : null;

    // Gate every post-delobj effect branch.  Each check mirrors the C macro
    // or inline test that guards the branch.  Refuse any corpse that would
    // fire an unported branch; allow the rest through to delobj.
    const isMimic = corpsenm === PM_SMALL_MIMIC
        || corpsenm === PM_LARGE_MIMIC
        || corpsenm === PM_GIANT_MIMIC;
    // polyfood: pm_to_cham or AD_POLY
    if (corpseSpecies && ismnum(corpsenm)
        && (pm_to_cham(corpsenm, state) !== NON_PM
            || dmgtype(corpseSpecies, AD_POLY)))
        stop('a non-polymorphing corpse');
    // GLOB_OF_GREEN_SLIME is caught by the non-CORPSE branch above.
    // mlevelgain: PM_WRAITH
    if (corpsenm === PM_WRAITH) stop('a non-wraith corpse');
    // mhealup: PM_NURSE
    if (corpsenm === PM_NURSE) stop('a non-nurse corpse');
    // mstoning: flesh_petrifies
    if (corpseSpecies && flesh_petrifies(corpseSpecies))
        stop('a non-petrifying corpse');
    // pyrolisk egg: EGG is not a corpse, handled in the non-CORPSE branch.
    // mon_givit: fires when corpsenm != NON_PM.  For corpses whose species
    // conveys no intrinsic and is not a stalker, corpse_intrinsic returns 0
    // and mon_givit returns immediately with no random draw or state change.
    // Gate corpses that WOULD convey an intrinsic or trigger the stalker
    // invisibility path.
    if (corpsenm === PM_STALKER) stop('a non-stalker corpse');
    if (corpseSpecies) {
        if (is_giant(corpseSpecies))
            stop('a non-giant corpse');
        if (corpseSpecies.mconveys)
            stop('a corpse that conveys no intrinsic');
        if (can_teleport(corpseSpecies)
            || control_teleport(corpseSpecies)
            || telepathic(corpseSpecies))
            stop('a corpse that conveys no intrinsic');
    }

    if (isMimic) {
        if (typeof rawEnv.quickMimic !== 'function')
            throw new TypeError(
                'm_consume_obj requires a quickMimic operation',
            );
    }

    delobj(otmp, objectGenerationEnv({ ...rawEnv, state })); /* munch */

    // Mimic corpses trigger quickmimic for tame pets (C line 1446-1447).
    if (isMimic) {
        await rawEnv.quickMimic(mtmp, { ...rawEnv, state });
    }
    // For non-mimic corpses with no effect branches, mon_givit is a no-op
    // (corpse_intrinsic returns 0), so nothing happens after delobj.
}

// C ref: mon.c check_gear_next_turn(). Setting misc_worn_check's I_SPECIAL bit
// marks this monster's gear for reassessment on its next move. The consumer is
// movemon_singlemon(), not dochug(), which never reads misc_worn_check.
export function check_gear_next_turn(monster) {
    monster.misc_worn_check |= I_SPECIAL;
}

// C ref: mon.c mpickstuff() (1847-1912), the effect half: everything from the
// stack split at 1888 through `return TRUE` at 1910.
//
// The decision half is ported in monmove.js select_postmove_object_action():
// the shopkeeper and shop-draw returns, could_reach_item(), and the loop's
// prize, mon_would_take_item(), corpse, can_touch_safely() and can_carry()
// filters. It lives there because the fail-closed monster boundary has to
// choose between postmov()'s meatmetal(), meatobj(), meatcorpse() and
// mpickstuff() arms before any of them changes state, and only mpickstuff()'s
// arm is ported. This function is handed the object that loop selected and the
// can_carry() amount it computed, and takes over where the loop stopped.
//
// The caller returns MMOVE_DONE on a true result, as postmov() does at
// monmove.c:1680.
export async function mpickstuff(monster, obj, carryamt, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn1, rn2, rnd, rne };
    const env = { ...rawEnv, state, random };
    // pline_mon() and newsym(). A planning scan overrides both with no-ops,
    // because it re-runs the same turn against the live display.
    const message = rawEnv.message ?? ttyPline;
    const redraw = rawEnv.redraw ?? newsym;
    // splitobj(), remove_object() and add_to_minv() each reach owners that
    // obj.js expects the caller to supply.
    const objectEnv = objectGenerationEnv(env);

    // splitobj() normalizes through js/obj.js objectEnv(), which needs the
    // whole source random set because next_ident() draws rnd(2). State that
    // here, at the split, rather than up front where it is not yet true.
    if (carryamt !== obj.quan) {
        for (const name of ['rn1', 'rn2', 'rnd', 'rne']) {
            if (typeof random[name] !== 'function') {
                throw new TypeError(
                    'mpickstuff splitting requires rn2, rnd, rn1, and rne',
                );
            }
        }
    }
    const taken = carryamt !== obj.quan
        ? splitobj(obj, carryamt, objectEnv)
        : obj;
    if (cansee(monster.mx, monster.my, state)) {
        // C ref: mon.c:1893-1901. distant_name() runs for its side effects
        // even when verbose is off and the name is discarded, and it runs
        // before the extract so that doname() -> xname() -> find_artifact()
        // still sees the object on the floor. C names `otmp`, the stack that
        // stays behind, not `otmp3`, the portion the monster takes, so a
        // partial pickup announces the quantity left on the floor.
        // dogmove.c's carry arm names the taken portion instead.
        const remainingName = distant_name(obj, donameFresh, state);
        if (state.flags?.verbose) {
            await message(
                messageAt(
                    `${capitalizedMonsterName(monster, state)}`
                    + ` picks up ${remainingName}.`,
                    monster.mx,
                    monster.my,
                    state,
                ),
                state,
            );
        }
    }
    obj_extract_self(taken, objectEnv);
    mpickobj(monster, taken, objectEnv);
    // let them try to equip it on the next turn
    check_gear_next_turn(monster);
    redraw(monster.mx, monster.my, state);
    return true;
}

// C ref: mon.c curr_mon_load(). Boulder throwers' boulders do not contribute
// to their current load, matching their unlimited-boulder carrying rule.
export function curr_mon_load(monster) {
    let currentLoad = 0;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.otyp !== BOULDER || !throws_rocks(monster.data))
            currentLoad += obj.owt;
    }
    return currentLoad;
}

// C ref: mon.c max_mon_load(). MZ_HUMAN is the source alias for MZ_MEDIUM.
// All operands are nonnegative, so Math.trunc reproduces C integer division.
export function max_mon_load(monster) {
    const species = monster.data;
    const strong = strongmonst(species);
    let maxLoad;

    if (!species.cwt) {
        maxLoad = Math.trunc(
            MAX_CARR_CAP * species.msize / MZ_MEDIUM,
        );
    } else if (!strong || (strong && species.cwt > WT_HUMAN)) {
        maxLoad = Math.trunc(MAX_CARR_CAP * species.cwt / WT_HUMAN);
    } else {
        maxLoad = MAX_CARR_CAP;
    }

    if (!strong) maxLoad = Math.trunc(maxLoad / 2);
    return Math.max(maxLoad, 1);
}

// C ref: mon.c mon_allowflags() (2062-2126). This returns only movement
// capabilities; mfndpos() owns applying them to individual neighboring
// squares. When Conflict is active, the source always makes exactly one
// resistance draw, even for a hostile monster which already has ALLOW_U.
//
// monhaskey() and m_can_break_boulder() stay in js/monmove.js, where their C
// homes at monmove.c:96 and :133 put them.
export function mon_allowflags(monster, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rnd };
    const species = monster.data;
    const conflict = conflictActive(state);
    const canOpen = !(nohands(species) || verysmall(species));
    const canUnlock = (canOpen && monhaskey(monster, true, state))
        || monster.iswiz || is_rider(species);
    const doorbuster = is_giant(species);
    let canTunnel = tunnels(species)
        && !on_level(state.u?.uz, state.rogue_level);

    if (canTunnel && needspick(species)
        && ((!monster.mpeaceful || conflict)
            && dist2(monster.mx, monster.my, monster.mux, monster.muy) <= 8)) {
        canTunnel = false;
    }

    let allowflags = 0;
    if (monster.mtame) {
        allowflags |= ALLOW_M | ALLOW_TRAPS | ALLOW_SANCT | ALLOW_SSM;
    } else if (monster.mpeaceful) {
        allowflags |= ALLOW_SANCT | ALLOW_SSM;
    } else {
        allowflags |= ALLOW_U;
    }
    if (conflict && !resist_conflict(monster, state, random))
        allowflags |= ALLOW_U;
    if (monster.isshk) allowflags |= ALLOW_SSM;
    if (monster.ispriest) allowflags |= ALLOW_SSM | ALLOW_SANCT;
    if (passes_walls(species)) allowflags |= ALLOW_ROCK | ALLOW_WALL;
    if (throws_rocks(species) || m_can_break_boulder(monster))
        allowflags |= ALLOW_ROCK;
    if (canTunnel) allowflags |= ALLOW_DIG;
    if (doorbuster) allowflags |= BUSTDOOR;
    if (canOpen) allowflags |= OPENDOOR;
    if (canUnlock) allowflags |= UNLOCKDOOR;
    if (passes_bars(species)
        && (monster !== state.u?.ustuck
            || unsolid(state.youmonst?.data)
            || verysmall(state.youmonst?.data))) {
        allowflags |= ALLOW_BARS;
    }
    if (is_minion(species) || is_rider(species))
        allowflags |= ALLOW_SANCT;
    if (is_unicorn(species) && !noteleport_level(monster, state))
        allowflags |= NOTONL;
    if (is_human(species) || species === state.mons?.[PM_MINOTAUR])
        allowflags |= ALLOW_SSM;
    if ((is_undead(species) && species?.mlet !== S_GHOST)
        || is_vampshifter(monster)) {
        allowflags |= NOGARLIC;
    }
    return allowflags;
}

function liquidOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(
            'monster liquid effects require ' + name,
        );
    }
    return operation;
}

function liquidCanSee(monster, env) {
    const state = env.state ?? game;
    return typeof env.canSee === 'function'
        ? Boolean(env.canSee(monster.mx, monster.my, env))
        : cansee(monster.mx, monster.my, state);
}

function liquidCanSeeMonster(monster, env) {
    const state = env.state ?? game;
    return typeof env.canSeeMonster === 'function'
        ? Boolean(env.canSeeMonster(monster, env))
        : canseemon(monster, state);
}

async function liquidMessage(text, monster, env) {
    const state = env.state ?? game;
    const message = env.message ?? ttyPline;
    if (typeof message !== 'function')
        throw new TypeError('monster liquid effects require message');
    await message(
        messageAt(text, monster.mx, monster.my, state),
        state,
        env,
    );
}

async function liquidTeleportRestricted(monster, env) {
    const state = env.state ?? game;
    if (!noteleport_level(monster, state)) return false;
    // C's tele_restrict() reports the restriction only when canseemon() does.
    if (liquidCanSeeMonster(monster, env)) {
        await liquidMessage(
            'A mysterious force prevents '
                + monsterCommonName(monster, state)
                + ' from teleporting!',
            monster,
            env,
        );
    }
    return true;
}

async function liquidRelocate(monster, flags, env) {
    const relocate = liquidOperation(env, 'relocateMonster');
    return Boolean(await relocate(monster, flags, env));
}

async function liquidDamageInventory(monster, lava, env) {
    const operationName = lava ? 'fireDamageChain' : 'waterDamageChain';
    const operation = env[operationName];
    // Both source damage-chain functions return immediately for a null chain.
    // Avoid requiring an owner for that no-op, while refusing before an
    // inventory item can be silently lost.
    if (typeof operation !== 'function') {
        if (monster.minvent) {
            throw new TypeError(
                'monster liquid effects require ' + operationName,
            );
        }
        return;
    }
    if (lava) {
        await operation(
            monster.minvent,
            false,
            false,
            monster.mx,
            monster.my,
            env,
        );
    } else {
        await operation(monster.minvent, false, env);
    }
}

async function liquidDeath(monster, water, env) {
    const state = env.state ?? game;
    if (state.context?.mon_moving) {
        const operationName = water ? 'mondied' : 'mondead';
        const operation = env[operationName];
        if (typeof operation === 'function') {
            await operation(monster, state, env);
        } else if (water) {
            await mondied(monster, state, env);
        } else {
            await mondead(monster, state, env);
        }
    } else {
        const operation = env.xkilled;
        if (typeof operation === 'function') {
            await operation(monster, XKILL_NOMSG, state, env);
        } else {
            await xkilled(monster, XKILL_NOMSG, state, env);
        }
    }
}

async function liquidOvercrowding(monster, env) {
    await liquidOperation(env, 'dealWithOvercrowding')(monster, env);
}

// C ref: mon.c minliquid() and minliquid_core() (945-1122). This is the
// ordinary non-flying/non-floating pool and lava path. Species-specific
// gremlin multiplication and iron-golem rust, eel distress, and the Plane of
// Water exceptions outside this ordinary witness remain owned by the
// fail-closed action boundary.
export async function minliquid(monster, env = {}) {
    const state = env.state ?? game;
    state.iflags ??= {};
    const hadSadFeeling = Object.hasOwn(state.iflags, 'sad_feeling');
    state.iflags.sad_feeling = Boolean(
        monster.mtame && !liquidCanSeeMonster(monster, env),
    );
    try {
        return await minliquid_core(monster, { ...env, state });
    } finally {
        // Keep the JS state shape stable when the field was only needed by
        // this call. C's iflags member is always present in its struct, but
        // this port creates optional fields only when their callers need
        // them; nested death helpers still see the false clear above.
        if (hadSadFeeling) state.iflags.sad_feeling = false;
        else delete state.iflags.sad_feeling;
    }
}

export async function minliquid_core(monster, env = {}) {
    const state = env.state ?? game;
    const location = state.level?.at?.(monster.mx, monster.my);
    const waterwall = Boolean(location && IS_WATERWALL(location.typ));
    const inpool = is_pool(monster.mx, monster.my, state)
        && (!(is_flyer(monster.data) || is_floater(monster.data))
            || on_level(state.u?.uz, state.water_level));
    const inlava = is_lava(monster.mx, monster.my, state)
        && !(is_flyer(monster.data) || is_floater(monster.data));

    // C's steed exception is a hero property, not a monster species branch,
    // and it is needed before the liquid-specific tests below.
    if (monster === state.u?.usteed
        && (Flying(state) || Levitation(state))
        && !waterwall) {
        return 0;
    }

    if (inlava) {
        if (!is_clinger(monster.data) && !likes_lava(monster.data)) {
            if (can_teleport(monster.data)
                && !(await liquidTeleportRestricted(monster, env))
                && await liquidRelocate(monster, RLOC_MSG, env)) {
                return 0;
            }

            if (!monster_resists_element(monster, FIRE_RES, state)) {
                if (liquidCanSee(monster, env)) {
                    const how = on_fire(
                        monster.data,
                        monster.data?.mattk?.[0],
                    );
                    const verb = how === 'boiling'
                        ? 'boils away'
                        : how === 'melting'
                            ? 'melts away'
                            : 'burns to a crisp';
                    await liquidMessage(
                        capitalizedMonsterName(monster, state)
                            + ' ' + verb + '.',
                        monster,
                        env,
                    );
                }
                await liquidDeath(monster, false, env);
            } else {
                monster.mhp -= 1;
                if (monster.mhp < 1) {
                    if (liquidCanSee(monster, env)) {
                        await liquidMessage(
                            capitalizedMonsterName(monster, state)
                                + ' surrenders to the fire.',
                            monster,
                            env,
                        );
                    }
                    await mondead(monster, state, env);
                } else if (liquidCanSee(monster, env)) {
                    await liquidMessage(
                        capitalizedMonsterName(monster, state)
                            + ' burns slightly.',
                        monster,
                        env,
                    );
                }
            }

            if (monster.mhp >= 1) {
                if (!m_in_air(monster, state) && !likes_lava(monster.data)) {
                    await liquidDamageInventory(monster, true, env);
                    if (!await liquidRelocate(monster, RLOC_MSG, env))
                        await liquidOvercrowding(monster, env);
                }
                return 0;
            }
            return 1;
        }
    } else if (inpool || waterwall) {
        if ((waterwall || !is_clinger(monster.data))
            && !is_swimmer(monster.data)
            && !amphibious(monster.data)
            && !breathless(monster.data)) {
            if (can_teleport(monster.data)
                && !(await liquidTeleportRestricted(monster, env))
                && await liquidRelocate(monster, RLOC_MSG, env)) {
                return 0;
            }

            if (liquidCanSee(monster, env)) {
                await liquidMessage(
                    state.context?.mon_moving
                        ? capitalizedMonsterName(monster, state)
                            + ' drowns.'
                        : 'You drown '
                            + monsterCommonName(monster, state) + '.',
                    monster,
                    env,
                );
            }
            if (engulfing_u(monster, state)) {
                await liquidMessage(
                    capitalizedMonsterName(monster, state)
                        + ' sinks as ' + hliquid('water', { state })
                        + ' rushes in and flushes you out.',
                    monster,
                    env,
                );
            }
            await liquidDeath(monster, true, env);
            if (monster.mhp >= 1) {
                if (!m_in_air(monster, state)) {
                    await liquidDamageInventory(monster, false, env);
                    if (!await liquidRelocate(monster, RLOC_NOMSG, env))
                        await liquidOvercrowding(monster, env);
                }
                return 0;
            }
            return 1;
        }
    }
    return 0;
}

// C ref: mon.c mcalcmove(). Adjust a monster's base speed, then randomly
// round a moving monster to a multiple of NORMAL_SPEED. The rounding draw is
// unconditional, including when the adjusted speed already has no remainder.
export function mcalcmove(
    monster,
    monsterMoving,
    state = game,
    random = rn2,
) {
    let movement = monster.data.mmove;

    if (monster.mspeed === MSLOW) {
        movement = movement < NORMAL_SPEED
            ? Math.trunc((2 * movement + 1) / 3)
            : 4 + Math.trunc(movement / 3);
    } else if (monster.mspeed === MFAST) {
        movement = Math.trunc((4 * movement + 2) / 3);
    }

    if (monster === state.u?.usteed && state.u.ugallop
        && state.context?.mv) {
        movement = Math.trunc((random(2) ? 4 : 5) * movement / 3);
    }

    if (monsterMoving) {
        const adjustment = movement % NORMAL_SPEED;
        movement -= adjustment;
        if (random(NORMAL_SPEED) < adjustment)
            movement += NORMAL_SPEED;
    }
    return movement;
}

// C ref: monmove.c mon_regen().  Meal digestion is owned by each actual
// monster action; mcalcdistress() passes false and only performs turn-based
// healing plus special-attack cooldown.
export function mon_regen(monster, digestMeal = false, state = game) {
    if (!(Math.trunc(state.moves ?? 0) % 20)
        || regenerates(monster.data)) {
        monster.mhp = Math.min(
            Math.trunc(monster.mhp ?? 0) + 1,
            Math.trunc(monster.mhpmax ?? 0),
        );
    }
    if (monster.mspec_used) monster.mspec_used--;
    if (digestMeal) {
        throw new Error('mon_regen meal-digestion branch is not implemented');
    }
}

export class UnsupportedMonsterDistressError extends Error {
    constructor(operation) {
        super(`unsupported monster distress state: ${operation}`);
        this.name = 'UnsupportedMonsterDistressError';
        this.operation = operation;
    }
}

function distressRandom(env = {}) {
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    for (const name of ['d', 'rn1', 'rn2', 'rnd', 'rne']) {
        if (typeof random[name] !== 'function') {
            throw new TypeError(
                `monster distress random injection requires ${name}`,
            );
        }
    }
    return random;
}

function distressPropertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function distressHallucinating(state) {
    return distressPropertyActive(state, HALLUC)
        && !distressPropertyActive(state, HALLUC_RES);
}

function distressDeaf(state) {
    return distressPropertyActive(state, DEAF)
        || Boolean(state.u?.uroleplay?.deaf);
}

function distressSpeciesName(monster) {
    const names = monster.data?.pmnames ?? [];
    return names[monster.female ? 1 : 0] ?? names[2] ?? 'monster';
}

function distressMonnam(monster) {
    const assigned = monster.mextra?.mgivenname;
    if (assigned) {
        const text = String(assigned);
        return text ? text[0].toUpperCase() + text.slice(1) : text;
    }
    const article = monster.mtame ? 'Your' : 'The';
    return `${article} ${distressSpeciesName(monster)}`;
}

function normalizedDistressEnv(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = distressRandom(rawEnv);
    const seeMonster = rawEnv.canSeeMonster
        ?? ((monster) => canSeeMonster(monster, state));
    const spotMonster = rawEnv.canSpotMonster
        ?? ((monster) => canSpotMonster(monster, state));
    const message = rawEnv.message ?? ttyPline;
    const redrawSquare = rawEnv.redrawSquare
        ?? (state === game ? (x, y) => newsym(x, y) : null);
    if (typeof seeMonster !== 'function'
        || typeof spotMonster !== 'function'
        || typeof message !== 'function') {
        throw new TypeError(
            'monster distress perception and message operations must be functions',
        );
    }
    return {
        ...rawEnv,
        state,
        random,
        canSeeMonster: seeMonster,
        canSpotMonster: spotMonster,
        message,
        redrawSquare,
    };
}

function locationDoorMask(location) {
    return location?.flags || location?.doormask || 0;
}

function closedDoorAt(x, y, state) {
    const location = state.level?.at(x, y);
    return location?.typ === DOOR
        && Boolean(locationDoorMask(location) & (D_LOCKED | D_CLOSED));
}

function newchamDistressEnv(normalized) {
    return {
        ...normalized,
        hooks: {
            ...normalized.hooks,
            newsym: normalized.redrawSquare
                ? (x, y) => normalized.redrawSquare(
                    x,
                    y,
                    normalized.state,
                    normalized,
                )
                : normalized.hooks?.newsym,
        },
    };
}

// C ref: mon.c decide_to_shapeshift(). The only naturally live initial-D:1
// shifters are restored Mausoleum vampires with STRAT_WAITFORU, which exit
// without RNG. The remaining empty-inventory chameleon/vampire cases are
// retained for the same source boundary. Relocating an amorphous shifted
// vampire out of a closed door belongs to the general enexto()/rloc_to()
// owner and is rejected before any draw.
export async function decide_to_shapeshift(monster, rawEnv = {}) {
    const normalized = normalizedDistressEnv(rawEnv);
    const { random, state } = normalized;
    const vampireShifter = is_vampshifter(monster);
    if (vampireShifter
        && (monster.mstrategy & STRAT_WAITFORU)) {
        return false;
    }
    if (vampireShifter && monster.data?.mlet !== S_VAMPIRE
        && amorphous(monster.data)
        && closedDoorAt(monster.mx, monster.my, state)) {
        throw new UnsupportedMonsterDistressError(
            'closed-door vampire relocation',
        );
    }

    const shapeEnv = newchamDistressEnv(normalized);
    preflight_newcham_distress(monster, shapeEnv);
    let target = null;
    let change = false;
    const wasFemale = Boolean(monster.female);

    if (!vampireShifter) {
        if (!monster.mspec_used && !random.rn2(6)) {
            change = true;
            monster.mspec_used = 3 + random.rn2(10);
        }
    } else if (monster.data?.mlet !== S_VAMPIRE) {
        if (monster.mhp <= Math.trunc((monster.mhpmax + 5) / 6)
            && random.rn2(4)
            && ismnum(monster.cham)) {
            target = state.mons[monster.cham];
            change = true;
        } else if (monster.data === state.mons?.[PM_FOG_CLOUD]
            && monster.mhp === monster.mhpmax
            && !random.rn2(4)
            && (!normalized.canSeeMonster(monster, normalized)
                || dist2(
                    monster.mx,
                    monster.my,
                    state.u?.ux,
                    state.u?.uy,
                ) > BOLT_LIM * BOLT_LIM)) {
            const mndx = pick_vampire_shape(monster, shapeEnv);
            if (ismnum(mndx)) {
                target = state.mons[mndx];
                change = target !== monster.data;
            }
        }
    } else if (monster.mhp >= Math.trunc(9 * monster.mhpmax / 10)
        && !random.rn2(6)
        && (!normalized.canSeeMonster(monster, normalized)
            || dist2(
                monster.mx,
                monster.my,
                state.u?.ux,
                state.u?.uy,
            ) > BOLT_LIM * BOLT_LIM)) {
        change = true;
    }

    if (!change) return false;
    const changed = await newcham_distress(monster, target, shapeEnv);
    if (changed && is_vampshifter(monster)) {
        const species = monster.data;
        if (!is_male(species) && !is_female(species)
            && !is_neuter(species)) {
            monster.female = wasFemale;
        }
    }
    return changed;
}

// C ref: were.c counter_were().
export function counter_were(mndx) {
    switch (mndx) {
    case PM_WEREWOLF:
        return PM_HUMAN_WEREWOLF;
    case PM_HUMAN_WEREWOLF:
        return PM_WEREWOLF;
    case PM_WEREJACKAL:
        return PM_HUMAN_WEREJACKAL;
    case PM_HUMAN_WEREJACKAL:
        return PM_WEREJACKAL;
    case PM_WERERAT:
        return PM_HUMAN_WERERAT;
    case PM_HUMAN_WERERAT:
        return PM_WERERAT;
    default:
        return -1;
    }
}

function preflightNewWere(monster, normalized) {
    const { state } = normalized;
    if (distressPropertyActive(state, PROT_FROM_SHAPE_CHANGERS)
        && is_human(monster.data)) {
        return null;
    }
    const targetIndex = counter_were(monster.data?.pmidx);
    const target = state.mons?.[targetIndex];
    if (!target || target.pmidx !== targetIndex) {
        throw new UnsupportedMonsterDistressError(
            `unknown lycanthrope ${monster.data?.pmidx}`,
        );
    }
    // No live initial-D:1 generator admits a lycanthrope. Preserve the exact
    // inventory-free transformation for focused boundary tests and fail
    // before feedback/state changes if later gameplay supplies gear or a
    // monster-moving scary-square interaction.
    if (monster.minvent || monster.misc_worn_check
        || monster.mleashed || state.u?.usteed === monster
        || state.u?.ustuck === monster) {
        throw new UnsupportedMonsterDistressError(
            'equipped or attached lycanthrope',
        );
    }
    if (state.context?.mon_moving) {
        throw new UnsupportedMonsterDistressError(
            'monster-moving lycanthrope fear check',
        );
    }
    if (typeof normalized.redrawSquare !== 'function') {
        throw new TypeError(
            'new_were requires a redrawSquare operation',
        );
    }
    return target;
}

// C ref: were.c new_were(), bounded to the inventory-free, non-mon_moving
// distress state. Transformation feedback precedes the data change; wakeup,
// one-quarter lost-HP regeneration, and redraw preserve source order.
export async function new_were(monster, rawEnv = {}) {
    const normalized = normalizedDistressEnv(rawEnv);
    const { state } = normalized;
    const target = preflightNewWere(monster, normalized);
    if (!target) return false;

    if (normalized.canSeeMonster(monster, normalized)
        && !distressHallucinating(state)) {
        const targetName = is_human(target)
            ? 'human'
            : (target.pmnames?.[2] ?? '').slice(4);
        await normalized.message(
            `${distressMonnam(monster)} changes into a ${targetName}.`,
            state,
            normalized,
        );
    }

    set_mon_data(monster, target);
    if (helpless(monster)) {
        monster.msleeping = false;
        monster.mfrozen = 0;
        monster.mcanmove = true;
    }
    const healing = Math.trunc((monster.mhpmax - monster.mhp) / 4);
    monster.mhp = Math.min(monster.mhp + healing, monster.mhpmax);
    normalized.redrawSquare(
        monster.mx,
        monster.my,
        state,
        normalized,
    );
    return true;
}

// C ref: mon.c wake_msg(). The caller owns clearing msleeping after this
// visibility-dependent message has completed.
export async function wake_msg(monster, interesting, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const seeMonster = rawEnv.canSeeMonster
        ?? ((subject) => canSeeMonster(subject, state));
    const message = rawEnv.message ?? ttyPline;
    if (typeof seeMonster !== 'function' || typeof message !== 'function') {
        throw new TypeError(
            'wake_msg requires visibility and message owners',
        );
    }
    if (!monster.msleeping || !seeMonster(monster, rawEnv)) return;

    const alive = monster.data?.pmidx === PM_FLESH_GOLEM
        ? " It's alive!" : '';
    // C uses pline_mon() here (mon.c:4325), which performs set_msg_xy, so the
    // line carries a coordinate prefix under accessiblemsg. new_were()'s
    // sibling at were.c:113 uses plain pline() and must NOT be wrapped.
    await message(
        messageAt(
            `${distressMonnam(monster)} wakes up${interesting ? '!' : '.'}${alive}`,
            monster.mx,
            monster.my,
            state,
        ),
        state,
        rawEnv,
    );
}

// The owner seam setmangry() and wakeup() share. It is not
// requiredDistressOperation() further down, which belongs to mcalcdistress();
// the two guard different call sets and say so, because a name one letter
// apart from another is a misedit waiting to happen.
function requiredMonsterReactionOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(`setmangry()/wakeup() requires ${name}`);
    }
    return operation;
}

// C ref: mon.c setmangry() (4264-4318). Clears the target's wait strategy and,
// for a peaceful monster, turns it hostile. A hostile target -- the ordinary
// melee case -- returns at 4289-4290 with only the strategy write done.
//
// Two arms stop instead of porting. The Elbereth hypocrisy penalty (4267-4285)
// needs attrib.c adjalign() and engrave.c del_engr_at(), and the peaceful arm
// (4296-4317) needs adjalign(), sounds.c growl() and peacefuls_respond(). Both
// keep C's full guard so that no reachable hostile case stops here.
export function setmangry(monster, via_attack, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const { ux, uy } = state.u;

    if (via_attack && sengr_at('Elbereth', ux, uy, true, state)
        && (onscary(ux, uy, monster, state) || monster.mpeaceful)) {
        requiredMonsterReactionOperation(rawEnv, 'unsupported')(
            'attacking from an Elbereth square',
        );
    }

    monster.mstrategy &= ~STRAT_WAITMASK;
    if (!monster.mpeaceful) return;
    if (monster.mtame) return;
    requiredMonsterReactionOperation(rawEnv, 'unsupported')(
        'angering a peaceful monster',
    );
}

// C ref: mon.c wakeup() (4332-4363). Wakes a monster and, when the hero is the
// cause, angers it. uhitm.c missum() and attack_checks() are its melee callers.
//
// Three arms stop. A mimic or disguised Wizard needs display.c seemimic()
// (4339-4343); a target that was asleep needs sounds.c growl() (4353-4354);
// and a peaceful priest or shopkeeper needs ghod_hitsu() or hot_pursuit()
// (4356-4361). The last is unreachable through setmangry() above, which stops
// on every peaceful non-pet first, so only a tame priest or shopkeeper could
// arrive -- but the guard is C's, not a wider one.
export async function wakeup(monster, via_attack, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const was_sleeping = monster.msleeping;

    await wake_msg(monster, via_attack, rawEnv);
    monster.msleeping = 0;
    if (((monster.m_ap_type ?? 0) & M_AP_TYPMASK) !== M_AP_NOTHING) {
        requiredMonsterReactionOperation(rawEnv, 'unsupported')(
            'waking a mimicking monster',
        );
    } else if (state.context?.forcefight && !state.context?.mon_moving
               && monster.mundetected) {
        monster.mundetected = 0;
        newsym(monster.mx, monster.my, state);
    }
    finish_meating(monster);
    if (via_attack) {
        const was_peaceful = monster.mpeaceful;

        if (was_sleeping) {
            requiredMonsterReactionOperation(rawEnv, 'unsupported')(
                'growl from a woken monster',
            );
        }
        setmangry(monster, true, rawEnv);
        if (was_peaceful && (monster.ispriest || monster.isshk)) {
            requiredMonsterReactionOperation(rawEnv, 'unsupported')(
                'angering a peaceful priest or shopkeeper',
            );
        }
    }
}

// C ref: mon.c wake_nearto_core(). Frontend sound is cosmetic; wake messages,
// sleep and wait-strategy state, and buried-zombie disturbance are observable.
export async function wake_nearto(x, y, distance, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const seeMonster = rawEnv.canSeeMonster
        ?? ((monster) => canSeeMonster(monster, state));
    const message = rawEnv.message ?? ttyPline;
    const disturbBuriedZombies = rawEnv.disturbBuriedZombies
        ?? ((nearX, nearY) =>
            disturb_buried_zombies(nearX, nearY, state));
    if (typeof seeMonster !== 'function'
        || typeof message !== 'function') {
        throw new TypeError(
            'wake_nearto requires visibility and message owners',
        );
    }
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.mhp < 1
            || (distance
                && dist2(monster.mx, monster.my, x, y) >= distance)) {
            continue;
        }
        await wake_msg(monster, false, {
            ...rawEnv,
            state,
            canSeeMonster: seeMonster,
            message,
        });
        monster.msleeping = false;
        if (!(monster.data?.geno & G_UNIQ))
            monster.mstrategy &= ~STRAT_WAITMASK;
    }
    await disturbBuriedZombies(x, y, rawEnv);
}

// C ref: mon.c wake_nearby() (4366-4370). It is `wake_nearto_core(u.ux, u.uy,
// u.ulevel * 20, petcall)`, so the noise a kick makes carries further as the
// hero gains experience levels. The petcall parameter is absent for the same
// reason wake_nearto() above lacks it: C's wake_nearto() at 4401-4405 passes
// FALSE too, and that shared specialization is what this port translated. The
// only ported caller, dokick.c dokick() at 1383, also passes FALSE.
export async function wake_nearby(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    return wake_nearto(state.u.ux, state.u.uy, state.u.ulevel * 20,
                       { ...rawEnv, state });
}

// C ref: mon.c seemimic() (4406-4426), which strips a mimic's disguise. C's
// own comment above it says the caller must have checked for mimicry first,
// and the one ported caller -- apply.c use_stethoscope()'s monster arm -- does.
//
// is_blocker_appear is read before the appearance is cleared and used after,
// because the point of the pair is that a mimic which was blocking light as a
// boulder or a door stops blocking it once it is recognized. does_block() is
// asked again afterwards so that a square blocked by something else as well --
// a real boulder lying there, a cloud -- keeps its block.
export function seemimic(mtmp, state = game) {
    const is_blocker_appear = is_lightblocker_mappear(mtmp);

    if (has_mcorpsenm(mtmp))
        freemcorpsenm(mtmp);

    mtmp.m_ap_type = M_AP_NOTHING;
    mtmp.mappearance = 0;

    /*
     *  Discovered mimics don't block light.
     */
    if (is_blocker_appear
        && !does_block(mtmp.mx, mtmp.my, state.level.at(mtmp.mx, mtmp.my),
                       state))
        unblock_point(mtmp.mx, mtmp.my, state);

    newsym(mtmp.mx, mtmp.my);
}

async function wakeNearForWereHowl(x, y, distance, normalized) {
    return wake_nearto(x, y, distance, {
        ...normalized,
        canSeeMonster: (monster) =>
            normalized.canSeeMonster(monster, normalized),
        message: normalized.message,
    });
}

// C ref: were.c were_change(). The chance denominator and draw placement
// retain day/night and full-moon behavior. The optional soundEffect hook owns
// frontend audio only; the screen message and wake_nearto() state are handled
// here for the ordinary initial-level monster list.
export async function were_change(monster, rawEnv = {}) {
    if (!is_were(monster?.data)) return false;
    const normalized = normalizedDistressEnv(rawEnv);
    const { random, state } = normalized;
    if (!state.gw || !Number.isInteger(state.gw.were_changes)) {
        throw new TypeError(
            'were_change requires initialized gw.were_changes',
        );
    }
    const protection = distressPropertyActive(
        state,
        PROT_FROM_SHAPE_CHANGERS,
    );
    const humanForm = is_human(monster.data);
    if (humanForm && protection) return false;

    // Validate the complete possible success path before the chance draw.
    preflightNewWere(monster, normalized);
    let change = false;
    if (humanForm) {
        const fullMoon = state.flags?.moonphase === FULL_MOON;
        const denominator = night(state)
            ? (fullMoon ? 3 : 30)
            : (fullMoon ? 10 : 50);
        change = !random.rn2(denominator);
    } else {
        change = !random.rn2(30) || protection;
    }
    if (!change) return false;

    await new_were(monster, normalized);
    state.gw.were_changes++;
    if (humanForm && !distressDeaf(state)
        && !normalized.canSeeMonster(monster, normalized)) {
        let howler = null;
        if (monster.data?.pmidx === PM_WEREWOLF) howler = 'wolf';
        else if (monster.data?.pmidx === PM_WEREJACKAL) howler = 'jackal';
        if (howler) {
            if (typeof normalized.soundEffect === 'function') {
                await normalized.soundEffect(
                    'canine-howl',
                    50,
                    normalized,
                );
            }
            await normalized.message(
                `You hear a ${howler} howling at the moon.`,
                state,
                normalized,
            );
            await wakeNearForWereHowl(
                monster.mx,
                monster.my,
                4 * 4,
                normalized,
            );
        }
    }
    return true;
}

function requiredDistressOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`mcalcdistress requires a ${name} operation`);
    return operation;
}

// C refs: mon.c mcalcdistress() and m_calcdistress(). Resolve every downstream
// owner for the current list before changing any monster, so an unsupported
// rare shape/liquid branch cannot leave earlier monsters partially advanced.
export async function mcalcdistress(state = game, env = {}) {
    const monsters = [];
    let needsLiquid = false;
    let needsShapechange = false;
    let needsWerechange = false;
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.mhp < 1
            || (monster.mstate ?? MON_FLOOR) !== MON_FLOOR) {
            continue;
        }
        monsters.push(monster);
        if (!monster.data?.mmove) {
            needsLiquid = true;
        }
        needsShapechange ||= ismnum(monster.cham);
        needsWerechange ||= is_were(monster.data);
    }
    // An earlier liquid or shapechange operation can dirty vision before a
    // later immobile monster. Resolve the owner atomically whenever that
    // source check can be reached, then consult the live flag in list order.
    const visionRecalc = needsLiquid
        ? requiredDistressOperation(env, 'visionRecalc') : null;
    const minLiquid = needsLiquid
        ? requiredDistressOperation(env, 'minLiquid') : null;
    const decideToShapeshift = needsShapechange
        ? requiredDistressOperation(env, 'decideToShapeshift') : null;
    const wereChange = needsWerechange
        ? requiredDistressOperation(env, 'wereChange') : null;

    for (const monster of monsters) {
        if (!monster.data?.mmove) {
            if (state.vision_full_recalc)
                await visionRecalc(0, { ...env, state });
            if (await minLiquid(monster, { ...env, state })) continue;
        }
        mon_regen(monster, false, state);
        if (ismnum(monster.cham))
            await decideToShapeshift(monster, { ...env, state });
        if (is_were(monster.data))
            await wereChange(monster, { ...env, state });
        if (monster.mblinded && !--monster.mblinded)
            monster.mcansee = true;
        if (monster.mfrozen && !--monster.mfrozen)
            monster.mcanmove = true;
        if (monster.mfleetim && !--monster.mfleetim)
            monster.mflee = false;
    }
}

// ---------------------------------------------------------------------------
// mon.c's removal lifecycle. A monster the hero kills runs killed() ->
// xkilled() -> mondead() -> m_detach() -> mon_leaving_level(), leaving a
// corpse, perhaps an object, and the experience and alignment it was worth.
//
// mon.c mongone(), m_detach()'s other C caller, stays in js/makemon_create.js
// with its own merged copy of mon_leaving_level() and m_detach() rather than
// calling the pair below, and js/dog.js relmon() holds a third copy of
// mon_leaving_level()'s body for the migration callers, so mon.c is knowingly
// split across three files. The relmon() note names the arms that copy owns.
// The reason for that one is that m_detach() has to be async -- the inventory
// drop at its 2779 goes through steal.c relobj(), which is async because
// steal.c mdrop_obj() can print -- while mongone()'s only caller chain, trap.c
// mk_trap_statue() under mklev.c mktrap() under the level build, is
// synchronous from end to end. Making mongone() async would push `await`
// through all of level generation for a call that never reaches relobj(),
// because mongone() passes due_to_death FALSE.
// ---------------------------------------------------------------------------

function requiredKillOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`the monster kill path requires ${name}`);
    return operation;
}

// Match js/makemon_create.js redrawSquare(): a caller that supplies its own
// newsym owns the redraw, and a synthetic state must not repaint the live map.
function killRedraw(x, y, env) {
    if (typeof env.hooks?.newsym === 'function') env.hooks.newsym(x, y, env);
    else if ((env.state ?? game) === game) newsym(x, y);
}

// C ref: mon.c zombie_maker() (361-380). "return True if mon is capable of
// converting other monsters into zombies". mon.c:3620 passes &gy.youmonst, so
// this answers for the hero as well as for a monster.
export function zombie_maker(mon) {
    const pm = mon.data;

    if (mon.mcan) return false;

    switch (pm?.mlet) {
    case S_ZOMBIE:
        /* "Z-class monsters that aren't actually zombies go here" */
        if (pm.pmidx === PM_GHOUL || pm.pmidx === PM_SKELETON) return false;
        return true;
    case S_LICH:
        /* "all liches will create zombies as well" */
        return true;
    default:
        return false;
    }
}

// C ref: mon.c unstuck() (3437-3467). Releases a monster that is holding the
// hero, and re-arms its holding attack so it cannot grab again immediately.
//
// 3448-3456's swallowed arm is admitted only for mhitu.c expels(), which
// supplies allowSwallowedExpulsion after its own source checks. The ball and
// chain path remains refused because do.c placebc() is not ported; expels()
// owns the display.c docrt() call after this synchronous state update.
// Return protocol: undefined means the monster was not the current holder;
// null means it was released without a deferred cooldown; and `{ mtmp,
// random }` is the deferred cooldown work item used by mhitu.c expels().
export function unstuck(mtmp, state = game, env = {}) {
    if (state.u.ustuck !== mtmp) return;
    const random = env.random ?? { rnd };
    const ptr = mtmp.data;

    if (state.u.uswallow) {
        if (!env.allowSwallowedExpulsion) {
            requiredKillOperation(env, 'unsupported')(
                'releasing an engulfer',
            );
        }
        if (state.uball || state.uchain) {
            requiredKillOperation(env, 'unsupported')(
                'releasing a punished swallowed hero',
            );
        }
        const swallowed = state.u.uswallow;

        /* set_ustuck(NULL) clears u.uswallow and u.uswldtim. */
        set_ustuck(null, state);
        state.gm ??= {};
        state.gm.mswallower = null;
        state.u.ux = mtmp.mx;
        state.u.uy = mtmp.my;
        if (swallowed) {
            // C sets vision_full_recalc before docrt() restores the visible
            // map around the newly freed hero. The caller performs docrt()
            // because it is asynchronous in this port.
            state.vision_full_recalc = 1;
        }
    } else {
        /* "do this first so that docrt()'s botl update is accurate;
           clears u.uswallow as well as setting u.ustuck to Null" */
        set_ustuck(null, state);
    }

    /* "prevent holder/engulfer from immediately re-holding/re-engulfing
       [note: this call to unstuck() might be because u.ustuck has just
       changed shape and doesn't have a holding attack any more, hence
       don't set mspec_used unconditionally]" */
    const needsCooldown = !mtmp.mspec_used
        && (dmgtype(ptr, AD_STCK) || attacktype(ptr, AT_ENGL)
            || attacktype(ptr, AT_HUGS));
    // mhitu.c expels() reaches docrt() from unstuck() before this draw. The
    // synchronous callers keep the ordinary source order; expels() defers
    // only this final assignment while it awaits the redraw.
    if (needsCooldown && !env.deferCooldown)
        mtmp.mspec_used = random.rnd(2);
    return needsCooldown ? { mtmp, random } : null;
}

// C ref: mon.c copy_mextra() (2596-2646). Copies whichever of the eight
// extension records the source carries onto the target, allocating the
// target's mextra on demand. js/corpstat.js save_mtraits() is the caller this
// port was written for.
//
// C assigns each record by value, so the copy shares nothing with the
// original; structuredClone() is that assignment for the plain scalar-and-
// coordinate records this port stores. The one C field that points inside its
// own record is eshk's bill_p, which a clone would leave pointing at the
// source's bill array: `grep -rn "bill_p" js/` finds three writers, and
// js/shk.js:580 is the only one that sets it to anything but null, so a
// shopkeeper billing a customer is the case that would need repair here.
export function copy_mextra(mtmp2, mtmp1) {
    if (!mtmp2 || !mtmp1 || !mtmp1.mextra) return;

    const source = mtmp1.mextra;
    mtmp2.mextra ??= {};
    const target = mtmp2.mextra;
    if (source.mgivenname) target.mgivenname = String(source.mgivenname);
    for (const record of ['egd', 'epri', 'eshk', 'emin', 'edog', 'ebones'])
        if (source[record]) target[record] = structuredClone(source[record]);
    // mextra.h:234 has_mcorpsenm() is the record's presence plus a species
    // that is not NON_PM, so a monster carrying the cleared overlay copies
    // nothing and the target keeps no mcorpsenm at all.
    if (source.mcorpsenm != null && source.mcorpsenm !== NON_PM)
        target.mcorpsenm = source.mcorpsenm;
}

// C ref: mon.c mon_leaving_level() (2695-2730). "'mon' is being removed from
// level due to migration [relmon from keepdogs or migrate_to_level] or due to
// death [m_detach from mondead or mongone]".
//
// 2721-2722's seemimic() stops. A monster whose appearance is neither
// M_AP_NOTHING nor M_AP_MONSTER is showing a false object or piece of
// furniture, and revealing it needs display.c seemimic(), which wakeup() above
// already records as unported.
//
// js/dog.js relmon() and js/makemon_create.js mongone() hold the other two
// copies of this body; the note above relmon() says which arms that copy owns
// and why the three have not been merged.
export function mon_leaving_level(mon, state = game, env = {}) {
    const mx = mon.mx;
    const my = mon.my;
    const onmap = isok(mx, my) && m_at(mx, my, state) === mon;

    /* "to prevent an infinite relobj-flooreffects-hmon-killed loop" */
    mon.mtrapped = 0;
    /* "mon is not swallowing or holding you nor held by you" */
    unstuck(mon, state, env);

    /* "vault guard might be at <0,0>" */
    if (onmap || mon === m_at(0, 0, state)) {
        if (mon.wormno) remove_worm(mon, { ...env, state });
        else remove_monster(mx, my, state);
    }
    if (onmap) {
        /* "for migration; doesn't matter for death" */
        mon.mundetected = 0;
        /* "unhide mimic in case its shape has been blocking line of sight
           or it is accompanying the hero to another level" */
        if (M_AP_TYPE(mon) !== M_AP_NOTHING && M_AP_TYPE(mon) !== M_AP_MONSTER)
            requiredKillOperation(env, 'unsupported')('unhiding a mimic');
        /* "if mon is pinned by a boulder, removing mon lets boulder drop" */
        fill_pit(mx, my, state);
        killRedraw(mx, my, { ...env, state });
    }
    /* "if mon is a remembered target, forget it since it isn't here anymore".
       apply.c use_pole() is the only C writer that stores a monster here and
       none of it is ported, so in production this pointer is null and the
       test cannot hold; js/dog.js relmon() restates the same two lines. */
    if (state.context?.polearm?.hitmon === mon)
        state.context.polearm.hitmon = null;
}

// C ref: mon.c m_detach() (2733-2803). "'mtmp' is going away; remove effects
// of mtmp from other data structures". `mptr` is mtmp->data as it stood before
// the death, which mondead() saves before restoring a chameleon's true form.
//
// Seven arms stop, each the whole of one C branch under exactly C's condition:
//
//   2741-2742  m_unleash(), for a leashed pet.
//   2761-2762  wizdeadorgone(), for the Wizard of Yendor.
//   2768-2776  nemdead(), nemesis_stinks() and leaddead(), the quest arms.
//   2782-2783  thiefdead(), when the dying monster was mid-theft.
//   2784-2785  shkgone(), for a shopkeeper.
//   2788-2789  the endgame's MON_ENDGAME_FREE.
//   2800-2801  dismount_steed(), when the hero was riding what just died.
//
// C's impossible() at 2791-2793 becomes a throw. A monster detached twice
// would be counted twice against iflags.purge_monsters, and dmonsfree() checks
// that count against what it actually unlinks, so limping past it corrupts the
// monster list instead of merely logging.
export async function m_detach(
    mtmp,
    mptr,
    due_to_death,
    state = game,
    env = {},
) {
    const unsupported = requiredKillOperation(env, 'unsupported');
    const mx = mtmp.mx;

    if (mtmp.mleashed) unsupported('detaching a leashed pet');

    if (mx > 0 && emits_light(mptr))
        del_light_source(LS_MONSTER, mtmp, state);

    /*
     * "Take mtmp off map but not out of fmon list yet (dmonsfree does that).
     *
     * Sequencing issue:  mtmp's inventory should be dropped before taking
     * it off the map but if that includes a boulder and mtmp is at a pit
     * location, dropping minvent ought to be deferred until its corpse
     * gets placed.  We compromise and just make sure mtmp is off the map
     * before dropping its former belongings."
     */
    mon_leaving_level(mtmp, state, env);

    mtmp.mhp = 0; /* "simplify some tests: force mhp to 0" */
    /* "death handling for the Wizard needs to take place even if he is
       leaving the dungeon alive rather than dying" */
    if (mtmp.iswiz) unsupported("the Wizard of Yendor's death");
    /* "foodead() might give quest feedback for foo having died; skip that
       if we're called for mongone() rather than mondead()" */
    if (due_to_death) {
        if (mtmp.data.msound === MS_NEMESIS)
            unsupported("the quest nemesis's death");
        if (mtmp.data.msound === MS_LEADER)
            unsupported("the quest leader's death");
        /* "release (drop onto map) all objects carried by mtmp; assumes that
           mtmp->mx,my contains the appropriate location" */
        await relobj(mtmp, 1, false, { ...env, state });
    }

    /* gs.stealmid is 0 while no theft is in progress, and makemon() assigns
       m_id from svc.context.ident, which starts at 1, so the nonzero test
       keeps an unset stealmid from matching a monster with no identity. */
    if (state.gs?.stealmid && mtmp.m_id === state.gs.stealmid)
        unsupported('the death of a monster in mid-theft');
    if (mtmp.isshk) unsupported("a shopkeeper's death");
    if (mtmp.wormno) wormgone(mtmp, state);
    if (In_endgame(state.u.uz)) unsupported('a monster death in the endgame');

    if ((mtmp.mstate ?? 0) & MON_DETACH)
        throw new Error('m_detach: monster is already detached');
    mtmp.mstate |= MON_DETACH;
    state.iflags ??= {};
    state.iflags.purge_monsters = (state.iflags.purge_monsters ?? 0) + 1;

    /* "hero is thrown from his steed when it dies or gets genocided" */
    if (mtmp === state.u.usteed) unsupported("the death of the hero's steed");
}

// C ref: mon.c mlifesaver() (2825-2836). "find the worn amulet of life saving
// which will save a monster".
function mlifesaver(mtmp, state) {
    if (!nonliving(mtmp.data) || is_vampshifter(mtmp)) {
        const otmp = which_armor(mtmp, W_AMUL, state);

        if (otmp && otmp.otyp === AMULET_OF_LIFE_SAVING) return otmp;
    }
    return null;
}

// C ref: mon.c lifesaved_monster() (2838-2884). The whole body stops: using up
// the amulet needs mon.c m_useup(), re-equipping needs check_gear_next_turn()'s
// counterpart in worn.c m_dowear(), and a life-saved pet needs dog.c
// wary_dog(). The guard is C's `if (lifesave)`, so a monster wearing no amulet
// -- every monster this port generates -- falls through exactly as C does.
function lifesaved_monster(mtmp, state, env) {
    if (mlifesaver(mtmp, state)) {
        requiredKillOperation(env, 'unsupported')(
            'a monster saved by an amulet of life saving',
        );
    }
}

// C ref: mon.c logdeadmon() (2996-3076). "when a mon has died, maybe record an
// achievement or issue livelog message". Every branch writes only to the live
// log or the achievement list. pline.c livelog_printf() appends to a file this
// port cannot write, the treatment js/exper.js records at its pluslvl() head,
// and record_achievement() is reached only for the first Medusa.
//
// Both of C's guards are still evaluated, so a kill that would have been
// logged stops rather than silently skipping the record; an ordinary monster
// fails both and returns having done nothing.
function logdeadmon(mtmp, mndx, state, env) {
    const howmany = state.svm.mvitals[mndx].died;

    if (mndx === PM_MEDUSA && howmany === 1) {
        requiredKillOperation(env, 'unsupported')('the Medusa achievement');
    } else if ((unique_corpstat(mtmp.data)
                && (mndx !== PM_HIGH_CLERIC || !mtmp.mrevived))
               || (mtmp.isshk && !mtmp.mrevived)) {
        requiredKillOperation(env, 'unsupported')(
            'the live-log line for a unique or shopkeeper kill',
        );
    }
}

// C ref: mon.c mondead() (3080-3177). "monster 'mtmp' has died; maybe
// life-save, otherwise unshapeshift and update vanquished stats and update
// map". The ordinary path draws nothing: both of its random-number calls are
// species-gated, the rn2(10) at 3104 to a steam vortex and the rnd(5) at 3149
// to a Keystone Kop.
//
// Six arms stop:
//
//   3096-3097  vamprises(), when a shape-shifted vampire reverts rather than
//              dying. The guard is is_vampshifter() alone, which is the outer
//              half of C's `&&` and so the condition for reaching vamprises().
//   3100-3101  the sad feeling for a lost pet. monkilled() below is the flag's
//              only writer here, so this fires for a pet that dies out of
//              sight; the reader clears it either way, as C does.
//   3103-3104  create_gas_cloud(), the steam vortex's parting cloud.
//   3108-3109  grddead(), which parks a dead vault guard at <0,0>.
//   3147-3166  the Kop resurrection, whose rnd(5) needs makemon() at a
//              staircase and again at a random spot.
//   3170-3171  unmap_object(), for a monster on a remembered invisible glyph;
//              js/display.js records that function as unported.
//
// gd.disintegested and gv.vamp_rise_msg, which xkilled() sets around this
// call, are read only by vamprises() and by the life-saved return at 3558.
// Both stop above every reader, so neither flag is carried.
export async function mondead(mtmp, state = game, env = {}) {
    const unsupported = requiredKillOperation(env, 'unsupported');

    /* "potential pet message; always clear global flag" */
    const be_sad = state.iflags?.sad_feeling;
    state.iflags ??= {};
    state.iflags.sad_feeling = false;

    mtmp.mhp = 0; /* "in case caller hasn't done this" */
    lifesaved_monster(mtmp, state, env);
    if (mtmp.mhp >= 1) return; /* !DEADMONSTER() */

    /* "vampire in bat/fog/wolf form reverts to vampire instead of dying" */
    if (is_vampshifter(mtmp)) unsupported('a shape-shifted vampire reverting');

    if (be_sad) unsupported('the sad feeling for a lost pet');

    if (mtmp.data === state.mons[PM_STEAM_VORTEX])
        unsupported("a steam vortex's parting gas cloud");

    /* "dead vault guard is actually kept at coordinate <0,0> until his
       temporary corridor to/from the vault has been removed; need to do this
       after life-saving and before m_detach()" */
    if (mtmp.isgd) unsupported("a vault guard's death");

    const mptr = mtmp.data; /* "save this for m_detach()" */
    /* "restore chameleon, lycanthropes to true form at death" */
    if (ismnum(mtmp.cham)) {
        set_mon_data(mtmp, state.mons[mtmp.cham], state);
        mtmp.cham = NON_PM;
    } else if (mtmp.data === state.mons[PM_WEREJACKAL]) {
        set_mon_data(mtmp, state.mons[PM_HUMAN_WEREJACKAL], state);
    } else if (mtmp.data === state.mons[PM_WEREWOLF]) {
        set_mon_data(mtmp, state.mons[PM_HUMAN_WEREWOLF], state);
    } else if (mtmp.data === state.mons[PM_WERERAT]) {
        set_mon_data(mtmp, state.mons[PM_HUMAN_WERERAT], state);
    }

    /*
     * "svm.mvitals[].died does double duty as total number of dead monsters
     * and as experience factor for the player killing more monsters."
     */
    const mndx = monsndx(mtmp.data);
    if (state.svm.mvitals[mndx].died < 255) state.svm.mvitals[mndx].died++;

    /* "if it's a (possibly polymorphed) quest leader, mark him as dead".
       leader_m_id is 0 until the leader is created; see the note on
       gs.stealmid in m_detach() above for why the nonzero test is needed. */
    if (state.svq?.quest_status?.leader_m_id
        && mtmp.m_id === state.svq.quest_status.leader_m_id)
        state.svq.quest_status.leader_is_dead = true;
    /* "if the mail daemon dies, no more mail delivery.  -3."
       include/global.h:430 defines MAIL_STRUCTURES unconditionally, so this
       arm is compiled even though MAIL is not and no daemon is generated. */
    if (mndx === PM_MAIL_DAEMON)
        state.svm.mvitals[mndx].mvflags |= G_GENOD;

    if (mtmp.data.mlet === S_KOP) unsupported('a Keystone Kop coming back');

    /* "achievement and/or livelog" */
    logdeadmon(mtmp, mndx, state, env);

    /* mon.c:3170-3171. The marker goes before m_detach()'s newsym() repaints
       the square, so a monster that dies where the hero was only told
       something invisible stood leaves no stray 'I' behind. */
    if (glyph_is_invisible(
        state.level.at(mtmp.mx, mtmp.my).remembered_glyph?.glyph,
    )) {
        /* unmap_object() rewrites this square's map memory, and the
           once-per-turn planning clone shares the live game's cells, so a dry
           run reaching this line would forget the marker in the running game.
           killRedraw() above answers the same question by skipping, which
           works for a repaint because a repaint cannot refuse; this one
           refuses instead, because unmap_object() refuses an engraved square
           and skipping would hide that refusal from the pass that exists to
           find it.

           The plan cannot reach this line for a marker it wrote itself:
           js/mhitm.js pre_mm_attack() marks through a seam the plan binds to a
           no-op. What is left is a marker an earlier live turn left behind,
           which no recorded case produces. */
        if (env.planning)
            unsupported('forgetting a remembered invisible monster on a plan');
        unmap_object(mtmp.mx, mtmp.my, state);
    }

    /* "remove 'mtmp' from play; it will stay on the fmon list until end of
       current move, then dmonsfree() will get rid of it" */
    await m_detach(mtmp, mptr, true, state, env);
}

// C ref: mon.c LEVEL_SPECIFIC_NOCORPSE() (44-47), the macro xkilled() tests at
// 3574 and corpse_chance() tests again at 3241. Its rn2(3) is drawn only in a
// graveyard and only for undead; an ordinary level short-circuits on
// level.flags.graveyard before reaching it.
function LEVEL_SPECIFIC_NOCORPSE(mdat, state, random) {
    return on_level(state.u?.uz, state.rogue_level)
        || !state.level.flags.deathdrops
        || Boolean(state.level.flags.graveyard && is_undead(mdat)
                   && random.rn2(3));
}

// C ref: mon.c corpse_chance() (3180-3249). "TRUE if corpse might be dropped,
// magr may die if mon was swallowed".
//
// Two arms stop, each above the first draw or message on its path:
//
//   3193-3197  Vlad and the liches, whose bodies crumble into dust instead.
//   3200-3232  AT_BOOM, the gas spore's death explosion. The refusal is at the
//              top of the matching attack slot, so neither the d() rolled for
//              its damage nor mon_explodes() runs first.
//
// The closing formula at 3247 is what decides an ordinary kill, and it splits
// species that look alike: a sewer rat is G_FREQ 1 and verysmall, so tmp is 4;
// a goblin is G_FREQ 2, which fails `< 2`, and MZ_SMALL, so tmp is 2. Read the
// species record rather than guessing from size.
export function corpse_chance(
    mon,
    magr,
    was_swallowed,
    state = game,
    env = {},
) {
    const unsupported = requiredKillOperation(env, 'unsupported');
    const random = env.random ?? { d, rn2 };
    const mdat = mon.data;
    let i;
    let tmp;

    /* "for gas spore boom" */
    if (!magr && state.gm?.mswallower
        && attacktype(state.gm.mswallower.data, AT_ENGL)) {
        magr = state.gm.mswallower;
        was_swallowed = true;
    }

    if (mdat === state.mons[PM_VLAD_THE_IMPALER] || mdat.mlet === S_LICH)
        unsupported('a lich body crumbling into dust');

    /* "Gas spores always explode upon death" */
    for (i = 0; i < NATTK; i++) {
        if (mdat.mattk[i].aatyp === AT_BOOM)
            unsupported('a gas spore exploding on death');
    }

    /* "must duplicate this below check in xkilled() since it results in
        creating no objects as well as no corpse" */
    if (LEVEL_SPECIFIC_NOCORPSE(mdat, state, random)) return false;

    if (((bigmonst(mdat) || mdat === state.mons[PM_LIZARD]) && !mon.mcloned)
        || is_golem(mdat) || is_mplayer(mdat) || is_rider(mdat) || mon.isshk)
        return true;
    tmp = 2 + ((mdat.geno & G_FREQ) < 2 ? 1 : 0) + (verysmall(mdat) ? 1 : 0);
    return !random.rn2(tmp);
}

// C ref: mon.c KEEPTRAITS() (549-556), "for deciding whether corpse will carry
// along full monster data". A TRUE result sends the monster itself into
// mkcorpstat(), which then calls mkobj.c save_mtraits() on it; a pet is the
// common case, because every tame monster answers TRUE here.
function KEEPTRAITS(mon, state) {
    return Boolean(mon.isshk) || Boolean(mon.mtame)
        || unique_corpstat(mon.data)
        || is_reviver(mon.data)
        /* "normally quest leader will be unique, but he or she might have
            been polymorphed" */
        || Boolean(state.svq?.quest_status?.leader_m_id
                   && mon.m_id === state.svq.quest_status.leader_m_id)
        /* "special cancellation handling for these" */
        || dmgtype(mon.data, AD_SEDU) || dmgtype(mon.data, AD_SSEX);
}

// C ref: do_name.c safe_oname() (94-100). "" for an unnamed object, which is
// the only value the caller below can hand artifact_exists().
function safe_oname(obj) {
    return has_oname(obj) ? obj.oextra.oname : '';
}

// C ref: mon.c make_corpse() (563-941). "Creates a monster corpse, a 'special'
// corpse, or nothing if it doesn't leave corpses."
//
// The switch at 581 is 361 of those 378 lines and most of it is not compiled:
// include/patchlevel.h:33 sets NH_DEVEL_STATUS to NH_STATUS_RELEASED, so the
// 154-line PM_ roster at 686-844 is excluded and its `#else default:` at 846
// is what every unlisted species reaches, falling through to the `default_1`
// label at 848. What survives is that label, the mummy and zombie group at
// 622-649, which is ported, and six groups that stop at the top of their own
// case, above the first draw or object each would make:
//
//   582-597  dragon scales, and the rn2(3) or rn2(20) that decides them.
//   598-611  a unicorn horn, and the rn2(2) that crumbles a regrown one.
//   612-614  the long worm's tooth.
//   615-621  vampires, whose five lines are the mummy and zombie group's
//            exactly. It is left refusing because no case has reached it:
//            mondead()'s is_vampshifter() stop sits above this call for a
//            shifted vampire, and no recorded game kills a true one.
//   646-731  the nine golem bodies, seven of which roll for their pieces.
//   732-746  the four puddings, which need obj_meld() and obj_nexto().
//
// 747-748's NON_PM, LEAVESTATUE and NUMMONS cases break out of the switch to
// the closing `if (!obj) return 0;` and are unreachable here: monsndx()
// answers with a real species for every monster on the level chain.
function make_corpse(mtmp, corpseflags, state, env) {
    const unsupported = requiredKillOperation(env, 'unsupported');
    const mdat = mtmp.data;
    const x = mtmp.mx;
    const y = mtmp.my;
    const mndx = monsndx(mdat);
    let corpstatflags = corpseflags;
    const burythem = (corpstatflags & CORPSTAT_BURIED) !== 0;

    // 856-862's bury_an_obj() and the "corpse ends up buried" line xkilled()
    // prints for it. xkilled():3521 is the only writer of CORPSTAT_BURIED, and
    // the monster whose pack sets it stops earlier, when m_detach()'s relobj()
    // drops that boulder, so this guard is C's flag rather than a live stop.
    if (burythem) unsupported('a corpse buried in a pit');

    if (mtmp.female) corpstatflags |= CORPSTAT_FEMALE;
    else if (!is_neuter(mtmp.data)) corpstatflags |= CORPSTAT_MALE;

    // C's `default_1:` label sits inside the switch, so every arm that
    // `break`s -- the vampires, the mummies and zombies, the golems and the
    // puddings -- skips the G_NOCORPSE test and the general mkcorpstat() under
    // that label and lands on the closing `if (!obj) return 0;`. All of those
    // arms but the mummies and zombies still refuse, so this is the only value
    // that can carry a corpse past the switch.
    let undeadCorpse = null;

    switch (mndx) {
    case PM_GRAY_DRAGON:
    case PM_GOLD_DRAGON:
    case PM_SILVER_DRAGON:
    case PM_RED_DRAGON:
    case PM_ORANGE_DRAGON:
    case PM_WHITE_DRAGON:
    case PM_BLACK_DRAGON:
    case PM_BLUE_DRAGON:
    case PM_GREEN_DRAGON:
    case PM_YELLOW_DRAGON:
        unsupported('dragon scales from a dead dragon');
        break;
    case PM_WHITE_UNICORN:
    case PM_GRAY_UNICORN:
    case PM_BLACK_UNICORN:
        unsupported('a horn from a dead unicorn');
        break;
    case PM_LONG_WORM:
        unsupported("a dead long worm's tooth");
        break;
    case PM_VAMPIRE:
    case PM_VAMPIRE_LEADER:
        unsupported("a dead vampire's old corpse");
        break;
    case PM_KOBOLD_MUMMY:
    case PM_DWARF_MUMMY:
    case PM_GNOME_MUMMY:
    case PM_ORC_MUMMY:
    case PM_ELF_MUMMY:
    case PM_HUMAN_MUMMY:
    case PM_GIANT_MUMMY:
    case PM_ETTIN_MUMMY:
    case PM_KOBOLD_ZOMBIE:
    case PM_DWARF_ZOMBIE:
    case PM_GNOME_ZOMBIE:
    case PM_ORC_ZOMBIE:
    case PM_ELF_ZOMBIE:
    case PM_HUMAN_ZOMBIE:
    case PM_GIANT_ZOMBIE:
    case PM_ETTIN_ZOMBIE:
        /* 622-649. The body a zombie or a mummy leaves is the living
           creature's, and C's comment calls it an *OLD* corpse: subtracting
           TAINT_AGE + 1 from the age mksobj() just stamped puts it one turn
           past the point where eating it makes the hero ill. C's own comment
           at 620 says to "include mtmp in the mkcorpstat() call", so every
           corpse from this group carries save_mtraits()' copy of the monster,
           where default_1 below passes it only for KEEPTRAITS(). */
        corpstatflags |= CORPSTAT_INIT;
        undeadCorpse = mkcorpstat(
            CORPSE,
            mtmp,
            state.mons[undead_to_corpse(mndx)],
            x,
            y,
            corpstatflags,
            { ...env, state },
        );
        undeadCorpse.age -= (TAINT_AGE + 1);
        break;
    case PM_IRON_GOLEM:
    case PM_GLASS_GOLEM:
    case PM_CLAY_GOLEM:
    case PM_STONE_GOLEM:
    case PM_WOOD_GOLEM:
    case PM_ROPE_GOLEM:
    case PM_LEATHER_GOLEM:
    case PM_GOLD_GOLEM:
    case PM_PAPER_GOLEM:
        unsupported("the pieces of a dead golem");
        break;
    case PM_GRAY_OOZE:
    case PM_BROWN_PUDDING:
    case PM_GREEN_SLIME:
    case PM_BLACK_PUDDING:
        unsupported('a glob left by a dead pudding');
        break;
    default:
        break;
    }

    /* default_1: */
    let obj = undeadCorpse;
    if (!obj) {
        if (state.svm.mvitals[mndx].mvflags & G_NOCORPSE) return null;
        corpstatflags |= CORPSTAT_INIT;
        /* "preserve the unique traits of some creatures" */
        obj = mkcorpstat(
            CORPSE,
            KEEPTRAITS(mtmp, state) ? mtmp : null,
            mdat,
            x,
            y,
            corpstatflags,
            { ...env, state },
        );
    }

    /* "All special cases should precede the G_NOCORPSE check" */
    if (!obj) return null;

    /* "if polymorph or undead turning has killed this monster, prevent the
        same attack beam from hitting its corpse" */
    if (state.context?.bypasses)
        unsupported('a corpse left inside a polymorph or undead-turning beam');

    if (has_mgivenname(mtmp)) unsupported("a named monster's corpse");

    /*  "Avoid 'It was hidden under a green mold corpse!' during Blind combat.
     *  An unseen monster referred to as 'it' could be killed and leave a
     *  corpse." */
    if (heroIsBlind(state) && !sensesMonster(mtmp, state)) clear_dknown(obj);

    /* "'obj' remains valid if stacking happens" */
    stackobj(obj, objectGenerationEnv({ ...env, state }));
    killRedraw(x, y, { ...env, state });
    /* "in case the corpse was placed at a different spot from where the
        monster was (not expected to happen)" */
    if (obj.ox !== x || obj.oy !== y)
        killRedraw(obj.ox, obj.oy, { ...env, state });
    return obj;
}

// C ref: mon.c mondied() (3251-3262). "drop (perhaps) a cadaver and remove
// monster". Nothing stops here: every arm of the body is C's, and the two
// callees that can stop -- mondead() and make_corpse() -- carry their own
// refusals. C gives it external linkage for dogmove.c, do.c and monmove.c;
// none of those callers is ported, so it stays file-private beside
// make_corpse() until one of them arrives.
//
// C's comment on the corpse test is literally true of this port too:
// mon_leaving_level() takes the monster off the map without clearing mx and
// my, and mon.c:2712-2714 says in so many words that it must not clear them,
// so corpse_chance() and make_corpse() still read the square it died on.
async function mondied(mdef, state = game, env = {}) {
    await mondead(mdef, state, env);
    if (mdef.mhp >= 1) return; /* !DEADMONSTER(): "lifesaved" */

    /* "this assumes that the dead monster's map coordinates remain
       accurate" */
    if (corpse_chance(mdef, null, false, state, env)
        && (accessible(mdef.mx, mdef.my, state)
            || is_pool(mdef.mx, mdef.my, state)))
        make_corpse(mdef, CORPSTAT_NONE, state, env);
}

// C ref: mon.c monkilled() (3376-3418). "another monster has killed the
// monster mdef". This is the kill path for a death the hero did not deal;
// xkilled() is the one that did, and the two share mondead() below.
//
// C's `fltxt` is a pointer, and its `if (fltxt && ...)` tests the pointer
// rather than the text: trap.c thitm() passes the empty string, which is a
// live pointer and so takes the message arm with nothing between "killed" and
// the exclamation mark. `fltxt != null` is that pointer test; `fltxt` on its
// own would be the later `*fltxt` one and would silence the trap's message.
//
// C stores the disintegration test in gd.disintegested, a global, but its only
// reader outside this function is vamprises() at mon.c:2906, and mondead()
// refuses every shape-shifted vampire above that call. mondead()'s own note
// records the same finding for the copy xkilled() writes, so the value stays a
// local here rather than becoming a second place to keep it.
//
// Two arms stop:
//
//   3384       worm_known(), for a long worm whose visible segment decides
//              whether the message is printed. The refusal precedes the
//              message and every write below it.
//   3414-3415  the "May <pet> rest in peace." farewell, which needs
//              do_name.c noit_mon_nam(). Its guard is C's own `rxt`, so an
//              ordinary pet -- one killed by neither fire, rust nor decay --
//              passes through without it.
export async function monkilled(mdef, fltxt, how, state = game, env = {}) {
    const unsupported = requiredKillOperation(env, 'unsupported');
    const message = requiredKillOperation(env, 'message');
    const mptr = mdef.data;

    if (fltxt != null && mdef.wormno)
        unsupported("a long worm's death by another monster");

    if (fltxt != null && cansee(mdef.mx, mdef.my, state)) {
        await message(
            messageAt(
                `${capitalizedMonsterName(mdef, state)} is`
                + ` ${nonliving(mptr) ? 'destroyed' : 'killed'}`
                + `${fltxt ? ' by the ' : ''}${fltxt}!`,
                mdef.mx,
                mdef.my,
                state,
            ),
            state,
        );
    } else {
        /* "sad feeling is deferred until after potential life-saving" */
        state.iflags ??= {};
        state.iflags.sad_feeling = Boolean(mdef.mtame);
    }

    /* "no corpse if digested or disintegrated or flammable golem burnt up" */
    const disintegested = how === AD_DGST || how === -AD_RBRE
        || (how === AD_FIRE && completelyburns(mptr));
    if (disintegested)
        await mondead(mdef, state, env); /* "never leaves a corpse" */
    else
        await mondied(mdef, state, env); /* "and maybe leaves a corpse" */

    if (mdef.mhp >= 1) return; /* !DEADMONSTER(): "life-saved" */

    /* "extra message if pet golem is completely destroyed" */
    if (mdef.mtame) {
        const rxt = (how === AD_FIRE && completelyburns(mptr)) ? 'roast'
            : (how === AD_RUST && completelyrusts(mptr)) ? 'rust'
                : (how === AD_DCAY && completelyrots(mptr)) ? 'rot'
                    : null;
        if (rxt) unsupported('the farewell for a destroyed pet golem');
    }
}

// C ref: mon.c killed() (3469-3473).
export async function killed(mtmp, state = game, env = {}) {
    await xkilled(mtmp, XKILL_GIVEMSG, state, env);
}

// C ref: mon.c xkilled() (3476-3740). "the player has killed the monster
// mtmp". `xkill_flags` is 1 to suppress the message, 2 the corpse and 4 the
// conduct; killed() passes 0 and is the only caller wired here.
//
// Two random-number calls sit between the kill message and experience(), and
// an ordinary kill makes both: the `!rn2(6)` treasure drop at 3587 and
// corpse_chance()'s closing rn2(tmp) at 3248. That is why this function cannot
// be ported in halves -- stopping short of either desyncs the stream for the
// rest of the turn.
//
// 3514-3522 is ported rather than stopped, and a trapped monster in a bare
// pit is killed like any other: C sets neither flag there. A boulder resting
// on the square sets `nocorpse`, which is the flag XKILL_NOCORPSE already
// sets, and one in the monster's pack sets `burycorpse`, which selects
// make_corpse()'s CORPSTAT_BURIED. Neither flag can be read today, because
// mondead() stops on both states first: mon_leaving_level() hands the boulder
// on the square to trap.c fill_pit(), which refuses to settle it into the
// pit, and m_detach()'s relobj() hands the carried one to do.c flooreffects(),
// which refuses a boulder landing on the floor. Both stops sit above the
// treasure draw. C's "corpse ends up buried" line at 3625-3628 is below them
// as well as below make_corpse()'s own stop, so it has no counterpart here.
//
// Ten arms stop, each guarded by exactly C's condition and each placed above
// the first draw, message or object on its path:
//
//   3524-3526  EDOG()->killed_by_u, for a pet that now knows its killer.
//   3528-3541  mpickobj(), handing a thrown missile to the engulfer it killed.
//   3546-3547  monstone(), for a monster killed by petrification, and with it
//              the gs.stoned cleanup at 3569-3572.
//   3552-3561  the life-saved return and its "Maybe not..." message.
//   3563-3564  the sad feeling for a pet killed out of sight.
//   3577-3581  the mail daemon's scroll of mail. include/global.h:430 defines
//              MAIL_STRUCTURES unconditionally, so the arm is compiled.
//   3632-3640  spoteffects(), which expels the hero from a dead engulfer.
//   3648-3663  the murder punishment, which needs the intrinsic-telepathy
//              clear at 3658 and display.c see_monsters().
//   3666-3669  the guilt for killing a co-aligned unicorn.
//   3677-3722  the quest leader, nemesis, guardian, priest, tame and peaceful
//              alignment arms, every one of which reaches attrib.c adjalign()
//              with a negative argument.
//
// C's `goto cleanup` at 3571 and 3575 jumps over the corpse-and-drop half, so
// that half becomes the `if (!skipCorpseAndDrops)` block below and the cleanup
// label's own work runs either way. The newsym() at 3642 is jumped over too,
// so it belongs inside the guard rather than to cleanup.
export async function xkilled(mtmp, xkill_flags, state = game, env = {}) {
    const unsupported = requiredKillOperation(env, 'unsupported');
    const message = requiredKillOperation(env, 'message');
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    const x = mtmp.mx;
    const y = mtmp.my;
    const wasinside = engulfing_u(mtmp, state);
    const nomsg = (xkill_flags & XKILL_NOMSG) !== 0;
    let nocorpse = (xkill_flags & XKILL_NOCORPSE) !== 0;
    const noconduct = (xkill_flags & XKILL_NOCONDUCT) !== 0;
    let burycorpse = false;

    /* "potential pet message; always clear global flag" */
    const be_sad = state.iflags?.sad_feeling;
    state.iflags ??= {};
    state.iflags.sad_feeling = false;

    mtmp.mhp = 0; /* "caller will usually have already done this" */
    if (!noconduct) { /* "KMH, conduct" */
        /* C's livelog_printf() for the first kill writes a file this port
           cannot write; js/eat.js:1479 records the same treatment. */
        state.u.uconduct.killer++;
    }
    if (!nomsg) {
        if (mtmp.mtame) unsupported('the kill message for a pet');
        await message(
            `You ${nonliving(mtmp.data) ? 'destroy' : 'kill'} `
            + `${!(wasinside || canSpotMonster(mtmp, state))
                ? 'it' : monsterCommonName(mtmp, state)}!`,
            state,
        );
    }

    if (mtmp.mtrapped) {
        const t = t_at(x, y, state);
        if (t && is_pit(t.ttyp)) {
            /* "Prevent corpses/treasure being created 'on top' of boulder
                that is about to fall in.  This is out of order, but cannot be
                helped unless this whole routine is rearranged." */
            if (sobj_at(BOULDER, x, y, state)) nocorpse = true;
            if (m_carrying(mtmp, BOULDER, state)) burycorpse = true;
        }
    }

    /* "your pet knows who just killed it...watch out" */
    if (mtmp.mtame && !mtmp.isminion)
        unsupported('a pet that learns who killed it');

    if (wasinside && state.gt?.thrownobj && state.gt.thrownobj !== state.uball
        /* "don't give to mon if missile is going to be destroyed" */
        && state.gt.thrownobj.oclass !== POTION_CLASS
        /* "don't give to mon if missile is going to return to hero" */
        && state.gt.thrownobj !== state.iflags?.returning_missile) {
        unsupported('a thrown missile handed to the engulfer it killed');
    }

    /* "dispose of monster and make cadaver" */
    if (state.gs?.stoned) unsupported('a monster killed by petrification');
    await mondead(mtmp, state, env);

    if (mtmp.mhp >= 1) /* !DEADMONSTER(): "monster lifesaved" */
        unsupported('a monster that survived being killed');

    if (be_sad) unsupported('the sad feeling for a lost pet');

    const mdat = mtmp.data; /* "note: mondead can change mtmp->data" */
    const mndx = monsndx(mdat);

    const skipCorpseAndDrops = nocorpse
        || LEVEL_SPECIFIC_NOCORPSE(mdat, state, random);
    if (!skipCorpseAndDrops) {
        if (mdat === state.mons[PM_MAIL_DAEMON])
            unsupported("the mail daemon's scroll of mail");
        if (accessible(x, y, state) || is_pool(x, y, state)) {
            /* "illogical but traditional 'treasure drop'" */
            if (!random.rn2(6)
                && !(state.svm.mvitals[mndx].mvflags & G_NOCORPSE)
                /* "no extra item from swallower or steed" */
                && (x !== state.u.ux || y !== state.u.uy)
                /* "no extra item from kops--too easy to abuse" */
                && mdat.mlet !== S_KOP
                /* "no items from cloned monsters" */
                && !mtmp.mcloned) {
                const dropEnv = { ...env, state, random };
                const otmp = mkobj(RANDOM_CLASS, true,
                                   objectGenerationEnv(dropEnv));
                /* "don't create large objects from small monsters" */
                const otyp = otmp.otyp;
                if (otmp.oclass === FOOD_CLASS
                    && !(mdat.mflags2 & M2_COLLECT)
                    && !otmp.oartifact) {
                    /* "don't drop newly created permafood from kills, unless
                        the monster collects food; it creates too much
                        nutrition in the late game" */
                    delobj(otmp, dropEnv);
                } else if (mdat.msize < MZ_MEDIUM /* MZ_HUMAN */
                           && otyp !== FIGURINE
                           /* "oc_big is also oc_bimanual and oc_bulky" */
                           && (otmp.owt > 30
                               || objectType(otyp, state).oc_big)) {
                    if (otmp.oartifact) { /* "un-create" */
                        artifact_exists(otmp, safe_oname(otmp), false,
                                        ONAME_NO_FLAGS, state);
                    }
                    delobj(otmp, dropEnv);
                } else if (!flooreffects(otmp, x, y, nomsg ? '' : 'fall',
                                         dropEnv)) {
                    place_object(otmp, x, y, dropEnv);
                    stackobj(otmp, objectGenerationEnv(dropEnv));
                }
            }
            /* "corpse--none if hero was inside the monster" */
            if (!wasinside && corpse_chance(mtmp, null, false, state, env)) {
                /* gz.zombify decides whether mkobj.c start_corpse_timeout()
                   turns the corpse into a zombie; js/corpstat.js and
                   js/timeout.js read it and this is its only writer. */
                state.gz ??= {};
                state.gz.zombify = Boolean(
                    !state.gt?.thrownobj && !state.gs?.stoned && !state.uwep
                    && zombie_maker(state.youmonst)
                    && zombie_form(mtmp.data) !== NON_PM,
                );
                make_corpse(mtmp,
                            burycorpse ? CORPSTAT_BURIED : CORPSTAT_NONE,
                            state, env);
                state.gz.zombify = false; /* "reset" */
            }
        }

        if (wasinside) unsupported('being expelled from a dead engulfer');
        /* "monster is gone, corpse or other object might now be visible" */
        killRedraw(x, y, { ...env, state });
    }

    /* cleanup: "Punish bad behavior." */
    if (is_human(mdat)
        && (!always_hostile(mdat) && mtmp.malign <= 0)
        /* "exclude role monsters" */
        && (mndx < PM_ARCHEOLOGIST || mndx > PM_WIZARD)
        /* "exclude plain 'human', which isn't flagged as always hostile" */
        && mndx !== PM_HUMAN
        /* "only applicable if hero is lawful or neutral" */
        && state.u.ualign.type !== A_CHAOTIC) {
        unsupported('the murder penalty for killing a human');
    }
    if ((mtmp.mpeaceful && !random.rn2(2)) || mtmp.mtame)
        change_luck(-1, state);
    if (is_unicorn(mdat)
        && Math.sign(state.u.ualign.type) === Math.sign(mdat.maligntyp)) {
        unsupported('the guilt for killing a co-aligned unicorn');
    }

    /* "give experience points" */
    const tmp = experience(mtmp, state.svm.mvitals[mndx].died, state);
    more_experienced(tmp, 0, state);
    await newexplevel(state, env); /* "will decide if you go up" */

    /* "adjust alignment points" */
    if (state.svq?.quest_status?.leader_m_id
        && mtmp.m_id === state.svq.quest_status.leader_m_id)
        unsupported('killing the quest leader');
    else if (mdat.msound === MS_NEMESIS)
        unsupported('killing the quest nemesis');
    else if (mdat.msound === MS_GUARDIAN)
        unsupported('killing a quest guardian');
    else if (mtmp.ispriest) unsupported('killing a priest');
    else if (mtmp.mtame) unsupported('killing a pet');
    else if (mtmp.mpeaceful) unsupported('killing a peaceful monster');

    /* "malign was already adjusted for u.ualign.type and randomization" */
    adjalign(mtmp.malign, state);
}

// Hiding paths outside the ordinary eel action below are not translated.
// js/cmd.js failClosedCommandRefusals() lists this class so a segment keeps the
// frames it already matched when one of those paths is reached.
export class UnsupportedHideError extends Error {
    constructor(what) {
        super(`hiding reached an unported branch: ${what}`);
        this.name = 'UnsupportedHideError';
    }
}

// C ref: mon.c:4670-4672, restrap()'s trapped term,
// `(mtmp->mtrapped && (t = t_at(mtmp->mx, mtmp->my)) != 0 && !is_pit(t->ttyp))`.
// It is spelled as a function because C assigns inside the condition; t_at() is
// a pure lookup, so the only thing that matters is that an untrapped monster
// and a monster in a pit both answer false.
function trappedOutsideAPit(monster, state) {
    if (!monster.mtrapped) return false;
    const trap = t_at(monster.mx, monster.my, state);
    return trap !== null && !is_pit(trap.ttyp);
}

// C ref: mon.c restrap() (4661-4693), "unwatched hiders may hide again; if so,
// returns True". movemon_singlemon() above is its only caller, and it calls it
// for every M1_HIDE monster that has a movement ration to spend.
//
// The guard chain's order is the whole of this function's correctness, because
// rn2(3) is its fourth term. Every term above it short-circuits with no draw,
// and every term below it is only reached once the draw has happened. A port
// that rolls before it tests cansee() draws the same screens as this one and
// diverges on the random-number log from the first watched hider onward, which
// is why scripts/monster-hiding.test.mjs asserts on the draws each call spends
// rather than on anything it prints.
//
// The success is silent: cansee() being false is a precondition, so nothing
// newsym() would repaint is on screen, and C calls no display function here.
// A hidden monster is observed through what it stops doing -- movemon_singlemon
// returns immediately for a monster whose mundetected this set -- and through
// the rn2(3) it keeps drawing on every action afterwards, because C calls
// restrap() before it reads mundetected.
//
// C's S_MIMIC arm re-disguises a waking mimic through makemon.c
// set_mimic_sym(), which draws randomness and rewrites m_ap_type and
// mappearance. The msleeping and mfrozen return above it leaves a sleeping or
// frozen mimic revealed after spending only restrap()'s rn2(3).
export function restrap(monster, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2 };
    if (monster.mcan
        || M_AP_TYPE(monster)
        || cansee(monster.mx, monster.my, state)
        || random.rn2(3)
        || monster === state.u?.ustuck
        /* can't hide while trapped except in pits */
        || trappedOutsideAPit(monster, state)
        /* can't hide on ceiling if there isn't one */
        || (ceiling_hider(monster.data) && !has_ceiling(state.u?.uz, state))
        /* won't hide when adjacent to hero */
        || (sensesMonster(monster, state) && m_next2u(monster, state))) {
        return false;
    }

    if (monster.data?.mlet === S_MIMIC) {
        /* "The mimic needs to be awake to disguise itself as something else." */
        if (monster.msleeping || monster.mfrozen) return false;
        requiredSingleMonsterOperation(env, 'setMimicSym')(monster, env);
        return true;
    } else if (state.level?.at(monster.mx, monster.my)?.typ === ROOM) {
        monster.mundetected = 1;
        return true;
    }

    return false;
}

// C ref: mon.c hideunder() (4726-4801), the S_EEL arm only, which is the arm
// movemon_singlemon() above reaches. mon.c's other two arms -- the hero's own
// concealment and the M1_CONCEAL species that hide under an object -- stay
// fail-closed here; js/makemon_create.js carries a separate level-creation
// subset that still owns them for mklev() and newcham().
//
// The boundary is `seeit` alone rather than `seeit && undetected`, because C
// evaluates `seenmon = y_monnam(mtmp)` for every visible monster, whether or
// not it ends up hidden, and y_monnam() draws randomness for a hallucinating
// hero. Only the message below it needs `undetected`. movemon_singlemon()
// tests !canseemon(mtmp) before it calls this, so its own eels never reach the
// stop; a future caller that can see the monster owes the message, the
// PLNMSG_HIDE_UNDER last_msg, and gl.last_hider before it lifts the stop.
//
// `redraw` defaults to the newsym() C calls. The planning clone overrides it
// with a no-op, so an omission repaints rather than silently skipping a
// square the live display owes.
export function hideunder(monster, env = {}) {
    const state = env.state ?? game;
    if (monster === state.youmonst) {
        throw new UnsupportedHideError('hero concealment');
    }
    if (monster.data?.mlet !== S_EEL) {
        throw new UnsupportedHideError('a monster that hides under objects');
    }

    const seeit = state.in_mklev ? false : canseemon(monster, state);
    if (seeit) {
        throw new UnsupportedHideError('concealment the hero can watch');
    }

    const x = monster.mx;
    const y = monster.my;
    let undetected = false;
    // C's `(is_u ? u.utrap : mtmp->mtrapped) || ((t = t_at(x, y)) != 0 &&
    // !is_pit(t->ttyp))` skips the lookup for a monster already recorded as
    // trapped. t_at() is a pure lookup, so the skip only spells out that a
    // trapped monster answers false whatever it is trapped in.
    const trap = monster.mtrapped ? null : t_at(x, y, state);
    if (monster === state.u?.ustuck) {
        /* can't hide if holding you or held by you */
    } else if (monster.mtrapped || (trap && !is_pit(trap.ttyp))) {
        /* can't hide while trapped or on a non-pit trap */
    } else {
        // "aquatic creatures only hide under water, not under objects; they
        // don't do so on the Plane of Water or when hero is also under water
        // unless some obstacle blocks line-of-sight". Is_waterlevel(&u.uz) and
        // Underwater (youprop.h:279, the bare u.uinwater field) are spelled
        // out against `state` so a planning clone owns both.
        undetected = is_pool(x, y, state)
            && !on_level(state.u?.uz, state.water_level)
            && (!state.u?.uinwater || !couldsee(x, y, state));
    }

    const oldundetctd = Boolean(monster.mundetected);
    monster.mundetected = undetected ? 1 : 0;
    if (undetected !== oldundetctd) (env.redraw ?? newsym)(x, y);
    return undetected;
}

// C ref: mon.c maybe_unhide_at() (4696-4720), "reveal a hiding monster at x,y,
// either under nonexistent object, or an eel out of water".
//
// The lookup and the early return are ported whole. The one call the guard
// makes, hideunder(), is only partly: the version above covers the eel arm for
// a monster the hero cannot see, and js/makemon_create.js holds a
// level-creation subset that answers for the object-concealing spiders and
// snakes mklev() places. Neither covers what this guard needs, which is a
// hider being revealed while the hero watches. The stop is therefore taken on
// `undetected` alone, one term wider than C's guard, which also wants a
// hides_under() species with nothing left to hide under or an eel out of
// water.
export function maybe_unhide_at(x, y, state = game) {
    const monster = m_at(x, y, state);
    if (monster) {
        if (monster.mundetected) {
            throw new UnsupportedHideError(
                'maybe_unhide_at() over a hidden monster',
            );
        }
        return;
    }
    if (!u_at(x, y, state)) return;
    if (state.u?.uundetected) {
        throw new UnsupportedHideError(
            'maybe_unhide_at() over a hidden hero',
        );
    }
}

// C ref: mon.c adj_erinys() (5921-5966), "make erinyes more dangerous based on
// your alignment abuse". Nine thresholds rewrite mons[PM_ERINYS] in place, and
// the level and difficulty at the end are recomputed from u.ualign.abuse on
// every call rather than from the argument. attrib.c adjalign() is one of its
// two callers and the only one this port has; the other is restore.c:727, which
// replays the whole rewrite after a restore because none of it is saved.
//
// The rewrite is a game-state change rather than a pure calculation, so it
// belongs to whichever game owns the catalog: monsters.js monst_globals_init()
// gives each game its own deep copy of the frozen templates, which is what
// makes a write here as private to one game as C's mons[] is to one process.
// The port has no save or restore -- js/save.js is savelev() alone, and
// dorecover() has no port -- so restore.c:727 has no owner to disagree with
// yet. When restore lands it has to call this after the monsters are restored.
export function adj_erinys(abuse, state = game) {
    const pm = state.mons[PM_ERINYS];

    if (abuse > 5) {
        pm.mflags1 |= M1_SEE_INVIS;
    }
    if (abuse > 10) {
        pm.mflags1 |= M1_AMPHIBIOUS;
    }
    if (abuse > 15) {
        pm.mflags1 |= M1_FLY;
    }
    if (abuse > 20) {
        /* more powerful attack */
        pm.mattk[0].damn = 3;
    }
    if (abuse > 25) {
        pm.mflags1 |= M1_REGEN;
    }
    if (abuse > 30) {
        pm.mflags1 |= M1_TPORT_CNTRL;
    }
    if (abuse > 35) {
        /* second attack */
        pm.mattk[1].aatyp = AT_WEAP;
        pm.mattk[1].adtyp = AD_DRST;
        pm.mattk[1].damn = 3;
        pm.mattk[1].damd = 4;
    }
    if (abuse > 40) {
        pm.mflags1 |= M1_TPORT;
    }
    if (abuse > 50) {
        /* third (spellcasting) attack */
        pm.mattk[2].aatyp = AT_MAGC;
        pm.mattk[2].adtyp = AD_SPEL;
        pm.mattk[2].damn = 3;
        pm.mattk[2].damd = 4;
    }

    /* also adjust level and difficulty */
    pm.mlevel = Math.min(7 + state.u.ualign.abuse, 50);
    pm.difficulty = Math.min(10 + Math.trunc(state.u.ualign.abuse / 3), 25);
}

// C ref: mon.c healmon() (4596-4614). Heal a monster by amt, optionally
// allowing overheal past mhpmax.  The youmonst branch calls healup() which
// is not ported; this implementation covers only the monster case.
export function healmon(mtmp, amt, overheal) {
    const oldhp = mtmp.mhp;
    if (mtmp.mhp + amt > mtmp.mhpmax + overheal) {
        mtmp.mhpmax += overheal;
        mtmp.mhp = mtmp.mhpmax;
    } else {
        mtmp.mhp += amt;
        if (mtmp.mhp > mtmp.mhpmax)
            mtmp.mhpmax = mtmp.mhp;
    }
    return mtmp.mhp - oldhp;
}
