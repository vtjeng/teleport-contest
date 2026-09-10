// mon.js -- Runtime monster turn state, and the removal lifecycle a monster
// runs when the hero kills it.
// C refs: mon.c movemon(), movemon_singlemon(), hideunder(),
// mon_animal_list(), mcalcmove(),
// mpickstuff(), curr_mon_load(), max_mon_load(), m_consume_obj(),
// pet_sanity_check(), sanity_check_single_mon(), mon_sanity_check(),
// m_poisongas_ok(), genus(), monlineu(), mm_2way_aggression(),
// mm_aggression(), mm_displacement(), zombie_maker(), unstuck(),
// m_respond_shrieker(), m_respond_medusa(), m_respond(),
// qst_guardians_respond(), peacefuls_respond(), wake_nearto_core(),
// mon_leaving_level(), m_detach(), mlifesaver(), lifesaved_monster(),
// logdeadmon(), mondead(), corpse_chance(), make_corpse(), mondied(),
// monkilled(), killed(), xkilled() and adj_erinys(); mthrowu.c m_carrying();
// do_name.c safe_oname().

import {
    A_CHAOTIC,
    ALLOW_BARS,
    ALLOW_DIG,
    ALLOW_M,
    ALLOW_MDISP,
    ALLOW_ROCK,
    ALLOW_SANCT,
    ALLOW_SSM,
    ALLOW_TM,
    ALLOW_TRAPS,
    ALLOW_U,
    ALLOW_WALL,
    ARTICLE_A,
    ARTICLE_NONE,
    ARTICLE_THE,
    BOLT_LIM,
    QBUFSZ,
    BUSTDOOR,
    COLNO,
    COULD_SEE,
    CONFLICT,
    CORPSTAT_BURIED,
    CORPSTAT_FEMALE,
    CORPSTAT_HISTORIC,
    CORPSTAT_INIT,
    CORPSTAT_MALE,
    CORPSTAT_NONE,
    DEAF,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    engulfing_u,
    FIRE_RES,
    COLD_RES,
    SLEEP_RES,
    DISINT_RES,
    SHOCK_RES,
    STONE_RES,
    FULL_MOON,
    G_GENOD,
    GPCOORDS_COMFULL,
    GPCOORDS_MAP,
    GPCOORDS_NONE,
    GPCOORDS_SCREEN,
    HALLUC,
    HALLUC_RES,
    MAGICAL_BREATHING,
    has_mcorpsenm,
    has_egd,
    has_edog,
    has_emin,
    has_epri,
    has_eshk,
    has_mgivenname,
    has_oname,
    In_endgame,
    Is_astralevel,
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
    M_POISONGAS_BAD,
    M_POISONGAS_MINOR,
    M_POISONGAS_OK,
    MFAST,
    MIGR_APPROX_XY,
    MIGR_RANDOM,
    MON_DETACH,
    MON_ENDGAME_MIGR,
    MON_OBLITERATE,
    MON_FLOOR,
    MON_LIMBO,
    MON_MIGRATING,
    MON_OFFMAP,
    MOAT,
    OBJ_AT,
    MSLOW,
    NATTK,
    NEUTRAL,
    NOGARLIC,
    NORMAL_SPEED,
    NOTONL,
    OBJ_MINVENT,
    ONAME_NO_FLAGS,
    OPENDOOR,
    POISON_RES,
    POOL,
    PROT_FROM_SHAPE_CHANGERS,
    RLOC_MSG,
    RLOC_NOMSG,
    ROOM,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
    PLNMSG_GROWL,
    SUPPRESS_SADDLE,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    SUPPRESS_HALLUCINATION,
    SUPPRESS_NAME,
    AUGMENT_IT,
    TAINT_AGE,
    thats_enough_tries,
    UNLOCKDOOR,
    WATER,
    LAVAPOOL,
    LAVAWALL,
    ROWNO,
    FEMALE,
    FAINTED,
    IN_SIGHT,
    MALE,
    W_AMUL,
    W_SADDLE,
    WT_HUMAN,
    XKILL_GIVEMSG,
    XKILL_NOCONDUCT,
    XKILL_NOCORPSE,
    XKILL_NOMSG,
    helpless,
    u_at,
    Upolyd,
    plur,
} from './const.js';
import { get_mleash } from './apply.js';
import { artifact_exists, artifactTouchable } from './artifacts.js';
import { night } from './calendar.js';
import {
    glyph_is_invisible,
    map_monster_glyph_info,
    newsym,
    unmap_object,
} from './display.js';
import {
    a_monnam,
    capitalizedMonsterName,
    hliquid,
    Monnam,
    mon_pmname,
    monsterCommonName,
    noit_mon_nam,
    oname,
    pmname,
    x_monnam,
} from './do_name.js';
import { flooreffects, revive_corpse } from './do.js';
import { finish_meating } from './dogmove.js';
import {
    has_ceiling,
    In_W_tower,
    ledger_no,
    level_difficulty,
    on_level,
    On_W_tower_level,
    surface,
} from './dungeon.js';
import { sengr_at } from './engrave.js';
import { adjalign } from './attrib.js';
import { experience, more_experienced, newexplevel } from './exper.js';
import { growl, maybe_gasp } from './sounds.js';
import { game } from './gstate.js';
import { disturb_buried_zombies, NODIAG, u_locomotion } from './hack.js';
import { dist2, online2, s_suffix, upstart } from './hacklib.js';
import {
    add_to_container,
    add_to_minv,
    delobj,
    nxtobj,
    obj_extract_self,
    stackobj,
} from './invent.js';
import {
    any_light_source,
    del_light_source,
    new_light_source,
} from './light.js';
import { mkcorpstat } from './corpstat.js';
import { change_luck } from './moveloop_preamble.js';
import {
    freemcorpsenm,
    is_home_elemental,
    mkclass_poly,
} from './makemon.js';
import {
    count_wsegs,
    dmonsfree,
    accept_newcham_form,
    makemon_runtime,
    mongone,
    newcham,
    newcham_distress,
    preflight_newcham_distress,
    remove_worm,
    set_mimic_sym,
    set_mon_data,
    wormgone,
} from './makemon_create.js';
import { expels, m_next2u } from './mhitu.js';
import {
    always_hostile,
    amphibious,
    amorphous,
    attacktype,
    attacktype_fordmg,
    bigmonst,
    big_little_match,
    breathless,
    can_teleport,
    ceiling_hider,
    completelyburns,
    completelyrots,
    completelyrusts,
    dmgtype,
    dmgtype_fromattack,
    emits_light,
    flesh_petrifies,
    haseyes,
    has_head,
    humanoid,
    hides_under,
    is_female,
    is_giant,
    is_golem,
    is_clinger,
    is_displacer,
    is_floater,
    is_flyer,
    is_hider,
    is_animal,
    is_human,
    is_dwarf,
    is_elf,
    is_gnome,
    is_minion,
    is_mplayer,
    is_neuter,
    is_reviver,
    is_rider,
    is_swimmer,
    is_shapeshifter,
    is_male,
    is_orc,
    is_undead,
    is_unicorn,
    is_watch,
    is_vampshifter,
    is_were,
    likes_lava,
    mindless,
    monster_resists_element,
    monsndx,
    gender,
    needspick,
    name_to_mon,
    name_to_monclass,
    nohands,
    notake,
    noncorporeal,
    nonliving,
    on_fire,
    passes_bars,
    passes_walls,
    regenerates,
    resist_conflict,
    strongmonst,
    throws_rocks,
    tunnels,
    undead_to_corpse,
    unique_corpstat,
    unsolid,
    vegan,
    verysmall,
    zombie_form,
    dead_species,
    olfaction,
} from './mondata.js';
import {
    AD_COLD,
    AD_DCAY,
    AD_DGST,
    AD_DRST,
    AD_ELEC,
    AD_FIRE,
    AD_POLY,
    AD_RBRE,
    AD_RUST,
    AD_SEDU,
    AD_SPEL,
    AD_SSEX,
    AD_STCK,
    AT_BOOM,
    AT_BREA,
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
    PM_ABBOT,
    PM_ACOLYTE,
    PM_ARCHEOLOGIST,
    PM_ATTENDANT,
    PM_BABY_PURPLE_WORM,
    PM_BARBARIAN,
    PM_GARGOYLE,
    PM_KILLER_BEE,
    PM_QUEEN_BEE,
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
    PM_ELF,
    PM_ERINYS,
    PM_CHIEFTAIN,
    PM_CLERIC,
    PM_CAVE_DWELLER,
    PM_DWARF,
    PM_ETTIN_MUMMY,
    PM_ETTIN_ZOMBIE,
    PM_FLESH_GOLEM,
    PM_FOG_CLOUD,
    PM_GIANT_MUMMY,
    PM_GIANT_ZOMBIE,
    PM_GLASS_GOLEM,
    PM_GNOME_MUMMY,
    PM_GNOME_ZOMBIE,
    PM_GNOME,
    PM_GOLD_DRAGON,
    PM_GOLD_GOLEM,
    PM_GRAY_DRAGON,
    PM_GRAY_OOZE,
    PM_GRAY_UNICORN,
    PM_GREEN_DRAGON,
    PM_GREEN_SLIME,
    PM_GHOUL,
    PM_GUIDE,
    PM_HEZROU,
    PM_HIGH_CLERIC,
    PM_HEALER,
    PM_HUMAN,
    PM_HUMAN_MUMMY,
    PM_HUMAN_WEREJACKAL,
    PM_HUMAN_WERERAT,
    PM_HUMAN_WEREWOLF,
    PM_HUMAN_ZOMBIE,
    PM_IRON_GOLEM,
    PM_KOBOLD_MUMMY,
    PM_KOBOLD_ZOMBIE,
    PM_HUNTER,
    PM_APPRENTICE,
    PM_KNIGHT,
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
    PM_ORC,
    PM_ORC_ZOMBIE,
    PM_PAGE,
    PM_PAPER_GOLEM,
    PM_PURPLE_WORM,
    PM_SHRIEKER,
    PM_RED_DRAGON,
    PM_ROPE_GOLEM,
    PM_RUST_MONSTER,
    PM_SILVER_DRAGON,
    PM_SKELETON,
    PM_SMALL_MIMIC,
    PM_MONK,
    PM_NEANDERTHAL,
    PM_RANGER,
    PM_ROGUE,
    PM_ROSHI,
    PM_SAMURAI,
    PM_STALKER,
    PM_STUDENT,
    PM_STEAM_VORTEX,
    PM_STONE_GOLEM,
    PM_VAMPIRE,
    PM_VAMPIRE_BAT,
    PM_VAMPIRE_LEADER,
    PM_VROCK,
    PM_VLAD_THE_IMPALER,
    PM_THUG,
    PM_TOURIST,
    PM_VALKYRIE,
    PM_WARRIOR,
    PM_WEREJACKAL,
    PM_WERERAT,
    PM_WEREWOLF,
    PM_WINGED_GARGOYLE,
    PM_WHITE_DRAGON,
    PM_WHITE_UNICORN,
    PM_WOLF,
    PM_WIZARD,
    PM_WIZARD_OF_YENDOR,
    PM_WRAITH,
    PM_WOOD_GOLEM,
    PM_YELLOW_DRAGON,
    PM_ASMODEUS,
    PM_BALROG,
    PM_DISPATER,
    PM_HORNED_DEVIL,
    PM_JELLYFISH,
    PM_OWLBEAR,
    PM_ORCUS,
    PM_PONY,
    PM_ROTHE,
    PM_VIOLET_FUNGUS,
    PM_YEENOGHU,
    AT_GAZE,
    MS_SHRIEK,
    S_EEL,
    S_ELEMENTAL,
    S_BAT,
    S_DOG,
    S_DRAGON,
    S_FUNGUS,
    S_GHOST,
    S_HUMAN,
    S_KOP,
    S_LICH,
    S_MIMIC,
    S_ORC,
    S_UNICORN,
    S_VAMPIRE,
    S_VORTEX,
    S_ZOMBIE,
    HIGH_PM,
    LOW_PM,
    MR_STONE,
    MZ_TINY,
    SPECIAL_PM,
} from './monsters.js';
import {
    accessible,
    m_can_break_boulder,
    m_in_air,
    monhaskey,
    onscary,
    youHear,
    mb_trapped,
    closed_door,
} from './monmove.js';
import {
    m_at,
    mon_track_clear,
    newMonster,
    place_monster,
    remove_monster,
} from './monst.js';
import {
    clear_dknown,
    clear_splitobjs,
    mkobj,
    g_at,
    isMetallic,
    isRustprone,
    mksobj_at,
    objectType,
    place_object,
    sobj_at,
    splitobj,
    weight,
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
    AMULET_OF_STRANGULATION,
    GOLD,
    ICE_BOX,
    RIN_SLOW_DIGESTION,
    ROCK,
    STATUE,
    ROCK_CLASS,
    SCROLL_CLASS,
    SCR_SCARE_MONSTER,
    SPE_EXTRA_HEALING,
    SPE_HEALING,
    TIN,
    WOOD,
    SADDLE,
} from './objects.js';
import { makeplural, mungspaces } from './fruit.js';
import {
    distant_name,
    donameFresh,
    simple_typename,
    The,
    vtense,
    xnameFresh,
} from './objnam.js';
import { obj_resists } from './bury.js';
import { objdescr_is } from './o_init.js';
import { corpse_intrinsic, should_givit } from './eat.js';
import { extract_from_minvent, mon_set_minvis } from './worn.js';
import { end_burn } from './timeout.js';
import { migrate_to_level } from './dog.js';
import { d, rn1, rn2, rnd, rne } from './rng.js';
import {
    canSeeMonster,
    canSpotMonster,
    heroIsBlind,
    messageAt,
    sensesMonster,
} from './startup_a11y.js';
import { mpickobj, relobj } from './steal.js';
import { replshk, shkgone } from './shk.js';
import { enexto, goodpos, noteleport_level, rloc_to } from './teleport.js';
import {
    fill_pit,
    is_lava,
    is_pool,
    t_at,
    unconscious,
    Flying,
    Levitation,
    is_pool_or_lava,
} from './trap.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import { mon_has_amulet, mon_has_special } from './wizard.js';
import { getlin } from './windows.js';
import {
    cansee,
    canseemon,
    couldsee,
    does_block,
    is_lightblocker_mappear,
    m_canseeu,
    recalc_block_point,
    unblock_point,
    vision_recalc,
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
    alloc_itermonarr(monsters.length);
    for (let i = 0; i < monsters.length; ++i)
        itermonarr[i] = monsters[i];
    for (let i = 0; i < monsters.length; ++i) {
        if (await callback(itermonarr[i])) break;
    }
}

// C ref: mon.c alloc_itermonarr() (4471-4490). JavaScript arrays do not need
// manual allocation, but keeping the same retained capacity and release rules
// makes the safe iterator's ownership explicit and mirrors freedynamicdata().
let itermonarr = [];
let itermonsiz = 0;

export function alloc_itermonarr(count) {
    if (!count || count > itermonsiz || count + 40 < itermonsiz) {
        itermonarr = [];
        itermonsiz = 0;
    }
    if (count > itermonsiz) {
        itermonsiz = count + 20;
        itermonarr.length = itermonsiz;
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

// C ref: monst.h:222 is_Vlad(). Vlad the Impaler, or a shapechanger whose
// true form is Vlad.
export function is_Vlad(monster) {
    return monster.data?.pmidx === PM_VLAD_THE_IMPALER
        || monster.cham === PM_VLAD_THE_IMPALER;
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

// C ref: mon.c iter_mons(). Cache nmon before invoking the callback so a
// callback may unlink or otherwise mutate the current monster safely.
export function iter_mons(vfunc, state = game) {
    for (let mtmp = state.level?.monlist ?? null; mtmp;) {
        const next = mtmp.nmon;
        if (mtmp.mhp >= 1 && !mon_offmap(mtmp)) vfunc(mtmp);
        mtmp = next;
    }
}

// C ref: mon.c get_iter_mons_xy(). The coordinate pair belongs to the
// predicate, not to the monster being visited.
export function get_iter_mons_xy(bfunc, x, y, state = game) {
    for (let mtmp = state.level?.monlist ?? null; mtmp;) {
        const next = mtmp.nmon;
        if (mtmp.mhp >= 1 && !mon_offmap(mtmp)
            && bfunc(mtmp, x, y)) return mtmp;
        mtmp = next;
    }
    return null;
}

function sanityImpossible(message, env) {
    if (typeof env.impossible === 'function') {
        env.impossible(message, env);
    } else {
        note_unported('pline.c impossible');
    }
}

function sanityPanic(message, env) {
    if (typeof env.panic === 'function') env.panic(message, env);
    else note_unported('pline.c panic');
    throw new Error(message);
}

// C ref: mon.c pet_sanity_check() (57-70). This is a diagnostic-only helper;
// the C impossible() boundary is injected when a caller wants diagnostics,
// and otherwise recorded as the existing pline.c gap.
export function pet_sanity_check(mtmp, msgarg, state = game, env = {}) {
    if (!has_edog(mtmp)) return;
    const edog = mtmp.mextra.edog;
    if (edog.droptime > (state.moves ?? 0)) {
        sanityImpossible(
            `insane pet #${mtmp.m_id} has droptime (${edog.droptime}) `
            + `in the future (${state.moves ?? 0}) (${msgarg})`,
            env,
        );
    }
}

// C ref: mon.c sanity_check_single_mon() (73-255). The checks retain C's
// order, including the early dead-monster return and the diagnostic-only
// calls into worm.c and pline.c.
export function sanity_check_single_mon(
    mtmp,
    chkGeno,
    msg,
    state = game,
    env = {},
) {
    const mptr = mtmp.data;
    let mx = mtmp.mx;
    let my = mtmp.my;
    const mndx = monsndx(mptr);
    const validSpecies = Number.isInteger(mndx)
        && mndx >= LOW_PM && mndx <= HIGH_PM
        && (state.mons?.[mndx] === mptr || mptr?.pmidx === mndx);

    if (!validSpecies) {
        sanityPanic(
            `illegal mon data; mnum=${mtmp.mnum} (${msg})`,
            env,
        );
    } else {
        if (mtmp.mnum !== mndx) {
            sanityImpossible(
                `monster mnum=${mtmp.mnum}, monsndx=${mndx} (${msg})`,
                env,
            );
            mtmp.mnum = mndx;
        }
        if ((mtmp.mhpmax ?? 0) < 1
            || (mtmp.mhpmax ?? 0) < (mtmp.m_lev ?? 0)
            || mtmp.mhp > mtmp.mhpmax) {
            sanityImpossible(
                `${msg}: level ${mtmp.m_lev} ${mptr.pmnames?.[2] ?? ''}`
                + ` #${mtmp.m_id} has ${mtmp.mhp} cur HP,`
                + ` ${mtmp.mhpmax} max HP`,
                env,
            );
        }
        if (mtmp.mhp < 1) return;
        const mvitals = state.svm?.mvitals ?? state.mvitals;
        if (chkGeno && (mvitals?.[mndx]?.mvflags ?? 0) & G_GENOD)
            sanityImpossible(
                `genocided ${pmname(mptr, mtmp.female ? FEMALE : MALE)}`
                + ` in play (${msg})`,
                env,
            );
        if (mtmp.mtame && !mtmp.mpeaceful)
            sanityImpossible(`tame monster is not peaceful (${msg})`, env);
    }

    if (mtmp.isshk && !has_eshk(mtmp))
        sanityImpossible(`shk without eshk (${msg})`, env);
    if (mtmp.ispriest && !has_epri(mtmp))
        sanityImpossible(`priest without epri (${msg})`, env);
    if (mtmp.isgd && !has_egd(mtmp))
        sanityImpossible(`guard without egd (${msg})`, env);
    if (mtmp.isminion && !has_emin(mtmp))
        sanityImpossible(`minion without emin (${msg})`, env);
    if (mtmp.mtame) {
        if (!has_edog(mtmp) && !mtmp.isminion)
            sanityImpossible(`pet without edog (${msg})`, env);
        else pet_sanity_check(mtmp, msg, state, env);
    }

    if (mtmp === state.u?.usteed) {
        const notTame = !mtmp.mtame ? 'not tame' : '';
        const saddle = !m_carrying(mtmp, SADDLE, state)
            ? 'no saddle'
            : !which_armor(mtmp, W_SADDLE, state) ? 'saddle not worn' : '';
        if (saddle || notTame)
            sanityImpossible(
                `steed: ${saddle}${saddle && notTame ? ', ' : ''}`
                + `${notTame} (${msg})`,
                env,
            );
    }

    if (mtmp.mtrapped && !mtmp.wormno && !t_at(mx, my, state))
        sanityImpossible(`trapped without a trap (${msg})`, env);
    if (mtmp.mfrozen && mtmp.mcanmove)
        sanityImpossible(
            `frozen monster [${mtmp.mtame ? 'tame ' : mtmp.mpeaceful ? 'peaceful ' : ''}`
            + `${pmname(mptr, mtmp.female ? FEMALE : MALE)}] is able to move (${msg})`,
            env,
        );

    if (mtmp.mundetected) {
        if (!isok(mx, my)) mx = my = 0;
        if (mtmp === state.u?.ustuck)
            sanityImpossible(`hiding monster stuck to you (${msg})`, env);
        if (m_at(mx, my, state) === mtmp && hides_under(mptr)
            && !OBJ_AT(mx, my, state)) {
            sanityImpossible(`mon hiding under nonexistent obj (${msg})`, env);
        }
        if (mptr.mlet === S_EEL
            && !(is_pool(mx, my, state) && !on_level(state.u?.uz, state.water_level))) {
            sanityImpossible(
                `eel hiding ${!on_level(state.u?.uz, state.water_level)
                    ? 'out of water' : 'on Plane of Water'} (${msg})`,
                env,
            );
        }
        if (ceiling_hider(mptr)
            && (!has_ceiling(state.u?.uz, state)
                || ![POOL, MOAT, WATER, LAVAPOOL, LAVAWALL]
                    .includes(state.level?.at?.(mx, my)?.typ)
                    && !accessible(mx, my, state))) {
            sanityImpossible(
                `${!has_ceiling(state.u?.uz, state) ? 'without ceiling' : 'in solid stone'}`
                + ` (${msg})`,
                env,
            );
        }
        const trap = mtmp.mtrapped ? t_at(mx, my, state) : null;
        if (trap && !is_pit(trap.ttyp))
            sanityImpossible(`hiding while trapped in a non-pit (${msg})`, env);
    } else if (M_AP_TYPE(mtmp) !== M_AP_NOTHING) {
        const isMimic = mptr.mlet === S_MIMIC;
        const appearance = M_AP_TYPE(mtmp);
        const what = appearance === M_AP_FURNITURE ? 'furniture'
            : appearance === M_AP_MONSTER ? 'a monster'
                : appearance === M_AP_OBJECT ? 'an object' : 'something strange';
        if (msg === 'migr' && appearance !== M_AP_MONSTER)
            sanityImpossible(
                `migrating ${isMimic ? 'mimic' : 'monster'} mimicking ${what} ${msg}`,
                env,
            );
        else if (msg !== 'migr'
            && (state.u?.uprops?.[PROT_FROM_SHAPE_CHANGERS]?.intrinsic
                || state.u?.uprops?.[PROT_FROM_SHAPE_CHANGERS]?.extrinsic)) {
            sanityImpossible(
                `mimic${isMimic ? '' : 'ker'} concealed as ${what}`
                + ` despite Prot-from-shape-changers ${msg}`,
                env,
            );
        }
        if (!(isMimic || mtmp.meating
              || (mtmp.iswiz && appearance === M_AP_MONSTER))) {
            sanityImpossible(
                `non-mimic (${mptr.pmnames?.[2] ?? ''}) posing as ${what} (${msg})`,
                env,
            );
        }
    }

    if (mtmp.mleashed) {
        if (!get_mleash(mtmp, state))
            sanityImpossible(
                `monst ${mtmp.m_id}: leashed but no leash for ${mon_pmname(mtmp)}`,
                env,
            );
        else if (!mtmp.mtame)
            sanityImpossible(
                `monst ${mtmp.m_id}: leashed but not tame ${mon_pmname(mtmp)}`,
                env,
            );
    }
}

// C ref: mon.c mon_sanity_check() (258-326). The two worm.c checks remain
// void-only gaps; all list and map checks retain their C traversal order.
export function mon_sanity_check(state = game, env = {}) {
    const level = state.level;
    for (let mtmp = level?.monlist ?? null; mtmp; mtmp = mtmp.nmon) {
        sanity_check_single_mon(mtmp, true, 'fmon', state, env);
        if (mtmp.mhp < 1 && !mtmp.isgd) continue;
        const { mx, my } = mtmp;
        if (!isok(mx, my) && !(mtmp.isgd && mx === 0 && my === 0)) {
            sanityImpossible(`mon claims to be at <${mx},${my}>?`, env);
        } else if (mtmp === state.u?.usteed) {
            if (mx !== state.u.ux || my !== state.u.uy)
                sanityImpossible(`steed claims to be at <${mx},${my}>?`, env);
        } else if (m_at(mx, my, state) !== mtmp) {
            sanityImpossible(`mon at <${mx},${my}> is not there!`, env);
        } else if (mtmp.wormno) {
            note_unported('worm.c sanity_check_worm');
        } else if (mon_offmap(mtmp)) {
            sanityImpossible('floor mon has mstate set to non-floor', env);
        }
    }

    const monsters = level?.monsters;
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const mtmp = monsters?.[x]?.[y];
            if (!mtmp) continue;
            let found = false;
            for (let m = level?.monlist ?? null; m; m = m.nmon) {
                if (m === mtmp) { found = true; break; }
            }
            if (!found)
                sanityImpossible(`map mon at <${x},${y}> not in fmon list!`, env);
            else if (mtmp === state.u?.usteed)
                sanityImpossible(`steed is on the map at <${x},${y}>!`, env);
            else if ((mtmp.mx !== x || mtmp.my !== y)
                     && mtmp.data?.pmidx !== PM_LONG_WORM) {
                sanityImpossible(
                    `map mon at <${x},${y}> is found at <${mtmp.mx},${mtmp.my}>?`,
                    env,
                );
            }
        }
    }

    for (let mtmp = state.gm?.migrating_mons ?? null;
        mtmp;
        mtmp = mtmp.nmon) {
        sanity_check_single_mon(mtmp, false, 'migr', state, env);
        const allowed = MON_MIGRATING | MON_LIMBO | MON_ENDGAME_MIGR | MON_OFFMAP;
        if (((mtmp.mstate ?? 0) & ~allowed) !== 0
            || !((mtmp.mstate ?? 0) & MON_MIGRATING)) {
            sanityImpossible('migrating mon has invalid mstate', env);
        }
    }
    note_unported('worm.c wormno_sanity_check');
}

// C ref: mon.c m_poisongas_ok() (330-357). This only classifies tolerance;
// region.c owns the later damage/message decisions.
export function m_poisongas_ok(mtmp, state = game) {
    const species = mtmp.data;
    const isYou = mtmp === state.youmonst;
    if (nonliving(species) || is_vampshifter(mtmp)
        || breathless(species)
        || species?.pmidx === PM_HEZROU || species?.pmidx === PM_VROCK) {
        return M_POISONGAS_OK;
    }
    const px = isYou ? state.u?.ux : mtmp.mx;
    const py = isYou ? state.u?.uy : mtmp.my;
    if ((species?.mlet === S_EEL || on_level(state.u?.uz, state.water_level))
        && is_pool(px, py, state)) return M_POISONGAS_OK;
    if (attacktype_fordmg(species, AT_BREA, AD_DRST)
        || attacktype_fordmg(species, AT_BREA, AD_RBRE)) {
        return M_POISONGAS_OK;
    }
    const magicalBreathing = state.u?.uprops?.[MAGICAL_BREATHING];
    const poisonResistance = state.u?.uprops?.[POISON_RES];
    if (isYou && (state.u?.uinvulnerable
        || magicalBreathing?.intrinsic || magicalBreathing?.extrinsic
        || state.u?.uinwater)) return M_POISONGAS_OK;
    if (isYou
        ? poisonResistance?.intrinsic || poisonResistance?.extrinsic
        : monster_resists_element(mtmp, POISON_RES, state)) {
        return M_POISONGAS_MINOR;
    }
    return M_POISONGAS_BAD;
}

// C ref: mon.c genus() (470-532). Quest guardians map to their role in mode 1;
// ordinary humanoid species collapse to their generic race in mode 0.
export function genus(mndx, mode, state = game) {
    switch (mndx) {
    case PM_STUDENT: return mode ? PM_ARCHEOLOGIST : PM_HUMAN;
    case PM_CHIEFTAIN: return mode ? PM_BARBARIAN : PM_HUMAN;
    case PM_NEANDERTHAL: return mode ? PM_CAVE_DWELLER : PM_HUMAN;
    case PM_ATTENDANT: return mode ? PM_HEALER : PM_HUMAN;
    case PM_PAGE: return mode ? PM_KNIGHT : PM_HUMAN;
    case PM_ABBOT: return mode ? PM_MONK : PM_HUMAN;
    case PM_ACOLYTE: return mode ? PM_CLERIC : PM_HUMAN;
    case PM_HUNTER: return mode ? PM_RANGER : PM_HUMAN;
    case PM_THUG: return mode ? PM_ROGUE : PM_HUMAN;
    case PM_ROSHI: return mode ? PM_SAMURAI : PM_HUMAN;
    case PM_GUIDE: return mode ? PM_TOURIST : PM_HUMAN;
    case PM_APPRENTICE: return mode ? PM_WIZARD : PM_HUMAN;
    case PM_WARRIOR: return mode ? PM_VALKYRIE : PM_HUMAN;
    default: {
        const species = ismnum(mndx) ? state.mons?.[mndx] : null;
        if (is_human(species)) return PM_HUMAN;
        if (is_elf(species)) return PM_ELF;
        if (is_dwarf(species)) return PM_DWARF;
        if (is_gnome(species)) return PM_GNOME;
        if (is_orc(species)) return PM_ORC;
        return mndx;
    }
    }
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
// The forced-revert arm delegates to normal_shape(), which also preserves the
// cancellation bit when newcham() clears it.
export function restore_cham(monster, state = game) {
    const shapeChangerProtection
        = state.u?.uprops?.[PROT_FROM_SHAPE_CHANGERS];
    if (shapeChangerProtection?.intrinsic
        || shapeChangerProtection?.extrinsic
        || monster.mcan) {
        normal_shape(monster, state);
        return;
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

// C ref: mon.c meatbox() (1354-1390). Contents of an eaten container either
// enter an engulfing monster's inventory or land on the floor.
export async function meatbox(mon, obj, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const x = mon.mx;
    const y = mon.my;
    const engulfContents = mon.data === state.mons?.[PM_GELATINOUS_CUBE];
    if (!obj?.cobj || !isok(x, y)) return;

    if (!engulfContents && cansee(x, y, state)) {
        const contents = s_suffix(The(
            distant_name(obj, xnameFresh, state),
            state,
        ));
        await monsterMessage(
            `${contents} contents spill out onto the ${surface(x, y, state)}.`,
            mon,
            state,
            rawEnv,
        );
    }
    while (obj.cobj) {
        const child = obj.cobj;
        obj_extract_self(child, objectGenerationEnv({ ...rawEnv, state }));
        if (obj.otyp === ICE_BOX)
            note_unported('mkobj.c removed_from_icebox');
        if (engulfContents) {
            mpickobj(mon, child, rawEnv);
        } else if (!flooreffects(
            child,
            x,
            y,
            '',
            {
                ...objectGenerationEnv({ ...rawEnv, state }),
                unsupported: rawEnv.unsupported
                    ?? ((reason) => note_unported(`do.c flooreffects ${reason}`)),
            },
        )) {
            place_object(
                child,
                x,
                y,
                objectGenerationEnv({ ...rawEnv, state }),
            );
        }
    }
}

// C ref: mon.c m_consume_obj() (1392-1453), the tame-monster branch for a
// corpse.  dogmove.c dog_eat() is its live caller.  The uball/uchain and
// Has_contents arms are gated before entry.  After delobj, corpses that
// trigger polyfood, mlevelgain, mhealup, mstoning, sliming, or pyrolisk
// explosion remain explicit fail-closed gaps; mon_givit is ported below.
export async function m_consume_obj(mtmp, otmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const unsupported = rawEnv.unsupported;
    const stop = (reason) => {
        if (typeof unsupported === 'function') unsupported(reason);
        throw new TypeError(`m_consume_obj requires ${reason}`);
    };

    if (otmp === state.uball || otmp === state.uchain)
        stop('an unpunished object');
    if (otmp?.cobj)
        await meatbox(mtmp, otmp, { ...rawEnv, state });

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

    const corpseSpecies = ismnum(corpsenm) ? state.mons?.[corpsenm] : null;

    // Gate every post-delobj effect branch. Each check mirrors the C macro or
    // inline test that guards an effect not yet ported in this file.
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
    if (ismnum(corpsenm))
        await mon_givit(mtmp, corpseSpecies, { ...rawEnv, state });
}

// C ref: mon.c meatmetal() (1463-1531).
export async function meatmetal(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2, rnd };
    const visible = canseemon(mtmp, state);
    if (mtmp.mtame) return 0;

    for (let obj = state.level?.objects?.[mtmp.mx]?.[mtmp.my] ?? null;
        obj;
        obj = obj.nexthere) {
        if ((mtmp.data === state.mons?.[PM_RUST_MONSTER]
                && !isRustprone(obj, state))
            || obj.otyp === AMULET_OF_STRANGULATION
            || obj.otyp === RIN_SLOW_DIGESTION
            || (obj.opoisoned
                && !monster_resists_element(mtmp, POISON_RES, state))) {
            continue;
        }
        if (!isMetallic(obj, state)
            || obj_resists(obj, 5, 95, rawEnv)
            || !artifactTouchable(obj, mtmp, rawEnv)) continue;

        const rustMonster = mtmp.data === state.mons?.[PM_RUST_MONSTER];
        if (rustMonster && obj.oerodeproof) {
            if (visible && state.flags?.verbose) {
                const name = distant_name(obj, donameFresh, state);
                await monsterMessage(
                    `${capitalizedMonsterName(mtmp, state)} eats ${name}!`,
                    mtmp,
                    state,
                    rawEnv,
                );
            }
            obj.oerodeproof = 0;
            mtmp.mstun = 1;
            if (visible && state.flags?.verbose) {
                const name = distant_name(obj, donameFresh, state);
                await monsterMessage(
                    `${capitalizedMonsterName(mtmp, state)} spits ${name} out in disgust!`,
                    mtmp,
                    state,
                    rawEnv,
                );
            }
            continue;
        }

        if (cansee(mtmp.mx, mtmp.my, state)) {
            const name = distant_name(obj, donameFresh, state);
            if (state.flags?.verbose)
                await monsterMessage(
                    `${capitalizedMonsterName(mtmp, state)} eats ${name}!`,
                    mtmp,
                    state,
                    rawEnv,
                );
        } else if (state.flags?.verbose) {
            await monsterMessage('You hear a crunching sound.', null, state, rawEnv);
        }
        mtmp.meating = Math.trunc(obj.owt / 2) + 1;
        await m_consume_obj(mtmp, obj, { ...rawEnv, state, random });
        if (mtmp.mhp < 1) return 2;
        if (random.rnd(25) < 3) {
            mksobj_at(ROCK, mtmp.mx, mtmp.my, true, false, {
                ...objectGenerationEnv({ ...rawEnv, state, random }),
            });
        }
        newsym(mtmp.mx, mtmp.my, state);
        return 1;
    }
    return 0;
}

// C ref: mon.c meatobj() (1533-1653).
export async function meatobj(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (mtmp.mtame) return 0;
    const original = mtmp.data;
    let count = 0;
    let engulfed = 0;
    let messageText = '';
    let obj = state.level?.objects?.[mtmp.mx]?.[mtmp.my] ?? null;
    while (obj) {
        const nextObj = obj.nexthere;
        if (isMinesPrize(obj, state) || isSokoPrize(obj, state)) {
            obj = nextObj;
            continue;
        }
        if (obj.otyp === CORPSE
            && is_rider(state.mons?.[obj.corpsenm])) {
            const ox = obj.ox;
            const oy = obj.oy;
            const revived = await revive_corpse(obj, state);
            newsym(ox, oy, state);
            if (!revived) {
                obj = nextObj;
                continue;
            }
            break;
        }
        const species = obj.otyp === CORPSE ? state.mons?.[obj.corpsenm] : null;
        if ((species && touch_petrifies(species)
                && !monster_resists_element(mtmp, STONE_RES, state))
            || obj.oclass === ROCK_CLASS
            || obj === state.uball
            || obj === state.uchain
            || obj.otyp === SCR_SCARE_MONSTER) {
            obj = nextObj;
            continue;
        }

        const stoning = obj.otyp === CORPSE
            && ismnum(obj.corpsenm)
            && flesh_petrifies(state.mons[obj.corpsenm]);
        const engulf = !isOrganic(obj, state)
            || obj_resists(obj, 5, 95, rawEnv)
            || !artifactTouchable(obj, mtmp, rawEnv)
            || obj.otyp === AMULET_OF_STRANGULATION
            || obj.otyp === RIN_SLOW_DIGESTION
            || (obj.opoisoned
                && !monster_resists_element(mtmp, POISON_RES, state))
            || (stoning
                && !monster_resists_element(mtmp, STONE_RES, state))
            || (obj.otyp === GLOB_OF_GREEN_SLIME && !slimeproof(mtmp.data));
        if (engulf) {
            engulfed++;
            const name = distant_name(obj, donameFresh, state);
            if (engulfed === 1)
                messageText = `${capitalizedMonsterName(mtmp, state)} engulfs ${name}.`;
            else if (engulfed === 2)
                messageText = `${capitalizedMonsterName(mtmp, state)} engulfs several objects.`;
            obj_extract_self(obj, objectGenerationEnv({ ...rawEnv, state }));
            mpickobj(mtmp, obj, rawEnv);
        } else {
            count++;
            if (cansee(mtmp.mx, mtmp.my, state)) {
                const name = distant_name(obj, donameFresh, state);
                if (state.flags?.verbose)
                    await monsterMessage(
                        `${capitalizedMonsterName(mtmp, state)} eats ${name}!`,
                        mtmp,
                        state,
                        rawEnv,
                    );
                if (obj.oclass === SCROLL_CLASS
                    && objdescr_is(obj, 'YUM YUM', state)) {
                    await monsterMessage(`Yum${obj.blessed ? '!' : '.'}`, null, state, rawEnv);
                }
            } else {
                await monsterMessage('You hear a slurping sound.', null, state, rawEnv);
            }
            await m_consume_obj(mtmp, obj, { ...rawEnv, state });
            if (mtmp.data !== original) return mtmp.data ? 1 : 2;
        }
        if (mtmp.minvis) newsym(mtmp.mx, mtmp.my, state);
        obj = nextObj;
    }
    if (engulfed && state.flags?.verbose) {
        if (cansee(mtmp.mx, mtmp.my, state) && messageText)
            await monsterMessage(messageText, mtmp, state, rawEnv);
        else
            await monsterMessage(
                `You hear ${engulfed === 1 ? 'a' : 'several'} slurping sound${engulfed === 1 ? '' : 's'}.`,
                null,
                state,
                rawEnv,
            );
    }
    return count || engulfed ? 1 : 0;
}

// C ref: mon.c meatcorpse() (1656-1723).
export async function meatcorpse(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (mtmp.mtame) return 0;
    const original = mtmp.data;
    const x = mtmp.mx;
    const y = mtmp.my;
    for (let obj = sobj_at(CORPSE, x, y, state); obj;
        obj = nxtobj(obj, CORPSE, true)) {
        const species = state.mons?.[obj.corpsenm];
        if (vegan(species)
            || (flesh_petrifies(species)
                && !monster_resists_element(mtmp, STONE_RES, state))) continue;
        if (is_rider(species)) {
            const revived = await revive_corpse(obj, state);
            newsym(x, y, state);
            if (!revived) continue;
            break;
        }
        if (obj.quan > 1)
            obj = splitobj(obj, 1, objectGenerationEnv({ ...rawEnv, state }));
        if (cansee(x, y, state) && canseemon(mtmp, state)) {
            const name = distant_name(obj, donameFresh, state);
            if (state.flags?.verbose)
                await monsterMessage(
                    `${capitalizedMonsterName(mtmp, state)} eats ${name}!`,
                    mtmp,
                    state,
                    rawEnv,
                );
        } else {
            await monsterMessage('You hear a masticating sound.', null, state, rawEnv);
        }
        await m_consume_obj(mtmp, obj, { ...rawEnv, state });
        if (mtmp.data !== original) return mtmp.data ? 1 : 2;
        if (mtmp.minvis) newsym(x, y, state);
        return 1;
    }
    return 0;
}

// C ref: mon.c mon_give_prop() (1726-1775).
export async function mon_give_prop(mtmp, prop, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const messages = new Map([
        [FIRE_RES, '%s shivers slightly.'],
        [COLD_RES, '%s looks quite warm.'],
        [SLEEP_RES, '%s looks wide awake.'],
        [DISINT_RES, '%s looks very firm.'],
        [SHOCK_RES, '%s crackles with static electricity.'],
        [POISON_RES, '%s looks healthy.'],
    ]);
    if (!messages.has(prop)) return;
    const intrinsic = 1 << (prop - FIRE_RES);
    const oldResistance = (mtmp.data?.mresists ?? 0) | (mtmp.mintrinsics ?? 0);
    const message = oldResistance & intrinsic ? null : messages.get(prop);
    mtmp.mintrinsics = (mtmp.mintrinsics ?? 0) | intrinsic;
    if (canseemon(mtmp, state) && message) {
        await monsterMessage(
            message.replace('%s', capitalizedMonsterName(mtmp, state)),
            mtmp,
            state,
            rawEnv,
        );
    }
}

// C ref: mon.c mon_givit() (1778-1824).
export async function mon_givit(mtmp, ptr, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (mtmp.mhp < 1) return;
    const visible = canseemon(mtmp, state);
    if (ptr === state.mons?.[PM_STALKER]) {
        if (!mtmp.perminvis || mtmp.invis_blkd) {
            const oldName = capitalizedMonsterName(mtmp, state);
            mon_set_minvis(mtmp, false, state);
            if (visible) {
                const text = !canSpotMonster(mtmp, state)
                    ? `${oldName} vanishes.`
                    : mtmp.invis_blkd
                        ? `${oldName} seems to flicker.`
                        : `${oldName} becomes invisible.`;
                await monsterMessage(text, mtmp, state, rawEnv);
            }
        }
        mtmp.mstun = 1;
        return;
    }
    const prop = corpse_intrinsic(ptr, rawEnv.random ?? { rn2 });
    if (!prop || !should_givit(prop, ptr, rawEnv.random ?? { rn2 })) return;
    await mon_give_prop(mtmp, prop, rawEnv);
}

// C ref: mon.c mpickgold() (1827-1845).
export function mpickgold(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const gold = g_at(mtmp.mx, mtmp.my, state);
    if (!gold) return;
    const material = objectType(gold, state).oc_material;
    obj_extract_self(gold, objectGenerationEnv({ ...rawEnv, state }));
    add_to_minv(mtmp, gold, rawEnv);
    if (cansee(mtmp.mx, mtmp.my, state)) {
        if (state.flags?.verbose && !mtmp.isgd) {
            const message = rawEnv.message ?? ttyPline;
            message(
                messageAt(
                    `${capitalizedMonsterName(mtmp, state)} picks up some ${material === GOLD ? 'gold' : 'money'}.`,
                    mtmp.mx,
                    mtmp.my,
                    state,
                ),
                state,
            );
        }
        newsym(mtmp.mx, mtmp.my, state);
    }
}

function isOrganic(obj, state) {
    return (state.objects?.[obj.otyp]?.oc_material ?? 0) <= WOOD;
}

function isMinesPrize(obj, state) {
    return obj.o_id === (state.svc?.context?.achieveo?.mines_prize_oid ?? -1);
}

function isSokoPrize(obj, state) {
    return obj.o_id === (state.svc?.context?.achieveo?.soko_prize_oid ?? -1);
}

async function monsterMessage(text, monster, state, env) {
    const message = env.message ?? ttyPline;
    const output = monster ? messageAt(text, monster.mx, monster.my, state) : text;
    await message(output, state, env);
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
                    `${Monnam(monster, state, env)}`
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

// C ref: mon.c monlineu(). The remembered monster target is the hero's
// apparent position, not necessarily the hero's current position.
export function monlineu(monster, nx, ny) {
    return online2(nx, ny, monster.mux, monster.muy);
}

// C ref: mon.c mm_2way_aggression(). The Wizard's Tower partition is treated
// as a separate level so monsters do not attack across its boundary.
export function mm_2way_aggression(magr, mdef, state = game) {
    const level = state.u?.uz;
    if (On_W_tower_level(level, state)) {
        const heroInTower = In_W_tower(
            state.u.ux, state.u.uy, level, state,
        );
        const attackerInTower = In_W_tower(
            magr.mx, magr.my, level, state,
        );
        const defenderInTower = In_W_tower(
            mdef.mx, mdef.my, level, state,
        );
        if (heroInTower
            ? (!attackerInTower || !defenderInTower)
            : (attackerInTower || defenderInTower)) {
            return 0;
        }
    }
    if (zombie_maker(magr) && zombie_form(mdef.data) !== NON_PM) {
        if (magr.mgenmklev && mdef.mgenmklev) return 0;
        if (!on_level(level, state.stronghold_level)
            && !unique_corpstat(magr.data)
            && !unique_corpstat(mdef.data)) {
            return ALLOW_M | ALLOW_TM;
        }
    }
    return 0;
}

// C ref: mon.c mm_aggression(). This is deliberately symmetric only for the
// cases C marks as two-way; ordinary monster pairings remain non-aggressive.
export function mm_aggression(magr, mdef, state = game) {
    const mndx = monsndx(magr.data);
    if (magr.mtame && mdef.mtame) return 0;
    if ((mndx === PM_PURPLE_WORM || mndx === PM_BABY_PURPLE_WORM)
        && monsndx(mdef.data) === PM_SHRIEKER) {
        return ALLOW_M | ALLOW_TM;
    }
    return mm_2way_aggression(magr, mdef, state)
        | mm_2way_aggression(mdef, magr, state);
}

// C ref: mon.c mm_displacement(). count_wsegs() is the worm.c helper that
// counts visible tail segments; a worm with only its hidden head segment is
// therefore displaceable, while a multi-location worm is not.
export function mm_displacement(magr, mdef, state = game) {
    const pa = magr.data;
    const pd = mdef.data;
    if (is_displacer(pa)
        && (!is_displacer(pd) || magr.m_lev > mdef.m_lev)
        && !(magr.mx !== mdef.mx && magr.my !== mdef.my
            && NODIAG(monsndx(pd)))
        && !mdef.mtrapped
        && (!mdef.wormno || !count_wsegs(mdef, state))
        && (is_rider(pa) || pa.msize >= pd.msize)) {
        return ALLOW_MDISP;
    }
    return 0;
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

function heroHallucinating(state) {
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

function coordinateDescriptionForPrompt(x, y, state, mode) {
    const dx = x - (state.u?.ux ?? 0);
    const dy = y - (state.u?.uy ?? 0);
    if (mode === GPCOORDS_MAP) return `<${x},${y}>`;
    if (mode === GPCOORDS_SCREEN) {
        return `[${String(y + 2).padStart(2, '0')},${String(x).padStart(2, '0')}]`;
    }
    const full = mode === GPCOORDS_COMFULL;
    if (!dx && !dy) return '(here)';
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        const vertical = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
        const horizontal = dx < 0 ? 'west' : dx > 0 ? 'east' : '';
        return `(${vertical}${horizontal})`;
    }
    const parts = [];
    if (dy) parts.push(`${Math.abs(dy)}${dy < 0
        ? (full ? 'north' : 'n') : (full ? 'south' : 's')}`);
    if (dx) parts.push(`${Math.abs(dx)}${dx < 0
        ? (full ? 'west' : 'w') : (full ? 'east' : 'e')}`);
    return `(${parts.join(',')})`;
}

// C ref: mon.c pickvampshape(). The initial form is selected from the true
// vampire species, then a genocided result or a failed 25% shape-change roll
// returns the true form. The Vlad special-item guard deliberately skips the
// wolf and bat/fog draws, matching the fall-through structure in C.
export function pickvampshape(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const uppercaseOnly = on_level(state.u?.uz, state.rogue_level);
    let mndx = monster.cham;
    let wolfchance = 10;
    switch (monster.cham) {
    case PM_VLAD_THE_IMPALER:
        if (mon_has_special(monster)) break;
        wolfchance = 3;
        // FALLTHROUGH
    case PM_VAMPIRE_LEADER:
        if (!random.rn2(wolfchance) && !uppercaseOnly
            && !is_pool_or_lava(monster.mx, monster.my, state)) {
            mndx = PM_WOLF;
            break;
        }
        // FALLTHROUGH
    case PM_VAMPIRE:
        mndx = !random.rn2(4) && !uppercaseOnly
            ? PM_FOG_CLOUD : PM_VAMPIRE_BAT;
        break;
    default:
        break;
    }
    const mvitals = state.svm?.mvitals ?? state.mvitals ?? [];
    if ((mvitals[mndx]?.mvflags ?? 0) & G_GENOD
        || (monster.data !== state.mons?.[monster.cham]
            && !random.rn2(4))) {
        return monster.cham;
    }
    return mndx;
}

// C ref: mon.c isspecmon(). Quest leader identity is stored separately from
// the ordinary special-monster flags, so all four predicates remain visible.
export function isspecmon(monster, state = game) {
    const leaderId = state.svq?.quest_status?.leader_m_id;
    return Boolean(monster.isshk || monster.ispriest || monster.isgd
        || (Number.isInteger(monster.m_id)
            && Number.isInteger(leaderId)
            && monster.m_id === leaderId));
}

// C ref: mon.c validspecmon(). A special monster may only become a form that
// has a head and does not reject taking items; ordinary forms use the shared
// accept_newcham_form() catalog checks.
export function validspecmon(monster, mndx, state = game) {
    if (mndx === NON_PM) return true;
    const species = accept_newcham_form(monster, mndx, state);
    if (!species) return false;
    if (isspecmon(monster, state)
        && (notake(species) || !has_head(species))) return false;
    return true;
}

// C ref: mon.c validvamp(). The mndxRef object carries C's int *mndx_p so
// vampire class fallback can replace the requested form in place.
export function validvamp(monster, mndxRef, monclass, state = game) {
    if (!mndxRef || !Number.isInteger(mndxRef.value))
        throw new TypeError('validvamp requires an mndx reference');
    let mndx = mndxRef.value;
    if (!is_vampshifter(monster)) return validspecmon(monster, mndx, state);
    if (monster.cham === PM_VLAD_THE_IMPALER
        && mon_has_special(monster)) {
        mndxRef.value = PM_VLAD_THE_IMPALER;
        return true;
    }
    if (ismnum(mndx) && is_shapeshifter(state.mons[mndx])) {
        mndxRef.value = monster.cham;
        return true;
    }
    if (mndx === PM_WOLF) return monster.cham !== PM_VAMPIRE;
    if (mndx === PM_FOG_CLOUD || mndx === PM_VAMPIRE_BAT) return true;
    switch (monclass) {
    case S_VAMPIRE:
        mndx = monster.cham;
        break;
    case S_BAT:
        mndx = PM_VAMPIRE_BAT;
        break;
    case S_VORTEX:
        mndx = PM_FOG_CLOUD;
        break;
    case S_DOG:
        if (monster.cham !== PM_VAMPIRE) {
            mndx = PM_WOLF;
            break;
        }
        // FALLTHROUGH
    default:
        mndx = NON_PM;
        break;
    }
    mndxRef.value = mndx;
    return mndx !== NON_PM;
}

// C ref: mon.c wiz_force_cham_form(). The getlin operation is injected for
// replay and unit tests; the normal caller reaches windows.c getlin().
export async function wiz_force_cham_form(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { d, rn1, rn2, rnd, rne };
    const input = rawEnv.getlin ?? getlin;
    const message = rawEnv.message ?? ttyPline;
    const mode = state.iflags?.getpos_coords === GPCOORDS_NONE
        || state.iflags?.getpos_coords == null
        ? GPCOORDS_MAP : state.iflags.getpos_coords;
    let prompt = `Change ${noit_mon_nam(monster, state, rawEnv)}`;
    const suffix = ` @ ${coordinateDescriptionForPrompt(
        monster.mx,
        monster.my,
        state,
        mode,
    )} into what?`;
    const promptLength = prompt.length + suffix.length;
    if (promptLength >= QBUFSZ) {
        prompt = prompt.slice(0, prompt.length - (promptLength - (QBUFSZ - 1)));
    }
    prompt += suffix;

    let buf = '';
    let prevbuf = '';
    let monclass = 0;
    let mndx = NON_PM;
    let tryct = 5;
    do {
        if (tryct === 4
            && prompt.length + ' kind of monster'.length < QBUFSZ) {
            prompt = `${prompt.slice(0, -1)} kind of monster?`;
        }
        monclass = 0;
        buf = mungspaces(await input(prompt, state));
        if (buf === '\x1b') break;
        if (buf === '*' || buf.toLowerCase() === 'random') {
            mndx = NON_PM;
            break;
        }
        const mndxRef = { value: name_to_mon(buf, { state }) };
        mndx = mndxRef.value;
        if (mndx === NON_PM) {
            monclass = name_to_monclass(buf, mndxRef, { state });
            mndx = mndxRef.value;
            if (monclass && mndx === NON_PM) {
                mndx = mkclass_poly(monclass, { state, random });
                mndxRef.value = mndx;
            }
        }
        if (ismnum(mndx) && validvamp(monster, mndxRef, monclass, state)) {
            mndx = mndxRef.value;
            break;
        }
        mndx = NON_PM;
        await message("It can't become that.", state, rawEnv);
    } while (--tryct > 0);
    if (!tryct) await message(thats_enough_tries, state, rawEnv);
    const finalRef = { value: mndx };
    if (is_vampshifter(monster)
        && !validvamp(monster, finalRef, monclass, state)) {
        mndx = pickvampshape(monster, { state, random });
    } else {
        mndx = finalRef.value;
    }
    // EDIT_GETLIN is disabled in this build, so C's nhUse(prevbuf) branch is
    // absent. Keep the local to document that the previous answer is scoped
    // to that compile-time branch.
    void prevbuf;
    return mndx;
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
            const mndx = pickvampshape(monster, shapeEnv);
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

function applyNewWereForm(monster, target, state, redrawSquare) {
    set_mon_data(monster, target, state);
    if (helpless(monster)) {
        monster.msleeping = false;
        monster.mfrozen = 0;
        monster.mcanmove = true;
    }
    const healing = Math.trunc((monster.mhpmax - monster.mhp) / 4);
    monster.mhp = Math.min(monster.mhp + healing, monster.mhpmax);
    redrawSquare(monster.mx, monster.my, state);
    return true;
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
        && !heroHallucinating(state)) {
        const targetName = is_human(target)
            ? 'human'
            : (target.pmnames?.[2] ?? '').slice(4);
        await normalized.message(
            `${distressMonnam(monster)} changes into a ${targetName}.`,
            state,
            normalized,
        );
    }

    return applyNewWereForm(
        monster,
        target,
        state,
        (x, y, owner) => normalized.redrawSquare(x, y, owner, normalized),
    );
}

// C ref: mon.c m_respond_shrieker(). makemon() ignores its return here, but
// its creation side effects and random calls remain part of the shriek.
async function m_respond_shrieker(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const message = rawEnv.message
        ?? (rawEnv.planning ? async () => {} : ttyPline);
    if (!distressDeaf(state)) {
        await message(`${Monnam(monster, state)} shrieks.`, state, rawEnv);
        const stopOccupation = rawEnv.stopOccupation;
        if (typeof stopOccupation === 'function')
            await stopOccupation({ ...rawEnv, state });
    }
    if (!random.rn2(10)) {
        const strong = state.mons?.[PM_PURPLE_WORM]?.difficulty
            > Math.trunc((level_difficulty(state) + state.u.ulevel) / 2);
        const species = random.rn2(13)
            ? null
            : state.mons?.[strong ? PM_BABY_PURPLE_WORM : PM_PURPLE_WORM];
        const makeMonster = rawEnv.makemon ?? makemon_runtime;
        await makeMonster(species, 0, 0, 0, {
            ...rawEnv,
            state,
            random,
            message,
            norepMessage: rawEnv.norepMessage ?? message,
            hooks: {
                ...(rawEnv.hooks ?? {}),
                ...(rawEnv.stopOccupation
                    ? { stopOccupation: rawEnv.hooks?.stopOccupation
                        ?? ((_monster, hookEnv) =>
                            rawEnv.stopOccupation(hookEnv)) }
                    : {}),
            },
        });
    }
    // wizard.c aggravate() has no return value. Its full tower and paralysis
    // behavior is still unported, so retain the source-ordered gap here.
    note_unported('wizard.c aggravate');
}

// C ref: mon.c m_respond_medusa(). gazemu() is outside this span and returns
// a value that C explicitly discards; recording the gap preserves the call
// boundary without inventing its gaze damage or random draws.
function m_respond_medusa(monster) {
    for (const attack of monster.data?.mattk ?? []) {
        if (attack.aatyp === AT_GAZE) {
            note_unported('mhitu.c gazemu');
            break;
        }
    }
}

// C ref: mon.c m_respond(). The predicates are deliberately kept in source
// order: an adjacent shrieker can summon before the Medusa and Erinys tests.
export async function m_respond(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (monster.data?.msound === MS_SHRIEK
        && !um_dist(monster.mx, monster.my, 1, state)) {
        await m_respond_shrieker(monster, rawEnv);
    }
    if (monster.data === state.mons?.[PM_MEDUSA]
        && couldsee(monster.mx, monster.my, state)) {
        m_respond_medusa(monster);
    }
    if (monster.data === state.mons?.[PM_ERINYS]
        && !monster.mpeaceful && m_canseeu(monster, state)) {
        note_unported('wizard.c aggravate');
    }
}

// C ref: apply.c um_dist(). The hero is outside the square's Chebyshev radius
// when either axis exceeds n.
function um_dist(x, y, n, state) {
    return Math.abs(state.u.ux - x) > n || Math.abs(state.u.uy - y) > n;
}

// C ref: mon.c qst_guardians_respond(). The role's guardian species is the
// JavaScript equivalent of quest_info(MS_GUARDIAN), even after a shape change.
export async function qst_guardians_respond(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const message = rawEnv.message
        ?? (rawEnv.planning ? async () => {} : ttyPline);
    const qGuardian = state.mons?.[state.urole?.guardnum];
    let gotMad = 0;
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.mhp < 1) continue;
        if (monster.data === qGuardian && monster.mpeaceful) {
            monster.mpeaceful = false;
            if (canseemon(monster, state)) ++gotMad;
        }
    }
    if (gotMad && !heroHallucinating(state)) {
        const who = gotMad > 1
            ? makeplural(pmname(qGuardian, NEUTRAL))
            : pmname(qGuardian, NEUTRAL);
        await message(
            `The ${who} ${vtense(who, 'appear')} to be angry too...`,
            state,
            rawEnv,
        );
    }
}

function responseMessage(text, monster, state, rawEnv) {
    const message = rawEnv.message
        ?? (rawEnv.planning ? async () => {} : ttyPline);
    return message(messageAt(text, monster.mx, monster.my, state), state, rawEnv);
}

function responseFleeMessage(monster, detail, rawEnv) {
    const state = rawEnv.state ?? game;
    const name = Monnam(monster, state);
    let text;
    switch (detail.kind) {
    case 'immobile-flinch':
        text = `${name} seems to flinch.`;
        break;
    case 'frightened':
        text = `${name} is frightened.`;
        break;
    case 'painful-light':
        text = `${name} flees from the painful light of `
            + '[its imagination?].';
        break;
    case 'bright-light':
        text = '"Bright light!"';
        break;
    default:
        text = `${name} turns to flee.`;
        break;
    }
    return responseMessage(text, monster, state, rawEnv);
}

// C ref: mon.c peacefuls_respond(). This is asynchronous because the port's
// message and monster-noise owners are asynchronous; all source predicates,
// draws, and state writes remain in C order.
export async function peacefuls_respond(attacked, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const message = rawEnv.message
        ?? (rawEnv.planning ? async () => {} : ttyPline);
    const attackedIndex = monsndx(attacked.data);
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.mhp < 1 || monster === attacked) continue;
        if (mindless(monster.data) || !monster.mpeaceful
            || !couldsee(monster.mx, monster.my, state)
            || monster.msleeping || !monster.mcansee
            || !m_canseeu(monster, state)) continue;

        let buf = '';
        let exclaimed = false;
        let needPunct = false;
        if (humanoid(monster.data) || monster.isshk || monster.ispriest) {
            if (is_watch(monster.data)) {
                await message('"Halt!  You\'re under arrest!"', state, rawEnv);
                await angry_guards(
                    distressDeaf(state),
                    { ...rawEnv, state, message },
                );
            } else {
                if (!distressDeaf(state) && !random.rn2(5)) {
                    const gasp = maybe_gasp(monster, state, random);
                    if (gasp) {
                        if (gasp.slice(0, 4).toLowerCase() === 'gasp') {
                            buf = `${Monnam(monster, state)} gasps`;
                            needPunct = true;
                        } else {
                            buf = `${Monnam(monster, state)} exclaims "${gasp}"`;
                        }
                        exclaimed = true;
                    }
                }
                const isLeader = monster.data === state.mons?.[state.urole?.ldrnum];
                const isOwnGuardian = attacked.data
                    === state.mons?.[state.urole?.guardnum];
                if (monster.isshk || monster.ispriest
                    || (isLeader && !isOwnGuardian)) {
                    if (exclaimed)
                        await responseMessage(`${buf} then shrugs.`, monster,
                            state, rawEnv);
                    continue;
                }
                if (monster.data.mlevel < random.rn2(10)
                    && monster.data !== state.mons?.[state.urole?.guardnum]) {
                    const alreadyFleeing = monster.mflee || monster.mfleetim;
                    await monflee(monster, random.rn2(50) + 25, true,
                        !exclaimed, {
                            ...rawEnv,
                            state,
                            random,
                            canSeeMonster: rawEnv.canSeeMonster
                                ?? ((subject) => canseemon(subject, state)),
                            fleeMessage: rawEnv.fleeMessage
                                ?? responseFleeMessage,
                        });
                    if (exclaimed) {
                        if (state.flags?.verbose && !alreadyFleeing) {
                            buf += ' and then turns to flee.';
                            needPunct = false;
                        }
                    } else {
                        exclaimed = true;
                    }
                }
                if (buf)
                    await responseMessage(buf + (needPunct ? '.' : ''),
                        monster, state, rawEnv);
                if (!monster.mtame) {
                    monster.mpeaceful = false;
                    monster.mstrategy &= ~STRAT_WAITMASK;
                    adjalign(-1, state);
                    if (!exclaimed)
                        await responseMessage(`${Monnam(monster, state)} gets angry!`,
                            monster, state, rawEnv);
                }
            }
        } else if (monster.data.mlet === attacked.data.mlet
            && big_little_match(attackedIndex, monsndx(monster.data), state)
            && !random.rn2(3)) {
            if (!random.rn2(4)) {
                await growl(monster, state, random);
                exclaimed = state.iflags?.last_msg === PLNMSG_GROWL;
            }
            if (random.rn2(6)) {
                const alreadyFleeing = monster.mflee || monster.mfleetim;
                await monflee(monster, random.rn2(25) + 15, true,
                    !exclaimed, {
                        ...rawEnv,
                        state,
                        random,
                        canSeeMonster: rawEnv.canSeeMonster
                            ?? ((subject) => canseemon(subject, state)),
                        fleeMessage: rawEnv.fleeMessage
                            ?? responseFleeMessage,
                    });
                if (exclaimed && !alreadyFleeing)
                    await message('And then starts to flee.', state, rawEnv);
            }
        }
    }
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
        // C ref: mon.c:4339-4343. Mimics come out of hiding, but a disguised
        // Wizard (M_AP_MONSTER) keeps his disguise.
        if (((monster.m_ap_type ?? 0) & M_AP_TYPMASK) !== M_AP_MONSTER) {
            seemimic(monster, state);
        }
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
// sleep and wait-strategy state, pet whistle tracking, and buried-zombie
// disturbance are observable.
export async function wake_nearto_core(
    x,
    y,
    distance,
    petcall,
    rawEnv = {},
) {
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
            || (distance !== 0
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
        if (state.context?.mon_moving || !petcall) continue;
        if (monster.mtame) {
            if (!monster.isminion) {
                monster.mextra ??= {};
                monster.mextra.edog ??= {};
                monster.mextra.edog.whistletime = state.moves;
            }
            mon_track_clear(monster);
        }
    }
    await disturbBuriedZombies(x, y, rawEnv);
}

// C ref: mon.c wake_nearby() (4366-4370). Accept the old object-only call
// shape used by existing JavaScript callers as well as C's explicit boolean.
export async function wake_nearby(petcallOrEnv = false, rawEnv = {}) {
    const env = petcallOrEnv && typeof petcallOrEnv === 'object'
        ? petcallOrEnv : rawEnv;
    const petcall = typeof petcallOrEnv === 'boolean'
        ? petcallOrEnv : false;
    const state = env.state ?? game;
    return wake_nearto_core(state.u.ux, state.u.uy, state.u.ulevel * 20,
        petcall, { ...env, state });
}

export async function wake_nearto(x, y, distance, rawEnv = {}) {
    return wake_nearto_core(x, y, distance, false, rawEnv);
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

function restoreWereShapeSynchronously(monster, state, rawEnv) {
    const normalized = normalizedDistressEnv({ ...rawEnv, state });
    const target = preflightNewWere(monster, normalized);
    if (!target) return false;

    if (normalized.canSeeMonster(monster, normalized)
        && !heroHallucinating(state)) {
        const targetName = is_human(target)
            ? 'human'
            : (target.pmnames?.[2] ?? '').slice(4);
        const pending = normalized.message(
            distressMonnam(monster) + ' changes into a ' + targetName + '.',
            state,
            normalized,
        );
        // normal_shape() is a synchronous C callback used by iter_mons().
        // Preserve its state-change ordering while allowing the shared TTY
        // message adapter to finish its asynchronous display work afterward.
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    }

    return applyNewWereForm(
        monster,
        target,
        state,
        (x, y, owner) => normalized.redrawSquare(x, y, owner, normalized),
    );
}

// C ref: mon.c normal_shape() (4434-4464). Revert a chameleon or vampire to
// its recorded natural form, turn a werecreature back into human form, and
// reveal a mimic. The C caller ignores newcham()/new_were() return values, but
// their state transitions and the saved cancellation bit remain observable.
export function normal_shape(mon, state = game, rawEnv = {}) {
    const mcham = Number(mon.cham);
    if (ismnum(mcham)) {
        const mcan = mon.mcan;
        newcham(mon, state.mons?.[mcham], { ...rawEnv, state });
        mon.cham = NON_PM;
        // newcham() may uncancel a polymorphing monster; C overrides that.
        if (mcan) mon.mcan = 1;
        newsym(mon.mx, mon.my);
    }
    if (is_were(mon.data) && mon.data.mlet !== S_HUMAN)
        restoreWereShapeSynchronously(mon, state, rawEnv);

    if (M_AP_TYPE(mon) !== M_AP_NOTHING) {
        if (!mon.meating) {
            if (M_AP_TYPE(mon) !== M_AP_MONSTER) mon.msleeping = 1;
            seemimic(mon, state);
        } else {
            finish_meating(mon, {
                redraw: (x, y) => newsym(x, y),
            });
        }
    }
}

// C ref: mon.c rescham() (4621-4626). Protection from shape changers applies
// to every living monster currently on the level, including mimics.
export function rescham(state = game, rawEnv = {}) {
    iter_mons(
        (monster) => normal_shape(monster, state, rawEnv),
        state,
    );
}

// C ref: mon.c m_restartcham() (4629-4638). A cancelled shapechanger stays
// natural, while a sleeping mimic gets its disguise rebuilt before redraw.
export function m_restartcham(mon, state = game, rawEnv = {}) {
    if (!mon.mcan) mon.cham = pm_to_cham(monsndx(mon.data), state);
    if (mon.data?.mlet === S_MIMIC && mon.msleeping) {
        set_mimic_sym(mon, {
            ...rawEnv,
            state,
            random: rawEnv.random ?? { rn2 },
        });
        newsym(mon.mx, mon.my);
    }
}

// C ref: mon.c restartcham() (4640-4644). Re-enable shape changing and
// hiding for every living, on-map monster.
export function restartcham(state = game, rawEnv = {}) {
    iter_mons(
        (monster) => m_restartcham(monster, state, rawEnv),
        state,
    );
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

// C ref: mon.c m_calcdistress(). The per-monster callback handles the
// once-per-turn upkeep after mcalcdistress() has selected its downstream
// operation owners.
export async function m_calcdistress(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const visionRecalc = rawEnv.visionRecalc ?? vision_recalc;
    const minLiquid = rawEnv.minLiquid ?? minliquid;
    const decideToShapeshift = rawEnv.decideToShapeshift
        ?? decide_to_shapeshift;
    const wereChange = rawEnv.wereChange ?? were_change;

    // C checks immobile monsters for liquid effects before applying any of
    // the ordinary once-per-turn upkeep. A liquid effect can kill the
    // monster, so the callback returns immediately when it reports death.
    if (!monster.data?.mmove) {
        if (state.vision_full_recalc)
            await visionRecalc(0, { ...rawEnv, state });
        if (await minLiquid(monster, { ...rawEnv, state })) return;
    }

    mon_regen(monster, false, state);

    // C calls were_change() after shapechanging; a new were form therefore
    // reaches the lycanthropy check in the same callback.
    if (ismnum(monster.cham))
        await decideToShapeshift(monster, { ...rawEnv, state });
    await wereChange(monster, { ...rawEnv, state });

    if (monster.mblinded && !--monster.mblinded)
        monster.mcansee = true;
    if (monster.mfrozen && !--monster.mfrozen)
        monster.mcanmove = true;
    if (monster.mfleetim && !--monster.mfleetim)
        monster.mflee = false;

    // FIXME: C's mtmp->mlstmv ought to be updated here.
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
        ? requiredDistressOperation(env, 'wereChange')
        : env.wereChange ?? were_change;

    for (const monster of monsters) {
        await m_calcdistress(monster, {
            ...env,
            state,
            visionRecalc,
            minLiquid,
            decideToShapeshift,
            wereChange,
        });
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

// C ref: mon.c relmon() (2558-2594), the replacement path used by replmon().
// dog.c owns the migration variant of this same C helper; this copy keeps the
// null-list arm that removes an old monster permanently from the live list.
function relmon(mon, state = game) {
    mon_leaving_level(mon, state);

    let previous = null;
    let current = state.level?.monlist ?? null;
    while (current && current !== mon) {
        previous = current;
        current = current.nmon;
    }
    if (!current) throw new Error('relmon: monster is not in the list');
    if (previous) previous.nmon = mon.nmon;
    else state.level.monlist = mon.nmon;
    mon.nmon = null;
}

// C ref: mon.c replmon() (2515-2556). Replace a live monster record while
// preserving the inventory and the references held by combat, riding, and
// swallowing state. The worm-tail and shopkeeper helpers are still outside
// this port; both C calls discard their return value, so they are explicit
// gaps rather than invented state changes.
export function replmon(mtmp, mtmp2, state = game) {
    for (let obj = mtmp2.minvent; obj; obj = obj.nobj) {
        if (obj.where !== undefined && obj.where !== OBJ_MINVENT)
            throw new Error('replmon: minvent inconsistency');
        if (obj.ocarry !== undefined && obj.ocarry !== mtmp)
            throw new Error('replmon: minvent inconsistency');
        obj.ocarry = mtmp2;
    }
    mtmp.minvent = null;

    state.context ??= {};
    state.context.polearm ??= {};
    if (state.context.polearm.hitmon === mtmp)
        state.context.polearm.hitmon = mtmp2;

    relmon(mtmp, state);

    if (mtmp !== state.u?.usteed)
        place_monster(mtmp2, mtmp2.mx, mtmp2.my, state);
    if (mtmp2.wormno)
        note_unported('worm.c place_wsegs');
    if (emits_light(mtmp2.data)) {
        new_light_source(
            mtmp2.mx,
            mtmp2.my,
            emits_light(mtmp2.data),
            LS_MONSTER,
            mtmp2,
            state,
        );
        del_light_source(LS_MONSTER, mtmp, state);
    }
    mtmp2.nmon = state.level.monlist;
    state.level.monlist = mtmp2;
    if (state.u?.ustuck === mtmp) set_ustuck(mtmp2, state);
    if (state.u?.usteed === mtmp) state.u.usteed = mtmp2;
    if (mtmp2.isshk)
        replshk(mtmp, mtmp2, state);
    dealloc_monst(mtmp);
    return mtmp2;
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

// C ref: mon.c dealloc_mextra() (2649-2674). JavaScript has garbage
// collection rather than individual frees, but clearing every owned record
// preserves the C lifetime boundary for callers that retain the monster
// object briefly while its list links are being repaired.
export function dealloc_mextra(mon) {
    const extra = mon.mextra;
    if (!extra) return;
    for (const field of [
        'mgivenname', 'egd', 'epri', 'eshk', 'emin', 'edog', 'ebones',
    ]) {
        if (extra[field]) extra[field] = null;
    }
    extra.mcorpsenm = NON_PM;
    mon.mextra = null;
}

// C ref: mon.c dealloc_monst() (2676-2692). The object is zeroed in place so
// stale references observe the same cleared storage that C leaves behind
// before free().
export function dealloc_monst(mon) {
    if (mon.nmon) {
        throw new Error('dealloc_monst with nmon still linked');
    }
    if (mon.mextra) dealloc_mextra(mon);
    Object.assign(mon, newMonster());
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

// C ref: mon.c mnearto() (4019-4085). Put a monster at or near the requested
// coordinate, optionally moving an occupant aside. A failed destination
// follows C's overcrowding recovery path.
export function mnearto(monster, x, y, moveOther, rlocflags, state = game) {
    if (monster.mx === x && monster.my === y
        && m_at(x, y, state) === monster) return 1;

    let other = null;
    if (moveOther) other = m_at(x, y, state);
    if (other) {
        mon_leaving_level(other, state);
        other.mx = 0;
        other.my = 0;
        other.mstate = (other.mstate ?? 0) | MON_OFFMAP;
    }

    let destination = { x, y };
    if (!goodpos(x, y, monster, 0, { state })) {
        destination = enexto(x, y, monster.data, { state });
        if (!destination || !isok(destination.x, destination.y)) {
            if (other) deal_with_overcrowding(other, state);
            return 0;
        }
    }
    rloc_to(monster, destination.x, destination.y, { state, rlocflags });

    if (moveOther && other) {
        if (!mnearto(other, x, y, false, rlocflags, state))
            deal_with_overcrowding(other, state);
        return 2;
    }
    return 1;
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
    if (mtmp.isshk) shkgone(mtmp, state);
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

// C ref: mon.c set_mon_min_mhpmax() (2808-2823). A life-saved monster or a
// vampire that returns to its base form cannot be left with a zero maximum.
export function set_mon_min_mhpmax(mon, minimum_mhpmax) {
    if (mon.mhpmax < mon.m_lev + 1) mon.mhpmax = mon.m_lev + 1;
    if (mon.mhpmax < minimum_mhpmax) mon.mhpmax = minimum_mhpmax;
}

function monsterUnaware(state) {
    return Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || state.u?.uhs === FAINTED);
}

// C ref: mon.c vamprises() (2890-2994). A shifted vampire revives in its
// natural form, then breaks a door or its trapped door if necessary. The
// existing explicit-target vampire shape helper supplies newcham()'s form,
// HP, light, and redraw work for this supported monster state.
export async function vamprises(mtmp, state = game, env = {}) {
    const mndx = mtmp.cham;
    if (!ismnum(mndx) || mndx === monsndx(mtmp.data)
        || (state.svm.mvitals[mndx].mvflags & G_GENOD)) return false;

    const message = env.message ?? ttyPline;
    const unaware = monsterUnaware(state);
    const specMon = nonliving(mtmp.data)
        || noncorporeal(mtmp.data)
        || amorphous(mtmp.data);
    const specDeath = Boolean(state.gd?.disintegested)
        || noncorporeal(mtmp.data)
        || amorphous(mtmp.data);
    const x = mtmp.mx;
    const y = mtmp.my;
    const action = `${unaware ? 'you dream that ' : ''}`
        + `${x_monnam(mtmp, ARTICLE_THE, specMon ? null : 'seemingly dead',
            SUPPRESS_INVISIBLE | AUGMENT_IT, false, state, env)} `
        + `${unaware ? '' : 'suddenly '}`
        + `${specDeath ? 'reconstitutes' : 'transforms'} and rises as`;

    mtmp.mcanmove = true;
    mtmp.mfrozen = 0;
    set_mon_min_mhpmax(mtmp, 10);
    mtmp.mhp = mtmp.mhpmax;
    if (mtmp === state.u?.ustuck) {
        if (state.u.uswallow)
            await expels(mtmp, {
                ...env,
                state,
                expulsionMessage: false,
            });
        else
            await import('./polyself.js').then(({ uunstick }) => uunstick(state));
    }

    const revived = newcham(mtmp, state.mons[mndx], { ...env, state });
    if (!revived) return mtmp.mhp >= 1;
    mtmp.cham = mtmp.data === state.mons[mndx] ? NON_PM : mndx;

    if (canSpotMonster(mtmp, state)) {
        await message(
            messageAt(
                `${upstart(action)} ${x_monnam(
                    mtmp,
                    ARTICLE_A,
                    null,
                    SUPPRESS_NAME | SUPPRESS_IT | SUPPRESS_INVISIBLE,
                    false,
                    state,
                    env,
                )}!`,
                x,
                y,
                state,
            ),
            state,
            env,
        );
        state.gv ??= {};
        state.gv.vamp_rise_msg = true;
    }

    if (closed_door(x, y, state)) {
        const door = state.level.at(x, y);
        const trapped = Boolean((door.doormask ?? door.flags ?? 0) & D_TRAPPED);
        const seen = cansee(x, y, state);
        state.msg_xy = { x, y };
        if (!seen) {
            const heard = youHear(
                trapped ? 'an explosion.' : 'a door being smashed.',
                state,
            );
            if (heard) await message(messageAt(heard, x, y, state), state, env);
        } else if (!canSpotMonster(mtmp, state)) {
            await message(
                messageAt(
                    trapped ? 'You see a door exploding.'
                        : 'You see a door being smashed.',
                    x,
                    y,
                    state,
                ),
                state,
                env,
            );
        } else if (!unaware) {
            await message(
                messageAt(
                    `The door is smashed${trapped ? ' and it explodes!' : '.'}`,
                    x,
                    y,
                    state,
                ),
                state,
                env,
            );
        }
        state.msg_xy = null;
        door.doormask = D_NODOOR;
        door.flags = D_NODOOR;
        recalc_block_point(x, y, state);
        if (trapped) {
            state.flags ??= {};
            const oldVerbose = state.flags.verbose;
            state.flags.verbose = false;
            let trapKilled;
            try {
                trapKilled = await mb_trapped(mtmp, seen, { ...env, state });
            } finally {
                state.flags.verbose = oldVerbose;
            }
            if (trapKilled && canSpotMonster(mtmp, state) && !unaware) {
                await message(
                    messageAt(`${Monnam(mtmp, state)} is destroyed!`, x, y, state),
                    state,
                    env,
                );
            }
        }
    }
    newsym(x, y, state);
    return true;
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

// C ref: mon.c anger_quest_guardians() (3072-3077). The quest guardian
// species is the role's guardnum, not the guardian's current shape.
export function anger_quest_guardians(mtmp, state = game, env = {}) {
    if (mtmp.data === state.mons?.[state.urole?.guardnum])
        setmangry(mtmp, true, { ...env, state });
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
// call, are read by vamprises() and by the life-saved return at 3558.
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
    if (is_vampshifter(mtmp) && await vamprises(mtmp, state, env)) return;

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
export async function mondied(mdef, state = game, env = {}) {
    await mondead(mdef, state, env);
    if (mdef.mhp >= 1) return; /* !DEADMONSTER(): "lifesaved" */

    /* "this assumes that the dead monster's map coordinates remain
       accurate" */
    if (corpse_chance(mdef, null, false, state, env)
        && (accessible(mdef.mx, mdef.my, state)
            || is_pool(mdef.mx, mdef.my, state)))
        make_corpse(mdef, CORPSTAT_NONE, state, env);
}

// C ref: mon.c monstone() (3287-3374). Drop a statue or rock and remove the
// petrified monster. Object extraction and corpse construction retain C's
// source order: inventory is detached before the statue is made, and the
// dead monster is detached only after the square has been redrawn.
export async function monstone(mdef, state = game, env = {}) {
    const random = env.random ?? { rn2 };
    const x = mdef.mx;
    const y = mdef.my;
    let wasinside = false;

    /* A shifted vampire or sandestin reverts instead of becoming a statue. */
    if (!await vamp_stone(mdef, state, env)) return;

    mdef.mhp = 0;
    lifesaved_monster(mdef, state, env);
    if (mdef.mhp >= 1) return;
    mdef.mtrapped = 0;

    let statue;
    if (mdef.data.msize > MZ_TINY
        || !random.rn2(2 + ((mdef.data.geno & G_FREQ) > 2 ? 1 : 0))) {
        let oldminvent = null;
        while (mdef.minvent) {
            const obj = mdef.minvent;
            extract_from_minvent(mdef, obj, true, true, { ...env, state });
            if (obj.otyp === BOULDER
                || obj_resists(obj, 0, 0, { ...env, state, random })) {
                if (flooreffects(obj, x, y, 'fall', { ...env, state }))
                    continue;
                place_object(obj, x, y,
                             objectGenerationEnv({ ...env, state, random }));
            } else {
                if (obj.lamplit) end_burn(obj, true, { ...env, state });
                obj.nobj = oldminvent;
                oldminvent = obj;
            }
        }

        let corpstatflags = CORPSTAT_NONE;
        if (mdef.female) corpstatflags |= CORPSTAT_FEMALE;
        else if (!is_neuter(mdef.data)) corpstatflags |= CORPSTAT_MALE;
        if (mdef.data.geno & G_UNIQ) corpstatflags |= CORPSTAT_HISTORIC;
        statue = mkcorpstat(
            STATUE,
            mdef,
            mdef.data,
            x,
            y,
            corpstatflags,
            objectGenerationEnv({ ...env, state, random }),
        );
        if (has_mgivenname(mdef))
            statue = oname(statue, mdef.mextra?.mgivenname ?? mdef.mgivenname,
                           ONAME_NO_FLAGS, { ...env, state });
        while (oldminvent) {
            const obj = oldminvent;
            oldminvent = obj.nobj;
            obj.nobj = null;
            add_to_container(
                statue,
                obj,
                objectGenerationEnv({ ...env, state, random }),
            );
        }
        statue.owt = weight(statue, { ...env, state });
    } else {
        statue = mksobj_at(
            ROCK,
            x,
            y,
            true,
            false,
            objectGenerationEnv({ ...env, state, random }),
        );
    }

    stackobj(statue, objectGenerationEnv({ ...env, state, random }));
    if (glyph_is_invisible(state.level.at(x, y).glyph))
        unmap_object(x, y, state);
    if (cansee(x, y, state)) newsym(x, y, state);
    if (engulfing_u(mdef, state)) wasinside = true;
    await mondead(mdef, state, env);
    if (wasinside && monsterDigests(mdef.data)) {
        const message = env.message ?? ttyPline;
        await message(
            `You ${u_locomotion('jump', state)} through an opening in the new `
                + `${xnameFresh(statue, state)}.`,
            state,
            env,
        );
    }
}

// C ref: mondata.h digests(). It is a macro in C, so keeping this local avoids
// creating a second owner for the mondata.js attack-table primitive.
function monsterDigests(species) {
    return Boolean(dmgtype_fromattack(species, AD_DGST, AT_ENGL));
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
// C stores the disintegration test in gd.disintegested, a global, which
// vamprises() reads while mondead() handles a shape-shifted vampire.
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
    state.gd ??= {};
    state.gd.disintegested = disintegested;
    if (disintegested)
        await mondead(mdef, state, env); /* "never leaves a corpse" */
    else
        await mondied(mdef, state, env); /* "and maybe leaves a corpse" */
    state.gd.disintegested = false;

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
// The four arms C guards on mtmp->mtame are ported together, because they are
// spread through the function and a hero who kills a pet reaches all of them
// on one move: the "poor <pet>" message at 3502-3511, EDOG()->killed_by_u at
// 3524-3526, the sad feeling at 3563-3564, and the alignment and sound
// fallout at 3703-3722. The murder penalty above them and the peaceful
// alignment arm below them guard on is_human and mpeaceful instead, so they
// stop with the rest.
//
// Eight arms stop, each guarded by exactly C's condition and each placed above
// the first draw, message or object on its path:
//
//   3528-3541  mpickobj(), handing a thrown missile to the engulfer it killed.
//   3546-3547  monstone(), for a monster killed by petrification, and with it
//              the gs.stoned cleanup at 3569-3572.
//   3552-3561  the life-saved return and its "Maybe not..." message.
//   3577-3581  the mail daemon's scroll of mail. include/global.h:430 defines
//              MAIL_STRUCTURES unconditionally, so the arm is compiled.
//   3632-3640  spoteffects(), which expels the hero from a dead engulfer.
//   3648-3663  the murder punishment, which needs the intrinsic-telepathy
//              clear at 3658 and display.c see_monsters().
//   3666-3669  the guilt for killing a co-aligned unicorn.
//   3677-3702  the quest leader, nemesis, guardian and priest alignment arms,
//   3723-3724  together with the peaceful one below the tame arm. Every one
//              reaches attrib.c adjalign() with a negative argument.
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
        /* mon.c:3504. A hallucinating hero cannot read a pet's collar, so a
           named pet is named only while the hallucination is off; that is
           what decides both the article and the saddle suppression below. */
        const namedpet = has_mgivenname(mtmp) && !heroHallucinating(state);

        await message(
            `You ${nonliving(mtmp.data) ? 'destroy' : 'kill'} `
            + `${!(wasinside || canSpotMonster(mtmp, state)) ? 'it'
                : !mtmp.mtame ? monsterCommonName(mtmp, state)
                    : x_monnam(mtmp, namedpet ? ARTICLE_NONE : ARTICLE_THE,
                               'poor', namedpet ? SUPPRESS_SADDLE : 0,
                               false, state, env)}!`,
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
    if (mtmp.mtame && !mtmp.isminion) {
        /* EDOG(mtmp) is include/edog.h:22, `(mon)->mextra->edog`. Every tame
           non-minion carries one; dog.c newedog() creates it. dog.c
           wary_dog() (1291-1360) is the only reader, and it runs on revival
           or life-saving, so the flag outlives this kill without changing
           anything the hero can see today. */
        mtmp.mextra.edog.killed_by_u = true;
    }

    if (wasinside && state.gt?.thrownobj && state.gt.thrownobj !== state.uball
        /* "don't give to mon if missile is going to be destroyed" */
        && state.gt.thrownobj.oclass !== POTION_CLASS
        /* "don't give to mon if missile is going to return to hero" */
        && state.gt.thrownobj !== state.iflags?.returning_missile) {
        unsupported('a thrown missile handed to the engulfer it killed');
    }

    /* "dispose of monster and make cadaver" */
    const stoned = Boolean(state.gs?.stoned);
    state.gd ??= {};
    state.gd.disintegested = nocorpse;
    if (stoned) await monstone(mtmp, state, env);
    else await mondead(mtmp, state, env);
    state.gd.disintegested = false;

    if (mtmp.mhp >= 1) { /* !DEADMONSTER(): "monster lifesaved" */
        if (stoned) {
            state.gs.stoned = false;
            if (!cansee(x, y, state) && !state.gv?.vamp_rise_msg)
                await message('Maybe not...', state);
        } else {
            unsupported('a monster that survived being killed');
        }
        return;
    }

    if (be_sad) {
        await message(
            'You have a sad feeling for a moment, then it passes.',
            state,
        );
    }

    const mdat = mtmp.data; /* "note: mondead can change mtmp->data" */
    const mndx = monsndx(mdat);

    const skipCorpseAndDrops = stoned || nocorpse
        || LEVEL_SPECIFIC_NOCORPSE(mdat, state, random);
    if (stoned) state.gs.stoned = false;
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
    else if (mtmp.mtame) {
        adjalign(-15, state); /* "bad!!" */
        /* "your god is mighty displeased..." C's Soundeffect() is a no-op in
           this port, as js/sounds.js yelp() records, and its LL_KILLEDPET
           livelog_printf() at 3714-3719 writes a file this port does not
           write; js/mon.js:2140 and js/eat.js:2260-2261 record the same
           treatment. Neither draws, so only the You_hear() line survives. */
        const heard = youHear(
            heroHallucinating(state)
                ? 'the studio audience applaud!'
                : 'the rumble of distant thunder...',
            state,
        );
        if (heard) await message(heard, state);
    } else if (mtmp.mpeaceful) unsupported('killing a peaceful monster');

    /* "malign was already adjusted for u.ualign.type and randomization" */
    adjalign(mtmp.malign, state);
}

// C ref: mon.c mon_to_stone() (3748-3764). Only a golem can be changed by
// this helper; all other callers are an impossible polymorph request.
export async function mon_to_stone(mtmp, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    if (is_golem(mtmp.data)) {
        if (canseemon(mtmp, state)) {
            await message(
                messageAt(`${Monnam(mtmp, state)} solidifies...`,
                          mtmp.mx, mtmp.my, state),
                state,
                env,
            );
        }
        if (newcham(mtmp, state.mons[PM_STONE_GOLEM], { ...env, state })) {
            if (canseemon(mtmp, state)) {
                await message(
                    `Now it's ${an(pmname(mtmp.data, gender(mtmp)))}`,
                    state,
                    env,
                );
            }
        } else if (canseemon(mtmp, state)) {
            await message('... and returns to normal.', state, env);
        }
    } else {
        // C evaluates a_monnam() while constructing impossible()'s text. The
        // diagnostic itself is a discarded pline.c result, so record the gap.
        a_monnam(mtmp, { ...env, state });
        note_unported('pline.c impossible');
    }
}

// C ref: mon.c vamp_stone() (3766-3831). A shifted vampire or sandestin
// resumes its innate form rather than leaving a statue behind.
export async function vamp_stone(mtmp, state = game, env = {}) {
    if (is_vampshifter(mtmp)) {
        const mndx = mtmp.cham;
        const x = mtmp.mx;
        const y = mtmp.my;
        if (mndx >= LOW_PM && mndx !== monsndx(mtmp.data)
            && !(state.svm.mvitals[mndx].mvflags & G_GENOD)) {
            const message = env.message ?? ttyPline;
            const description = `The lapidifying ${x_monnam(
                mtmp,
                ARTICLE_NONE,
                null,
                SUPPRESS_SADDLE | SUPPRESS_HALLUCINATION
                    | SUPPRESS_INVISIBLE | SUPPRESS_IT,
                false,
                state,
                env,
            )} ${amorphous(mtmp.data) ? 'coalesces on the'
                : is_flyer(mtmp.data) ? 'drops to the' : 'writhes on the'} `
                + `${surface(x, y, state)}`;
            mtmp.mcanmove = true;
            mtmp.mfrozen = 0;
            set_mon_min_mhpmax(mtmp, 10);
            mtmp.mhp = mtmp.mhpmax;
            if (engulfing_u(mtmp, state))
                await expels(mtmp, { ...env, state, expulsionMessage: false });
            if (amorphous(mtmp.data) && closed_door(x, y, state)) {
                const newXY = enexto(x, y, state.mons[mndx], { state });
                if (newXY) rloc_to(mtmp, newXY.x, newXY.y, { ...env, state });
            }
            if (canSpotMonster(mtmp, state)) {
                await message(
                    messageAt(`${description}!`, x, y, state),
                    state,
                    env,
                );
                // C flushes the message window here. It has no game-state
                // return value and its window owner is not ported.
                note_unported('windows.c display_nhwindow');
            }
            newcham(mtmp, state.mons[mndx], { ...env, state });
            mtmp.cham = mtmp.data === state.mons[mndx] ? NON_PM : mndx;
            if (canSpotMonster(mtmp, state)) {
                await message(
                    messageAt(
                        `${Monnam(mtmp, state)} rises from the `
                            + `${surface(mtmp.mx, mtmp.my, state)} with renewed agility!`,
                        mtmp.mx,
                        mtmp.my,
                        state,
                    ),
                    state,
                    env,
                );
            }
            newsym(mtmp.mx, mtmp.my, state);
            return false;
        }
    } else if (ismnum(mtmp.cham)
               && (state.mons[mtmp.cham].mresists & MR_STONE)) {
        mtmp.mcanmove = true;
        mtmp.mfrozen = 0;
        set_mon_min_mhpmax(mtmp, 10);
        mtmp.mhp = mtmp.mhpmax;
        newcham(mtmp, state.mons[mtmp.cham], { ...env, state });
        newsym(mtmp.mx, mtmp.my, state);
        return false;
    }
    return true;
}

// C ref: mon.c m_into_limbo() (3834-3837). The limbo bit is set before the
// migration wrapper records the destination, exactly as in C.
export function m_into_limbo(mtmp, state = game, env = {}) {
    const targetLev = ledger_no(state.u.uz, state);
    mtmp.mstate = (mtmp.mstate ?? 0) | MON_LIMBO;
    migrate_mon(mtmp, targetLev, MIGR_APPROX_XY, state, env);
}

// C ref: mon.c migrate_mon() (3839-3863). Special-object dropping remains an
// explicit gap because steal.c mdrop_special_objs() is not ported; the C call
// returns void, so no invented object movement belongs here.
export function migrate_mon(
    mtmp,
    target_lev,
    xyloc,
    state = game,
    env = {},
) {
    if (mtmp.mx) {
        unstuck(mtmp, state, env);
        note_unported('steal.c mdrop_special_objs');
    }
    return migrate_to_level(
        mtmp,
        target_lev,
        xyloc,
        null,
        { ...env, state },
    );
}

// C ref: mon.c ok_to_obliterate() (3864-3874). These monsters must survive
// an elemental-plane overcrowding purge: the Wizard, Riders, quest/minion
// special records, and either monster attached to the hero.
export function ok_to_obliterate(mtmp, state = game) {
    if (mtmp.data?.pmidx === PM_WIZARD_OF_YENDOR
        || is_rider(mtmp.data)
        || has_emin(mtmp)
        || has_epri(mtmp)
        || has_eshk(mtmp)
        || mtmp === state.u?.ustuck
        || mtmp === state.u?.usteed) {
        return false;
    }
    return true;
}

// C ref: mon.c elemental_clog() (3877-3952). This is deliberately kept
// synchronous because mnexto() and the level-arrival callers are synchronous
// in the port. C's You_feel() is a pline.c boundary; callers may provide a
// synchronous message hook for tests, while ordinary gameplay records the
// unported call rather than starting an un-awaited tty promise.
let elementalClogMessageMove = 0;

export function elemental_clog(mon, state = game, env = {}) {
    if (!In_endgame(state.u?.uz)) return;

    let m1 = null;
    let m2 = null;
    let m3 = null;
    let m4 = null;
    let m5 = null;
    let mLevel = 0;
    const random = env.random ?? { rn2 };

    if (!elementalClogMessageMove
        || (state.moves - elementalClogMessageMove) > 200) {
        if (!elementalClogMessageMove || random.rn2(2)) {
            if (typeof env.message === 'function') {
                env.message('You feel besieged.', state, env);
            } else {
                note_unported('pline.c You_feel');
            }
        }
        elementalClogMessageMove = state.moves;
    }

    for (let mtmp = state.level?.monlist ?? null;
        mtmp;
        mtmp = mtmp.nmon) {
        if (mtmp.mhp < 1 || mtmp === mon) continue;
        if (mtmp.mx === 0 && mtmp.my === 0) continue;
        if (mon_has_amulet(mtmp) || !ok_to_obliterate(mtmp, state)) continue;

        if (mtmp.data?.mlet === S_ELEMENTAL) {
            if (!is_home_elemental(mtmp.data, state)) {
                if (!m1) m1 = mtmp;
            } else if (!m2) {
                m2 = mtmp;
            }
        } else if (!mtmp.mtame) {
            if (!mLevel || mtmp.m_lev < mLevel) {
                mLevel = mtmp.m_lev;
                m3 = mtmp;
            } else if (!m4) {
                m4 = mtmp;
            }
        } else {
            if (!m5) m5 = mtmp;
            break;
        }
    }

    const target = m1 ?? m2 ?? m3 ?? m4 ?? m5;
    if (target) {
        const mx = target.mx;
        const my = target.my;
        target.mstate = (target.mstate ?? 0) | MON_OBLITERATE;
        mongone(target, { ...env, state });
        // C intentionally relocates `mon`, not the monster just obliterated.
        rloc_to(mon, mx, my, { ...env, state });
    } else if (!Is_astralevel(state.u?.uz)) {
        const destination = {
            ...state.u.uz,
            dlevel: state.u.uz.dlevel - 1,
        };
        const targetLev = ledger_no(destination, state);
        mon.mstate = (mon.mstate ?? 0) | MON_ENDGAME_MIGR;
        migrate_mon(mon, targetLev, MIGR_RANDOM, state, env);
    }
}

// C ref: mon.c deal_with_overcrowding() (3986-3993). The two debugpline1()
// calls are empty under this build's lint.h configuration; the state-changing
// branches are the complete function body here.
export function deal_with_overcrowding(mtmp, state = game, env = {}) {
    if (In_endgame(state.u?.uz))
        elemental_clog(mtmp, state, env);
    else
        m_into_limbo(mtmp, state, env);
}

// C ref: mon.c maybe_mnexto() (3997-4016). Unlike mnexto(), this helper
// accepts only a square that is currently visible and preserves the grid bug's
// no-diagonal restriction. The twenty attempts intentionally remain bounded.
export function maybe_mnexto(mtmp, state = game, env = {}) {
    const ptr = mtmp.data;
    const diagok = !NODIAG(monsndx(ptr));
    let tryct = 20;

    do {
        const coordinate = enexto(
            state.u?.ux,
            state.u?.uy,
            ptr,
            { ...env, state },
        );
        if (!coordinate) return;
        if (couldsee(coordinate.x, coordinate.y, state)
            && (diagok
                || coordinate.x === mtmp.mx
                || coordinate.y === mtmp.my)) {
            rloc_to(mtmp, coordinate.x, coordinate.y, { ...env, state });
            return;
        }
    } while (--tryct > 0);
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

// C ref: mon.c mon_animal_list() (4829-4854). The C helper owns a cached
// array of polymorphable animal species in ga; JavaScript uses an array in the
// owning game's state and lets garbage collection replace free().
export function mon_animal_list(construct, state = game) {
    state.ga ??= {};

    if (construct) {
        const animalList = [];
        for (let mndx = LOW_PM; mndx < SPECIAL_PM; ++mndx) {
            if (is_animal(state.mons[mndx])) animalList.push(mndx);
        }
        state.ga.animal_list = animalList;
        state.ga.animal_list_count = animalList.length;
    } else {
        // decl.c initializes this UNDEFINED_PTR field to NULL before the
        // first release, so keep an explicit null-equivalent in JS too.
        state.ga.animal_list = null;
        state.ga.animal_list_count = 0;
    }
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

// C ref: mon.c egg_type_from_parent() (5569-5586). A queen bee or winged
// gargoyle normally produces its ordinary offspring, except for the one-in-77
// breeder-egg result. Forced ordinary eggs skip that draw, as C's short-circuit
// expression does.
export function egg_type_from_parent(mnum, force_ordinary = false, rawEnv = {}) {
    const random = rawEnv.random ?? { rn2 };
    if (force_ordinary || random.rn2(77) !== 0) {
        if (mnum === PM_QUEEN_BEE) return PM_KILLER_BEE;
        if (mnum === PM_WINGED_GARGOYLE) return PM_GARGOYLE;
    }
    return mnum;
}

// C ref: mon.c kill_eggs() (5609-5638). The TIN/CORPSE arms are under #if 0,
// but the recursive container arm is active. kill_egg() belongs to timeout.c
// and has no port yet, so the call is recorded exactly as required for a
// discarded return value and does not invent timer state.
export function kill_eggs(obj_list, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    for (let obj = obj_list; obj; obj = obj.nobj) {
        if (obj.otyp === EGG && dead_species(obj.corpsenm, true, { state }))
            note_unported('timeout.c kill_egg');
        else if (obj.cobj)
            kill_eggs(obj.cobj, { ...rawEnv, state });
    }
}

// C ref: mon.c golemeffects() (5680-5708). Elemental damage can heal or slow
// a flesh or iron golem. The speed mutation is owned by the still-unported
// worn.c mon_adjust_speed(); the source call's return value is discarded.
export async function golemeffects(mon, damtype, dam, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    let heal = 0;
    let slow = false;
    const mnum = mon?.data?.pmidx;

    if (mnum === PM_FLESH_GOLEM) {
        if (damtype === AD_ELEC) heal = Math.trunc((dam + 5) / 6);
        else if (damtype === AD_FIRE || damtype === AD_COLD) slow = true;
    } else if (mnum === PM_IRON_GOLEM) {
        if (damtype === AD_ELEC) slow = true;
        else if (damtype === AD_FIRE) heal = dam;
    } else {
        return;
    }

    if (slow && mon.mspeed !== MSLOW)
        note_unported('worn.c mon_adjust_speed');
    if (heal && healmon(mon, heal, 0)) {
        if (cansee(mon.mx, mon.my, state)) {
            await monsterMessage(
                `${Monnam(mon, state)} seems healthier.`,
                mon,
                state,
                rawEnv,
            );
        }
    }
}

// C ref: mon.c angry_guards() (5711-5767). This deliberately walks the live
// level list directly: fmon contains every current-level guard, and the C loop
// clears sleep/freeze before changing peacefulness.
export async function angry_guards(silent = false, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const message = rawEnv.message
        ?? (rawEnv.planning ? async () => {} : ttyPline);
    let count = 0;
    let nearby = 0;
    let distant = 0;
    let sleeping = 0;

    for (let mon = state.level?.monlist ?? null; mon; mon = mon.nmon) {
        if (mon.mhp < 1 || !is_watch(mon.data) || !mon.mpeaceful)
            continue;
        ++count;
        if (canSpotMonster(mon, state) && mon.mcanmove) {
            if (m_next2u(mon, state)) ++nearby;
            else ++distant;
        }
        if (mon.msleeping || mon.mfrozen) {
            ++sleeping;
            mon.msleeping = 0;
            mon.mfrozen = 0;
        }
        mon.mpeaceful = false;
    }

    if (!count) return false;
    if (!silent) {
        if (sleeping) {
            const buf = `guard${plur(sleeping)}`;
            await message(
                `${The(buf, state)} ${vtense(buf, 'wake')} up.`,
                state,
                rawEnv,
            );
        }
        if (nearby) {
            const buf = `guard${plur(nearby)}`;
            await message(
                `${The(buf, state)} ${vtense(buf, 'get')} angry!`,
                state,
                rawEnv,
            );
        } else if (distant) {
            const buf = `guard${plur(distant)}`;
            await message(
                `${distant === 1 ? 'An angry' : 'Angry'} ${buf} `
                    + `${vtense(buf, 'are')} approaching!`,
                state,
                rawEnv,
            );
        } else {
            const possessive = count === 1 ? "a guard's" : "guards'";
            const heard = youHear(
                `the shrill sound of ${possessive} whistle${plur(count)}`,
                state,
            );
            if (heard) await message(heard, state, rawEnv);
        }
    }
    return true;
}

// C ref: mon.c pacify_guard() and pacify_guards() (5769-5774).
export function pacify_guard(mon) {
    if (is_watch(mon.data)) mon.mpeaceful = true;
}

export function pacify_guards(state = game) {
    iter_mons(pacify_guard, state);
}

const cObjColors = Object.freeze([
    'black', 'red', 'green', 'brown', 'blue', 'magenta', 'cyan', 'gray',
    'transparent', 'orange', 'bright green', 'yellow', 'bright blue',
    'bright magenta', 'bright cyan', 'white',
]);

// C ref: mon.c mimic_hit_msg() (5776-5794). Healing spellbooks reveal a
// mimic's object disguise by describing the object type and its catalog color.
export async function mimic_hit_msg(mon, otyp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    switch (M_AP_TYPE(mon)) {
    case M_AP_NOTHING:
    case M_AP_FURNITURE:
    case M_AP_MONSTER:
        return;
    case M_AP_OBJECT: {
        if (otyp !== SPE_HEALING && otyp !== SPE_EXTRA_HEALING) return;
        const appearance = mon.mappearance;
        const color = cObjColors[state.objects?.[appearance]?.oc_color ?? 0];
        await monsterMessage(
            `${The(simple_typename(appearance, state), state)} seems a more `
                + `vivid ${color} than before.`,
            mon,
            state,
            rawEnv,
        );
        return;
    }
    default:
        return;
    }
}

// C ref: mon.c usmellmon() (5796-5914). This reports only species or class
// smells that C recognizes; an ordinary unrecognized species returns FALSE.
export async function usmellmon(mdat, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (!mdat || !olfaction(state.youmonst?.data)) return false;

    const message = rawEnv.message
        ?? (rawEnv.planning ? async () => {} : ttyPline);
    const mndx = monsndx(mdat);
    let nonspecific = false;
    let given = false;
    const you = (text) => message(`You ${text}`, state, rawEnv);
    const line = (text) => message(text, state, rawEnv);

    switch (mndx) {
    case PM_ROTHE:
    case PM_MINOTAUR:
        await you('notice a bovine smell.');
        given = true;
        break;
    case PM_CAVE_DWELLER:
    case PM_BARBARIAN:
    case PM_NEANDERTHAL:
        await you('smell body odor.');
        given = true;
        break;
    case PM_HORNED_DEVIL:
    case PM_BALROG:
    case PM_ASMODEUS:
    case PM_DISPATER:
    case PM_YEENOGHU:
    case PM_ORCUS:
        break;
    case PM_HUMAN_WEREJACKAL:
    case PM_HUMAN_WERERAT:
    case PM_HUMAN_WEREWOLF:
    case PM_WEREJACKAL:
    case PM_WERERAT:
    case PM_WEREWOLF:
    case PM_OWLBEAR:
        await you("detect an odor reminiscent of an animal's den.");
        given = true;
        break;
    case PM_STEAM_VORTEX:
        await you('smell steam.');
        given = true;
        break;
    case PM_GREEN_SLIME:
        await line('Something stinks.');
        given = true;
        break;
    case PM_VIOLET_FUNGUS:
    case PM_SHRIEKER:
        await you('smell mushrooms.');
        given = true;
        break;
    case PM_WHITE_UNICORN:
    case PM_GRAY_UNICORN:
    case PM_BLACK_UNICORN:
    case PM_JELLYFISH:
        break;
    default:
        nonspecific = true;
        break;
    }

    if (nonspecific) {
        switch (mdat.mlet) {
        case S_DOG:
            await you('notice a dog smell.');
            given = true;
            break;
        case S_DRAGON:
            await you('smell a dragon!');
            given = true;
            break;
        case S_FUNGUS:
            await line('Something smells moldy.');
            given = true;
            break;
        case S_UNICORN:
            await you(
                `${mndx === PM_PONY ? 'detect an' : 'detect a strong'} `
                    + 'odor reminiscent of a stable.',
            );
            given = true;
            break;
        case S_ZOMBIE:
            await you('smell rotting flesh.');
            given = true;
            break;
        case S_EEL:
            await you('smell fish.');
            given = true;
            break;
        case S_ORC: {
            const ownOrc = Upolyd(state.u)
                ? is_orc(state.youmonst?.data)
                : state.urace?.mnum === PM_ORC;
            if (ownOrc) await you('notice an attractive smell.');
            else await line(
                'A foul stench makes you feel a little nauseated.',
            );
            given = true;
            break;
        }
        default:
            break;
        }
    }
    return given;
}

// C ref: mon.c shieldeff_mon() (6058-6065). A monster's magic resistance
// always invokes the shield animation first; the visible message is the only
// non-display effect owned by this file. display.c shieldeff() remains a gap,
// so record that call without manufacturing its glyph frames or delays.
export async function shieldeff_mon(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    note_unported('display.c shieldeff');
    if (!cansee(mtmp.mx, mtmp.my, state)) return;

    const message = rawEnv.message
        ?? (rawEnv.planning ? async () => {} : ttyPline);
    await message(
        messageAt(
            `${Monnam(mtmp, state, rawEnv)} resists!`,
            mtmp.mx,
            mtmp.my,
            state,
        ),
        state,
        rawEnv,
    );
}

// C ref: mon.c flash_mon() (6067-6089). The temporary vision bits make the
// monster's square drawable while flash_glyph_at() alternates its glyph; the
// bits are restored before newsym() redraws the remembered square. The
// display.c flash_glyph_at() animation is not ported, but its mon_to_glyph()
// argument is still evaluated because it can consume display-RNG draws under
// hallucination.
export function flash_mon(mtmp, state = game) {
    const mx = mtmp.mx;
    const my = mtmp.my;
    let count = couldsee(mx, my, state) ? 8 : 4;
    const saveviz = state.viz_array[my][mx];

    if (!state.flags?.sparkle) count = Math.trunc(count / 2);
    state.viz_array[my][mx] |= IN_SIGHT | COULD_SEE;
    map_monster_glyph_info(mtmp, state); // mon_to_glyph(mtmp, newsym_rn2)
    void count; // flash_glyph_at() is the recorded display.c gap.
    note_unported('display.c flash_glyph_at');
    state.viz_array[my][mx] = saveviz;
    newsym(mx, my);
}
